import type { FieldDef } from "./field.ts";

export type CollectionFields = Record<string, FieldDef<unknown>>;

export interface CollectionDef<out F extends CollectionFields = CollectionFields> {
  readonly _tag: "CollectionDef";
  readonly name: string;
  readonly fields: F;
  readonly indices: ReadonlyArray<string>;
  readonly eventRetention: number;
}

export interface CollectionOptions<F extends CollectionFields> {
  readonly indices?: ReadonlyArray<string & keyof F>;
  readonly eventRetention?: number;
}

const RESERVED_NAMES = new Set(["id", "_d", "_u", "_e", "_a"]);

export function collection<F extends CollectionFields>(
  name: string,
  fields: F,
  options?: CollectionOptions<F>,
): CollectionDef<F> {
  if (!name || name.trim().length === 0) {
    throw new Error("Collection name must not be empty");
  }
  const fieldNames = Object.keys(fields);
  if (fieldNames.length === 0) {
    throw new Error(`Collection "${name}" must have at least one field`);
  }
  for (const fieldName of fieldNames) {
    if (RESERVED_NAMES.has(fieldName)) {
      throw new Error(`Field name "${fieldName}" is reserved`);
    }
  }

  const indices: string[] = [];
  if (options?.indices) {
    for (const idx of options.indices) {
      const fieldDef = fields[idx];
      if (!fieldDef) {
        throw new Error(`Index field "${idx}" does not exist in collection "${name}"`);
      }
      if (fieldDef.kind === "json" || fieldDef.isArray) {
        throw new Error(
          `Field "${idx}" cannot be indexed (type: ${fieldDef.kind}${fieldDef.isArray ? "[]" : ""})`,
        );
      }
      indices.push(idx);
    }
  }

  const eventRetention = options?.eventRetention ?? 1;
  if (eventRetention < 0 || !Number.isInteger(eventRetention)) {
    throw new Error(`eventRetention must be a non-negative integer, got ${eventRetention}`);
  }

  return { _tag: "CollectionDef" as const, name, fields, indices, eventRetention };
}
