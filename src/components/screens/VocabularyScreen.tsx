'use client';

import { motion } from 'framer-motion';
import { Archive, Languages, Plus, Sparkles } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';

import { Flashcard, FlashcardsDone } from '@/components/vocabulary/Flashcard';
import { Sheet } from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/components/ui/toast';
import { useHapticFeedback } from '@/hooks/use-haptic-feedback';
import {
  useAddLanguageCourse,
  useReviewWord,
  useUpdateLanguageCourse,
  useVocabulary,
} from '@/lib/api/queries';
import { toPersianDigits } from '@/lib/date/digits';
import {
  LANGUAGE_FLAGS,
  LANGUAGE_LABELS,
  LEARNING_LANGUAGES,
  LEARNING_LEVELS,
  LEVEL_LABELS,
  MAX_ACTIVE_COURSES,
} from '@/lib/domain/vocabulary';
import { cn } from '@/lib/utils';

/**
 * یادگیری زبان روزانه — the daily vocabulary screen.
 *
 * One tab per active language, ten cards a day inside each. The tab bar only
 * appears from the second language onward: a single-item tab bar is a label
 * pretending to be a control.
 *
 * The empty state is a chooser rather than an apology. Someone arriving here
 * has already decided they want to learn something; the screen's job is to get
 * out of the way, not to explain itself.
 */

