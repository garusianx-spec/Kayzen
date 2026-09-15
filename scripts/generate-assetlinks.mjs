#!/usr/bin/env node
/**
 * Writes a static `public/.well-known/assetlinks.json`.
 *
 * The running app serves the same document from an environment-driven route, so
 * this script is for deployments that prefer a static artifact — a CDN in front
 * of the origin, or a host that will not run the Next.js server for
 * `/.well-known/*`. Next serves files in `public/` ahead of rewrites, so the
 * generated file automatically takes precedence once it exists.
 *
 *   ANDROID_PACKAGE_NAME=app.kayzen.twa \
 *   ANDROID_SHA256_CERT_FINGERPRINTS="AA:BB:…,CC:DD:…" \
 *   npm run assetlinks:generate
 *
 * Both the upload key and the Play App Signing key must be listed, or
 * Play-installed builds show the URL bar.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const FINGERPRINT = /^([0-9A-F]{2}:){31}[0-9A-F]{2}$/;

const packageName = process.env.ANDROID_PACKAGE_NAME ?? 'app.kayzen.twa';
const raw = process.env.ANDROID_SHA256_CERT_FINGERPRINTS ?? '';

const fingerprints = raw
  .split(',')
  .map((value) => value.trim().toUpperCase())
  .filter(Boolean);

const invalid = fingerprints.filter((value) => !FINGERPRINT.test(value));

if (fingerprints.length === 0) {
  console.error(
    'ANDROID_SHA256_CERT_FINGERPRINTS is empty.\n' +
      'Read it from the keystore with:\n' +
      '  keytool -list -v -keystore android/kayzen.keystore -alias kayzen\n' +
      'and add the Play App Signing fingerprint from the Play Console.',
  );
  process.exit(1);
}

if (invalid.length > 0) {
  console.error(`not SHA-256 fingerprints (expected 32 colon-separated hex pairs):\n  ${invalid.join('\n  ')}`);
  process.exit(1);
}

const statements = [
  {
    relation: [
      'delegate_permission/common.handle_all_urls',
      'delegate_permission/common.get_login_creds',
    ],
    target: {
      namespace: 'android_app',
      package_name: packageName,
      sha256_cert_fingerprints: fingerprints,
    },
  },
];

const outDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', '.well-known');
await mkdir(outDir, { recursive: true });
await writeFile(join(outDir, 'assetlinks.json'), `${JSON.stringify(statements, null, 2)}\n`, 'utf8');

console.log(
  `wrote public/.well-known/assetlinks.json for ${packageName} with ${fingerprints.length} fingerprint(s)`,
);
