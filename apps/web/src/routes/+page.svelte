<script lang="ts">
	import CodeBlock from "$lib/components/CodeBlock.svelte";
	import FeatureCard from "$lib/components/FeatureCard.svelte";
	import MosaicPattern from "$lib/components/MosaicPattern.svelte";
	import CopyInstall from "$lib/components/CopyInstall.svelte";
	import SyncDemo from "$lib/components/SyncDemo.svelte";

	let activeTab = $state<"svelte" | "effect">("svelte");

	const features = [
		{
			icon: `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5V19A9 3 0 0 0 21 19V5"/><path d="M3 12A9 3 0 0 0 21 12"/></svg>`,
			title: "Local First",
			description:
				"Your app works offline. All data lives on your device in IndexedDB. No server required, no loading spinners.",
		},
		{
			icon: `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>`,
			title: "Encrypted Sync",
			description:
				"Data syncs to Nostr relays, encrypted end-to-end with NIP-59 gift wrapping. Relay operators cannot read your data.",
		},
		{
			icon: `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>`,
			title: "Built-in Collaboration",
			description:
				"Share databases with invite links. Key rotation on member removal — like changing locks when a roommate moves out.",
		},
		{
			icon: `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="4 7 4 4 20 4 20 7"/><line x1="9" x2="15" y1="20" y2="20"/><line x1="12" x2="12" y1="4" y2="20"/></svg>`,
			title: "Typed Collections",
			description:
				"Define schemas with collection() and field.*() builders. Full TypeScript inference from schema to query results.",
		},
		{
			icon: `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M12.913 2.592c-.36-.216-.54-.324-.73-.366a1 1 0 0 0-.366 0c-.19.042-.37.15-.73.366L4.87 6.462c-.36.216-.54.324-.655.478a1 1 0 0 0-.172.346C4 7.458 4 7.674 4 8.106v7.788c0 .432 0 .648.043.82a1 1 0 0 0 .172.346c.115.154.295.262.655.478l6.217 3.87c.36.216.54.324.73.366a1 1 0 0 0 .366 0c.19-.042.37-.15.73-.366l6.217-3.87c.36-.216.54-.324.655-.478a1 1 0 0 0 .172-.346c.043-.172.043-.388.043-.82V8.106c0-.432 0-.648-.043-.82a1 1 0 0 0-.172-.346c-.115-.154-.295-.262-.655-.478l-6.217-3.87Z"/><path d="M16.5 9.5 8 14"/><path d="m8 10 8.5 4.5"/><path d="M12 2.5v19"/></svg>`,
			title: "Svelte 5 Integration",
			description:
				"First-class reactive bindings using async runes. Queries inside $derived(await ...) auto-update when data changes.",
		},
		{
			icon: `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="4 17 10 11 4 5"/><line x1="12" x2="20" y1="19" y2="19"/></svg>`,
			title: "Configurable Logging",
			description:
				"Effect-based structured logging with timing spans. From full debug output to complete silence in one config line.",
		},
	];

	const svelteSetup = `import { Tablinum, collection, field } from "tablinum/svelte";

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

	const svelteComponent = `<script lang="ts">
  import { todos } from "$lib/db";

  let title = $state("");
  let pending = $derived(await todos.where("done").equals(false).get());

  async function addTodo() {
    await todos.add({ title, done: false });
    title = "";
  }
<\/script>

<form onsubmit={addTodo}>
  <input bind:value={title} placeholder="Add a todo..." />
  <button type="submit">Add</button>
</form>

