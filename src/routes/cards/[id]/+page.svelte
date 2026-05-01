<script lang="ts">
	import { enhance } from '$app/forms';
	import { untrack } from 'svelte';
	import ExtrasEditor from '$lib/components/ExtrasEditor.svelte';
	import type { ExtraField } from '$lib/database.types';

	let { data } = $props();

	// Edit form snapshot: initialised once from server data; stays decoupled from
	// subsequent $props updates by design (avoids stomping unsaved edits).
	let front = $state(untrack(() => data.note.front));
	let back = $state(untrack(() => data.note.back ?? ''));
	let noteKind = $state(untrack(() => data.note.note_kind));
	let status = $state(untrack(() => data.note.status));
	let tagsString = $state(untrack(() => data.note.tags.join(', ')));
	let extras = $state<ExtraField[]>(untrack(() => structuredClone(data.note.extras ?? [])));
	let overrides = $state<Record<string, boolean>>(
		untrack(() => structuredClone((data.note.card_type_overrides ?? {}) as Record<string, boolean>))
	);

	const cardKeys = [
		'basic',
		'basic_reversed',
		'cloze.recognize',
		'cloze.produce',
		'audio_recognition',
		'audio_choice',
		'pronunciation'
	] as const;

	function isOn(key: string, defaultOn: boolean): boolean {
		return key in overrides ? overrides[key] : defaultOn;
	}

	function setOn(key: string, on: boolean) {
		overrides = { ...overrides, [key]: on };
	}
</script>

<svelte:head>
	<title>{data.note.front} · cards</title>
</svelte:head>

<section class="space-y-6">
	<header class="flex items-baseline justify-between">
		<h1 class="text-2xl font-semibold tracking-tight">Edit note</h1>
		<a class="text-sm underline text-slate-500" href="/cards">← back to all</a>
	</header>

	<form method="post" action="?/save" use:enhance class="card space-y-4">
		<input type="hidden" name="extras" value={JSON.stringify(extras)} />
		<input type="hidden" name="overrides" value={JSON.stringify(overrides)} />

		<div class="grid gap-3 sm:grid-cols-2">
			<label class="space-y-1">
				<span class="label">Front</span>
				<input class="input" name="front" bind:value={front} required aria-label="Front" />
			</label>
			<label class="space-y-1">
				<span class="label">Back</span>
				<input class="input" name="back" bind:value={back} aria-label="Back" />
			</label>
			<label class="space-y-1">
				<span class="label">Kind</span>
				<select class="input" name="note_kind" bind:value={noteKind} aria-label="Note kind">
					<option value="word">word</option>
					<option value="phrase">phrase</option>
					<option value="sentence">sentence</option>
				</select>
			</label>
			<label class="space-y-1">
				<span class="label">Status</span>
				<select class="input" name="status" bind:value={status} aria-label="Status">
					<option value="active">active</option>
					<option value="pending">pending</option>
					<option value="archived">archived</option>
				</select>
			</label>
			<label class="space-y-1 sm:col-span-2">
				<span class="label">Tags (comma-separated)</span>
				<input class="input" name="tags" bind:value={tagsString} aria-label="Tags" />
			</label>
		</div>

		<div class="space-y-2">
			<p class="label">Card types</p>
			<div class="grid grid-cols-2 gap-2 sm:grid-cols-4">
				{#each cardKeys as k (k)}
					<label class="inline-flex items-center gap-2 text-sm">
						<input
							type="checkbox"
							checked={isOn(k, k !== 'audio_choice')}
							onchange={(e) => setOn(k, (e.currentTarget as HTMLInputElement).checked)}
							aria-label={k}
						/>
						<span class="font-mono">{k}</span>
					</label>
				{/each}
			</div>
		</div>

		<div class="space-y-2">
			<p class="label">Extras</p>
			<ExtrasEditor bind:extras />
		</div>

		<div class="flex flex-wrap items-center gap-2">
			<button type="submit" class="btn-primary" aria-label="Save note">Save</button>
			<button
				type="submit"
				formaction="?/archive"
				class="btn-secondary"
				aria-label="Archive note"
			>
				Archive
			</button>
			<button
				type="submit"
				formaction="?/delete"
				class="btn-ghost text-rose-600 dark:text-rose-400"
				aria-label="Delete note"
				onclick={(e) => {
					if (!globalThis.confirm('Delete this note?')) e.preventDefault();
				}}
			>
				Delete
			</button>
		</div>
	</form>

	<section class="card space-y-2">
		<p class="label">Generated cards ({data.cards.length})</p>
		<ul class="grid gap-2 sm:grid-cols-2">
			{#each data.cards as c (c.id)}
				<li class="rounded-md border border-slate-200 p-2 text-xs dark:border-slate-700">
					<div class="flex items-center justify-between">
						<span class="font-mono">{c.card_type}</span>
						<span class="text-slate-500">priority {c.priority}</span>
					</div>
					<details class="mt-1">
						<summary class="cursor-pointer text-slate-500">variant</summary>
						<pre class="overflow-x-auto text-[10px]">{JSON.stringify(c.variant, null, 2)}</pre>
					</details>
				</li>
			{/each}
		</ul>
	</section>

	{#if data.example}
		<section class="card space-y-2">
			<p class="label">Current example sentence</p>
			<p class="text-base">{data.example.text}</p>
			<p class="text-sm text-slate-500">{data.example.translation}</p>
		</section>
	{/if}
</section>
