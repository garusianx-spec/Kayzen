'use client';

import { Pin, PinOff, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';

import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { useHapticFeedback } from '@/hooks/use-haptic-feedback';
import { useDeleteNote, useUpdateNote } from '@/lib/api/queries';
import { toPersianDigits } from '@/lib/date/digits';
import { formatRelativeJalali } from '@/lib/date/jalali';
import { renderMarkdown } from '@/lib/sanitize';
import { cn } from '@/lib/utils';
import type { NoteDto } from '@/types/domain';

/**
 * One note.
 *
 * The body is user-authored markdown rendered with `dangerouslySetInnerHTML`,
 * which makes this component the application's XSS boundary. Nothing reaches
 * the DOM that has not been through `renderMarkdown()` — DOMPurify with an
 * explicit tag allow-list, a URI scheme allow-list that rejects `javascript:`
 * and `data:`, and a hook that forces `rel="noopener noreferrer"` on every
 * link. Sanitising on *render* rather than on write means tightening that
 * allow-list later also protects notes already in the database.
 *
 * Collapsed by default: a note is a paragraph or a page, and letting a long one
 * push everything else off screen makes the list useless.
 */
export function NoteCard({ note, timezone }: { note: NoteDto; timezone?: string }) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);

  const updateNote = useUpdateNote();
  const deleteNote = useDeleteNote();
  const haptics = useHapticFeedback();

  // Sanitisation walks the whole document, so it runs once per body change
  // rather than on every render of a scrolling list.
  const html = useMemo(() => renderMarkdown(note.body), [note.body]);

  return (
    <Card className={cn('space-y-3', note.isPinned && 'border-violet/60')}>
      <div className="flex items-start justify-between gap-3">
        <button
          type="button"
          onClick={() => {
            haptics.selection();
            setIsExpanded((open) => !open);
          }}
          aria-expanded={isExpanded}
          className="min-w-0 flex-1 text-right"
        >
          <h3 className="truncate text-title text-content-primary">{note.title}</h3>
          <p className="mt-1 text-caption-sm text-content-muted">
            {formatRelativeJalali(new Date(note.updatedAt), { timeZone: timezone })} ·{' '}
            {toPersianDigits(note.wordCount)} کلمه
          </p>
        </button>

        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            aria-label={note.isPinned ? 'برداشتن سنجاق' : 'سنجاق کردن'}
            aria-pressed={note.isPinned}
            onClick={() => {
              haptics.impact('light');
              updateNote.mutate({ id: note.id, isPinned: !note.isPinned });
            }}
            className={cn(
              'kz-pressable rounded-full p-2',
              note.isPinned ? 'text-violet' : 'text-content-muted hover:text-content-primary',
            )}
          >
            {note.isPinned ? (
              <Pin className="h-4 w-4" aria-hidden fill="currentColor" />
            ) : (
              <PinOff className="h-4 w-4" aria-hidden />
            )}
          </button>

          <button
            type="button"
            aria-label={isConfirmingDelete ? 'تأیید حذف' : 'حذف یادداشت'}
            onClick={() => {
              // Two taps, no dialog: a modal for one row is heavier than the
              // action deserves, and a single tap is too easy to hit by accident.
              if (!isConfirmingDelete) {
                haptics.impact('medium');
                setIsConfirmingDelete(true);
                window.setTimeout(() => setIsConfirmingDelete(false), 3000);
                return;
              }

              haptics.impact('heavy');
              deleteNote.mutate(note.id);
            }}
            className={cn(
              'kz-pressable rounded-full p-2',
              isConfirmingDelete ? 'bg-rose-soft text-rose' : 'text-content-muted hover:text-rose',
            )}
          >
            <Trash2 className="h-4 w-4" aria-hidden />
          </button>
        </div>
      </div>

      {note.tags.length ? (
        <div className="flex flex-wrap gap-1.5">
          {note.tags.map((tag) => (
            <Badge key={tag} tone="violet">
              {tag}
            </Badge>
          ))}
        </div>
      ) : null}

      {note.body ? (
        <div
          data-selectable="true"
          className={cn(
            'prose-kayzen text-body leading-8 text-content-secondary',
            !isExpanded && 'line-clamp-3',
          )}
          // Sanitised by `renderMarkdown`; see the note above.
          dangerouslySetInnerHTML={{ __html: html }}
        />
      ) : null}
    </Card>
  );
}
