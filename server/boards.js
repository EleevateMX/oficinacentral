// Pizarrones compartidos: trazos guardados por objeto y transmitidos en vivo.
import { db, now } from './db.js';

const MAX_STROKES = 1500;
const MAX_POINTS = 600;
const cache = new Map(); // objectId -> strokes[]

function isBoard(id) {
  const r = db.prepare('SELECT type FROM objects WHERE id = ?').get(id);
  return r && (r.type === 'whiteboard' || r.type === 'easel');
}

export function getStrokes(id) {
  if (!cache.has(id)) {
    const r = db.prepare('SELECT strokes FROM boards WHERE object_id = ?').get(id);
    let list = [];
    try { list = r ? JSON.parse(r.strokes) : []; } catch { list = []; }
    cache.set(id, list);
  }
  return cache.get(id);
}

const timers = new Map();
function persist(id) {
  clearTimeout(timers.get(id));
  timers.set(id, setTimeout(() => {
    timers.delete(id);
    db.prepare('INSERT INTO boards (object_id, strokes, updated_at) VALUES (?, ?, ?) ON CONFLICT(object_id) DO UPDATE SET strokes = excluded.strokes, updated_at = excluded.updated_at')
      .run(id, JSON.stringify(cache.get(id) || []), now());
  }, 800));
}

// Valida un trazo: color, grosor y puntos normalizados (0..1)
export function cleanStroke(s) {
  if (!s || typeof s !== 'object' || !Array.isArray(s.p)) return null;
  const color = /^#[0-9a-fA-F]{6}$/.test(s.c) ? s.c : '#101010';
  const width = Math.max(1, Math.min(40, Number(s.w) || 3));
  const pts = [];
  for (const pt of s.p.slice(0, MAX_POINTS)) {
    const x = Number(pt?.[0]), y = Number(pt?.[1]);
    if (Number.isFinite(x) && Number.isFinite(y)) pts.push([Math.round(Math.max(0, Math.min(1, x)) * 10000) / 10000, Math.round(Math.max(0, Math.min(1, y)) * 10000) / 10000]);
  }
  if (!pts.length) return null;
  return { c: color, w: width, p: pts, e: !!s.e };
}

export function initBoards(io, socket, userId) {
  socket.on('board:join', (id) => {
    id = Number(id);
    if (!isBoard(id)) return;
    socket.join(`board:${id}`);
    socket.emit('board:state', { id, strokes: getStrokes(id) });
  });
  socket.on('board:leave', (id) => socket.leave(`board:${Number(id)}`));
  socket.on('board:stroke', (m) => {
    const id = Number(m?.id);
    if (!socket.rooms.has(`board:${id}`)) return;
    const st = cleanStroke(m.stroke);
    if (!st) return;
    st.u = userId;
    const list = getStrokes(id);
    list.push(st);
    if (list.length > MAX_STROKES) list.splice(0, list.length - MAX_STROKES);
    persist(id);
    socket.to(`board:${id}`).emit('board:stroke', { id, stroke: st });
  });
  socket.on('board:clear', (id) => {
    id = Number(id);
    if (!socket.rooms.has(`board:${id}`)) return;
    cache.set(id, []);
    persist(id);
    io.to(`board:${id}`).emit('board:state', { id, strokes: [] });
  });
  socket.on('board:undo', (id) => {
    id = Number(id);
    if (!socket.rooms.has(`board:${id}`)) return;
    const list = getStrokes(id);
    for (let i = list.length - 1; i >= 0; i--) if (list[i].u === userId) { list.splice(i, 1); break; }
    persist(id);
    io.to(`board:${id}`).emit('board:state', { id, strokes: list });
  });
}
