// Accesso ai dati. Senza variabili Supabase l'app gira in locale nel browser, utile per sviluppo e test.
import { createClient } from '@supabase/supabase-js';
import { DEFAULT_DAY_HOURS, DEFAULT_PROJECTS, validDayHours } from './logic.js';

const URL = import.meta.env.VITE_SUPABASE_URL;
const ANON = import.meta.env.VITE_SUPABASE_ANON_KEY;
export const isLocal = !URL || !ANON;

// Link arrivato dalla mail di recupero password, oppure con un errore (per esempio scaduto).
// Va letto prima che Supabase pulisca l'indirizzo.
export const authLink = (() => {
  if (typeof location === 'undefined') return {};
  const p = new URLSearchParams(location.hash.slice(1));
  const error = Boolean(p.get('error') || p.get('error_code'));
  // Toglie l'errore dall'indirizzo, così non ricompare a ogni ricaricamento.
  if (error) history.replaceState(null, '', location.pathname + location.search);
  return { recovery: p.get('type') === 'recovery', error };
})();
const DEFAULT_TIMES = ['13:00', '17:30'];

// Errore di rete, non del server: la richiesta non è arrivata o la risposta si è persa.
// Chrome dice "Failed to fetch", Safari "Load failed", Firefox "NetworkError", Node "fetch failed".
export const isNetworkError = err => (typeof navigator !== 'undefined' && navigator.onLine === false)
  || /Failed to fetch|Load failed|NetworkError|fetch failed|network/i.test(String(err?.message ?? ''));

// Copia locale dell'ultima lettura riuscita, per aprire l'app anche senza rete.
const CACHE_KEY = 'monte-ore-cache';
const cacheAll = () => { try { return JSON.parse(localStorage.getItem(CACHE_KEY)) || {}; } catch { return {}; } };
const cachePut = (k, v) => { try { localStorage.setItem(CACHE_KEY, JSON.stringify({ ...cacheAll(), [k]: v })); } catch { /* storage pieno o bloccato */ } };
export const clearCache = () => { try { localStorage.removeItem(CACHE_KEY); } catch { /* niente da togliere */ } };
async function readThrough(k, read) {
  try {
    const v = await read();
    cachePut(k, v);
    return v;
  } catch (err) {
    const cached = cacheAll()[k];
    if (isNetworkError(err) && cached !== undefined) return cached;
    throw err;
  }
}
// Supabase salva la sessione nel browser con una chiave sb-<progetto>-auth-token.
const hasStoredSession = () => { try { return Object.keys(localStorage).some(k => /^sb-.*-auth-token$/.test(k)); } catch { return false; } };

function must({ data, error }) {
  if (error) throw error;
  return data;
}
const toEntry = r => ({ ...r, hours: Number(r.hours), description: r.description || '' });

function supabaseStore() {
  const db = createClient(URL, ANON);
  return {
    // Senza rete un token scaduto non si rinnova: se c'era un accesso, l'app parte con la copia locale.
    async session() {
      try { return must(await db.auth.getSession()).session; }
      catch (err) { if (isNetworkError(err) && hasStoredSession()) return { offline: true }; throw err; }
    },
    async signIn(email, password) { clearCache(); must(await db.auth.signInWithPassword({ email, password })); },
    async signOut() { clearCache(); await db.auth.signOut(); },
    // La mail porta a questa stessa app, che poi chiede la nuova password.
    async resetPassword(email) { must(await db.auth.resetPasswordForEmail(email, { redirectTo: `${location.origin}/` })); },
    async updatePassword(password) { must(await db.auth.updateUser({ password })); },
    async token() { return (await this.session())?.access_token; },
    async listEntries(from, to) {
      return readThrough(`entries:${from}:${to}`, async () => must(await db.from('entries').select('*').gte('day', from).lte('day', to).order('created_at')).map(toEntry));
    },
    // Tutte le voci, a pagine: Supabase restituisce al massimo 1000 righe per richiesta.
    async listAllEntries() {
      const all = [];
      for (let from = 0; ; from += 1000) {
        const page = must(await db.from('entries').select('*').order('day').order('id').range(from, from + 999));
        all.push(...page.map(toEntry));
        if (page.length < 1000) return all;
      }
    },
    async addEntry(e) { return toEntry(must(await db.from('entries').insert(e).select().single())); },
    async addEntries(rows) { return must(await db.from('entries').insert(rows).select()).map(toEntry); },
    async updateEntry(id, e) { return toEntry(must(await db.from('entries').update(e).eq('id', id).select().single())); },
    async removeEntry(id) { must(await db.from('entries').delete().eq('id', id)); },
    async removeEntries(ids) { must(await db.from('entries').delete().in('id', ids)); },
    async listProjects() { return readThrough('projects', async () => must(await db.from('projects').select('id, name, color, archived_at, created_at').order('created_at'))); },
    async addProject(p) { return must(await db.from('projects').insert(p).select('id, name, color, archived_at, created_at').single()); },
    async updateProject(id, patch) { must(await db.from('projects').update(patch).eq('id', id)); },
    async removeProject(id) { must(await db.from('projects').delete().eq('id', id)); },
    async listTasks() {
      return readThrough('tasks', async () => must(await db.from('task_hours').select('*').order('last_day', { ascending: false, nullsFirst: false })).map(t => ({ ...t, hours: Number(t.hours) })));
    },
    async setTaskDone(who, code, done) {
      must(await db.from('tasks').update({ done_at: done ? new Date().toISOString() : null }).eq('who', who).eq('code', code));
    },
    async removeTask(who, code) { must(await db.from('tasks').delete().eq('who', who).eq('code', code)); },
    // Titolo della task: null lo toglie. La task nasce con la prima voce, quindi si imposta dopo.
    async setTaskTitle(who, code, title) { must(await db.from('tasks').update({ title: title || null }).eq('who', who).eq('code', code)); },
    async getSettings() { return readThrough('settings', () => this.readSettings()); },
    async readSettings() {
      const row = must(await db.from('reminder_settings').select('times, day_hours').maybeSingle());
      if (!row) {
        must(await db.from('reminder_settings').insert({ times: DEFAULT_TIMES, day_hours: DEFAULT_DAY_HOURS }));
        return { times: DEFAULT_TIMES, dayHours: DEFAULT_DAY_HOURS };
      }
      const dayHours = row.day_hours?.map(Number);
      return { times: row.times, dayHours: validDayHours(dayHours) ? dayHours : DEFAULT_DAY_HOURS };
    },
    async setTimes(times) {
      const { user } = must(await db.auth.getUser());
      must(await db.from('reminder_settings').upsert({ user_id: user.id, times }));
    },
    async setDayHours(dayHours) {
      const { user } = must(await db.auth.getUser());
      must(await db.from('reminder_settings').upsert({ user_id: user.id, day_hours: dayHours }));
    },
    async savePush(sub) {
      const { endpoint, keys } = sub.toJSON();
      const { user } = must(await db.auth.getUser());
      must(await db.from('push_subscriptions').upsert({ endpoint, user_id: user.id, p256dh: keys.p256dh, auth: keys.auth }));
    },
    async removePush(endpoint) { must(await db.from('push_subscriptions').delete().eq('endpoint', endpoint)); }
  };
}

