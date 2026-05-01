/**
 * Anki-style cloze marker parsing.
 *
 * Markers look like `{{cN::text}}` or `{{cN::text::hint}}` where N is 1-based.
 * The same N can appear multiple times (e.g. `{{c1::word}} ... {{c1::word}}`),
 * which means "hide all of them when this card is shown".
 */

export interface ClozeMarker {
	index: number;
	text: string;
	hint?: string;
	start: number;
	end: number;
}

const CLOZE_RE = /\{\{c(\d+)::([^}]+?)(?:::([^}]+?))?\}\}/g;

export function parseClozeMarkers(content: string): ClozeMarker[] {
	const markers: ClozeMarker[] = [];
	let m: RegExpExecArray | null;
	CLOZE_RE.lastIndex = 0;
	while ((m = CLOZE_RE.exec(content)) !== null) {
		markers.push({
			index: parseInt(m[1], 10),
			text: m[2],
			hint: m[3],
			start: m.index,
			end: m.index + m[0].length
		});
	}
	return markers;
}

/** Return all unique cloze indices used in the content, sorted ascending. */
export function uniqueClozeIndices(content: string): number[] {
	const set = new Set<number>();
	for (const m of parseClozeMarkers(content)) set.add(m.index);
	return Array.from(set).sort((a, b) => a - b);
}

/**
 * Render a cloze for review.
 *
 * Modes:
 *   - 'hide':   replace markers matching the active index with `___` (or hint),
 *               leave other clozes revealed (Anki-style multiple-cloze cards).
 *   - 'reveal': replace markers with their inner text everywhere.
 */
export function renderCloze(
	content: string,
	mode: 'hide' | 'reveal',
	activeIndex?: number,
	scaffold = '___'
): string {
	return content.replace(CLOZE_RE, (_match, idxStr: string, text: string, hint?: string) => {
		const idx = parseInt(idxStr, 10);
		if (mode === 'reveal') return text;
		if (idx === activeIndex) return hint ? `[${hint}]` : scaffold;
		return text;
	});
}

/** Wrap a single token in a cloze marker, e.g. for sentence-note auto-cloze generation. */
export function wrapAsCloze(text: string, index: number, hint?: string): string {
	const safeText = text.replace(/[}{:]/g, '');
	return hint ? `{{c${index}::${safeText}::${hint}}}` : `{{c${index}::${safeText}}}`;
}
