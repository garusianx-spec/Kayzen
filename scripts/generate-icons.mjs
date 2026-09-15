#!/usr/bin/env node
/**
 * Generates the app icon set.
 *
 * Google Play's installability criteria for a Trusted Web Activity require the
 * manifest to declare 192px and 512px PNG icons, and at least one `maskable`
 * icon so Android can crop the launcher shape without clipping the artwork.
 * Rather than committing binaries nobody can diff, the icons are *drawn* here,
 * from the same brand geometry the header renders — `logo-geometry.mjs` is the
 * single description of the owl, so the mark on the home screen and the mark in
 * the app cannot drift apart.
 *
 * The tile is the light lockup's surface. The artwork was delivered in a light
 * and a dark form, and the dark one separates a near-black owl from a near-black
 * page with a white rim; on a launcher the icon sits against the user's
 * wallpaper instead, where the light form needs no such trick and every part of
 * the mark — silhouette, violet face, white eyes — stays legible.
 *
 * Two things are done by hand here rather than pulled in as dependencies, both
 * because this has to run on any CI runner with nothing but `node`:
 *
 * - PNG encoding, which is four chunks and a CRC.
 * - Filling the paths, which is a scanline rasteriser with the nonzero winding
 *   rule: exact coverage horizontally, supersampled vertically.
 *
 *   node scripts/generate-icons.mjs
 */
import { deflateSync } from 'node:zlib';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import {
  OWL_BOUNDS,
  OWL_COLOURS,
  OWL_LAYER_ORDER,
  OWL_PATHS,
} from '../src/components/brand/logo-geometry.mjs';

const OUT_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'icons');

/** The light theme's card and its violet tint — `--kz-card` and `--kz-violet-soft`. */
const TILE_TOP = [255, 255, 255];
const TILE_BOTTOM = [237, 231, 254];

// --- PNG encoding -----------------------------------------------------------

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);

  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }

  return table;
})();

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);

  const typeAndData = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(typeAndData), 0);

  return Buffer.concat([length, typeAndData, crc]);
}

/** RGBA pixel buffer (`size × size × 4`) → PNG bytes. */
function encodePng(size, pixels) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header[8] = 8; // bit depth
  header[9] = 6; // colour type: RGBA
  header[10] = 0; // deflate
  header[11] = 0; // adaptive filtering
  header[12] = 0; // no interlace

  // Each scanline is prefixed with its filter type; 1 (Sub) predicts each byte
  // from the one four bytes back, which on flat artwork of this kind costs
  // nothing to compute and saves a third of the file.
  const stride = size * 4;
  const raw = Buffer.alloc(size * (stride + 1));
  for (let y = 0; y < size; y += 1) {
    const rowStart = y * (stride + 1);
    raw[rowStart] = 1;
    for (let x = 0; x < stride; x += 1) {
      const value = pixels[y * stride + x];
      const left = x >= 4 ? pixels[y * stride + x - 4] : 0;
      raw[rowStart + 1 + x] = (value - left) & 0xff;
    }
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/** Wraps a PNG in an ICO container — the format allows embedded PNG since Vista. */
function encodeIco(pngBuffer, size) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type: icon
  header.writeUInt16LE(1, 4); // one image

  const entry = Buffer.alloc(16);
  entry[0] = size >= 256 ? 0 : size;
  entry[1] = size >= 256 ? 0 : size;
  entry[2] = 0; // palette
  entry[3] = 0; // reserved
  entry.writeUInt16LE(1, 4); // colour planes
  entry.writeUInt16LE(32, 6); // bits per pixel
  entry.writeUInt32LE(pngBuffer.length, 8);
  entry.writeUInt32LE(header.length + entry.length, 12);

  return Buffer.concat([header, entry, pngBuffer]);
}

// --- Path rasterising -------------------------------------------------------

const PATH_TOKEN = /([MLCZ])|(-?\d*\.?\d+)/g;

/** How many line segments stand in for one cubic. */
const CURVE_STEPS = 24;

function cubicAt(p0, p1, p2, p3, t) {
  const u = 1 - t;
  const a = u * u * u;
  const b = 3 * u * u * t;
  const c = 3 * u * t * t;
  const d = t * t * t;

  return [
    a * p0[0] + b * p1[0] + c * p2[0] + d * p3[0],
    a * p0[1] + b * p1[1] + c * p2[1] + d * p3[1],
  ];
}

