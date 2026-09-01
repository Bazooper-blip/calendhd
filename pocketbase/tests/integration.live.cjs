// Live integration test: boots a REAL PocketBase binary on a fresh data dir
// with the repo's hooks + migrations and asserts observable end-to-end
// behavior through the HTTP API.
//
// This exists because the mocked Node harnesses cannot see the class of
// regression that only appears inside PocketBase itself: hook-chain
// suppression (a handler skipping e.next() silently swallowed the reminder
// scheduler in production, 1.9.3–1.9.4), JSVM json-field representations,
// filter-language quirks, and migration breakage on fresh installs.
//
//   Run:  node pocketbase/tests/integration.live.cjs
//
// Env:
//   PB_BIN    path to the pocketbase binary (default: pocketbase/pocketbase)
//   PB_HOOKS  hooks dir (default: pocketbase/pb_hooks) — CI red-tests use a
//             mutated copy to prove regressions are detected
//   PB_PORT   port to serve on (default: 18099)

const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const PB_BIN = process.env.PB_BIN || path.join(ROOT, 'pocketbase', 'pocketbase');
const PB_HOOKS = process.env.PB_HOOKS || path.join(ROOT, 'pocketbase', 'pb_hooks');
const PB_MIGRATIONS = path.join(ROOT, 'pocketbase', 'pb_migrations');
const PORT = parseInt(process.env.PB_PORT || '18099', 10);
const BASE = `http://127.0.0.1:${PORT}`;

