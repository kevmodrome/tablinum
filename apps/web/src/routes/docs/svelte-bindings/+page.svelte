<script lang="ts">
	import CodeBlock from "$lib/components/CodeBlock.svelte";

	const svelteConfig = `// svelte.config.js
const config = {
  compilerOptions: {
    experimental: {
      async: true,
    },
  },
};`;

	const dbSetup = `// src/lib/db.ts
import { Tablinum, collection, field } from "tablinum/svelte";

const schema = {
  todos: collection("todos", {
    title: field.string(),
    done: field.boolean(),
  }, { indices: ["done"] }),
};

export const db = new Tablinum({
  schema,
  relays: ["wss://relay.example.com"],
});

export const todos = db.collection("todos");`;

	const reactiveQueries = `<script lang="ts">
  import { db, todos } from "$lib/db";

  // All records
  let allTodos = $derived(
    db.status === "ready" ? await todos.get() : []
  );

  // Filtered query — auto-updates when data changes
  let pending = $derived(
    db.status === "ready"
      ? await todos.where("done").equals(false).get()
      : [],
  );

  // Count
  let total = $derived(
    db.status === "ready" ? await todos.count() : 0
  );
<\/script>

<p>{pending.length} pending of {total} total</p>`;

	const errorBoundary = `<svelte:boundary>
  {#snippet pending()}
    <p>Loading...</p>
  {/snippet}

  <!-- Your app content with async queries -->
  <TodoList />
</svelte:boundary>`;

	const fullComponent = `<script lang="ts">
  import { db, todos } from "$lib/db";

  let title = $state("");

  let pending = $derived(
    db.status === "ready"
      ? await todos.where("done").equals(false).get()
      : [],
  );

  async function addTodo(e: SubmitEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    await todos.add({ title: title.trim(), done: false });
    title = "";
  }

  async function toggle(id: string, done: boolean) {
    await todos.update(id, { done: !done });
  }

  async function remove(id: string) {
    await todos.delete(id);
  }
<\/script>

{#if db.status === "error"}
  <p>Error: {db.error?.message}</p>
{:else}
  <form onsubmit={addTodo}>
    <input bind:value={title} placeholder="New todo..." />
    <button type="submit">Add</button>
  </form>

  <ul>
    {#each pending as todo (todo.id)}
      <li>
        <input type="checkbox" checked={todo.done}
          onchange={() => toggle(todo.id, todo.done)} />
        <span>{todo.title}</span>
        <button onclick={() => remove(todo.id)}>x</button>
      </li>
    {/each}
  </ul>

  {#if db.syncStatus === "syncing"}
    <p>Syncing...</p>
  {/if}
  <button onclick={() => db.sync()}>Sync</button>
{/if}`;
</script>

<svelte:head>
	<title>Svelte 5 Integration — Tablinum</title>
</svelte:head>

<h1>Svelte 5 Integration</h1>

<p>
	Tablinum provides first-class Svelte 5 bindings with reactive queries using async runes.
	Import from <code>tablinum/svelte</code> for a Promise-based API that integrates naturally
	with Svelte's reactivity system.
</p>

<h2>Setup</h2>

<p>
	Enable Svelte's experimental async support in your config:
</p>

<CodeBlock code={svelteConfig} lang="javascript" title="svelte.config.js" />

<h2>Creating a Database</h2>

<p>
	Use <code>new Tablinum(config)</code> to create a database instance. It starts initialization
	immediately and exposes reactive state properties:
</p>

<CodeBlock code={dbSetup} lang="typescript" title="src/lib/db.ts" />

<h2>Reactive Properties</h2>

<p>
	The <code>Tablinum</code> instance exposes reactive <code>$state</code> properties that
	Svelte tracks automatically:
</p>

