import { toHabitDto } from '@/lib/api/dto';
import { withAuthedRoute } from '@/lib/api/handler';
import { loadHabitsWithStreaks } from '@/lib/domain/habits';
import { evaluateStreak } from '@/lib/domain/streak-engine';
import { createHabitSchema, type CreateHabitInput } from '@/lib/validation/schemas';
import type { HabitDto } from '@/types/domain';

/** `GET /api/v1/habits` — list with live streaks, `POST` — create. */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = withAuthedRoute<undefined, undefined, { habits: HabitDto[] }>({
  rateLimit: 'read',
  handler: async ({ user, db }) => {
    const habits = await loadHabitsWithStreaks(db, {
      userId: user.id,
      timezone: user.timezone,
      dayStartHour: user.dayStartHour,
    });

    return { habits: habits.map((entry) => entry.dto) };
  },
});

export const POST = withAuthedRoute<CreateHabitInput, undefined, { habit: HabitDto }>({
  bodySchema: createHabitSchema,
  rateLimit: 'mutation',
  handler: async ({ body, user, db }) => {
    const habit = await db.habit.create({
      data: {
        userId: user.id,
        title: body.title,
        description: body.description ?? null,
        icon: body.icon,
        colorToken: body.colorToken,
        frequency: body.frequency,
        targetPerDay: body.targetPerDay,
        graceDaysAllowed: body.graceDaysAllowed,
      },
    });

    // A brand-new habit has no logs, so the streak evaluation is trivially zero
    // — but it still runs, so the response shape matches the list endpoint's.
    const streak = evaluateStreak({
      frequency: habit.frequency,
      targetPerDay: habit.targetPerDay,
      graceDaysAllowed: habit.graceDaysAllowed,
      logs: [],
      timezone: user.timezone,
      dayStartHour: user.dayStartHour,
      createdAt: habit.createdAt,
    });

    return { habit: toHabitDto(habit, streak) };
  },
});
