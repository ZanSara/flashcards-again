import { createHash } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database, MediaRow } from '$lib/database.types';
import { getOpenAI, Models } from './openai';
import { phonemeServerUrl } from './env';

const BUCKET = 'media';

type Voice = string; // 'openai-<voice>' or 'espeak'

function isEspeakVoice(voice: Voice): boolean {
	return voice === 'espeak' || voice.startsWith('espeak:');
}

function openaiVoiceName(voice: Voice): string {
	// 'openai-alloy' → 'alloy'; bare voice falls back to default
	if (voice.startsWith('openai-')) return voice.slice('openai-'.length);
	return Models.ttsVoice;
}

function audioPath(sha: string, mime: string): string {
	const ext = mime === 'audio/mpeg' ? 'mp3' : mime === 'audio/wav' ? 'wav' : 'bin';
	return `audio/${sha}.${ext}`;
}

export interface SynthesisResult {
	sha256: string;
	mime: string;
	bytes: number;
	storage_path: string;
	signedUrl: string;
}

async function synthOpenAI(text: string, voice: string): Promise<{ buffer: Buffer; mime: string }> {
	const oa = getOpenAI();
	const resp = await oa.audio.speech.create({
		model: Models.tts,
		voice: voice as 'alloy',
		input: text,
		response_format: 'mp3'
	});
	const ab = await resp.arrayBuffer();
	return { buffer: Buffer.from(ab), mime: 'audio/mpeg' };
}

async function synthEspeak(text: string, lang: string): Promise<{ buffer: Buffer; mime: string }> {
	const res = await fetch(`${phonemeServerUrl()}/tts-espeak`, {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({ text, lang })
	});
	if (!res.ok) throw new Error(`espeak TTS failed: ${res.status} ${await res.text()}`);
	const ab = await res.arrayBuffer();
	return { buffer: Buffer.from(ab), mime: 'audio/wav' };
}

/**
 * Get a signed URL for the TTS rendering of `text` in the given voice. Caches
 * the audio in Supabase Storage keyed by sha256(voice|model|text).
 */
export async function ttsForText(
	admin: SupabaseClient<Database>,
	userId: string,
	text: string,
	opts: { voice?: Voice; lang?: string } = {}
): Promise<SynthesisResult> {
	const voice = opts.voice ?? 'openai-alloy';
	const lang = opts.lang ?? '';
	const cacheKey = `${voice}|${Models.tts}|${lang}|${text}`;
	const sha = createHash('sha256').update(cacheKey).digest('hex');

	const { data: existing } = await admin
		.from('media')
		.select('*')
		.eq('sha256', sha)
		.maybeSingle();

	let row: MediaRow | null = (existing as MediaRow | null) ?? null;

	if (!row) {
		const { buffer, mime } = isEspeakVoice(voice)
			? await synthEspeak(text, lang)
			: await synthOpenAI(text, openaiVoiceName(voice));
		const path = audioPath(sha, mime);

		const { error: upErr } = await admin.storage
			.from(BUCKET)
			.upload(path, buffer, { contentType: mime, upsert: true });
		if (upErr) throw upErr;

		const insertRow: Partial<MediaRow> = {
			sha256: sha,
			user_id: userId,
			mime,
			bytes: buffer.byteLength,
			storage_path: path,
			kind: 'tts'
		};
		const { data: inserted, error: insErr } = await admin
			.from('media')
			.insert(insertRow)
			.select('*')
			.single();
		if (insErr) throw insErr;
		row = inserted as MediaRow;
	}

	const { data: signed, error: sErr } = await admin.storage
		.from(BUCKET)
		.createSignedUrl(row.storage_path, 60 * 30);
	if (sErr) throw sErr;

	return {
		sha256: row.sha256,
		mime: row.mime,
		bytes: row.bytes,
		storage_path: row.storage_path,
		signedUrl: signed.signedUrl
	};
}
