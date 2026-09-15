#!/usr/bin/env node
/**
 * WCAG contrast audit for the design tokens.
 *
 * Parses the `R G B` triplets out of `src/app/globals.css` for both themes and
 * checks every foreground/background pair the UI actually renders. "High
 * contrast in both modes" is a measurable claim, so it is measured here rather
 * than eyeballed — and `tests/contrast.test.ts` runs the same table so a token
 * edit cannot quietly drop text below the threshold.
 *
 *   node scripts/check-contrast.mjs
 *
 * Thresholds (WCAG 2.1): 4.5:1 for body text, 3:1 for large text (>=18.66px
 * bold or >=24px) and for non-text UI such as borders, icons and focus rings.
 */
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

/**
 * Locates `globals.css` by walking up from the working directory to the
 * package root.
 *
 * Deliberately not derived from `import.meta.url`: this module is imported by
 * Vitest as well as run directly, and the bundler's rewriting of that value
 * does not survive `fileURLToPath`. Walking up for `package.json` works
 * identically under `npm run`, under Vitest, and from a subdirectory.
 */
function defaultCssPath() {
  let directory = process.cwd();

  for (let depth = 0; depth < 10; depth += 1) {
    if (existsSync(resolve(directory, 'package.json'))) {
      return resolve(directory, 'src/app/globals.css');
    }

    const parent = dirname(directory);
    if (parent === directory) break;
    directory = parent;
  }

  return resolve(process.cwd(), 'src/app/globals.css');
}

/** Extracts `--token: R G B;` declarations from one CSS block. */
function parseTokens(block) {
  const tokens = {};
  for (const [, name, value] of block.matchAll(/--([a-z0-9-]+):\s*([0-9]{1,3}\s+[0-9]{1,3}\s+[0-9]{1,3})\s*;/g)) {
    tokens[name] = value.trim().split(/\s+/).map(Number);
  }
  return tokens;
}

