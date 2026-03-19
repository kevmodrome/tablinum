<script lang="ts">
	import { getDb } from "$lib/db";
	import TodoForm from "$lib/components/TodoForm.svelte";
	import TodoList from "$lib/components/TodoList.svelte";

	const db = getDb();
	const todos = db.collection("todos");

	let total = $derived(await todos.count());
	let incomplete = $derived(
		await todos.where("done").equals(false).sortBy("priority").reverse().get(),
	);
	let done = $derived(await todos.where("done").equals(true).get());
</script>

<svelte:boundary>
	{#snippet pending()}
		<main>
			<h1>Todos</h1>
			<p>Loading todos...</p>
		</main>
	{/snippet}

	<main>
		<h1>Todos</h1>

		<TodoForm />

		<p class="count">{total} total</p>

		<TodoList items={incomplete} label="Todo" />
		<TodoList items={done} label="Done" isDone />
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

	.count {
		color: #666;
		margin-bottom: 0.5rem;
	}
</style>
