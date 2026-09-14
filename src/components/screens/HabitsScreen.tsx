'use client';

import { HabitCard } from '@/components/widgets/HabitCard';
import { EmptyState } from '@/components/screens/TodayScreen';
import { Skeleton } from '@/components/ui/skeleton';
import { useHabits } from '@/lib/api/queries';
import { toPersianDigits } from '@/lib/date/digits';

/**
 * Habits screen.
 *
 * Ordered due-today first: the list exists to answer "what is left today", and
 * a habit that is not scheduled today is reference material, not a to-do.
 */
export function HabitsScreen() {
  const { data: habits, isLoading } = useHabits();

  const dueToday = habits?.filter((habit) => habit.isDueToday) ?? [];
  const others = habits?.filter((habit) => !habit.isDueToday) ?? [];
  const longestStreak = habits?.reduce((max, habit) => Math.max(max, habit.currentStreak), 0) ?? 0;

  return (
    <div className="space-y-6 px-4 pt-4">
      <header className="space-y-1">
        <h1 className="text-display text-content-primary">عادت‌ها</h1>
        <p className="text-caption text-content-secondary">
          {longestStreak > 0
            ? `بلندترین زنجیرهٔ فعال شما ${toPersianDigits(longestStreak)} روز است.`
            : 'زنجیره را از امروز شروع کنید.'}
        </p>
      </header>

      {isLoading ? (
        <div className="space-y-2">
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-full" />
        </div>
      ) : (habits?.length ?? 0) === 0 ? (
        <EmptyState
          title="هنوز عادتی نساخته‌اید"
          description="با دکمهٔ + اولین عادت روزانه‌تان را اضافه کنید."
        />
      ) : (
        <>
          {dueToday.length ? (
            <section aria-label="سررسید امروز" className="space-y-2">
              <h2 className="text-title text-content-primary">امروز</h2>
              {dueToday.map((habit) => (
                <HabitCard key={habit.id} habit={habit} />
              ))}
            </section>
          ) : null}

          {others.length ? (
            <section aria-label="سایر عادت‌ها" className="space-y-2">
              <h2 className="text-title text-content-primary">روزهای دیگر</h2>
              {others.map((habit) => (
                <HabitCard key={habit.id} habit={habit} />
              ))}
            </section>
          ) : null}
        </>
      )}
    </div>
  );
}
