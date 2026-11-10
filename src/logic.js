// Regole pure, condivise da app e funzioni server.
// Giornata standard: è il valore predefinito delle ore previste e l'unità delle "giornate" nell'export.
export const TARGET = 8;
// Ore previste da lunedì a venerdì. Sabato, domenica e festivi non ne prevedono.
export const DEFAULT_DAY_HOURS = [8, 8, 8, 8, 8];
// Palette dei progetti: ogni colore ha una variante chiara e una scura in style.css (--c-1 … --c-8).
export const COLORS = [
  { id: 'c1', name: 'Blu' }, { id: 'c2', name: 'Verde acqua' }, { id: 'c3', name: 'Rosso' }, { id: 'c4', name: 'Viola' },
  { id: 'c5', name: 'Arancio' }, { id: 'c6', name: 'Magenta' }, { id: 'c7', name: 'Verde' }, { id: 'c8', name: 'Azzurro' }
];
export const colorVar = c => COLORS.some(x => x.id === c) ? `var(--c-${c.slice(1)})` : 'var(--c-off)';
// I progetti stanno nel database; questi sono quelli di partenza della modalità locale.
export const DEFAULT_PROJECTS = [
  { id: 'shueco', name: 'Shüco', color: 'c1' },
  { id: 'inpeco', name: 'Inpeco', color: 'c2' },
  { id: 'frau', name: 'Poltrona Frau', color: 'c3' }
];
export const ABSENCES = [
  { id: 'ferie', name: 'Ferie', color: 'var(--c-off)' },
  { id: 'permesso', name: 'Permesso', color: 'var(--c-off)' },
  { id: 'altro', name: 'Altra assenza', color: 'var(--c-off)' }
];
export const DOW = ['Lunedì', 'Martedì', 'Mercoledì', 'Giovedì', 'Venerdì', 'Sabato', 'Domenica'];
export const MONTHS = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre'];
export const normalizeCode = raw => String(raw).replace(/\s+/g, '').toUpperCase();

export const pad = n => String(n).padStart(2, '0');
export const key = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const parse = k => { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d); };
export const addDays = (k, n) => { const d = parse(k); d.setDate(d.getDate() + n); return key(d); };
export const monday = k => addDays(k, -((parse(k).getDay() + 6) % 7));
export const weekDays = mon => [0, 1, 2, 3, 4, 5, 6].map(i => addDays(mon, i));
export const fmt = n => Number.isInteger(n) ? String(n) : n.toFixed(1).replace('.', ',');
export const isAbsence = id => ABSENCES.some(a => a.id === id);
export const isWeekend = k => { const d = parse(k).getDay(); return d === 0 || d === 6; };

export function monthDays(ym) {
  const [y, m] = ym.split('-').map(Number);
  const days = [];
  for (let d = new Date(y, m - 1, 1); d.getMonth() === m - 1; d.setDate(d.getDate() + 1)) days.push(key(d));
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

// Ore da registrare in un giorno: zero nel weekend, nei festivi e nei giorni impostati a zero.
export function targetFor(k, dayHours = DEFAULT_DAY_HOURS) {
  if (isWeekend(k) || holidayName(k)) return 0;
  const h = Number(dayHours?.[(parse(k).getDay() + 6) % 7]);
  return Number.isFinite(h) ? h : TARGET;
}
// Giorni fino a oggi compreso con meno ore di quelle previste. Lo usano la scheda Mese e il contatore sull'icona.
export function incompleteDays(days, today, entries, dayHours) {
  const total = d => entries.filter(e => e.day === d).reduce((n, e) => n + e.hours, 0);
  return days.filter(d => d <= today && targetFor(d, dayHours) > 0 && total(d) < targetFor(d, dayHours));
}
export const isHalfHours = h => Number.isFinite(h) && h >= 0 && h <= 24 && (h * 2) % 1 === 0;
export const validDayHours = arr => Array.isArray(arr) && arr.length === 5 && arr.every(isHalfHours);
// Ore medie di una giornata lavorata, per convertire le ore in giornate.
export const dayLength = dayHours => {
  const on = (validDayHours(dayHours) ? dayHours : DEFAULT_DAY_HOURS).filter(h => h > 0);
  return on.length ? on.reduce((s, h) => s + h, 0) / on.length : TARGET;
};

// Identificativo stabile per un nuovo progetto, ricavato dal nome. Non cambia se il progetto viene rinominato.
export function slugify(name, taken = []) {
  const base = String(name).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 30) || 'progetto';
  const used = new Set([...taken, ...ABSENCES.map(a => a.id)]);
  let id = base;
  for (let n = 2; used.has(id); n++) id = `${base}-${n}`;
  return id;
}
export function validateProject(draft, projects = [], selfId = null) {
  const errors = {};
  const name = String(draft.name ?? '').trim().replace(/\s+/g, ' ');
  const same = x => x.toLocaleLowerCase('it') === name.toLocaleLowerCase('it');
  if (!name) errors.name = 'Inserisci il nome del progetto.';
  else if (name.length > 40) errors.name = 'Il nome può avere al massimo 40 caratteri.';
  else if (projects.some(p => p.id !== selfId && same(p.name))) errors.name = 'Esiste già un progetto con questo nome.';
  else if (ABSENCES.some(a => same(a.name))) errors.name = "Questo nome è già usato da un'assenza.";
  if (!COLORS.some(c => c.id === draft.color)) errors.color = 'Scegli un colore.';
  return { errors, value: { name, color: draft.color } };
}

