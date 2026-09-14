'use client';

/**
 * Offline mutation outbox.
 *
 * Writes made without a connection are parked in IndexedDB and replayed when
 * one returns. The same object store is read by the service worker's
 * `sync` handler (see `public/sw.js`), so a queued task survives the tab being
 * closed — the browser replays it in the background and the user finds their
 * change already saved.
 *
 * IndexedDB rather than `localStorage`: the queue is written from two contexts
 * (page and worker), which `localStorage` cannot do, and it must survive a
 * multi-megabyte note attachment path without hitting a 5 MB ceiling.
 *
 * Hand-rolled over the raw API rather than pulled from a wrapper library —
 * three operations (put, getAll, delete) do not justify a dependency that also
 * has to be re-implemented in the worker.
 */

export const OUTBOX_DB_NAME = 'kayzen';
export const OUTBOX_DB_VERSION = 1;
export const OUTBOX_STORE = 'outbox';
export const OUTBOX_SYNC_TAG = 'kayzen-outbox';

export interface OutboxEntry {
  id: string;
  url: string;
  method: 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  body: string | null;
  createdAt: number;
  attempts: number;
  /** React Query key to invalidate once this entry lands. */
  invalidate?: string[];
  /** Short Persian label, shown in the pending-changes indicator. */
  label?: string;
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(OUTBOX_DB_NAME, OUTBOX_DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(OUTBOX_STORE)) {
        db.createObjectStore(OUTBOX_STORE, { keyPath: 'id' });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function withStore<T>(
  mode: IDBTransactionMode,
  operation: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const db = await openDatabase();

  try {
    return await new Promise<T>((resolve, reject) => {
      const transaction = db.transaction(OUTBOX_STORE, mode);
      const request = operation(transaction.objectStore(OUTBOX_STORE));

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
      transaction.onabort = () => reject(transaction.error);
    });
  } finally {
    db.close();
  }
}

export function isOutboxSupported(): boolean {
  return typeof indexedDB !== 'undefined';
}

export async function enqueue(
  entry: Omit<OutboxEntry, 'id' | 'createdAt' | 'attempts'>,
): Promise<OutboxEntry> {
  const record: OutboxEntry = {
    ...entry,
    id: crypto.randomUUID(),
    createdAt: Date.now(),
    attempts: 0,
  };

  await withStore('readwrite', (store) => store.put(record));
  await requestBackgroundSync();

  return record;
}

export async function listQueued(): Promise<OutboxEntry[]> {
  if (!isOutboxSupported()) return [];

  const entries = await withStore<OutboxEntry[]>('readonly', (store) => store.getAll());
  return entries.sort((left, right) => left.createdAt - right.createdAt);
}

export async function removeQueued(id: string): Promise<void> {
  await withStore('readwrite', (store) => store.delete(id));
}

async function markAttempt(entry: OutboxEntry): Promise<void> {
  await withStore('readwrite', (store) => store.put({ ...entry, attempts: entry.attempts + 1 }));
}

/**
 * Asks the browser to replay the queue in the background.
 *
 * Background Sync is Chromium-only, which is exactly where the installed TWA
 * runs. Everywhere else the `online` listener in `useOutboxSync` does the same
 * job while a tab is open.
 */
async function requestBackgroundSync(): Promise<void> {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;

  try {
    const registration = await navigator.serviceWorker.ready;
    const sync = (
      registration as ServiceWorkerRegistration & {
        sync?: { register(tag: string): Promise<void> };
      }
    ).sync;

    await sync?.register(OUTBOX_SYNC_TAG);
  } catch {
    // Permission denied or unsupported: the foreground flush still covers it.
  }
}

export interface FlushResult {
  sent: number;
  failed: number;
  remaining: number;
}

/** Attempts, in order, to fetch every queued entry. Order matters: a task's
 * creation must land before the completion that references it. */
export async function flushOutbox(): Promise<FlushResult> {
  if (!isOutboxSupported()) return { sent: 0, failed: 0, remaining: 0 };

  const entries = await listQueued();
  let sent = 0;
  let failed = 0;

  for (const entry of entries) {
    try {
      const response = await fetch(entry.url, {
        method: entry.method,
        headers: { 'Content-Type': 'application/json' },
        body: entry.body,
        credentials: 'include',
      });

      // 4xx means the server understood and refused: replaying it forever would
      // wedge the queue behind one bad row, so it is dropped. 5xx and network
      // failures stay queued.
      if (response.ok || (response.status >= 400 && response.status < 500)) {
        await removeQueued(entry.id);
        if (response.ok) sent += 1;
        else failed += 1;
        continue;
      }

      await markAttempt(entry);
      failed += 1;
    } catch {
      await markAttempt(entry);
      failed += 1;
      // A network failure means the rest will fail too; stop and keep the order.
      break;
    }
  }

  const remaining = (await listQueued()).length;
  return { sent, failed, remaining };
}