export function VocabularyScreen() {
  const courses = useVocabulary();
  const addCourse = useAddLanguageCourse();
  const updateCourse = useUpdateLanguageCourse();
  const review = useReviewWord();
  const haptics = useHapticFeedback();
  const { success } = useToast();

  const [activeIndex, setActiveIndex] = useState(0);
  const [cardIndex, setCardIndex] = useState(0);
  const [picker, setPicker] = useState(false);
  const [pickedLanguage, setPickedLanguage] = useState<string | null>(null);
  const [pickedLevel, setPickedLevel] = useState<string>('BEGINNER');

  if (courses.isLoading) {
    return (
      <div className="space-y-4 px-4 pt-4">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-44 w-full" />
      </div>
    );
  }

  const list = courses.data ?? [];
  const active = list[Math.min(activeIndex, Math.max(0, list.length - 1))];
  const taken = new Set(list.map((course) => course.language));
  const available = LEARNING_LANGUAGES.filter((language) => !taken.has(language));

  const openPicker = (): void => {
    haptics.selection();
    setPickedLanguage(available[0] ?? null);
    setPickedLevel('BEGINNER');
    setPicker(true);
  };

  const answer = async (wordId: string, correct: boolean): Promise<void> => {
    const result = await review.mutateAsync({ wordId, correct });
    if (result.justMastered) success('به گنجینه اضافه شد ✨', 'یک واژهٔ تازه، مال خودت.');
    setCardIndex((index) => index + 1);
  };

  return (
    <div className="space-y-5 px-4 pt-4">
      <header className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-display text-content-primary">زبان روزانه</h1>
          <p className="mt-1 text-caption text-content-muted">هر روز ده واژه. نه بیشتر، نه کمتر.</p>
        </div>

        <Link
          href="/tools/vocabulary/vault"
          onClick={() => haptics.selection()}
          className="flex min-h-[44px] items-center gap-1.5 rounded-pill border border-border px-4 text-caption text-content-secondary active:scale-95"
        >
          <Archive className="h-4 w-4 text-violet" aria-hidden />
          گنجینه
        </Link>
      </header>

      {list.length === 0 ? (
        <section className="kz-card space-y-4 py-8 text-center">
          <Languages className="mx-auto h-10 w-10 text-violet" aria-hidden />
          <div className="space-y-1">
            <p className="text-title text-content-primary">از کدام زبان شروع کنیم؟</p>
            <p className="text-caption text-content-muted">
              تا سه زبان هم‌زمان؛ هر کدام با سطح خودش.
            </p>
          </div>
          <button
            type="button"
            onClick={openPicker}
            className="mx-auto flex min-h-[48px] items-center gap-2 rounded-pill bg-primary px-6 text-caption text-primary-foreground active:scale-95"
          >
            <Plus className="h-4 w-4" aria-hidden />
            انتخاب زبان
          </button>
        </section>
      ) : (
        <>
          {list.length > 1 ? (
            <div role="tablist" aria-label="زبان‌ها" className="flex gap-2 overflow-x-auto pb-1">
              {list.map((course, index) => (
                <button
                  key={course.id}
                  type="button"
                  role="tab"
                  aria-selected={index === activeIndex}
                  onClick={() => {
                    haptics.selection();
                    setActiveIndex(index);
                    setCardIndex(0);
                  }}
                  className={cn(
                    'flex min-h-[44px] shrink-0 items-center gap-2 rounded-pill border px-4 text-caption',
                    index === activeIndex
                      ? 'border-violet bg-violet-soft text-violet'
                      : 'border-border text-content-muted',
                  )}
                >
                  <span aria-hidden>{course.flag}</span>
                  {course.languageLabel}
                </button>
              ))}
            </div>
          ) : null}

          {active ? (
            <section className="space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-caption text-content-secondary">
                  {active.languageLabel} · سطح {active.levelLabel}
                </p>
                <p className="tabular text-caption-sm text-content-muted">
                  {toPersianDigits(active.masteredCount)} از {toPersianDigits(active.corpusSize)}{' '}
                  واژه
                </p>
              </div>

              {active.wrapped ? (
                <p className="flex items-start gap-2 rounded-card bg-flame-soft p-3 text-caption text-flame">
                  <Sparkles className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                  همهٔ واژه‌های این سطح را دیده‌ای؛ از امروز مرور می‌کنیم. آمادهٔ سطح بعدی؟
                </p>
              ) : null}

              {active.words.length === 0 ? (
                <p className="kz-card py-8 text-center text-caption text-content-muted">
                  برای این سطح هنوز واژه‌ای نداریم.
                </p>
              ) : cardIndex >= active.words.length ? (
                <FlashcardsDone onRestart={() => setCardIndex(0)} />
              ) : (
                <motion.div key={cardIndex} layout>
                  <p className="mb-2 text-center text-caption-sm text-content-muted">
                    کارت {toPersianDigits(cardIndex + 1)} از {toPersianDigits(active.words.length)}
                  </p>
                  <Flashcard
                    word={active.words[cardIndex]!}
                    disabled={review.isPending}
                    onAnswer={(correct) => void answer(active.words[cardIndex]!.id, correct)}
                  />
                </motion.div>
              )}

              <div className="flex flex-wrap gap-2">
                {LEARNING_LEVELS.map((level) => (
                  <button
                    key={level}
                    type="button"
                    onClick={() => {
                      haptics.selection();
                      void updateCourse.mutateAsync({ id: active.id, level });
                      setCardIndex(0);
                    }}
                    aria-pressed={active.level === level}
                    className={cn(
                      'min-h-[44px] rounded-pill border px-4 text-caption-sm',
                      active.level === level
                        ? 'border-violet bg-violet-soft text-violet'
                        : 'border-border text-content-muted',
                    )}
                  >
                    {LEVEL_LABELS[level]}
                  </button>
                ))}

                {available.length > 0 && list.length < MAX_ACTIVE_COURSES ? (
                  <button
                    type="button"
                    onClick={openPicker}
                    className="ms-auto flex min-h-[44px] items-center gap-1.5 rounded-pill border border-dashed border-border px-4 text-caption-sm text-content-muted active:scale-95"
                  >
                    <Plus className="h-4 w-4" aria-hidden />
                    زبان تازه
                  </button>
                ) : null}
              </div>
            </section>
          ) : null}
        </>
      )}

      <Sheet open={picker} onOpenChange={setPicker} title="زبان تازه">
        <div className="space-y-5">
          <div className="space-y-2">
            <span className="text-caption text-content-secondary">کدام زبان؟</span>
            <div className="grid grid-cols-2 gap-2">
              {available.map((language) => (
                <button
                  key={language}
                  type="button"
                  onClick={() => {
                    haptics.selection();
                    setPickedLanguage(language);
                  }}
                  aria-pressed={pickedLanguage === language}
                  className={cn(
                    'flex min-h-[52px] items-center gap-2 rounded-card border px-4 text-caption',
                    pickedLanguage === language
                      ? 'border-violet bg-violet-soft text-violet'
                      : 'border-border text-content-muted',
                  )}
                >
                  <span aria-hidden>{LANGUAGE_FLAGS[language]}</span>
                  {LANGUAGE_LABELS[language]}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <span className="text-caption text-content-secondary">با چه سطحی؟</span>
            <div className="grid grid-cols-3 gap-2">
              {LEARNING_LEVELS.map((level) => (
                <button
                  key={level}
                  type="button"
                  onClick={() => {
                    haptics.selection();
                    setPickedLevel(level);
                  }}
                  aria-pressed={pickedLevel === level}
                  className={cn(
                    'min-h-[48px] rounded-card border text-caption',
                    pickedLevel === level
                      ? 'border-violet bg-violet-soft text-violet'
                      : 'border-border text-content-muted',
                  )}
                >
                  {LEVEL_LABELS[level]}
                </button>
              ))}
            </div>
          </div>

          <button
            type="button"
            disabled={!pickedLanguage || addCourse.isPending}
            onClick={async () => {
              if (!pickedLanguage) return;
              await addCourse.mutateAsync({ language: pickedLanguage, level: pickedLevel });
              haptics.impact('success');
              success('اضافه شد', 'از فردا صبح، ده واژهٔ تازه.');
              setPicker(false);
              setCardIndex(0);
            }}
            className="min-h-[52px] w-full rounded-pill bg-primary text-body text-primary-foreground active:scale-95 disabled:opacity-50"
          >
            شروع کن
          </button>
        </div>
      </Sheet>
    </div>
  );
}
