import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { ttsForText } from '$lib/server/tts';

export const GET: RequestHandler = async ({ locals, url }) => {
	const userId = locals.user!.id;
	const admin = locals.supabaseAdmin;
	const text = url.searchParams.get('text');
	const lang = url.searchParams.get('lang') ?? '';
	if (!text) throw error(400, 'text required');

	const { data: settings } = await admin
		.from('settings')
		.select('tts_voice')
		.eq('user_id', userId)
		.maybeSingle();
	const voice = settings?.tts_voice ?? 'openai-alloy';

	try {
		const result = await ttsForText(admin, userId, text, { voice, lang });
		return json(result);
	} catch (e) {
		throw error(500, e instanceof Error ? e.message : String(e));
	}
};
