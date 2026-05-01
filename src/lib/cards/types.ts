import type { NoteRow } from '$lib/database.types';

/**
 * Subset of a NoteRow that the renderer components need. Loading less data
 * keeps the queue endpoint and per-page loaders lean.
 */
export type NoteForRender = Pick<
	NoteRow,
	'id' | 'front' | 'back' | 'note_kind' | 'extras' | 'tags'
>;

// Shared between server-side `lib/server/pronunciation.ts` and client-side
// rendering components. Lives outside `lib/server/` so client code can import
// the types without pulling in server-only env reads.
export interface PerPhonemeScore {
	canonical: string;
	score: number;
	sound_most_like: string;
	frame_span?: [number, number];
}

export interface PronunciationResult {
	overall_score: number;
	per_phoneme: PerPhonemeScore[];
	actual_phonemes_argmax: string;
	expected_phonemes: string;
	suggested_rating: 1 | 2 | 3 | 4;
	backend: 'sidecar' | 'speechace' | 'simple-fallback';
}
