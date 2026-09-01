// Standalone Node test for the TRMNL feed hook (070_trmnl_feed.pb.js).
// Hooks run in PocketBase's goja runtime and aren't part of the Vitest suite,
// so we load the hook source with mocked PB globals (routerAdd, $app, $os)
// and drive the captured handler directly.
//
//   Run:  node pocketbase/tests/trmnlFeed.test.cjs
//
// The hook derives "now" internally, so event fixtures are built relative to
// the real clock (clamped inside today) — assertions are TZ-independent.

const fs = require('fs');
const path = require('path');

// --- tiny assert harness ---
let failures = 0;
let passed = 0;
function check(name, cond, detail) {
	if (cond) {
		passed++;
	} else {
		failures++;
		console.error('FAIL: ' + name + (detail ? '  -> ' + detail : ''));
	}
}

// --- fake PB record ---
function fakeRecord(id, fields) {
	return {
		id,
		getString(k) {
			const v = fields[k];
			if (v === undefined || v === null) return '';
			return String(v);
		},
		getBool(k) {
			return !!fields[k];
		},
		// json fields go through record.get() + helpers.parseJsonField (which
		// accepts strings, matching one of the forms PB JSVM can return)
		get(k) {
			return fields[k];
		}
	};
}

function pbDateString(d) {
	return d.toISOString().replace('T', ' ');
}

// --- mock environment ---
let envVars = {};
let collections = {}; // name -> rows
let filterCalls = [];

const $os = { getenv: (k) => envVars[k] || '' };
const $app = {
	findAuthRecordByEmail(collection, email) {
		if (email !== 'home@calendhd.local') throw new Error('not found');
		return fakeRecord('user1', {});
	},
	findRecordsByFilter(collection, filter, sort, limit, offset, params) {
		filterCalls.push({ collection, filter, sort, limit, params });
		return collections[collection] || [];
	}
};

// --- load the hook with mocked globals ---
// pb_helpers.js can't go through Node's require (repo package.json is
// "type": "module"), so mimic PB's require with a CJS-wrapper loader.
function pbRequire(p) {
	const src = fs.readFileSync(p, 'utf8');
	const mod = { exports: {} };
	new Function('module', 'exports', 'require', src)(mod, mod.exports, require);
	return mod.exports;
}
let handler = null;
function routerAdd(method, route, fn) {
	if (route === '/api/calendhd/trmnl') handler = fn;
}
const hookSrc = fs.readFileSync(path.join(__dirname, '..', 'pb_hooks', '070_trmnl_feed.pb.js'), 'utf8');
new Function('routerAdd', '$app', '$os', 'require', '__hooks', hookSrc)(
	routerAdd,
	$app,
	$os,
	pbRequire,
	path.join(__dirname, '..', 'pb_hooks')
);
check('handler registered', typeof handler === 'function');

// --- fake request event ---
function makeEvent({ query = {}, headers = {} } = {}) {
	const result = { status: null, body: null };
	return {
		result,
		request: {
			header: { get: (k) => headers[k] || '' },
			url: { query: () => ({ get: (k) => query[k] || '' }) }
		},
		json(status, body) {
			result.status = status;
			result.body = body;
			return result;
		}
	};
}

function call(opts) {
	const e = makeEvent(opts);
	handler(e);
	return e.result;
}

// =====================================================================
// 1. Token auth
// =====================================================================
{
	envVars = { TRMNL_FEED_TOKEN: 'sekret' };
	collections = {};

	check('auth: missing token -> 401', call().status === 401);
	check('auth: wrong token -> 401', call({ query: { token: 'nope' } }).status === 401);
	check('auth: query token -> 200', call({ query: { token: 'sekret' } }).status === 200);
	check(
		'auth: bearer header -> 200',
		call({ headers: { Authorization: 'Bearer sekret' } }).status === 200
	);

	envVars = {};
	check('auth: open when env unset -> 200', call().status === 200);
}

