// Standalone Node test for helpers.expandRecurrence (RRULE expansion).
// Hooks run in PocketBase's goja runtime and aren't part of the Vitest suite,
// so we load pb_helpers.js through a CommonJS wrapper. expandRecurrence is a
// pure function (no $app/$dbx), so it runs unchanged under Node.
//
//   Run:  node pocketbase/tests/expandRecurrence.test.cjs
//
// Assertions use local calendar fields (getFullYear/getMonth/getDate/getDay),
// which are timezone-independent for locally-constructed Dates — so the test
// passes regardless of the runner's TZ.

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
const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
function ymd(d) {
	return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0') + ' ' + DOW[d.getDay()];
}

const rangeStart = new Date(2025, 0, 1);
const rangeEnd = new Date(2028, 11, 31, 23, 59, 59);

// =====================================================================
// 1. The reported bug: DTSTART is Saturday 2026-06-06 but RRULE says
//    BYDAY=FR. Occurrences must land on FRIDAY, never Saturday, and must
//    continue the biweekly cadence (Jun 5, Jun 19, Jul 3, ...).
// =====================================================================
{
	const start = new Date(2026, 5, 6, 9, 30, 0); // Sat Jun 6 09:30 local
	const end = new Date(2026, 5, 6, 11, 0, 0);
	const occ = helpers.expandRecurrence('FREQ=WEEKLY;INTERVAL=2;BYDAY=FR', start, end, false, rangeStart, rangeEnd);

	check('wrong-weekday: produces multiple occurrences', occ.length > 5, 'got ' + occ.length);
	check('wrong-weekday: no Saturday occurrences', occ.every((o) => o.start.getDay() !== 6),
		'offending: ' + occ.filter((o) => o.start.getDay() === 6).map((o) => ymd(o.start)).join(', '));
	check('wrong-weekday: all on Friday', occ.every((o) => o.start.getDay() === 5));
	check('wrong-weekday: preserves 09:30 wall time', occ.every((o) => o.start.getHours() === 9 && o.start.getMinutes() === 30));
	check('wrong-weekday: preserves 90-min duration', occ.every((o) => o.end && o.end.getTime() - o.start.getTime() === 90 * 60000));

	const first = occ[0].start;
	check('wrong-weekday: first occurrence is Fri 2026-06-05',
		first.getFullYear() === 2026 && first.getMonth() === 5 && first.getDate() === 5, ymd(first));
	const second = occ[1].start;
	check('wrong-weekday: biweekly cadence (next is 14 days later, 2026-06-19)',
		second.getDate() === 19 && second.getMonth() === 5 &&
		second.getTime() - first.getTime() === 14 * 86400000, ymd(second));
}

// =====================================================================
// 2. The old (correctly-anchored) series WITH UNTIL.
//    DTSTART Fri 2026-03-13, UNTIL 2026-06-04 19:59:59. Last Friday
//    on/before UNTIL is 2026-05-22 (next would be Jun 5 > UNTIL).
// =====================================================================
{
	const start = new Date(2026, 2, 13, 9, 30, 0); // Fri Mar 13
	const end = new Date(2026, 2, 13, 11, 0, 0);
	const occ = helpers.expandRecurrence('FREQ=WEEKLY;UNTIL=20260604T195959;INTERVAL=2;BYDAY=FR', start, end, false, rangeStart, rangeEnd);

	check('old-series: all Fridays', occ.every((o) => o.start.getDay() === 5));
	check('old-series: first is 2026-03-13',
		occ[0].start.getMonth() === 2 && occ[0].start.getDate() === 13, ymd(occ[0].start));
	const last = occ[occ.length - 1].start;
	check('old-series: honors UNTIL (last is 2026-05-22)',
		last.getMonth() === 4 && last.getDate() === 22, ymd(last));
	check('old-series: nothing past UNTIL', occ.every((o) => o.start <= new Date(2026, 5, 4, 19, 59, 59)));
}

// =====================================================================
// 3. YEARLY with negative nth weekday: last Sunday of October each year.
// =====================================================================
{
	const start = new Date(2020, 9, 25, 3, 0, 0); // some past anchor
	const occ = helpers.expandRecurrence('FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU', start, null, false, rangeStart, rangeEnd);
	check('yearly-lastSun: every occurrence is a Sunday in October',
		occ.length > 0 && occ.every((o) => o.start.getDay() === 0 && o.start.getMonth() === 9));
	// last Sunday of Oct 2026 is 2026-10-25
	const y2026 = occ.find((o) => o.start.getFullYear() === 2026);
	check('yearly-lastSun: Oct 2026 is the 25th', !!y2026 && y2026.start.getDate() === 25, y2026 ? ymd(y2026.start) : 'missing');
	// last Sunday of Oct 2027 is 2027-10-31
	const y2027 = occ.find((o) => o.start.getFullYear() === 2027);
	check('yearly-lastSun: Oct 2027 is the 31st', !!y2027 && y2027.start.getDate() === 31, y2027 ? ymd(y2027.start) : 'missing');
}

// =====================================================================
// 4. MONTHLY by month-day: the 28th of every month.
// =====================================================================
{
	const start = new Date(2026, 0, 28, 8, 0, 0);
	const occ = helpers.expandRecurrence('FREQ=MONTHLY;BYMONTHDAY=28', start, null, false, rangeStart, rangeEnd);
	check('monthly-28: every occurrence is the 28th', occ.length > 10 && occ.every((o) => o.start.getDate() === 28));
	check('monthly-28: spans consecutive months', occ.length >= 24);
}

// =====================================================================
// 5. YEARLY fixed date (birthday-style): BYMONTH + BYMONTHDAY, with an
//    anchor DTSTART BEFORE the window — must still emit in-window years.
// =====================================================================
{
	const start = new Date(1990, 8, 14, 0, 0, 0); // Sep 14 1990, far before window
	const occ = helpers.expandRecurrence('FREQ=YEARLY;BYMONTH=9;BYMONTHDAY=14', start, null, false, rangeStart, rangeEnd);
	check('yearly-fixed: emits despite ancient DTSTART', occ.length >= 3, 'got ' + occ.length);
	check('yearly-fixed: always Sep 14', occ.every((o) => o.start.getMonth() === 8 && o.start.getDate() === 14));
	check('yearly-fixed: all within window', occ.every((o) => o.start >= rangeStart && o.start <= rangeEnd));
}

// =====================================================================
// 6. No RRULE -> exactly one occurrence, unchanged start/end.
// =====================================================================
{
	const start = new Date(2026, 5, 6, 9, 30, 0);
	const end = new Date(2026, 5, 6, 11, 0, 0);
	const occ = helpers.expandRecurrence('', start, end, false, rangeStart, rangeEnd);
	check('no-rrule: single occurrence', occ.length === 1);
	check('no-rrule: identical start/end', occ.length === 1 && occ[0].start.getTime() === start.getTime() && occ[0].end.getTime() === end.getTime());
}

console.log('\n' + passed + ' passed, ' + failures + ' failed');
process.exit(failures === 0 ? 0 : 1);
