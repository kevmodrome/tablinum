import { Effect, Option, Ref, Stream } from "effect";
import type { IDBStorageHandle } from "../storage/idb.ts";
import type { StorageError, ValidationError } from "../errors.ts";
import { ValidationError as VE } from "../errors.ts";
import type { CollectionDef, CollectionFields } from "../schema/collection.ts";
import type { WatchContext } from "./watch.ts";

interface QueryPlan {
  readonly fieldName?: string | undefined;
  readonly filters: Array<(record: Record<string, unknown>) => boolean>;
  readonly orderBy?: { field: string; direction: "asc" | "desc" } | undefined;
  readonly offset?: number | undefined;
  readonly limit?: number | undefined;
  readonly indexQuery?:
    | { field: string; range: IDBKeyRange | IDBValidKey; type: "value" | "range" }
    | undefined;
}

function emptyPlan(): QueryPlan {
  return { filters: [] };
}

interface QueryContext {
  readonly storage: IDBStorageHandle;
  readonly watchCtx: WatchContext;
  readonly collectionName: string;
  readonly def: CollectionDef<CollectionFields>;
  readonly mapRecord: (record: Record<string, unknown>) => unknown;
}

function executeQuery<T>(
  ctx: QueryContext,
  plan: QueryPlan,
): Effect.Effect<ReadonlyArray<T>, StorageError | ValidationError> {
  return Effect.gen(function* () {
    if (plan.fieldName) {
      const fieldDef = ctx.def.fields[plan.fieldName];
      if (!fieldDef) {
        return yield* new VE({
          message: `Unknown field "${plan.fieldName}" in collection "${ctx.collectionName}"`,
          field: plan.fieldName,
        });
      }
      if (fieldDef.kind === "json" || fieldDef.isArray) {
        return yield* new VE({
          message: `Field "${plan.fieldName}" does not support filtering (type: ${fieldDef.kind}${fieldDef.isArray ? "[]" : ""})`,
          field: plan.fieldName,
        });
      }
    }

    let results: Record<string, unknown>[];
    if (plan.indexQuery && ctx.def.indices.includes(plan.indexQuery.field)) {
      if (plan.indexQuery.type === "value") {
        results = [
          ...(yield* ctx.storage.getByIndex(
            ctx.collectionName,
            plan.indexQuery.field,
            plan.indexQuery.range as IDBValidKey,
          )),
        ];
      } else {
        results = [
          ...(yield* ctx.storage.getByIndexRange(
            ctx.collectionName,
            plan.indexQuery.field,
            plan.indexQuery.range as IDBKeyRange,
          )),
        ];
      }
    } else if (
      plan.orderBy &&
      ctx.def.indices.includes(plan.orderBy.field) &&
      plan.filters.length === 0
    ) {
      results = [
        ...(yield* ctx.storage.getAllSorted(
          ctx.collectionName,
          plan.orderBy.field,
          plan.orderBy.direction === "desc" ? "prev" : "next",
        )),
      ];
    } else {
      results = [...(yield* ctx.storage.getAllRecords(ctx.collectionName))];
    }

    results = results.filter((r) => !r._deleted);

    for (const f of plan.filters) {
      results = results.filter(f);
    }

    if (plan.orderBy) {
      const alreadySorted =
        ctx.def.indices.includes(plan.orderBy.field) &&
        plan.filters.length === 0 &&
        !plan.indexQuery;
      if (!alreadySorted) {
        const { field, direction } = plan.orderBy;
        results = results.sort((a, b) => {
          const va = a[field] as string | number | boolean;
          const vb = b[field] as string | number | boolean;
          const cmp = va < vb ? -1 : va > vb ? 1 : 0;
          return direction === "desc" ? -cmp : cmp;
        });
      }
    }

    if (plan.offset) {
      results = results.slice(plan.offset);
    }

    if (plan.limit !== null && plan.limit !== undefined) {
      results = results.slice(0, plan.limit);
    }

    return results.map(ctx.mapRecord) as ReadonlyArray<T>;
  });
}

