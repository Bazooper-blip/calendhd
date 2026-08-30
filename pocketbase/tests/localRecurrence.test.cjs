// Standalone Node test for the local-event recurrence helpers in pb_helpers.js
// (expandLocalRecurrence / firstLocalOccurrenceOnOrAfter / nextReminderTime).
// These mirror src/lib/utils/recurrence.ts expandRecurrenceRule — the frontend
// expands for display, the hooks expand for the TRMNL feed and reminders.
//
//   Run:  node pocketbase/tests/localRecurrence.test.cjs
//
// All fixtures use local-time constructors so assertions are TZ-independent.

const fs = require('fs');
const path = require('path');

// --- load pb_helpers.js without ESM/CJS resolution or PB globals ---
const src = fs.readFileSync(path.join(__dirname, '..', 'pb_hooks', 'pb_helpers.js'), 'utf8');
const mod = { exports: {} };
new Function('module', 'exports', 'require', src)(mod, mod.exports, require);
const helpers = mod.exports;

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
function sameTimes(actual, expected) {
	if (actual.length !== expected.length) return false;
	for (let i = 0; i < expected.length; i++) {
		if (actual[i].getTime() !== expected[i].getTime()) return false;
	}
	return true;
}
function fmt(dates) {
	return dates.map((d) => d.toString()).join(' | ');
}
const d = (y, mo, day, h, min) => new Date(y, mo - 1, day, h === undefined ? 7 : h, min === undefined ? 40 : min, 0, 0);

// =====================================================================
// expandLocalRecurrence
// =====================================================================

// 1. The reported bug: weekly seed Mon 2026-08-24 must appear Mon 2026-08-31
{
	const occ = helpers.expandLocalRecurrence(
		{ frequency: 'weekly' },
		d(2026, 8, 24),
		d(2026, 8, 31, 0, 0),
		d(2026, 9, 6, 23, 59)
	);
	check('weekly: next week occurrence', sameTimes(occ, [d(2026, 8, 31)]), fmt(occ));
}

// 2. Seed occurrence included when in range; nothing before the seed
{
	const occ = helpers.expandLocalRecurrence(
		{ frequency: 'daily' },
		d(2026, 8, 24),
		d(2026, 8, 20, 0, 0),
		d(2026, 8, 25, 23, 59)
	);
	check('daily: seed included, nothing earlier', sameTimes(occ, [d(2026, 8, 24), d(2026, 8, 25)]), fmt(occ));
}

// 3. every_other_day fixed 2-day step; biweekly fixed 2-week step
{
	const eod = helpers.expandLocalRecurrence(
		{ frequency: 'every_other_day' },
		d(2026, 8, 24),
		d(2026, 8, 24, 0, 0),
		d(2026, 8, 29, 23, 59)
	);
	check('every_other_day', sameTimes(eod, [d(2026, 8, 24), d(2026, 8, 26), d(2026, 8, 28)]), fmt(eod));
	const bw = helpers.expandLocalRecurrence(
		{ frequency: 'biweekly' },
		d(2026, 8, 24),
		d(2026, 8, 31, 0, 0),
		d(2026, 9, 6, 23, 59)
	);
	check('biweekly: off-week empty', bw.length === 0, fmt(bw));
}

// 4. Monthly clamps short months without drifting
{
	const feb = helpers.expandLocalRecurrence(
		{ frequency: 'monthly' },
		d(2026, 1, 31),
		d(2026, 2, 1, 0, 0),
		d(2026, 3, 1, 0, 0)
	);
	check('monthly: clamps Jan 31 -> Feb 28', sameTimes(feb, [d(2026, 2, 28)]), fmt(feb));
	const mar = helpers.expandLocalRecurrence(
		{ frequency: 'monthly' },
		d(2026, 1, 31),
		d(2026, 3, 1, 0, 0),
		d(2026, 3, 31, 23, 59)
	);
	check('monthly: no drift after clamp', sameTimes(mar, [d(2026, 3, 31)]), fmt(mar));
}

