import { withAuthedRoute } from '@/lib/api/handler';
import { NOTIFICATION_CATEGORIES, categoryMeta, isEnabled } from '@/lib/domain/notifications';
import { ApiError } from '@/lib/errors';
import {
  notificationPreferenceSchema,
  type NotificationPreferenceInput,
} from '@/lib/validation/schemas';
import type { NotificationPreferenceDto } from '@/types/domain';

/**
 * `GET|PATCH /api/v1/notifications/preferences` — the category switches.
 *
 * GET returns every category whether or not a row exists for it, resolved
 * through the same default the delivery path uses. A settings screen that only
 * listed the categories somebody had already touched would be a list that grows
 * as you use it, which is not a settings screen.
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = withAuthedRoute<
  undefined,
  undefined,
  { preferences: NotificationPreferenceDto[] }
>({
  rateLimit: 'read',
  handler: async ({ user, db }) => {
    const rows = await db.notificationPreference.findMany({ where: { userId: user.id } });
    const stored = new Map(rows.map((row) => [row.category, row.enabled]));

    return {
      preferences: NOTIFICATION_CATEGORIES.map((meta) => ({
        category: meta.category,
        label: meta.label,
        description: meta.description,
        icon: meta.icon,
        colorToken: meta.colorToken,
        enabled: isEnabled(meta.category, stored),
        togglable: meta.togglable,
      })),
    };
  },
});

export const PATCH = withAuthedRoute<
  NotificationPreferenceInput,
  undefined,
  { category: string; enabled: boolean }
>({
  bodySchema: notificationPreferenceSchema,
  rateLimit: 'mutation',
  handler: async ({ body, user, db }) => {
    if (!categoryMeta(body.category).togglable) {
      throw ApiError.unprocessable('این دسته را نمی‌شود خاموش کرد.');
    }

    const existing = await db.notificationPreference.findFirst({
      where: { userId: user.id, category: body.category },
    });

    if (existing) {
      await db.notificationPreference.update({
        where: { id: existing.id },
        data: { enabled: body.enabled },
      });
    } else {
      await db.notificationPreference.create({
        data: { userId: user.id, category: body.category, enabled: body.enabled },
      });
    }

    return { category: body.category, enabled: body.enabled };
  },
});
