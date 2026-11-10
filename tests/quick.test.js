import { describe, it, expect } from 'vitest';
import { findCopySource, lastOpenTask, planQuickActions, incompleteDays, monthDays } from '../src/logic.js';
import { signToken, verifyToken } from '../netlify/lib/token.mjs';
import { quickActions, runQuickLog, QUICK_TTL_MS } from '../netlify/lib/quick.mjs';
import { runReminders } from '../netlify/lib/reminders.mjs';

const projects = [{ id: 'inpeco', name: 'Inpeco', archived_at: null }, { id: 'frau', name: 'Poltrona Frau', archived_at: '2026-10-01' }];
const tasks = [{ who: 'inpeco', code: 'T1', done_at: null }, { who: 'inpeco', code: 'T2', done_at: '2026-11-01' }, { who: 'frau', code: 'F1', done_at: null }];
const e = (day, who, hours, code = null, created_at = `${day}T10:00:00Z`) => ({ day, who, hours, code, description: '', created_at });

describe('azioni rapide: regole', () => {
  it('trova il giorno da copiare saltando le task terminate', () => {
    const entries = [e('2026-11-03', 'inpeco', 6, 'T1'), e('2026-11-03', 'inpeco', 2, 'T2')];
    expect(findCopySource('2026-11-04', entries, tasks)).toMatchObject({ day: '2026-11-03', skipped: 1 });
    expect(findCopySource('2026-11-04', [e('2026-11-03', 'inpeco', 8, 'T2')], tasks)).toBeNull();
    expect(findCopySource('2026-11-20', entries, tasks)).toBeNull();
  });
  it('sceglie l\'ultima task aperta di un progetto attivo', () => {
    const entries = [e('2026-11-02', 'inpeco', 8, 'T1'), e('2026-11-03', 'frau', 4, 'F1'), e('2026-11-03', 'inpeco', 4, 'T2')];
    expect(lastOpenTask(entries, tasks, projects)).toEqual({ who: 'inpeco', code: 'T1' });
    const sameDay = [e('2026-11-03', 'inpeco', 4, 'T1', '2026-11-03T09:00Z'), e('2026-11-03', 'inpeco', 4, 'T3', '2026-11-03T11:00Z')];
    expect(lastOpenTask(sameDay, [...tasks, { who: 'inpeco', code: 'T3', done_at: null }], projects)).toEqual({ who: 'inpeco', code: 'T3' });
    expect(lastOpenTask([e('2026-11-03', 'ferie', 8)], tasks, projects)).toBeNull();
  });
  it('propone copia e completamento solo quando servono', () => {
    const entries = [e('2026-11-03', 'inpeco', 8, 'T1')];
    expect(planQuickActions({ day: '2026-11-04', missing: 8, entries, tasks, projects })).toEqual([
      { kind: 'copy', title: 'Copia da mar 3 · 8 h' },
      { kind: 'fill', who: 'inpeco', code: 'T1', title: '+8 h su T1' }
    ]);
    const titled = tasks.map(t => t.code === 'T1' ? { ...t, title: 'Analisi requisiti' } : t);
    expect(planQuickActions({ day: '2026-11-04', missing: 8, entries, tasks: titled, projects })[1].title).toBe('+8 h su Analisi requisiti');
    const partial = [...entries, e('2026-11-04', 'inpeco', 3, 'T1')];
    expect(planQuickActions({ day: '2026-11-04', missing: 5, entries: partial, tasks, projects })).toEqual([
      { kind: 'fill', who: 'inpeco', code: 'T1', title: '+5 h su T1' }
    ]);
    expect(planQuickActions({ day: '2026-11-04', missing: 8, entries: [], tasks, projects })).toEqual([]);
  });
});

describe('azioni rapide: token', () => {
  const secret = Buffer.from('segreto');
  it('accetta solo token integri e non scaduti', () => {
    const t = signToken({ u: 'u1', d: '2026-11-04', k: 'fill', exp: 2000 }, secret);
    expect(verifyToken(t, secret, 1000)).toMatchObject({ u: 'u1', k: 'fill' });
    expect(verifyToken(t, secret, 3000)).toBeNull();
    expect(verifyToken(t, Buffer.from('altro'), 1000)).toBeNull();
    const [body, mac] = t.split('.');
    const forged = Buffer.from(JSON.stringify({ u: 'u2', d: '2026-11-04', k: 'fill', exp: 2000 })).toString('base64url');
    expect(verifyToken(`${forged}.${mac}`, secret, 1000)).toBeNull();
    expect(verifyToken(`${body}.${mac}.x`, secret, 1000)).toBeNull();
    for (const bad of [undefined, '', 'abc', `${body}.`, '.', 42]) expect(verifyToken(bad, secret, 1000)).toBeNull();
    expect(verifyToken(t, null, 1000)).toBeNull();
  });
  it('allega ai pulsanti token verificabili e con scadenza', () => {
    const ctx = { entries: [e('2026-11-03', 'inpeco', 8, 'T1')], tasks, projects };
    const acts = quickActions(ctx, { user_id: 'u1', day: '2026-11-04', missing: 8 }, secret, 0);
    expect(acts.map(a => [a.action, a.title])).toEqual([['a0', 'Copia da mar 3 · 8 h'], ['a1', '+8 h su T1']]);
    expect(verifyToken(acts[1].token, secret, 1)).toEqual({ u: 'u1', d: '2026-11-04', k: 'fill', who: 'inpeco', code: 'T1', exp: QUICK_TTL_MS });
    expect(quickActions(ctx, { user_id: 'u1', day: '2026-11-04', missing: 8 }, null)).toEqual([]);
  });
});

