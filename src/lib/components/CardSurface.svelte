<script lang="ts">
	import type { ExtraField } from '$lib/database.types';
	import { groupByHint, type Side } from '$lib/cards/visibility';
	import ExtraBadge from './ExtraBadge.svelte';
	import ExtraFieldView from './ExtraField.svelte';
	import ManualReveal from './ManualReveal.svelte';
	import type { Snippet } from 'svelte';

	let {
		extras,
		side,
		children
	}: { extras: ExtraField[]; side: Side; children: Snippet } = $props();

	const groups = $derived(groupByHint(extras, side));
</script>

<div class="card relative min-h-48">
	{#each groups.badgeFront as f (f.key)}
		<ExtraBadge field={f} position="left" />
	{/each}
	{#each groups.badgeBack as f (f.key)}
		<ExtraBadge field={f} position="right" />
	{/each}

	<div class="space-y-4 pt-6">
		{@render children()}

		{#if groups.inline.length || groups.block.length || groups.subtle.length || groups.manual.length}
			<div class="space-y-3 border-t border-slate-200 pt-3 dark:border-slate-800">
				{#if groups.block.length}
					<div class="grid gap-3 sm:grid-cols-2">
						{#each groups.block as f (f.key)}
							<ExtraFieldView field={f} mode="block" />
						{/each}
					</div>
				{/if}
				{#if groups.inline.length}
					<div class="flex flex-wrap gap-x-4 gap-y-2">
						{#each groups.inline as f (f.key)}
							<ExtraFieldView field={f} mode="inline" />
						{/each}
					</div>
				{/if}
				{#if groups.subtle.length}
					<div class="space-y-1">
						{#each groups.subtle as f (f.key)}
							<ExtraFieldView field={f} mode="subtle" />
						{/each}
					</div>
				{/if}
				{#if side === 'back' && groups.manual.length}
					<div class="flex flex-wrap gap-2">
						{#each groups.manual as f (f.key)}
							<ManualReveal field={f} />
						{/each}
					</div>
				{/if}
			</div>
		{/if}
	</div>
</div>
