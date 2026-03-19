<script lang="ts">
	import CodeBlock from "$lib/components/CodeBlock.svelte";

	const dbModule = `// src/lib/db.ts
import { Tablinum, field, collection, type InferRecord } from "tablinum/svelte";

const todosCollection = collection(
  "todos",
  {
    title: field.string(),
    done: field.boolean(),
    priority: field.number(),
  },
  { indices: ["done", "priority"], eventRetention: 5 },
);

export type TodoRecord = InferRecord<typeof todosCollection>;

const schema = { todos: todosCollection };

let _db: Tablinum<typeof schema> | null = null;

export function initDb() {
  if (_db && _db.status !== "closed" && _db.status !== "error") return _db;

  _db = new Tablinum({
    schema,
    relays: ["wss://relay.example.com"],
    onSyncError: (err) => {
      console.error("[tablinum:sync]", err.message);
    },
  });

  return _db;
}

export function getDb() {
  if (!_db) throw new Error("Database not initialized — did hooks.client.ts run?");
  return _db;
}`;

	const hooksClient = `// src/hooks.client.ts
import { initDb, getDb } from "$lib/db";

export async function init() {
  initDb();
  await getDb().ready.catch(() => undefined);
}`;

	const todoForm = `<!-- src/lib/components/TodoForm.svelte -->
<script lang="ts">
  import { getDb } from "$lib/db";

  const todos = getDb().collection("todos");

  let title = $state("");
  let priority = $state(1);

  async function addTodo(e: SubmitEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    await todos.add({ title: title.trim(), done: false, priority });
    title = "";
    priority = 1;
  }
<\/script>

<form onsubmit={addTodo}>
  <input bind:value={title} placeholder="Add a todo..." />
  <select bind:value={priority}>
    <option value={1}>Low</option>
    <option value={2}>Medium</option>
    <option value={3}>High</option>
  </select>
  <button type="submit">Add</button>
</form>`;

	const todoList = `<!-- src/lib/components/TodoList.svelte -->
<script lang="ts">
  import { getDb, type TodoRecord } from "$lib/db";

  let {
    items,
    label,
    isDone = false,
  }: {
    items: ReadonlyArray<TodoRecord>;
    label: string;
    isDone?: boolean;
  } = $props();

  const todos = getDb().collection("todos");

  async function toggle(id: string, currentDone: boolean) {
    await todos.update(id, { done: !currentDone });
  }

  async function remove(id: string) {
    await todos.delete(id);
  }

  async function undo(id: string) {
    await todos.undo(id);
  }
<\/script>

<h2>{label} ({items.length})</h2>
<ul>
  {#each items as todo (todo.id)}
    <li class:done={isDone}>
      <label>
        <input
          type="checkbox"
          checked={isDone}
          onchange={() => toggle(todo.id, todo.done)}
        />
        <span>{todo.title}</span>
        {#if todo.priority > 1}
          <span class="priority priority-{todo.priority}">
            {todo.priority === 3 ? "High" : "Med"}
          </span>
        {/if}
      </label>
      <button onclick={() => undo(todo.id)} title="Undo last change">↩</button>
      <button onclick={() => remove(todo.id)}>✕</button>
    </li>
  {/each}
</ul>`;

	const todosPage = `<!-- src/routes/todos/+page.svelte -->
<script lang="ts">
  import { getDb } from "$lib/db";
  import TodoForm from "$lib/components/TodoForm.svelte";
  import TodoList from "$lib/components/TodoList.svelte";

  const db = getDb();
  const todos = db.collection("todos");

  let total = $derived(await todos.count());
  let incomplete = $derived(
    await todos.where("done").equals(false)
      .sortBy("priority").reverse().get(),
  );
  let done = $derived(await todos.where("done").equals(true).get());
<\/script>

<svelte:boundary>
  {#snippet pending()}
    <p>Loading todos...</p>
  {/snippet}

  <h1>Todos</h1>

  <TodoForm />
  <p>{total} total</p>

  <TodoList items={incomplete} label="Todo" />
  <TodoList items={done} label="Done" isDone />
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
	priority levels, and sync.
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
	Define the schema inline with <code>collection()</code> and <code>field</code> helpers. We
	index <code>done</code> and <code>priority</code> for fast filtered queries. Setting
	<code>eventRetention</code> to 5 lets us undo up to 5 changes per record.
</p>

<p>
	The module exposes <code>initDb()</code> (called once at startup) and <code>getDb()</code>
	(used by components to access the database). This singleton pattern ensures every component
	shares the same database instance.
</p>

<CodeBlock code={dbModule} lang="typescript" title="src/lib/db.ts" />

<h2>2. Initialize in the Client Hook</h2>

<p>
	Call <code>initDb()</code> from SvelteKit's <code>init</code> client hook. This runs once when
	the app starts in the browser — before any components render. We also <code>await</code> the
	<code>ready</code> promise so the database is fully initialized before the UI loads.
</p>

<CodeBlock code={hooksClient} lang="typescript" title="src/hooks.client.ts" />

<p>
	Because the database is ready before components render, you don't need <code>db.status === "ready"</code>
	guards in your <code>$derived</code> queries — collection methods internally await readiness.
</p>

<h2>3. Add Todos</h2>

<p>
	A form component that calls <code>todos.add()</code> with a title and priority level.
	The data is written to IndexedDB immediately — no loading spinners, no network round-trip.
</p>

<CodeBlock code={todoForm} lang="svelte" title="TodoForm.svelte" />

<h2>4. Display Todos</h2>

<p>
	<code>TodoList</code> is a reusable component that receives items as a prop.
	It handles toggling, deleting, and undoing individual records. Priority badges highlight
	medium and high priority items.
</p>

<CodeBlock code={todoList} lang="svelte" title="TodoList.svelte" />

<h2>5. Page Component</h2>

<p>
	The page component orchestrates the queries with <code>$derived(await ...)</code>.
	When data changes — via add, update, delete, undo, or sync — the queries automatically
	re-evaluate. The <code>svelte:boundary</code> shows a loading state while the initial
	async queries resolve.
</p>

<CodeBlock code={todosPage} lang="svelte" title="src/routes/todos/+page.svelte" />

<h2>Key Takeaways</h2>

<ul>
	<li>Initialize in <code>hooks.client.ts</code> via the <code>init</code> hook — the database
		is ready before any component renders</li>
	<li>Use <code>getDb()</code> in components to access the shared database instance</li>
	<li><code>$derived(await ...)</code> handles reactivity — no manual subscriptions or
		<code>db.status</code> guards needed</li>
	<li>Split queries into the page component and pass data down as props for clean composition</li>
	<li><code>undo(id)</code> reverts the last change, up to <code>eventRetention</code> deep</li>
	<li><code>sync()</code> is explicit — call it when the user taps a button or on an interval</li>
</ul>