/**
 * Path data → closed polygons.
 *
 * Only the absolute `M`/`L`/`C`/`Z` commands `logo-geometry.mjs` is written in
 * are understood; anything else would be silently wrong, so it throws instead.
 */
function flattenPath(d) {
  const tokens = [...d.matchAll(PATH_TOKEN)].map((match) =>
    match[1] ? match[1] : Number(match[2]),
  );

  const contours = [];
  let contour = null;
  let cursor = [0, 0];
  let origin = [0, 0];
  let command = null;
  let index = 0;

  const close = () => {
    if (contour && contour.length > 1) contours.push(contour);
    contour = null;
  };

  while (index < tokens.length) {
    if (typeof tokens[index] === 'string') {
      command = tokens[index];
      index += 1;

      if (command === 'Z') {
        close();
        cursor = origin;
        continue;
      }
    }

    if (command === 'M') {
      close();
      cursor = [tokens[index], tokens[index + 1]];
      index += 2;
      origin = cursor;
      contour = [cursor];
    } else if (command === 'L') {
      cursor = [tokens[index], tokens[index + 1]];
      index += 2;
      contour.push(cursor);
    } else if (command === 'C') {
      const p1 = [tokens[index], tokens[index + 1]];
      const p2 = [tokens[index + 2], tokens[index + 3]];
      const p3 = [tokens[index + 4], tokens[index + 5]];
      index += 6;

      for (let step = 1; step <= CURVE_STEPS; step += 1) {
        contour.push(cubicAt(cursor, p1, p2, p3, step / CURVE_STEPS));
      }

      cursor = p3;
    } else {
      throw new Error(`unsupported path command ${String(command)}`);
    }
  }

  close();
  return contours;
}

/** Vertical samples per pixel row; horizontal coverage is exact. */
const ROW_SAMPLES = 4;

function addSpan(coverage, rowOffset, size, from, to, weight) {
  const left = Math.max(0, from);
  const right = Math.min(size, to);
  if (right <= left) return;

  for (let x = Math.floor(left); x < right; x += 1) {
    const overlap = Math.min(x + 1, right) - Math.max(x, left);
    coverage[rowOffset + x] += overlap * weight;
  }
}

/**
 * Fills the contours into a `size × size` coverage map, 0…1 per pixel.
 *
 * A scanline crosses every edge, the crossings are sorted, and the nonzero
 * winding rule decides which spans between them are inside — the same rule SVG
 * applies, which is what makes the eye holes in the brows come out right.
 */
function rasterise(contours, size, project) {
  const coverage = new Float32Array(size * size);
  const edges = [];

  for (const contour of contours) {
    const points = contour.map(project);

    for (let k = 0; k < points.length; k += 1) {
      const [x0, y0] = points[k];
      const [x1, y1] = points[(k + 1) % points.length];
      if (y0 === y1) continue;

      edges.push({
        x0,
        y0,
        slope: (x1 - x0) / (y1 - y0),
        direction: y1 > y0 ? 1 : -1,
        top: Math.min(y0, y1),
        bottom: Math.max(y0, y1),
      });
    }
  }

  const crossings = [];

  for (let row = 0; row < size * ROW_SAMPLES; row += 1) {
    const y = (row + 0.5) / ROW_SAMPLES;
    crossings.length = 0;

    for (const edge of edges) {
      if (y < edge.top || y >= edge.bottom) continue;
      crossings.push({ x: edge.x0 + (y - edge.y0) * edge.slope, direction: edge.direction });
    }

    if (crossings.length === 0) continue;
    crossings.sort((a, b) => a.x - b.x);

    const rowOffset = Math.floor(row / ROW_SAMPLES) * size;
    let winding = 0;

    for (let k = 0; k < crossings.length - 1; k += 1) {
      winding += crossings[k].direction;
      if (winding === 0) continue;
      addSpan(coverage, rowOffset, size, crossings[k].x, crossings[k + 1].x, 1 / ROW_SAMPLES);
    }
  }

  return coverage;
}

// --- Drawing ----------------------------------------------------------------

function mix(from, to, t) {
  return [
    from[0] + (to[0] - from[0]) * t,
    from[1] + (to[1] - from[1]) * t,
    from[2] + (to[2] - from[2]) * t,
  ];
}

