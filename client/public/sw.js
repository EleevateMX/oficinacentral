// Service worker de Nuvora: app instalable + notificaciones push.
// - Navegación: primero la red; sin conexión, la última copia de la app.
// - /assets/* (archivos con hash de Vite): primero la caché.
// - /api y /socket.io nunca se guardan.
const VERSION = 'nuvora-v1';
const SHELL = ['/', '/manifest.webmanifest', '/logo.svg', '/icons/icon-192.png', '/icons/maskable-192.png'];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(VERSION);
    // Uno por uno: si alguno falla, la instalación sigue
    await Promise.allSettled(SHELL.map((u) => cache.add(new Request(u, { cache: 'reload' }))));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    for (const k of await caches.keys()) if (k !== VERSION) await caches.delete(k);
    await self.clients.claim();
  })());
});

const isPrivate = (url) => url.pathname.startsWith('/api') || url.pathname.startsWith('/socket.io');

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin || isPrivate(url)) return;

  if (req.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const res = await fetch(req);
        if (res.ok && url.pathname === '/') (await caches.open(VERSION)).put('/', res.clone());
        return res;
      } catch {
        return (await caches.match('/')) || Response.error();
      }
    })());
    return;
  }

  if (url.pathname.startsWith('/assets/')) {
    event.respondWith((async () => {
      const hit = await caches.match(req);
      if (hit) return hit;
      const res = await fetch(req);
      if (res.ok) (await caches.open(VERSION)).put(req, res.clone());
      return res;
    })());
  }
});

// ---------- Notificaciones push ----------
self.addEventListener('push', (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch { data = { body: event.data?.text() }; }
  const title = data.title || 'Nuvora';
  event.waitUntil(self.registration.showNotification(title, {
    body: data.body || '',
    icon: data.icon || '/icons/icon-192.png',
    badge: '/icons/maskable-192.png',
    tag: data.tag || undefined,
    renotify: !!data.tag,
    timestamp: data.ts || Date.now(),
    data: { url: data.url || '/' },
  }));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = new URL(event.notification.data?.url || '/', self.location.origin).href;
  event.waitUntil((async () => {
    const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const win = wins.find((w) => new URL(w.url).origin === self.location.origin);
    if (win) {
      // La app ya está abierta: se enfoca y ella misma abre la conversación o el evento
      win.postMessage({ type: 'nuvora:open', url: target });
      return win.focus();
    }
    return self.clients.openWindow(target);
  })());
});
