import type { Actions, PageServerLoad } from './$types';
import type { ExtraField, NoteRow, SettingsRow } from '$lib/database.types';
import { fail } from '@sveltejs/kit';

export const load: PageServerLoad = async ({ locals }) => {
	const userId = locals.user!.id;
	const admin = locals.supabaseAdmin;
	const { data } = await admin
		.from('settings')
		.select('*')
		.eq('user_id', userId)
		.maybeSingle();
	return {
		settings: (data as SettingsRow | null) ?? null
	};
};

export const actions: Actions = {
	save: async ({ locals, request }) => {
		const userId = locals.user!.id;
		const admin = locals.supabaseAdmin;
		const form = await request.formData();

		const dailyLimitRaw = String(form.get('daily_new_limit') ?? '').trim();
		const daily_new_limit = dailyLimitRaw === '' ? null : parseInt(dailyLimitRaw, 10);
		const pending_threshold = parseInt(String(form.get('pending_threshold') ?? '10'), 10);
		const example_sentence_pool_size = parseInt(
			String(form.get('example_sentence_pool_size') ?? '2'),
			10
		);
		const tts_voice = String(form.get('tts_voice') ?? 'openai-alloy');
		const fsrsParamsJson = String(form.get('fsrs_params') ?? '{}');
		const thresholdsJson = String(form.get('pronunciation_rating_thresholds') ?? '{}');
		const defaultExtrasJson = String(form.get('default_extras') ?? '[]');

		let fsrs_params: Record<string, unknown> = {};
		let pronunciation_rating_thresholds = { good: 80, hard: 60, again: 40 };
		let default_extras: ExtraField[] = [];
		try {
			fsrs_params = JSON.parse(fsrsParamsJson);
			pronunciation_rating_thresholds = {
				...pronunciation_rating_thresholds,
				...JSON.parse(thresholdsJson)
			};
			default_extras = JSON.parse(defaultExtrasJson);
		} catch {
			return fail(400, { message: 'invalid JSON in one of the fields' });
		}

		const update: Partial<SettingsRow> = {
			user_id: userId,
			daily_new_limit: Number.isFinite(daily_new_limit) ? daily_new_limit : null,
			pending_threshold,
			example_sentence_pool_size,
			tts_voice,
			fsrs_params,
			pronunciation_rating_thresholds,
			default_extras
		};
		const { error: e } = await admin
			.from('settings')
			.upsert(update, { onConflict: 'user_id' });
		if (e) return fail(500, { message: e.message });
		return { ok: true };
	},

	backfill: async ({ locals }) => {
		const userId = locals.user!.id;
		const admin = locals.supabaseAdmin;
		const { data: settings } = await admin
			.from('settings')
			.select('default_extras')
			.eq('user_id', userId)
			.maybeSingle();
		const defaults = (settings?.default_extras ?? []) as ExtraField[];
		if (defaults.length === 0) return { ok: true, updated: 0 };

		const { data: notes } = await admin
			.from('notes')
			.select('id, extras')
			.eq('user_id', userId);
		let updated = 0;
		for (const n of (notes ?? []) as Pick<NoteRow, 'id' | 'extras'>[]) {
			const extras = (n.extras ?? []) as ExtraField[];
			const existingKeys = new Set(extras.map((e) => e.key));
			const additions = defaults.filter((d) => !existingKeys.has(d.key));
			if (additions.length === 0) continue;
			await admin
				.from('notes')
				.update({ extras: [...extras, ...additions] })
				.eq('id', n.id);
			updated += 1;
		}
		return { ok: true, updated };
	}
};
