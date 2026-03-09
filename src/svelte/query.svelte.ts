import { Effect } from "effect";
import type { WhereClause, QueryBuilder, OrderByBuilder } from "../crud/query-builder.ts";
import { LiveQuery } from "./live-query.svelte.ts";

export type OnLiveCallback = (lq: LiveQuery<unknown>) => void;

export interface SvelteQueryBuilder<T> {
  readonly and: (fn: (item: T) => boolean) => SvelteQueryBuilder<T>;
  readonly sortBy: (field: string) => SvelteQueryBuilder<T>;
  readonly reverse: () => SvelteQueryBuilder<T>;
  readonly offset: (n: number) => SvelteQueryBuilder<T>;
  readonly limit: (n: number) => SvelteQueryBuilder<T>;
  readonly get: () => Promise<ReadonlyArray<T>>;
  readonly first: () => Promise<T | null>;
  readonly count: () => Promise<number>;
  readonly live: () => LiveQuery<T>;
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
  readonly live: () => LiveQuery<T>;
}

function wrapQueryBuilder<T>(
  builder: QueryBuilder<T>,
  onLive?: OnLiveCallback,
): SvelteQueryBuilder<T> {
  return {
    and: (fn) => wrapQueryBuilder(builder.and(fn), onLive),
    sortBy: (field) => wrapQueryBuilder(builder.sortBy(field), onLive),
    reverse: () => wrapQueryBuilder(builder.reverse(), onLive),
    offset: (n) => wrapQueryBuilder(builder.offset(n), onLive),
    limit: (n) => wrapQueryBuilder(builder.limit(n), onLive),
    get: () => Effect.runPromise(builder.get()),
    first: () => Effect.runPromise(builder.first()),
    count: () => Effect.runPromise(builder.count()),
    live: () => {
      const lq = new LiveQuery(builder.watch());
      onLive?.(lq as LiveQuery<unknown>);
      return lq;
    },
  };
}

export function wrapWhereClause<T>(
  clause: WhereClause<T>,
  onLive?: OnLiveCallback,
): SvelteWhereClause<T> {
  return {
    equals: (value) => wrapQueryBuilder(clause.equals(value), onLive),
    above: (value) => wrapQueryBuilder(clause.above(value), onLive),
    aboveOrEqual: (value) => wrapQueryBuilder(clause.aboveOrEqual(value), onLive),
    below: (value) => wrapQueryBuilder(clause.below(value), onLive),
    belowOrEqual: (value) => wrapQueryBuilder(clause.belowOrEqual(value), onLive),
    between: (lower, upper, options) =>
      wrapQueryBuilder(clause.between(lower, upper, options), onLive),
    startsWith: (prefix) => wrapQueryBuilder(clause.startsWith(prefix), onLive),
    anyOf: (values) => wrapQueryBuilder(clause.anyOf(values), onLive),
    noneOf: (values) => wrapQueryBuilder(clause.noneOf(values), onLive),
  };
}

export function wrapOrderByBuilder<T>(
  builder: OrderByBuilder<T>,
  onLive?: OnLiveCallback,
): SvelteOrderByBuilder<T> {
  return {
    reverse: () => wrapOrderByBuilder(builder.reverse(), onLive),
    offset: (n) => wrapOrderByBuilder(builder.offset(n), onLive),
    limit: (n) => wrapOrderByBuilder(builder.limit(n), onLive),
    get: () => Effect.runPromise(builder.get()),
    first: () => Effect.runPromise(builder.first()),
    count: () => Effect.runPromise(builder.count()),
    live: () => {
      const lq = new LiveQuery(builder.watch());
      onLive?.(lq as LiveQuery<unknown>);
      return lq;
    },
  };
}
