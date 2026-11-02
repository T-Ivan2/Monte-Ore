import { TARGET, holidayName, isWeekend, romeNow, dueTimes, reminderBody } from '../../src/logic.js';

// Decide chi avvisare. Le dipendenze sono passate da fuori per poterla testare senza rete.
export async function runReminders({ listSettings, claim, hoursFor, notify }, date = new Date()) {
  const { day, time } = romeNow(date);
  if (isWeekend(day) || holidayName(day)) return { sent: 0, skipped: 'non lavorativo' };
  let sent = 0;
  for (const { user_id, times } of await listSettings()) {
    const due = dueTimes(times, time);
    if (!due.length) continue;
    // Ogni orario viene preso una sola volta, anche se la funzione gira più volte.
    const claimed = (await Promise.all(due.map(t => claim(user_id, day, t)))).some(Boolean);
    if (!claimed) continue;
    const missing = TARGET - await hoursFor(user_id, day);
    if (missing > 0) {
      await notify(user_id, { title: 'Monte Ore', body: reminderBody(missing), url: '/', tag: `ore-${day}` });
      sent += 1;
    }
  }
  return { sent };
}
