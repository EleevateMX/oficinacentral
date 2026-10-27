// App instalable (PWA) y notificaciones push en este dispositivo.
import { api } from './api.js';
import { office } from './store.js';

const swSupported = typeof navigator !== 'undefined' && 'serviceWorker' in navigator;
export const pushSupported = swSupported && typeof window !== 'undefined' && 'PushManager' in window && 'Notification' in window;

// ---------- Service worker ----------
let regPromise = null;

// Solo en la versión compilada: en desarrollo, Vite y un service worker se estorban.
export function registerServiceWorker() {
  if (!swSupported || !import.meta.env.PROD) return null;
  regPromise ||= navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch((e) => {
    console.warn('No se pudo registrar el service worker', e);
    return null;
  });
  return regPromise;
}

async function registration() {
  if (!swSupported) return null;
  if (!regPromise && !import.meta.env.PROD) return null;
  await registerServiceWorker();
  return navigator.serviceWorker.ready;
}

// ---------- Suscripción ----------
function urlBase64ToUint8Array(base64) {
  const pad = '='.repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + pad).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

// 'unsupported' | 'dev' | 'denied' | 'on' | 'off'
export async function pushStatus() {
  if (!pushSupported) return 'unsupported';
  if (!import.meta.env.PROD) return 'dev';
  if (Notification.permission === 'denied') return 'denied';
  const reg = await registration();
  const sub = await reg?.pushManager.getSubscription();
  return sub ? 'on' : 'off';
}

export async function subscribePush() {
  if (!pushSupported) throw new Error('Este navegador no admite notificaciones push. En iPhone, primero instala la app (Compartir → Agregar a inicio).');
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') throw new Error('El navegador bloqueó las notificaciones. Actívalas en los ajustes del sitio.');
  const reg = await registration();
  if (!reg) throw new Error('El service worker no está disponible (solo funciona en la versión publicada con HTTPS).');
  const { publicKey } = await api.get('/push/key');
  let sub = await reg.pushManager.getSubscription();
  // Si la llave del servidor cambió, la suscripción vieja ya no sirve
  if (sub && sub.options?.applicationServerKey) {
    const cur = btoa(String.fromCharCode(...new Uint8Array(sub.options.applicationServerKey))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    if (cur !== publicKey) { await sub.unsubscribe().catch(() => {}); sub = null; }
  }
  sub ||= await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(publicKey) });
  await api.post('/push/subscribe', { subscription: sub.toJSON() });
  office.pushOn = true;
  return sub;
}

export async function unsubscribePush() {
  office.pushOn = false;
  if (!pushSupported) return;
  const reg = await (regPromise ? navigator.serviceWorker.ready : navigator.serviceWorker.getRegistration());
  const sub = await reg?.pushManager.getSubscription();
  if (!sub) return;
  await api.post('/push/unsubscribe', { endpoint: sub.endpoint }).catch(() => {});
  await sub.unsubscribe().catch(() => {});
}

// Al entrar: si este dispositivo ya estaba suscrito, se vuelve a registrar en el servidor
// (por si cambió de cuenta o la base de datos se restauró).
export async function syncPush() {
  try {
    if ((await pushStatus()) !== 'on') return;
    const reg = await registration();
    const sub = await reg.pushManager.getSubscription();
    await api.post('/push/subscribe', { subscription: sub.toJSON() });
    office.pushOn = true;
  } catch { /* sin conexión o sin permiso */ }
}

// ---------- Abrir lo que se tocó en una notificación ----------
export function openFromUrl(href) {
  let url;
  try { url = new URL(href, window.location.origin); } catch { return; }
  const conv = url.searchParams.get('conv');
  const view = url.searchParams.get('view');
  if (conv && /^[cd]:\d+$/.test(conv)) office.openConv(conv);
  else if (view === 'calendar') office.set({ view: 'calendar' });
  else if (view === 'birthdays') office.set({ modal: { type: 'birthdays' } });
  else if (view === 'achievements') office.set({ modal: { type: 'achievements' } });
  else if (view === 'santa') office.set({ modal: { type: 'santa' } });
}

// Se llama cuando la oficina ya cargó
export function handleLaunchUrl() {
  const { search } = window.location;
  if (!/[?&](conv|view)=/.test(search)) return;
  openFromUrl(window.location.href);
  window.history.replaceState(null, '', window.location.pathname);
}

if (swSupported) {
  navigator.serviceWorker.addEventListener('message', (e) => {
    if (e.data?.type === 'nuvora:open') openFromUrl(e.data.url);
  });
}

// ---------- Instalar la app ----------
let deferredPrompt = null;
const installListeners = new Set();
const emitInstall = () => installListeners.forEach((fn) => fn());

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    emitInstall();
  });
  window.addEventListener('appinstalled', () => {
    deferredPrompt = null;
    emitInstall();
  });
}

export const isStandalone = () => typeof window !== 'undefined'
  && (window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone === true);

export const isIOS = () => typeof navigator !== 'undefined'
  && (/iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1));

// 'installed' | 'prompt' (Android/escritorio) | 'ios' (instrucciones) | 'none'
export function installState() {
  if (isStandalone()) return 'installed';
  if (deferredPrompt) return 'prompt';
  if (isIOS()) return 'ios';
  return 'none';
}

export function onInstallChange(fn) {
  installListeners.add(fn);
  return () => installListeners.delete(fn);
}

export async function promptInstall() {
  if (!deferredPrompt) return false;
  const p = deferredPrompt;
  deferredPrompt = null;
  p.prompt();
  const { outcome } = await p.userChoice;
  emitInstall();
  return outcome === 'accepted';
}
