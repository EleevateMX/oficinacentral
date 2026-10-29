import { Server } from 'socket.io';
import { db, now } from './db.js';
import { parseCookies, userFromToken, SESSION_COOKIE } from './auth.js';
import { getFloor, defaultFloorId, setAreaClosed, isAreaClosed, closedAreaIds, floorPayload, floorOfArea, listFloors, isFloorAdminOnly } from './world.js';
import { isWalkable, nearestWalkable, canTalk, areaAt, closedRoomAt } from '../shared/map.js';
import { initGames } from './games.js';
import { EMOTES, PAIR_RANGE, cleanVariant } from '../shared/emotes.js';
import { initBoards } from './boards.js';
import { initNotes, startNotesTimer } from './notes.js';
import { initPets } from './pets.js';
import { initJukebox } from './jukebox.js';
import { onConnect as shiftOnConnect, closeShift } from './shifts.js';
import { APP_VERSION } from './version.js';
import { trackConnect, trackArea, trackDisconnect, bumpCounter } from './stats.js';
import { checkAchievements } from './achievements.js';
import { initStage, initStageIO, stageCleanup } from './stage.js';
import { initHotel, hotelCtx } from './hotel.js';
import { socketShield, socketAdmission, hasBlocked } from './moderation.js'; // límites, moderación y conexiones

let io = null;
// userId -> { sockets:Set, floorId, x, y, dir, status, mic, cam, screen, connectedAt }
export const presence = new Map();

const STATUSES = new Set(['active', 'busy', 'away']);

export function getIO() {
  return io;
}

export function publicPresence(userId) {
  const p = presence.get(userId);
  if (!p) return { online: false };
  return { online: true, floorId: p.floorId, x: p.x, y: p.y, dir: p.dir, status: p.status, mic: p.mic, cam: p.cam, screen: p.screen, watching: p.watching, recording: !!p.recording };
}

// Pisos "solo admins" (archivo): quien no es admin no recibe dónde está nadie ahí,
// ni su estado de medios. Las salas de socket 'role:admin' y 'role:member' separan los envíos.
export function presenceFor(userId, viewerIsAdmin) {
  const p = publicPresence(userId);
  if (!p.online || viewerIsAdmin || !isFloorAdminOnly(p.floorId)) return p;
  return { online: true, floorId: null, x: null, y: null, dir: 'down', status: p.status, mic: false, cam: false, screen: false, watching: [], recording: false };
}

function emitPlayer(userId, from = null) {
  if (!io) return;
  const target = (room) => (from ? from.to(room) : io.to(room));
  target('role:admin').emit('player', { id: userId, ...presenceFor(userId, true) });
  target('role:member').emit('player', { id: userId, ...presenceFor(userId, false) });
}

// Lista de pisos para cada quien (los admins también ven los archivados)
export function emitFloors() {
  if (!io) return;
  const all = listFloors();
  io.to('role:admin').emit('floors', { floors: all });
  io.to('role:member').emit('floors', { floors: all.filter((f) => !f.adminOnly) });
}

// Mapa de un piso: si es solo para admins, solo a ellos
export function emitFloor(floorId) {
  const payload = floorPayload(floorId);
  if (!payload || !io) return;
  if (payload.adminOnly) io.to('role:admin').emit('floor', payload);
  else io.emit('floor', payload);
}

// Saca de un piso archivado a quien no es admin (p. ej. al marcarlo "solo admins")
export function evictNonAdmins(floorId) {
  for (const [uid, q] of presence) if (q.floorId === floorId && !q.admin) relocate(uid, defaultFloorId());
}

export function emitToUser(userId, event, payload) {
  io?.to(`user:${userId}`).emit(event, payload);
}

export function emitAll(event, payload) {
  io?.emit(event, payload);
}

function spawnFor(user) {
  const saved = user.floor_id && getFloor(user.floor_id) && (user.role === 'admin' || !isFloorAdminOnly(user.floor_id));
  const floorId = saved ? user.floor_id : defaultFloorId();
  const f = getFloor(floorId).state;
  // Si su lugar guardado está en un piso archivado (solo admins), aparece en la entrada del piso principal
  const x = saved ? user.pos_x ?? f.spawn.x : f.spawn.x;
  const y = saved ? user.pos_y ?? f.spawn.y : f.spawn.y;
  const p = nearestWalkable(f, x, y);
  return { floorId, ...p };
}

function savePosition(userId) {
  const p = presence.get(userId);
  if (p) db.prepare('UPDATE users SET pos_x = ?, pos_y = ?, floor_id = ?, last_active = ? WHERE id = ?').run(p.x, p.y, p.floorId, now(), userId);
}

