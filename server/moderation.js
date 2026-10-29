// Moderación de la comunidad: silenciar (sin chat ni voz), sacar de la oficina,
// suspender (temporal o permanente), bloquear a alguien (no ves sus mensajes, DMs ni llamadas)
// y reportes que llegan a los admins. Cada acción de admin queda en el registro de actividad.
import { db, now } from './db.js';
import { audit, originAllowed, requestHost } from './security.js';
import { guardSocket, admitSocket, trackSocketIp, socketIp } from './ratelimit.js';
import { isIpBanned, recordUserIp } from './ipBans.js'; // baneo por IP (hash con sal)
import { hubEmit } from './hubEvents.js'; // avisos al canal de moderación de Discord

db.exec(`
CREATE TABLE IF NOT EXISTS sanctions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  until INTEGER,
  reason TEXT NOT NULL DEFAULT '',
  by_id INTEGER,
  created_at INTEGER NOT NULL,
  lifted_at INTEGER,
  lifted_by INTEGER
);
CREATE INDEX IF NOT EXISTS idx_sanctions_user ON sanctions(user_id, kind, lifted_at);
CREATE TABLE IF NOT EXISTS user_blocks (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  blocked_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, blocked_id)
);
CREATE TABLE IF NOT EXISTS reports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  reporter_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  target_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  message_id INTEGER,
  reason TEXT NOT NULL,
  text TEXT NOT NULL DEFAULT '',
  snapshot TEXT,
  status TEXT NOT NULL DEFAULT 'nuevo',
  handled_by INTEGER,
  handled_at INTEGER,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_reports_status ON reports(status, id);
`);

export const REPORT_REASONS = { spam: 'Spam o flood', acoso: 'Acoso o insultos', suplantacion: 'Se hace pasar por otra persona', contenido: 'Contenido inapropiado', trampas: 'Trampas o abuso de fallas', otro: 'Otro' };

// ---------- Sanciones ----------
const cache = new Map(); // `${uid}:${kind}` -> fila activa o null
const activeRow = (uid, kind) => db.prepare(`SELECT * FROM sanctions WHERE user_id = ? AND kind = ? AND lifted_at IS NULL
  AND (until IS NULL OR until > ?) ORDER BY id DESC LIMIT 1`).get(uid, kind, now()) || null;

function active(uid, kind) {
  uid = Number(uid);
  if (!Number.isInteger(uid)) return null;
  const k = `${uid}:${kind}`;
  let r = cache.get(k);
  if (r === undefined) { r = activeRow(uid, kind); cache.set(k, r); }
  if (r && r.until != null && r.until <= now()) { cache.set(k, null); return null; }
  return r;
}
export const muteOf = (uid) => active(uid, 'mute');
export const banOf = (uid) => active(uid, 'ban');
export const isMuted = (uid) => !!muteOf(uid);
export const isBanned = (uid) => !!banOf(uid);
// Silencio solo de voz (el chat sigue): sin micrófono ni señalización WebRTC. LiveKit también lo consulta.
export const vmuteOf = (uid) => active(uid, 'vmute');
export const isVoiceMuted = (uid) => !!vmuteOf(uid) || isMuted(uid);

const sanctionOut = (r) => r && ({ id: r.id, userId: r.user_id, kind: r.kind, until: r.until, permanent: r.until == null, reason: r.reason, byId: r.by_id, createdAt: r.created_at });

export function fmtUntil(until) {
  if (until == null) return 'de forma permanente';
  // Relativo (cada quien tiene su zona horaria): "por 25 min más", "por 3 h más", "por 2 días más"
  const min = Math.max(1, Math.ceil((until - now()) / 60e3));
  if (min < 60) return `por ${min} min más`;
  const h = Math.round(min / 60);
  if (h < 48) return `por ${h} h más`;
  return `por ${Math.round(h / 24)} días más`;
}

// Duración para el registro: "por 60 min", "por 1 día", "de forma permanente"
export function durLabel(minutes) {
  if (minutes == null) return 'de forma permanente';
  if (minutes < 60) return `por ${minutes} min`;
  if (minutes < 48 * 60) return `por ${Math.round(minutes / 60)} h`;
  return `por ${Math.round(minutes / 1440)} días`;
}

export function banMessage(row) {
  return `Tu cuenta está suspendida ${fmtUntil(row.until)}${row.reason ? ` (motivo: ${row.reason})` : ''}. Si crees que es un error, habla con un administrador.`;
}

