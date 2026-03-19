<script lang="ts">
	import CodeBlock from "$lib/components/CodeBlock.svelte";

	const schema = `// schema.ts
import { collection, field } from "tablinum";

export const schema = {
  notes: collection("notes", {
    title: field.string(),
    body: field.string(),
    tag: field.optional(field.string()),
    updatedAt: field.number(),
  }, {
    indices: ["tag", "updatedAt"],
    eventRetention: 10,  // generous undo history
  }),
};`;

	const createDb = `// db.ts
import { Effect, Stream } from "effect";
import { createTablinum, collection, field } from "tablinum";
import { schema } from "./schema";

export const makeDb = createTablinum({
  schema,
  relays: ["wss://relay.example.com"],
  logLevel: "info",
  onSyncError: (error) => {
    console.warn("Sync error:", error.message);
  },
});`;

	const crudOps = `import { Effect } from "effect";
import type { InferRecord } from "tablinum";
import { schema } from "./schema";

type Note = InferRecord<typeof schema.notes>;

const program = Effect.gen(function* () {
  const db = yield* makeDb;
  const notes = db.collection("notes");

  // Create a note
  const id = yield* notes.add({
    title: "Meeting notes",
    body: "# Standup\\n- Shipped v2...",
    tag: "work",
    updatedAt: Date.now(),
  });

  // Read it back
  const note = yield* notes.get(id);
  console.log(note.title); // "Meeting notes"

  // Update — only the fields you pass are changed
  yield* notes.update(id, {
    body: "# Standup\\n- Shipped v2\\n- Started v3 planning",
    updatedAt: Date.now(),
  });

  // Undo the update
  yield* notes.undo(id);

  // Delete
  yield* notes.delete(id);
});`;

	const queries = `const program = Effect.gen(function* () {
  const db = yield* makeDb;
  const notes = db.collection("notes");

  // All notes tagged "work", newest first
  const workNotes = yield* notes
    .where("tag").equals("work")
    .sortBy("updatedAt")
    .reverse()
    .get();

  // Paginated: skip 10, take 5
  const page = yield* notes
    .orderBy("updatedAt")
    .reverse()
    .offset(10)
    .limit(5)
    .get();

  // Count notes in a date range
  const thisWeek = yield* notes
    .where("updatedAt")
    .between(weekAgo, Date.now())
    .count();

  // First note matching a filter
  const latest = yield* notes
    .orderBy("updatedAt")
    .reverse()
    .first();
});`;

	const watching = `import { Effect, Stream } from "effect";

const program = Effect.gen(function* () {
  const db = yield* makeDb;
  const notes = db.collection("notes");

  // Watch returns a Stream that emits the full result set
  // every time the underlying data changes
  const recentStream = notes
    .orderBy("updatedAt")
    .reverse()
    .limit(20)
    .watch();

  // Fork the stream so it runs in the background
  yield* Effect.fork(
    recentStream.pipe(
      Stream.runForEach((results) =>
        Effect.sync(() => {
          console.log(\`Latest \${results.length} notes updated\`);
          renderNoteList(results);
        }),
      ),
    ),
  );

  // Writes automatically trigger the stream above
  yield* notes.add({
    title: "New note",
    body: "",
    updatedAt: Date.now(),
  });
});`;

	const errorHandling = `import { Effect } from "effect";
import {
  ValidationError,
  StorageError,
  NotFoundError,
} from "tablinum";

const safeGet = (id: string) =>
  Effect.gen(function* () {
    const db = yield* makeDb;
    const notes = db.collection("notes");

    const note = yield* notes.get(id).pipe(
      // Handle specific errors by tag
      Effect.catchTag("NotFoundError", (e) =>
        Effect.succeed({
          id: e.id,
          title: "(deleted)",
          body: "",
          updatedAt: 0,
        }),
      ),
    );

    return note;
  });

const safeAdd = (title: string, body: string) =>
  Effect.gen(function* () {
    const db = yield* makeDb;
    const notes = db.collection("notes");

    const id = yield* notes.add({
      title,
      body,
      updatedAt: Date.now(),
    }).pipe(
      Effect.catchTag("ValidationError", (e) =>
        Effect.fail(new Error(\`Invalid note: \${e.message} (field: \${e.field})\`)),
      ),
      Effect.catchTag("StorageError", (e) =>
        Effect.fail(new Error(\`Could not save: \${e.message}\`)),
      ),
    );

    return id;
  });`;

	const syncAndLifecycle = `import { Effect, Scope } from "effect";

const program = Effect.gen(function* () {
  const db = yield* makeDb;
  const notes = db.collection("notes");

  // Subscribe to sync status changes
  const unsubSync = db.subscribeSyncStatus((status) => {
    console.log("Sync:", status); // "idle" | "syncing"
  });

  const unsubPending = db.subscribePendingCount((count) => {
    if (count > 0) console.log(\`\${count} changes to sync\`);
  });

  // Add some data
  yield* notes.add({
    title: "First note",
    body: "Hello world",
    updatedAt: Date.now(),
  });

  // Sync with relays
  yield* db.sync();

  // Check pending count
  const pending = yield* db.pendingCount();
  console.log(\`Pending: \${pending}\`); // 0 after successful sync

  // Clean up subscriptions
  unsubSync();
  unsubPending();

  // Close the database when done
  yield* db.close();
});

// Run with Effect.scoped for automatic resource cleanup
Effect.runPromise(Effect.scoped(program));`;

	const fullExample = `// main.ts — complete runnable example
import { Effect, Stream } from "effect";
import { createTablinum, collection, field } from "tablinum";
import type { InferRecord } from "tablinum";

const schema = {
  notes: collection("notes", {
    title: field.string(),
    body: field.string(),
    tag: field.optional(field.string()),
    updatedAt: field.number(),
  }, { indices: ["tag", "updatedAt"] }),
};

type Note = InferRecord<typeof schema.notes>;

const program = Effect.gen(function* () {
  const db = yield* createTablinum({
    schema,
    relays: ["wss://relay.example.com"],
  });

  const notes = db.collection("notes");

  // Create
  const id = yield* notes.add({
    title: "Hello",
    body: "# My first note",
    tag: "demo",
    updatedAt: Date.now(),
  });

  // Query
  const tagged = yield* notes
    .where("tag").equals("demo")
    .sortBy("updatedAt")
    .reverse()
    .get();

  console.log(\`Found \${tagged.length} demo notes\`);

  // Watch for changes in the background
  yield* Effect.fork(
    notes.orderBy("updatedAt").reverse().limit(5).watch().pipe(
      Stream.runForEach((results) =>
        Effect.log(\`Top 5 notes: \${results.map((n) => n.title).join(", ")}\`),
      ),
    ),
  );

  // Sync
  yield* db.sync();
  const pending = yield* db.pendingCount();
  console.log(\`Pending changes: \${pending}\`);

  // Cleanup
  yield* db.close();
});

Effect.runPromise(Effect.scoped(program)).catch(console.error);`;
</script>

