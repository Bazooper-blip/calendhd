import { browser } from '$app/environment';
import {
	getRoutineTemplates,
	createRoutineTemplate,
	updateRoutineTemplate,
	deleteRoutineTemplate,
	subscribeToRoutineTemplates
} from '$api/pocketbase';
import { db } from '$db';
import {
	getLocalRoutines,
	createLocalRoutine,
	updateLocalRoutine,
	deleteLocalRoutine
} from '$db/routines';
import { auth } from './auth.svelte';
import type { RoutineTemplate, LocalRoutineTemplate, RoutineStep, RoutineSchedule } from '$types';

function createRoutinesStore() {
	let routines = $state<RoutineTemplate[]>([]);
	let loading = $state(false);
	let unsubscribe: (() => void) | null = null;

	return {
		get routines() {
			return routines;
		},
		get loading() {
			return loading;
		},

		getById(id: string): RoutineTemplate | undefined {
			return routines.find((r) => r.id === id);
		},

		getActive(): RoutineTemplate[] {
			return routines.filter((r) => r.is_active);
		},

		async load() {
			if (!browser) return;

			const userId = auth.user?.id;
			if (!userId) {
				routines = [];
				return;
			}

			loading = true;

			// Load from local DB first
			try {
				const localRoutines = await getLocalRoutines(userId);
				routines = localRoutines.map((lr) => ({
					...lr,
					id: lr.id || lr.local_id,
					created: '',
					updated: ''
				})) as RoutineTemplate[];
			} catch {
				// IndexedDB may not be available
			}

			// Sync from server
			try {
				const serverRoutines = await getRoutineTemplates();
				routines = serverRoutines;
			} catch {
				// Offline, use local data
			}

			loading = false;
		},

		subscribeToUpdates() {
			if (!browser) return;

			if (unsubscribe) {
				unsubscribe();
			}

			unsubscribe = subscribeToRoutineTemplates((action, record) => {
				switch (action) {
					case 'create':
						if (!routines.some((r) => r.id === record.id)) {
							routines = [...routines, record].sort((a, b) => a.name.localeCompare(b.name));
						}
						break;
					case 'update':
						routines = routines
							.map((r) => (r.id === record.id ? record : r))
							.sort((a, b) => a.name.localeCompare(b.name));
						break;
					case 'delete':
						routines = routines.filter((r) => r.id !== record.id);
						break;
				}
			});
		},

		unsubscribeFromUpdates() {
			if (unsubscribe) {
				unsubscribe();
				unsubscribe = null;
			}
		},

		async create(data: {
			name: string;
			steps: RoutineStep[];
			schedule: RoutineSchedule;
			is_active: boolean;
			color?: string;
			icon?: string;
		}) {
			const userId = auth.user?.id;
			if (!userId) throw new Error('Not authenticated');

			const localRoutine = await createLocalRoutine({
				...data,
				user: userId
			});

			const tempRoutine: RoutineTemplate = {
				...localRoutine,
				id: localRoutine.local_id,
				created: new Date().toISOString(),
				updated: new Date().toISOString()
			} as RoutineTemplate;

			routines = [...routines, tempRoutine].sort((a, b) => a.name.localeCompare(b.name));

			try {
				const serverRoutine = await createRoutineTemplate(data);
				routines = routines
					.map((r) => (r.id === localRoutine.local_id ? serverRoutine : r))
					.sort((a, b) => a.name.localeCompare(b.name));
			} catch {
				// Offline, keep local version
			}

			return tempRoutine;
		},

		async update(id: string, changes: Partial<RoutineTemplate>) {
			const routine = routines.find((r) => r.id === id);
			if (!routine) return;

			const localRecord =
				(await db.routine_templates.where('id').equals(id).first()) ||
				(await db.routine_templates.get(id));
			if (localRecord) {
				await updateLocalRoutine(localRecord.local_id, changes);
			}

			routines = routines
				.map((r) => (r.id === id ? { ...r, ...changes } : r))
				.sort((a, b) => a.name.localeCompare(b.name));

			try {
				const serverRoutine = await updateRoutineTemplate(id, changes);
				routines = routines
					.map((r) => (r.id === id ? serverRoutine : r))
					.sort((a, b) => a.name.localeCompare(b.name));
			} catch {
				// Offline, keep local changes
			}
		},

		async toggleActive(id: string) {
			const routine = routines.find((r) => r.id === id);
			if (!routine) return;
			await this.update(id, { is_active: !routine.is_active });
		},

		async delete(id: string) {
			const routine = routines.find((r) => r.id === id);
			if (!routine) return;

			const localRecord =
				(await db.routine_templates.where('id').equals(id).first()) ||
				(await db.routine_templates.get(id));
			if (localRecord) {
				await deleteLocalRoutine(localRecord.local_id);
			}

			routines = routines.filter((r) => r.id !== id);

			try {
				await deleteRoutineTemplate(id);
			} catch {
				// Offline, deletion will sync later
			}
		}
	};
}

export const routinesStore = createRoutinesStore();
