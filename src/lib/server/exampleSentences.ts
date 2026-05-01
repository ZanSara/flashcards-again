import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database, ExampleSentenceRow, NoteRow } from '$lib/database.types';
import { getOpenAI, Models } from './openai';
import { wrapAsCloze } from '$lib/cards/clozeMarkers';

const PROMPT_SYSTEM = `You generate short example sentences for a vocabulary flashcard app.

Given a target word/phrase and its meaning (and optionally the user's recent
study sample for difficulty calibration), return a JSON object with EXACTLY
these fields:
{
  "text_with_marker": "...",        // sentence containing the target,
                                     // with the target wrapped in {{c1::...}}
  "full_translation": "...",        // full natural translation of the sentence
                                     // in the user's native language
  "target_translation": "...",      // translation of the target word as it
                                     // is used in this specific sentence
                                     // (sense disambiguation matters here)
  "lang_source": "ISO 639-1 code",  // language of the sentence
  "lang_target": "ISO 639-1 code"   // language of the translation
}

Rules:
- The sentence MUST contain the target word/phrase (case-insensitive match);
  wrap exactly one occurrence in {{c1::...}}.
- Match the difficulty level of the user's recent sample if provided.
- Keep sentences short (8–14 words) and natural.
- Output ONLY the JSON object, no prose.`;

interface LlmExample {
	text_with_marker: string;
	full_translation: string;
	target_translation: string;
	lang_source?: string;
	lang_target?: string;
}

export interface GenerateExampleParams {
	target: string;
	meaning?: string | null;
	recentSample?: string[];
}

/** Call the LLM to generate one example sentence object. Throws on failure. */
export async function generateExample(params: GenerateExampleParams): Promise<LlmExample> {
	const oa = getOpenAI();
	const sample =
		params.recentSample && params.recentSample.length
			? `\n\nRecent study sample (calibrate difficulty to roughly match):\n- ${params.recentSample
					.slice(0, 12)
					.join('\n- ')}`
			: '';
	const userMsg = `Target: ${params.target}\nMeaning: ${
		params.meaning ?? '(unknown)'
	}${sample}`;

	const resp = await oa.chat.completions.create({
		model: Models.chat,
		response_format: { type: 'json_object' },
		messages: [
			{ role: 'system', content: PROMPT_SYSTEM },
			{ role: 'user', content: userMsg }
		]
	});
	const raw = resp.choices[0]?.message?.content ?? '';
	let parsed: unknown;
	try {
		parsed = JSON.parse(raw);
	} catch {
		throw new Error(`LLM returned non-JSON: ${raw.slice(0, 200)}`);
	}
	const obj = parsed as LlmExample;
	if (
		typeof obj.text_with_marker !== 'string' ||
		typeof obj.full_translation !== 'string' ||
		typeof obj.target_translation !== 'string'
	) {
		throw new Error(`LLM response missing required fields: ${raw.slice(0, 200)}`);
	}
	if (!/\{\{c1::[^}]+\}\}/.test(obj.text_with_marker)) {
		// Fall back: wrap the first occurrence of the target word ourselves.
		const idx = obj.text_with_marker.toLowerCase().indexOf(params.target.toLowerCase());
		if (idx >= 0) {
			const before = obj.text_with_marker.slice(0, idx);
			const match = obj.text_with_marker.slice(idx, idx + params.target.length);
			const after = obj.text_with_marker.slice(idx + params.target.length);
			obj.text_with_marker = before + wrapAsCloze(match, 1) + after;
		}
	}
	return obj;
}

async function fetchRecentSample(
	admin: SupabaseClient<Database>,
	userId: string,
	excludeNoteId?: string
): Promise<string[]> {
	const { data } = await admin
		.from('notes')
		.select('front')
		.eq('user_id', userId)
		.eq('status', 'active')
		.neq('id', excludeNoteId ?? '00000000-0000-0000-0000-000000000000')
		.order('updated_at', { ascending: false })
		.limit(20);
	return (data ?? []).map((r) => r.front).filter((s): s is string => !!s);
}