describe('azioni rapide: esecuzione', () => {
  const setup = (entries, extra = {}) => {
    const inserted = [];
    const ctx = { entries, tasks, projects, dayHours: [8, 8, 8, 8, 8], ...extra };
    return { inserted, deps: {
      loadContext: async () => ({ ...ctx, entries: [...ctx.entries, ...inserted.map(r => ({ ...r, created_at: 'z' }))] }),
      insertEntries: async (u, rows) => { inserted.push(...rows.map(r => ({ ...r, user: u }))); }
    } };
  };
  const copy = { u: 'u1', d: '2026-11-04', k: 'copy' };
  const fill = { u: 'u1', d: '2026-11-04', k: 'fill', who: 'inpeco', code: 'T1' };

  it('copia il giorno una sola volta', async () => {
    const { inserted, deps } = setup([e('2026-11-03', 'inpeco', 6, 'T1'), e('2026-11-03', 'permesso', 2)]);
    expect(await runQuickLog(deps, copy)).toEqual({ ok: true, message: 'Copiate 8 h da martedì 3 novembre.' });
    expect(inserted).toEqual([
      { day: '2026-11-04', who: 'inpeco', hours: 6, code: 'T1', description: '', user: 'u1' },
      { day: '2026-11-04', who: 'permesso', hours: 2, code: null, description: '', user: 'u1' }
    ]);
    expect((await runQuickLog(deps, copy)).ok).toBe(false);
    expect(inserted).toHaveLength(2);
  });
  it('completa le ore mancanti una sola volta', async () => {
    const { inserted, deps } = setup([e('2026-11-04', 'inpeco', 3, 'T1')]);
    expect(await runQuickLog(deps, fill)).toEqual({ ok: true, message: 'Registrate 5 h su T1 (Inpeco).' });
    expect(await runQuickLog(deps, fill)).toEqual({ ok: true, message: 'La giornata è già completa.' });
    expect(inserted).toHaveLength(1);
    expect(inserted[0]).toMatchObject({ day: '2026-11-04', who: 'inpeco', code: 'T1', hours: 5 });
  });
  it('usa il titolo della task nel messaggio di conferma', async () => {
    const { deps } = setup([], { tasks: tasks.map(t => t.code === 'T1' ? { ...t, title: 'Analisi requisiti' } : t) });
    expect((await runQuickLog(deps, fill)).message).toBe('Registrate 8 h su Analisi requisiti · T1 (Inpeco).');
  });
  it('usa le ore previste dell\'utente', async () => {
    const { inserted, deps } = setup([], { dayHours: [8, 8, 6, 8, 8] });
    await runQuickLog(deps, fill);
    expect(inserted[0].hours).toBe(6);
  });
  it('non registra su task terminate o progetti archiviati', async () => {
    const { inserted, deps } = setup([]);
    expect((await runQuickLog(deps, { ...fill, code: 'T2' })).ok).toBe(false);
    expect((await runQuickLog(deps, { ...fill, who: 'frau', code: 'F1' })).ok).toBe(false);
    expect((await runQuickLog(deps, { ...fill, k: 'boh' })).ok).toBe(false);
    expect(inserted).toEqual([]);
  });
});

describe('contatore sull\'icona', () => {
  it('conta i giorni lavorativi incompleti fino a oggi', () => {
    const entries = [e('2026-11-02', 'inpeco', 8, 'T1'), e('2026-11-03', 'inpeco', 4, 'T1'), e('2026-11-07', 'inpeco', 2, 'T1')];
    const nov = monthDays('2026-11');
    expect(incompleteDays(nov, '2026-11-04', entries)).toEqual(['2026-11-03', '2026-11-04']);
    expect(incompleteDays(nov, '2026-11-04', entries, [8, 4, 0, 8, 8])).toEqual([]);
    // Weekend e festivi non contano, nemmeno con delle ore registrate.
    expect(incompleteDays(nov, '2026-11-09', [...entries, e('2026-11-04', 'inpeco', 8, 'T1'), e('2026-11-05', 'inpeco', 8, 'T1'), e('2026-11-06', 'inpeco', 8, 'T1')])).toEqual(['2026-11-03', '2026-11-09']);
    expect(incompleteDays(monthDays('2026-12'), '2026-12-08', [], [8, 8, 8, 8, 8])).toHaveLength(5);
  });
});

describe('promemoria con pulsanti', () => {
  const base = sent => ({
    listSettings: async () => [{ user_id: 'u', times: ['13:00'] }],
    claim: async () => true,
    release: async () => {},
    hoursFor: async () => 0,
    notify: async (u, p) => { sent.push(p); }
  });
  const at13 = new Date('2026-11-04T12:00:00Z');
  it('allega i pulsanti al promemoria', async () => {
    const sent = [];
    await runReminders({ ...base(sent), actionsFor: async (u, d, m) => [{ action: 'a0', title: `+${m} h`, token: 't' }] }, at13);
    expect(sent[0].actions).toEqual([{ action: 'a0', title: '+8 h', token: 't' }]);
  });
  it('invia il promemoria anche se pulsanti e contatore falliscono', async () => {
    const sent = [];
    const fail = async () => { throw new Error('db'); };
    await runReminders({ ...base(sent), actionsFor: fail, badgeFor: fail }, at13);
    expect(sent).toHaveLength(1);
    expect(sent[0].actions).toEqual([]);
    expect(sent[0].badge).toBeUndefined();
  });
  it('allega il numero per l\'icona', async () => {
    const sent = [];
    await runReminders({ ...base(sent), badgeFor: async (u, d) => (u === 'u' && d === '2026-11-04' ? 3 : -1) }, at13);
    expect(sent[0].badge).toBe(3);
  });
});
