// Vista Mese: monte ore, calendario ed export in Excel.
import { ABSENCES, DOW, MONTHS, fmt, parse, monday, weekDays, holidayName, monthDays, shiftMonth, dayLength, incompleteDays } from '../logic.js';
import { S, today, dayTotal, target, offLabel, who, names, taskTitles, ensure } from '../state.js';
import { esc, toast, loadFail, ICON, dow, hoursText, dayState } from '../ui.js';
import { render } from '../render.js';
import { go } from './day.js';

const inMonth = () => S.entries.filter(e => e.day.slice(0, 7) === S.month);
const monthTarget = () => monthDays(S.month).reduce((s, d) => s + target(d), 0);

export function renderMonth() {
  const app = document.getElementById('app');
  const t0 = today();
  const [y, m] = S.month.split('-').map(Number);
  const days = monthDays(S.month);
  const working = days.filter(d => target(d) > 0);
  const due = monthTarget();
  const rowsIn = inMonth();
  const total = rowsIn.reduce((s, e) => s + e.hours, 0);
  const late = incompleteDays(days, t0, S.entries, S.dayHours).length;
  const hoursOf = id => rowsIn.filter(e => e.who === id).reduce((s, e) => s + e.hours, 0);
  // Progetti attivi sempre; archiviati, assenze e voci di progetti eliminati solo se hanno ore nel mese.
  const ids = [...S.projects.map(p => p.id), ...ABSENCES.map(a => a.id), ...rowsIn.map(e => e.who)];
  const rows = [...new Set(ids)].map(id => ({ ...who(id), h: hoursOf(id) }))
    .filter(w => w.h > 0 || S.projects.some(p => p.id === w.id && !p.archived_at));
  const cells = [...new Set(days.map(monday))].flatMap(weekDays).map(d => {
    if (!days.includes(d)) return '<div></div>';
    const t = dayTotal(d), h = holidayName(d), g = target(d);
    const done = g > 0 && t === g, lack = g > 0 && ((d <= t0 && t < g) || t > g);
    const cls = [
      d === t0 ? 'today' : '', g === 0 ? 'off' : '', h && !t ? 'holiday' : '', done ? 'done' : '',
      lack ? 'lack' : '', (g === 0 || d > t0) && t === 0 ? 'future' : ''
    ].join(' ');
    // Calendario quieto: i giorni futuri e liberi senza ore restano vuoti, risaltano solo quelli incompleti.
    const shown = t > 0 || (g > 0 && d <= t0);
    const label = shown ? fmt(t) : h ? 'Fest.' : '';
    const state = dayState(t, g, d <= t0);
    const tail = shown ? `, ${hoursText(t)}${state ? ', ' + state : ''}` : g === 0 ? `, ${offLabel(d)}` : ', nessuna ora';
    // Ai lettori vocali: giorno della settimana, data, ore e stato; il numero visibile è già detto nel testo nascosto.
    return `<button class="calday ${cls}" data-act="openday" data-day="${d}" id="cal-${d}"><span class="sr">${dow(parse(d))} </span><span class="n">${parse(d).getDate()}</span><span class="sr"> ${MONTHS[m - 1]}${tail}</span><span class="t" aria-hidden="true">${label}</span></button>`;
  }).join('');
  const lateText = late ? `<span class="warn">${late === 1 ? '1 giorno incompleto' : late + ' giorni incompleti'}</span>` : working.some(d => d <= t0) ? '<span class="ok">Nessun giorno incompleto</span>' : '';
  app.innerHTML = `
    <div class="weekbar">
      <button class="icon" data-act="month" data-delta="-1" id="prev-month" aria-label="Mese precedente">${ICON.prev}</button>
      <h2 class="mhead">${MONTHS[m - 1][0].toUpperCase() + MONTHS[m - 1].slice(1)} ${y}</h2>
      <button class="icon" data-act="month" data-delta="1" id="next-month" aria-label="Mese successivo">${ICON.next}</button>
      <span class="spacer"></span>
      ${S.month === t0.slice(0, 7) ? '' : '<button class="link" data-act="thismonth" id="this-month">Vai a oggi</button>'}
    </div>
    <div class="row"><button class="btn" data-act="exportxlsx" id="export-xlsx" ${rowsIn.length ? '' : 'disabled'}>Esporta in Excel</button></div>
    <section class="bank" aria-label="Monte ore del mese">
      <div class="banktop">
        <div class="bankfig">${fmt(total)} <span>di ${fmt(due)} h</span></div>
        <div class="state">${lateText}</div>
      </div>
      <div class="bar" aria-hidden="true">${rows.filter(w => w.h > 0).map(w => `<i style="width:${(w.h / Math.max(due, total, 1)) * 100}%;background:${w.color}"></i>`).join('')}</div>
      <div class="legend">${rows.map(w => `<span style="--client:${w.color}"><span class="dot"></span>${esc(w.name)} <b>${fmt(w.h)} h</b></span>`).join('')}</div>
    </section>
    <section class="cal" aria-label="Calendario del mese">
      ${DOW.map(d => `<div class="dow">${d.slice(0, 3)}</div>`).join('')}${cells}
    </section>`;
}

async function showMonth(month) {
  S.month = month;
  try { await ensure(monthDays(S.month)); } catch { loadFail(); }
  render();
}

export const actions = {
  month: b => showMonth(shiftMonth(S.month, +b.dataset.delta)),
  thismonth: () => showMonth(today().slice(0, 7)),
  openday: async b => { S.view = 'day'; await go(b.dataset.day); window.scrollTo(0, 0); },
  exportxlsx: async b => {
    b.disabled = true;
    try {
      const { exportMonth } = await import('../export.js');
      const r = await exportMonth(inMonth(), S.month, monthTarget(), dayLength(S.dayHours), names(), taskTitles());
      if (r === 'downloaded') toast('File Excel scaricato.');
    } catch { toast('Non sono riuscito a creare il file Excel. Riprova.'); }
    b.disabled = false;
  }
};
