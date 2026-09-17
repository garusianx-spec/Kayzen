import type { Prisma } from '@prisma/client';

import { toTaskDto } from '@/lib/api/dto';
import { TASK_DETAIL_INCLUDE, checklistWrite } from '@/lib/domain/task-detail';
import { withAuthedRoute } from '@/lib/api/handler';
import { toJalaliDayKey } from '@/lib/date/jalali';
import {
  createTaskSchema,
  listTasksSchema,
  type CreateTaskInput,
  type ListTasksQuery,
} from '@/lib/validation/schemas';
import type { TaskDto } from '@/types/domain';

/**
 * `GET /api/v1/tasks` — list, `POST /api/v1/tasks` — create.
 *
 * `scope=today` resolves against the caller's timezone and day-start hour, both
 * of which ride in the access token, so "today" is the same day the UI is
 * drawing — even when the server sits in another hemisphere.
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = withAuthedRoute<undefined, ListTasksQuery, { tasks: TaskDto[] }>({
  querySchema: listTasksSchema,
  rateLimit: 'read',
  handler: async ({ query, user, db }) => {
    const now = new Date();
    const todayKey = toJalaliDayKey(now, user.timezone, user.dayStartHour);

    const where: Prisma.TaskWhereInput = { userId: user.id };
    if (query.status) where.status = query.status;
    if (query.dueJalali) where.dueJalali = query.dueJalali;

    switch (query.scope) {
      case 'today':
        where.dueJalali = query.dueJalali ?? todayKey;
        break;
      case 'upcoming':
        where.dueAt = { gt: now };
        where.status = query.status ?? { in: ['PENDING', 'IN_PROGRESS'] };
        break;
      case 'overdue':
        where.dueAt = { lt: now };
        where.status = query.status ?? { in: ['PENDING', 'IN_PROGRESS'] };
        break;
      case 'all':
        break;
    }

    const tasks = await db.task.findMany({
      where,
      orderBy: [{ status: 'asc' }, { priority: 'asc' }, { position: 'asc' }, { createdAt: 'desc' }],
      take: query.limit,
      include: TASK_DETAIL_INCLUDE,
    });

    return { tasks: tasks.map((task) => toTaskDto(task, now)) };
  },
});

export const POST = withAuthedRoute<CreateTaskInput, undefined, { task: TaskDto }>({
  bodySchema: createTaskSchema,
  rateLimit: 'mutation',
  handler: async ({ body, user, db }) => {
    // New tasks land at the top of their day; `position` is only ever compared
    // within one day's list, so a negative seed is fine and avoids re-indexing
    // every sibling row on each insert.
    const first = await db.task.findFirst({
      where: { userId: user.id, dueJalali: body.dueAt ? undefined : null },
      orderBy: { position: 'asc' },
      select: { position: true },
    });

    const task = await db.task.create({
      data: {
        userId: user.id,
        title: body.title,
        description: body.description ?? null,
        dueAt: body.dueAt ?? null,
        dueJalali: body.dueAt ? toJalaliDayKey(body.dueAt, user.timezone, user.dayStartHour) : null,
        priority: body.priority,
        difficulty: body.difficulty,
        recurrence: body.recurrence ?? null,
        estimatedPomodoros: body.estimatedPomodoros ?? null,
        tags: body.tags,
        position: (first?.position ?? 0) - 1,
        categoryId: body.categoryId ?? null,
        costAmount: body.costAmount ?? null,
        location: body.location ?? null,
        remindAt: body.remindAt ?? null,
        ...(body.checklist?.length
          ? { checklist: { createMany: { data: checklistWrite(body.checklist, [], user.id) } } }
          : {}),
      },
      include: TASK_DETAIL_INCLUDE,
    });

    return { task: toTaskDto(task) };
  },
});
