import { PrismaClient } from '@prisma/client';

import { isProduction } from '../env';

/**
 * Prisma client singleton.
 *
 * Next.js dev-server hot reloads re-evaluate modules, which would otherwise open
 * a new pool on every edit until Postgres refuses connections. The instance is
 * parked on `globalThis` outside production to survive reloads.
 */

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma: PrismaClient =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: isProduction ? ['error', 'warn'] : ['error', 'warn', 'query'],
    errorFormat: isProduction ? 'minimal' : 'pretty',
  });

if (!isProduction) {
  globalForPrisma.prisma = prisma;
}

export { Prisma } from '@prisma/client';
export type { PrismaClient } from '@prisma/client';
