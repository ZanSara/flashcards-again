<script lang="ts">
	import type {
		ExtraDisplayHint,
		ExtraField,
		ExtraType,
		ExtraVisibility
	} from '$lib/database.types';

	let { extras = $bindable([]) }: { extras?: ExtraField[] } = $props();

	const VISIBILITIES: ExtraVisibility[] = ['front', 'back', 'both', 'manual', 'hidden'];
	const TYPES: ExtraType[] = ['text', 'ipa', 'audio_ref', 'translation', 'example', 'note'];
	const HINTS: ExtraDisplayHint[] = ['inline', 'block', 'badge', 'subtle'];

	function add() {
		extras = [
			...extras,
			{
				key: '',
				value: '',
				type: 'text',
				visibility: 'back',
				display_hint: 'inline'
			}
		];
	}

	function remove(i: number) {
		extras = extras.filter((_, idx) => idx !== i);
	}
</script>

<div class="space-y-3">
	{#each extras as field, i (i)}
		<div class="grid items-end gap-2 sm:grid-cols-[1fr_2fr_8rem_8rem_8rem_auto]">
			<label class="space-y-1">
				<span class="label">Key</span>
				<input
					class="input"
					bind:value={field.key}
					placeholder="e.g. front_language"
					aria-label="Key"
				/>
			</label>
			<label class="space-y-1">
				<span class="label">Value</span>
				<input class="input" bind:value={field.value} placeholder="value" aria-label="Value" />
			</label>
			<label class="space-y-1">
				<span class="label">Type</span>
				<select class="input" bind:value={field.type} aria-label="Type">
					{#each TYPES as t (t)}<option value={t}>{t}</option>{/each}
				</select>
			</label>
			<label class="space-y-1">
				<span class="label">Visibility</span>
				<select class="input" bind:value={field.visibility} aria-label="Visibility">
					{#each VISIBILITIES as v (v)}<option value={v}>{v}</option>{/each}
				</select>
			</label>
			<label class="space-y-1">
				<span class="label">Display</span>
				<select class="input" bind:value={field.display_hint} aria-label="Display hint">
					{#each HINTS as h (h)}<option value={h}>{h}</option>{/each}
				</select>
			</label>
			<button
				type="button"
				class="btn-ghost text-rose-600 hover:bg-rose-100 dark:text-rose-400 dark:hover:bg-rose-900/40"
				aria-label="Remove field"
				onclick={() => remove(i)}
			>
				✕
			</button>
		</div>
	{/each}

	<button type="button" class="btn-secondary" onclick={add} aria-label="Add field">
		+ Add field
	</button>
</div>
