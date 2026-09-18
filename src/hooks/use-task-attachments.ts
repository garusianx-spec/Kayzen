'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { ApiClientError, api } from '@/lib/api/client';
import { MAX_ATTACHMENT_BYTES, isAllowedAttachmentType } from '@/lib/storage/constants';
import type { TaskAttachmentDto, TaskAttachmentLinkDto } from '@/types/domain';

/**
 * Task attachments, from the browser's side.
 *
 * The upload deliberately bypasses the app server: the file goes straight to
 * Supabase Storage through a one-shot signed URL, so a 10 MiB photo never
 * passes through a serverless function's request body (where it would be slow,
 * expensive, and in some deployments over the payload limit).
 *
 * Three steps, in order, because a `TaskAttachment` row must never point at an
 * object that failed to upload:
 *
 *   1. ask the API to sign an upload for this task,
 *   2. PUT the bytes to Supabase,
 *   3. record the object key, name, type and size against the task.
 *
 * Attachments are the one part of the app that is *not* offline-capable, and
 * that is a deliberate limit rather than an oversight: a signed URL expires, so
 * queueing an upload for replay hours later would fail anyway. The picker says
 * so rather than failing silently.
 */

export function taskAttachmentQueryKey(taskId: string): readonly string[] {
  return ['tasks', taskId, 'attachments'];
}

/** Rejected before the network: the same limits the bucket enforces. */
export function describeUnacceptable(file: File): string | null {
  if (!isAllowedAttachmentType(file.type)) return 'فقط تصویر یا PDF می‌توانید پیوست کنید.';
  if (file.size > MAX_ATTACHMENT_BYTES) return 'حداکثر حجم مجاز ۱۰ مگابایت است.';
  if (file.size === 0) return 'این فایل خالی است.';

  return null;
}

/**
 * The whole three-step upload, as one call.
 *
 * Standalone rather than a method on the hook because the composer needs it for
 * a task that did not exist when the hook rendered: files picked while writing a
 * *new* task are held in memory and uploaded once the task has an id.
 */
export async function uploadTaskAttachment(taskId: string, file: File): Promise<void> {
  const { uploadUrl, path } = await api.post<{ uploadUrl: string; path: string }>(
    `/tasks/${taskId}/attachments/sign`,
    { filename: file.name, contentType: file.type, sizeBytes: file.size },
  );

  const upload = await fetch(uploadUrl, {
    method: 'PUT',
    headers: { 'Content-Type': file.type },
    body: file,
  });

  if (!upload.ok) throw new Error('upload rejected by storage');

  // Only now does the task learn about the object.
  await api.post<{ attachment: TaskAttachmentDto }>(`/tasks/${taskId}/attachments`, {
    path,
    fileName: file.name,
    mimeType: file.type,
    sizeBytes: file.size,
  });
}

/** Turns whatever went wrong into one sentence a person can act on. */
export function uploadErrorMessage(error: unknown): string {
  if (error instanceof ApiClientError) {
    // A validation message from the API names the actual limit that was hit;
    // a generic "بارگذاری ناموفق بود" would throw that away.
    return error.details ? (Object.values(error.details)[0]?.[0] ?? error.message) : error.message;
  }

  return 'بارگذاری فایل ناموفق بود.';
}

export interface TaskAttachmentState {
  attachments: TaskAttachmentLinkDto[];
  isLoading: boolean;
  isUploading: boolean;
  error: string | null;
  clearError(): void;
  upload(file: File): Promise<void>;
  remove(id: string): Promise<void>;
}

export function useTaskAttachments(
  taskId: string | null,
  options: { enabled?: boolean } = {},
): TaskAttachmentState {
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);

  const query = useQuery({
    queryKey: taskAttachmentQueryKey(taskId ?? 'new'),
    queryFn: async () => {
      const result = await api.get<{ attachments: TaskAttachmentLinkDto[] }>(
        `/tasks/${taskId}/attachments`,
      );
      return result.attachments;
    },
    enabled: Boolean(taskId) && (options.enabled ?? true),
    // Signed URLs expire in 15 minutes; re-sign well before a stale link 403s.
    staleTime: 10 * 60 * 1000,
  });

  const invalidate = (): void => {
    if (taskId) {
      void queryClient.invalidateQueries({ queryKey: taskAttachmentQueryKey(taskId) });
    }
    void queryClient.invalidateQueries({ queryKey: ['tasks'] });
    void queryClient.invalidateQueries({ queryKey: ['today'] });
  };

  const uploadMutation = useMutation({
    mutationFn: (file: File) => uploadTaskAttachment(taskId as string, file),
    onSuccess: invalidate,
  });

  const removeMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/tasks/${taskId}/attachments`, { id }),
    onSuccess: invalidate,
  });

  return {
    attachments: query.data ?? [],
    isLoading: query.isLoading,
    isUploading: uploadMutation.isPending,
    error,
    clearError: () => setError(null),

    upload: async (file) => {
      setError(null);
      if (!taskId) return;

      const unacceptable = describeUnacceptable(file);
      if (unacceptable) {
        setError(unacceptable);
        return;
      }

      if (typeof navigator !== 'undefined' && navigator.onLine === false) {
        setError('برای افزودن فایل باید آنلاین باشید.');
        return;
      }

      try {
        await uploadMutation.mutateAsync(file);
      } catch (caught) {
        setError(uploadErrorMessage(caught));
      }
    },

    remove: async (id) => {
      setError(null);
      if (!taskId) return;

      try {
        await removeMutation.mutateAsync(id);
      } catch {
        setError('حذف فایل ناموفق بود.');
      }
    },
  };
}