export function addSanction(uid, kind, { minutes = null, reason = '', by = null } = {}) {
  const until = minutes == null ? null : now() + Math.round(minutes * 60e3);
  // Una sanción nueva reemplaza a la anterior del mismo tipo
  db.prepare('UPDATE sanctions SET lifted_at = ?, lifted_by = ? WHERE user_id = ? AND kind = ? AND lifted_at IS NULL').run(now(), by, uid, kind);
  db.prepare('INSERT INTO sanctions (user_id, kind, until, reason, by_id, created_at) VALUES (?, ?, ?, ?, ?, ?)').run(uid, kind, until, String(reason || '').slice(0, 200), by, now());
  cache.delete(`${uid}:${kind}`);
  return active(uid, kind);
}

export function liftSanction(uid, kind, by = null) {
  const r = db.prepare('UPDATE sanctions SET lifted_at = ?, lifted_by = ? WHERE user_id = ? AND kind = ? AND lifted_at IS NULL').run(now(), by, uid, kind);
  cache.delete(`${uid}:${kind}`);
  return r.changes > 0;
}

// Sacar de la oficina: no puede volver a conectarse durante unos minutos (en memoria)
const kicked = new Map(); // uid -> hasta
export const KICK_MINUTES = 5;
export function kickUntil(uid) {
  const t = kicked.get(Number(uid));
  if (!t) return 0;
  if (t <= Date.now()) { kicked.delete(Number(uid)); return 0; }
  return t;
}
export function markKicked(uid, minutes = KICK_MINUTES) { kicked.set(Number(uid), Date.now() + minutes * 60e3); }

// ---------- Bloqueos ----------
let blocks = null; // uid -> Set(bloqueados)
function loadBlocks() {
  if (blocks) return blocks;
  blocks = new Map();
  for (const r of db.prepare('SELECT user_id, blocked_id FROM user_blocks').all()) {
    if (!blocks.has(r.user_id)) blocks.set(r.user_id, new Set());
    blocks.get(r.user_id).add(r.blocked_id);
  }
  return blocks;
}
export const blocksOf = (uid) => loadBlocks().get(Number(uid)) || new Set();
// ¿viewer bloqueó a author?
export const hasBlocked = (viewer, author) => blocksOf(viewer).has(Number(author));
// Cualquiera de los dos bloqueó al otro (para llamadas, voz y acciones de pareja)
export const eitherBlocked = (a, b) => hasBlocked(a, b) || hasBlocked(b, a);

export function setBlock(uid, target, on) {
  uid = Number(uid); target = Number(target);
  if (on) db.prepare('INSERT OR IGNORE INTO user_blocks (user_id, blocked_id, created_at) VALUES (?, ?, ?)').run(uid, target, now());
  else db.prepare('DELETE FROM user_blocks WHERE user_id = ? AND blocked_id = ?').run(uid, target);
  const m = loadBlocks();
  if (!m.has(uid)) m.set(uid, new Set());
  if (on) m.get(uid).add(target); else m.get(uid).delete(target);
}

// ---------- Nombres: sin caracteres invisibles ni hacerse pasar por admin ----------
const ch = (c) => String.fromCharCode(c);
// Controles, ancho cero y marcas de dirección (RTL override sirve para disfrazar nombres)
const INVISIBLE = new RegExp(`[${ch(0)}-${ch(31)}${ch(127)}-${ch(159)}${ch(0xad)}${ch(0x115f)}${ch(0x1160)}${ch(0x180e)}${ch(0x200b)}-${ch(0x200f)}${ch(0x2028)}-${ch(0x202e)}${ch(0x2060)}-${ch(0x206f)}${ch(0x3164)}${ch(0xfeff)}${ch(0xffa0)}]`, 'g');
export function cleanDisplayText(s, max = 40) {
  return String(s ?? '').normalize('NFC').replace(INVISIBLE, '').replace(/\s+/g, ' ').trim().slice(0, max);
}
const RESERVED = /(admin|administrador|administradora|moderador|moderadora|sistema|system|soporte\s*oficial|staff\s*oficial)/;
// Nombres que solo puede usar un admin (para que nadie se haga pasar por el equipo)
export function impersonates(name) {
  const plain = String(name || '').normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/[0@]/g, 'o').replace(/[1!|]/g, 'i').replace(/3/g, 'e').replace(/4/g, 'a').replace(/5/g, 's').replace(/[^a-z\s]/g, '');
  return RESERVED.test(plain) || RESERVED.test(plain.replace(/\s+/g, ''));
}

