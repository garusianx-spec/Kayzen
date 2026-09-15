import { toSessionUserDto } from '@/lib/api/dto';
import { withAuthedRoute } from '@/lib/api/handler';
import { updatePreferencesSchema, type UpdatePreferencesInput } from '@/lib/validation/schemas';
import type { SessionUserDto } from '@/types/domain';

/**
 * `PATCH /api/v1/preferences` — account settings.
 *
 * Changing `timezone` or `dayStartHour` moves every day boundary in the app, so
 * the response carries the refreshed user and the client replaces its cached
 * session with it. The *access token* still holds the old values until it is
 * refreshed — harmless, because both are re-read from the row on the next
 * rotation, and the day-boundary maths that matters runs server-side.
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const PATCH = withAuthedRoute<UpdatePreferencesInput, undefined, { user: SessionUserDto }>({
  bodySchema: updatePreferencesSchema,
  rateLimit: 'mutation',
  handler: async ({ body, user, db }) => {
    const updated = await db.user.update({
      where: { id: user.id },
      data: {
        ...(body.timezone !== undefined ? { timezone: body.timezone } : {}),
        ...(body.dayStartHour !== undefined ? { dayStartHour: body.dayStartHour } : {}),
        ...(body.theme !== undefined ? { theme: body.theme } : {}),
        ...(body.name !== undefined ? { name: body.name } : {}),
        ...(body.ambientEnabled !== undefined ? { ambientEnabled: body.ambientEnabled } : {}),
        ...(body.hapticsEnabled !== undefined ? { hapticsEnabled: body.hapticsEnabled } : {}),
        ...(body.notifyAtHour !== undefined ? { notifyAtHour: body.notifyAtHour } : {}),
        ...(body.notifyAtMinute !== undefined ? { notifyAtMinute: body.notifyAtMinute } : {}),
      },
    });

    return { user: toSessionUserDto(updated) };
  },
});