export function parseHours(raw) {
  const n = Number(String(raw).trim().replace(',', '.'));
  return Number.isFinite(n) ? n : NaN;
}
// Restituisce gli errori da mostrare e i valori normalizzati da salvare.
// Titolo di una task: facoltativo, spazi ripuliti, al massimo 80 caratteri. Stringa vuota = nessun titolo.
export const TITLE_MAX = 80;
export const normalizeTitle = raw => String(raw ?? '').trim().replace(/\s+/g, ' ');
// Nome breve per spazi stretti (pulsanti delle notifiche): titolo se c'è, altrimenti codice.
export const taskLabel = (task, max = 24) => {
  const name = task?.title || task?.code || '';
  return name.length > max ? `${name.slice(0, max - 1).trimEnd()}…` : name;
};

export function validateEntry(draft, otherHours = 0) {
  const errors = {};
  const isProject = draft.kind === 'project';
  const code = isProject ? normalizeCode(draft.code) : null;
  if (isProject && !draft.who) errors.who = 'Aggiungi un progetto dalla scheda Task.';
  if (isProject) {
    if (!code) errors.code = draft.newTask === false ? 'Scegli una task o aggiungine una nuova.' : 'Inserisci il codice della task ServiceNow.';
    else if (code.length > 40) errors.code = 'Il codice può avere al massimo 40 caratteri.';
  }
  // Il titolo si scrive solo creando una task nuova; per le task esistenti si cambia dalla scheda Task.
  const title = isProject && draft.newTask ? normalizeTitle(draft.title) : '';
  if (title.length > TITLE_MAX) errors.title = `Il titolo può avere al massimo ${TITLE_MAX} caratteri.`;
  const hours = parseHours(draft.hours);
  if (!Number.isFinite(hours) || hours <= 0) errors.hours = 'Inserisci un numero di ore maggiore di zero.';
  else if ((hours * 2) % 1 !== 0) errors.hours = "Inserisci le ore a blocchi di mezz'ora, ad esempio 7,5.";
  else if (hours + otherHours > 24) errors.hours = 'Una giornata non può superare le 24 ore.';
  return { errors, value: { who: draft.who, hours, code, description: draft.desc.trim() }, taskTitle: title || null };
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
// Un orario è dovuto dal suo minuto esatto per i 10 minuti successivi. La funzione gira ogni 5 minuti:
// la finestra doppia copre anche un'esecuzione in ritardo, e ogni orario parte comunque una sola volta.
export const REMINDER_WINDOW_MIN = 10;
export function dueTimes(times, now, windowMin = REMINDER_WINDOW_MIN) {
  const n = minutes(now);
  return times.filter(isTime).filter(t => { const diff = n - minutes(t); return diff >= 0 && diff < windowMin; });
}
export function reminderBody(missing) {
  return `Oggi mancano ${fmt(missing)} h da inserire.`;
}

/* AZIONI RAPIDE: le stesse regole valgono nell'app e nei pulsanti delle notifiche. */
const taskIsOpen = (tasks, e) => !e.code || tasks.some(t => t.who === e.who && t.code === e.code && !t.done_at);
// Ultimo giorno con voci nei 7 precedenti. Le voci su task terminate non si copiano: le riaprirebbero.
export function findCopySource(day, entries, tasks) {
  for (let i = 1; i <= 7; i++) {
    const src = addDays(day, -i);
    const all = entries.filter(e => e.day === src);
    const rows = all.filter(e => taskIsOpen(tasks, e));
    if (rows.length) return { day: src, rows, skipped: all.length - rows.length };
    if (all.length) return null;
  }
  return null;
}
// Task dell'ultima voce di progetto registrata, se è ancora aperta e il suo progetto è attivo.
export function lastOpenTask(entries, tasks, projects) {
  const active = id => projects.some(p => p.id === id && !p.archived_at);
  const recent = entries.filter(e => e.code)
    .sort((a, b) => b.day.localeCompare(a.day) || String(b.created_at ?? '').localeCompare(String(a.created_at ?? '')));
  const e = recent.find(x => taskIsOpen(tasks, x) && active(x.who));
  return e ? { who: e.who, code: e.code } : null;
}
const shortDay = k => { const d = parse(k); return `${DOW[(d.getDay() + 6) % 7].slice(0, 3).toLowerCase()} ${d.getDate()}`; };
// Al massimo due pulsanti per il promemoria di un giorno a cui mancano ore.
export function planQuickActions({ day, missing, entries, tasks, projects }) {
  const out = [];
  if (!entries.some(e => e.day === day)) {
    const src = findCopySource(day, entries, tasks);
    if (src) out.push({ kind: 'copy', title: `Copia da ${shortDay(src.day)} · ${fmt(src.rows.reduce((n, e) => n + e.hours, 0))} h` });
  }
  const task = missing > 0 ? lastOpenTask(entries.filter(e => e.day <= day), tasks, projects) : null;
  if (task) {
    const full = tasks.find(t => t.who === task.who && t.code === task.code);
    out.push({ kind: 'fill', ...task, title: `+${fmt(missing)} h su ${taskLabel({ ...task, title: full?.title })}` });
  }
  return out.slice(0, 2);
}
