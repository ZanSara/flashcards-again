import { describe, expect, it } from 'vitest';
import {
	autoMarkSentenceCloze,
	cardKey,
	countByType,
	diffCards,
	generateCards
} from '../src/lib/cards/generator';
import { detectNoteKind } from '../src/lib/cards/kindDetector';
import {
	parseClozeMarkers,
	renderCloze,
	uniqueClozeIndices,
	wrapAsCloze
} from '../src/lib/cards/clozeMarkers';
import { contentWordTokens, tokenize } from '../src/lib/cards/tokenizer';

describe('detectNoteKind', () => {
	it('classifies single tokens as word', () => {
		expect(detectNoteKind('palabra')).toBe('word');
	});
	it('classifies short multi-word as phrase', () => {
		expect(detectNoteKind('por favor')).toBe('phrase');
		expect(detectNoteKind('no se puede')).toBe('phrase');
	});
	it('classifies long phrases as sentence', () => {
		expect(detectNoteKind('me gusta mucho la comida italiana')).toBe('sentence');
	});
	it('classifies anything ending in . ! ? as sentence', () => {
		expect(detectNoteKind('Hola.')).toBe('sentence');
		expect(detectNoteKind('Vamos!')).toBe('sentence');
		expect(detectNoteKind('¿Sí?')).toBe('sentence');
	});
});

describe('tokenizer', () => {
	it('keeps spans aligned to the source string', () => {
		const text = 'Hola, mundo!';
		const tokens = tokenize(text);
		expect(tokens.map((t) => text.slice(t.start, t.end)).join('')).toBe(text);
	});
	it('skips stop-words and punctuation in contentWordTokens', () => {
		const tokens = contentWordTokens('the cat sat on the mat');
		expect(tokens.map((t) => t.text)).toEqual(['cat', 'sat', 'mat']);
	});
});

describe('clozeMarkers', () => {
	it('wraps a token with the right index', () => {
		expect(wrapAsCloze('hola', 1)).toBe('{{c1::hola}}');
		expect(wrapAsCloze('hola', 2, 'greeting')).toBe('{{c2::hola::greeting}}');
	});
	it('parses markers and indices', () => {
		const s = 'I {{c1::said}} {{c2::hello}} to {{c1::said}}.';
		const markers = parseClozeMarkers(s);
		expect(markers).toHaveLength(3);
		expect(uniqueClozeIndices(s)).toEqual([1, 2]);
	});
	it('renders hide vs reveal correctly', () => {
		const s = 'I {{c1::said}} {{c2::hello}}.';
		expect(renderCloze(s, 'reveal')).toBe('I said hello.');
		expect(renderCloze(s, 'hide', 1)).toBe('I ___ hello.');
		expect(renderCloze(s, 'hide', 2)).toBe('I said ___.');
	});
});

describe('generateCards', () => {
	it('word note → basic, basic_reversed, audio, pronunciation, 1 cloze.recognize, 1 cloze.produce', () => {
		const cards = generateCards({ note_kind: 'word', front: 'palabra', back: 'word' });
		const counts = countByType(cards);
		expect(counts['basic']).toBe(1);
		expect(counts['basic_reversed']).toBe(1);
		expect(counts['cloze.recognize.1.example_sentence']).toBe(1);
		expect(counts['cloze.produce.1.example_sentence']).toBe(1);
		expect(counts['audio_recognition']).toBe(1);
		expect(counts['pronunciation']).toBe(1);
	});

	it('sentence note → one cloze pair per content word + basic family + audio + pron', () => {
		const cards = generateCards({
			note_kind: 'sentence',
			front: 'the cat sat on the mat',
			back: 'la gata se sentó en la alfombra'
		});
		const counts = countByType(cards);
		// 3 content words → 3 recognize + 3 produce = 6 cloze cards
		const recognizeKeys = Object.keys(counts).filter((k) => k.startsWith('cloze.recognize.'));
		const produceKeys = Object.keys(counts).filter((k) => k.startsWith('cloze.produce.'));
		expect(recognizeKeys).toHaveLength(3);
		expect(produceKeys).toHaveLength(3);
		expect(counts['basic']).toBe(1);
		expect(counts['basic_reversed']).toBe(1);
		expect(counts['audio_recognition']).toBe(1);
		expect(counts['pronunciation']).toBe(1);
	});

	it('overrides disable specific card types', () => {
		const cards = generateCards(
			{ note_kind: 'word', front: 'palabra', back: 'word' },
			{ overrides: { basic_reversed: false, pronunciation: false, 'cloze.produce': false } }
		);
		const counts = countByType(cards);
		expect(counts['basic_reversed']).toBeUndefined();
		expect(counts['pronunciation']).toBeUndefined();
		expect(Object.keys(counts).filter((k) => k.startsWith('cloze.produce'))).toHaveLength(0);
		expect(counts['basic']).toBe(1);
	});

	it('priority ordering: cloze.recognize < cloze.produce < audio < pronunciation < basic', () => {
		const cards = generateCards({ note_kind: 'word', front: 'palabra', back: 'word' });
		const recognize = cards.find((c) => cardKey(c).startsWith('cloze.recognize'));
		const produce = cards.find((c) => cardKey(c).startsWith('cloze.produce'));
		const basic = cards.find((c) => c.card_type === 'basic');
		expect(recognize!.priority).toBeLessThan(produce!.priority);
		expect(produce!.priority).toBeLessThan(basic!.priority);
	});
});

describe('autoMarkSentenceCloze', () => {
	it('preserves all original characters', () => {
		const orig = 'the cat sat on the mat.';
		const { marked } = autoMarkSentenceCloze(orig);
		// Stripping cloze markers should give back the original text.
		const stripped = marked.replace(/\{\{c\d+::([^}]+?)\}\}/g, '$1');
		expect(stripped).toBe(orig);
	});
	it('numbers cloze indices sequentially from 1', () => {
		const { indices, marked } = autoMarkSentenceCloze('cat sat mat');
		expect(indices).toEqual([1, 2, 3]);
		expect(marked).toBe('{{c1::cat}} {{c2::sat}} {{c3::mat}}');
	});
});

describe('diffCards', () => {
	it('inserts new and deletes removed', () => {
		const existing = [
			{
				id: 'a',
				card_type: 'basic' as const,
				variant: {} as Record<string, unknown>
			},
			{
				id: 'b',
				card_type: 'cloze' as const,
				variant: {
					cloze_index: 1,
					direction: 'recognize',
					reveal: 'full_translation',
					source: 'example_sentence'
				}
			}
		];
		const desired = generateCards({ note_kind: 'word', front: 'word', back: 'meaning' });
		const diff = diffCards(existing, desired);
		// existing cloze.recognize matches; basic matches; everything else inserted
		expect(diff.toInsert.length).toBe(desired.length - 2);
		expect(diff.toDelete).toEqual([]);
	});

	it('detects removals when overrides shrink the set', () => {
		const desiredAll = generateCards({ note_kind: 'word', front: 'w', back: 'm' });
		const existing = desiredAll.map((d, i) => ({
			id: `id-${i}`,
			card_type: d.card_type,
			variant: d.variant
		}));
		const desiredFew = generateCards(
			{ note_kind: 'word', front: 'w', back: 'm' },
			{ overrides: { audio_recognition: false, pronunciation: false } }
		);
		const diff = diffCards(existing, desiredFew);
		expect(diff.toInsert).toEqual([]);
		expect(diff.toDelete.length).toBe(2);
	});
});
