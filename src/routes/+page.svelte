<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import { onMount } from 'svelte';
	import CardView from '$lib/components/CardView.svelte';
	import RatingButtons from '$lib/components/RatingButtons.svelte';
	import type { ExampleSentenceRow } from '$lib/database.types';
	import type { QueueCard } from '$lib/server/queue';

	let { data } = $props();

	let cards = $derived(data.cards as QueueCard[]);
	let examples = $derived(data.examples as Record<string, ExampleSentenceRow | null>);
	let index = $state(0);
	let showAnswer = $state(false);
	let started = $state<number>(Date.now());
	let busy = $state(false);

	const current = $derived(cards[index]);
	const example = $derived(current ? examples[current.note_id] ?? null : null);

	async function fetchAudioUrl(text: string): Promise<string | null> {
		try {
			const params = new globalThis.URLSearchParams({ text });
			const res = await fetch(`/api/tts?${params.toString()}`);
			if (!res.ok) return null;
			const j = (await res.json()) as { signedUrl?: string };
			return j.signedUrl ?? null;
		} catch {
			return null;
		}
	}
	let audioUrl = $state<string | null>(null);

	$effect(() => {
		audioUrl = null;
		if (!current) return;
		const needsAudio =
			current.card_type === 'audio_recognition' ||
			current.card_type === 'audio_choice' ||
			current.card_type === 'pronunciation';
		if (!needsAudio) return;
		const text =
			(current.variant as { source?: string } | null)?.source === 'example_sentence' && example
				? example.text.replace(/\{\{c\d+::([^}]+?)(?:::[^}]+?)?\}\}/g, '$1')
				: current.note.front;
		void fetchAudioUrl(text).then((url) => (audioUrl = url));
	});

	function reveal() {
		showAnswer = true;
	}

	async function rate(rating: 1 | 2 | 3 | 4) {
		if (!current || busy) return;
		busy = true;
		try {
			const elapsed = Date.now() - started;
			const exampleId = example?.id ?? null;
			const res = await fetch('/api/review', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({
					card_id: current.id,
					rating,
					elapsed_ms: elapsed,
					example_sentence_id: exampleId
				})
			});
			if (!res.ok) throw new Error(await res.text());

			showAnswer = false;
			started = Date.now();
			if (index + 1 >= cards.length) {
				await invalidateAll();
				index = 0;
			} else {
				index += 1;
			}
		} catch (e) {
			console.error(e);
		} finally {
			busy = false;
		}
	}

	function onKey(e: KeyboardEvent) {
		if (busy) return;
		if (!showAnswer && (e.key === ' ' || e.key === 'Enter')) {
			e.preventDefault();
			reveal();
			return;
		}
		if (showAnswer && /^[1-4]$/.test(e.key)) {
			e.preventDefault();
			rate(parseInt(e.key, 10) as 1 | 2 | 3 | 4);
		}
	}

	onMount(() => {
		globalThis.addEventListener('keydown', onKey);
		return () => globalThis.removeEventListener('keydown', onKey);
	});
</script>

<svelte:head>
	<title>Review · flashcards-again</title>
</svelte:head>

<section class="mx-auto max-w-2xl space-y-4">
	{#if cards.length === 0}
		<div class="card text-center">
			<p class="text-lg">Nothing due right now. </p>
			<p class="text-sm text-slate-500 dark:text-slate-400">
				Add notes via the <a href="/cards" class="underline">Cards</a> page or wait for new
				cards to be unlocked tomorrow.
			</p>
		</div>
	{:else if current}
		<div class="flex items-center justify-between text-sm text-slate-500 dark:text-slate-400">
			<span>{index + 1} / {cards.length}</span>
			<span class="badge">{current.card_type}</span>
		</div>

		<CardView
			card={current}
			note={current.note}
			example={example}
			{showAnswer}
			{audioUrl}
			referenceAudioUrl={audioUrl}
		/>

		{#if !showAnswer}
			<button type="button" class="btn-primary w-full" onclick={reveal} aria-label="Show answer">
				Show answer <span class="text-xs opacity-70">[space]</span>
			</button>
		{:else}
			<RatingButtons onRate={rate} />
		{/if}
	{/if}
</section>
