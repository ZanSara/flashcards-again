/**
 * Lightweight content-word tokenization for sentence-level cloze generation.
 *
 * Goals:
 *   - Split a sentence into "tokens" preserving original character spans, so
 *     the generator can wrap each chosen word in `{{cN::token}}` markers
 *     without disturbing surrounding punctuation.
 *   - Identify which tokens are "content words" (i.e. not stop-words, not
 *     pure punctuation, not numbers) — these are what we cloze on.
 *
 * For the MVP this is intentionally simple and language-agnostic. The plan
 * mentions "phonemizer-aware tokenization for clitics/contractions" — that
 * is delegated to the sidecar (G2P respects clitic boundaries), and the
 * cloze generator works at the orthographic word level here. Languages whose
 * scripts don't use whitespace (CJK) currently get one token per character;
 * we'll improve when needed.
 */

export interface Token {
	text: string;
	start: number;
	end: number;
	kind: 'word' | 'punct' | 'space' | 'number';
}

const PUNCT_RE = /^[\p{P}\p{S}]+$/u;
const NUMBER_RE = /^\p{N}+$/u;
const WHITESPACE_RE = /^\s+$/u;

export function tokenize(text: string): Token[] {
	const tokens: Token[] = [];
	const re = /(\s+)|([\p{L}\p{N}'\u2019]+)|([\p{P}\p{S}]+)/gu;
	let m: RegExpExecArray | null;
	while ((m = re.exec(text)) !== null) {
		const t = m[0];
		const start = m.index;
		const end = start + t.length;
		let kind: Token['kind'] = 'word';
		if (WHITESPACE_RE.test(t)) kind = 'space';
		else if (NUMBER_RE.test(t)) kind = 'number';
		else if (PUNCT_RE.test(t)) kind = 'punct';
		tokens.push({ text: t, start, end, kind });
	}
	return tokens;
}

// A pragmatic stop-word list spanning a handful of common Western languages.
// This is intentionally small — the generator can always be tuned later or made
// per-language via note properties. For language-learning, function words are
// often valuable to study, so erring on the side of NOT excluding is fine.
const STOP_WORDS = new Set([
	// English
	'the', 'a', 'an', 'is', 'am', 'are', 'was', 'were', 'be', 'been', 'being',
	'and', 'or', 'but', 'if', 'so', 'of', 'to', 'in', 'on', 'at', 'by', 'for',
	'with', 'as', 'it', 'its', "it's", 'this', 'that', 'these', 'those', 'i',
	'you', 'he', 'she', 'we', 'they', 'me', 'him', 'her', 'us', 'them', 'my',
	'your', 'his', 'our', 'their',
	// Spanish
	'el', 'la', 'los', 'las', 'un', 'una', 'unos', 'unas', 'y', 'o', 'pero',
	'que', 'de', 'a', 'en', 'por', 'para', 'con', 'sin', 'es', 'son', 'soy',
	'eres', 'somos', 'fui', 'fue', 'eran', 'yo', 'tú', 'él', 'ella', 'nosotros',
	'vosotros', 'ellos', 'mi', 'tu', 'su',
	// Italian
	'il', 'lo', 'gli', 'i', 'le', 'un', 'uno', 'una', 'e', 'o', 'ma', 'che',
	'di', 'a', 'da', 'in', 'su', 'per', 'con', 'senza', 'è', 'sono', 'sei',
	'siamo', 'siete', 'era', 'erano', 'io', 'tu', 'lui', 'lei', 'noi', 'voi',
	'loro',
	// French
	'le', 'la', 'les', 'un', 'une', 'des', 'et', 'ou', 'mais', 'que', 'de',
	'à', 'en', 'sur', 'pour', 'avec', 'sans', 'est', 'sont', 'suis', 'es',
	'sommes', 'êtes', 'était', 'étaient', 'je', 'tu', 'il', 'elle', 'nous',
	'vous', 'ils', 'elles',
	// German
	'der', 'die', 'das', 'den', 'dem', 'des', 'ein', 'eine', 'einen', 'einem',
	'einer', 'und', 'oder', 'aber', 'dass', 'von', 'zu', 'in', 'an', 'auf',
	'für', 'mit', 'ohne', 'ist', 'sind', 'bin', 'bist', 'war', 'waren', 'ich',
	'du', 'er', 'sie', 'es', 'wir', 'ihr',
	// Portuguese
	'o', 'a', 'os', 'as', 'um', 'uma', 'uns', 'umas', 'e', 'ou', 'mas', 'que',
	'de', 'em', 'por', 'para', 'com', 'sem', 'é', 'são', 'sou', 'és'
]);

export function isContentWord(token: Token): boolean {
	if (token.kind !== 'word') return false;
	if (token.text.length < 2) return false;
	if (STOP_WORDS.has(token.text.toLowerCase())) return false;
	return true;
}

export function contentWordTokens(text: string): Token[] {
	return tokenize(text).filter(isContentWord);
}
