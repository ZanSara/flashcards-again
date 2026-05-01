<script lang="ts">
	import { onMount } from 'svelte';
	import type { AudioVariant, CardRow, ExampleSentenceRow } from '$lib/database.types';
	import type { NoteForRender } from '$lib/cards/types';
	import { renderCloze } from '$lib/cards/clozeMarkers';
	import CardSurface from '../CardSurface.svelte';

	let {
		card,
		note,
		example,
		showAnswer,
		audioUrl,
		onPlay
	}: {
		card: CardRow;
		note: NoteForRender;
		example: ExampleSentenceRow | null;
		showAnswer: boolean;
		audioUrl: string | null;
		onPlay?: () => void;
	} = $props();

	const variant = $derived(card.variant as AudioVariant);
	const promptText = $derived(
		variant.source === 'example_sentence'
			? renderCloze(example?.text ?? '', 'reveal')
			: note.front
	);
	const meaning = $derived(
		variant.source === 'example_sentence' ? example?.translation ?? '' : note.back ?? ''
	);
	const isMultipleChoice = $derived(card.card_type === 'audio_choice');

	let answer = $state('');
	let choices = $state<string[]>([]);
	let chosen = $state<string | null>(null);

	onMount(async () => {
		if (!isMultipleChoice) return;
		try {
			const params = new globalThis.URLSearchParams({ text: promptText });
			const res = await fetch(`/api/distractors?${params.toString()}`);
			const j = (await res.json()) as { distractors?: string[] };
			const all = [promptText, ...(j.distractors ?? [])].slice(0, 4);
			choices = all
				.map((c) => ({ c, key: Math.random() }))
				.sort((a, b) => a.key - b.key)
				.map((p) => p.c);
		} catch {
			choices = [promptText];
		}
	});

	let audioEl: HTMLAudioElement | null = $state(null);

	function handlePlay() {
		audioEl?.play().catch(() => {});
		onPlay?.();
	}
</script>

<CardSurface extras={note.extras} side={showAnswer ? 'back' : 'front'}>
	<div class="flex items-center justify-between gap-2">
		<p class="label">Listen and {isMultipleChoice ? 'choose' : 'type'}</p>
		<button
			type="button"
			class="btn-secondary"
			disabled={!audioUrl}
			onclick={handlePlay}
			aria-label="Play audio"
		>
			Play
		</button>
	</div>

	{#if audioUrl}
		<audio bind:this={audioEl} src={audioUrl} preload="auto" class="hidden"></audio>
	{/if}

	{#if !showAnswer}
		{#if isMultipleChoice}
			<div class="grid grid-cols-1 gap-2 sm:grid-cols-2">
				{#each choices as c (c)}
					<button
						type="button"
						class="btn-secondary justify-start"
						aria-pressed={chosen === c}
						onclick={() => (chosen = c)}
					>
						<span class="font-mono">{c}</span>
					</button>
				{/each}
			</div>
		{:else}
			<input
				type="text"
				class="input"
				placeholder="What did you hear?"
				bind:value={answer}
				aria-label="Your transcription"
			/>
		{/if}
	{:else}
		<div class="space-y-2">
			<p class="text-2xl font-semibold leading-relaxed">{promptText}</p>
			{#if isMultipleChoice && chosen}
				<p
					class="text-sm {chosen === promptText
						? 'text-emerald-600 dark:text-emerald-400'
						: 'text-rose-600 dark:text-rose-400'}"
				>
					You chose: <span class="font-mono">{chosen}</span>
				</p>
			{:else if !isMultipleChoice && answer}
				<p class="text-sm text-slate-500 dark:text-slate-400">
					You wrote: <span class="font-mono">{answer}</span>
				</p>
			{/if}
			{#if meaning}
				<p class="text-base text-slate-600 dark:text-slate-400">{meaning}</p>
			{/if}
		</div>
	{/if}
</CardSurface>