// =====================================================================
// 2. Empty database -> well-formed skeleton
// =====================================================================
{
	envVars = {};
	collections = {};
	const res = call();
	const b = res.body;
	check('empty: 200', res.status === 200);
	check('empty: default 5 days', b.days.length === 5, 'got ' + b.days.length);
	check('empty: first day is today', b.days[0].is_today === true && b.days[0].label === 'Today');
	check('empty: second day is tomorrow', b.days[1].label === 'Tomorrow');
	check('empty: no current/next', b.current_event === null && b.next_event === null);
	check('empty: 24h default', b.time_format === '24h');
	check('empty: task counters zero', b.tasks_total_today === 0 && b.tasks_done_today === 0);
	check(
		'empty: english strings',
		b.strings && b.strings.now === 'NOW' && b.strings.all_day === 'All day' && b.strings.next === 'NEXT',
		JSON.stringify(b.strings)
	);
	check(
		'empty: day_progress in range',
		typeof b.day_progress === 'number' && b.day_progress >= 0 && b.day_progress <= 100
	);

	const clamped = call({ query: { days: '99' } });
	check('empty: days param clamped to 14', clamped.body.days.length === 14);
	const one = call({ query: { days: '1' } });
	check('empty: days=1 respected', one.body.days.length === 1);
}

// =====================================================================
// 3. Events: bucketing, formatting, colors, counters, current/next
// =====================================================================
{
	envVars = {};
	const now = new Date();
	const today0 = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 30);

	// "current" event: started <=30min ago (clamped inside today), ends +50min
	const curStart = new Date(Math.max(now.getTime() - 30 * 60000, today0.getTime()));
	const curEnd = new Date(now.getTime() + 50 * 60000);
	// already-started event with no end (never "current", never "next") — shares
	// curStart so it's in the past even when the test runs right after midnight
	const morning = curStart;
	// tomorrow event 09:00
	const tmrw = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 9, 0, 0);
	const tmrwEnd = new Date(tmrw.getTime() + 45 * 60000);

	collections = {
		user_settings: [fakeRecord('s1', { time_format: '24h', locale: 'en' })],
		categories: [fakeRecord('cat1', { name: 'Health', color: '#AABBCC' })],
		calendar_subscriptions: [fakeRecord('sub1', { name: 'Family', color_override: '#112233' })],
		routine_templates: [fakeRecord('rt1', { name: 'Morning routine' })],
		events: [
			fakeRecord('ev1', {
				title: 'Current thing',
				start_time: pbDateString(curStart),
				end_time: pbDateString(curEnd),
				is_all_day: false,
				is_task: true,
				completed_at: '',
				category: 'cat1',
				icon: '🦷',
				energy_level: 'low',
				first_step: 'put on shoes'
			}),
			fakeRecord('ev2', {
				title: 'Done task',
				start_time: pbDateString(morning),
				is_all_day: false,
				is_task: true,
				completed_at: pbDateString(morning),
				color_override: '#FF0000'
			}),
			fakeRecord('ev3', {
				title: 'All day',
				start_time: pbDateString(new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12, 0, 0)),
				is_all_day: true
			}),
			fakeRecord('ev4', {
				title: 'Routine step',
				start_time: pbDateString(tmrw),
				end_time: pbDateString(tmrwEnd),
				is_all_day: false,
				routine_template: 'rt1'
			})
		],
		external_events: [
			fakeRecord('ex1', {
				title: 'External dinner',
				start_time: pbDateString(tmrw),
				end_time: pbDateString(tmrwEnd),
				is_all_day: false,
				subscription: 'sub1',
				location: 'Grandma'
			})
		]
	};

	filterCalls = [];
	const res = call({ query: { days: '3' } });
	const b = res.body;
	check('events: 200', res.status === 200);

	// window filter params use PB's space-separated datetime format
	const evCall = filterCalls.find((c) => c.collection === 'events');
	check('events: filter queried', !!evCall);
	check(
		'events: pbDateFilter format (space, not T)',
		evCall && evCall.params.start.indexOf(' ') > 0 && evCall.params.start.indexOf('T') === -1,
		evCall && evCall.params.start
	);

	const today = b.days[0];
	const tomorrow = b.days[1];
	check('events: today has 2 timed events', today.events.length === 2, JSON.stringify(today.events.map((e2) => e2.title)));
	check('events: today has 1 all-day event', today.all_day.length === 1);
	check('events: event_count counts both', today.event_count === 3);
	check('events: tomorrow has 2 events', tomorrow.events.length === 2);

	const cur = today.events.find((e2) => e2.title === 'Current thing');
	check('events: category name resolved', cur && cur.category === 'Health');
	check('events: category color fallback', cur && cur.color === '#AABBCC');
	check('events: icon passthrough', cur && cur.icon === '🦷');
	check('events: first_step passthrough', cur && cur.first_step === 'put on shoes');
	check(
		'events: time_range has en dash',
		cur && cur.time_range.indexOf(' – ') > 0,
		cur && cur.time_range
	);

	const done = today.events.find((e2) => e2.title === 'Done task');
	check('events: color_override wins', done && done.color === '#FF0000');
	check('events: done flag from completed_at', done && done.done === true);

	check('events: task counters', b.tasks_total_today === 2 && b.tasks_done_today === 1,
		b.tasks_total_today + '/' + b.tasks_done_today);

	const ext = tomorrow.events.find((e2) => e2.title === 'External dinner');
	check('events: external flagged', ext && ext.is_external === true);
	check('events: subscription name as source', ext && ext.source === 'Family');
	check('events: subscription color', ext && ext.color === '#112233');
	check('events: location passthrough', ext && ext.location === 'Grandma');

	const routineStep = tomorrow.events.find((e2) => e2.title === 'Routine step');
	check('events: routine name resolved', routineStep && routineStep.routine === 'Morning routine');

	check('events: current_event found', b.current_event && b.current_event.title === 'Current thing');
	// Relative-time fields were removed with the template countdowns (stale
	// between 15-min polls); make sure they don't creep back in.
	check(
		'events: no relative-time fields',
		b.current_event && !('minutes_left' in b.current_event) && !('left_label' in b.current_event) &&
			b.next_event && !('minutes_until' in b.next_event) && !('in_label' in b.next_event)
	);
	// Next timed event after "now" is tomorrow 09:00 (today's remaining events all started already)
	check('events: next_event is tomorrow 09:00', b.next_event && b.next_event.title === 'Routine step');
	check('events: next_event day label', b.next_event && b.next_event.day_label === 'Tomorrow');
	check('events: no leaked internals', !('_start' in (b.current_event || {})));
}

