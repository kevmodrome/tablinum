<script lang="ts">
	import CodeBlock from "$lib/components/CodeBlock.svelte";

	const relayConfig = `const db = yield* createTablinum({
  schema,
  relays: [
    "wss://relay1.example.com",
    "wss://relay2.example.com",
  ],
});

// Sync manually
yield* db.sync();`;

	const syncStatus = `// Effect API
const status = yield* db.getSyncStatus(); // "idle" | "syncing"

// Svelte API — reactive property
if (db.syncStatus === "syncing") {
  console.log("Syncing...");
}

// Effect API — pending unsynced changes
const pending = yield* db.pendingCount();
console.log(pending);

// Svelte API — reactive property
console.log(db.pendingCount);`;

	const subscriptionExample = `// Effect API — subscribe to status changes
const unsubSync = db.subscribeSyncStatus((status) => {
  console.log("Sync status:", status); // "idle" | "syncing"
});

const unsubPending = db.subscribePendingCount((count) => {
  console.log("Pending changes:", count);
});

const unsubRelay = db.subscribeRelayStatus((status) => {
  console.log("Connected relays:", status.connectedUrls);
});

// Call the returned function to unsubscribe
unsubSync();`;

	const errorHandling = `const db = yield* createTablinum({
  schema,
  relays: ["wss://relay.example.com"],
  onSyncError: (error) => {
    console.warn("Sync error:", error.message);
  },
});`;

	const catchTagExample = `import { Effect } from "effect";

const result = yield* todos.add({ title: "Test", done: false }).pipe(
  Effect.catchTag("StorageError", (e) =>
    Effect.log(\`Storage failed: \${e.message}\`)
  ),
  Effect.catchTag("ValidationError", (e) =>
    Effect.log(\`Invalid data: \${e.message} (field: \${e.field})\`)
  ),
);`;

	const rebuildExample = `// Reconstruct local state from event history
yield* db.rebuild();

// Svelte API
await db.rebuild();`;
</script>

<svelte:head>
	<title>Sync & Encryption — Tablinum</title>
</svelte:head>

<h1>Sync & Encryption</h1>

<p>
	Tablinum stores all data locally in IndexedDB. When you call <code>db.sync()</code>, it exchanges
	encrypted data with Nostr relays — syncing your records across devices and collaborators without
	exposing your application data.
</p>

<h2>How Sync Works</h2>

<p>
	Every write creates a local record in IndexedDB. When you sync, Tablinum:
</p>

<ol>
	<li>Encrypts each record using NIP-59 gift wrapping</li>
	<li>Sends encrypted blobs to your configured relays</li>
	<li>Fetches any new encrypted blobs from the relays</li>
	<li>Decrypts and merges them into your local database</li>
</ol>

<p>
	Local reads and writes never block on the network. Your app works fully offline.
</p>

<h2>NIP-59 Gift Wrapping</h2>

<p>
	All data sent to relays is wrapped in three layers of encryption:
</p>

<ol>
	<li><strong>Rumor</strong> — the raw record (never leaves your device unencrypted)</li>
	<li><strong>Seal</strong> — the rumor encrypted with NIP-44, signed by your identity</li>
	<li><strong>Gift Wrap</strong> — the seal encrypted again, signed by a random disposable key with a randomized timestamp</li>
</ol>

<p>
	The relay only sees the outermost gift wrap — an opaque encrypted blob. It cannot read your
	collection names, record IDs, field values, or even know which records belong to the same collection.
</p>

<h2>NIP-77 Negentropy</h2>

<p>
	Instead of downloading everything on every sync, Tablinum uses NIP-77 negentropy for efficient
	set reconciliation. Both sides (your browser and the relay) figure out what the other is missing,
	and only exchange the difference. This dramatically reduces bandwidth usage, especially for
	incremental syncs.
</p>

<h2>Picking a Relay</h2>

<p>
	Tablinum syncs through Nostr relays that support NIP-77. You have two options:
</p>

<ul>
	<li><strong>Public relays</strong> — find NIP-77 compatible relays at <a href="https://nostrwat.ch" target="_blank" rel="noopener noreferrer">nostrwat.ch</a></li>
	<li><strong>Self-host</strong> — <a href="https://github.com/hoytech/strfry" target="_blank" rel="noopener noreferrer">strfry</a> is recommended if you want full control over where your users' data is stored</li>
</ul>

<h2>Relay Configuration</h2>

<p>
	Pass one or more relay URLs in your config. Multiple relays provide redundancy:
</p>

<CodeBlock code={relayConfig} lang="typescript" />

<h2>Sync Status</h2>

<p>
	Track sync activity and pending changes:
</p>

<CodeBlock code={syncStatus} lang="typescript" />

<h2>Status Subscriptions (Effect API)</h2>

<p>
	In the Effect API, subscribe to status changes with callbacks. Each returns an unsubscribe function.
	(In Svelte, these are exposed as reactive <code>$state</code> properties instead — see
	<a href="/docs/svelte-bindings">Svelte 5 Integration</a>.)
</p>

<CodeBlock code={subscriptionExample} lang="typescript" />

<h2>Conflict Resolution</h2>

<p>
	When the same record is modified on multiple devices, Tablinum resolves conflicts using
	<strong>last-write-wins</strong> by the client's <code>created_at</code> timestamp. Ties are broken
	by lowest event ID (lexicographic).
</p>

<blockquote>
	Concurrent offline writes from devices with skewed clocks may resolve unintuitively. This is
	an intentional simplicity trade-off.
</blockquote>

<h2>Error Handling</h2>

<p>
	Sync errors don't block local operations. Use the <code>onSyncError</code> callback to handle
	non-fatal relay issues:
</p>

<CodeBlock code={errorHandling} lang="typescript" />

<h2>Error Types</h2>

<p>
	All errors extend <code>Data.TaggedError</code> from Effect and can be pattern-matched with
	<code>Effect.catchTag</code>:
</p>

<table>
	<thead>
		<tr>
			<th>Error</th>
			<th>Fields</th>
			<th>When</th>
		</tr>
	</thead>
	<tbody>
		<tr><td><code>ValidationError</code></td><td><code>message, field?</code></td><td>Invalid data or configuration</td></tr>
		<tr><td><code>StorageError</code></td><td><code>message, cause?</code></td><td>IndexedDB read/write failure</td></tr>
		<tr><td><code>CryptoError</code></td><td><code>message, cause?</code></td><td>Encryption or decryption failure</td></tr>
		<tr><td><code>RelayError</code></td><td><code>message, url?, cause?</code></td><td>Relay connection or protocol error</td></tr>
		<tr><td><code>SyncError</code></td><td><code>message, phase?, cause?</code></td><td>Sync process failure</td></tr>
		<tr><td><code>NotFoundError</code></td><td><code>collection, id</code></td><td>Record not found for get/update/delete</td></tr>
		<tr><td><code>ClosedError</code></td><td><code>message</code></td><td>Operation attempted on a closed database</td></tr>
	</tbody>
</table>

<CodeBlock code={catchTagExample} lang="typescript" />

<h2>Rebuilding</h2>

<p>
	If local state becomes corrupted, <code>rebuild()</code> reconstructs the database from its stored
	event history:
</p>

<CodeBlock code={rebuildExample} lang="typescript" />
