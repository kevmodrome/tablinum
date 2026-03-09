import { Effect, Schema } from "effect";
import type { CollectionDef, CollectionFields } from "./collection.ts";
import type { FieldDef } from "./field.ts";
import { ValidationError } from "../errors.ts";

function fieldDefToSchema(fd: FieldDef): Schema.Schema<unknown> {
  let base: Schema.Schema<unknown>;
  switch (fd.kind) {
    case "string":
      base = Schema.String as Schema.Schema<unknown>;
      break;
    case "number":
      base = Schema.Number as Schema.Schema<unknown>;
      break;
    case "boolean":
      base = Schema.Boolean as Schema.Schema<unknown>;
      break;
    case "json":
      base = Schema.Unknown;
      break;
  }

  if (fd.isArray) {
    base = Schema.Array(base) as Schema.Schema<unknown>;
  }
  if (fd.isOptional) {
    base = Schema.UndefinedOr(base) as Schema.Schema<unknown>;
  }

  return base;
}

export type RecordValidator<F extends CollectionFields> = (
  input: unknown,
) => Effect.Effect<{ readonly id: string } & { readonly [K in keyof F]: unknown }, ValidationError>;

export function buildValidator<F extends CollectionFields>(
  collectionName: string,
  def: CollectionDef<F>,
): RecordValidator<F> {
  const schemaFields: Record<string, Schema.Schema<unknown>> = {
    id: Schema.String as Schema.Schema<unknown>,
  };
  for (const [name, fieldDef] of Object.entries(def.fields)) {
    schemaFields[name] = fieldDefToSchema(fieldDef);
  }

  const recordSchema = Schema.Struct(
    schemaFields as {
      [K: string]: Schema.Schema<unknown>;
    },
  );

  const decode = Schema.decodeUnknownSync(recordSchema);

  return (input: unknown) =>
    Effect.gen(function* () {
      try {
        const result = decode(input);
        return result as { readonly id: string } & {
          readonly [K in keyof F]: unknown;
        };
      } catch (e) {
        return yield* new ValidationError({
          message: `Validation failed for collection "${collectionName}": ${e instanceof Error ? e.message : String(e)}`,
        });
      }
    });
}

export type PartialValidator<F extends CollectionFields> = (
  input: unknown,
) => Effect.Effect<{ readonly [K in keyof F]?: unknown }, ValidationError>;

export function buildPartialValidator<F extends CollectionFields>(
  collectionName: string,
  def: CollectionDef<F>,
): PartialValidator<F> {
  return (input: unknown) =>
    Effect.gen(function* () {
      if (typeof input !== "object" || input === null) {
        return yield* new ValidationError({
          message: `Validation failed for collection "${collectionName}": expected an object`,
        });
      }
      const record = input as Record<string, unknown>;
      for (const [key, value] of Object.entries(record)) {
        const fieldDef = def.fields[key];
        if (!fieldDef) {
          return yield* new ValidationError({
            message: `Unknown field "${key}" in collection "${collectionName}"`,
            field: key,
          });
        }
        if (value === undefined && fieldDef.isOptional) {
          continue;
        }
        const fieldSchema = fieldDefToSchema(fieldDef);
        const decode = Schema.decodeUnknownSync(fieldSchema);
        try {
          decode(value);
        } catch (e) {
          return yield* new ValidationError({
            message: `Validation failed for field "${key}" in collection "${collectionName}": ${e instanceof Error ? e.message : String(e)}`,
            field: key,
          });
        }
      }
      return record as { readonly [K in keyof F]?: unknown };
    });
}
