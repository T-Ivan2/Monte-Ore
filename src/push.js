import { store, isLocal } from './store.js';

const VAPID = import.meta.env.VITE_VAPID_PUBLIC_KEY;

const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent);
const isInstalled = () => window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;

function keyBytes(b64) {
  const s = (b64 + '='.repeat((4 - b64.length % 4) % 4)).replace(/-/g, '+').replace(/_/g, '/');
  return Uint8Array.from(atob(s), c => c.charCodeAt(0));
}
async function currentSub() {
  const reg = await navigator.serviceWorker.ready;
  return reg.pushManager.getSubscription();
}

// status: unavailable | needs-install | denied | off | on
export async function pushStatus() {
  if (isLocal || !VAPID) return 'unavailable';
  if (isIOS() && !isInstalled()) return 'needs-install';
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) return 'unavailable';
  if (Notification.permission === 'denied') return 'denied';
  return (await currentSub()) ? 'on' : 'off';
}
export async function enablePush() {
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') throw new Error('permission');
  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.getSubscription() || await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(VAPID) });
  await store.savePush(sub);
}
export async function disablePush() {
  const sub = await currentSub();
  if (!sub) return;
  await store.removePush(sub.endpoint);
  await sub.unsubscribe();
}
// Mantiene valida l'iscrizione di questo dispositivo sul server.
export async function syncPush() {
  if ((await pushStatus()) !== 'on') return;
  await store.savePush(await currentSub());
}
export async function testPush() {
  const res = await fetch('/api/send-test', { method: 'POST', headers: { Authorization: `Bearer ${await store.token()}` } });
  if (!res.ok) throw new Error('send-test');
  return res.json();
}
