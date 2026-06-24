import { browser } from '$app/environment';
import {
	getCategories,
	createCategory,
	updateCategory,
	deleteCategory,
	subscribeToCategories
} from '$api/pocketbase';
import { auth } from './auth.svelte';
import type { Category } from '$types';

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
			try {
				categories = await getCategories();
			} catch (error) {
				console.error('Failed to load categories:', error);
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

			const serverCategory = await createCategory({ ...data, sort_order: sortOrder });
			if (!categories.some((c) => c.id === serverCategory.id)) {
				categories = [...categories, serverCategory].sort((a, b) => a.sort_order - b.sort_order);
			}
			return serverCategory;
		},

		async update(id: string, changes: Partial<Category>) {
			const serverCategory = await updateCategory(id, changes);
			categories = categories
				.map((c) => (c.id === id ? serverCategory : c))
				.sort((a, b) => a.sort_order - b.sort_order);
		},

		async delete(id: string) {
			await deleteCategory(id);
			categories = categories.filter((c) => c.id !== id);
		},

		async reorder(orderedIds: string[]) {
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
