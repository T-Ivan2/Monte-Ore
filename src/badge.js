// Contatore sull'icona dell'app: giorni incompleti del mese in corso, oggi compreso.
// Funziona dove il sistema lo supporta: iPhone con l'app sulla Home e notifiche attive, Chrome ed Edge da computer.
import { monthDays, incompleteDays } from './logic.js';
import { S, today } from './state.js';

let last = null;
export function updateBadge() {
  if (!('setAppBadge' in navigator)) return;
  const t = today(), month = t.slice(0, 7);
  // Senza tutto il mese caricato il conteggio sarebbe sbagliato: meglio non toccarlo.
  if (!S.loaded.has(month)) return;
  const n = incompleteDays(monthDays(month), t, S.entries, S.dayHours).length;
  if (n === last) return;
  last = n;
  (n > 0 ? navigator.setAppBadge(n) : navigator.clearAppBadge()).catch(() => { last = null; });
}
