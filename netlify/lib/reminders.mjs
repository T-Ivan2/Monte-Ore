import { holidayName, isWeekend, romeNow, dueTimes, reminderBody, targetFor } from '../../src/logic.js';

// Decide chi avvisare. Le dipendenze sono passate da fuori per poterla testare senza rete.
export async function runReminders({ listSettings, claim, release, hoursFor, notify }, date = new Date()) {
  const { day, time } = romeNow(date);
  if (isWeekend(day) || holidayName(day)) return { sent: 0, failed: 0, skipped: 'non lavorativo' };
  let sent = 0, failed = 0;
  for (const { user_id, times, day_hours } of await listSettings()) {
    const target = targetFor(day, day_hours?.map(Number));
    const due = target > 0 ? [...new Set(dueTimes(times, time))] : [];
    if (!due.length) continue;
    // Ogni orario viene preso una sola volta, anche se la funzione gira più volte.
    const won = await Promise.all(due.map(t => claim(user_id, day, t)));
    const mine = due.filter((_, i) => won[i]);
    if (!mine.length) continue;
    try {
      const missing = target - await hoursFor(user_id, day);
      if (missing > 0) {
        await notify(user_id, { title: 'Monte Ore', body: reminderBody(missing), url: '/', tag: `ore-${day}` });
        sent += 1;
      }
    } catch (err) {
      // Libera gli orari: l'esecuzione del minuto dopo riprova, finché l'orario resta dovuto.
      failed += 1;
      console.error('reminder failed', user_id, err?.message || err);
      await Promise.all(mine.map(t => release(user_id, day, t).catch(() => {})));
    }
  }
  return { sent, failed };
}
