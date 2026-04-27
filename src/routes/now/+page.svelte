<script lang="ts">
	import { browser } from '$app/environment';
	import { goto } from '$app/navigation';
	import { calendar } from '$stores';
	import { _ } from '$lib/i18n';
	import { Button, EventIcon } from '$components/ui';
	import { format, isSameDay, differenceInMinutes } from 'date-fns';
	import type { DisplayEvent } from '$types';

	let now = $state(new Date());

	$effect(() => {
		if (!browser) return;
		const interval = setInterval(() => (now = new Date()), 30_000);
		return () => clearInterval(interval);
	});

	type NowState =
		| { kind: 'happening'; event: DisplayEvent; minutesLeft: number }
		| { kind: 'next'; event: DisplayEvent; minutesAway: number }
		| { kind: 'idle' };

	const nowState = $derived.by((): NowState => {
		const todays = calendar.displayEvents.filter(
			(e) => !e.is_all_day && isSameDay(e.start, now)
		);

		const happening = todays.find(
			(e) => e.start <= now && e.end && now < e.end
		);
		if (happening && happening.end) {
			return { kind: 'happening', event: happening, minutesLeft: differenceInMinutes(happening.end, now) };
		}

		const futures = todays
			.filter((e) => e.start > now)
			.sort((a, b) => a.start.getTime() - b.start.getTime());
		if (futures.length > 0) {
			return { kind: 'next', event: futures[0], minutesAway: differenceInMinutes(futures[0].start, now) };
		}

		return { kind: 'idle' };
	});

	function formatRelative(min: number): string {
		if (min < 1) return $_('common.now') ?? 'now';
		if (min < 60) return `${min} min`;
		const h = Math.floor(min / 60);
		const m = min % 60;
		return m === 0 ? `${h}h` : `${h}h ${m}m`;
	}

	function handleStart(event: DisplayEvent) {
		if (!event.is_external) goto(`/event/${event.id}`);
	}

	function handleComplete(event: DisplayEvent) {
		if (event.is_task) calendar.toggleTaskComplete(event.id);
	}
</script>

<div class="h-full overflow-y-auto bg-neutral-50 dark:bg-neutral-900">
	<div class="max-w-2xl mx-auto px-4 py-8 flex flex-col items-center justify-center min-h-full">
		{#if nowState.kind === 'happening'}
			<div class="w-full text-center">
				<p class="text-xs uppercase tracking-widest text-primary-600 dark:text-primary-400 mb-2 font-semibold">
					{$_('now.happeningNow')}
				</p>
				<div
					class="inline-flex items-center gap-2 mb-4 px-3 py-1 rounded-full bg-primary-50 dark:bg-primary-900/30"
				>
					<span class="w-2 h-2 rounded-full bg-primary-500 animate-pulse"></span>
					<span class="text-sm text-primary-700 dark:text-primary-300 font-medium">
						{formatRelative(nowState.minutesLeft)} {$_('now.left')}
					</span>
				</div>

				<div
					class="w-full rounded-2xl shadow-sm border border-neutral-100 dark:border-neutral-700 p-8 mb-6"
					style:background-color={nowState.event.color}
				>
					{#if nowState.event.icon}
						<div class="text-5xl mb-3 leading-none">
							<EventIcon icon={nowState.event.icon} size="lg" />
						</div>
					{/if}
					<h1 class="text-3xl md:text-4xl font-semibold text-white drop-shadow-sm break-words">
						{nowState.event.title}
					</h1>
					{#if nowState.event.end}
						<p class="text-white/80 mt-3 text-sm">
							{format(nowState.event.start, 'HH:mm')} – {format(nowState.event.end, 'HH:mm')}
						</p>
					{/if}
				</div>

				<div class="flex flex-col sm:flex-row gap-3 justify-center">
					{#if nowState.event.is_task && !nowState.event.is_completed}
						<Button onclick={() => handleComplete(nowState.event)}>
							✓ {$_('now.markDone')}
						</Button>
					{/if}
					{#if !nowState.event.is_external}
						<Button variant="ghost" onclick={() => handleStart(nowState.event)}>
							{$_('now.openEvent')}
						</Button>
					{/if}
				</div>
			</div>
		{:else if nowState.kind === 'next'}
			<div class="w-full text-center">
				<p class="text-xs uppercase tracking-widest text-neutral-500 dark:text-neutral-400 mb-2 font-semibold">
					{$_('now.upNext')}
				</p>
				<p class="text-2xl md:text-3xl font-medium text-neutral-700 dark:text-neutral-200 mb-6">
					{$_('now.in')} {formatRelative(nowState.minutesAway)}
				</p>

				<div
					class="w-full rounded-2xl shadow-sm border border-neutral-100 dark:border-neutral-700 p-8 mb-6"
					style:background-color={nowState.event.color}
				>
					{#if nowState.event.icon}
						<div class="text-5xl mb-3 leading-none">
							<EventIcon icon={nowState.event.icon} size="lg" />
						</div>
					{/if}
					<h1 class="text-3xl md:text-4xl font-semibold text-white drop-shadow-sm break-words">
						{nowState.event.title}
					</h1>
					<p class="text-white/80 mt-3 text-sm">
						{format(nowState.event.start, 'HH:mm')}
					</p>
				</div>

				<Button variant="ghost" onclick={() => handleStart(nowState.event)}>
					{$_('now.openEvent')}
				</Button>
			</div>
		{:else}
			<div class="text-center">
				<div class="text-6xl mb-4">🌿</div>
				<h1 class="text-2xl font-semibold text-neutral-800 dark:text-neutral-100 mb-2">
					{$_('now.idleTitle')}
				</h1>
				<p class="text-neutral-500 dark:text-neutral-400 mb-6">
					{$_('now.idleDesc')}
				</p>
				<Button variant="ghost" onclick={() => goto('/calendar/day')}>
					{$_('now.viewDay')}
				</Button>
			</div>
		{/if}
	</div>
</div>
