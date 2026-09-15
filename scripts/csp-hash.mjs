#!/usr/bin/env node
/**
 * Prints the CSP hash of the theme bootstrap script.
 *
 * Run after editing `src/lib/theme-bootstrap.ts` and paste the result into
 * `THEME_BOOTSTRAP_HASH` in `next.config.ts`:
 *
 *   node scripts/csp-hash.mjs
 */
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../src/lib/theme-bootstrap.ts', import.meta.url), 'utf8');
const match = /export const THEME_BOOTSTRAP_SCRIPT = `([\s\S]*?)`;/.exec(source);

if (!match?.[1]) {
  console.error('could not find THEME_BOOTSTRAP_SCRIPT in src/lib/theme-bootstrap.ts');
  process.exit(1);
}

const digest = createHash('sha256').update(match[1], 'utf8').digest('base64');
console.log(`'sha256-${digest}'`);
