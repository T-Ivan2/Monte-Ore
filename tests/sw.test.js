// Carica il service worker in un contesto simulato e verifica notifiche e pulsanti.
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { describe, it, expect } from 'vitest';

function loadSW(fetchImpl) {
  const handlers = {}, shown = [], requests = [], opened = [], badges = [];
  const self = {
    navigator: { setAppBadge: async n => { badges.push(n); }, clearAppBadge: async () => { badges.push(0); } },
    addEventListener: (type, fn) => { handlers[type] = fn; },
    registration: { showNotification: async (title, opts) => { shown.push({ title, ...opts }); } },
    clients: { matchAll: async () => [], openWindow: async url => { opened.push(url); }, claim: async () => {} },
    skipWaiting: () => {}
  };
  const fetch = async (url, init) => { requests.push({ url, body: JSON.parse(init.body) }); return fetchImpl(); };
  vm.runInNewContext(readFileSync('public/sw.js', 'utf8'), { self, fetch, location: { origin: 'https://x' }, caches: {}, URL });
  // Esegue un evento e aspetta tutto ciò che è passato a waitUntil.
  const fire = async (type, ev) => {
    const waits = [];
    handlers[type]({ ...ev, waitUntil: p => waits.push(p) });
    await Promise.all(waits);
  };
  return { fire, shown, requests, opened, badges };
}
const notification = data => ({ data, close: () => {} });

describe('service worker', () => {
  const payload = { title: 'Monte Ore', body: 'Oggi mancano 8 h da inserire.', tag: 'ore-2026-11-04',
    actions: [{ action: 'a0', title: 'Copia da mar 3 · 8 h', token: 'tok0' }, { action: 'a1', title: '+8 h su T1', token: 'tok1' }, { action: 'a2', title: 'troppi', token: 'x' }] };

  it('mostra al massimo due pulsanti senza esporre i token nel titolo', async () => {
    const sw = loadSW();
    await sw.fire('push', { data: { json: () => payload } });
    expect(sw.shown[0].actions).toEqual([{ action: 'a0', title: 'Copia da mar 3 · 8 h' }, { action: 'a1', title: '+8 h su T1' }]);
    expect(sw.shown[0].data.tokens).toEqual({ a0: 'tok0', a1: 'tok1' });
  });
  it('funziona anche con un promemoria senza pulsanti né contatore', async () => {
    const sw = loadSW();
    await sw.fire('push', { data: { json: () => ({ body: 'x' }) } });
    expect(sw.shown[0].actions).toEqual([]);
    expect(sw.badges).toEqual([]);
  });
  it('aggiorna il numero sull\'icona dal promemoria', async () => {
    const sw = loadSW();
    await sw.fire('push', { data: { json: () => ({ ...payload, badge: 2 }) } });
    expect(sw.badges).toEqual([2]);
  });
  it('registra le ore dal pulsante e mostra l\'esito', async () => {
    const sw = loadSW(async () => ({ json: async () => ({ ok: true, message: 'Registrate 8 h su T1 (Inpeco).' }) }));
    await sw.fire('notificationclick', { action: 'a1', notification: notification({ url: '/', tokens: { a0: 'tok0', a1: 'tok1' } }) });
    expect(sw.requests).toEqual([{ url: '/api/quick-log', body: { token: 'tok1' } }]);
    expect(sw.shown[0].body).toBe('Registrate 8 h su T1 (Inpeco).');
    expect(sw.opened).toEqual([]);
    expect(sw.badges).toEqual([]);
  });
  it('toglie il numero quando il pulsante completa il mese', async () => {
    const sw = loadSW(async () => ({ json: async () => ({ ok: true, message: 'ok', badge: 0 }) }));
    await sw.fire('notificationclick', { action: 'a0', notification: notification({ url: '/', tokens: { a0: 'tok0' } }) });
    expect(sw.badges).toEqual([0]);
  });
  it('avvisa se la rete non risponde', async () => {
    const sw = loadSW(async () => { throw new Error('offline'); });
    await sw.fire('notificationclick', { action: 'a0', notification: notification({ url: '/', tokens: { a0: 'tok0' } }) });
    expect(sw.shown[0].body).toMatch(/Non sono riuscito/);
  });
  it('apre l\'app quando si tocca la notifica', async () => {
    const sw = loadSW();
    await sw.fire('notificationclick', { action: '', notification: notification({ url: '/', tokens: {} }) });
    expect(sw.requests).toEqual([]);
    expect(sw.opened).toEqual(['/']);
  });
});
