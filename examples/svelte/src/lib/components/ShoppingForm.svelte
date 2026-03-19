<script lang="ts">
	import { getDb } from "$lib/db";

	const db = getDb();
	const items = db.collection("items");

	let name = $state("");
	let quantity = $state(1);

	async function addItem(e: SubmitEvent) {
		e.preventDefault();
		if (!name.trim()) return;
		await items.add({
			name: name.trim(),
			quantity,
			addedBy: db.publicKey,
			checked: false,
		});
		name = "";
		quantity = 1;
	}
</script>

<form onsubmit={addItem}>
	<input bind:value={name} placeholder="Add an item..." />
	<input type="number" bind:value={quantity} min={1} max={99} class="qty" />
	<button type="submit">Add</button>
</form>

<style>
	form {
		display: flex;
		gap: 0.5rem;
		margin-bottom: 1rem;
	}

	form input {
		padding: 0.5rem;
		font-size: 1rem;
		border: 1px solid #ccc;
		border-radius: 4px;
	}

	form input:first-child {
		flex: 1;
	}

	.qty {
		width: 4rem;
		text-align: center;
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
</style>
