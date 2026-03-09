import { Effect, Stream } from "effect";
import { field, collection, createTablinum } from "../../src/index.ts";

// Read key from URL if present: ?key=<hex>
function getKeyFromUrl(): Uint8Array | undefined {
  const params = new URLSearchParams(window.location.search);
  const hex = params.get("key");
  if (!hex || hex.length !== 64) return undefined;
  const bytes = new Uint8Array(32);
  for (let i = 0; i < 32; i++) {
    bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

const log = (msg: string) => {
  const el = document.getElementById("log")!;
  el.textContent += msg + "\n";
  el.scrollTop = el.scrollHeight;
};

const app = Effect.gen(function* () {
  const todos = collection(
    "todos",
    {
      title: field.string(),
      done: field.boolean(),
      priority: field.number(),
    },
    { indices: ["done", "priority"] },
  );

  const importedKey = getKeyFromUrl();
  // Use a unique DB name per key so imported keys get a fresh DB
  const dbSuffix = importedKey ? "-imported" : "";

  const db = yield* createTablinum({
    schema: { todos },
    relays: ["wss://relay.nostr.place"],
    dbName: `tablinum-demo${dbSuffix}`,
    privateKey: importedKey,
    onSyncError: (err) => {
      log(`Sync error: ${err.message}`);
    },
  });

  const col = db.collection("todos");
  const fullKey = db.exportKey();

  // Show key in UI
  document.getElementById("key-display")!.textContent = fullKey;
  if (importedKey) {
    log("Imported key from URL");
  }

  // Wire up UI
  const form = document.getElementById("add-form") as HTMLFormElement;
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const titleInput = document.getElementById("title") as HTMLInputElement;
    const title = titleInput.value.trim();
    if (!title) return;

    Effect.runPromise(
      Effect.gen(function* () {
        const id = yield* col.add({ title, done: false, priority: 1 } as any);
        log(`Added: "${title}" (${id})`);
        titleInput.value = "";
        yield* renderTodos();
      }),
    ).catch((err) => {
      log(`Error: ${err}`);
      if (err?.cause) log(`Cause: ${err.cause}`);
      console.error(err);
    });
  });

  const renderTodos = () =>
    Effect.gen(function* () {
      const all = yield* col.where("done").equals(false).sortBy("priority").get();
      const done = yield* col.where("done").equals(true).get();
      const count = yield* col.count();

      const list = document.getElementById("todos")!;
      list.innerHTML = "";

      for (const todo of all) {
        const li = document.createElement("li");
        li.innerHTML = `
          <span>${todo.title}</span>
          <button data-id="${todo.id}" data-action="done">✓</button>
          <button data-id="${todo.id}" data-action="delete">✕</button>
        `;
        list.appendChild(li);
      }

      for (const todo of done) {
        const li = document.createElement("li");
        li.style.opacity = "0.5";
        li.style.textDecoration = "line-through";
        li.innerHTML = `
          <span>${todo.title}</span>
          <button data-id="${todo.id}" data-action="delete">✕</button>
        `;
        list.appendChild(li);
      }

      document.getElementById("count")!.textContent = `${count} total`;
    });

  // Handle todo actions (done/delete)
  document.getElementById("todos")!.addEventListener("click", (e) => {
    const btn = (e.target as HTMLElement).closest("button");
    if (!btn) return;
    const id = btn.dataset.id!;
    const action = btn.dataset.action!;

    const effect =
      action === "done"
        ? Effect.gen(function* () {
            yield* col.update(id, { done: true } as any);
            log(`Completed: ${id}`);
            yield* renderTodos();
          })
        : Effect.gen(function* () {
            yield* col.delete(id);
            log(`Deleted: ${id}`);
            yield* renderTodos();
          });

    Effect.runPromise(effect).catch((err) => {
      log(`Error: ${err}`);
      if (err?.cause) log(`Cause: ${err.cause}`);
      console.error(err);
    });
  });

  // Sync button
  document.getElementById("sync-btn")!.addEventListener("click", () => {
    log("Syncing...");
    Effect.runPromise(
      Effect.gen(function* () {
        yield* db.sync();
        log("Sync complete");
        yield* renderTodos();
      }),
    ).catch((err) => {
      log(`Sync error: ${err}`);
      if (err?.cause) log(`Cause: ${err.cause}`);
      console.error(err);
    });
  });

  // Rebuild button
  document.getElementById("rebuild-btn")!.addEventListener("click", () => {
    Effect.runPromise(
      Effect.gen(function* () {
        yield* db.rebuild();
        log("Rebuilt records from events");
        yield* renderTodos();
      }),
    ).catch((err) => {
      log(`Error: ${err}`);
      if (err?.cause) log(`Cause: ${err.cause}`);
      console.error(err);
    });
  });

  // Copy key button
  document.getElementById("copy-btn")!.addEventListener("click", () => {
    navigator.clipboard.writeText(fullKey).then(
      () => log("Key copied to clipboard"),
      () => log(`Key: ${fullKey}`),
    );
  });

  // Import key button — reload page with key in URL
  document.getElementById("import-btn")!.addEventListener("click", () => {
    const input = document.getElementById("import-key") as HTMLInputElement;
    const hex = input.value.trim();
    if (hex.length !== 64) {
      log("Error: key must be 64 hex characters");
      return;
    }
    if (!/^[0-9a-f]+$/i.test(hex)) {
      log("Error: key must be valid hex");
      return;
    }
    window.location.search = `?key=${hex.toLowerCase()}`;
  });

  log("tablinum initialized");
  log(`Key: ${fullKey.slice(0, 16)}...`);

  yield* renderTodos();

  // Watch for changes (local + remote) and re-render automatically
  yield* col.watch().pipe(
    Stream.runForEach((todos) =>
      Effect.gen(function* () {
        console.log("[tablinum:watch] todos changed:", todos);
        yield* renderTodos();
      }).pipe(
        Effect.catch((_e) =>
          Effect.sync(() => console.error("[tablinum:watch] render error:", _e)),
        ),
      ),
    ),
  );
});

Effect.runPromise(Effect.scoped(app)).catch((err) => {
  document.getElementById("log")!.textContent += `Fatal: ${err}\n`;
  if (err?.cause) {
    document.getElementById("log")!.textContent += `Cause: ${err.cause}\n`;
    console.error("Cause:", err.cause);
  }
  console.error(err);
});
