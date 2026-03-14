import type { CollectionDef, CollectionFields } from "./collection.ts";
import type { FieldDef } from "./field.ts";

export type InferFieldType<F> = F extends FieldDef<infer T> ? T : never;

export type InferRecord<C> =
  C extends CollectionDef<infer F>
    ? { readonly id: string } & {
        readonly [K in keyof F]: InferFieldType<F[K]>;
      }
    : never;

export type SchemaConfig = Record<string, CollectionDef<CollectionFields>>;

export type IndexedFields<C> = C extends CollectionDef<infer _F> ? C["indices"][number] : never;
