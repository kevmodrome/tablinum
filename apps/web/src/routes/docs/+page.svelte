<script lang="ts">
	import CodeBlock from "$lib/components/CodeBlock.svelte";

	const installCmd = `npm install tablinum`;

	const effectExample = `import { Effect } from "effect";
import { createTablinum, collection, field } from "tablinum";

const schema = {
  todos: collection("todos", {
    title: field.string(),
    done: field.boolean(),
  }),
};

const program = Effect.gen(function* () {
  const db = yield* createTablinum({
    schema,
    relays: ["wss://relay.example.com"],
  });

  const todos = db.collection("todos");

  // Create
  const id = yield* todos.add({ title: "Buy milk", done: false });

  // Read
  const todo = yield* todos.get(id);

  // Query
  const pending = yield* todos.where("done").equals(false).get();

  // Update
  yield* todos.update(id, { done: true });

  // Sync across devices
  yield* db.sync();
});

Effect.runPromise(Effect.scoped(program));`;

	const svelteConfig = `// svelte.config.js
const config = {
  compilerOptions: {
    experimental: {
      async: true,
    },
  },
};`;

	const svelteDbSetup = `// src/lib/db.ts
import { Tablinum, collection, field } from "tablinum/svelte";

const schema = {
  todos: collection("todos", {
    title: field.string(),
    done: field.boolean(),
  }, { indices: ["done"] }),
};

export type AppSchema = typeof schema;

export const db = new Tablinum({
  schema,
  relays: ["wss://relay.example.com"],
});

export const todos = db.collection("todos");`;

	const svelteComponent = `<script lang="ts">
  import { db, todos } from "$lib/db";

  let title = $state("");
  let booted = $derived(await db.ready.then(() => true, () => false));
  let pending = $derived(
    booted && db.status === "ready"
      ? await todos.where("done").equals(false).get()
      : [],
  );

  async function addTodo(e: SubmitEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    await todos.add({ title: title.trim(), done: false });
    title = "";
  }

  async function toggle(id: string, currentDone: boolean) {
    await todos.update(id, { done: !currentDone });
  }
<\/script>

<svelte:boundary>
  {#snippet pending()}
    <p>Initializing database...</p>
  {/snippet}

  {#if db.status === "error"}
    <p>{db.error?.message}</p>
  {:else}
    <form onsubmit={addTodo}>
      <input bind:value={title} placeholder="Add a todo..." />
      <button type="submit">Add</button>
    </form>

    <ul>
      {#each pending as todo (todo.id)}
        <li>
          <input type="checkbox" checked={todo.done}
            onchange={() => toggle(todo.id, todo.done)} />
          <span>{todo.title}</span>
        </li>
      {/each}
    </ul>

    <button onclick={() => db.sync()}>Sync</button>
  {/if}
</svelte:boundary>`;
</script>

<svelte:head>
	<title>Getting Started — Tablinum</title>
</svelte:head>

<h1>Getting Started</h1>

<p>
	Tablinum is a local-first database for the browser. All data lives on the user's device in IndexedDB.
	When you're ready, sync encrypted data across devices through Nostr relays — relay operators never see your application data.
</p>

<h2>Install</h2>

<CodeBlock code={installCmd} lang="bash" />

<h2>Quick Start with Effect</h2>

<p>
	The core API uses <a href="https://effect.website" target="_blank" rel="noopener noreferrer">Effect</a> for typed errors, resource management, and streaming. Define a schema, create a database, and start reading and writing:
</p>

<CodeBlock code={effectExample} lang="typescript" title="app.ts" />

<h2>Quick Start with Svelte 5</h2>

<p>
	Import from <code>tablinum/svelte</code> for reactive bindings using Svelte 5's async runes. First, enable async support in your config:
</p>

<CodeBlock code={svelteConfig} lang="javascript" title="svelte.config.js" />

<p>Create a database module:</p>

<CodeBlock code={svelteDbSetup} lang="typescript" title="src/lib/db.ts" />

<p>Use it in a component:</p>

<CodeBlock code={svelteComponent} lang="svelte" title="src/routes/+page.svelte" />

<h2>Key Concepts</h2>

<ul>
	<li><strong><code>new Tablinum(config)</code></strong> — starts initialization immediately. Use <code>db.ready</code> to await completion. Best for Svelte apps.</li>
	<li><strong><code>createTablinum(config)</code></strong> — returns an Effect that resolves once the database is ready. Best for Effect-based apps.</li>
	<li><strong><code>db.status</code></strong> — tracks initialization: <code>"initializing"</code>, <code>"ready"</code>, <code>"error"</code>, or <code>"closed"</code>.</li>
	<li><strong><code>db.syncStatus</code></strong> — tracks sync activity: <code>"idle"</code> or <code>"syncing"</code>.</li>
	<li><strong><code>db.collection("name")</code></strong> — returns a typed collection handle for CRUD operations.</li>
</ul>

<h2>Next Steps</h2>

<ul>
	<li><a href="/docs/collections">Collections & Schema</a> — define your data shape with typed fields</li>
	<li><a href="/docs/queries">Querying Data</a> — filter, sort, and watch your data</li>
	<li><a href="/docs/sync">Sync & Encryption</a> — understand how encrypted sync works</li>
	<li><a href="/docs/svelte-bindings">Svelte 5 Integration</a> — reactive queries with async runes</li>
</ul>
