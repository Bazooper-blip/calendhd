// Standalone Node test for the reminder scheduler hook
// (010_reminder_scheduler.pb.js). Same approach as newEventNotify.test.cjs:
// load the hook source with mocked PB globals and drive the captured
// handlers. pb_helpers.js is loaded for real so recurrence-aware scheduling
// (nextReminderTime) runs unchanged.
//
//   Run:  node pocketbase/tests/reminderScheduler.test.cjs

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

// --- load pb_helpers.js for real (PB's require, minus ESM resolution) ---
function pbRequire(p) {
	const src = fs.readFileSync(p.replace('/hooks', path.join(__dirname, '..', 'pb_hooks')), 'utf8');
	const mod = { exports: {} };
	new Function('module', 'exports', 'require', src)(mod, mod.exports, require);
	return mod.exports;
}

// --- mocks ---
let savedRows = []; // captured scheduled_reminders inserts
let existingReminders = []; // rows returned for the update handler's cleanup
let deletedRows = [];

class Record {
	constructor(collection) {
		this.collection = collection;
		this.fields = {};
	}
	set(k, v) {
		this.fields[k] = v;
	}
}

const $app = {
	findCollectionByNameOrId(name) {
		return { name };
	},
	save(record) {
		savedRows.push(record);
	},
	findAllRecords(collection, expr) {
		if (collection === 'scheduled_reminders') return existingReminders;
		return [];
	},
	delete(record) {
		deletedRows.push(record);
	}
};
const $dbx = {
	and: (...args) => ({ args }),
	hashExp: (o) => o,
	exp: (s, p) => ({ s, p })
};

let createHandler = null;
let updateHandler = null;
function onRecordAfterCreateSuccess(fn, collection) {
	if (collection === 'events') createHandler = fn;
}
function onRecordAfterUpdateSuccess(fn, collection) {
	if (collection === 'events') updateHandler = fn;
}

const hookSrc = fs.readFileSync(
	path.join(__dirname, '..', 'pb_hooks', '010_reminder_scheduler.pb.js'),
	'utf8'
);
new Function(
	'onRecordAfterCreateSuccess',
	'onRecordAfterUpdateSuccess',
	'$app',
	'$dbx',
	'Record',
	'require',
	'__hooks',
	hookSrc
)(onRecordAfterCreateSuccess, onRecordAfterUpdateSuccess, $app, $dbx, Record, pbRequire, '/hooks');

check('create handler registered', typeof createHandler === 'function');
check('update handler registered', typeof updateHandler === 'function');

function pbDateString(d) {
	return d.toISOString().replace('T', ' ');
}
let nextCalls = 0;
function fireCreate(fields) {
	savedRows = [];
	createHandler({ record: fakeRecord('ev1', fields), next: () => nextCalls++ });
	return savedRows;
}
function fireUpdate(fields) {
	savedRows = [];
	deletedRows = [];
	updateHandler({ record: fakeRecord('ev1', fields), next: () => nextCalls++ });
	return savedRows;
}

const REMINDERS = JSON.stringify([{ minutes_before: 30, type: 'notification' }]);
const now = new Date();

// 0. Handlers must propagate the hook chain — a handler that skips e.next()
//    silently suppresses every other handler on the same (hook, collection).
{
	nextCalls = 0;
	fireCreate({ user: 'user1', title: 'chain', start_time: pbDateString(now) });
	fireUpdate({ user: 'user1', title: 'chain', start_time: pbDateString(now) });
	check('handlers call e.next()', nextCalls === 2, 'got ' + nextCalls);
}

// 1. Non-recurring future event: reminder at start - 30min (existing behavior)
{
	const start = new Date(now.getTime() + 2 * 3600000);
	const rows = fireCreate({
		user: 'user1',
		title: 'Vet visit',
		start_time: pbDateString(start),
		reminders: REMINDERS
	});
	check('future event: one reminder row', rows.length === 1, 'got ' + rows.length);
	check(
		'future event: scheduled 30min before start',
		rows.length === 1 && rows[0].fields.scheduled_for === new Date(start.getTime() - 30 * 60000).toISOString(),
		rows[0] && rows[0].fields.scheduled_for
	);
}

// 2. Non-recurring past event: nothing scheduled (existing behavior)
{
	const start = new Date(now.getTime() - 2 * 3600000);
	const rows = fireCreate({
		user: 'user1',
		title: 'Old thing',
		start_time: pbDateString(start),
		reminders: REMINDERS
	});
	check('past event: no reminder row', rows.length === 0, 'got ' + rows.length);
}

// 3. Recurring weekly event with a past seed: reminder targets the NEXT
//    occurrence (the reported gap — previously nothing was ever scheduled)
{
	// Seed 7 days ago at now+90min wall-clock; next occurrence is ~90min ahead
	const seed = new Date(
		now.getFullYear(), now.getMonth(), now.getDate() - 7,
		now.getHours(), now.getMinutes() + 90, 0, 0
	);
	const expectedOcc = new Date(
		seed.getFullYear(), seed.getMonth(), seed.getDate() + 7,
		seed.getHours(), seed.getMinutes(), 0, 0
	);
	const rows = fireCreate({
		user: 'user1',
		title: 'Idrott',
		start_time: pbDateString(seed),
		reminders: REMINDERS,
		recurrence_rule: '{"frequency":"weekly"}'
	});
	check('recurring past seed: one reminder row', rows.length === 1, 'got ' + rows.length);
	check(
		'recurring past seed: scheduled before next occurrence',
		rows.length === 1 &&
			rows[0].fields.scheduled_for === new Date(expectedOcc.getTime() - 30 * 60000).toISOString(),
		rows[0] && rows[0].fields.scheduled_for
	);

	// Update handler reschedules with the same occurrence-aware time
	existingReminders = [fakeRecord('sr-old', {})];
	const updated = fireUpdate({
		user: 'user1',
		title: 'Idrott',
		start_time: pbDateString(seed),
		reminders: REMINDERS,
		recurrence_rule: '{"frequency":"weekly"}'
	});
	check('recurring update: pending rows wiped', deletedRows.length === 1);
	check(
		'recurring update: rescheduled for next occurrence',
		updated.length === 1 &&
			updated[0].fields.scheduled_for === new Date(expectedOcc.getTime() - 30 * 60000).toISOString(),
		updated[0] && updated[0].fields.scheduled_for
	);
	existingReminders = [];
}

// 4. Recurring but exhausted series (count consumed): nothing scheduled
{
	const seed = new Date(
		now.getFullYear(), now.getMonth(), now.getDate() - 21,
		now.getHours(), now.getMinutes(), 0, 0
	);
	const rows = fireCreate({
		user: 'user1',
		title: 'Short series',
		start_time: pbDateString(seed),
		reminders: REMINDERS,
		recurrence_rule: '{"frequency":"weekly","count":2}'
	});
	check('exhausted series: no reminder row', rows.length === 0, 'got ' + rows.length);
}

// 5. Paused recurring event: silent
{
	const seed = new Date(now.getTime() + 2 * 3600000);
	const rows = fireCreate({
		user: 'user1',
		title: 'Paused',
		start_time: pbDateString(seed),
		reminders: REMINDERS,
		recurrence_rule: '{"frequency":"weekly"}',
		is_paused: true
	});
	check('paused: no reminder row', rows.length === 0, 'got ' + rows.length);
}

console.log(`\n${passed} passed, ${failures} failed`);
process.exit(failures ? 1 : 0);
