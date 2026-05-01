import type {
	CardType,
	ClozeVariant,
	NoteKind,
	NoteRow,
	CardRow
} from '$lib/database.types';
import { contentWordTokens, type Token } from './tokenizer';
import { wrapAsCloze, parseClozeMarkers } from './clozeMarkers';

/** Soft session-ordering hint baked into each generated card. Lower wins. */
export const PRIORITY: Record<string, number> = {
	'cloze.recognize': 10,
	'cloze.produce': 15,
	audio_recognition: 20,
	audio_choice: 25,
	pronunciation: 30,
	basic: 40,
	basic_reversed: 50
};

export interface GeneratedCard {
	card_type: CardType;
	variant: Record<string, unknown>;
	priority: number;
}

export interface GenerateOptions {
	/**
	 * Per-note overrides controlling which cards get emitted. Map from a key like
	 * 'basic', 'basic_reversed', 'cloze.recognize', 'cloze.produce',
	 * 'audio_recognition', 'audio_choice', 'pronunciation' → boolean. Missing keys
	 * mean "use the kind's default", which is on for everything except audio_choice.
	 */
	overrides?: Record<string, boolean>;
}

/**
 * Inject cloze markers into a sentence around its content words.
 * Returns the marked-up sentence and the list of indices used.
 */
export function autoMarkSentenceCloze(sentence: string): {
	marked: string;
	indices: number[];
} {
	const contentTokens: Token[] = contentWordTokens(sentence);
	if (contentTokens.length === 0) return { marked: sentence, indices: [] };

	let result = '';
	let cursor = 0;
	let nextIndex = 1;
	const indices: number[] = [];

	for (const t of contentTokens) {
		result += sentence.slice(cursor, t.start);
		result += wrapAsCloze(t.text, nextIndex);
		indices.push(nextIndex);
		nextIndex += 1;
		cursor = t.end;
	}
	result += sentence.slice(cursor);
	return { marked: result, indices };
}

interface NoteForGen {
	note_kind: NoteKind;
	front: string;
	back: string | null;
}

/**
 * Generate the canonical set of cards for a note. Idempotent and pure: callers
 * persist the result via `applyCardSet` (below) which diffs against existing
 * card rows so already-scheduled cards keep their FSRS state.
 */
export function generateCards(note: NoteForGen, opts: GenerateOptions = {}): GeneratedCard[] {
	const o = opts.overrides ?? {};
	const enabled = (key: string, defaultOn: boolean) =>
		key in o ? o[key] : defaultOn;

	const cards: GeneratedCard[] = [];

	const pushBasic = () => {
		if (enabled('basic', true)) {
			cards.push({ card_type: 'basic', variant: {}, priority: PRIORITY.basic });
		}
		if (enabled('basic_reversed', true)) {
			cards.push({
				card_type: 'basic_reversed',
				variant: {},
				priority: PRIORITY.basic_reversed
			});
		}
	};

	const pushAudioPron = (source: 'note_front' | 'example_sentence') => {
		if (enabled('audio_recognition', true)) {
			cards.push({
				card_type: 'audio_recognition',
				variant: { source },
				priority: PRIORITY.audio_recognition
			});
		}
		if (enabled('audio_choice', false)) {
			cards.push({
				card_type: 'audio_choice',
				variant: { source },
				priority: PRIORITY.audio_choice
			});
		}
		if (enabled('pronunciation', true)) {
			cards.push({
				card_type: 'pronunciation',
				variant: { source: source === 'example_sentence' ? 'note_front' : source },
				priority: PRIORITY.pronunciation
			});
		}
	};

	if (note.note_kind === 'sentence') {
		// Auto-cloze every content word in the sentence (using note.front).
		const { indices } = autoMarkSentenceCloze(note.front);

		// One recognize + one produce per cloze position.
		for (const idx of indices) {
			if (enabled('cloze.recognize', true)) {
				const v: ClozeVariant = {
					cloze_index: idx,
					direction: 'recognize',
					reveal: 'full_translation',
					source: 'note_front'
				};
				cards.push({ card_type: 'cloze', variant: v, priority: PRIORITY['cloze.recognize'] });
			}
			if (enabled('cloze.produce', true)) {
				const v: ClozeVariant = {
					cloze_index: idx,
					direction: 'produce',
					reveal: 'full_translation',
					source: 'note_front'
				};
				cards.push({ card_type: 'cloze', variant: v, priority: PRIORITY['cloze.produce'] });
			}
		}

		pushBasic();
		pushAudioPron('note_front');
	} else {
		// word or phrase: cloze cards reference the rotating example_sentence.
		// We emit ONE recognize and ONE produce that read from `current` at review time.
		if (enabled('cloze.recognize', true)) {
			const v: ClozeVariant = {
				cloze_index: 1,
				direction: 'recognize',
				reveal: 'full_translation',
				source: 'example_sentence'
			};
			cards.push({ card_type: 'cloze', variant: v, priority: PRIORITY['cloze.recognize'] });
		}
		if (enabled('cloze.produce', true)) {
			const v: ClozeVariant = {
				cloze_index: 1,
				direction: 'produce',
				reveal: 'full_translation',
				source: 'example_sentence'
			};
			cards.push({ card_type: 'cloze', variant: v, priority: PRIORITY['cloze.produce'] });
		}

		pushBasic();
		pushAudioPron('example_sentence');
	}

	return cards;
}

/** Stable string key identifying a (card_type, variant) tuple for diffing. */
export function cardKey(c: { card_type: CardType; variant: Record<string, unknown> }): string {
	if (c.card_type !== 'cloze') return c.card_type;
	const v = c.variant as ClozeVariant;
	return `cloze.${v.direction}.${v.cloze_index}.${v.source}`;
}

export interface CardDiff {
	toInsert: GeneratedCard[];
	toDelete: string[];
}

export interface ExistingCardLite {
	id: string;
	card_type: CardType;
	variant: Record<string, unknown>;
}

/** Diff existing card rows against the desired generated set. */
export function diffCards(existing: ExistingCardLite[], desired: GeneratedCard[]): CardDiff {
	const existingByKey = new Map<string, string>();
	for (const e of existing) {
		existingByKey.set(cardKey({ card_type: e.card_type, variant: e.variant }), e.id);
	}
	const desiredKeys = new Set(desired.map(cardKey));

	const toInsert: GeneratedCard[] = [];
	for (const d of desired) {
		if (!existingByKey.has(cardKey(d))) toInsert.push(d);
	}

	const toDelete: string[] = [];
	for (const [key, id] of existingByKey) {
		if (!desiredKeys.has(key)) toDelete.push(id);
	}

	return { toInsert, toDelete };
}

/** Convenience for tests: count generated cards by card_type. */
export function countByType(cards: GeneratedCard[]): Record<string, number> {
	const out: Record<string, number> = {};
	for (const c of cards) {
		const k = cardKey(c);
		out[k] = (out[k] ?? 0) + 1;
	}
	return out;
}

export { parseClozeMarkers };
export type { NoteRow, CardRow };
