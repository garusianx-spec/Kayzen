import type { Metadata } from 'next';
import { unstable_cache } from 'next/cache';
import Link from 'next/link';
import { redirect } from 'next/navigation';

import { BookshelfPanel } from '@/components/reading/BookshelfPanel';
import { RhythmHeader } from '@/components/reading/RhythmHeader';
import { LibraryReflection } from '@/components/screens/LibraryReflection';
import { Progress } from '@/components/ui/progress';
import { toReadingLogDto, toReadingPlanDto, toUserBookDto } from '@/lib/api/dto';
import { getSession } from '@/lib/auth/session';
import { toPersianDigits } from '@/lib/date/digits';
import { withUserContext } from '@/lib/db/rls';
import {
  CURRICULUM_LENGTH,
  formatCurriculumCaption,
  summariseReadingProgress,
} from '@/lib/domain/books-365';
import { ensureReadingPlan, resolveDailyAssignment } from '@/lib/domain/library';
import { recentDayKeys, sortShelf, summariseRhythm } from '@/lib/domain/reading-plan';

/**
 * The Reading Hub — a React Server Component.
 *
 * Two halves, one commitment. `RhythmHeader` carries the daily duration and the
 * mode switch; below it the page renders either the curated 365-day summary
 * (plain server HTML) or the reader's own shelf (`BookshelfPanel`, which is
 * genuinely interactive and ships the JavaScript to match).
 *
 * The mode lives on the server, which is why switching it calls
 * `router.refresh()` rather than swapping a client-side tab: the summary half
 * would otherwise have to be shipped to the browser to be hidden there, and the
 * whole point of rendering it here is that it never is.
 *
 * The page is dynamic (it reads the session cookie), but the expensive,
 * *identical-for-everyone* half — the day's summary row — is wrapped in
 * `unstable_cache` with a one-hour revalidation. Day 24's summary is the same
 * text for every user who reaches day 24, so it is fetched once an hour rather
 * than once per visitor, while the per-user reading log stays live.
 */

export const metadata: Metadata = {
  title: 'مرکز مطالعه',
  description: 'هر روز چند دقیقه مطالعه — خلاصهٔ روزانه یا کتابی که خودت دستت است.',
};

export const dynamic = 'force-dynamic';

/** Long enough for any streak the header will ever print. */
const RHYTHM_WINDOW_DAYS = 400;

const cachedCaption = unstable_cache(
  async (dayNumber: number) => ({ dayNumber, total: CURRICULUM_LENGTH }),
  ['library-day-caption'],
  { revalidate: 3600, tags: ['library'] },
);

