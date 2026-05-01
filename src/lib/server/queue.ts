import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database, CardRow, NoteRow } from '$lib/database.types';
import { State } from 'ts-fsrs';

const DUE_LIMIT = 50;

export interface QueueCard extends CardRow {
	note: Pick<NoteRow, 'id' | 'front' | 'back' | 'note_kind' | 'extras' | 'tags'>;
}

/**
 * Build today's review queue.
 *
 * Strategy:
 *   1. Pull all DUE cards (state >= Learning, due ≤ now) for the user, capped at DUE_LIMIT.
 *   2. Pull NEW cards (state == New) up to the remaining quota:
 *        - If `daily_new_limit` is null → unlimited (capped only by DUE_LIMIT slack)
 *        - Else: limit minus the number of new-cards already reviewed today
 *   3. Join each card with its note.
 *   4. Order so that within a note, lower-priority value wins (cloze before basic).
 */
export async function buildQueue(
	admin: SupabaseClient<Database>,
	userId: string,
	dailyNewLimit: number | null
): Promise<QueueCard[]> {
	const nowIso = new Date().toISOString();

	const { data: dueRaw, error: dueErr } = await admin
		.from('cards')
		.select('*')
		.eq('user_id', userId)
		.gte('state', State.Learning as number)
		.lte('due', nowIso)
		.order('due', { ascending: true })
		.limit(DUE_LIMIT);
	if (dueErr) throw dueErr;
	const due = dueRaw ?? [];

	let newAllowance = DUE_LIMIT - due.length;
	if (dailyNewLimit !== null) {
		const startOfDay = new Date();
		startOfDay.setHours(0, 0, 0, 0);

		const { data: reviewedNew, error: revErr } = await admin
			.from('reviews')
			.select('card_id, prev_state', { count: 'exact', head: false })
			.eq('user_id', userId)
			.gte('reviewed_at', startOfDay.toISOString());
		if (revErr) throw revErr;

		// Count how many distinct cards were "graduated" today (had prev_state.state == New)
		const graduatedToday = new Set<string>();
		for (const r of reviewedNew ?? []) {
			const prev = r.prev_state as Record<string, unknown> | null;
			if (prev && (prev.state === State.New || prev.state === 0)) {
				graduatedToday.add(r.card_id);
			}
		}
		const remaining = Math.max(0, dailyNewLimit - graduatedToday.size);
		newAllowance = Math.min(newAllowance, remaining);
	}

	let news: CardRow[] = [];
	if (newAllowance > 0) {
		const { data: newRaw, error: newErr } = await admin
			.from('cards')
			.select('*')
			.eq('user_id', userId)
			.eq('state', State.New as number)
			.order('priority', { ascending: true })
			.order('created_at', { ascending: true })
			.limit(newAllowance);
		if (newErr) throw newErr;
		news = newRaw ?? [];
	}

	const all: CardRow[] = [...due, ...news];
	if (all.length === 0) return [];

	const noteIds = Array.from(new Set(all.map((c) => c.note_id)));
	const { data: noteRows, error: noteErr } = await admin
		.from('notes')
		.select('id, front, back, note_kind, extras, tags')
		.in('id', noteIds);
	if (noteErr) throw noteErr;
	const noteById = new Map((noteRows ?? []).map((n) => [n.id, n]));

	const enriched: QueueCard[] = all.flatMap((c) => {
		const note = noteById.get(c.note_id);
		if (!note) return [];
		return [{ ...c, note }];
	});

	// Sort: group by note_id, within a note prefer lower priority then earlier due.
	// Across notes preserve "due-soonest first" by sorting on the earliest due card per note.
	const earliestPerNote = new Map<string, number>();
	for (const c of enriched) {
		const t = new Date(c.due).getTime();
		const cur = earliestPerNote.get(c.note_id);
		if (cur === undefined || t < cur) earliestPerNote.set(c.note_id, t);
	}

	enriched.sort((a, b) => {
		const ea = earliestPerNote.get(a.note_id) ?? 0;
		const eb = earliestPerNote.get(b.note_id) ?? 0;
		if (ea !== eb) return ea - eb;
		if (a.note_id !== b.note_id) return a.note_id.localeCompare(b.note_id);
		if (a.priority !== b.priority) return a.priority - b.priority;
		return new Date(a.due).getTime() - new Date(b.due).getTime();
	});

	return enriched;
}
