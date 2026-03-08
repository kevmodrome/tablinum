import { Effect } from "effect";
import type { FieldDef } from "./field.ts";
import { ValidationError } from "../errors.ts";

export type CollectionFields = Record<string, FieldDef<unknown>>;

export interface CollectionDef<out F extends CollectionFields = CollectionFields> {
  readonly _tag: "CollectionDef";
  readonly name: string;
  readonly fields: F;
}

const RESERVED_NAMES = new Set(["id", "_deleted", "_createdAt", "_updatedAt"]);

export function collection<F extends CollectionFields>(
  name: string,
  fields: F,
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
    return { _tag: "CollectionDef" as const, name, fields };
  });
}
