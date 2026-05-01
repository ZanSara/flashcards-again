<script lang="ts">
	import type { CardType, NoteStatus } from '$lib/database.types';

	let {
		query = $bindable(''),
		tag = $bindable(''),
		status = $bindable('active' as NoteStatus | ''),
		cardType = $bindable('' as CardType | ''),
		dueBefore = $bindable(''),
		availableTags = []
	}: {
		query?: string;
		tag?: string;
		status?: NoteStatus | '';
		cardType?: CardType | '';
		dueBefore?: string;
		availableTags?: string[];
	} = $props();
</script>

<div class="card grid gap-3 sm:grid-cols-5">
	<label class="space-y-1 sm:col-span-2">
		<span class="label">Search</span>
		<input
			type="search"
			class="input"
			placeholder="front, back, extras…"
			bind:value={query}
			aria-label="Search notes"
		/>
	</label>
	<label class="space-y-1">
		<span class="label">Tag</span>
		<select class="input" bind:value={tag} aria-label="Filter by tag">
			<option value="">all</option>
			{#each availableTags as t (t)}
				<option value={t}>{t}</option>
			{/each}
		</select>
	</label>
	<label class="space-y-1">
		<span class="label">Status</span>
		<select class="input" bind:value={status} aria-label="Filter by status">
			<option value="">all</option>
			<option value="active">active</option>
			<option value="pending">pending</option>
			<option value="archived">archived</option>
		</select>
	</label>
	<label class="space-y-1">
		<span class="label">Card type</span>
		<select class="input" bind:value={cardType} aria-label="Filter by card type">
			<option value="">all</option>
			<option value="basic">basic</option>
			<option value="basic_reversed">basic_reversed</option>
			<option value="cloze">cloze</option>
			<option value="audio_recognition">audio_recognition</option>
			<option value="audio_choice">audio_choice</option>
			<option value="pronunciation">pronunciation</option>
		</select>
	</label>
	<label class="space-y-1">
		<span class="label">Due before</span>
		<input type="date" class="input" bind:value={dueBefore} aria-label="Due before date" />
	</label>
</div>