export default async function LibraryPage() {
  const session = await getSession();
  if (!session) redirect('/login');

  const data = await withUserContext(session.id, async (db) => {
    const account = await db.user.findUniqueOrThrow({ where: { id: session.id } });
    const plan = await ensureReadingPlan(db, session.id);

    const assignment = await resolveDailyAssignment(db, {
      enrolledAt: account.enrolledAt,
      timezone: session.timezone,
      dayStartHour: session.dayStartHour,
    });

    // The rhythm window is the same one `/api/v1/library/hub` uses; the header
    // is seeded with it so its ring is never briefly empty on first paint.
    const window = recentDayKeys({
      count: RHYTHM_WINDOW_DAYS,
      timezone: session.timezone,
      dayStartHour: session.dayStartHour,
    });

    const [sessions, books] = await Promise.all([
      db.readingSession.findMany({
        where: { userId: session.id, dayKey: { in: window } },
        select: { bookId: true, dayKey: true, minutes: true, pagesRead: true },
      }),
      db.userBook.findMany({ where: { userId: session.id } }),
    ]);

    const byBook = new Map<string, typeof sessions>();
    for (const entry of sessions) {
      if (!entry.bookId) continue;
      const bucket = byBook.get(entry.bookId);
      if (bucket) bucket.push(entry);
      else byBook.set(entry.bookId, [entry]);
    }

    const [logs, todayLog] = await Promise.all([
      db.userReadingLog.findMany({
        where: { userId: session.id, readAt: { not: null } },
        select: { dayNumber: true },
      }),
      assignment.book
        ? db.userReadingLog.findUnique({
            where: { userId_bookId: { userId: session.id, bookId: assignment.book.id } },
          })
        : Promise.resolve(null),
    ]);

    return {
      assignment,
      todayLog: todayLog ? toReadingLogDto(todayLog) : null,
      progress: summariseReadingProgress({
        position: assignment.position,
        readDayNumbers: logs.map((log) => log.dayNumber),
      }),
      hub: {
        plan: toReadingPlanDto(plan),
        rhythm: summariseRhythm({
          sessions,
          dailyMinutes: plan.dailyMinutes,
          timezone: session.timezone,
          dayStartHour: session.dayStartHour,
        }),
        books: sortShelf(books).map((book) => toUserBookDto(book, byBook.get(book.id) ?? [])),
      },
    };
  });

  const { assignment, todayLog, progress, hub } = data;
  const caption = await cachedCaption(assignment.position.dayNumber);
  const book = assignment.book;

  return (
    <div className="space-y-6 px-4 pt-4">
      <header className="space-y-1">
        <p className="text-caption text-flame">{formatCurriculumCaption(assignment.position)}</p>
        <h1 className="text-display text-content-primary">مرکز مطالعه</h1>
        <p className="text-caption text-content-secondary">
          هر روز چند دقیقه؛ همان چند دقیقه است که جمع می‌شود.
        </p>
      </header>

      <RhythmHeader initial={hub} />

      {hub.plan.mode === 'FULL_BOOK' ? (
        <BookshelfPanel initial={hub} />
      ) : (
        <>
          <section className="kz-card space-y-3" aria-label="پیشرفت کتابخانه">
            <div className="flex items-baseline justify-between">
              <h2 className="text-title text-content-primary">کتابخانهٔ ۳۶۵</h2>
              <span className="tabular text-caption-sm text-content-muted">
                {toPersianDigits(progress.booksRead)} از {toPersianDigits(caption.total)}
              </span>
            </div>
            <Progress value={progress.completion} tone="flame" label="پیشرفت کتابخانه" />
            <div className="flex justify-between text-caption text-content-muted">
              <span className="tabular">
                زنجیرهٔ مطالعه: {toPersianDigits(progress.currentStreak)} روز
              </span>
              {progress.missedDayNumbers.length ? (
                <span className="tabular">
                  {toPersianDigits(progress.missedDayNumbers.length)} روز جامانده
                </span>
              ) : null}
            </div>
          </section>

          {progress.missedDayNumbers.length ? (
            <section aria-label="روزهای جامانده">
              <h2 className="mb-2 text-title text-content-primary">جا ماندید؟</h2>
              <p className="mb-3 text-caption text-content-muted">
                این روزها هنوز باز هستند؛ هر وقت خواستید سراغشان بروید.
              </p>

              <div className="snap-strip -mx-4 flex gap-2 px-4">
                {progress.missedDayNumbers.map((dayNumber) => (
                  <Link
                    key={dayNumber}
                    href={`/library/${dayNumber}`}
                    className="kz-pressable tabular shrink-0 snap-start rounded-card border border-border bg-card px-4 py-3 text-caption text-content-secondary"
                  >
                    روز {toPersianDigits(dayNumber)}
                  </Link>
                ))}
              </div>
            </section>
          ) : null}

          {book ? (
            <>
              <article className="kz-card">
                {assignment.isReviewDay ? (
                  <p className="mb-2 text-caption text-flame">
                    روز مرور — خلاصه‌ای که ارزش دوباره خواندن دارد
                  </p>
                ) : null}

                <h2 className="text-title-lg text-content-primary">{book.titleFa}</h2>
                <p className="mt-1 text-caption text-content-muted">
                  {book.authorFa} · {book.category} · {toPersianDigits(book.readingMinutes)} دقیقه
                </p>

                <p className="mt-4 whitespace-pre-line text-body leading-8 text-content-secondary">
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

              <LibraryReflection
                dayNumber={assignment.position.dayNumber}
                prompt={book.reflectionPrompt}
                initialLog={todayLog}
              />
            </>
          ) : (
            <p className="rounded-card border border-dashed border-border p-8 text-center text-body text-content-muted">
              خلاصه‌های کتابخانه هنوز بارگذاری نشده‌اند.
            </p>
          )}
        </>
      )}
    </div>
  );
}
