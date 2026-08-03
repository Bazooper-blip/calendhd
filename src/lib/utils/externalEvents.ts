// Recurring external events are materialized by subscription sync with
// per-occurrence UIDs of the form "<feed uid>::<YYYYMMDDTHHMMSS>" (see
// pocketbase/pb_hooks/050_subscription_sync.pb.js). Pause rows in the
// external_event_pauses collection are keyed by the BASE uid so one row
// covers every occurrence of a series. Only a suffix matching the sync's
// stamp format is stripped — a feed's own uid could legitimately contain
// "::". Mirrors baseIcalUid() in pocketbase/pb_hooks/pb_helpers.js — keep
// the two in sync.
export function baseIcalUid(uid: string): string {
	if (!uid) return uid;
	const idx = uid.lastIndexOf('::');
	if (idx === -1) return uid;
	const suffix = uid.substring(idx + 2);
	return /^\d{8}T\d{6}$/.test(suffix) ? uid.substring(0, idx) : uid;
}
