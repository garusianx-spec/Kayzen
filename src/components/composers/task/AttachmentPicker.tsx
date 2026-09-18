'use client';

import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { FileText, ImageIcon, Loader2, Paperclip, Plus, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import { useHapticFeedback } from '@/hooks/use-haptic-feedback';
import { toPersianDigits } from '@/lib/date/digits';
import {
  ALLOWED_ATTACHMENT_TYPES,
  MAX_ATTACHMENTS_PER_RECORD,
  formatBytes,
} from '@/lib/storage/constants';
import { cn } from '@/lib/utils';
import type { TaskAttachmentLinkDto } from '@/types/domain';

/**
 * The task file picker.
 *
 * Purely presentational, and deliberately blind to *when* an upload happens:
 * a task being edited already has an id, so its files go up the moment they are
 * picked; a task being written does not exist yet, so its files wait in memory
 * until it does. Both look identical here — one list, with the waiting ones
 * marked — because to the person filling in the form they are the same thing.
 *
 * Images get a thumbnail. A file list of five identical PDF glyphs is a list
 * you have to read; a list of pictures is one you can glance at.
 */

export interface AttachmentPickerProps {
  /** Files already recorded against the task, each with a signed link. */
  saved: TaskAttachmentLinkDto[];
  /** Files chosen but not yet uploaded — always empty when editing. */
  pending: File[];
  isLoading?: boolean;
  isUploading?: boolean;
  error?: string | null;
  onPick(files: File[]): void;
  onRemoveSaved(id: string): void;
  onRemovePending(index: number): void;
}

export function AttachmentPicker({
  saved,
  pending,
  isLoading = false,
  isUploading = false,
  error = null,
  onPick,
  onRemoveSaved,
  onRemovePending,
}: AttachmentPickerProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const haptics = useHapticFeedback();
  const reduceMotion = useReducedMotion();

  const total = saved.length + pending.length;
  const full = total >= MAX_ATTACHMENTS_PER_RECORD;

  return (
    <section aria-label="فایل‌ها" className="space-y-2">
      <div className="flex items-baseline justify-between">
        <span className="flex items-center gap-1.5 text-caption text-content-secondary">
          <Paperclip className="h-3.5 w-3.5" aria-hidden />
          فایل‌ها
        </span>
        {total > 0 ? (
          <span className="tabular text-caption-sm text-content-muted">
            {toPersianDigits(total)} از {toPersianDigits(MAX_ATTACHMENTS_PER_RECORD)}
          </span>
        ) : null}
      </div>

      {isLoading ? (
        <p className="text-caption-sm text-content-muted">در حال آماده‌سازی فایل‌ها…</p>
      ) : null}

      <ul className="space-y-2">
        <AnimatePresence initial={false}>
          {saved.map((attachment) => (
            <motion.li
              key={attachment.id}
              layout={!reduceMotion}
              initial={reduceMotion ? false : { opacity: 0, y: -6 }}
              animate={reduceMotion ? undefined : { opacity: 1, y: 0 }}
              exit={reduceMotion ? undefined : { opacity: 0, height: 0 }}
              transition={{ type: 'spring', stiffness: 380, damping: 32 }}
            >
              <AttachmentRow
                name={attachment.fileName}
                mimeType={attachment.mimeType}
                sizeBytes={attachment.sizeBytes}
                href={attachment.url}
                onRemove={() => {
                  haptics.impact('medium');
                  onRemoveSaved(attachment.id);
                }}
              />
            </motion.li>
          ))}

          {pending.map((file, index) => (
            <motion.li
              key={`${file.name}-${file.lastModified}-${index}`}
              layout={!reduceMotion}
              initial={reduceMotion ? false : { opacity: 0, y: -6 }}
              animate={reduceMotion ? undefined : { opacity: 1, y: 0 }}
              exit={reduceMotion ? undefined : { opacity: 0, height: 0 }}
              transition={{ type: 'spring', stiffness: 380, damping: 32 }}
            >
              <AttachmentRow
                name={file.name}
                mimeType={file.type}
                sizeBytes={file.size}
                file={file}
                hint="بعد از ذخیره آپلود می‌شود"
                onRemove={() => {
                  haptics.impact('medium');
                  onRemovePending(index);
                }}
              />
            </motion.li>
          ))}
        </AnimatePresence>
      </ul>

      <input
        ref={inputRef}
        type="file"
        multiple
        className="sr-only"
        accept={ALLOWED_ATTACHMENT_TYPES.join(',')}
        onChange={(event) => {
          const files = Array.from(event.target.files ?? []);
          // Reset first: picking the same file twice must still fire change.
          event.target.value = '';
          if (files.length) onPick(files);
        }}
      />

      <button
        type="button"
        disabled={isUploading || full}
        onClick={() => {
          haptics.impact('light');
          inputRef.current?.click();
        }}
        className={cn(
          'kz-pressable flex min-h-[44px] w-full items-center justify-center gap-2',
          'rounded-card border border-dashed border-border text-caption text-content-muted',
          'transition-colors active:scale-95 disabled:opacity-50',
          !full && 'hover:border-violet hover:text-violet',
        )}
      >
        {isUploading ? (
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
        ) : (
          <Plus className="h-4 w-4" aria-hidden />
        )}
        {isUploading ? 'در حال بارگذاری…' : full ? 'به سقف فایل‌ها رسیدی' : 'افزودن فایل'}
      </button>

      {error ? (
        <p role="alert" className="text-caption-sm text-rose">
          {error}
        </p>
      ) : (
        <p className="text-caption-sm text-content-muted">تصویر یا PDF، تا ۱۰ مگابایت.</p>
      )}
    </section>
  );
}

function AttachmentRow({
  name,
  mimeType,
  sizeBytes,
  href,
  file,
  hint,
  onRemove,
}: {
  name: string;
  mimeType: string;
  sizeBytes: number;
  href?: string;
  file?: File;
  hint?: string;
  onRemove(): void;
}) {
  const isImage = mimeType.startsWith('image/');
  const preview = useObjectUrl(file);
  const thumbnail = isImage ? (href ?? preview) : null;

  const body = (
    <>
      {/* `rounded-xl`, not the usual `rounded-card`: at 44px that radius is
          near-circular, and a circle reads as an avatar rather than a file. */}
      <span className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-surface-raised">
        {thumbnail ? (
          // Decorative: the filename beside it already names the file.
          // eslint-disable-next-line @next/next/no-img-element
          <img src={thumbnail} alt="" className="h-full w-full object-cover" />
        ) : isImage ? (
          <ImageIcon className="h-4 w-4 text-violet" aria-hidden />
        ) : (
          <FileText className="h-4 w-4 text-sky" aria-hidden />
        )}
      </span>

      <span className="min-w-0 flex-1">
        <span className="block truncate text-caption text-content-secondary">{name}</span>
        <span className="tabular block text-caption-sm text-content-muted">
          {hint ? `${hint} · ${formatBytes(sizeBytes)}` : formatBytes(sizeBytes)}
        </span>
      </span>
    </>
  );

  const shell = 'flex items-center gap-2 rounded-card border border-border bg-card p-2';

  return (
    <div className={shell}>
      {href ? (
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className="flex min-w-0 flex-1 items-center gap-2"
        >
          {body}
        </a>
      ) : (
        <span className="flex min-w-0 flex-1 items-center gap-2">{body}</span>
      )}

      <button
        type="button"
        aria-label={`حذف ${name}`}
        onClick={onRemove}
        className="kz-pressable flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-content-muted hover:text-rose active:scale-95"
      >
        <X className="h-4 w-4" aria-hidden />
      </button>
    </div>
  );
}

/**
 * A blob URL for a staged file, revoked when the row goes away.
 *
 * Without the revoke, every file a user picks and then changes their mind about
 * stays in memory for the life of the tab — which on a phone, in a PWA that is
 * never closed, is the life of the install.
 */
function useObjectUrl(file?: File): string | null {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!file || !file.type.startsWith('image/')) {
      setUrl(null);
      return;
    }

    const created = URL.createObjectURL(file);
    setUrl(created);

    return () => {
      URL.revokeObjectURL(created);
      setUrl(null);
    };
  }, [file]);

  return url;
}
