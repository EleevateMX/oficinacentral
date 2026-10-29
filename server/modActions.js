// Acciones de moderación en un solo lugar, para la tarjeta de la persona, Preferencias → Moderación
// y los botones del canal de moderación de Discord:
// sacar, silenciar (todo o solo voz), sacar de la sala/voz, suspender (con o sin IP) y levantar.
// Quien modera puede ser admin o "moderador" (rol de Discord mapeado): nunca toca a un admin.
import { db, now } from './db.js';
import { audit } from './security.js';
import { destroyUserSessions } from './auth.js';
import { presence, relocate, disconnectUser, emitToUser, getIO } from './realtime.js';
import { defaultFloorId, getFloor } from './world.js';
import { hotelCtx } from './hotel.js';
import { areaAt } from '../shared/map.js';
import {
  addSanction, liftSanction, markKicked, kickUntil, KICK_MINUTES, durLabel, banMessage, cleanDisplayText, fmtUntil,
} from './moderation.js';
import { banUserIps, liftUserIpBans, ipBanList, liftIpBan, userIps, sharedIpCount } from './ipBans.js';
import { hubEmit } from './hubEvents.js';
import { onMute as voiceOnMute } from './voiceGate.js'; // corta la voz ya conectada (P2P y LiveKit)

export const MOD_ACTIONS = ['kick', 'mute', 'unmute', 'vmute', 'unvmute', 'move', 'ban', 'ipban', 'unban', 'dismiss'];
const userRow = (id) => db.prepare('SELECT id, display_name, role, disabled FROM users WHERE id = ?').get(Number(id));