<table>
	<thead>
		<tr>
			<th>Property</th>
			<th>Type</th>
			<th>Description</th>
		</tr>
	</thead>
	<tbody>
		<tr>
			<td><code>status</code></td>
			<td><code>"initializing" | "ready" | "error" | "closed"</code></td>
			<td>Database lifecycle state</td>
		</tr>
		<tr>
			<td><code>syncStatus</code></td>
			<td><code>"idle" | "syncing"</code></td>
			<td>Current sync activity</td>
		</tr>
		<tr>
			<td><code>pendingCount</code></td>
			<td><code>number</code></td>
			<td>Unsynced local changes</td>
		</tr>
		<tr>
			<td><code>relayStatus</code></td>
			<td><code>&#123; connectedUrls: string[] &#125;</code></td>
			<td>Connected relay URLs</td>
		</tr>
		<tr>
			<td><code>error</code></td>
			<td><code>Error | null</code></td>
			<td>Initialization error, if any</td>
		</tr>
		<tr>
			<td><code>ready</code></td>
			<td><code>Promise&lt;void&gt;</code></td>
			<td>Resolves when database is ready</td>
		</tr>
	</tbody>
</table>

<h2>Reactive Queries</h2>

<p>
	The key pattern is <code>$derived(await ...)</code>. Queries touch an internal version counter
	that Svelte tracks — when data changes, the derived value re-evaluates automatically:
</p>

<CodeBlock code={reactiveQueries} lang="svelte" />

<p>
	Guard queries with <code>db.status === "ready"</code> to avoid querying before the database
	is initialized.
</p>

<h2>Collection API</h2>

<p>
	The Svelte collection API mirrors the Effect API but returns Promises instead of Effects:
</p>

<table>
	<thead>
		<tr>
			<th>Method</th>
			<th>Returns</th>
		</tr>
	</thead>
	<tbody>
		<tr><td><code>add(data)</code></td><td><code>Promise&lt;string&gt;</code> (new id)</td></tr>
		<tr><td><code>get()</code></td><td><code>Promise&lt;ReadonlyArray&lt;T&gt;&gt;</code></td></tr>
		<tr><td><code>get(id)</code></td><td><code>Promise&lt;T&gt;</code></td></tr>
		<tr><td><code>update(id, data)</code></td><td><code>Promise&lt;void&gt;</code></td></tr>
		<tr><td><code>delete(id)</code></td><td><code>Promise&lt;void&gt;</code></td></tr>
		<tr><td><code>undo(id)</code></td><td><code>Promise&lt;void&gt;</code></td></tr>
		<tr><td><code>first()</code></td><td><code>Promise&lt;T | null&gt;</code></td></tr>
		<tr><td><code>count()</code></td><td><code>Promise&lt;number&gt;</code></td></tr>
		<tr><td><code>where(field)</code></td><td><code>SvelteWhereClause</code></td></tr>
		<tr><td><code>orderBy(field)</code></td><td><code>SvelteOrderByBuilder</code></td></tr>
	</tbody>
</table>

<h2>Error Boundaries</h2>

<p>
	Wrap your app in a <code>&lt;svelte:boundary&gt;</code> to handle the async loading state:
</p>

<CodeBlock code={errorBoundary} lang="svelte" />

<h2>Full Example</h2>

<CodeBlock code={fullComponent} lang="svelte" title="src/routes/+page.svelte" />

<h2>Differences from Effect API</h2>

<table>
	<thead>
		<tr>
			<th></th>
			<th>Effect API</th>
			<th>Svelte API</th>
		</tr>
	</thead>
	<tbody>
		<tr>
			<td>Import</td>
			<td><code>tablinum</code></td>
			<td><code>tablinum/svelte</code></td>
		</tr>
		<tr>
			<td>Returns</td>
			<td><code>Effect&lt;T, E&gt;</code></td>
			<td><code>Promise&lt;T&gt;</code></td>
		</tr>
		<tr>
			<td>No result</td>
			<td><code>Option&lt;T&gt;</code></td>
			<td><code>T | null</code></td>
		</tr>
		<tr>
			<td>Reactivity</td>
			<td><code>.watch()</code> Stream</td>
			<td><code>$derived(await ...)</code></td>
		</tr>
		<tr>
			<td>Init</td>
			<td><code>createTablinum()</code></td>
			<td><code>new Tablinum()</code></td>
		</tr>
	</tbody>
</table>