function parseHex(hex) {
  return [
    Number.parseInt(hex.slice(1, 3), 16),
    Number.parseInt(hex.slice(3, 5), 16),
    Number.parseInt(hex.slice(5, 7), 16),
  ];
}

/** Coverage of a rounded square at a sample point, 0 or 1. */
function tileCoverage(x, y, size, radius) {
  const cx = Math.max(radius, Math.min(x, size - radius));
  const cy = Math.max(radius, Math.min(y, size - radius));
  return Math.hypot(x - cx, y - cy) <= radius ? 1 : 0;
}

/**
 * Fits the owl into the icon, `inset` of the tile clear on every side.
 *
 * Android promises never to crop the central 80% of a maskable icon, so that
 * variant is inset further; the standalone icon keeps its own rounded tile and
 * can sit closer to the edge.
 */
function owlProjection(size, inset) {
  const box = size * (1 - inset * 2);
  const scale = Math.min(box / OWL_BOUNDS.width, box / OWL_BOUNDS.height);
  const offsetX = (size - OWL_BOUNDS.width * scale) / 2 - OWL_BOUNDS.x * scale;
  const offsetY = (size - OWL_BOUNDS.height * scale) / 2 - OWL_BOUNDS.y * scale;

  return ([x, y]) => [x * scale + offsetX, y * scale + offsetY];
}

const OWL_CONTOURS = Object.fromEntries(
  OWL_LAYER_ORDER.map((layer) => [layer, flattenPath(OWL_PATHS[layer])]),
);

const TILE_SAMPLES = 3;

function drawIcon(size, { maskable = false, opaque = false } = {}) {
  const pixels = Buffer.alloc(size * size * 4);
  // A maskable icon is cropped to the launcher's own shape, so it bleeds to the
  // edges; the Play listing forbids alpha and gets the same square tile.
  const radius = maskable || opaque ? 0 : size * 0.22;
  const project = owlProjection(size, maskable ? 0.2 : 0.12);

  const layers = OWL_LAYER_ORDER.map((layer) => ({
    colour: parseHex(OWL_COLOURS[layer]),
    coverage: rasterise(OWL_CONTOURS[layer], size, project),
  }));

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      let tile = 0;

      if (radius === 0) {
        tile = 1;
      } else {
        for (let sy = 0; sy < TILE_SAMPLES; sy += 1) {
          for (let sx = 0; sx < TILE_SAMPLES; sx += 1) {
            tile += tileCoverage(
              x + (sx + 0.5) / TILE_SAMPLES,
              y + (sy + 0.5) / TILE_SAMPLES,
              size,
              radius,
            );
          }
        }
        tile /= TILE_SAMPLES * TILE_SAMPLES;
      }

      // A diagonal wash from the top-right, matching the direction of the
      // gradient the interface uses.
      let colour = mix(TILE_TOP, TILE_BOTTOM, (x / size + y / size) / 2);

      for (const layer of layers) {
        const alpha = Math.min(1, layer.coverage[y * size + x]);
        if (alpha > 0) colour = mix(colour, layer.colour, alpha);
      }

      const offset = (y * size + x) * 4;
      pixels[offset] = Math.round(colour[0]);
      pixels[offset + 1] = Math.round(colour[1]);
      pixels[offset + 2] = Math.round(colour[2]);
      pixels[offset + 3] = opaque ? 255 : Math.round(tile * 255);
    }
  }

  return encodePng(size, pixels);
}

// --- Output -----------------------------------------------------------------

await mkdir(OUT_DIR, { recursive: true });

const outputs = [
  ['icon-192.png', drawIcon(192)],
  ['icon-512.png', drawIcon(512)],
  ['icon-maskable-192.png', drawIcon(192, { maskable: true })],
  ['icon-maskable-512.png', drawIcon(512, { maskable: true })],
  ['apple-touch-icon.png', drawIcon(180, { opaque: true })],
  ['play-store-512.png', drawIcon(512, { opaque: true })],
];

for (const [name, data] of outputs) {
  await writeFile(join(OUT_DIR, name), data);
  console.log(`wrote public/icons/${name} (${(data.length / 1024).toFixed(1)} KiB)`);
}

const favicon = encodeIco(drawIcon(32), 32);
await writeFile(join(OUT_DIR, '..', 'favicon.ico'), favicon);
console.log(`wrote public/favicon.ico (${(favicon.length / 1024).toFixed(1)} KiB)`);