// ¿Dónde está ahora? (piso y área de la oficina, o sala del Hotel)
export function whereIs(uid) {
  uid = Number(uid);
  const h = hotelCtx.where?.get(uid);
  if (h) {
    const room = db.prepare('SELECT name FROM hotel_rooms WHERE id = ?').get(h.roomId);
    return { place: 'hotel', roomId: h.roomId, label: `Hotel · ${room?.name || `Sala #${h.roomId}`}` };
  }
  const p = presence.get(uid);
  if (!p) return { place: 'offline', label: 'Desconectado' };
  const f = getFloor(p.floorId);
  const area = f ? areaAt(f.state, p.x, p.y) : null;
  return { place: 'office', floorId: p.floorId, label: `${f?.name || f?.state?.name || 'Oficina'}${area?.name ? ` · ${area.name}` : ''}` };
}

// Saca de la sala del Hotel o lo regresa a la entrada de su piso (y le apaga el micrófono)
function moveOut(uid) {
  let moved = false;
  if (hotelCtx.where?.has(uid)) { hotelCtx.leaveRoom(uid, 'kick'); moved = true; }
  const p = presence.get(uid);
  if (p) {
    const floorId = getFloor(p.floorId) ? p.floorId : defaultFloorId();
    relocate(uid, floorId);
    const q = presence.get(uid);
    getIO()?.emit('move', { id: uid, x: q.x, y: q.y, dir: q.dir || 'down', floorId: q.floorId, tp: true });
    moved = true;
  }
  emitToUser(uid, 'moderation:mic-off', {});
  return moved;
}

// actor: { id (HUB) o null, name, role: 'admin'|'moderator', discordId? }, source: 'hub'|'discord'
export function performModAction({ actor, targetId, action, minutes = null, reason = '', source = 'hub', ip = '', reportId = null }) {
  const t = userRow(targetId);
  if (!t) return { error: 'Usuario no encontrado', status: 404 };
  if (!MOD_ACTIONS.includes(action)) return { error: 'Acción inválida', status: 400 };
  if (actor?.id && t.id === actor.id) return { error: 'No puedes aplicarte una sanción a ti', status: 400 };
  if (t.role === 'admin' && !['unmute', 'unvmute', 'unban', 'dismiss'].includes(action)) {
    return { error: actor?.role === 'admin' ? 'No se puede sancionar a otro administrador. Quítale el rol primero.' : 'Un moderador no puede actuar sobre un administrador.', status: 403 };
  }
  if (minutes != null && (!Number.isFinite(Number(minutes)) || minutes < 1 || minutes > 525600)) return { error: 'Duración inválida', status: 400 };
  reason = cleanDisplayText(reason, 200);
  const who = t.display_name;
  const by = actor?.id || null;
  const tag = source === 'discord' ? ' (desde Discord)' : '';
  const log = (text, data = {}) => {
    audit({ actor: by, action: `${text}${tag}`, target: `user:${t.id}`, data: { reason, minutes, source, actor: actor?.name, discordId: actor?.discordId, ...data }, ip });
    if (action !== 'dismiss') hubEmit('mod:sanction', { text, actorName: actor?.name || 'Moderación', targetId: t.id, targetName: who, reason, source });
    return text;
  };
  let text;
  let extra = {};
  switch (action) {
    case 'kick': {
      const mins = Math.min(minutes ?? KICK_MINUTES, 120);
      markKicked(t.id, mins);
      text = log(`Sacó de la oficina a ${who} por ${mins} min${reason ? ` (${reason})` : ''}`);
      emitToUser(t.id, 'moderation', { kind: 'kick', until: kickUntil(t.id), reason });
      setTimeout(() => disconnectUser(t.id), 300);
      extra = { until: kickUntil(t.id) };
      break;
    }
    case 'mute': {
      const m = addSanction(t.id, 'mute', { minutes: minutes ?? 60, reason, by });
      text = log(`Silenció a ${who} ${durLabel(minutes ?? 60)}${reason ? ` (${reason})` : ''}`);
      emitToUser(t.id, 'moderation', { kind: 'mute', until: m.until, reason });
      voiceOnMute(t.id, true);
      emitToUser(t.id, 'moderation:mic-off', {});
      extra = { until: m.until };
      break;
    }
    case 'vmute': {
      const m = addSanction(t.id, 'vmute', { minutes: minutes ?? 60, reason, by });
      text = log(`Silenció en voz a ${who} ${durLabel(minutes ?? 60)}${reason ? ` (${reason})` : ''}`);
      const p = presence.get(t.id);
      if (p) p.mic = false;
      emitToUser(t.id, 'moderation', { kind: 'vmute', until: m.until, reason });
      voiceOnMute(t.id, true);
      emitToUser(t.id, 'moderation:mic-off', {});
      extra = { until: m.until };
      break;
    }
    case 'unmute': liftSanction(t.id, 'mute', by); text = log(`Quitó el silencio a ${who}`); emitToUser(t.id, 'moderation', { kind: 'unmute' }); voiceOnMute(t.id, false); break;
    case 'unvmute': liftSanction(t.id, 'vmute', by); text = log(`Quitó el silencio de voz a ${who}`); emitToUser(t.id, 'moderation', { kind: 'unvmute' }); voiceOnMute(t.id, false); break;
    case 'move': {
      const was = whereIs(t.id);
      if (!moveOut(t.id)) return { error: `${who} no está conectado`, status: 409 };
      text = log(`Sacó a ${who} de la sala o llamada (${was.label})`);
      emitToUser(t.id, 'moderation', { kind: 'move', reason });
      break;
    }
    case 'ban':
    case 'ipban': {
      const b = addSanction(t.id, 'ban', { minutes, reason, by });
      let ips = [];
      if (action === 'ipban') ips = banUserIps(t.id, { minutes, note: reason || `Suspensión de ${who}`, by });
      text = log(`Suspendió a ${who} ${durLabel(minutes)}${action === 'ipban' ? ` y bloqueó su IP (${ips.length})` : ''}${reason ? ` (${reason})` : ''}`, { ips: ips.length });
      emitToUser(t.id, 'moderation', { kind: 'ban', until: b.until, reason, message: banMessage(b) });
      destroyUserSessions(t.id);
      setTimeout(() => disconnectUser(t.id), 300);
      extra = { until: b.until, ipBans: ips.length };
      break;
    }
    case 'unban': {
      liftSanction(t.id, 'ban', by);
      const n = liftUserIpBans(t.id, by);
      text = log(`Levantó la suspensión de ${who}${n ? ' y el bloqueo de su IP' : ''}`);
      break;
    }
    case 'dismiss': {
      if (reportId) db.prepare("UPDATE reports SET status = 'descartado', handled_by = ?, handled_at = ? WHERE id = ?").run(by, now(), Number(reportId));
      text = log(`Descartó un reporte contra ${who}`);
      break;
    }
    default: return { error: 'Acción inválida', status: 400 };
  }
  if (reportId && action !== 'dismiss') {
    db.prepare("UPDATE reports SET status = 'revisado', handled_by = ?, handled_at = ? WHERE id = ? AND status = 'nuevo'").run(by, now(), Number(reportId));
  }
  return { ok: true, text, ...extra };
}

export const describeUntil = fmtUntil;

// ---------- Rutas ----------
// isModerator(uid): capacidad "moderador de HUB" (rol de Discord mapeado). Puede moderar a miembros,
// no a admins, y no cambia configuración.
export function registerModActionRoutes(api, admin, { fail, wrap, perUser, isModerator = () => false }) {
  const canModerate = (u) => u?.role === 'admin' || isModerator(u?.id);

  api.get('/mod/me', (req, res) => res.json({ moderator: canModerate(req.user), admin: req.user.role === 'admin' }));

  api.post('/mod/:userId', perUser('modx', 60, 60e3), wrap((req, res) => {
    if (!canModerate(req.user)) return fail(res, 403, 'Solo para el equipo de moderación');
    const raw = req.body?.minutes;
    const minutes = raw == null || raw === '' ? null : Number(raw);
    const action = String(req.body?.action || '');
    // Solo un admin puede banear la IP o suspender para siempre
    if (req.user.role !== 'admin' && (action === 'ipban' || ((action === 'ban') && minutes == null))) return fail(res, 403, 'Solo un admin puede bloquear IPs o suspender para siempre');
    const r = performModAction({
      actor: { id: req.user.id, name: req.user.display_name, role: req.user.role === 'admin' ? 'admin' : 'moderator' },
      targetId: Number(req.params.userId), action, minutes, reason: req.body?.reason, ip: req.ip, reportId: req.body?.reportId ? Number(req.body.reportId) : null,
    });
    if (r.error) return fail(res, r.status || 400, r.error);
    res.json(r);
  }));

  // IPs (en hash) de una persona y baneos de IP
  admin.get('/ips/:userId', (req, res) => res.json({ ips: userIps(Number(req.params.userId)), shared: sharedIpCount(Number(req.params.userId)) }));
  admin.get('/ipbans', (req, res) => res.json({ bans: ipBanList() }));
  admin.post('/ipbans', wrap((req, res) => {
    const t = userRow(req.body?.userId);
    if (!t) return fail(res, 404, 'Usuario no encontrado');
    if (t.role === 'admin') return fail(res, 400, 'No se puede bloquear la IP de un administrador');
    const days = req.body?.days == null || req.body.days === '' ? null : Number(req.body.days);
    if (days != null && ![1, 7].includes(days)) return fail(res, 400, 'Duración inválida (1 día, 7 días o permanente)');
    const note = cleanDisplayText(req.body?.note, 200);
    const ids = banUserIps(t.id, { minutes: days == null ? null : days * 1440, note, by: req.user.id });
    if (!ids.length) return fail(res, 409, `No hay IPs recientes de ${t.display_name}`);
    audit({ actor: req.user.id, action: `Bloqueó la IP de ${t.display_name} ${durLabel(days == null ? null : days * 1440)}${note ? ` (${note})` : ''}`, target: `user:${t.id}`, data: { ips: ids.length, days }, ip: req.ip });
    hubEmit('mod:sanction', { text: `Bloqueó la IP de ${t.display_name} ${durLabel(days == null ? null : days * 1440)}`, actorName: req.user.display_name, targetId: t.id, targetName: t.display_name, reason: note });
    setTimeout(() => disconnectUser(t.id), 200);
    res.json({ ok: true, bans: ipBanList() });
  }));
  admin.delete('/ipbans/:id', wrap((req, res) => {
    const row = db.prepare('SELECT * FROM ip_bans WHERE id = ?').get(Number(req.params.id));
    if (!row || !liftIpBan(row.id, req.user.id)) return fail(res, 404, 'Ese bloqueo no existe o ya se levantó');
    audit({ actor: req.user.id, action: `Levantó un bloqueo de IP (${row.masked || row.ip_hash.slice(0, 10)})`, target: row.user_id ? `user:${row.user_id}` : '', ip: req.ip });
    res.json({ ok: true, bans: ipBanList() });
  }));
}
