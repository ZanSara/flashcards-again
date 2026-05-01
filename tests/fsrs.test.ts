import { describe, expect, it } from 'vitest';
import {
	applyRating,
	buildScheduler,
	cardToRowUpdate,
	emptyCardRowState,
	Ratings,
	State
} from '../src/lib/server/fsrs';

describe('fsrs adapter', () => {
	it('emptyCardRowState produces a New card due now', () => {
		const now = new Date('2026-01-01T00:00:00Z');
		const state = emptyCardRowState(now);
		expect(state.state).toBe(State.New);
		expect(state.reps).toBe(0);
		expect(state.lapses).toBe(0);
		expect(new Date(state.due).getTime()).toBe(now.getTime());
	});

	it('rating Good on a New card schedules it in the future', () => {
		const now = new Date('2026-01-01T00:00:00Z');
		const initial = emptyCardRowState(now);
		const result = applyRating(
			{
				due: initial.due,
				stability: initial.stability,
				difficulty: initial.difficulty,
				state: initial.state,
				last_review: initial.last_review,
				reps: initial.reps,
				lapses: initial.lapses
			},
			Ratings.Good,
			now
		);
		const next = cardToRowUpdate(result.nextCard);
		expect(new Date(next.due).getTime()).toBeGreaterThan(now.getTime());
		expect(next.reps).toBe(1);
	});

	it('rating Easy on a New card promotes state past New', () => {
		const now = new Date('2026-01-01T00:00:00Z');
		const initial = emptyCardRowState(now);
		const result = applyRating(initial, Ratings.Easy, now);
		const next = cardToRowUpdate(result.nextCard);
		expect(next.state).not.toBe(State.New);
		expect(next.reps).toBe(1);
	});

	it('preserves rating round-trip through cardToRowUpdate', () => {
		const now = new Date('2026-01-01T00:00:00Z');
		let row = emptyCardRowState(now);
		const result = applyRating(row, Ratings.Good, now);
		row = cardToRowUpdate(result.nextCard);
		// stability and difficulty should be positive after a Good rating
		expect(row.stability).toBeGreaterThan(0);
		expect(row.difficulty).toBeGreaterThan(0);
	});
});
