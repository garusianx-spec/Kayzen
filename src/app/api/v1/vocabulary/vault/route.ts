import { withAuthedRoute } from '@/lib/api/handler';
import { LANGUAGE_FLAGS, LANGUAGE_LABELS, LEVEL_LABELS } from '@/lib/domain/vocabulary';
import { vaultQuerySchema, type VaultQuery } from '@/lib/validation/schemas';
import type { VocabularyWordDto } from '@/types/domain';

/**
 * `GET /api/v1/vocabulary/vault` — everything this learner has met.
 *
 * Grouped by language, filterable by level and status, searchable across both
 * the term and its Persian meaning — because half the time the thing you
 * remember is the meaning and what you have lost is the word.
 *
 * Search is a substring match rather than anything cleverer. The vault is a few
 * hundred rows per learner; a trigram index would be a cost with no matching
 * benefit, and the failure mode of a fuzzy match here ("why is this word in my
 * results?") is worse than the failure mode of an exact one.
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface VaultGroup {
  language: string;
  languageLabel: string;
  flag: string;
  total: number;
  mastered: number;
  words: Array<VocabularyWordDto & { levelLabel: string }>;
}

export const GET = withAuthedRoute<undefined, VaultQuery, { groups: VaultGroup[]; total: number }>({
  querySchema: vaultQuerySchema,
  rateLimit: 'read',
  handler: async ({ query, user, db }) => {
    const mastery = await db.vocabularyMastery.findMany({
      where: {
        userId: user.id,
        ...(query.status === 'ALL' ? {} : { status: query.status }),
      },
      orderBy: { lastReviewedAt: 'desc' },
      take: query.limit,
    });

    if (mastery.length === 0) return { groups: [], total: 0 };

    const words = await db.vocabularyWord.findMany({
      where: {
        id: { in: mastery.map((row) => row.wordId) },
        ...(query.language ? { language: query.language } : {}),
        ...(query.level ? { level: query.level } : {}),
      },
    });

    const term = query.search?.toLowerCase();
    const byWord = new Map(mastery.map((row) => [row.wordId, row]));
    const groups = new Map<string, VaultGroup>();

    for (const word of words) {
      if (
        term &&
        !word.term.toLowerCase().includes(term) &&
        !word.meaningFa.includes(term) &&
        !(word.transliteration ?? '').includes(term)
      ) {
        continue;
      }

      const row = byWord.get(word.id);
      const group = groups.get(word.language) ?? {
        language: word.language,
        languageLabel: LANGUAGE_LABELS[word.language],
        flag: LANGUAGE_FLAGS[word.language],
        total: 0,
        mastered: 0,
        words: [],
      };

      group.total += 1;
      if (row?.status === 'MASTERED') group.mastered += 1;
      group.words.push({
        id: word.id,
        language: word.language,
        level: word.level,
        levelLabel: LEVEL_LABELS[word.level],
        term: word.term,
        transliteration: word.transliteration,
        meaningFa: word.meaningFa,
        partOfSpeech: word.partOfSpeech,
        example: word.example,
        exampleFa: word.exampleFa,
        status: (row?.status as VocabularyWordDto['status']) ?? 'LEARNING',
        correctRuns: row?.correctRuns ?? 0,
      });

      groups.set(word.language, group);
    }

    const list = [...groups.values()].sort((left, right) => right.total - left.total);
    return { groups: list, total: list.reduce((sum, group) => sum + group.total, 0) };
  },
});