// ---------- Compuerta de eventos del socket ----------
// Silencio: no chat ni voz. Bloqueos: nada dirigido a quien te bloqueó (ni tú a quien bloqueaste).
const MUTED_EVENTS = new Set(['room-msg', 'hotel:chat', 'hotel:typing', 'notes:segment', 'react', 'rtc', 'jukebox:add']);
const TARGET_KEY = {
  rtc: 'to', emote: 'target', 'hotel:chat': 'to', 'hotel:trade:request': 'userId', 'hotel:follow': 'userId',
  'hotel:respect': 'userId', 'hotel:mech:give': 'to', 'pet:action': 'owner', clip: 'sharer', 'room:admit': 'userId',
};
export function socketGate(userId, { notify = null } = {}) {
  let lastNotice = 0;
  const tell = (text) => { const t = Date.now(); if (t - lastNotice > 5000) { lastNotice = t; notify?.(text); } };
  return (event, args) => {
    const m = args[0];
    const mute = muteOf(userId);
    if (mute) {
      if (MUTED_EVENTS.has(event)) {
        if (event !== 'rtc' && event !== 'hotel:typing') tell(`🔇 Estás silenciado ${fmtUntil(mute.until)}. No puedes usar el chat ni el micrófono.`);
        return false;
      }
      if (event === 'state' && m && typeof m === 'object' && m.mic === true) m.mic = false;
    } else if (vmuteOf(userId)) {
      if (event === 'rtc' || event === 'notes:segment') return false;
      if (event === 'state' && m && typeof m === 'object' && m.mic === true) { m.mic = false; tell('🔇 Un admin te silenció en voz. Puedes seguir escribiendo en el chat.'); }
    }
    const k = TARGET_KEY[event];
    if (k && m && typeof m === 'object') {
      const target = Number(m[k]);
      if (Number.isInteger(target) && target !== userId && eitherBlocked(userId, target)) return false;
    }
    if (event === 'hotel:invite' && m && Array.isArray(m.userIds)) m.userIds = m.userIds.filter((id) => !eitherBlocked(userId, Number(id)));
    return true;
  };
}

// ---------- Sockets: quién entra y qué puede mandar ----------
// En io.use(): origen del navegador, suspensión, "sacado de la oficina" y tope de conexiones.
export function socketAdmission(socket, user, userSockets) {
  const h = socket.handshake.headers;
  if (!originAllowed(h.origin, requestHost(h))) return 'bad-origin';
  if (isBanned(user.id)) return 'banned';
  if (kickUntil(user.id)) return 'kicked';
  const ip = socketIp(socket);
  if (user.role !== 'admin' && isIpBanned(ip)) return 'ip-banned';
  const why = admitSocket(ip, userSockets);
  if (why) return why;
  socket.data.ip = ip;
  recordUserIp(user.id, ip);
  return null;
}

// Al conectar (antes de registrar eventos): errores atrapados, límites de velocidad y moderación
export function socketShield(socket, userId) {
  if (socket.data.ip) trackSocketIp(socket, socket.data.ip);
  guardSocket(socket, {
    gate: socketGate(userId, { notify: (text) => socket.emit('moderation:notice', { text }) }),
    onAbuse: (event) => {
      console.warn(`[seguridad] socket de #${userId} desconectado por exceso de eventos (${event})`);
      try { audit({ actor: userId, action: `Desconectado automáticamente por exceso de eventos (${event})`, target: `user:${userId}`, ip: socket.data.ip || '' }); } catch { /* sin bitácora */ }
    },
  });
}

// ---------- Reportes ----------
const reportOut = (r) => ({
  id: r.id, reporterId: r.reporter_id, targetId: r.target_id, messageId: r.message_id, reason: r.reason, reasonLabel: REPORT_REASONS[r.reason] || r.reason,
  text: r.text, snapshot: r.snapshot ? JSON.parse(r.snapshot) : null, status: r.status, handledBy: r.handled_by, handledAt: r.handled_at, createdAt: r.created_at,
});

