// Juegos de la sala de juegos (ping pong, billar, futbolito, arcade y Zombies en la oficina).
// Cada mesa es un "cuarto": hasta 2 jugadores sentados (el arcade, 1; Zombies, 4) y el resto mira.
// El anfitrión corre la física y manda el estado; los demás solo mandan sus controles.
// El servidor solo reparte mensajes.
//  - Mesas de 2: el anfitrión es el asiento 0; si se va, el otro pasa al asiento 0.
//  - Zombies: cada quien conserva su asiento (0–3); el anfitrión es room.host y, si se va,
//    pasa al siguiente jugador (él rearma la partida con el último estado que recibió).
//    Quien entra a jugar "sale de la sala": deja de verse en el mapa y de oírse (ver hooks).
import { db, now } from './db.js';

export const GAME_OF = { pingPong: 'pong', poolTable: 'pool', foosball: 'foosball', arcade: 'arcade', zombieArcade: 'zombies', kartArcade: 'karts', arenaArcade: 'arena' };
export const MAX_SEATS = { arcade: 1, zombies: 4, karts: 8, arena: 8 };
// Juegos "de sala" (Zombies y Karts): asientos fijos, anfitrión que pasa al siguiente y quien juega sale de la oficina
export const SQUAD_GAMES = new Set(['zombies', 'karts', 'arena']);
const seatsFor = (game) => MAX_SEATS[game] || 2;
const rooms = new Map(); // objectId -> { game, seats: [uid|null…], host, members: Set<uid>, floorId }

// realtime.js engancha aquí la presencia: quien se sienta en Zombies sale de la sala y vuelve al irse
export const gameHooks = { seated: (uid, info) => {}, unseated: (uid) => {}, live: (list) => {}, team: (uid, team) => {} }; // eslint-disable-line no-unused-vars

// Arena por equipos: cada equipo se oye solo a sí mismo (null = sin equipo, oye a toda la partida)
export const sameTeam = (ga, gb) => ga?.team == null || gb?.team == null || ga.team === gb.team;

function objectInfo(id) {
  const r = db.prepare('SELECT type, floor_id FROM objects WHERE id = ?').get(id);
  return r ? { game: GAME_OF[r.type] || null, floorId: r.floor_id } : null;
}

const roomKey = (id) => `game:${id}`;
const hostOf = (r) => (SQUAD_GAMES.has(r.game) ? r.host : r.seats[0]);
const view = (id, r) => ({ objectId: id, game: r.game, seats: r.seats, host: hostOf(r) ?? null, watchers: [...r.members].filter((u) => !r.seats.includes(u)) });

// Partidas de Zombies en curso (para que cualquiera pueda unirse)
export function liveMatches() {
  const out = [];
  for (const [id, r] of rooms) {
    if (!SQUAD_GAMES.has(r.game)) continue;
    const players = r.seats.filter(Boolean);
    if (players.length) out.push({ objectId: id, floorId: r.floorId, game: r.game, players, max: r.seats.length });
  }
  return out;
}
const emitLive = () => gameHooks.live(liveMatches());

function seatOf(r, uid) { return r.seats.indexOf(uid); }

function sit(io, id, r, uid) {
  if (r.seats.includes(uid)) return true;
  const free = r.seats.indexOf(null);
  if (free < 0) return false;
  r.seats[free] = uid;
  if (SQUAD_GAMES.has(r.game)) {
    if (r.host == null || !r.seats.includes(r.host)) r.host = uid;
    gameHooks.seated(uid, { game: r.game, objectId: id, floorId: r.floorId });
    emitLive();
  }
  return true;
}

function leave(io, id, userId) {
  const r = rooms.get(id);
  if (!r) return;
  r.members.delete(userId);
  const seat = seatOf(r, userId);
  if (seat >= 0) {
    r.seats[seat] = null;
    if (SQUAD_GAMES.has(r.game)) {
      gameHooks.unseated(userId);
      // el anfitrión pasa al siguiente jugador (el de asiento más bajo)
      if (r.host === userId) r.host = r.seats.find(Boolean) ?? null;
      emitLive();
    } else {
      // Si se fue el anfitrión, el otro jugador pasa al asiento 0
      if (seat === 0 && r.seats[1] != null) { r.seats[0] = r.seats[1]; r.seats[1] = null; }
      // Alguien que miraba toma el asiento libre
      for (const u of r.members) {
        if (r.seats.includes(u)) continue;
        const free = r.seats.indexOf(null);
        if (free < 0) break;
        r.seats[free] = u;
      }
    }
  }
  if (!r.members.size) rooms.delete(id);
  else io.to(roomKey(id)).emit('game:room', view(id, r));
}

