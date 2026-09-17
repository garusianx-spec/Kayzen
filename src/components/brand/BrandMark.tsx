'use client';

import { motion, useReducedMotion } from 'framer-motion';

import { KayzenLogo, type KayzenLogoProps } from './KayzenLogo';
import { cn } from '@/lib/utils';

/**
 * The logo, made safe against the surface it sits on.
 *
 * The Kayzen owl is drawn with a near-black silhouette. That is correct on
 * paper and on the light theme, and it is a problem on `#0B0B14`: the two are
 * four percent apart in luminance, so the horns and the outer edge dissolve
 * into the page and the mark reads as a floating violet blob.
 *
 * Three layers solve it, in increasing subtlety, and each is doing a different
 * job — which is why none of them is "just a glow":
 *
 *  1. **The keyline**, already part of the artwork (`--kz-logo-keyline`): a
 *     one-unit white rim inside the silhouette's own edge. It defines the
 *     shape. It is the only layer that survives at 16px.
 *  2. **The aura**: a radial violet wash behind the mark, sized to the optical
 *     bounding box rather than the layout box. It lifts the whole emblem off
 *     the surface without touching its colours, and it is what makes the mark
 *     look *placed* rather than pasted.
 *  3. **The luminescence**: `drop-shadow(0 0 16px rgba(156,136,255,.35))` on
 *     the SVG itself, scaled with the mark so a 24px header logo does not wear
 *     a 16px halo. This is the layer that reads as brand rather than as
 *     contrast engineering.
 *
 * On the light theme the aura and the luminescence are turned off rather than
 * recoloured: a violet halo on `#F8F7FC` is a smudge, and the silhouette needs
 * no help there. The keyline is already theme-aware.
 *
 * The aura is `aria-hidden` and sits behind `pointer-events-none`, so none of
 * this reaches the accessibility tree or the hit area — `KayzenLogo` remains
 * the single thing a screen reader sees, and the 44px touch target belongs to
 * whatever wraps this.
 */

export interface BrandMarkProps extends KayzenLogoProps {
  /**
   * How much separation to engineer.
   *
   * `auto` is the default and the right answer almost everywhere: full
   * treatment on dark, nothing on light. `flat` opts out entirely, for places
   * that already provide their own contrast — a violet-filled button, say,
   * where a violet aura would only muddy the fill.
   */
  emphasis?: 'auto' | 'flat';
  /** Animates the aura on mount. Off for chrome that is always on screen. */
  animate?: boolean;
  className?: string;
}

export function BrandMark({
  emphasis = 'auto',
  animate = false,
  className,
  size = 28,
  ...logo
}: BrandMarkProps) {
  const reduceMotion = useReducedMotion();
  const flat = emphasis === 'flat';

  // The aura is measured against the mark, not the layout: a fixed pixel radius
  // would swallow a 24px logo and disappear behind a 96px one.
  const auraSize = Math.round(size * 2.1);
  const blurRadius = Math.max(8, Math.round(size * 0.6));

  return (
    <span className={cn('relative inline-flex items-center justify-center', className)}>
      {flat ? null : (
        <motion.span
          aria-hidden
          className="dark-aura pointer-events-none absolute left-1/2 top-1/2 -z-10 hidden -translate-x-1/2 -translate-y-1/2 rounded-full"
          style={{ width: auraSize, height: auraSize }}
          initial={animate && !reduceMotion ? { opacity: 0, scale: 0.8 } : false}
          animate={animate && !reduceMotion ? { opacity: 1, scale: 1 } : undefined}
          // A spring rather than a duration: the aura should settle the way the
          // rest of the app's motion settles, not fade on a timer.
          transition={{ type: 'spring', stiffness: 220, damping: 24 }}
        />
      )}

      <KayzenLogo
        {...logo}
        size={size}
        className={cn('relative', flat ? undefined : 'kz-logo-glow')}
        style={flat ? undefined : { ['--kz-logo-glow-blur' as string]: `${blurRadius}px` }}
      />
    </span>
  );
}
