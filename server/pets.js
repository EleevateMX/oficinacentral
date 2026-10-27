// Mascotas interactivas: alimentar, lanzar la pelota, acariciar y trucos.
// El ánimo (felicidad 0–100) se guarda por dueño y baja muy despacito con el tiempo.
// Todas las acciones se validan aquí y se transmiten con 'pet:action' para que todos vean la misma animación.
import { db, now } from './db.js';
import { petDef } from '../shared/pets.js';

db.exec(`CREATE TABLE IF NOT EXISTS pet_mood (
  user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  happiness REAL NOT NULL DEFAULT 70,
  updated_at INTEGER NOT NULL,
  last_fed INTEGER,
  last_played INTEGER,
  last_petted INTEGER
)`);

export const MOOD_DEFAULT = 70;
export const MOOD_MIN = 10; // nunca llega a cero: nada de castigos
export const DECAY_PER_HOUR = 2;
export const NEAR = 2; // casillas (distancia de tablero) para acariciar o jugar con la mascota de alguien
export const BALL_RANGE = 6;
export const TRICKS = ['sit', 'roll', 'jump', 'spin'];
const GAIN = { feed: 20, ball: 10, pet: 5, petOwn: 3, trick: 2, happy: 3 };
// Enfriamientos (ms)
const CD = { feed: 90e3, ball: 3500, pet: 1500, trick: 2000, notify: 60e3, happy: 20 * 60e3 };

const clamp = (v) => Math.max(MOOD_MIN, Math.min(100, v));

function petOf(userId) {
  const r = db.prepare('SELECT avatar FROM users WHERE id = ?').get(userId);
  let av = {};
  try { av = JSON.parse(r?.avatar || '{}'); } catch { av = {}; }
  const d = av.pet && av.pet !== 'none' ? petDef(av.pet) : null;
  return d && d.id !== 'none' ? { kind: d.id, name: av.petName || d.name } : null;
}

// Ánimo actual con el desgaste aplicado (sin guardar)
export function getMood(userId, at = now()) {
  const r = db.prepare('SELECT * FROM pet_mood WHERE user_id = ?').get(userId);
  if (!r) return { happiness: MOOD_DEFAULT, lastFed: null, lastPlayed: null, lastPetted: null };
  const hours = Math.max(0, at - r.updated_at) / 3600e3;
  const h = r.happiness > MOOD_MIN ? Math.max(MOOD_MIN, r.happiness - hours * DECAY_PER_HOUR) : r.happiness;
  return { happiness: Math.round(h), lastFed: r.last_fed, lastPlayed: r.last_played, lastPetted: r.last_petted };
}

export function addMood(userId, delta, field) {
  const at = now();
  const cur = getMood(userId, at);
  const h = clamp(cur.happiness + delta);
  const col = { feed: 'last_fed', ball: 'last_played', pet: 'last_petted' }[field];
  db.prepare(`INSERT INTO pet_mood (user_id, happiness, updated_at${col ? `, ${col}` : ''}) VALUES (?, ?, ?${col ? ', ?' : ''})
    ON CONFLICT(user_id) DO UPDATE SET happiness = excluded.happiness, updated_at = excluded.updated_at${col ? `, ${col} = excluded.${col}` : ''}`)
    .run(...[userId, h, at, ...(col ? [at] : [])]);
  return Math.round(h);
}

const last = new Map(); // "clave" -> ms de la última vez
function cooled(key, ms, t) {
  const prev = last.get(key) || 0;
  if (t - prev < ms) return Math.ceil((ms - (t - prev)) / 1000);
  last.set(key, t);
  return 0;
}
// Limpieza periódica de enfriamientos viejos
setInterval(() => { const t = Date.now(); for (const [k, v] of last) if (t - v > 30 * 60e3) last.delete(k); }, 10 * 60e3).unref();

const dist = (a, b) => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));

