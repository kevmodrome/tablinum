import { describe, expect } from "vitest";
import { it } from "@effect/vitest";
import { Effect } from "effect";
import { generateSecretKey, getPublicKey } from "nostr-tools/pure";
import { field } from "../../src/schema/field.ts";
import { collection } from "../../src/schema/collection.ts";
import { createTablinum } from "../../src/db/create-tablinum.ts";

describe("multi-user", () => {
  it.effect("exportInvite returns group key and config", () =>
    Effect.gen(function* () {
      const groupSk = generateSecretKey();
      const todos = collection("todos", { title: field.string() });

      const db = yield* createTablinum({
        schema: { todos },
        relays: ["wss://relay.example.com"],
        groupPrivateKey: groupSk,
        dbName: "test-invite",
      });

      const invite = db.exportInvite();
      expect(invite.dbName).toBe("test-invite");
      expect(invite.relays).toEqual(["wss://relay.example.com"]);
      expect(invite.groupKey).toHaveLength(64);

      // Group key in invite should match the group pubkey derivation
      const groupPk = getPublicKey(groupSk);
      const inviteBytes = new Uint8Array(32);
      for (let i = 0; i < 32; i++) {
        inviteBytes[i] = parseInt(invite.groupKey.slice(i * 2, i * 2 + 2), 16);
      }
      expect(getPublicKey(inviteBytes)).toBe(groupPk);
    }),
  );

  it.effect("exportInvite without group key uses user key", () =>
    Effect.gen(function* () {
      const todos = collection("todos", { title: field.string() });

      const db = yield* createTablinum({
        schema: { todos },
        relays: ["wss://relay.example.com"],
        dbName: "test-invite-single",
      });

      const invite = db.exportInvite();
      expect(invite.groupKey).toBe(db.exportKey());
    }),
  );

  it.effect("_authors collection is accessible", () =>
    Effect.gen(function* () {
      const todos = collection("todos", { title: field.string() });

      const db = yield* createTablinum({
        schema: { todos },
        relays: ["wss://relay.example.com"],
        dbName: "test-authors-access",
      });

      // _authors should be a valid collection
      const authors = db.collection("_authors" as any);
      expect(authors).toBeDefined();

      const count = yield* authors.count();
      expect(count).toBe(0);
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

      // _author should be stripped from the public record
      expect("_author" in record).toBe(false);
      expect("_deleted" in record).toBe(false);
      expect("_updatedAt" in record).toBe(false);
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
      expect("_author" in record).toBe(false);
      expect(record.title).toBe("Updated");
      expect(record.done).toBe(true);
    }),
  );

  it.effect("group key changes target public key for gift wraps", () =>
    Effect.gen(function* () {
      const groupSk = generateSecretKey();
      const groupPk = getPublicKey(groupSk);

      const userSk = generateSecretKey();
      const userPk = getPublicKey(userSk);

      const todos = collection("todos", { title: field.string() });

      const db = yield* createTablinum({
        schema: { todos },
        relays: ["wss://relay.example.com"],
        privateKey: userSk,
        groupPrivateKey: groupSk,
        dbName: "test-group-target",
      });

      // The exported user key should be the user's key, not the group key
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
});
