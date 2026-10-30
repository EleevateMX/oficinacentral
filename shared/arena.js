// "Arena HUB": reglas puras del shooter jugador contra jugador (sin navegador ni three.js).
// Las usan la simulación del anfitrión (client/src/games/arena/sim.js), el dibujo y las pruebas.
//
// - Modos: Duelo 1v1 (rondas), Todos contra todos, Por equipos y Último en pie (zona que se apaga).
// - Armas: el arsenal de shared/arsenal.js con números ajustados para pelear contra personas.
// - Red: historial de posiciones para "rebobinar" a los blancos (compensación de retraso) y
//   límites que aplica el anfitrión (cadencia, velocidad, dispersión).
import { ARMS, armIndex, TECHNIQUES, clamp, rng, angDiff } from './arsenal.js';
import { CELL, TILE_M } from './zombies.js';

export const MAX_PLAYERS = 8;
export const TEAM_COLORS = ['#FE3377', '#3a86ff'];
export const TEAM_NAMES = ['Rosa', 'Azul'];
export const SEAT_COLORS = ['#FE3377', '#3a86ff', '#FFCC00', '#2bb673', '#ff8a3d', '#8B7BFF', '#4FD8FF', '#f15bb5'];

// ---------- Cuerpo ----------
// Alturas en metros; radios en casillas. Agachado: más bajo, más lento y más preciso.
export const BODY = {
  r: 0.32, // radio para los impactos (un poco más ancho que para chocar)
  stand: { eye: 1.6, top: 1.88, head: 1.43 },
  crouch: { eye: 1.12, top: 1.38, head: 0.96 },
};
export const stanceOf = (cr) => (cr ? BODY.crouch : BODY.stand);
export const MAX_HP = 100;
export const MAX_ARMOR = 100;
export const RUN = 3.3, SPRINT = 5.0, CROUCH_K = 0.5; // casillas por segundo

// ---------- Modos ----------
// limits: opciones que elige el anfitrión (la primera es la de siempre)
export const MODES = {
  duelo: {
    id: 'duelo', name: 'Duelo 1v1', short: 'Duelo', icon: '⚔', min: 2, max: 2, teams: false, respawn: false, rounds: true,
    desc: 'Uno contra uno a rondas. Sin reaparecer: el que cae pierde la ronda.',
    limits: [3, 5, 7], limitLabel: 'Al mejor de', times: [90], roundTime: 90,
  },
  ffa: {
    id: 'ffa', name: 'Todos contra todos', short: 'TCT', icon: '✦', min: 2, max: 8, teams: false, respawn: true,
    desc: 'Cada quien por su cuenta. Gana quien llegue primero al límite de bajas.',
    limits: [20, 10, 30], limitLabel: 'Bajas para ganar', times: [480, 300, 600],
  },
  equipos: {
    id: 'equipos', name: 'Por equipos', short: 'Equipos', icon: '⚑', min: 2, max: 8, teams: true, respawn: true,
    desc: 'Rosa contra Azul, de 2v2 a 4v4. Cada baja suma para tu equipo.',
    limits: [40, 25, 60], limitLabel: 'Bajas del equipo', times: [600, 300, 480],
  },
  royale: {
    id: 'royale', name: 'Último en pie', short: 'Último en pie', icon: '◎', min: 2, max: 8, teams: false, respawn: false, royale: true,
    desc: 'Caes solo con tu espada. Busca armas, chalecos y donas; la zona se apaga desde las orillas.',
    limits: [1], limitLabel: '', times: [0],
  },
};
export const MODE_IDS = Object.keys(MODES);
export const RESPAWN_T = 3.2; // segundos para reaparecer
export const SPAWN_PROT = 2.2; // protección al reaparecer (se pierde al disparar)
export const INTRO_T = 4; // cuenta regresiva
export const ROUND_END_T = 3.5;
export const OVER_T = 20;

