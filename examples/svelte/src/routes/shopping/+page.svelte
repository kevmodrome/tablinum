<script lang="ts">
	import { getDb, getInviteLink } from "$lib/db";
	import ShoppingForm from "$lib/components/ShoppingForm.svelte";
	import ShoppingList from "$lib/components/ShoppingList.svelte";
	import ShoppingMembers from "$lib/components/ShoppingMembers.svelte";

	const db = getDb();
	const items = db.collection("items");

	let needed = $derived(await items.where("checked").equals(false).get());
	let done = $derived(await items.where("checked").equals(true).get());

	let showMembers = $state(false);

	async function copyInvite() {
		const link = getInviteLink();
		await navigator.clipboard.writeText(link);
	}
</script>

<svelte:boundary>
	{#snippet pending()}
		<main>
			<h1>Shopping List</h1>
			<p>Loading...</p>
		</main>
	{/snippet}

	<main>
		<h1>Shopping List</h1>

		<div class="toolbar">
			<button onclick={copyInvite}>Copy Invite Link</button>
			<button onclick={() => showMembers = !showMembers}>
				{showMembers ? "Hide" : "Show"} Members
			</button>
			<button onclick={() => db.sync()} disabled={db.syncStatus === "syncing"}>
				{db.syncStatus === "syncing" ? "Syncing..." : "Sync"}
			</button>
		</div>

		{#if showMembers}
			<ShoppingMembers />
		{/if}

		<ShoppingForm />

		<h2>Need ({needed.length})</h2>
		<ShoppingList {items} records={needed} checked={false} />

		{#if done.length > 0}
			<h2>Got ({done.length})</h2>
			<ShoppingList {items} records={done} checked={true} />
		{/if}

		{#if db.pendingCount > 0}
			<p class="pending">{db.pendingCount} unsynced changes</p>
		{/if}
	</main>
</svelte:boundary>

<style>
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

	.toolbar {
		display: flex;
		gap: 0.5rem;
		margin-bottom: 1rem;
	}

	.toolbar button {
		padding: 0.4rem 0.75rem;
		font-size: 0.875rem;
		cursor: pointer;
		border: 1px solid #ccc;
		border-radius: 4px;
		background: #f5f5f5;
	}

	.toolbar button:hover {
		background: #e0e0e0;
	}

	.toolbar button:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.pending {
		color: #666;
		font-size: 0.875rem;
		margin-top: 1rem;
	}
</style>
