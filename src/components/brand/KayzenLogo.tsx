import { cn } from '@/lib/utils';

/**
 * The Kayzen mark and wordmark.
 *
 * The mark is the three ascending steps that already identify the app on the
 * home screen and in the Play listing — the same geometry
 * `scripts/generate-icons.mjs` rasterises into `public/icons/*.png`, expressed
 * here as vector so a single definition drives both.
 *
 * Inline SVG rather than an `<img>` for three reasons that matter in this app:
 * it inherits the theme through CSS variables instead of needing a second file
 * per mode, it costs no network request on a first paint that is already
 * waiting on a webfont, and it stays crisp on the high-DPI phones this ships to.
 *
 * The wordmark is set in Yekan Bakh rather than converted to outlines. That is
 * deliberate: the brand face is already loaded and preloaded, so outlining it
 * would add bytes to duplicate glyphs the page has, and live text stays
 * selectable and legible to a screen reader.
 */

export interface KayzenLogoProps {
  /** `mark` is the glyph alone; `full` adds the Persian wordmark beside it. */
  variant?: 'mark' | 'full';
  /** `brand` paints the violet gradient; `current` inherits the text colour. */
  tone?: 'brand' | 'current';
  /** Mark size in pixels; the wordmark scales with it. */
  size?: number;
  className?: string;
  /**
   * Accessible name. Pass `null` when adjacent text already names the app, so
   * a screen reader does not announce "Kayzen Kayzen".
   */
  label?: string | null;
}

/**
 * Bar geometry, in the icon's own 0–1 space scaled to a 24-unit viewBox.
 * Kept in one place so the vector and the raster icons cannot drift apart.
 */
const BARS = [
  { x: 2.4, y: 14.4, height: 5.3 },
  { x: 9.1, y: 10.1, height: 9.6 },
  { x: 15.8, y: 5.8, height: 13.9 },
] as const;

const BAR_WIDTH = 5.8;
const BAR_RADIUS = 1.1;

export function KayzenLogo({
  variant = 'full',
  tone = 'brand',
  size = 28,
  className,
  label = 'کایزن',
}: KayzenLogoProps) {
  // A gradient is referenced by id, so two logos on one page would collide;
  // the id is tied to the tone, which is the only thing that varies.
  const gradientId = 'kayzen-logo-gradient';

  return (
    <span
      className={cn('inline-flex items-center gap-2', className)}
      // The whole lockup is one image to assistive tech, or nothing at all when
      // neighbouring text already carries the name.
      {...(label === null ? { 'aria-hidden': true } : { role: 'img', 'aria-label': label })}
    >
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        aria-hidden
        className="shrink-0"
      >
        {tone === 'brand' ? (
          <defs>
            <linearGradient id={gradientId} x1="0" y1="1" x2="1" y2="0">
              <stop offset="0%" stopColor="rgb(var(--primary-from))" />
              <stop offset="100%" stopColor="rgb(var(--primary-to))" />
            </linearGradient>
          </defs>
        ) : null}

        {BARS.map((bar) => (
          <rect
            key={bar.x}
            x={bar.x}
            y={bar.y}
            width={BAR_WIDTH}
            height={bar.height}
            rx={BAR_RADIUS}
            fill={tone === 'brand' ? `url(#${gradientId})` : 'currentColor'}
          />
        ))}
      </svg>

      {variant === 'full' ? (
        <span
          className="font-yekan-bakh font-bold leading-none tracking-tight text-foreground"
          style={{ fontSize: size * 0.72 }}
        >
          کایزن
        </span>
      ) : null}
    </span>
  );
}
