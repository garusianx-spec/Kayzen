/* eslint-disable no-restricted-globals */
/**
 * Kayzen service worker.
 *
 * Hand-written rather than generated. The behaviours below are specific enough
 * — Jalali day-scoped API caching, an IndexedDB outbox shared with the page,
 * Persian notification bodies — that a generic Workbox config would need as
 * much configuration as this file has code, and would obscure what actually
 * happens when the network disappears.
 *
 * Caching strategy, by request kind:
 *
 *   navigations   network-first → cache → /offline
 *                 (a stale HTML shell is worse than a clear offline screen,
 *                  but either beats Chrome's dinosaur)
 *   /_next/static cache-first, immutable — content-hashed by the build
 *   icons, fonts  cache-first
 *   GET /api/v1   network-first with a cache fallback, so the Today screen
 *                 still renders yesterday's data in a tunnel
 *   writes        never cached; queued in IndexedDB by the page and replayed
 *                 here on `sync`
 */

const VERSION = 'v1';
const STATIC_CACHE = `kayzen-static-${VERSION}`;
const PAGES_CACHE = `kayzen-pages-${VERSION}`;
const API_CACHE = `kayzen-api-${VERSION}`;

const OFFLINE_URL = '/offline';

/** Shell assets fetched at install time so the first offline launch works. */
const PRECACHE_URLS = [
  OFFLINE_URL,
  '/manifest.json',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/favicon.ico',
];

const OUTBOX_DB_NAME = 'kayzen';
const OUTBOX_DB_VERSION = 1;
const OUTBOX_STORE = 'outbox';
const OUTBOX_SYNC_TAG = 'kayzen-outbox';

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(STATIC_CACHE);
      // `reload` bypasses the HTTP cache: a stale precache entry would pin the
      // offline page to whatever shipped weeks ago.
      await cache.addAll(PRECACHE_URLS.map((url) => new Request(url, { cache: 'reload' })));
    })(),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((key) => key.startsWith('kayzen-') && !key.endsWith(VERSION))
          .map((key) => caches.delete(key)),
      );

      // Navigation preload lets the browser start the network request while the
      // worker boots, which removes the worker's start-up cost from every
      // navigation.
      if (self.registration.navigationPreload) {
        await self.registration.navigationPreload.enable();
      }

      await self.clients.claim();
    })(),
  );
});

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
  if (event.data?.type === 'FLUSH_OUTBOX') event.waitUntil(replayOutbox());
});

// ---------------------------------------------------------------------------
// Fetch
// ---------------------------------------------------------------------------

self.addEventListener('fetch', (event) => {
  const { request } = event;

  // Only GET is ever served from a cache. Writes go to the network, and the
  // page parks them in the outbox when that fails.
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === 'navigate') {
    event.respondWith(handleNavigation(event));
    return;
  }

  if (url.pathname.startsWith('/api/v1/')) {
    // Authentication responses set cookies and must never be replayed.
    if (url.pathname.startsWith('/api/v1/auth/')) return;
    event.respondWith(networkFirst(request, API_CACHE));
    return;
  }

  if (
    // Fonts live under /_next/static/media now (next/font/local), so they are
    // covered by the first prefix rather than needing their own.
    url.pathname.startsWith('/_next/static/') ||
    url.pathname.startsWith('/icons/') ||
    url.pathname.startsWith('/audio/')
  ) {
    event.respondWith(cacheFirst(request, STATIC_CACHE));
  }
});

async function handleNavigation(event) {
  try {
    const preloaded = await event.preloadResponse;
    if (preloaded) {
      void cachePut(PAGES_CACHE, event.request, preloaded.clone());
      return preloaded;
    }

    const response = await fetch(event.request);
    void cachePut(PAGES_CACHE, event.request, response.clone());
    return response;
  } catch {
    const cached = await caches.match(event.request);
    if (cached) return cached;

    const offline = await caches.match(OFFLINE_URL);
    return (
      offline ??
      new Response('<h1>آفلاین</h1>', {
        status: 503,
        headers: { 'Content-Type': 'text/html; charset=utf-8' },
      })
    );
  }
}