// Mover a alguien (p. ej. si borran su piso o un objeto queda encima)
export function relocate(userId, floorId, x, y) {
  const p = presence.get(userId);
  if (!p) return;
  const f = getFloor(floorId)?.state;
  if (!f) return;
  const pos = nearestWalkable(f, x ?? f.spawn.x, y ?? f.spawn.y);
  Object.assign(p, { floorId, ...pos });
  emitPlayer(userId);
}

// Una sala cerrada se vuelve a abrir sola cuando queda vacía
// Personas a las que alguien de dentro dejó pasar a una sala cerrada (se borra al abrirse)
const admitted = new Map();
const isAdmitted = (areaId, userId) => !!admitted.get(areaId)?.has(userId);

function reopenEmptyRooms() {
  for (const id of closedAreaIds()) {
    let busy = false;
    for (const [, q] of presence) {
      const f = getFloor(q.floorId)?.state;
      if (f && areaAt(f, q.x, q.y)?.id === id) { busy = true; break; }
    }
    if (busy) continue;
    setAreaClosed(id, false);
    admitted.delete(id);
    const fid = floorOfArea(id);
    if (fid) emitFloor(fid);
  }
}

export function disconnectUser(userId) {
  const p = presence.get(userId);
  if (!p) return;
  for (const s of p.sockets) s.disconnect(true);
}

