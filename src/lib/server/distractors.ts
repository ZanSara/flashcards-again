import { getOpenAI, Models } from './openai';

const SYSTEM = `You generate near-distractor words/phrases for an audio
multiple-choice flashcard. Given a target string, return 3 plausible alternatives
that a learner could MISHEAR for the target — they should differ minimally
(by 1-2 phonemes, or by stress) but be valid words/phrases in the same
language. Output ONLY a JSON array of 3 strings, no prose.`;

export async function generateDistractors(target: string): Promise<string[]> {
	const oa = getOpenAI();
	const resp = await oa.chat.completions.create({
		model: Models.chat,
		response_format: { type: 'json_object' },
		messages: [
			{ role: 'system', content: SYSTEM },
			{ role: 'user', content: `Target: ${target}\n\nReturn { "distractors": [...] }` }
		]
	});
	const raw = resp.choices[0]?.message?.content ?? '';
	try {
		const parsed = JSON.parse(raw) as { distractors?: unknown };
		const arr = Array.isArray(parsed.distractors) ? parsed.distractors : [];
		return arr.filter((s): s is string => typeof s === 'string').slice(0, 3);
	} catch {
		return [];
	}
}