async function networkFirst(request, cacheName) {
  try {
    const response = await fetch(request);
    if (response.ok) void cachePut(cacheName, request, response.clone());
    return response;
  } catch {
    const cached = await caches.match(request);
    if (cached) return cached;

    return new Response(
      JSON.stringify({
        ok: false,
        error: { code: 'NETWORK', message: 'آفلاین هستید و این اطلاعات ذخیره نشده است.' },
      }),
      { status: 503, headers: { 'Content-Type': 'application/json' } },
    );
  }
}

async function cacheFirst(request, cacheName) {
  const cached = await caches.match(request);
  if (cached) return cached;

  const response = await fetch(request);
  if (response.ok) void cachePut(cacheName, request, response.clone());
  return response;
}

async function cachePut(cacheName, request, response) {
  try {
    const cache = await caches.open(cacheName);
    await cache.put(request, response);
  } catch {
    // Quota exceeded or an opaque response; neither is worth failing a request.
  }
}

// ---------------------------------------------------------------------------
// Background sync — replays the outbox the page writes to
// ---------------------------------------------------------------------------

self.addEventListener('sync', (event) => {
  if (event.tag === OUTBOX_SYNC_TAG) event.waitUntil(replayOutbox());
});

function openOutbox() {
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

function outboxRequest(db, mode, operation) {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(OUTBOX_STORE, mode);
    const request = operation(transaction.objectStore(OUTBOX_STORE));

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function replayOutbox() {
  let db;

  try {
    db = await openOutbox();
  } catch {
    return;
  }

  const entries = (await outboxRequest(db, 'readonly', (store) => store.getAll())).sort(
    (left, right) => left.createdAt - right.createdAt,
  );

  let sent = 0;

  for (const entry of entries) {
    try {
      const response = await fetch(entry.url, {
        method: entry.method,
        headers: { 'Content-Type': 'application/json' },
        body: entry.body,
        credentials: 'include',
      });

      // A refusal (4xx) will never succeed on replay; dropping it stops one bad
      // row from blocking every write behind it.
      if (response.ok || (response.status >= 400 && response.status < 500)) {
        await outboxRequest(db, 'readwrite', (store) => store.delete(entry.id));
        if (response.ok) sent += 1;
        continue;
      }

      break;
    } catch {
      // Still offline. `sync` will fire again when the connection returns.
      break;
    }
  }

  db.close();

  if (sent > 0) {
    const clients = await self.clients.matchAll({ type: 'window' });
    for (const client of clients) client.postMessage({ type: 'OUTBOX_FLUSHED', sent });
  }
}

// ---------------------------------------------------------------------------
// Push notifications
// ---------------------------------------------------------------------------

self.addEventListener('push', (event) => {
  let payload = {};

  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = { title: 'کایزن', body: event.data?.text() ?? '' };
  }

  const title = payload.title || 'کایزن';

  event.waitUntil(
    self.registration.showNotification(title, {
      body: payload.body ?? '',
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      dir: 'rtl',
      lang: 'fa',
      // Same double-tap the app uses for a completed task, so a reminder feels
      // like it came from the same place.
      vibrate: payload.vibrate ?? [15, 50, 15],
      tag: payload.tag ?? 'kayzen',
      renotify: Boolean(payload.tag),
      data: { url: payload.url ?? '/' },
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = event.notification.data?.url ?? '/';

  event.waitUntil(
    (async () => {
      const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });

      // Focus the running app rather than opening a second window — in an
      // installed TWA a second window is a second task in the app switcher.
      for (const client of clients) {
        if (new URL(client.url).origin === self.location.origin) {
          await client.focus();
          if ('navigate' in client) await client.navigate(target);
          return;
        }
      }

      await self.clients.openWindow(target);
    })(),
  );
});