// Configuración válida (lo que manda el anfitrión en la sala)
export function cleanConfig(c = {}, maps = []) {
  const mode = MODES[c.mode] ? c.mode : 'ffa';
  const M = MODES[mode];
  const limit = M.limits.includes(Number(c.limit)) ? Number(c.limit) : M.limits[0];
  const time = M.times.includes(Number(c.time)) ? Number(c.time) : M.times[0];
  const map = maps.includes(c.map) ? c.map : maps[0] || 'bodega';
  const bots = clamp(Math.round(Number(c.bots) || 0), 0, MAX_PLAYERS - 1);
  const diff = ['facil', 'normal', 'dificil'].includes(c.diff) ? c.diff : 'normal';
  return { mode, map, limit, time, bots, diff };
}
export const roundsToWin = (limit) => Math.floor(limit / 2) + 1;

// ---------- Armas para jugador contra jugador ----------
// Multiplicador de daño de cada arma contra personas (los zombis tienen menos vida y son más lentos)
export const PVP = {
  dmg: { grapadora: 1, cafetera: 0.85, clavadora: 0.95, toner: 0.9, laser: 0.72, trituradora: 0.7, lanzatazas: 0.55, katana: 0.8, regla: 0.85, carton: 0.75 },
  splash: 0.55, bash: 0.8,
  tech: { dmg: 0.42, cd: 1.8, energy: 0.6, burn: 0.45 },
};
export function pvpDamage(w, dmg) {
  const W = ARMS[w];
  return dmg * (W ? PVP.dmg[W.id] ?? 1 : 1);
}
// La técnica de una espada en la arena: menos daño y más espera
export function pvpTech(T) {
  if (!T) return null;
  return { ...T, dmg: T.dmg * PVP.tech.dmg, cd: T.cd * PVP.tech.cd, burn: T.burn ? { ...T.burn, dps: T.burn.dps * PVP.tech.burn } : null };
}
export const PVP_TECHS = Object.fromEntries(Object.entries(TECHNIQUES).map(([k, T]) => [k, pvpTech(T)]));

// ---------- Equipamiento ----------
export const PRIMARIES = ['toner', 'clavadora', 'cafetera', 'laser', 'trituradora'].map(armIndex);
export const SECONDARIES = ['grapadora', 'lanzatazas'].map(armIndex);
export const MELEES = ['katana', 'regla', 'carton'].map(armIndex);
export const CLASSES = [
  { id: 'asalto', name: 'Asalto', load: ['toner', 'grapadora', 'katana'], desc: 'Equilibrado para media distancia.' },
  { id: 'tirador', name: 'Francotirador', load: ['laser', 'grapadora', 'regla'], desc: 'Un tiro, una baja. Mantén la distancia.' },
  { id: 'escopetero', name: 'Cuerpo a cuerpo', load: ['cafetera', 'grapadora', 'carton'], desc: 'Pasillos, esquinas y mucho café.' },
  { id: 'supresor', name: 'Supresor', load: ['trituradora', 'lanzatazas', 'regla'], desc: 'Llena el pasillo de papel picado.' },
  { id: 'velocista', name: 'Velocista', load: ['clavadora', 'grapadora', 'regla'], desc: 'Rápido, automático y escurridizo.' },
].map((c) => ({ ...c, load: c.load.map(armIndex) }));
export const DEFAULT_LOAD = CLASSES[0].load;

// Equipamiento válido [principal, secundaria, espada]
export function cleanLoadout(l) {
  const a = Array.isArray(l) ? l.map(Number) : [];
  return [PRIMARIES.includes(a[0]) ? a[0] : DEFAULT_LOAD[0], SECONDARIES.includes(a[1]) ? a[1] : DEFAULT_LOAD[1], MELEES.includes(a[2]) ? a[2] : DEFAULT_LOAD[2]];
}

