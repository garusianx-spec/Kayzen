import type { CSSProperties } from 'react';

import { cn } from '@/lib/utils';

import {
  LOGO_ASPECT,
  LOGO_VIEW_BOX,
  OWL_COLOURS,
  OWL_KEYLINE_WIDTH,
  OWL_LAYER_ORDER,
  OWL_PATHS,
  WORDMARK_PATH,
  type LogoVariant,
} from './logo-geometry.mjs';

/**
 * The Kayzen lockup: the owl, and the Persian wordmark «کایزن» beside it.
 *
 * This is the supplied brand artwork rather than a stand-in, drawn from the
 * shared geometry in `logo-geometry.mjs` — the same data
 * `scripts/generate-icons.mjs` rasterises into the launcher icons, so the mark
 * in the header and the mark on the home screen cannot drift apart.
 *
 * Inline SVG rather than an `<img>`, for three reasons that matter here: one
 * drawing serves both themes because the parts that differ between them are CSS
 * (`currentColor` for the wordmark, a token for the keyline), it costs no
 * network request on a first paint already waiting on a webfont, and there is
 * no flash of the wrong variant when the theme is resolved before hydration.
 */

export interface KayzenLogoProps {
  /** `mark` is the owl alone; `full` is the owl with the wordmark. */
  variant?: LogoVariant;
  /** Rendered height in pixels. Width follows from the artwork's proportions. */
  size?: number;
  className?: string;
  /** Passed through for the contrast treatment in `BrandMark`. */
  style?: CSSProperties;
  /**
   * Accessible name. Pass `null` when adjacent markup already names the app, so
   * a screen reader does not announce "Kayzen Kayzen".
   */
  label?: string | null;
}

/**
 * The keyline is clipped to the silhouette to make it an inner stroke, and a
 * clip needs an id. Two logos on one page therefore share one id — harmless,
 * because every instance clips to the identical path in the identical user
 * space, so whichever definition wins produces the same shape.
 */
const KEYLINE_CLIP_ID = 'kayzen-owl-clip';

export function KayzenLogo({
  variant = 'full',
  size = 28,
  className,
  style,
  label = 'کایزن',
}: KayzenLogoProps) {
  return (
    <svg
      viewBox={LOGO_VIEW_BOX[variant]}
      height={size}
      width={size * LOGO_ASPECT[variant]}
      className={cn('block shrink-0', className)}
      style={style}
      {...(label === null ? { 'aria-hidden': true } : { role: 'img', 'aria-label': label })}
    >
      <defs>
        <clipPath id={KEYLINE_CLIP_ID}>
          <path d={OWL_PATHS.body} />
        </clipPath>
      </defs>

      {variant === 'full' ? <path d={WORDMARK_PATH} fill="currentColor" /> : null}

      <path d={OWL_PATHS.body} fill={OWL_COLOURS.body} />

      {/* Invisible on a light page, a white rim on a dark one: the owl is nearly
          black, and without this it dissolves into the surface. Stroking the
          silhouette and clipping it to itself keeps the outer edge exactly where
          the artwork puts it. */}
      <path
        d={OWL_PATHS.body}
        fill="none"
        stroke="var(--kz-logo-keyline)"
        strokeWidth={OWL_KEYLINE_WIDTH}
        clipPath={`url(#${KEYLINE_CLIP_ID})`}
      />

      {OWL_LAYER_ORDER.filter((layer) => layer !== 'body').map((layer) => (
        <path key={layer} d={OWL_PATHS[layer]} fill={OWL_COLOURS[layer]} />
      ))}
    </svg>
  );
}
