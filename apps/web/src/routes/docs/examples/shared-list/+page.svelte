<script lang="ts">
	import CodeBlock from "$lib/components/CodeBlock.svelte";

	const schema = `// src/lib/schema.ts
import { collection, field } from "tablinum/svelte";

export const schema = {
  items: collection("items", {
    name: field.string(),
    quantity: field.number(),
    addedBy: field.string(),    // public key of who added it
    checked: field.boolean(),
  }, {
    indices: ["checked", "addedBy"],
  }),
};`;

	const dbCreate = `// src/lib/db.ts — creating a new shared list
import { Tablinum, encodeInvite } from "tablinum/svelte";
import { schema } from "./schema";

export const db = new Tablinum({
  schema,
  relays: ["wss://relay.example.com"],
  onSyncError: (error) => console.warn("Sync:", error.message),
  onRemoved: () => {
    alert("You have been removed from this list.");
  },
  onMembersChanged: () => {
    // Trigger a re-fetch of the members list if needed
    console.log("Members changed");
  },
});

export const items = db.collection("items");

// Generate a shareable invite link
export function getInviteLink(): string {
  const invite = db.exportInvite();
  const encoded = encodeInvite(invite);
  return \`\${window.location.origin}/join?invite=\${encoded}\`;
}`;

	const dbJoin = `// src/lib/db.ts — joining an existing list
import { Tablinum, decodeInvite } from "tablinum/svelte";
import { schema } from "./schema";

export function joinList(encodedInvite: string) {
  const invite = decodeInvite(encodedInvite);

  const db = new Tablinum({
    schema,
    relays: invite.relays,
    epochKeys: invite.epochKeys,
    dbName: invite.dbName,
    onRemoved: () => {
      alert("You have been removed from this list.");
    },
  });

  return {
    db,
    items: db.collection("items"),
  };
}`;

	const joinPage = `<!-- src/routes/join/+page.svelte -->
<script lang="ts">
  import { page } from "$app/stores";
  import { joinList } from "$lib/db";

  const encoded = $page.url.searchParams.get("invite");
  if (!encoded) throw new Error("Missing invite parameter");

  const { db, items } = joinList(encoded);

  // Set your profile so others know who you are
  $effect(() => {
    if (db.status === "ready") {
      db.setProfile({ name: "Alice" });
      db.sync();
    }
  });
<\/script>

<svelte:boundary>
  {#snippet pending()}
    <p>Joining shared list...</p>
  {/snippet}

  {#if db.status === "ready"}
    <p>Joined! You are: {db.publicKey.slice(0, 8)}...</p>
  {:else if db.status === "error"}
    <p>Failed to join: {db.error?.message}</p>
  {/if}
</svelte:boundary>`;

	const addItem = `<script lang="ts">
  import { db, items } from "$lib/db";

  let name = $state("");
  let quantity = $state(1);

  async function addItem(e: SubmitEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    await items.add({
      name: name.trim(),
      quantity,
      addedBy: db.publicKey,
      checked: false,
    });
    name = "";
    quantity = 1;
  }
<\/script>

<form onsubmit={addItem}>
  <input bind:value={name} placeholder="Item name..." />
  <input type="number" bind:value={quantity} min="1" max="99" />
  <button type="submit">Add</button>
</form>`;

	const shoppingList = `<script lang="ts">
  import { db, items } from "$lib/db";

  // Unchecked items
  let needed = $derived(
    db.status === "ready"
      ? await items.where("checked").equals(false).get()
      : [],
  );

  // Checked items
  let done = $derived(
    db.status === "ready"
      ? await items.where("checked").equals(true).get()
      : [],
  );

  // Map of public key → profile name (populated below)
  let memberNames = $state<Record<string, string>>({});

  // Fetch member profiles to display names instead of public keys
  $effect(() => {
    if (db.status !== "ready") return;
    db.getMembers().then((members) => {
      const names: Record<string, string> = {};
      for (const m of members) {
        names[m.id] = m.name ?? m.id.slice(0, 8) + "...";
      }
      memberNames = names;
    });
  });

  function displayName(pubkey: string): string {
    return memberNames[pubkey] ?? pubkey.slice(0, 8) + "...";
  }

  async function toggleChecked(id: string, checked: boolean) {
    await items.update(id, { checked: !checked });
  }

  async function remove(id: string) {
    await items.delete(id);
  }
<\/script>

<h3>Need ({needed.length})</h3>
<ul>
  {#each needed as item (item.id)}
    <li>
      <input type="checkbox"
        onchange={() => toggleChecked(item.id, item.checked)} />
      <strong>{item.name}</strong> x{item.quantity}
      <small>added by {displayName(item.addedBy)}</small>
      <button onclick={() => remove(item.id)}>x</button>
    </li>
  {/each}
</ul>

{#if done.length > 0}
  <h3>Got it ({done.length})</h3>
  <ul>
    {#each done as item (item.id)}
      <li>
        <input type="checkbox" checked
          onchange={() => toggleChecked(item.id, item.checked)} />
        <s>{item.name}</s>
      </li>
    {/each}
  </ul>
{/if}`;

	const memberPanel = `<script lang="ts">
  import { db, getInviteLink } from "$lib/db";

  let members = $derived(
    db.status === "ready" ? await db.getMembers() : []
  );

  let inviteLink = $state("");

  function copyInvite() {
    inviteLink = getInviteLink();
    navigator.clipboard.writeText(inviteLink);
  }

  async function removeMember(pubkey: string) {
    if (!confirm("Remove this member? They will lose access to new data.")) return;
    await db.removeMember(pubkey);
    await db.sync();
  }
<\/script>

<h3>Members ({members.length})</h3>
<ul>
  {#each members as member (member.id)}
    <li>
      <strong>{member.name ?? "Anonymous"}</strong>
      <code>{member.id.slice(0, 12)}...</code>
      {#if member.removedAt}
        <span class="removed">removed</span>
      {:else if member.id !== db.publicKey}
        <button onclick={() => removeMember(member.id)}>Remove</button>
      {:else}
        <span>(you)</span>
      {/if}
    </li>
  {/each}
</ul>

<button onclick={copyInvite}>Copy invite link</button>
{#if inviteLink}
  <small>Copied!</small>
{/if}`;

	const profileSetup = `<script lang="ts">
  import { db } from "$lib/db";

  let name = $state("");
  let saving = $state(false);

  async function saveProfile(e: SubmitEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    saving = true;
    await db.setProfile({ name: name.trim() });
    await db.sync();
    saving = false;
  }
<\/script>

<form onsubmit={saveProfile}>
  <input bind:value={name} placeholder="Your display name..." />
  <button type="submit" disabled={saving}>
    {saving ? "Saving..." : "Set name"}
  </button>
</form>

<p>Your public key: <code>{db.publicKey.slice(0, 16)}...</code></p>`;

	const autoSync = `// Auto-sync every 30 seconds when the tab is visible
$effect(() => {
  if (db.status !== "ready") return;

  const interval = setInterval(() => {
    if (!document.hidden) db.sync();
  }, 30_000);

  // Sync once immediately on load
  db.sync();

  return () => clearInterval(interval);
});`;
</script>

