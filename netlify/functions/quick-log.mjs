import { adminClient, loadQuickContext, insertEntries } from '../lib/server.mjs';
import { verifyToken, quickSecret } from '../lib/token.mjs';
import { runQuickLog } from '../lib/quick.mjs';

// Riceve il pulsante premuto su una notifica. Il token firmato identifica utente, giorno e azione.
export default async req => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });
  let token;
  try { ({ token } = await req.json()); } catch { /* corpo non valido */ }
  const claims = verifyToken(token, quickSecret());
  if (!claims) return Response.json({ ok: false, message: 'Il promemoria è scaduto: apri l\'app per registrare le ore.' }, { status: 401 });
  const db = adminClient();
  try {
    const result = await runQuickLog({
      loadContext: (userId, day) => loadQuickContext(db, userId, day),
      insertEntries: (userId, rows) => insertEntries(db, userId, rows)
    }, claims);
    return Response.json(result);
  } catch (err) {
    console.error('quick-log failed', err?.message || err);
    return Response.json({ ok: false, message: 'Non sono riuscito a registrare le ore: apri l\'app.' }, { status: 500 });
  }
};

export const config = { path: '/api/quick-log' };
