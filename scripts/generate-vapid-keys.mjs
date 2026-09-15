#!/usr/bin/env node
/**
 * Generates a VAPID key pair for Web Push.
 *
 * Rotating these invalidates every existing push subscription — browsers pin the
 * application server key at subscribe time — so generate once per environment
 * and keep them alongside the other secrets.
 *
 *   npm run vapid:generate
 */
import { webcrypto } from 'node:crypto';

const toBase64Url = (bytes) =>
  Buffer.from(bytes).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

const keyPair = await webcrypto.subtle.generateKey(
  { name: 'ECDSA', namedCurve: 'P-256' },
  true,
  ['sign', 'verify'],
);

// The public half travels as the 65-byte uncompressed point browsers expect;
// the private half is the raw 32-byte scalar from the JWK's `d`.
const publicKey = new Uint8Array(await webcrypto.subtle.exportKey('raw', keyPair.publicKey));
const jwk = await webcrypto.subtle.exportKey('jwk', keyPair.privateKey);

console.log(`VAPID_PUBLIC_KEY="${toBase64Url(publicKey)}"`);
console.log(`VAPID_PRIVATE_KEY="${jwk.d}"`);
console.log(`NEXT_PUBLIC_VAPID_PUBLIC_KEY="${toBase64Url(publicKey)}"`);
