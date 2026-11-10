import { createClient } from '@supabase/supabase-js';
import webpush from 'web-push';
import { monthDays, incompleteDays } from '../../src/logic.js';

export function adminClient() {
  return createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
}

// Invia a tutti i dispositivi dell'utente e rimuove quelli non più validi.
// Se nessun dispositivo riceve la notifica per un errore temporaneo, lancia un errore così l'invio viene ritentato.
export async function sendToUser(db, userId, payload) {
  webpush.setVapidDetails(process.env.VAPID_SUBJECT, process.env.VITE_VAPID_PUBLIC_KEY, process.env.VAPID_PRIVATE_KEY);
  const { data: subs, error } = await db.from('push_subscriptions').select('*').eq('user_id', userId);
  if (error) throw error;
  let sent = 0, temporary = 0;
  await Promise.all(subs.map(async s => {
    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, JSON.stringify(payload));
      sent += 1;
    } catch (err) {
      if (err.statusCode === 404 || err.statusCode === 410) await db.from('push_subscriptions').delete().eq('endpoint', s.endpoint);
      else { temporary += 1; console.error('push failed', err.statusCode, err.body); }
    }
  }));
  if (sent === 0 && temporary > 0) throw new Error(`push failed on ${temporary} device(s)`);
  return sent;
}

// Dati per le azioni rapide di un utente: voci della settimana prima, task, progetti e ore previste.
export async function loadQuickContext(db, userId, day) {
  const from = new Date(`${day}T12:00:00Z`);
  from.setUTCDate(from.getUTCDate() - 7);
  const [entries, tasks, projects, settings] = await Promise.all([
    db.from('entries').select('day, who, hours, code, description, created_at').eq('user_id', userId)
      .gte('day', from.toISOString().slice(0, 10)).lte('day', day),
    db.from('tasks').select('who, code, done_at, title').eq('user_id', userId),
    db.from('projects').select('id, name, archived_at').eq('user_id', userId),
    db.from('reminder_settings').select('day_hours').eq('user_id', userId).maybeSingle()
  ]);
  for (const r of [entries, tasks, projects, settings]) if (r.error) throw r.error;
  return {
    entries: entries.data.map(e => ({ ...e, hours: Number(e.hours) })),
    tasks: tasks.data,
    projects: projects.data,
    dayHours: settings.data?.day_hours?.map(Number)
  };
}

// Con la chiave di servizio auth.uid() è vuoto: l'utente va indicato esplicitamente.
export async function insertEntries(db, userId, rows) {
  const { error } = await db.from('entries').insert(rows.map(r => ({ ...r, user_id: userId })));
  if (error) throw error;
}

// Numero da mostrare sull'icona: giorni incompleti del mese in corso, oggi compreso.
export async function countIncomplete(db, userId, today) {
  const month = today.slice(0, 7);
  const [entries, settings] = await Promise.all([
    db.from('entries').select('day, hours').eq('user_id', userId).gte('day', `${month}-01`).lte('day', today),
    db.from('reminder_settings').select('day_hours').eq('user_id', userId).maybeSingle()
  ]);
  for (const r of [entries, settings]) if (r.error) throw r.error;
  const rows = entries.data.map(e => ({ ...e, hours: Number(e.hours) }));
  return incompleteDays(monthDays(month), today, rows, settings.data?.day_hours?.map(Number)).length;
}