export function initPets(io, socket, userId, presence) {
  const p = presence.get(userId);
  const reply = (ack, r) => { if (typeof ack === 'function') ack(r); };

  // Ánimo de las mascotas de quienes están conectados (para la carita sobre la mascota)
  const moods = {};
  for (const id of presence.keys()) if (petOf(id)) moods[id] = getMood(id).happiness;
  socket.emit('pet:moods', moods);

  // Feliz cuando llega su dueño (primera pestaña) o regresa de "ausente"
  const happy = (delay) => setTimeout(() => {
    if (!presence.has(userId) || !petOf(userId)) return;
    const mood = cooled(`${userId}:happy`, CD.happy, Date.now()) ? getMood(userId).happiness : addMood(userId, GAIN.happy);
    io.emit('pet:action', { kind: 'happy', owner: userId, by: userId, mood });
  }, delay);
  if (p?.sockets.size === 1) happy(1500);
  let prevStatus = p?.status;
  socket.on('state', () => {
    const st = presence.get(userId)?.status;
    if (prevStatus === 'away' && st === 'active') happy(300);
    prevStatus = st;
  });

  socket.on('pet:mood', (ownerId, ack) => {
    const id = Number(ownerId);
    const pet = Number.isInteger(id) && petOf(id);
    if (!pet) return reply(ack, { ok: false, error: 'Esa persona no tiene mascota' });
    reply(ack, { ok: true, ...pet, ...getMood(id) });
  });

  socket.on('pet:action', (m, ack) => {
    const t = Date.now();
    const kind = m?.kind;
    if (!['feed', 'ball', 'pet', 'trick'].includes(kind)) return reply(ack, { ok: false, error: 'Acción inválida' });
    const owner = Number(m.owner ?? userId);
    const pet = Number.isInteger(owner) && petOf(owner);
    if (!pet) return reply(ack, { ok: false, error: 'Esa persona no tiene mascota' });
    const me = presence.get(userId);
    const op = presence.get(owner);
    if (!me || !op) return reply(ack, { ok: false, error: 'Su dueño no está conectado' });
    const isOwner = owner === userId;
    // Solo el dueño alimenta y pide trucos; acariciar y jugar: el dueño o quien esté junto a la mascota
    if ((kind === 'feed' || kind === 'trick') && !isOwner) return reply(ack, { ok: false, error: `Solo su dueño puede ${kind === 'feed' ? 'darle de comer' : 'pedirle trucos'}` });
    if (!isOwner && (me.floorId !== op.floorId || dist(me, op) > NEAR)) return reply(ack, { ok: false, error: `Acércate a ${pet.name} primero` });
    const out = { kind, owner, by: userId };
    if (kind === 'trick') out.trick = TRICKS.includes(m.trick) ? m.trick : TRICKS[Math.floor(Math.random() * TRICKS.length)];
    if (kind === 'ball') {
      // La pelota cae a unas casillas de quien la lanza
      let dx = Math.round(Number(m.x)) - me.x, dy = Math.round(Number(m.y)) - me.y;
      if (!Number.isFinite(dx) || !Number.isFinite(dy) || (dx === 0 && dy === 0)) { dx = { left: -4, right: 4 }[me.dir] || 0; dy = { up: -4, down: 4 }[me.dir] || (dx ? 0 : 4); }
      const k = Math.max(Math.abs(dx), Math.abs(dy)) > BALL_RANGE ? BALL_RANGE / Math.max(Math.abs(dx), Math.abs(dy)) : 1;
      Object.assign(out, { fx: me.x, fy: me.y, x: me.x + Math.round(dx * k), y: me.y + Math.round(dy * k) });
    }
    // Enfriamientos: comer va por mascota; lo demás, por persona
    const wait = kind === 'feed' ? cooled(`${owner}:feed`, CD.feed, t) : cooled(`${userId}:${kind}`, CD[kind], t);
    if (wait) return reply(ack, { ok: false, wait, error: kind === 'feed' ? `${pet.name} ya comió 😋 Intenta en ${wait} s` : 'Espera un momentito' });
    const gain = kind === 'pet' && isOwner ? GAIN.petOwn : GAIN[kind];
    out.mood = addMood(owner, gain, kind);
    // Aviso al dueño cuando alguien más la acaricia (uno por minuto por persona)
    if (kind === 'pet' && !isOwner && !cooled(`${userId}>${owner}:notify`, CD.notify, t)) out.notify = true;
    io.emit('pet:action', out);
    reply(ack, { ok: true, mood: out.mood, trick: out.trick });
  });
}
