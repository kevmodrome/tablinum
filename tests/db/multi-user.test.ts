import { describe, expect } from "vitest";
import { it } from "@effect/vitest";
import { Effect, Fiber, Scope, Stream } from "effect";
import { generateSecretKey, getPublicKey } from "nostr-tools/pure";
import { field } from "../../src/schema/field.ts";
import { collection } from "../../src/schema/collection.ts";
import { createTablinum } from "../../src/db/create-tablinum.ts";
import { bytesToHex } from "../../src/db/epoch.ts";
import { EpochId } from "../../src/brands.ts";

describe("multi-user", () => {
  it.effect("exportInvite returns epoch keys and config", () =>
    Effect.gen(function* () {
      const initialEpochKey = generateSecretKey();
      const todos = collection("todos", { title: field.string() });

      const db = yield* createTablinum({
        schema: { todos },
        relays: ["wss://relay.example.com"],
        epochKeys: [{ epochId: EpochId("epoch-0"), key: bytesToHex(initialEpochKey) }],
        dbName: "test-invite",
      });

      const invite = db.exportInvite();
      expect(invite.dbName).toBe("test-invite");
      expect(invite.relays).toEqual(["wss://relay.example.com"]);
      expect(invite.epochKeys).toHaveLength(1);
      expect(invite.epochKeys[0].key).toHaveLength(64);

      // Epoch key in invite should match the first epoch pubkey derivation
      const epochPk = getPublicKey(initialEpochKey);
      const inviteBytes = new Uint8Array(32);
      const key = invite.epochKeys[0].key;
      for (let i = 0; i < 32; i++) {
        inviteBytes[i] = parseInt(key.slice(i * 2, i * 2 + 2), 16);
      }
      expect(getPublicKey(inviteBytes)).toBe(epochPk);
    }),
  );

  it.effect("exportInvite without explicit epoch keys auto-generates epoch keys", () =>
    Effect.gen(function* () {
      const todos = collection("todos", { title: field.string() });

      const db = yield* createTablinum({
        schema: { todos },
        relays: ["wss://relay.example.com"],
        dbName: "test-invite-auto",
      });

      const invite = db.exportInvite();
      expect(invite.epochKeys).toHaveLength(1);
      expect(invite.epochKeys[0].key).toHaveLength(64);
      // The epoch key should be separate from the user's personal key
      expect(invite.epochKeys[0].key).not.toBe(db.exportKey());
    }),
  );

  it.effect("_members collection is accessible", () =>
    Effect.gen(function* () {
      const todos = collection("todos", { title: field.string() });

      const db = yield* createTablinum({
        schema: { todos },
        relays: ["wss://relay.example.com"],
        dbName: "test-members-access",
      });

      // _members should be a valid collection
      const members = db.collection("_members" as any);
      expect(members).toBeDefined();

      const count = yield* members.count();
      expect(count).toBeGreaterThanOrEqual(0);
    }),
  );

  it.effect("records do not leak _author field", () =>
    Effect.gen(function* () {
      const todos = collection("todos", {
        title: field.string(),
        done: field.boolean(),
      });

      const db = yield* createTablinum({
        schema: { todos },
        relays: ["wss://relay.example.com"],
        dbName: "test-no-author-leak",
      });

      const col = db.collection("todos");
      const id = yield* col.add({ title: "Test", done: false } as any);
      const record = yield* col.get(id);

      // internal fields should be stripped from the public record
      expect("_a" in record).toBe(false);
      expect("_d" in record).toBe(false);
      expect("_u" in record).toBe(false);
      expect("_e" in record).toBe(false);
    }),
  );

  it.effect("updated records do not accumulate _author in data", () =>
    Effect.gen(function* () {
      const todos = collection("todos", {
        title: field.string(),
        done: field.boolean(),
      });

      const db = yield* createTablinum({
        schema: { todos },
        relays: ["wss://relay.example.com"],
        dbName: "test-no-author-accumulate",
      });

      const col = db.collection("todos");
      const id = yield* col.add({ title: "Test", done: false } as any);

      // Update several times
      yield* col.update(id, { done: true } as any);
      yield* col.update(id, { title: "Updated" } as any);

      const record = yield* col.get(id);
      expect("_a" in record).toBe(false);
      expect(record.title).toBe("Updated");
      expect(record.done).toBe(true);
    }),
  );

  it.effect("epoch key changes target public key for gift wraps", () =>
    Effect.gen(function* () {
      const initialEpochKey = generateSecretKey();

      const userSk = generateSecretKey();
      const userPk = getPublicKey(userSk);

      const todos = collection("todos", { title: field.string() });

      const db = yield* createTablinum({
        schema: { todos },
        relays: ["wss://relay.example.com"],
        privateKey: userSk,
        epochKeys: [{ epochId: EpochId("epoch-0"), key: bytesToHex(initialEpochKey) }],
        dbName: "test-group-target",
      });

      // The exported user key should be the user's identity key, not the epoch key
      expect(db.exportKey()).toHaveLength(64);
      const exportedPk = getPublicKey(
        new Uint8Array(
          db
            .exportKey()
            .match(/.{2}/g)!
            .map((b) => parseInt(b, 16)),
        ),
      );
      expect(exportedPk).toBe(userPk);
    }),
  );

  it.effect("multi-user mode auto-registers current user as member", () =>
    Effect.gen(function* () {
      const initialEpochKey = generateSecretKey();
      const userSk = generateSecretKey();
      const userPk = getPublicKey(userSk);

      const todos = collection("todos", { title: field.string() });

      const db = yield* createTablinum({
        schema: { todos },
        relays: ["wss://relay.example.com"],
        privateKey: userSk,
        epochKeys: [{ epochId: EpochId("epoch-0"), key: bytesToHex(initialEpochKey) }],
        dbName: "test-auto-member",
      });

      const members = yield* db.getMembers();
      expect(members.length).toBeGreaterThanOrEqual(1);
      expect(members.some((m) => m.id === userPk)).toBe(true);
    }),
  );

  it.effect("members handle watch() emits self-registered member", () =>
    Effect.gen(function* () {
      const initialEpochKey = generateSecretKey();
      const userSk = generateSecretKey();
      const userPk = getPublicKey(userSk);

      const todos = collection("todos", { title: field.string() });

      const db = yield* createTablinum({
        schema: { todos },
        relays: ["wss://relay.example.com"],
        privateKey: userSk,
        epochKeys: [{ epochId: EpochId("epoch-0"), key: bytesToHex(initialEpochKey) }],
        dbName: "test-members-watch",
      });

      // Take just the first emission from the watch stream
      const firstEmission = yield* db.members.watch().pipe(Stream.take(1), Stream.runCollect);

      const items = Array.from(firstEmission).flat();
      expect(items.length).toBeGreaterThanOrEqual(1);
      expect(items.some((m: any) => m.id === userPk)).toBe(true);
    }),
  );

  it("members watch via runFork populates items (mimics Svelte Collection)", async () => {
    const initialEpochKey = generateSecretKey();
    const userSk = generateSecretKey();
    const userPk = getPublicKey(userSk);

    const todos = collection("todos", { title: field.string() });

    // Use a scope like the Svelte wrapper does
    const scope = Effect.runSync(Scope.make());
    const db = await Effect.runPromise(
      createTablinum({
        schema: { todos },
        relays: ["wss://relay.example.com"],
        privateKey: userSk,
        epochKeys: [{ epochId: EpochId("epoch-0"), key: bytesToHex(initialEpochKey) }],
        dbName: "test-members-fork-watch",
      }).pipe(Effect.provideService(Scope.Scope, scope)),
    );

    // Mimic what Svelte Collection does: Effect.runFork from constructor
    let items: ReadonlyArray<unknown> = [];
    let error: unknown = null;
    const watchEffect = Stream.runForEach(db.members.watch(), (records) =>
      Effect.sync(() => {
        items = records;
      }),
    ).pipe(
      Effect.catch((e) =>
        Effect.sync(() => {
          error = e;
        }),
      ),
    );
    const fiber = Effect.runFork(watchEffect);

    // Give the fiber time to process
    await new Promise((r) => setTimeout(r, 200));

    console.log("items:", items.length, "error:", error);

    expect(error).toBeNull();
    expect(items.length).toBeGreaterThanOrEqual(1);
    expect(items.some((m: any) => m.id === userPk)).toBe(true);

    // Cleanup
    Effect.runFork(Fiber.interrupt(fiber));
  });

  it.effect("getProfile returns empty profile for new user", () =>
    Effect.gen(function* () {
      const todos = collection("todos", { title: field.string() });
      const db = yield* createTablinum({
        schema: { todos },
        relays: ["wss://relay.example.com"],
        epochKeys: [{ epochId: EpochId("epoch-0"), key: bytesToHex(generateSecretKey()) }],
        dbName: "test-get-profile-empty",
      });

      const profile = yield* db.getProfile();
      expect(profile).toEqual({});
    }),
  );

  it.effect("setProfile then getProfile round-trips", () =>
    Effect.gen(function* () {
      const todos = collection("todos", { title: field.string() });
      const db = yield* createTablinum({
        schema: { todos },
        relays: ["wss://relay.example.com"],
        epochKeys: [{ epochId: EpochId("epoch-0"), key: bytesToHex(generateSecretKey()) }],
        dbName: "test-profile-roundtrip",
      });

      yield* db.setProfile({ name: "Alice", about: "Hello world" });
      const profile = yield* db.getProfile();
      expect(profile.name).toBe("Alice");
      expect(profile.about).toBe("Hello world");
      expect(profile.picture).toBeUndefined();
      expect(profile.nip05).toBeUndefined();
    }),
  );

  it.effect("setProfile merges with existing profile", () =>
    Effect.gen(function* () {
      const todos = collection("todos", { title: field.string() });
      const db = yield* createTablinum({
        schema: { todos },
        relays: ["wss://relay.example.com"],
        epochKeys: [{ epochId: EpochId("epoch-0"), key: bytesToHex(generateSecretKey()) }],
        dbName: "test-profile-merge",
      });

      yield* db.setProfile({ name: "Alice" });
      yield* db.setProfile({ about: "Updated bio" });
      const profile = yield* db.getProfile();
      expect(profile.name).toBe("Alice");
      expect(profile.about).toBe("Updated bio");
    }),
  );

  it.effect("rebuild preserves state with eventRetention greater than one", () =>
    Effect.gen(function* () {
      const todos = collection(
        "todos",
        {
          title: field.string(),
          done: field.boolean(),
        },
        { eventRetention: 2 },
      );
      const db = yield* createTablinum({
        schema: { todos },
        relays: ["wss://relay.example.com"],
        epochKeys: [{ epochId: EpochId("epoch-0"), key: bytesToHex(generateSecretKey()) }],
        dbName: "test-rebuild-retention-2",
      });

      const col = db.collection("todos");
      const id = yield* col.add({ title: "A", done: false } as any);
      yield* col.update(id, { done: true } as any);
      yield* col.update(id, { title: "B" } as any);
      yield* col.update(id, { title: "C" } as any);

      yield* db.rebuild();

      const record = yield* col.get(id);
      expect(record.title).toBe("C");
      expect(record.done).toBe(true);
    }),
  );

  it.effect("undo restores the pre-delete state", () =>
    Effect.gen(function* () {
      const todos = collection(
        "todos",
        {
          title: field.string(),
          done: field.boolean(),
        },
        { eventRetention: 3 },
      );
      const db = yield* createTablinum({
        schema: { todos },
        relays: ["wss://relay.example.com"],
        epochKeys: [{ epochId: EpochId("epoch-0"), key: bytesToHex(generateSecretKey()) }],
        dbName: "test-undo-delete",
      });

      const col = db.collection("todos");
      const id = yield* col.add({ title: "A", done: false } as any);
      yield* col.update(id, { title: "B" } as any);
      yield* col.delete(id);
      yield* col.undo(id);

      const record = yield* col.get(id);
      expect(record.title).toBe("B");
      expect(record.done).toBe(false);
    }),
  );
});
