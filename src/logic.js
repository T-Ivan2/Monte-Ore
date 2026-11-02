// Regole pure, condivise da app e funzioni server.
export const TARGET = 8;
export const PROJECTS = [
  { id: 'shueco', name: 'Shüco', color: 'var(--c-shueco)' },
  { id: 'inpeco', name: 'Inpeco', color: 'var(--c-inpeco)' },
  { id: 'frau', name: 'Poltrona Frau', color: 'var(--c-frau)' }
];
export const ABSENCES = [
  { id: 'ferie', name: 'Ferie', color: 'var(--c-off)' },
  { id: 'permesso', name: 'Permesso', color: 'var(--c-off)' },
  { id: 'altro', name: 'Altra assenza', color: 'var(--c-off)' }
];
export const WHO = Object.fromEntries([...PROJECTS, ...ABSENCES].map(w => [w.id, w]));
export const DOW = ['Lunedì', 'Martedì', 'Mercoledì', 'Giovedì', 'Venerdì'];
export const MONTHS = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre'];
export const normalizeCode = raw => String(raw).replace(/\s+/g, '').toUpperCase();

export const pad = n => String(n).padStart(2, '0');
export const key = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const parse = k => { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d); };
export const addDays = (k, n) => { const d = parse(k); d.setDate(d.getDate() + n); return key(d); };
export const monday = k => addDays(k, -((parse(k).getDay() + 6) % 7));
export const weekDays = mon => [0, 1, 2, 3, 4].map(i => addDays(mon, i));
export const fmt = n => Number.isInteger(n) ? String(n) : n.toFixed(1).replace('.', ',');
export const isAbsence = id => ABSENCES.some(a => a.id === id);
export const isWeekend = k => { const d = parse(k).getDay(); return d === 0 || d === 6; };

export function monthWeekdays(ym) {
  const [y, m] = ym.split('-').map(Number);
  const days = [];
  for (let d = new Date(y, m - 1, 1); d.getMonth() === m - 1; d.setDate(d.getDate() + 1)) {
    if (d.getDay() >= 1 && d.getDay() <= 5) days.push(key(d));
  }
  return days;
}
export function monthBounds(ym) {
  const [y, m] = ym.split('-').map(Number);
  return { from: key(new Date(y, m - 1, 1)), to: key(new Date(y, m, 0)) };
}
export function shiftMonth(ym, delta) {
  const [y, m] = ym.split('-').map(Number);
  return key(new Date(y, m - 1 + delta, 1)).slice(0, 7);
}

function easterMonday(y) {
  const a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4;
  const f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4), k2 = c % 4, l = (32 + 2 * e + 2 * i - h - k2) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mo = Math.floor((h + l - 7 * m + 114) / 31), da = ((h + l - 7 * m + 114) % 31) + 1;
  return addDays(`${y}-${pad(mo)}-${pad(da)}`, 1);
}
export function holidayName(k) {
  const y = +k.slice(0, 4), md = k.slice(5);
  const fixed = {
    '01-01': 'Capodanno', '01-06': 'Epifania', '04-25': 'Liberazione', '05-01': 'Festa del lavoro',
    '06-02': 'Festa della Repubblica', '08-15': 'Ferragosto', '11-01': 'Ognissanti',
    '12-08': 'Immacolata', '12-25': 'Natale', '12-26': 'Santo Stefano'
  };
  if (y >= 2026 && md === '10-04') return 'San Francesco';
  if (fixed[md]) return fixed[md];
  return k === easterMonday(y) ? 'Pasquetta' : null;
}

export function parseHours(raw) {
  const n = Number(String(raw).trim().replace(',', '.'));
  return Number.isFinite(n) ? n : NaN;
}
// Restituisce gli errori da mostrare e i valori normalizzati da salvare.
export function validateEntry(draft, otherHours = 0) {
  const errors = {};
  const isProject = draft.kind === 'project';
  const code = isProject ? normalizeCode(draft.code) : null;
  if (isProject) {
    if (!code) errors.code = draft.newTask === false ? 'Scegli una task o aggiungine una nuova.' : 'Inserisci il codice della task ServiceNow.';
    else if (code.length > 40) errors.code = 'Il codice può avere al massimo 40 caratteri.';
  }
  const hours = parseHours(draft.hours);
  if (!Number.isFinite(hours) || hours <= 0) errors.hours = 'Inserisci un numero di ore maggiore di zero.';
  else if ((hours * 2) % 1 !== 0) errors.hours = "Inserisci le ore a blocchi di mezz'ora, ad esempio 7,5.";
  else if (hours + otherHours > 24) errors.hours = 'Una giornata non può superare le 24 ore.';
  return { errors, value: { who: draft.who, hours, code, description: draft.desc.trim() } };
}

// Data e ora in Italia, indipendenti dal fuso del server.
export function romeNow(date = new Date()) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Rome', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
  }).formatToParts(date).map(x => [x.type, x.value]));
  return { day: `${p.year}-${p.month}-${p.day}`, time: `${p.hour}:${p.minute}` };
}
const minutes = t => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
export const isTime = t => /^([01]\d|2[0-3]):[0-5]\d$/.test(t);
// Un orario è dovuto dal suo minuto esatto per i minuti successivi, così un'esecuzione in ritardo non lo perde.
export function dueTimes(times, now, windowMin = 5) {
  const n = minutes(now);
  return times.filter(isTime).filter(t => { const diff = n - minutes(t); return diff >= 0 && diff < windowMin; });
}
export function reminderBody(missing) {
  return `Oggi mancano ${fmt(missing)} h da inserire.`;
}
