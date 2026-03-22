<script lang="ts">
	import CodeBlock from "$lib/components/CodeBlock.svelte";

	const basicSchema = `import { collection, field } from "tablinum";

const schema = {
  todos: collection("todos", {
    title: field.string(),
    done: field.boolean(),
    priority: field.number(),
  }),
};`;

	const nestedExample = `const schema = {
  contacts: collection("contacts", {
    name: field.string(),
    email: field.optional(field.string()),
    address: field.object({
      street: field.string(),
      city: field.string(),
      zip: field.string(),
    }),
    tags: field.array(field.string()),
    metadata: field.json(),
  }),
};`;

	const indicesExample = `const schema = {
  todos: collection("todos", {
    title: field.string(),
    done: field.boolean(),
    priority: field.number(),
  }, { indices: ["done", "priority"] }),
};

// These queries will use the index for fast lookups:
const pending = yield* todos.where("done").equals(false).get();
const urgent = yield* todos.where("priority").above(3).get();`;

	const inferExample = `import { type InferRecord, collection, field } from "tablinum";

const todosDef = collection("todos", {
  title: field.string(),
  done: field.boolean(),
  notes: field.optional(field.string()),
});

type Todo = InferRecord<typeof todosDef>;
// { id: string; title: string; done: boolean; notes?: string | undefined }`;
</script>

<svelte:head>
	<title>Collections & Schema — Tablinum</title>
</svelte:head>

<h1>Collections & Schema</h1>

<p>
	Collections are the core data structure in Tablinum. Define your schema once, and get full TypeScript
	inference from definition to query results.
</p>

<h2>Defining a Schema</h2>

<p>
	A schema is a plain object mapping collection names to definitions. Use <code>collection()</code> to
	create a definition and <code>field.*() </code> to declare typed fields:
</p>

<CodeBlock code={basicSchema} lang="typescript" />

<h2>Field Types</h2>

<table>
	<thead>
		<tr>
			<th>Builder</th>
			<th>TypeScript Type</th>
			<th>Description</th>
		</tr>
	</thead>
	<tbody>
		<tr>
			<td><code>field.string()</code></td>
			<td><code>string</code></td>
			<td>Text value</td>
		</tr>
		<tr>
			<td><code>field.number()</code></td>
			<td><code>number</code></td>
			<td>Numeric value</td>
		</tr>
		<tr>
			<td><code>field.boolean()</code></td>
			<td><code>boolean</code></td>
			<td>True or false</td>
		</tr>
		<tr>
			<td><code>field.json()</code></td>
			<td><code>JsonValue</code></td>
			<td>Any JSON-serializable value</td>
		</tr>
		<tr>
			<td><code>field.object(&#123; ... &#125;)</code></td>
			<td>Inferred from sub-fields</td>
			<td>Nested structured object</td>
		</tr>
		<tr>
			<td><code>field.optional(inner)</code></td>
			<td><code>T | undefined</code></td>
			<td>Wraps any field to make it optional. The key can be omitted entirely.</td>
		</tr>
		<tr>
			<td><code>field.array(inner)</code></td>
			<td><code>ReadonlyArray&lt;T&gt;</code></td>
			<td>Array of any field type</td>
		</tr>
	</tbody>
</table>

<h2>Nested Objects & Arrays</h2>

<p>
	Use <code>field.object()</code> for structured nested data and <code>field.array()</code> for lists.
	Combine with <code>field.optional()</code> to make any field optional:
</p>

<CodeBlock code={nestedExample} lang="typescript" />

<h2>Indices</h2>

<p>
	Add indices to speed up <code>where()</code> queries. Pass an <code>indices</code> array as the third
	argument to <code>collection()</code>:
</p>

<CodeBlock code={indicesExample} lang="typescript" />

<p>
	Only scalar fields can be indexed: <code>string</code>, <code>number</code>, and <code>boolean</code>.
	Fields using <code>json</code>, <code>object</code>, or <code>array</code> cannot be indexed.
</p>

<h2>Type Inference</h2>

<p>
	TypeScript automatically infers record types from your schema. Every record includes an <code>id: string</code>
	field added by Tablinum. You can extract the type with <code>InferRecord</code>:
</p>

<CodeBlock code={inferExample} lang="typescript" />

<h2>Collection Options</h2>

<ul>
	<li><strong><code>indices</code></strong> — array of field names to index for faster queries.</li>
	<li><strong><code>eventRetention</code></strong> — how many historical events to keep per record. Defaults to <code>1</code>. Increase if you need undo history or audit trails.</li>
</ul>
