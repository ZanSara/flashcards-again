import type { PageServerLoad, Actions } from './$types';
import type { CardRow, ExtraField, NoteRow } from '$lib/database.types';
import { error, fail, redirect } from '@sveltejs/kit';
import { detectNoteKind } from '$lib/cards/kindDetector';
import { syncCardsForNote } from '$lib/server/cardSync';
import { bootstrapExamples, getCurrentExample } from '$lib/server/exampleSentences';

export const load: PageServerLoad = async ({ locals, params }) => {
	const userId = locals.user!.id;
	const admin = locals.supabaseAdmin;

	const { data: rows, error: e } = await admin
		.from('notes')
		.select('*')
		.eq('id', params.id)
		.eq('user_id', userId)
		.limit(1);
	if (e) throw error(500, e.message);
	const note = rows?.[0] as NoteRow | undefined;
	if (!note) throw error(404, 'note not found');

	const { data: cards } = await admin
		.from('cards')
		.select('*')
		.eq('note_id', note.id)
		.order('priority', { ascending: true });

	const example = await getCurrentExample(admin, note.id);

	return { note, cards: (cards ?? []) as CardRow[], example };
};

export const actions: Actions = {
	save: async ({ locals, request, params }) => {
		const userId = locals.user!.id;
		const admin = locals.supabaseAdmin;
		const form = await request.formData();

		const front = String(form.get('front') ?? '').trim();
		const back = String(form.get('back') ?? '').trim() || null;
		const tagsRaw = String(form.get('tags') ?? '').trim();
		const noteKindRaw = String(form.get('note_kind') ?? '').trim();
		const status = String(form.get('status') ?? 'active');
		const extrasJson = String(form.get('extras') ?? '[]');
		const overridesJson = String(form.get('overrides') ?? '{}');

		if (!front) return fail(400, { message: 'front required' });

		let extras: ExtraField[] = [];
		let overrides: Record<string, boolean> = {};
		try {
			extras = JSON.parse(extrasJson);
			overrides = JSON.parse(overridesJson);
		} catch {
			return fail(400, { message: 'extras / overrides must be valid JSON' });
		}

		const tags = tagsRaw
			.split(',')
			.map((t) => t.trim())
			.filter(Boolean);
		const note_kind = noteKindRaw ? (noteKindRaw as NoteRow['note_kind']) : detectNoteKind(front);

		const { data: updated, error: ue } = await admin
			.from('notes')
			.update({
				front,
				back,
				note_kind,
				status: status as NoteRow['status'],
				extras,
				tags,
				card_type_overrides: overrides
			})
			.eq('id', params.id)
			.eq('user_id', userId)
			.select('*')
			.single();
		if (ue || !updated) return fail(500, { message: ue?.message ?? 'update failed' });
		const note = updated as NoteRow;

		await syncCardsForNote(admin, note);

		// If kind switched to word/phrase and no example exists yet, bootstrap.
		if (note.note_kind !== 'sentence') {
			const cur = await getCurrentExample(admin, note.id);
			if (!cur) {
				void bootstrapExamples(admin, note).catch((e) =>
					console.error('bootstrap examples failed', e)
				);
			}
		}

		throw redirect(303, `/cards/${note.id}`);
	},
	archive: async ({ locals, params }) => {
		const userId = locals.user!.id;
		const admin = locals.supabaseAdmin;
		await admin
			.from('notes')
			.update({ status: 'archived' })
			.eq('id', params.id)
			.eq('user_id', userId);
		throw redirect(303, '/cards');
	},
	delete: async ({ locals, params }) => {
		const userId = locals.user!.id;
		const admin = locals.supabaseAdmin;
		await admin.from('notes').delete().eq('id', params.id).eq('user_id', userId);
		throw redirect(303, '/cards');
	}
};
