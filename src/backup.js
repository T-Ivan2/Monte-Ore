// Backup completo in JSON: preparazione, lettura con controlli e piano di ripristino.
// Le impostazioni sono nel file come riferimento, ma il ripristino non le applica per non cambiare quelle attuali.
// Funzioni pure, così le regole si provano senza browser né database.
import { ABSENCES, COLORS, isHalfHours } from './logic.js';

export const BACKUP_VERSION = 1;
const ABSENCE_IDS = ABSENCES.map(a => a.id);
const DAY = /^\d{4}-\d{2}-\d{2}$/;

export function buildBackup({ entries, projects, tasks, settings }, now = new Date()) {
  return {
    app: 'monte-ore',
    version: BACKUP_VERSION,
    exported_at: now.toISOString(),
    settings: { times: settings.times, day_hours: settings.dayHours },
    projects: projects.map(({ id, name, color, archived_at, created_at }) => ({ id, name, color, archived_at: archived_at ?? null, created_at })),
    tasks: tasks.map(({ who, code, done_at, created_at, title }) => ({ who, code, title: title || null, done_at: done_at ?? null, created_at })),
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
  // Un titolo non valido non scarta la task: si perde solo il titolo.
  const tasks = (Array.isArray(data.tasks) ? data.tasks : []).filter(t => str(t?.who, 40) && str(t?.code, 40))
    .map(t => ({ ...t, title: typeof t.title === 'string' && t.title.trim() && t.title.trim().length <= 80 ? t.title.trim().replace(/\s+/g, ' ') : null }));
  const valid = e => e && str(e.id, 64) && DAY.test(e.day) && isHalfHours(e.hours) && e.hours > 0
    && (ABSENCE_IDS.includes(e.who)
      ? e.code == null
      : str(e.who, 40) && str(e.code, 40) && e.code === e.code.toUpperCase() && !/\s/.test(e.code))
    && (e.description == null || typeof e.description === 'string');
  const entries = data.entries.filter(valid).map(e => ({ ...e, code: e.code ?? null, description: e.description || '' }));
  return { exportedAt: data.exported_at, projects, tasks, entries, invalid: data.entries.length - entries.length };
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
  // Anche il titolo torna solo sulle task create dal ripristino: quelle esistenti restano come sono.
  const titles = backup.tasks.filter(t => t.title && created.has(`${t.who}|${t.code}`)).map(t => ({ who: t.who, code: t.code, title: t.title }));
  return {
    projects,
    entries,
    doneTasks,
    titles,
    present: backup.entries.length - fresh.length,
    skipped: backup.invalid + fresh.length - entries.length
  };
}