export function initRealtime(httpServer) {
  // Tope por mensaje: lo más grande que manda la app es una oferta WebRTC o un trazo de pizarrón (~20 KB)
  io = new Server(httpServer, { maxHttpBufferSize: Number(process.env.SOCKET_MAX_BYTES) || 200_000 });
  initStageIO(io, presence);

  io.use((socket, next) => {
    const token = parseCookies(socket.handshake.headers.cookie)[SESSION_COOKIE];
    const user = userFromToken(token);
    if (!user) return next(new Error('unauthorized'));
    socket.data.userId = user.id;
    const why = socketAdmission(socket, user, presence.get(user.id)?.sockets.size || 0);
    if (why) return next(new Error(why));
    next();
  });

  io.on('connection', (socket) => {
    const userId = socket.data.userId;
    socketShield(socket, userId); // antes de cualquier socket.on: errores atrapados, límites y moderación
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
    socket.join(`user:${userId}`);
    socket.join(user.role === 'admin' ? 'role:admin' : 'role:member');

    let p = presence.get(userId);
    if (!p) {
      p = { sockets: new Set(), ...spawnFor(user), dir: 'down', status: 'active', mic: false, cam: false, screen: false, recording: false, watching: [], connectedAt: now() };
      presence.set(userId, p);
    }
    p.admin = user.role === 'admin';
    // Si dejaron de ser admin y estaban en un piso archivado, salen a la entrada
    if (!p.admin && isFloorAdminOnly(p.floorId)) Object.assign(p, spawnFor({ ...user, floor_id: null }));
    p.sockets.add(socket);
    if (p.sockets.size === 1) shiftOnConnect(user);
    if (p.sockets.size === 1) trackConnect(userId, areaAt(getFloor(p.floorId)?.state || { areas: [] }, p.x, p.y)?.id);
    db.prepare('UPDATE users SET last_active = ? WHERE id = ?').run(now(), userId);

    const all = {};
    for (const [id] of presence) all[id] = id === userId ? publicPresence(id) : presenceFor(id, p.admin);
    socket.emit('hello', { you: userId, players: all, version: APP_VERSION });
    emitPlayer(userId, socket);

    socket.on('move', (m) => {
      if (!m || typeof m !== 'object') return;
      const floorId = Number(m.floorId ?? p.floorId);
      const f = getFloor(floorId)?.state;
      if (!f) return;
      const x = Math.trunc(m.x);
      const y = Math.trunc(m.y);
      const changingFloor = floorId !== p.floorId;
      const hidden = isFloorAdminOnly(floorId);
      // Piso archivado: solo entran los admins
      if (hidden && !p.admin) {
        socket.emit('player', { id: userId, ...publicPresence(userId) });
        return;
      }
      // Movimiento normal: máximo 1 casilla por paso. Teletransporte permitido (Ir a / cambiar de piso).
      // No se puede entrar caminando a una sala cerrada (sí con "Ir a"/teletransporte de quien ya estaba dentro)
      if (!isWalkable(f, x, y) || (!changingFloor && (() => { const r = closedRoomAt(f, p, { x, y }); return r && !isAdmitted(r.id, userId); })())) {
        socket.emit('player', { id: userId, ...publicPresence(userId) });
        return;
      }
      p.floorId = floorId;
      p.x = x;
      p.y = y;
      if (['up', 'down', 'left', 'right'].includes(m.dir)) p.dir = m.dir;
      const mv = { id: userId, floorId, x, y, dir: p.dir, tp: !!m.tp || changingFloor };
      if (!hidden) socket.broadcast.emit('move', mv);
      else {
        socket.to('role:admin').emit('move', mv);
        if (changingFloor) socket.to('role:member').emit('player', { id: userId, ...presenceFor(userId, false) });
      }
      if (closedAreaIds().length) reopenEmptyRooms();
      stageCleanup(userId); // fila de manos del escenario: sale si dejó el área
      // Cuando ya están los dos en una sala 1:1, la puerta se cierra sola (para no molestar a los demás)
      const here = areaAt(f, x, y);
      trackArea(userId, here?.id);
      const inRoom = here ? [...presence.values()].filter((q) => q.floorId === floorId && areaAt(f, q.x, q.y)?.id === here.id).length : 0;
      if (here?.private && /1\s*:\s*1/.test(here.name) && !isAreaClosed(here.id) && inRoom >= 2) {
        setAreaClosed(here.id, true);
        emitFloor(floorId);
        io.emit('room-state', { areaId: here.id, closed: true, by: userId, auto: true });
      }
    });

    // Cerrar o abrir la sala donde estás: cerrada, solo se oye dentro y nadie más entra
    socket.on('room:close', (m) => {
      const f = getFloor(p.floorId);
      const a = f && areaAt(f.state, p.x, p.y);
      if (!a || a.id !== Number(m?.areaId)) return;
      setAreaClosed(a.id, !!m.closed);
      if (!m.closed) admitted.delete(a.id);
      emitFloor(f.id);
      io.emit('room-state', { areaId: a.id, closed: !!m.closed, by: userId });
    });

    // Tocar la puerta de una sala cerrada: les llega a quienes están dentro
    let lastKnock = 0;
    socket.on('room:knock', (m) => {
      const areaId = Number(m?.areaId);
      if (!isAreaClosed(areaId) || Date.now() - lastKnock < 8000) return;
      lastKnock = Date.now();
      for (const [id, q] of presence) {
        const f = getFloor(q.floorId)?.state;
        if (f && areaAt(f, q.x, q.y)?.id === areaId) emitToUser(id, 'room:knock', { from: userId, areaId });
      }
    });

    // Quien está dentro de una sala cerrada deja pasar a alguien que tocó la puerta
    socket.on('room:admit', (m) => {
      const areaId = Number(m?.areaId);
      const guest = Number(m?.userId);
      const f = getFloor(p.floorId)?.state;
      if (!f || !isAreaClosed(areaId) || areaAt(f, p.x, p.y)?.id !== areaId || !presence.has(guest)) return;
      if (!admitted.has(areaId)) admitted.set(areaId, new Set());
      admitted.get(areaId).add(guest);
      emitToUser(guest, 'room:admitted', { areaId, by: userId });
    });

    socket.on('state', (s) => {
      if (!s || typeof s !== 'object') return;
      if (STATUSES.has(s.status)) p.status = s.status;
      for (const k of ['mic', 'cam', 'screen', 'recording']) if (typeof s[k] === 'boolean') p[k] = s[k];
      // Pantallas que esta persona está viendo (para que solo se le envíen esas)
      if (Array.isArray(s.watching)) p.watching = [...new Set(s.watching.map(Number).filter((id) => Number.isInteger(id) && id !== userId))].slice(0, 4);
      emitPlayer(userId);
    });

    // Pestaña oculta o visible: si todas están ocultas, los avisos llegan por push (server/push.js)
    socket.on('visibility', (v) => { socket.data.hidden = !!v?.hidden; });

    // Acciones del personaje: se reenvían a todos para que vean la animación
    let lastEmote = 0;
    socket.on('emote', (m) => {
      const t = Date.now();
      const def = EMOTES[m?.kind];
      if (!def || t - lastEmote < 700) return;
      let target = null;
      if (def.pair) {
        target = Number(m.target);
        const q = presence.get(target);
        if (!q || target === userId || q.floorId !== p.floorId || Math.max(Math.abs(q.x - p.x), Math.abs(q.y - p.y)) > PAIR_RANGE) return;
      }
      lastEmote = t;
      io.emit('emote', { id: userId, kind: m.kind, target, variant: cleanVariant(m.variant) });
      if (['dance', 'hug', 'highfive'].includes(m.kind)) bumpCounter(userId, `emote:${m.kind}`);
    });

    // Efecto de "regresar a mi escritorio": se reenvía a los demás para que lo vean
    let lastFx = 0;
    socket.on('fx', (m) => {
      const t = Date.now();
      if (t - lastFx < 1500 || !['zap', 'alien', 'portal', 'rocket', 'broom', 'bats'].includes(m?.kind)) return;
      lastFx = t;
      const pt = (q) => ({ x: Math.trunc(Number(q?.x) || 0), y: Math.trunc(Number(q?.y) || 0) });
      (isFloorAdminOnly(p.floorId) ? socket.to('role:admin') : socket.broadcast).emit('fx', { id: userId, kind: m.kind, from: pt(m.from), to: pt(m.to) });
    });

    socket.on('react', (r) => {
      const emoji = typeof r?.emoji === 'string' ? r.emoji.slice(0, 8) : null;
      if (emoji) io.emit('react', { id: userId, emoji });
    });

    initBoards(io, socket, userId);
    initGames(io, socket, userId);
    initNotes(io, socket, userId);
    initStage(socket, userId);
    initPets(io, socket, userId, presence);
    initJukebox(io, socket, userId);
    initHotel(io, socket, userId); // Hotel: salas isométricas (capa aparte de la oficina)

    // Chat de la sala: le llega solo a quienes te oyen ahora (misma sala, escritorio o cerca)
    let roomMsgTimes = [];
    socket.on('room-msg', (m) => {
      const text = String(m?.text || '').trim().slice(0, 500);
      if (!text) return;
      const t = Date.now();
      roomMsgTimes = roomMsgTimes.filter((x) => t - x < 10e3);
      if (roomMsgTimes.length >= 8) return;
      roomMsgTimes.push(t);
      const f = getFloor(p.floorId)?.state;
      if (!f) return;
      const to = [userId];
      for (const [id, q] of presence) if (id !== userId && canTalk(f, { ...p, floorId: p.floorId }, q) && !hasBlocked(id, userId)) to.push(id);
      const msg = { from: userId, text, at: t, id: `${userId}-${t}`, to: to.length - 1 };
      for (const id of to) io.to(`user:${id}`).emit('room-msg', msg);
    });

    // Anotaciones sobre una pantalla compartida: se reenvían a quienes la ven
    socket.on('annot:join', (sharer) => { if (presence.has(Number(sharer))) socket.join(`annot:${Number(sharer)}`); });
    socket.on('annot:leave', (sharer) => socket.leave(`annot:${Number(sharer)}`));
    socket.on('annot', (m) => {
      const sharer = Number(m?.sharer);
      if (!socket.rooms.has(`annot:${sharer}`) || !Array.isArray(m?.p)) return;
      const pts = m.p.slice(0, 300).map((pt) => [Math.max(0, Math.min(1, Number(pt?.[0]) || 0)), Math.max(0, Math.min(1, Number(pt?.[1]) || 0))]);
      const color = /^#[0-9a-fA-F]{6}$/.test(m.c) ? m.c : '#FE3377';
      socket.to(`annot:${sharer}`).emit('annot', { sharer, from: userId, c: color, p: pts, id: String(m.id || '').slice(0, 20) });
    });

    // Clip guardado: se avisa solo a quien transmite (y solo si de verdad lo estás viendo)
    let clipTimes = [];
    socket.on('clip', (m) => {
      const sharer = Number(m?.sharer);
      if (!Number.isInteger(sharer) || sharer === userId) return;
      const target = presence.get(sharer);
      if (!target?.screen || !p.watching.includes(sharer)) return;
      const t = Date.now();
      clipTimes = clipTimes.filter((x) => t - x < 60e3);
      if (clipTimes.length >= 6) return; // máximo 6 avisos por minuto
      clipTimes.push(t);
      emitToUser(sharer, 'clip', { from: userId });
    });

    // Señalización WebRTC: solo se reenvía a usuarios conectados
    socket.on('rtc', (msg) => {
      const to = Number(msg?.to);
      if (!presence.has(to) || to === userId) return;
      // Nadie fuera de un piso archivado se conecta con quien está dentro (salvo entre admins)
      // Hotel: quienes están en la misma sala del Hotel sí se oyen (ahí se ven, sin importar su piso)
      const q = presence.get(to);
      const hm = hotelCtx.where.get(userId), ht = hotelCtx.where.get(to);
      const sameHotelRoom = !!hm && !!ht && hm.roomId === ht.roomId;
      if (!sameHotelRoom && ((isFloorAdminOnly(q.floorId) && !p.admin) || (isFloorAdminOnly(p.floorId) && !q.admin))) return;
      emitToUser(to, 'rtc', { from: userId, data: msg.data });
    });

    socket.on('disconnect', () => {
      p.sockets.delete(socket);
      if (p.sockets.size === 0) {
        closeShift(userId);
        try { trackDisconnect(userId); checkAchievements(userId); } catch (e) { console.error('[stats]', e.message); }
        savePosition(userId);
        presence.delete(userId);
        stageCleanup(userId, { gone: true });
        io.emit('player', { id: userId, online: false });
        if (closedAreaIds().length) reopenEmptyRooms();
      }
    });
  });

  startNotesTimer();
  // Guardar posiciones periódicamente
  setInterval(() => { for (const id of presence.keys()) savePosition(id); }, 60e3).unref();
  return io;
}
