import { phonemeBackend, phonemeServerUrl, pronunciationBackend, speechaceApiKey } from './env';

export interface PerPhonemeScore {
	canonical: string;
	score: number; // 0..100
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

export interface ScoreInput {
	audio: Blob;
	text: string;
	expectedPhonemes?: string;
	lang?: string;
	thresholds?: { good: number; hard: number; again: number };
}

export interface PronunciationBackend {
	readonly name: PronunciationResult['backend'];
	score(input: ScoreInput): Promise<PronunciationResult>;
}

const DEFAULT_THRESHOLDS = { good: 80, hard: 60, again: 40 };

function suggestRating(
	overall: number,
	t = DEFAULT_THRESHOLDS
): PronunciationResult['suggested_rating'] {
	if (overall >= t.good) return 3; // Good
	if (overall >= t.hard) return 2; // Hard
	if (overall >= t.again) return 1; // Again
	return 1; // Again
}

// ---------------------------------------------------------------------------
// Sidecar backend (default): forward to phoneme-server.
// ---------------------------------------------------------------------------

class SidecarBackend implements PronunciationBackend {
	readonly name = 'sidecar' as const;

	async score(input: ScoreInput): Promise<PronunciationResult> {
		const fd = new FormData();
		fd.append('audio', input.audio, 'rec.webm');
		fd.append('text', input.text);
		if (input.lang) fd.append('lang', input.lang);
		if (input.expectedPhonemes) fd.append('expected_phonemes', input.expectedPhonemes);

		const res = await fetch(`${phonemeServerUrl()}/pronunciation`, {
			method: 'POST',
			body: fd
		});
		if (!res.ok) throw new Error(`sidecar pronunciation failed: ${res.status} ${await res.text()}`);
		const j = (await res.json()) as Omit<PronunciationResult, 'suggested_rating' | 'backend'> & {
			backend?: string;
		};
		return {
			overall_score: j.overall_score,
			per_phoneme: j.per_phoneme,
			actual_phonemes_argmax: j.actual_phonemes_argmax,
			expected_phonemes: j.expected_phonemes,
			suggested_rating: suggestRating(j.overall_score, input.thresholds),
			backend: 'sidecar'
		};
	}
}

// ---------------------------------------------------------------------------
// SpeechAce backend (commercial). Returns the same shape as the sidecar so the
// UI is identical regardless of which backend is active.
// ---------------------------------------------------------------------------

interface SpeechAcePhone {
	phone: string;
	quality_score: number;
	sound_most_like?: string;
}

class SpeechAceBackend implements PronunciationBackend {
	readonly name = 'speechace' as const;

