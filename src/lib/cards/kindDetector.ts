import type { NoteKind } from '$lib/database.types';

const TERMINAL_PUNCT = /[.!?…。！？]$/;

/**
 * Heuristic auto-detection of `note_kind` from the front text.
 * Caller can always override via the note edit form.
 *
 * Rules (intentionally simple, language-agnostic):
 *   1 token         → word
 *   2-4 tokens      → phrase
 *   ≥5 tokens, OR
 *     ends with terminal punctuation (.!?…) → sentence
 */
export function detectNoteKind(front: string): NoteKind {
	const trimmed = front.trim();
	if (!trimmed) return 'word';
	if (TERMINAL_PUNCT.test(trimmed)) return 'sentence';
	const tokens = trimmed.split(/\s+/u);
	if (tokens.length >= 5) return 'sentence';
	if (tokens.length >= 2) return 'phrase';
	return 'word';
}
