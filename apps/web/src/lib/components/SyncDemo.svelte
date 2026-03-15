<script lang="ts">
	import { slide, fade } from "svelte/transition";
	import { flip } from "svelte/animate";

	type Todo = { id: number; text: string; done: boolean };
	type Action = "create" | "done" | "delete";
	type Packet = { id: number; text: string; direction: "right" | "left"; hex: string; action: Action };

	const TODOS = [
		"Buy coffee beans",
		"Fix login bug",
		"Walk the dog",
		"Review PR #42",
		"Update deps",
		"Write unit tests",
		"Deploy to staging",
		"Book dentist",
		"Reply to Sarah",
		"Clean kitchen",
		"Refactor auth",
		"Order supplies",
	];

	const FLIGHT_MS = 3800;
	const INTERVAL_MS = 5000;
	const MAX_TODOS = 5;

	let deviceA = $state<Todo[]>([
		{ id: 1, text: "Buy coffee beans", done: false },
		{ id: 2, text: "Fix login bug", done: false },
	]);
	let deviceB = $state<Todo[]>([
		{ id: 1, text: "Buy coffee beans", done: false },
		{ id: 2, text: "Fix login bug", done: false },
	]);
	let packets = $state<Packet[]>([]);
	let visible = $state(false);
	let nextId = 3;

	let el: HTMLDivElement;

	$effect(() => {
		if (!el) return;
		const obs = new IntersectionObserver(
			([e]) => {
				visible = e.isIntersecting;
			},
			{ threshold: 0.2 },
		);
		obs.observe(el);
		return () => obs.disconnect();
	});

	$effect(() => {
		if (!visible) return;
		const timeout = setTimeout(tick, 1200);
		const id = setInterval(tick, INTERVAL_MS);
		return () => {
			clearTimeout(timeout);
			clearInterval(id);
		};
	});

	function pickText(): string {
		const used = new Set(deviceA.map((t) => t.text));
		const available = TODOS.filter((t) => !used.has(t));
		if (available.length === 0) return TODOS[Math.floor(Math.random() * TODOS.length)];
		return available[Math.floor(Math.random() * available.length)];
	}

	function randomHex(): string {
		return Array.from({ length: 6 }, () => "0123456789abcdef"[Math.floor(Math.random() * 16)]).join("");
	}

	function tick() {
		const r = Math.random();

		if (deviceA.length < 2 || r < 0.5) {
			if (deviceA.length >= MAX_TODOS) {
				const old = deviceA[0];
				deviceA = deviceA.slice(1);
				setTimeout(() => {
					deviceB = deviceB.filter((t) => t.id !== old.id);
				}, 200);
			}
			const id = nextId++;
			const text = pickText();
			const todo: Todo = { id, text, done: false };
			deviceA = [...deviceA, todo];

			setTimeout(() => {
				launch(text, "right", "create");
				setTimeout(() => {
					deviceB = [...deviceB, { ...todo }];
				}, FLIGHT_MS);
			}, 500);
		} else if (r < 0.78 && deviceB.some((t) => !t.done)) {
			const undone = deviceB.filter((t) => !t.done);
			const target = undone[Math.floor(Math.random() * undone.length)];
			deviceB = deviceB.map((t) => (t.id === target.id ? { ...t, done: true } : t));

			setTimeout(() => {
				launch(target.text, "left", "done");
				setTimeout(() => {
					deviceA = deviceA.map((t) => (t.id === target.id ? { ...t, done: true } : t));
				}, FLIGHT_MS);
			}, 500);
		} else if (deviceA.length > 2) {
			const doneItems = deviceA.filter((t) => t.done);
			const target = doneItems.length > 0 ? doneItems[0] : deviceA[0];
			deviceA = deviceA.filter((t) => t.id !== target.id);

			setTimeout(() => {
				launch(target.text, "right", "delete");
				setTimeout(() => {
					deviceB = deviceB.filter((t) => t.id !== target.id);
				}, FLIGHT_MS);
			}, 500);
		}
	}

	function launch(text: string, direction: "right" | "left", action: Action) {
		const id = nextId++;
		const hex = randomHex();
		packets = [...packets, { id, text, direction, hex, action }];

		setTimeout(() => {
			packets = packets.filter((p) => p.id !== id);
		}, FLIGHT_MS + 100);
	}
</script>

