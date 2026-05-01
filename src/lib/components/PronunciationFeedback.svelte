<script lang="ts">
	import type { PronunciationResult } from '$lib/cards/types';

	let { result }: { result: PronunciationResult } = $props();

	function tone(score: number): string {
		if (score >= 80)
			return 'bg-emerald-100 text-emerald-900 border-emerald-300 dark:bg-emerald-900/30 dark:text-emerald-200 dark:border-emerald-700';
		if (score >= 50)
			return 'bg-amber-100 text-amber-900 border-amber-300 dark:bg-amber-900/30 dark:text-amber-200 dark:border-amber-700';
		return 'bg-rose-100 text-rose-900 border-rose-300 dark:bg-rose-900/30 dark:text-rose-200 dark:border-rose-700';
	}

	function overallTone(score: number): string {
		if (score >= 80) return 'text-emerald-600 dark:text-emerald-400';
		if (score >= 50) return 'text-amber-600 dark:text-amber-400';
		return 'text-rose-600 dark:text-rose-400';
	}
</script>

<div class="space-y-3">
	<div class="flex items-baseline justify-between">
		<p class="label">Pronunciation</p>
		<p class="text-2xl font-semibold {overallTone(result.overall_score)}">
			{Math.round(result.overall_score)}<span class="text-sm font-normal text-slate-500">/100</span>
		</p>
	</div>

	<div class="flex flex-wrap gap-1.5" aria-label="Per-phoneme scores">
		{#each result.per_phoneme as p, i (i + p.canonical)}
			<span
				class="rounded-md border px-2 py-1 font-mono text-sm {tone(p.score)}"
				title={p.score >= 80
					? 'OK'
					: `you sounded closer to /${p.sound_most_like}/ (score ${Math.round(p.score)})`}
				aria-label={`/${p.canonical}/, score ${Math.round(p.score)}${
					p.score < 80 ? `, you sounded like /${p.sound_most_like}/` : ''
				}`}
			>
				/{p.canonical}/
			</span>
		{/each}
	</div>

	<details class="text-xs text-slate-500 dark:text-slate-400">
		<summary class="cursor-pointer">Show raw IPA</summary>
		<dl class="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 font-mono">
			<dt>expected:</dt>
			<dd>/{result.expected_phonemes}/</dd>
			<dt>you said:</dt>
			<dd>/{result.actual_phonemes_argmax}/</dd>
		</dl>
	</details>
</div>