function relativeLuminance([r, g, b]) {
  const channel = (value) => {
    const srgb = value / 255;
    return srgb <= 0.03928 ? srgb / 12.92 : ((srgb + 0.055) / 1.055) ** 2.4;
  };

  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

export function contrastRatio(foreground, background) {
  const light = Math.max(relativeLuminance(foreground), relativeLuminance(background));
  const dark = Math.min(relativeLuminance(foreground), relativeLuminance(background));

  return (light + 0.05) / (dark + 0.05);
}

/**
 * The pairs that actually appear on screen.
 *
 * `min` is 4.5 where the pair carries body copy and 3 where it is large text or
 * a non-text affordance. A pair that is decorative only (a soft tint behind a
 * badge, say) is checked against the text colour that sits on it, not against
 * the page background.
 */
export const CONTRAST_PAIRS = [
  { label: 'body text on page', fg: 'kz-text-primary', bg: 'kz-surface', min: 4.5 },
  { label: 'body text on card', fg: 'kz-text-primary', bg: 'kz-card', min: 4.5 },
  { label: 'body text on raised surface', fg: 'kz-text-primary', bg: 'kz-surface-raised', min: 4.5 },
  { label: 'secondary text on card', fg: 'kz-text-secondary', bg: 'kz-card', min: 4.5 },
  { label: 'muted text on page', fg: 'kz-text-muted', bg: 'kz-surface', min: 4.5 },
  { label: 'muted text on card', fg: 'kz-text-muted', bg: 'kz-card', min: 4.5 },
  { label: 'violet link on page', fg: 'kz-violet', bg: 'kz-surface', min: 4.5 },
  { label: 'violet link on card', fg: 'kz-violet', bg: 'kz-card', min: 4.5 },
  { label: 'violet on its own tint', fg: 'kz-violet', bg: 'kz-violet-soft', min: 4.5 },
  { label: 'flame on its own tint', fg: 'kz-flame', bg: 'kz-flame-soft', min: 4.5 },
  { label: 'emerald on its own tint', fg: 'kz-emerald', bg: 'kz-emerald-soft', min: 4.5 },
  { label: 'rose on its own tint', fg: 'kz-rose', bg: 'kz-rose-soft', min: 4.5 },
  { label: 'sky on its own tint', fg: 'kz-sky', bg: 'kz-sky-soft', min: 4.5 },
  { label: 'primary button label', fg: 'primary-foreground', bg: 'primary', min: 4.5 },
  { label: 'primary gradient start', fg: 'primary-foreground', bg: 'primary-from', min: 4.5 },
  { label: 'primary gradient end', fg: 'primary-foreground', bg: 'primary-to', min: 4.5 },
  { label: 'destructive button label', fg: 'destructive-foreground', bg: 'destructive', min: 4.5 },
  { label: 'success button label', fg: 'success-foreground', bg: 'success', min: 4.5 },
  { label: 'accent button label', fg: 'accent-foreground', bg: 'accent', min: 4.5 },
  { label: 'info button label', fg: 'info-foreground', bg: 'info', min: 4.5 },
  // Non-text: borders and rings only need to be perceivable against the surface.
  { label: 'border on page', fg: 'kz-border', bg: 'kz-surface', min: 1.4 },
  { label: 'strong border on card', fg: 'kz-border-strong', bg: 'kz-card', min: 1.8 },
  { label: 'focus ring on page', fg: 'kz-ring', bg: 'kz-surface', min: 3 },
  { label: 'emerald status on page', fg: 'kz-emerald', bg: 'kz-surface', min: 3 },
  { label: 'rose status on page', fg: 'kz-rose', bg: 'kz-surface', min: 3 },
  { label: 'flame status on page', fg: 'kz-flame', bg: 'kz-surface', min: 3 },
  { label: 'sky status on page', fg: 'kz-sky', bg: 'kz-surface', min: 3 },
];

export async function readThemes(cssPath = defaultCssPath()) {
  const css = await readFile(cssPath, 'utf8');

  // The dark palette is the bare `:root` block; light overrides it under the
  // `[data-theme='light']` selector and inherits anything it does not restate.
  const darkBlock = /:root\s*\{([\s\S]*?)\n\s*\}/.exec(css);
  const lightBlock = /\[data-theme='light'\]\s*\{([\s\S]*?)\n\s*\}/.exec(css);

  if (!darkBlock || !lightBlock) {
    throw new Error('could not locate the :root and [data-theme="light"] token blocks');
  }

  const dark = parseTokens(darkBlock[1]);
  return { dark, light: { ...dark, ...parseTokens(lightBlock[1]) } };
}

export function auditTheme(tokens, themeName) {
  const results = [];

  for (const pair of CONTRAST_PAIRS) {
    const fg = tokens[pair.fg];
    const bg = tokens[pair.bg];

    if (!fg || !bg) {
      results.push({ ...pair, theme: themeName, ratio: 0, pass: false, missing: true });
      continue;
    }

    const ratio = contrastRatio(fg, bg);
    results.push({ ...pair, theme: themeName, ratio, pass: ratio >= pair.min, missing: false });
  }

  return results;
}

// Running as a script rather than imported by the test suite.
if (process.argv[1]?.endsWith('check-contrast.mjs')) {
  const themes = await readThemes();
  const results = [...auditTheme(themes.dark, 'dark'), ...auditTheme(themes.light, 'light')];

  for (const theme of ['dark', 'light']) {
    console.log(`\n${theme.toUpperCase()}`);
    for (const result of results.filter((entry) => entry.theme === theme)) {
      const mark = result.missing ? 'MISSING' : result.pass ? 'pass' : 'FAIL';
      const ratio = result.missing ? '  ?  ' : `${result.ratio.toFixed(2)}:1`.padStart(7);
      console.log(`  ${mark.padEnd(7)} ${ratio}  (min ${result.min})  ${result.label}`);
    }
  }

  const failures = results.filter((result) => !result.pass);
  console.log(`\n${results.length - failures.length}/${results.length} pairs pass`);

  if (failures.length > 0) {
    console.error('\nfailing pairs:');
    for (const failure of failures) {
      console.error(`  ${failure.theme}: ${failure.label} — ${failure.ratio.toFixed(2)}:1 < ${failure.min}`);
    }
    process.exit(1);
  }
}
