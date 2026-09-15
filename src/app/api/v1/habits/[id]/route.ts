import { withAuthedRoute } from '@/lib/api/handler';
import { loadHabitWithStreak } from '@/lib/domain/habits';
import { ApiError } from '@/lib/errors';
import { updateHabitSchema, uuidSchema } from '@/lib/validation/schemas';
import type { HabitDto } from '@/types/domain';
import type { z } from 'zod';

/** `PATCH|DELETE /api/v1/habits/:id`. */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type UpdateHabitInput = z.infer<typeof updateHabitSchema>;

export const PATCH = withAuthedRoute<UpdateHabitInput, undefined, { habit: HabitDto }>({
  bodySchema: updateHabitSchema,
  rateLimit: 'mutation',
  handler: async ({ body, params, user, db }) => {
    const id = uuidSchema.parse(params.id);

    const existing = await db.habit.findUnique({ where: { id } });
    if (!existing) throw ApiError.notFound('عادت موردنظر پیدا نشد.');

    await db.habit.update({
      where: { id },
      data: {
        ...(body.title !== undefined ? { title: body.title } : {}),
        ...(body.description !== undefined ? { description: body.description } : {}),
        ...(body.icon !== undefined ? { icon: body.icon } : {}),
        ...(body.colorToken !== undefined ? { colorToken: body.colorToken } : {}),
        ...(body.frequency !== undefined ? { frequency: body.frequency } : {}),
        ...(body.targetPerDay !== undefined ? { targetPerDay: body.targetPerDay } : {}),
        ...(body.graceDaysAllowed !== undefined ? { graceDaysAllowed: body.graceDaysAllowed } : {}),
        ...(body.archived !== undefined ? { archivedAt: body.archived ? new Date() : null } : {}),
      },
    });

    const reloaded = await loadHabitWithStreak(db, {
      habitId: id,
      userId: user.id,
      timezone: user.timezone,
      dayStartHour: user.dayStartHour,
    });

    if (!reloaded) throw ApiError.notFound('عادت موردنظر پیدا نشد.');
    return { habit: reloaded.dto };
  },
});

export const DELETE = withAuthedRoute<undefined, undefined, { id: string }>({
  rateLimit: 'mutation',
  handler: async ({ params, db }) => {
    const id = uuidSchema.parse(params.id);

    const deleted = await db.habit.deleteMany({ where: { id } });
    if (deleted.count === 0) throw ApiError.notFound('عادت موردنظر پیدا نشد.');

    return { id };
  },
});
