/**
 * Types for the contrast audit.
 *
 * The audit itself is plain ESM so it can be run with bare `node` during design
 * work, with no build step; these declarations let `tests/contrast.test.ts`
 * import it under `allowJs: false` without resorting to `any`.
 */

/** One `R G B` triplet, 0–255 per channel. */
export type Rgb = [number, number, number];

export interface ContrastPair {
  /** Human-readable description, used as the test name. */
  label: string;
  /** Token name of the foreground colour, without the leading `--`. */
  fg: string;
  /** Token name of the background colour, without the leading `--`. */
  bg: string;
  /** WCAG floor: 4.5 for body copy, 3 for large text and non-text affordances. */
  min: number;
}

export interface ContrastResult extends ContrastPair {
  theme: string;
  ratio: number;
  pass: boolean;
  /** True when either token is absent from the stylesheet. */
  missing: boolean;
}

export type ThemeTokens = Record<string, Rgb>;

export declare const CONTRAST_PAIRS: ContrastPair[];

export declare function contrastRatio(foreground: Rgb, background: Rgb): number;

export declare function readThemes(cssPath?: string): Promise<{
  dark: ThemeTokens;
  light: ThemeTokens;
}>;

export declare function auditTheme(tokens: ThemeTokens, themeName: string): ContrastResult[];
