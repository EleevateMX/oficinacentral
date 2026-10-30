// Arena HUB en el servidor: progreso (XP y nivel), tablas de victorias y bajas, y la voz por equipo.
// La partida la corre el anfitrión (cliente) como en Zombies; aquí solo se guarda lo que importa.
//  - POST /api/arena/result: cada jugador manda su resultado al terminar (se limita y se recorta).
//  - GET /api/arena/profiles?ids=1,2: nivel y totales de varios jugadores (para la sala).
//  - socket 'arena:teams': el anfitrión dice de qué equipo es cada quien (la voz se separa por equipo).
import { db, now } from './db.js';
import { _rooms, addScore, gameHooks } from './games.js';
import { matchXp, levelFor, MODES } from '../shared/arena.js';

db.exec(`
CREATE TABLE IF NOT EXISTS arena_stats (
  user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  xp INTEGER NOT NULL DEFAULT 0,
  matches INTEGER NOT NULL DEFAULT 0,
  wins INTEGER NOT NULL DEFAULT 0,
  kills INTEGER NOT NULL DEFAULT 0,
  deaths INTEGER NOT NULL DEFAULT 0,
  headshots INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL DEFAULT 0
);
`);

const MAX_KILLS = 80;
const RESULT_EVERY_MS = 20e3; // una partida no termina más seguido que esto
const lastResult = new Map();

const int = (v, max) => Math.max(0, Math.min(max, Math.trunc(Number(v)) || 0));

export function arenaProfile(userId) {
  const r = db.prepare('SELECT xp, matches, wins, kills, deaths, headshots FROM arena_stats WHERE user_id = ?').get(userId);
  const s = r || { xp: 0, matches: 0, wins: 0, kills: 0, deaths: 0, headshots: 0 };
  return { ...s, level: levelFor(s.xp) };
}

// ¿Está (o estaba hasta hace poco) sentado en una máquina de la Arena?
function seatedInArena(userId, objectId) {
  const r = _rooms.get(Number(objectId));
  return !!r && r.game === 'arena' && r.seats.includes(userId);
}

// Guarda el resultado de una partida. body = { objectId, kills, pk (bajas a personas), deaths, hs, won, humans, mode }
export function recordResult(userId, body = {}, t = Date.now()) {
  if (!seatedInArena(userId, body.objectId)) return { error: 403, msg: 'No estás en la Arena' };
  if (t - (lastResult.get(userId) || 0) < RESULT_EVERY_MS) return { error: 429, msg: 'Espera un momento' };
  lastResult.set(userId, t);
  const kills = int(body.kills, MAX_KILLS);
  const pk = Math.min(kills, int(body.pk, MAX_KILLS));
  const deaths = int(body.deaths, 200);
  const hs = Math.min(kills, int(body.hs, MAX_KILLS));
  const humans = int(body.humans, 8);
  const won = !!body.won;
  const practice = humans < 2; // solo contra bots: cuenta para tu nivel (la mitad), no para las tablas
  const xp = matchXp({ kills, hs, won, bots: practice });
  const before = arenaProfile(userId);
  db.prepare(`INSERT INTO arena_stats (user_id, xp, matches, wins, kills, deaths, headshots, updated_at) VALUES (?, ?, 1, ?, ?, ?, ?, ?)
    ON CONFLICT(user_id) DO UPDATE SET xp = xp + excluded.xp, matches = matches + 1, wins = wins + excluded.wins, kills = kills + excluded.kills,
    deaths = deaths + excluded.deaths, headshots = headshots + excluded.headshots, updated_at = excluded.updated_at`)
    .run(userId, xp, won && !practice ? 1 : 0, pk, deaths, hs, now());
  if (!practice) {
    if (won) addScore(userId, 'arena', 1);
    if (pk > 0) addScore(userId, 'arena_kills', pk);
  }
  const after = arenaProfile(userId);
  return { ok: true, xp, practice, mode: MODES[body.mode] ? body.mode : null, profile: after, levelUp: after.level > before.level ? after.level : null };
}

export function registerArenaRoutes(api, { wrap, fail }) {
  api.post('/arena/result', wrap((req, res) => {
    const r = recordResult(req.user.id, req.body || {});
    if (r.error) return fail(res, r.error, r.msg);
    res.json(r);
  }));
  api.get('/arena/profiles', (req, res) => {
    const ids = String(req.query.ids || '').split(',').map(Number).filter((n) => Number.isInteger(n) && n > 0).slice(0, 16);
    const out = {};
    for (const id of ids) out[id] = arenaProfile(id);
    res.json({ profiles: out });
  });
}

// Voz por equipo: el anfitrión de la partida manda { objectId, teams: { userId: 0 | 1 | null } }
export function initArena(io, socket, userId) {
  socket.on('arena:teams', (m) => {
    const r = _rooms.get(Number(m?.objectId));
    if (!r || r.game !== 'arena' || r.host !== userId || !m.teams || typeof m.teams !== 'object') return;
    for (const uid of r.seats) {
      if (!uid) continue;
      const t = m.teams[uid];
      gameHooks.team(uid, t === 0 || t === 1 ? t : null);
    }
  });
}

// Para pruebas
export const _arenaReset = () => lastResult.clear();
