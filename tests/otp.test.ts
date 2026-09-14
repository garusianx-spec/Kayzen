import { describe, expect, it } from 'vitest';

import {
  constantTimeEqual,
  randomDigits,
  randomInt,
  sha256Hex,
  toBase64Url,
  fromBase64Url,
} from '@/lib/crypto';
import { hashOtpCode } from '@/lib/auth/otp';
import { renderOtpSms, webOtpDomain } from '@/lib/sms/template';

describe('OTP hashing', () => {
  it('is deterministic for the same phone and code', async () => {
    const first = await hashOtpCode('+989123456789', '123456');
    const second = await hashOtpCode('+989123456789', '123456');

    expect(first).toBe(second);
    expect(first).toMatch(/^[0-9a-f]{64}$/);
  });

  it('binds the digest to the phone number', async () => {
    // Without the binding, a digest stolen from one row could be replayed
    // against a different number holding the same code.
    const forOne = await hashOtpCode('+989123456789', '123456');
    const forAnother = await hashOtpCode('+989121111111', '123456');

    expect(forOne).not.toBe(forAnother);
  });

  it('never stores the code itself', async () => {
    const digest = await hashOtpCode('+989123456789', '424242');
    expect(digest).not.toContain('424242');
  });
});

describe('constantTimeEqual', () => {
  it('compares equal and unequal values correctly', async () => {
    await expect(constantTimeEqual('abc', 'abc')).resolves.toBe(true);
    await expect(constantTimeEqual('abc', 'abd')).resolves.toBe(false);
    await expect(constantTimeEqual('abc', 'abcd')).resolves.toBe(false);
    await expect(constantTimeEqual('', '')).resolves.toBe(true);
  });
});

describe('random generators', () => {
  it('produces codes of the requested length, leading zeros included', () => {
    for (let index = 0; index < 200; index += 1) {
      expect(randomDigits(6)).toMatch(/^[0-9]{6}$/);
    }
  });

  it('stays inside the requested range', () => {
    for (let index = 0; index < 500; index += 1) {
      const value = randomInt(10);
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(10);
    }
  });

  it('covers the whole digit space over many draws', () => {
    const seen = new Set<string>();
    for (let index = 0; index < 2000; index += 1) seen.add(randomDigits(1));

    // A biased or truncated generator would miss at least one digit here.
    expect(seen.size).toBe(10);
  });
});

describe('base64url helpers', () => {
  it('round-trips arbitrary bytes without padding', () => {
    const bytes = new Uint8Array([0, 1, 250, 251, 252, 253, 254, 255]);
    const encoded = toBase64Url(bytes);

    expect(encoded).not.toContain('=');
    expect(encoded).not.toContain('+');
    expect(encoded).not.toContain('/');
    expect(Array.from(fromBase64Url(encoded))).toEqual(Array.from(bytes));
  });
});

describe('WebOTP SMS template', () => {
  const rendered = renderOtpSms({
    template: 'sign-in',
    code: '123456',
    ttlSeconds: 120,
    appUrl: 'https://kayzen.app',
  });

  it('ends with the binding line WebOTP requires', () => {
    const lines = rendered.trim().split('\n');
    expect(lines[lines.length - 1]).toBe('@kayzen.app #123456');
  });

  it('keeps the code in ASCII digits', () => {
    // A Persian-digit code would be typed back as something the server never
    // issued, and WebOTP would not match it either.
    expect(rendered).toContain('123456');
    expect(rendered).not.toContain('۱۲۳۴۵۶');
  });

  it('renders the validity window in Persian digits', () => {
    expect(rendered).toContain('۲ دقیقه');
  });

  it('derives the domain from the app URL, without scheme or path', () => {
    expect(webOtpDomain('https://kayzen.app/path')).toBe('kayzen.app');
    expect(webOtpDomain('http://localhost:3000')).toBe('localhost');
  });
});

describe('sha256Hex', () => {
  it('matches the known digest of an empty string', async () => {
    await expect(sha256Hex('')).resolves.toBe(
      'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    );
  });
});
