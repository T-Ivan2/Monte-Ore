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

const ICON = '/icons/icon-192.png';

// Numero sull'icona dell'app, dove il sistema lo supporta. Zero toglie il numero.
async function setBadge(n) {
  const nav = self.navigator;
  if (typeof n !== 'number' || !nav?.setAppBadge) return;
  try { await (n > 0 ? nav.setAppBadge(n) : nav.clearAppBadge()); } catch { /* non supportato o non permesso */ }
}

// Il promemoria può avere fino a due pulsanti, ognuno con un token firmato dal server.
self.addEventListener('push', e => {
  const data = e.data ? e.data.json() : {};
  const actions = Array.isArray(data.actions) ? data.actions.slice(0, 2) : [];
  e.waitUntil(Promise.all([
    self.registration.showNotification(data.title || 'Monte Ore', {
      body: data.body || 'Controlla le ore di oggi.',
      icon: ICON,
      badge: ICON,
      tag: data.tag || 'monte-ore',
      actions: actions.map(({ action, title }) => ({ action, title })),
      data: { url: data.url || '/', tokens: Object.fromEntries(actions.map(a => [a.action, a.token])) }
    }),
    setBadge(data.badge)
  ]));
});

// Registra le ore senza aprire l'app e mostra l'esito in una nuova notifica.
async function quickLog(token) {
  let message, badge;
  try {
    const res = await fetch('/api/quick-log', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token }) });
    ({ message, badge } = await res.json());
  } catch { /* rete assente o risposta non valida */ }
  await setBadge(badge);
  await self.registration.showNotification('Monte Ore', {
    body: message || 'Non sono riuscito a registrare le ore. Tocca per aprire l\'app.',
    icon: ICON,
    badge: ICON,
    tag: 'monte-ore-esito',
    data: { url: '/' }
  });
}

self.addEventListener('notificationclick', e => {
  e.notification.close();
  const token = e.action && e.notification.data?.tokens?.[e.action];
  if (token) { e.waitUntil(quickLog(token)); return; }
  e.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    // App già aperta: la porta in primo piano e le chiede di mostrare il giorno da compilare con i dati aggiornati.
    if (all[0]) { all[0].postMessage({ type: 'open-today' }); return all[0].focus(); }
    return self.clients.openWindow(e.notification.data?.url || '/');
  })());
});