// =====================================================================
// 4. 12h format + Swedish locale
// =====================================================================
{
	envVars = {};
	const now = new Date();
	const afternoon = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 14, 5, 0);
	collections = {
		user_settings: [fakeRecord('s1', { time_format: '12h', locale: 'sv' })],
		events: [
			fakeRecord('ev1', {
				title: 'Fika',
				start_time: pbDateString(afternoon),
				is_all_day: false
			})
		]
	};
	const b = call().body;
	check('sv: locale detected', b.locale === 'sv');
	check('sv: today label', b.days[0].label === 'Idag');
	check('sv: tomorrow label', b.days[1].label === 'Imorgon');
	check(
		'sv: swedish strings',
		b.strings && b.strings.now === 'NU' && b.strings.all_day === 'Heldag' && b.strings.next === 'NÄSTA',
		JSON.stringify(b.strings)
	);
	const fika = b.days[0].events[0];
	check('12h: PM time', fika && fika.time === '2:05 PM', fika && fika.time);
}

// =====================================================================
// 4b. Recurring local events expand into the window
// =====================================================================
{
	envVars = {};
	const now = new Date();
	// Weekly event seeded 7 days ago at 10:00 — must appear once, today.
	const weeklySeed = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 7, 10, 0, 0);
	// Daily event seeded 3 days ago 09:30–10:00, completed on its seed day —
	// must appear today AND tomorrow, not done, with a shifted time range.
	const dailySeed = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 3, 9, 30, 0);
	const dailySeedEnd = new Date(dailySeed.getTime() + 30 * 60000);

	collections = {
		user_settings: [fakeRecord('s1', { time_format: '24h', locale: 'en' })],
		events: [
			fakeRecord('rec1', {
				title: 'Idrott',
				start_time: pbDateString(weeklySeed),
				is_all_day: false,
				recurrence_rule: '{"frequency":"weekly"}'
			}),
			fakeRecord('rec2', {
				title: 'Göra läxa',
				start_time: pbDateString(dailySeed),
				end_time: pbDateString(dailySeedEnd),
				is_all_day: false,
				is_task: true,
				completed_at: pbDateString(dailySeed),
				recurrence_rule: '{"frequency":"daily"}'
			})
		]
	};

	filterCalls = [];
	const res = call({ query: { days: '3' } });
	const b = res.body;
	check('recurring: 200', res.status === 200);

	// The events query must not exclude recurring seeds that started before
	// the window (the mock returns rows regardless — assert on the filter).
	const evCall = filterCalls.find((c) => c.collection === 'events');
	check(
		'recurring: filter fetches recurring seeds outside window',
		evCall && evCall.filter.indexOf('recurrence_rule') >= 0,
		evCall && evCall.filter
	);

	const today = b.days[0];
	const tomorrow = b.days[1];
	const idrottToday = today.events.filter((e2) => e2.title === 'Idrott');
	check('recurring: weekly occurs today', idrottToday.length === 1, JSON.stringify(today.events.map((e2) => e2.title)));
	check('recurring: weekly keeps wall-clock time', idrottToday[0] && idrottToday[0].time === '10:00', idrottToday[0] && idrottToday[0].time);
	check('recurring: weekly absent tomorrow', !tomorrow.events.some((e2) => e2.title === 'Idrott'));

	const laxaToday = today.events.filter((e2) => e2.title === 'Göra läxa');
	const laxaTomorrow = tomorrow.events.filter((e2) => e2.title === 'Göra läxa');
	check('recurring: daily occurs today', laxaToday.length === 1, JSON.stringify(today.events.map((e2) => e2.title)));
	check('recurring: daily occurs tomorrow', laxaTomorrow.length === 1);
	check('recurring: occurrence end shifted', laxaToday[0] && laxaToday[0].time_range === '09:30 – 10:00', laxaToday[0] && laxaToday[0].time_range);
	check('recurring: done is per-day', laxaToday[0] && laxaToday[0].done === false);
}

