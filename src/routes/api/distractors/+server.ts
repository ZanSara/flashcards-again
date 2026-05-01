import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { generateDistractors } from '$lib/server/distractors';

export const GET: RequestHandler = async ({ url }) => {
	const text = url.searchParams.get('text');
	if (!text) throw error(400, 'text required');
	try {
		const distractors = await generateDistractors(text);
		return json({ distractors });
	} catch (e) {
		throw error(500, e instanceof Error ? e.message : String(e));
	}
};
