// Placas: catálogo (fijo + personalizadas), caché por persona, "🔴 En vivo" de streamers
// y avisos. Se engancha al store con initBadges(office, socket) (ver store.js).
import { useEffect, useState, useSyncExternalStore } from 'react';
import { api } from './api.js';
import { confetti } from './confetti.js';
import { playSound } from './sounds.js';
import { BADGE_BY_ID, CATEGORY_BY_ID, PLATFORM_BY_ID, tierName } from '@shared/badges.js';
import { TIER_NAMES } from '@shared/achievements.js';

const subs = new Set();
const state = { custom: {}, live: new Map(), v: 0 };
const bump = () => { state.v++; for (const f of subs) f(); };
const subscribe = (f) => { subs.add(f); return () => subs.delete(f); };
export const useBadgesVersion = () => useSyncExternalStore(subscribe, () => state.v);

export function badgeDef(id) {
  return BADGE_BY_ID[id] || state.custom[id] || null;
}
export async function loadCatalog() {
  try {
    const { custom } = await api.get('/badges/catalog');
    state.custom = Object.fromEntries(custom.map((b) => [b.id, b]));
    bump();
  } catch { /* sin red */ }
}

// ---------- Placas por persona ----------
const cache = new Map(); // userId -> { at, promise }
export function fetchUserBadges(userId, { fresh = false } = {}) {
  const c = cache.get(userId);
  if (!fresh && c && Date.now() - c.at < 30e3) return c.promise;
  const promise = api.get(`/badges/user/${userId}`).catch((e) => { cache.delete(userId); throw e; });
  cache.set(userId, { at: Date.now(), promise });
  return promise;
}
export const forgetUserBadges = (userId) => { cache.delete(userId); bump(); };
export function useUserBadges(userId) {
  const v = useBadgesVersion();
  const [data, setData] = useState(null);
  useEffect(() => {
    let alive = true;
    if (userId) fetchUserBadges(userId).then((d) => alive && setData(d)).catch(() => alive && setData({ owned: [], worn: [], channels: [], live: null }));
    return () => { alive = false; };
  }, [userId, v]);
  return data;
}

// Cómo se ganó (para el tooltip)
const fmtDate = (ts) => new Intl.DateTimeFormat('es-MX', { day: 'numeric', month: 'short', year: 'numeric' }).format(ts);
export function howEarned(b, users = {}) {
  if (!b?.source) return '';
  const when = b.grantedAt ? ` · ${fmtDate(b.grantedAt)}` : '';
  if (b.source === 'achievement') return `Logro de la oficina${b.tier ? ` (${TIER_NAMES[b.tier - 1]})` : ''}${when}`;
  if (b.source === 'claim') return `Placa de fan: la eligió${when}`;
  if (b.source === 'verify') return `Canal verificado${b.note ? ` (${b.note.replace(/^Canal /, '')})` : ''}${when}`;
  const by = b.grantedByName || users[b.grantedBy]?.displayName;
  return `Otorgada${by ? ` por ${by}` : ''}${when}${b.note ? ` · “${b.note}”` : ''}`;
}
export function badgeTitle(id, tier) {
  const d = badgeDef(id);
  if (!d) return 'Placa';
  const t = tierName(d, tier);
  return `${d.name}${t ? ` (${t})` : ''}`;
}
export const categoryHow = (id) => CATEGORY_BY_ID[badgeDef(id)?.category]?.how || '';

// ---------- En vivo ----------
export const liveOf = (userId) => {
  const l = state.live.get(Number(userId));
  return l && l.expiresAt > Date.now() ? l : null;
};
export const useLive = (userId) => { useBadgesVersion(); return liveOf(userId); };
export async function loadLive() {
  try {
    const { live } = await api.get('/badges/live');
    state.live = new Map(live.map((l) => [l.userId, l]));
    bump();
  } catch { /* sin red */ }
}

// Etiqueta LIVE junto al nombre en el mapa 2D (la llama MapView al dibujar las etiquetas)
export function drawLiveTag(ctx, userId, x, y) {
  const l = liveOf(userId);
  if (!l) return;
  ctx.save();
  ctx.font = '800 9px "Public Sans", system-ui, sans-serif';
  const label = 'LIVE';
  const w = Math.round(ctx.measureText(label).width) + 17;
  const X = Math.round(x), Y = Math.round(y - 8);
  ctx.fillStyle = '#E2252B';
  ctx.beginPath(); ctx.roundRect(X, Y, w, 16, 4); ctx.fill();
  ctx.fillStyle = PLATFORM_BY_ID[l.platform]?.color || '#fff';
  ctx.beginPath(); ctx.arc(X + 6.5, Y + 8, 2.6, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
  ctx.fillText(label, X + 12, Y + 8.5);
  ctx.restore();
}

// ---------- Socket y avisos ----------
export function initBadges(office, s) {
  loadCatalog();
  loadLive();
  s.on('badges:catalog', () => loadCatalog());
  s.on('badges:worn', (m) => forgetUserBadges(m.userId));
  s.on('badges:mine', (m) => forgetUserBadges(m.userId));
  s.on('badges:live', (m) => {
    if (m.live) state.live.set(m.userId, m.live); else state.live.delete(m.userId);
    forgetUserBadges(m.userId);
  });
  s.on('badges:live:announce', (m) => {
    if (m.userId === office.state.me?.id) return;
    const p = PLATFORM_BY_ID[m.platform]?.name || m.platform;
    office.toast({ title: `🔴 ${m.name} está en vivo en ${p}`, action: { label: `Ver en ${p}`, run: () => window.open(m.url, '_blank', 'noopener') }, duration: 10000 });
  });
  s.on('connect', () => loadLive());
  // Se vence solo (6 h): repinta de vez en cuando
  if (!state.timer) state.timer = setInterval(() => { for (const [id, l] of state.live) if (l.expiresAt <= Date.now()) { state.live.delete(id); bump(); } }, 60e3);
}

// Notificación 'badge' (server/badges.js → notify)
export function onBadgeNotification(office, n) {
  forgetUserBadges(office.state.me.id);
  const d = badgeDef(n.data?.id);
  confetti({ count: 90, duration: 2600 });
  playSound('cake', Math.max(0.3, office.state.prefs.audio.notifVolume));
  office.toast({ title: `🏅 ¡Nueva placa! ${d?.name || n.data?.name || ''}`, action: { label: 'Ver', run: () => office.set({ modal: { type: 'badges' } }) }, duration: 9000 });
}
