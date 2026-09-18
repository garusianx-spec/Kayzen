'use client';

import { motion, useReducedMotion } from 'framer-motion';
import { Coins, MapPin, Repeat, Tag } from 'lucide-react';
import { useEffect, useState } from 'react';

import { AttachmentPicker } from './task/AttachmentPicker';
import { ChecklistBuilder, type ChecklistDraft } from './task/ChecklistBuilder';
import { PrioritySelector, normalisePriority } from './task/PrioritySelector';
import { Button } from '@/components/ui/button';
import { FieldError, FieldLabel, Input, Textarea } from '@/components/ui/input';
import { JalaliDatePicker } from '@/components/ui/jalali-date-picker';
import { Sheet } from '@/components/ui/sheet';
import { useToast } from '@/components/ui/toast';
import { useHapticFeedback } from '@/hooks/use-haptic-feedback';
import {
  describeUnacceptable,
  uploadErrorMessage,
  uploadTaskAttachment,
  useTaskAttachments,
} from '@/hooks/use-task-attachments';
import { isQueued } from '@/lib/api/client';
import { useCreateTask, useTaskCategories, useUpdateTask } from '@/lib/api/queries';
import { formatPersianNumber, parsePersianNumber, toPersianDigits } from '@/lib/date/digits';
import { serializeRecurrence, type RecurrenceFrequency } from '@/lib/domain/recurrence';
import { MAX_ATTACHMENTS_PER_RECORD } from '@/lib/storage/constants';
import { cn } from '@/lib/utils';
import { createTaskSchema } from '@/lib/validation/schemas';
import type { TaskDto } from '@/types/domain';

/**
 * "کار تازه" — the task composer, and the task editor.
 *
 * One component for both, because they are the same form: a person who opens a
 * task to change its due date should not meet a different arrangement of the
 * same fields than the one they filled in. `task` being present is the only
 * difference, and it changes the verb, not the layout.
 *
 * Validated with the *same* zod schema the route handler uses, so the form can
 * never accept something the API will reject — the two cannot drift because
 * there is only one definition.
 *
 * The sheet is deliberately long. Everything below the title is optional and
 * collapsed to a single line until it is wanted, so the common case — type a
 * title, tap save — stays two interactions, while "buy a present for Maryam,
 * ۸۰۰ هزار تومان, at the bazaar, before Thursday, in three steps" is reachable
 * without leaving the sheet.
 *
 * Files are the one field whose behaviour differs between the two modes, and it
 * is hidden from the user: an existing task has an id to upload against, so its
 * files go straight to Storage; a task still being written does not, so its
 * files wait in memory and are uploaded the moment the task has an id. Saving
 * therefore stays "one tap" either way rather than "save, then attach".
 */

const REPEATS: Array<{ value: RecurrenceFrequency | 'NONE'; label: string }> = [
  { value: 'NONE', label: 'بدون تکرار' },
  { value: 'DAILY', label: 'روزانه' },
  { value: 'WEEKLY', label: 'هفتگی' },
  { value: 'MONTHLY', label: 'ماهانه' },
];

const CATEGORY_TONE: Record<string, string> = {
  violet: 'border-violet bg-violet-soft text-violet',
  flame: 'border-flame bg-flame-soft text-flame',
  emerald: 'border-emerald bg-emerald-soft text-emerald',
  rose: 'border-rose bg-rose-soft text-rose',
  sky: 'border-sky bg-sky-soft text-sky',
};

export interface TaskComposerProps {
  open: boolean;
  onClose(): void;
  /** When present the sheet edits this task instead of creating one. */
  task?: TaskDto | null;
}

