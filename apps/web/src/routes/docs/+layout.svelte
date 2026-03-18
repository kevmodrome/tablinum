<script>
	import { page } from "$app/stores";

	let { children } = $props();
	let sidebarOpen = $state(false);

	const sections = [
		{ title: "Getting Started", href: "/docs" },
		{ title: "Collections & Schema", href: "/docs/collections" },
		{ title: "Querying Data", href: "/docs/queries" },
		{ title: "Sync & Encryption", href: "/docs/sync" },
		{ title: "Collaboration", href: "/docs/collaboration" },
		{ title: "Svelte 5 Integration", href: "/docs/svelte-bindings" },
		{ title: "Logging & Debugging", href: "/docs/logging" },
		{ title: "Examples", href: "/docs/examples" },
		{ title: "Todo App", href: "/docs/examples/todo-app", indent: true },
		{ title: "Shared List", href: "/docs/examples/shared-list", indent: true },
	];
</script>

<div class="mx-auto max-w-6xl px-6 py-12">
	<div class="lg:grid lg:grid-cols-[16rem_1fr] lg:gap-12">
		<!-- Mobile sidebar toggle -->
		<button
			class="mb-6 flex items-center gap-2 rounded-lg border border-border bg-bg-surface px-4 py-2 text-sm text-text-secondary lg:hidden"
			onclick={() => (sidebarOpen = !sidebarOpen)}
		>
			<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="3" x2="21" y1="6" y2="6"/><line x1="3" x2="21" y1="12" y2="12"/><line x1="3" x2="21" y1="18" y2="18"/></svg>
			{sidebarOpen ? "Close menu" : "Documentation"}
		</button>

		<!-- Sidebar -->
		<aside
			class="mb-8 lg:mb-0 {sidebarOpen ? 'block' : 'hidden'} lg:block"
		>
			<nav class="sticky top-24 space-y-0.5">
				{#each sections as section}
					{@const active = $page.url.pathname === section.href}
					<a
						href={section.href}
						onclick={() => (sidebarOpen = false)}
						class="nav-link group flex items-center gap-2.5 py-2 text-sm transition-all duration-200 {section.indent ? 'pl-4' : ''}"
						class:active
					>
						<span class="indicator h-px w-0 bg-accent transition-all duration-300 group-hover:w-4"
							class:!w-5={active}
							class:!h-0.5={active}
						></span>
						<span class="transition-colors duration-200 {active
							? 'text-accent font-medium'
							: 'text-text-muted group-hover:text-text-primary'}"
						>
							{section.title}
						</span>
					</a>
				{/each}
			</nav>
		</aside>

		<!-- Content -->
		<article class="docs-content min-w-0">
			{@render children()}
		</article>
	</div>
</div>

<style>
	.docs-content :global(h1) {
		font-size: 2rem;
		margin-bottom: 1.5rem;
	}

	.docs-content :global(h2) {
		font-size: 1.5rem;
		margin-top: 3rem;
		margin-bottom: 1rem;
		padding-bottom: 0.5rem;
		border-bottom: 1px solid var(--color-border);
	}

	.docs-content :global(h3) {
		font-size: 1.25rem;
		margin-top: 2rem;
		margin-bottom: 0.75rem;
	}

	.docs-content :global(p) {
		color: var(--color-text-secondary);
		line-height: 1.8;
		margin-bottom: 1rem;
	}

	.docs-content :global(ul),
	.docs-content :global(ol) {
		color: var(--color-text-secondary);
		margin-bottom: 1rem;
		padding-left: 1.5rem;
	}

	.docs-content :global(li) {
		margin-bottom: 0.5rem;
		line-height: 1.7;
	}

	.docs-content :global(code:not(pre code)) {
		background-color: var(--color-bg-surface);
		border: 1px solid var(--color-border);
		border-radius: 4px;
		padding: 0.125rem 0.375rem;
		font-size: 0.875em;
	}

	.docs-content :global(a) {
		color: var(--color-accent);
		transition: color 0.15s;
	}

	.docs-content :global(a:hover) {
		color: var(--color-accent-glow);
	}

	.docs-content :global(table) {
		width: 100%;
		border-collapse: collapse;
		margin-bottom: 1.5rem;
		font-size: 0.875rem;
	}

	.docs-content :global(th) {
		text-align: left;
		padding: 0.75rem 1rem;
		border-bottom: 2px solid var(--color-border);
		color: var(--color-text-primary);
		font-weight: 600;
	}

	.docs-content :global(td) {
		padding: 0.75rem 1rem;
		border-bottom: 1px solid var(--color-border);
		color: var(--color-text-secondary);
	}

	.docs-content :global(blockquote) {
		border-left: 3px solid var(--color-accent);
		padding-left: 1rem;
		margin: 1.5rem 0;
		color: var(--color-text-secondary);
		font-style: italic;
	}
</style>
