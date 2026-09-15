/**
 * Kayzen brand geometry.
 *
 * The lockup — the Persian wordmark «کایزن» and the owl — is the supplied brand
 * artwork, converted from the delivered vector files and flattened here: every
 * transform is baked into the coordinates and every number is rounded to two
 * decimals of the original 145×50pt drawing, which is finer than a tenth of a
 * pixel at the sizes this renders.
 *
 * Plain ESM rather than TypeScript so `scripts/generate-icons.mjs` can import
 * the same data with bare `node`, which is how the launcher icon and the header
 * stay the same drawing. `logo-geometry.d.mts` types it for the component.
 *
 * Two notes on how the artwork is put together:
 *
 * - The wordmark carries no colour of its own. It is filled with `currentColor`,
 *   so it takes the interface's ink — near-black on the light theme, near-white
 *   on the dark one, which is how the two delivered variants differ — instead of
 *   shipping the same outlines twice.
 *
 * - The dark variant separates the owl from a near-black page with a white
 *   keyline. In the source that keyline is a filled ring clipped to the
 *   silhouette; here it is the same silhouette path stroked and clipped to
 *   itself, which is an inner stroke of half the width. Reproduced against the
 *   supplied artwork at 10× it differs only along antialiased edges.
 *
 * The owl's own colours are fixed, not themed: a logo that shifts hue with the
 * interface is no longer a logo.
 */

/**
 * The drawing's coordinate space is the original artwork's, so the two variants
 * are the same paths seen through different windows. Both windows are half a
 * unit wider than the ink they hold — the delivered files crop the owl's ear
 * tips and chin at the frame edge, and nothing here should reproduce that.
 */
export const LOGO_VIEW_BOX = {
  full: '-0.5 -1.3 146 53',
  mark: '85.1 -1.3 60.4 53',
};

/** Width ÷ height of each window, so a caller can size by height alone. */
export const LOGO_ASPECT = {
  full: 146 / 53,
  mark: 60.4 / 53,
};

export const WORDMARK_PATH =
  'M0.04 31.5ZM6.71 29.42L8.4 29.42L8.4 18.11L14.25 18.11L14.25 30.47C14.25 31.35 14.03 32.16 13.59 32.89C13.16 33.62 12.58 34.2 11.85 34.63C11.13 35.07 10.32 35.29 9.43 35.29L5.66 35.29C4.78 35.29 3.98 35.07 3.25 34.63C2.52 34.2 1.93 33.62 1.49 32.89C1.06 32.16 0.85 31.35 0.85 30.47L0.85 18.11L6.71 18.11L6.71 29.42ZM5.47 16.31C5.46 16.31 5.45 16.31 5.45 16.31C5.45 16.31 5.45 16.3 5.45 16.29L5.45 12.13C5.45 12.12 5.45 12.12 5.45 12.12C5.45 12.12 5.46 12.12 5.47 12.12L9.63 12.12C9.64 12.12 9.64 12.12 9.64 12.12C9.64 12.12 9.64 12.12 9.64 12.13L9.64 16.29C9.64 16.3 9.64 16.31 9.64 16.31C9.64 16.31 9.64 16.31 9.63 16.31L5.47 16.31ZM15.06 31.5ZM16.7 16.29C16.69 16.29 16.68 16.29 16.68 16.29C16.68 16.29 16.68 16.29 16.68 16.27L16.68 12.12C16.68 12.11 16.68 12.1 16.68 12.1C16.68 12.1 16.69 12.1 16.7 12.1L20.86 12.1C20.87 12.1 20.87 12.1 20.87 12.1C20.87 12.1 20.87 12.11 20.87 12.12L20.87 16.27C20.87 16.29 20.87 16.29 20.87 16.29C20.87 16.29 20.87 16.29 20.86 16.29L16.7 16.29ZM15.86 18.11L21.71 18.11L21.71 25.65L22.56 25.65L22.56 31.5L21.28 31.5L21.71 30.44L21.71 30.47C21.71 31.35 21.49 32.16 21.05 32.89C20.62 33.62 20.04 34.2 19.31 34.63C18.59 35.07 17.78 35.29 16.89 35.29L15.86 35.29L15.86 18.11ZM22.56 31.5ZM21.76 25.65L32.52 25.65L32.52 31.5L21.76 31.5L21.76 25.65ZM32.52 31.5ZM35.9 36.41C35.89 36.41 35.89 36.41 35.89 36.4C35.89 36.4 35.89 36.39 35.89 36.38L35.89 33.29C35.89 33.28 35.89 33.27 35.89 33.26C35.89 33.26 35.89 33.26 35.9 33.26L39.85 33.26C39.86 33.26 39.87 33.26 39.87 33.26C39.87 33.27 39.87 33.28 39.87 33.29L39.87 36.38C39.87 36.39 39.87 36.4 39.87 36.4C39.87 36.41 39.86 36.41 39.85 36.41L35.9 36.41ZM32.78 36.41C32.77 36.41 32.76 36.41 32.76 36.4C32.76 36.4 32.76 36.39 32.76 36.38L32.76 33.29C32.76 33.28 32.76 33.27 32.76 33.26C32.76 33.26 32.77 33.26 32.78 33.26L35.87 33.26C35.89 33.26 35.9 33.26 35.9 33.26C35.9 33.27 35.9 33.28 35.9 33.29L35.9 36.38C35.9 36.39 35.9 36.4 35.9 36.4C35.9 36.41 35.89 36.41 35.87 36.41L32.78 36.41ZM31.72 31.5L31.72 25.65L33.37 25.65L33.37 18.11L39.24 18.11L39.24 26.7C39.24 27.58 39.02 28.39 38.58 29.12C38.15 29.85 37.57 30.43 36.84 30.86C36.12 31.29 35.31 31.5 34.42 31.5L31.72 31.5ZM40.06 31.5ZM45.68 31.5C44.8 31.5 44 31.29 43.27 30.86C42.54 30.43 41.95 29.85 41.51 29.12C41.08 28.39 40.87 27.58 40.87 26.7L40.87 19.14C40.87 18.25 41.08 17.45 41.51 16.73C41.95 16 42.54 15.42 43.27 14.99C44 14.56 44.8 14.34 45.68 14.34L46.72 14.34L46.72 25.65L47.57 25.65L47.57 31.5L45.68 31.5ZM47.57 31.5ZM48.42 23.94L48.42 18.11L55.91 10.62L56.64 11.36C57.25 11.97 57.67 12.69 57.88 13.5C58.1 14.31 58.1 15.11 57.9 15.92C57.7 16.73 57.31 17.45 56.72 18.08L56.7 18.1L68.34 18.1C69.23 18.1 70.03 18.32 70.75 18.76C71.48 19.19 72.06 19.77 72.49 20.5C72.92 21.22 73.14 22.02 73.14 22.91L73.14 26.68C73.14 27.56 72.92 28.37 72.49 29.1C72.06 29.83 71.48 30.42 70.75 30.86C70.03 31.29 69.23 31.5 68.34 31.5L46.76 31.5L46.76 25.65L67.29 25.65L67.29 23.94L48.42 23.94Z';
