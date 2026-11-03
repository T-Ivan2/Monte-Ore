// Prova l'endpoint /api/quick-log con un Supabase simulato in memoria.
import { describe, it, expect, vi, beforeEach } from 'vitest';

const db = { entries: [], tasks: [], projects: [], reminder_settings: [] };
// Costruttore di query minimo: filtra le righe in memoria e registra gli inserimenti.
function from(table) {
  const filters = [];
  let insert = null, single = false;
  const q = {
    select: () => q,
    eq: (col, v) => { filters.push(r => r[col] === v); return q; },
    gte: (col, v) => { filters.push(r => r[col] >= v); return q; },
    lte: (col, v) => { filters.push(r => r[col] <= v); return q; },
    maybeSingle: () => { single = true; return q; },
    insert: rows => { insert = rows; return q; },
    then: (ok, ko) => {
      if (insert) { db[table].push(...insert); return Promise.resolve({ data: null, error: null }).then(ok, ko); }
      const rows = db[table].filter(r => filters.every(f => f(r)));
      return Promise.resolve({ data: single ? rows[0] ?? null : rows, error: null }).then(ok, ko);
    }
  };
  return q;
}
vi.mock('@supabase/supabase-js', () => ({ createClient: () => ({ from }) }));

process.env.VAPID_PRIVATE_KEY = 'chiave-privata-di-prova';
const { default: handler } = await import('../netlify/functions/quick-log.mjs');
const { signToken, quickSecret } = await import('../netlify/lib/token.mjs');

const U1 = 'user-1', U2 = 'user-2';
const post = body => handler(new Request('https://x/api/quick-log', { method: 'POST', body: typeof body === 'string' ? body : JSON.stringify(body) }));
const token = (claims, secret = quickSecret()) => signToken({ u: U1, d: '2026-11-04', exp: Date.now() + 60000, ...claims }, secret);

beforeEach(() => {
  db.entries = [
    { user_id: U1, day: '2026-11-03', who: 'inpeco', hours: 8, code: 'T1', description: '', created_at: 'a' },
    { user_id: U2, day: '2026-11-04', who: 'inpeco', hours: 8, code: 'T1', description: '', created_at: 'a' }
  ];
  db.tasks = [{ user_id: U1, who: 'inpeco', code: 'T1', done_at: null }, { user_id: U2, who: 'inpeco', code: 'T1', done_at: null }];
  db.projects = [{ user_id: U1, id: 'inpeco', name: 'Inpeco', archived_at: null }, { user_id: U2, id: 'inpeco', name: 'Inpeco', archived_at: null }];
  db.reminder_settings = [{ user_id: U1, day_hours: ['8', '8', '8', '8', '8'] }];
});

describe('/api/quick-log', () => {
  it('registra le ore per l\'utente del token', async () => {
    const res = await post({ token: token({ k: 'fill', who: 'inpeco', code: 'T1' }) });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, message: 'Registrate 8 h su T1 (Inpeco).' });
    expect(db.entries.filter(r => r.day === '2026-11-04' && r.user_id === U1)).toEqual([
      { user_id: U1, day: '2026-11-04', who: 'inpeco', hours: 8, code: 'T1', description: '' }
    ]);
  });
  it('non guarda i dati di altri utenti', async () => {
    // U2 ha già 8 ore il 4 novembre: per U1 la copia deve comunque partire.
    const res = await post({ token: token({ k: 'copy' }) });
    expect((await res.json()).ok).toBe(true);
    expect(db.entries.filter(r => r.user_id === U1 && r.day === '2026-11-04')).toHaveLength(1);
  });
  it('rifiuta token falsi, scaduti o mancanti', async () => {
    const before = db.entries.length;
    for (const body of [{ token: token({ k: 'fill', who: 'inpeco', code: 'T1' }, Buffer.from('altro')) },
      { token: token({ k: 'copy', exp: Date.now() - 1 }) }, {}, 'non json']) {
      const res = await post(body);
      expect(res.status).toBe(401);
      expect((await res.json()).message).toMatch(/scaduto/);
    }
    expect(db.entries).toHaveLength(before);
  });
  it('accetta solo POST', async () => {
    const res = await handler(new Request('https://x/api/quick-log'));
    expect(res.status).toBe(405);
  });
});
