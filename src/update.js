// Avviso di nuova versione: confronta lo script in esecuzione con quello pubblicato.
import { S } from './state.js';

const running = document.querySelector('script[type="module"][src^="/assets/"]')?.getAttribute('src');
let shown = false;

export async function checkUpdate() {
  if (!running || shown) return;
  const res = await fetch('/', { cache: 'no-store' });
  if (!res.ok) return;
  const html = await res.text();
  const published = html.match(/<script[^>]*type="module"[^>]*src="(\/assets\/[^"]+)"/)?.[1];
  if (!published || published === running) return;
  // Aggiorna la copia offline, così il ricaricamento apre subito la nuova versione.
  try { await (await caches.open('monte-ore-v1')).put('/', new Response(html, { headers: { 'Content-Type': 'text/html; charset=utf-8' } })); } catch { /* senza cache offline */ }
  shown = true;
  const box = document.createElement('div');
  box.className = 'notice'; box.id = 'update'; box.setAttribute('role', 'status');
  box.innerHTML = '<button class="open" data-act="reload" id="reload">Nuova versione disponibile</button><small>Tocca per aggiornare l\'app.</small><button class="x" data-act="dismissupdate" aria-label="Chiudi">×</button>';
  document.body.append(box);
}

export const actions = {
  reload: () => { if (S.editing === null || confirm('Hai una modifica in corso. Ricaricare comunque?')) location.reload(); },
  dismissupdate: () => document.getElementById('update')?.remove()
};
