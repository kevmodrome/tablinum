<script lang="ts">
	import { getDb } from "$lib/db";
	import ContactForm from "$lib/components/ContactForm.svelte";
	import ContactList from "$lib/components/ContactList.svelte";

	const db = getDb();
	const contacts = db.collection("contacts");

	let allContacts = $derived(db.status === "ready" ? await contacts.get() : []);
</script>

<svelte:boundary>
	{#snippet pending()}
		<main>
			<h1>Contacts</h1>
			<p>Loading contacts...</p>
		</main>
	{/snippet}

	<main>
		<h1>Contacts</h1>

		{#if db.status === "ready"}
			<ContactForm />
			<ContactList items={allContacts} />
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
</style>
