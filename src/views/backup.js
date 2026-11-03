// Backup completo in JSON: scarica e ripristina, dai pulsanti in fondo alla pagina.
import { store, isNetworkError } from '../store.js';
import { flushNow, pendingCount } from '../sync.js';
import { buildBackup, parseBackup, planRestore } from '../backup.js';
import { saveFile } from '../files.js';
import { today } from '../state.js';
import { toast } from '../ui.js';

const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
const OFFLINE = 'Serve la connessione: senza rete il backup non sarebbe completo.';

async function download(b) {
  b.disabled = true;
  try {
    // Le modifiche fatte offline devono essere nel backup: prima si inviano.
    await flushNow();
    if (pendingCount()) throw Object.assign(new Error('offline'), { offline: true });
    const [entries, projects, tasks, settings] = await Promise.all([store.listAllEntries(), store.listProjects(), store.listTasks(), store.getSettings()]);
    const data = buildBackup({ entries, projects, tasks, settings });
    const file = new File([JSON.stringify(data, null, 2)], `monte-ore-backup-${today()}.json`, { type: 'application/json' });
    if (await saveFile(file) === 'downloaded') toast(`Backup scaricato: ${plural(entries.length, 'voce', 'voci')}, ${plural(projects.length, 'progetto', 'progetti')}.`);
  } catch (err) {
    toast(err.offline || isNetworkError(err) ? OFFLINE : 'Non sono riuscito a creare il backup. Riprova.');
  }
  b.disabled = false;
}

async function restore(file, reload) {
  let backup;
  try { backup = parseBackup(await file.text()); }
  catch (err) { toast(err.message); return; }
  try {
    await flushNow();
    if (pendingCount()) throw Object.assign(new Error('offline'), { offline: true });
    const [entries, projects, tasks] = await Promise.all([store.listAllEntries(), store.listProjects(), store.listTasks()]);
    const plan = planRestore(backup, { entries, projects, tasks });
    const notes = [
      plan.present ? `${plural(plan.present, 'voce è', 'voci sono')} già presenti` : '',
      plan.skipped ? `${plural(plan.skipped, 'voce non valida viene saltata', 'voci non valide vengono saltate')}` : ''
    ].filter(Boolean).join('; ');
    if (!plan.entries.length && !plan.projects.length) {
      toast(`Niente da ripristinare${notes ? ': ' + notes : ''}.`);
      return;
    }
    const what = [plan.entries.length && plural(plan.entries.length, 'voce', 'voci'), plan.projects.length && plural(plan.projects.length, 'progetto', 'progetti')].filter(Boolean).join(' e ');
    const when = backup.exportedAt ? ` del ${new Date(backup.exportedAt).toLocaleDateString('it-IT')}` : '';
    if (!confirm(`Dal backup${when} aggiungo ${what}.${notes ? ' ' + notes[0].toUpperCase() + notes.slice(1) + '.' : ''} I dati che hai già non vengono modificati. Continuare?`)) return;
    for (const p of plan.projects) await store.addProject(p);
    for (let i = 0; i < plan.entries.length; i += 500) await store.addEntries(plan.entries.slice(i, i + 500));
    for (const t of plan.doneTasks) await store.setTaskDone(t.who, t.code, true);
    await reload();
    toast(`Ripristino completato: aggiunte ${what}.`);
  } catch (err) {
    console.error('ripristino non riuscito', err);
    toast(err.offline || isNetworkError(err) ? 'Serve la connessione per ripristinare un backup.' : 'Ripristino non riuscito. Le voci già aggiunte restano: puoi riprovare, non verranno duplicate.');
    await reload().catch(() => {});
  }
}

// reload ricarica i dati mostrati dopo un ripristino.
export function backupHandlers(reload) {
  return {
    actions: {
      backup: b => download(b),
      restore: () => document.getElementById('restore-file').click()
    },
    async onChange(t) {
      if (t.id !== 'restore-file' || !t.files?.[0]) return;
      const file = t.files[0];
      t.value = '';
      await restore(file, reload);
    }
  };
}
