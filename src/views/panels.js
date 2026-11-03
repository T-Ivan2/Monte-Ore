// Pannelli in alto: ore previste e notifiche.
import { DOW, fmt, parseHours, isHalfHours } from '../logic.js';
import { store } from '../store.js';
import { pushStatus, enablePush, disablePush, testPush } from '../push.js';
import { S, freshDraft } from '../state.js';
import { CLOCK, BELL, keepFocus, toast } from '../ui.js';
import { render } from '../render.js';

export function renderHours() {
  const t = document.getElementById('hours-toggle');
  if (!t) return;
  const open = S.panel === 'hours';
  const perWeek = S.dayHours.reduce((n, h) => n + h, 0);
  t.setAttribute('aria-expanded', open);
  t.innerHTML = `${CLOCK}<b>${fmt(perWeek)} h<span class="wide">/sett.</span></b>`;
  t.setAttribute('aria-label', `Ore previste: ${fmt(perWeek)} a settimana`);
  const p = document.getElementById('hours-panel');
  p.hidden = !open;
  if (!open) return;
  keepFocus(() => {
    p.innerHTML = `<h2>Ore previste</h2>
      <p>Le ore da registrare in ogni giorno. Metti 0 nei giorni in cui non lavori: non risulteranno incompleti e non riceverai promemoria. Sabato, domenica e festivi non prevedono ore, ma puoi registrarle.</p>
      <div class="dayhours">${S.dayHours.map((h, i) => `<label class="field"><span class="lbl">${DOW[i].slice(0, 3)}</span><input class="input" id="dh-${i}" data-dh="${i}" inputmode="decimal" value="${fmt(h)}" autocomplete="off" ${S.hoursError ? 'aria-describedby="e-dh"' : ''}></label>`).join('')}</div>
      ${S.hoursError ? `<p class="err" id="e-dh" role="alert">${S.hoursError}</p>` : ''}`;
  });
}

function pushControls() {
  if (S.push === 'on') return '<button class="btn" data-act="testpush" id="test-notif">Prova notifica</button><button class="btn" data-act="pushoff" id="push-off">Disattiva su questo dispositivo</button>';
  if (S.push === 'off') return '<button class="btn primary" data-act="pushon" id="push-on">Attiva su questo dispositivo</button>';
  if (S.push === 'needs-install') return '<p>Su iPhone aggiungi prima l\'app alla schermata Home: Condividi, poi Aggiungi alla schermata Home. Aprila da lì per attivare le notifiche.</p>';
  if (S.push === 'denied') return '<p>Le notifiche sono bloccate per questa app. Riattivale dalle impostazioni del dispositivo o del browser.</p>';
  return '<p>Questo browser non può ricevere notifiche.</p>';
}
export function renderNotif() {
  const t = document.getElementById('notif-toggle');
  if (!t) return;
  const open = S.panel === 'notif';
  t.setAttribute('aria-expanded', open);
  t.innerHTML = `${BELL}${S.times.length === 0 ? 'Notifiche spente' : `<b>${S.times.length <= 2 ? S.times.join(', ') : S.times.length + ' orari'}</b>`}`;
  const p = document.getElementById('notif-panel');
  p.hidden = !open;
  if (!open) return;
  keepFocus(() => {
    p.innerHTML = `<h2>Notifiche</h2>
      <p>Dal lunedì al venerdì, solo se nella giornata mancano ancora ore.</p>
      <div class="times">${S.times.map((x, i) => `<span class="time"><input type="time" id="time-${i}" data-time="${i}" value="${x}" aria-label="Orario notifica ${i + 1}"><button data-act="deltime" data-i="${i}" id="deltime-${i}" aria-label="Rimuovi ${x}">×</button></span>`).join('')}</div>
      <div class="row"><button class="btn" data-act="addtime" id="add-time">Aggiungi orario</button>${pushControls()}</div>`;
  });
}

async function saveDayHours(i, raw) {
  const h = parseHours(raw);
  if (!isHalfHours(h)) {
    S.hoursError = "Inserisci un numero di ore tra 0 e 24, a blocchi di mezz'ora.";
    renderHours();
    return;
  }
  const before = S.dayHours;
  S.dayHours = S.dayHours.map((x, j) => j === i ? h : x);
  S.hoursError = '';
  renderHours(); S.draft = freshDraft(); render();
  try { await store.setDayHours(S.dayHours); }
  catch { S.dayHours = before; renderHours(); S.draft = freshDraft(); render(); toast('Non sono riuscito a salvare le ore previste. Riprova.'); }
}
async function saveTimes(next) {
  const before = S.times;
  S.times = [...new Set(next)].sort();
  renderNotif();
  try { await store.setTimes(S.times); }
  catch { S.times = before; renderNotif(); toast('Non sono riuscito a salvare gli orari. Riprova.'); }
}
const togglePanel = name => { S.panel = S.panel === name ? null : name; S.hoursError = ''; renderHours(); renderNotif(); };

export const actions = {
  hours: () => togglePanel('hours'),
  notif: () => togglePanel('notif'),
  addtime: () => saveTimes([...S.times, ['09:00', '11:00', '15:00', '18:00', '19:00'].find(x => !S.times.includes(x)) || '08:00']),
  deltime: b => saveTimes(S.times.filter((_, i) => i !== +b.dataset.i)),
  pushon: async () => {
    try { await enablePush(); toast('Notifiche attive su questo dispositivo.'); }
    catch { toast(Notification.permission === 'denied' ? 'Notifiche bloccate: riattivale dalle impostazioni.' : 'Non sono riuscito ad attivare le notifiche. Riprova.'); }
    S.push = await pushStatus(); renderNotif();
  },
  pushoff: async () => {
    try { await disablePush(); toast('Notifiche disattivate su questo dispositivo.'); }
    catch { toast('Non sono riuscito a disattivarle. Riprova.'); }
    S.push = await pushStatus(); renderNotif();
  },
  testpush: async () => {
    try { const r = await testPush(); toast(r.sent ? 'Notifica di prova inviata.' : 'Nessun dispositivo attivo trovato.'); }
    catch { toast('Invio non riuscito. Controlla la configurazione del server.'); }
  }
};

export async function onChange(t) {
  if (t.dataset?.dh !== undefined) await saveDayHours(+t.dataset.dh, t.value);
  if (t.dataset?.time !== undefined) {
    const next = [...S.times];
    if (t.value) next[+t.dataset.time] = t.value;
    await saveTimes(next);
  }
}
