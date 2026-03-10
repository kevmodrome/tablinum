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
	let removed = $state(false);

	// Members
	let myPubkey = $state("");
	let showMembers = $state(false);
	let members = $derived.by(() => {
	console.log('deriving...', db?.getMembers())
	  return db?.members?.items
	});

	async function init() {
		try {
			const result = await initDb({
				onRemoved: () => {
					removed = true;
				},
			});
			db = result.db;
			joined = result.joined;
			todos = db.collection("todos");
			incomplete = todos.where("done").equals(false).live();
			done = todos.where("done").equals(true).live();
			myPubkey = db.publicKey;
			loading = false;

			// Debug: check if members are in IDB directly
			db.getMembers().then((m: any) => console.log("[DEBUG] getMembers():", m.length, m));
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

	async function removeMember(pubkey: string) {
		if (!db) return;
		await db.removeMember(pubkey);
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

	function shortKey(pubkey: string): string {
		return pubkey.slice(0, 8) + "..." + pubkey.slice(-4);
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
		{#if removed}
			<div class="removed-banner">
				<p>You have been removed from this group. You can still view existing data, but new changes will not sync.</p>
			</div>
		{/if}

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
				<button onclick={() => (showMembers = !showMembers)}
					>{showMembers ? "Hide Members" : `Members (${members.length})`}</button
				>
			</div>
			<div class="invite-import">
				<input
					bind:value={importInviteCode}
					placeholder="Paste an invite code to join..."
				/>
				<button onclick={joinWithInvite}>Join</button>
			</div>

			{#if showMembers && members.length > 0}
				<div class="members-list">
					<h4>Group Members</h4>
					<ul>
						{#each members as member (member.id)}
							<li class:removed={!!member.removedAt}>
								<span class="member-info">
									{#if member.name}
										<strong>{member.name}</strong>
										<span class="member-key">({shortKey(String(member.id))})</span>
									{:else}
										<span class="member-key">{shortKey(String(member.id))}</span>
									{/if}
									{#if String(member.id) === myPubkey}
										<span class="you-badge">you</span>
									{/if}
									{#if member.removedAt}
										<span class="removed-badge">removed</span>
									{/if}
								</span>
								{#if !member.removedAt && String(member.id) !== myPubkey}
									<button
										class="remove-btn"
										onclick={() => removeMember(String(member.id))}
									>
										Remove
									</button>
								{/if}
							</li>
						{/each}
					</ul>
				</div>
			{/if}
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
						>&#x2715;</button
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
						>&#x2715;</button
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

	h4 {
		font-size: 0.85rem;
		color: #666;
		margin-bottom: 0.25rem;
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

	.members-list {
		margin-top: 0.75rem;
		padding-top: 0.5rem;
		border-top: 1px solid #ddd;
	}

	.members-list ul {
		margin-top: 0.25rem;
	}

	.members-list li {
		padding: 0.375rem 0;
		font-size: 0.85rem;
		display: flex;
		align-items: center;
		justify-content: space-between;
	}

	.members-list li.removed {
		opacity: 0.5;
	}

	.member-info {
		display: flex;
		align-items: center;
		gap: 0.375rem;
	}

	.member-key {
		font-family: monospace;
		font-size: 0.75rem;
		color: #888;
	}

	.you-badge {
		font-size: 0.7rem;
		background: #06c;
		color: white;
		padding: 0.1rem 0.35rem;
		border-radius: 3px;
	}

	.removed-badge {
		font-size: 0.7rem;
		background: #c00;
		color: white;
		padding: 0.1rem 0.35rem;
		border-radius: 3px;
	}

	.remove-btn {
		font-size: 0.75rem;
		padding: 0.2rem 0.5rem;
		color: #c00;
		border-color: #c00;
		background: white;
	}

	.remove-btn:hover {
		background: #fee;
	}

	.removed-banner {
		background: #fff3cd;
		border: 1px solid #ffc107;
		border-radius: 4px;
		padding: 0.75rem;
		margin-bottom: 1rem;
		color: #856404;
		font-size: 0.9rem;
	}
</style>
