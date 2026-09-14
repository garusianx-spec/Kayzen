import { toTaskDto } from '@/lib/api/dto';
import { withAuthedRoute } from '@/lib/api/handler';
import { toJalaliDayKey } from '@/lib/date/jalali';
import { ApiError } from '@/lib/errors';
import { updateTaskSchema, uuidSchema, type UpdateTaskInput } from '@/lib/validation/schemas';
import type { TaskDto } from '@/types/domain';

/** `PATCH|DELETE /api/v1/tasks/:id`. */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const PATCH = withAuthedRoute<UpdateTaskInput, undefined, { task: TaskDto }>({
  bodySchema: updateTaskSchema,
  rateLimit: 'mutation',
  handler: async ({ body, params, user, db }) => {
    const id = uuidSchema.parse(params.id);

    // RLS would already hide another tenant's row, but reading first turns a
    // cross-tenant write into a clean 404 instead of a Prisma exception.
    const existing = await db.task.findUnique({ where: { id } });
    if (!existing) throw ApiError.notFound('کار موردنظر پیدا نشد.');

    const completing = body.status === 'COMPLETED' && existing.status !== 'COMPLETED';

    const task = await db.task.update({
      where: { id },
      data: {
        ...(body.title !== undefined ? { title: body.title } : {}),
        ...(body.description !== undefined ? { description: body.description } : {}),
        ...(body.dueAt !== undefined
          ? {
              dueAt: body.dueAt,
              dueJalali: body.dueAt
                ? toJalaliDayKey(body.dueAt, user.timezone, user.dayStartHour)
                : null,
            }
          : {}),
        ...(body.priority !== undefined ? { priority: body.priority } : {}),
        ...(body.difficulty !== undefined ? { difficulty: body.difficulty } : {}),
        ...(body.status !== undefined ? { status: body.status } : {}),
        ...(body.recurrence !== undefined ? { recurrence: body.recurrence } : {}),
        ...(body.estimatedPomodoros !== undefined
          ? { estimatedPomodoros: body.estimatedPomodoros }
          : {}),
        ...(body.tags !== undefined ? { tags: body.tags } : {}),
        ...(body.position !== undefined ? { position: body.position } : {}),
        ...(completing ? { completedAt: new Date() } : {}),
        ...(body.status !== undefined && body.status !== 'COMPLETED' ? { completedAt: null } : {}),
      },
    });

    return { task: toTaskDto(task) };
  },
});

export const DELETE = withAuthedRoute<undefined, undefined, { id: string }>({
  rateLimit: 'mutation',
  handler: async ({ params, db }) => {
    const id = uuidSchema.parse(params.id);

    const deleted = await db.task.deleteMany({ where: { id } });
    if (deleted.count === 0) throw ApiError.notFound('کار موردنظر پیدا نشد.');

    return { id };
  },
});
