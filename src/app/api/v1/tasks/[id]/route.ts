import { toTaskDto } from '@/lib/api/dto';
import { TASK_DETAIL_INCLUDE, checklistWrite } from '@/lib/domain/task-detail';
import { withAuthedRoute } from '@/lib/api/handler';
import { toJalaliDayKey } from '@/lib/date/jalali';
import { syncToCalendar } from '@/lib/google/auto-sync';
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
    const existing = await db.task.findUnique({
      where: { id },
      include: { checklist: { select: { id: true, completedAt: true } } },
    });
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
        ...(body.categoryId !== undefined ? { categoryId: body.categoryId } : {}),
        ...(body.costAmount !== undefined ? { costAmount: body.costAmount } : {}),
        ...(body.location !== undefined ? { location: body.location } : {}),
        ...(body.remindAt !== undefined ? { remindAt: body.remindAt } : {}),
        ...(completing ? { completedAt: new Date() } : {}),
        ...(body.status !== undefined && body.status !== 'COMPLETED' ? { completedAt: null } : {}),
        // Replaced wholesale — see `checklistWrite` for why, and for how a
        // line that was already ticked keeps the moment it was ticked.
        ...(body.checklist !== undefined
          ? {
              checklist: {
                deleteMany: {},
                createMany: { data: checklistWrite(body.checklist, existing.checklist, user.id) },
              },
            }
          : {}),
      },
      include: TASK_DETAIL_INCLUDE,
    });

    // An UPSERT even when the edit completes the task: `taskEvent` returns
    // null for a finished task, and the drain turns that into a delete. One
    // operation, one place that decides what belongs on a calendar.
    await syncToCalendar(db, {
      userId: user.id,
      entity: 'TASK',
      entityId: task.id,
      operation: 'UPSERT',
      googleEventId: task.googleEventId,
    });

    return { task: toTaskDto(task) };
  },
});

export const DELETE = withAuthedRoute<undefined, undefined, { id: string }>({
  rateLimit: 'mutation',
  handler: async ({ params, user, db }) => {
    const id = uuidSchema.parse(params.id);

    // Read before delete: the mirror id has to be captured while the row still
    // exists, because the job that removes the event outlives the task.
    const existing = await db.task.findUnique({
      where: { id },
      select: { googleEventId: true },
    });
    if (!existing) throw ApiError.notFound('کار موردنظر پیدا نشد.');

    await db.task.deleteMany({ where: { id } });

    await syncToCalendar(db, {
      userId: user.id,
      entity: 'TASK',
      entityId: id,
      operation: 'DELETE',
      googleEventId: existing.googleEventId,
    });

    return { id };
  },
});
