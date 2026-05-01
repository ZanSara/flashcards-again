import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database, NoteRow } from '$lib/database.types';
import { getOpenAI, Models } from './openai';

const SYSTEM = `You suggest new flashcards for a learner based on a sample of
their existing notes. Match the difficulty level and topical mix of the sample.
Each suggestion should be a single word, phrase, or short sentence the learner
does NOT already have. Output ONLY a JSON object with a "notes" array; each
item has { "front": string, "back": string, "tags": string[] }.

Constraints:
- Aim for 5 suggestions by default (more if requested).
- Avoid duplicates of any "front" string already shown in the sample.
- Tags should be short, lowercased single words.`;

export interface SuggestionInput {
	count?: number;
	hint?: string;
	tagFilter?: string;
}

interface RawSuggestion {
	front?: unknown;
	back?: unknown;
	tags?: unknown;
}

export async function generateSuggestions(
	admin: SupabaseClient<Database>,
	userId: string,
	input: SuggestionInput = {}
): Promise<Pick<NoteRow, 'front' | 'back' | 'tags'>[]> {
	const count = input.count ?? 5;
	const filter = input.tagFilter ?? '';

	let q = admin.from('notes').select('front').eq('user_id', userId).eq('status', 'active');
	if (filter) q = q.contains('tags', [filter]);
	const { data: sampleRows } = await q.order('updated_at', { ascending: false }).limit(40);
	const sample = (sampleRows ?? []).map((r) => r.front).filter((s): s is string => !!s);

	const userMsg = [
		`Existing sample (${sample.length} notes):`,
		...sample.slice(0, 40).map((s) => `- ${s}`),
		'',
		`Generate ${count} suggestions${filter ? ` themed around tag "${filter}"` : ''}.`,
		input.hint ? `Hint: ${input.hint}` : ''
	]
		.filter(Boolean)
		.join('\n');

	const oa = getOpenAI();
	const resp = await oa.chat.completions.create({
		model: Models.chat,
		response_format: { type: 'json_object' },
		messages: [
			{ role: 'system', content: SYSTEM },
			{ role: 'user', content: userMsg }
		]
	});
	const raw = resp.choices[0]?.message?.content ?? '';
	let parsed: { notes?: RawSuggestion[] };
	try {
		parsed = JSON.parse(raw) as { notes?: RawSuggestion[] };
	} catch {
		throw new Error(`LLM suggestion returned non-JSON: ${raw.slice(0, 200)}`);
	}
	const items: Pick<NoteRow, 'front' | 'back' | 'tags'>[] = [];
	for (const r of parsed.notes ?? []) {
		if (typeof r.front !== 'string') continue;
		items.push({
			front: r.front,
			back: typeof r.back === 'string' ? r.back : null,
			tags: Array.isArray(r.tags)
				? r.tags.filter((t): t is string => typeof t === 'string')
				: []
		});
	}
	return items;
}

export async function insertSuggestions(
	admin: SupabaseClient<Database>,
	userId: string,
	items: Pick<NoteRow, 'front' | 'back' | 'tags'>[]
): Promise<number> {
	if (items.length === 0) return 0;
	const rows: Partial<NoteRow>[] = items.map((it) => ({
		user_id: userId,
		front: it.front,
		back: it.back,
		note_kind: 'word',
		extras: [],
		tags: it.tags ?? [],
		properties: {},
		source: 'llm',
		status: 'pending',
		card_type_overrides: {}
	}));
	const { error: e } = await admin.from('notes').insert(rows);
	if (e) throw e;
	return rows.length;
}

/**
 * Auto-trigger: if the user is below their pending threshold, kick off a
 * suggestion run. Idempotent: callers should fire-and-forget.
 */
export async function maybeAutoSuggest(
	admin: SupabaseClient<Database>,
	userId: string
): Promise<{ triggered: boolean; inserted: number }> {
	const { data: settings } = await admin
		.from('settings')
		.select('pending_threshold')
		.eq('user_id', userId)
		.maybeSingle();
	const threshold = settings?.pending_threshold ?? 10;

	const { count } = await admin
		.from('notes')
		.select('id', { count: 'exact', head: true })
		.eq('user_id', userId)
		.eq('status', 'pending');
	const pending = count ?? 0;
	if (pending >= threshold) return { triggered: false, inserted: 0 };

	const items = await generateSuggestions(admin, userId, { count: threshold - pending });
	const inserted = await insertSuggestions(admin, userId, items);
	return { triggered: true, inserted };
}
