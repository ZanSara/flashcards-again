<script lang="ts">
	import type { CardRow, ClozeVariant, ExampleSentenceRow } from '$lib/database.types';
	import type { NoteForRender } from '$lib/cards/types';
	import { renderCloze } from '$lib/cards/clozeMarkers';
	import CardSurface from '../CardSurface.svelte';

	let {
		card,
		note,
		example,
		showAnswer
	}: {
		card: CardRow;
		note: NoteForRender;
		example: ExampleSentenceRow | null;
		showAnswer: boolean;
	} = $props();

	const variant = $derived(card.variant as ClozeVariant);
	const sourceText = $derived(
		variant.source === 'example_sentence' ? example?.text ?? '' : note.front
	);
	const fullTranslation = $derived(
		variant.source === 'example_sentence' ? example?.translation ?? '' : note.back ?? ''
	);
	const targetTranslation = $derived(
		variant.source === 'example_sentence' ? example?.target_translation ?? '' : ''
	);
	const hidden = $derived(renderCloze(sourceText, 'hide', variant.cloze_index));
	const revealed = $derived(renderCloze(sourceText, 'reveal'));
</script>

<CardSurface extras={note.extras} side={showAnswer ? 'back' : 'front'}>
	{#if variant.direction === 'recognize'}
		{#if !showAnswer}
			<p class="text-2xl font-semibold leading-relaxed">{hidden}</p>
		{:else}
			<p class="text-2xl font-semibold leading-relaxed">{revealed}</p>
			{#if variant.reveal === 'full_translation' || variant.reveal === 'both'}
				<p class="text-base text-slate-600 dark:text-slate-400">{fullTranslation}</p>
			{/if}
			{#if (variant.reveal === 'target_translation_only' || variant.reveal === 'both') && targetTranslation}
				<p class="text-sm text-slate-500 dark:text-slate-400">
					<span class="font-medium">target:</span> {targetTranslation}
				</p>
			{/if}
		{/if}
	{:else}
		<!-- produce direction: show native translation as prompt + scaffold -->
		{#if !showAnswer}
			<p class="text-base text-slate-600 dark:text-slate-400">{fullTranslation}</p>
			<p class="text-2xl font-semibold leading-relaxed">{hidden}</p>
		{:else}
			<p class="text-base text-slate-600 dark:text-slate-400">{fullTranslation}</p>
			<p class="text-2xl font-semibold leading-relaxed">{revealed}</p>
		{/if}
	{/if}
</CardSurface>