function watchQuery<T>(
  ctx: QueryContext,
  plan: QueryPlan,
): Stream.Stream<ReadonlyArray<T>, StorageError | ValidationError> {
  const query = () => executeQuery<T>(ctx, plan);

  const changes = Stream.fromPubSub(ctx.watchCtx.pubsub).pipe(
    Stream.filter((event) => event.collection === ctx.collectionName),
    Stream.mapEffect(() =>
      Effect.gen(function* () {
        const replaying = yield* Ref.get(ctx.watchCtx.replayingRef);
        if (replaying) return undefined;
        return yield* query();
      }),
    ),
    Stream.filter((result): result is ReadonlyArray<T> => result !== undefined),
  );

  return Stream.unwrap(
    Effect.gen(function* () {
      const initial = yield* query();
      return Stream.concat(Stream.make(initial), changes);
    }),
  );
}

export interface WhereClause<T> {
  readonly equals: (value: string | number | boolean) => QueryBuilder<T>;
  readonly above: (value: number) => QueryBuilder<T>;
  readonly aboveOrEqual: (value: number) => QueryBuilder<T>;
  readonly below: (value: number) => QueryBuilder<T>;
  readonly belowOrEqual: (value: number) => QueryBuilder<T>;
  readonly between: (
    lower: number,
    upper: number,
    options?: { includeLower?: boolean; includeUpper?: boolean },
  ) => QueryBuilder<T>;
  readonly startsWith: (prefix: string) => QueryBuilder<T>;
  readonly anyOf: (values: ReadonlyArray<string | number | boolean>) => QueryBuilder<T>;
  readonly noneOf: (values: ReadonlyArray<string | number | boolean>) => QueryBuilder<T>;
}

export interface QueryBuilder<T> {
  readonly and: (fn: (item: T) => boolean) => QueryBuilder<T>;
  readonly sortBy: (field: string) => QueryBuilder<T>;
  readonly reverse: () => QueryBuilder<T>;
  readonly offset: (n: number) => QueryBuilder<T>;
  readonly limit: (n: number) => QueryBuilder<T>;
  readonly get: () => Effect.Effect<ReadonlyArray<T>, StorageError | ValidationError>;
  readonly first: () => Effect.Effect<Option.Option<T>, StorageError | ValidationError>;
  readonly count: () => Effect.Effect<number, StorageError | ValidationError>;
  readonly watch: () => Stream.Stream<ReadonlyArray<T>, StorageError | ValidationError>;
}

export type OrderByBuilder<T> = QueryBuilder<T>;

function makeQueryBuilder<T>(ctx: QueryContext, plan: QueryPlan): QueryBuilder<T> {
  return {
    and: (fn) =>
      makeQueryBuilder(ctx, {
        ...plan,
        filters: [...plan.filters, (r) => fn(ctx.mapRecord(r) as T)],
      }),
    sortBy: (field) =>
      makeQueryBuilder(ctx, {
        ...plan,
        orderBy: { field, direction: plan.orderBy?.direction ?? "asc" },
      }),
    reverse: () =>
      makeQueryBuilder(ctx, {
        ...plan,
        orderBy: {
          field: plan.orderBy?.field ?? "id",
          direction: plan.orderBy?.direction === "desc" ? "asc" : "desc",
        },
      }),
    offset: (n) => makeQueryBuilder(ctx, { ...plan, offset: n }),
    limit: (n) => makeQueryBuilder(ctx, { ...plan, limit: n }),
    get: () => executeQuery<T>(ctx, plan),
    first: () =>
      Effect.map(executeQuery<T>(ctx, { ...plan, limit: 1 }), (results) =>
        results.length > 0 ? Option.some(results[0] as T) : Option.none(),
      ),
    count: () => Effect.map(executeQuery<T>(ctx, plan), (results) => results.length),
    watch: () => watchQuery<T>(ctx, plan),
  };
}

