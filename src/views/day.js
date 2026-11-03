// Vista Giorno: settimana, voci del giorno e modulo per registrare le ore.
import { ABSENCES, DOW, fmt, parse, addDays, weekDays, isAbsence, validateEntry, parseHours, normalizeCode } from '../logic.js';
import { store } from '../store.js';
import {
  S, today, dayEntries, dayTotal, target, rest, offLabel, activeProjects, who, openTasks, taskChoice, freshDraft,
  copySource, startDay, around, pickDay, refreshTasks, ensure
} from '../state.js';
import { esc, dayLabel, shortLabel, weekLabel, keepFocus, toast, loadFail } from '../ui.js';
import { render } from '../render.js';

export function renderDay() {
  const app = document.getElementById('app');
  const t0 = today();
  const items = dayEntries(S.selected);
  const total = dayTotal(S.selected), tg = target(S.selected), r = rest(S.selected);
  const open = S.editing !== null || S.forceOpen || r > 0;
  const statusText = tg === 0 ? `${total ? `<b>${fmt(total)}</b> h · ` : ''}<span>${offLabel(S.selected)}</span>`
    : total > tg ? `<b>${fmt(total)}</b> di ${fmt(tg)} h · <span class="warn">${fmt(total - tg)} h in più</span>`
    : r === 0 ? `<b>${fmt(total)}</b> di ${fmt(tg)} h · <span class="ok">Completo</span>`
    : S.selected <= t0 ? `<b>${fmt(total)}</b> di ${fmt(tg)} h · <span class="warn">Mancano ${fmt(r)} h</span>`
    : `<b>${fmt(total)}</b> di ${fmt(tg)} h`;
  const copy = !items.length && S.editing === null && tg > 0 ? copySource(S.selected) : null;
  keepFocus(() => {
    app.innerHTML = `
      <section class="week" aria-label="Settimana">
        <div class="weekbar">
          <button class="icon" data-act="week" data-delta="-7" id="prev-week" aria-label="Settimana precedente">‹</button>
          <strong>${weekLabel(S.week)}</strong>
          <button class="icon" data-act="week" data-delta="7" id="next-week" aria-label="Settimana successiva">›</button>
          <span class="spacer"></span>
          ${S.selected === startDay() ? '' : '<button class="link" data-act="today" id="go-today">Vai a oggi</button>'}
        </div>
        <div class="strip">${weekDays(S.week).map((d, i) => {
          const t = dayTotal(d), g = target(d);
          const cls = [d === S.selected ? 'sel' : '', g === 0 ? 'off' : '', g > 0 && t === g ? 'done' : '', g > 0 && ((d <= t0 && t < g) || t > g) ? 'lack' : ''].join(' ');
          return `<button class="${cls}" data-act="select" data-day="${d}" id="strip-${d}" aria-pressed="${d === S.selected}" aria-label="${dayLabel(d)}, ${g === 0 && !t ? offLabel(d) : fmt(t) + ' ore'}">${DOW[i].slice(0, 3)} ${parse(d).getDate()}${d === t0 ? ' •' : ''}<b>${g === 0 && !t ? '–' : fmt(t)}</b></button>`;
        }).join('')}</div>
      </section>
      <section class="day">
        <div class="dayhead"><h2>${dayLabel(S.selected)}</h2><div class="state">${statusText}</div></div>
        ${items.length ? `<div class="list">${items.map(entryHtml).join('')}</div>` : ''}
        ${copy ? `<div class="row"><button class="btn" data-act="copyday" id="copy-day">Copia da ${shortLabel(copy.day)} · ${fmt(copy.rows.reduce((n, e) => n + e.hours, 0))} h</button></div>` : ''}
        ${open ? formHtml() : `<div><button class="btn" data-act="openform" id="open-form">${items.length ? 'Aggiungi altre ore' : 'Aggiungi ore'}</button></div>`}
      </section>`;
  });
}

function entryHtml(e) {
  const w = who(e.who);
  return `<div class="entry ${S.editing === e.id ? 'editing' : ''}" style="--client:${w.color}">
    <div class="who"><span class="dot"></span>${esc(w.name)}</div>
    <div class="hrs">${fmt(e.hours)} h</div>
    ${e.code ? `<div class="code">${esc(e.code)}</div>` : ''}
    ${e.description ? `<div class="desc">${esc(e.description)}</div>` : ''}
    <div class="ops">
      <button class="link" data-act="edit" data-id="${e.id}" id="edit-${e.id}">Modifica</button>
      <button class="link" data-act="remove" data-id="${e.id}" id="remove-${e.id}">Elimina</button>
    </div>
  </div>`;
}

// I progetti archiviati non si propongono, tranne quello della voce che si sta modificando.
function projectOptions() {
  const list = activeProjects();
  const current = S.projects.find(p => p.id === S.draft.who);
  if (current?.archived_at) list.push(current);
  return list.map(p => who(p.id));
}

