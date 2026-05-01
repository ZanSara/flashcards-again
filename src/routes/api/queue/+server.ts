import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { buildQueue } from '$lib/server/queue';

export const GET: RequestHandler = async ({ locals }) => {
	const userId = locals.user!.id;
	const admin = locals.supabaseAdmin;

	const { data: settings } = await admin
		.from('settings')
		.select('daily_new_limit')
		.eq('user_id', userId)
		.maybeSingle();

	const limit = settings?.daily_new_limit ?? null;
	const cards = await buildQueue(admin, userId, limit);
	return json({ cards });
};
