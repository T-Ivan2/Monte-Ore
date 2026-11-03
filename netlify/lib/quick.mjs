import { fmt, targetFor, findCopySource, planQuickActions } from '../../src/logic.js';
import { signToken } from './token.mjs';

export const QUICK_TTL_MS = 12 * 60 * 60 * 1000;

// Pulsanti da allegare a un promemoria, ognuno con il suo token firmato.
export function quickActions(ctx, { user_id, day, missing }, secret, now = Date.now()) {
  if (!secret) return [];
  return planQuickActions({ day, missing, ...ctx }).map((a, i) => ({
    action: `a${i}`,
    title: a.title,
    token: signToken({ u: user_id, d: day, k: a.kind, who: a.who, code: a.code, exp: now + QUICK_TTL_MS }, secret)
  }));
}

const dayName = k => new Intl.DateTimeFormat('it-IT', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' })
  .format(new Date(`${k}T12:00:00Z`));

// Esegue l'azione di un token già verificato. Ricontrolla tutto sui dati attuali, così premere
// due volte lo stesso pulsante, o da due dispositivi, non registra le ore due volte.
export async function runQuickLog({ loadContext, insertEntries }, claims) {
  const { u: userId, d: day, k: kind } = claims;
  const ctx = await loadContext(userId, day);
  const today = ctx.entries.filter(e => e.day === day);
  const total = today.reduce((n, e) => n + e.hours, 0);

  if (kind === 'copy') {
    if (today.length) return { ok: false, message: 'In questo giorno ci sono già delle ore: apri l\'app per aggiungerne altre.' };
    const src = findCopySource(day, ctx.entries, ctx.tasks);
    if (!src) return { ok: false, message: 'Non ho trovato un giorno da copiare: apri l\'app.' };
    await insertEntries(userId, src.rows.map(({ who, hours, code, description }) => ({ day, who, hours, code, description: description || '' })));
    const h = src.rows.reduce((n, e) => n + e.hours, 0);
    return { ok: true, message: `Copiate ${fmt(h)} h da ${dayName(src.day)}.` };
  }

  if (kind === 'fill') {
    const missing = targetFor(day, ctx.dayHours) - total;
    if (missing <= 0) return { ok: true, message: 'La giornata è già completa.' };
    const task = ctx.tasks.find(t => t.who === claims.who && t.code === claims.code);
    const project = ctx.projects.find(p => p.id === claims.who);
    if (!task || task.done_at || !project || project.archived_at) {
      return { ok: false, message: `${claims.code} non è più aperta: apri l'app per scegliere la task.` };
    }
    await insertEntries(userId, [{ day, who: claims.who, hours: missing, code: claims.code, description: '' }]);
    return { ok: true, message: `Registrate ${fmt(missing)} h su ${claims.code} (${project.name}).` };
  }

  return { ok: false, message: 'Azione sconosciuta: apri l\'app.' };
}
