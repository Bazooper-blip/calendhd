import { browser } from '$app/environment';
import {
	getCategories,
	createCategory,
	updateCategory,
	deleteCategory,
	subscribeToCategories
} from '$api/pocketbase';
import {
	getLocalCategories,
	createLocalCategory,
	updateLocalCategory,
	deleteLocalCategory
} from '$db';
import { auth } from './auth.svelte';
import type { Category, LocalCategory } from '$types';

// Categories store using Svelte 5 runes
function createCategoriesStore() {
	let categories = $state<Category[]>([]);
	let loading = $state(false);

	let unsubscribe: (() => void) | null = null;

	// Default category colors
	const defaultColors = [
		'#7BA7BC', // blue
		'#7C9885', // green
		'#9A88B5', // purple
		'#E8A383', // orange
		'#D4A5A5', // pink
		'#D4C97A', // yellow
		'#7ABCB4', // teal
		'#C9898A' // red
	];

	return {
		get categories() {
			return categories;
		},
		get loading() {
			return loading;
		},

		getById(id: string): Category | undefined {
			return categories.find((c) => c.id === id);
		},

		getColor(categoryId?: string): string {
			if (!categoryId) return '#7C9885'; // default sage green
			const category = this.getById(categoryId);
			return category?.color || '#7C9885';
		},

		getNextColor(): string {
			const usedColors = categories.map((c) => c.color);
			const availableColor = defaultColors.find((c) => !usedColors.includes(c));
			return availableColor || defaultColors[categories.length % defaultColors.length];
		},

		async load() {
			if (!browser) return;

			const userId = auth.user?.id;
			if (!userId) {
				categories = [];
				return;
			}

			loading = true;

			// Load from local DB first
			try {
				const localCategories = await getLocalCategories(userId);
				categories = localCategories.map((lc) => ({
					...lc,
					id: lc.id || lc.local_id,
					created: '',
					updated: ''
				})) as Category[];
			} catch {
				// IndexedDB may not be available
			}

			// Sync from server
			try {
				const serverCategories = await getCategories();
				categories = serverCategories;
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

			unsubscribe = subscribeToCategories((action, record) => {
				switch (action) {
					case 'create':
						// Only add if not already present (avoid duplicate from optimistic update)
						if (!categories.some((c) => c.id === record.id)) {
							categories = [...categories, record].sort((a, b) => a.sort_order - b.sort_order);
						}
						break;
					case 'update':
						categories = categories
							.map((c) => (c.id === record.id ? record : c))
							.sort((a, b) => a.sort_order - b.sort_order);
						break;
					case 'delete':
						categories = categories.filter((c) => c.id !== record.id);
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

		async create(data: { name: string; color: string; icon?: string }) {
			const userId = auth.user?.id;
			if (!userId) throw new Error('Not authenticated');

			const sortOrder =
				categories.length > 0 ? Math.max(...categories.map((c) => c.sort_order)) + 1 : 0;

			// Create locally first
			const localCategory = await createLocalCategory({
				...data,
				user: userId,
				sort_order: sortOrder
			});

			// Optimistically add
			const tempCategory: Category = {
				...localCategory,
				id: localCategory.local_id,
				created: new Date().toISOString(),
				updated: new Date().toISOString()
			} as Category;

			categories = [...categories, tempCategory].sort((a, b) => a.sort_order - b.sort_order);

			// Try to sync to server
			try {
				const serverCategory = await createCategory({
					...data,
					sort_order: sortOrder
				});
				// Replace temp category with server data, also remove any duplicate from realtime subscription
				categories = [
					...categories.filter((c) => c.id !== localCategory.local_id && c.id !== serverCategory.id),
					serverCategory
				].sort((a, b) => a.sort_order - b.sort_order);
			} catch {
				// Offline, keep local version
			}

			return tempCategory;
		},

		async update(id: string, changes: Partial<Category>) {
			// Find local_id if this is a server id
			const category = categories.find((c) => c.id === id);
			if (!category) return;

			// Update locally
			const localId = (category as any).local_id || id;
			await updateLocalCategory(localId, changes);

			// Optimistically update
			categories = categories
				.map((c) => (c.id === id ? { ...c, ...changes } : c))
				.sort((a, b) => a.sort_order - b.sort_order);

			// Try to sync to server
			try {
				const serverCategory = await updateCategory(id, changes);
				categories = categories
					.map((c) => (c.id === id ? serverCategory : c))
					.sort((a, b) => a.sort_order - b.sort_order);
			} catch {
				// Offline, keep local changes
			}
		},

		async delete(id: string) {
			const category = categories.find((c) => c.id === id);
			if (!category) return;

			const localId = (category as any).local_id || id;
			await deleteLocalCategory(localId);

			// Optimistically remove
			categories = categories.filter((c) => c.id !== id);

			// Try to sync to server
			try {
				await deleteCategory(id);
			} catch {
				// Offline, deletion will sync later
			}
		},

		async reorder(orderedIds: string[]) {
			// Update sort orders locally
			const updates = orderedIds.map((id, index) => ({
				id,
				sort_order: index
			}));

			for (const update of updates) {
				await this.update(update.id, { sort_order: update.sort_order });
			}
		}
	};
}

export const categoriesStore = createCategoriesStore();
