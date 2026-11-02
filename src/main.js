import './style.css';
import {
  TARGET, PROJECTS, ABSENCES, WHO, DOW, MONTHS, key, parse, addDays, monday, weekDays, fmt, isAbsence,
  isWeekend, holidayName, monthWeekdays, monthBounds, shiftMonth, validateEntry, parseHours, normalizeCode
} from './logic.js';
import { store, isLocal } from './store.js';
import { pushStatus, enablePush, disablePush, syncPush, testPush } from './push.js';

const BELL = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 9a6 6 0 1 1 12 0c0 6 2.5 7.5 2.5 7.5h-17S6 15 6 9"/><path d="M10.3 20a2 2 0 0 0 3.4 0"/></svg>';
const today = () => key(new Date());
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const dayLabel = k => { const d = parse(k); return `${DOW[(d.getDay() + 6) % 7]} ${d.getDate()} ${MONTHS[d.getMonth()]}`; };
const weekLabel = mon => {
  const a = parse(mon), b = parse(addDays(mon, 4));
  return a.getMonth() === b.getMonth()
    ? `${a.getDate()}–${b.getDate()} ${MONTHS[a.getMonth()]}`
    : `${a.getDate()} ${MONTHS[a.getMonth()].slice(0, 3)} – ${b.getDate()} ${MONTHS[b.getMonth()].slice(0, 3)}`;
};
// Il sabato e la domenica si aprono dal lunedì successivo.
const startDay = () => { const t = today(); return isWeekend(t) ? monday(addDays(t, 2)) : t; };

const root = document.getElementById('root');
let entries = [];
let tasks = [];
let loaded = new Set();
let times = [];
let view = 'day';
let selected = startDay();
let week = monday(selected);
let month = selected.slice(0, 7);
let lastProject = 'shueco';
let editing = null;
let forceOpen = false;
let notifOpen = false;
let errors = {};
let busy = false;
let draft;
let push = 'unavailable';
let lastSeenDay = today();
let toastTimer;

const dayEntries = d => entries.filter(e => e.day === d);
const dayTotal = d => dayEntries(d).reduce((s, e) => s + e.hours, 0);
const rest = d => holidayName(d) ? 0 : Math.max(0, TARGET - dayTotal(d));

const openTasks = who => tasks.filter(t => t.who === who && !t.done_at);
// Con una sola task aperta la propone già selezionata. Senza task aperte chiede il codice.
function taskChoice(who) {
  const open = openTasks(who);
  return { code: open.length === 1 ? open[0].code : '', newTask: open.length === 0 };
}
function freshDraft(kind = 'project') {
  const who = kind === 'project' ? lastProject : 'ferie';
  return { kind, who, ...taskChoice(who), hours: fmt(rest(selected) || 1), desc: '' };
}
async function refreshTasks() { tasks = await store.listTasks(); }
async function ensure(days) {
  const months = [...new Set(days.map(d => d.slice(0, 7)))].filter(m => !loaded.has(m));
  await Promise.all(months.map(async m => {
    const { from, to } = monthBounds(m);
    const rows = await store.listEntries(from, to);
    entries = entries.filter(e => e.day.slice(0, 7) !== m).concat(rows);
    loaded.add(m);
  }));
}
const loadFail = () => toast('Non riesco a caricare i dati. Controlla la connessione e riprova.');

