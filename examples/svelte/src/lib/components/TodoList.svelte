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

	async function undo(id: string) {
		await todos.undo(id);
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
				{#if todo.priority > 1}
					<span class="priority priority-{todo.priority}">{todo.priority === 3 ? 'High' : 'Med'}</span>
				{/if}
			</label>
			<button class="undo" onclick={() => undo(todo.id)} title="Undo last change">&#x21A9;</button>
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

	.priority {
		font-size: 0.75rem;
		padding: 0.1rem 0.4rem;
		border-radius: 3px;
		font-weight: 600;
	}

	.priority-2 {
		background: #fff3cd;
		color: #856404;
	}

	.priority-3 {
		background: #f8d7da;
		color: #721c24;
	}

	.undo,
	.delete {
		padding: 0.25rem 0.5rem;
		font-size: 0.875rem;
		cursor: pointer;
		border: 1px solid #ccc;
		border-radius: 4px;
		background: #f5f5f5;
	}

	.undo:hover,
	.delete:hover {
		background: #e0e0e0;
	}

	input[type="checkbox"] {
		flex: none;
	}
</style>
