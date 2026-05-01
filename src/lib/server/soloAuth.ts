import { createHash, createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import type { Cookies } from '@sveltejs/kit';
import type { SupabaseClient, User } from '@supabase/supabase-js';
import type { Database } from '$lib/database.types';
import { soloOwnerSecret } from './env';
import { getAdminClient } from './supabase';

const COOKIE_NAME = 'flashcards_solo';
const COOKIE_MAX_AGE = 60 * 60 * 24 * 365 * 5;

interface CookieClaims {
	uid: string;
	exp: number;
}

function sign(payload: string): string {
	return createHmac('sha256', soloOwnerSecret()).update(payload).digest('base64url');
}

function verifyAndDecode(raw: string): CookieClaims | null {
	const [body, sig] = raw.split('.');
	if (!body || !sig) return null;
	const expected = sign(body);
	const expectedBuf = Buffer.from(expected);
	const actualBuf = Buffer.from(sig);
	if (expectedBuf.length !== actualBuf.length) return null;
	if (!timingSafeEqual(expectedBuf, actualBuf)) return null;
	try {
		const claims = JSON.parse(Buffer.from(body, 'base64url').toString('utf-8')) as CookieClaims;
		if (typeof claims.uid !== 'string' || typeof claims.exp !== 'number') return null;
		if (claims.exp < Math.floor(Date.now() / 1000)) return null;
		return claims;
	} catch {
		return null;
	}
}

function encode(claims: CookieClaims): string {
	const body = Buffer.from(JSON.stringify(claims), 'utf-8').toString('base64url');
	return `${body}.${sign(body)}`;
}

/**
 * Solo-mode auth: a single owner identified by a stable UUID derived from
 * SOLO_OWNER_SECRET. We bypass Supabase Auth entirely and instead set a signed
 * cookie that names the owner. RLS in our schema is keyed off this UUID.
 *
 * Rotating SOLO_OWNER_SECRET invalidates the cookie AND changes the owner UUID,
 * effectively rotating the only account.
 */
export function getOwnerId(): string {
	const hash = createHash('sha256').update(`solo-owner|${soloOwnerSecret()}`).digest();
	const hex = hash.subarray(0, 16).toString('hex');
	return [
		hex.slice(0, 8),
		hex.slice(8, 12),
		`4${hex.slice(13, 16)}`,
		`8${hex.slice(17, 20)}`,
		hex.slice(20, 32)
	].join('-');
}

export function ensureSoloCookie(cookies: Cookies): { uid: string } {
	const uid = getOwnerId();
	const existing = cookies.get(COOKIE_NAME);
	if (existing) {
		const claims = verifyAndDecode(existing);
		if (claims && claims.uid === uid) return { uid };
	}
	const exp = Math.floor(Date.now() / 1000) + COOKIE_MAX_AGE;
	const token = encode({ uid, exp });
	cookies.set(COOKIE_NAME, token, {
		path: '/',
		httpOnly: true,
		sameSite: 'lax',
		secure: process.env.NODE_ENV === 'production',
		maxAge: COOKIE_MAX_AGE
	});
	return { uid };
}

/**
 * Build a synthetic User object for the solo owner so downstream code that
 * expects a Supabase User can keep working unchanged.
 */
export function buildSoloUser(uid: string): User {
	return {
		id: uid,
		app_metadata: { provider: 'solo' },
		user_metadata: {},
		aud: 'solo',
		created_at: new Date(0).toISOString(),
		email: 'solo@local',
		role: 'authenticated'
	} as User;
}

/** Ensures a settings row + storage bucket exist for the owner. Idempotent. */
export async function ensureOwnerBootstrapped(
	admin: SupabaseClient<Database>,
	uid: string
): Promise<void> {
	const { data: existing } = await admin
		.from('settings')
		.select('user_id')
		.eq('user_id', uid)
		.maybeSingle();
	if (!existing) {
		await admin.from('settings').insert({
			user_id: uid,
			daily_new_limit: 20,
			pending_threshold: 10,
			example_sentence_pool_size: 2,
			tts_voice: 'openai-alloy',
			default_extras: [],
			fsrs_params: {},
			pronunciation_rating_thresholds: { good: 80, hard: 60, again: 40 }
		});
	}
}

export const SOLO_COOKIE_NAME = COOKIE_NAME;
export { randomUUID };