/* LOGIN */
function renderLogin(message = '') {
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

/* SHELL */
function renderShell() {
  root.innerHTML = `<div class="wrap">
    <header>
      <h1>Monte Ore</h1>
      <button class="quiet" data-act="notif" id="notif-toggle" aria-expanded="false"></button>
    </header>
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
function render() {
  document.getElementById('tab-day').setAttribute('aria-selected', view === 'day');
  document.getElementById('tab-tasks').setAttribute('aria-selected', view === 'tasks');
  document.getElementById('tab-month').setAttribute('aria-selected', view === 'month');
  if (view === 'month') renderMonth(); else if (view === 'tasks') renderTasks(); else renderDay();
}

/* GIORNO */
function renderDay() {
  const app = document.getElementById('app');
  const t0 = today();
  const days = weekDays(week);
  const items = dayEntries(selected);
  const total = dayTotal(selected), hol = holidayName(selected), r = rest(selected);
  const open = !hol && (editing !== null || forceOpen || r > 0);
  const statusText = hol ? `<span>${hol}, festivo</span>`
    : total > TARGET ? `<b>${fmt(total)}</b> di ${TARGET} h · <span class="warn">${fmt(total - TARGET)} h in più</span>`
    : r === 0 ? `<b>${fmt(total)}</b> di ${TARGET} h · <span class="ok">Completo</span>`
    : selected <= t0 ? `<b>${fmt(total)}</b> di ${TARGET} h · <span class="warn">Mancano ${fmt(r)} h</span>`
    : `<b>${fmt(total)}</b> di ${TARGET} h`;
  const activeId = document.activeElement?.id;
  app.innerHTML = `
    <section class="week" aria-label="Settimana">
      <div class="weekbar">
        <button class="icon" data-act="week" data-delta="-7" id="prev-week" aria-label="Settimana precedente">‹</button>
        <strong>${weekLabel(week)}</strong>
        <button class="icon" data-act="week" data-delta="7" id="next-week" aria-label="Settimana successiva">›</button>
        <span class="spacer"></span>
        ${selected === startDay() ? '' : '<button class="link" data-act="today" id="go-today">Vai a oggi</button>'}
      </div>
      <div class="strip">${days.map((d, i) => {
        const t = dayTotal(d), h = holidayName(d);
        const cls = [d === selected ? 'sel' : '', !h && t === TARGET ? 'done' : '', !h && ((d <= t0 && t < TARGET) || t > TARGET) ? 'lack' : ''].join(' ');
        return `<button class="${cls}" data-act="select" data-day="${d}" id="strip-${d}" aria-pressed="${d === selected}" aria-label="${dayLabel(d)}, ${h ? 'festivo' : fmt(t) + ' ore'}">${DOW[i].slice(0, 3)} ${parse(d).getDate()}${d === t0 ? ' •' : ''}<b>${h ? '–' : fmt(t)}</b></button>`;
      }).join('')}</div>
    </section>
    <section class="day">
      <div class="dayhead"><h2>${dayLabel(selected)}</h2><div class="state">${statusText}</div></div>
      ${items.length ? `<div class="list">${items.map(entryHtml).join('')}</div>` : ''}
      ${open ? formHtml() : hol ? '' : '<div><button class="btn" data-act="openform" id="open-form">Aggiungi altre ore</button></div>'}
    </section>`;
  if (activeId) document.getElementById(activeId)?.focus();
}
function entryHtml(e) {
  const w = WHO[e.who];
  return `<div class="entry ${editing === e.id ? 'editing' : ''}" style="--client:${w.color}">
    <div class="who"><span class="dot"></span>${w.name}</div>
    <div class="hrs">${fmt(e.hours)} h</div>
    ${e.code ? `<div class="code">${esc(e.code)}</div>` : ''}
    ${e.description ? `<div class="desc">${esc(e.description)}</div>` : ''}
    <div class="ops">
      <button class="link" data-act="edit" data-id="${e.id}" id="edit-${e.id}">Modifica</button>
      <button class="link" data-act="remove" data-id="${e.id}" id="remove-${e.id}">Elimina</button>
    </div>
  </div>`;
}
function formHtml() {
  const isProj = draft.kind === 'project';
  const opts = isProj ? PROJECTS : ABSENCES;
  return `<form id="entry-form" novalidate>
    ${editing !== null ? '<h3>Modifica voce</h3>' : ''}
    <div class="seg" role="radiogroup" aria-label="Tipo di ore">
      <label><input type="radio" name="kind" id="kind-project" value="project" ${isProj ? 'checked' : ''}><span>Progetto</span></label>
      <label><input type="radio" name="kind" id="kind-absence" value="absence" ${!isProj ? 'checked' : ''}><span>Assenza</span></label>
    </div>
    <fieldset>
      <legend>${isProj ? 'Progetto' : 'Tipo di assenza'}</legend>
      <div class="chips">${opts.map(o => `<label style="--client:${o.color}"><input type="radio" name="who" id="who-${o.id}" value="${o.id}" ${draft.who === o.id ? 'checked' : ''}>${isProj ? '<span class="dot"></span>' : ''}${o.id === 'altro' ? 'Altro' : o.name}</label>`).join('')}</div>
    </fieldset>
    ${isProj ? taskFieldHtml() : ''}
    <div class="fields solo">
      <div class="field">
        <label class="lbl" for="f-hours">Ore</label>
        <div class="stepper">
          <button type="button" class="step" data-act="step" data-delta="-0.5" id="h-minus" aria-label="Togli mezz'ora">−</button>
          <input class="input" id="f-hours" inputmode="decimal" value="${esc(draft.hours)}" autocomplete="off" ${errors.hours ? 'aria-invalid="true" aria-describedby="e-hours"' : ''}>
          <button type="button" class="step" data-act="step" data-delta="0.5" id="h-plus" aria-label="Aggiungi mezz'ora">+</button>
        </div>
      </div>
    </div>
    ${errors.hours ? `<p class="err" id="e-hours">${errors.hours}</p>` : ''}
    <div class="field">
      <label class="lbl" for="f-desc">Descrizione <span>(facoltativa)</span></label>
      <textarea id="f-desc">${esc(draft.desc)}</textarea>
    </div>
    <div class="row">
      <button class="btn primary" type="submit" id="save" ${busy ? 'disabled' : ''}>${editing !== null ? 'Salva modifiche' : 'Salva ore'}</button>
      ${editing !== null || (forceOpen && rest(selected) === 0) ? '<button class="btn" type="button" data-act="cancel" id="cancel">Annulla</button>' : ''}
    </div>
  </form>`;
}

function taskFieldHtml() {
  const open = openTasks(draft.who);
  const err = errors.code ? `<p class="err" id="e-code">${errors.code}</p>` : '';
  if (draft.newTask) {
    return `<div class="field">
      <label class="lbl" for="f-code">Codice task ServiceNow</label>
      <input class="input mono" id="f-code" value="${esc(draft.code)}" autocomplete="off" autocapitalize="characters" spellcheck="false" required ${errors.code ? 'aria-invalid="true" aria-describedby="e-code"' : ''}>
      ${err}
      ${open.length ? `<div><button type="button" class="link" data-act="picktask" id="pick-task">Scegli tra le task aperte</button></div>` : ''}
    </div>`;
  }
  return `<fieldset>
    <legend>Task</legend>
    <div class="chips tasks" style="--client:${WHO[draft.who].color}">
      ${open.map((t, i) => `<label class="mono"><input type="radio" name="task" id="task-${i}" value="${esc(t.code)}" ${draft.code === t.code ? 'checked' : ''}>${esc(t.code)}</label>`).join('')}
      <button type="button" class="chipbtn" data-act="newtask" id="new-task">+ Nuova</button>
    </div>
    ${err}
  </fieldset>`;
}

/* TASK */
function taskRow(t) {
  const w = WHO[t.who];
  const k = `data-who="${t.who}" data-code="${esc(t.code)}"`;
  return `<div class="entry" style="--client:${w.color}">
    <div class="code strong">${esc(t.code)}</div>
    <div class="hrs">${fmt(t.hours)} h</div>
    <div class="who sub"><span class="dot"></span>${w.name}</div>
    <div class="ops">
      ${t.done_at
        ? `<button class="link" data-act="reopentask" ${k}>Riapri</button>`
        : `<button class="link" data-act="donetask" ${k}>Termina</button>${t.hours === 0 ? `<button class="link" data-act="deltask" ${k}>Elimina</button>` : ''}`}
    </div>
  </div>`;
}
function renderTasks() {
  const app = document.getElementById('app');
  const open = tasks.filter(t => !t.done_at);
  const done = tasks.filter(t => t.done_at).sort((a, b) => b.done_at.localeCompare(a.done_at));
  app.innerHTML = `
    <section class="day">
      <h2 class="mhead">Task aperte</h2>
      ${open.length ? `<div class="list">${open.map(taskRow).join('')}</div>` : '<p class="empty">Nessuna task aperta. Si aggiungono quando registri le ore.</p>'}
    </section>
    ${done.length ? `<section class="day"><h2 class="mhead">Terminate</h2><div class="list">${done.map(taskRow).join('')}</div></section>` : ''}`;
}
async function changeTask(action, who, code) {
  try {
    if (action === 'done') await store.setTaskDone(who, code, true);
    if (action === 'reopen') await store.setTaskDone(who, code, false);
    if (action === 'remove') await store.removeTask(who, code);
    await refreshTasks();
    draft = freshDraft();
    render();
    if (action === 'done') toast(`${code} terminata.`, async () => { await store.setTaskDone(who, code, false); await refreshTasks(); draft = freshDraft(); });
    if (action === 'reopen') toast(`${code} riaperta.`);
    if (action === 'remove') toast(`${code} eliminata.`);
  } catch { toast('Operazione non riuscita. Controlla la connessione e riprova.'); }
}

/* MESE */
function renderMonth() {
  const app = document.getElementById('app');
  const t0 = today();
  const [y, m] = month.split('-').map(Number);
  const days = monthWeekdays(month);
  const working = days.filter(d => !holidayName(d));
  const target = working.length * TARGET;
  const inMonth = entries.filter(e => e.day.slice(0, 7) === month);
  const total = inMonth.reduce((s, e) => s + e.hours, 0);
  const late = working.filter(d => d <= t0 && dayTotal(d) < TARGET).length;
  const rows = [...PROJECTS, ...ABSENCES]
    .map(w => ({ ...w, h: inMonth.filter(e => e.who === w.id).reduce((s, e) => s + e.hours, 0) }))
    .filter(w => w.h > 0 || !isAbsence(w.id));
  const cells = [...new Set(days.map(monday))].flatMap(weekDays).map(d => {
    if (!days.includes(d)) return '<div></div>';
    const t = dayTotal(d), h = holidayName(d);
    const cls = [
      d === t0 ? 'today' : '', h ? 'holiday' : '', !h && t === TARGET ? 'done' : '',
      !h && ((d <= t0 && t < TARGET) || t > TARGET) ? 'lack' : '', !h && d > t0 && t === 0 ? 'future' : ''
    ].join(' ');
    return `<button class="calday ${cls}" data-act="openday" data-day="${d}" id="cal-${d}" aria-label="${dayLabel(d)}, ${h ? h + ', festivo' : fmt(t) + ' ore'}"><span class="n">${parse(d).getDate()}</span><span class="t">${h ? 'Festivo' : d > t0 && t === 0 ? '–' : fmt(t)}</span></button>`;
  }).join('');
  const lateText = late ? `<span class="warn">${late === 1 ? '1 giorno incompleto' : late + ' giorni incompleti'}</span>` : working.some(d => d <= t0) ? '<span class="ok">Nessun giorno incompleto</span>' : '';
  app.innerHTML = `
    <div class="weekbar">
      <button class="icon" data-act="month" data-delta="-1" id="prev-month" aria-label="Mese precedente">‹</button>
      <h2 class="mhead">${MONTHS[m - 1][0].toUpperCase() + MONTHS[m - 1].slice(1)} ${y}</h2>
      <button class="icon" data-act="month" data-delta="1" id="next-month" aria-label="Mese successivo">›</button>
      <span class="spacer"></span>
      ${month === t0.slice(0, 7) ? '' : '<button class="link" data-act="thismonth" id="this-month">Vai a oggi</button>'}
    </div>
    <div class="row"><button class="btn" data-act="exportxlsx" id="export-xlsx" ${inMonth.length ? '' : 'disabled'}>Esporta in Excel</button></div>
    <section class="bank" aria-label="Monte ore del mese">
      <div class="banktop">
        <div class="bankfig">${fmt(total)} <span>di ${target} h</span></div>
        <div class="state">${lateText}</div>
      </div>
      <div class="bar" aria-hidden="true">${rows.filter(w => w.h > 0).map(w => `<i style="width:${(w.h / Math.max(target, total, 1)) * 100}%;background:${w.color}"></i>`).join('')}</div>
      <div class="legend">${rows.map(w => `<span style="--client:${w.color}"><span class="dot"></span>${w.name} <b>${fmt(w.h)} h</b></span>`).join('')}</div>
    </section>
    <section class="cal" aria-label="Calendario del mese">
      ${DOW.map(d => `<div class="dow">${d.slice(0, 3)}</div>`).join('')}${cells}
    </section>`;
}

/* NOTIFICHE */
function pushControls() {
  if (push === 'on') return '<button class="btn" data-act="testpush" id="test-notif">Prova notifica</button><button class="btn" data-act="pushoff" id="push-off">Disattiva su questo dispositivo</button>';
  if (push === 'off') return '<button class="btn primary" data-act="pushon" id="push-on">Attiva su questo dispositivo</button>';
  if (push === 'needs-install') return '<p>Su iPhone aggiungi prima l\'app alla schermata Home: Condividi, poi Aggiungi alla schermata Home. Aprila da lì per attivare le notifiche.</p>';
  if (push === 'denied') return '<p>Le notifiche sono bloccate per questa app. Riattivale dalle impostazioni del dispositivo o del browser.</p>';
  return '<p>Questo browser non può ricevere notifiche.</p>';
}
function renderNotif() {
  const t = document.getElementById('notif-toggle');
  if (!t) return;
  t.setAttribute('aria-expanded', notifOpen);
  t.innerHTML = `${BELL}${times.length === 0 ? 'Notifiche spente' : `<b>${times.length <= 2 ? times.join(', ') : times.length + ' orari'}</b>`}`;
  const p = document.getElementById('notif-panel');
  p.hidden = !notifOpen;
  if (!notifOpen) return;
  const activeId = document.activeElement?.id;
  p.innerHTML = `<h2>Notifiche</h2>
    <p>Dal lunedì al venerdì, solo se nella giornata mancano ancora ore.</p>
    <div class="times">${times.map((x, i) => `<span class="time"><input type="time" id="time-${i}" data-time="${i}" value="${x}" aria-label="Orario notifica ${i + 1}"><button data-act="deltime" data-i="${i}" id="deltime-${i}" aria-label="Rimuovi ${x}">×</button></span>`).join('')}</div>
    <div class="row"><button class="btn" data-act="addtime" id="add-time">Aggiungi orario</button>${pushControls()}</div>`;
  if (activeId) document.getElementById(activeId)?.focus();
}
async function saveTimes(next) {
  const before = times;
  times = [...new Set(next)].sort();
  renderNotif();
  try { await store.setTimes(times); }
  catch { times = before; renderNotif(); toast('Non sono riuscito a salvare gli orari. Riprova.'); }
}

/* AZIONI */
function toast(msg, undo) {
  clearTimeout(toastTimer);
  const t = document.getElementById('toast');
  t.innerHTML = `<div class="toast"><span>${esc(msg)}</span>${undo ? '<button id="undo">Annulla</button>' : ''}</div>`;
  if (undo) document.getElementById('undo').onclick = async () => {
    t.innerHTML = '';
    try { await undo(); render(); } catch { toast('Operazione non riuscita. Riprova.'); }
  };
  toastTimer = setTimeout(() => { t.innerHTML = ''; }, undo ? 7000 : 3500);
}
function pickDay(d) {
  selected = d; week = monday(d); editing = null; forceOpen = false; errors = {}; draft = freshDraft();
}
async function go(d) {
  try { await ensure(weekDays(monday(d))); } catch { loadFail(); }
  pickDay(d);
  render();
}
async function saveEntry() {
  if (busy) return;
  const others = dayEntries(selected).filter(e => e.id !== editing).reduce((s, e) => s + e.hours, 0);
  const { errors: errs, value } = validateEntry(draft, others);
  errors = errs;
  if (Object.keys(errs).length) {
    render();
    document.getElementById(!errs.code ? 'f-hours' : draft.newTask ? 'f-code' : 'task-0')?.focus();
    return;
  }
  busy = true; render();
  try {
    if (editing !== null) {
      const prev = entries.find(e => e.id === editing);
      const row = await store.updateEntry(editing, value);
      entries = entries.map(e => e.id === row.id ? row : e);
      await refreshTasks();
      const { who, hours, code, description } = prev;
      toast('Voce aggiornata.', async () => {
        const back = await store.updateEntry(row.id, { who, hours, code, description });
        entries = entries.map(e => e.id === back.id ? back : e);
        await refreshTasks();
        draft = freshDraft();
      });
    } else {
      const row = await store.addEntry({ day: selected, ...value });
      entries = [...entries, row];
      await refreshTasks();
      toast(`Salvate ${fmt(row.hours)} h su ${WHO[row.who].name}.`, async () => {
        await store.removeEntry(row.id);
        entries = entries.filter(e => e.id !== row.id);
        await refreshTasks();
        draft = freshDraft();
      });
    }
    if (draft.kind === 'project') lastProject = value.who;
    editing = null; forceOpen = false; errors = {}; draft = freshDraft();
  } catch {
    toast('Non sono riuscito a salvare. Controlla la connessione e riprova.');
  }
  busy = false; render();
}
async function removeEntry(id) {
  const e = entries.find(x => x.id === id);
  try {
    await store.removeEntry(id);
    entries = entries.filter(x => x.id !== id);
    await refreshTasks();
    if (editing === id) editing = null;
    forceOpen = false; errors = {}; draft = freshDraft();
    render();
    const { day, who, hours, code, description } = e;
    toast(`Voce eliminata: ${fmt(hours)} h ${WHO[who].name}.`, async () => {
      entries = [...entries, await store.addEntry({ day, who, hours, code, description })];
      await refreshTasks();
      draft = freshDraft();
    });
  } catch { toast('Non sono riuscito a eliminare la voce. Riprova.'); }
}

document.addEventListener('click', async ev => {
  const b = ev.target.closest('[data-act]');
  if (!b || b.disabled) return;
  const a = b.dataset.act;
  if (a === 'notif') { notifOpen = !notifOpen; renderNotif(); }
  if (a === 'view') {
    view = b.dataset.view;
    if (view === 'month') { month = selected.slice(0, 7); try { await ensure(monthWeekdays(month)); } catch { loadFail(); } }
    if (view === 'tasks') { try { await refreshTasks(); } catch { loadFail(); } }
    render();
  }
  if (a === 'month' || a === 'thismonth') {
    month = a === 'month' ? shiftMonth(month, +b.dataset.delta) : today().slice(0, 7);
    try { await ensure(monthWeekdays(month)); } catch { loadFail(); }
    render();
  }
  if (a === 'openday') { view = 'day'; await go(b.dataset.day); window.scrollTo(0, 0); }
  if (a === 'week') await go(addDays(week, +b.dataset.delta));
  if (a === 'today') await go(startDay());
  if (a === 'select') { pickDay(b.dataset.day); render(); }
  if (a === 'openform') {
    forceOpen = true; draft = freshDraft(); render();
    document.getElementById('f-code')?.focus();
  }
  if (a === 'cancel') { editing = null; forceOpen = false; errors = {}; draft = freshDraft(); render(); }
  if (a === 'step') {
    const cur = parseHours(draft.hours) || 0;
    draft.hours = fmt(Math.min(24, Math.max(0.5, cur + +b.dataset.delta)));
    document.getElementById('f-hours').value = draft.hours;
  }
  if (a === 'edit') {
    const e = entries.find(x => x.id === b.dataset.id);
    editing = e.id; errors = {};
    draft = { kind: isAbsence(e.who) ? 'absence' : 'project', who: e.who, code: e.code || '', newTask: !isAbsence(e.who) && !openTasks(e.who).some(t => t.code === e.code), hours: fmt(e.hours), desc: e.description };
    render();
    document.getElementById('f-hours')?.focus();
  }
  if (a === 'remove') await removeEntry(b.dataset.id);
  if (a === 'newtask') {
    draft.newTask = true; draft.code = ''; errors = {}; render();
    document.getElementById('f-code').focus();
  }
  if (a === 'picktask') { draft.newTask = false; draft.code = taskChoice(draft.who).code; errors = {}; render(); }
  if (a === 'donetask') await changeTask('done', b.dataset.who, b.dataset.code);
  if (a === 'reopentask') await changeTask('reopen', b.dataset.who, b.dataset.code);
  if (a === 'deltask') await changeTask('remove', b.dataset.who, b.dataset.code);
  if (a === 'exportxlsx') {
    const inMonth = entries.filter(e => e.day.slice(0, 7) === month);
    const target = monthWeekdays(month).filter(d => !holidayName(d)).length * TARGET;
    b.disabled = true;
    try {
      const { exportMonth } = await import('./export.js');
      const r = await exportMonth(inMonth, month, target);
      if (r === 'downloaded') toast('File Excel scaricato.');
    } catch { toast('Non sono riuscito a creare il file Excel. Riprova.'); }
    b.disabled = false;
  }
  if (a === 'addtime') {
    const c = ['09:00', '11:00', '15:00', '18:00', '19:00'].find(x => !times.includes(x)) || '08:00';
    await saveTimes([...times, c]);
  }
  if (a === 'deltime') await saveTimes(times.filter((_, i) => i !== +b.dataset.i));
  if (a === 'pushon') {
    try { await enablePush(); toast('Notifiche attive su questo dispositivo.'); }
    catch { toast(Notification.permission === 'denied' ? 'Notifiche bloccate: riattivale dalle impostazioni.' : 'Non sono riuscito ad attivare le notifiche. Riprova.'); }
    push = await pushStatus(); renderNotif();
  }
  if (a === 'pushoff') {
    try { await disablePush(); toast('Notifiche disattivate su questo dispositivo.'); }
    catch { toast('Non sono riuscito a disattivarle. Riprova.'); }
    push = await pushStatus(); renderNotif();
  }
  if (a === 'testpush') {
    try { const r = await testPush(); toast(r.sent ? 'Notifica di prova inviata.' : 'Nessun dispositivo attivo trovato.'); }
    catch { toast('Invio non riuscito. Controlla la configurazione del server.'); }
  }
  if (a === 'logout') { await store.signOut(); location.reload(); }
});
document.addEventListener('input', ev => {
  const t = ev.target;
  if (t.id === 'f-code') { const v = normalizeCode(t.value); if (v !== t.value) t.value = v; draft.code = v; }
  if (t.id === 'f-hours') draft.hours = t.value;
  if (t.id === 'f-desc') draft.desc = t.value;
});
document.addEventListener('change', async ev => {
  const t = ev.target;
  if (t.name === 'kind') {
    draft.kind = t.value;
    draft.who = t.value === 'project' ? lastProject : 'ferie';
    Object.assign(draft, taskChoice(draft.who));
    errors = {};
    render();
  }
  if (t.name === 'who') {
    draft.who = t.value;
    if (draft.kind === 'project') { lastProject = t.value; Object.assign(draft, taskChoice(t.value)); errors = {}; }
    render();
  }
  if (t.name === 'task') { draft.code = t.value; draft.newTask = false; errors = {}; render(); }
  if (t.dataset?.time !== undefined) {
    const next = [...times];
    if (t.value) next[+t.dataset.time] = t.value;
    await saveTimes(next);
  }
});
document.addEventListener('submit', async ev => {
  ev.preventDefault();
  if (ev.target.id === 'entry-form') await saveEntry();
  if (ev.target.id === 'login-form') {
    const email = document.getElementById('email').value.trim();
    const password = document.getElementById('password').value;
    if (!email || !password) { renderLogin('Inserisci email e password.'); return; }
    try { await store.signIn(email, password); await startApp(); }
    catch { renderLogin('Email o password non corrette, oppure connessione assente.'); }
  }
});
// Tornando sull'app ricarica i dati, così vedi ciò che hai inserito da un altro dispositivo.
document.addEventListener('visibilitychange', async () => {
  if (document.visibilityState !== 'visible' || !document.getElementById('app')) return;
  if (today() !== lastSeenDay) { lastSeenDay = today(); if (editing === null) pickDay(startDay()); }
  loaded = new Set();
  try {
    await ensure([...weekDays(week), ...(view === 'month' ? monthWeekdays(month) : [])]);
    await refreshTasks();
    render();
  } catch { /* resta sui dati già mostrati */ }
});

async function startApp() {
  renderShell();
  document.getElementById('app').innerHTML = '<p class="empty">Carico le ore…</p>';
  try {
    await ensure(weekDays(week));
    await refreshTasks();
    times = await store.getTimes();
    const last = entries.filter(e => !isAbsence(e.who)).at(-1);
    if (last) lastProject = last.who;
  } catch { loadFail(); }
  draft = freshDraft();
  render();
  renderNotif();
  push = await pushStatus().catch(() => 'unavailable');
  renderNotif();
  syncPush().catch(() => {});
}

if ('serviceWorker' in navigator && import.meta.env.PROD) navigator.serviceWorker.register('/sw.js');
(async () => {
  let session = null;
  try { session = await store.session(); } catch { /* mostra il login */ }
  if (session) await startApp(); else renderLogin();
})();
