<script lang="ts">
	import { goto } from '$app/navigation';
	import { untrack } from 'svelte';
	import FilterBar from '$lib/components/FilterBar.svelte';
	import type { NoteStatus, CardType } from '$lib/database.types';
	import { enhance } from '$app/forms';

	let { data } = $props();

	// Filter inputs are local UI state seeded from URL on first render.
	let q = $state(untrack(() => data.filters.q));
	let tag = $state(untrack(() => data.filters.tag));
	let status = $state(untrack(() => data.filters.status as NoteStatus | ''));
	let cardType = $state(untrack(() => data.filters.cardType as CardType | ''));
	let dueBefore = $state(untrack(() => data.filters.dueBefore));

	function applyFilters() {
		const params = new globalThis.URLSearchParams();
		if (q) params.set('q', q);
		if (tag) params.set('tag', tag);
		if (status) params.set('status', status);
		if (cardType) params.set('card_type', cardType);
		if (dueBefore) params.set('due_before', dueBefore);
		void goto(`/cards?${params.toString()}`, { keepFocus: true, noScroll: true });
	}
</script>

<svelte:head>
	<title>Cards · flashcards-again</title>
</svelte:head>

<section class="space-y-4">
	<header class="flex items-center justify-between">
		<h1 class="text-2xl font-semibold tracking-tight">Cards</h1>
	</header>

	<FilterBar
		bind:query={q}
		bind:tag
		bind:status
		bind:cardType
		bind:dueBefore
		availableTags={data.availableTags}
	/>
	<div class="flex justify-end">
		<button type="button" class="btn-secondary" onclick={applyFilters} aria-label="Apply filters">
			Apply filters
		</button>
	</div>

	<form
		method="post"
		action="?/createQuick"
		use:enhance
		class="card grid gap-3 sm:grid-cols-[2fr_2fr_auto]"
	>
		<label class="space-y-1">
			<span class="label">Front (new note)</span>
			<input
				name="front"
				class="input"
				required
				placeholder="word, phrase, or sentence"
				aria-label="Front of new note"
			/>
		</label>
		<label class="space-y-1">
			<span class="label">Back</span>
			<input name="back" class="input" placeholder="meaning / translation" aria-label="Back" />
		</label>
		<button type="submit" class="btn-primary self-end" aria-label="Create note">Create</button>
	</form>

	<ul class="space-y-2">
		{#each data.notes as note (note.id)}
			<li class="card flex items-start justify-between gap-4">
				<a href={`/cards/${note.id}`} class="block flex-1 space-y-1">
					<p class="text-base font-medium">{note.front}</p>
					{#if note.back}
						<p class="text-sm text-slate-500 dark:text-slate-400">{note.back}</p>
					{/if}
					<div class="flex flex-wrap gap-1.5">
						<span class="badge">{note.note_kind}</span>
						<span class="badge">{note.status}</span>
						{#each note.tags as t (t)}
							<span class="badge">#{t}</span>
						{/each}
					</div>
				</a>
				<form method="post" action="?/delete" use:enhance>
					<input type="hidden" name="id" value={note.id} />
					<button
						type="submit"
						class="btn-ghost text-rose-600 dark:text-rose-400"
						aria-label="Delete {note.front}"
					>
						Delete
					</button>
				</form>
			</li>
		{:else}
			<li class="card text-center text-sm text-slate-500 dark:text-slate-400">
				No notes match. Try clearing filters or creating a new one above.
			</li>
		{/each}
	</ul>
</section>
