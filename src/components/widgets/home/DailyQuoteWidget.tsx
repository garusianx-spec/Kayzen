'use client';

import { Quote } from 'lucide-react';

import { quoteForDay } from '../../../../prisma/data/quotes';

/**
 * جملهٔ روز.
 *
 * Chosen by day key rather than at random, so everyone reading the app today
 * sees the same line and re-opening it is never a way to shop for a nicer one.
 *
 * Set larger than body copy and given room to breathe: a motivational line
 * crammed into a caption reads as filler, which is the one thing it must not
 * be. The attribution is omitted entirely when the saying is proverbial — a
 * wrong attribution is worse than none.
 */
export function DailyQuoteWidget({ dayKey }: { dayKey: string }) {
  const quote = quoteForDay(dayKey);

  return (
    <section className="kz-card space-y-2" aria-label="جملهٔ روز">
      <Quote className="h-5 w-5 text-violet" aria-hidden />

      <blockquote className="text-title leading-8 text-content-primary">{quote.text}</blockquote>

      {quote.author ? (
        <figcaption className="text-caption text-content-muted">— {quote.author}</figcaption>
      ) : null}
    </section>
  );
}
