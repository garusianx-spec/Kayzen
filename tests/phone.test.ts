import { describe, expect, it } from 'vitest';

import {
  formatPhoneForDisplay,
  iranianOperator,
  maskPhone,
  normalizeIranianPhone,
  toLocalIranianPhone,
} from '@/lib/auth/phone';

describe('normalizeIranianPhone', () => {
  it('accepts every form a Persian keyboard produces', () => {
    const expected = '+989123456789';

    expect(normalizeIranianPhone('09123456789')).toBe(expected);
    expect(normalizeIranianPhone('9123456789')).toBe(expected);
    expect(normalizeIranianPhone('+989123456789')).toBe(expected);
    expect(normalizeIranianPhone('00989123456789')).toBe(expected);
    expect(normalizeIranianPhone('0912 345 6789')).toBe(expected);
    expect(normalizeIranianPhone('0912-345-6789')).toBe(expected);
    expect(normalizeIranianPhone('۰۹۱۲۳۴۵۶۷۸۹')).toBe(expected);
    expect(normalizeIranianPhone('٠٩١٢٣٤٥٦٧٨٩')).toBe(expected);
    expect(normalizeIranianPhone('  +98 912 345 6789  ')).toBe(expected);
  });

  it('rejects anything that is not an Iranian mobile number', () => {
    expect(normalizeIranianPhone('')).toBeNull();
    expect(normalizeIranianPhone('02112345678')).toBeNull(); // landline
    expect(normalizeIranianPhone('091234567')).toBeNull(); // too short
    expect(normalizeIranianPhone('091234567890')).toBeNull(); // too long
    expect(normalizeIranianPhone('+447700900000')).toBeNull(); // not +98
    expect(normalizeIranianPhone('not a phone')).toBeNull();
  });

  it('strips the bidirectional marks a Persian keyboard inserts', () => {
    expect(normalizeIranianPhone('‏۰۹۱۲۳۴۵۶۷۸۹‎')).toBe('+989123456789');
  });
});

describe('display helpers', () => {
  it('formats for reading and masks for logging', () => {
    expect(toLocalIranianPhone('+989123456789')).toBe('09123456789');
    expect(formatPhoneForDisplay('+989123456789')).toBe('۰۹۱۲ ۳۴۵ ۶۷۸۹');
    expect(maskPhone('+989123456789')).toBe('۰۹۱۲***۶۷۸۹');
  });

  it('never leaks the middle digits through the mask', () => {
    const masked = maskPhone('+989123456789');
    expect(masked).not.toContain('۳۴۵');
  });

  it('identifies the operator behind a number', () => {
    expect(iranianOperator('+989123456789')).toBe('MCI');
    expect(iranianOperator('+989301234567')).toBe('Irancell');
    expect(iranianOperator('+989201234567')).toBe('Rightel');
  });
});
