import { withAuthedRoute } from '@/lib/api/handler';
import { ApiError } from '@/lib/errors';
import {
  updateLanguageCourseSchema,
  uuidSchema,
  type UpdateLanguageCourseInput,
} from '@/lib/validation/schemas';

/**
 * `PATCH /api/v1/vocabulary/courses/:id` — change level, pace, or retire it.
 *
 * Archiving rather than deleting, always. A course is the thread that ties a
 * learner to what they learned; cutting it would take the vault with it, and
 * "I stopped studying German" is not "I forgot German".
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const PATCH = withAuthedRoute<UpdateLanguageCourseInput, undefined, { id: string }>({
  bodySchema: updateLanguageCourseSchema,
  rateLimit: 'mutation',
  handler: async ({ body, params, db }) => {
    const id = uuidSchema.parse(params.id);

    const existing = await db.languageCourse.findUnique({ where: { id } });
    if (!existing) throw ApiError.notFound('این زبان در فهرست شما نیست.');

    await db.languageCourse.update({
      where: { id },
      data: {
        ...(body.level !== undefined ? { level: body.level } : {}),
        ...(body.wordsPerDay !== undefined ? { wordsPerDay: body.wordsPerDay } : {}),
        ...(body.archived !== undefined ? { archivedAt: body.archived ? new Date() : null } : {}),
      },
    });

    return { id };
  },
});
