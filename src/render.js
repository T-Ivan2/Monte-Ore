// Struttura della pagina e scelta della vista da disegnare.
import { S } from './state.js';
import { isLocal } from './store.js';
import { esc } from './ui.js';
import { renderDay } from './views/day.js';
import { renderTasks } from './views/tasks.js';
import { renderMonth } from './views/month.js';
import { renderHours, renderNotif } from './views/panels.js';
import { updateBadge } from './badge.js';
import { pendingCount } from './sync.js';

const root = document.getElementById('root');

export function renderLogin(message = '') {
  root.innerHTML = `<main class="wrap narrow">
    <h1>Monte Ore</h1>
    <form id="login-form" novalidate>
      <div class="field"><label class="lbl" for="email">Email</label><input class="input" id="email" type="email" autocomplete="username" required></div>
      <div class="field"><label class="lbl" for="password">Password</label><input class="input" id="password" type="password" autocomplete="current-password" required></div>
      ${message ? `<p class="err" role="alert">${esc(message)}</p>` : ''}
      <div class="row">
        <button class="btn primary" type="submit" id="login">Accedi</button>
        <span class="spacer"></span>
        <button class="link" type="button" data-act="forgot" id="forgot">Password dimenticata?</button>
      </div>
    </form>
  </main>`;
}

// Richiesta del link per scegliere una nuova password.
export function renderReset({ message = '', sent = false } = {}) {
  root.innerHTML = `<main class="wrap narrow">
    <h1>Monte Ore</h1>
    <form id="reset-form" novalidate>
      <h2 class="formtitle">Recupera la password</h2>
      ${sent
        ? '<p class="empty" role="status" id="reset-sent">Se l\'indirizzo è registrato, riceverai una mail con un link per scegliere una nuova password. Aprila da questo dispositivo.</p>'
        : `<p class="empty">Ti mandiamo una mail con un link per scegliere una nuova password.</p>
      <div class="field"><label class="lbl" for="reset-email">Email</label><input class="input" id="reset-email" type="email" autocomplete="username" required></div>
      ${message ? `<p class="err" role="alert">${esc(message)}</p>` : ''}`}
      <div class="row">
        ${sent ? '' : '<button class="btn primary" type="submit" id="send-reset">Invia il link</button>'}
        <button class="link" type="button" data-act="backtologin" id="back-to-login">Torna all'accesso</button>
      </div>
    </form>
  </main>`;
}

// Dopo il link della mail: nuova password.
export function renderNewPassword(message = '') {
  root.innerHTML = `<main class="wrap narrow">
    <h1>Monte Ore</h1>
    <form id="password-form" novalidate>
      <h2 class="formtitle">Scegli una nuova password</h2>
      <div class="field"><label class="lbl" for="new-password">Nuova password <span>(almeno 8 caratteri)</span></label><input class="input" id="new-password" type="password" autocomplete="new-password" minlength="8" required></div>
      <div class="field"><label class="lbl" for="new-password-2">Ripetila</label><input class="input" id="new-password-2" type="password" autocomplete="new-password" required></div>
      ${message ? `<p class="err" role="alert">${esc(message)}</p>` : ''}
      <div class="row"><button class="btn primary" type="submit" id="save-password">Salva e accedi</button></div>
    </form>
  </main>`;
}

export function renderShell() {
  root.innerHTML = `<div class="wrap">
    <header>
      <h1>Monte Ore</h1>
      <div class="row">
        <button class="quiet" data-act="hours" id="hours-toggle" aria-expanded="false"></button>
        <button class="quiet" data-act="notif" id="notif-toggle" aria-expanded="false"></button>
      </div>
    </header>
    <section class="panel" id="hours-panel" aria-label="Ore previste" hidden></section>
    <section class="panel" id="notif-panel" aria-label="Notifiche" hidden></section>
    <main class="app">
    <div class="tabs" role="tablist" aria-label="Vista">
      <button role="tab" id="tab-day" data-act="view" data-view="day" aria-controls="app">Giorno</button>
      <button role="tab" id="tab-tasks" data-act="view" data-view="tasks" aria-controls="app">Task</button>
      <button role="tab" id="tab-month" data-act="view" data-view="month" aria-controls="app">Mese</button>
    </div>
    <p class="syncbar" id="sync" role="status" hidden></p>
    <div id="app" class="app" role="tabpanel"></div>
    </main>
    <footer class="foot">
      ${isLocal ? '<p>Modalità locale: i dati restano in questo browser.</p>' : ''}
      <div class="row">
        <span>Backup</span>
        <button class="link" data-act="backup" id="backup">Scarica</button>
        <button class="link" data-act="restore" id="restore">Ripristina</button>
        <input type="file" id="restore-file" accept="application/json,.json" hidden>
        <span class="spacer"></span>
        ${isLocal ? '' : '<button class="link" data-act="logout" id="logout">Esci</button>'}
      </div>
    </footer>
  </div>`;
}

export function render() {
  // Schede accessibili: solo quella attiva riceve il Tab, le altre si raggiungono con le frecce.
  for (const v of ['day', 'tasks', 'month']) {
    const tab = document.getElementById(`tab-${v}`);
    tab.setAttribute('aria-selected', S.view === v);
    tab.tabIndex = S.view === v ? 0 : -1;
  }
  document.getElementById('app').setAttribute('aria-labelledby', `tab-${S.view}`);
  if (S.view === 'month') renderMonth(); else if (S.view === 'tasks') renderTasks(); else renderDay();
  // Ogni modifica passa da qui, quindi il contatore resta sempre allineato.
  updateBadge();
}
export function renderPanels() { renderHours(); renderNotif(); }

// Stato della connessione e delle modifiche in coda, sotto le schede.
export function renderSync() {
  const el = document.getElementById('sync');
  if (!el) return;
  const n = pendingCount(), offline = navigator.onLine === false;
  const queued = n === 1 ? '1 modifica da inviare' : `${n} modifiche da inviare`;
  el.hidden = !n && !offline;
  el.className = `syncbar${offline ? ' off' : ''}`;
  el.textContent = offline
    ? `Sei offline${n ? ` · ${queued}` : ''}. Le ore che registri restano su questo dispositivo e partono appena torna la connessione.`
    : `${queued}: le invio appena il server risponde.`;
}
