// Rocola: música de YouTube compartida dentro del área donde está la rocola.
// El servidor guarda, por rocola, la canción que suena (y desde cuándo) y la fila
// con votos. Cada cliente reproduce en `ahora - startedAt`. El estado vive en
// memoria: si el servidor se reinicia, la rocola empieza en silencio.
import { db } from './db.js';
import { getFloor } from './world.js';
import { presence } from './realtime.js';
import { inJukeboxZone } from '../shared/jukebox.js';
import { createJukebox, addSong, voteSong, removeSong, voteSkip, checkSkip, reportEnded, reportError, setDuration, tick, viewOf } from './jukeboxQueue.js';

// ---------- Tiempo real ----------
const boxes = new Map(); // objectId -> estado
let ioRef = null;
let timer = null;

function findJukebox(objectId) {
  const r = db.prepare("SELECT floor_id AS floorId FROM objects WHERE id = ? AND type = 'jukebox'").get(objectId);
  const f = r && getFloor(r.floorId)?.state;
  const o = f?.objects.find((x) => x.id === objectId);
  return o ? { f, o, floorId: r.floorId } : null;
}

export function listenersOf(objectId) {
  const j = findJukebox(objectId);
  const out = new Set();
  if (!j) return out;
  for (const [id, q] of presence) if (q.floorId === j.floorId && inJukeboxZone(j.f, j.o, q.x, q.y)) out.add(id);
  return out;
}

const payload = (objectId, jb) => ({ objectId, ...viewOf(jb), now: Date.now() });
function broadcast(objectId) {
  const jb = boxes.get(objectId);
  if (!jb) return;
  ioRef?.emit('jukebox:state', payload(objectId, jb));
  if (!jb.current && !jb.queue.length) boxes.delete(objectId);
}

function startTimer() {
  if (timer) return;
  timer = setInterval(() => {
    for (const [id, jb] of boxes) {
      if (!findJukebox(id)) { boxes.delete(id); ioRef?.emit('jukebox:state', { objectId: id, current: null, queue: [], skipVotes: [], now: Date.now() }); continue; }
      if (tick(jb) || checkSkip(jb, listenersOf(id)).skipped) broadcast(id);
    }
  }, 2000);
  timer.unref?.();
}

export function initJukebox(io, socket, userId) {
  ioRef = io;
  startTimer();
  const isAdmin = () => db.prepare('SELECT role FROM users WHERE id = ?').get(userId)?.role === 'admin';
  // Rocola existente y la persona está en su zona (o es admin)
  const box = (raw, { create = false, adminOk = true } = {}) => {
    const id = Number(raw?.objectId);
    if (!Number.isInteger(id) || !findJukebox(id)) return null;
    const listeners = listenersOf(id);
    const admin = adminOk && !listeners.has(userId) && isAdmin();
    if (!listeners.has(userId) && !admin) return null;
    let jb = boxes.get(id);
    if (!jb && create) { jb = createJukebox(); boxes.set(id, jb); }
    return jb ? { id, jb, listeners } : null;
  };
  const reply = (ack, r) => { if (typeof ack === 'function') ack(r); };

  socket.on('jukebox:sync', (_m, ack) => {
    const all = [...boxes].map(([id, jb]) => payload(id, jb));
    if (typeof ack === 'function') ack({ all, now: Date.now() });
    else socket.emit('jukebox:all', { all, now: Date.now() });
  });

  let lastAdd = 0;
  socket.on('jukebox:add', (m, ack) => {
    const t = Date.now();
    if (t - lastAdd < 2000) return reply(ack, { error: 'Espera un momento antes de agregar otra' });
    const b = box(m, { create: true, adminOk: false });
    if (!b) return reply(ack, { error: 'Acércate a la rocola para poner música' });
    const r = addSong(b.jb, { videoId: String(m?.videoId || ''), title: m?.title, userId }, t);
    if (r.error) { if (!b.jb.current && !b.jb.queue.length) boxes.delete(b.id); return reply(ack, { error: r.error }); }
    lastAdd = t;
    reply(ack, { ok: true, started: r.started });
    broadcast(b.id);
  });

  socket.on('jukebox:vote', (m) => {
    const b = box(m, { adminOk: false });
    if (b && voteSong(b.jb, Number(m?.songId), userId)) broadcast(b.id);
  });

  socket.on('jukebox:remove', (m) => {
    const b = box(m);
    if (b && removeSong(b.jb, Number(m?.songId), userId, isAdmin())) broadcast(b.id);
  });

  socket.on('jukebox:skip', (m, ack) => {
    const b = box(m);
    if (!b) return reply(ack, { error: 'Acércate a la rocola' });
    const r = voteSkip(b.jb, userId, b.listeners, { isAdmin: isAdmin() });
    reply(ack, r);
    broadcast(b.id);
  });

  socket.on('jukebox:ended', (m) => {
    const b = box(m, { adminOk: false });
    if (b && reportEnded(b.jb, String(m?.videoId || ''))) broadcast(b.id);
  });

  socket.on('jukebox:error', (m) => {
    const b = box(m, { adminOk: false });
    if (b && reportError(b.jb, String(m?.videoId || ''), m?.code)) broadcast(b.id);
  });

  socket.on('jukebox:duration', (m) => {
    const b = box(m, { adminOk: false });
    if (b && setDuration(b.jb, String(m?.videoId || ''), m?.duration)) broadcast(b.id);
  });
}
