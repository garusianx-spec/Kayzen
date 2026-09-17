import type { LearningLanguage, LearningLevel } from '@prisma/client';

/**
 * The daily vocabulary engine.
 *
 * What it has to guarantee, in order of how badly each one hurts when broken:
 *
 *  1. **Ten words, the same ten, all day.** A learner who opens the app at
 *     breakfast and again on the bus must see the same list. Anything else and
 *     the module is a slot machine.
 *  2. **No repeats until the corpus is exhausted.** Being shown a word you
 *     already learned, while words you have never seen sit unshown, is the
 *     fastest way to stop trusting a teaching tool.
 *  3. **Stable across a growing corpus.** Adding words tomorrow must not
 *     change what was delivered yesterday. This is why deliveries are
 *     persisted rather than recomputed — determinism over a moving corpus is
 *     not stability.
 *
 * The selection itself is deterministic: a seeded shuffle keyed on the learner,
 * the language and the day. Two people on the same day get different words;
 * the same person on the same day gets the same ones, even if the row was never
 * written — which makes the persisted delivery a cache of a pure function
 * rather than the only copy of an unrepeatable draw.
 */

export const LEARNING_LANGUAGES: readonly LearningLanguage[] = [
  'ENGLISH',
  'TURKISH',
  'FRENCH',
  'GERMAN',
  'SPANISH',
] as const;

export const LEARNING_LEVELS: readonly LearningLevel[] = [
  'BEGINNER',
  'INTERMEDIATE',
  'ADVANCED',
] as const;

/** Persian names, as the UI says them. */
export const LANGUAGE_LABELS: Record<LearningLanguage, string> = {
  ENGLISH: 'انگلیسی',
  TURKISH: 'ترکی استانبولی',
  FRENCH: 'فرانسه',
  GERMAN: 'آلمانی',
  SPANISH: 'اسپانیایی',
};

/** The brief's own words for the three tiers. */
export const LEVEL_LABELS: Record<LearningLevel, string> = {
  BEGINNER: 'راحت',
  INTERMEDIATE: 'متوسط',
  ADVANCED: 'سخت',
};

export const LANGUAGE_FLAGS: Record<LearningLanguage, string> = {
  ENGLISH: '🇬🇧',
  TURKISH: '🇹🇷',
  FRENCH: '🇫🇷',
  GERMAN: '🇩🇪',
  SPANISH: '🇪🇸',
};

/**
 * Three at once, by the brief.
 *
 * Not an arbitrary cap: ten words a day in three languages is thirty, which is
 * already past what a person retains. A fourth would make the module a list to
 * scroll rather than a thing to do.
 */
export const MAX_ACTIVE_COURSES = 3;

export const DEFAULT_WORDS_PER_DAY = 10;

/** Consecutive correct reviews before a word counts as mastered. */
export const MASTERY_THRESHOLD = 3;

/**
 * FNV-1a, 32-bit.
 *
 * A hash rather than `Math.random()` because the whole point is repeatability,
 * and rather than a cryptographic one because nothing here is a secret — this
 * decides which word you see, not whether you may see it.
 */
function hash(seed: string): number {
  let value = 0x811c9dc5;

  for (let index = 0; index < seed.length; index += 1) {
    value ^= seed.charCodeAt(index);
    value = Math.imul(value, 0x01000193) >>> 0;
  }

  return value >>> 0;
}

/** Mulberry32 — small, fast, and good enough to shuffle a word list. */
function generator(seed: number): () => number {
  let state = seed >>> 0;

  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let drawn = Math.imul(state ^ (state >>> 15), 1 | state);
    drawn = (drawn + Math.imul(drawn ^ (drawn >>> 7), 61 | drawn)) ^ drawn;
    return ((drawn ^ (drawn >>> 14)) >>> 0) / 4294967296;
  };
}

/** Fisher–Yates, driven by the seeded generator. Does not mutate the input. */
export function seededShuffle<T>(items: readonly T[], seed: string): T[] {
  const next = generator(hash(seed));
  const shuffled = [...items];

  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(next() * (index + 1));
    [shuffled[index], shuffled[swap]] = [shuffled[swap] as T, shuffled[index] as T];
  }

  return shuffled;
}

export interface SelectionInput<T extends { id: string }> {
  /** Every word in the corpus for this language and level. */
  pool: readonly T[];
  /** Word ids this learner has already been given, in any past delivery. */
  alreadySeen: ReadonlySet<string>;
  userId: string;
  language: LearningLanguage;
  /** Jalali day key in the learner's own timezone. */
  dayKey: string;
  count?: number;
}

export interface SelectionResult<T> {
  words: T[];
  /**
   * True when the corpus ran out of unseen words and the selection wrapped
   * around to already-delivered ones. The UI says so rather than pretending:
   * "you have seen everything at this level" is good news, not a failure.
   */
  wrapped: boolean;
}

/**
 * Picks the day's words.
 *
 * Unseen words first, in an order that is stable for this learner and this day.
 * Only once they run out does it wrap into the seen pile — and it says so, so
 * the screen can offer the next level instead of quietly repeating itself.
 */
export function selectDailyWords<T extends { id: string }>({
  pool,
  alreadySeen,
  userId,
  language,
  dayKey,
  count = DEFAULT_WORDS_PER_DAY,
}: SelectionInput<T>): SelectionResult<T> {
  if (pool.length === 0) return { words: [], wrapped: false };

  const seed = `${userId}:${language}:${dayKey}`;
  const unseen = pool.filter((word) => !alreadySeen.has(word.id));
  const picked = seededShuffle(unseen, seed).slice(0, count);

  if (picked.length >= count || picked.length === pool.length) {
    return { words: picked, wrapped: unseen.length === 0 && pool.length > 0 };
  }

  // Not enough new material: top up from the words already seen, shuffled with
  // a different seed so a wrapped day is not the same wrapped day every time.
  const seen = pool.filter((word) => alreadySeen.has(word.id));
  const filler = seededShuffle(seen, `${seed}:wrap`).slice(0, count - picked.length);

  return { words: [...picked, ...filler], wrapped: filler.length > 0 };
}

/**
 * Where a word stands after one review.
 *
 * Getting it right advances the run; getting it wrong resets it to zero rather
 * than decrementing. Three in a row is a claim about knowing the word, and a
 * wrong answer is evidence against the whole claim, not a small deduction from
 * it.
 */
export function nextMastery(
  current: { correctRuns: number; reviewCount: number },
  correct: boolean,
): { correctRuns: number; reviewCount: number; status: 'LEARNING' | 'REVIEWING' | 'MASTERED' } {
  const correctRuns = correct ? current.correctRuns + 1 : 0;
  const reviewCount = current.reviewCount + 1;

  const status =
    correctRuns >= MASTERY_THRESHOLD ? 'MASTERED' : correctRuns > 0 ? 'REVIEWING' : 'LEARNING';

  return { correctRuns, reviewCount, status };
}

/** `۳ از ۱۰ یاد گرفته‌شده` — progress copy for one course. */
export function courseProgressLabel(mastered: number, total: number): string {
  if (total === 0) return 'هنوز واژه‌ای برای این سطح نداریم.';
  return `${mastered} از ${total} واژه`;
}
