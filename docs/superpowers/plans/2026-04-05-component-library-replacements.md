# Component Library Replacements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace custom Modal with bits-ui Dialog, remove Toast wrapper in favor of direct svelte-sonner usage, and delete unused EmojiPicker component.

**Architecture:** Modal.svelte keeps its external API (bind:open, title, size, children/footer snippets) but rewires internals to bits-ui Dialog for proper focus trapping and accessibility. Toast wrapper is removed entirely — all call sites switch to `toast.success()`/`toast.error()` from svelte-sonner. EmojiPicker is deleted (zero consumers).

**Tech Stack:** bits-ui (^2.17), svelte-sonner (^1.1, already installed), Svelte 5, Tailwind CSS 4

---

### Task 1: Install bits-ui

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Install bits-ui**

```bash
npm install bits-ui
```

- [ ] **Step 2: Verify install**

```bash
npm ls bits-ui
```

Expected: bits-ui@2.x listed

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: add bits-ui dependency"
```

---

### Task 2: Replace Modal internals with bits-ui Dialog

**Files:**
- Modify: `src/lib/components/ui/Modal.svelte`

The external API stays identical: `bind:open`, `title`, `size`, `onclose`, `children`, `footer` snippets. All 5 consumers remain unchanged.

- [ ] **Step 1: Rewrite Modal.svelte**

Replace the entire file with:

```svelte
<script lang="ts">
	import { Dialog } from 'bits-ui';

	interface Props {
		open?: boolean;
		title?: string;
		size?: 'sm' | 'md' | 'lg' | 'full';
		onclose?: () => void;
		children?: import('svelte').Snippet;
		footer?: import('svelte').Snippet;
	}

	let {
		open = $bindable(false),
		title = '',
		size = 'md',
		onclose,
		children,
		footer
	}: Props = $props();

	const sizes: Record<string, string> = {
		sm: 'max-w-sm',
		md: 'max-w-lg',
		lg: 'max-w-2xl',
		full: 'max-w-full mx-4'
	};

	function handleOpenChange(isOpen: boolean) {
		open = isOpen;
		if (!isOpen) {
			onclose?.();
		}
	}
</script>