/** Insert one example sentence with the given status. */
async function insertExample(
	admin: SupabaseClient<Database>,
	note: Pick<NoteRow, 'id' | 'user_id'>,
	example: LlmExample,
	status: ExampleSentenceRow['status']
): Promise<ExampleSentenceRow> {
	const row: Partial<ExampleSentenceRow> = {
		note_id: note.id,
		user_id: note.user_id,
		text: example.text_with_marker,
		translation: example.full_translation,
		target_translation: example.target_translation,
		status
	};
	const { data, error } = await admin.from('example_sentences').insert(row).select('*').single();
	if (error) throw error;
	return data as ExampleSentenceRow;
}

/** Bootstrap a brand-new note (word/phrase) with a current + queued example. */
export async function bootstrapExamples(
	admin: SupabaseClient<Database>,
	note: Pick<NoteRow, 'id' | 'user_id' | 'front' | 'back' | 'note_kind'>
): Promise<{ current: ExampleSentenceRow | null; queuedAttempted: boolean }> {
	if (note.note_kind === 'sentence') return { current: null, queuedAttempted: false };

	const sample = await fetchRecentSample(admin, note.user_id, note.id);
	const first = await generateExample({
		target: note.front,
		meaning: note.back,
		recentSample: sample
	});
	const current = await insertExample(admin, note, first, 'current');

	// Fire-and-forget the second one to seed the rotation queue.
	void (async () => {
		try {
			const second = await generateExample({
				target: note.front,
				meaning: note.back,
				recentSample: sample
			});
			await insertExample(admin, note, second, 'queued');
		} catch (e) {
			console.error('queued example generation failed', e);
		}
	})();

	return { current, queuedAttempted: true };
}

/**
 * Advance the rotation pool for a note after a review.
 * - Promote the consumed `current` to `used`
 * - Promote the oldest `queued` to `current` (if any)
 * - Fire-and-forget a backfill to top up `queued` again
 *
 * Falls back to reusing the oldest `used` if no `queued` exists.
 */
export async function rotateExample(
	admin: SupabaseClient<Database>,
	note: Pick<NoteRow, 'id' | 'user_id' | 'front' | 'back' | 'note_kind'>,
	consumedId: string
): Promise<void> {
	if (note.note_kind === 'sentence') return;

	await admin
		.from('example_sentences')
		.update({ status: 'used' })
		.eq('id', consumedId)
		.eq('user_id', note.user_id);

	const { data: queued } = await admin
		.from('example_sentences')
		.select('id')
		.eq('note_id', note.id)
		.eq('status', 'queued')
		.order('created_at', { ascending: true })
		.limit(1);

	if (queued && queued.length > 0) {
		await admin
			.from('example_sentences')
			.update({ status: 'current' })
			.eq('id', queued[0].id);
	} else {
		// fallback: revive oldest 'used'
		const { data: used } = await admin
			.from('example_sentences')
			.select('id')
			.eq('note_id', note.id)
			.eq('status', 'used')
			.order('created_at', { ascending: true })
			.limit(1);
		if (used && used.length > 0) {
			await admin.from('example_sentences').update({ status: 'current' }).eq('id', used[0].id);
		}
	}

	void (async () => {
		try {
			const sample = await fetchRecentSample(admin, note.user_id, note.id);
			const next = await generateExample({
				target: note.front,
				meaning: note.back,
				recentSample: sample
			});
			await insertExample(admin, note, next, 'queued');
		} catch (e) {
			console.error('queued example top-up failed', e);
		}
	})();
}

/** Get the active (current) example sentence for a note, if any. */
export async function getCurrentExample(
	admin: SupabaseClient<Database>,
	noteId: string
): Promise<ExampleSentenceRow | null> {
	const { data } = await admin
		.from('example_sentences')
		.select('*')
		.eq('note_id', noteId)
		.eq('status', 'current')
		.maybeSingle();
	return (data as ExampleSentenceRow | null) ?? null;
}