<div bind:this={el} class="demo-root overflow-hidden rounded-2xl border border-border bg-bg-deep">
	<div class="demo-grid">
		<!-- Row 1: Labels -->
		<div class="flex items-center justify-center gap-2 px-3 py-2.5">
			<span class="h-2 w-2 rounded-full bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.4)]"></span>
			<span class="font-mono text-xs text-text-secondary">Device A</span>
		</div>
		<div class="flex items-center justify-center gap-2 px-3 py-2.5">
			<span class="h-2 w-2 rounded-full bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.4)]"></span>
			<span class="font-mono text-xs text-text-secondary">Device B</span>
		</div>

		<!-- Row 2: Icons -->
		<div class="icon-cell flex items-center justify-center py-6 sm:py-8">
			<div class="rounded-xl border border-border bg-bg-surface p-3 sm:p-4">
				<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" class="text-text-muted">
					<rect x="2" y="3" width="20" height="14" rx="2" />
					<line x1="8" x2="16" y1="21" y2="21" />
					<line x1="12" x2="12" y1="17" y2="21" />
				</svg>
			</div>
		</div>
		<div class="icon-cell flex items-center justify-center py-6 sm:py-8">
			<div class="rounded-xl border border-border bg-bg-surface p-3 sm:p-4">
				<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" class="text-text-muted">
					<path d="M20 16V7a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v9m16 0H4m16 0 1.28 2.55a1 1 0 0 1-.9 1.45H3.62a1 1 0 0 1-.9-1.45L4 16" />
				</svg>
			</div>
		</div>

		<!-- Row 3: Todo lists -->
		<div class="device-body min-h-[180px] p-2">
			<div class="mx-auto w-fit">
				{#each deviceA as todo (todo.id)}
					<div
						class="todo-item flex items-center gap-2 rounded-md px-2 py-1.5"
						class:done={todo.done}
						animate:flip={{ duration: 250 }}
						in:slide={{ duration: 280 }}
						out:fade={{ duration: 180 }}
					>
						<span
							class="check flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full border transition-all duration-200"
							class:checked={todo.done}
						>
							{#if todo.done}
								<svg xmlns="http://www.w3.org/2000/svg" width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
							{/if}
						</span>
						<span class="truncate text-xs">{todo.text}</span>
					</div>
				{/each}
			</div>
		</div>
		<div class="device-body min-h-[180px] p-2">
			<div class="mx-auto w-fit">
				{#each deviceB as todo (todo.id)}
					<div
						class="todo-item flex items-center gap-2 rounded-md px-2 py-1.5"
						class:done={todo.done}
						animate:flip={{ duration: 250 }}
						in:slide={{ duration: 280 }}
						out:fade={{ duration: 180 }}
					>
						<span
							class="check flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full border transition-all duration-200"
							class:checked={todo.done}
						>
							{#if todo.done}
								<svg xmlns="http://www.w3.org/2000/svg" width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
							{/if}
						</span>
						<span class="truncate text-xs">{todo.text}</span>
					</div>
				{/each}
			</div>
		</div>

		<!-- Relay column: 3 cells sharing column 2 -->
		<div class="relay-cell relay-row1 flex items-center justify-center px-4 py-2.5">
			<span class="font-mono text-xs text-text-secondary">Nostr Relay</span>
		</div>
		<div class="relay-cell relay-row2 flex items-center justify-center px-4 py-6 sm:py-8">
			<div class="rounded-xl border border-border bg-bg-surface p-3 sm:p-4">
				<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" class="text-text-muted">
					<rect width="18" height="11" x="3" y="11" rx="2" ry="2" />
					<path d="M7 11V7a5 5 0 0 1 10 0v4" />
				</svg>
			</div>
		</div>
		<div class="relay-cell relay-row3"></div>

		<!-- Connector lines in icon row -->
		<div class="connector connector-left"></div>
		<div class="connector connector-right"></div>

		<!-- Packet track spans icon row -->
		<div class="packet-track">
			{#each packets as packet (packet.id)}
				<div
					class="flying-packet"
					class:fly-right={packet.direction === "right"}
					class:fly-left={packet.direction === "left"}
				>
					<div class="packet-visual">
						<div class="wrap-layer wrap-gift"></div>
						<div class="wrap-layer wrap-seal"></div>
						<span class="action-badge" class:action-create={packet.action === "create"} class:action-done={packet.action === "done"} class:action-delete={packet.action === "delete"}>
							{#if packet.action === "create"}+{:else if packet.action === "done"}&check;{:else}&times;{/if}
						</span>
						<div class="packet-core">
							<span class="packet-readable">{packet.text}</span>
							<span class="packet-encrypted">
								<svg xmlns="http://www.w3.org/2000/svg" width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="shrink-0">
									<rect width="18" height="11" x="3" y="11" rx="2" ry="2" />
									<path d="M7 11V7a5 5 0 0 1 10 0v4" />
								</svg>
								<span>{packet.hex}…</span>
							</span>
						</div>
					</div>
				</div>
			{/each}
		</div>
	</div>

	<!-- Legend -->
	<div class="flex items-center justify-center gap-5 border-t border-border px-4 py-2.5">
		<div class="flex items-center gap-1.5">
			<span class="h-1.5 w-3 rounded-full bg-accent/70"></span>
			<span class="text-[0.6rem] text-text-muted">Seal</span>
		</div>
		<div class="flex items-center gap-1.5">
			<span class="h-1.5 w-3 rounded-full bg-gold/70"></span>
			<span class="text-[0.6rem] text-text-muted">Gift wrap</span>
		</div>
		<div class="flex items-center gap-1.5">
			<svg xmlns="http://www.w3.org/2000/svg" width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" class="text-text-muted">
				<rect width="18" height="11" x="3" y="11" rx="2" ry="2" />
				<path d="M7 11V7a5 5 0 0 1 10 0v4" />
			</svg>
			<span class="text-[0.6rem] text-text-muted">Encrypted</span>
		</div>
	</div>
</div>

<style>
	.demo-root {
		container-type: inline-size;
	}

	/* 3-column grid: Device A | Relay | Device B, 3 rows */
	.demo-grid {
		display: grid;
		grid-template-columns: 1fr auto 1fr;
		grid-template-rows: auto auto 1fr;
		position: relative;
	}

	/* Relay cells: column 2 */
	.relay-row1 { grid-column: 2; grid-row: 1; }
	.relay-row2 { grid-column: 2; grid-row: 2; }
	.relay-row3 { grid-column: 2; grid-row: 3; }

	/* Device A cells: column 1 */
	.demo-grid > :nth-child(1) { grid-column: 1; grid-row: 1; }
	.demo-grid > :nth-child(3) { grid-column: 1; grid-row: 2; }
	.demo-grid > :nth-child(5) { grid-column: 1; grid-row: 3; }

	/* Device B cells: column 3 */
	.demo-grid > :nth-child(2) { grid-column: 3; grid-row: 1; }
	.demo-grid > :nth-child(4) { grid-column: 3; grid-row: 2; }
	.demo-grid > :nth-child(6) { grid-column: 3; grid-row: 3; }

	/* Connector lines sit in row 2, full grid width */
	.connector {
		grid-row: 2;
		align-self: center;
		height: 0;
		border-top: 1.5px dashed var(--color-border);
		z-index: 1;
	}

	.connector-left {
		grid-column: 1;
		margin-left: 60%;
		margin-right: -1px;
	}

	.connector-right {
		grid-column: 3;
		margin-right: 60%;
		margin-left: -1px;
	}

	/* Packet track overlays row 2 across all columns */
	.packet-track {
		grid-column: 1 / -1;
		grid-row: 2;
		position: relative;
		z-index: 20;
		pointer-events: none;
		overflow: visible;
	}

	.todo-item span:last-child {
		color: var(--color-text-primary);
		transition: all 0.2s;
	}

	.todo-item.done span:last-child {
		color: var(--color-text-muted);
		text-decoration: line-through;
	}

	.check {
		border-color: var(--color-border-light);
	}

	.check.checked {
		border-color: var(--color-accent);
		background-color: color-mix(in srgb, var(--color-accent) 20%, transparent);
		color: var(--color-accent);
	}

	.flying-packet {
		position: absolute;
		top: 50%;
		left: 0;
		width: 100%;
		height: 0;
	}

	.packet-visual {
		position: absolute;
		top: 0;
		left: 0;
		will-change: transform, opacity;
	}

	/*
	 * Slow–fast–slow via ease-in-out between sparse keyframes.
	 * The easing naturally decelerates near each stop, giving us:
	 *   - Slow departure (wrapping lingers near source)
	 *   - Fast cruise through relay
	 *   - Slow arrival (unwrapping lingers near destination)
	 */
	.fly-right .packet-visual {
		animation: fly-right-gpu 3.8s ease-in-out forwards;
	}

	.fly-left .packet-visual {
		animation: fly-left-gpu 3.8s ease-in-out forwards;
	}

	@keyframes fly-right-gpu {
		0% {
			transform: translate(25cqi, -50%) translateX(-50%);
			opacity: 0;
		}
		5% {
			transform: translate(25cqi, -50%) translateX(-50%);
			opacity: 1;
		}
		40% {
			transform: translate(50cqi, -50%) translateX(-50%);
		}
		60% {
			transform: translate(50cqi, -50%) translateX(-50%);
		}
		95% {
			transform: translate(75cqi, -50%) translateX(-50%);
			opacity: 1;
		}
		100% {
			transform: translate(75cqi, -50%) translateX(-50%);
			opacity: 0;
		}
	}

	@keyframes fly-left-gpu {
		0% {
			transform: translate(75cqi, -50%) translateX(-50%);
			opacity: 0;
		}
		5% {
			transform: translate(75cqi, -50%) translateX(-50%);
			opacity: 1;
		}
		40% {
			transform: translate(50cqi, -50%) translateX(-50%);
		}
		60% {
			transform: translate(50cqi, -50%) translateX(-50%);
		}
		95% {
			transform: translate(25cqi, -50%) translateX(-50%);
			opacity: 1;
		}
		100% {
			transform: translate(25cqi, -50%) translateX(-50%);
			opacity: 0;
		}
	}

	/* Action badge */
	.action-badge {
		position: absolute;
		top: -8px;
		right: -6px;
		z-index: 2;
		display: flex;
		align-items: center;
		justify-content: center;
		width: 15px;
		height: 15px;
		border-radius: 50%;
		font-size: 0.6rem;
		font-weight: 700;
		line-height: 1;
		animation: badge-vis 3.8s ease both;
	}

	.action-create {
		background-color: #166534;
		color: #4ade80;
		border: 1px solid #22c55e;
	}

	.action-done {
		background-color: var(--color-accent-deep);
		color: var(--color-accent-glow);
		border: 1px solid var(--color-accent);
	}

	.action-delete {
		background-color: #7f1d1d;
		color: #f87171;
		border: 1px solid #ef4444;
	}

	@keyframes badge-vis {
		0%, 8% { opacity: 1; transform: scale(1); }
		20%, 80% { opacity: 0; transform: scale(0.5); }
		92%, 100% { opacity: 1; transform: scale(1); }
	}

	/* Packet core */
	.packet-core {
		position: relative;
		background: var(--color-bg-elevated);
		border: 1px solid var(--color-border);
		border-radius: 6px;
		padding: 3px 8px;
		font-family: var(--font-mono);
		font-size: 0.6rem;
		white-space: nowrap;
		overflow: hidden;
		max-width: 120px;
	}

	.packet-readable {
		display: block;
		color: var(--color-text-primary);
		animation: readable-vis 3.8s ease both;
	}

	.packet-encrypted {
		position: absolute;
		inset: 0;
		display: flex;
		align-items: center;
		gap: 3px;
		padding: 3px 8px;
		color: var(--color-text-muted);
		animation: encrypted-vis 3.8s ease both;
	}

	@keyframes readable-vis {
		0%, 8% { opacity: 1; }
		20%, 80% { opacity: 0; }
		92%, 100% { opacity: 1; }
	}

	@keyframes encrypted-vis {
		0%, 16% { opacity: 0; }
		25%, 75% { opacity: 1; }
		84%, 100% { opacity: 0; }
	}

	/* Wrapping layers */
	.wrap-layer {
		position: absolute;
		pointer-events: none;
	}

	.wrap-seal {
		inset: -3px;
		border-radius: 9px;
		border: 1.5px solid var(--color-accent);
		opacity: 0;
		animation: seal-anim 3.8s ease both;
	}

	.wrap-gift {
		inset: -7px;
		border-radius: 12px;
		border: 1.5px solid var(--color-gold);
		opacity: 0;
		animation: gift-anim 3.8s ease both;
	}

	@keyframes seal-anim {
		0%, 6% { opacity: 0; transform: scale(1.4); }
		16% { opacity: 1; transform: scale(1); }
		84% { opacity: 1; transform: scale(1); }
		94%, 100% { opacity: 0; transform: scale(1.4); }
	}

	@keyframes gift-anim {
		0%, 12% { opacity: 0; transform: scale(1.4); }
		22% { opacity: 1; transform: scale(1); }
		78% { opacity: 1; transform: scale(1); }
		88%, 100% { opacity: 0; transform: scale(1.4); }
	}
</style>
