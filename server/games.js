// Juegos de la sala de juegos (ping pong, billar, futbolito, arcade).
// Cada mesa es un "cuarto": hasta 2 jugadores sentados y el resto mira.
// El jugador del asiento 0 es el anfitrión: corre la física y manda el estado;
// el otro solo manda sus controles. El servidor solo reparte mensajes.
import { db, now } from './db.js';

export const GAME_OF = { pingPong: 'pong', poolTable: 'pool', foosball: 'foosball', arcade: 'arcade' };
const rooms = new Map(); // objectId -> { game, seats: [uid|null, uid|null], members: Set<uid> }

function gameOfObject(id) {
  const r = db.prepare('SELECT type FROM objects WHERE id = ?').get(id);
  return r ? GAME_OF[r.type] || null : null;
}

const roomKey = (id) => `game:${id}`;
const view = (id, r) => ({ objectId: id, game: r.game, seats: r.seats, watchers: [...r.members].filter((u) => !r.seats.includes(u)) });

function leave(io, id, userId) {
  const r = rooms.get(id);
  if (!r) return;
  r.members.delete(userId);
  const seat = r.seats.indexOf(userId);
  if (seat >= 0) {
    r.seats[seat] = null;
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
  if (!r.members.size) rooms.delete(id);
  else io.to(roomKey(id)).emit('game:room', view(id, r));
}

export function initGames(io, socket, userId) {
  const joined = new Set();
  socket.on('game:join', (raw) => {
    const id = Number(raw);
    const game = gameOfObject(id);
    if (!game) return;
    let r = rooms.get(id);
    if (!r) { r = { game, seats: [null, null], members: new Set() }; rooms.set(id, r); }
    r.members.add(userId);
    // El arcade es de una sola persona
    const maxSeats = game === 'arcade' ? 1 : 2;
    if (!r.seats.includes(userId)) {
      const free = r.seats.slice(0, maxSeats).indexOf(null);
      if (free >= 0) r.seats[free] = userId;
    }
    joined.add(id);
    socket.join(roomKey(id));
    io.to(roomKey(id)).emit('game:room', view(id, r));
  });
  socket.on('game:leave', (raw) => {
    const id = Number(raw);
    joined.delete(id);
    socket.leave(roomKey(id));
    leave(io, id, userId);
  });
  // Controles del invitado → al anfitrión
  socket.on('game:input', (m) => {
    const id = Number(m?.objectId);
    const r = rooms.get(id);
    if (!r || r.seats[1] !== userId || r.seats[0] == null) return;
    io.to(`user:${r.seats[0]}`).volatile.emit('game:input', { objectId: id, seat: 1, data: m.data });
  });
  // Estado del anfitrión → a todos los demás
  socket.on('game:state', (m) => {
    const id = Number(m?.objectId);
    const r = rooms.get(id);
    if (!r || r.seats[0] !== userId) return;
    socket.to(roomKey(id)).volatile.emit('game:state', { objectId: id, data: m.data });
  });
  // Eventos que no se pueden perder (gol, fin de partida, tiro de billar)
  socket.on('game:event', (m) => {
    const id = Number(m?.objectId);
    const r = rooms.get(id);
    if (!r || !r.seats.includes(userId)) return;
    socket.to(roomKey(id)).emit('game:event', { objectId: id, seat: r.seats.indexOf(userId), data: m.data });
    // Fin de partida entre dos personas: el anfitrión dice quién ganó y se cuenta la victoria
    const w = Number(m.data?.winner);
    if (m.data?.type === 'end' && r.seats[0] === userId && r.seats[1] != null && (w === 0 || w === 1) && r.game !== 'arcade') {
      const t = Date.now();
      if (t - (r.lastEnd || 0) < 15e3) return; // una partida no termina dos veces seguidas
      r.lastEnd = t;
      addScore(r.seats[w], r.game, 1);
      io.to(roomKey(id)).emit('game:win', { objectId: id, game: r.game, winner: r.seats[w], loser: r.seats[1 - w], score: String(m.data.score || '').slice(0, 20) });
    }
  });
  socket.on('disconnect', () => { for (const id of joined) leave(io, id, userId); });
}

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

export const SCORE_GAMES = ['arcade', 'pong', 'pool', 'foosball'];

export function addScore(userId, game, score) {
  db.prepare('INSERT INTO game_scores (user_id, game, score, created_at) VALUES (?, ?, ?, ?)').run(userId, game, score, now());
}

// Arcade: mejor puntuación de cada persona. Mesas: partidas ganadas.
export function topScores(game, limit = 10) {
  const sql = game === 'arcade'
    ? 'SELECT user_id AS userId, MAX(score) AS score FROM game_scores WHERE game = ? GROUP BY user_id ORDER BY score DESC LIMIT ?'
    : 'SELECT user_id AS userId, COUNT(*) AS score FROM game_scores WHERE game = ? GROUP BY user_id ORDER BY score DESC LIMIT ?';
  return db.prepare(sql).all(game, limit);
}
