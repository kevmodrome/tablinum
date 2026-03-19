<script lang="ts">
	import CodeBlock from "$lib/components/CodeBlock.svelte";

	const dbModule = `// src/lib/db.ts
import {
  Tablinum, field, collection,
  decodeInvite, encodeInvite,
  type InferRecord,
} from "tablinum/svelte";

const itemsCollection = collection(
  "items",
  {
    name: field.string(),
    quantity: field.number(),
    addedBy: field.string(),    // public key of who added it
    checked: field.boolean(),
  },
  { indices: ["checked", "addedBy"] },
);

export type ItemRecord = InferRecord<typeof itemsCollection>;

const schema = { items: itemsCollection };
type AppSchema = typeof schema;

// --- Invite helpers ---

function getInviteFromUrl() {
  const params = new URLSearchParams(window.location.search);
  const invite = params.get("invite");
  if (!invite) return undefined;
  try {
    return decodeInvite(invite);
  } catch {
    console.error("[tablinum] Invalid invite in URL");
    return undefined;
  }
}

// --- Singleton database ---

let _db: Tablinum<AppSchema> | null = null;

export function initDb() {
  if (_db && _db.status !== "closed" && _db.status !== "error") return _db;

  const invite = getInviteFromUrl();

  _db = new Tablinum({
    schema,
    relays: invite?.relays ?? ["wss://relay.example.com"],
    dbName: invite?.dbName,
    epochKeys: invite?.epochKeys,
    onSyncError: (err) => {
      console.error("[tablinum:sync]", err.message);
    },
    onRemoved: (info) => {
      console.warn("Removed from list:", info);
    },
  });

  return _db;
}

export function getDb() {
  if (!_db) throw new Error("Database not initialized");
  return _db;
}

export function getInviteLink(): string {
  const db = getDb();
  const invite = db.exportInvite();
  const encoded = encodeInvite(invite);
  return \`\${window.location.origin}/shopping?invite=\${encodeURIComponent(encoded)}\`;
}`;

	const hooksClient = `// src/hooks.client.ts
import { initDb, getDb } from "$lib/db";

export async function init() {
  initDb();
  await getDb().ready.catch(() => undefined);
}`;

	const shoppingForm = `<!-- src/lib/components/ShoppingForm.svelte -->
<script lang="ts">
  import { getDb } from "$lib/db";

  const db = getDb();
  const items = db.collection("items");

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
  <input bind:value={name} placeholder="Add an item..." />
  <input type="number" bind:value={quantity} min={1} max={99} />
  <button type="submit">Add</button>
</form>`;

	const shoppingList = `<!-- src/lib/components/ShoppingList.svelte -->
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
<\/script>

<ul>
  {#each records as item (item.id)}
    <li class:checked>
      <label>
        <input
          type="checkbox"
          {checked}
          onchange={() => toggleChecked(item.id, item.checked)}
        />
        <span>{item.name}</span>
        {#if item.quantity > 1}
          <span class="qty">x{item.quantity}</span>
        {/if}
      </label>
      <button onclick={() => remove(item.id)}>✕</button>
    </li>
  {/each}
</ul>`;

	const shoppingMembers = `<!-- src/lib/components/ShoppingMembers.svelte -->
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
<\/script>

<div class="members-panel">
  <h3>Members ({members.length})</h3>

  <ul>
    {#each members as member (member.id)}
      <li>
        <span>{member.name ?? member.id.slice(0, 12) + "..."}</span>
        {#if member.id === db.publicKey}
          <span>(you)</span>
        {:else if !member.removedAt}
          <button onclick={() => removeMember(member.id)}>Remove</button>
        {:else}
          <span>removed</span>
        {/if}
      </li>
    {/each}
  </ul>

  <div class="profile">
    <h4>Your Profile</h4>
    <p>Key: {db.publicKey.slice(0, 16)}...</p>
    <form onsubmit={(e) => { e.preventDefault(); saveProfile(); }}>
      <input bind:value={name} placeholder="Display name..." />
      <button type="submit">Save</button>
    </form>
    {#if profileSaved}
      <p>Saved!</p>
    {/if}
  </div>
</div>`;

	const shoppingPage = `<!-- src/routes/shopping/+page.svelte -->
<script lang="ts">
  import { getDb, getInviteLink } from "$lib/db";
  import ShoppingForm from "$lib/components/ShoppingForm.svelte";
  import ShoppingList from "$lib/components/ShoppingList.svelte";
  import ShoppingMembers from "$lib/components/ShoppingMembers.svelte";

  const db = getDb();
  const items = db.collection("items");

  let needed = $derived(
    await items.where("checked").equals(false).get(),
  );
  let done = $derived(
    await items.where("checked").equals(true).get(),
  );

  let showMembers = $state(false);

  async function copyInvite() {
    const link = getInviteLink();
    await navigator.clipboard.writeText(link);
  }
<\/script>

<svelte:boundary>
  {#snippet pending()}
    <p>Loading...</p>
  {/snippet}

  <h1>Shopping List</h1>

  <div class="toolbar">
    <button onclick={copyInvite}>Copy Invite Link</button>
    <button onclick={() => showMembers = !showMembers}>
      {showMembers ? "Hide" : "Show"} Members
    </button>
    <button
      onclick={() => db.sync()}
      disabled={db.syncStatus === "syncing"}
    >
      {db.syncStatus === "syncing" ? "Syncing..." : "Sync"}
    </button>
  </div>

  {#if showMembers}
    <ShoppingMembers />
  {/if}

  <ShoppingForm />

  <h2>Need ({needed.length})</h2>
  <ShoppingList {items} records={needed} checked={false} />

  {#if done.length > 0}
    <h2>Got ({done.length})</h2>
    <ShoppingList {items} records={done} checked={true} />
  {/if}

  {#if db.pendingCount > 0}
    <p>{db.pendingCount} unsynced changes</p>
  {/if}
</svelte:boundary>`;
</script>

