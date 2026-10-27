import { Server } from 'socket.io';
import { db, now } from './db.js';
import { parseCookies, userFromToken, SESSION_COOKIE } from './auth.js';
import { getFloor, defaultFloorId } from './world.js';
import { isWalkable, nearestWalkable } from '../shared/map.js';
import { initBoards } from './boards.js';

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

export function emitToUser(userId, event, payload) {
  io?.to(`user:${userId}`).emit(event, payload);
}

export function emitAll(event, payload) {
  io?.emit(event, payload);
}

function spawnFor(user) {
  let floorId = user.floor_id && getFloor(user.floor_id) ? user.floor_id : defaultFloorId();
  const f = getFloor(floorId).state;
  const x = user.pos_x ?? f.spawn.x;
  const y = user.pos_y ?? f.spawn.y;
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
  io.emit('player', { id: userId, ...publicPresence(userId) });
}

export function disconnectUser(userId) {
  const p = presence.get(userId);
  if (!p) return;
  for (const s of p.sockets) s.disconnect(true);
}

export function initRealtime(httpServer) {
  io = new Server(httpServer, { maxHttpBufferSize: 1e6 });

  io.use((socket, next) => {
    const token = parseCookies(socket.handshake.headers.cookie)[SESSION_COOKIE];
    const user = userFromToken(token);
    if (!user) return next(new Error('unauthorized'));
    socket.data.userId = user.id;
    next();
  });

  io.on('connection', (socket) => {
    const userId = socket.data.userId;
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
    socket.join(`user:${userId}`);

    let p = presence.get(userId);
    if (!p) {
      p = { sockets: new Set(), ...spawnFor(user), dir: 'down', status: 'active', mic: false, cam: false, screen: false, recording: false, watching: [], connectedAt: now() };
      presence.set(userId, p);
    }
    p.sockets.add(socket);
    db.prepare('UPDATE users SET last_active = ? WHERE id = ?').run(now(), userId);

    const all = {};
    for (const [id] of presence) all[id] = publicPresence(id);
    socket.emit('hello', { you: userId, players: all });
    socket.broadcast.emit('player', { id: userId, ...publicPresence(userId) });

    socket.on('move', (m) => {
      if (!m || typeof m !== 'object') return;
      const floorId = Number(m.floorId ?? p.floorId);
      const f = getFloor(floorId)?.state;
      if (!f) return;
      const x = Math.trunc(m.x);
      const y = Math.trunc(m.y);
      const changingFloor = floorId !== p.floorId;
      // Movimiento normal: máximo 1 casilla por paso. Teletransporte permitido (Ir a / cambiar de piso).
      if (!isWalkable(f, x, y)) {
        socket.emit('player', { id: userId, ...publicPresence(userId) });
        return;
      }
      p.floorId = floorId;
      p.x = x;
      p.y = y;
      if (['up', 'down', 'left', 'right'].includes(m.dir)) p.dir = m.dir;
      socket.broadcast.emit('move', { id: userId, floorId, x, y, dir: p.dir, tp: !!m.tp || changingFloor });
    });

    socket.on('state', (s) => {
      if (!s || typeof s !== 'object') return;
      if (STATUSES.has(s.status)) p.status = s.status;
      for (const k of ['mic', 'cam', 'screen', 'recording']) if (typeof s[k] === 'boolean') p[k] = s[k];
      // Pantallas que esta persona está viendo (para que solo se le envíen esas)
      if (Array.isArray(s.watching)) p.watching = [...new Set(s.watching.map(Number).filter((id) => Number.isInteger(id) && id !== userId))].slice(0, 4);
      io.emit('player', { id: userId, ...publicPresence(userId) });
    });

    socket.on('react', (r) => {
      const emoji = typeof r?.emoji === 'string' ? r.emoji.slice(0, 8) : null;
      if (emoji) io.emit('react', { id: userId, emoji });
    });

    initBoards(io, socket, userId);

    // Anotaciones sobre una pantalla compartida: se reenvían a quienes la ven
    socket.on('annot:join', (sharer) => socket.join(`annot:${Number(sharer)}`));
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
      emitToUser(to, 'rtc', { from: userId, data: msg.data });
    });

    socket.on('disconnect', () => {
      p.sockets.delete(socket);
      if (p.sockets.size === 0) {
        savePosition(userId);
        presence.delete(userId);
        io.emit('player', { id: userId, online: false });
      }
    });
  });

  // Guardar posiciones periódicamente
  setInterval(() => { for (const id of presence.keys()) savePosition(id); }, 60e3).unref();
  return io;
}