function formHtml() {
  const { draft, errors } = S;
  const isProj = draft.kind === 'project';
  const opts = isProj ? projectOptions() : ABSENCES;
  const chips = opts.length
    ? `<div class="chips">${opts.map(o => `<label style="--client:${o.color}"><input type="radio" name="who" id="who-${esc(o.id)}" value="${esc(o.id)}" ${draft.who === o.id ? 'checked' : ''}>${isProj ? '<span class="dot"></span>' : ''}${o.id === 'altro' ? 'Altro' : esc(o.name)}</label>`).join('')}</div>`
    : '<p class="empty">Non ci sono progetti attivi. <button type="button" class="link" data-act="view" data-view="tasks" id="go-projects">Aggiungine uno</button></p>';
  return `<form id="entry-form" novalidate>
    ${S.editing !== null ? '<h3>Modifica voce</h3>' : ''}
    <div class="seg" role="radiogroup" aria-label="Tipo di ore">
      <label><input type="radio" name="kind" id="kind-project" value="project" ${isProj ? 'checked' : ''}><span>Progetto</span></label>
      <label><input type="radio" name="kind" id="kind-absence" value="absence" ${!isProj ? 'checked' : ''}><span>Assenza</span></label>
    </div>
    <fieldset>
      <legend>${isProj ? 'Progetto' : 'Tipo di assenza'}</legend>
      ${chips}
      ${errors.who && opts.length ? `<p class="err" id="e-who">${errors.who}</p>` : ''}
    </fieldset>
    ${isProj && draft.who ? taskFieldHtml() : ''}
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
      <button class="btn primary" type="submit" id="save" ${S.busy ? 'disabled' : ''}>${S.editing !== null ? 'Salva modifiche' : 'Salva ore'}</button>
      ${S.editing !== null || (S.forceOpen && rest(S.selected) === 0) ? '<button class="btn" type="button" data-act="cancel" id="cancel">Annulla</button>' : ''}
    </div>
  </form>`;
}

function taskFieldHtml() {
  const { draft, errors } = S;
  const open = openTasks(draft.who);
  const err = errors.code ? `<p class="err" id="e-code">${errors.code}</p>` : '';
  if (draft.newTask) {
    return `<div class="field">
      <label class="lbl" for="f-code">Codice task ServiceNow</label>
      <input class="input mono" id="f-code" value="${esc(draft.code)}" autocomplete="off" autocapitalize="characters" spellcheck="false" required ${errors.code ? 'aria-invalid="true" aria-describedby="e-code"' : ''}>
      ${err}
      ${open.length ? '<div><button type="button" class="link" data-act="picktask" id="pick-task">Scegli tra le task aperte</button></div>' : ''}
    </div>`;
  }
  return `<fieldset>
    <legend>Task</legend>
    <div class="chips tasks" style="--client:${who(draft.who).color}">
      ${open.map((t, i) => `<label class="mono"><input type="radio" name="task" id="task-${i}" value="${esc(t.code)}" ${draft.code === t.code ? 'checked' : ''}>${esc(t.code)}</label>`).join('')}
      <button type="button" class="chipbtn" data-act="newtask" id="new-task">+ Nuova</button>
    </div>
    ${err}
  </fieldset>`;
}

export async function go(d) {
  try { await ensure(around(d)); } catch { loadFail(); }
  pickDay(d);
  render();
}

async function saveEntry() {
  if (S.busy) return;
  const others = dayEntries(S.selected).filter(e => e.id !== S.editing).reduce((s, e) => s + e.hours, 0);
  const { errors, value } = validateEntry(S.draft, others);
  S.errors = errors;
  if (Object.keys(errors).length) {
    render();
    const field = errors.who ? 'go-projects' : !errors.code ? 'f-hours' : S.draft.newTask ? 'f-code' : 'task-0';
    document.getElementById(field)?.focus();
    return;
  }
  S.busy = true; render();
  try {
    if (S.editing !== null) {
      const prev = S.entries.find(e => e.id === S.editing);
      const row = await store.updateEntry(S.editing, value);
      S.entries = S.entries.map(e => e.id === row.id ? row : e);
      await refreshTasks();
      const { who: w, hours, code, description } = prev;
      toast('Voce aggiornata.', async () => {
        const back = await store.updateEntry(row.id, { who: w, hours, code, description });
        S.entries = S.entries.map(e => e.id === back.id ? back : e);
        await refreshTasks();
        S.draft = freshDraft();
      });
    } else {
      const row = await store.addEntry({ day: S.selected, ...value });
      S.entries = [...S.entries, row];
      await refreshTasks();
      toast(`Salvate ${fmt(row.hours)} h su ${who(row.who).name}.`, async () => {
        await store.removeEntry(row.id);
        S.entries = S.entries.filter(e => e.id !== row.id);
        await refreshTasks();
        S.draft = freshDraft();
      });
    }
    if (S.draft.kind === 'project') S.lastProject = value.who;
    S.editing = null; S.forceOpen = false; S.errors = {}; S.draft = freshDraft();
  } catch {
    toast('Non sono riuscito a salvare. Controlla la connessione e riprova.');
  }
  S.busy = false; render();
}

