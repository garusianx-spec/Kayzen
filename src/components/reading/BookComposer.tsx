'use client';

import { useEffect, useState } from 'react';

import { Button } from '@/components/ui/button';
import { FieldError, FieldLabel, Input } from '@/components/ui/input';
import { Sheet } from '@/components/ui/sheet';
import { useToast } from '@/components/ui/toast';
import { useHapticFeedback } from '@/hooks/use-haptic-feedback';
import { useAddBook, useUpdateBook } from '@/lib/api/queries';
import { formatPersianNumber, parsePersianNumber } from '@/lib/date/digits';
import { createBookSchema } from '@/lib/validation/schemas';
import { cn } from '@/lib/utils';
import type { ColorToken, UserBookDto } from '@/types/domain';

/**
 * "کتاب تازه" — putting a book on the shelf, and editing one already there.
 *
 * One component for both, like the task composer: somebody who opens a book to
 * fix a typo in its page count should not meet a different form from the one
 * they filled in.
 *
 * Four fields, and three of them optional-ish. A book needs a name and a
 * length; everything else is decoration, and a shelf that demands an author and
 * an ISBN before it will hold a book is a shelf people stop using.
 */

const COLORS: Array<{ token: ColorToken; className: string; label: string }> = [
  { token: 'violet', className: 'bg-violet', label: 'بنفش' },
  { token: 'flame', className: 'bg-flame', label: 'نارنجی' },
  { token: 'emerald', className: 'bg-emerald', label: 'سبز' },
  { token: 'rose', className: 'bg-rose', label: 'صورتی' },
  { token: 'sky', className: 'bg-sky', label: 'آبی' },
];

export interface BookComposerProps {
  open: boolean;
  onOpenChange(open: boolean): void;
  /** When present the sheet edits this book instead of adding one. */
  book?: UserBookDto | null;
}

export function BookComposer({ open, onOpenChange, book = null }: BookComposerProps) {
  const editing = book !== null;

  const [title, setTitle] = useState('');
  const [author, setAuthor] = useState('');
  const [totalPages, setTotalPages] = useState('');
  const [currentPage, setCurrentPage] = useState('');
  const [colorToken, setColorToken] = useState<ColorToken>('violet');
  const [error, setError] = useState<string>();

  const addBook = useAddBook();
  const updateBook = useUpdateBook();
  const haptics = useHapticFeedback();
  const { success } = useToast();

  const saving = addBook.isPending || updateBook.isPending;

  useEffect(() => {
    if (!open) return;

    setTitle(book?.title ?? '');
    setAuthor(book?.author ?? '');
    setTotalPages(book ? formatPersianNumber(book.totalPages) : '');
    setCurrentPage(book ? formatPersianNumber(book.currentPage) : '');
    setColorToken(book?.colorToken ?? 'violet');
    setError(undefined);
  }, [open, book]);

  const submit = async (): Promise<void> => {
    const parsed = createBookSchema.safeParse({
      title,
      author: author.trim() || undefined,
      totalPages: parsePersianNumber(totalPages) ?? Number.NaN,
      currentPage: parsePersianNumber(currentPage) ?? 0,
      colorToken,
    });

    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'اطلاعات کامل نیست.');
      haptics.error();
      return;
    }

    if (parsed.data.currentPage > parsed.data.totalPages) {
      setError('صفحهٔ فعلی از کل صفحه‌ها بیشتر است.');
      haptics.error();
      return;
    }

    try {
      if (editing) {
        await updateBook.mutateAsync({
          id: book.id,
          title: parsed.data.title,
          // `null` clears it; an edit that empties the field means to empty it.
          author: author.trim() === '' ? null : parsed.data.author,
          totalPages: parsed.data.totalPages,
          currentPage: parsed.data.currentPage,
          colorToken: parsed.data.colorToken,
        } as Parameters<typeof updateBook.mutateAsync>[0]);
      } else {
        await addBook.mutateAsync(parsed.data);
      }

      haptics.impact('success');
      success(
        editing ? 'به‌روز شد' : 'روی قفسه نشست',
        editing ? undefined : 'صفحهٔ اول منتظر است.',
      );
      onOpenChange(false);
    } catch {
      haptics.error();
      setError('ذخیره نشد؛ دوباره تلاش کن.');
    }
  };

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title={editing ? 'ویرایش کتاب' : 'کتاب تازه'}
      description={editing ? undefined : 'کتابی که این روزها دستت است.'}
    >
      <div className="space-y-5">
        <div>
          <FieldLabel htmlFor="book-title">نام کتاب</FieldLabel>
          <Input
            id="book-title"
            value={title}
            onChange={(event) => {
              setTitle(event.target.value);
              setError(undefined);
            }}
            placeholder="مثلاً: ملت عشق"
            hasError={Boolean(error)}
            enterKeyHint="next"
            autoFocus
          />
          <FieldError message={error} />
        </div>

        <div>
          <FieldLabel htmlFor="book-author">نویسنده (اختیاری)</FieldLabel>
          <Input
            id="book-author"
            value={author}
            onChange={(event) => setAuthor(event.target.value)}
            placeholder="الیف شافاک"
            maxLength={160}
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <FieldLabel htmlFor="book-total">کل صفحه‌ها</FieldLabel>
            <Input
              id="book-total"
              value={totalPages}
              onChange={(event) => {
                setTotalPages(event.target.value);
                setError(undefined);
              }}
              inputMode="numeric"
              dir="ltr"
              className="tabular text-end"
              placeholder="۵۱۲"
            />
          </div>

          <div>
            <FieldLabel htmlFor="book-current">الان کجایی؟</FieldLabel>
            <Input
              id="book-current"
              value={currentPage}
              onChange={(event) => {
                setCurrentPage(event.target.value);
                setError(undefined);
              }}
              inputMode="numeric"
              dir="ltr"
              className="tabular text-end"
              placeholder="۰"
            />
          </div>
        </div>

        <div className="space-y-2">
          <span className="text-caption text-content-secondary">رنگ عطف</span>
          <div className="flex gap-2">
            {COLORS.map((color) => (
              <button
                key={color.token}
                type="button"
                aria-label={color.label}
                aria-pressed={colorToken === color.token}
                onClick={() => {
                  haptics.selection();
                  setColorToken(color.token);
                }}
                className={cn(
                  'flex h-11 w-11 items-center justify-center rounded-full transition-transform active:scale-90',
                  colorToken === color.token &&
                    'ring-2 ring-content-primary ring-offset-2 ring-offset-card',
                )}
              >
                <span className={cn('h-6 w-6 rounded-full', color.className)} aria-hidden />
              </button>
            ))}
          </div>
        </div>

        <Button size="block" onClick={submit} disabled={saving} isLoading={saving}>
          {editing ? 'ذخیرهٔ تغییرات' : 'بگذارش روی قفسه'}
        </Button>
      </div>
    </Sheet>
  );
}
