<script lang="ts">
	import CodeBlock from "$lib/components/CodeBlock.svelte";

	const schema = `// src/lib/schema.ts
import { collection, field } from "tablinum/svelte";

export const schema = {
  todos: collection("todos", {
    title: field.string(),
    done: field.boolean(),
    priority: field.number(),
    notes: field.optional(field.string()),
  }, {
    indices: ["done", "priority"],
    eventRetention: 5,  // keep last 5 events per record for undo
  }),
};`;

	const dbModule = `// src/lib/db.ts
import { Tablinum } from "tablinum/svelte";
import { schema } from "./schema";

export const db = new Tablinum({
  schema,
  relays: ["wss://relay.example.com"],
  logLevel: "info",
  onSyncError: (error) => {
    console.warn("Sync failed:", error.message);
  },
});

export const todos = db.collection("todos");`;

	const addForm = `<script lang="ts">
  import { todos } from "$lib/db";

  let title = $state("");
  let priority = $state(1);

  async function addTodo(e: SubmitEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    await todos.add({
      title: title.trim(),
      done: false,
      priority,
    });
    title = "";
    priority = 1;
  }
<\/script>

<form onsubmit={addTodo}>
  <input bind:value={title} placeholder="What needs doing?" />
  <select bind:value={priority}>
    <option value={1}>Low</option>
    <option value={2}>Medium</option>
    <option value={3}>High</option>
  </select>
  <button type="submit">Add</button>
</form>`;

	const todoList = `<script lang="ts">
  import { db, todos } from "$lib/db";

  // Pending todos, sorted by priority (high first)
  let pending = $derived(
    db.status === "ready"
      ? await todos.where("done").equals(false)
          .sortBy("priority")
          .reverse()
          .get()
      : [],
  );

  // Completed todos
  let completed = $derived(
    db.status === "ready"
      ? await todos.where("done").equals(true).get()
      : [],
  );

  // Total count
  let total = $derived(
    db.status === "ready" ? await todos.count() : 0
  );

  async function toggle(id: string, currentDone: boolean) {
    await todos.update(id, { done: !currentDone });
  }

  async function remove(id: string) {
    await todos.delete(id);
  }

  async function undoLast(id: string) {
    await todos.undo(id);
  }
<\/script>

<p>{pending.length} pending of {total} total</p>

<h3>To Do</h3>
<ul>
  {#each pending as todo (todo.id)}
    <li>
      <input type="checkbox"
        onchange={() => toggle(todo.id, todo.done)} />
      <span class="priority-{todo.priority}">{todo.title}</span>
      {#if todo.notes}
        <small>{todo.notes}</small>
      {/if}
      <button onclick={() => undoLast(todo.id)}>Undo</button>
      <button onclick={() => remove(todo.id)}>Delete</button>
    </li>
  {/each}
</ul>

<h3>Done</h3>
<ul>
  {#each completed as todo (todo.id)}
    <li>
      <input type="checkbox" checked
        onchange={() => toggle(todo.id, todo.done)} />
      <s>{todo.title}</s>
    </li>
  {/each}
</ul>`;

	const syncControls = `<script lang="ts">
  import { db } from "$lib/db";
<\/script>

{#if db.status === "error"}
  <p class="error">Error: {db.error?.message}</p>
{/if}

<footer>
  <button onclick={() => db.sync()} disabled={db.syncStatus === "syncing"}>
    {db.syncStatus === "syncing" ? "Syncing..." : "Sync"}
  </button>

  {#if db.pendingCount > 0}
    <span>{db.pendingCount} unsynced changes</span>
  {/if}

  {#if db.relayStatus.connectedUrls.length > 0}
    <span>Connected to {db.relayStatus.connectedUrls.length} relay(s)</span>
  {:else}
    <span>Offline</span>
  {/if}
</footer>`;

	const fullApp = `<script lang="ts">
  import { db, todos } from "$lib/db";
  import type { InferRecord } from "tablinum/svelte";
  import { schema } from "$lib/schema";

  type Todo = InferRecord<typeof schema.todos>;

  let title = $state("");
  let priority = $state(1);

  let pending = $derived(
    db.status === "ready"
      ? await todos.where("done").equals(false)
          .sortBy("priority")
          .reverse()
          .get()
      : [],
  );

  let completed = $derived(
    db.status === "ready"
      ? await todos.where("done").equals(true).get()
      : [],
  );

  async function addTodo(e: SubmitEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    await todos.add({ title: title.trim(), done: false, priority });
    title = "";
    priority = 1;
  }

  async function toggle(id: string, done: boolean) {
    await todos.update(id, { done: !done });
  }

  async function remove(id: string) {
    await todos.delete(id);
  }

  async function undo(id: string) {
    await todos.undo(id);
  }
<\/script>

<svelte:boundary>
  {#snippet pending()}
    <p>Loading database...</p>
  {/snippet}

  {#if db.status === "error"}
    <p>Error: {db.error?.message}</p>
  {:else}
    <h2>Todos</h2>

    <form onsubmit={addTodo}>
      <input bind:value={title} placeholder="What needs doing?" />
      <select bind:value={priority}>
        <option value={1}>Low</option>
        <option value={2}>Medium</option>
        <option value={3}>High</option>
      </select>
      <button type="submit">Add</button>
    </form>

    <ul>
      {#each pending as todo (todo.id)}
        <li>
          <input type="checkbox"
            onchange={() => toggle(todo.id, todo.done)} />
          <span>{todo.title}</span>
          <button onclick={() => undo(todo.id)}>Undo</button>
          <button onclick={() => remove(todo.id)}>x</button>
        </li>
      {/each}
    </ul>

    {#if completed.length > 0}
      <h3>Completed</h3>
      <ul>
        {#each completed as todo (todo.id)}
          <li>
            <input type="checkbox" checked
              onchange={() => toggle(todo.id, todo.done)} />
            <s>{todo.title}</s>
          </li>
        {/each}
      </ul>
    {/if}

    <footer>
      <button onclick={() => db.sync()}
        disabled={db.syncStatus === "syncing"}>
        {db.syncStatus === "syncing" ? "Syncing..." : "Sync now"}
      </button>
      {#if db.pendingCount > 0}
        <small>{db.pendingCount} unsynced</small>
      {/if}
    </footer>
  {/if}
</svelte:boundary>`;
</script>