<Dialog.Root bind:open onOpenChange={handleOpenChange}>
	<Dialog.Portal>
		<Dialog.Overlay
			class="fixed inset-0 z-50 bg-black/30 backdrop-blur-sm"
		/>
		<Dialog.Content
			class="fixed inset-0 z-50 flex items-center justify-center p-4"
			onInteractOutside={(e) => {
				handleOpenChange(false);
			}}
		>
			<div
				class={`w-full max-h-[90vh] overflow-y-auto bg-white dark:bg-neutral-800 rounded-xl shadow-lg ${sizes[size]}`}
			>
				{#if title}
					<div class="flex items-center justify-between px-6 py-4 border-b border-neutral-100 dark:border-neutral-700">
						<Dialog.Title class="text-lg font-semibold text-neutral-800 dark:text-neutral-100">{title}</Dialog.Title>
						<Dialog.Close
							class="p-1 rounded-lg text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-700 transition-colors"
						>
							<svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
								<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
							</svg>
						</Dialog.Close>
					</div>
				{/if}

				<div class="px-6 py-4">
					{@render children?.()}
				</div>

				{#if footer}
					<div class="flex items-center justify-end gap-3 px-6 py-4 border-t border-neutral-100 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800/50">
						{@render footer()}
					</div>
				{/if}
			</div>
		</Dialog.Content>
	</Dialog.Portal>
</Dialog.Root>
```

- [ ] **Step 2: Verify build**

```bash
npm run check
```

Expected: No type errors

- [ ] **Step 3: Manual smoke test**

```bash
npm run dev
```

Open categories page, click "Add Category" — modal should open with focus trap, close on Escape, close on backdrop click.

- [ ] **Step 4: Commit**

```bash
git add src/lib/components/ui/Modal.svelte
git commit -m "refactor: replace custom Modal with bits-ui Dialog"
```

---

### Task 3: Remove Toast wrapper, use svelte-sonner directly

**Files:**
- Delete: `src/lib/components/ui/Toast.svelte`
- Modify: `src/lib/components/ui/index.ts`
- Modify: `src/routes/+layout.svelte`
- Modify: `src/routes/categories/+page.svelte`
- Modify: `src/routes/templates/+page.svelte`
- Modify: `src/routes/subscriptions/+page.svelte`
- Modify: `src/routes/settings/+page.svelte`
- Modify: `src/routes/event/new/+page.svelte`
- Modify: `src/routes/event/[id]/+page.svelte`
- Modify: `src/lib/components/event/QuickAdd.svelte`

The wrapper maps `toast(msg, 'success')` → `sonnerToast.success(msg)`. We switch all call sites to use svelte-sonner's `toast.success(msg)` / `toast.error(msg)` / `toast.warning(msg)` / `toast.info(msg)` directly.

- [ ] **Step 1: Update +layout.svelte**

Replace:
```svelte
import { Toast, OfflineIndicator } from '$components/ui';
```
With:
```svelte
import { OfflineIndicator } from '$components/ui';
import { Toaster } from 'svelte-sonner';
```

Replace:
```svelte
<Toast />
```
With:
```svelte
<Toaster
	position="bottom-right"
	richColors
	closeButton
	toastOptions={{
		duration: 4000
	}}
/>
```

- [ ] **Step 2: Update all toast call sites (7 files)**

In each of these files, replace:
```typescript
import { toast } from '$components/ui/Toast.svelte';
```
With:
```typescript
import { toast } from 'svelte-sonner';
```

Then replace all `toast(message, 'success')` calls with `toast.success(message)`, `toast(message, 'error')` with `toast.error(message)`, `toast(message, 'warning')` with `toast.warning(message)`, `toast(message, 'info')` with `toast.info(message)`.

Files to update:
1. `src/routes/categories/+page.svelte`
2. `src/routes/templates/+page.svelte`
3. `src/routes/subscriptions/+page.svelte`
4. `src/routes/settings/+page.svelte`
5. `src/routes/event/new/+page.svelte`
6. `src/routes/event/[id]/+page.svelte`
7. `src/lib/components/event/QuickAdd.svelte`

- [ ] **Step 3: Update barrel exports**

In `src/lib/components/ui/index.ts`, remove:
```typescript
export { default as Toast, toast, removeToast, clearToasts } from './Toast.svelte';
```

- [ ] **Step 4: Delete Toast.svelte**

```bash
rm src/lib/components/ui/Toast.svelte
```

- [ ] **Step 5: Verify build**

```bash
npm run check
```

Expected: No type errors, no missing imports

- [ ] **Step 6: Commit**

```bash
git add -u
git commit -m "refactor: remove Toast wrapper, use svelte-sonner directly"
```

---

### Task 4: Delete unused EmojiPicker component

**Files:**
- Delete: `src/lib/components/ui/EmojiPicker.svelte`
- Modify: `src/lib/components/ui/index.ts`

- [ ] **Step 1: Remove barrel export**

In `src/lib/components/ui/index.ts`, remove:
```typescript
export { default as EmojiPicker } from './EmojiPicker.svelte';
```

- [ ] **Step 2: Delete EmojiPicker.svelte**

```bash
rm src/lib/components/ui/EmojiPicker.svelte
```

- [ ] **Step 3: Verify no imports remain**

```bash
grep -r "EmojiPicker" src/ --include="*.svelte" --include="*.ts"
```

Expected: No results

- [ ] **Step 4: Verify build**

```bash
npm run check
```

- [ ] **Step 5: Commit**

```bash
git add -u
git commit -m "chore: remove unused EmojiPicker component"
```

---

### Task 5: Final verification

- [ ] **Step 1: Run full check**

```bash
npm run check
```

- [ ] **Step 2: Run tests**

```bash
npm run test -- --run
```

- [ ] **Step 3: Run build**

```bash
npm run build
```

All three must pass cleanly.
