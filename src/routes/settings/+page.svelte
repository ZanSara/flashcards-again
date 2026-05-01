<script lang="ts">
	import { enhance } from '$app/forms';
	import { untrack } from 'svelte';
	import ExtrasEditor from '$lib/components/ExtrasEditor.svelte';
	import type { ExtraField } from '$lib/database.types';

	let { data, form } = $props();
	const initial = $derived(data.settings);

	let dailyLimit = $state(
		untrack(() =>
			data.settings?.daily_new_limit === null || data.settings?.daily_new_limit === undefined
				? ''
				: String(data.settings.daily_new_limit)
		)
	);
	let pendingThreshold = $state(untrack(() => data.settings?.pending_threshold ?? 10));
	let poolSize = $state(untrack(() => data.settings?.example_sentence_pool_size ?? 2));
	let ttsVoice = $state(untrack(() => data.settings?.tts_voice ?? 'openai-alloy'));
	let fsrsParams = $state(
		untrack(() => JSON.stringify(data.settings?.fsrs_params ?? {}, null, 2))
	);
	let thresholds = $state(
		untrack(() =>
			JSON.stringify(
				data.settings?.pronunciation_rating_thresholds ?? { good: 80, hard: 60, again: 40 },
				null,
				2
			)
		)
	);
	let defaultExtras = $state<ExtraField[]>(
		untrack(() => structuredClone(data.settings?.default_extras ?? []))
	);
</script>

<svelte:head>
	<title>Settings · flashcards-again</title>
</svelte:head>

<section class="space-y-4">
	<h1 class="text-2xl font-semibold tracking-tight">Settings</h1>

	{#if form?.message}
		<p class="text-sm text-rose-600 dark:text-rose-400" role="alert">{form.message}</p>
	{/if}

	<form method="post" action="?/save" use:enhance class="card space-y-4">
		<input type="hidden" name="default_extras" value={JSON.stringify(defaultExtras)} />

		<div class="grid gap-3 sm:grid-cols-3">
			<label class="space-y-1">
				<span class="label">Daily new limit (blank = unlimited)</span>
				<input
					type="number"
					min="0"
					class="input"
					name="daily_new_limit"
					bind:value={dailyLimit}
					aria-label="Daily new card limit"
				/>
			</label>
			<label class="space-y-1">
				<span class="label">Auto-suggest threshold</span>
				<input
					type="number"
					min="0"
					class="input"
					name="pending_threshold"
					bind:value={pendingThreshold}
					aria-label="Pending suggestion threshold"
				/>
			</label>
			<label class="space-y-1">
				<span class="label">Example sentence pool size</span>
				<input
					type="number"
					min="1"
					class="input"
					name="example_sentence_pool_size"
					bind:value={poolSize}
					aria-label="Example sentence pool size"
				/>
			</label>
			<label class="space-y-1 sm:col-span-3">
				<span class="label">TTS voice</span>
				<select class="input" name="tts_voice" bind:value={ttsVoice} aria-label="TTS voice">
					<option value="openai-alloy">openai · alloy</option>
					<option value="openai-shimmer">openai · shimmer</option>
					<option value="openai-nova">openai · nova</option>
					<option value="openai-onyx">openai · onyx</option>
					<option value="openai-echo">openai · echo</option>
					<option value="openai-fable">openai · fable</option>
					<option value="espeak">espeak (free, robotic)</option>
				</select>
			</label>
		</div>

		<label class="space-y-1">
			<span class="label">Pronunciation rating thresholds (JSON)</span>
			<textarea
				name="pronunciation_rating_thresholds"
				class="input min-h-24 font-mono"
				bind:value={thresholds}
				aria-label="Pronunciation rating thresholds JSON"
			></textarea>
		</label>

		<label class="space-y-1">
			<span class="label">FSRS params override (JSON)</span>
			<textarea
				name="fsrs_params"
				class="input min-h-24 font-mono"
				bind:value={fsrsParams}
				aria-label="FSRS parameters JSON"
			></textarea>
		</label>

		<div class="space-y-2">
			<p class="label">Default extras (copied into every new note)</p>
			<ExtrasEditor bind:extras={defaultExtras} />
		</div>

		<div class="flex flex-wrap items-center gap-2">
			<button type="submit" class="btn-primary" aria-label="Save settings">Save</button>
		</div>
	</form>

	<form method="post" action="?/backfill" use:enhance class="card flex items-center justify-between">
		<div>
			<p class="text-sm font-medium">Backfill defaults to existing notes</p>
			<p class="text-xs text-slate-500 dark:text-slate-400">
				Adds any missing keys from <code>default_extras</code> to existing notes' extras
				(without overwriting user-set values).
			</p>
		</div>
		<button type="submit" class="btn-secondary" aria-label="Backfill default extras">
			Run backfill
		</button>
	</form>

	{#if initial}
		<p class="text-xs text-slate-500 dark:text-slate-400">
			Last updated: {new Date(initial.updated_at).toLocaleString()}
		</p>
	{/if}
</section>
