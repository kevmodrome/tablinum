import type { CollectionDef, CollectionFields } from "./collection.ts";
import type { FieldDef } from "./field.ts";

export type InferFieldType<F> = F extends FieldDef<infer T> ? T : never;

type RequiredKeys<F> = {
  [K in keyof F]: undefined extends InferFieldType<F[K]> ? never : K;
}[keyof F];

type OptionalKeys<F> = {
  [K in keyof F]: undefined extends InferFieldType<F[K]> ? K : never;
}[keyof F];

type Prettify<T> = { [K in keyof T]: T[K] } & {};

export type InferRecord<C> =
  C extends CollectionDef<infer F>
    ? Prettify<
        { readonly id: string } & {
          readonly [K in RequiredKeys<F>]: InferFieldType<F[K]>;
        } & {
          readonly [K in OptionalKeys<F>]?: InferFieldType<F[K]>;
        }
      >
    : never;

export type SchemaConfig = Record<string, CollectionDef<CollectionFields>>;

export type IndexedFields<C> = C extends CollectionDef<infer _F> ? C["indices"][number] : never;
