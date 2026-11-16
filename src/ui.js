// Pezzi di interfaccia condivisi dalle viste.
import { DOW, MONTHS, parse, addDays, fmt } from './logic.js';
import { render } from './render.js';

export const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const CLOCK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>';
// Icone disegnate, tutte con lo stesso tratto: niente caratteri Unicode al posto delle icone.
const svg = (d, cls = 'ico') => `<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
export const ICON = {
  prev: svg('<path d="m15 18-6-6 6-6"/>'),
  next: svg('<path d="m9 18 6-6-6-6"/>'),
  close: svg('<path d="M18 6 6 18M6 6l12 12"/>'),
  minus: svg('<path d="M5 12h14"/>'),
  plus: svg('<path d="M12 5v14M5 12h14"/>'),
  tick: svg('<path d="M20 6 9 17l-5-5"/>', 'tick'),
  copy: svg('<rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1"/>'),
  chevron: svg('<path d="m9 18 6-6-6-6"/>', 'ico chev'),
  trash: svg('<path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-12M9 7V4h6v3"/>'),
  download: svg('<path d="M12 4v11m0 0-4-4m4 4 4-4M5 20h14"/>'),
  // Schede: giorno, task, mese
  day: svg('<rect x="4" y="5" width="16" height="15" rx="3"/><path d="M8 3v4M16 3v4M4 10h16"/><circle cx="12" cy="15" r="1.4" fill="currentColor" stroke="none"/>'),
  tasks: svg('<path d="m4 7 1.5 1.5L8 6M4 13l1.5 1.5L8 12M4 19l1.5 1.5L8 18M12 7h8M12 13h8M12 19h8"/>'),
  month: svg('<rect x="4" y="5" width="16" height="15" rx="3"/><path d="M8 3v4M16 3v4M4 10h16M9 10v10M15 10v10M4 15h16"/>')
};
// Marchio: lo stesso disegno dell'icona dell'app, "8h" sopra la barra dei progetti.
export const MARK = '<svg class="mark" viewBox="0 0 32 32" aria-hidden="true"><rect width="32" height="32" rx="9" fill="var(--hero)"/><text x="16" y="18.5" text-anchor="middle" font-family="Familjen Grotesk, sans-serif" font-weight="700" font-size="14" fill="#fff">8h</text><rect x="8" y="22.5" width="7.5" height="2.6" rx="1.3" fill="#86A9F5"/><rect x="16.3" y="22.5" width="4.6" height="2.6" rx="1.3" fill="#4FCDB6"/><rect x="21.7" y="22.5" width="2.6" height="2.6" rx="1.3" fill="#F0957C"/></svg>';
// Sigla di un progetto (una o due lettere) per i riquadri colorati.
export const initials = name => {
  const w = String(name).trim().split(/\s+/).filter(Boolean);
  return ((w.length > 1 ? w[0][0] + w[1][0] : (w[0] || '?').slice(0, 2))).toUpperCase();
};
export const BELL = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 9a6 6 0 1 1 12 0c0 6 2.5 7.5 2.5 7.5h-17S6 15 6 9"/><path d="M10.3 20a2 2 0 0 0 3.4 0"/></svg>';

export const dow = d => DOW[(d.getDay() + 6) % 7];
export const hoursText = h => `${fmt(h)} ${h === 1 ? 'ora' : 'ore'}`;
// Stato di un giorno a parole, per i lettori vocali: distingue le ore mancanti da quelle in più.
export function dayState(total, target, isPast) {
  if (target <= 0) return '';
  if (total > target) return 'oltre le ore previste';
  if (total === target) return 'completo';
  return isPast ? 'incompleto' : '';
}
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
