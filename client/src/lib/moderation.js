// Moderación en el cliente: a quién bloqueé (no veo sus mensajes), avisos de silencio,
// expulsión o suspensión, y reportes nuevos para los admins.
import { api } from './api.js';

let blocked = new Set();
export const isBlocked = (id) => blocked.has(Number(id));

function setBlocked(store, list) {
  blocked = new Set((list || []).map(Number));
  store.set({ blocked: [...blocked] });
}

export const fmtUntil = (until) => (until == null ? 'de forma permanente'
  : `hasta el ${new Date(until).toLocaleString('es-MX', { dateStyle: 'medium', timeStyle: 'short' })}`);

// ¿Mensaje de alguien que bloqueé? (los DMs ni siquiera llegan; esto cubre los canales)
export function hideMessage(m) {
  return !!m && isBlocked(m.userId);
}

export function initModeration(store, s) {
  const load = () => api.get('/me/moderation').then((r) => {
    setBlocked(store, r.blocked);
    store.set({ muted: r.mute });
  }).catch(() => {});
  s.on('connect', load);

  s.on('moderation:blocks', ({ blocked: list }) => setBlocked(store, list));
  s.on('moderation:notice', ({ text }) => store.toast({ title: text, kind: 'error' }));
  s.on('moderation:mic-off', () => { try { store.media?.setMic(false); } catch { /* sin micrófono */ } });
  s.on('moderation', (m) => {
    const why = m.reason ? ` Motivo: ${m.reason}` : '';
    if (m.kind === 'mute') {
      store.set({ muted: { until: m.until, reason: m.reason } });
      try { store.media?.setMic(false); } catch { /* sin micrófono */ }
      store.toast({ title: `🔇 Un admin te silenció ${fmtUntil(m.until)}. No puedes usar el chat ni el micrófono.${why}`, kind: 'error', duration: 12e3 });
    } else if (m.kind === 'unmute') {
      store.set({ muted: null });
      store.toast({ title: '🔊 Ya puedes volver a hablar y escribir.' });
    } else if (m.kind === 'kick') {
      store.kicked = true;
      store.toast({ title: `🚪 Un admin te sacó de la oficina. Podrás volver ${fmtUntil(m.until)}.${why}`, kind: 'error', duration: 120e3, action: { label: 'Volver a entrar', run: () => window.location.reload() } });
    } else if (m.kind === 'ban') {
      store.kicked = true;
      store.toast({ title: `⛔ ${m.message || 'Tu cuenta fue suspendida.'}`, kind: 'error', duration: 60e3 });
      setTimeout(() => window.location.reload(), 6000);
    }
  });
  s.on('connect_error', (e) => {
    if (e.message === 'kicked') store.toast({ title: '🚪 Te sacaron de la oficina hace poco. Intenta entrar de nuevo en unos minutos.', kind: 'error', duration: 15e3 });
    if (e.message === 'banned') window.location.reload();
    if (e.message === 'too-many-tabs') store.toast({ title: 'Tienes la oficina abierta en demasiadas pestañas. Cierra alguna.', kind: 'error', duration: 15e3 });
    if (e.message === 'too-many-connections') store.toast({ title: 'Demasiadas conexiones desde tu red. Intenta en un momento.', kind: 'error', duration: 15e3 });
  });
  // Admins: aviso de reporte nuevo
  s.on('moderation:report', (r) => {
    const who = store.state.users[r.targetId]?.displayName || 'alguien';
    store.toast({ title: `🚩 Nuevo reporte contra ${who}: ${r.reasonLabel}`, duration: 15e3, action: { label: 'Ver', run: () => store.set({ modal: { type: 'prefs', section: 'moderation' } }) } });
  });
}

// Acciones de la persona
export async function blockUser(store, id, on) {
  const r = on ? await api.put(`/me/blocks/${id}`) : await api.del(`/me/blocks/${id}`);
  setBlocked(store, r.blocked);
  return r;
}
export const reportUser = (body) => api.post('/reports', body);
export const moderate = (userId, action, extra = {}) => api.post(`/admin/moderation/${userId}`, { action, ...extra });
