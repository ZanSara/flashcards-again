import { buildQueue, type QueueCard } from '$lib/server/queue';
import { getCurrentExample } from '$lib/server/exampleSentences';
import { maybeAutoSuggest } from '$lib/server/suggest';
import type { ExampleSentenceRow } from '$lib/database.types';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	const userId = locals.user!.id;
	const admin = locals.supabaseAdmin;

	const { data: settings } = await admin
		.from('settings')
		.select('daily_new_limit')
		.eq('user_id', userId)
		.maybeSingle();

	let cards: QueueCard[] = [];
	let examples: Record<string, ExampleSentenceRow | null> = {};

	// Background-only: top up pending suggestions if we're under the threshold.
	void maybeAutoSuggest(admin, userId).catch((e) => console.error('auto-suggest failed', e));

	try {
		cards = await buildQueue(admin, userId, settings?.daily_new_limit ?? null);
		// Pre-fetch the current example for each note that has cloze/audio cards using example_sentence
		const noteIds = Array.from(
			new Set(
				cards
					.filter((c) => {
						const v = c.variant as { source?: string } | null;
						return v?.source === 'example_sentence';
					})
					.map((c) => c.note_id)
			)
		);
		const examplePairs = await Promise.all(
			noteIds.map(async (id) => [id, await getCurrentExample(admin, id)] as const)
		);
		examples = Object.fromEntries(examplePairs);
	} catch (e) {
		console.error('queue load failed', e);
	}

	return { cards, examples };
};
