// Avvio dell'app e collegamento degli eventi. Ogni vista dichiara le sue azioni in views/.
// Font serviti dal sito: niente richieste a Google e disponibili anche offline.
import '@fontsource/familjen-grotesk/latin-700.css';
import '@fontsource/ibm-plex-sans/latin-400.css';
import '@fontsource/ibm-plex-sans/latin-500.css';
import '@fontsource/ibm-plex-sans/latin-600.css';
import '@fontsource/ibm-plex-mono/latin-400.css';
import '@fontsource/ibm-plex-mono/latin-500.css';
import '@fontsource/ibm-plex-mono/latin-600.css';
import './style.css';
import { isAbsence, isWeekend, monday, monthDays } from './logic.js';
import { store, authLink, isNetworkError } from './store.js';
import { pushStatus, syncPush } from './push.js';
import { S, today, freshDraft, startDay, around, pickDay, ensure, refreshTasks, refreshProjects } from './state.js';
import { loadFail, toast } from './ui.js';
import { render, renderShell, renderLogin, renderReset, renderNewPassword, renderPanels, renderSync } from './render.js';
import { onSync, flushNow, pendingCount } from './sync.js';
import { checkUpdate, actions as updateActions } from './update.js';
import * as day from './views/day.js';
import * as tasks from './views/tasks.js';
import * as month from './views/month.js';
import * as panels from './views/panels.js';
import { backupHandlers } from './views/backup.js';

// Dopo un ripristino si ricaricano voci, task e progetti.
const backup = backupHandlers(() => reload());
const actions = {
  ...backup.actions,
  ...day.actions, ...tasks.actions, ...month.actions, ...panels.actions, ...updateActions,
  view: async b => {
    S.view = b.dataset.view;
    S.projectForm = null;
    try {
      if (S.view === 'month') { S.month = S.selected.slice(0, 7); await ensure(monthDays(S.month)); }
      if (S.view === 'tasks') await Promise.all([refreshTasks(), refreshProjects()]);
    } catch { loadFail(); }
    render();
  },
  forgot: () => { renderReset(); document.getElementById('reset-email')?.focus(); },
  backtologin: () => renderLogin(),
  logout: async () => {
    const n = pendingCount();
    if (n && !confirm(`Hai ${n === 1 ? '1 modifica' : n + ' modifiche'} non ancora inviate: uscendo le perdi. Uscire comunque?`)) return;
    if (n) localStorage.removeItem('monte-ore-outbox');
    await navigator.clearAppBadge?.().catch(() => {});
    await store.signOut();
    location.reload();
  }
};
const submits = {
  ...day.onSubmit, ...tasks.onSubmit,
  'login-form': async () => {
    const email = document.getElementById('email').value.trim();
    const password = document.getElementById('password').value;
    if (!email || !password) { renderLogin('Inserisci email e password.'); return; }
    try { await store.signIn(email, password); await startApp(); }
    catch { renderLogin('Email o password non corrette, oppure connessione assente.'); }
  },
  'reset-form': async () => {
    const email = document.getElementById('reset-email').value.trim();
    if (!/^\S+@\S+\.\S+$/.test(email)) { renderReset({ message: 'Inserisci il tuo indirizzo email.' }); return; }
    try { await store.resetPassword(email); renderReset({ sent: true }); }
    catch (err) {
      // Supabase limita le mail inviate: dopo troppe richieste risponde 429.
      renderReset({ message: isNetworkError(err) ? 'Connessione assente: riprova.' : err?.status === 429 ? 'Troppe richieste: aspetta qualche minuto e riprova.' : 'Non sono riuscito a inviare la mail. Riprova.' });
    }
  },
  'password-form': async () => {
    const pw = document.getElementById('new-password').value, pw2 = document.getElementById('new-password-2').value;
    if (pw.length < 8) { renderNewPassword('La password deve avere almeno 8 caratteri.'); return; }
    if (pw !== pw2) { renderNewPassword('Le due password non coincidono.'); return; }
    try {
      await store.updatePassword(pw);
      await startApp();
      toast('Password aggiornata.');
    } catch (err) {
      renderNewPassword(isNetworkError(err) ? 'Connessione assente: riprova.' : err?.code === 'weak_password' ? 'Password troppo semplice: scegline una più lunga o più varia.' : 'Non sono riuscito a salvare la password. Riprova, oppure richiedi un nuovo link.');
    }
  }
};

