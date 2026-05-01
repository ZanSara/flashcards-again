import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database, NoteRow } from '$lib/database.types';
import {
	diffCards,
	generateCards,
	type ExistingCardLite,
	type GenerateOptions
} from '$lib/cards/generator';
import { emptyCardRowState } from './fsrs';

/**
 * Synchronise the cards table with the canonical generated set for a note.
 * Existing cards keep their FSRS state; only newly-required cards are inserted
 * and removed cards are deleted.
 */
export async function syncCardsForNote(
	admin: SupabaseClient<Database>,
	note: Pick<NoteRow, 'id' | 'user_id' | 'note_kind' | 'front' | 'back' | 'card_type_overrides'>
): Promise<{ inserted: number; deleted: number }> {
	const overrides = (note.card_type_overrides ?? {}) as Record<string, boolean>;
	const desired = generateCards(
		{ note_kind: note.note_kind, front: note.front, back: note.back },
		{ overrides } satisfies GenerateOptions
	);

	const { data: existingRaw } = await admin
		.from('cards')
		.select('id, card_type, variant')
		.eq('note_id', note.id);
	const existing = (existingRaw ?? []).map((r) => ({
		id: r.id,
		card_type: r.card_type,
		variant: r.variant as Record<string, unknown>
	})) satisfies ExistingCardLite[];

	const diff = diffCards(existing, desired);

	if (diff.toInsert.length > 0) {
		const initial = emptyCardRowState();
		const rows = diff.toInsert.map((d) => ({
			note_id: note.id,
			user_id: note.user_id,
			card_type: d.card_type,
			variant: d.variant,
			priority: d.priority,
			...initial
		}));
		const { error: insErr } = await admin.from('cards').insert(rows);
		if (insErr) throw insErr;
	}

	if (diff.toDelete.length > 0) {
		const { error: delErr } = await admin
			.from('cards')
			.delete()
			.in('id', diff.toDelete)
			.eq('note_id', note.id);
		if (delErr) throw delErr;
	}

	return { inserted: diff.toInsert.length, deleted: diff.toDelete.length };
}