// =====================================================================
// 5. Per-day event cap (?limit=)
// =====================================================================
{
	envVars = {};
	const now = new Date();
	const today0 = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);

	// 60 timed events, all safely inside today (00:00–00:59)
	const manyEvents = [];
	for (let i = 0; i < 60; i++) {
		manyEvents.push(
			fakeRecord('bulk' + i, {
				title: 'Event ' + i,
				start_time: pbDateString(new Date(today0.getTime() + i * 60000)),
				is_all_day: false,
				is_task: i < 3,
				completed_at: i === 0 ? pbDateString(today0) : ''
			})
		);
	}
	collections = { events: manyEvents, external_events: [] };

	const def = call().body.days[0];
	check('limit: default 10', def.events.length === 10, 'got ' + def.events.length);
	check('limit: default more_count', def.more_count === 50, 'got ' + def.more_count);

	const t = call({ query: { limit: '2' } }).body;
	const day2 = t.days[0];
	check('limit: limit=2 respected', day2.events.length === 2, 'got ' + day2.events.length);
	check('limit: limit=2 more_count', day2.more_count === 58, 'got ' + day2.more_count);
	check('limit: event_count unaffected', day2.event_count === 60);
	check(
		'limit: task counters unaffected by cap',
		t.tasks_total_today === 3 && t.tasks_done_today === 1,
		t.tasks_total_today + '/' + t.tasks_done_today
	);

	const clamped = call({ query: { limit: '999' } }).body.days[0];
	check('limit: clamped to 50', clamped.events.length === 50, 'got ' + clamped.events.length);
	check('limit: clamped more_count', clamped.more_count === 10, 'got ' + clamped.more_count);

	const bad = call({ query: { limit: 'abc' } }).body.days[0];
	check('limit: invalid falls back to default', bad.events.length === 10, 'got ' + bad.events.length);
}

