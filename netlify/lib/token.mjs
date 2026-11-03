import { createHmac, timingSafeEqual } from 'node:crypto';

// Token firmati per i pulsanti delle notifiche: dicono chi, che giorno e quale azione, e scadono.
// Il service worker non ha la sessione di login, quindi il token è l'unica prova che l'azione è legittima.
const b64 = buf => Buffer.from(buf).toString('base64url');
const sig = (body, secret) => createHmac('sha256', secret).update(body).digest();

export function signToken(claims, secret) {
  const body = b64(JSON.stringify(claims));
  return `${body}.${b64(sig(body, secret))}`;
}

// Restituisce i dati del token se la firma è valida e non è scaduto, altrimenti null.
export function verifyToken(token, secret, now = Date.now()) {
  if (typeof token !== 'string' || !secret) return null;
  const [body, mac, extra] = token.split('.');
  if (!body || !mac || extra !== undefined) return null;
  const given = Buffer.from(mac, 'base64url'), want = sig(body, secret);
  if (given.length !== want.length || !timingSafeEqual(given, want)) return null;
  let claims;
  try { claims = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')); } catch { return null; }
  if (!claims || typeof claims.exp !== 'number' || claims.exp < now) return null;
  return claims;
}

// Chiave dedicata, ricavata dalla chiave privata VAPID: non serve un'altra variabile d'ambiente.
export const quickSecret = () => process.env.VAPID_PRIVATE_KEY
  ? createHmac('sha256', process.env.VAPID_PRIVATE_KEY).update('monte-ore/quick-log').digest()
  : null;
