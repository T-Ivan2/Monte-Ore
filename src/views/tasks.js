// Vista Task: task aperte e terminate, e gestione dei progetti.
import { COLORS, colorVar, fmt, slugify, validateProject } from '../logic.js';
import { store } from '../store.js';
import { S, who, freshDraft, refreshTasks, refreshProjects } from '../state.js';
import { esc, keepFocus, toast } from '../ui.js';
import { render } from '../render.js';

function taskRow(t) {
  const w = who(t.who);
  const k = `data-who="${esc(t.who)}" data-code="${esc(t.code)}"`;
  return `<div class="entry" style="--client:${w.color}">
    <div class="code strong">${esc(t.code)}</div>
    <div class="hrs">${fmt(t.hours)} h</div>
    <div class="who sub"><span class="dot"></span>${esc(w.name)}</div>
    <div class="ops">
      ${t.done_at
        ? `<button class="link" data-act="reopentask" ${k}>Riapri</button>`
        : `<button class="link" data-act="donetask" ${k}>Termina</button>${t.hours === 0 ? `<button class="link" data-act="deltask" ${k}>Elimina</button>` : ''}`}
    </div>
  </div>`;
}

function projectRow(p) {
  const own = S.tasks.filter(t => t.who === p.id);
  const hours = own.reduce((n, t) => n + t.hours, 0);
  const k = `data-id="${esc(p.id)}"`;
  return `<div class="entry" style="--client:${colorVar(p.color)}">
    <div class="who"><span class="dot"></span>${esc(p.name)}${p.archived_at ? '<span class="tag">Archiviato</span>' : ''}</div>
    <div class="hrs">${fmt(hours)} h</div>
    <div class="ops">
      <button class="link" data-act="editproject" ${k} id="edit-project-${esc(p.id)}">Modifica</button>
      ${p.archived_at
        ? `<button class="link" data-act="restoreproject" ${k} id="restore-project-${esc(p.id)}">Ripristina</button>`
        : `<button class="link" data-act="archiveproject" ${k} id="archive-project-${esc(p.id)}">Archivia</button>`}
      ${own.length ? '' : `<button class="link" data-act="delproject" ${k} id="del-project-${esc(p.id)}">Elimina</button>`}
    </div>
  </div>`;
}

function projectFormHtml() {
  const f = S.projectForm;
  return `<form id="project-form" novalidate>
    <h3>${f.id ? 'Modifica progetto' : 'Nuovo progetto'}</h3>
    <div class="field">
      <label class="lbl" for="p-name">Nome</label>
      <input class="input" id="p-name" value="${esc(f.name)}" maxlength="40" autocomplete="off" ${f.errors.name ? 'aria-invalid="true" aria-describedby="e-p-name"' : ''}>
      ${f.errors.name ? `<p class="err" id="e-p-name">${f.errors.name}</p>` : ''}
    </div>
    <fieldset>
      <legend>Colore</legend>
      <div class="chips">${COLORS.map(c => `<label style="--client:${colorVar(c.id)}"><input type="radio" name="pcolor" id="pcolor-${c.id}" value="${c.id}" ${f.color === c.id ? 'checked' : ''}><span class="dot"></span>${c.name}</label>`).join('')}</div>
      ${f.errors.color ? `<p class="err">${f.errors.color}</p>` : ''}
    </fieldset>
    <div class="row">
      <button class="btn primary" type="submit" id="p-save" ${S.busy ? 'disabled' : ''}>${f.id ? 'Salva modifiche' : 'Aggiungi progetto'}</button>
      <button class="btn" type="button" data-act="cancelproject" id="p-cancel">Annulla</button>
    </div>
  </form>`;
}

export function renderTasks() {
  const app = document.getElementById('app');
  const open = S.tasks.filter(t => !t.done_at);
  const done = S.tasks.filter(t => t.done_at).sort((a, b) => b.done_at.localeCompare(a.done_at));
  const projects = [...S.projects].sort((a, b) => Boolean(a.archived_at) - Boolean(b.archived_at));
  keepFocus(() => {
    app.innerHTML = `
      <section class="day">
        <h2 class="mhead">Task aperte</h2>
        ${open.length ? `<div class="list">${open.map(taskRow).join('')}</div>` : '<p class="empty">Nessuna task aperta. Si aggiungono quando registri le ore.</p>'}
      </section>
      ${done.length ? `<section class="day"><h2 class="mhead">Terminate</h2><div class="list">${done.map(taskRow).join('')}</div></section>` : ''}
      <section class="day" id="projects">
        <h2 class="mhead">Progetti</h2>
        ${projects.length ? `<div class="list">${projects.map(projectRow).join('')}</div>` : '<p class="empty">Nessun progetto. Aggiungine uno per registrare le ore.</p>'}
        ${S.projectForm ? projectFormHtml() : '<div><button class="btn" data-act="addproject" id="add-project">Aggiungi progetto</button></div>'}
        <p class="empty small">Un progetto archiviato non si propone più quando registri le ore, ma resta nei totali e nell'export. Si può eliminare solo un progetto senza task.</p>
      </section>`;
  });
}