// ---------- Botín (Último en pie) y recogibles ----------
// kind: 'gun' (con su arma), 'ammo', 'armor' (chaleco), 'health' (dona). weight = qué tan seguido sale
export const LOOT = [
  { kind: 'gun', w: 'grapadora', weight: 14 },
  { kind: 'gun', w: 'clavadora', weight: 10 },
  { kind: 'gun', w: 'cafetera', weight: 9 },
  { kind: 'gun', w: 'toner', weight: 8 },
  { kind: 'gun', w: 'lanzatazas', weight: 4 },
  { kind: 'gun', w: 'trituradora', weight: 3 },
  { kind: 'gun', w: 'laser', weight: 3 },
  { kind: 'gun', w: 'katana', weight: 4 },
  { kind: 'gun', w: 'carton', weight: 3 },
  { kind: 'ammo', weight: 16 },
  { kind: 'armor', weight: 11 },
  { kind: 'health', weight: 12 },
];
export const PICKUP = {
  health: { name: 'Dona', heal: 40, respawn: 22 },
  armor: { name: 'Chaleco', armor: 50, respawn: 30 },
  ammo: { name: 'Caja de grapas', respawn: 18 },
  gun: { name: 'Arma', respawn: 0 },
};
// Un premio del botín con rand() en [0, 1)
export function lootPick(rand, table = LOOT) {
  const total = table.reduce((a, l) => a + l.weight, 0);
  let r = clamp(rand(), 0, 0.999999) * total;
  for (const l of table) { r -= l.weight; if (r < 0) return { kind: l.kind, w: l.w ? armIndex(l.w) : -1 }; }
  const l = table[table.length - 1];
  return { kind: l.kind, w: l.w ? armIndex(l.w) : -1 };
}
// Reparte el botín en los lugares (al menos 1 de cada tipo de consumible si caben)
export function rollLoot(spots, seed = 1) {
  const r = rng(seed);
  return spots.map((s, i) => ({ id: i + 1, x: s.x, y: s.y, ...lootPick(r) }));
}

// ---------- Zona (Último en pie): se apaga desde las orillas ----------
// Cada fase: espera `wait` s, luego se cierra en `shrink` s hasta k × el radio inicial. dps fuera.
export const ZONE_PHASES = [
  { wait: 35, shrink: 30, k: 0.68, dps: 3 },
  { wait: 25, shrink: 25, k: 0.42, dps: 6 },
  { wait: 20, shrink: 20, k: 0.22, dps: 10 },
  { wait: 15, shrink: 18, k: 0.07, dps: 16 },
  { wait: 10, shrink: 12, k: 0, dps: 25 },
];
// Plan de la zona: centros de cada fase (cada círculo cabe dentro del anterior). level = { W, H }
export function zonePlan(level, seed = 1, open = null) {
  const r = rng(seed);
  const R0 = Math.hypot(level.W, level.H) / 2 + 1;
  const plan = [{ x: level.W / 2, y: level.H / 2, r: R0 }];
  for (const ph of ZONE_PHASES) {
    const prev = plan[plan.length - 1];
    const nr = R0 * ph.k;
    let best = null;
    for (let k = 0; k < 24; k++) {
      const a = r() * Math.PI * 2, d = r() * Math.max(0, prev.r - nr) * (plan.length === 1 ? 0.25 : 0.6);
      const c = { x: prev.x + Math.cos(a) * d, y: prev.y + Math.sin(a) * d, r: nr };
      // que el centro quede en un lugar donde se pueda estar (si se sabe)
      if (open && !open(c.x, c.y)) continue;
      best = c; break;
    }
    plan.push(best || { x: prev.x, y: prev.y, r: nr });
  }
  return plan;
}
// Zona al tiempo t (s desde que empezó la partida): { x, y, r, phase, shrinking, next (s), dps }
export function zoneAt(plan, t) {
  let acc = 0;
  for (let i = 0; i < ZONE_PHASES.length; i++) {
    const ph = ZONE_PHASES[i], a = plan[i], b = plan[i + 1];
    if (t < acc + ph.wait) return { x: a.x, y: a.y, r: a.r, phase: i, shrinking: false, next: acc + ph.wait - t, dps: i ? ZONE_PHASES[i - 1].dps : 1, to: b };
    acc += ph.wait;
    if (t < acc + ph.shrink) {
      const k = (t - acc) / ph.shrink;
      return { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k, r: a.r + (b.r - a.r) * k, phase: i, shrinking: true, next: acc + ph.shrink - t, dps: ph.dps, to: b };
    }
    acc += ph.shrink;
  }
  const z = plan[plan.length - 1];
  return { x: z.x, y: z.y, r: z.r, phase: ZONE_PHASES.length, shrinking: false, next: 0, dps: ZONE_PHASES[ZONE_PHASES.length - 1].dps, to: z };
}
export const outsideZone = (z, x, y) => Math.hypot(x - z.x, y - z.y) > z.r;
// Daño de la zona en dt segundos a quien está en (x, y)
export const zoneDamage = (z, x, y, dt) => (outsideZone(z, x, y) ? z.dps * dt : 0);

