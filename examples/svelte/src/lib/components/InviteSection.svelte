<script lang="ts">
	import { encodeInvite } from "tablinum/svelte";
	import { getDb } from "$lib/db";
	import { dbUiState } from "$lib/db-state.svelte";
	import MembersList from "./MembersList.svelte";

	const db = getDb();

	let members = $derived(db.status === "ready" ? await db.members.get() : []);
	let importInviteCode = $state("");
	let inviteCopied = $state(false);
	let linkCopied = $state(false);
	let showMembers = $state(false);

	function copyInviteCode() {
		const invite = db.exportInvite();
		const code = encodeInvite(invite);
		navigator.clipboard.writeText(code).then(
			() => {
				inviteCopied = true;
				setTimeout(() => (inviteCopied = false), 2000);
			},
			() => {},
		);
	}

	function copyInviteLink() {
		const invite = db.exportInvite();
		const code = encodeInvite(invite);
		const url = `${window.location.origin}${window.location.pathname}?invite=${code}`;
		navigator.clipboard.writeText(url).then(
			() => {
				linkCopied = true;
				setTimeout(() => (linkCopied = false), 2000);
			},
			() => {},
		);
	}

	function joinWithInvite() {
		const code = importInviteCode.trim();
		if (!code) return;
		window.location.search = `?invite=${encodeURIComponent(code)}`;
	}
</script>

<div class="invite-section">
	<h3>Collaboration</h3>
	{#if dbUiState.joinedViaInvite}
		<p class="joined-badge">Joined via invite link</p>
	{/if}
	<div class="invite-actions">
		<button onclick={copyInviteCode}
			>{inviteCopied ? "Copied!" : "Copy Invite Code"}</button
		>
		<button onclick={copyInviteLink}
			>{linkCopied ? "Copied!" : "Copy Invite Link"}</button
		>
		<button onclick={() => (showMembers = !showMembers)}
			>{showMembers ? "Hide Members" : `Members (${members.length})`}</button
		>
	</div>
	<div class="invite-import">
		<input
			bind:value={importInviteCode}
			placeholder="Paste an invite code to join..."
		/>
		<button onclick={joinWithInvite}>Join</button>
	</div>

	{#if showMembers && members.length > 0}
		<MembersList {members} />
	{/if}
</div>

<style>
	.invite-section {
		margin-bottom: 1rem;
		padding: 0.75rem;
		background: #f9f9f9;
		border: 1px solid #ddd;
		border-radius: 4px;
	}

	h3 {
		font-size: 0.95rem;
		margin-bottom: 0.5rem;
	}

	.invite-actions {
		display: flex;
		gap: 0.5rem;
		margin-bottom: 0.5rem;
		flex-wrap: wrap;
	}

	.invite-actions button {
		font-size: 0.875rem;
		padding: 0.375rem 0.75rem;
		cursor: pointer;
		border: 1px solid #ccc;
		border-radius: 4px;
		background: #f5f5f5;
	}

	.invite-actions button:hover {
		background: #e0e0e0;
	}

	.invite-import {
		display: flex;
		gap: 0.5rem;
	}

	.invite-import input {
		flex: 1;
		font-family: monospace;
		font-size: 0.8rem;
		padding: 0.375rem 0.5rem;
		border: 1px solid #ccc;
		border-radius: 4px;
	}

	.invite-import button {
		font-size: 0.875rem;
		padding: 0.375rem 0.75rem;
		cursor: pointer;
		border: 1px solid #ccc;
		border-radius: 4px;
		background: #f5f5f5;
	}

	.invite-import button:hover {
		background: #e0e0e0;
	}

	.joined-badge {
		font-size: 0.8rem;
		color: #06c;
		margin-bottom: 0.5rem;
	}
</style>
