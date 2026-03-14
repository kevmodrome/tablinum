<script lang="ts">
	import CodeBlock from "$lib/components/CodeBlock.svelte";

	const enableLogging = `const db = yield* createTablinum({
  schema,
  relays: ["wss://relay.example.com"],
  logLevel: "debug", // "debug" | "info" | "warning" | "error" | "none"
});`;

	const envPattern = `// Effect API
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
});`;

	const spanExample = `[11:50:31] INFO (#1) tablinum.init=13ms: Tablinum ready { collections: ["todos"] }
[11:50:41] INFO (#1) tablinum.sync=520ms: Sync complete { changed: ["todos"] }
[11:50:41] INFO (#1) tablinum.syncRelay=245ms: Relay sync { url: "wss://relay.example.com" }
[11:50:41] INFO (#1) tablinum.negentropy=180ms: Reconciled { have: 42, need: 3 }`;

	const logLevelType = `import { LogLevel } from "tablinum";

createTablinum({
  schema,
  relays: ["wss://relay.example.com"],
  logLevel: LogLevel.Debug,
});`;
</script>

<svelte:head>
	<title>Logging & Debugging — Tablinum</title>
</svelte:head>

<h1>Logging & Debugging</h1>

<p>
	Tablinum uses Effect's built-in logging under the hood. By default, logging is completely silent.
	Set <code>logLevel</code> in your config to enable it.
</p>

<h2>Enabling Logging</h2>

<CodeBlock code={enableLogging} lang="typescript" />

<h2>Log Levels</h2>

<table>
	<thead>
		<tr>
			<th>Level</th>
			<th>What you see</th>
		</tr>
	</thead>
	<tbody>
		<tr>
			<td><code>"none"</code></td>
			<td>Nothing (default)</td>
		</tr>
		<tr>
			<td><code>"error"</code></td>
			<td>Unrecoverable failures</td>
		</tr>
		<tr>
			<td><code>"warning"</code></td>
			<td>Recoverable issues (e.g. rejected writes from removed members)</td>
		</tr>
		<tr>
			<td><code>"info"</code></td>
			<td>Lifecycle milestones — storage opened, identity loaded, sync started/complete</td>
		</tr>
		<tr>
			<td><code>"debug"</code></td>
			<td>Everything above plus CRUD operations (with record data), relay reconciliation details, gift wrap processing</td>
		</tr>
	</tbody>
</table>

<h2>Environment Variable Pattern</h2>

<p>
	Wire the log level to an environment variable for easy toggling between development and production:
</p>

<CodeBlock code={envPattern} lang="typescript" />

<h2>Log Spans</h2>

<p>
	Key operations include timing spans that appear automatically in log output:
</p>

<CodeBlock code={spanExample} lang="text" />

<p>Available spans:</p>

<ul>
	<li><code>tablinum.init</code> — database initialization</li>
	<li><code>tablinum.sync</code> — full sync operation</li>
	<li><code>tablinum.syncRelay</code> — per-relay sync</li>
	<li><code>tablinum.negentropy</code> — negentropy reconciliation</li>
</ul>

<h2>Using Effect's LogLevel Type</h2>

<p>
	Power users can pass Effect's <code>LogLevel</code> type directly instead of a string:
</p>

<CodeBlock code={logLevelType} lang="typescript" />