<svelte:head>
	<title>Example: Personal Todo App — Tablinum</title>
</svelte:head>

<h1>Example: Personal Todo App</h1>

<p>
	A single-user todo app that stores data locally and syncs across your devices via an encrypted
	Nostr relay. No collaboration — just your data, everywhere you need it.
</p>

<p>
	This example covers: schema with indices, CRUD operations, filtered and sorted queries, undo,
	sync status, and offline support.
</p>

<h2>1. Define a Schema</h2>

<p>
	Start with a collection for todos. We index <code>done</code> and <code>priority</code> so
	filtered queries on those fields are fast. Setting <code>eventRetention</code> to 5 lets us undo
	up to 5 changes per record.
</p>

<CodeBlock code={schema} lang="typescript" title="src/lib/schema.ts" />

<h2>2. Create the Database Module</h2>

<p>
	Instantiate <code>Tablinum</code> once and export the database and collection handles.
	Every component imports from this module.
</p>

<CodeBlock code={dbModule} lang="typescript" title="src/lib/db.ts" />

<h2>3. Add Todos</h2>

<p>
	A form component that calls <code>todos.add()</code>. The data is written to IndexedDB immediately —
	no loading spinners, no network round-trip.
</p>

<CodeBlock code={addForm} lang="svelte" title="AddTodo.svelte" />

<h2>4. List and Filter Todos</h2>

<p>
	Use <code>$derived(await ...)</code> for reactive queries. When data changes (add, update, delete, undo,
	or sync), the queries re-evaluate automatically. Chain <code>.sortBy()</code> and <code>.reverse()</code>
	for sorting.
</p>

<CodeBlock code={todoList} lang="svelte" title="TodoList.svelte" />

<h2>5. Sync Controls</h2>

<p>
	Show sync status, pending change count, and relay connectivity. The <code>sync()</code> call
	exchanges encrypted data with your relay — other devices running the same app (with the same
	private key) pick up the changes.
</p>

<CodeBlock code={syncControls} lang="svelte" title="SyncBar.svelte" />

<h2>Full App</h2>

<p>
	Here's everything in a single component. In a real app you'd split this into the pieces above,
	but this shows the complete picture:
</p>

<CodeBlock code={fullApp} lang="svelte" title="src/routes/+page.svelte" />

<h2>Key Takeaways</h2>

<ul>
	<li>All reads and writes are local — the app works offline out of the box</li>
	<li><code>$derived(await ...)</code> handles reactivity. No manual subscriptions needed</li>
	<li>Guard queries with <code>db.status === "ready"</code> since the database initializes async</li>
	<li><code>undo(id)</code> reverts the last change, up to <code>eventRetention</code> deep</li>
	<li><code>sync()</code> is explicit — call it when the user taps "Sync" or on an interval</li>
	<li>Use <code>InferRecord&lt;typeof collection&gt;</code> for typed records</li>
</ul>
