<script lang="ts">
	import { enhance } from '$app/forms';
	let { data } = $props();
</script>

<svelte:head>
	<title>Suggestions · flashcards-again</title>
</svelte:head>

<section class="space-y-4">
	<header class="flex items-center justify-between">
		<h1 class="text-2xl font-semibold tracking-tight">Suggestions</h1>
		<form method="post" action="?/suggestMore" use:enhance>
			<button type="submit" class="btn-primary" aria-label="Suggest more notes">
				Suggest 5 more
			</button>
		</form>
	</header>

	{#if data.suggestions.length === 0}
		<div class="card text-center text-sm text-slate-500 dark:text-slate-400">
			No pending suggestions. Click <span class="font-mono">Suggest 5 more</span> to generate
			some based on your recent notes.
		</div>
	{/if}

	<ul class="space-y-2">
		{#each data.suggestions as s (s.id)}
			<li class="card flex items-start justify-between gap-4">
				<div class="flex-1 space-y-1">
					<p class="text-base font-medium">{s.front}</p>
					{#if s.back}
						<p class="text-sm text-slate-500 dark:text-slate-400">{s.back}</p>
					{/if}
					<div class="flex flex-wrap gap-1.5">
						<span class="badge">{s.note_kind}</span>
						{#each s.tags as t (t)}
							<span class="badge">#{t}</span>
						{/each}
					</div>
				</div>
				<div class="flex gap-2">
					<form method="post" action="?/approve" use:enhance>
						<input type="hidden" name="id" value={s.id} />
						<button type="submit" class="btn-primary" aria-label="Approve {s.front}">
							Approve
						</button>
					</form>
					<form method="post" action="?/reject" use:enhance>
						<input type="hidden" name="id" value={s.id} />
						<button
							type="submit"
							class="btn-ghost text-rose-600 dark:text-rose-400"
							aria-label="Reject {s.front}"
						>
							Reject
						</button>
					</form>
				</div>
			</li>
		{/each}
	</ul>
</section>
