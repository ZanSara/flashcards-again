import {
	createEmptyCard,
	fsrs,
	generatorParameters,
	Rating,
	State,
	type Card as FsrsCard,
	type FSRSParameters,
	type Grade,
	type RecordLogItem
} from 'ts-fsrs';
import type { CardRow } from '$lib/database.types';

/** Map our 1..4 rating ints to ts-fsrs Grade. */
export const Ratings = {
	Again: Rating.Again as Grade,
	Hard: Rating.Hard as Grade,
	Good: Rating.Good as Grade,
	Easy: Rating.Easy as Grade
} as const;

export type RatingInt = 1 | 2 | 3 | 4;

export function ratingFromInt(n: number): Grade {
	if (n === 1) return Rating.Again;
	if (n === 2) return Rating.Hard;
	if (n === 3) return Rating.Good;
	if (n === 4) return Rating.Easy;
	throw new Error(`Invalid rating: ${n}`);
}

/** Build the FSRS scheduler. Pass user-overridden params to customise. */
export function buildScheduler(overrides: Partial<FSRSParameters> = {}) {
	const params = generatorParameters(overrides);
	return fsrs(params);
}

/** Convert a DB card row into a ts-fsrs Card. */
export function rowToCard(row: Pick<
	CardRow,
	'due' | 'stability' | 'difficulty' | 'state' | 'last_review' | 'reps' | 'lapses'
>): FsrsCard {
	return {
		due: new Date(row.due),
		stability: row.stability,
		difficulty: row.difficulty,
		state: row.state as State,
		last_review: row.last_review ? new Date(row.last_review) : undefined,
		// elapsed_days/scheduled_days are deprecated in ts-fsrs ≥ 5; ignored at runtime
		elapsed_days: 0,
		scheduled_days: 0,
		learning_steps: 0,
		reps: row.reps,
		lapses: row.lapses
	};
}

/** Project a ts-fsrs Card back into the DB row columns we update. */
export function cardToRowUpdate(c: FsrsCard): Pick<
	CardRow,
	'due' | 'stability' | 'difficulty' | 'state' | 'last_review' | 'reps' | 'lapses' | 'step'
> {
	return {
		due: c.due.toISOString(),
		stability: c.stability,
		difficulty: c.difficulty,
		state: c.state as number,
		last_review: c.last_review ? c.last_review.toISOString() : null,
		reps: c.reps,
		lapses: c.lapses,
		step: c.learning_steps
	};
}

/** Build a brand-new (unreviewed) card row scheduled for `now`. */
export function emptyCardRowState(now: Date = new Date()) {
	const c = createEmptyCard(now);
	return cardToRowUpdate(c);
}

export interface ReviewResult {
	previousCard: FsrsCard;
	nextCard: FsrsCard;
	logItem: RecordLogItem;
}

/** Apply a rating to a card row and return both states + the log entry. */
export function applyRating(
	row: Pick<
		CardRow,
		'due' | 'stability' | 'difficulty' | 'state' | 'last_review' | 'reps' | 'lapses'
	>,
	rating: Grade,
	now: Date,
	scheduler = buildScheduler()
): ReviewResult {
	const previousCard = rowToCard(row);
	const item = scheduler.next(previousCard, now, rating);
	return { previousCard, nextCard: item.card, logItem: item };
}

export { State, Rating };
