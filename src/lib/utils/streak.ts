import type { CalendarEvent } from '$types';

/**
 * Compute the current routine streak — the number of consecutive past days
 * (ending yesterday) where every event of the given routine was completed.
 * Today is excluded (still in progress); we walk backwards from yesterday.
 *
 * Cheap: bounded by `lookbackDays` (default 60). For most personal calendars
 * that's <500 events to scan — fine to run on every render.
 */
export function computeRoutineStreak(
	routineId: string,
	events: CalendarEvent[],
	now: Date = new Date(),
	lookbackDays = 60
): number {
	// Group routine events by yyyy-mm-dd
	const byDay = new Map<string, { total: number; done: number }>();
	for (const ev of events) {
		if (ev.routine_template !== routineId) continue;
		const d = new Date(ev.start_time);
		const key = `${d.getFullYear()}-${(d.getMonth() + 1).toString().padStart(2, '0')}-${d.getDate().toString().padStart(2, '0')}`;
		const entry = byDay.get(key) ?? { total: 0, done: 0 };
		entry.total += 1;
		if (ev.completed_at) entry.done += 1;
		byDay.set(key, entry);
	}

	let streak = 0;
	const cursor = new Date(now.getFullYear(), now.getMonth(), now.getDate());
	cursor.setDate(cursor.getDate() - 1); // start at yesterday
	for (let i = 0; i < lookbackDays; i++) {
		const key = `${cursor.getFullYear()}-${(cursor.getMonth() + 1).toString().padStart(2, '0')}-${cursor.getDate().toString().padStart(2, '0')}`;
		const entry = byDay.get(key);
		if (!entry || entry.total === 0 || entry.done < entry.total) break;
		streak += 1;
		cursor.setDate(cursor.getDate() - 1);
	}
	return streak;
}
