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
import {
  PROJECTS, ABSENCES, WHO, DOW, MONTHS, DEFAULT_DAY_HOURS, key, parse, addDays, monday, weekDays, fmt, isAbsence,
  isWeekend, holidayName, monthDays, monthBounds, shiftMonth, validateEntry, parseHours, normalizeCode,
  targetFor, isHalfHours, dayLength
} from './logic.js';
import { store, isLocal } from './store.js';
import { pushStatus, enablePush, disablePush, syncPush, testPush } from './push.js';

const CLOCK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>';
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
const shortLabel = k => { const d = parse(k); return `${DOW[(d.getDay() + 6) % 7].toLowerCase()} ${d.getDate()} ${MONTHS[d.getMonth()]}`; };
// Il sabato e la domenica si aprono sul venerdì se è incompleto, altrimenti sul lunedì successivo.
const startDay = () => {
  const t = today();
  if (!isWeekend(t)) return t;
  const fri = addDays(monday(t), 4);
  return dayTotal(fri) < target(fri) ? fri : monday(addDays(t, 2));
};

const root = document.getElementById('root');
let entries = [];
let tasks = [];
let loaded = new Set();
let times = [];
let dayHours = DEFAULT_DAY_HOURS;
let hoursOpen = false;
let hoursError = '';
let view = 'day';
// Valore provvisorio: nel weekend startApp sceglie il giorno quando i dati sono caricati.
let selected = isWeekend(today()) ? monday(addDays(today(), 2)) : today();
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
const target = d => targetFor(d, dayHours);
const rest = d => Math.max(0, target(d) - dayTotal(d));
// Giorno libero: weekend, festivo o giorno impostato a zero ore.
const offLabel = d => holidayName(d) ? `${holidayName(d)}, festivo` : isWeekend(d) ? 'Weekend' : 'Giorno libero';
// Ultimo giorno con voci nei 7 precedenti, da proporre come copia per un giorno vuoto.
function copySource(d) {
  for (let i = 1; i <= 7; i++) {
    const src = addDays(d, -i);
    const rows = copyable(src);
    if (rows.length) return { day: src, rows, skipped: dayEntries(src).length - rows.length };
    if (dayEntries(src).length) return null;
  }
  return null;
}
// Non copia le voci su task terminate: copiarle le riaprirebbe.
const copyable = d => dayEntries(d).filter(e => !e.code || tasks.some(t => t.who === e.who && t.code === e.code && !t.done_at));

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
  const total = dayTotal(selected), tg = target(selected), r = rest(selected);
  const open = editing !== null || forceOpen || r > 0;
  const statusText = tg === 0 ? `${total ? `<b>${fmt(total)}</b> h · ` : ''}<span>${offLabel(selected)}</span>`
    : total > tg ? `<b>${fmt(total)}</b> di ${fmt(tg)} h · <span class="warn">${fmt(total - tg)} h in più</span>`
    : r === 0 ? `<b>${fmt(total)}</b> di ${fmt(tg)} h · <span class="ok">Completo</span>`
    : selected <= t0 ? `<b>${fmt(total)}</b> di ${fmt(tg)} h · <span class="warn">Mancano ${fmt(r)} h</span>`
    : `<b>${fmt(total)}</b> di ${fmt(tg)} h`;
  const copy = !items.length && editing === null && tg > 0 ? copySource(selected) : null;
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
        const t = dayTotal(d), tg = target(d);
        const cls = [d === selected ? 'sel' : '', tg === 0 ? 'off' : '', tg > 0 && t === tg ? 'done' : '', tg > 0 && ((d <= t0 && t < tg) || t > tg) ? 'lack' : ''].join(' ');
        return `<button class="${cls}" data-act="select" data-day="${d}" id="strip-${d}" aria-pressed="${d === selected}" aria-label="${dayLabel(d)}, ${tg === 0 && !t ? offLabel(d) : fmt(t) + ' ore'}">${DOW[i].slice(0, 3)} ${parse(d).getDate()}${d === t0 ? ' •' : ''}<b>${tg === 0 && !t ? '–' : fmt(t)}</b></button>`;
      }).join('')}</div>
    </section>
    <section class="day">
      <div class="dayhead"><h2>${dayLabel(selected)}</h2><div class="state">${statusText}</div></div>
      ${items.length ? `<div class="list">${items.map(entryHtml).join('')}</div>` : ''}
      ${copy ? `<div class="row"><button class="btn" data-act="copyday" id="copy-day">Copia da ${shortLabel(copy.day)} · ${fmt(copy.rows.reduce((n, e) => n + e.hours, 0))} h</button></div>` : ''}
      ${open ? formHtml() : `<div><button class="btn" data-act="openform" id="open-form">${items.length ? 'Aggiungi altre ore' : 'Aggiungi ore'}</button></div>`}
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
  const days = monthDays(month);
  const working = days.filter(d => target(d) > 0);
  const monthTarget = working.reduce((s, d) => s + target(d), 0);
  const inMonth = entries.filter(e => e.day.slice(0, 7) === month);
  const total = inMonth.reduce((s, e) => s + e.hours, 0);
  const late = working.filter(d => d <= t0 && dayTotal(d) < target(d)).length;
  const rows = [...PROJECTS, ...ABSENCES]
    .map(w => ({ ...w, h: inMonth.filter(e => e.who === w.id).reduce((s, e) => s + e.hours, 0) }))
    .filter(w => w.h > 0 || !isAbsence(w.id));
  const cells = [...new Set(days.map(monday))].flatMap(weekDays).map(d => {
    if (!days.includes(d)) return '<div></div>';
    const t = dayTotal(d), h = holidayName(d), tg = target(d);
    const cls = [
      d === t0 ? 'today' : '', tg === 0 ? 'off' : '', h && !t ? 'holiday' : '', tg > 0 && t === tg ? 'done' : '',
      tg > 0 && ((d <= t0 && t < tg) || t > tg) ? 'lack' : '', (tg === 0 || d > t0) && t === 0 ? 'future' : ''
    ].join(' ');
    const label = t ? fmt(t) : h ? 'Fest.' : tg === 0 || d > t0 ? '–' : fmt(t);
    return `<button class="calday ${cls}" data-act="openday" data-day="${d}" id="cal-${d}" aria-label="${dayLabel(d)}, ${tg === 0 && !t ? offLabel(d) : fmt(t) + ' ore'}"><span class="n">${parse(d).getDate()}</span><span class="t">${label}</span></button>`;
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
        <div class="bankfig">${fmt(total)} <span>di ${fmt(monthTarget)} h</span></div>
        <div class="state">${lateText}</div>
      </div>
      <div class="bar" aria-hidden="true">${rows.filter(w => w.h > 0).map(w => `<i style="width:${(w.h / Math.max(monthTarget, total, 1)) * 100}%;background:${w.color}"></i>`).join('')}</div>
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
/* ORE PREVISTE */
function renderHours() {
  const t = document.getElementById('hours-toggle');
  if (!t) return;
  const perWeek = dayHours.reduce((n, h) => n + h, 0);
  t.setAttribute('aria-expanded', hoursOpen);
  t.innerHTML = `${CLOCK}<b>${fmt(perWeek)} h<span class="wide">/sett.</span></b>`;
  t.setAttribute('aria-label', `Ore previste: ${fmt(perWeek)} a settimana`);
  const p = document.getElementById('hours-panel');
  p.hidden = !hoursOpen;
  if (!hoursOpen) return;
  const activeId = document.activeElement?.id;
  p.innerHTML = `<h2>Ore previste</h2>
    <p>Le ore da registrare in ogni giorno. Metti 0 nei giorni in cui non lavori: non risulteranno incompleti e non riceverai promemoria. Sabato, domenica e festivi non prevedono ore, ma puoi registrarle.</p>
    <div class="dayhours">${dayHours.map((h, i) => `<label class="field"><span class="lbl">${DOW[i].slice(0, 3)}</span><input class="input" id="dh-${i}" data-dh="${i}" inputmode="decimal" value="${fmt(h)}" autocomplete="off" ${hoursError ? 'aria-describedby="e-dh"' : ''}></label>`).join('')}</div>
    ${hoursError ? `<p class="err" id="e-dh" role="alert">${hoursError}</p>` : ''}`;
  if (activeId) document.getElementById(activeId)?.focus();
}
async function saveDayHours(i, raw) {
  const h = parseHours(raw);
  if (!isHalfHours(h)) {
    hoursError = "Inserisci un numero di ore tra 0 e 24, a blocchi di mezz'ora.";
    renderHours();
    return;
  }
  const before = dayHours;
  dayHours = dayHours.map((x, j) => j === i ? h : x);
  hoursError = '';
  renderHours(); draft = freshDraft(); render();
  try { await store.setDayHours(dayHours); }
  catch { dayHours = before; renderHours(); draft = freshDraft(); render(); toast('Non sono riuscito a salvare le ore previste. Riprova.'); }
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
// Carica anche la settimana prima, così "Copia" trova il giorno da cui copiare.
const around = d => [...weekDays(addDays(monday(d), -7)), ...weekDays(monday(d))];
async function go(d) {
  try { await ensure(around(d)); } catch { loadFail(); }
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
async function copyDay() {
  const src = copySource(selected);
  if (!src || busy) return;
  busy = true;
  try {
    const rows = await store.addEntries(src.rows.map(({ who, hours, code, description }) => ({ day: selected, who, hours, code, description })));
    entries = [...entries, ...rows];
    await refreshTasks();
    forceOpen = false; errors = {}; draft = freshDraft();
    render();
    const n = rows.length === 1 ? '1 voce' : `${rows.length} voci`;
    const skip = src.skipped ? ` Escluse ${src.skipped} su task terminate.` : '';
    toast(`Copiate ${n} da ${shortLabel(src.day)}.${skip}`, async () => {
      await store.removeEntries(rows.map(r => r.id));
      const ids = new Set(rows.map(r => r.id));
      entries = entries.filter(e => !ids.has(e.id));
      await refreshTasks();
      draft = freshDraft();
    });
  } catch { toast('Non sono riuscito a copiare le voci. Riprova.'); }
  busy = false;
}

/* NUOVA VERSIONE */
// Confronta lo script in esecuzione con quello pubblicato: se è cambiato propone di ricaricare.
const runningScript = document.querySelector('script[type="module"][src^="/assets/"]')?.getAttribute('src');
let updateShown = false;
async function checkUpdate() {
  if (!runningScript || updateShown) return;
  const res = await fetch('/', { cache: 'no-store' });
  if (!res.ok) return;
  const html = await res.text();
  const published = html.match(/<script[^>]*type="module"[^>]*src="(\/assets\/[^"]+)"/)?.[1];
  if (!published || published === runningScript) return;
  // Aggiorna la copia offline, così il ricaricamento apre subito la nuova versione.
  try { await (await caches.open('monte-ore-v1')).put('/', new Response(html, { headers: { 'Content-Type': 'text/html; charset=utf-8' } })); } catch { /* senza cache offline */ }
  updateShown = true;
  const box = document.createElement('div');
  box.className = 'notice'; box.id = 'update'; box.setAttribute('role', 'status');
  box.innerHTML = '<button class="open" data-act="reload" id="reload">Nuova versione disponibile</button><small>Tocca per aggiornare l\'app.</small><button class="x" data-act="dismissupdate" aria-label="Chiudi">×</button>';
  document.body.append(box);
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
  if (a === 'notif') { notifOpen = !notifOpen; hoursOpen = false; renderNotif(); renderHours(); }
  if (a === 'hours') { hoursOpen = !hoursOpen; notifOpen = false; hoursError = ''; renderHours(); renderNotif(); }
  if (a === 'copyday') await copyDay();
  if (a === 'reload') { if (editing === null || confirm('Hai una modifica in corso. Ricaricare comunque?')) location.reload(); }
  if (a === 'dismissupdate') document.getElementById('update')?.remove();
  if (a === 'view') {
    view = b.dataset.view;
    if (view === 'month') { month = selected.slice(0, 7); try { await ensure(monthDays(month)); } catch { loadFail(); } }
    if (view === 'tasks') { try { await refreshTasks(); } catch { loadFail(); } }
    render();
  }
  if (a === 'month' || a === 'thismonth') {
    month = a === 'month' ? shiftMonth(month, +b.dataset.delta) : today().slice(0, 7);
    try { await ensure(monthDays(month)); } catch { loadFail(); }
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
    const monthTarget = monthDays(month).reduce((s, d) => s + target(d), 0);
    b.disabled = true;
    try {
      const { exportMonth } = await import('./export.js');
      const r = await exportMonth(inMonth, month, monthTarget, dayLength(dayHours));
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
  if (t.dataset?.dh !== undefined) await saveDayHours(+t.dataset.dh, t.value);
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
    await ensure([...around(week), ...(view === 'month' ? monthDays(month) : [])]);
    await refreshTasks();
    render();
  } catch { /* resta sui dati già mostrati */ }
  checkUpdate().catch(() => {});
});

async function startApp() {
  renderShell();
  document.getElementById('app').innerHTML = '<p class="empty">Carico le ore…</p>';
  try {
    await ensure(around(today()));
    await refreshTasks();
    ({ times, dayHours } = await store.getSettings());
    const last = entries.filter(e => !isAbsence(e.who)).at(-1);
    if (last) lastProject = last.who;
    // Il giorno di partenza dipende dalle ore già registrate e da quelle previste.
    if (isWeekend(today())) { const d = startDay(); await ensure(around(d)); selected = d; week = monday(d); month = d.slice(0, 7); }
  } catch { loadFail(); }
  draft = freshDraft();
  render();
  renderNotif();
  renderHours();
  checkUpdate().catch(() => {});
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
