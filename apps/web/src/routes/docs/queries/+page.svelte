<script lang="ts">
	import CodeBlock from "$lib/components/CodeBlock.svelte";

	const crudExample = `const todos = db.collection("todos");

// Create — returns the new record's id
const id = yield* todos.add({ title: "Buy milk", done: false });

// Read — get a single record by id
const todo = yield* todos.get(id);

// Update — partial update, only changes specified fields
yield* todos.update(id, { done: true });

// Delete — soft-delete via tombstone
yield* todos.delete(id);

// Count all records
const total = yield* todos.count();

// Get the first record
const first = yield* todos.first();

// Undo the last change to a record
yield* todos.undo(id);`;

	const undoExample = `// Undo reverts the last change to a record
yield* todos.update(id, { done: true });
yield* todos.undo(id);  // reverts back to done: false

// How far back you can undo depends on eventRetention
// (set per-collection, defaults to 1)`;

	const whereExample = `// Exact match
const pending = yield* todos.where("done").equals(false).get();

// Numeric comparisons
const urgent = yield* todos.where("priority").above(3).get();
const low = yield* todos.where("priority").belowOrEqual(2).get();

// Range
const mid = yield* todos.where("priority").between(2, 4).get();

// String prefix
const buy = yield* todos.where("title").startsWith("Buy").get();

// Set membership
const selected = yield* todos.where("priority").anyOf([1, 3, 5]).get();
const excluded = yield* todos.where("priority").noneOf([2, 4]).get();`;

	const chainExample = `const results = yield* todos
  .where("done").equals(false)
  .and(todo => todo.title.length > 5)  // additional filter
  .sortBy("priority")                   // sort by field
  .reverse()                            // descending
  .offset(10)                           // skip first 10
  .limit(5)                             // take 5
  .get();                               // execute

// Get just the first match
const first = yield* todos
  .where("done").equals(false)
  .sortBy("priority")
  .first();

// Count matching records
const count = yield* todos
  .where("done").equals(false)
  .count();`;

	const orderByExample = `// Sort all records by a field (ascending)
const sorted = yield* todos.orderBy("priority").get();

// Descending
const newest = yield* todos.orderBy("priority").reverse().get();

// With limit
const top3 = yield* todos.orderBy("priority").reverse().limit(3).get();`;

	const watchExample = `// Watch returns an Effect Stream that emits on every change
const stream = todos.where("done").equals(false).watch();

// Process the stream
yield* Effect.fork(
  stream.pipe(
    Stream.runForEach(items =>
      Effect.log(\`Pending todos: \${items.length}\`)
    )
  )
);`;
</script>

<svelte:head>
	<title>Querying Data — Tablinum</title>
</svelte:head>

<h1>Querying Data</h1>

<p>
	Tablinum provides a chainable query API for reading, filtering, and sorting records.
	All queries run locally against IndexedDB — no network round-trips.
</p>

<h2>Basic CRUD Operations</h2>

<CodeBlock code={crudExample} lang="typescript" />

<h2>Undo</h2>

<p>
	Each collection keeps a history of events per record (controlled by <code>eventRetention</code>
	in your <a href="/docs/collections">collection options</a>). Call <code>undo(id)</code> to revert
	the last change:
</p>

<CodeBlock code={undoExample} lang="typescript" />

<h2>Where Clauses</h2>

<p>
	Use <code>.where("field")</code> to start a filtered query. The returned <code>WhereClause</code> provides
	comparison operators:
</p>

<CodeBlock code={whereExample} lang="typescript" />

<table>
	<thead>
		<tr>
			<th>Method</th>
			<th>Description</th>
		</tr>
	</thead>
	<tbody>
		<tr><td><code>.equals(value)</code></td><td>Exact match</td></tr>
		<tr><td><code>.above(n)</code></td><td>Greater than</td></tr>
		<tr><td><code>.aboveOrEqual(n)</code></td><td>Greater than or equal</td></tr>
		<tr><td><code>.below(n)</code></td><td>Less than</td></tr>
		<tr><td><code>.belowOrEqual(n)</code></td><td>Less than or equal</td></tr>
		<tr><td><code>.between(lower, upper, opts?)</code></td><td>Range query. Inclusive by default. Pass <code>&#123; includeLower?, includeUpper? &#125;</code> to control boundaries</td></tr>
		<tr><td><code>.startsWith(prefix)</code></td><td>String prefix match</td></tr>
		<tr><td><code>.anyOf(values)</code></td><td>Value in set</td></tr>
		<tr><td><code>.noneOf(values)</code></td><td>Value not in set</td></tr>
	</tbody>
</table>

<h2>Query Builder Chain</h2>

<p>
	After a where clause, chain additional operations before executing:
</p>

<CodeBlock code={chainExample} lang="typescript" />

<h2>OrderBy</h2>

<p>
	Use <code>.orderBy("field")</code> directly on a collection for sorted queries without filtering:
</p>

<CodeBlock code={orderByExample} lang="typescript" />

<h2>Watching for Changes</h2>

<p>
	In the Effect API, <code>.watch()</code> returns an <code>Effect.Stream</code> that emits the current
	result set every time the underlying data changes:
</p>

<CodeBlock code={watchExample} lang="typescript" />

<p>
	In the Svelte API, you don't need <code>watch()</code> — use <code>$derived(await ...)</code> instead.
	See <a href="/docs/svelte-bindings">Svelte 5 Integration</a> for details.
</p>
