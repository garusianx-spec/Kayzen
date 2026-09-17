import { withAuthedRoute } from '@/lib/api/handler';
import { markReadSchema, type MarkReadInput } from '@/lib/validation/schemas';

/**
 * `POST /api/v1/notifications/read` — mark some, or all, as read.
 *
 * Idempotent, and scoped with `readAt: null` so re-marking a row does not move
 * the moment it was first read. Two devices opening the same notification
 * should not fight over when it happened.
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const POST = withAuthedRoute<MarkReadInput, undefined, { marked: number; unread: number }>({
  bodySchema: markReadSchema,
  rateLimit: 'mutation',
  handler: async ({ body, user, db }) => {
    const result = await db.notificationLog.updateMany({
      where: {
        userId: user.id,
        readAt: null,
        ...(body.ids?.length ? { id: { in: body.ids } } : {}),
      },
      data: { readAt: new Date() },
    });

    const unread = await db.notificationLog.count({ where: { userId: user.id, readAt: null } });

    return { marked: result.count, unread };
  },
});
