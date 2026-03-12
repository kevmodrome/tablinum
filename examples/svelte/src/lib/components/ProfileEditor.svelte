<script lang="ts">
	import { getDb } from "$lib/db";

	const db = getDb();

	let name = $state("");
	let picture = $state("");
	let about = $state("");
	let nip05 = $state("");
	let saved = $state(false);
	let open = $state(false);
	let loaded = $state(false);

	async function loadProfile() {
		const profile = await db.getProfile();
		name = profile.name ?? "";
		picture = profile.picture ?? "";
		about = profile.about ?? "";
		nip05 = profile.nip05 ?? "";
		loaded = true;
	}

	async function saveProfile() {
		await db.setProfile({
			...(name.trim() ? { name: name.trim() } : {}),
			...(picture.trim() ? { picture: picture.trim() } : {}),
			...(about.trim() ? { about: about.trim() } : {}),
			...(nip05.trim() ? { nip05: nip05.trim() } : {}),
		});
		saved = true;
		setTimeout(() => (saved = false), 2000);
	}

	function toggle() {
		open = !open;
		if (open && !loaded) {
			loadProfile();
		}
	}
</script>

<div class="profile-section">
	<button class="toggle-btn" onclick={toggle}>
		{open ? "Hide Profile" : "Edit Profile"}
	</button>

	{#if open}
		<div class="profile-form">
			<label>
				<span>Name</span>
				<input bind:value={name} placeholder="Display name" />
			</label>
			<label>
				<span>Picture URL</span>
				<input bind:value={picture} placeholder="https://..." />
			</label>
			<label>
				<span>About</span>
				<input bind:value={about} placeholder="A short bio" />
			</label>
			<label>
				<span>NIP-05</span>
				<input bind:value={nip05} placeholder="you@example.com" />
			</label>
			<button class="save-btn" onclick={saveProfile}>
				{saved ? "Saved!" : "Save Profile"}
			</button>
		</div>
	{/if}
</div>

<style>
	.profile-section {
		margin-bottom: 0.75rem;
	}

	.toggle-btn {
		font-size: 0.875rem;
		padding: 0.375rem 0.75rem;
		cursor: pointer;
		border: 1px solid #ccc;
		border-radius: 4px;
		background: #f5f5f5;
	}

	.toggle-btn:hover {
		background: #e0e0e0;
	}

	.profile-form {
		margin-top: 0.5rem;
		padding: 0.75rem;
		background: #f9f9f9;
		border: 1px solid #ddd;
		border-radius: 4px;
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	label {
		display: flex;
		flex-direction: column;
		gap: 0.15rem;
		font-size: 0.85rem;
	}

	label span {
		font-weight: 600;
		color: #555;
	}

	input {
		padding: 0.375rem 0.5rem;
		font-size: 0.85rem;
		border: 1px solid #ccc;
		border-radius: 4px;
	}

	.save-btn {
		align-self: flex-start;
		font-size: 0.875rem;
		padding: 0.375rem 0.75rem;
		cursor: pointer;
		border: 1px solid #06c;
		border-radius: 4px;
		background: #06c;
		color: white;
		margin-top: 0.25rem;
	}

	.save-btn:hover {
		background: #0056b3;
	}
</style>
