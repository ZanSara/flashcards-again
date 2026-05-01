<script lang="ts">
	import type { ExtraField } from '$lib/database.types';
	let { field, position }: { field: ExtraField; position: 'left' | 'right' } = $props();
</script>

<span
	class="absolute top-3 {position === 'left' ? 'left-3' : 'right-3'} badge"
	aria-label="{field.key}: {field.value}"
	title="{field.key}"
>
	{field.value}
</span>
