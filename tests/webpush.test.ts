import { webcrypto } from 'node:crypto';
import { describe, expect, it } from 'vitest';

import { concatBytes, hmacSha256Bytes, toBase64Url, utf8 } from '@/lib/crypto';
import { encryptPushPayload, MAX_PUSH_PAYLOAD_BYTES } from '@/lib/push/webpush';
import { importVapidPrivateKey, pushAudience } from '@/lib/push/vapid';

/**
 * Round-trips the RFC 8291 encryption against a decryptor written from the
 * spec's own derivation steps.
 *
 * This is the only honest way to test push encryption without a browser: if the
 * sender's key schedule is wrong in any step — a missing `0x00` in an info
 * string, the wrong salt, the padding delimiter — the decryption below fails.
 * A test that only checked the header bytes would pass on a message no user
 * agent could read.
 */

const subtle = webcrypto.subtle;

async function createSubscriptionKeys() {
  const keyPair = (await subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, [
    'deriveBits',
  ])) as CryptoKeyPair;

  const publicKey = new Uint8Array(await subtle.exportKey('raw', keyPair.publicKey));
  const authSecret = webcrypto.getRandomValues(new Uint8Array(16));

  return {
    privateKey: keyPair.privateKey,
    publicKey,
    authSecret,
    subscription: {
      endpoint: 'https://fcm.googleapis.com/fcm/send/fake-endpoint',
      p256dh: toBase64Url(publicKey),
      auth: toBase64Url(authSecret),
    },
  };
}

/** The user agent's half of RFC 8291 §3.4, implemented from the spec. */
async function decryptPushBody(
  body: Uint8Array,
  keys: Awaited<ReturnType<typeof createSubscriptionKeys>>,
): Promise<string> {
  const salt = body.slice(0, 16);
  const keyIdLength = body[20] as number;
  const senderPublic = body.slice(21, 21 + keyIdLength);
  const ciphertext = body.slice(21 + keyIdLength);

  expect(keyIdLength).toBe(65);

  const senderKey = await subtle.importKey(
    'raw',
    senderPublic,
    { name: 'ECDH', namedCurve: 'P-256' },
    false,
    [],
  );

  const sharedSecret = new Uint8Array(
    await subtle.deriveBits({ name: 'ECDH', public: senderKey }, keys.privateKey, 256),
  );

  const prkKey = await hmacSha256Bytes(keys.authSecret, sharedSecret);
  const keyInfo = concatBytes(
    utf8('WebPush: info'),
    Uint8Array.of(0),
    keys.publicKey,
    senderPublic,
  );
  const ikm = await hmacSha256Bytes(prkKey, concatBytes(keyInfo, Uint8Array.of(1)));

  const prk = await hmacSha256Bytes(salt, ikm);
  const cek = (
    await hmacSha256Bytes(
      prk,
      concatBytes(utf8('Content-Encoding: aes128gcm'), Uint8Array.of(0), Uint8Array.of(1)),
    )
  ).slice(0, 16);
  const nonce = (
    await hmacSha256Bytes(
      prk,
      concatBytes(utf8('Content-Encoding: nonce'), Uint8Array.of(0), Uint8Array.of(1)),
    )
  ).slice(0, 12);

  const aesKey = await subtle.importKey('raw', cek, { name: 'AES-GCM' }, false, ['decrypt']);
  const plaintext = new Uint8Array(
    await subtle.decrypt({ name: 'AES-GCM', iv: nonce, tagLength: 128 }, aesKey, ciphertext),
  );

  // The last byte is the record delimiter: 0x02 marks the final record.
  expect(plaintext[plaintext.length - 1]).toBe(2);

  return new TextDecoder().decode(plaintext.slice(0, -1));
}

describe('web push encryption', () => {
  it('produces a body the subscribing user agent can decrypt', async () => {
    const keys = await createSubscriptionKeys();
    const payload = JSON.stringify({ title: 'کایزن', body: '۳ کار باز منتظر شماست.' });

    const body = await encryptPushPayload(keys.subscription, payload);
    const decrypted = await decryptPushBody(body, keys);

    expect(decrypted).toBe(payload);
  });

  it('writes the aes128gcm header the spec defines', async () => {
    const keys = await createSubscriptionKeys();
    const body = await encryptPushPayload(keys.subscription, 'hello');

    // salt(16) ‖ record size(4, big endian) ‖ key id length(1) ‖ key id(65)
    const recordSize = new DataView(body.buffer, body.byteOffset + 16, 4).getUint32(0, false);

    expect(body.length).toBeGreaterThan(86);
    expect(recordSize).toBe(4096);
    expect(body[20]).toBe(65);
    expect(body[21]).toBe(0x04); // uncompressed point marker
  });

  it('uses a fresh ephemeral key and salt for every message', async () => {
    const keys = await createSubscriptionKeys();

    const first = await encryptPushPayload(keys.subscription, 'same message');
    const second = await encryptPushPayload(keys.subscription, 'same message');

    // Identical plaintext must not produce identical ciphertext, or the relay
    // could correlate messages.
    expect(toBase64Url(first)).not.toBe(toBase64Url(second));
  });

  it('refuses a payload that would not fit one record', async () => {
    const keys = await createSubscriptionKeys();
    const oversized = 'ا'.repeat(MAX_PUSH_PAYLOAD_BYTES);

    await expect(encryptPushPayload(keys.subscription, oversized)).rejects.toThrow(
      /single-record limit/,
    );
  });

  it('rejects a malformed subscription key', async () => {
    await expect(
      encryptPushPayload(
        { endpoint: 'https://example.test', p256dh: toBase64Url(new Uint8Array(10)), auth: 'AAAA' },
        'x',
      ),
    ).rejects.toThrow(/65-byte uncompressed/);
  });
});

describe('VAPID', () => {
  it('imports a raw key pair and audiences tokens to the push service origin', async () => {
    const keyPair = (await subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, [
      'sign',
      'verify',
    ])) as CryptoKeyPair;

    const publicKey = new Uint8Array(await subtle.exportKey('raw', keyPair.publicKey));
    const jwk = await subtle.exportKey('jwk', keyPair.privateKey);

    const imported = await importVapidPrivateKey({
      publicKey: toBase64Url(publicKey),
      privateKey: jwk.d as string,
    });

    expect(imported.type).toBe('private');
    expect(pushAudience('https://fcm.googleapis.com/fcm/send/abc')).toBe(
      'https://fcm.googleapis.com',
    );
  });
});
