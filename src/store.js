// Accesso ai dati. Senza variabili Supabase l'app gira in locale nel browser, utile per sviluppo e test.
import { createClient } from '@supabase/supabase-js';

const URL = import.meta.env.VITE_SUPABASE_URL;
const ANON = import.meta.env.VITE_SUPABASE_ANON_KEY;
export const isLocal = !URL || !ANON;
const DEFAULT_TIMES = ['13:00', '17:30'];

function must({ data, error }) {
  if (error) throw error;
  return data;
}
const toEntry = r => ({ ...r, hours: Number(r.hours), description: r.description || '' });

function supabaseStore() {
  const db = createClient(URL, ANON);
  return {
    async session() { return must(await db.auth.getSession()).session; },
    async signIn(email, password) { must(await db.auth.signInWithPassword({ email, password })); },
    async signOut() { await db.auth.signOut(); },
    async token() { return (await this.session())?.access_token; },
    async listEntries(from, to) {
      return must(await db.from('entries').select('*').gte('day', from).lte('day', to).order('created_at')).map(toEntry);
    },
    async addEntry(e) { return toEntry(must(await db.from('entries').insert(e).select().single())); },
    async updateEntry(id, e) { return toEntry(must(await db.from('entries').update(e).eq('id', id).select().single())); },
    async removeEntry(id) { must(await db.from('entries').delete().eq('id', id)); },
    async listTasks() {
      return must(await db.from('task_hours').select('*').order('last_day', { ascending: false, nullsFirst: false })).map(t => ({ ...t, hours: Number(t.hours) }));
    },
    async setTaskDone(who, code, done) {
      must(await db.from('tasks').update({ done_at: done ? new Date().toISOString() : null }).eq('who', who).eq('code', code));
    },
    async removeTask(who, code) { must(await db.from('tasks').delete().eq('who', who).eq('code', code)); },
    async getTimes() {
      const row = must(await db.from('reminder_settings').select('times').maybeSingle());
      if (row) return row.times;
      must(await db.from('reminder_settings').insert({ times: DEFAULT_TIMES }));
      return DEFAULT_TIMES;
    },
    async setTimes(times) {
      const { user } = must(await db.auth.getUser());
      must(await db.from('reminder_settings').upsert({ user_id: user.id, times }));
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
    return { entries: [], tasks: [], times: DEFAULT_TIMES, ...s };
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
    async token() { return null; },
    async listEntries(from, to) { return read().entries.filter(e => e.day >= from && e.day <= to); },
    async addEntry(e) {
      const s = read(), row = { description: '', ...e, id: crypto.randomUUID() };
      s.entries.push(row); touch(s, row); write(s); return row;
    },
    async updateEntry(id, e) {
      const s = read(), i = s.entries.findIndex(x => x.id === id);
      const before = s.entries[i];
      s.entries[i] = { ...before, ...e };
      if (before.code !== s.entries[i].code || before.who !== s.entries[i].who) touch(s, s.entries[i]);
      write(s); return s.entries[i];
    },
    async removeEntry(id) { const s = read(); s.entries = s.entries.filter(x => x.id !== id); write(s); },
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
    async getTimes() { return read().times; },
    async setTimes(times) { const s = read(); s.times = times; write(s); },
    async savePush() {},
    async removePush() {}
  };
}

export const store = isLocal ? localStore() : supabaseStore();