// 5. Weekly with days_of_week honors the week interval (Sunday-anchored weeks)
{
	const occ = helpers.expandLocalRecurrence(
		{ frequency: 'weekly', interval: 2, days_of_week: [1, 3] },
		d(2026, 8, 24),
		d(2026, 8, 24, 0, 0),
		d(2026, 9, 9, 23, 59)
	);
	check(
		'weekly+days: skips off weeks',
		sameTimes(occ, [d(2026, 8, 24), d(2026, 8, 26), d(2026, 9, 7), d(2026, 9, 9)]),
		fmt(occ)
	);
}

// 6. count counts occurrences before the range; end_date date-only is inclusive
{
	const counted = helpers.expandLocalRecurrence(
		{ frequency: 'weekly', count: 2 },
		d(2026, 8, 24),
		d(2026, 8, 31, 0, 0),
		d(2026, 9, 30, 23, 59)
	);
	check('count: seed consumed #1', sameTimes(counted, [d(2026, 8, 31)]), fmt(counted));
	const until = helpers.expandLocalRecurrence(
		{ frequency: 'weekly', end_date: '2026-08-31' },
		d(2026, 8, 24),
		d(2026, 8, 24, 0, 0),
		d(2026, 9, 30, 23, 59)
	);
	check('end_date: inclusive day', sameTimes(until, [d(2026, 8, 24), d(2026, 8, 31)]), fmt(until));
}

// =====================================================================
// firstLocalOccurrenceOnOrAfter
// =====================================================================
{
	const next = helpers.firstLocalOccurrenceOnOrAfter({ frequency: 'weekly' }, d(2026, 8, 24), d(2026, 8, 28, 0, 0));
	check('firstOnOrAfter: lands on next Monday', next && next.getTime() === d(2026, 8, 31).getTime(), next && next.toString());
	const exact = helpers.firstLocalOccurrenceOnOrAfter({ frequency: 'weekly' }, d(2026, 8, 24), d(2026, 8, 31));
	check('firstOnOrAfter: exact hit is inclusive', exact && exact.getTime() === d(2026, 8, 31).getTime(), exact && exact.toString());
	const done = helpers.firstLocalOccurrenceOnOrAfter({ frequency: 'weekly', count: 2 }, d(2026, 8, 24), d(2026, 9, 15, 0, 0));
	check('firstOnOrAfter: exhausted series -> null', done === null, done && done.toString());
}

// =====================================================================
// nextReminderTime
// =====================================================================

// 7. Non-recurring: seed minus lead when still ahead, null when past
{
	const ahead = helpers.nextReminderTime(null, d(2026, 8, 24), 30, d(2026, 8, 23, 12, 0));
	check('reminder non-recurring: seed - 30min', ahead && ahead.getTime() === d(2026, 8, 24, 7, 10).getTime(), ahead && ahead.toString());
	const past = helpers.nextReminderTime(null, d(2026, 8, 24), 30, d(2026, 8, 25, 12, 0));
	check('reminder non-recurring past: null', past === null, past && past.toString());
}

// 8. Recurring: rolls forward to the next occurrence whose lead time is ahead
{
	const rule = { frequency: 'weekly' };
	const next = helpers.nextReminderTime(rule, d(2026, 8, 24), 30, d(2026, 8, 30, 12, 0));
	check('reminder weekly: next Monday 07:10', next && next.getTime() === d(2026, 8, 31, 7, 10).getTime(), next && next.toString());
	// 07:30 on the 31st: that occurrence's reminder has passed -> a week later
	const rolled = helpers.nextReminderTime(rule, d(2026, 8, 24), 30, d(2026, 8, 31, 7, 30));
	check('reminder weekly: rolls past fired occurrence', rolled && rolled.getTime() === d(2026, 9, 7, 7, 10).getTime(), rolled && rolled.toString());
	// Series exhausted -> null
	const ended = helpers.nextReminderTime({ frequency: 'weekly', count: 2 }, d(2026, 8, 24), 30, d(2026, 9, 15, 0, 0));
	check('reminder weekly: exhausted -> null', ended === null, ended && ended.toString());
}

console.log('\n' + passed + ' passed, ' + failures + ' failed');
process.exit(failures === 0 ? 0 : 1);
