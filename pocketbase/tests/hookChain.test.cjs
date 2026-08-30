// Static guard: every onRecord*Success handler in pb_hooks must call e.next().
//
// PocketBase's hook system chains handlers — a handler that does not call
// e.next() stops the chain, silently suppressing the handlers loaded after
// it. Hook FILE LOAD ORDER is filesystem-dependent (empirically not reliably
// alphabetical), so with e.next() missing exactly one arbitrary handler per
// (hook, collection) survives. This bit production: from 1.9.3,
// 025_new_event_notification suppressed 010_reminder_scheduler on
// events-create, so newly created events never got reminders scheduled
// (verified empirically on PB 0.39.11 and 0.40.1). The live counterpart,
// integration.live.cjs, asserts both events-create side effects against a
// real PocketBase so the suppression is caught whichever handler survives.
//
//   Run:  node pocketbase/tests/hookChain.test.cjs

const fs = require('fs');
const path = require('path');

let failures = 0;
let passed = 0;

const hooksDir = path.join(__dirname, '..', 'pb_hooks');
const files = fs.readdirSync(hooksDir).filter((f) => f.endsWith('.pb.js'));

const HOOK_RE = /onRecordAfter(Create|Update|Delete)Success\s*\(/g;

for (const file of files) {
	const src = fs.readFileSync(path.join(hooksDir, file), 'utf8');
	let m;
	while ((m = HOOK_RE.exec(src)) !== null) {
		// Take the handler body: from the registration to the matching
		// `}, "collection")` terminator. A simple brace counter is enough for
		// these files (no template literals containing braces in handlers).
		let depth = 0;
		let started = false;
		let end = m.index;
		for (let i = m.index; i < src.length; i++) {
			const c = src[i];
			if (c === '{') {
				depth++;
				started = true;
			} else if (c === '}') {
				depth--;
				if (started && depth === 0) {
					end = i;
					break;
				}
			}
		}
		const body = src.slice(m.index, end + 1);
		const line = src.slice(0, m.index).split('\n').length;
		const label = `${file}:${line} onRecordAfter${m[1]}Success`;
		if (/\be\.next\s*\(\s*\)/.test(body)) {
			passed++;
		} else {
			failures++;
			console.error(`FAIL: ${label} does not call e.next()`);
		}
	}
}

if (passed + failures === 0) {
	failures++;
	console.error('FAIL: no onRecordAfter*Success handlers found — regex broken?');
}

console.log(`\n${passed} passed, ${failures} failed`);
process.exit(failures ? 1 : 0);
