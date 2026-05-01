import type { PageServerLoad, Actions } from './$types';
import type { NoteRow, NoteStatus, CardType } from '$lib/database.types';
import { fail, redirect } from '@sveltejs/kit';
import { detectNoteKind } from '$lib/cards/kindDetector';
import { syncCardsForNote } from '$lib/server/cardSync';
import { bootstrapExamples } from '$lib/server/exampleSentences';

export const load: PageServerLoad = async ({ locals, url }) => {
	const userId = locals.user!.id;
	const admin = locals.supabaseAdmin;

	const q = url.searchParams.get('q') ?? '';
	const tag = url.searchParams.get('tag') ?? '';
	const status = (url.searchParams.get('status') ?? 'active') as NoteStatus | '';
	const cardType = (url.searchParams.get('card_type') ?? '') as CardType | '';
	const dueBefore = url.searchParams.get('due_before') ?? '';

	let query = admin.from('notes').select('*').eq('user_id', userId);
	if (status) query = query.eq('status', status);
	if (tag) query = query.contains('tags', [tag]);
	if (q) {
		query = query.or(`front.ilike.%${q}%,back.ilike.%${q}%`);
	}
	const { data: notesRaw } = await query.order('updated_at', { ascending: false }).limit(200);
	let notes = (notesRaw ?? []) as NoteRow[];

	if (cardType || dueBefore) {
		let cardQuery = admin.from('cards').select('note_id').eq('user_id', userId);
		if (cardType) cardQuery = cardQuery.eq('card_type', cardType);
		if (dueBefore) cardQuery = cardQuery.lte('due', new Date(dueBefore).toISOString());
		const { data: cardRows } = await cardQuery.limit(2000);
		const allowed = new Set((cardRows ?? []).map((c) => c.note_id));
		notes = notes.filter((n) => allowed.has(n.id));
	}

	const { data: tagRows } = await admin.from('notes').select('tags').eq('user_id', userId);
	const tagSet = new Set<string>();
	for (const r of tagRows ?? []) for (const t of r.tags ?? []) tagSet.add(t);

	return {
		notes,
		availableTags: Array.from(tagSet).sort(),
		filters: { q, tag, status, cardType, dueBefore }
	};
};

export const actions: Actions = {
	delete: async ({ locals, request }) => {
		const userId = locals.user!.id;
		const admin = locals.supabaseAdmin;
		const form = await request.formData();
		const id = String(form.get('id') ?? '');
		if (!id) return fail(400, { message: 'id required' });
		await admin.from('notes').delete().eq('id', id).eq('user_id', userId);
		return { ok: true };
	},
	createQuick: async ({ locals, request }) => {
		const userId = locals.user!.id;
		const admin = locals.supabaseAdmin;
		const form = await request.formData();
		const front = String(form.get('front') ?? '').trim();
		const back = String(form.get('back') ?? '').trim() || null;
		if (!front) return fail(400, { message: 'front required' });

		const { data: settings } = await admin
			.from('settings')
			.select('default_extras')
			.eq('user_id', userId)
			.maybeSingle();
		const extras = (settings?.default_extras ?? []) as NoteRow['extras'];

		const note_kind = detectNoteKind(front);
		const { data: created, error: ce } = await admin
			.from('notes')
			.insert({
				user_id: userId,
				front,
				back,
				note_kind,
				extras,
				tags: [],
				properties: {},
				source: 'manual',
				status: 'active',
				card_type_overrides: {}
			})
			.select('*')
			.single();
		if (ce || !created) return fail(500, { message: ce?.message ?? 'create failed' });
		const note = created as NoteRow;

		await syncCardsForNote(admin, note);
		void bootstrapExamples(admin, note).catch((e) =>
			console.error('bootstrap examples failed', e)
		);

		throw redirect(303, `/cards/${note.id}`);
	}
};
