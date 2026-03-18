<script lang="ts">
	import { codeToHtml } from "shiki";

	let { code, lang = "typescript", title = "" }: {
		code: string;
		lang?: string;
		title?: string;
	} = $props();

	let copied = $state(false);
	let highlightedHtml = $state("");

	async function copy() {
		await navigator.clipboard.writeText(code);
		copied = true;
		setTimeout(() => (copied = false), 2000);
	}

	$effect(() => {
		const currentCode = code;
		const currentLang = lang;
		codeToHtml(currentCode, {
			lang: currentLang === "text" ? "plaintext" : currentLang,
			theme: "vitesse-dark",
		}).then((html) => {
			highlightedHtml = html;
		});
	});
</script>

<div class="code-block group relative my-6 overflow-hidden rounded-xl border border-border bg-bg-surface">
	{#if title}
		<div class="flex items-center justify-between border-b border-border bg-bg-elevated px-4 py-2">
			<span class="font-mono text-xs text-text-muted">{title}</span>
			<button
				onclick={copy}
				class="rounded-md px-2 py-1 font-mono text-xs text-text-muted transition-colors hover:bg-bg-surface hover:text-text-primary"
			>
				{copied ? "Copied!" : "Copy"}
			</button>
		</div>
	{:else}
		<button
			onclick={copy}
			class="absolute right-3 top-3 z-10 rounded-md bg-bg-elevated/80 px-2 py-1 font-mono text-xs text-text-muted opacity-0 backdrop-blur-sm transition-all group-hover:opacity-100 hover:text-text-primary"
		>
			{copied ? "Copied!" : "Copy"}
		</button>
	{/if}

	{#if highlightedHtml}
		<div class="shiki-wrapper overflow-x-auto">
			{@html highlightedHtml}
		</div>
	{:else}
		<pre class="overflow-x-auto p-5 text-sm leading-7"><code>{code}</code></pre>
	{/if}
</div>

<style>
	.code-block :global(.shiki) {
		background-color: transparent !important;
		margin: 0;
		padding: 1.25rem;
		overflow-x: auto;
	}

	.code-block :global(.shiki code) {
		font-family: var(--font-mono);
		font-size: 0.875rem;
		line-height: 1.75;
	}
</style>
