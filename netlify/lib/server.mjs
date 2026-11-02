import { createClient } from '@supabase/supabase-js';
import webpush from 'web-push';

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
