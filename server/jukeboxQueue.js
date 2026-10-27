// Rocola: lógica pura de la fila (sin base de datos ni sockets, para probarla sola).
import { isVideoId, cleanTitle, skipNeeded, JUKEBOX_MAX_QUEUE, JUKEBOX_MAX_PER_USER } from '../shared/jukebox.js';

export { skipNeeded };

const LEAD_MS = 1500; // margen para que todos carguen el video antes de empezar
const MIN_PLAY_MS = 5000; // un "terminó" antes de esto se ignora
const MAX_DURATION = 6 * 3600;
// Errores del reproductor que dependen del video (no existe / no se puede insertar)
const VIDEO_ERRORS = new Set([100, 101, 150]);

export function createJukebox() {
  return { current: null, queue: [], skipVotes: new Set(), seq: 0 };
}

export function sortQueue(jb) {
  jb.queue.sort((a, b) => b.votes.size - a.votes.size || a.addedAt - b.addedAt || a.id - b.id);
  return jb.queue;
}

function start(jb, song, t) {
  jb.current = { id: song.id, videoId: song.videoId, title: song.title, addedBy: song.addedBy, startedAt: t + LEAD_MS, duration: null };
  jb.skipVotes = new Set();
}

export function addSong(jb, { videoId, title, userId }, t = Date.now()) {
  if (!isVideoId(videoId)) return { error: 'Ese enlace de YouTube no es válido' };
  if (jb.current?.videoId === videoId || jb.queue.some((s) => s.videoId === videoId)) return { error: 'Esa canción ya está en la fila' };
  if (jb.queue.filter((s) => s.addedBy === userId).length >= JUKEBOX_MAX_PER_USER) return { error: `Puedes tener máximo ${JUKEBOX_MAX_PER_USER} canciones en la fila` };
  if (jb.queue.length >= JUKEBOX_MAX_QUEUE) return { error: 'La fila está llena, espera a que avance' };
  const song = { id: ++jb.seq, videoId, title: cleanTitle(title), addedBy: userId, addedAt: t, votes: new Set() };
  if (!jb.current) { start(jb, song, t); return { ok: true, song, started: true }; }
  jb.queue.push(song);
  sortQueue(jb);
  return { ok: true, song, started: false };
}

// Votar (o quitar el voto) por una canción de la fila
export function voteSong(jb, songId, userId) {
  const s = jb.queue.find((x) => x.id === songId);
  if (!s) return false;
  if (s.votes.has(userId)) s.votes.delete(userId); else s.votes.add(userId);
  sortQueue(jb);
  return true;
}

// Quitar una canción de la fila: quien la puso o un admin
export function removeSong(jb, songId, userId, isAdmin = false) {
  const i = jb.queue.findIndex((x) => x.id === songId);
  if (i < 0 || (!isAdmin && jb.queue[i].addedBy !== userId)) return false;
  jb.queue.splice(i, 1);
  return true;
}

// Pasar a la siguiente canción (la más votada; si empatan, la que llegó antes)
export function advance(jb, t = Date.now()) {
  sortQueue(jb);
  const next = jb.queue.shift();
  if (next) start(jb, next, t);
  else { jb.current = null; jb.skipVotes = new Set(); }
  return jb.current;
}

// Votar por saltar la canción actual. listeners = ids de quienes la oyen.
// Salta de inmediato si es admin o quien la puso; si no, cuando vota la mayoría.
export function voteSkip(jb, userId, listeners, { isAdmin = false } = {}, t = Date.now()) {
  if (!jb.current) return { skipped: false };
  if (isAdmin || jb.current.addedBy === userId) { advance(jb, t); return { skipped: true }; }
  if (!listeners.has(userId)) return { skipped: false };
  jb.skipVotes.add(userId);
  return checkSkip(jb, listeners, t);
}

export function checkSkip(jb, listeners, t = Date.now()) {
  if (!jb.current || !jb.skipVotes.size) return { skipped: false };
  const votes = [...jb.skipVotes].filter((id) => listeners.has(id)).length;
  const needed = skipNeeded(listeners.size);
  if (listeners.size && votes >= needed) { advance(jb, t); return { skipped: true, votes, needed }; }
  return { skipped: false, votes, needed };
}

// Un cliente avisa que la canción terminó. Varios lo dirán a la vez: solo cuenta el primero.
export function reportEnded(jb, videoId, t = Date.now()) {
  const c = jb.current;
  if (!c || c.videoId !== videoId) return false;
  const elapsed = t - c.startedAt;
  if (elapsed < MIN_PLAY_MS) return false;
  if (c.duration && elapsed < (c.duration - 15) * 1000) return false;
  advance(jb, t);
  return true;
}

// El video no se puede reproducir en ningún lado (borrado o con inserción bloqueada)
export function reportError(jb, videoId, code, t = Date.now()) {
  if (!jb.current || jb.current.videoId !== videoId || !VIDEO_ERRORS.has(Number(code))) return false;
  advance(jb, t);
  return true;
}

export function setDuration(jb, videoId, d) {
  const n = Number(d);
  if (!jb.current || jb.current.videoId !== videoId || jb.current.duration || !(n > 1 && n < MAX_DURATION)) return false;
  jb.current.duration = Math.round(n);
  return true;
}

// Si nadie avisó que terminó (p. ej. todos salieron), avanza con la duración conocida
export function tick(jb, t = Date.now()) {
  const c = jb.current;
  if (c?.duration && t > c.startedAt + c.duration * 1000 + 4000) { advance(jb, t); return true; }
  return false;
}

export function viewOf(jb) {
  return {
    current: jb.current ? { ...jb.current } : null,
    queue: jb.queue.map((s) => ({ id: s.id, videoId: s.videoId, title: s.title, addedBy: s.addedBy, votes: s.votes.size, voters: [...s.votes] })),
    skipVotes: [...jb.skipVotes],
  };
}

