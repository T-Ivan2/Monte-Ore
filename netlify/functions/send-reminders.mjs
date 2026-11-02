import { runReminders } from '../lib/reminders.mjs';
import { adminClient, sendToUser } from '../lib/server.mjs';

export default async () => {
  const db = adminClient();
  const result = await runReminders({
    async listSettings() {
      const { data, error } = await db.from('reminder_settings').select('user_id, times');
      if (error) throw error;
      return data;
    },
    async claim(user_id, day, time) {
      const { data, error } = await db.from('reminder_log')
        .upsert({ user_id, day, time }, { onConflict: 'user_id,day,time', ignoreDuplicates: true })
        .select();
      if (error) throw error;
      return data.length > 0;
    },
    async hoursFor(user_id, day) {
      const { data, error } = await db.from('entries').select('hours').eq('user_id', user_id).eq('day', day);
      if (error) throw error;
      return data.reduce((s, r) => s + Number(r.hours), 0);
    },
    notify: (user_id, payload) => sendToUser(db, user_id, payload)
  });
  console.log('reminders', result);
};

// Ogni minuto, dal lunedì al venerdì (orario UTC; l'ora italiana è calcolata nel codice).
export const config = { schedule: '* * * * 1-5' };
