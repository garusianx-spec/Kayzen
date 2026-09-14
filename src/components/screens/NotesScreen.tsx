'use client';

import { Search, StickyNote } from 'lucide-react';
import { useEffect, useState } from 'react';

import { EmptyState } from '@/components/screens/TodayScreen';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { NoteCard } from '@/components/widgets/NoteCard';
import { useNotes, useSession } from '@/lib/api/queries';
import { toPersianDigits } from '@/lib/date/digits';

/**
 * Notes.
 *
 * Search is debounced through a second piece of state rather than firing a
 * request per keystroke: Persian input methods commit characters in bursts, and
 * an un-debounced field turns one word into six round trips.
 */
export function NotesScreen() {
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const { data: notes, isLoading } = useNotes(debouncedQuery);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedQuery(query), 300);
    return () => window.clearTimeout(timer);
  }, [query]);
  const { data: user } = useSession();

  const pinned = notes?.filter((note) => note.isPinned) ?? [];
  const rest = notes?.filter((note) => !note.isPinned) ?? [];

  return (
    <div className="space-y-5 px-4 pt-4">
      <header className="space-y-1">
        <h1 className="text-display text-content-primary">یادداشت‌ها</h1>
        <p className="text-caption text-content-secondary">
          {notes?.length
            ? `${toPersianDigits(notes.length)} یادداشت`
            : 'هرچه را نباید فراموش شود، اینجا بنویسید.'}
        </p>
      </header>

      <div className="relative">
        <Search
          className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-content-muted"
          aria-hidden
        />
        <Input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="جست‌وجو در یادداشت‌ها"
          type="search"
          className="pr-10"
          aria-label="جست‌وجو در یادداشت‌ها"
        />
      </div>

      {isLoading ? (
        <div className="space-y-2">
          <Skeleton className="h-28 w-full" />
          <Skeleton className="h-28 w-full" />
        </div>
      ) : (notes?.length ?? 0) === 0 ? (
        <EmptyState
          title={debouncedQuery ? 'چیزی پیدا نشد' : 'هنوز یادداشتی ندارید'}
          description={
            debouncedQuery
              ? 'عبارت دیگری را امتحان کنید.'
              : 'با دکمهٔ + یک یادداشت سریع اضافه کنید.'
          }
        />
      ) : (
        <div className="space-y-4">
          {pinned.length ? (
            <section aria-label="سنجاق‌شده" className="space-y-2">
              <h2 className="flex items-center gap-2 text-caption text-violet">
                <StickyNote className="h-4 w-4" aria-hidden />
                سنجاق‌شده
              </h2>
              {pinned.map((note) => (
                <NoteCard key={note.id} note={note} timezone={user?.timezone} />
              ))}
            </section>
          ) : null}

          {rest.length ? (
            <section aria-label="یادداشت‌ها" className="space-y-2">
              {pinned.length ? (
                <h2 className="text-caption text-content-muted">بقیهٔ یادداشت‌ها</h2>
              ) : null}
              {rest.map((note) => (
                <NoteCard key={note.id} note={note} timezone={user?.timezone} />
              ))}
            </section>
          ) : null}
        </div>
      )}
    </div>
  );
}
