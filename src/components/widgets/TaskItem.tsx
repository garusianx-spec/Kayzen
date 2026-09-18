'use client';

import { motion } from 'framer-motion';
import { CheckSquare, Clock, Flag, Paperclip, Repeat } from 'lucide-react';
import { useMemo } from 'react';

import { TaskCheckbox } from './TaskCheckbox';
import { useHapticFeedback } from '@/hooks/use-haptic-feedback';
import { useToggleTask } from '@/lib/api/queries';
import { toPersianDigits } from '@/lib/date/digits';
import { formatRelativeJalali } from '@/lib/date/jalali';
import { describeRecurrence, parseRecurrence } from '@/lib/domain/recurrence';
import { cn } from '@/lib/utils';
import type { TaskDto } from '@/types/domain';

/**
 * One row in the day's list.
 *
 * The meta line carries only what changes a decision from the list: when it is
 * due, whether it is urgent, whether it repeats, how far into its sub-steps it
 * is, and whether it has files. Cost and location are not here — they matter
 * once the task is being *done*, which is the composer's job, and a row that
 * shows everything shows nothing.
 */
export function TaskItem({ task, timezone }: { task: TaskDto; timezone?: string }) {
  const toggleTask = useToggleTask();
  const haptics = useHapticFeedback();
  const isCompleted = task.status === 'COMPLETED';

  // "هر ۲ هفته، شنبه و دوشنبه" says something; a generic "تکرارشونده" does not.
  const recurrenceLabel = useMemo(() => {
    const rule = parseRecurrence(task.recurrence);
    return rule ? describeRecurrence(rule) : null;
  }, [task.recurrence]);

  const handleToggle = (checked: boolean): void => {
    // The buzz belongs to the tap, so it fires here rather than on the server
    // round trip — which may not happen for minutes if the device is offline.
    if (checked) haptics.taskComplete();
    else haptics.impact('light');

    toggleTask.mutate({ id: task.id, completed: checked });
  };

  return (
    <motion.li
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, height: 0 }}
      className={cn(
        'flex items-start gap-3 rounded-card border border-border bg-card p-3',
        isCompleted && 'opacity-60',
      )}
    >
      <TaskCheckbox
        checked={isCompleted}
        onChange={handleToggle}
        priority={task.priority}
        label={`${task.title} را ${isCompleted ? 'برگردان' : 'انجام‌شده علامت بزن'}`}
      />

      <div className="min-w-0 flex-1">
        <p
          className={cn(
            'text-body text-content-primary',
            isCompleted && 'text-content-muted line-through decoration-content-muted/60',
          )}
        >
          {task.title}
        </p>

        {task.description ? (
          <p className="mt-1 line-clamp-2 text-caption text-content-muted">{task.description}</p>
        ) : null}

        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-caption-sm text-content-muted">
          {task.dueAt ? (
            <span className={cn('inline-flex items-center gap-1', task.isOverdue && 'text-rose')}>
              <Clock className="h-3.5 w-3.5" aria-hidden />
              {formatRelativeJalali(new Date(task.dueAt), { timeZone: timezone })}
            </span>
          ) : null}

          {task.priority <= 2 ? (
            <span className="inline-flex items-center gap-1 text-flame">
              <Flag className="h-3.5 w-3.5" aria-hidden />
              {task.priority === 1 ? 'فوری' : 'مهم'}
            </span>
          ) : null}

          {recurrenceLabel ? (
            <span className="inline-flex items-center gap-1">
              <Repeat className="h-3.5 w-3.5" aria-hidden />
              {recurrenceLabel}
            </span>
          ) : null}

          {task.checklist.length > 0 ? (
            <span className="tabular inline-flex items-center gap-1">
              <CheckSquare className="h-3.5 w-3.5" aria-hidden />
              {toPersianDigits(task.checklist.filter((item) => item.completed).length)} از{' '}
              {toPersianDigits(task.checklist.length)}
            </span>
          ) : null}

          {task.attachments.length > 0 ? (
            <span
              className="tabular inline-flex items-center gap-1"
              aria-label={`${toPersianDigits(task.attachments.length)} فایل`}
            >
              <Paperclip className="h-3.5 w-3.5" aria-hidden />
              {toPersianDigits(task.attachments.length)}
            </span>
          ) : null}
        </div>
      </div>
    </motion.li>
  );
}