// ---------- Equipos ----------
// Reparte a los jugadores (índices de asiento) en 2 equipos parejos; respeta lo que pidió cada quien si se puede.
// want[seat] = 0 | 1 | null
export function autoBalance(seats, want = {}) {
  const out = {};
  const n = [0, 0];
  const cap = Math.ceil(seats.length / 2);
  const free = [];
  for (const s of seats) {
    const w = want[s];
    if ((w === 0 || w === 1) && n[w] < cap) { out[s] = w; n[w]++; } else free.push(s);
  }
  for (const s of free) { const t = n[0] <= n[1] ? 0 : 1; out[s] = t; n[t]++; }
  // que no queden más de 1 de diferencia
  while (Math.abs(n[0] - n[1]) > 1) {
    const big = n[0] > n[1] ? 0 : 1;
    const mv = [...seats].reverse().find((s) => out[s] === big && want[s] !== big) ?? [...seats].reverse().find((s) => out[s] === big);
    out[mv] = 1 - big; n[big]--; n[1 - big]++;
  }
  return out;
}
// ¿Puede cambiarse a ese equipo? (no más de 1 de diferencia)
export function canSwitchTeam(teams, seat, t) {
  const n = [0, 0];
  for (const [s, v] of Object.entries(teams)) if (Number(s) !== seat && (v === 0 || v === 1)) n[v]++;
  return n[t] + 1 - n[1 - t] <= 1;
}

// ---------- Puntuación y fin ----------
// Resultado de una partida (o null si sigue). st = { mode, limit, clock (s que quedan), scores (por asiento),
// teamScore [a, b], alive (asientos vivos), roundWins (por asiento), players: [{ seat, team, kills, deaths }] }
export function matchResult(st) {
  const M = MODES[st.mode] || MODES.ffa;
  const ps = st.players.filter(Boolean);
  if (M.rounds) {
    const need = roundsToWin(st.limit);
    for (const p of ps) if ((st.roundWins[p.seat] || 0) >= need) return { seat: p.seat, team: null, reason: 'rounds' };
    return null;
  }
  if (M.royale) {
    const alive = st.alive || [];
    if (ps.length >= 2 && alive.length <= 1) return { seat: alive[0] ?? null, team: null, reason: 'last' };
    if (ps.length < 2 && st.started && alive.length <= 1) return { seat: alive[0] ?? null, team: null, reason: 'last' };
    return null;
  }
  if (M.teams) {
    const [a, b] = st.teamScore;
    if (a >= st.limit || b >= st.limit) return { seat: null, team: a >= st.limit ? 0 : 1, reason: 'limit' };
    if (st.clock != null && st.clock <= 0) return { seat: null, team: a === b ? null : a > b ? 0 : 1, reason: 'time' };
    return null;
  }
  // todos contra todos
  const top = [...ps].sort((p, q) => q.kills - p.kills || p.deaths - q.deaths);
  if (top[0] && top[0].kills >= st.limit) return { seat: top[0].seat, team: null, reason: 'limit' };
  if (st.clock != null && st.clock <= 0) {
    const tie = top[1] && top[1].kills === top[0].kills && top[1].deaths === top[0].deaths;
    return { seat: tie ? null : top[0]?.seat ?? null, team: null, reason: 'time' };
  }
  return null;
}
// Ganador de una ronda de duelo: el que sigue vivo; si se acabó el tiempo, el que tiene más vida
export function roundWinner(a, b) {
  if (a.alive && !b.alive) return a.seat;
  if (b.alive && !a.alive) return b.seat;
  const ha = a.hp + a.armor * 0.5, hb = b.hp + b.armor * 0.5;
  if (Math.abs(ha - hb) < 0.5) return null;
  return ha > hb ? a.seat : b.seat;
}
// Puntos para elegir al mejor de la partida
export const mvpScore = (p, won) => p.kills * 2 + (p.assists || 0) - p.deaths * 0.5 + (won ? 4 : 0) + (p.dmg || 0) / 400;
export function pickMvp(players, isWinner) {
  let best = null, bv = -Infinity;
  for (const p of players) { if (!p) continue; const v = mvpScore(p, isWinner(p)); if (v > bv || (v === bv && (p.dmg || 0) > (best?.dmg || 0))) { bv = v; best = p; } }
  return best?.seat ?? null;
}

