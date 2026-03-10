import { Effect } from "effect";
import type { WhereClause, QueryBuilder, OrderByBuilder } from "../crud/query-builder.ts";

export interface SvelteQueryBuilder<T> {
  readonly and: (fn: (item: T) => boolean) => SvelteQueryBuilder<T>;
  readonly sortBy: (field: string) => SvelteQueryBuilder<T>;
  readonly reverse: () => SvelteQueryBuilder<T>;
  readonly offset: (n: number) => SvelteQueryBuilder<T>;
  readonly limit: (n: number) => SvelteQueryBuilder<T>;
  readonly get: () => Promise<ReadonlyArray<T>>;
  readonly first: () => Promise<T | null>;
  readonly count: () => Promise<number>;
}

export interface SvelteWhereClause<T> {
  readonly equals: (value: string | number | boolean) => SvelteQueryBuilder<T>;
  readonly above: (value: number) => SvelteQueryBuilder<T>;
  readonly aboveOrEqual: (value: number) => SvelteQueryBuilder<T>;
  readonly below: (value: number) => SvelteQueryBuilder<T>;
  readonly belowOrEqual: (value: number) => SvelteQueryBuilder<T>;
  readonly between: (
    lower: number,
    upper: number,
    options?: { includeLower?: boolean; includeUpper?: boolean },
  ) => SvelteQueryBuilder<T>;
  readonly startsWith: (prefix: string) => SvelteQueryBuilder<T>;
  readonly anyOf: (values: ReadonlyArray<string | number | boolean>) => SvelteQueryBuilder<T>;
  readonly noneOf: (values: ReadonlyArray<string | number | boolean>) => SvelteQueryBuilder<T>;
}

export interface SvelteOrderByBuilder<T> {
  readonly reverse: () => SvelteOrderByBuilder<T>;
  readonly offset: (n: number) => SvelteOrderByBuilder<T>;
  readonly limit: (n: number) => SvelteOrderByBuilder<T>;
  readonly get: () => Promise<ReadonlyArray<T>>;
  readonly first: () => Promise<T | null>;
  readonly count: () => Promise<number>;
}

type TouchVersion = () => void;
type QueryFactory<T> = () => QueryBuilder<T>;
type WhereFactory<T> = () => WhereClause<T>;
type OrderByFactory<T> = () => OrderByBuilder<T>;

function wrapQueryBuilder<T>(
  getBuilder: QueryFactory<T>,
  touchVersion: TouchVersion,
  ready: Promise<void>,
): SvelteQueryBuilder<T> {
  return {
    and: (fn) => wrapQueryBuilder(() => getBuilder().and(fn), touchVersion, ready),
    sortBy: (field) => wrapQueryBuilder(() => getBuilder().sortBy(field), touchVersion, ready),
    reverse: () => wrapQueryBuilder(() => getBuilder().reverse(), touchVersion, ready),
    offset: (n) => wrapQueryBuilder(() => getBuilder().offset(n), touchVersion, ready),
    limit: (n) => wrapQueryBuilder(() => getBuilder().limit(n), touchVersion, ready),
    get: () => {
      touchVersion();
      return ready.then(() => Effect.runPromise(getBuilder().get()));
    },
    first: () => {
      touchVersion();
      return ready.then(() => Effect.runPromise(getBuilder().first()));
    },
    count: () => {
      touchVersion();
      return ready.then(() => Effect.runPromise(getBuilder().count()));
    },
  };
}

export function wrapWhereClause<T>(
  getClause: WhereFactory<T>,
  touchVersion: TouchVersion,
  ready: Promise<void>,
): SvelteWhereClause<T> {
  return {
    equals: (value) => wrapQueryBuilder(() => getClause().equals(value), touchVersion, ready),
    above: (value) => wrapQueryBuilder(() => getClause().above(value), touchVersion, ready),
    aboveOrEqual: (value) =>
      wrapQueryBuilder(() => getClause().aboveOrEqual(value), touchVersion, ready),
    below: (value) => wrapQueryBuilder(() => getClause().below(value), touchVersion, ready),
    belowOrEqual: (value) =>
      wrapQueryBuilder(() => getClause().belowOrEqual(value), touchVersion, ready),
    between: (lower, upper, options) =>
      wrapQueryBuilder(() => getClause().between(lower, upper, options), touchVersion, ready),
    startsWith: (prefix) =>
      wrapQueryBuilder(() => getClause().startsWith(prefix), touchVersion, ready),
    anyOf: (values) => wrapQueryBuilder(() => getClause().anyOf(values), touchVersion, ready),
    noneOf: (values) => wrapQueryBuilder(() => getClause().noneOf(values), touchVersion, ready),
  };
}

export function wrapOrderByBuilder<T>(
  getBuilder: OrderByFactory<T>,
  touchVersion: TouchVersion,
  ready: Promise<void>,
): SvelteOrderByBuilder<T> {
  return {
    reverse: () => wrapOrderByBuilder(() => getBuilder().reverse(), touchVersion, ready),
    offset: (n) => wrapOrderByBuilder(() => getBuilder().offset(n), touchVersion, ready),
    limit: (n) => wrapOrderByBuilder(() => getBuilder().limit(n), touchVersion, ready),
    get: () => {
      touchVersion();
      return ready.then(() => Effect.runPromise(getBuilder().get()));
    },
    first: () => {
      touchVersion();
      return ready.then(() => Effect.runPromise(getBuilder().first()));
    },
    count: () => {
      touchVersion();
      return ready.then(() => Effect.runPromise(getBuilder().count()));
    },
  };
}