<svelte:head>
	<title>Example: Effect Notes App — Tablinum</title>
</svelte:head>

<h1>Example: Effect Notes App</h1>

<p>
	A notes app built entirely with the Effect API — no Svelte required. This example shows how to
	use Tablinum as a standalone TypeScript library with typed errors, streaming queries, and
	explicit resource management.
</p>

<p>
	This example covers: the Effect API, typed error handling with <code>catchTag</code>, streaming
	with <code>watch()</code>, sync status subscriptions, and lifecycle management.
</p>

<h2>1. Define a Schema</h2>

<p>
	Same schema API as the Svelte examples — import from <code>tablinum</code> instead of
	<code>tablinum/svelte</code>.
</p>

<CodeBlock code={schema} lang="typescript" title="schema.ts" />

<h2>2. Create the Database</h2>

<p>
	<code>createTablinum</code> returns an <code>Effect</code> that resolves once the database is
	initialized. Use it inside <code>Effect.gen</code> with <code>yield*</code>:
</p>

<CodeBlock code={createDb} lang="typescript" title="db.ts" />

<h2>3. CRUD Operations</h2>

<p>
	All collection methods return Effects. Use <code>yield*</code> to unwrap them:
</p>

<CodeBlock code={crudOps} lang="typescript" />

<h2>4. Queries</h2>

<p>
	The query builder works the same as in Svelte — chainable where clauses, sorting, pagination —
	but returns <code>Effect</code> instead of <code>Promise</code>:
</p>

<CodeBlock code={queries} lang="typescript" />

<h2>5. Watching for Changes</h2>

<p>
	The Effect API uses <code>.watch()</code> which returns an <code>Effect.Stream</code>. Fork it
	to run in the background — it emits the full result set every time data changes:
</p>

<CodeBlock code={watching} lang="typescript" />

<h2>6. Typed Error Handling</h2>

<p>
	Every Tablinum error is a <code>Data.TaggedError</code> from Effect. Use
	<code>Effect.catchTag</code> to handle specific errors while letting others propagate:
</p>

<CodeBlock code={errorHandling} lang="typescript" />

<h2>7. Sync and Lifecycle</h2>

<p>
	Manage subscriptions, sync, and cleanup explicitly. Wrap your program in
	<code>Effect.scoped</code> for automatic resource cleanup:
</p>

<CodeBlock code={syncAndLifecycle} lang="typescript" />

<h2>Full Example</h2>

<p>
	A complete, self-contained script you can run directly:
</p>

<CodeBlock code={fullExample} lang="typescript" title="main.ts" />

<h2>Key Takeaways</h2>

<ul>
	<li>Import from <code>tablinum</code> (not <code>tablinum/svelte</code>) for the Effect API</li>
	<li>All operations return <code>Effect</code> — use <code>yield*</code> inside <code>Effect.gen</code> to unwrap</li>
	<li><code>Effect.catchTag</code> lets you handle specific errors (<code>NotFoundError</code>, <code>ValidationError</code>, etc.) while propagating others</li>
	<li><code>.watch()</code> returns an <code>Effect.Stream</code> — fork it for background reactivity</li>
	<li>Subscriptions (<code>subscribeSyncStatus</code>, <code>subscribePendingCount</code>) return unsubscribe functions</li>
	<li><code>db.close()</code> releases IndexedDB connections — always call it when done</li>
	<li>Wrap with <code>Effect.scoped</code> + <code>Effect.runPromise</code> for automatic cleanup</li>
</ul>