// =====================================================================
// 6. Icon handling: emoji pass through, lucide:* maps to emoji, ?icons=none
// =====================================================================
{
	envVars = {};
	const now = new Date();
	const today0 = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
	collections = {
		events: [
			fakeRecord('ic1', {
				title: 'Emoji icon',
				start_time: pbDateString(today0),
				is_all_day: false,
				icon: '🦷'
			}),
			fakeRecord('ic2', {
				title: 'Lucide icon',
				start_time: pbDateString(new Date(today0.getTime() + 60000)),
				is_all_day: false,
				icon: 'lucide:pill'
			}),
			fakeRecord('ic3', {
				title: 'Unknown lucide',
				start_time: pbDateString(new Date(today0.getTime() + 120000)),
				is_all_day: false,
				icon: 'lucide:some-future-icon'
			})
		],
		external_events: []
	};

	const day = call().body.days[0];
	const byTitle = (title) => day.events.find((e2) => e2.title === title);
	check('icons: emoji passes through', byTitle('Emoji icon').icon === '🦷');
	check(
		'icons: lucide:pill maps to 💊',
		byTitle('Lucide icon').icon === '💊',
		JSON.stringify(byTitle('Lucide icon').icon)
	);
	check(
		'icons: unmapped lucide name dropped (never literal lucide:*)',
		byTitle('Unknown lucide').icon === '',
		JSON.stringify(byTitle('Unknown lucide').icon)
	);

	const stripped = call({ query: { icons: 'none' } }).body.days[0];
	check(
		'icons: icons=none strips everything',
		stripped.events.every((e2) => e2.icon === ''),
		JSON.stringify(stripped.events.map((e2) => e2.icon))
	);
}


// =====================================================================
// 7. Week number: helper math + feed fields
// =====================================================================
{
	const helpers = pbRequire(path.join(__dirname, '..', 'pb_hooks', 'pb_helpers.js'));

	// Fixed-date helper checks (mirror getWeekNumber tests in src/lib/utils/date.test.ts)
	check('week: ISO Sep 1 2026 -> 36', helpers.weekNumber(new Date(2026, 8, 1), 1) === 36);
	check('week: ISO Dec 29 2025 -> 1', helpers.weekNumber(new Date(2025, 11, 29), 1) === 1);
	check('week: Sunday start Jan 1 2026 -> 1', helpers.weekNumber(new Date(2026, 0, 1), 0) === 1);
	check('week: Sunday start Jan 4 2026 -> 2', helpers.weekNumber(new Date(2026, 0, 4), 0) === 2);
	check('week: Saturday start Jan 2 2026 -> 1', helpers.weekNumber(new Date(2026, 0, 2), 6) === 1);

	// Feed: no settings row -> ISO week of today (app default is Monday start)
	envVars = {};
	collections = {};
	const b = call().body;
	check(
		'week: feed defaults to ISO week of today',
		b.week_number === helpers.weekNumber(new Date(), 1),
		'got ' + b.week_number
	);
	check('week: english label', b.week_label === 'W' + b.week_number, JSON.stringify(b.week_label));

	// Feed: Swedish locale + Sunday week start
	collections = {
		user_settings: [fakeRecord('s1', { locale: 'sv', week_starts_on: 0 })]
	};
	const bs = call().body;
	check(
		'week: honors week_starts_on',
		bs.week_number === helpers.weekNumber(new Date(), 0),
		'got ' + bs.week_number
	);
	check('week: swedish label', bs.week_label === 'v.' + bs.week_number, JSON.stringify(bs.week_label));
}

// --- summary ---
console.log(`\n${passed} passed, ${failures} failed`);
process.exit(failures ? 1 : 0);
