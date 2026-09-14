import type { NextRequest } from 'next/server';

import { constantTimeEqual } from '../crypto';
import { serverEnv } from '../env';
import { ApiError } from '../errors';

/**
 * Shared-secret authentication for scheduled work.
 *
 * Vercel Cron and Upstash QStash both present `Authorization: Bearer <secret>`.
 * The comparison is constant-time, and a deployment with no `CRON_SECRET`
 * refuses every call rather than running the job unauthenticated — an open
 * reconciliation endpoint is a free way to hammer the database.
 */
export async function assertCronRequest(request: NextRequest): Promise<void> {
  const secret = serverEnv().CRON_SECRET;
  if (!secret) throw ApiError.forbidden('CRON_SECRET is not configured.');

  const header = request.headers.get('authorization') ?? '';
  const presented = header.toLowerCase().startsWith('bearer ') ? header.slice(7).trim() : '';

  if (!presented || !(await constantTimeEqual(presented, secret))) {
    throw ApiError.unauthorized('درخواست زمان‌بندی‌شده معتبر نیست.');
  }
}
