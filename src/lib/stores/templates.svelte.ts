import { browser } from '$app/environment';
import { getTemplates, createTemplate, updateTemplate, deleteTemplate } from '$api/pocketbase';
import { auth } from './auth.svelte';
import type { Template, ReminderConfig } from '$types';

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
			default_reminders: ReminderConfig[];
			description?: string;
			color_override?: string;
		}) {
			const userId = auth.user?.id;
			if (!userId) throw new Error('Not authenticated');

			const serverTemplate = await createTemplate(data);
			templates = [...templates, serverTemplate].sort((a, b) => a.name.localeCompare(b.name));
			return serverTemplate;
		},

		async update(id: string, changes: Partial<Template>) {
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
