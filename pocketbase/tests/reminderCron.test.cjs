// Standalone Node test for the reminder cron (020_reminder_cron.pb.js),
// focused on recurring local events: the push message must describe the
// upcoming OCCURRENCE (not the long-past seed), and after a send the cron
// must re-arm the next occurrence's reminder. Same mocked-globals approach
// as the other hook tests; pb_helpers.js is loaded for real with
// sendPushToAllDevices stubbed out.
//
//   Run:  node pocketbase/tests/reminderCron.test.cjs

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
		fields,
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
		},
		set(k, v) {
			fields[k] = v;
		}
	};
}

function pbDateString(d) {
	return d.toISOString().replace('T', ' ');
}

// --- load pb_helpers for real, with push stubbed ---
let pushCalls = [];
function pbRequire(p) {
	const src = fs.readFileSync(p.replace('/hooks', path.join(__dirname, '..', 'pb_hooks')), 'utf8');
	const mod = { exports: {} };
	new Function('module', 'exports', 'require', '$app', src)(mod, mod.exports, require, $app);
	mod.exports.sendPushToAllDevices = (userId, title, body, tag) => {
		pushCalls.push({ userId, title, body, tag });
		return { sent: 1, failed: 0 };
	};
	return mod.exports;
}

// --- mock PB globals ---
let dueReminders = [];
let eventById = {};
let pendingReminders = []; // rows the dup-guard query sees
let insertedRows = []; // captured new Record saves

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
	findAllRecords(collection) {
		if (collection === 'scheduled_reminders') return dueReminders;
		return [];
	},
	findRecordById(collection, id) {
		const rec = eventById[id];
		if (!rec) throw new Error('not found');
		return rec;
	},
	findRecordsByFilter(collection, filter, sort, limit, offset, params) {
		if (collection === 'scheduled_reminders') return pendingReminders;
		return [];
	},
	findCollectionByNameOrId(name) {
		return { name };
	},
	save(record) {
		if (record instanceof Record) insertedRows.push(record);
	}
};
const $dbx = {
	and: (...args) => ({ args }),
	hashExp: (o) => o,
	exp: (s, p) => ({ s, p })
};

let cronFn = null;
function cronAdd(name, schedule, fn) {
	if (name === 'reminder_sender') cronFn = fn;
}

const hookSrc = fs.readFileSync(path.join(__dirname, '..', 'pb_hooks', '020_reminder_cron.pb.js'), 'utf8');
new Function('cronAdd', '$app', '$dbx', 'Record', 'require', '__hooks', hookSrc)(
	cronAdd,
	$app,
	$dbx,
	Record,
	pbRequire,
	'/hooks'
);
check('cron registered', typeof cronFn === 'function');

const REMINDERS = JSON.stringify([{ minutes_before: 30, type: 'notification' }]);
const now = new Date();
// Upcoming occurrence: today at now+30min (wall clock, may roll past midnight)
const occ = new Date(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours(), now.getMinutes() + 30, 0, 0);
// Seed two weeks before the occurrence — long past
const seed = new Date(occ.getFullYear(), occ.getMonth(), occ.getDate() - 14, occ.getHours(), occ.getMinutes(), 0, 0);
const nextOcc = new Date(occ.getFullYear(), occ.getMonth(), occ.getDate() + 7, occ.getHours(), occ.getMinutes(), 0, 0);

function run() {
	pushCalls = [];
	insertedRows = [];
	cronFn();
}

// 1. Recurring event: message describes the occurrence, next reminder re-armed
{
	eventById = {
		ev1: fakeRecord('ev1', {
			user: 'user1',
			title: 'Idrott',
			start_time: pbDateString(seed),
			reminders: REMINDERS,
			recurrence_rule: '{"frequency":"weekly"}'
		})
	};
	dueReminders = [
		fakeRecord('sr1', { user: 'user1', event: 'ev1', scheduled_for: pbDateString(now), sent_at: '' })
	];
	pendingReminders = [];
	run();

	check('recurring: push sent', pushCalls.length === 1, 'got ' + pushCalls.length);
	check(
		'recurring: message says today/tomorrow, not the seed date',
		pushCalls.length === 1 && /(today|tomorrow)/.test(pushCalls[0].body),
		pushCalls[0] && pushCalls[0].body
	);
	check('recurring: due row marked sent', dueReminders[0].fields.sent_at !== '');
	check('recurring: next occurrence re-armed', insertedRows.length === 1, 'got ' + insertedRows.length);
	check(
		'recurring: re-armed 30min before next occurrence',
		insertedRows.length === 1 &&
			insertedRows[0].fields.scheduled_for === new Date(nextOcc.getTime() - 30 * 60000).toISOString(),
		insertedRows[0] && insertedRows[0].fields.scheduled_for
	);
}

// 2. Dup guard: a pending row at the computed time blocks a second insert
{
	dueReminders = [
		fakeRecord('sr2', { user: 'user1', event: 'ev1', scheduled_for: pbDateString(now), sent_at: '' })
	];
	pendingReminders = [
		fakeRecord('sr3', {
			event: 'ev1',
			scheduled_for: pbDateString(new Date(nextOcc.getTime() - 30 * 60000)),
			sent_at: ''
		})
	];
	run();
	check('dup guard: no duplicate insert', insertedRows.length === 0, 'got ' + insertedRows.length);
}

// 3. Non-recurring event: nothing re-armed
{
	eventById = {
		ev2: fakeRecord('ev2', {
			user: 'user1',
			title: 'Vet visit',
			start_time: pbDateString(occ),
			reminders: REMINDERS
		})
	};
	dueReminders = [
		fakeRecord('sr4', { user: 'user1', event: 'ev2', scheduled_for: pbDateString(now), sent_at: '' })
	];
	pendingReminders = [];
	run();
	check('non-recurring: push sent', pushCalls.length === 1);
	check('non-recurring: nothing re-armed', insertedRows.length === 0, 'got ' + insertedRows.length);
}

console.log(`\n${passed} passed, ${failures} failed`);
process.exit(failures ? 1 : 0);
