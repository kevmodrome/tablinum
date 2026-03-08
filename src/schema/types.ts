import type { CollectionDef, CollectionFields } from "./collection.ts";
import type { FieldDef } from "./field.ts";

/** Extract the TypeScript type from a FieldDef phantom. */
export type InferFieldType<F> = F extends FieldDef<infer T> ? T : never;

/** Infer the full record type from a CollectionDef, including the auto-injected `id`. */
export type InferRecord<C> =
  C extends CollectionDef<infer F>
    ? { readonly id: string } & {
        readonly [K in keyof F]: InferFieldType<F[K]>;
      }
    : never;

/** A schema configuration mapping collection names to their definitions. */
export type SchemaConfig = Record<string, CollectionDef<CollectionFields>>;
