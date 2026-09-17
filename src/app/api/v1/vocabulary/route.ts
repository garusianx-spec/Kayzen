import type { VocabularyWord } from '@prisma/client';

import { withAuthedRoute } from '@/lib/api/handler';
import { toJalaliDayKey } from '@/lib/date/jalali';
import {
  LANGUAGE_FLAGS,
  LANGUAGE_LABELS,
  LEVEL_LABELS,
  selectDailyWords,
} from '@/lib/domain/vocabulary';
import type { LanguageCourseDto, VocabularyWordDto } from '@/types/domain';

/**
 * `GET /api/v1/vocabulary` — today's words, per active course.
 *
 * The day's selection is written the first time it is asked for and read back
 * on every later request. That ordering matters: the selection function is
 * deterministic, so recomputing would *usually* give the same answer — but not
 * after the corpus grows, and "usually the same ten words" is not a promise a
 * teaching tool can make.
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function toWordDto(
  word: VocabularyWord,
  mastery: { status: string; correctRuns: number } | undefined,
): VocabularyWordDto {
  return {
    id: word.id,
    language: word.language,
    level: word.level,
    term: word.term,
    transliteration: word.transliteration,
    meaningFa: word.meaningFa,
    partOfSpeech: word.partOfSpeech,
    example: word.example,
    exampleFa: word.exampleFa,
    status: (mastery?.status as VocabularyWordDto['status']) ?? 'LEARNING',
    correctRuns: mastery?.correctRuns ?? 0,
  };
}

export const GET = withAuthedRoute<undefined, undefined, { courses: LanguageCourseDto[] }>({
  rateLimit: 'read',
  handler: async ({ user, db }) => {
    const dayKey = toJalaliDayKey(new Date(), user.timezone, user.dayStartHour);

    const courses = await db.languageCourse.findMany({
      where: { userId: user.id, archivedAt: null },
      orderBy: { createdAt: 'asc' },
    });

    const mastery = await db.vocabularyMastery.findMany({ where: { userId: user.id } });
    const masteryByWord = new Map(mastery.map((row) => [row.wordId, row]));

    const result: LanguageCourseDto[] = [];

    for (const course of courses) {
      const corpus = await db.vocabularyWord.findMany({
        where: { language: course.language, level: course.level },
        orderBy: { term: 'asc' },
      });

      const existing = await db.vocabularyDelivery.findMany({
        where: { courseId: course.id, dayKey },
        orderBy: { createdAt: 'asc' },
      });

      let wordIds = existing.map((row) => row.wordId);
      let wrapped = false;

      if (wordIds.length === 0) {
        // Everything this learner has ever been shown in this course, so a
        // word is not handed out twice while unseen ones remain.
        const seen = await db.vocabularyDelivery.findMany({
          where: { courseId: course.id },
          select: { wordId: true },
        });

        const selection = selectDailyWords({
          pool: corpus,
          alreadySeen: new Set(seen.map((row) => row.wordId)),
          userId: user.id,
          language: course.language,
          dayKey,
          count: course.wordsPerDay,
        });

        wrapped = selection.wrapped;
        wordIds = selection.words.map((word) => word.id);

        if (wordIds.length > 0) {
          await db.vocabularyDelivery.createMany({
            data: wordIds.map((wordId) => ({
              userId: user.id,
              courseId: course.id,
              wordId,
              dayKey,
            })),
          });
        }
      } else {
        // A stored day was wrapped if any of its words had been delivered
        // before today.
        const earlier = await db.vocabularyDelivery.count({
          where: { courseId: course.id, wordId: { in: wordIds }, dayKey: { not: dayKey } },
        });
        wrapped = earlier > 0;
      }

      const byId = new Map(corpus.map((word) => [word.id, word]));
      const words = wordIds
        .map((id) => byId.get(id))
        .filter((word): word is VocabularyWord => word !== undefined)
        .map((word) => toWordDto(word, masteryByWord.get(word.id)));

      const masteredCount = corpus.filter(
        (word) => masteryByWord.get(word.id)?.status === 'MASTERED',
      ).length;

      result.push({
        id: course.id,
        language: course.language,
        languageLabel: LANGUAGE_LABELS[course.language],
        flag: LANGUAGE_FLAGS[course.language],
        level: course.level,
        levelLabel: LEVEL_LABELS[course.level],
        wordsPerDay: course.wordsPerDay,
        masteredCount,
        corpusSize: corpus.length,
        wrapped,
        words,
      });
    }

    return { courses: result };
  },
});
