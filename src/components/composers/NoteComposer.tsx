'use client';

import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { FieldError, FieldLabel, Input, Textarea } from '@/components/ui/input';
import { Sheet } from '@/components/ui/sheet';
import { Toggle } from '@/components/ui/switch';
import { useToast } from '@/components/ui/toast';
import { useHapticFeedback } from '@/hooks/use-haptic-feedback';
import { isQueued } from '@/lib/api/client';
import { useCreateNote } from '@/lib/api/queries';
import { toPersianDigits } from '@/lib/date/digits';
import { countWords } from '@/lib/sanitize';
import { createNoteSchema } from '@/lib/validation/schemas';

/**
 * "یادداشت سریع" composer.
 *
 * The body is markdown and is stored verbatim; it is sanitised where it is
 * rendered, not where it is written.
 */
export function NoteComposer({ open, onClose }: { open: boolean; onClose(): void }) {
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [isPinned, setIsPinned] = useState(false);
  const [error, setError] = useState<string>();

  const createNote = useCreateNote();
  const haptics = useHapticFeedback();
  const { success, offline } = useToast();

  const submit = async (): Promise<void> => {
    const parsed = createNoteSchema.safeParse({
      title,
      body,
      isPinned,
      colorToken: 'violet',
      tags: [],
      attachments: [],
    });

    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'عنوان یادداشت لازم است.');
      haptics.error();
      return;
    }

    try {
      const result = await createNote.mutateAsync(parsed.data);
      haptics.impact('success');

      if (isQueued(result)) offline('آفلاین ذخیره شد');
      else success('یادداشت ذخیره شد');

      setTitle('');
      setBody('');
      setIsPinned(false);
      setError(undefined);
      onClose();
    } catch {
      setError('ذخیرهٔ یادداشت ممکن نشد؛ دوباره تلاش کنید.');
      haptics.error();
    }
  };

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => !next && onClose()}
      title="یادداشت سریع"
      description="قبل از اینکه فراموش شود"
      footer={
        <Button size="block" onClick={submit} isLoading={createNote.isPending} haptic="medium">
          ذخیرهٔ یادداشت
        </Button>
      }
    >
      <div className="space-y-4 pb-2">
        <div>
          <FieldLabel htmlFor="note-title">عنوان</FieldLabel>
          <Input
            id="note-title"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="موضوع یادداشت"
            hasError={Boolean(error)}
            autoFocus
          />
          <FieldError message={error} />
        </div>

        <div>
          <FieldLabel htmlFor="note-body" hint={`${toPersianDigits(countWords(body))} کلمه`}>
            متن
          </FieldLabel>
          <Textarea
            id="note-body"
            value={body}
            onChange={(event) => setBody(event.target.value)}
            placeholder="می‌توانید از مارک‌داون استفاده کنید…"
            rows={8}
            data-selectable="true"
          />
        </div>

        <Toggle
          id="note-pinned"
          checked={isPinned}
          onCheckedChange={setIsPinned}
          label="سنجاق به بالای فهرست"
          description="یادداشت‌های سنجاق‌شده همیشه اول می‌آیند."
        />
      </div>
    </Sheet>
  );
}
