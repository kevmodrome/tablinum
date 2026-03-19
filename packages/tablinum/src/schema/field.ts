export type FieldKind = "string" | "number" | "boolean" | "json" | "object";

export interface FieldDef<out T = unknown> {
  readonly _tag: "FieldDef";
  readonly kind: FieldKind;
  readonly isOptional: boolean;
  readonly isArray: boolean;
  readonly fields?: Record<string, FieldDef<unknown>>;
  readonly _T?: T;
}

function make<T>(
  kind: FieldKind,
  isOptional: boolean,
  isArray: boolean,
  fields?: Record<string, FieldDef<unknown>>,
): FieldDef<T> {
  return { _tag: "FieldDef", kind, isOptional, isArray, ...(fields !== undefined && { fields }) };
}

type LocalInferFieldType<F> = F extends FieldDef<infer T> ? T : never;

type RequiredFieldKeys<F extends Record<string, FieldDef<unknown>>> = {
  [K in keyof F]: undefined extends LocalInferFieldType<F[K]> ? never : K;
}[keyof F];

type OptionalFieldKeys<F extends Record<string, FieldDef<unknown>>> = {
  [K in keyof F]: undefined extends LocalInferFieldType<F[K]> ? K : never;
}[keyof F];

type InferFields<F extends Record<string, FieldDef<unknown>>> = {
  readonly [K in RequiredFieldKeys<F>]: F[K] extends FieldDef<infer T> ? T : never;
} & {
  readonly [K in OptionalFieldKeys<F>]?: F[K] extends FieldDef<infer T> ? T : never;
};

export const field = {
  string: () => make<string>("string", false, false),
  number: () => make<number>("number", false, false),
  boolean: () => make<boolean>("boolean", false, false),
  json: () => make<unknown>("json", false, false),
  object: <F extends Record<string, FieldDef<unknown>>>(fields: F): FieldDef<InferFields<F>> =>
    make("object", false, false, fields as Record<string, FieldDef<unknown>>),
  optional: <T>(inner: FieldDef<T>): FieldDef<T | undefined> =>
    make(inner.kind, true, inner.isArray, inner.fields),
  array: <T>(inner: FieldDef<T>): FieldDef<ReadonlyArray<T>> =>
    make(inner.kind, inner.isOptional, true, inner.fields),
};
