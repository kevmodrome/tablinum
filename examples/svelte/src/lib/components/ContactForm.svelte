<script lang="ts">
	import { getDb } from "$lib/db";

	const contacts = getDb().collection("contacts");

	let name = $state("");
	let email = $state("");
	let street = $state("");
	let city = $state("");
	let zip = $state("");

	async function addContact(e: SubmitEvent) {
		e.preventDefault();
		if (!name.trim() || !street.trim() || !city.trim()) return;
		await contacts.add({
			name: name.trim(),
			email: email.trim() || undefined,
			address: {
				street: street.trim(),
				city: city.trim(),
				zip: zip.trim() || undefined,
			},
		});
		name = "";
		email = "";
		street = "";
		city = "";
		zip = "";
	}
</script>

<form onsubmit={addContact}>
	<div class="row">
		<input bind:value={name} placeholder="Name" required />
		<input bind:value={email} placeholder="Email (optional)" />
	</div>
	<div class="row">
		<input bind:value={street} placeholder="Street" required />
		<input bind:value={city} placeholder="City" required />
		<input bind:value={zip} placeholder="Zip (optional)" class="zip" />
	</div>
	<button type="submit">Add Contact</button>
</form>

<style>
	form {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		margin-bottom: 1rem;
	}

	.row {
		display: flex;
		gap: 0.5rem;
	}

	input {
		flex: 1;
		padding: 0.5rem;
		font-size: 1rem;
		border: 1px solid #ccc;
		border-radius: 4px;
	}

	.zip {
		max-width: 6rem;
	}

	button {
		padding: 0.5rem 1rem;
		font-size: 1rem;
		cursor: pointer;
		border: 1px solid #ccc;
		border-radius: 4px;
		background: #f5f5f5;
		align-self: flex-start;
	}

	button:hover {
		background: #e0e0e0;
	}
</style>
