import { describe, it, expect } from 'vitest';
import { enqueue, overlay, overlayTasks, overlayPlaces, flush } from '../src/outbox.js';

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

describe('coda offline: dettagli delle task', () => {
  const task = (patch, code = 'T1') => ({ op: 'task', who: 'inpeco', code, patch });
  const legacy = (t, code = 'T1') => ({ op: 'title', who: 'inpeco', code, title: t });
  it('fonde i dettagli, dopo la voce che crea la task', () => {
    const qq = q({ op: 'add', row: row('a', 3, { code: 'NEW' }) }, task({ title: 'Primo' }, 'NEW'), { op: 'add', row: row('b') }, task({ estimate: 40, title: 'Secondo' }, 'NEW'));
    expect(qq.map(x => x.op)).toEqual(['add', 'add', 'task']);
    expect(qq[2].patch).toEqual({ title: 'Secondo', estimate: 40 });
  });
  it('legge le code salvate con il vecchio formato del titolo', () => {
    expect(q(legacy('Analisi'), task({ functional: 'Mario Rossi' }))).toEqual([task({ title: 'Analisi', functional: 'Mario Rossi' })]);
    expect(overlayTasks([{ who: 'inpeco', code: 'T1', hours: 1 }], [legacy('Vecchio')])[0].title).toBe('Vecchio');
  });
  it('eliminare una voce non toglie i dettagli della task', () => {
    expect(q({ op: 'add', row: row('a') }, task({ title: 'Analisi' }), { op: 'remove', id: 'a' })).toEqual([task({ title: 'Analisi' })]);
  });
  it('mostra i dettagli anche sulle task create offline', () => {
    const out = overlayTasks([], q({ op: 'add', row: row('a', 2, { code: 'NEW' }) }, task({ title: 'Nuova analisi', estimate: 16 }, 'NEW')));
    expect(out).toMatchObject([{ code: 'NEW', title: 'Nuova analisi', estimate: 16, hours: 2 }]);
  });
  it('invia dettagli e sedi in ordine, anche dal vecchio formato', async () => {
    const calls = [];
    const api = { add: async r => calls.push(['add', r.id]), update: async () => {}, remove: async () => {},
      task: async (w, c, p) => calls.push(['task', c, p]), place: async (d, v) => calls.push(['place', d, v?.kind ?? null]) };
    await flush([{ op: 'add', row: row('a', 2, { code: 'NEW' }) }, legacy('Analisi', 'NEW'), { op: 'place', day: '2026-11-04', value: { kind: 'milano', place: null, client: null } }], api, isNet);
    expect(calls).toEqual([['add', 'a'], ['task', 'NEW', { title: 'Analisi' }], ['place', '2026-11-04', 'milano']]);
  });
});

describe('coda offline: sede del giorno', () => {
  const place = (day, kind, extra = {}) => ({ op: 'place', day, value: kind ? { kind, place: null, client: null, ...extra } : null });
  it('tiene solo l\'ultima scelta di ogni giorno', () => {
    const qq = q(place('2026-11-04', 'torino'), place('2026-11-05', 'smart'), place('2026-11-04', 'trasferta', { place: 'Bologna' }));
    expect(qq.map(x => [x.day, x.value.kind])).toEqual([['2026-11-05', 'smart'], ['2026-11-04', 'trasferta']]);
  });
  it('mostra le sedi in attesa sopra quelle lette, anche quando si tolgono', () => {
    const read = [{ day: '2026-11-03', kind: 'torino' }, { day: '2026-11-04', kind: 'milano' }];
    const out = overlayPlaces(read, q(place('2026-11-04', 'smart'), place('2026-11-03', null), place('2026-11-06', 'trasferta', { place: 'Roma', client: 'Inpeco' })));
    expect(out.map(p => [p.day, p.kind, p.place ?? null]).sort()).toEqual([['2026-11-04', 'smart', null], ['2026-11-06', 'trasferta', 'Roma']]);
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