export function TaskComposer({ open, onClose, task = null }: TaskComposerProps) {
  const editing = task !== null;

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [dueAt, setDueAt] = useState<Date | null>(new Date());
  const [priority, setPriority] = useState(2);
  const [repeat, setRepeat] = useState<RecurrenceFrequency | 'NONE'>('NONE');
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [cost, setCost] = useState('');
  const [location, setLocation] = useState('');
  const [checklist, setChecklist] = useState<ChecklistDraft[]>([]);
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [fileError, setFileError] = useState<string | null>(null);
  const [uploadingStaged, setUploadingStaged] = useState(false);
  const [showDetail, setShowDetail] = useState(false);
  const [error, setError] = useState<string>();

  const createTask = useCreateTask();
  const updateTask = useUpdateTask();
  const categories = useTaskCategories();
  // Signing a batch of download URLs costs a round trip to Storage, so it waits
  // for the sheet to actually be open rather than firing for every task in the
  // list behind it.
  const attachments = useTaskAttachments(task?.id ?? null, { enabled: open && editing });
  const haptics = useHapticFeedback();
  const reduceMotion = useReducedMotion();
  const { success, offline } = useToast();

  const saving = createTask.isPending || updateTask.isPending || uploadingStaged;

  // Re-seed whenever the sheet opens, so reopening after a cancel does not
  // resurrect half of the previous draft.
  useEffect(() => {
    if (!open) return;

    setTitle(task?.title ?? '');
    setDescription(task?.description ?? '');
    setDueAt(task?.dueAt ? new Date(task.dueAt) : new Date());
    setPriority(normalisePriority(task?.priority ?? 2));
    setRepeat('NONE');
    setCategoryId(task?.category?.id ?? null);
    setCost(task?.costAmount ? formatPersianNumber(task.costAmount) : '');
    setLocation(task?.location ?? '');
    setChecklist(
      (task?.checklist ?? []).map((item) => ({
        id: item.id,
        title: item.title,
        completed: item.completed,
      })),
    );
    setPendingFiles([]);
    // Detail opens already expanded when the task has any, so an edit never
    // hides the thing the user came to change.
    setShowDetail(
      Boolean(
        task?.costAmount ||
          task?.location ||
          (task?.checklist?.length ?? 0) > 0 ||
          (task?.attachments?.length ?? 0) > 0,
      ),
    );
    setError(undefined);
    setFileError(null);
  }, [open, task]);

  const pick = (files: File[]): void => {
    setFileError(null);

    const room =
      MAX_ATTACHMENTS_PER_RECORD - (attachments.attachments.length + pendingFiles.length);
    if (room <= 0) {
      setFileError('برای هر کار حداکثر ۱۰ فایل مجاز است.');
      return;
    }

    // Everything the bucket would reject is rejected here instead, so the user
    // hears about a 12 MiB photo before waiting for it to upload.
    const accepted: File[] = [];
    for (const file of files.slice(0, room)) {
      const unacceptable = describeUnacceptable(file);
      if (unacceptable) {
        setFileError(unacceptable);
        continue;
      }
      accepted.push(file);
    }

    if (files.length > room) setFileError('برای هر کار حداکثر ۱۰ فایل مجاز است.');
    if (accepted.length === 0) return;

    haptics.impact('light');

    if (editing) {
      // The task exists, so there is nothing to wait for. Sequential rather
      // than parallel: the per-task ceiling is counted server-side, and three
      // simultaneous signings would race past it.
      void (async () => {
        for (const file of accepted) await attachments.upload(file);
      })();
      return;
    }

    setPendingFiles((current) => [...current, ...accepted]);
  };

  const submit = async (): Promise<void> => {
    const parsed = createTaskSchema.safeParse({
      title,
      description: description.trim() || undefined,
      dueAt: dueAt?.toISOString(),
      priority,
      recurrence:
        repeat === 'NONE' ? undefined : serializeRecurrence({ frequency: repeat, interval: 1 }),
      categoryId: categoryId ?? undefined,
      costAmount: cost.trim() === '' ? undefined : cost,
      location: location.trim() || undefined,
      checklist: checklist.map((item) => ({
        id: item.id,
        title: item.title,
        completed: item.completed,
      })),
    });

    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'اطلاعات کامل نیست.');
      haptics.error();
      return;
    }

    try {
      const payload = {
        ...parsed.data,
        // `isoDateTime` parses to a `Date`; the wire carries strings.
        dueAt: parsed.data.dueAt?.toISOString(),
        remindAt: parsed.data.remindAt?.toISOString(),
        // The API distinguishes "leave it alone" from "clear it", and only
        // `null` clears. An edit that empties the cost field means to empty it.
        ...(editing
          ? {
              categoryId: categoryId ?? null,
              costAmount: cost.trim() === '' ? null : parsed.data.costAmount,
              location: location.trim() === '' ? null : parsed.data.location,
            }
          : {}),
      };

      const result = editing
        ? await updateTask.mutateAsync({ id: task.id, ...payload })
        : await createTask.mutateAsync(payload);

      haptics.impact('success');

      if (isQueued(result)) {
        offline('ثبت شد', 'به‌محض وصل‌شدن می‌فرستیمش.');

        // A parked create has no id, and a signed upload URL cannot wait in the
        // outbox for it — signatures expire. Saying so beats a silent drop.
        if (pendingFiles.length > 0) {
          setFileError('کار ثبت شد، ولی فایل‌ها آنلاین لازم دارند. بعداً از همین‌جا اضافه‌شان کن.');
          return;
        }
      } else {
        if (pendingFiles.length > 0 && 'task' in result) {
          const failed = await uploadStaged(result.task.id);

          // The task is already saved, so a failed upload is not a failed save:
          // the sheet stays open on the now-existing task's files rather than
          // throwing the whole form away.
          if (failed) {
            setFileError(failed);
            success('اضافه شد', 'کار ثبت شد؛ فقط فایل‌ها نرفتند.');
            return;
          }
        }

        success(editing ? 'به‌روز شد' : 'اضافه شد', editing ? undefined : 'یک قدم کوچک دیگر 🌱');
      }

      onClose();
    } catch {
      haptics.error();
      setError('ذخیره نشد؛ دوباره تلاش کن.');
    }
  };

  /** Uploads the staged files against a task that now exists. Returns an error. */
  const uploadStaged = async (taskId: string): Promise<string | null> => {
    setUploadingStaged(true);

    try {
      // Sequential, and the list shrinks as each file lands: if the third of
      // five fails, the two that succeeded are gone from the tray and a retry
      // does not upload them twice.
      for (const file of [...pendingFiles]) {
        try {
          await uploadTaskAttachment(taskId, file);
          setPendingFiles((current) => current.filter((candidate) => candidate !== file));
        } catch (caught) {
          return uploadErrorMessage(caught);
        }
      }

      return null;
    } finally {
      setUploadingStaged(false);
    }
  };

  const costValue = parsePersianNumber(cost);

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
      title={editing ? 'ویرایش کار' : 'کار تازه'}
    >
      <div className="space-y-5">
        <div>
          <FieldLabel htmlFor="task-title">چه کاری؟</FieldLabel>
          <Input
            id="task-title"
            value={title}
            onChange={(event) => {
              setTitle(event.target.value);
              setError(undefined);
            }}
            placeholder="مثلاً: زنگ زدن به مامان"
            hasError={Boolean(error)}
            enterKeyHint="next"
            autoFocus
          />
          <FieldError message={error} />
        </div>

        <div className="space-y-2">
          <span className="text-caption text-content-secondary">اولویت</span>
          <PrioritySelector value={priority} onChange={setPriority} />
        </div>

        <div className="space-y-2">
          <span className="text-caption text-content-secondary">کِی؟</span>
          <JalaliDatePicker value={dueAt} onChange={setDueAt} />
        </div>

        {categories.data && categories.data.length > 0 ? (
          <div className="space-y-2">
            <span className="flex items-center gap-1.5 text-caption text-content-secondary">
              <Tag className="h-3.5 w-3.5" aria-hidden />
              دسته
            </span>
            <div className="flex flex-wrap gap-2">
              {categories.data.map((category) => {
                const active = category.id === categoryId;

                return (
                  <button
                    key={category.id}
                    type="button"
                    onClick={() => {
                      haptics.selection();
                      setCategoryId(active ? null : category.id);
                    }}
                    aria-pressed={active}
                    className={cn(
                      'min-h-[44px] rounded-pill border px-4 text-caption transition-colors active:scale-95',
                      active
                        ? (CATEGORY_TONE[category.colorToken] ?? CATEGORY_TONE.violet)
                        : 'border-border text-content-muted',
                    )}
                  >
                    {category.title}
                  </button>
                );
              })}
            </div>
          </div>
        ) : null}

        {showDetail ? (
          <motion.div
            initial={reduceMotion ? false : { opacity: 0, y: -8 }}
            animate={reduceMotion ? undefined : { opacity: 1, y: 0 }}
            transition={{ type: 'spring', stiffness: 320, damping: 30 }}
            className="space-y-5"
          >
            <ChecklistBuilder items={checklist} onChange={setChecklist} />

            <div>
              <FieldLabel htmlFor="task-cost">
                <span className="flex items-center gap-1.5">
                  <Coins className="h-3.5 w-3.5" aria-hidden />
                  هزینه (اختیاری)
                </span>
              </FieldLabel>
              <Input
                id="task-cost"
                value={cost}
                onChange={(event) => setCost(event.target.value)}
                inputMode="numeric"
                dir="ltr"
                className="tabular text-end"
                placeholder="۲٬۵۰۰٬۰۰۰"
              />
              {costValue !== null && costValue > 0 ? (
                <p className="mt-1.5 text-caption-sm text-content-muted">
                  {formatPersianNumber(costValue)} تومان
                </p>
              ) : null}
            </div>

            <div>
              <FieldLabel htmlFor="task-location">
                <span className="flex items-center gap-1.5">
                  <MapPin className="h-3.5 w-3.5" aria-hidden />
                  کجا؟ (اختیاری)
                </span>
              </FieldLabel>
              <Input
                id="task-location"
                value={location}
                onChange={(event) => setLocation(event.target.value)}
                placeholder="دفتر کار، خانه، بازار…"
                maxLength={120}
              />
            </div>

            <div>
              <FieldLabel htmlFor="task-notes">توضیح (اختیاری)</FieldLabel>
              <Textarea
                id="task-notes"
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                placeholder="هر چیزی که کمک می‌کند بعداً یادت بیاید…"
                rows={3}
              />
            </div>

            <AttachmentPicker
              saved={attachments.attachments}
              pending={pendingFiles}
              isLoading={attachments.isLoading}
              isUploading={attachments.isUploading || uploadingStaged}
              error={fileError ?? attachments.error}
              onPick={pick}
              onRemoveSaved={(id) => void attachments.remove(id)}
              onRemovePending={(index) => {
                haptics.impact('medium');
                setFileError(null);
                setPendingFiles((current) => current.filter((_, at) => at !== index));
              }}
            />

            <div className="space-y-2">
              <span className="flex items-center gap-1.5 text-caption text-content-secondary">
                <Repeat className="h-3.5 w-3.5" aria-hidden />
                تکرار
              </span>
              <div className="grid grid-cols-4 gap-2">
                {REPEATS.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => {
                      haptics.selection();
                      setRepeat(option.value);
                    }}
                    aria-pressed={repeat === option.value}
                    className={cn(
                      'min-h-[44px] rounded-card border text-caption-sm transition-colors active:scale-95',
                      repeat === option.value
                        ? 'border-violet bg-violet-soft text-violet'
                        : 'border-border text-content-muted',
                    )}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>
          </motion.div>
        ) : (
          <button
            type="button"
            onClick={() => {
              haptics.selection();
              setShowDetail(true);
            }}
            className="min-h-[44px] w-full rounded-card border border-dashed border-border text-caption text-content-muted active:scale-95"
          >
            جزئیات بیشتر — زیرکار، هزینه، مکان، فایل
          </button>
        )}

        <Button size="block" onClick={submit} disabled={saving} isLoading={saving}>
          {editing ? 'ذخیرهٔ تغییرات' : 'اضافه کن'}
        </Button>

        {checklist.length > 0 && !editing ? (
          <p className="text-center text-caption-sm text-content-muted">
            {toPersianDigits(checklist.length)} قدم کوچک — همین که نوشتی، نصفش انجام شده.
          </p>
        ) : null}
      </div>
    </Sheet>
  );
}
