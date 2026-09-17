'use client';

import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { Check, RotateCcw, X } from 'lucide-react';
import { useState } from 'react';

import { useHapticFeedback } from '@/hooks/use-haptic-feedback';
import { toPersianDigits } from '@/lib/date/digits';
import { MASTERY_THRESHOLD } from '@/lib/domain/vocabulary';
import { cn } from '@/lib/utils';
import type { VocabularyWordDto } from '@/types/domain';

/**
 * One word, two faces.
 *
 * The card shows the foreign word and asks the learner to recall the Persian
 * before turning it over. That order is the whole method: recognising a meaning
 * you are looking at teaches nothing, and a card that shows both sides at once
 * is a glossary, not a flashcard.
 *
 * The flip is a real 3D rotation rather than a cross-fade, because the gesture
 * has to say "the same object, other side" — a fade says "a different thing",
 * which is exactly the wrong mental model for a pair the learner is trying to
 * bind together.
 *
 * `prefers-reduced-motion` gets an instant swap. A rotating card is one of the
 * motions that actually makes people feel unwell.
 */

export function Flashcard({
  word,
  onAnswer,
  disabled = false,
}: {
  word: VocabularyWordDto;
  onAnswer: (correct: boolean) => void;
  disabled?: boolean;
}) {
  const [revealed, setRevealed] = useState(false);
  const haptics = useHapticFeedback();
  const reduceMotion = useReducedMotion();

  const flip = (): void => {
    haptics.impact('light');
    setRevealed((previous) => !previous);
  };

  const answer = (correct: boolean): void => {
    haptics.impact(correct ? 'success' : 'light');
    setRevealed(false);
    onAnswer(correct);
  };

  const remaining = Math.max(0, MASTERY_THRESHOLD - word.correctRuns);

  return (
    <div className="space-y-3">
      <motion.button
        type="button"
        onClick={flip}
        aria-label={revealed ? 'برگرداندن کارت' : 'دیدن معنی'}
        className={cn(
          'relative flex min-h-[176px] w-full flex-col items-center justify-center gap-2',
          'kz-card overflow-hidden px-6 text-center',
        )}
        style={{ transformStyle: 'preserve-3d' }}
        animate={reduceMotion ? undefined : { rotateY: revealed ? 180 : 0 }}
        transition={{ type: 'spring', stiffness: 260, damping: 26 }}
        whileTap={reduceMotion ? undefined : { scale: 0.98 }}
      >
        <AnimatePresence mode="wait" initial={false}>
          {revealed ? (
            <motion.div
              key="back"
              // Counter-rotated so the text is not mirrored on the far face.
              style={reduceMotion ? undefined : { transform: 'rotateY(180deg)' }}
              initial={reduceMotion ? false : { opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={reduceMotion ? undefined : { opacity: 0 }}
              className="space-y-1.5"
            >
              <p className="text-display text-violet">{word.meaningFa}</p>
              {word.partOfSpeech ? (
                <p className="text-caption text-content-muted">{word.partOfSpeech}</p>
              ) : null}
              {word.exampleFa ? (
                <p className="text-caption text-content-secondary">{word.exampleFa}</p>
              ) : null}
            </motion.div>
          ) : (
            <motion.div
              key="front"
              initial={reduceMotion ? false : { opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={reduceMotion ? undefined : { opacity: 0 }}
              className="space-y-1.5"
            >
              <p dir="ltr" className="text-display text-content-primary">
                {word.term}
              </p>
              {word.transliteration ? (
                <p className="text-body text-content-muted">{word.transliteration}</p>
              ) : null}
              <p className="text-caption-sm text-content-muted">برای دیدن معنی بزن</p>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.button>

      {revealed ? (
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => answer(false)}
            disabled={disabled}
            className="flex min-h-[48px] flex-1 items-center justify-center gap-2 rounded-card border border-border text-caption text-content-muted active:scale-95 disabled:opacity-50"
          >
            <RotateCcw className="h-4 w-4" aria-hidden />
            هنوز نه
          </button>
          <button
            type="button"
            onClick={() => answer(true)}
            disabled={disabled}
            className="flex min-h-[48px] flex-1 items-center justify-center gap-2 rounded-card border border-emerald bg-emerald-soft text-caption text-emerald active:scale-95 disabled:opacity-50"
          >
            <Check className="h-4 w-4" aria-hidden />
            بلدم
          </button>
        </div>
      ) : null}

      <p className="text-center text-caption-sm text-content-muted">
        {word.status === 'MASTERED' ? (
          <span className="text-emerald">در گنجینه ثبت شد ✓</span>
        ) : remaining === MASTERY_THRESHOLD ? (
          'تازه شروع کردی'
        ) : (
          `${toPersianDigits(remaining)} بار دیگر پشت سر هم تا گنجینه`
        )}
      </p>
    </div>
  );
}

/** Shown when a session finishes. Small, warm, and not a dead end. */
export function FlashcardsDone({ onRestart }: { onRestart(): void }) {
  return (
    <div className="kz-card space-y-3 py-8 text-center">
      <p className="text-title text-content-primary">مرور امروز تمام شد 🌱</p>
      <p className="text-caption text-content-muted">
        همین ده واژه، هر روز — یک درصد بهتر از دیروز.
      </p>
      <button
        type="button"
        onClick={onRestart}
        className="mx-auto flex min-h-[44px] items-center gap-2 rounded-pill border border-border px-5 text-caption text-content-secondary active:scale-95"
      >
        <X className="h-4 w-4 rotate-45" aria-hidden />
        یک دور دیگر
      </button>
    </div>
  );
}
