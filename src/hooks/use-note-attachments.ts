'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { api } from '@/lib/api/client';
import type { AttachmentDto } from '@/types/domain';

/**
 * Note attachments, from the browser's side.
 *
 * The upload deliberately bypasses the app server: the file goes straight to
 * Supabase Storage through a one-shot signed URL, so a 10 MiB photo never
 * passes through a serverless function's request body (where it would be slow,
 * expensive, and in some deployments over the payload limit).
 *
 * Three steps, in order, because the note must not reference an object that
 * failed to upload:
 *
 *   1. ask the API to sign an upload for this note,
 *   2. PUT the bytes to Supabase,
 *   3. record the returned object key on the note.
 *
 * Attachments are the one part of the app that is *not* offline-capable, and
 * that is a deliberate limit rather than an oversight: a signed URL expires,
 * so queueing an upload for replay hours later would fail anyway. The picker
 * tells the user instead of failing silently.
 */

export interface AttachmentUploadState {
  attachments: AttachmentDto[];
  isLoading: boolean;
  isUploading: boolean;
  error: string | null;
  upload(file: File): Promise<void>;
  remove(path: string): Promise<void>;
}

export function attachmentQueryKey(noteId: string): readonly string[] {
  return ['notes', noteId, 'attachments'];
}

export function useNoteAttachments(
  noteId: string,
  options: { enabled?: boolean } = {},
): AttachmentUploadState {
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);

  const query = useQuery({
    queryKey: attachmentQueryKey(noteId),
    queryFn: async () => {
      const result = await api.get<{ attachments: AttachmentDto[] }>(
        `/notes/${noteId}/attachments`,
      );
      return result.attachments;
    },
    enabled: options.enabled ?? true,
    // Signed URLs expire in 15 minutes; re-sign well before a stale link 403s.
    staleTime: 10 * 60 * 1000,
  });

  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      const { uploadUrl, path } = await api.post<{ uploadUrl: string; path: string }>(
        `/notes/${noteId}/attachments`,
        { filename: file.name, contentType: file.type, sizeBytes: file.size },
      );

      const upload = await fetch(uploadUrl, {
        method: 'PUT',
        headers: { 'Content-Type': file.type },
        body: file,
      });

      if (!upload.ok) throw new Error('upload rejected by storage');

      // Only now does the note learn about the object.
      const current = queryClient.getQueryData<AttachmentDto[]>(attachmentQueryKey(noteId)) ?? [];
      await api.patch(`/notes/${noteId}`, {
        attachments: [...current.map((attachment) => attachment.path), path],
      });
    },

    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: attachmentQueryKey(noteId) });
      void queryClient.invalidateQueries({ queryKey: ['notes'] });
    },
  });

  const removeMutation = useMutation({
    mutationFn: (path: string) => api.delete(`/notes/${noteId}/attachments`, { path }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: attachmentQueryKey(noteId) });
      void queryClient.invalidateQueries({ queryKey: ['notes'] });
    },
  });

  return {
    attachments: query.data ?? [],
    isLoading: query.isLoading,
    isUploading: uploadMutation.isPending,
    error,

    upload: async (file) => {
      setError(null);

      if (typeof navigator !== 'undefined' && navigator.onLine === false) {
        setError('برای افزودن پیوست باید آنلاین باشید.');
        return;
      }

      try {
        await uploadMutation.mutateAsync(file);
      } catch (caught) {
        setError(
          caught instanceof Error && 'fieldError' in caught
            ? caught.message
            : 'بارگذاری فایل ناموفق بود.',
        );
      }
    },

    remove: async (path) => {
      setError(null);

      try {
        await removeMutation.mutateAsync(path);
      } catch {
        setError('حذف پیوست ناموفق بود.');
      }
    },
  };
}
