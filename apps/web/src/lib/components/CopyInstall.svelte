<script lang="ts">
	let { command = "npm install tablinum" }: { command?: string } = $props();

	let copied = $state(false);

	async function copy() {
		await navigator.clipboard.writeText(command);
		copied = true;
		setTimeout(() => (copied = false), 2000);
	}
</script>

<div class="inline-flex items-center gap-3 rounded-lg border border-border bg-bg-surface px-4 py-2.5">
	<code class="text-sm">
		<span class="text-text-muted">$</span>
		<span class="ml-2 text-text-primary">{command}</span>
	</code>
	<button
		onclick={copy}
		class="ml-2 rounded-md border-l border-border pl-3 text-text-muted transition-colors hover:text-accent"
		aria-label="Copy install command"
	>
		{#if copied}
			<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>
		{:else}
			<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>
		{/if}
	</button>
</div>
