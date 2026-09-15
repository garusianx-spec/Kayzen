import localFont from 'next/font/local';

/**
 * Yekan Bakh — the brand typeface.
 *
 * Loaded through `next/font/local` rather than hand-written `@font-face` rules,
 * which buys three things that matter on a Persian mobile app:
 *
 *  - **Self-hosting with hashed, immutable URLs.** The files are emitted under
 *    `/_next/static/media/`, so they inherit the build's long-lived cache
 *    headers and the service worker's cache-first rule for `/_next/static/`
 *    without a bespoke entry.
 *  - **A preload link in the document head.** A Persian webfont that arrives
 *    late is not a cosmetic problem: with `display: swap` the first frame
 *    renders in a fallback whose glyph widths differ enough to reflow a whole
 *    screen of text.
 *  - **One CSS variable.** `--font-yekan-bakh` is consumed by the Tailwind
 *    `fontFamily` stack, so no component names the family directly.
 *
 * The files are committed as WOFF2 (46 KiB each, down from 135 KiB of TTF) with
 * the TrueType digital signature stripped — it signs the TTF byte stream, is
 * meaningless once re-flavoured, and browsers ignore it.
 *
 * Licensing: Yekan Bakh is a commercial typeface. These files are committed
 * because the repository owner supplied them; a fork without a licence should
 * remove them, and the fallback stack below keeps Persian text legible when
 * they are absent.
 */
export const yekanBakh = localFont({
  src: [
    {
      path: '../fonts/YekanBakh-Regular.woff2',
      weight: '400',
      style: 'normal',
    },
    {
      path: '../fonts/YekanBakh-Bold.woff2',
      weight: '700',
      style: 'normal',
    },
  ],
  variable: '--font-yekan-bakh',
  // `swap` over `optional`: this is the only face carrying Persian numerals in
  // the design, so rendering it late beats not rendering it at all.
  display: 'swap',
  preload: true,
  // Every fallback must itself cover the Arabic script — falling back to a
  // Latin-only face would leave Persian text in the browser's last-resort font.
  fallback: ['Vazirmatn', 'Tahoma', 'Segoe UI', 'sans-serif'],
});

/**
 * Weights the family actually ships.
 *
 * Only these two are loaded, so the CSS font-matching algorithm resolves
 * everything else onto them: 500 renders as 400, and 600 and 800 both render as
 * 700. Nothing is synthesised — a real bold face exists — but the type scale
 * has two steps rather than the four its numbers suggest, so
 * `tailwind.config.ts` states 400/700 directly instead of implying weights the
 * family cannot produce.
 *
 * `font-synthesis-weight: none` in `globals.css` is the guard for the window
 * before the bold face arrives: on a connected script, a mechanically smeared
 * bold is worse than a regular weight.
 */
export const YEKAN_BAKH_WEIGHTS = [400, 700] as const;
