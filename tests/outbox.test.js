import { describe, it, expect } from 'vitest';
import { enqueue, overlay, overlayTasks, flush } from '../src/outbox.js';

const row = (id, hours = 3, extra = {}) => ({ id, day: '2026-11-04', who: 'inpeco', hours, code: 'T1', description: '', ...extra });
const q = (...ops) => ops.reduce(enqueue, []);
const netErr = () => Object.assign(new Error('TypeError: Failed to fetch'), { net: true });
const isNet = e => Boolean(e?.net);

describe('coda offline: fusione', () => {
  it('fonde le modifiche di una voce mai inviata', () => {
    expect(q({ op: 'add', row: row('a') }, { op: 'update', id: 'a', patch: { hours: 4 } }))
      .toEqual([{ op: 'add', row: row('a', 4) }]);
  });
  it('una voce aggiunta e poi eliminata non lascia traccia', () => {
    expect(q({ op: 'add', row: row('a') }, { op: 'update', id: 'a', patch: { hours: 4 } }, { op: 'remove', id: 'a' })).toEqual([]);
  });
  it('unisce le modifiche successive di una voce già sul server', () => {
    expect(q({ op: 'update', id: 's', patch: { hours: 4 } }, { op: 'update', id: 's', patch: { description: 'x' } }))
      .toEqual([{ op: 'update', id: 's', patch: { hours: 4, description: 'x' } }]);
  });
  it('eliminando una voce del server scarta le sue modifiche in attesa', () => {
    expect(q({ op: 'update', id: 's', patch: { hours: 4 } }, { op: 'add', row: row('b') }, { op: 'remove', id: 's' }))
      .toEqual([{ op: 'add', row: row('b') }, { op: 'remove', id: 's' }]);
  });
  it('non modifica la coda ricevuta', () => {
    const before = [{ op: 'add', row: row('a') }];
    const copy = structuredClone(before);
    enqueue(before, { op: 'update', id: 'a', patch: { hours: 9 } });
    expect(before).toEqual(copy);
  });
});

describe('coda offline: titolo delle task', () => {
  const title = (t, code = 'T1') => ({ op: 'title', who: 'inpeco', code, title: t });
  it('tiene solo l\'ultimo titolo, dopo la voce che crea la task', () => {
    const qq = q({ op: 'add', row: row('a', 3, { code: 'NEW' }) }, title('Primo', 'NEW'), { op: 'add', row: row('b') }, title('Secondo', 'NEW'));
    expect(qq.map(x => x.op)).toEqual(['add', 'add', 'title']);
    expect(qq[2].title).toBe('Secondo');
  });
  it('eliminare una voce non toglie il titolo della task', () => {
    expect(q({ op: 'add', row: row('a') }, title('Analisi'), { op: 'remove', id: 'a' })).toEqual([title('Analisi')]);
  });
  it('mostra il titolo anche sulle task create offline', () => {
    const out = overlayTasks([], q({ op: 'add', row: row('a', 2, { code: 'NEW' }) }, title('Nuova analisi', 'NEW')));
    expect(out).toMatchObject([{ code: 'NEW', title: 'Nuova analisi', hours: 2 }]);
  });
  it('invia il titolo in ordine', async () => {
    const calls = [];
    const api = { add: async r => calls.push(['add', r.id]), update: async () => {}, remove: async () => {}, title: async (w, c, t) => calls.push(['title', c, t]) };
    await flush(q({ op: 'add', row: row('a', 2, { code: 'NEW' }) }, title('Analisi', 'NEW')), api, isNet);
    expect(calls).toEqual([['add', 'a'], ['title', 'NEW', 'Analisi']]);
  });
});

describe('coda offline: dati mostrati', () => {
  const server = [row('s1', 2), row('s2', 1)];
  it('applica aggiunte, modifiche ed eliminazioni in attesa', () => {
    const pending = q({ op: 'add', row: row('a', 3) }, { op: 'update', id: 's1', patch: { hours: 5 } }, { op: 'remove', id: 's2' });
    expect(overlay(server, pending).map(e => [e.id, e.hours])).toEqual([['s1', 5], ['a', 3]]);
  });
  it('non duplica una voce già arrivata al server', () => {
    expect(overlay([...server, row('a')], q({ op: 'add', row: row('a') }))).toHaveLength(3);
  });
  it('crea o riapre le task delle voci in attesa', () => {
    const tasks = [{ who: 'inpeco', code: 'T1', done_at: '2026-11-01', hours: 10, last_day: '2026-10-31' }];
    const pending = q({ op: 'add', row: row('a', 3) }, { op: 'add', row: row('b', 2, { code: 'NEW' }) }, { op: 'add', row: row('c', 8, { who: 'ferie', code: null }) });
    const out = overlayTasks(tasks, pending);
    expect(out).toEqual([
      { who: 'inpeco', code: 'NEW', done_at: null, hours: 2, last_day: '2026-11-04' },
      { who: 'inpeco', code: 'T1', done_at: null, hours: 13, last_day: '2026-11-04' }
    ]);
    expect(tasks[0].hours).toBe(10);
  });
});

describe('coda offline: invio', () => {
  const api = (behaviour = {}) => {
    const calls = [];
    const run = (kind, arg) => { calls.push([kind, arg]); const f = behaviour[kind]; if (f) f(arg, calls.length); };
    return { calls, api: { add: async r => run('add', r.id), update: async id => run('update', id), remove: async id => run('remove', id) } };
  };
  const pending = q({ op: 'add', row: row('a') }, { op: 'update', id: 's', patch: { hours: 1 } }, { op: 'remove', id: 't' });

  it('invia tutto in ordine', async () => {
    const { calls, api: a } = api();
    expect(await flush(pending, a, isNet)).toEqual({ remaining: [], applied: 3, failed: [] });
    expect(calls).toEqual([['add', 'a'], ['update', 's'], ['remove', 't']]);
  });
  it('se cade la rete si ferma e tiene il resto', async () => {
    const { calls, api: a } = api({ update: () => { throw netErr(); } });
    const res = await flush(pending, a, isNet);
    expect(res.applied).toBe(1);
    expect(res.remaining).toEqual(pending.slice(1));
    expect(calls).toHaveLength(2);
  });
  it('una voce già arrivata al server conta come inviata', async () => {
    const { api: a } = api({ add: () => { throw Object.assign(new Error('duplicate key'), { code: '23505' }); } });
    expect(await flush(pending, a, isNet)).toMatchObject({ remaining: [], applied: 3, failed: [] });
  });
  it('scarta e segnala ciò che il server rifiuta, senza fermarsi', async () => {
    const { calls, api: a } = api({ update: () => { throw Object.assign(new Error('violates check'), { code: '23514' }); } });
    const res = await flush(pending, a, isNet);
    expect(res.remaining).toEqual([]);
    expect(res.applied).toBe(2);
    expect(res.failed.map(f => f.op)).toEqual([pending[1]]);
    expect(calls).toHaveLength(3);
  });
});
