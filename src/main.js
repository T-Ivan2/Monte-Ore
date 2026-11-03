// Avvio dell'app e collegamento degli eventi. Ogni vista dichiara le sue azioni in views/.
// Font serviti dal sito: niente richieste a Google e disponibili anche offline.
import '@fontsource/familjen-grotesk/latin-500.css';
import '@fontsource/familjen-grotesk/latin-700.css';
import '@fontsource/ibm-plex-sans/latin-400.css';
import '@fontsource/ibm-plex-sans/latin-500.css';
import '@fontsource/ibm-plex-sans/latin-600.css';
import '@fontsource/ibm-plex-mono/latin-400.css';
import '@fontsource/ibm-plex-mono/latin-500.css';
import '@fontsource/ibm-plex-mono/latin-600.css';
import './style.css';
import { isAbsence, isWeekend, monday, monthDays } from './logic.js';
import { store } from './store.js';
import { pushStatus, syncPush } from './push.js';
import { S, today, freshDraft, startDay, around, pickDay, ensure, refreshTasks, refreshProjects } from './state.js';
import { loadFail } from './ui.js';
import { render, renderShell, renderLogin, renderPanels } from './render.js';
import { checkUpdate, actions as updateActions } from './update.js';
import * as day from './views/day.js';
import * as tasks from './views/tasks.js';
import * as month from './views/month.js';
import * as panels from './views/panels.js';

const actions = {
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
  logout: async () => { await store.signOut(); location.reload(); }
};
const submits = {
  ...day.onSubmit, ...tasks.onSubmit,
  'login-form': async () => {
    const email = document.getElementById('email').value.trim();
    const password = document.getElementById('password').value;
    if (!email || !password) { renderLogin('Inserisci email e password.'); return; }
    try { await store.signIn(email, password); await startApp(); }
    catch { renderLogin('Email o password non corrette, oppure connessione assente.'); }
  }
};

document.addEventListener('click', async ev => {
  const b = ev.target.closest('[data-act]');
  if (!b || b.disabled) return;
  await actions[b.dataset.act]?.(b);
});
document.addEventListener('input', ev => { day.onInput(ev.target); tasks.onInput(ev.target); });
document.addEventListener('change', async ev => {
  day.onChange(ev.target);
  tasks.onChange(ev.target);
  await panels.onChange(ev.target);
});
document.addEventListener('submit', async ev => {
  ev.preventDefault();
  await submits[ev.target.id]?.();
});
// Tornando sull'app ricarica i dati, così vedi ciò che hai inserito da un altro dispositivo.
document.addEventListener('visibilitychange', async () => {
  if (document.visibilityState !== 'visible' || !document.getElementById('app')) return;
  if (today() !== S.lastSeenDay) { S.lastSeenDay = today(); if (S.editing === null) pickDay(startDay()); }
  S.loaded = new Set();
  try {
    await ensure([...around(S.week), ...(S.view === 'month' ? monthDays(S.month) : [])]);
    await Promise.all([refreshTasks(), refreshProjects()]);
    render();
  } catch { /* resta sui dati già mostrati */ }
  checkUpdate().catch(() => {});
});

async function startApp() {
  renderShell();
  document.getElementById('app').innerHTML = '<p class="empty">Carico le ore…</p>';
  try {
    await Promise.all([ensure(around(today())), refreshTasks(), refreshProjects()]);
    ({ times: S.times, dayHours: S.dayHours } = await store.getSettings());
    S.lastProject = S.entries.filter(e => !isAbsence(e.who)).at(-1)?.who ?? null;
    // Il giorno di partenza dipende dalle ore già registrate e da quelle previste.
    if (isWeekend(today())) { const d = startDay(); await ensure(around(d)); S.selected = d; S.week = monday(d); S.month = d.slice(0, 7); }
  } catch { loadFail(); }
  S.draft = freshDraft();
  render();
  renderPanels();
  checkUpdate().catch(() => {});
  S.push = await pushStatus().catch(() => 'unavailable');
  renderPanels();
  syncPush().catch(() => {});
}

if ('serviceWorker' in navigator && import.meta.env.PROD) navigator.serviceWorker.register('/sw.js');
(async () => {
  let session = null;
  try { session = await store.session(); } catch { /* mostra il login */ }
  if (session) await startApp(); else renderLogin();
})();