// Medallas y rachas que salen al hacer una baja
export const STREAKS = { 3: '¡En racha!', 5: '¡Imparable!', 7: '¡Leyenda de oficina!', 10: '¡Jefe de jefes!' };
export const MULTI = { 2: '¡Doble baja!', 3: '¡Triple baja!', 4: '¡Baja cuádruple!' };
export const MULTI_WINDOW = 3.5;

// ---------- Progreso (XP y niveles, se guardan en el servidor) ----------
export const XP = { match: 100, kill: 50, head: 25, win: 300 };
// XP de una partida. bots = solo hubo bots (práctica): la mitad.
export function matchXp({ kills = 0, hs = 0, won = false, bots = false } = {}) {
  const xp = XP.match + kills * XP.kill + Math.min(hs, kills) * XP.head + (won ? XP.win : 0);
  return Math.round(bots ? xp / 2 : xp);
}
// Nivel n necesita 500·n·(n-1)/2 de XP acumulada (nivel 1 = 0, 2 = 500, 3 = 1500, 4 = 3000…)
export const xpForLevel = (n) => 250 * n * (n - 1);
export function levelFor(xp) {
  let n = Math.max(1, Math.floor((1 + Math.sqrt(1 + (4 * Math.max(0, xp)) / 250)) / 2));
  while (xpForLevel(n + 1) <= xp) n++;
  while (n > 1 && xpForLevel(n) > xp) n--;
  return Math.min(99, n);
}
export function levelProgress(xp) {
  const n = levelFor(xp);
  const a = xpForLevel(n), b = xpForLevel(n + 1);
  return { level: n, into: xp - a, need: b - a, k: (xp - a) / (b - a) };
}
export const RANK_NAMES = ['Becario', 'Asistente', 'Analista', 'Coordinador', 'Gerente', 'Director', 'Vicepresidente', 'CEO'];
export const rankName = (lvl) => RANK_NAMES[Math.min(RANK_NAMES.length - 1, Math.floor((lvl - 1) / 4))];

// ---------- Mapa: rayos que respetan los muebles altos ----------
// level.tall[i] = 1 si el mueble de esa casilla tapa de pie (estantes, máquinas); los bajos se brincan con la bala.
export function arenaRay(level, x, y, ang, max = 60) {
  const dx = Math.cos(ang), dy = Math.sin(ang);
  let i = Math.floor(x), j = Math.floor(y);
  const sx = dx > 0 ? 1 : -1, sy = dy > 0 ? 1 : -1;
  const tdx = Math.abs(1 / (dx || 1e-9)), tdy = Math.abs(1 / (dy || 1e-9));
  let tx = (dx > 0 ? i + 1 - x : x - i) * tdx, ty = (dy > 0 ? j + 1 - y : y - j) * tdy;
  let t = 0, low = Infinity;
  while (t < max) {
    if (tx < ty) { t = tx; tx += tdx; i += sx; } else { t = ty; ty += tdy; j += sy; }
    const out = i < 0 || j < 0 || i >= level.W || j >= level.H;
    const k = j * level.W + i;
    const c = out ? CELL.WALL : level.grid[k];
    if (c === CELL.WALL || c === CELL.GLASS || c === CELL.PORTAL) return { t, low };
    if (c === CELL.SOLID) { if (level.tall?.[k]) return { t, low }; if (low === Infinity) low = t; }
  }
  return { t: max, low };
}
// ¿Se ven? (por encima de los muebles bajos sí; los altos tapan)
export function arenaLos(level, ax, ay, bx, by) {
  const d = Math.hypot(bx - ax, by - ay);
  if (d < 1e-6) return true;
  return arenaRay(level, ax, ay, Math.atan2(by - ay, bx - ax), d + 0.01).t >= d;
}
// Altura de la cobertura baja (m): debajo de esto, un mueble bajo tapa la bala
export const LOW_COVER = 0.98;