// ---------- Rutas ----------
// deps: { fail, wrap, perUser, emitToUser, emitToAdmins, disconnectUser, destroyUserSessions, alert }
export function registerModerationRoutes(api, admin, deps) {
  const { fail, wrap, perUser, emitToUser, emitToAdmins, disconnectUser, destroyUserSessions, alert } = deps;
  const userRow = (id) => db.prepare('SELECT id, display_name, role, disabled FROM users WHERE id = ?').get(Number(id));

  // Lo mío: a quién bloqueé y si estoy silenciado
  api.get('/me/moderation', (req, res) => {
    const mute = muteOf(req.user.id);
    res.json({ blocked: [...blocksOf(req.user.id)], mute: mute ? { until: mute.until, reason: mute.reason } : null });
  });

  api.put('/me/blocks/:id', perUser('block', 30, 60e3), wrap((req, res) => {
    const t = userRow(req.params.id);
    if (!t || t.id === req.user.id) return fail(res, 400, 'Persona inválida');
    if (t.role === 'admin') return fail(res, 400, 'No puedes bloquear a un administrador. Si te está molestando, repórtalo.');
    setBlock(req.user.id, t.id, true);
    emitToUser(req.user.id, 'moderation:blocks', { blocked: [...blocksOf(req.user.id)] });
    res.json({ ok: true, blocked: [...blocksOf(req.user.id)] });
  }));

  api.delete('/me/blocks/:id', wrap((req, res) => {
    setBlock(req.user.id, Number(req.params.id), false);
    emitToUser(req.user.id, 'moderation:blocks', { blocked: [...blocksOf(req.user.id)] });
    res.json({ ok: true, blocked: [...blocksOf(req.user.id)] });
  }));

  // Reportar a alguien (opcionalmente un mensaje): llega a los admins
  api.post('/reports', perUser('report', 6, 3600e3, 'Ya enviaste varios reportes. Un admin los revisará pronto.'), wrap((req, res) => {
    const t = userRow(req.body?.userId);
    if (!t || t.id === req.user.id) return fail(res, 400, 'Persona inválida');
    const reason = REPORT_REASONS[req.body?.reason] ? req.body.reason : 'otro';
    const text = cleanDisplayText(req.body?.text, 1000);
    let snapshot = null;
    let messageId = null;
    if (req.body?.messageId != null) {
      const m = db.prepare('SELECT * FROM messages WHERE id = ?').get(Number(req.body.messageId));
      // Solo mensajes que quien reporta puede ver, y que sean de la persona reportada
      const canSee = m && (m.channel_id || (m.dm_key && m.dm_key.split(':').map(Number).includes(req.user.id)));
      if (!canSee || m.user_id !== t.id) return fail(res, 400, 'Ese mensaje no se puede reportar');
      messageId = m.id;
      snapshot = JSON.stringify({ body: String(m.body).slice(0, 2000), at: m.created_at, conv: m.channel_id ? `c:${m.channel_id}` : 'dm' });
    }
    const id = Number(db.prepare('INSERT INTO reports (reporter_id, target_id, message_id, reason, text, snapshot, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(req.user.id, t.id, messageId, reason, text, snapshot, now()).lastInsertRowid);
    const row = reportOut(db.prepare('SELECT * FROM reports WHERE id = ?').get(id));
    emitToAdmins('moderation:report', row);
    hubEmit('mod:report', { ...row, reporterName: req.user.display_name, targetName: t.display_name });
    alert?.(`🚩 Reporte: ${t.display_name}`, `${REPORT_REASONS[reason]} — reportado por ${req.user.display_name}${text ? `\n${text}` : ''}`, { level: 'warn', key: `report:${id}` });
    res.json({ ok: true, id });
  }));

  // ---- Admin ----
  admin.get('/reports', (req, res) => {
    const st = ['nuevo', 'revisado', 'descartado'].includes(req.query.status) ? req.query.status : null;
    const rows = st ? db.prepare('SELECT * FROM reports WHERE status = ? ORDER BY id DESC LIMIT 200').all(st) : db.prepare('SELECT * FROM reports ORDER BY id DESC LIMIT 200').all();
    const counts = Object.fromEntries(db.prepare('SELECT status, COUNT(*) AS n FROM reports GROUP BY status').all().map((r) => [r.status, r.n]));
    res.json({ reports: rows.map(reportOut), counts });
  });

  admin.patch('/reports/:id', wrap((req, res) => {
    const status = ['nuevo', 'revisado', 'descartado'].includes(req.body?.status) ? req.body.status : null;
    if (!status) return fail(res, 400, 'Estado inválido');
    const r = db.prepare('SELECT * FROM reports WHERE id = ?').get(Number(req.params.id));
    if (!r) return fail(res, 404, 'Reporte no encontrado');
    db.prepare('UPDATE reports SET status = ?, handled_by = ?, handled_at = ? WHERE id = ?').run(status, req.user.id, now(), r.id);
    audit({ actor: req.user.id, action: `Marcó un reporte contra ${userRow(r.target_id)?.display_name || `#${r.target_id}`} como ${status}`, target: `report:${r.id}`, ip: req.ip });
    res.json({ ok: true });
  }));

  // Sanciones activas
  admin.get('/moderation', (req, res) => {
    const rows = db.prepare(`SELECT * FROM sanctions WHERE lifted_at IS NULL AND (until IS NULL OR until > ?) ORDER BY id DESC LIMIT 300`).all(now());
    res.json({ sanctions: rows.map(sanctionOut), kicked: [...kicked].filter(([, t]) => t > Date.now()).map(([userId, until]) => ({ userId, until })) });
  });

  // Acciones: mute | unmute | kick | ban | unban (minutes: null = permanente; solo ban)
  admin.post('/moderation/:userId', perUser('mod', 60, 60e3), wrap((req, res) => {
    const t = userRow(req.params.userId);
    if (!t) return fail(res, 404, 'Usuario no encontrado');
    if (t.id === req.user.id) return fail(res, 400, 'No puedes aplicarte una sanción a ti');
    const action = String(req.body?.action || '');
    if (t.role === 'admin' && !['unmute', 'unban'].includes(action)) return fail(res, 400, 'No se puede sancionar a otro administrador. Quítale el rol primero.');
    const reason = cleanDisplayText(req.body?.reason, 200);
    const rawMin = req.body?.minutes;
    const minutes = rawMin == null || rawMin === '' ? null : Number(rawMin);
    if (minutes != null && (!Number.isFinite(minutes) || minutes < 1 || minutes > 525600)) return fail(res, 400, 'Duración inválida');
    const who = t.display_name;
    const log = (text, data) => {
      audit({ actor: req.user.id, action: text, target: `user:${t.id}`, data: { reason, minutes, ...data }, ip: req.ip });
      hubEmit('mod:sanction', { text, actorName: req.user.display_name, targetId: t.id, targetName: who, reason });
    };
    if (action === 'mute') {
      const m = addSanction(t.id, 'mute', { minutes: minutes ?? 60, reason, by: req.user.id });
      log(`Silenció a ${who} ${durLabel(minutes ?? 60)}${reason ? ` (${reason})` : ''}`);
      emitToUser(t.id, 'moderation', { kind: 'mute', until: m.until, reason });
      // Se reconecta sin micrófono (y la señalización de voz queda cortada mientras dure)
      emitToUser(t.id, 'moderation:mic-off', {});
      deps.onMute?.(t.id, true); // corta su voz ya conectada (server/voiceGate.js)
      return res.json({ ok: true, sanction: sanctionOut(m) });
    }
    if (action === 'unmute') {
      liftSanction(t.id, 'mute', req.user.id);
      log(`Quitó el silencio a ${who}`);
      emitToUser(t.id, 'moderation', { kind: 'unmute' });
      deps.onMute?.(t.id, false);
      return res.json({ ok: true });
    }
    if (action === 'kick') {
      const mins = Math.min(minutes ?? KICK_MINUTES, 120);
      markKicked(t.id, mins);
      log(`Sacó de la oficina a ${who} por ${mins} min${reason ? ` (${reason})` : ''}`);
      emitToUser(t.id, 'moderation', { kind: 'kick', until: kickUntil(t.id), reason });
      setTimeout(() => disconnectUser(t.id), 300);
      return res.json({ ok: true, until: kickUntil(t.id) });
    }
    if (action === 'ban') {
      const b = addSanction(t.id, 'ban', { minutes, reason, by: req.user.id });
      log(`Suspendió a ${who} ${durLabel(minutes)}${reason ? ` (${reason})` : ''}`);
      emitToUser(t.id, 'moderation', { kind: 'ban', until: b.until, reason, message: banMessage(b) });
      destroyUserSessions(t.id);
      setTimeout(() => disconnectUser(t.id), 300);
      return res.json({ ok: true, sanction: sanctionOut(b) });
    }
    if (action === 'unban') {
      liftSanction(t.id, 'ban', req.user.id);
      log(`Levantó la suspensión de ${who}`);
      return res.json({ ok: true });
    }
    return fail(res, 400, 'Acción inválida');
  }));
}

// Para pruebas
export const _moderation = { cache, kicked, loadBlocks: () => { blocks = null; return loadBlocks(); } };
