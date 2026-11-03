import { runReminders } from '../lib/reminders.mjs';
import { adminClient, sendToUser, loadQuickContext, countIncomplete } from '../lib/server.mjs';
import { quickActions } from '../lib/quick.mjs';
import { quickSecret } from '../lib/token.mjs';

export default async () => {
  const db = adminClient();
  const result = await runReminders({
    async listSettings() {
      const { data, error } = await db.from('reminder_settings').select('user_id, times, day_hours');
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
    async release(user_id, day, time) {
      const { error } = await db.from('reminder_log').delete().eq('user_id', user_id).eq('day', day).eq('time', time);
      if (error) throw error;
    },
    async hoursFor(user_id, day) {
      const { data, error } = await db.from('entries').select('hours').eq('user_id', user_id).eq('day', day);
      if (error) throw error;
      return data.reduce((s, r) => s + Number(r.hours), 0);
    },
    async actionsFor(user_id, day, missing) {
      return quickActions(await loadQuickContext(db, user_id, day), { user_id, day, missing }, quickSecret());
    },
    badgeFor: (user_id, day) => countIncomplete(db, user_id, day),
    notify: (user_id, payload) => sendToUser(db, user_id, payload)
  });
  console.log('reminders', result);
};

// Ogni 5 minuti, dal lunedì al venerdì (orario UTC; l'ora italiana è calcolata nel codice).
export const config = { schedule: '*/5 * * * 1-5' };
