<script lang="ts">
	import type { CardRow } from '$lib/database.types';
	import type { NoteForRender } from '$lib/cards/types';
	import CardSurface from '../CardSurface.svelte';
	import PronunciationFeedback from '../PronunciationFeedback.svelte';
	import AudioRecorder from '../AudioRecorder.svelte';
	import type { PronunciationResult } from '$lib/cards/types';

	let {
		card,
		note,
		showAnswer,
		referenceAudioUrl,
		onPlayReference,
		onResult
	}: {
		card: CardRow;
		note: NoteForRender;
		showAnswer: boolean;
		referenceAudioUrl: string | null;
		onPlayReference?: () => void;
		onResult?: (result: PronunciationResult) => void;
	} = $props();

	let result = $state<PronunciationResult | null>(null);
	let pending = $state(false);
	let errorMsg = $state<string | null>(null);

	async function handleRecording(blob: Blob) {
		pending = true;
		errorMsg = null;
		try {
			const fd = new FormData();
			fd.append('audio', blob, 'rec.webm');
			fd.append('text', note.front);
			const res = await fetch('/api/pronounce', { method: 'POST', body: fd });
			if (!res.ok) throw new Error(await res.text());
			result = (await res.json()) as PronunciationResult;
			onResult?.(result);
		} catch (e) {
			errorMsg = e instanceof Error ? e.message : String(e);
		} finally {
			pending = false;
		}
	}
</script>

<CardSurface extras={note.extras} side={showAnswer ? 'back' : 'front'}>
	<div class="space-y-4">
		<p class="label">Read aloud</p>
		<p class="text-3xl font-semibold tracking-tight">{note.front}</p>

		<div class="flex flex-wrap items-center gap-2">
			<AudioRecorder onRecording={handleRecording} disabled={pending} />
			{#if referenceAudioUrl}
				<button
					type="button"
					class="btn-secondary"
					onclick={onPlayReference}
					aria-label="Play correct pronunciation"
				>
					Hear correct
				</button>
			{/if}
		</div>

		{#if pending}
			<p class="text-sm text-slate-500 dark:text-slate-400">Analysing pronunciation…</p>
		{/if}
		{#if errorMsg}
			<p class="text-sm text-rose-600 dark:text-rose-400" role="alert">Error: {errorMsg}</p>
		{/if}
		{#if result}
			<PronunciationFeedback {result} />
		{/if}
	</div>
</CardSurface>