	async score(input: ScoreInput): Promise<PronunciationResult> {
		const apiKey = speechaceApiKey();
		if (!apiKey) throw new Error('SPEECHACE_API_KEY not set');

		const dialect = input.lang || 'en-us';
		const url = `https://api.speechace.co/api/scoring/text/v9/json?key=${encodeURIComponent(
			apiKey
		)}&dialect=${encodeURIComponent(dialect)}`;

		const fd = new FormData();
		fd.append('text', input.text);
		fd.append('user_audio_file', input.audio, 'rec.webm');

		const res = await fetch(url, { method: 'POST', body: fd });
		if (!res.ok) throw new Error(`SpeechAce request failed: ${res.status}`);
		const j = (await res.json()) as {
			text_score?: {
				word_score_list?: { phone_score_list?: SpeechAcePhone[] }[];
				speechace_score?: { pronunciation?: number };
			};
		};

		const phones: PerPhonemeScore[] = [];
		for (const w of j.text_score?.word_score_list ?? []) {
			for (const p of w.phone_score_list ?? []) {
				phones.push({
					canonical: p.phone,
					score: p.quality_score,
					sound_most_like: p.sound_most_like ?? p.phone
				});
			}
		}
		const overall = j.text_score?.speechace_score?.pronunciation ?? 0;
		const expected = phones.map((p) => p.canonical).join(' ');
		const actual = phones.map((p) => p.sound_most_like).join(' ');

		return {
			overall_score: overall,
			per_phoneme: phones,
			actual_phonemes_argmax: actual,
			expected_phonemes: expected,
			suggested_rating: suggestRating(overall, input.thresholds),
			backend: 'speechace'
		};
	}
}

// ---------------------------------------------------------------------------
// Simple fallback: argmax IPA from the sidecar's text-to-phonemes + a
// Levenshtein diff. Used when the sidecar is healthy but GOP-SF fails for
// some reason, or as a last-resort if the user disables the sidecar.
// ---------------------------------------------------------------------------

function levenshtein(a: string[], b: string[]): number {
	if (a.length === 0) return b.length;
	if (b.length === 0) return a.length;
	const dp: number[][] = Array.from({ length: a.length + 1 }, () => new Array(b.length + 1).fill(0));
	for (let i = 0; i <= a.length; i++) dp[i][0] = i;
	for (let j = 0; j <= b.length; j++) dp[0][j] = j;
	for (let i = 1; i <= a.length; i++) {
		for (let j = 1; j <= b.length; j++) {
			const cost = a[i - 1] === b[j - 1] ? 0 : 1;
			dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
		}
	}
	return dp[a.length][b.length];
}

class SimpleFallbackBackend implements PronunciationBackend {
	readonly name = 'simple-fallback' as const;

	async score(input: ScoreInput): Promise<PronunciationResult> {
		// Even the fallback needs the sidecar's text-to-phonemes for the canonical
		// IPA; without that we cannot score against anything sensible.
		let expected: string;
		if (input.expectedPhonemes) {
			expected = input.expectedPhonemes;
		} else {
			const r = await fetch(`${phonemeServerUrl()}/text-to-phonemes`, {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ text: input.text, lang: input.lang ?? 'en-us' })
			});
			const j = (await r.json()) as { phonemes?: string };
			expected = j.phonemes ?? '';
		}

		const fd = new FormData();
		fd.append('audio', input.audio, 'rec.webm');
		fd.append('text', input.text);
		if (input.lang) fd.append('lang', input.lang);
		fd.append('expected_phonemes', expected);

		// Re-use the sidecar to get just the argmax (we'll discard its scores).
		const res = await fetch(`${phonemeServerUrl()}/pronunciation`, {
			method: 'POST',
			body: fd
		});
		if (!res.ok) throw new Error(`fallback pronunciation failed: ${res.status}`);
		const j = (await res.json()) as { actual_phonemes_argmax: string };

		const exp = expected.split(/\s+/).filter(Boolean);
		const act = j.actual_phonemes_argmax.split(/\s+/).filter(Boolean);
		const dist = levenshtein(exp, act);
		const denom = Math.max(exp.length, 1);
		const overall = Math.max(0, 100 * (1 - dist / denom));

		const per: PerPhonemeScore[] = exp.map((p, i) => ({
			canonical: p,
			score: act[i] === p ? 100 : 0,
			sound_most_like: act[i] ?? '∅'
		}));

		return {
			overall_score: overall,
			per_phoneme: per,
			actual_phonemes_argmax: j.actual_phonemes_argmax,
			expected_phonemes: expected,
			suggested_rating: suggestRating(overall, input.thresholds),
			backend: 'simple-fallback'
		};
	}
}

let active: PronunciationBackend | null = null;

export function getPronunciationBackend(): PronunciationBackend {
	if (active) return active;
	switch (pronunciationBackend()) {
		case 'speechace':
			active = new SpeechAceBackend();
			break;
		case 'simple-fallback':
			active = new SimpleFallbackBackend();
			break;
		default:
			active = new SidecarBackend();
	}
	return active;
}

export function backendInfo() {
	return { phoneme: phonemeBackend(), pronunciation: pronunciationBackend() };
}
