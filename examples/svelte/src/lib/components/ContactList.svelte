<script lang="ts">
	import { getDb, type ContactRecord } from "$lib/db";

	let { items }: { items: ReadonlyArray<ContactRecord> } = $props();

	const contacts = getDb().collection("contacts");

	async function remove(id: string) {
		await contacts.delete(id);
	}
</script>

<h2>Contacts ({items.length})</h2>
<ul>
	{#each items as contact (contact.id)}
		<li>
			<div class="info">
				<strong>{contact.name}</strong>
				{#if contact.email}
					<span class="email">{contact.email}</span>
				{/if}
				<span class="address">
					{contact.address.street}, {contact.address.city}{#if contact.address.zip}&nbsp;{contact.address.zip}{/if}
				</span>
			</div>
			<button class="delete" onclick={() => remove(contact.id)}>&#x2715;</button>
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

	.info {
		flex: 1;
		display: flex;
		flex-direction: column;
		gap: 0.15rem;
	}

	.email {
		font-size: 0.85rem;
		color: #06c;
	}

	.address {
		font-size: 0.85rem;
		color: #666;
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
</style>
