<script lang="ts">
	import { onDestroy } from "svelte";
	import { initDb, type AppSchema, type TodoRecord } from "$lib/db";
	import { encodeInvite } from "tablinum/svelte";
	import type { Database, Collection, LiveQuery } from "tablinum/svelte";

	let db: Database<AppSchema> | null = $state(null);
	let todos: Collection<AppSchema["todos"]> | null = $state(null);
	let incomplete: LiveQuery<TodoRecord> | null = $state(null);
	let done: LiveQuery<TodoRecord> | null = $state(null);

	let title = $state("");
	let importInviteCode = $state("");
	let loading = $state(true);
	let initError = $state<string | null>(null);
	let joined = $state(false);
	let inviteCopied = $state(false);
	let linkCopied = $state(false);

	async function init() {
		try {
			const result = await initDb();
			db = result.db;
			joined = result.joined;
			todos = db.collection("todos");
			incomplete = todos.where("done").equals(false).live();
			done = todos.where("done").equals(true).live();
			loading = false;
		} catch (e: unknown) {
			initError = e instanceof Error ? e.message : String(e);
			loading = false;
		}
	}

	init();

	async function addTodo(e: SubmitEvent) {
		e.preventDefault();
		if (!todos || !title.trim()) return;
		await todos.add({ title: title.trim(), done: false, priority: 1 });
		title = "";
	}

	async function toggle(id: string, currentDone: boolean) {
		if (!todos) return;
		await todos.update(id, { done: !currentDone });
	}

	async function remove(id: string) {
		if (!todos) return;
		await todos.delete(id);
	}

	async function sync() {
		if (!db) return;
		await db.sync();
	}

	async function rebuild() {
		if (!db) return;
		await db.rebuild();
	}

	function copyInviteCode() {
		if (!db) return;
		const invite = db.exportInvite();
		const code = encodeInvite(invite);
		navigator.clipboard.writeText(code).then(
			() => {
				inviteCopied = true;
				setTimeout(() => (inviteCopied = false), 2000);
			},
			() => {},
		);
	}

	function copyInviteLink() {
		if (!db) return;
		const invite = db.exportInvite();
		const code = encodeInvite(invite);
		const url = `${window.location.origin}${window.location.pathname}?invite=${code}`;
		navigator.clipboard.writeText(url).then(
			() => {
				linkCopied = true;
				setTimeout(() => (linkCopied = false), 2000);
			},
			() => {},
		);
	}

	function joinWithInvite() {
		const code = importInviteCode.trim();
		if (!code) return;
		window.location.search = `?invite=${encodeURIComponent(code)}`;
	}

	onDestroy(() => {
		incomplete?.destroy();
		done?.destroy();
		db?.close();
	});
</script>

<svelte:head>
	<title>tablinum Svelte Demo</title>
</svelte:head>

