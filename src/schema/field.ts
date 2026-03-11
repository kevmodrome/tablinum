export type FieldKind = "string" | "number" | "boolean" | "json";

export interface FieldDef<out T = unknown> {
  readonly _tag: "FieldDef";
  readonly kind: FieldKind;
  readonly isOptional: boolean;
  readonly isArray: boolean;
  readonly _T?: T;
}

function make<T>(kind: FieldKind, isOptional: boolean, isArray: boolean): FieldDef<T> {
  return { _tag: "FieldDef", kind, isOptional, isArray };
}

export const field = {
  string: () => make<string>("string", false, false),
  number: () => make<number>("number", false, false),
  boolean: () => make<boolean>("boolean", false, false),
  json: () => make<unknown>("json", false, false),
  optional: <T>(inner: FieldDef<T>): FieldDef<T | undefined> =>
    make(inner.kind, true, inner.isArray),
  array: <T>(inner: FieldDef<T>): FieldDef<ReadonlyArray<T>> =>
    make(inner.kind, inner.isOptional, true),
};
