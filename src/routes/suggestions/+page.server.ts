import type { Actions, PageServerLoad } from './$types';
import type { NoteRow } from '$lib/database.types';
import { fail, redirect } from '@sveltejs/kit';
import { syncCardsForNote } from '$lib/server/cardSync';
import { bootstrapExamples } from '$lib/server/exampleSentences';

export const load: PageServerLoad = async ({ locals }) => {
	const userId = locals.user!.id;
	const admin = locals.supabaseAdmin;
	const { data } = await admin
		.from('notes')
		.select('*')
		.eq('user_id', userId)
		.eq('status', 'pending')
		.order('created_at', { ascending: false })
		.limit(100);
	return { suggestions: (data ?? []) as NoteRow[] };
};

export const actions: Actions = {
	approve: async ({ locals, request }) => {
		const userId = locals.user!.id;
		const admin = locals.supabaseAdmin;
		const form = await request.formData();
		const id = String(form.get('id') ?? '');
		if (!id) return fail(400, { message: 'id required' });

		const { data: rows, error: e } = await admin
			.from('notes')
			.update({ status: 'active' })
			.eq('id', id)
			.eq('user_id', userId)
			.select('*')
			.single();
		if (e || !rows) return fail(500, { message: e?.message ?? 'approve failed' });
		const note = rows as NoteRow;
		await syncCardsForNote(admin, note);
		if (note.note_kind !== 'sentence') {
			void bootstrapExamples(admin, note).catch((err) =>
				console.error('bootstrap failed', err)
			);
		}
		return { ok: true };
	},
	reject: async ({ locals, request }) => {
		const userId = locals.user!.id;
		const admin = locals.supabaseAdmin;
		const form = await request.formData();
		const id = String(form.get('id') ?? '');
		if (!id) return fail(400, { message: 'id required' });
		await admin.from('notes').delete().eq('id', id).eq('user_id', userId);
		return { ok: true };
	},
	suggestMore: async ({ fetch }) => {
		await fetch('/api/suggest', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ count: 5 })
		});
		throw redirect(303, '/suggestions');
	}
};
