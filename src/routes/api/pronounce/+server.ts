import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getPronunciationBackend } from '$lib/server/pronunciation';
import { textToPhonemes } from '$lib/server/ipa';

export const POST: RequestHandler = async ({ locals, request }) => {
	const userId = locals.user!.id;
	const admin = locals.supabaseAdmin;

	const form = await request.formData();
	const audio = form.get('audio');
	const text = String(form.get('text') ?? '').trim();
	const lang = String(form.get('lang') ?? '').trim();

	if (!(audio instanceof Blob) || !audio.size) throw error(400, 'audio blob required');
	if (!text) throw error(400, 'text required');

	const { data: settings } = await admin
		.from('settings')
		.select('pronunciation_rating_thresholds')
		.eq('user_id', userId)
		.maybeSingle();

	const thresholds = (settings?.pronunciation_rating_thresholds as
		| { good: number; hard: number; again: number }
		| null) ?? { good: 80, hard: 60, again: 40 };

	const expected = await textToPhonemes(admin, text, lang).catch(() => '');

	const backend = getPronunciationBackend();
	try {
		const result = await backend.score({
			audio,
			text,
			expectedPhonemes: expected || undefined,
			lang: lang || undefined,
			thresholds
		});
		return json(result);
	} catch (e) {
		throw error(500, e instanceof Error ? e.message : String(e));
	}
};