async function changeTask(action, w, code) {
  try {
    if (action === 'done') await store.setTaskDone(w, code, true);
    if (action === 'reopen') await store.setTaskDone(w, code, false);
    if (action === 'remove') await store.removeTask(w, code);
    await refreshTasks();
    S.draft = freshDraft();
    render();
    if (action === 'done') toast(`${code} terminata.`, async () => { await store.setTaskDone(w, code, false); await refreshTasks(); S.draft = freshDraft(); });
    if (action === 'reopen') toast(`${code} riaperta.`);
    if (action === 'remove') toast(`${code} eliminata.`);
  } catch { toast('Operazione non riuscita. Controlla la connessione e riprova.'); }
}

// Dopo ogni modifica ai progetti ricarica l'elenco e riprepara il modulo del giorno.
async function afterProjects() {
  await refreshProjects();
  if (S.editing === null) S.draft = freshDraft();
  render();
}

async function saveProject() {
  if (S.busy) return;
  const f = S.projectForm;
  const { errors, value } = validateProject(f, S.projects, f.id);
  f.errors = errors;
  if (Object.keys(errors).length) { render(); document.getElementById('p-name')?.focus(); return; }
  S.busy = true; render();
  try {
    if (f.id) await store.updateProject(f.id, value);
    else {
      const row = await store.addProject({ id: slugify(value.name, S.projects.map(p => p.id)), ...value });
      S.lastProject = row.id;
    }
    S.projectForm = null;
    S.busy = false;
    await afterProjects();
    toast(f.id ? `Progetto ${value.name} aggiornato.` : `Progetto ${value.name} aggiunto.`);
  } catch {
    S.busy = false; render();
    toast('Non sono riuscito a salvare il progetto. Controlla la connessione e riprova.');
  }
}

async function setArchived(id, archived) {
  const p = S.projects.find(x => x.id === id);
  try {
    await store.updateProject(id, { archived_at: archived ? new Date().toISOString() : null });
    await afterProjects();
    if (archived) toast(`${p.name} archiviato.`, async () => { await store.updateProject(id, { archived_at: null }); await afterProjects(); });
    else toast(`${p.name} ripristinato.`);
  } catch { toast('Operazione non riuscita. Controlla la connessione e riprova.'); }
}

async function removeProject(id) {
  const p = S.projects.find(x => x.id === id);
  try {
    await store.removeProject(id);
    if (S.lastProject === id) S.lastProject = null;
    await afterProjects();
    toast(`${p.name} eliminato.`);
  } catch { toast('Non posso eliminare un progetto con delle task: archivialo.'); }
}

export const actions = {
  donetask: b => changeTask('done', b.dataset.who, b.dataset.code),
  reopentask: b => changeTask('reopen', b.dataset.who, b.dataset.code),
  deltask: b => changeTask('remove', b.dataset.who, b.dataset.code),
  addproject: () => {
    const used = new Set(S.projects.filter(p => !p.archived_at).map(p => p.color));
    S.projectForm = { id: null, name: '', color: (COLORS.find(c => !used.has(c.id)) || COLORS[0]).id, errors: {} };
    render();
    document.getElementById('p-name')?.focus();
  },
  editproject: b => {
    const p = S.projects.find(x => x.id === b.dataset.id);
    S.projectForm = { id: p.id, name: p.name, color: p.color, errors: {} };
    render();
    document.getElementById('p-name')?.focus();
  },
  cancelproject: () => { S.projectForm = null; render(); },
  archiveproject: b => setArchived(b.dataset.id, true),
  restoreproject: b => setArchived(b.dataset.id, false),
  delproject: b => removeProject(b.dataset.id)
};

export function onInput(t) {
  if (t.id === 'p-name' && S.projectForm) S.projectForm.name = t.value;
}
export function onChange(t) {
  if (t.name === 'pcolor' && S.projectForm) S.projectForm.color = t.value;
}
export const onSubmit = { 'project-form': saveProject };
