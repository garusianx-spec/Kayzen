#!/usr/bin/env node
/**
 * Generates the app icon set.
 *
 * Google Play's installability criteria for a Trusted Web Activity require the
 * manifest to declare 192px and 512px PNG icons, and at least one `maskable`
 * icon so Android can crop the launcher shape without clipping the artwork.
 * Rather than committing binaries nobody can diff, the icons are *drawn* here:
 * a rounded violet gradient tile with the Kayzen mark — three ascending steps,
 * one percent at a time.
 *
 * PNG encoding is done by hand on top of `node:zlib`. A PNG is four chunks and
 * a CRC, and the alternative is a native image dependency that has to build on
 * every CI runner.
 *
 *   node scripts/generate-icons.mjs
 */
import { deflateSync } from 'node:zlib';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const OUT_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'icons');

const VIOLET_LIGHT = [156, 136, 255];
const VIOLET_DEEP = [122, 54, 217];
const SURFACE = [11, 11, 20];
const WHITE = [255, 255, 255];

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

  // Each scanline is prefixed with its filter type; 0 (None) keeps the encoder
  // trivial and costs a few percent of file size on artwork this flat.
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y += 1) {
    const rowStart = y * (size * 4 + 1);
    raw[rowStart] = 0;
    pixels.copy(raw, rowStart + 1, y * size * 4, (y + 1) * size * 4);
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// --- Drawing ----------------------------------------------------------------

function mix(from, to, t) {
  return [
    Math.round(from[0] + (to[0] - from[0]) * t),
    Math.round(from[1] + (to[1] - from[1]) * t),
    Math.round(from[2] + (to[2] - from[2]) * t),
  ];
}

/** Signed coverage of a rounded rectangle at (x, y), 0…1. */
function roundedRectCoverage(x, y, left, top, right, bottom, radius) {
  const cx = Math.max(left + radius, Math.min(x, right - radius));
  const cy = Math.max(top + radius, Math.min(y, bottom - radius));
  const dx = x - cx;
  const dy = y - cy;

  if (x < left || x > right || y < top || y > bottom) return 0;
  return Math.hypot(dx, dy) <= radius ? 1 : 0;
}

/**
 * The Kayzen mark: three ascending steps.
 *
 * Drawn in normalised 0…1 space so one description serves every icon size, and
 * `inset` shrinks it into the maskable safe zone (the central 80% Android
 * promises never to crop).
 */
function stepCoverage(u, v, inset) {
  const scale = 1 - inset * 2;
  const x = (u - inset) / scale;
  const y = (v - inset) / scale;

  if (x < 0 || x > 1 || y < 0 || y > 1) return 0;

  const steps = [
    { left: 0.1, right: 0.34, top: 0.6 },
    { left: 0.38, right: 0.62, top: 0.42 },
    { left: 0.66, right: 0.9, top: 0.24 },
  ];

  for (const step of steps) {
    if (
      roundedRectCoverage(x, y, step.left, step.top, step.right, 0.82, 0.045) > 0
    ) {
      return 1;
    }
  }

  return 0;
}

const SAMPLES = 3;

function drawIcon(size, { maskable }) {
  const pixels = Buffer.alloc(size * size * 4);
  // A maskable icon is cropped to the launcher's shape, so it bleeds to the
  // edges; the standalone icon keeps its own rounded tile.
  const radius = maskable ? size : size * 0.22;
  const markInset = maskable ? 0.22 : 0.14;

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      let tileCoverage = 0;
      let markCoverage = 0;

      // Supersampling: the only anti-aliasing this encoder has.
      for (let sy = 0; sy < SAMPLES; sy += 1) {
        for (let sx = 0; sx < SAMPLES; sx += 1) {
          const px = x + (sx + 0.5) / SAMPLES;
          const py = y + (sy + 0.5) / SAMPLES;

          tileCoverage += maskable
            ? 1
            : roundedRectCoverage(px, py, 0, 0, size, size, radius);
          markCoverage += stepCoverage(px / size, py / size, markInset);
        }
      }

      const total = SAMPLES * SAMPLES;
      const tileAlpha = tileCoverage / total;
      const markAlpha = markCoverage / total;

      // Diagonal gradient, top-right to bottom-left, matching the CSS token.
      const t = (x / size + y / size) / 2;
      const base = mix(VIOLET_LIGHT, VIOLET_DEEP, t);
      const colour = mix(base, WHITE, markAlpha * 0.92);

      const offset = (y * size + x) * 4;
      pixels[offset] = colour[0];
      pixels[offset + 1] = colour[1];
      pixels[offset + 2] = colour[2];
      pixels[offset + 3] = Math.round(tileAlpha * 255);
    }
  }

  return encodePng(size, pixels);
}

/** Flat-background variant for the Play Store listing, which forbids alpha. */
function drawOpaqueIcon(size) {
  const pixels = Buffer.alloc(size * size * 4);

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      let markCoverage = 0;

      for (let sy = 0; sy < SAMPLES; sy += 1) {
        for (let sx = 0; sx < SAMPLES; sx += 1) {
          markCoverage += stepCoverage(
            (x + (sx + 0.5) / SAMPLES) / size,
            (y + (sy + 0.5) / SAMPLES) / size,
            0.18,
          );
        }
      }

      const markAlpha = markCoverage / (SAMPLES * SAMPLES);
      const t = (x / size + y / size) / 2;
      const colour = mix(mix(SURFACE, mix(VIOLET_LIGHT, VIOLET_DEEP, t), 0.92), WHITE, markAlpha * 0.92);

      const offset = (y * size + x) * 4;
      pixels[offset] = colour[0];
      pixels[offset + 1] = colour[1];
      pixels[offset + 2] = colour[2];
      pixels[offset + 3] = 255;
    }
  }

  return encodePng(size, pixels);
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

// --- Output -----------------------------------------------------------------

await mkdir(OUT_DIR, { recursive: true });

const outputs = [
  ['icon-192.png', drawIcon(192, { maskable: false })],
  ['icon-512.png', drawIcon(512, { maskable: false })],
  ['icon-maskable-192.png', drawIcon(192, { maskable: true })],
  ['icon-maskable-512.png', drawIcon(512, { maskable: true })],
  ['apple-touch-icon.png', drawOpaqueIcon(180)],
  ['play-store-512.png', drawOpaqueIcon(512)],
];

for (const [name, data] of outputs) {
  await writeFile(join(OUT_DIR, name), data);
  console.log(`wrote public/icons/${name} (${(data.length / 1024).toFixed(1)} KiB)`);
}

const favicon = encodeIco(drawIcon(32, { maskable: false }), 32);
await writeFile(join(OUT_DIR, '..', 'favicon.ico'), favicon);
console.log(`wrote public/favicon.ico (${(favicon.length / 1024).toFixed(1)} KiB)`);
