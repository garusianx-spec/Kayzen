import { describe, expect, it } from 'vitest';

import {
  LANGUAGE_LABELS,
  LEARNING_LANGUAGES,
  LEARNING_LEVELS,
  LEVEL_LABELS,
  MASTERY_THRESHOLD,
  nextMastery,
  seededShuffle,
  selectDailyWords,
} from '@/lib/domain/vocabulary';

/**
 * The daily vocabulary engine.
 *
 * Its three promises are all invisible when kept and obvious when broken: the
 * same ten words all day, no repeat until the corpus runs dry, and yesterday
 * staying yesterday when the corpus grows.
 */

const pool = Array.from({ length: 50 }, (_, index) => ({ id: `w${index}` }));
const none = new Set<string>();

describe('selectDailyWords', () => {
  it('returns the same ten words all day', () => {
    const args = {
      pool,
      alreadySeen: none,
      userId: 'u1',
      language: 'ENGLISH',
      dayKey: '1405-06-26',
    } as const;

    const morning = selectDailyWords({ ...args });
    const evening = selectDailyWords({ ...args });

    expect(morning.words).toHaveLength(10);
    expect(evening.words.map((word) => word.id)).toEqual(morning.words.map((word) => word.id));
  });

  it('gives a different day, and a different learner, different words', () => {
    const base = { pool, alreadySeen: none, language: 'ENGLISH' } as const;

    const today = selectDailyWords({ ...base, userId: 'u1', dayKey: '1405-06-26' });
    const tomorrow = selectDailyWords({ ...base, userId: 'u1', dayKey: '1405-06-27' });
    const someoneElse = selectDailyWords({ ...base, userId: 'u2', dayKey: '1405-06-26' });

    expect(tomorrow.words.map((w) => w.id)).not.toEqual(today.words.map((w) => w.id));
    expect(someoneElse.words.map((w) => w.id)).not.toEqual(today.words.map((w) => w.id));
  });

  it('never repeats a word while unseen ones remain', () => {
    const seen = new Set<string>();

    // Five days through a fifty-word pool: every word should be new.
    for (let day = 0; day < 5; day += 1) {
      const result = selectDailyWords({
        pool,
        alreadySeen: seen,
        userId: 'u1',
        language: 'FRENCH',
        dayKey: `1405-06-${20 + day}`,
      });

      expect(result.wrapped).toBe(false);
      for (const word of result.words) {
        expect(seen.has(word.id)).toBe(false);
        seen.add(word.id);
      }
    }

    expect(seen.size).toBe(50);
  });

  it('says so when it wraps rather than pretending the words are new', () => {
    const seen = new Set(pool.slice(0, 45).map((word) => word.id));

    const result = selectDailyWords({
      pool,
      alreadySeen: seen,
      userId: 'u1',
      language: 'GERMAN',
      dayKey: '1405-06-26',
    });

    expect(result.words).toHaveLength(10);
    // Five genuinely new, five repeats — and the flag is what lets the screen
    // offer the next level instead of quietly recycling.
    expect(result.wrapped).toBe(true);
  });

  it('copes with a corpus smaller than one day', () => {
    const tiny = [{ id: 'a' }, { id: 'b' }];
    const result = selectDailyWords({
      pool: tiny,
      alreadySeen: none,
      userId: 'u1',
      language: 'SPANISH',
      dayKey: '1405-06-26',
    });

    expect(result.words).toHaveLength(2);
    expect(
      selectDailyWords({
        pool: [],
        alreadySeen: none,
        userId: 'u1',
        language: 'SPANISH',
        dayKey: 'x',
      }).words,
    ).toEqual([]);
  });
});

describe('seededShuffle', () => {
  it('is a permutation, and does not mutate its input', () => {
    const input = Object.freeze(['a', 'b', 'c', 'd', 'e']);
    const shuffled = seededShuffle(input, 'seed');

    expect([...shuffled].sort()).toEqual([...input].sort());
    expect(input).toEqual(['a', 'b', 'c', 'd', 'e']);
  });
});

describe('nextMastery', () => {
  it('needs three in a row, and a wrong answer resets the claim', () => {
    let state = nextMastery({ correctRuns: 0, reviewCount: 0 }, true);

    for (let attempt = 1; attempt < MASTERY_THRESHOLD; attempt += 1) {
      state = nextMastery(state, true);
    }
    expect(state.status).toBe('MASTERED');

    // Not a decrement: three in a row is a claim about knowing the word, and a
    // wrong answer is evidence against the whole claim.
    const slipped = nextMastery(state, false);
    expect(slipped.correctRuns).toBe(0);
    expect(slipped.status).toBe('LEARNING');
    expect(slipped.reviewCount).toBe(4);
  });
});

describe('module vocabulary', () => {
  it('covers the five languages and three tiers the brief names', () => {
    expect(LEARNING_LANGUAGES).toHaveLength(5);
    expect(LEARNING_LEVELS).toHaveLength(3);

    for (const language of LEARNING_LANGUAGES) expect(LANGUAGE_LABELS[language]).toBeTruthy();
    expect(Object.values(LEVEL_LABELS)).toEqual(['راحت', 'متوسط', 'سخت']);
  });
});