<main>
	<h1>tablinum Svelte Demo</h1>

	{#if loading}
		<p>Initializing database...</p>
	{:else if initError}
		<p class="error">Failed to initialize: {initError}</p>
	{:else if todos && db}
		<div class="invite-section">
			<h3>Collaboration</h3>
			{#if joined}
				<p class="joined-badge">Joined via invite link</p>
			{/if}
			<div class="invite-actions">
				<button onclick={copyInviteCode}
					>{inviteCopied ? "Copied!" : "Copy Invite Code"}</button
				>
				<button onclick={copyInviteLink}
					>{linkCopied ? "Copied!" : "Copy Invite Link"}</button
				>
			</div>
			<div class="invite-import">
				<input
					bind:value={importInviteCode}
					placeholder="Paste an invite code to join..."
				/>
				<button onclick={joinWithInvite}>Join</button>
			</div>
		</div>

		{#if db.status === "syncing"}
			<p class="sync-status">Syncing...</p>
		{/if}

		{#if todos.error}
			<p class="error">{todos.error.message}</p>
		{/if}

		<form onsubmit={addTodo}>
			<input bind:value={title} placeholder="Add a todo..." autofocus />
			<button type="submit">Add</button>
		</form>

		<p class="count">{todos.items.length} total</p>

		<h2>Todo ({incomplete?.items.length ?? 0})</h2>
		<ul>
			{#each incomplete?.items ?? [] as todo (todo.id)}
				<li>
					<label>
						<input
							type="checkbox"
							checked={false}
							onchange={() => toggle(todo.id, todo.done)}
						/>
						<span>{todo.title}</span>
					</label>
					<button class="delete" onclick={() => remove(todo.id)}
						>✕</button
					>
				</li>
			{/each}
		</ul>

		<h2>Done ({done?.items.length ?? 0})</h2>
		<ul>
			{#each done?.items ?? [] as todo (todo.id)}
				<li class="done">
					<label>
						<input
							type="checkbox"
							checked={true}
							onchange={() => toggle(todo.id, todo.done)}
						/>
						<span>{todo.title}</span>
					</label>
					<button class="delete" onclick={() => remove(todo.id)}
						>✕</button
					>
				</li>
			{/each}
		</ul>

		<div class="actions">
			<button onclick={sync}>Sync</button>
			<button onclick={rebuild}>Rebuild</button>
		</div>
	{/if}
</main>

<style>
	* {
		box-sizing: border-box;
		margin: 0;
		padding: 0;
	}

	main {
		font-family: system-ui, sans-serif;
		max-width: 600px;
		margin: 2rem auto;
		padding: 0 1rem;
	}

	h1 {
		margin-bottom: 1rem;
	}

	h2 {
		margin: 1rem 0 0.5rem;
		font-size: 1rem;
		color: #666;
	}

	h3 {
		font-size: 0.95rem;
		margin-bottom: 0.5rem;
	}

	form {
		display: flex;
		gap: 0.5rem;
		margin-bottom: 1rem;
	}

	form input {
		flex: 1;
		padding: 0.5rem;
		font-size: 1rem;
		border: 1px solid #ccc;
		border-radius: 4px;
	}

	input[type="checkbox"] {
		flex: none;
	}

	button {
		padding: 0.5rem 1rem;
		font-size: 1rem;
		cursor: pointer;
		border: 1px solid #ccc;
		border-radius: 4px;
		background: #f5f5f5;
	}

	button:hover {
		background: #e0e0e0;
	}

	ul {
		list-style: none;
	}

	li {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.5rem 0;
		border-bottom: 1px solid #eee;
	}

	li label {
		flex: 1;
		display: flex;
		align-items: center;
		gap: 0.5rem;
		cursor: pointer;
	}

	li.done span {
		opacity: 0.5;
		text-decoration: line-through;
	}

	.delete {
		padding: 0.25rem 0.5rem;
		font-size: 0.875rem;
	}

	.count {
		color: #666;
		margin-bottom: 0.5rem;
	}

	.actions {
		display: flex;
		gap: 0.5rem;
		margin-top: 1.5rem;
		flex-wrap: wrap;
	}

	.error {
		color: #c00;
		margin-bottom: 1rem;
	}

	.sync-status {
		color: #06c;
		margin-bottom: 0.5rem;
	}

	.invite-section {
		margin-bottom: 1rem;
		padding: 0.75rem;
		background: #f9f9f9;
		border: 1px solid #ddd;
		border-radius: 4px;
	}

	.invite-actions {
		display: flex;
		gap: 0.5rem;
		margin-bottom: 0.5rem;
		flex-wrap: wrap;
	}

	.invite-actions button {
		font-size: 0.875rem;
		padding: 0.375rem 0.75rem;
	}

	.invite-import {
		display: flex;
		gap: 0.5rem;
	}

	.invite-import input {
		flex: 1;
		font-family: monospace;
		font-size: 0.8rem;
		padding: 0.375rem 0.5rem;
		border: 1px solid #ccc;
		border-radius: 4px;
	}

	.invite-import button {
		font-size: 0.875rem;
		padding: 0.375rem 0.75rem;
	}

	.joined-badge {
		font-size: 0.8rem;
		color: #06c;
		margin-bottom: 0.5rem;
	}
</style>
