import { adminClient, sendToUser } from '../lib/server.mjs';

export default async req => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });
  const token = (req.headers.get('authorization') || '').replace(/^Bearer /, '');
  const db = adminClient();
  const { data, error } = await db.auth.getUser(token);
  if (error || !data.user) return new Response('Unauthorized', { status: 401 });
  const sent = await sendToUser(db, data.user.id, { title: 'Monte Ore', body: 'Notifica di prova: funziona.', url: '/', tag: 'test' });
  return Response.json({ sent });
};

export const config = { path: '/api/send-test' };
