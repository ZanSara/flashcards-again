import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { textToPhonemes } from '$lib/server/ipa';

export const GET: RequestHandler = async ({ locals, url }) => {
	const admin = locals.supabaseAdmin;
	const text = url.searchParams.get('text');
	const lang = url.searchParams.get('lang') ?? '';
	if (!text) throw error(400, 'text required');
	try {
		const phonemes = await textToPhonemes(admin, text, lang);
		return json({ text, lang, phonemes });
	} catch (e) {
		throw error(500, e instanceof Error ? e.message : String(e));
	}
};