document.addEventListener('click', async ev => {
  const b = ev.target.closest('[data-act]');
  if (!b || b.disabled) return;
  await actions[b.dataset.act]?.(b);
});
// Frecce, Home e Fine sulle schede, come previsto per i tablist accessibili.
document.addEventListener('keydown', ev => {
  const tab = ev.target.closest?.('[role=tab]');
  if (!tab) return;
  const tabs = [...document.querySelectorAll('[role=tab]')], i = tabs.indexOf(tab);
  const next = { ArrowRight: i + 1, ArrowLeft: i - 1, Home: 0, End: tabs.length - 1 }[ev.key];
  if (next === undefined) return;
  ev.preventDefault();
  const target = tabs[(next + tabs.length) % tabs.length];
  target.focus();
  target.click();
});
document.addEventListener('input', ev => { day.onInput(ev.target); tasks.onInput(ev.target); });
document.addEventListener('change', async ev => {
  day.onChange(ev.target);
  tasks.onChange(ev.target);
  await panels.onChange(ev.target);
  await backup.onChange(ev.target);
});
document.addEventListener('submit', async ev => {
  ev.preventDefault();
  await submits[ev.target.id]?.();
});
// Ricarica i dati dal server (o dalla copia locale), così vedi anche ciò che hai inserito da un altro dispositivo.
async function reload() {
  S.loaded = new Set();
  try {
    await ensure([...around(S.week), ...monthDays(today().slice(0, 7)), ...(S.view === 'month' ? monthDays(S.month) : [])]);
    await Promise.all([refreshTasks(), refreshProjects()]);
    render();
  } catch { /* resta sui dati già mostrati */ }
}
document.addEventListener('visibilitychange', async () => {
  if (document.visibilityState !== 'visible' || !document.getElementById('app')) return;
  if (today() !== S.lastSeenDay) { S.lastSeenDay = today(); if (S.editing === null) pickDay(startDay()); }
  await flushNow();
  await reload();
  checkUpdate().catch(() => {});
});
// Coda offline: aggiorna l'indicatore, ricarica dopo un invio, avvisa se il server rifiuta qualcosa.
onSync({
  change: renderSync,
  synced: () => { if (document.getElementById('app')) reload(); },
  failed: n => toast(`${n === 1 ? 'Una modifica non è stata salvata' : n + ' modifiche non sono state salvate'}: il server l'ha rifiutata perché non più valida. Controlla le ore.`)
});
window.addEventListener('online', renderSync);
// Tocco su una notifica con l'app già aperta: mostra il giorno da compilare con i dati aggiornati.
navigator.serviceWorker?.addEventListener('message', async e => {
  if (e.data?.type !== 'open-today' || !document.getElementById('app')) return;
  if (S.editing !== null) return;
  S.view = 'day';
  await flushNow();
  await reload();
  await day.go(startDay());
  window.scrollTo(0, 0);
});
window.addEventListener('offline', renderSync);

async function startApp() {
  renderShell();
  document.getElementById('app').innerHTML = '<p class="empty">Carico le ore…</p>';
  try {
    // Il mese in corso serve intero per il contatore sull'icona.
    await Promise.all([ensure([...around(today()), ...monthDays(today().slice(0, 7))]), refreshTasks(), refreshProjects()]);
    ({ times: S.times, dayHours: S.dayHours } = await store.getSettings());
    S.lastProject = S.entries.filter(e => !isAbsence(e.who)).at(-1)?.who ?? null;
    // Il giorno di partenza dipende dalle ore già registrate e da quelle previste.
    if (isWeekend(today())) { const d = startDay(); await ensure(around(d)); S.selected = d; S.week = monday(d); S.month = d.slice(0, 7); }
  } catch { loadFail(); }
  S.draft = freshDraft();
  render();
  renderPanels();
  renderSync();
  flushNow();
  checkUpdate().catch(() => {});
  S.push = await pushStatus().catch(() => 'unavailable');
  renderPanels();
  syncPush().catch(() => {});
}

if ('serviceWorker' in navigator && import.meta.env.PROD) navigator.serviceWorker.register('/sw.js');
(async () => {
  let session = null;
  try { session = await store.session(); } catch { /* mostra il login */ }
  // Arrivati dal link della mail di recupero: prima la nuova password, poi l'app.
  if (authLink.recovery && session && !session.offline) renderNewPassword();
  else if (session) await startApp();
  else renderLogin(authLink.error ? 'Il link non è più valido: richiedine uno nuovo con "Password dimenticata?".' : '');
})();
