<script lang="ts">
	import { getDb, type TodoRecord } from "$lib/db";

	let {
		items,
		label,
		isDone = false,
	}: {
		items: ReadonlyArray<TodoRecord>;
		label: string;
		isDone?: boolean;
	} = $props();

	const todos = getDb().collection("todos");

	async function toggle(id: string, currentDone: boolean) {
		await todos.update(id, { done: !currentDone });
	}

	async function remove(id: string) {
		await todos.delete(id);
	}
</script>

<h2>{label} ({items.length})</h2>
<ul>
	{#each items as todo (todo.id)}
		<li class:done={isDone}>
			<label>
				<input
					type="checkbox"
					checked={isDone}
					onchange={() => toggle(todo.id, todo.done)}
				/>
				<span>{todo.title}</span>
			</label>
			<button class="delete" onclick={() => remove(todo.id)}>&#x2715;</button>
		</li>
	{/each}
</ul>

<style>
	h2 {
		margin: 1rem 0 0.5rem;
		font-size: 1rem;
		color: #666;
	}

	ul {
		list-style: none;
		padding: 0;
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
		cursor: pointer;
		border: 1px solid #ccc;
		border-radius: 4px;
		background: #f5f5f5;
	}

	.delete:hover {
		background: #e0e0e0;
	}

	input[type="checkbox"] {
		flex: none;
	}
</style>
