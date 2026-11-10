// Stato dell'app e calcoli che ne derivano. Le viste leggono e modificano S, poi chiamano render().
import {
  ABSENCES, DEFAULT_DAY_HOURS, colorVar, findCopySource, key, addDays, monday, weekDays, fmt, isWeekend, holidayName, monthBounds, targetFor
} from './logic.js';
import { store, isNetworkError } from './store.js';
import { overlay, overlayTasks } from './outbox.js';
import { pendingOps } from './sync.js';

export const today = () => key(new Date());
// Valore provvisorio: nel weekend startApp sceglie il giorno quando i dati sono caricati.
const first = isWeekend(today()) ? monday(addDays(today(), 2)) : today();

export const S = {
  entries: [],
  tasks: [],
  projects: [],
  loaded: new Set(),
  times: [],
  dayHours: DEFAULT_DAY_HOURS,
  view: 'day',
  selected: first,
  week: monday(first),
  month: first.slice(0, 7),
  lastProject: null,
  editing: null,
  forceOpen: false,
  errors: {},
  busy: false,
  draft: null,
  push: 'unavailable',
  lastSeenDay: today(),
  panel: null, // 'hours' | 'notif' | null
  hoursError: '',
  projectForm: null, // { id: null per un nuovo progetto, name, color, errors }
  taskEdit: null // { who, code, title, error }: titolo di una task in modifica nella scheda Task
};

export const dayEntries = d => S.entries.filter(e => e.day === d);
export const dayTotal = d => dayEntries(d).reduce((s, e) => s + e.hours, 0);
export const target = d => targetFor(d, S.dayHours);
export const rest = d => Math.max(0, target(d) - dayTotal(d));
// Giorno libero: weekend, festivo o giorno impostato a zero ore.
export const offLabel = d => holidayName(d) ? `${holidayName(d)}, festivo` : isWeekend(d) ? 'Weekend' : 'Giorno libero';

export const activeProjects = () => S.projects.filter(p => !p.archived_at);
// Progetto o assenza con nome e colore pronti per la pagina.
export function who(id) {
  const p = S.projects.find(x => x.id === id);
  if (p) return { ...p, color: colorVar(p.color) };
  return ABSENCES.find(a => a.id === id) || { id, name: id, color: 'var(--c-off)' };
}
export const names = () => Object.fromEntries([...S.projects, ...ABSENCES].map(w => [w.id, w.name]));

// Titolo di ogni task, per chiave "progetto|codice" (Excel e liste).
export const taskTitles = () => Object.fromEntries(S.tasks.filter(t => t.title).map(t => [`${t.who}|${t.code}`, t.title]));
export const taskOf = (id, code) => S.tasks.find(t => t.who === id && t.code === code);
export const openTasks = id => S.tasks.filter(t => t.who === id && !t.done_at);
// Con una sola task aperta la propone già selezionata. Senza task aperte chiede il codice.
export function taskChoice(id) {
  const open = openTasks(id);
  return { code: open.length === 1 ? open[0].code : '', newTask: open.length === 0 };
}
const defaultProject = () => {
  const active = activeProjects();
  return active.some(p => p.id === S.lastProject) ? S.lastProject : active[0]?.id ?? null;
};
export function freshDraft(kind = 'project') {
  const id = kind === 'project' ? defaultProject() : 'ferie';
  return { kind, who: id, ...taskChoice(id), hours: fmt(rest(S.selected) || 1), desc: '' };
}

export const copySource = d => findCopySource(d, S.entries, S.tasks);

// Il sabato e la domenica si aprono sul venerdì se è incompleto, altrimenti sul lunedì successivo.
export const startDay = () => {
  const t = today();
  if (!isWeekend(t)) return t;
  const fri = addDays(monday(t), 4);
  return dayTotal(fri) < target(fri) ? fri : monday(addDays(t, 2));
};
// Carica anche la settimana prima, così "Copia" trova il giorno da cui copiare.
export const around = d => [...weekDays(addDays(monday(d), -7)), ...weekDays(monday(d))];

export function pickDay(d) {
  S.selected = d; S.week = monday(d); S.editing = null; S.forceOpen = false; S.errors = {}; S.draft = freshDraft();
}
// Le task del server (o della copia locale) più quelle create dalle voci ancora in coda.
let taskBase = [];
export async function refreshTasks() {
  try { taskBase = await store.listTasks(); }
  catch (err) { if (!isNetworkError(err)) throw err; }
  S.tasks = overlayTasks(taskBase, pendingOps());
}
export async function refreshProjects() { S.projects = await store.listProjects(); }
export async function ensure(days) {
  const months = [...new Set(days.map(d => d.slice(0, 7)))].filter(m => !S.loaded.has(m));
  await Promise.all(months.map(async m => {
    const { from, to } = monthBounds(m);
    // Le modifiche ancora in coda si vedono subito, anche dopo un riavvio senza rete.
    const rows = overlay(await store.listEntries(from, to), pendingOps()).filter(e => e.day >= from && e.day <= to);
    S.entries = S.entries.filter(e => e.day.slice(0, 7) !== m).concat(rows);
    S.loaded.add(m);
  }));
}
