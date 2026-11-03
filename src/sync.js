// Scritture delle ore che funzionano anche offline. Se la rete manca, la modifica va in coda
// (salvata sul dispositivo) e parte appena possibile, nell'ordine in cui è stata fatta.
import { store, isLocal, isNetworkError } from './store.js';
import { enqueue, flush } from './outbox.js';

const KEY = 'monte-ore-outbox';
const RETRY_MS = 60000;
const load = () => { try { return JSON.parse(localStorage.getItem(KEY)) || []; } catch { return []; } };

let queue = load();
let incoming = [];    // modifiche arrivate mentre un invio è in corso
let flushing = null;
let retryTimer = null;
const listeners = { change: () => {}, synced: () => {}, failed: () => {} };

const save = () => { try { localStorage.setItem(KEY, JSON.stringify(queue)); } catch { /* storage pieno o bloccato */ } };
const changed = () => { save(); listeners.change(); };

export const pendingOps = () => [...queue, ...incoming];
export const pendingCount = () => pendingOps().length;
// change: la coda è cambiata. synced: sono arrivate al server delle modifiche. failed: il server ne ha rifiutate.
export function onSync(handlers) { Object.assign(listeners, handlers); }

function scheduleRetry() {
  clearTimeout(retryTimer);
  if (pendingCount()) retryTimer = setTimeout(() => flushNow(), RETRY_MS);
}

// Esegue subito se si può; altrimenti mette in coda. Restituisce { queued } per adattare i messaggi.
async function write(ops, online) {
  if (isLocal) { await online(); return { queued: false }; }
  if (!flushing && !queue.length) {
    try { await online(); return { queued: false }; }
    catch (err) { if (!isNetworkError(err)) throw err; }
  }
  if (flushing) incoming.push(...ops);
  else for (const op of ops) queue = enqueue(queue, op);
  changed();
  scheduleRetry();
  if (!flushing) flushNow();
  return { queued: true };
}

const withId = row => ({ description: '', ...row, id: row.id ?? crypto.randomUUID() });

export async function addEntries(rows) {
  const full = rows.map(withId);
  const { queued } = await write(full.map(row => ({ op: 'add', row })), () => store.addEntries(full));
  return { rows: full, queued };
}
export async function addEntry(row) {
  const { rows, queued } = await addEntries([row]);
  return { row: rows[0], queued };
}
export async function updateEntry(prev, patch) {
  const { queued } = await write([{ op: 'update', id: prev.id, patch }], () => store.updateEntry(prev.id, patch));
  return { row: { ...prev, ...patch }, queued };
}
export async function removeEntries(ids) {
  return write(ids.map(id => ({ op: 'remove', id })), () => store.removeEntries(ids));
}
export const removeEntry = id => removeEntries([id]);

// Invia la coda. Un solo invio alla volta; le modifiche fatte nel frattempo si accodano dopo.
export function flushNow() {
  if (isLocal || flushing || !queue.length) return flushing || Promise.resolve();
  flushing = (async () => {
    const res = await flush(queue, {
      add: row => store.addEntry(row),
      update: (id, patch) => store.updateEntry(id, patch),
      remove: id => store.removeEntry(id)
    }, isNetworkError);
    queue = res.remaining;
    for (const op of incoming) queue = enqueue(queue, op);
    incoming = [];
    flushing = null;
    changed();
    // Modifiche arrivate durante un invio riuscito: si mandano subito. Se manca la rete ci pensa il tentativo programmato.
    if (!res.remaining.length && queue.length) flushNow();
    else scheduleRetry();
    if (res.failed.length) {
      console.error('modifiche rifiutate dal server', res.failed);
      listeners.failed(res.failed.length);
    }
    if (res.applied || res.failed.length) listeners.synced();
  })();
  return flushing;
}

// Quando torna la rete parte subito.
if (typeof window !== 'undefined') window.addEventListener('online', () => flushNow());
