// Pezzi di interfaccia condivisi dalle viste.
import { DOW, MONTHS, parse, addDays } from './logic.js';
import { render } from './render.js';

export const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const CLOCK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>';
export const BELL = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 9a6 6 0 1 1 12 0c0 6 2.5 7.5 2.5 7.5h-17S6 15 6 9"/><path d="M10.3 20a2 2 0 0 0 3.4 0"/></svg>';

const dow = d => DOW[(d.getDay() + 6) % 7];
export const dayLabel = k => { const d = parse(k); return `${dow(d)} ${d.getDate()} ${MONTHS[d.getMonth()]}`; };
export const shortLabel = k => { const d = parse(k); return `${dow(d).toLowerCase()} ${d.getDate()} ${MONTHS[d.getMonth()]}`; };
export const weekLabel = mon => {
  const a = parse(mon), b = parse(addDays(mon, 4));
  return a.getMonth() === b.getMonth()
    ? `${a.getDate()}–${b.getDate()} ${MONTHS[a.getMonth()]}`
    : `${a.getDate()} ${MONTHS[a.getMonth()].slice(0, 3)} – ${b.getDate()} ${MONTHS[b.getMonth()].slice(0, 3)}`;
};

// Ridisegna una parte della pagina senza perdere il campo in cui si sta scrivendo.
export function keepFocus(draw) {
  const id = document.activeElement?.id;
  draw();
  if (id) document.getElementById(id)?.focus();
}

let toastTimer;
// Messaggio in basso. Con undo mostra "Annulla", che esegue undo e ridisegna.
export function toast(msg, undo) {
  clearTimeout(toastTimer);
  const t = document.getElementById('toast');
  t.innerHTML = `<div class="toast"><span>${esc(msg)}</span>${undo ? '<button id="undo">Annulla</button>' : ''}</div>`;
  if (undo) document.getElementById('undo').onclick = async () => {
    t.innerHTML = '';
    try { await undo(); render(); } catch { toast('Operazione non riuscita. Riprova.'); }
  };
  toastTimer = setTimeout(() => { t.innerHTML = ''; }, undo ? 7000 : 3500);
}
export const loadFail = () => toast('Non riesco a caricare i dati. Controlla la connessione e riprova.');
