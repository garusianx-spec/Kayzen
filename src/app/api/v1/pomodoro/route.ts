import { toPomodoroDto } from '@/lib/api/dto';
import { withAuthedRoute } from '@/lib/api/handler';
import { POINTS_FOR_POMODORO } from '@/lib/domain/points';
import { recordPomodoroSchema } from '@/lib/validation/schemas';
import type { PomodoroSessionDto } from '@/types/domain';
import { z } from 'zod';

/**
 * `POST /api/v1/pomodoro` — record a finished focus block.
 *
 * The timer itself runs entirely on the client (see `src/stores/pomodoro-store.ts`),
 * because a focus session must survive a dropped connection. This endpoint is
 * the durable record written when the block ends — or replayed from the offline
 * outbox when the device comes back.
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type RecordPomodoroInput = z.infer<typeof recordPomodoroSchema>;

const listQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

type ListQuery = z.infer<typeof listQuerySchema>;

export const GET = withAuthedRoute<undefined, ListQuery, { sessions: PomodoroSessionDto[] }>({
  querySchema: listQuerySchema,
  rateLimit: 'read',
  handler: async ({ query, user, db }) => {
    const sessions = await db.pomodoroSession.findMany({
      where: { userId: user.id },
      orderBy: { startedAt: 'desc' },
      take: query.limit,
    });

    return { sessions: sessions.map(toPomodoroDto) };
  },
});

export const POST = withAuthedRoute<
  RecordPomodoroInput,
  undefined,
  { session: PomodoroSessionDto; pointsAwarded: number; totalPoints: number }
>({
  bodySchema: recordPomodoroSchema,
  rateLimit: 'mutation',
  handler: async ({ body, user, db }) => {
    const session = await db.pomodoroSession.create({
      data: {
        userId: user.id,
        taskId: body.taskId ?? null,
        mode: body.mode,
        durationSeconds: body.durationSeconds,
        startedAt: body.startedAt,
        endedAt: new Date(body.startedAt.getTime() + body.durationSeconds * 1000),
        completed: body.completed,
        ambientTrack: body.ambientTrack ?? null,
      },
    });

    // Breaks are part of the technique, but only focus blocks pay.
    const pointsAwarded = body.completed && body.mode === 'FOCUS' ? POINTS_FOR_POMODORO : 0;

    const account = pointsAwarded
      ? await db.user.update({
          where: { id: user.id },
          data: { points: { increment: pointsAwarded } },
        })
      : await db.user.findUniqueOrThrow({ where: { id: user.id } });

    return { session: toPomodoroDto(session), pointsAwarded, totalPoints: account.points };
  },
});
