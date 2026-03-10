<script lang="ts">
	import { getDb } from "$lib/db";

	const todos = getDb().collection("todos");

	let title = $state("");

	async function addTodo(e: SubmitEvent) {
		e.preventDefault();
		if (!title.trim()) return;
		await todos.add({ title: title.trim(), done: false, priority: 1 });
		title = "";
	}
</script>

<form onsubmit={addTodo}>
	<input bind:value={title} placeholder="Add a todo..." />
	<button type="submit">Add</button>
</form>

<style>
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
