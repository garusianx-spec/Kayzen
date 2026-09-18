import { toReadingPlanDto } from '@/lib/api/dto';
import { withAuthedRoute } from '@/lib/api/handler';
import { ensureReadingPlan } from '@/lib/domain/library';
import { updateReadingPlanSchema, type UpdateReadingPlanInput } from '@/lib/validation/schemas';
import type { ReadingPlanDto } from '@/types/domain';

/**
 * `PATCH /api/v1/library/plan` — the duration and the mode.
 *
 * Both are one-tap controls, so the route is a partial update rather than a
 * replace: switching to full-book mode must not silently reset a reader's
 * sixty-minute commitment back to the default.
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const PATCH = withAuthedRoute<UpdateReadingPlanInput, undefined, { plan: ReadingPlanDto }>({
  bodySchema: updateReadingPlanSchema,
  rateLimit: 'mutation',
  handler: async ({ body, user, db }) => {
    // Upsert first, so a reader who changes the duration before the hub has
    // ever loaded does not get a 404 for a row nobody has created yet.
    await ensureReadingPlan(db, user.id);

    const plan = await db.readingPlan.update({
      where: { userId: user.id },
      data: {
        ...(body.mode !== undefined ? { mode: body.mode } : {}),
        ...(body.dailyMinutes !== undefined ? { dailyMinutes: body.dailyMinutes } : {}),
      },
    });

    return { plan: toReadingPlanDto(plan) };
  },
});
