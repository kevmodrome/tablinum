<script lang="ts">
	import { getDb } from "$lib/db";
	import { dbUiState } from "$lib/db-state.svelte";
	import TodoForm from "$lib/components/TodoForm.svelte";
	import TodoList from "$lib/components/TodoList.svelte";
	import InviteSection from "$lib/components/InviteSection.svelte";
	import ProfileEditor from "$lib/components/ProfileEditor.svelte";

	const db = getDb();
	const todos = db.collection("todos");

	let allTodos = $derived(db.status === "ready" ? await todos.get() : []);
	let incomplete = $derived(
		db.status === "ready" ? await todos.where("done").equals(false).get() : [],
	);
	let done = $derived(db.status === "ready" ? await todos.where("done").equals(true).get() : []);
</script>

<svelte:head>
	<title>tablinum Svelte Demo</title>
</svelte:head>

<svelte:boundary>
	{#snippet pending()}
		<main>
			<h1>tablinum Svelte Demo</h1>
			<p>Loading todos...</p>
		</main>
	{/snippet}

	<main>
		<h1>tablinum Svelte Demo</h1>

		{#if db.status === "error"}
			<p class="error">Failed to initialize: {db.error?.message}</p>
		{:else}
			{#if dbUiState.removed}
				<div class="removed-banner">
					<p>You have been removed from this group. You can still view existing data, but new changes will not sync.</p>
				</div>
			{/if}

			<InviteSection />
			<ProfileEditor />

			<div class="status-bar">
				<span class="relay-status" class:connected={db.relayStatus.connectedUrls.length > 0}>
					{db.relayStatus.connectedUrls.length} relay{db.relayStatus.connectedUrls.length !== 1 ? 's' : ''} connected
				</span>
				{#if db.syncStatus === "syncing"}
					<span class="sync-status">Syncing...</span>
				{/if}
				{#if db.pendingCount > 0}
					<span class="sync-status pending">{db.pendingCount} pending</span>
				{/if}
			</div>

			<TodoForm />

			<p class="count">{allTodos.length} total</p>

			<TodoList items={incomplete} label="Todo" />
			<TodoList items={done} label="Done" isDone />

			<div class="actions">
				<button onclick={() => db.sync()}>Sync</button>
				<button onclick={() => db.rebuild()}>Rebuild</button>
			</div>
		{/if}
	</main>
</svelte:boundary>

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

	.actions button {
		padding: 0.5rem 1rem;
		font-size: 1rem;
		cursor: pointer;
		border: 1px solid #ccc;
		border-radius: 4px;
		background: #f5f5f5;
	}

	.actions button:hover {
		background: #e0e0e0;
	}

	.error {
		color: #c00;
		margin-bottom: 1rem;
	}

	.status-bar {
		display: flex;
		gap: 1rem;
		align-items: center;
		margin-bottom: 0.75rem;
		font-size: 0.85rem;
	}

	.relay-status {
		color: #999;
	}

	.relay-status.connected {
		color: #2a9d2a;
	}

	.sync-status {
		color: #06c;
	}

	.sync-status.pending {
		color: #e67e00;
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
