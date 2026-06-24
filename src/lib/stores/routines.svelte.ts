import { browser } from '$app/environment';
import {
	getRoutineTemplates,
	createRoutineTemplate,
	updateRoutineTemplate,
	deleteRoutineTemplate,
	subscribeToRoutineTemplates
} from '$api/pocketbase';
import { auth } from './auth.svelte';
import type { RoutineTemplate, RoutineStep, RoutineSchedule } from '$types';

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
			try {
				routines = await getRoutineTemplates();
			} catch (error) {
				console.error('Failed to load routines:', error);
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
			target_end_time?: string;
		}) {
			const userId = auth.user?.id;
			if (!userId) throw new Error('Not authenticated');

			const serverRoutine = await createRoutineTemplate(data);
			if (!routines.some((r) => r.id === serverRoutine.id)) {
				routines = [...routines, serverRoutine].sort((a, b) => a.name.localeCompare(b.name));
			}
			return serverRoutine;
		},

		async update(id: string, changes: Partial<RoutineTemplate>) {
			const serverRoutine = await updateRoutineTemplate(id, changes);
			routines = routines
				.map((r) => (r.id === id ? serverRoutine : r))
				.sort((a, b) => a.name.localeCompare(b.name));
		},

		async toggleActive(id: string) {
			const routine = routines.find((r) => r.id === id);
			if (!routine) return;
			await this.update(id, { is_active: !routine.is_active });
		},

		async delete(id: string) {
			await deleteRoutineTemplate(id);
			routines = routines.filter((r) => r.id !== id);
		}
	};
}

export const routinesStore = createRoutinesStore();
