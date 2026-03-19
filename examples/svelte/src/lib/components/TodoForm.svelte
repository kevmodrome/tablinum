<script lang="ts">
	import { getDb } from "$lib/db";

	const todos = getDb().collection("todos");

	let title = $state("");
	let priority = $state(1);

	async function addTodo(e: SubmitEvent) {
		e.preventDefault();
		if (!title.trim()) return;
		await todos.add({ title: title.trim(), done: false, priority });
		title = "";
		priority = 1;
	}
</script>

<form onsubmit={addTodo}>
	<input bind:value={title} placeholder="Add a todo..." />
	<select bind:value={priority}>
		<option value={1}>Low</option>
		<option value={2}>Medium</option>
		<option value={3}>High</option>
	</select>
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