let failures = 0;
let passed = 0;
function check(name, cond, detail) {
	if (cond) {
		passed++;
		console.log('ok: ' + name);
	} else {
		failures++;
		console.error('FAIL: ' + name + (detail ? '  -> ' + detail : ''));
	}
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function api(method, p, { token, body } = {}) {
	const res = await fetch(BASE + p, {
		method,
		headers: {
			...(token ? { Authorization: token } : {}),
			...(body ? { 'Content-Type': 'application/json' } : {})
		},
		body: body ? JSON.stringify(body) : undefined
	});
	let json = null;
	try {
		json = await res.json();
	} catch {
		/* non-JSON response */
	}
	return { status: res.status, json };
}

function pbDate(d) {
	return d.toISOString().replace('T', ' ');
}

async function main() {
	if (!fs.existsSync(PB_BIN)) {
		console.error(`FAIL: PocketBase binary not found at ${PB_BIN} (set PB_BIN)`);
		process.exit(1);
	}

	const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'calendhd-pb-it-'));
	const logPath = path.join(dataDir, 'pb.log');
	const logFd = fs.openSync(logPath, 'w');
	const child = spawn(
		PB_BIN,
		['serve', `--http=127.0.0.1:${PORT}`, `--dir=${dataDir}`, `--hooksDir=${PB_HOOKS}`, `--migrationsDir=${PB_MIGRATIONS}`],
		{ stdio: ['ignore', logFd, logFd] }
	);
	const cleanup = () => {
		try {
			child.kill('SIGTERM');
		} catch {
			/* already gone */
		}
	};
	process.on('exit', cleanup);

	try {
		// ---- fresh install boots: migrations apply, server healthy ----------
		let healthy = false;
		for (let i = 0; i < 60; i++) {
			try {
				const r = await api('GET', '/api/health');
				if (r.status === 200) {
					healthy = true;
					break;
				}
			} catch {
				/* not up yet */
			}
			if (child.exitCode !== null) break;
			await sleep(500);
		}
		check('fresh install: server becomes healthy', healthy);
		if (!healthy) {
			console.error('--- pb.log tail ---\n' + fs.readFileSync(logPath, 'utf8').split('\n').slice(-30).join('\n'));
			process.exit(1);
		}

		// ---- singleton bootstrap creates the home account -------------------
		const boot = await api('GET', '/api/calendhd/bootstrap');
		check('bootstrap: serves credentials', boot.status === 200 && !!boot.json?.email && !!boot.json?.password, JSON.stringify(boot.json));

		const auth = await api('POST', '/api/collections/users/auth-with-password', {
			body: { identity: boot.json.email, password: boot.json.password }
		});
		check('auth: singleton login works', auth.status === 200 && !!auth.json?.token, JSON.stringify(auth.json).slice(0, 200));
		const token = auth.json.token;
		const userId = auth.json.record.id;

		// Opt in to new-event notifications so the 025 hook takes its full
		// path — its log line is asserted below as the observable proof that
		// the hook ran (no push service is running, so nothing is sent).
		const settings = await api('POST', '/api/collections/user_settings/records', {
			token,
			body: { user: userId, notify_new_events: true, time_format: '24h', locale: 'en' }
		});
		check('settings: created with notify_new_events on', settings.status === 200);

		// ---- THE regression: creating an event must fire EVERY hook ---------
		// A recurring event with a reminder, seeded a week ago. The reminder
		// scheduler (010) must produce a scheduled_reminders row for the NEXT
		// occurrence even though other handlers (025) share the same hook —
		// this is exactly what hook-chain suppression broke in production.
		const now = new Date();
		const occ = new Date(now.getTime() + 2 * 3600000); // next occurrence ~+2h
		const seed = new Date(occ.getTime() - 7 * 86400000);
		const created = await api('POST', '/api/collections/events/records', {
			token,
			body: {
				user: userId,
				title: 'IT recurring',
				start_time: pbDate(seed),
				is_all_day: false,
				recurrence_rule: { frequency: 'weekly' },
				reminders: [{ minutes_before: 30, type: 'notification' }]
			}
		});
		check('events: create succeeds', created.status === 200 && !!created.json?.id, JSON.stringify(created.json).slice(0, 200));
		const evId = created.json.id;

		await sleep(500); // hooks run synchronously, but give the log a beat

		// BOTH events-create handlers must observably run. Hook file load
		// order is filesystem-dependent (empirically NOT always alphabetical),
		// so when a handler skips e.next() the survivor is arbitrary —
		// asserting both side effects catches the suppression whichever way
		// it lands.
		const logAfterCreate = fs.readFileSync(logPath, 'utf8');
		check(
			"hook chain: new-event notification hook ran (e.next regression)",
			logAfterCreate.includes("[new-event-notify] 'IT recurring'"),
			'no [new-event-notify] line in pb.log'
		);
		const rem = await api(
			'GET',
			`/api/collections/scheduled_reminders/records?filter=${encodeURIComponent(`event = "${evId}"`)}`,
			{ token }
		);
		check('hook chain: reminder scheduled on CREATE (e.next regression)', rem.json?.totalItems === 1, `totalItems=${rem.json?.totalItems}`);
		const expected = new Date(occ.getTime() - 30 * 60000);
		check(
			'reminder targets the next occurrence, not the past seed',
			rem.json?.items?.[0]?.scheduled_for === pbDate(expected),
			`${rem.json?.items?.[0]?.scheduled_for} != ${pbDate(expected)}`
		);

		// ---- recurring seeds outside the range are still fetched ------------
		const rangeStart = new Date(now.getTime() + 86400000); // tomorrow
		const rangeEnd = new Date(now.getTime() + 8 * 86400000);
		const filter = `(start_time >= "${rangeStart.toISOString()}" || recurrence_rule != null) && start_time <= "${rangeEnd.toISOString()}"`;
		const list = await api('GET', `/api/collections/events/records?filter=${encodeURIComponent(filter)}`, { token });
		check('filter: recurring seed outside range is returned', list.json?.items?.some((i) => i.id === evId), `totalItems=${list.json?.totalItems}`);

		// ---- TRMNL feed expands the recurrence into future days -------------
		const feed = await api('GET', '/api/calendhd/trmnl?days=8');
		const feedDays = feed.json?.days || [];
		const hits = feedDays.filter((d) => (d.events || []).some((ev) => ev.title === 'IT recurring'));
		check('trmnl: recurring event expanded into a future day', feed.status === 200 && hits.length >= 1, `days with hit=${hits.length}`);

		// ---- update reschedules; pause cancels ------------------------------
		const occ2 = new Date(now.getTime() + 3 * 3600000);
		const upd = await api('PATCH', `/api/collections/events/records/${evId}`, {
			token,
			body: { start_time: pbDate(new Date(occ2.getTime() - 7 * 86400000)) }
		});
		check('events: update succeeds', upd.status === 200);
		const rem2 = await api(
			'GET',
			`/api/collections/scheduled_reminders/records?filter=${encodeURIComponent(`event = "${evId}"`)}`,
			{ token }
		);
		check(
			'hook chain: update reschedules to the new occurrence',
			rem2.json?.totalItems === 1 && rem2.json?.items?.[0]?.scheduled_for === pbDate(new Date(occ2.getTime() - 30 * 60000)),
			JSON.stringify(rem2.json?.items?.map((i) => i.scheduled_for))
		);

		await api('PATCH', `/api/collections/events/records/${evId}`, { token, body: { is_paused: true } });
		const rem3 = await api(
			'GET',
			`/api/collections/scheduled_reminders/records?filter=${encodeURIComponent(`event = "${evId}"`)}`,
			{ token }
		);
		check('pause: pending reminders cancelled', rem3.json?.totalItems === 0, `totalItems=${rem3.json?.totalItems}`);

		// ---- hooks loaded without errors ------------------------------------
		const log = fs.readFileSync(logPath, 'utf8');
		const loadErrors = log.split('\n').filter((l) => /failed to (load|run) hook|SyntaxError|ReferenceError/i.test(l));
		check('hooks: no load errors in server log', loadErrors.length === 0, loadErrors.slice(0, 3).join(' | '));
	} finally {
		cleanup();
		await sleep(300);
		try {
			fs.rmSync(dataDir, { recursive: true, force: true });
		} catch {
			/* leave temp dir for inspection */
		}
	}

	console.log(`\n${passed} passed, ${failures} failed`);
	process.exit(failures ? 1 : 0);
}

main().catch((err) => {
	console.error('FAIL: integration crashed: ' + (err && err.stack ? err.stack : err));
	process.exit(1);
});
