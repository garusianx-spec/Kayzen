import { Prisma } from '@prisma/client';

import { MemoryStore, type FindArgs } from './engine';

/**
 * A `PrismaClient`-shaped object backed by `MemoryStore`.
 *
 * The delegate for every model is generated from the DMMF, so this covers the
 * whole schema rather than the handful of models someone remembered to add.
 *
 * What it deliberately does **not** do:
 *
 *  - **Row-level security.** `withUserContext()` sets `app.current_user_id` and
 *    Postgres enforces the rest; here the `set_config` statement is a no-op.
 *    Application code passes `userId` in its own `where` clauses regardless —
 *    RLS is defence in depth, not the only depth — so queries return the same
 *    rows. It does mean a missing `userId` filter, which production would catch
 *    as an empty result, goes unnoticed here.
 *  - **Rollback.** `$transaction` runs its work and keeps whatever it wrote. A
 *    failure mid-transaction leaves the earlier writes in place.
 *  - **Durability.** Everything lives in one process and is gone when it exits.
 *
 * All three are stated out loud at startup, because a developer who forgets
 * which of these is the fake will eventually chase a bug that only exists here.
 */

type Row = Record<string, unknown>;

interface DelegateArgs extends FindArgs {
  data?: Row;
  create?: Row;
  update?: Row;
}

function notFound(model: string, operation: string): never {
  throw new Prisma.PrismaClientKnownRequestError(
    `An operation failed because it depends on one or more records that were required but not found. (${model}.${operation})`,
    { code: 'P2025', clientVersion: Prisma.prismaVersion.client },
  );
}

function delegateFor(store: MemoryStore, model: string, ready: Promise<void>) {
  const operations = {
    findUnique: (args: DelegateArgs) => store.find(model, { ...args, take: 1 })[0] ?? null,

    findUniqueOrThrow: (args: DelegateArgs) =>
      store.find(model, { ...args, take: 1 })[0] ?? notFound(model, 'findUniqueOrThrow'),

    findFirst: (args: DelegateArgs = {}) => store.find(model, { ...args, take: 1 })[0] ?? null,

    findFirstOrThrow: (args: DelegateArgs = {}) =>
      store.find(model, { ...args, take: 1 })[0] ?? notFound(model, 'findFirstOrThrow'),

    findMany: (args: DelegateArgs = {}) => store.find(model, args),

    create: (args: DelegateArgs) => store.create(model, { ...args, data: args.data ?? {} }),

    update: (args: DelegateArgs) =>
      store.update(model, { ...args, where: args.where ?? {}, data: args.data ?? {} }) ??
      notFound(model, 'update'),

    updateMany: (args: DelegateArgs) => ({
      count: store.updateMany(model, { where: args.where, data: args.data ?? {} }),
    }),

    upsert: (args: DelegateArgs) => {
      const updated = store.update(model, {
        ...args,
        where: args.where ?? {},
        data: args.update ?? {},
      });

      if (updated) return updated;

      // `where` carries the identity the caller is upserting on, and for a
      // composite key that identity is not repeated inside `create`.
      return store.create(model, { ...args, data: { ...flatten(args.where), ...args.create } });
    },

    delete: (args: DelegateArgs) =>
      store.delete(model, { where: args.where ?? {} }) ?? notFound(model, 'delete'),

    deleteMany: (args: DelegateArgs = {}) => ({
      count: store.deleteMany(model, { where: args.where }),
    }),

    count: (args: DelegateArgs = {}) => store.count(model, { where: args.where }),
  };

  // The store itself is synchronous; the seed that fills it is not, because it
  // hashes the demo account's password. Waiting here rather than at every call
  // site keeps that entirely inside the fake.
  return Object.fromEntries(
    Object.entries(operations).map(([name, run]) => [
      name,
      async (args: DelegateArgs = {}) => {
        await ready;
        return (run as (input: DelegateArgs) => unknown)(args);
      },
    ]),
  );
}

/** Lifts `{ userId_bookId: { userId, bookId } }` back into plain fields. */
function flatten(where: Record<string, unknown> | undefined): Row {
  const result: Row = {};

  for (const [key, value] of Object.entries(where ?? {})) {
    if (
      typeof value === 'object' &&
      value !== null &&
      !(value instanceof Date) &&
      !Array.isArray(value) &&
      key.includes('_')
    ) {
      Object.assign(result, value);
      continue;
    }

    result[key] = value;
  }

  return result;
}

export interface MemoryPrismaClient {
  readonly store: MemoryStore;
  [model: string]: unknown;
}

export function createMemoryClient(
  seed?: (store: MemoryStore) => Promise<void>,
): MemoryPrismaClient {
  const store = new MemoryStore();
  const ready = seed ? seed(store) : Promise.resolve();

  const client: Record<string, unknown> = {
    store,

    // `withUserContext()` opens one of these per tenant query.
    $transaction: async (work: unknown) => {
      await ready;

      if (typeof work === 'function') {
        return (work as (tx: unknown) => Promise<unknown>)(client);
      }

      // The array form: the delegates above are eager, so by the time this runs
      // the promises have already been issued. Awaiting them in order preserves
      // the sequencing the caller asked for, which is all this form guarantees
      // anywhere without a rollback.
      return Promise.all(work as Array<Promise<unknown>>);
    },

    // The only raw statement the application issues is the RLS `set_config`,
    // which has nothing to configure here.
    $executeRaw: async () => 0,
    $executeRawUnsafe: async () => 0,
    $queryRaw: async () => [],
    $queryRawUnsafe: async () => [],

    $connect: async () => undefined,
    $disconnect: async () => undefined,
    $on: () => undefined,
    $use: () => undefined,
    $extends: () => client,
  };

  for (const model of Prisma.dmmf.datamodel.models) {
    // `User` → `user`, matching the property Prisma generates.
    const property = model.name.charAt(0).toLowerCase() + model.name.slice(1);
    client[property] = delegateFor(store, model.name, ready);
  }

  return client as MemoryPrismaClient;
}
