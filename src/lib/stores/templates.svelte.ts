import { browser } from '$app/environment';
import { getTemplates, createTemplate, updateTemplate, deleteTemplate } from '$api/pocketbase';
import {
	db,
	getLocalTemplates,
	createLocalTemplate,
	updateLocalTemplate,
	deleteLocalTemplate
} from '$db';
import { auth } from './auth.svelte';
import type { Template, LocalTemplate, ReminderConfig } from '$types';

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

			// Load from local DB first
			try {
				const localTemplates = await getLocalTemplates(userId);
				templates = localTemplates.map((lt) => ({
					...lt,
					id: lt.id || lt.local_id,
					created: '',
					updated: ''
				})) as Template[];
			} catch {
				// IndexedDB may not be available
			}

			// Sync from server
			try {
				const serverTemplates = await getTemplates();
				templates = serverTemplates;
			} catch {
				// Offline, use local data
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

			// Create locally first
			const localTemplate = await createLocalTemplate({
				...data,
				user: userId
			});

			// Optimistically add
			const tempTemplate: Template = {
				...localTemplate,
				id: localTemplate.local_id,
				created: new Date().toISOString(),
				updated: new Date().toISOString()
			} as Template;

			templates = [...templates, tempTemplate].sort((a, b) => a.name.localeCompare(b.name));

			// Try to sync to server
			try {
				const serverTemplate = await createTemplate(data);
				templates = templates
					.map((t) => (t.id === localTemplate.local_id ? serverTemplate : t))
					.sort((a, b) => a.name.localeCompare(b.name));
			} catch {
				// Offline, keep local version
			}

			return tempTemplate;
		},

		async update(id: string, changes: Partial<Template>) {
			const template = templates.find((t) => t.id === id);
			if (!template) return;

			const localRecord = await db.templates.where('id').equals(id).first()
				|| await db.templates.get(id);
			if (localRecord) {
				await updateLocalTemplate(localRecord.local_id, changes);
			}

			// Optimistically update
			templates = templates
				.map((t) => (t.id === id ? { ...t, ...changes } : t))
				.sort((a, b) => a.name.localeCompare(b.name));

			// Try to sync to server
			try {
				const serverTemplate = await updateTemplate(id, changes);
				templates = templates
					.map((t) => (t.id === id ? serverTemplate : t))
					.sort((a, b) => a.name.localeCompare(b.name));
			} catch {
				// Offline, keep local changes
			}
		},

		async delete(id: string) {
			const template = templates.find((t) => t.id === id);
			if (!template) return;

			const localRecord = await db.templates.where('id').equals(id).first()
				|| await db.templates.get(id);
			if (localRecord) {
				await deleteLocalTemplate(localRecord.local_id);
			}

			// Optimistically remove
			templates = templates.filter((t) => t.id !== id);

			// Try to sync to server
			try {
				await deleteTemplate(id);
			} catch {
				// Offline, deletion will sync later
			}
		}
	};
}

export const templatesStore = createTemplatesStore();
