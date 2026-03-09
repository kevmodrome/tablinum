# tablinum

A local-first storage library for the browser. Define typed collections, read and write data locally via IndexedDB, and sync across devices through Nostr relays.

Built on [Effect](https://effect.website) and [IndexedDB](https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API).

## Features

- **Typed schema** — define collections with `collection()` and `field.*()` builders, get full TypeScript inference
- **Local-first** — all reads hit IndexedDB, no network required
- **Cross-device sync** — replicate data via Nostr relays using NIP-59 gift wrapping for privacy
- **Efficient reconciliation** — NIP-77 negentropy for minimal sync overhead
- **Dexie-style queries** — chainable `.where()`, `.above()`, `.below()`, `.orderBy()` API
- **Svelte 5 bindings** — optional reactive runes integration

## How it works

Tablinum stores all data locally in IndexedDB so your app works offline and reads are instant. When you call `sync()`, it replicates data to [Nostr](https://nostr.com) relays so your other devices can pick it up. All data sent to relays is encrypted using [NIP-59 gift wrapping](https://github.com/nostr-protocol/nips/blob/master/59.md) — relays never see your application data. Sync uses [NIP-77 negentropy](https://github.com/nostr-protocol/nips/blob/master/77.md) to efficiently reconcile what each side has, minimizing bandwidth.

## Getting started

### Pick a relay

Tablinum syncs through Nostr relays, which must support [NIP-77 (Negentropy)](https://github.com/nostr-protocol/nips/blob/master/77.md). You have two options:

- **Use a public relay** — find NIP-77 compatible relays at [nostrwat.ch](https://nostrwat.ch)
- **Self-host a relay** — [strfry](https://github.com/hoytech/strfry) is a good choice if you want full control over where your users' data is stored

### Install

```bash
npm install tablinum
```

### Quick start

```typescript
import { Effect } from "effect";
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
  const pending = yield* todos.where("done").equals(false).toArray();

  // Update
  yield* todos.update(id, { done: true });

  // Sync across devices
  yield* db.sync();
});

Effect.runPromise(Effect.scoped(program));
```

## Svelte 5

Import from `tablinum/svelte` for reactive bindings that use Svelte 5 runes. No Effect knowledge needed — the API is plain async/await.

### Setup

Create a database helper that defines your schema and initializes the database:

```typescript
// src/lib/db.ts
import { createTablinum, collection, field } from "tablinum/svelte";

const schema = {
  todos: collection(
    "todos",
    {
      title: field.string(),
      done: field.boolean(),
    },
    { indices: ["done"] },
  ),
};

export type AppSchema = typeof schema;

export async function initDb() {
  return createTablinum({
    schema,
    relays: ["wss://relay.example.com"],
  });
}
```

### Component

Collections and live queries are reactive — their `.items` property updates automatically when data changes.

```svelte
<script lang="ts">
  import { onDestroy } from "svelte";
  import { initDb, type AppSchema } from "$lib/db";
  import type { Database, Collection, LiveQuery } from "tablinum/svelte";

  let db: Database<AppSchema> | null = $state(null);
  let todos: Collection<AppSchema["todos"]> | null = $state(null);
  let pending: LiveQuery<{ id: string; title: string; done: boolean }> | null = $state(null);

  let title = $state("");

  async function init() {
    db = await initDb();
    todos = db.collection("todos");
    pending = todos.where("done").equals(false).live();
  }

  init();

  async function addTodo(e: SubmitEvent) {
    e.preventDefault();
    if (!todos || !title.trim()) return;
    await todos.add({ title: title.trim(), done: false });
    title = "";
  }

  async function toggle(id: string, currentDone: boolean) {
    await todos?.update(id, { done: !currentDone });
  }

  async function remove(id: string) {
    await todos?.delete(id);
  }

  onDestroy(() => {
    pending?.destroy();
    db?.close();
  });
</script>

<!-- All todos (reactive via collection.items) -->
<p>{todos?.items.length ?? 0} total</p>

<!-- Filtered todos (reactive via live query) -->
<form onsubmit={addTodo}>
  <input bind:value={title} placeholder="Add a todo..." />
  <button type="submit">Add</button>
</form>

<ul>
  {#each pending?.items ?? [] as todo (todo.id)}
    <li>
      <input type="checkbox" checked={todo.done} onchange={() => toggle(todo.id, todo.done)} />
      <span>{todo.title}</span>
      <button onclick={() => remove(todo.id)}>Delete</button>
    </li>
  {/each}
</ul>

<!-- Sync status is reactive -->
{#if db?.status === "syncing"}
  <p>Syncing...</p>
{/if}

<button onclick={() => db?.sync()}>Sync</button>
```

### Key concepts

- **`createTablinum`** returns a `Promise<Database>` (no Effect boilerplate)
- **`collection.items`** is a reactive `$state` array of all records in the collection
- **`.where("field").equals(value).live()`** returns a `LiveQuery` whose `.items` update automatically
- **Cleanup**: call `.destroy()` on live queries and `.close()` on the database in `onDestroy`

## License

MIT
