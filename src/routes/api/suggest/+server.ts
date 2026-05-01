import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import {
	generateSuggestions,
	insertSuggestions,
	maybeAutoSuggest
} from '$lib/server/suggest';

interface PostBody {
	auto?: boolean;
	count?: number;
	hint?: string;
	tag?: string;
}

export const POST: RequestHandler = async ({ locals, request }) => {
	const userId = locals.user!.id;
	const admin = locals.supabaseAdmin;
	const body = (await request.json().catch(() => ({}))) as PostBody;

	try {
		if (body.auto) {
			const r = await maybeAutoSuggest(admin, userId);
			return json(r);
		}
		const items = await generateSuggestions(admin, userId, {
			count: body.count,
			hint: body.hint,
			tagFilter: body.tag
		});
		const inserted = await insertSuggestions(admin, userId, items);
		return json({ generated: items.length, inserted });
	} catch (e) {
		throw error(500, e instanceof Error ? e.message : String(e));
	}
};
