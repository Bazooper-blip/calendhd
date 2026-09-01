import { createTemplate, deleteTemplate, getTemplates, updateTemplate } from '$api/pocketbase';
import { browser } from '$app/environment';
import type { RecurrenceRule, ReminderConfig, Template } from '$types';
import { auth } from './auth.svelte';

// Templates store using Svelte 5 runes
function createTemplatesStore() {
	let templates = $state<Template[]>([]);
	let loading = $state(false);

	return {
		get templates() {
			return templates;
		},
		get loading() {
			return loading;
		},

		getById(id: string): Template | undefined {
			return templates.find((t) => t.id === id);
		},

		getByCategory(categoryId: string): Template[] {
			return templates.filter((t) => t.category === categoryId);
		},

		async load() {
			if (!browser) return;

			const userId = auth.user?.id;
			if (!userId) {
				templates = [];
				return;
			}

			loading = true;
			try {
				templates = await getTemplates();
			} catch (error) {
				console.error('Failed to load templates:', error);
			}
			loading = false;
		},

		async create(data: {
			name: string;
			category?: string;
			default_duration_minutes: number;
			default_is_all_day: boolean;
			default_start_time?: string;
			default_end_time?: string;
			default_reminders: ReminderConfig[];
			description?: string;
			color_override?: string;
			recurrence_rule?: RecurrenceRule;
		}) {
			const userId = auth.user?.id;
			if (!userId) throw new Error('Not authenticated');

			const serverTemplate = await createTemplate(data);
			templates = [...templates, serverTemplate].sort((a, b) => a.name.localeCompare(b.name));
			return serverTemplate;
		},

		async update(
			id: string,
			changes: Partial<Omit<Template, 'recurrence_rule'>> & { recurrence_rule?: RecurrenceRule | null }
		) {
			const serverTemplate = await updateTemplate(id, changes);
			templates = templates
				.map((t) => (t.id === id ? serverTemplate : t))
				.sort((a, b) => a.name.localeCompare(b.name));
		},

		async delete(id: string) {
			await deleteTemplate(id);
			templates = templates.filter((t) => t.id !== id);
		}
	};
}

export const templatesStore = createTemplatesStore();
