<script lang="ts">
	import type { ExtraField } from '$lib/database.types';
	let { field }: { field: ExtraField } = $props();
	let revealed = $state(false);
</script>

<button
	type="button"
	class="badge transition hover:bg-slate-200 dark:hover:bg-slate-700"
	aria-label={revealed ? `Hide ${field.key}` : `Reveal ${field.key}`}
	onclick={() => (revealed = !revealed)}
>
	<span class="font-medium">{field.key}:</span>
	<span class="ml-1">{revealed ? field.value : '••••'}</span>
</button>
