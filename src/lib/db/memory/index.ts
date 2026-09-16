import { createMemoryClient, type MemoryPrismaClient } from './client';
import { DEMO_PASSWORD, DEMO_PHONE, seedMemoryStore } from './seed';

export { MemoryStore } from './engine';
export { createMemoryClient } from './client';
export { seedMemoryStore, DEMO_PHONE, DEMO_PASSWORD } from './seed';

/**
 * The development database that needs no database.
 *
 * Built for the case where Postgres is not reachable at all — a blocked
 * outbound 5432, a laptop on a plane, a first clone before anyone has decided
 * where the data will live. The application above it is unchanged: the same
 * routes, the same Prisma calls, the same sign-in.
 *
 * It is not a second implementation of anything. `engine.ts` reads Prisma's own
 * DMMF, so the schema is the schema; `seed.ts` fills it with the 365-library
 * and one demo account. What is missing is stated in the banner below and in
 * `client.ts`: no row-level security, no rollback, no persistence.
 */

let client: MemoryPrismaClient | null = null;

export function memoryPrisma(): MemoryPrismaClient {
  if (client) return client;

  client = createMemoryClient(async (store) => {
    await seedMemoryStore(store);
    announce();
  });

  return client;
}

function announce(): void {
  const rule = '─'.repeat(64);

  console.warn(
    [
      '',
      rule,
      '  کایزن · in-memory database',
      '',
      '  No DATABASE_URL, so Postgres is not being used at all. Data lives in',
      '  this process and is gone when it restarts.',
      '',
      `  Demo account   ${DEMO_PHONE}`,
      `  Password       ${DEMO_PASSWORD}`,
      '  SMS code       printed by the console provider, or AUTH_DEV_OTP_CODE',
      '',
      '  Not simulated, and different from production:',
      '    · row-level security — Postgres enforces tenant isolation, this does not',
      '    · transactions do not roll back',
      '    · nothing is written to disk',
      '',
      '  Set DATABASE_URL (or DEV_DATABASE=postgres) to use a real database.',
      rule,
      '',
    ].join('\n'),
  );
}
