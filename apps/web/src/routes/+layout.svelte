<script>
	import "../app.css";

	let { children } = $props();
	let mobileMenuOpen = $state(false);
	let scrolled = $state(false);

	function handleScroll() {
		scrolled = window.scrollY > 20;
	}
</script>

<svelte:window onscroll={handleScroll} />

<header
	class="fixed top-0 left-0 right-0 z-50 transition-all duration-300"
	class:scrolled
>
	<div class="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
		<a href="/" class="font-display text-xl font-bold tracking-tight text-text-primary">
			tablinum
		</a>

		<nav class="hidden items-center gap-8 md:flex">
			<a href="/docs" class="text-sm text-text-secondary transition-colors hover:text-text-primary">
				Docs
			</a>
			<a
				href="https://github.com/kevmodrome/tablinum"
				target="_blank"
				rel="noopener noreferrer"
				class="text-sm text-text-secondary transition-colors hover:text-text-primary"
			>
				GitHub
			</a>
			<a
				href="https://npmx.dev/package/tablinum"
				target="_blank"
				rel="noopener noreferrer"
				class="text-sm text-text-secondary transition-colors hover:text-text-primary"
			>
				npm
			</a>
		</nav>

		<button
			class="flex flex-col gap-1.5 md:hidden"
			onclick={() => (mobileMenuOpen = !mobileMenuOpen)}
			aria-label="Toggle menu"
		>
			<span
				class="block h-0.5 w-5 bg-text-primary transition-all duration-300"
				class:translate-y-2={mobileMenuOpen}
				class:rotate-45={mobileMenuOpen}
			></span>
			<span
				class="block h-0.5 w-5 bg-text-primary transition-all duration-300"
				class:opacity-0={mobileMenuOpen}
			></span>
			<span
				class="block h-0.5 w-5 bg-text-primary transition-all duration-300"
				class:-translate-y-2={mobileMenuOpen}
				class:-rotate-45={mobileMenuOpen}
			></span>
		</button>
	</div>
</header>

{#if mobileMenuOpen}
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div
		class="fixed inset-0 z-40 bg-bg-deep/95 backdrop-blur-sm"
		onclick={() => (mobileMenuOpen = false)}
		onkeydown={(e) => e.key === 'Escape' && (mobileMenuOpen = false)}
	>
		<nav class="flex flex-col items-center justify-center gap-8 pt-24 animate-fade-in">
			<a
				href="/docs"
				class="font-display text-2xl text-text-primary"
				onclick={() => (mobileMenuOpen = false)}
			>
				Docs
			</a>
			<a
				href="https://github.com/kevmodrome/tablinum"
				target="_blank"
				rel="noopener noreferrer"
				class="font-display text-2xl text-text-primary"
				onclick={() => (mobileMenuOpen = false)}
			>
				GitHub
			</a>
			<a
				href="https://npmx.dev/package/tablinum"
				target="_blank"
				rel="noopener noreferrer"
				class="font-display text-2xl text-text-primary"
				onclick={() => (mobileMenuOpen = false)}
			>
				npm
			</a>
		</nav>
	</div>
{/if}

<div class="pt-16">
	{@render children()}
</div>

<footer class="border-t border-border bg-bg-deep">
	<div class="mx-auto max-w-6xl px-6 py-16">
		<div class="grid gap-12 md:grid-cols-3">
			<div>
				<p class="font-display text-lg font-bold text-text-primary">tablinum</p>
				<p class="mt-2 text-sm text-text-muted">
					A local-first database for the browser with encrypted sync and built-in collaboration.
				</p>
			</div>

			<div>
				<p class="mb-4 text-xs font-semibold uppercase tracking-widest text-text-muted">
					Documentation
				</p>
				<nav class="flex flex-col gap-2">
					<a href="/docs" class="text-sm text-text-secondary transition-colors hover:text-text-primary">Getting Started</a>
					<a href="/docs/collections" class="text-sm text-text-secondary transition-colors hover:text-text-primary">Collections</a>
					<a href="/docs/queries" class="text-sm text-text-secondary transition-colors hover:text-text-primary">Queries</a>
					<a href="/docs/sync" class="text-sm text-text-secondary transition-colors hover:text-text-primary">Sync & Encryption</a>
					<a href="/docs/collaboration" class="text-sm text-text-secondary transition-colors hover:text-text-primary">Collaboration</a>
				</nav>
			</div>

			<div>
				<p class="mb-4 text-xs font-semibold uppercase tracking-widest text-text-muted">
					Community
				</p>
				<nav class="flex flex-col gap-2">
					<a href="https://github.com/kevmodrome/tablinum" target="_blank" rel="noopener noreferrer" class="text-sm text-text-secondary transition-colors hover:text-text-primary">GitHub</a>
					<a href="https://npmx.dev/package/tablinum" target="_blank" rel="noopener noreferrer" class="text-sm text-text-secondary transition-colors hover:text-text-primary">npm</a>
				</nav>
			</div>
		</div>

		<div class="mt-12 border-t border-border pt-8">
			<p class="text-xs text-text-muted">MIT License</p>
		</div>
	</div>
</footer>

<style>
	header {
		background-color: transparent;
	}

	header.scrolled {
		background-color: rgba(13, 11, 9, 0.85);
		backdrop-filter: blur(12px);
		border-bottom: 1px solid var(--color-border);
	}
</style>
