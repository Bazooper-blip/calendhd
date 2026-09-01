<script lang="ts">
	import { t } from 'svelte-i18n';
	import { addMonths, format } from 'date-fns';
	import { Input, Select } from '$components/ui';
	import { RECURRENCE_PRESETS } from '$utils';
	import type { RecurrenceRule } from '$types';

	interface Props {
		/** The rule being edited; undefined = does not repeat. */
		value: RecurrenceRule | undefined;
		/** yyyy-MM-dd; anchors the default "ends on" date (one month later). */
		startDate?: string;
		id?: string;
	}

	let { value = $bindable(), startDate, id = 'recurrence' }: Props = $props();

	type EndMode = 'never' | 'on' | 'after';

	// Everything on screen derives from `value` — picking an end mode writes a
	// sensible default into the rule right away, so there's no separate
	// in-progress state to keep in sync when the parent swaps the rule (e.g.
	// applying a template).
	const frequency = $derived(value?.frequency ?? 'none');
	const endMode = $derived<EndMode>(value?.end_date ? 'on' : value?.count ? 'after' : 'never');

	const presetOptions = $derived(
		RECURRENCE_PRESETS.map((p) => ({
			value: p.value?.frequency ?? 'none',
			label: $t(p.i18nKey)
		}))
	);

	const endOptions = $derived([
		{ value: 'never', label: $t('recurrence.endsNever') },
		{ value: 'on', label: $t('recurrence.endsOn') },
		{ value: 'after', label: $t('recurrence.endsAfter') }
	]);

	function defaultEndDate(): string {
		const base = startDate ? new Date(`${startDate}T00:00:00`) : new Date();
		return format(addMonths(Number.isNaN(base.getTime()) ? new Date() : base, 1), 'yyyy-MM-dd');
	}

	function withoutEnd(rule: RecurrenceRule): RecurrenceRule {
		const { end_date: _endDate, count: _count, ...rest } = rule;
		return rest;
	}

	function setFrequency(freq: string) {
		const preset = RECURRENCE_PRESETS.find((p) => (p.value?.frequency ?? 'none') === freq);
		if (!preset?.value) {
			value = undefined;
			return;
		}
		// Switching frequency keeps the end settings
		const next: RecurrenceRule = { ...preset.value };
		if (value?.end_date) next.end_date = value.end_date;
		if (value?.count) next.count = value.count;
		value = next;
	}

	function setEndMode(mode: EndMode) {
		if (!value) return;
		const base = withoutEnd(value);
		if (mode === 'on') value = { ...base, end_date: defaultEndDate() };
		else if (mode === 'after') value = { ...base, count: 10 };
		else value = base;
	}

	function setEndDate(dateStr: string) {
		if (!value) return;
		// Clearing the date falls back to "never" (the derived mode follows)
		value = dateStr ? { ...withoutEnd(value), end_date: dateStr } : withoutEnd(value);
	}

	function setCount(raw: string) {
		if (!value) return;
		const n = Number.parseInt(raw, 10);
		value = { ...withoutEnd(value), count: Number.isFinite(n) && n > 0 ? n : 1 };
	}
</script>

<div class="space-y-3">
	<Select
		{id}
		options={presetOptions}
		placeholder=""
		value={frequency}
		onchange={(e) => setFrequency((e.target as HTMLSelectElement).value)}
	/>

	{#if value}
		<div class="grid grid-cols-[auto_1fr] items-center gap-x-3 gap-y-2">
			<label for="{id}-ends" class="text-sm text-neutral-600 dark:text-neutral-300">
				{$t('recurrence.ends')}
			</label>
			<Select
				id="{id}-ends"
				options={endOptions}
				placeholder=""
				value={endMode}
				onchange={(e) => setEndMode((e.target as HTMLSelectElement).value as EndMode)}
			/>

			{#if endMode === 'on'}
				<div class="col-start-2">
					<Input
						id="{id}-end-date"
						type="date"
						value={value.end_date ?? ''}
						onchange={(e) => setEndDate((e.target as HTMLInputElement).value)}
					/>
				</div>
			{:else if endMode === 'after'}
				<div class="col-start-2 flex items-center gap-2">
					<Input
						id="{id}-count"
						type="number"
						value={String(value.count ?? 10)}
						onchange={(e) => setCount((e.target as HTMLInputElement).value)}
						class="w-24"
					/>
					<label for="{id}-count" class="text-sm text-neutral-600 dark:text-neutral-300">
						{$t('recurrence.endsAfterTimes')}
					</label>
				</div>
			{/if}
		</div>
	{/if}
</div>