async function removeEntry(id) {
  const e = S.entries.find(x => x.id === id);
  try {
    await store.removeEntry(id);
    S.entries = S.entries.filter(x => x.id !== id);
    await refreshTasks();
    if (S.editing === id) S.editing = null;
    S.forceOpen = false; S.errors = {}; S.draft = freshDraft();
    render();
    const { day, who: w, hours, code, description } = e;
    toast(`Voce eliminata: ${fmt(hours)} h ${who(w).name}.`, async () => {
      S.entries = [...S.entries, await store.addEntry({ day, who: w, hours, code, description })];
      await refreshTasks();
      S.draft = freshDraft();
    });
  } catch { toast('Non sono riuscito a eliminare la voce. Riprova.'); }
}

async function copyDay() {
  const src = copySource(S.selected);
  if (!src || S.busy) return;
  S.busy = true;
  try {
    const rows = await store.addEntries(src.rows.map(({ who: w, hours, code, description }) => ({ day: S.selected, who: w, hours, code, description })));
    S.entries = [...S.entries, ...rows];
    await refreshTasks();
    S.forceOpen = false; S.errors = {}; S.draft = freshDraft();
    render();
    const n = rows.length === 1 ? '1 voce' : `${rows.length} voci`;
    const skip = src.skipped ? ` Escluse ${src.skipped} su task terminate.` : '';
    toast(`Copiate ${n} da ${shortLabel(src.day)}.${skip}`, async () => {
      await store.removeEntries(rows.map(r => r.id));
      const ids = new Set(rows.map(r => r.id));
      S.entries = S.entries.filter(e => !ids.has(e.id));
      await refreshTasks();
      S.draft = freshDraft();
    });
  } catch { toast('Non sono riuscito a copiare le voci. Riprova.'); }
  S.busy = false;
}

export const actions = {
  week: b => go(addDays(S.week, +b.dataset.delta)),
  today: () => go(startDay()),
  select: b => { pickDay(b.dataset.day); render(); },
  openform: () => { S.forceOpen = true; S.draft = freshDraft(); render(); document.getElementById('f-code')?.focus(); },
  cancel: () => { S.editing = null; S.forceOpen = false; S.errors = {}; S.draft = freshDraft(); render(); },
  step: b => {
    const cur = parseHours(S.draft.hours) || 0;
    S.draft.hours = fmt(Math.min(24, Math.max(0.5, cur + +b.dataset.delta)));
    document.getElementById('f-hours').value = S.draft.hours;
  },
  edit: b => {
    const e = S.entries.find(x => x.id === b.dataset.id);
    S.editing = e.id; S.errors = {};
    const absence = isAbsence(e.who);
    S.draft = { kind: absence ? 'absence' : 'project', who: e.who, code: e.code || '', newTask: !absence && !openTasks(e.who).some(t => t.code === e.code), hours: fmt(e.hours), desc: e.description };
    render();
    document.getElementById('f-hours')?.focus();
  },
  remove: b => removeEntry(b.dataset.id),
  newtask: () => { S.draft.newTask = true; S.draft.code = ''; S.errors = {}; render(); document.getElementById('f-code').focus(); },
  picktask: () => { S.draft.newTask = false; S.draft.code = taskChoice(S.draft.who).code; S.errors = {}; render(); },
  copyday: () => copyDay()
};

export function onInput(t) {
  if (t.id === 'f-code') { const v = normalizeCode(t.value); if (v !== t.value) t.value = v; S.draft.code = v; }
  if (t.id === 'f-hours') S.draft.hours = t.value;
  if (t.id === 'f-desc') S.draft.desc = t.value;
}
export function onChange(t) {
  if (t.name === 'kind') {
    const hours = S.draft.hours, desc = S.draft.desc;
    S.draft = { ...freshDraft(t.value), hours, desc };
    S.errors = {};
    render();
  }
  if (t.name === 'who') {
    S.draft.who = t.value;
    if (S.draft.kind === 'project') { S.lastProject = t.value; Object.assign(S.draft, taskChoice(t.value)); S.errors = {}; }
    render();
  }
  if (t.name === 'task') { S.draft.code = t.value; S.draft.newTask = false; S.errors = {}; render(); }
}
export const onSubmit = { 'entry-form': saveEntry };
