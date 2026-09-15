/**
 * Types for the brand geometry.
 *
 * `logo-geometry.mjs` is plain ESM so the icon generator can import it under
 * bare `node`; these declarations let the React component consume it with no
 * `any` in sight.
 */

export type OwlLayer =
  | 'body'
  | 'faceLight'
  | 'faceDeep'
  | 'eyes'
  | 'brows'
  | 'beakLight'
  | 'beakDeep';

export type LogoVariant = 'mark' | 'full';

export declare const LOGO_VIEW_BOX: Record<LogoVariant, string>;

export declare const LOGO_ASPECT: Record<LogoVariant, number>;

export declare const WORDMARK_PATH: string;

export declare const OWL_PATHS: Record<OwlLayer, string>;

export declare const OWL_LAYER_ORDER: readonly OwlLayer[];

export declare const OWL_COLOURS: Record<OwlLayer, string>;

export declare const OWL_KEYLINE_WIDTH: number;

export declare const OWL_BOUNDS: { x: number; y: number; width: number; height: number };
