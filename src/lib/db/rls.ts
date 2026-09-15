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
 * There is deliberately no `asServiceRole()` helper here.
 *
 * Three code paths legitimately run without a tenant context — OTP sign-in,
 * refresh-token rotation, and the reconciliation cron — and each one imports the
 * bare `prisma` client directly, next to the RLS policy that permits it
 * (`supabase/migrations/0002_row_level_security.sql`). A helper with a
 * reassuring name would make those three call sites look like four hundred
 * possible ones, and "service role" would be a lie: the runtime connects as
 * `kayzen_app`, which cannot bypass RLS at all.
 */
