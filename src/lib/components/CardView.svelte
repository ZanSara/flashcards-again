<script lang="ts">
	import type { CardRow, ExampleSentenceRow } from '$lib/database.types';
	import type { NoteForRender } from '$lib/cards/types';
	import BasicCardView from './cards/BasicCardView.svelte';
	import ClozeCardView from './cards/ClozeCardView.svelte';
	import AudioRecognitionView from './cards/AudioRecognitionView.svelte';
	import PronunciationView from './cards/PronunciationView.svelte';

	let {
		card,
		note,
		example,
		showAnswer,
		audioUrl,
		referenceAudioUrl,
		onPlay,
		onPlayReference
	}: {
		card: CardRow;
		note: NoteForRender;
		example: ExampleSentenceRow | null;
		showAnswer: boolean;
		audioUrl: string | null;
		referenceAudioUrl: string | null;
		onPlay?: () => void;
		onPlayReference?: () => void;
	} = $props();
</script>

{#if card.card_type === 'basic' || card.card_type === 'basic_reversed'}
	<BasicCardView {card} {note} {showAnswer} />
{:else if card.card_type === 'cloze'}
	<ClozeCardView {card} {note} {example} {showAnswer} />
{:else if card.card_type === 'audio_recognition' || card.card_type === 'audio_choice'}
	<AudioRecognitionView {card} {note} {example} {showAnswer} {audioUrl} {onPlay} />
{:else if card.card_type === 'pronunciation'}
	<PronunciationView {card} {note} {showAnswer} {referenceAudioUrl} {onPlayReference} />
{/if}