{#each pending as todo (todo.id)}
  <div>{todo.title}</div>
{/each}`;

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

  // Create a record
  const id = yield* todos.add({ title: "Buy milk", done: false });

  // Query with filters
  const pending = yield* todos.where("done").equals(false).get();

  // Update
  yield* todos.update(id, { done: true });

  // Sync across devices
  yield* db.sync();
});

Effect.runPromise(Effect.scoped(program));`;

	$effect(() => {
		const observer = new IntersectionObserver(
			(entries) => {
				for (const entry of entries) {
					if (entry.isIntersecting) {
						entry.target.classList.add("visible");
						observer.unobserve(entry.target);
					}
				}
			},
			{ threshold: 0.1 },
		);
		const elements = document.querySelectorAll(".animate-on-scroll");
		elements.forEach((el) => observer.observe(el));
		return () => observer.disconnect();
	});
</script>

<svelte:head>
	<title>Tablinum — Local-first database for the browser</title>
</svelte:head>

<!-- Hero -->
<section class="relative overflow-hidden pt-16 pb-24 sm:pt-24">
	<MosaicPattern />
	<div class="relative z-10 mx-auto max-w-4xl px-6 text-center">
		<h1
			class="animate-fade-in-up text-4xl leading-tight tracking-tight sm:text-5xl md:text-6xl lg:text-7xl"
		>
			Local-first database
			<br />
			<span class="text-accent">for the browser</span>
		</h1>
		<p
			class="mx-auto mt-6 max-w-xl text-lg text-text-secondary animate-fade-in-up"
			style="animation-delay: 100ms"
		>
			Encrypted sync. Built-in collaboration. Zero backend.
		</p>
		<div class="mt-8 animate-fade-in-up" style="animation-delay: 200ms">
			<CopyInstall />
		</div>
		<div
			class="mt-8 flex flex-col items-center justify-center gap-4 sm:flex-row animate-fade-in-up"
			style="animation-delay: 300ms"
		>
			<a
				href="/docs"
				class="inline-flex items-center rounded-lg bg-accent px-6 py-3 text-sm font-semibold text-white transition-all hover:bg-accent-glow hover:shadow-lg hover:shadow-accent-deep/30"
			>
				Get Started
			</a>
			<a
				href="https://github.com/kevmodrome/tablinum"
				target="_blank"
				rel="noopener noreferrer"
				class="inline-flex items-center rounded-lg border border-border px-6 py-3 text-sm font-semibold text-text-primary transition-all hover:border-accent-deep hover:text-accent"
			>
				View on GitHub
			</a>
		</div>
	</div>

	<div class="relative z-10 mx-auto mt-16 max-w-5xl px-6 animate-fade-in-up" style="animation-delay: 500ms">
		<SyncDemo />
		<p class="mt-4 text-center text-sm text-text-muted">
			Every record is gift-wrapped with NIP-59 encryption. The relay stores and forwards
			encrypted blobs — it never sees your data.
		</p>
	</div>
</section>

<!-- Features -->
<section class="mx-auto max-w-6xl px-6 py-24">
	<div class="text-center animate-on-scroll">
		<h2 class="text-3xl sm:text-4xl">Everything you need</h2>
		<p class="mt-4 text-text-secondary">A complete toolkit for local-first applications</p>
	</div>
	<div class="mt-16 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
		{#each features as feature, i}
			<div class="animate-on-scroll" style="transition-delay: {i * 80}ms">
				<FeatureCard {...feature} />
			</div>
		{/each}
	</div>
</section>

<!-- Code Preview -->
<section class="border-t border-border bg-bg-deep py-24">
	<div class="mx-auto max-w-4xl px-6">
		<div class="text-center animate-on-scroll">
			<h2 class="text-3xl sm:text-4xl">Two APIs, one database</h2>
			<p class="mt-4 text-text-secondary">
				Use the Effect API for full control, or the Svelte API for reactive simplicity
			</p>
		</div>

		<div class="mt-12 animate-on-scroll" style="transition-delay: 100ms">
			<div class="mb-4 flex gap-1 rounded-lg bg-bg-surface p-1">
				<button
					onclick={() => (activeTab = "svelte")}
					class="flex-1 rounded-md px-4 py-2 text-sm font-medium transition-colors {activeTab === 'svelte'
						? 'bg-bg-elevated text-text-primary'
						: 'text-text-muted hover:text-text-secondary'}"
				>
					Svelte 5
				</button>
				<button
					onclick={() => (activeTab = "effect")}
					class="flex-1 rounded-md px-4 py-2 text-sm font-medium transition-colors {activeTab === 'effect'
						? 'bg-bg-elevated text-text-primary'
						: 'text-text-muted hover:text-text-secondary'}"
				>
					Effect
				</button>
			</div>

			{#if activeTab === "svelte"}
				<div class="space-y-4">
					<CodeBlock code={svelteSetup} lang="typescript" title="src/lib/db.ts" />
					<CodeBlock code={svelteComponent} lang="svelte" title="src/routes/+page.svelte" />
				</div>
			{:else}
				<CodeBlock code={effectExample} lang="typescript" title="app.ts" />
			{/if}
		</div>
	</div>
</section>

<!-- How It Works -->
<section class="py-24">
	<div class="mx-auto max-w-7xl px-6">
		<div class="text-center animate-on-scroll">
			<h2 class="text-3xl sm:text-4xl">How it works</h2>
		</div>

		<div class="mt-16 flex flex-col items-stretch gap-3 lg:flex-row lg:items-center lg:gap-2">
			<!-- Step 1 -->
			<div class="animate-on-scroll flex-1" style="transition-delay: 0ms">
				<div class="rounded-xl border border-border bg-bg-surface p-6 h-full">
					<div class="mb-4 flex h-10 w-10 items-center justify-center rounded-lg bg-bg-elevated text-accent">
						<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="18" x="3" y="3" rx="2"/><path d="M7 8h10"/><path d="M7 12h10"/><path d="M7 16h10"/></svg>
					</div>
					<h3 class="font-display text-lg font-semibold">Store locally</h3>
					<p class="mt-2 text-sm text-text-secondary">Data lives in IndexedDB on your device. Reads are instant, writes never block.</p>
				</div>
			</div>

			<!-- Arrow down (mobile) / right (desktop) -->
			<div class="flex items-center justify-center text-text-muted animate-on-scroll shrink-0" style="transition-delay: 80ms">
				<svg class="lg:hidden" xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14"/><path d="m5 12 7 7 7-7"/></svg>
				<svg class="hidden lg:block" xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg>
			</div>

			<!-- Step 2 -->
			<div class="animate-on-scroll flex-1" style="transition-delay: 160ms">
				<div class="rounded-xl border border-border bg-bg-surface p-6 h-full">
					<div class="mb-4 flex h-10 w-10 items-center justify-center rounded-lg bg-bg-elevated text-accent">
						<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
					</div>
					<h3 class="font-display text-lg font-semibold">Encrypt</h3>
					<p class="mt-2 text-sm text-text-secondary">Every record is wrapped in NIP-59 gift wrapping. Relays see encrypted blobs, nothing more.</p>
				</div>
			</div>

			<!-- Arrow down (mobile) / right (desktop) -->
			<div class="flex items-center justify-center text-text-muted animate-on-scroll shrink-0" style="transition-delay: 240ms">
				<svg class="lg:hidden" xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14"/><path d="m5 12 7 7 7-7"/></svg>
				<svg class="hidden lg:block" xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg>
			</div>

			<!-- Step 3 -->
			<div class="animate-on-scroll flex-1" style="transition-delay: 320ms">
				<div class="rounded-xl border border-border bg-bg-surface p-6 h-full">
					<div class="mb-4 flex h-10 w-10 items-center justify-center rounded-lg bg-bg-elevated text-accent">
						<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z"/><path d="m2 12 5.2-2.6L12 12l-4.8 2.4z"/><path d="m12 12 4.8-2.4L22 12l-5.2 2.6z"/><path d="m7.2 9.4 4.8-7 4.8 7"/><path d="m7.2 14.6 4.8 7 4.8-7"/></svg>
					</div>
					<h3 class="font-display text-lg font-semibold">Sync via relays</h3>
					<p class="mt-2 text-sm text-text-secondary">NIP-77 negentropy figures out what's missing and only transfers the difference.</p>
				</div>
			</div>
		</div>

		<!-- Result row -->
		<div class="mt-6 animate-on-scroll" style="transition-delay: 400ms">
			<div class="rounded-xl border border-accent-deep/50 bg-gradient-to-r from-accent-deep/10 to-bg-surface p-6 text-center">
				<p class="font-display text-lg font-semibold text-accent">Available everywhere</p>
				<p class="mt-1 text-sm text-text-secondary">Your data arrives on every device and every collaborator, fully decrypted and ready to use.</p>
			</div>
		</div>
	</div>
</section>

<!-- CTA -->
<section class="border-t border-border py-24">
	<div class="mx-auto max-w-2xl px-6 text-center animate-on-scroll">
		<h2 class="text-3xl sm:text-4xl">Get started in minutes</h2>
		<div class="mt-8">
			<CopyInstall />
		</div>
		<div class="mt-6">
			<a
				href="/docs"
				class="inline-flex items-center rounded-lg bg-accent px-6 py-3 text-sm font-semibold text-white transition-all hover:bg-accent-glow hover:shadow-lg hover:shadow-accent-deep/30"
			>
				Read the docs
			</a>
		</div>
	</div>
</section>
