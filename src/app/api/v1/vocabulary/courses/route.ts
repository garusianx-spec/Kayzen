import { withAuthedRoute } from '@/lib/api/handler';
import { MAX_ACTIVE_COURSES, LANGUAGE_LABELS } from '@/lib/domain/vocabulary';
import { ApiError } from '@/lib/errors';
import { languageCourseSchema, type LanguageCourseInput } from '@/lib/validation/schemas';

/**
 * `POST /api/v1/vocabulary/courses` — start learning a language.
 *
 * Three at a time, by the brief. The ceiling lives here rather than in the
 * schema because "three" is a product decision: a unique index cannot express
 * it without inventing a slot number, and a slot number is a migration every
 * time somebody changes their mind about the number.
 *
 * Restarting a language that was archived reactivates the existing row, so the
 * words it already taught stay attached to it.
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const POST = withAuthedRoute<LanguageCourseInput, undefined, { id: string }>({
  bodySchema: languageCourseSchema,
  rateLimit: 'mutation',
  handler: async ({ body, user, db }) => {
    const active = await db.languageCourse.count({
      where: { userId: user.id, archivedAt: null },
    });

    const existing = await db.languageCourse.findFirst({
      where: { userId: user.id, language: body.language },
    });

    if (existing && existing.archivedAt === null) {
      throw ApiError.conflict(`${LANGUAGE_LABELS[body.language]} از قبل فعال است.`);
    }

    if (active >= MAX_ACTIVE_COURSES) {
      throw ApiError.unprocessable('بیشتر از سه زبان هم‌زمان زیاد است؛ اول یکی را کنار بگذار.', {
        language: ['حداکثر سه زبان فعال.'],
      });
    }

    if (existing) {
      const revived = await db.languageCourse.update({
        where: { id: existing.id },
        data: { archivedAt: null, level: body.level, wordsPerDay: body.wordsPerDay },
      });

      return { id: revived.id };
    }

    const course = await db.languageCourse.create({
      data: {
        userId: user.id,
        language: body.language,
        level: body.level,
        wordsPerDay: body.wordsPerDay,
      },
    });

    return { id: course.id };
  },
});
