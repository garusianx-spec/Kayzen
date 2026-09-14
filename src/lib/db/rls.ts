import { Prisma, prisma } from './prisma';

/**
 * Tenant-scoped database access.
 *
 * Postgres RLS decides what a statement may touch by reading the
 * `app.current_user_id` setting (see `supabase/migrations/0002_*.sql`). That
 * setting has to be established inside the same transaction as the query, which
 * is what `withUserContext()` does:
 *
 *   1. open an interactive transaction (one pinned connection),
 *   2. `set_config(..., is_local => true)` so the value dies with the
 *      transaction and cannot leak to the next borrower of a pooled connection,
 *   3. run the caller's queries against the scoped client.
 *
 * Every tenant query in the application goes through here. A query issued on the
 * bare `prisma` client sees nothing, because `user_id = NULL` is never true —
 * the failure mode is an empty result, not a cross-tenant leak.
 */

/** The subset of the client that scoped callbacks are allowed to use. */
export type ScopedPrisma = Omit<
  Prisma.TransactionClient,
  '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'
>;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function withUserContext<T>(
  userId: string,
  callback: (tx: ScopedPrisma) => Promise<T>,
  options: { timeoutMs?: number; maxWaitMs?: number } = {},
): Promise<T> {
  // Defence in depth: the id always originates from a verified JWT subject, but
  // interpolating anything but a UUID into a `set_config` call is not a risk
  // worth carrying.
  if (!UUID_PATTERN.test(userId)) {
    throw new Error('withUserContext requires a valid UUID user id');
  }

  return prisma.$transaction(
    async (tx) => {
      await tx.$executeRaw`select set_config('app.current_user_id', ${userId}::text, true)`;
      return callback(tx);
    },
    {
      maxWait: options.maxWaitMs ?? 5_000,
      timeout: options.timeoutMs ?? 10_000,
      isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
    },
  );
}

/**
 * Unscoped access, for the two operations that legitimately have no tenant:
 * Telegram sign-up (the user row does not exist yet) and the nightly cron that
 * reconciles streaks across all tenants.
 *
 * Callers must filter by `user_id` themselves. Keep the surface small — every
 * use is a place where a bug becomes a cross-tenant leak.
 */
export async function asServiceRole<T>(
  reason: 'signup' | 'cron' | 'migration',
  callback: (client: typeof prisma) => Promise<T>,
): Promise<T> {
  void reason; // Retained for call-site documentation and log correlation.
  return callback(prisma);
}
