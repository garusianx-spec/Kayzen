import type { Metadata } from 'next';
import { ArrowRight } from 'lucide-react';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';

import { LibraryReflection } from '@/components/screens/LibraryReflection';
import { toReadingLogDto } from '@/lib/api/dto';
import { getSession } from '@/lib/auth/session';
import { toPersianDigits } from '@/lib/date/digits';
import { withUserContext } from '@/lib/db/rls';
import { CURRICULUM_LENGTH } from '@/lib/domain/books-365';
import { resolveBookForDay } from '@/lib/domain/library';

/**
 * One day of the curriculum — the catch-up view.
 *
 * Reachable from the missed-days list on `/library`, so a user who skipped day
 * ۱۲ can still read and reflect on it without waiting for the wrap-around. Same
 * server-rendered summary, same client island for the reflection form.
 */

export const metadata: Metadata = { title: 'خلاصهٔ روز' };
export const dynamic = 'force-dynamic';

export default async function LibraryDayPage({ params }: { params: Promise<{ day: string }> }) {
  const session = await getSession();
  if (!session) redirect('/login');

  const dayNumber = Number((await params).day);

  if (!Number.isInteger(dayNumber) || dayNumber < 1 || dayNumber > CURRICULUM_LENGTH) {
    notFound();
  }

  const data = await withUserContext(session.id, async (db) => {
    const { book, isReviewDay } = await resolveBookForDay(db, dayNumber);
    if (!book) return null;

    const log = await db.userReadingLog.findUnique({
      where: { userId_bookId: { userId: session.id, bookId: book.id } },
    });

    return { book, isReviewDay, log: log ? toReadingLogDto(log) : null };
  });

  if (!data) notFound();

  const { book, isReviewDay, log } = data;

  return (
    <div className="space-y-5 px-4 pt-4">
      <Link
        href="/library"
        className="kz-pressable inline-flex items-center gap-2 text-caption text-content-muted"
      >
        <ArrowRight className="h-4 w-4" aria-hidden />
        مرکز مطالعه
      </Link>

      <header className="space-y-1">
        <p className="text-caption text-flame">
          روز {toPersianDigits(dayNumber)} از {toPersianDigits(CURRICULUM_LENGTH)}
          {isReviewDay ? ' · مرور' : ''}
        </p>
        <h1 className="text-title-lg text-content-primary">{book.titleFa}</h1>
        <p className="text-caption text-content-muted">
          {book.authorFa} · {book.category} · {toPersianDigits(book.readingMinutes)} دقیقه
        </p>
      </header>

      <article className="kz-card">
        <p className="whitespace-pre-line text-body leading-8 text-content-secondary">
          {book.summaryFa}
        </p>

        {book.keyTakeaways.length ? (
          <ul className="mt-4 space-y-2 border-t border-border pt-4">
            {book.keyTakeaways.map((takeaway) => (
              <li key={takeaway} className="flex gap-2 text-body text-content-secondary">
                <span aria-hidden className="text-flame">
                  ◆
                </span>
                {takeaway}
              </li>
            ))}
          </ul>
        ) : null}
      </article>

      <LibraryReflection dayNumber={dayNumber} prompt={book.reflectionPrompt} initialLog={log} />
    </div>
  );
}
