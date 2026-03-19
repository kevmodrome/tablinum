<svelte:head>
	<title>Examples — Tablinum</title>
</svelte:head>

<h1>Examples</h1>

<p>
	Complete, copy-pasteable examples showing how to build apps with Tablinum. The Svelte examples
	use SvelteKit with the <code>init</code> client hook for database setup. The Effect example
	runs as a standalone script. All Svelte examples have a
	<a href="https://github.com/kevmodrome/localstr/tree/main/examples/svelte" target="_blank" rel="noopener noreferrer">
		full working implementation on GitHub</a>.
</p>

<div class="grid gap-6 sm:grid-cols-2" style="margin-top: 2rem;">
	<a href="/docs/examples/todo-app" class="example-card">
		<h3>Personal Todo App</h3>
		<p>
			Single-user todo list with CRUD, filtered queries, undo, and encrypted sync across your
			own devices. No collaboration — just your data, everywhere.
		</p>
		<span class="tag">Single user</span>
		<span class="tag">Sync</span>
		<span class="tag">Undo</span>
	</a>

	<a href="/docs/examples/shared-list" class="example-card">
		<h3>Shared Shopping List</h3>
		<p>
			Collaborative shopping list shared via invite links. Manage members, show who added what,
			handle key rotation when someone leaves.
		</p>
		<span class="tag">Collaboration</span>
		<span class="tag">Invites</span>
		<span class="tag">Profiles</span>
	</a>

	<a href="/docs/examples/effect-notes" class="example-card">
		<h3>Effect Notes App</h3>
		<p>
			Notes app using the Effect API directly — no Svelte required. Typed error handling,
			streaming queries with <code>watch()</code>, and explicit lifecycle management.
		</p>
		<span class="tag">Effect</span>
		<span class="tag">Streaming</span>
		<span class="tag">Error handling</span>
	</a>
</div>

<style>
	.example-card {
		display: block;
		padding: 1.5rem;
		border: 1px solid var(--color-border);
		border-radius: 0.75rem;
		background: var(--color-bg-surface);
		text-decoration: none;
		transition: border-color 0.2s, transform 0.2s;
	}

	.example-card:hover {
		border-color: var(--color-accent);
		transform: translateY(-2px);
	}

	.example-card h3 {
		font-size: 1.2rem;
		color: var(--color-text-primary);
		margin-bottom: 0.5rem;
	}

	.example-card p {
		font-size: 0.9rem;
		color: var(--color-text-secondary);
		line-height: 1.6;
		margin-bottom: 0.75rem;
	}

	.tag {
		display: inline-block;
		font-size: 0.75rem;
		padding: 0.125rem 0.5rem;
		border-radius: 9999px;
		background: var(--color-bg-deep);
		border: 1px solid var(--color-border);
		color: var(--color-text-muted);
		margin-right: 0.375rem;
	}
</style>