export const OWL_PATHS = {
  body: 'M112.97 0.17C120.03-0.75 126.46 2.11 131.87 6.38C136.85 5.77 141.33 5.31 145 1.56C144.84 2.51 144.65 3.46 144.44 4.4C143.43 8.8 141.21 11.24 137.46 13.58C144.08 26.04 138.64 41.32 126.28 47.48C123.59 48.82 120.86 49.43 117.93 49.85C106.2 51.17 94.79 43.53 91.5 32.17C89.76 26.17 90.04 19.08 93.36 13.64C88.43 10.94 86.31 6.98 85.62 1.56C89.28 5.27 93.73 5.74 98.72 6.39C102.91 2.84 107.49 0.77 112.97 0.17Z',
  faceLight:
    'M93.54 30.14C94.25 30.74 95.22 31.76 95.91 32.44C101.31 36.34 107.17 35.91 112.09 31.39C112.89 32.38 114.6 34.2 115.2 35.1C116.49 33.89 117.65 32.79 118.72 31.37C123.24 35.89 129.75 36.33 134.85 32.48C135.69 31.7 136.53 30.82 137.34 30C136.46 32.05 136.29 33.39 135.11 35.57C132.24 40.91 127.35 44.87 121.52 46.56C115.88 48.18 109.82 47.5 104.68 44.65C98.88 41.45 95.36 36.41 93.54 30.14Z',
  faceDeep:
    'M93.54 30.14C94.25 30.74 95.22 31.76 95.91 32.44C94.7 34.29 101.98 40.54 103.54 41.53C108.41 44.69 114.34 45.76 120 44.5C124.84 43.38 128.86 41.09 132.16 37.39C133.2 36.22 135.3 34.33 135.08 32.62L134.85 32.48C135.69 31.7 136.53 30.82 137.34 30C136.46 32.05 136.29 33.39 135.11 35.57C132.24 40.91 127.35 44.87 121.52 46.56C115.88 48.18 109.82 47.5 104.68 44.65C98.88 41.45 95.36 36.41 93.54 30.14Z',
  eyes: 'M126.67 15.69C130.7 15.31 134.28 18.24 134.71 22.27C135.14 26.3 132.25 29.92 128.23 30.4C125.58 30.72 122.97 29.58 121.39 27.44C119.81 25.29 119.51 22.46 120.6 20.02C121.69 17.59 124.01 15.93 126.67 15.69ZM102.76 15.69C106.82 15.37 110.38 18.38 110.72 22.44C111.07 26.5 108.06 30.07 104 30.43C99.92 30.78 96.34 27.76 95.99 23.68C95.65 19.61 98.68 16.03 102.76 15.69Z',
  brows:
    'M126.06 20.84C126.49 20.67 126.96 20.59 127.42 20.61C129.63 20.7 131.13 21.94 131.03 24.51C131.02 24.92 130.44 25.02 130.21 24.68C129.9 24.2 129.88 23.37 129.46 22.82C129.04 22.27 128.95 22.23 128.37 21.83C128.26 21.75 128.14 21.7 128.02 21.69C126.67 21.52 125.91 22 125.42 22.66C124.4 24.01 123.14 24.16 124.02 22.7C124.43 22.02 124.99 21.4 125.3 21.21C125.6 21.04 125.82 20.93 126.06 20.84ZM131.67 18.26C134.46 19.7 134.66 24.71 132.79 26.9C132.2 27.58 131.91 27.93 131.24 28.53L131.18 28.55L131.09 28.46C134.35 25.09 134.64 21.96 131.67 18.26ZM101.99 20.84C102.41 20.67 102.85 20.58 103.3 20.59C105.41 20.63 106.84 21.75 107.05 24.1C107.08 24.46 107.11 24.53 107.02 24.67C106.91 24.83 106.74 24.93 106.55 24.97C106.48 24.99 106.46 24.98 106.35 24.91C106.27 24.87 106.22 24.79 106.2 24.71L106.14 24.48C105.96 23.72 105.74 23.26 105.4 22.86C104.69 22 103.53 21.49 102.44 21.73C101.09 22.04 101.28 23.21 100.6 24.52C100.5 24.72 100.29 24.88 100.06 24.87C100 24.87 99.95 24.86 99.86 24.84C99.74 24.81 99.64 24.72 99.6 24.6C99.57 24.54 99.56 24.46 99.57 24.39C99.91 22.3 100.25 21.51 101.99 20.84ZM98.92 18.64C98.74 18.84 98.63 18.98 98.42 19.14C97.65 19.99 97.19 21.29 97.16 22.41C97.08 25.41 97.99 26.45 99.74 28.45C99.64 28.47 99.64 28.49 99.53 28.4C96.32 25.96 95.85 22.39 98.15 19.07C98.52 18.62 98.41 18.62 98.87 18.46L98.92 18.64Z',
  beakLight:
    'M102.44 6.73C104.66 5.37 106.87 4.07 109.41 3.4C116.11 1.62 122.86 2.87 128.45 6.93L126.84 7.09C120.97 8.34 117.24 11.09 115.42 16.88C113.5 10.82 110.14 8.71 104.18 6.97C103.49 6.92 103.11 6.86 102.44 6.73Z',
  beakDeep:
    'M102.44 6.73C104.66 5.37 106.87 4.07 109.41 3.4C116.11 1.62 122.86 2.87 128.45 6.93L126.84 7.09C126.83 7.04 126.72 6.89 126.69 6.84C120.33 4.35 116.74 2.84 109.44 4.73C108.52 4.97 104.56 6.27 104.18 6.97C103.49 6.92 103.11 6.86 102.44 6.73Z',
};

/**
 * Paint order, back to front. The keyline belongs between `body` and
 * `faceLight` and is not listed here, because it is a stroke of `body` rather
 * than a fill of its own.
 *
 * `eyes` and `brows` each merge the left and right sides into one path: the two
 * sides never overlap, so one fill serves both.
 */
export const OWL_LAYER_ORDER = [
  'body',
  'faceLight',
  'faceDeep',
  'eyes',
  'brows',
  'beakLight',
  'beakDeep',
];

export const OWL_COLOURS = {
  body: '#000000',
  faceLight: '#6D28D9',
  faceDeep: '#510EB9',
  eyes: '#FFFFFF',
  brows: '#000000',
  beakLight: '#6D28D9',
  beakDeep: '#510EB9',
};

/**
 * Width of the dark-theme keyline, in artwork units. Clipped to the silhouette
 * it shows as a 1-unit rim inside the owl's edge. Its colour is the
 * `--kz-logo-keyline` token, so the theme decides whether it is drawn at all.
 */
export const OWL_KEYLINE_WIDTH = 2;

/** Ink extent of the owl alone, for callers that lay it out themselves. */
export const OWL_BOUNDS = { x: 85.62, y: -0.75, width: 59.38, height: 51.92 };