export function initGames(io, socket, userId) {
  const joined = new Set();
  socket.on('game:join', (raw) => {
    const id = Number(typeof raw === 'object' && raw ? raw.objectId : raw);
    const watch = !!(raw && typeof raw === 'object' && raw.watch);
    const info = objectInfo(id);
    if (!info?.game) return;
    let r = rooms.get(id);
    if (!r) { r = { game: info.game, seats: Array(seatsFor(info.game)).fill(null), host: null, members: new Set(), floorId: info.floorId }; rooms.set(id, r); }
    r.members.add(userId);
    // Lleno (o quiere solo mirar): queda como espectador
    if (!watch) sit(io, id, r, userId);
    joined.add(id);
    socket.join(roomKey(id));
    io.to(roomKey(id)).emit('game:room', view(id, r));
  });
  // Un espectador toma un asiento libre (Zombies: "Unirse a la partida")
  socket.on('game:sit', (raw) => {
    const id = Number(raw);
    const r = rooms.get(id);
    if (!r || !r.members.has(userId)) return;
    if (sit(io, id, r, userId)) io.to(roomKey(id)).emit('game:room', view(id, r));
  });
  socket.on('game:leave', (raw) => {
    const id = Number(raw);
    joined.delete(id);
    socket.leave(roomKey(id));
    leave(io, id, userId);
  });
  // Controles de un invitado → al anfitrión
  socket.on('game:input', (m) => {
    const id = Number(m?.objectId);
    const r = rooms.get(id);
    const host = r && hostOf(r);
    const seat = r ? seatOf(r, userId) : -1;
    if (!r || seat < 0 || host == null || host === userId) return;
    io.to(`user:${host}`).volatile.emit('game:input', { objectId: id, seat, data: m.data });
  });
  // Estado del anfitrión → a todos los demás
  socket.on('game:state', (m) => {
    const id = Number(m?.objectId);
    const r = rooms.get(id);
    if (!r || hostOf(r) !== userId) return;
    socket.to(roomKey(id)).volatile.emit('game:state', { objectId: id, data: m.data });
  });
  // Eventos que no se pueden perder (gol, fin de partida, tiro de billar, disparos de Zombies)
  socket.on('game:event', (m) => {
    const id = Number(m?.objectId);
    const r = rooms.get(id);
    if (!r || !r.seats.includes(userId)) return;
    socket.to(roomKey(id)).emit('game:event', { objectId: id, seat: r.seats.indexOf(userId), data: m.data });
    // Fin de partida entre dos personas: el anfitrión dice quién ganó y se cuenta la victoria
    const w = Number(m.data?.winner);
    if (m.data?.type === 'end' && r.seats[0] === userId && r.seats[1] != null && (w === 0 || w === 1) && r.game !== 'arcade' && !SQUAD_GAMES.has(r.game)) {
      const t = Date.now();
      if (t - (r.lastEnd || 0) < 15e3) return; // una partida no termina dos veces seguidas
      r.lastEnd = t;
      addScore(r.seats[w], r.game, 1);
      io.to(roomKey(id)).emit('game:win', { objectId: id, game: r.game, winner: r.seats[w], loser: r.seats[1 - w], score: String(m.data.score || '').slice(0, 20) });
    }
  });
  // Ping de los juegos (para el indicador de red): solo responde
  socket.on('game:ping', (_x, cb) => { if (typeof cb === 'function') cb(); });
  socket.emit('games:live', liveMatches());
  socket.on('disconnect', () => { for (const id of joined) leave(io, id, userId); });
}

// Para pruebas
export const _rooms = rooms;

// ---------- Puntuaciones ----------
db.exec(`
CREATE TABLE IF NOT EXISTS game_scores (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  game TEXT NOT NULL,
  score INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_game_scores ON game_scores(game, score DESC);
`);

// Karts: mejor vuelta (en milisegundos, menos es mejor) de cada pista
export const TIME_GAMES = ['karts_oficina', 'karts_juegos', 'karts_torre'];
// Arena HUB: 'arena' cuenta partidas ganadas (contra personas) y 'arena_kills' suma las bajas
export const SUM_GAMES = ['arena_kills'];
export const SCORE_GAMES = ['arcade', 'pong', 'pool', 'foosball', 'zombies', ...TIME_GAMES, 'arena', ...SUM_GAMES];
// Juegos de puntuación (mejor marca de cada persona); los demás cuentan partidas ganadas
export const POINT_GAMES = ['arcade', 'zombies'];

export function addScore(userId, game, score) {
  db.prepare('INSERT INTO game_scores (user_id, game, score, created_at) VALUES (?, ?, ?, ?)').run(userId, game, score, now());
}

// Arcade y Zombies: mejor puntuación de cada persona. Mesas: partidas ganadas.
export function topScores(game, limit = 10) {
  const sql = SUM_GAMES.includes(game)
    ? 'SELECT user_id AS userId, SUM(score) AS score FROM game_scores WHERE game = ? GROUP BY user_id ORDER BY score DESC LIMIT ?'
    : TIME_GAMES.includes(game)
    ? 'SELECT user_id AS userId, MIN(score) AS score FROM game_scores WHERE game = ? GROUP BY user_id ORDER BY score ASC LIMIT ?'
    : POINT_GAMES.includes(game)
    ? 'SELECT user_id AS userId, MAX(score) AS score FROM game_scores WHERE game = ? GROUP BY user_id ORDER BY score DESC LIMIT ?'
    : 'SELECT user_id AS userId, COUNT(*) AS score FROM game_scores WHERE game = ? GROUP BY user_id ORDER BY score DESC LIMIT ?';
  return db.prepare(sql).all(game, limit);
}

// Tu mejor marca y tu lugar en la tabla (juegos de puntos); null si aún no tienes
export function bestOf(userId, game) {
  if (!POINT_GAMES.includes(game) || !userId) return null;
  const r = db.prepare('SELECT MAX(score) AS score FROM game_scores WHERE game = ? AND user_id = ?').get(game, userId);
  if (r?.score == null) return null;
  const above = db.prepare('SELECT COUNT(*) AS n FROM (SELECT MAX(score) AS s FROM game_scores WHERE game = ? GROUP BY user_id) WHERE s > ?').get(game, r.score);
  return { score: r.score, rank: (above?.n || 0) + 1 };
}
