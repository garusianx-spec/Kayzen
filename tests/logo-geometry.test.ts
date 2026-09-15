import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  LOGO_ASPECT,
  LOGO_VIEW_BOX,
  OWL_BOUNDS,
  OWL_COLOURS,
  OWL_KEYLINE_WIDTH,
  OWL_LAYER_ORDER,
  OWL_PATHS,
  WORDMARK_PATH,
} from '../src/components/brand/logo-geometry.mjs';

/**
 * Brand geometry.
 *
 * The lockup is traced artwork, so the risk is not that it looks wrong today —
 * it is that a later edit nudges a number and the owl's ear tips get clipped by
 * the viewBox, or a layer quietly loses its colour. Both are invisible in a
 * diff and obvious on a phone, which is exactly the kind of thing to assert.
 *
 * Every check below works on the control points rather than the drawn curve. A
 * Bézier never leaves the hull of its control points, so "every control point
 * is inside the window" proves the ink is too, with no curve maths in a test.
 */

/** Every coordinate pair in a path, control points included. */
function controlPoints(d: string): Array<[number, number]> {
  const numbers = [...d.matchAll(/-?\d*\.?\d+/g)].map((match) => Number(match[0]));
  expect(numbers.length % 2).toBe(0);

  const points: Array<[number, number]> = [];
  for (let index = 0; index + 1 < numbers.length; index += 2) {
    const [x, y] = [numbers[index], numbers[index + 1]];
    if (x === undefined || y === undefined) break;
    points.push([x, y]);
  }

  return points;
}

function hull(paths: string[]) {
  const points = paths.flatMap(controlPoints);
  const xs = points.map(([x]) => x);
  const ys = points.map(([, y]) => y);

  return {
    minX: Math.min(...xs),
    minY: Math.min(...ys),
    maxX: Math.max(...xs),
    maxY: Math.max(...ys),
  };
}

function parseViewBox(viewBox: string) {
  const parts = viewBox.split(/\s+/).map(Number);
  expect(parts).toHaveLength(4);

  const [x = 0, y = 0, width = 0, height = 0] = parts;
  return { x, y, width, height, right: x + width, bottom: y + height };
}

const OWL_PATH_LIST = OWL_LAYER_ORDER.map((layer) => OWL_PATHS[layer]);

describe('logo geometry', () => {
  it('uses only the absolute commands the icon rasteriser understands', () => {
    // `scripts/generate-icons.mjs` throws on anything else, and it runs in CI
    // rather than in a browser, so an unsupported command fails the build.
    for (const d of [WORDMARK_PATH, ...OWL_PATH_LIST]) {
      expect(d.replace(/[MLCZ\d.\s-]/g, '')).toBe('');
      expect(d.startsWith('M')).toBe(true);
    }
  });

  it('gives every layer a path and a colour', () => {
    for (const layer of OWL_LAYER_ORDER) {
      expect(OWL_PATHS[layer], layer).toMatch(/^M/);
      expect(OWL_COLOURS[layer], layer).toMatch(/^#[0-9A-F]{6}$/);
    }

    expect(new Set(OWL_LAYER_ORDER).size).toBe(OWL_LAYER_ORDER.length);
    expect(OWL_LAYER_ORDER[0]).toBe('body');
  });

  it('keeps the mark inside its window', () => {
    // The delivered files crop the owl at the frame edge; the whole point of
    // restating the window here is that this build does not.
    const box = parseViewBox(LOGO_VIEW_BOX.mark);
    const ink = hull(OWL_PATH_LIST);

    expect(ink.minX).toBeGreaterThanOrEqual(box.x);
    expect(ink.minY).toBeGreaterThanOrEqual(box.y);
    expect(ink.maxX).toBeLessThanOrEqual(box.right);
    expect(ink.maxY).toBeLessThanOrEqual(box.bottom);
  });

  it('keeps the whole lockup inside its window', () => {
    const box = parseViewBox(LOGO_VIEW_BOX.full);
    const ink = hull([WORDMARK_PATH, ...OWL_PATH_LIST]);

    expect(ink.minX).toBeGreaterThanOrEqual(box.x);
    expect(ink.minY).toBeGreaterThanOrEqual(box.y);
    expect(ink.maxX).toBeLessThanOrEqual(box.right);
    expect(ink.maxY).toBeLessThanOrEqual(box.bottom);
  });

  it('reports the owl bounds the icon generator centres on', () => {
    // Off-by-a-unit here would not crop anything — it would just hang the mark
    // off-centre in the launcher icon, where nobody is measuring.
    const ink = hull([OWL_PATHS.body]);

    expect(OWL_BOUNDS.x).toBeCloseTo(ink.minX, 1);
    expect(OWL_BOUNDS.y).toBeCloseTo(ink.minY, 1);
    expect(OWL_BOUNDS.width).toBeCloseTo(ink.maxX - ink.minX, 1);
    expect(OWL_BOUNDS.height).toBeCloseTo(ink.maxY - ink.minY, 1);
  });

  it('derives each aspect ratio from its own window', () => {
    for (const variant of ['mark', 'full'] as const) {
      const box = parseViewBox(LOGO_VIEW_BOX[variant]);
      expect(LOGO_ASPECT[variant]).toBeCloseTo(box.width / box.height, 6);
    }

    // The wordmark is what makes the lockup wide; if these ever converge,
    // someone has pointed both variants at the same window.
    expect(LOGO_ASPECT.full).toBeGreaterThan(LOGO_ASPECT.mark * 2);
  });

  it('keeps the keyline narrow enough to stay a rim', () => {
    // Clipped to the silhouette the stroke shows at half its width. Much more
    // than this and the owl reads as outlined rather than as a solid mark.
    expect(OWL_KEYLINE_WIDTH / 2).toBeLessThan(OWL_BOUNDS.width * 0.05);
    expect(OWL_KEYLINE_WIDTH).toBeGreaterThan(0);
  });
});

describe('keyline token', () => {
  it('is white on the dark theme and absent on the light one', async () => {
    // Resolved from the working directory rather than `import.meta.url`: the
    // bundler rewrites that value, and `fileURLToPath` does not survive it.
    const css = await readFile(resolve(process.cwd(), 'src/app/globals.css'), 'utf8');

    const block = (selector: RegExp) => selector.exec(css)?.[1] ?? '';
    const dark = block(/:root\s*\{([\s\S]*?)\n\s*\}/);
    const light = block(/\[data-theme='light'\]\s*\{([\s\S]*?)\n\s*\}/);
    expect(dark).not.toBe('');
    expect(light).not.toBe('');

    const token = (source: string) => /--kz-logo-keyline:\s*([^;]+);/.exec(source)?.[1]?.trim();

    // The rim exists to lift a near-black owl off a near-black page. On the
    // light theme it would be a white halo on white, which is why it is not
    // simply left inherited from `:root`.
    expect(token(dark)).toBe('#ffffff');
    expect(token(light)).toBe('transparent');
  });
});
