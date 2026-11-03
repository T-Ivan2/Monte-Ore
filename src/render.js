// Struttura della pagina e scelta della vista da disegnare.
import { S } from './state.js';
import { isLocal } from './store.js';
import { esc } from './ui.js';
import { renderDay } from './views/day.js';
import { renderTasks } from './views/tasks.js';
import { renderMonth } from './views/month.js';
import { renderHours, renderNotif } from './views/panels.js';
import { updateBadge } from './badge.js';

const root = document.getElementById('root');

export function renderLogin(message = '') {
  root.innerHTML = `<div class="wrap narrow">
    <h1>Monte Ore</h1>
    <form id="login-form" novalidate>
      <div class="field"><label class="lbl" for="email">Email</label><input class="input" id="email" type="email" autocomplete="username" required></div>
      <div class="field"><label class="lbl" for="password">Password</label><input class="input" id="password" type="password" autocomplete="current-password" required></div>
      ${message ? `<p class="err" role="alert">${esc(message)}</p>` : ''}
      <div class="row"><button class="btn primary" type="submit" id="login">Accedi</button></div>
    </form>
  </div>`;
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
    <div class="tabs" role="tablist" aria-label="Vista">
      <button role="tab" id="tab-day" data-act="view" data-view="day">Giorno</button>
      <button role="tab" id="tab-tasks" data-act="view" data-view="tasks">Task</button>
      <button role="tab" id="tab-month" data-act="view" data-view="month">Mese</button>
    </div>
    <main id="app" class="app"></main>
    <div class="foot">
      ${isLocal ? '<span>Modalità locale: i dati restano in questo browser.</span>' : '<button class="link" data-act="logout" id="logout">Esci</button>'}
    </div>
  </div>`;
}

export function render() {
  for (const v of ['day', 'tasks', 'month']) document.getElementById(`tab-${v}`).setAttribute('aria-selected', S.view === v);
  if (S.view === 'month') renderMonth(); else if (S.view === 'tasks') renderTasks(); else renderDay();
  // Ogni modifica passa da qui, quindi il contatore resta sempre allineato.
  updateBadge();
}
export function renderPanels() { renderHours(); renderNotif(); }
