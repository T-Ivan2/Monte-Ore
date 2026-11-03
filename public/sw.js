const CACHE = 'monte-ore-v1';

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.filter(n => n !== CACHE).map(n => caches.delete(n)));
    await self.clients.claim();
  })());
});

// Rende l'app apribile anche senza rete: mostra la copia salvata e la aggiorna in background.
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin || url.pathname.startsWith('/api/')) return;
  // Il controllo della nuova versione chiede la pagina pubblicata, non la copia salvata.
  if (e.request.cache === 'no-store') return;
  e.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const lookup = e.request.mode === 'navigate' ? '/' : e.request;
    const cached = await cache.match(lookup);
    const fresh = fetch(e.request).then(res => {
      if (res.ok) cache.put(lookup, res.clone());
      return res;
    });
    if (cached) { fresh.catch(() => {}); return cached; }
    return fresh;
  })());
});

self.addEventListener('push', e => {
  const data = e.data ? e.data.json() : {};
  e.waitUntil(self.registration.showNotification(data.title || 'Monte Ore', {
    body: data.body || 'Controlla le ore di oggi.',
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    tag: data.tag || 'monte-ore',
    data: { url: data.url || '/' }
  }));
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    if (all[0]) return all[0].focus();
    return self.clients.openWindow(e.notification.data?.url || '/');
  })());
});
