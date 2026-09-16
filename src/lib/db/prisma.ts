import { PrismaClient } from '@prisma/client';

import { isProduction, usesMemoryDatabase } from '../env';
import { memoryPrisma } from './memory';

/**
 * Prisma client singleton.
 *
 * Next.js dev-server hot reloads re-evaluate modules, which would otherwise open
 * a new pool on every edit until Postgres refuses connections. The instance is
 * parked on `globalThis` outside production to survive reloads.
 *
 * Outside production, and only there, an absent `DATABASE_URL` selects the
 * in-memory store in `./memory` instead — same interface, no socket. This is the
 * single place that decision is made, so nothing downstream has to know which
 * one it is talking to.
 */

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

function createClient(): PrismaClient {
  if (usesMemoryDatabase()) {
    // Structurally compatible where the application touches it, and checked by
    // the same DMMF the real client is generated from. The assertion is the
    // seam; everything above this line is written against `PrismaClient`.
    return memoryPrisma() as unknown as PrismaClient;
  }

  return new PrismaClient({
    log: isProduction ? ['error', 'warn'] : ['error', 'warn', 'query'],
    errorFormat: isProduction ? 'minimal' : 'pretty',
  });
}

export const prisma: PrismaClient = globalForPrisma.prisma ?? createClient();

if (!isProduction) {
  globalForPrisma.prisma = prisma;
}

export { Prisma } from '@prisma/client';
export type { PrismaClient } from '@prisma/client';
