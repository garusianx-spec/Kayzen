import { withAuthedRoute } from '@/lib/api/handler';
import { MASTERY_THRESHOLD, nextMastery } from '@/lib/domain/vocabulary';
import { ApiError } from '@/lib/errors';
import { reviewWordSchema, type ReviewWordInput } from '@/lib/validation/schemas';

/**
 * `POST /api/v1/vocabulary/review` — record one flashcard answer.
 *
 * The scheduler is deliberately plain: three correct in a row and the word
 * moves to the vault, one wrong answer and the run starts over. Not a
 * decrement — three in a row is a claim about knowing the word, and a wrong
 * answer is evidence against the whole claim rather than a small deduction
 * from it.
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface ReviewResponse {
  wordId: string;
  status: string;
  correctRuns: number;
  /** How many more in a row are needed. Zero once it is in the vault. */
  remaining: number;
  justMastered: boolean;
}

export const POST = withAuthedRoute<ReviewWordInput, undefined, ReviewResponse>({
  bodySchema: reviewWordSchema,
  rateLimit: 'mutation',
  handler: async ({ body, user, db }) => {
    const word = await db.vocabularyWord.findUnique({
      where: { id: body.wordId },
      select: { id: true },
    });
    if (!word) throw ApiError.notFound('این واژه پیدا نشد.');

    const current = await db.vocabularyMastery.findFirst({
      where: { userId: user.id, wordId: body.wordId },
    });

    const next = nextMastery(
      { correctRuns: current?.correctRuns ?? 0, reviewCount: current?.reviewCount ?? 0 },
      body.correct,
    );

    const justMastered = next.status === 'MASTERED' && current?.status !== 'MASTERED';
    const now = new Date();

    const data = {
      status: next.status,
      correctRuns: next.correctRuns,
      reviewCount: next.reviewCount,
      lastReviewedAt: now,
      // Stamped once and kept: the day a word was learned does not change
      // because it was reviewed again a month later.
      ...(justMastered ? { masteredAt: now } : {}),
    };

    if (current) {
      await db.vocabularyMastery.update({ where: { id: current.id }, data });
    } else {
      await db.vocabularyMastery.create({
        data: { userId: user.id, wordId: body.wordId, ...data },
      });
    }

    return {
      wordId: body.wordId,
      status: next.status,
      correctRuns: next.correctRuns,
      remaining: Math.max(0, MASTERY_THRESHOLD - next.correctRuns),
      justMastered,
    };
  },
});
