'use client';

import { Pause, Play, RotateCcw, SkipForward } from 'lucide-react';

import { AmbientPlayer } from '@/components/widgets/AmbientPlayer';
import { Button } from '@/components/ui/button';
import { ProgressRing } from '@/components/ui/progress';
import { useHapticFeedback } from '@/hooks/use-haptic-feedback';
import { usePomodoroTimer } from '@/hooks/use-pomodoro-timer';
import { useTasks } from '@/lib/api/queries';
import { toPersianDigits } from '@/lib/date/digits';
import { usePomodoroStore } from '@/stores/pomodoro-store';
import { formatDuration } from '@/lib/utils';
import { cn } from '@/lib/utils';
import type { ColorToken } from '@/types/domain';

/**
 * The focus chamber.
 *
 * Mode colours the whole screen rather than a label: at arm's length on a desk,
 * "am I working or resting?" has to be answerable from the colour alone.
 */

const MODE_LABEL = {
  FOCUS: 'تمرکز',
  SHORT_BREAK: 'استراحت کوتاه',
  LONG_BREAK: 'استراحت بلند',
} as const;

const MODE_TONE: Record<keyof typeof MODE_LABEL, ColorToken> = {
  FOCUS: 'violet',
  SHORT_BREAK: 'emerald',
  LONG_BREAK: 'sky',
};

export function FocusScreen() {
  const timer = usePomodoroTimer();
  const store = usePomodoroStore();
  const haptics = useHapticFeedback();
  const { data: tasks } = useTasks('today');

  const openTasks = tasks?.filter((task) => task.status !== 'COMPLETED') ?? [];
  const isRunning = timer.status === 'running';

  return (
    <div className="space-y-6 px-4 pt-4">
      <header className="space-y-1 text-center">
        <p className="text-caption text-content-muted">{MODE_LABEL[timer.mode]}</p>
        <h1 className="text-title-lg text-content-primary">اتاق تمرکز</h1>
      </header>

      <div className="flex justify-center py-2">
        <ProgressRing
          value={timer.progress}
          size={248}
          strokeWidth={10}
          tone={MODE_TONE[timer.mode]}
        >
          <div className="text-center">
            <p className="tabular text-display-lg text-content-primary">
              {toPersianDigits(formatDuration(timer.remainingSeconds))}
            </p>
            <p className="mt-1 text-caption text-content-muted">
              دور {toPersianDigits(store.completedCycles + 1)} از{' '}
              {toPersianDigits(store.settings.cyclesBeforeLongBreak)}
            </p>
          </div>
        </ProgressRing>
      </div>

      <div className="flex items-center justify-center gap-3">
        <Button
          variant="ghost"
          size="icon"
          aria-label="از نو"
          onClick={() => {
            haptics.impact('medium');
            store.reset();
          }}
        >
          <RotateCcw className="h-5 w-5" aria-hidden />
        </Button>

        <Button
          size="lg"
          className="min-w-[140px]"
          haptic="medium"
          onClick={() => {
            if (isRunning) store.pause();
            else if (timer.status === 'paused') store.resume();
            else store.start();
          }}
        >
          {isRunning ? (
            <>
              <Pause className="h-5 w-5" aria-hidden />
              مکث
            </>
          ) : (
            <>
              <Play className="h-5 w-5" aria-hidden />
              {timer.status === 'paused' ? 'ادامه' : 'شروع'}
            </>
          )}
        </Button>

        <Button
          variant="ghost"
          size="icon"
          aria-label="مرحلهٔ بعد"
          onClick={() => {
            haptics.impact('light');
            store.skipToNext();
          }}
        >
          <SkipForward className="h-5 w-5" aria-hidden />
        </Button>
      </div>

      {openTasks.length ? (
        <section className="kz-card space-y-2" aria-label="کار در دست تمرکز">
          <h2 className="text-title text-content-primary">روی چه کاری تمرکز می‌کنید؟</h2>

          <div className="space-y-1.5">
            {openTasks.slice(0, 5).map((task) => (
              <button
                key={task.id}
                type="button"
                onClick={() => {
                  haptics.selection();
                  store.setTask(store.taskId === task.id ? null : task.id);
                }}
                className={cn(
                  'kz-pressable w-full rounded-card border p-3 text-right text-body transition-colors',
                  store.taskId === task.id
                    ? 'border-violet bg-violet-soft text-violet'
                    : 'border-border text-content-secondary',
                )}
              >
                {task.title}
              </button>
            ))}
          </div>
        </section>
      ) : null}

      <AmbientPlayer />
    </div>
  );
}