export function createWhereClause<T>(
  storage: IDBStorageHandle,
  watchCtx: WatchContext,
  collectionName: string,
  def: CollectionDef<CollectionFields>,
  fieldName: string,
  mapRecord: (record: Record<string, unknown>) => T,
): WhereClause<T> {
  const ctx: QueryContext = { storage, watchCtx, collectionName, def, mapRecord };
  const fieldDef = def.fields[fieldName];
  const isIndexed =
    def.indices.includes(fieldName) &&
    fieldDef !== null &&
    fieldDef !== undefined &&
    fieldDef.kind !== "boolean";

  const withFilter = (
    filterFn: (record: Record<string, unknown>) => boolean,
    indexQuery?: QueryPlan["indexQuery"],
  ): QueryBuilder<T> => {
    const plan: QueryPlan = {
      ...emptyPlan(),
      fieldName,
      filters: [filterFn],
      indexQuery,
    };
    return makeQueryBuilder(ctx, plan);
  };

  return {
    equals: (value) =>
      withFilter(
        (r) => r[fieldName] === value,
        isIndexed ? { field: fieldName, range: value as IDBValidKey, type: "value" } : undefined,
      ),

    above: (value) =>
      withFilter(
        (r) => (r[fieldName] as number) > value,
        isIndexed
          ? { field: fieldName, range: IDBKeyRange.lowerBound(value, true), type: "range" }
          : undefined,
      ),

    aboveOrEqual: (value) =>
      withFilter(
        (r) => (r[fieldName] as number) >= value,
        isIndexed
          ? { field: fieldName, range: IDBKeyRange.lowerBound(value, false), type: "range" }
          : undefined,
      ),

    below: (value) =>
      withFilter(
        (r) => (r[fieldName] as number) < value,
        isIndexed
          ? { field: fieldName, range: IDBKeyRange.upperBound(value, true), type: "range" }
          : undefined,
      ),

    belowOrEqual: (value) =>
      withFilter(
        (r) => (r[fieldName] as number) <= value,
        isIndexed
          ? { field: fieldName, range: IDBKeyRange.upperBound(value, false), type: "range" }
          : undefined,
      ),

    between: (lower, upper, options) => {
      const includeLower = options?.includeLower ?? true;
      const includeUpper = options?.includeUpper ?? true;
      return withFilter(
        (r) => {
          const v = r[fieldName] as number;
          const aboveLower = includeLower ? v >= lower : v > lower;
          const belowUpper = includeUpper ? v <= upper : v < upper;
          return aboveLower && belowUpper;
        },
        isIndexed
          ? {
              field: fieldName,
              range: IDBKeyRange.bound(lower, upper, !includeLower, !includeUpper),
              type: "range",
            }
          : undefined,
      );
    },

    startsWith: (prefix) =>
      withFilter(
        (r) => typeof r[fieldName] === "string" && (r[fieldName] as string).startsWith(prefix),
        isIndexed
          ? {
              field: fieldName,
              range: IDBKeyRange.bound(prefix, prefix + "\uffff", false, false),
              type: "range",
            }
          : undefined,
      ),

    anyOf: (values) => {
      const set = new Set(values);
      return withFilter((r) => set.has(r[fieldName] as string | number | boolean));
    },

    noneOf: (values) => {
      const set = new Set(values);
      return withFilter((r) => !set.has(r[fieldName] as string | number | boolean));
    },
  };
}

export function createOrderByBuilder<T>(
  storage: IDBStorageHandle,
  watchCtx: WatchContext,
  collectionName: string,
  def: CollectionDef<CollectionFields>,
  fieldName: string,
  mapRecord: (record: Record<string, unknown>) => T,
): QueryBuilder<T> {
  const ctx: QueryContext = { storage, watchCtx, collectionName, def, mapRecord };
  const plan: QueryPlan = {
    ...emptyPlan(),
    orderBy: { field: fieldName, direction: "asc" },
  };
  return makeQueryBuilder(ctx, plan);
}
