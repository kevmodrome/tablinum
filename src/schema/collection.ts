import { Effect } from "effect";
import type { FieldDef } from "./field.ts";
import { ValidationError } from "../errors.ts";

export type CollectionFields = Record<string, FieldDef<unknown>>;

export interface CollectionDef<out F extends CollectionFields = CollectionFields> {
  readonly _tag: "CollectionDef";
  readonly name: string;
  readonly fields: F;
  readonly indices: ReadonlyArray<string>;
}

export interface CollectionOptions<F extends CollectionFields> {
  readonly indices?: ReadonlyArray<string & keyof F>;
}

const RESERVED_NAMES = new Set(["id", "_deleted", "_createdAt", "_updatedAt"]);

export function collection<F extends CollectionFields>(
  name: string,
  fields: F,
  options?: CollectionOptions<F>,
): Effect.Effect<CollectionDef<F>, ValidationError> {
  return Effect.gen(function* () {
    if (!name || name.trim().length === 0) {
      return yield* new ValidationError({ message: "Collection name must not be empty" });
    }
    const fieldNames = Object.keys(fields);
    if (fieldNames.length === 0) {
      return yield* new ValidationError({
        message: `Collection "${name}" must have at least one field`,
      });
    }
    for (const fieldName of fieldNames) {
      if (RESERVED_NAMES.has(fieldName)) {
        return yield* new ValidationError({
          message: `Field name "${fieldName}" is reserved`,
          field: fieldName,
        });
      }
    }

    const indices: string[] = [];
    if (options?.indices) {
      for (const idx of options.indices) {
        const fieldDef = fields[idx];
        if (!fieldDef) {
          return yield* new ValidationError({
            message: `Index field "${idx}" does not exist in collection "${name}"`,
            field: idx,
          });
        }
        if (fieldDef.kind === "json" || fieldDef.isArray) {
          return yield* new ValidationError({
            message: `Field "${idx}" cannot be indexed (type: ${fieldDef.kind}${fieldDef.isArray ? "[]" : ""})`,
            field: idx,
          });
        }
        indices.push(idx);
      }
    }

    return { _tag: "CollectionDef" as const, name, fields, indices };
  });
}
