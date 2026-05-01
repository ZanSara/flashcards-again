<script lang="ts">
	import type { CardRow } from '$lib/database.types';
	import type { NoteForRender } from '$lib/cards/types';
	import CardSurface from '../CardSurface.svelte';

	let {
		card,
		note,
		showAnswer
	}: { card: CardRow; note: NoteForRender; showAnswer: boolean } = $props();

	const isReversed = $derived(card.card_type === 'basic_reversed');
	const front = $derived(isReversed ? note.back ?? '' : note.front);
	const back = $derived(isReversed ? note.front : note.back ?? '');
</script>

{#if !showAnswer}
	<CardSurface extras={note.extras} side="front">
		<p class="text-3xl font-semibold tracking-tight">{front}</p>
	</CardSurface>
{:else}
	<CardSurface extras={note.extras} side="back">
		<p class="text-xl text-slate-500 dark:text-slate-400">{front}</p>
		<p class="text-3xl font-semibold tracking-tight">{back}</p>
	</CardSurface>
{/if}
