import { browser } from '$app/env';

export type WeekLayout = 'grid' | 'list';

const STORAGE_KEY = 'calendhd_week_layout';

// Week view layout (time grid vs. day-per-row list). Deliberately per device
// (localStorage, not user_settings): a phone may prefer the list while a
// desktop keeps the grid. Storage can be unavailable (private mode, blocked
// site data) — fall back to the grid and keep the choice in memory.
function createWeekLayoutStore() {
	let layout = $state<WeekLayout>(readStored());

	function readStored(): WeekLayout {
		if (!browser) return 'grid';
		try {
			return localStorage.getItem(STORAGE_KEY) === 'list' ? 'list' : 'grid';
		} catch {
			return 'grid';
		}
	}

	return {
		get layout() {
			return layout;
		},

		set(next: WeekLayout) {
			layout = next;
			try {
				localStorage.setItem(STORAGE_KEY, next);
			} catch {
				// In-memory only for this session
			}
		},

		toggle() {
			this.set(layout === 'grid' ? 'list' : 'grid');
		}
	};
}

export const weekLayoutStore = createWeekLayoutStore();
