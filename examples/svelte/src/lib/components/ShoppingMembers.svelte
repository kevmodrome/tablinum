<script lang="ts">
	import { getDb } from "$lib/db";

	const db = getDb();
	const membersCollection = db.members;

	let members = $derived(await membersCollection.get());

	let name = $state("");
	let profileSaved = $state(false);

	async function saveProfile() {
		if (!name.trim()) return;
		await db.setProfile({ name: name.trim() });
		profileSaved = true;
	}

	async function removeMember(pubkey: string) {
		await db.removeMember(pubkey);
	}
</script>

<div class="members-panel">
	<h3>Members ({members.length})</h3>

	<ul>
		{#each members as member (member.id)}
			<li>
				<span class="name">{member.name ?? member.id.slice(0, 12) + "..."}</span>
				{#if member.id === db.publicKey}
					<span class="you">(you)</span>
				{:else if !member.removedAt}
					<button class="remove" onclick={() => removeMember(member.id)}>Remove</button>
				{:else}
					<span class="removed">removed</span>
				{/if}
			</li>
		{/each}
	</ul>

	<div class="profile">
		<h4>Your Profile</h4>
		<p class="pubkey">Key: {db.publicKey.slice(0, 16)}...</p>
		<form onsubmit={(e) => { e.preventDefault(); saveProfile(); }}>
			<input bind:value={name} placeholder="Display name..." />
			<button type="submit">Save</button>
		</form>
		{#if profileSaved}
			<p class="saved">Saved!</p>
		{/if}
	</div>
</div>

<style>
	.members-panel {
		background: #f9f9f9;
		border: 1px solid #ddd;
		border-radius: 6px;
		padding: 1rem;
		margin-bottom: 1rem;
	}

	h3 {
		margin-bottom: 0.5rem;
		font-size: 0.95rem;
	}

	h4 {
		margin: 1rem 0 0.25rem;
		font-size: 0.9rem;
	}

	ul {
		list-style: none;
		padding: 0;
	}

	li {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.25rem 0;
	}

	.name {
		flex: 1;
	}

	.you {
		font-size: 0.8rem;
		color: #666;
	}

	.removed {
		font-size: 0.8rem;
		color: #999;
		font-style: italic;
	}

	.remove {
		padding: 0.15rem 0.5rem;
		font-size: 0.8rem;
		cursor: pointer;
		border: 1px solid #ccc;
		border-radius: 3px;
		background: #f5f5f5;
	}

	.pubkey {
		font-size: 0.8rem;
		color: #888;
		font-family: monospace;
		margin-bottom: 0.5rem;
	}

	.profile form {
		display: flex;
		gap: 0.5rem;
	}

	.profile input {
		flex: 1;
		padding: 0.35rem 0.5rem;
		font-size: 0.875rem;
		border: 1px solid #ccc;
		border-radius: 4px;
	}

	.profile button {
		padding: 0.35rem 0.75rem;
		font-size: 0.875rem;
		cursor: pointer;
		border: 1px solid #ccc;
		border-radius: 4px;
		background: #f5f5f5;
	}

	.saved {
		color: green;
		font-size: 0.8rem;
		margin-top: 0.25rem;
	}
</style>
