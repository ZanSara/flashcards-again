import type { Handle } from '@sveltejs/kit';
import { sequence } from '@sveltejs/kit/hooks';
import { buildSoloUser, ensureOwnerBootstrapped, ensureSoloCookie } from '$lib/server/soloAuth';
import { createRequestClient, getAdminClient } from '$lib/server/supabase';

const supabase: Handle = async ({ event, resolve }) => {
	event.locals.supabase = createRequestClient(event.cookies);
	event.locals.supabaseAdmin = getAdminClient();
	return resolve(event, {
		filterSerializedResponseHeaders: (name) => name === 'content-range' || name === 'x-supabase-api-version'
	});
};

const soloAuth: Handle = async ({ event, resolve }) => {
	const { uid } = ensureSoloCookie(event.cookies);
	event.locals.user = buildSoloUser(uid);
	event.locals.session = null;
	await ensureOwnerBootstrapped(event.locals.supabaseAdmin, uid).catch(() => {});
	return resolve(event);
};

export const handle: Handle = sequence(supabase, soloAuth);
