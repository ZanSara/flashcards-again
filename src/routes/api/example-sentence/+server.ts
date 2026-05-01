import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import {
	bootstrapExamples,
	generateExample,
	getCurrentExample,
	rotateExample
} from '$lib/server/exampleSentences';
import type { NoteRow } from '$lib/database.types';

interface PostBody {
	note_id: string;
	action: 'bootstrap' | 'rotate' | 'preview';
	consumed_id?: string;
}

export const POST: RequestHandler = async ({ locals, request }) => {
	const userId = locals.user!.id;
	const admin = locals.supabaseAdmin;
	const body = (await request.json()) as PostBody;

	if (!body.note_id || !body.action) throw error(400, 'note_id and action required');

	const { data: noteRows, error: noteErr } = await admin
		.from('notes')
		.select('*')
		.eq('id', body.note_id)
		.eq('user_id', userId)
		.limit(1);
	if (noteErr) throw error(500, noteErr.message);
	const note = noteRows?.[0] as NoteRow | undefined;
	if (!note) throw error(404, 'note not found');

	if (body.action === 'bootstrap') {
		const result = await bootstrapExamples(admin, note);
		return json(result);
	}

	if (body.action === 'rotate') {
		if (!body.consumed_id) throw error(400, 'consumed_id required for rotate');
		await rotateExample(admin, note, body.consumed_id);
		const cur = await getCurrentExample(admin, note.id);
		return json({ current: cur });
	}

	if (body.action === 'preview') {
		const ex = await generateExample({ target: note.front, meaning: note.back });
		return json({ example: ex });
	}

	throw error(400, `unknown action: ${body.action}`);
};

export const GET: RequestHandler = async ({ locals, url }) => {
	const userId = locals.user!.id;
	const admin = locals.supabaseAdmin;
	const noteId = url.searchParams.get('note_id');
	if (!noteId) throw error(400, 'note_id required');

	const { data: existsRows } = await admin
		.from('notes')
		.select('id')
		.eq('id', noteId)
		.eq('user_id', userId)
		.maybeSingle();
	if (!existsRows) throw error(404, 'note not found');

	const cur = await getCurrentExample(admin, noteId);
	return json({ current: cur });
};
