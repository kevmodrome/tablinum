import { Effect, Schema } from "effect";
import type { CollectionDef, CollectionFields } from "./collection.ts";
import type { FieldDef } from "./field.ts";
import { ValidationError } from "../errors.ts";

type DecodableSchema<T = unknown> = Schema.Schema<T> & {
  readonly DecodingServices: never;
};

function fieldDefToSchema(fd: FieldDef): DecodableSchema {
  let base: DecodableSchema;
  switch (fd.kind) {
    case "string":
      base = Schema.String as DecodableSchema;
      break;
    case "number":
      base = Schema.Number as DecodableSchema;
      break;
    case "boolean":
      base = Schema.Boolean as DecodableSchema;
      break;
    case "json":
      base = Schema.Unknown as DecodableSchema;
      break;
    case "object": {
      const nested: Record<string, DecodableSchema> = {};
      for (const [k, v] of Object.entries(fd.fields!)) {
        nested[k] = fieldDefToSchema(v);
      }
      base = Schema.Struct(nested) as DecodableSchema;
      break;
    }
  }

  if (fd.isArray) {
    base = Schema.Array(base) as DecodableSchema;
  }
  if (fd.isOptional) {
    base = Schema.UndefinedOr(base) as DecodableSchema;
  }

  return base;
}

function buildStructSchema<F extends CollectionFields>(
  def: CollectionDef<F>,
  options: {
    readonly includeId?: boolean;
    readonly allOptional?: boolean;
  } = {},
): DecodableSchema {
  const schemaFields: Record<string, DecodableSchema> = {};

  if (options.includeId) {
    schemaFields.id = Schema.String as DecodableSchema;
  }

  for (const [name, fieldDef] of Object.entries(def.fields)) {
    const fieldSchema = fieldDefToSchema(fieldDef);
    schemaFields[name] = (options.allOptional || fieldDef.isOptional)
      ? (Schema.optionalKey(fieldSchema) as DecodableSchema)
      : fieldSchema;
  }

  return Schema.Struct(schemaFields) as DecodableSchema;
}

export type RecordValidator<F extends CollectionFields> = (
  input: unknown,
) => Effect.Effect<{ readonly id: string } & { readonly [K in keyof F]: unknown }, ValidationError>;

export function buildValidator<F extends CollectionFields>(
  collectionName: string,
  def: CollectionDef<F>,
): RecordValidator<F> {
  const decode = Schema.decodeUnknownEffect(buildStructSchema(def, { includeId: true }));

  return (input: unknown) =>
    decode(input).pipe(
      Effect.map(
        (result) =>
          result as { readonly id: string } & {
            readonly [K in keyof F]: unknown;
          },
      ),
      Effect.mapError(
        (e) =>
          new ValidationError({
            message: `Validation failed for collection "${collectionName}": ${e.message}`,
          }),
      ),
    );
}

export type PartialValidator<F extends CollectionFields> = (
  input: unknown,
) => Effect.Effect<{ readonly [K in keyof F]?: unknown }, ValidationError>;

export function buildPartialValidator<F extends CollectionFields>(
  collectionName: string,
  def: CollectionDef<F>,
): PartialValidator<F> {
  const decode = Schema.decodeUnknownEffect(buildStructSchema(def, { allOptional: true }));

  return (input: unknown) =>
    Effect.gen(function* () {
      if (typeof input !== "object" || input === null) {
        return yield* new ValidationError({
          message: `Validation failed for collection "${collectionName}": expected an object`,
        });
      }
      const record = input as Record<string, unknown>;
      const unknownField = Object.keys(record).find((key) => !Object.hasOwn(def.fields, key));
      if (unknownField !== undefined) {
        return yield* new ValidationError({
          message: `Unknown field "${unknownField}" in collection "${collectionName}"`,
          field: unknownField,
        });
      }

      return yield* decode(record).pipe(
        Effect.map((result) => result as { readonly [K in keyof F]?: unknown }),
        Effect.mapError(
          (e) =>
            new ValidationError({
              message: `Validation failed for collection "${collectionName}": ${e.message}`,
            }),
        ),
      );
    });
}
