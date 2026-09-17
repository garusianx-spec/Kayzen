import { withAuthedRoute } from '@/lib/api/handler';
import { categoryMeta, resolveDeepLink } from '@/lib/domain/notifications';
import { listNotificationsSchema, type ListNotificationsQuery } from '@/lib/validation/schemas';
import type { NotificationDto } from '@/types/domain';

/**
 * `GET /api/v1/notifications` — the history, newest first.
 *
 * Read state lives on the row rather than in the client, because the history is
 * the same on the phone and on the desktop and a badge that disagrees between
 * them is worse than no badge.
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = withAuthedRoute<
  undefined,
  ListNotificationsQuery,
  { notifications: NotificationDto[]; unread: number }
>({
  querySchema: listNotificationsSchema,
  rateLimit: 'read',
  handler: async ({ query, user, db }) => {
    const rows = await db.notificationLog.findMany({
      where: {
        userId: user.id,
        ...(query.filter === 'unread' ? { readAt: null } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: query.limit,
    });

    const unread = await db.notificationLog.count({ where: { userId: user.id, readAt: null } });

    return {
      unread,
      notifications: rows.map((row) => {
        const meta = categoryMeta(row.category);

        return {
          id: row.id,
          category: row.category,
          categoryLabel: meta.label,
          icon: meta.icon,
          colorToken: meta.colorToken,
          title: row.title,
          body: row.body,
          href: resolveDeepLink(row.category, row.deepLink),
          read: row.readAt !== null,
          createdAt: row.createdAt.toISOString(),
        };
      }),
    };
  },
});