<svelte:head>
	<title>Example: Shared Shopping List — Tablinum</title>
</svelte:head>

<h1>Example: Shared Shopping List</h1>

<p>
	A collaborative shopping list that multiple people can edit in real time. Share access with invite
	links, see who added each item, and revoke access with automatic key rotation.
</p>

<p>
	This example covers: collaboration, invite links, joining a shared database, member management,
	profiles, key rotation, and auto-sync.
</p>

<h2>1. Define the Schema</h2>

<p>
	Each item tracks who added it via their public key. Index <code>checked</code> and
	<code>addedBy</code> for fast filtered queries.
</p>

<CodeBlock code={schema} lang="typescript" title="src/lib/schema.ts" />

<h2>2. Create a New List</h2>

<p>
	The list creator initializes the database and generates invite links. The
	<code>onRemoved</code> callback fires if someone else removes you. The
	<code>onMembersChanged</code> callback fires when any member joins or leaves.
</p>

<CodeBlock code={dbCreate} lang="typescript" title="src/lib/db.ts" />

<h2>3. Join via Invite</h2>

<p>
	Decode the invite and pass its contents (<code>relays</code>, <code>epochKeys</code>,
	<code>dbName</code>) to a new <code>Tablinum</code> instance:
</p>

<CodeBlock code={dbJoin} lang="typescript" title="src/lib/db.ts (join variant)" />

<p>
	Create a <code>/join</code> route that reads the invite from the URL:
</p>

<CodeBlock code={joinPage} lang="svelte" title="src/routes/join/+page.svelte" />

<h2>4. Set Your Profile</h2>

<p>
	Before syncing, set a display name so collaborators know who you are.
	Profiles are synced alongside your data.
</p>

<CodeBlock code={profileSetup} lang="svelte" title="ProfileSetup.svelte" />

<h2>5. Add Items</h2>

<p>
	Stamp each item with the current user's <code>publicKey</code> so you can display
	who added it:
</p>

<CodeBlock code={addItem} lang="svelte" title="AddItem.svelte" />

<h2>6. The Shopping List</h2>

<p>
	Query items by <code>checked</code> status. Look up member profiles to show names
	instead of raw public keys:
</p>

<CodeBlock code={shoppingList} lang="svelte" title="ShoppingList.svelte" />

<h2>7. Manage Members</h2>

<p>
	Show the members list, copy invite links, and remove members. When you call
	<code>removeMember()</code>, Tablinum automatically rotates the epoch key — the removed
	person keeps their old key but cannot decrypt anything new.
</p>

<CodeBlock code={memberPanel} lang="svelte" title="MemberPanel.svelte" />

<h2>8. Auto-Sync</h2>

<p>
	Set up an interval to sync periodically so all collaborators see changes quickly.
	Only sync when the tab is visible to save battery and bandwidth:
</p>

<CodeBlock code={autoSync} lang="typescript" />

<h2>Key Takeaways</h2>

<ul>
	<li>Invites bundle everything needed to join: epoch keys, relay URLs, and database name</li>
	<li><code>db.publicKey</code> identifies the current user — stamp records with it to track authorship</li>
	<li>Call <code>setProfile()</code> so collaborators see a display name instead of a raw key</li>
	<li><code>removeMember()</code> triggers automatic key rotation — no manual crypto needed</li>
	<li><code>onRemoved</code> notifies the current user if they're kicked</li>
	<li><code>onMembersChanged</code> fires whenever someone joins or leaves</li>
	<li>All data stays encrypted end-to-end — the relay never sees item names, quantities, or who added what</li>
</ul>
