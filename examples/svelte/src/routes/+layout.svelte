<script lang="ts">
	import { page } from "$app/stores";
	import type { Snippet } from "svelte";

	let { children }: { children: Snippet } = $props();
</script>

<svelte:head>
	<title>tablinum Svelte Demo</title>
</svelte:head>

<nav>
	<a href="/" class:active={$page.url.pathname === "/"}>Home</a>
	<a href="/todos" class:active={$page.url.pathname === "/todos"}>Todos</a>
	<a href="/contacts" class:active={$page.url.pathname === "/contacts"}>Contacts</a>
	<a href="/shopping" class:active={$page.url.pathname === "/shopping"}>Shopping</a>
</nav>

{@render children()}

<style>
	:global(*) {
		box-sizing: border-box;
		margin: 0;
		padding: 0;
	}

	nav {
		font-family: system-ui, sans-serif;
		display: flex;
		gap: 1rem;
		padding: 0.75rem 1rem;
		border-bottom: 1px solid #ddd;
		max-width: 600px;
		margin: 0 auto;
	}

	nav a {
		text-decoration: none;
		color: #666;
		font-size: 0.95rem;
	}

	nav a:hover {
		color: #333;
	}

	nav a.active {
		color: #111;
		font-weight: 600;
	}
</style>
