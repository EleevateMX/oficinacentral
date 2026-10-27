// Escenario: fila de "manos levantadas" por escenario (en memoria; se vacía al reiniciar).
// Quien está en el alcance de un escenario levanta la mano; quien está arriba (ponente)
// ve la fila en orden y puede dar la palabra o bajar la mano. La fila se avisa solo a
// quienes están en el alcance del escenario y a quien acaba de salir de ella.
import { getFloor } from './world.js';
import { stageAt, stageScopeAt, floorStages, inStageScope, guestSpot } from '../shared/stage.js';

// `${floorId}|${stageKey}` -> [userId, ...] en orden
const queues = new Map();
let io = null;
let presence = null;

const qid = (floorId, key) => `${floorId}|${key}`;

function stageByKey(f, key) {
  return floorStages(f).find((s) => s.key === key) || null;
}

// Escenario (y piso) donde está ahora una persona, si está en el alcance de alguno
function where(userId) {
  const p = presence.get(userId);
  const f = p && getFloor(p.floorId)?.state;
  if (!f) return null;
  const s = stageScopeAt(f, p.x, p.y);
  return s ? { p, f, s, id: qid(p.floorId, s.key), onStage: !!stageAt(f, p.x, p.y) } : null;
}

function audience(floorId, key) {
  const f = getFloor(floorId)?.state;
  const s = f && stageByKey(f, key);
  const ids = [];
  if (!s) return ids;
  for (const [id, q] of presence) if (q.floorId === floorId && inStageScope(f, s, q.x, q.y)) ids.push(id);
  return ids;
}

function broadcast(id, extra = []) {
  const [floorId, key] = [Number(id.split('|')[0]), id.slice(id.indexOf('|') + 1)];
  const queue = queues.get(id) || [];
  const msg = { floorId, key, queue };
  for (const uid of new Set([...audience(floorId, key), ...extra])) io.to(`user:${uid}`).emit('stage:queue', msg);
}

function removeFrom(id, userId) {
  const q = queues.get(id);
  if (!q) return false;
  const i = q.indexOf(userId);
  if (i < 0) return false;
  q.splice(i, 1);
  if (!q.length) queues.delete(id);
  return true;
}

// Quitar a una persona de las filas donde ya no le toca estar (salió del área, se subió o se fue)
export function stageCleanup(userId, { gone = false } = {}) {
  if (!io) return;
  const here = gone ? null : where(userId);
  for (const [id, q] of [...queues]) {
    if (!q.includes(userId)) continue;
    if (here && here.id === id && !here.onStage) continue;
    removeFrom(id, userId);
    broadcast(id, gone ? [] : [userId]);
  }
}

export function initStageIO(_io, _presence) {
  io = _io;
  presence = _presence;
}

export function initStage(socket, userId) {
  // Pedir la fila del escenario donde estoy (al entrar al área)
  socket.on('stage:sync', () => {
    const w = where(userId);
    if (!w) return socket.emit('stage:queue', { floorId: null, key: null, queue: [] });
    socket.emit('stage:queue', { floorId: w.p.floorId, key: w.s.key, queue: queues.get(w.id) || [] });
  });

  socket.on('stage:raise', () => {
    const w = where(userId);
    if (!w || w.onStage) return;
    const q = queues.get(w.id) || [];
    if (q.includes(userId)) return;
    if (q.length >= 100) return;
    q.push(userId);
    queues.set(w.id, q);
    broadcast(w.id);
    // Avisar a los ponentes (sonido/aviso en el cliente)
    for (const [id, pq] of presence) {
      if (id !== userId && pq.floorId === w.p.floorId && stageAt(w.f, pq.x, pq.y) && stageAt(w.f, pq.x, pq.y).key === w.s.key) {
        io.to(`user:${id}`).emit('stage:hand', { from: userId, position: q.length });
      }
    }
  });

  // Bajar la mano: la propia, o (si estás en el escenario) la de alguien de tu fila
  socket.on('stage:lower', (m) => {
    const target = m?.userId != null ? Number(m.userId) : userId;
    const w = where(userId);
    if (!w) return;
    if (target !== userId && !w.onStage) return;
    if (removeFrom(w.id, target)) broadcast(w.id, [target]);
  });

  // Dar la palabra: solo un ponente; a la persona le llega la invitación con su lugar en el escenario
  socket.on('stage:give', (m) => {
    const target = Number(m?.userId);
    const w = where(userId);
    if (!w || !w.onStage || !(queues.get(w.id) || []).includes(target)) return;
    removeFrom(w.id, target);
    broadcast(w.id, [target]);
    const s = stageAt(w.f, w.p.x, w.p.y);
    const taken = [...presence.values()].filter((q) => q.floorId === w.p.floorId).map((q) => ({ x: q.x, y: q.y }));
    const spot = guestSpot(w.f, s, taken);
    io.to(`user:${target}`).emit('stage:invited', { by: userId, floorId: w.p.floorId, x: spot.x, y: spot.y });
  });
}

// Para pruebas y depuración
export function stageQueues() {
  return Object.fromEntries(queues);
}
