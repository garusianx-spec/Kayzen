import { toGoogleLinkDto } from '@/lib/api/dto';
import { withAuthedRoute } from '@/lib/api/handler';
import { googleOAuthConfig } from '@/lib/env';
import { ApiError } from '@/lib/errors';
import { drainCalendarQueue } from '@/lib/google/drain';
import { queueHealth } from '@/lib/google/sync-queue';
import type { GoogleLinkDto } from '@/types/domain';

/**
 * `POST /api/v1/integrations/google/sync` — the "force sync" button.
 *
 * Every mutation already drains the queue on its own, so this exists for one
 * situation: something got stuck and the person wants to see it move. Which
 * means it also has to *reset* the backoff — a job four attempts deep is an
 * hour from its next try, and a button that politely waits that hour is a
 * button that appears not to work.
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const POST = withAuthedRoute<undefined, undefined, { link: GoogleLinkDto }>({
  rateLimit: 'mutation',
  handler: async ({ user, db }) => {
    const account = await db.googleAccount.findUnique({ where: { userId: user.id } });
    if (!account) throw ApiError.notFound('حساب گوگلی وصل نیست.');

    // Deliberately including the ones that gave up: "force" means force.
    await db.calendarSyncJob.updateMany({
      where: { userId: user.id },
      data: { runAfter: new Date(), attempts: 0, lastError: null },
    });

    await drainCalendarQueue(db, user.id, user.timezone);

    const refreshed = await db.googleAccount.findUnique({ where: { userId: user.id } });
    if (!refreshed) throw ApiError.notFound('حساب گوگلی وصل نیست.');

    return {
      link: toGoogleLinkDto(
        refreshed,
        await queueHealth(db, user.id),
        googleOAuthConfig() !== null,
      ),
    };
  },
});
