# tablinum

A local-first database for the browser with encrypted sync and built-in collaboration.

## Features

### Local first

Your app works offline. All data lives on your device in the browser.

### Backed up and encrypted

Data syncs to relays so it's safe across devices. Everything stored on relays is end-to-end encrypted - relay operators cannot read your data.

### Identity and collaboration built in

Tablinum has a built-in system for sharing a database with other people, and for removing access when needed.

Every database has a shared secret key. When you invite someone, they get a copy of the key so they can read and write data. If someone leaves or is removed, a new key is created and shared with everyone _except_ the removed person — like changing the locks when a roommate moves out. Old data is still available to the removed person but they will not get anything new.

Invites are just links. Share one, and the other person has everything they need to join.

### Typed collections and queries

Define your data shape once with `collection()` and `field.*()` builders, and get full TypeScript inference everywhere. Query with a chainable API:

```typescript
const pending = await todos.where("done").equals(false).get();
const recent = await todos.orderBy("createdAt").get();
```

### Svelte 5 bindings

Optional reactive integration using Svelte 5 async runes. No Effect knowledge needed — the API is plain async/await.

## Getting started

### Install

```bash
npm install tablinum
```

### Quick start (Effect)

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
  const pending = yield* todos.where("done").equals(false).get();

  // Update
  yield* todos.update(id, { done: true });

  // Sync across devices
  yield* db.sync();
});

Effect.runPromise(Effect.scoped(program));
```

### Quick start (Svelte 5)

Import from `tablinum/svelte` for reactive bindings. This API uses Svelte's async runes support, so enable it in your app config:

```js
// svelte.config.js
const config = {
  compilerOptions: {
    experimental: {
      async: true,
    },
  },
};
```

Create a database helper:

```typescript
// src/lib/db.ts
import { Tablinum, collection, field } from "tablinum/svelte";

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

export const db = new Tablinum({
  schema,
  relays: ["wss://relay.example.com"],
});

export const todos = db.collection("todos");
```

Use it in a component:

```svelte
<script lang="ts">
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

  async function remove(id: string) {
    await todos.delete(id);
  }
</script>

<svelte:boundary>
  {#snippet pending()}
    <p>Initializing database...</p>
  {/snippet}

  {#if db.status === "error"}
    <p>{db.error?.message}</p>
  {:else}
    <p>{pending.length} pending</p>

    <form onsubmit={addTodo}>
      <input bind:value={title} placeholder="Add a todo..." />
      <button type="submit">Add</button>
    </form>

    <ul>
      {#each pending as todo (todo.id)}
        <li>
          <input
            type="checkbox"
            checked={todo.done}
            onchange={() => toggle(todo.id, todo.done)}
          />
          <span>{todo.title}</span>
          <button onclick={() => remove(todo.id)}>Delete</button>
        </li>
      {/each}
    </ul>

    {#if db.syncStatus === "syncing"}
      <p>Syncing...</p>
    {/if}

    <button onclick={() => db.sync()}>Sync</button>
  {/if}
</svelte:boundary>
```

#### Key concepts

- **`new Tablinum(config)`** starts initialization immediately and exposes `db.ready`
- **Async queries are reactive** when used inside `$derived(await ...)`
- **`db.status`** tracks initialization and terminal state; **`db.syncStatus`** tracks sync activity
- **`createTablinum(config)`** still exists as a convenience and resolves once `db.ready` completes

## Logging

Tablinum uses [Effect's built-in logging](https://effect.website/docs/observability/logging/) under the hood. By default, logging is completely silent. Set `logLevel` in your config to enable it:

```typescript
const db =
  yield *
  createTablinum({
    schema,
    relays: ["wss://relay.example.com"],
    logLevel: "debug", // "debug" | "info" | "warning" | "error" | "none"
  });
```

Wire it to an environment variable for easy toggling:

```typescript
// Effect API
createTablinum({
  schema,
  relays: ["wss://relay.example.com"],
  logLevel: import.meta.env.VITE_LOG_LEVEL ?? "none",
});

// Svelte API
new Tablinum({
  schema,
  relays: ["wss://relay.example.com"],
  logLevel: import.meta.env.VITE_LOG_LEVEL ?? "none",
});
```

### Log levels

| Level       | What you see                                                                                                 |
| ----------- | ------------------------------------------------------------------------------------------------------------ |
| `"none"`    | Nothing (default)                                                                                            |
| `"error"`   | Unrecoverable failures                                                                                       |
| `"warning"` | Recoverable issues (e.g. rejected writes from removed members)                                               |
| `"info"`    | Lifecycle milestones — storage opened, identity loaded, sync started/complete                                |
| `"debug"`   | Everything above plus CRUD operations (with record data), relay reconciliation details, gift wrap processing |

### Log spans

Key operations include timing spans that appear automatically in log output:

```
[11:50:31] INFO (#1) tablinum.init=13ms: Tablinum ready { ... }
[11:50:41] INFO (#1) tablinum.sync=520ms: Sync complete { changed: ["todos"] }
```

Spans: `tablinum.init`, `tablinum.sync`, `tablinum.syncRelay`, `tablinum.negentropy`.

### Using Effect's LogLevel type

Power users can also pass Effect's `LogLevel` type directly:

```typescript
import { LogLevel } from "tablinum";
createTablinum({ ..., logLevel: LogLevel.Debug });
```

## How it works

Tablinum is built on [Effect](https://effect.website) and stores all data locally in [IndexedDB](https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API).

Sync happens through [Nostr](https://nostr.com) relays. All data sent to relays is encrypted using [NIP-59 gift wrapping](https://github.com/nostr-protocol/nips/blob/master/59.md). Relays never see your application data. Sync uses [NIP-77 negentropy](https://github.com/nostr-protocol/nips/blob/master/77.md) to efficiently reconcile what each side has, minimizing bandwidth usage.

### Picking a relay

Tablinum syncs through Nostr relays that support [NIP-77 (Negentropy)](https://github.com/nostr-protocol/nips/blob/master/77.md). You have two options:

- **Use a public relay** — find NIP-77 compatible relays at [nostrwat.ch](https://nostrwat.ch)
- **Self-host a relay** — [strfry](https://github.com/hoytech/strfry) is a good choice if you want full control over where your users' data is stored

## Development

### Local relays

To run the example app or integration tests against local relays, spin up three [strfry](https://github.com/hoytech/strfry) instances with Docker:

```bash
bun run relays        # starts 3 relays on ports 7984, 7985, 7986
bun run relays:down   # stop relays (data is preserved)
bun run relays:clean  # stop relays and delete all data
```

The first run builds strfry from source, which takes a few minutes. Subsequent starts are instant.

Then point your app at the local relays:

```typescript
relays: ["ws://localhost:7984", "ws://localhost:7985", "ws://localhost:7986"];
```

The Svelte example app (`bun run demo:svelte`) is pre-configured to use these local relays.

## License

MIT
