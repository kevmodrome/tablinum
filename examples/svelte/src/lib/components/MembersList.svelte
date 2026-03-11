<script lang="ts">
	import type { MemberRecord } from "tablinum/svelte";
	import { getDb } from "$lib/db";

	let { members }: { members: ReadonlyArray<MemberRecord> } = $props();

	const db = getDb();

	function shortKey(pubkey: string): string {
		return pubkey.slice(0, 8) + "..." + pubkey.slice(-4);
	}

	async function removeMember(pubkey: string) {
		await db.removeMember(pubkey);
	}
</script>

<div class="members-list">
	<h4>Group Members</h4>
	<ul>
		{#each members as member (member.id)}
			<li class:removed={!!member.removedAt}>
				<span class="member-info">
					{#if member.name}
						<strong>{member.name}</strong>
						<span class="member-key">({shortKey(String(member.id))})</span>
					{:else}
						<span class="member-key">{shortKey(String(member.id))}</span>
					{/if}
					{#if String(member.id) === db.publicKey}
						<span class="you-badge">you</span>
					{/if}
					{#if member.removedAt}
						<span class="removed-badge">removed</span>
					{/if}
				</span>
				{#if !member.removedAt && String(member.id) !== db.publicKey}
					<button
						class="remove-btn"
						onclick={() => removeMember(String(member.id))}
					>
						Remove
					</button>
				{/if}
			</li>
		{/each}
	</ul>
</div>

<style>
	.members-list {
		margin-top: 0.75rem;
		padding-top: 0.5rem;
		border-top: 1px solid #ddd;
	}

	h4 {
		font-size: 0.85rem;
		color: #666;
		margin-bottom: 0.25rem;
	}

	ul {
		list-style: none;
		margin-top: 0.25rem;
		padding: 0;
	}

	li {
		padding: 0.375rem 0;
		font-size: 0.85rem;
		display: flex;
		align-items: center;
		justify-content: space-between;
		border-bottom: 1px solid #eee;
	}

	li.removed {
		opacity: 0.5;
	}

	.member-info {
		display: flex;
		align-items: center;
		gap: 0.375rem;
	}

	.member-key {
		font-family: monospace;
		font-size: 0.75rem;
		color: #888;
	}

	.you-badge {
		font-size: 0.7rem;
		background: #06c;
		color: white;
		padding: 0.1rem 0.35rem;
		border-radius: 3px;
	}

	.removed-badge {
		font-size: 0.7rem;
		background: #c00;
		color: white;
		padding: 0.1rem 0.35rem;
		border-radius: 3px;
	}

	.remove-btn {
		font-size: 0.75rem;
		padding: 0.2rem 0.5rem;
		color: #c00;
		border-color: #c00;
		background: white;
		cursor: pointer;
		border-radius: 4px;
	}

	.remove-btn:hover {
		background: #fee;
	}
</style>