// Disparo contra personas. targets = [{ seat, x, y, cr }]; shot = { x, y, a, p, h (altura del ojo, m) }
// Devuelve el primero que pega antes del muro: { hit: target|null, d, h, head, x, y }
export function traceShot(level, targets, shot, maxD = 60) {
  const wall = arenaRay(level, shot.x, shot.y, shot.a, maxD);
  const ca = Math.cos(shot.a), sa = Math.sin(shot.a), tp = Math.tan(shot.p);
  const eye = shot.h ?? BODY.stand.eye;
  let best = null;
  for (const t of targets) {
    const ox = t.x - shot.x, oy = t.y - shot.y;
    const along = ox * ca + oy * sa;
    if (along <= 0) continue;
    const perp = Math.abs(-ox * sa + oy * ca);
    const r = t.r || BODY.r;
    if (perp > r) continue;
    const d = Math.max(0.01, along - Math.sqrt(Math.max(0, r * r - perp * perp)));
    if (d > wall.t || (best && d > best.d)) continue;
    const hgt = eye + tp * d * TILE_M;
    const st = stanceOf(t.cr);
    if (hgt < 0 || hgt > st.top + 0.04) continue;
    if (d > wall.low && hgt < LOW_COVER) continue; // tapado por un mueble bajo
    best = { t, d, h: hgt, head: hgt >= st.head };
  }
  if (best) return { hit: best.t, d: best.d, h: best.h, head: best.head, x: shot.x + ca * best.d, y: shot.y + sa * best.d };
  let d = wall.t, h = eye + tp * d * TILE_M;
  if (h < 0) { d = -eye / tp / TILE_M; h = 0; } else if (h > 5.4) { d = (5.4 - eye) / tp / TILE_M; h = 5.4; }
  return { hit: null, d, h, head: false, x: shot.x + ca * d, y: shot.y + sa * d };
}

// ---------- Lugares para aparecer ----------
// spawns = [{ x, y, a, team? }]; enemies/friends = [{ x, y }]; los(ax,ay,bx,by). Devuelve el índice.
// Lejos de los enemigos y fuera de su vista; en equipos, cerca de tu lado.
export function spawnScore(s, { enemies = [], friends = [], los = null, team = null, occupied = [] } = {}) {
  let near = 40;
  let seen = false;
  for (const e of enemies) {
    const d = Math.hypot(e.x - s.x, e.y - s.y);
    near = Math.min(near, d);
    if (!seen && d < 45 && (!los || los(e.x, e.y, s.x, s.y))) seen = true;
  }
  let sc = Math.min(near, 26);
  if (seen) sc -= 100;
  if (near < 4) sc -= 40;
  if (team != null && s.team != null) sc += s.team === team ? 6 : -8;
  if (team != null && friends.length) { const f = Math.min(...friends.map((p) => Math.hypot(p.x - s.x, p.y - s.y))); if (f < 9) sc += 3; }
  if (occupied.some((p) => Math.hypot(p.x - s.x, p.y - s.y) < 1.2)) sc -= 200;
  return sc;
}
export function chooseSpawn(spawns, opts = {}) {
  const rand = opts.rand || Math.random;
  const scored = spawns.map((s, i) => ({ i, v: spawnScore(s, opts) + rand() * 2.5 }));
  scored.sort((a, b) => b.v - a.v);
  return scored[0]?.i ?? 0;
}

