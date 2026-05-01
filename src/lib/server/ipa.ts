import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database, IpaCacheRow } from '$lib/database.types';
import { phonemeBackend, phonemeServerUrl } from './env';

interface SidecarResponse {
	phonemes: string;
	backend_vocab: string;
}

async function callSidecar(text: string, lang: string): Promise<SidecarResponse> {
	const res = await fetch(`${phonemeServerUrl()}/text-to-phonemes`, {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({ text, lang })
	});
	if (!res.ok) throw new Error(`text-to-phonemes failed: ${res.status} ${await res.text()}`);
	return (await res.json()) as SidecarResponse;
}

/**
 * Convert text to phonemes (the recogniser's vocabulary) with an in-DB cache.
 * The cache key includes the active backend's vocabulary tag so swapping
 * backends does not poison previous entries.
 */
export async function textToPhonemes(
	admin: SupabaseClient<Database>,
	text: string,
	lang = ''
): Promise<string> {
	const backend = phonemeBackend();
	const { data: cached } = await admin
		.from('ipa_cache')
		.select('phonemes')
		.eq('text', text)
		.eq('lang', lang)
		.eq('backend_vocab', backend)
		.maybeSingle();
	if (cached) return cached.phonemes;

	const { phonemes, backend_vocab } = await callSidecar(text, lang);
	const row: Partial<IpaCacheRow> = {
		text,
		lang,
		backend_vocab: backend_vocab || backend,
		phonemes
	};
	await admin.from('ipa_cache').upsert(row, { onConflict: 'text,lang,backend_vocab' });
	return phonemes;
}
