import { describe, expect, it } from 'vitest';

// The audit logic lives in the script so `node scripts/check-contrast.mjs`
// prints the full table during design work; the test imports the same table so
// the two can never disagree about what "accessible" means.
import {
  CONTRAST_PAIRS,
  auditTheme,
  contrastRatio,
  readThemes,
} from '../scripts/check-contrast.mjs';

/**
 * Theme contrast.
 *
 * "High contrast in both modes" is only true until someone nudges a token, so
 * it is asserted rather than described. Every pair the UI actually renders is
 * checked against WCAG 2.1: 4.5:1 for body copy, 3:1 for large text and
 * non-text affordances such as borders, status dots and the focus ring.
 *
 * These caught twelve real failures when the semantic layer went in — among
 * them white-on-rose button labels at 3.4:1 on the dark theme, and a light-mode
 * border at 1.24:1 that was effectively invisible.
 */

const themes = await readThemes();

describe.each(['dark', 'light'] as const)('%s theme', (themeName) => {
  const results = auditTheme(themes[themeName], themeName);

  it('defines every token the palette references', () => {
    const missing = results.filter((result) => result.missing).map((result) => result.label);
    expect(missing).toEqual([]);
  });

  // One assertion per pair, named after it, so a failure report says which
  // colour combination regressed rather than just "contrast test failed".
  for (const result of results) {
    it(`${result.label} clears ${result.min}:1`, () => {
      expect(result.ratio).toBeGreaterThanOrEqual(result.min);
    });
  }
});

describe('contrastRatio', () => {
  it('matches the WCAG reference values', () => {
    // Black on white is the definitional maximum for sRGB.
    expect(contrastRatio([0, 0, 0], [255, 255, 255])).toBeCloseTo(21, 5);
    expect(contrastRatio([255, 255, 255], [255, 255, 255])).toBeCloseTo(1, 5);
    // Symmetry: the ratio does not depend on which colour is named first.
    expect(contrastRatio([18, 52, 86], [240, 240, 240])).toBeCloseTo(
      contrastRatio([240, 240, 240], [18, 52, 86]),
      10,
    );
  });
});

describe('token coverage', () => {
  it('checks both the ink and the fill roles', () => {
    // A regression here would mean someone removed a pair rather than fixing a
    // colour, which is the one way this suite could pass while the UI got worse.
    const labels = CONTRAST_PAIRS.map((pair) => pair.label);

    expect(labels).toContain('body text on page');
    expect(labels).toContain('muted text on card');
    expect(labels).toContain('primary button label');
    expect(labels).toContain('destructive button label');
    expect(labels).toContain('focus ring on page');
    expect(CONTRAST_PAIRS.length).toBeGreaterThanOrEqual(20);
  });

  it('keeps the two themes genuinely distinct', () => {
    // The light theme must actually override the palette rather than inherit a
    // dark surface, which is how a "light mode" ships unreadable.
    expect(themes.light['kz-surface']).not.toEqual(themes.dark['kz-surface']);
    expect(themes.light['kz-text-primary']).not.toEqual(themes.dark['kz-text-primary']);
  });
});
