import { PrismaClient } from '@prisma/client';

import { BOOKS_365, CURATED_DAYS } from './data/books-365';
import { vocabularyRows } from './data/vocabulary';
import { CURRICULUM_LENGTH } from '../src/lib/domain/books-365';

/**
 * Seeds the global 365-library.
 *
 * Idempotent by design: entries are upserted on `day_number`, so re-running
 * after editing a summary updates it in place and adding entries never
 * duplicates the existing ones. Nothing tenant-owned is seeded — a fresh
 * account should start empty, not pre-populated with somebody else's idea of a
 * good habit.
 *
 * Run with `npm run db:seed` (as the owner role: RLS is enabled on
 * `books_365`, and the runtime `kayzen_app` role has read access only).
 */

const prisma = new PrismaClient();

async function main(): Promise<void> {
  let created = 0;
  let updated = 0;

  // The vocabulary corpus is global reference data, like the library: upserted
  // on (language, level, term), so re-running after adding words is safe and
  // editing a meaning updates it in place.
  let vocabulary = 0;
  for (const word of vocabularyRows()) {
    await prisma.vocabularyWord.upsert({
      where: {
        language_level_term: {
          language: word.language,
          level: word.level,
          term: word.term,
        },
      },
      create: word,
      update: {
        transliteration: word.transliteration,
        meaningFa: word.meaningFa,
        partOfSpeech: word.partOfSpeech,
      },
    });
    vocabulary += 1;
  }

  console.log(`vocabulary: ${vocabulary} words upserted`);

  for (const book of BOOKS_365) {
    const existing = await prisma.book365.findUnique({
      where: { dayNumber: book.dayNumber },
      select: { id: true },
    });

    await prisma.book365.upsert({
      where: { dayNumber: book.dayNumber },
      create: {
        dayNumber: book.dayNumber,
        title: book.title,
        titleFa: book.titleFa,
        author: book.author,
        authorFa: book.authorFa,
        category: book.category,
        summaryFa: book.summaryFa,
        keyTakeaways: [...book.keyTakeaways],
        reflectionPrompt: book.reflectionPrompt,
        readingMinutes: book.readingMinutes,
      },
      update: {
        title: book.title,
        titleFa: book.titleFa,
        author: book.author,
        authorFa: book.authorFa,
        category: book.category,
        summaryFa: book.summaryFa,
        keyTakeaways: [...book.keyTakeaways],
        reflectionPrompt: book.reflectionPrompt,
        readingMinutes: book.readingMinutes,
      },
    });

    if (existing) updated += 1;
    else created += 1;
  }

  const remaining = CURRICULUM_LENGTH - CURATED_DAYS;

  console.log(`seeded books_365: ${created} created, ${updated} updated`);
  console.log(
    `curated days: ${CURATED_DAYS}/${CURRICULUM_LENGTH} — the remaining ${remaining} days are served as review days (see src/lib/domain/library.ts)`,
  );
}

main()
  .catch((error) => {
    console.error('seed failed:', error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
