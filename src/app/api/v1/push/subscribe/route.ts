import { withAuthedRoute } from '@/lib/api/handler';
import { pushSubscriptionSchema, type PushSubscriptionInput } from '@/lib/validation/schemas';
import { z } from 'zod';

/**
 * `POST /api/v1/push/subscribe` — register this device for reminders.
 * `DELETE` — unregister it.
 *
 * One row per browser profile / installed TWA. The endpoint is unique, so a
 * re-subscribe after a permission reset updates the existing row rather than
 * accumulating dead endpoints that the cron would keep trying.
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const unsubscribeSchema = z.object({ endpoint: z.string().url().max(1000) });

type UnsubscribeInput = z.infer<typeof unsubscribeSchema>;

export const POST = withAuthedRoute<PushSubscriptionInput, undefined, { id: string }>({
  bodySchema: pushSubscriptionSchema,
  rateLimit: 'mutation',
  handler: async ({ body, request, user, db }) => {
    const subscription = await db.pushSubscription.upsert({
      where: { endpoint: body.endpoint },
      create: {
        userId: user.id,
        endpoint: body.endpoint,
        p256dh: body.keys.p256dh,
        auth: body.keys.auth,
        userAgent: request.headers.get('user-agent')?.slice(0, 300) ?? null,
      },
      update: {
        userId: user.id,
        p256dh: body.keys.p256dh,
        auth: body.keys.auth,
        failedAt: null,
      },
    });

    return { id: subscription.id };
  },
});

export const DELETE = withAuthedRoute<UnsubscribeInput, undefined, { removed: number }>({
  bodySchema: unsubscribeSchema,
  rateLimit: 'mutation',
  handler: async ({ body, db }) => {
    const removed = await db.pushSubscription.deleteMany({ where: { endpoint: body.endpoint } });
    return { removed: removed.count };
  },
});
