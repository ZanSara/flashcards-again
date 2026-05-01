import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { applyRating, buildScheduler, cardToRowUpdate, ratingFromInt } from '$lib/server/fsrs';
import { rotateExample } from '$lib/server/exampleSentences';
import type { CardRow, ClozeVariant, NoteRow, ReviewRow } from '$lib/database.types';

interface ReviewBody {
	card_id: string;
	rating: 1 | 2 | 3 | 4;
	elapsed_ms?: number;
	example_sentence_id?: string | null;
}

export const POST: RequestHandler = async ({ locals, request }) => {
	const userId = locals.user!.id;
	const admin = locals.supabaseAdmin;
	const body = (await request.json()) as ReviewBody;

	if (!body.card_id || !body.rating) {
		throw error(400, 'card_id and rating are required');
	}

	const grade = ratingFromInt(body.rating);

	const { data: cardRows, error: cardErr } = await admin
		.from('cards')
		.select('*')
		.eq('id', body.card_id)
		.eq('user_id', userId)
		.limit(1);
	if (cardErr) throw error(500, cardErr.message);
	const card = cardRows?.[0];
	if (!card) throw error(404, 'card not found');

	const { data: settings } = await admin
		.from('settings')
		.select('fsrs_params')
		.eq('user_id', userId)
		.maybeSingle();

	const scheduler = buildScheduler(
		(settings?.fsrs_params as Record<string, unknown> | null) ?? {}
	);

	const now = new Date();
	const result = applyRating(card as CardRow, grade, now, scheduler);
	const update = cardToRowUpdate(result.nextCard);

	const reviewRow: Partial<ReviewRow> = {
		card_id: card.id,
		user_id: userId,
		rating: body.rating,
		reviewed_at: now.toISOString(),
		elapsed_ms: body.elapsed_ms ?? 0,
		prev_state: {
			due: card.due,
			stability: card.stability,
			difficulty: card.difficulty,
			state: card.state,
			reps: card.reps,
			lapses: card.lapses
		},
		new_state: {
			due: update.due,
			stability: update.stability,
			difficulty: update.difficulty,
			state: update.state,
			reps: update.reps,
			lapses: update.lapses,
			step: update.step
		},
		example_sentence_id: body.example_sentence_id ?? null
	};

	const { error: upErr } = await admin
		.from('cards')
		.update(update)
		.eq('id', card.id)
		.eq('user_id', userId);
	if (upErr) throw error(500, upErr.message);

	const { error: insErr } = await admin.from('reviews').insert(reviewRow);
	if (insErr) throw error(500, insErr.message);

	// If this card consumed a rotating example sentence, advance the rotation.
	if (body.example_sentence_id) {
		const variant = card.variant as ClozeVariant | null;
		const usedExample =
			variant && 'source' in variant && variant.source === 'example_sentence';
		const usedAudio =
			(card.card_type === 'audio_recognition' || card.card_type === 'audio_choice') &&
			(card.variant as { source?: string }).source === 'example_sentence';

		if (usedExample || usedAudio) {
			const { data: noteRows } = await admin
				.from('notes')
				.select('*')
				.eq('id', card.note_id)
				.eq('user_id', userId)
				.limit(1);
			const note = noteRows?.[0] as NoteRow | undefined;
			if (note) {
				// Don't await — the response should not block on background generation.
				void rotateExample(admin, note, body.example_sentence_id).catch((e) =>
					console.error('rotation failed', e)
				);
			}
		}
	}

	return json({
		card: { ...card, ...update },
		review: reviewRow
	});
};
