import { toCountdownDto } from '@/lib/api/dto';
import { withAuthedRoute } from '@/lib/api/handler';
import { toJalaliDayKey } from '@/lib/date/jalali';
import { syncToCalendar } from '@/lib/google/auto-sync';
import { ApiError } from '@/lib/errors';
import { updateCountdownSchema, uuidSchema } from '@/lib/validation/schemas';
import type { CountdownDto } from '@/types/domain';
import type { z } from 'zod';

/** `PATCH|DELETE /api/v1/countdowns/:id`. */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type UpdateCountdownInput = z.infer<typeof updateCountdownSchema>;

export const PATCH = withAuthedRoute<UpdateCountdownInput, undefined, { countdown: CountdownDto }>({
  bodySchema: updateCountdownSchema,
  rateLimit: 'mutation',
  handler: async ({ body, params, user, db }) => {
    const id = uuidSchema.parse(params.id);

    const existing = await db.countdownEvent.findUnique({ where: { id } });
    if (!existing) throw ApiError.notFound('رویداد موردنظر پیدا نشد.');

    const event = await db.countdownEvent.update({
      where: { id },
      data: {
        ...(body.title !== undefined ? { title: body.title } : {}),
        ...(body.description !== undefined ? { description: body.description } : {}),
        ...(body.eventAt !== undefined
          ? {
              eventAt: body.eventAt,
              eventJalali: toJalaliDayKey(body.eventAt, user.timezone, user.dayStartHour),
            }
          : {}),
        ...(body.isAllDay !== undefined ? { isAllDay: body.isAllDay } : {}),
        ...(body.colorToken !== undefined ? { colorToken: body.colorToken } : {}),
        ...(body.icon !== undefined ? { icon: body.icon } : {}),
        ...(body.notifyBeforeMinutes !== undefined
          ? { notifyBeforeMinutes: body.notifyBeforeMinutes }
          : {}),
      },
    });

    await syncToCalendar(db, {
      userId: user.id,
      entity: 'COUNTDOWN',
      entityId: event.id,
      operation: 'UPSERT',
      googleEventId: event.googleEventId,
    });

    return {
      countdown: toCountdownDto(event, {
        timezone: user.timezone,
        dayStartHour: user.dayStartHour,
      }),
    };
  },
});

export const DELETE = withAuthedRoute<undefined, undefined, { id: string }>({
  rateLimit: 'mutation',
  handler: async ({ params, user, db }) => {
    const id = uuidSchema.parse(params.id);

    // The mirror id has to be read while the row is still there: the job that
    // removes the event outlives the countdown it belonged to.
    const existing = await db.countdownEvent.findUnique({
      where: { id },
      select: { googleEventId: true },
    });
    if (!existing) throw ApiError.notFound('رویداد موردنظر پیدا نشد.');

    await db.countdownEvent.deleteMany({ where: { id } });

    await syncToCalendar(db, {
      userId: user.id,
      entity: 'COUNTDOWN',
      entityId: id,
      operation: 'DELETE',
      googleEventId: existing.googleEventId,
    });

    return { id };
  },
});
