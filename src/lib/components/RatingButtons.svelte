<script lang="ts">
	let {
		onRate,
		suggested
	}: { onRate: (rating: 1 | 2 | 3 | 4) => void; suggested?: 1 | 2 | 3 | 4 } = $props();

	const buttons: { rating: 1 | 2 | 3 | 4; label: string; key: string; tone: string }[] = [
		{ rating: 1, label: 'Again', key: '1', tone: 'bg-rose-600 hover:bg-rose-500 text-white' },
		{ rating: 2, label: 'Hard', key: '2', tone: 'bg-amber-500 hover:bg-amber-400 text-white' },
		{
			rating: 3,
			label: 'Good',
			key: '3',
			tone: 'bg-emerald-600 hover:bg-emerald-500 text-white'
		},
		{ rating: 4, label: 'Easy', key: '4', tone: 'bg-sky-600 hover:bg-sky-500 text-white' }
	];
</script>

<div class="grid grid-cols-4 gap-2">
	{#each buttons as b (b.rating)}
		<button
			type="button"
			class="btn {b.tone} {suggested === b.rating
				? 'ring-2 ring-offset-2 ring-slate-900 dark:ring-slate-100'
				: ''}"
			aria-label="Rate {b.label}{suggested === b.rating ? ' (suggested)' : ''} (key {b.key})"
			onclick={() => onRate(b.rating)}
		>
			{b.label}
			<span class="text-xs opacity-70">[{b.key}]</span>
		</button>
	{/each}
</div>