function localStore() {
  const KEY = 'monte-ore-local';
  const read = () => {
    let s;
    try { s = JSON.parse(localStorage.getItem(KEY)); } catch { /* riparte da vuoto */ }
    const projects = DEFAULT_PROJECTS.map((p, i) => ({ ...p, archived_at: null, created_at: new Date(Date.UTC(2026, 0, 1, 0, 0, i)).toISOString() }));
    return { entries: [], tasks: [], projects, times: DEFAULT_TIMES, dayHours: DEFAULT_DAY_HOURS, ...s };
  };
  const touch = (s, e) => {
    if (!e.code) return;
    const t = s.tasks.find(x => x.who === e.who && x.code === e.code);
    if (t) t.done_at = null;
    else s.tasks.push({ who: e.who, code: e.code, done_at: null, created_at: new Date().toISOString() });
  };
  const write = s => { localStorage.setItem(KEY, JSON.stringify(s)); };
  return {
    async session() { return { local: true }; },
    async signIn() {},
    async signOut() {},
    async resetPassword() {},
    async updatePassword() {},
    async token() { return null; },
    async listEntries(from, to) { return read().entries.filter(e => e.day >= from && e.day <= to); },
    async listAllEntries() { return read().entries; },
    async addEntry(e) {
      const s = read(), row = { description: '', ...e, id: e.id ?? crypto.randomUUID() };
      s.entries.push(row); touch(s, row); write(s); return row;
    },
    async addEntries(rows) { const out = []; for (const r of rows) out.push(await this.addEntry(r)); return out; },
    async updateEntry(id, e) {
      const s = read(), i = s.entries.findIndex(x => x.id === id);
      const before = s.entries[i];
      s.entries[i] = { ...before, ...e };
      if (before.code !== s.entries[i].code || before.who !== s.entries[i].who) touch(s, s.entries[i]);
      write(s); return s.entries[i];
    },
    async removeEntry(id) { const s = read(); s.entries = s.entries.filter(x => x.id !== id); write(s); },
    async removeEntries(ids) { const s = read(); s.entries = s.entries.filter(x => !ids.includes(x.id)); write(s); },
    async listProjects() { return read().projects; },
    async addProject(p) {
      const s = read(), row = { ...p, archived_at: p.archived_at ?? null, created_at: new Date().toISOString() };
      if (s.projects.some(x => x.id === p.id)) throw new Error('duplicate');
      s.projects.push(row); write(s); return row;
    },
    async updateProject(id, patch) { const s = read(); Object.assign(s.projects.find(p => p.id === id), patch); write(s); },
    // Come nel database: un progetto con task non si può eliminare.
    async removeProject(id) {
      const s = read();
      if (s.tasks.some(t => t.who === id)) throw new Error('in use');
      s.projects = s.projects.filter(p => p.id !== id); write(s);
    },
    async listTasks() {
      const s = read();
      return s.tasks.map(t => {
        const rows = s.entries.filter(e => e.who === t.who && e.code === t.code);
        return { ...t, hours: rows.reduce((n, e) => n + e.hours, 0), last_day: rows.map(e => e.day).sort().at(-1) || null };
      }).sort((a, b) => (b.last_day || '').localeCompare(a.last_day || ''));
    },
    async setTaskDone(who, code, done) {
      const s = read();
      s.tasks.find(t => t.who === who && t.code === code).done_at = done ? new Date().toISOString() : null;
      write(s);
    },
    async removeTask(who, code) { const s = read(); s.tasks = s.tasks.filter(t => !(t.who === who && t.code === code)); write(s); },
    async setTaskTitle(who, code, title) {
      const s = read(), t = s.tasks.find(x => x.who === who && x.code === code);
      if (t) { t.title = title || null; write(s); }
    },
    async getSettings() { const s = read(); return { times: s.times, dayHours: s.dayHours }; },
    async setTimes(times) { const s = read(); s.times = times; write(s); },
    async setDayHours(dayHours) { const s = read(); s.dayHours = dayHours; write(s); },
    async savePush() {},
    async removePush() {}
  };
}

export const store = isLocal ? localStore() : supabaseStore();
