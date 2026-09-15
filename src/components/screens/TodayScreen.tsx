'use client';

import { AnimatePresence } from 'framer-motion';
import { BookOpen, CalendarClock, ChevronLeft, Sparkles, StickyNote, Timer } from 'lucide-react';
import Link from 'next/link';

import { HabitCard } from '@/components/widgets/HabitCard';
import { TaskItem } from '@/components/widgets/TaskItem';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { useSession, useTodaySnapshot } from '@/lib/api/queries';
import { toPersianDigits } from '@/lib/date/digits';
import { cn } from '@/lib/utils';

/**
 * The Today screen.
 *
 * Everything it draws comes from one `/today` request — a single response to
 * cache, to replay from the service worker, and to fail (or not) as a unit.
 * Five parallel endpoints would give five chances for a partially rendered
 * screen on a weak connection.
 */
export function TodayScreen() {
  const { data: snapshot, isLoading } = useTodaySnapshot();
  const { data: user } = useSession();

  const openTasks = snapshot?.tasks.filter((task) => task.status !== 'COMPLETED') ?? [];
  const doneTasks = snapshot?.tasks.filter((task) => task.status === 'COMPLETED') ?? [];
  const dueHabits = snapshot?.habits.filter((habit) => habit.isDueToday) ?? [];

  const taskProgress =
    snapshot && snapshot.stats.tasksTotal > 0
      ? snapshot.stats.tasksCompleted / snapshot.stats.tasksTotal
      : 0;

  return (
    <div className="space-y-6 px-4 pt-4">
      {/* The settings gear moved to the branded AppHeader, which every tab
          shows; keeping a second one here would be two doors to one room. */}
      <header className="space-y-1">
        <p className="text-caption text-muted-foreground">{snapshot?.jalaliLabel ?? '—'}</p>
        <h1 className="text-display text-foreground">
          {user?.name ? `سلام ${user.name}` : 'سلام'}
        </h1>
        <p className="text-caption text-subtle-foreground">یک درصد بهتر از دیروز؛ همین امروز.</p>
      </header>

      <section className="kz-card space-y-3" aria-label="خلاصهٔ امروز">
        <div className="flex items-center justify-between">
          <span className="text-caption text-content-muted">پیشرفت کارهای امروز</span>
          <span className="tabular text-caption text-content-secondary">
            {toPersianDigits(snapshot?.stats.tasksCompleted ?? 0)} از{' '}
            {toPersianDigits(snapshot?.stats.tasksTotal ?? 0)}
          </span>
        </div>

        <Progress value={taskProgress} label="پیشرفت کارهای امروز" />

        <div className="grid grid-cols-3 gap-3 pt-1">
          <SummaryStat
            icon={<Sparkles className="h-4 w-4 text-violet" aria-hidden />}
            label="امتیاز"
            value={toPersianDigits(snapshot?.stats.points ?? 0)}
          />
          <SummaryStat
            icon={<Timer className="h-4 w-4 text-sky" aria-hidden />}
            label="دقیقهٔ تمرکز"
            value={toPersianDigits(snapshot?.stats.focusMinutes ?? 0)}
          />
          <SummaryStat
            icon={<BookOpen className="h-4 w-4 text-flame" aria-hidden />}
            label="عادت‌ها"
            value={`${toPersianDigits(snapshot?.stats.habitsCompleted ?? 0)}/${toPersianDigits(
              snapshot?.stats.habitsDue ?? 0,
            )}`}
          />
        </div>
      </section>

      {snapshot?.countdowns.length ? (
        <section aria-label="شمارش معکوس‌ها">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-title text-content-primary">در راه است</h2>
            <Link href="/countdowns" className="text-caption text-violet">
              همه
            </Link>
          </div>
          <div className="snap-strip -mx-4 flex gap-3 px-4">
            {snapshot.countdowns.map((countdown) => (
              <article
                key={countdown.id}
                className="w-40 shrink-0 snap-start rounded-card border border-border bg-card p-3"
              >
                <CalendarClock className="mb-2 h-4 w-4 text-sky" aria-hidden />
                <h3 className="truncate text-body text-content-primary">{countdown.title}</h3>
                <p className="tabular mt-1 text-caption text-violet">{countdown.relativeLabel}</p>
              </article>
            ))}
          </div>
        </section>
      ) : null}

      <section aria-label="کارهای امروز">
        <h2 className="mb-2 text-title text-content-primary">کارهای امروز</h2>

        {isLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-20 w-full" />
          </div>
        ) : openTasks.length === 0 && doneTasks.length === 0 ? (
          <EmptyState
            title="امروز کاری ثبت نشده"
            description="با دکمهٔ + اولین قدم امروز را بنویسید."
          />
        ) : (
          <ul className="space-y-2">
            <AnimatePresence initial={false}>
              {[...openTasks, ...doneTasks].map((task) => (
                <TaskItem key={task.id} task={task} timezone={user?.timezone} />
              ))}
            </AnimatePresence>
          </ul>
        )}
      </section>

      {dueHabits.length ? (
        <section aria-label="عادت‌های امروز">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-title text-content-primary">عادت‌های امروز</h2>
            <Link href="/habits" className="text-caption text-violet">
              همه
            </Link>
          </div>

          <div className="space-y-2">
            {dueHabits.slice(0, 3).map((habit) => (
              <HabitCard key={habit.id} habit={habit} />
            ))}
          </div>
        </section>
      ) : null}

      {snapshot?.book ? (
        <section aria-label="کتاب امروز">
          <h2 className="mb-2 text-title text-content-primary">کتاب امروز</h2>

          <Link
            href="/library"
            className={cn(
              'block rounded-card border border-border bg-card p-4 transition-colors',
              'hover:border-border-strong',
            )}
          >
            <p className="text-caption text-flame">
              {snapshot.book.isReviewDay ? 'روز مرور' : 'خلاصهٔ امروز'}
            </p>
            <h3 className="mt-1 text-title text-content-primary">{snapshot.book.titleFa}</h3>
            <p className="mt-1 text-caption text-content-muted">{snapshot.book.authorFa}</p>
            <p className="mt-2 line-clamp-3 text-caption leading-7 text-content-secondary">
              {snapshot.book.summaryFa}
            </p>
            {snapshot.readingLog?.readAt ? (
              <p className="mt-2 text-caption-sm text-emerald">خوانده شد ✓</p>
            ) : null}
          </Link>
        </section>
      ) : null}

      {/* Notes and countdowns have no tab of their own — the navigation is five
          tabs by design — but the FAB writes to both, so they need a way back. */}
      <nav aria-label="بخش‌های دیگر" className="grid grid-cols-2 gap-3">
        <QuickLink
          href="/notes"
          label="یادداشت‌ها"
          icon={<StickyNote className="h-4 w-4" aria-hidden />}
        />
        <QuickLink
          href="/countdowns"
          label="شمارش معکوس"
          icon={<CalendarClock className="h-4 w-4" aria-hidden />}
        />
      </nav>
    </div>
  );
}

function QuickLink({ href, label, icon }: { href: string; label: string; icon: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="kz-pressable flex items-center justify-between rounded-card border border-border bg-card p-3 text-body text-content-secondary"
    >
      <span className="flex items-center gap-2">
        {icon}
        {label}
      </span>
      <ChevronLeft className="h-4 w-4 text-content-muted" aria-hidden />
    </Link>
  );
}

function SummaryStat({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-card bg-surface-raised p-3">
      {icon}
      <p className="tabular mt-2 text-title text-content-primary">{value}</p>
      <p className="text-caption-sm text-content-muted">{label}</p>
    </div>
  );
}

export function EmptyState({ title, description }: { title: string; description: string }) {
  return (
    <div className="rounded-card border border-dashed border-border p-8 text-center">
      <p className="text-body text-content-primary">{title}</p>
      <p className="mt-1 text-caption text-content-muted">{description}</p>
    </div>
  );
}
