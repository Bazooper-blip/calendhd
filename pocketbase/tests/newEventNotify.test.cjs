// Standalone Node test for the new-event notification hook
// (025_new_event_notification.pb.js). Same approach as trmnlFeed.test.cjs:
// load the hook source with mocked PB globals and drive the captured handler.
// pb_helpers is stubbed so sendPushToAllDevices calls are recorded instead of
// hitting the push-service.
//
//   Run:  node pocketbase/tests/newEventNotify.test.cjs

const fs = require('fs');
const path = require('path');

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

function fakeRecord(id, fields) {
	return {
		id,
		get(k) {
			return fields[k] === undefined ? null : fields[k];
		},
		getString(k) {
			const v = fields[k];
			if (v === undefined || v === null) return '';
			return String(v);
		},
		getBool(k) {
			return !!fields[k];
		}
	};
}

// --- mocks ---
let settingsRows = [];
let pushCalls = [];

const $app = {
	findRecordsByFilter(collection, filter, sort, limit, offset, params) {
		if (collection === 'user_settings') return settingsRows;
		return [];
	}
};
const helpersStub = {
	sendPushToAllDevices(userId, title, body, tag) {
		pushCalls.push({ userId, title, body, tag });
		return { sent: 1, failed: 0 };
	}
};

let handler = null;
function onRecordAfterCreateSuccess(fn, collection) {
	if (collection === 'events') handler = fn;
}
const hookSrc = fs.readFileSync(
	path.join(__dirname, '..', 'pb_hooks', '025_new_event_notification.pb.js'),
	'utf8'
);
new Function('onRecordAfterCreateSuccess', '$app', 'require', '__hooks', hookSrc)(
	onRecordAfterCreateSuccess,
	$app,
	() => helpersStub,
	'/hooks'
);
check('handler registered', typeof handler === 'function');

function fire(eventFields) {
	pushCalls = [];
	handler({ record: fakeRecord('ev1', eventFields) });
	return pushCalls;
}

const baseEvent = {
	title: 'Vet visit',
	user: 'user1',
	start_time: '2026-08-11 08:30:00.000Z',
	is_all_day: false
};

// 1. Opt-in gating
settingsRows = [];
check('no settings row -> silent', fire(baseEvent).length === 0);

settingsRows = [fakeRecord('s1', { notify_new_events: false })];
check('toggle off -> silent', fire(baseEvent).length === 0);

settingsRows = [fakeRecord('s1', { notify_new_events: true, time_format: '24h', locale: 'en' })];
let calls = fire(baseEvent);
check('toggle on -> one push', calls.length === 1);
check('push title (en)', calls.length && calls[0].title === 'New event added', calls[0] && calls[0].title);
check(
	'push body has title + date + time',
	calls.length && calls[0].body.indexOf('Vet visit · ') === 0 && / at \d/.test(calls[0].body),
	calls[0] && calls[0].body
);
check('push tag from event id', calls.length && calls[0].tag === 'new-event-ev1');
check('push user', calls.length && calls[0].userId === 'user1');

// 2. Skips
calls = fire(Object.assign({}, baseEvent, { routine_template: 'rt1' }));
check('routine-generated -> silent', calls.length === 0);

calls = fire(Object.assign({}, baseEvent, { is_paused: true }));
check('paused -> silent', calls.length === 0);

calls = fire(Object.assign({}, baseEvent, { user: '' }));
check('no user -> silent', calls.length === 0);

// 3. All-day + missing start
calls = fire(Object.assign({}, baseEvent, { is_all_day: true }));
check(
	'all-day body says All day, no time',
	calls.length && calls[0].body.indexOf('All day') > 0 && !/ at \d/.test(calls[0].body),
	calls[0] && calls[0].body
);

calls = fire(Object.assign({}, baseEvent, { start_time: '' }));
check('missing start -> title-only body', calls.length && calls[0].body === 'Vet visit', calls[0] && calls[0].body);

// 4. Swedish locale + 12h format
settingsRows = [fakeRecord('s1', { notify_new_events: true, time_format: '12h', locale: 'sv' })];
calls = fire(baseEvent);
check('sv title', calls.length && calls[0].title === 'Ny händelse tillagd', calls[0] && calls[0].title);
check(
	'sv body uses kl. + 12h clock',
	calls.length && calls[0].body.indexOf(' kl. ') > 0 && /(AM|PM)$/.test(calls[0].body),
	calls[0] && calls[0].body
);

console.log(`\n${passed} passed, ${failures} failed`);
process.exit(failures ? 1 : 0);
