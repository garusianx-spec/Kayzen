import { toTaskDto } from '@/lib/api/dto';
import { withAuthedRoute } from '@/lib/api/handler';
import { toJalaliDayKey } from '@/lib/date/jalali';
import { pointsForTask } from '@/lib/domain/points';
import { nextOccurrence, parseRecurrence } from '@/lib/domain/recurrence';
import { ApiError } from '@/lib/errors';
import { uuidSchema } from '@/lib/validation/schemas';
import type { TaskDto } from '@/types/domain';

/**
 * `POST /api/v1/tasks/:id/complete` — tick a task off.
 *
 * Three things happen together, in one transaction, because a client that is
 * about to go offline must not be able to observe half of them:
 *
 *   1. the task closes and earns points (difficulty × priority, with a small
 *      punctuality bonus for beating the due date),
 *   2. a recurring task materialises its next instance — one at a time, rather
 *      than expanding the whole series up front,
 *   3. the user's point total moves.
 *
 * `DELETE` undoes the completion, including the points, so an accidental tap on
 * a phone in a pocket is not a permanent score.
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface CompleteResponse {
  task: TaskDto;
  /** The instance created for a recurring task, when there is one. */
  nextTask: TaskDto | null;
  pointsAwarded: number;
  totalPoints: number;
}

export const POST = withAuthedRoute<undefined, undefined, CompleteResponse>({
  rateLimit: 'mutation',
  handler: async ({ params, user, db }) => {
    const id = uuidSchema.parse(params.id);
    const now = new Date();

    const existing = await db.task.findUnique({ where: { id } });
    if (!existing) throw ApiError.notFound('کار موردنظر پیدا نشد.');

    if (existing.status === 'COMPLETED') {
      const account = await db.user.findUniqueOrThrow({ where: { id: user.id } });
      return {
        task: toTaskDto(existing, now),
        nextTask: null,
        pointsAwarded: 0,
        totalPoints: account.points,
      };
    }

    const completedOnTime = existing.dueAt === null || existing.dueAt >= now;
    const pointsAwarded = pointsForTask({
      difficulty: existing.difficulty,
      priority: existing.priority,
      completedOnTime,
    });

    const task = await db.task.update({
      where: { id },
      data: { status: 'COMPLETED', completedAt: now },
    });

    const rule = parseRecurrence(existing.recurrence);
    const nextDueAt = rule ? nextOccurrence(rule, existing.dueAt ?? now, user.timezone) : null;

    const nextTask = nextDueAt
      ? await db.task.create({
          data: {
            userId: user.id,
            title: existing.title,
            description: existing.description,
            dueAt: nextDueAt,
            dueJalali: toJalaliDayKey(nextDueAt, user.timezone, user.dayStartHour),
            priority: existing.priority,
            difficulty: existing.difficulty,
            recurrence: existing.recurrence,
            estimatedPomodoros: existing.estimatedPomodoros,
            tags: existing.tags,
            position: existing.position,
          },
        })
      : null;

    const account = await db.user.update({
      where: { id: user.id },
      data: { points: { increment: pointsAwarded } },
    });

    return {
      task: toTaskDto(task, now),
      nextTask: nextTask ? toTaskDto(nextTask, now) : null,
      pointsAwarded,
      totalPoints: account.points,
    };
  },
});

export const DELETE = withAuthedRoute<undefined, undefined, CompleteResponse>({
  rateLimit: 'mutation',
  handler: async ({ params, user, db }) => {
    const id = uuidSchema.parse(params.id);

    const existing = await db.task.findUnique({ where: { id } });
    if (!existing) throw ApiError.notFound('کار موردنظر پیدا نشد.');

    if (existing.status !== 'COMPLETED') {
      const account = await db.user.findUniqueOrThrow({ where: { id: user.id } });
      return {
        task: toTaskDto(existing),
        nextTask: null,
        pointsAwarded: 0,
        totalPoints: account.points,
      };
    }

    const refund = pointsForTask({
      difficulty: existing.difficulty,
      priority: existing.priority,
      completedOnTime:
        existing.dueAt === null ||
        existing.completedAt === null ||
        existing.dueAt >= existing.completedAt,
    });

    const task = await db.task.update({
      where: { id },
      data: { status: 'PENDING', completedAt: null },
    });

    const account = await db.user.update({
      where: { id: user.id },
      // `max(0, …)` in SQL would need a raw query; clamping here is enough
      // because the decrement can only ever exceed the balance if points were
      // spent elsewhere, which nothing does yet.
      data: { points: { decrement: refund } },
    });

    const totalPoints = Math.max(0, account.points);
    if (account.points < 0) {
      await db.user.update({ where: { id: user.id }, data: { points: 0 } });
    }

    return { task: toTaskDto(task), nextTask: null, pointsAwarded: -refund, totalPoints };
  },
});
