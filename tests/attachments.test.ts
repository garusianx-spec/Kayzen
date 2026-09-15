import { describe, expect, it } from 'vitest';

import {
  assertOwnedObjectPath,
  attachmentDisplayName,
  attachmentObjectPath,
  sanitizeAttachmentFilename,
} from '@/lib/storage/supabase';
import { formatBytes, isAllowedAttachmentType } from '@/lib/storage/constants';
import { ApiError } from '@/lib/errors';

/**
 * Attachment path safety.
 *
 * The storage bucket has no RLS policies — Kayzen does not use Supabase Auth,
 * so `auth.uid()` would always be NULL and a policy written against it would
 * deny everything. Access is mediated entirely by the service-role key, which
 * can read *any* object in the bucket. `assertOwnedObjectPath` is therefore the
 * only thing standing between one tenant and another's files, and these tests
 * are its specification.
 */

const USER = '6da00b62-1ec4-418e-847f-913bba8442dd';
const OTHER_USER = '0d023745-3c28-4748-9f4c-931db8b0fa06';
const NOTE = '23cc89e6-bb4c-4983-96ab-b4347d45993d';

describe('assertOwnedObjectPath', () => {
  it('accepts a well-formed path in the caller namespace', () => {
    expect(() => assertOwnedObjectPath(`${USER}/${NOTE}/a1b2c3d4-report.pdf`, USER)).not.toThrow();
  });

  it("refuses another tenant's path", () => {
    expect(() => assertOwnedObjectPath(`${OTHER_USER}/${NOTE}/secret.pdf`, USER)).toThrow(ApiError);
  });

  it('refuses traversal out of the namespace', () => {
    for (const path of [
      `${USER}/../${OTHER_USER}/file.pdf`,
      `${USER}/${NOTE}/../../escape.pdf`,
      `/${USER}/${NOTE}/file.pdf`,
    ]) {
      expect(() => assertOwnedObjectPath(path, USER)).toThrow(ApiError);
    }
  });

  it('refuses a path with the wrong shape', () => {
    for (const path of [
      USER,
      `${USER}/${NOTE}`,
      `${USER}/${NOTE}/nested/file.pdf`,
      `${USER}/not-a-uuid/file.pdf`,
      `${USER}/${NOTE}/`,
      '',
    ]) {
      expect(() => assertOwnedObjectPath(path, USER)).toThrow(ApiError);
    }
  });

  it('refuses a prefix that merely starts with the user id', () => {
    // `<user>-evil/...` shares a prefix but is a different namespace; a
    // `startsWith` check would have let this through.
    expect(() => assertOwnedObjectPath(`${USER}-evil/${NOTE}/file.pdf`, USER)).toThrow(ApiError);
  });

  it('answers with a 403 rather than a 404, since the path is well-formed but foreign', () => {
    try {
      assertOwnedObjectPath(`${OTHER_USER}/${NOTE}/secret.pdf`, USER);
      expect.unreachable('should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(ApiError);
      expect((error as ApiError).status).toBe(403);
    }
  });
});

describe('sanitizeAttachmentFilename', () => {
  it('strips path separators and traversal sequences', () => {
    expect(sanitizeAttachmentFilename('../../etc/passwd')).toBe('.etcpasswd');
    expect(sanitizeAttachmentFilename('a/b\\c.png')).toBe('abc.png');
  });

  it('removes control characters', () => {
    const withControls = `report${String.fromCharCode(0)}${String.fromCharCode(31)}${String.fromCharCode(127)}.pdf`;
    expect(sanitizeAttachmentFilename(withControls)).toBe('report.pdf');
  });

  it('keeps Persian names readable', () => {
    expect(sanitizeAttachmentFilename('قرارداد.pdf')).toBe('قرارداد.pdf');
  });

  it('never returns an empty name', () => {
    expect(sanitizeAttachmentFilename('')).toBe('file');
    expect(sanitizeAttachmentFilename('///')).toBe('file');
    expect(sanitizeAttachmentFilename('   ')).toBe('file');
  });

  it('caps the length', () => {
    expect(sanitizeAttachmentFilename('x'.repeat(400))).toHaveLength(100);
  });
});

describe('attachmentObjectPath', () => {
  it('produces a path its own guard accepts', () => {
    const path = attachmentObjectPath({ userId: USER, noteId: NOTE, filename: 'photo.png' });

    expect(() => assertOwnedObjectPath(path, USER)).not.toThrow();
    expect(path.startsWith(`${USER}/${NOTE}/`)).toBe(true);
    expect(path.endsWith('photo.png')).toBe(true);
  });

  it('is unique per call, so two files of the same name coexist', () => {
    const options = { userId: USER, noteId: NOTE, filename: 'photo.png' };
    expect(attachmentObjectPath(options)).not.toBe(attachmentObjectPath(options));
  });

  it('cannot be steered out of the namespace by the filename', () => {
    const path = attachmentObjectPath({
      userId: USER,
      noteId: NOTE,
      filename: '../../../etc/passwd',
    });

    expect(() => assertOwnedObjectPath(path, USER)).not.toThrow();
    expect(path.split('/')).toHaveLength(3);
  });
});

describe('attachmentDisplayName', () => {
  it('drops the random prefix the key carries', () => {
    expect(attachmentDisplayName(`${USER}/${NOTE}/a1b2c3d4-report.pdf`)).toBe('report.pdf');
    expect(attachmentDisplayName(`${USER}/${NOTE}/a1b2c3d4-قرارداد.pdf`)).toBe('قرارداد.pdf');
  });
});

describe('shared limits', () => {
  it('matches the bucket allow-list', () => {
    expect(isAllowedAttachmentType('image/png')).toBe(true);
    expect(isAllowedAttachmentType('application/pdf')).toBe(true);
    expect(isAllowedAttachmentType('text/html')).toBe(false);
    expect(isAllowedAttachmentType('image/svg+xml')).toBe(false);
  });

  it('formats sizes in Persian digits', () => {
    expect(formatBytes(2 * 1024 * 1024)).toBe('۲.۰ مگابایت');
    expect(formatBytes(50 * 1024)).toBe('۵۰ کیلوبایت');
  });
});