<svelte:head>
	<title>Example: Shared Shopping List — Tablinum</title>
</svelte:head>

<h1>Example: Shared Shopping List</h1>

<p>
	A collaborative shopping list that multiple people can edit. Share access with invite
	links, manage members, and sync manually. When a member is removed, Tablinum automatically
	rotates the epoch key — the removed person keeps their old key but cannot decrypt anything new.
</p>

<p>
	This example covers: collaboration, invite links, auto-joining via URL, member management,
	profiles, key rotation, and manual sync.
</p>

<blockquote>
	View the full working source on <a
		href="https://github.com/kevmodrome/localstr/tree/main/examples/svelte"
		target="_blank"
		rel="noopener noreferrer">GitHub</a
	>.
</blockquote>

<h2>1. Database Module</h2>

<p>
	The database module handles both creating a new list and joining an existing one.
	When the page loads with an <code>?invite=</code> query parameter, the invite is
	automatically decoded and its <code>relays</code>, <code>epochKeys</code>, and
	<code>dbName</code> are passed to the <code>Tablinum</code> constructor. No separate
	join page is needed.
</p>

<p>
	Each item tracks who added it via <code>addedBy</code> (the user's public key).
	The <code>getInviteLink()</code> helper generates a shareable URL containing the
	encoded invite.
</p>

<CodeBlock code={dbModule} lang="typescript" title="src/lib/db.ts" />

<h2>2. Initialize in the Client Hook</h2>

<p>
	Same pattern as the todo example — initialize in the <code>init</code> hook so the
	database is ready before components render:
</p>

<CodeBlock code={hooksClient} lang="typescript" title="src/hooks.client.ts" />

<h2>3. Add Items</h2>

<p>
	Stamp each item with the current user's <code>db.publicKey</code> so you can track
	who added what:
</p>

<CodeBlock code={shoppingForm} lang="svelte" title="ShoppingForm.svelte" />

<h2>4. Display the List</h2>

<p>
	<code>ShoppingList</code> is a reusable component that receives the collection handle and
	a filtered array of records as props. The parent page splits items into "needed" and "got"
	lists. Notice it accepts <code>Collection&lt;any&gt;</code> — the component doesn't need
	to know the full schema to call <code>update()</code> and <code>delete()</code>.
</p>

<CodeBlock code={shoppingList} lang="svelte" title="ShoppingList.svelte" />

<h2>5. Manage Members</h2>

<p>
	The members panel combines the member list with a profile editor. Members are queried
	reactively via <code>db.members</code> (a built-in collection). Call
	<code>db.setProfile()</code> to set a display name that other collaborators will see,
	and <code>db.removeMember()</code> to revoke someone's access — this triggers automatic
	key rotation.
</p>

<CodeBlock code={shoppingMembers} lang="svelte" title="ShoppingMembers.svelte" />

<h2>6. Page Component</h2>

<p>
	The page component ties everything together. It queries items by <code>checked</code> status,
	provides a toolbar for copying invite links, toggling the members panel, and triggering
	a manual sync. The <code>pendingCount</code> property shows how many local changes haven't
	been synced yet.
</p>

<CodeBlock code={shoppingPage} lang="svelte" title="src/routes/shopping/+page.svelte" />

<h2>How Invites Work</h2>

<p>
	The flow for sharing a list is:
</p>

<ol>
	<li>User A clicks "Copy Invite Link" — this calls <code>db.exportInvite()</code> and
		encodes the result into a URL</li>
	<li>User A sends the link to User B</li>
	<li>User B opens the link — the <code>?invite=</code> parameter is detected in
		<code>initDb()</code>, which decodes it and passes the epoch keys, relays, and
		database name to the constructor</li>
	<li>User B's database automatically syncs with the shared relays using the provided keys</li>
</ol>

<p>
	No separate <code>/join</code> route is needed — the same page handles both creating and
	joining a list.
</p>

<h2>Key Takeaways</h2>

<ul>
	<li>One <code>initDb()</code> function handles both new databases and joining via invite</li>
	<li><code>db.publicKey</code> identifies the current user — stamp records with it to track authorship</li>
	<li>Call <code>db.setProfile()</code> so collaborators see a display name instead of a raw key</li>
	<li><code>db.removeMember()</code> triggers automatic key rotation — no manual crypto needed</li>
	<li><code>db.members</code> is a reactive collection — query it with <code>$derived(await ...)</code> like any other collection</li>
	<li><code>onRemoved</code> notifies the current user if they're kicked</li>
	<li>Sync is manual via a toolbar button — call <code>db.sync()</code> when the user wants it</li>
	<li>All data stays encrypted end-to-end — the relay never sees item names, quantities, or who added what</li>
</ul>
