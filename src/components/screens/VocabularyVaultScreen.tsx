'use client';

import { ArrowRight, Search } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';

import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { useHapticFeedback } from '@/hooks/use-haptic-feedback';
import { useVocabularyVault } from '@/lib/api/queries';
import { toPersianDigits } from '@/lib/date/digits';
import { LANGUAGE_FLAGS, LANGUAGE_LABELS, LEARNING_LANGUAGES } from '@/lib/domain/vocabulary';
import { cn } from '@/lib/utils';

/**
 * گنجینهٔ واژه‌ها — everything this learner has met, grouped by language.
 *
 * Search covers the term, its Persian meaning *and* its transliteration,
 * because the thing a learner has kept is unpredictable: sometimes the shape of
 * the word, sometimes what it meant, and often only how it sounded.
 *
 * The default filter is everything rather than only mastered words. A vault
 * that hid the words you are still working on would answer "what do I know?"
 * and refuse "what was that word again?" — and the second question is the one
 * people actually arrive with.
 */

const STATUSES = [
  { value: 'ALL', label: 'همه' },
  { value: 'MASTERED', label: 'یادگرفته' },
  { value: 'REVIEWING', label: 'در حال مرور' },
  { value: 'LEARNING', label: 'تازه' },
] as const;

export function VocabularyVaultScreen() {
  const [search, setSearch] = useState('');
  const [language, setLanguage] = useState<string | undefined>();
  const [status, setStatus] = useState<string>('ALL');
  const haptics = useHapticFeedback();

  const vault = useVocabularyVault({ search: search.trim() || undefined, language, status });

  return (
    <div className="space-y-5 px-4 pt-4">
      <header className="space-y-3">
        <div className="flex items-center gap-2">
          <Link
            href="/tools/vocabulary"
            onClick={() => haptics.selection()}
            aria-label="بازگشت"
            className="flex h-11 w-11 items-center justify-center rounded-full border border-border text-content-muted active:scale-95"
          >
            <ArrowRight className="h-5 w-5" aria-hidden />
          </Link>
          <div>
            <h1 className="text-title-lg text-content-primary">گنجینهٔ واژه‌ها</h1>
            <p className="text-caption text-content-muted">
              {vault.data ? `${toPersianDigits(vault.data.total)} واژه` : 'در حال شمردن…'}
            </p>
          </div>
        </div>

        <div className="relative">
          <Search
            className="pointer-events-none absolute inset-y-0 start-4 my-auto h-4 w-4 text-content-muted"
            aria-hidden
          />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="واژه، معنی یا تلفظ…"
            className="ps-11"
            aria-label="جست‌وجو در گنجینه"
          />
        </div>

        <div className="flex gap-2 overflow-x-auto pb-1">
          {STATUSES.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => {
                haptics.selection();
                setStatus(option.value);
              }}
              aria-pressed={status === option.value}
              className={cn(
                'min-h-[40px] shrink-0 rounded-pill border px-4 text-caption-sm',
                status === option.value
                  ? 'border-violet bg-violet-soft text-violet'
                  : 'border-border text-content-muted',
              )}
            >
              {option.label}
            </button>
          ))}

          <span className="mx-1 w-px shrink-0 bg-border" aria-hidden />

          {LEARNING_LANGUAGES.map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => {
                haptics.selection();
                setLanguage(language === option ? undefined : option);
              }}
              aria-pressed={language === option}
              className={cn(
                'flex min-h-[40px] shrink-0 items-center gap-1.5 rounded-pill border px-3 text-caption-sm',
                language === option
                  ? 'border-violet bg-violet-soft text-violet'
                  : 'border-border text-content-muted',
              )}
            >
              <span aria-hidden>{LANGUAGE_FLAGS[option]}</span>
              {LANGUAGE_LABELS[option]}
            </button>
          ))}
        </div>
      </header>

      {vault.isLoading ? (
        <div className="space-y-3">
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-full" />
        </div>
      ) : (vault.data?.groups.length ?? 0) === 0 ? (
        <p className="kz-card py-10 text-center text-caption text-content-muted">
          {search
            ? 'چیزی پیدا نشد؛ شاید املای دیگری؟'
            : 'گنجینه هنوز خالی است — اولین کارت امروز پرش می‌کند.'}
        </p>
      ) : (
        vault.data?.groups.map((group) => (
          <section key={group.language} className="space-y-2">
            <h2 className="flex items-baseline gap-2 text-title text-content-primary">
              <span aria-hidden>{group.flag}</span>
              {group.languageLabel}
              <span className="tabular text-caption-sm text-content-muted">
                {toPersianDigits(group.mastered)} از {toPersianDigits(group.total)}
              </span>
            </h2>

            <ul className="space-y-2">
              {group.words.map((word) => (
                <li key={word.id} className="kz-card flex items-center justify-between gap-3 py-3">
                  <div className="min-w-0">
                    <p dir="ltr" className="truncate text-body text-content-primary">
                      {word.term}
                    </p>
                    <p className="truncate text-caption text-content-muted">
                      {word.transliteration ? `${word.transliteration} · ` : ''}
                      {word.meaningFa}
                    </p>
                  </div>

                  <span
                    className={cn(
                      'shrink-0 rounded-pill px-3 py-1 text-caption-sm',
                      word.status === 'MASTERED'
                        ? 'bg-emerald-soft text-emerald'
                        : word.status === 'REVIEWING'
                          ? 'bg-flame-soft text-flame'
                          : 'bg-surface-raised text-content-muted',
                    )}
                  >
                    {word.status === 'MASTERED'
                      ? 'یادگرفته'
                      : word.status === 'REVIEWING'
                        ? 'در مرور'
                        : word.levelLabel}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        ))
      )}
    </div>
  );
}
