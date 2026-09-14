import { concatBytes, fromBase64Url, hkdf, hmacSha256Bytes, utf8 } from '../crypto';
import { logger } from '../logger';
import { vapidAuthorizationHeader } from './vapid';

/**
 * Web Push message encryption (RFC 8291, `aes128gcm`).
 *
 * The push service is an untrusted relay: it stores and forwards the payload but
 * must never be able to read it. The scheme below gives it nothing useful —
 * every message is encrypted to a key derived from the subscription's own P-256
 * key and the 16-byte `auth` secret that never leaves the browser and the
 * application server.
 *
 * Implemented directly on WebCrypto rather than through a library because the
 * whole construction is ~40 lines, runs unchanged on Node and Edge, and the
 * alternative pulls a Node-only crypto dependency into the bundle.
 *
 * Derivation, in the order RFC 8291 §3.4 specifies:
 *
 *   ecdh_secret = ECDH(as_private, ua_public)
 *   PRK_key     = HMAC-SHA256(auth_secret, ecdh_secret)
 *   IKM         = HKDF-Expand(PRK_key, "WebPush: info\0" ‖ ua_public ‖ as_public, 32)
 *   PRK         = HMAC-SHA256(salt, IKM)
 *   CEK         = HKDF-Expand(PRK, "Content-Encoding: aes128gcm\0", 16)
 *   NONCE       = HKDF-Expand(PRK, "Content-Encoding: nonce\0", 12)
 */

export interface PushSubscriptionKeys {
  endpoint: string;
  /** Base64url 65-byte uncompressed P-256 public key of the user agent. */
  p256dh: string;
  /** Base64url 16-byte shared authentication secret. */
  auth: string;
}

/** One record; 4096 is the conventional size and fits every payload we send. */
const RECORD_SIZE = 4096;

/** Payload ceiling for a single record, after the 0x02 delimiter and GCM tag. */
export const MAX_PUSH_PAYLOAD_BYTES = RECORD_SIZE - 17 - 16;

export async function encryptPushPayload(
  subscription: PushSubscriptionKeys,
  payload: string,
): Promise<Uint8Array> {
  const plaintext = utf8(payload);

  if (plaintext.length > MAX_PUSH_PAYLOAD_BYTES) {
    throw new Error(
      `push payload is ${plaintext.length} bytes; the single-record limit is ${MAX_PUSH_PAYLOAD_BYTES}`,
    );
  }

  const uaPublicBytes = fromBase64Url(subscription.p256dh);
  const authSecret = fromBase64Url(subscription.auth);

  if (uaPublicBytes.length !== 65 || uaPublicBytes[0] !== 0x04) {
    throw new Error('subscription p256dh must be a 65-byte uncompressed P-256 point');
  }

  const uaPublicKey = await crypto.subtle.importKey(
    'raw',
    uaPublicBytes as BufferSource,
    { name: 'ECDH', namedCurve: 'P-256' },
    false,
    [],
  );

  const ephemeral = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, [
    'deriveBits',
  ]);

  const asPublicBytes = new Uint8Array(await crypto.subtle.exportKey('raw', ephemeral.publicKey));

  const sharedSecret = new Uint8Array(
    await crypto.subtle.deriveBits(
      { name: 'ECDH', public: uaPublicKey },
      ephemeral.privateKey,
      256,
    ),
  );

  const prkKey = await hmacSha256Bytes(authSecret, sharedSecret);
  const keyInfo = concatBytes(
    utf8('WebPush: info'),
    Uint8Array.of(0),
    uaPublicBytes,
    asPublicBytes,
  );
  const ikm = await hmacSha256Bytes(prkKey, concatBytes(keyInfo, Uint8Array.of(1)));

  const salt = crypto.getRandomValues(new Uint8Array(16));
  const contentKey = await hkdf(
    salt,
    ikm,
    concatBytes(utf8('Content-Encoding: aes128gcm'), Uint8Array.of(0)),
    16,
  );
  const nonce = await hkdf(
    salt,
    ikm,
    concatBytes(utf8('Content-Encoding: nonce'), Uint8Array.of(0)),
    12,
  );

  const aesKey = await crypto.subtle.importKey(
    'raw',
    contentKey as BufferSource,
    { name: 'AES-GCM' },
    false,
    ['encrypt'],
  );

  // A single record is terminated with 0x02 ("last record"); 0x01 would mean
  // another record follows, and a receiver would wait for one that never comes.
  const padded = concatBytes(plaintext, Uint8Array.of(2));

  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv: nonce as BufferSource, tagLength: 128 },
      aesKey,
      padded as BufferSource,
    ),
  );

  // Header: salt(16) ‖ record size(4, big endian) ‖ key id length(1) ‖ key id.
  const recordSize = new Uint8Array(4);
  new DataView(recordSize.buffer).setUint32(0, RECORD_SIZE, false);

  return concatBytes(
    salt,
    recordSize,
    Uint8Array.of(asPublicBytes.length),
    asPublicBytes,
    ciphertext,
  );
}

export type PushDeliveryOutcome =
  | { ok: true; status: number }
  /** The endpoint is gone for good (404/410); delete the subscription. */
  | { ok: false; status: number; expired: true }
  | { ok: false; status: number; expired: false; error: string };

/**
 * Encrypts and POSTs one notification.
 *
 * Never throws for a transport-level failure: the caller is usually a cron job
 * fanning out to thousands of endpoints, and one dead push service must not stop
 * the run.
 */
export async function sendPushNotification(
  subscription: PushSubscriptionKeys,
  payload: unknown,
  options: { ttlSeconds?: number; urgency?: 'very-low' | 'low' | 'normal' | 'high' } = {},
): Promise<PushDeliveryOutcome> {
  try {
    const body = await encryptPushPayload(subscription, JSON.stringify(payload));
    const authorization = await vapidAuthorizationHeader(subscription.endpoint);

    const response = await fetch(subscription.endpoint, {
      method: 'POST',
      headers: {
        Authorization: authorization,
        'Content-Encoding': 'aes128gcm',
        'Content-Type': 'application/octet-stream',
        TTL: String(options.ttlSeconds ?? 12 * 60 * 60),
        Urgency: options.urgency ?? 'normal',
      },
      body: body as BodyInit,
      signal: AbortSignal.timeout(10_000),
      cache: 'no-store',
    });

    if (response.ok) return { ok: true, status: response.status };

    if (response.status === 404 || response.status === 410) {
      return { ok: false, status: response.status, expired: true };
    }

    return {
      ok: false,
      status: response.status,
      expired: false,
      error: await response.text().catch(() => response.statusText),
    };
  } catch (error) {
    logger.warn({ err: error, endpoint: subscription.endpoint }, 'push delivery failed');
    return {
      ok: false,
      status: 0,
      expired: false,
      error: error instanceof Error ? error.message : 'unknown push failure',
    };
  }
}

/** The notification shape the service worker's `push` handler expects. */
export interface KayzenPushPayload {
  title: string;
  body: string;
  /** Deep link opened when the notification is tapped. */
  url?: string;
  tag?: string;
  /** Vibration pattern applied by the service worker on Android. */
  vibrate?: number[];
}
