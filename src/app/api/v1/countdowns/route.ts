import { toCountdownDto } from '@/lib/api/dto';
import { withAuthedRoute } from '@/lib/api/handler';
import { toJalaliDayKey } from '@/lib/date/jalali';
import { createCountdownSchema, type CreateCountdownInput } from '@/lib/validation/schemas';
import type { CountdownDto } from '@/types/domain';

/** `GET /api/v1/countdowns` — upcoming first, `POST` — create. */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = withAuthedRoute<undefined, undefined, { countdowns: CountdownDto[] }>({
  rateLimit: 'read',
  handler: async ({ user, db }) => {
    const events = await db.countdownEvent.findMany({
      where: { userId: user.id },
      orderBy: { eventAt: 'asc' },
      take: 100,
    });

    const options = { timezone: user.timezone, dayStartHour: user.dayStartHour };

    // Past events stay visible (an anniversary is still a countdown, counting
    // up) but sort below everything still ahead.
    const upcoming = events.filter((event) => event.eventAt >= new Date());
    const past = events.filter((event) => event.eventAt < new Date()).reverse();

    return { countdowns: [...upcoming, ...past].map((event) => toCountdownDto(event, options)) };
  },
});

export const POST = withAuthedRoute<CreateCountdownInput, undefined, { countdown: CountdownDto }>({
  bodySchema: createCountdownSchema,
  rateLimit: 'mutation',
  handler: async ({ body, user, db }) => {
    const event = await db.countdownEvent.create({
      data: {
        userId: user.id,
        title: body.title,
        description: body.description ?? null,
        eventAt: body.eventAt,
        eventJalali: toJalaliDayKey(body.eventAt, user.timezone, user.dayStartHour),
        isAllDay: body.isAllDay,
        colorToken: body.colorToken,
        icon: body.icon,
        notifyBeforeMinutes: body.notifyBeforeMinutes,
      },
    });

    return {
      countdown: toCountdownDto(event, {
        timezone: user.timezone,
        dayStartHour: user.dayStartHour,
      }),
    };
  },
});
