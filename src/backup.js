// Backup completo in JSON: preparazione, lettura con controlli e piano di ripristino.
// Le impostazioni sono nel file come riferimento, ma il ripristino non le applica per non cambiare quelle attuali.
// Funzioni pure, così le regole si provano senza browser né database.
import { ABSENCES, COLORS, isHalfHours, validatePlace, ESTIMATE_MAX } from './logic.js';

export const BACKUP_VERSION = 1;
const ABSENCE_IDS = ABSENCES.map(a => a.id);
const DAY = /^\d{4}-\d{2}-\d{2}$/;

export function buildBackup({ entries, projects, tasks, settings, places = [] }, now = new Date()) {
  return {
    app: 'monte-ore',
    version: BACKUP_VERSION,
    exported_at: now.toISOString(),
    settings: { times: settings.times, day_hours: settings.dayHours },
    projects: projects.map(({ id, name, color, archived_at, created_at }) => ({ id, name, color, archived_at: archived_at ?? null, created_at })),
    tasks: tasks.map(({ who, code, done_at, created_at, title, functional, estimate }) => ({ who, code, title: title || null, functional: functional || null, estimate: estimate ?? null, done_at: done_at ?? null, created_at })),
    places: [...places].sort((a, b) => a.day.localeCompare(b.day)).map(({ day, kind, place, client }) => ({ day, kind, place: place ?? null, client: client ?? null })),
    entries: [...entries].sort((a, b) => a.day.localeCompare(b.day))
      .map(({ id, day, who, hours, code, description, created_at }) => ({ id, day, who, hours, code: code ?? null, description: description || '', created_at }))
  };
}

// Legge il file e scarta ciò che non rispetta le regole dell'app. Lancia un errore leggibile se il file non è un backup.
export function parseBackup(text) {
  let data;
  try { data = JSON.parse(text); } catch { throw new Error('Il file non è un backup di Monte Ore: non è un JSON valido.'); }
  if (data?.app !== 'monte-ore' || !Array.isArray(data.entries) || !Array.isArray(data.projects)) {
    throw new Error('Il file non è un backup di Monte Ore.');
  }
  if (data.version > BACKUP_VERSION) throw new Error('Il backup viene da una versione più recente dell\'app: aggiorna l\'app e riprova.');
  const str = (v, max) => typeof v === 'string' && v.length > 0 && v.length <= max;
  const projects = data.projects.filter(p => str(p?.id, 40) && /^[a-z0-9][a-z0-9-]*$/.test(p.id) && !ABSENCE_IDS.includes(p.id)
    && str(p.name, 40) && COLORS.some(c => c.id === p.color));
  // Un dettaglio non valido non scarta la task: si perde solo quel dettaglio.
  const clean = v => typeof v === 'string' && v.trim() && v.trim().length <= 80 ? v.trim().replace(/\s+/g, ' ') : null;
  const tasks = (Array.isArray(data.tasks) ? data.tasks : []).filter(t => str(t?.who, 40) && str(t?.code, 40))
    .map(t => ({ ...t, title: clean(t.title), functional: clean(t.functional),
      estimate: Number.isFinite(t.estimate) && t.estimate > 0 && t.estimate <= ESTIMATE_MAX && (t.estimate * 2) % 1 === 0 ? t.estimate : null }));
  // Le sedi seguono le stesse regole dell'app; quelle non valide si scartano.
  const places = (Array.isArray(data.places) ? data.places : []).filter(p => p && DAY.test(p.day))
    .map(p => ({ day: p.day, ...validatePlace(p) })).filter(p => !Object.keys(p.errors).length).map(p => ({ day: p.day, ...p.value }));
  const valid = e => e && str(e.id, 64) && DAY.test(e.day) && isHalfHours(e.hours) && e.hours > 0
    && (ABSENCE_IDS.includes(e.who)
      ? e.code == null
      : str(e.who, 40) && str(e.code, 40) && e.code === e.code.toUpperCase() && !/\s/.test(e.code))
    && (e.description == null || typeof e.description === 'string');
  const entries = data.entries.filter(valid).map(e => ({ ...e, code: e.code ?? null, description: e.description || '' }));
  return { exportedAt: data.exported_at, projects, tasks, entries, places, invalid: data.entries.length - entries.length };
}

// Cosa aggiungere ai dati attuali. Non modifica né elimina mai ciò che c'è già.
export function planRestore(backup, current) {
  const haveProject = new Set(current.projects.map(p => p.id));
  const takenNames = new Set(current.projects.map(p => p.name.toLocaleLowerCase('it')));
  const projects = [];
  for (const p of backup.projects) {
    if (haveProject.has(p.id)) continue;
    // Il nome deve restare unico: se è già usato da un altro progetto si aggiunge "(backup)".
    let name = p.name;
    for (let n = 1; takenNames.has(name.toLocaleLowerCase('it')); n++) name = `${p.name.slice(0, 30)} (backup${n > 1 ? ' ' + n : ''})`;
    takenNames.add(name.toLocaleLowerCase('it'));
    projects.push({ id: p.id, name, color: p.color, archived_at: p.archived_at ?? null });
    haveProject.add(p.id);
  }
  const haveEntry = new Set(current.entries.map(e => e.id));
  const fresh = backup.entries.filter(e => !haveEntry.has(e.id));
  // Una voce di progetto ha bisogno del suo progetto, nel backup o già presente.
  const entries = fresh.filter(e => ABSENCE_IDS.includes(e.who) || haveProject.has(e.who))
    .map(({ id, day, who, hours, code, description }) => ({ id, day, who, hours, code, description }));
  // Le task nate dal ripristino tornano terminate se lo erano nel backup.
  const haveTask = new Set(current.tasks.map(t => `${t.who}|${t.code}`));
  const created = new Set(entries.filter(e => e.code).map(e => `${e.who}|${e.code}`).filter(k => !haveTask.has(k)));
  const doneTasks = backup.tasks.filter(t => t.done_at && created.has(`${t.who}|${t.code}`)).map(t => ({ who: t.who, code: t.code }));
  // Anche i dettagli (titolo, funzionale, stima) tornano solo sulle task create dal ripristino: quelle esistenti restano come sono.
  const details = backup.tasks.filter(t => created.has(`${t.who}|${t.code}`) && (t.title || t.functional || t.estimate))
    .map(t => ({ who: t.who, code: t.code, patch: Object.fromEntries(Object.entries({ title: t.title, functional: t.functional, estimate: t.estimate }).filter(([, v]) => v != null)) }));
  // Sedi: solo nei giorni che non ne hanno già una.
  const havePlace = new Set((current.places || []).map(p => p.day));
  const places = (backup.places || []).filter(p => !havePlace.has(p.day));
  return {
    projects,
    entries,
    doneTasks,
    details,
    places,
    present: backup.entries.length - fresh.length,
    skipped: backup.invalid + fresh.length - entries.length
  };
}
