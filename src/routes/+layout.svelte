<script lang="ts">
	import '../app.css';
	import { page } from '$app/state';

	let { children } = $props();

	const nav = [
		{ href: '/', label: 'Review' },
		{ href: '/cards', label: 'Cards' },
		{ href: '/suggestions', label: 'Suggestions' },
		{ href: '/settings', label: 'Settings' }
	];

	const isActive = (href: string) =>
		href === '/' ? page.url.pathname === '/' : page.url.pathname.startsWith(href);
</script>

<div class="flex min-h-full flex-col">
	<header class="border-b border-slate-200 bg-white/80 backdrop-blur dark:border-slate-800 dark:bg-slate-900/80">
		<div class="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
			<a href="/" class="text-base font-semibold tracking-tight" aria-label="Flashcards home">
				flashcards
			</a>
			<nav class="flex items-center gap-1" aria-label="Primary">
				{#each nav as item}
					<a
						href={item.href}
						class="rounded-md px-3 py-1.5 text-sm font-medium transition {isActive(item.href)
							? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900'
							: 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'}"
						aria-current={isActive(item.href) ? 'page' : undefined}
					>
						{item.label}
					</a>
				{/each}
			</nav>
		</div>
	</header>
	<main class="mx-auto w-full max-w-5xl flex-1 px-4 py-6">
		{@render children()}
	</main>
	<footer class="border-t border-slate-200 py-3 text-center text-xs text-slate-500 dark:border-slate-800">
		<span>Solo mode &middot; FSRS-6 &middot; phonemizer + GOP-SF</span>
	</footer>
</div>