// ---------- Compensación de retraso ----------
// Historial corto de posiciones (por jugador) en la hora del anfitrión (ms).
export class PosHistory {
  constructor(cap = 90) { this.cap = cap; this.buf = []; }
  push(t, x, y, cr = 0, alive = true) {
    const last = this.buf[this.buf.length - 1];
    if (last && t <= last.t) { last.x = x; last.y = y; last.cr = cr; last.alive = alive; return; }
    this.buf.push({ t, x, y, cr, alive });
    if (this.buf.length > this.cap) this.buf.shift();
  }
  clear() { this.buf.length = 0; }
  get latest() { return this.buf[this.buf.length - 1] || null; }
  // Dónde estaba a la hora t (interpolado entre los dos más cercanos)
  at(t) {
    const b = this.buf;
    if (!b.length) return null;
    if (t >= b[b.length - 1].t) return { ...b[b.length - 1] };
    if (t <= b[0].t) return { ...b[0] };
    let lo = 0, hi = b.length - 1;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (b[m].t <= t) lo = m; else hi = m; }
    const A = b[lo], B = b[hi];
    const k = (t - A.t) / Math.max(1e-6, B.t - A.t);
    // si "saltó" (reapareció), no se interpola
    if (Math.hypot(B.x - A.x, B.y - A.y) > 2.5) return { ...(k < 0.5 ? A : B) };
    return { t, x: A.x + (B.x - A.x) * k, y: A.y + (B.y - A.y) * k, cr: k < 0.5 ? A.cr : B.cr, alive: k < 0.5 ? A.alive : B.alive };
  }
}
export const MAX_REWIND = 300; // ms: no se rebobina más que esto
// Hora a la que se rebobina un disparo (la que veía quien disparó), dentro de lo permitido
export const rewindTime = (now, rt) => (Number.isFinite(rt) ? clamp(rt, now - MAX_REWIND, now) : now);

// ---------- Límites del anfitrión (contra trampas) ----------
// Cadencia: cubeta de fichas por arma. Cada disparo gasta una; se rellenan al ritmo del arma (+25%).
export function fireGate() { return { tok: {}, at: {} }; }
export function gateAllow(g, w, now) {
  const W = ARMS[w];
  if (!W || W.kind !== 'gun') return false;
  const burst = W.burst || 1;
  // una ráfaga cabe, pero no una cuarta bala pegada a ella
  const cap = burst > 1 ? burst - 0.5 : 1.6;
  const cycle = W.every + (W.burst ? W.burst * W.burstEvery : 0);
  const rate = (burst / cycle) * 1.25; // fichas por segundo
  const last = g.at[w] ?? -1e9;
  const tok = Math.min(cap, (g.tok[w] ?? cap) + ((now - last) / 1000) * rate);
  if (tok < 1) { g.tok[w] = tok; g.at[w] = now; return false; }
  g.tok[w] = tok - 1; g.at[w] = now;
  return true;
}
// Hora (del anfitrión) a la que se disparó: la del cliente (ct) más el menor retraso visto, para que
// las balas que llegan juntas por la red no cuenten como disparadas juntas. Nunca más de 1 s atrás.
// syncClock: con todas las balas de un paquete antes de procesarlas (la última da el retraso real).
export function syncClock(P, ct, now) {
  if (!Number.isFinite(ct)) return;
  const off = now - ct;
  P.ctOff = P.ctOff == null ? off : Math.min(P.ctOff, off);
}
export function shotTime(P, ct, now) {
  if (!Number.isFinite(ct)) return now;
  syncClock(P, ct, now);
  const t = clamp(ct + P.ctOff, now - 1000, now);
  P.lastShotT = Math.max(P.lastShotT ?? -1e12, t);
  return P.lastShotT;
}
// Velocidad: cada quien tiene un "presupuesto" de distancia que se llena con el tiempo.
export const MOVE_SLACK = 0.35;
export const maxSpeed = (w) => SPRINT * (ARMS[w]?.slow ? Math.max(ARMS[w].slow, 0.9) : 1) * 1.3;
// ¿Acepta el anfitrión ir de (P.x, P.y) a (nx, ny)? Gasta el presupuesto si sí.
export function acceptMove(P, nx, ny) {
  if (!Number.isFinite(nx) || !Number.isFinite(ny)) return false;
  const d = Math.hypot(nx - P.x, ny - P.y);
  if (d <= (P.budget ?? 0) + 0.02) { P.budget = Math.max(0, (P.budget ?? 0) - d); return true; }
  return false;
}
export function refillBudget(P, dt) {
  P.budget = Math.min(MOVE_SLACK + maxSpeed(P.w) * 0.6, (P.budget ?? 0) + maxSpeed(P.w) * dt);
}

// Ángulo entre lo que mira alguien y un punto (para la vista de los bots)
export const offAngle = (a, fx, fy, tx, ty) => Math.abs(angDiff(a, Math.atan2(ty - fy, tx - fx)));
