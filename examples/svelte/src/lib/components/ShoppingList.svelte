<script lang="ts">
	import type { ItemRecord } from "$lib/db";
	import type { Collection } from "tablinum/svelte";

	let {
		items,
		records,
		checked,
	}: {
		items: Collection<any>;
		records: ReadonlyArray<ItemRecord>;
		checked: boolean;
	} = $props();

	async function toggleChecked(id: string, current: boolean) {
		await items.update(id, { checked: !current });
	}

	async function remove(id: string) {
		await items.delete(id);
	}
</script>

<ul>
	{#each records as item (item.id)}
		<li class:checked>
			<label>
				<input
					type="checkbox"
					{checked}
					onchange={() => toggleChecked(item.id, item.checked)}
				/>
				<span class="name">{item.name}</span>
				{#if item.quantity > 1}
					<span class="qty">x{item.quantity}</span>
				{/if}
			</label>
			<button class="delete" onclick={() => remove(item.id)}>&#x2715;</button>
		</li>
	{/each}
</ul>

<style>
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

	li.checked .name {
		opacity: 0.5;
		text-decoration: line-through;
	}

	.qty {
		font-size: 0.8rem;
		color: #666;
		background: #f0f0f0;
		padding: 0.1rem 0.4rem;
		border-radius: 3px;
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
