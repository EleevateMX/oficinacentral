// Logros: caché pequeña de insignias por persona y aviso con confeti al ganar una.
import { api } from './api.js';
import { confetti } from './confetti.js';
import { playSound } from './sounds.js';
import { ACHIEVEMENT_BY_ID, tierLabel } from '@shared/achievements.js';

const cache = new Map(); // userId -> { at, promise }

export function fetchBadges(userId, { fresh = false } = {}) {
  const c = cache.get(userId);
  if (!fresh && c && Date.now() - c.at < 60e3) return c.promise;
  const promise = api.get(`/achievements/${userId}`).then((r) => r.badges).catch((e) => { cache.delete(userId); throw e; });
  cache.set(userId, { at: Date.now(), promise });
  return promise;
}

export const forgetBadges = (userId) => cache.delete(userId);

export function badgeTitle(id, tier) {
  const a = ACHIEVEMENT_BY_ID[id];
  if (!a) return 'Logro';
  const lvl = tierLabel(a, tier);
  return `${a.name}${lvl ? ` (${lvl})` : ''}`;
}

// Llega la notificación 'achievement' (ver server/achievements.js)
export function onAchievementNotification(office, n) {
  const a = ACHIEVEMENT_BY_ID[n.data?.id];
  if (!a) return;
  forgetBadges(office.state.me.id);
  confetti({ count: 120, duration: 3200 });
  playSound('cake', Math.max(0.3, office.state.prefs.audio.notifVolume));
  const more = n.data.count > 1 ? ` y ${n.data.count - 1} más` : '';
  office.toast({ title: `${a.emoji} ¡Nuevo logro! ${badgeTitle(a.id, n.data.tier)}${more}`, action: { label: 'Ver', run: () => office.set({ modal: { type: 'achievements' } }) }, duration: 9000 });
}
