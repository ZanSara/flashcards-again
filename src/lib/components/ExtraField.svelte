<script lang="ts">
	import type { ExtraField } from '$lib/database.types';
	let { field, mode = 'block' }: { field: ExtraField; mode?: 'inline' | 'block' | 'subtle' } =
		$props();
</script>

{#if mode === 'subtle'}
	<p class="text-sm italic text-slate-500 dark:text-slate-400" aria-label={field.key}>
		{field.value}
	</p>
{:else if mode === 'inline'}
	<span class="text-sm text-slate-700 dark:text-slate-200">
		<span class="font-medium">{field.key}:</span>
		{field.value}
	</span>
{:else}
	<div class="space-y-0.5">
		<p class="label">{field.key}</p>
		<p class="text-sm text-slate-800 dark:text-slate-200">{field.value}</p>
	</div>
{/if}
