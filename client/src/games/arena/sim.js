// Simulación de "Arena HUB" (jugador contra jugador). La corre el anfitrión con paso fijo de 60 Hz;
// los demás mandan su posición (la mueven en su computadora, sin retraso) y sus disparos, y el
// anfitrión lo valida todo: cadencia, balas, velocidad, dispersión y daño. Sin DOM ni three.js.
import { CELL, TILE_M, PLAYER_R, moveCircle, cellAt, distanceField } from '../../../../shared/zombies.js';
import {
  ARMS, BASH, isSword, falloff, pelletDirs, spreadLimits, arcHits, pathHits, techPath, swingOf, energyGain, clamp, rng, angDiff, ENERGY_MAX,
} from '../../../../shared/arsenal.js';
import {
  MAX_PLAYERS, MODES, BODY, stanceOf, MAX_HP, MAX_ARMOR, RUN, SPRINT, CROUCH_K, RESPAWN_T, SPAWN_PROT, INTRO_T, ROUND_END_T, OVER_T,
  cleanConfig, cleanLoadout, roundsToWin, pvpDamage, PVP, PVP_TECHS, PICKUP, rollLoot, zonePlan, zoneAt, autoBalance, matchResult, roundWinner, pickMvp,
  MULTI_WINDOW, canSwitchTeam, arenaRay, arenaLos, traceShot, chooseSpawn, PosHistory, rewindTime, fireGate, gateAllow, acceptMove, refillBudget, offAngle, shotTime,
} from '../../../../shared/arena.js';
import { MAP_IDS, lookOut } from '../../../../shared/arenaMaps.js';

export const PHASES = ['lobby', 'intro', 'live', 'round', 'over'];
export const PICK_KINDS = ['health', 'armor', 'ammo', 'gun'];
export const BOT_NAMES = ['Post-it', 'Clip', 'Tóner', 'Folder', 'Corrector', 'Sacapuntas', 'Resaltador', 'Engrapa'];
export const DIFF = {
  facil: { react: 0.55, err: 0.11, turn: 3.2, cone: 0.09, range: 20, strafe: 0.4 },
  normal: { react: 0.34, err: 0.055, turn: 5.5, cone: 0.06, range: 28, strafe: 0.75 },
  dificil: { react: 0.2, err: 0.028, turn: 8.5, cone: 0.04, range: 36, strafe: 1 },
};
const r2 = (v) => Math.round(v * 100) / 100;
const q2 = (v) => Math.round(v * 100);
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

// ---------- Jugadores ----------
export function newPlayer(seat, { bot = false, load = null, name = null } = {}) {
  const l = cleanLoadout(load);
  return {
    seat, bot, name, team: seat % 2, wantTeam: null, load: l, owned: ARMS.map((_, i) => l.includes(i)), mag: ARMS.map((w) => w.mag || 0), res: ARMS.map((w) => w.reserve || 0),
    w: l[0], x: 0, y: 0, a: 0, p: 0, cr: 0, mv: 0, hp: MAX_HP, armor: 0, alive: false, spec: false, respawnT: 0.5, prot: 0, sp: 0, budget: 1,
    kills: 0, deaths: 0, assists: 0, hs: 0, shots: 0, hits: 0, dmg: 0, streak: 0, best: 0, multi: 0, lastKillT: -99, energy: 0, tcd: 0, mcd: 0,
    killer: -1, killerW: -1, killerHd: false, lastKiller: -1, dmgFrom: {}, ready: false, hurtT: 0, lastFire: {}, gate: fireGate(), ai: null, place: 0, joinT: 0,
  };
}

export function createSim(level, { cfg = {}, seats = null, seed = (Math.random() * 2 ** 31) | 0, loads = {} } = {}) {
  const S = {
    level, seed, rand: rng(seed), t: 0, ms: 0, phase: 'lobby', pt: 0, clock: 0, cfg: cleanConfig(cfg, MAP_IDS),
    players: Array.from({ length: MAX_PLAYERS }, () => null), hist: Array.from({ length: MAX_PLAYERS }, () => new PosHistory()),
    pickups: [], zones: [], zone: null, zplan: null, zseed: seed ^ 0x5bd1, zt: 0, teamScore: [0, 0], roundWins: Array(MAX_PLAYERS).fill(0), round: 0, duel: [],
    ev: [], grants: [], nextId: 1, result: null, firstBlood: false, started: false, fields: new Map(), god: false, mid: 0,
  };
  (seats || []).forEach((on, i) => { if (on) addPlayer(S, i, { load: loads[i] }); });
  return S;
}

export const humans = (S) => S.players.filter((p) => p && !p.bot);
export const bots = (S) => S.players.filter((p) => p && p.bot);
export const active = (S) => S.players.filter((p) => p && !p.spec);
const enemyOf = (S, A, B) => A !== B && B && !B.spec && (!MODES[S.cfg.mode].teams || A.team !== B.team);

// Alguien se sienta (persona o bot). En plena partida entra al ratito (o espera la siguiente ronda).
export function addPlayer(S, seat, { bot = false, load = null, name = null } = {}) {
  if (seat < 0 || seat >= MAX_PLAYERS) return null;
  if (S.players[seat] && !(S.players[seat].bot && !bot)) return S.players[seat];
  const P = newPlayer(seat, { bot, load, name: bot ? name || BOT_NAMES[seat % BOT_NAMES.length] : null });
  S.players[seat] = P;
  S.hist[seat].clear();
  const M = MODES[S.cfg.mode];
  if (M.teams) P.team = smallerTeam(S, P);
  if (S.phase !== 'lobby') {
    // los duelos y Último en pie no admiten gente a media partida: miran hasta la siguiente
    if (!M.respawn) { P.spec = true; P.alive = false; P.respawnT = -1; }
    else { P.respawnT = 1.2; }
    P.joinT = S.t;
  }
  if (!bot) S.ev.push({ k: 'join', s: seat });
  return P;
}
function smallerTeam(S, me) {
  const n = [0, 0];
  for (const p of S.players) if (p && p !== me && !p.spec) n[p.team]++;
  return n[0] <= n[1] ? 0 : 1;
}
export function removePlayer(S, seat) {
  const P = S.players[seat];
  if (!P) return;
  S.players[seat] = null;
  S.hist[seat].clear();
  if (!P.bot) S.ev.push({ k: 'left', s: seat });
  if (S.duel.includes(seat) && S.phase !== 'over' && S.phase !== 'lobby') {
    // se fue un duelista: gana el otro
    const other = S.duel.find((s) => s !== seat);
    if (other != null && S.players[other]) endMatch(S, { seat: other, team: null, reason: 'left' });
  }
}
// Rellena con bots hasta `n` asientos ocupados (los bots ceden su lugar a las personas)
export function fillBots(S, n) {
  const want = clamp(n, 0, MAX_PLAYERS);
  for (let i = MAX_PLAYERS - 1; i >= 0 && S.players.filter(Boolean).length > want; i--) if (S.players[i]?.bot) removePlayer(S, i);
  for (let i = 0; i < MAX_PLAYERS && S.players.filter(Boolean).length < want; i++) if (!S.players[i]) addPlayer(S, i, { bot: true, load: botLoad(S, i) });
}
function botLoad(S, i) {
  const opts = [['toner', 'grapadora', 'katana'], ['clavadora', 'grapadora', 'regla'], ['cafetera', 'grapadora', 'carton'], ['laser', 'grapadora', 'regla'], ['trituradora', 'lanzatazas', 'katana']];
  const o = opts[(i + S.seed) % opts.length];
  return o.map((id) => ARMS.findIndex((w) => w.id === id));
}

// Clase de alguien (en la sala se aplica ya; a media partida, al reaparecer)
export function setLoad(S, seat, load) {
  const P = S.players[seat];
  if (!P) return null;
  P.load = cleanLoadout(load);
  if (S.phase === 'lobby') { P.owned = ARMS.map((_, i) => P.load.includes(i)); P.w = P.load[0]; }
  return P.load;
}
// Cambio de equipo (solo en la sala y sin desbalancear)
export function setTeam(S, seat, t) {
  const P = S.players[seat];
  if (!P || S.phase !== 'lobby' || !MODES[S.cfg.mode].teams || (t !== 0 && t !== 1)) return false;
  const teams = {};
  for (const p of S.players) if (p) teams[p.seat] = p.team;
  if (!canSwitchTeam(teams, seat, t)) return false;
  P.team = t; P.wantTeam = t;
  return true;
}
export function setConfig(S, cfg) {
  if (S.phase !== 'lobby') return S.cfg;
  S.cfg = cleanConfig({ ...S.cfg, ...cfg }, MAP_IDS);
  if (MODES[S.cfg.mode].teams) assignTeams(S);
  return S.cfg;
}
export function assignTeams(S) {
  const seats = S.players.map((p, i) => (p ? i : -1)).filter((i) => i >= 0);
  const want = {};
  for (const i of seats) want[i] = S.players[i].wantTeam;
  const t = autoBalance(seats, want);
  for (const i of seats) S.players[i].team = t[i];
}

// ---------- Inicio de la partida ----------
export function startMatch(S) {
  const M = MODES[S.cfg.mode];
  S.started = true;
  S.mid++;
  S.result = null; S.firstBlood = false; S.teamScore = [0, 0]; S.roundWins.fill(0); S.round = 0; S.zones = []; S.zt = 0;
  S.clock = S.cfg.time || 0;
  if (M.teams) assignTeams(S); else for (const p of S.players) if (p) p.team = p.seat % 2;
  for (const p of S.players) if (p) Object.assign(p, { kills: 0, deaths: 0, assists: 0, hs: 0, shots: 0, hits: 0, dmg: 0, streak: 0, best: 0, energy: 0, tcd: 0, spec: false, ready: false, place: 0, dmgFrom: {}, killer: -1, lastKiller: -1 });
  if (M.rounds) {
    S.duel = S.players.filter(Boolean).slice(0, 2).map((p) => p.seat);
    for (const p of S.players) if (p && !S.duel.includes(p.seat)) { p.spec = true; p.alive = false; }
    S.duel.forEach((s, k) => { S.players[s].team = k; });
    return startRound(S);
  }
  S.duel = [];
  resetPickups(S);
  if (M.royale) {
    S.zplan = zonePlan(S.level, S.zseed, (x, y) => cellAt(S.level, x, y) === CELL.EMPTY);
    S.zone = zoneAt(S.zplan, 0);
    const melee = ARMS.findIndex((w) => w.id === 'regla');
    // todos caen repartidos, solo con la espada
    const spots = spreadSpawns(S, active(S).length);
    active(S).forEach((p, k) => {
      p.owned = ARMS.map((_, i) => i === melee); p.load = [-1, -1, melee];
      spawn(S, p, spots[k]);
      p.w = melee;
    });
  } else {
    for (const p of active(S)) { p.owned = ARMS.map((_, i) => p.load.includes(i)); spawn(S, p); }
  }
  S.phase = 'intro'; S.pt = INTRO_T;
  S.ev.push({ k: 'start', m: S.cfg.mode });
}
function startRound(S) {
  S.round++;
  resetPickups(S);
  S.zones = [];
  for (const s of S.duel) {
    const p = S.players[s];
    if (!p) continue;
    p.owned = ARMS.map((_, i) => p.load.includes(i));
    spawn(S, p, sideSpawn(S, p.team));
    p.energy = Math.max(p.energy, 0); p.tcd = 0;
  }
  S.clock = MODES.duelo.roundTime;
  S.phase = 'intro'; S.pt = 3;
  S.ev.push({ k: 'roundStart', n: S.round });
}
function sideSpawn(S, team) {
  const list = S.level.spawns.filter((s) => s.team === team);
  const pool = list.length ? list : S.level.spawns;
  // el más "metido" de su lado
  const sorted = [...pool].sort((a, b) => (team === 0 ? a.x - b.x : b.x - a.x));
  return sorted[(S.round * 3) % Math.min(3, sorted.length)] || sorted[0];
}
function spreadSpawns(S, n) {
  const all = S.level.open.length ? S.level.open : S.level.spawns;
  const out = [];
  const r = rng(S.seed + 99);
  const cand = all.filter(() => r() < 0.6);
  const pool = cand.length >= n ? cand : all;
  while (out.length < n) {
    let best = null, bv = -1;
    for (let k = 0; k < 40; k++) {
      const c = pool[(r() * pool.length) | 0];
      const v = out.length ? Math.min(...out.map((o) => dist(o, c))) : r() * 10;
      if (v > bv) { bv = v; best = c; }
    }
    out.push(best);
  }
  return out;
}
function resetPickups(S) {
  S.pickups = [];
  if (MODES[S.cfg.mode].royale) {
    for (const l of rollLoot(S.level.loot, S.seed + 17)) S.pickups.push({ id: S.nextId++, kind: l.kind, w: l.w, x: l.x, y: l.y, on: true, t: 0, fixed: false });
  } else {
    for (const p of S.level.pickups) S.pickups.push({ id: S.nextId++, kind: p.kind, w: -1, x: p.x, y: p.y, on: true, t: 0, fixed: true });
  }
}

// Aparece (o reaparece) en el mejor lugar: lejos y fuera de la vista de los enemigos
export function spawn(S, P, at = null) {
  const L = S.level;
  if (!at) {
    const enemies = [], friends = [], occupied = [];
    for (const q of S.players) {
      if (!q || q === P || !q.alive) continue;
      occupied.push(q);
      if (enemyOf(S, P, q)) enemies.push(q); else friends.push(q);
    }
    const teams = MODES[S.cfg.mode].teams;
    const i = chooseSpawn(L.spawns, { enemies, friends, occupied, team: teams ? P.team : null, los: (ax, ay, bx, by) => arenaLos(L, ax, ay, bx, by), rand: S.rand });
    at = L.spawns[i];
  }
  P.x = at.x; P.y = at.y; P.a = at.a ?? lookOut(L, at); P.p = 0; P.cr = 0; P.mv = 0;
  P.hp = MAX_HP; P.armor = 0; P.alive = true; P.respawnT = 0; P.prot = SPAWN_PROT; P.sp++; P.budget = 1;
  P.dmgFrom = {}; P.killer = -1; P.streak = 0; P.mcd = 0;
  // fuera de Último en pie, reapareces con tu clase (si la cambiaste, ya con la nueva)
  if (!MODES[S.cfg.mode].royale) P.owned = ARMS.map((_, i) => P.load.includes(i));
  for (let i = 0; i < ARMS.length; i++) if (P.owned[i]) { P.mag[i] = ARMS[i].mag || 0; P.res[i] = ARMS[i].reserve || 0; }
  if (!P.owned[P.w]) P.w = P.load.find((i) => i >= 0 && P.owned[i]) ?? P.owned.findIndex(Boolean);
  if (P.ai) { P.ai.goal = null; P.ai.tgt = null; }
  S.hist[P.seat].clear();
  S.ev.push({ k: 'spawn', s: P.seat, x: r2(P.x), y: r2(P.y), a: r2(P.a), sp: P.sp });
}

// ---------- Movimiento (lo usa cada quien para sí mismo; también los bots) ----------
// input: { f, s (de -1 a 1), sprint, cr (agachado) }
export function moveSpeed(P, input) {
  const W = ARMS[P.w];
  let sp = input.sprint && !input.cr ? SPRINT : RUN;
  if (input.cr) sp *= CROUCH_K;
  if (input.ads) sp *= 0.6;
  return sp * (W?.slow || 1);
}
export function movePlayer(level, me, input, dt, others = []) {
  if (!me.alive) { me.mv = 0; return; }
  const sp = moveSpeed(me, input) * dt;
  const ca = Math.cos(me.a), sa = Math.sin(me.a);
  let dx = ca * input.f - sa * input.s, dy = sa * input.f + ca * input.s;
  const len = Math.hypot(dx, dy);
  if (len > 1) { dx /= len; dy /= len; }
  const r = moveCircle(level, me.x, me.y, PLAYER_R, dx * sp, dy * sp);
  me.x = r.x; me.y = r.y;
  // los demás se empujan un poquito (no se atraviesan)
  for (const o of others) {
    if (!o || o === me || !o.alive) continue;
    const ex = me.x - o.x, ey = me.y - o.y, d = Math.hypot(ex, ey), rr = PLAYER_R * 2;
    if (d < rr && d > 1e-4) { const m = moveCircle(level, me.x, me.y, PLAYER_R, (ex / d) * (rr - d) * 0.5, (ey / d) * (rr - d) * 0.5); me.x = m.x; me.y = m.y; }
  }
  me.mv = len > 0.1 ? (input.sprint && !input.cr ? 2 : 1) : 0;
}

// Posición que manda un jugador: se acepta si es posible (no atraviesa muros, no va más rápido de lo posible)
export function applyInput(S, seat, d) {
  const P = S.players[seat];
  if (!P || P.bot || !d) return { ok: false };
  if (![d.x, d.y, d.a, d.p].every(Number.isFinite)) return { ok: false };
  P.a = d.a; P.p = clamp(d.p, -1.45, 1.45);
  P.cr = d.cr ? 1 : 0; P.mv = clamp(d.mv | 0, 0, 2);
  if (Number.isInteger(d.w) && P.owned[d.w]) P.w = d.w;
  if (!P.alive || S.phase === 'intro' || S.phase === 'lobby' || S.phase === 'over') return { ok: true };
  if ((d.sp | 0) !== P.sp) return { ok: true }; // todavía no se entera de que reapareció
  const c = cellAt(S.level, d.x, d.y);
  const walkable = c === CELL.EMPTY;
  // que no atraviese muros: el mismo movimiento con choques debe llegar casi al mismo lugar
  const m = walkable ? moveCircle(S.level, P.x, P.y, PLAYER_R * 0.6, d.x - P.x, d.y - P.y) : null;
  const clean = m && Math.hypot(m.x - d.x, m.y - d.y) < 0.3;
  if (clean && acceptMove(P, d.x, d.y)) { P.x = d.x; P.y = d.y; return { ok: true }; }
  // no: se queda donde el anfitrión lo tiene y se le avisa para que se corrija
  return { ok: false, fix: { k: 'pos', s: seat, x: r2(P.x), y: r2(P.y), sp: P.sp } };
}

// ---------- Disparos ----------
// Blancos a la hora rt (ms del anfitrión) para quien dispara desde `seat`
// hostView: disparo del anfitrión, que ve a los bots al momento (solo se rebobina a las personas)
export function targetsAt(S, seat, rt, hostView = false) {
  const A = S.players[seat];
  const out = [];
  for (const q of S.players) {
    if (!q || q === A || !q.alive || !enemyOf(S, A, q)) continue;
    const h = rt != null && rt < S.ms - 1 && !(hostView && q.bot) ? S.hist[q.seat].at(rt) : null;
    out.push({ seat: q.seat, x: h ? h.x : q.x, y: h ? h.y : q.y, cr: h ? h.cr : q.cr, p: q });
  }
  return out;
}
const eyeOf = (P) => stanceOf(P.cr).eye;

// shot = { x, y, a, p, w, seed, sp (dispersión), rt (hora del anfitrión que veía) }. Devuelve los impactos.
export function fire(S, seat, shot, now = S.ms) {
  const P = S.players[seat];
  if (!P || !P.alive || S.phase !== 'live' || !shot) return [];
  const wi = shot.w | 0;
  const W = ARMS[wi];
  if (!W || W.kind !== 'gun' || !P.owned[wi]) return [];
  const gt = shotTime(P, shot.ct, now);
  if (!gateAllow(P.gate, wi, gt)) { if (!P.bot) S.ev.push({ k: 'nope', s: seat, why: 'rate' }); return []; }
  // balas (el anfitrión también lleva la cuenta; recarga si ya pasó el tiempo)
  if (P.mag[wi] <= 0) {
    const since = (gt - (P.lastFire[wi] ?? -1e9)) / 1000;
    if (P.res[wi] > 0 && since >= W.reload * 0.7) { const take = Math.min(W.mag, P.res[wi]); P.mag[wi] = take; if (P.res[wi] !== Infinity) P.res[wi] -= take; }
    else return [];
  }
  P.mag[wi]--;
  P.lastFire[wi] = gt;
  P.prot = 0; // disparar quita la protección de llegada
  P.w = wi;
  const near = Number.isFinite(shot.x) && Number.isFinite(shot.y) && Math.hypot(shot.x - P.x, shot.y - P.y) < 1.2;
  const ox = near ? shot.x : P.x, oy = near ? shot.y : P.y;
  const a = Number.isFinite(shot.a) ? shot.a : P.a, p = clamp(Number.isFinite(shot.p) ? shot.p : P.p, -1.45, 1.45);
  const [lo, hi] = spreadLimits(W);
  const sp = clamp(Number.isFinite(shot.sp) ? shot.sp : W.spread, lo, hi);
  const rt = rewindTime(now, shot.rt);
  const targets = targetsAt(S, seat, rt, !!shot.hv);
  S.ev.push({ k: 'fire', s: seat, w: wi });
  P.shots++;
  const results = [];
  let any = false;
  for (const pl of pelletDirs(W, a, p, shot.seed | 0, sp)) {
    let list = targets;
    const line = [];
    for (let k = 0; k < (W.pierce || 1); k++) {
      const r = traceShot(S.level, list, { x: ox, y: oy, a: pl.a, p: pl.p, h: eyeOf(P) });
      line.push(r);
      if (!r.hit) break;
      const hit = r.hit;
      list = list.filter((t) => t !== hit);
    }
    line.forEach((r, k) => {
      results.push({ x: r.x, y: r.y, h: r.h, hit: !!r.hit, head: r.head, seat: r.hit?.seat ?? -1 });
      if (!r.hit) return;
      const dmg = pvpDamage(wi, W.dmg) * (r.head ? W.head || 1.8 : 1) * falloff(W, r.d) * 0.8 ** k;
      if (damagePlayer(S, r.hit.p, dmg, seat, wi, r.head, { x: ox, y: oy }, r) > 0) any = true;
    });
    if (W.splash) {
      const r = line[line.length - 1];
      explode(S, seat, r.x - Math.cos(pl.a) * 0.1, r.y - Math.sin(pl.a) * 0.1, Math.max(0.1, r.h), W.splash.r, W.splash.dmg * PVP.splash, wi, r.hit?.p);
    }
  }
  if (any) P.hits++;
  return results;
}

function explode(S, seat, x, y, h, rad, dmg, w, skip = null) {
  S.ev.push({ k: 'boom', s: seat, x: r2(x), y: r2(y), h: r2(h), r: rad });
  const A = S.players[seat];
  for (const q of S.players) {
    if (!q || !q.alive || q === skip) continue;
    const self = q === A;
    if (!self && !enemyOf(S, A, q)) continue;
    const d = Math.max(0, Math.hypot(q.x - x, q.y - y) - BODY.r);
    if (d > rad || !arenaLos(S.level, x, y, q.x, q.y)) continue;
    const k = 1 - (0.55 * d) / rad;
    damagePlayer(S, q, dmg * k * (self ? 0.35 : 1), self ? -2 : seat, w, false, { x, y });
  }
}

// Daño a un jugador. by = asiento (-1 la zona, -2 a sí mismo). Devuelve el daño hecho.
export function damagePlayer(S, V, dmg, by, w = -1, head = false, from = null, at = null) {
  if (!V || !V.alive || !(dmg > 0) || S.phase !== 'live' || V.god) return 0;
  if (V.prot > 0 && by !== -1) return 0;
  const A = by >= 0 ? S.players[by] : null;
  if (A && A !== V && !enemyOf(S, A, V)) return 0; // sin fuego amigo
  const soak = by === -1 ? 0 : Math.min(V.armor, dmg * 0.5);
  const real = Math.min(V.hp + soak, dmg);
  V.armor -= soak;
  V.hp -= dmg - soak;
  V.hurtT = 0.4;
  if (A && A !== V) {
    A.dmg += real;
    const f = V.dmgFrom[by] || (V.dmgFrom[by] = { d: 0, t: 0 });
    f.d += real; f.t = S.t;
  }
  S.ev.push({ k: 'hit', s: by, v: V.seat, d: Math.round(real), hd: head ? 1 : 0, x: r2(at?.x ?? V.x), y: r2(at?.y ?? V.y), h: r2(at?.h ?? 1.2), w, fx: from ? r2(from.x) : 0, fy: from ? r2(from.y) : 0, ar: V.armor > 0 ? 1 : 0 });
  if (V.hp <= 0) killPlayer(S, V, by, w, head);
  return real;
}

function killPlayer(S, V, by, w, head) {
  V.hp = 0; V.alive = false; V.deaths++; V.streak = 0; V.cr = 0;
  const M = MODES[S.cfg.mode];
  V.respawnT = M.respawn ? RESPAWN_T : -1;
  V.killer = by; V.killerW = w; V.killerHd = !!head;
  const K = by >= 0 && by !== V.seat ? S.players[by] : null;
  let mu = 0, fb = 0, rv = 0;
  if (K) {
    K.kills++;
    K.streak++;
    K.best = Math.max(K.best, K.streak);
    K.multi = S.t - K.lastKillT < MULTI_WINDOW ? K.multi + 1 : 1;
    K.lastKillT = S.t;
    mu = K.multi;
    if (head) K.hs++;
    if (!S.firstBlood) { S.firstBlood = true; fb = 1; }
    if (K.lastKiller === V.seat) { rv = 1; K.lastKiller = -1; }
    if (M.teams) S.teamScore[K.team]++;
    if (K.energy < ENERGY_MAX && isSword(w)) K.energy = Math.min(ENERGY_MAX, K.energy + 25);
  }
  V.lastKiller = K ? K.seat : -1;
  // asistencias: quien le hizo daño hace poco
  for (const [s, f] of Object.entries(V.dmgFrom)) {
    const q = S.players[Number(s)];
    if (q && Number(s) !== by && f.d >= 25 && S.t - f.t < 8) q.assists++;
  }
  V.dmgFrom = {};
  if (M.royale) {
    V.place = active(S).filter((p) => p.alive).length + 1;
    // suelta su mejor arma
    const gun = [...V.owned.keys()].filter((i) => V.owned[i] && ARMS[i].kind === 'gun').sort((a, b) => (ARMS[b].cost || 0) - (ARMS[a].cost || 0))[0];
    if (gun != null) S.pickups.push({ id: S.nextId++, kind: 'gun', w: gun, x: V.x, y: V.y, on: true, t: 0, fixed: false });
  }
  S.ev.push({ k: 'kill', s: by, v: V.seat, w, hd: head ? 1 : 0, x: r2(V.x), y: r2(V.y), st: K?.streak || 0, mu, fb, rv });
  checkEnd(S);
}

// ---------- Cuerpo a cuerpo ----------
export const MELEE_KINDS = ['light', 'heavy', 'bash'];
// m = { kind, step, w, x, y, a, rt }
export function melee(S, seat, m, now = S.ms) {
  const P = S.players[seat];
  if (!P || !P.alive || S.phase !== 'live' || !m) return [];
  const kind = MELEE_KINDS.includes(m.kind) ? m.kind : 'bash';
  const wi = m.w | 0;
  const sword = kind !== 'bash' && isSword(wi) && P.owned[wi] ? ARMS[wi] : null;
  if (kind !== 'bash' && !sword) return [];
  if (P.mcd > 0.05) return [];
  const sw = sword ? swingOf(sword, kind, m.step | 0, 0) : { dmg: BASH.dmg * PVP.bash, range: BASH.range, arc: BASH.arc, dur: BASH.every, kind, step: 0 };
  P.mcd = sw.dur * 0.55;
  P.prot = 0;
  const near = Number.isFinite(m.x) && Number.isFinite(m.y) && Math.hypot(m.x - P.x, m.y - P.y) < 1.2;
  const ox = near ? m.x : P.x, oy = near ? m.y : P.y;
  const a = Number.isFinite(m.a) ? m.a : P.a;
  const targets = targetsAt(S, seat, rewindTime(now, m.rt), !!m.hv).map((t) => ({ ...t, r: BODY.r }));
  const hits = arcHits({ x: ox, y: oy, a }, targets, { range: sw.range, arc: sw.arc, los: (ax, ay, bx, by) => arenaLos(S.level, ax, ay, bx, by), max: kind === 'heavy' ? 4 : 2 });
  for (const t of hits) damagePlayer(S, t.p, sword ? pvpDamage(wi, sw.dmg) : sw.dmg, seat, sword ? wi : -1, false, { x: ox, y: oy });
  if (sword && hits.length) P.energy = Math.min(ENERGY_MAX, P.energy + energyGain(sword, kind) * PVP.tech.energy * Math.min(2, hits.length));
  S.ev.push({ k: 'slash', s: seat, w: sword ? wi : -1, kd: MELEE_KINDS.indexOf(kind), st: sw.step | 0, n: hits.length });
  return hits;
}

// ---------- Técnicas (más débiles y con más espera que en Zombies) ----------
export function techCast(level, T) {
  if (T.kind === 'wave') return (x, y, a, max) => arenaRay(level, x, y, a, max).t;
  return (x, y, a, max) => { const m = moveCircle(level, x, y, PLAYER_R, Math.cos(a) * max, Math.sin(a) * max); return Math.hypot(m.x - x, m.y - y); };
}
export const techOf = (w) => (isSword(w) ? PVP_TECHS[ARMS[w].tech] : null);
export function technique(S, seat, t) {
  const P = S.players[seat];
  if (!P || !P.alive || S.phase !== 'live' || !t) return { ok: false, why: 'No puedes ahora', hits: [] };
  const wi = t.w | 0;
  const T = isSword(wi) && P.owned[wi] ? techOf(wi) : null;
  if (!T) return { ok: false, why: 'Necesitas una espada', hits: [] };
  if (P.tcd > 0) return { ok: false, why: 'Técnica en espera', hits: [] };
  if (P.energy < T.cost) return { ok: false, why: 'Te falta energía', hits: [] };
  const near = Number.isFinite(t.x) && Number.isFinite(t.y) && Math.hypot(t.x - P.x, t.y - P.y) < 1.2;
  const x = near ? t.x : P.x, y = near ? t.y : P.y;
  const a = Number.isFinite(t.a) ? t.a : P.a;
  const path = techPath(T, x, y, a, techCast(S.level, T));
  P.energy -= T.cost; P.tcd = T.cd; P.prot = 0;
  const targets = targetsAt(S, seat, null).map((q) => ({ ...q, r: BODY.r }));
  const hits = pathHits(path.ax, path.ay, path.bx, path.by, T.width, targets, { los: (ax, ay, bx, by) => arenaLos(S.level, ax, ay, bx, by) });
  for (const q of hits) damagePlayer(S, q.p, T.dmg, seat, wi, false, { x, y });
  if (T.kind !== 'wave') { P.x = path.bx; P.y = path.by; P.budget += path.len + 0.5; }
  if (T.burn) {
    for (const k of [0.4, 0.8]) S.zones.push({ id: S.nextId++, x: path.ax + (path.bx - path.ax) * k, y: path.ay + (path.by - path.ay) * k, r: T.burn.r, t: T.burn.t, dps: T.burn.dps, seat, tick: 0, w: wi });
    if (S.zones.length > 8) S.zones.splice(0, S.zones.length - 8);
  }
  S.ev.push({ k: 'tech', s: seat, id: T.id, w: wi, ax: r2(path.ax), ay: r2(path.ay), bx: r2(path.bx), by: r2(path.by), n: hits.length });
  return { ok: true, hits, path };
}
function updateZones(S, dt) {
  for (let i = S.zones.length - 1; i >= 0; i--) {
    const q = S.zones[i];
    q.t -= dt; q.tick -= dt;
    if (q.t <= 0) { S.zones.splice(i, 1); continue; }
    if (q.tick > 0) continue;
    q.tick = 0.25;
    const A = S.players[q.seat];
    for (const v of S.players) if (v && v.alive && A && enemyOf(S, A, v) && Math.hypot(v.x - q.x, v.y - q.y) < q.r) damagePlayer(S, v, q.dps * 0.25, q.seat, q.w, false, q);
  }
}

// ---------- Recogibles ----------
function updatePickups(S, dt) {
  for (const k of S.pickups) {
    if (!k.on) { if (k.fixed) { k.t -= dt; if (k.t <= 0) { k.on = true; S.ev.push({ k: 'pickup', id: k.id }); } } continue; }
    for (const p of S.players) {
      if (!p || !p.alive || Math.hypot(p.x - k.x, p.y - k.y) > 0.7) continue;
      if (!takePickup(S, p, k)) continue;
      k.on = false; k.t = PICKUP[k.kind]?.respawn || 20;
      S.ev.push({ k: 'pick', s: p.seat, d: k.kind, w: k.w, id: k.id });
      break;
    }
  }
  if (S.pickups.length > 60) S.pickups = S.pickups.filter((k) => k.on || k.fixed);
}
function takePickup(S, p, k) {
  if (k.kind === 'health') { if (p.hp >= MAX_HP) return false; p.hp = Math.min(MAX_HP, p.hp + PICKUP.health.heal); return true; }
  if (k.kind === 'armor') { if (p.armor >= MAX_ARMOR) return false; p.armor = Math.min(MAX_ARMOR, p.armor + PICKUP.armor.armor); return true; }
  if (k.kind === 'ammo') {
    const guns = ARMS.map((w, i) => (p.owned[i] && w.kind === 'gun' ? i : -1)).filter((i) => i >= 0);
    if (!guns.length) return false;
    for (const i of guns) if (p.res[i] !== Infinity) p.res[i] = Math.min(ARMS[i].reserve * 2, p.res[i] + ARMS[i].mag * 2);
    S.grants.push({ s: p.seat, ammo: 'pack' });
    return true;
  }
  if (k.kind === 'gun' && k.w >= 0) {
    const W = ARMS[k.w];
    if (p.owned[k.w]) {
      if (W.kind !== 'gun' || p.res[k.w] === Infinity) return false;
      p.res[k.w] = Math.min(W.reserve * 2, p.res[k.w] + W.mag * 2);
      S.grants.push({ s: p.seat, ammo: 'pack' });
      return true;
    }
    p.owned[k.w] = true; p.mag[k.w] = W.mag || 0; p.res[k.w] = W.reserve || 0;
    if (p.bot) p.w = k.w;
    S.grants.push({ s: p.seat, weapon: k.w });
    return true;
  }
  return false;
}

// ---------- Fin de ronda / partida ----------
function checkEnd(S) {
  if (S.phase !== 'live') return;
  const M = MODES[S.cfg.mode];
  if (M.rounds) {
    const [a, b] = S.duel.map((s) => S.players[s]);
    if (!a || !b) return;
    if (a.alive && b.alive && S.clock > 0) return;
    const w = roundWinner(a, b);
    if (w != null) S.roundWins[w]++;
    S.ev.push({ k: 'round', n: S.round, w: w ?? -1 });
    const res = matchResult(resultState(S));
    if (res) endMatch(S, res);
    else { S.phase = 'round'; S.pt = ROUND_END_T; }
    return;
  }
  const res = matchResult(resultState(S));
  if (res) endMatch(S, res);
}
function resultState(S) {
  return {
    mode: S.cfg.mode, limit: S.cfg.limit, clock: S.cfg.time ? S.clock : null, teamScore: S.teamScore, roundWins: S.roundWins, started: S.started,
    players: active(S).map((p) => ({ seat: p.seat, team: p.team, kills: p.kills, deaths: p.deaths })),
    alive: active(S).filter((p) => p.alive).map((p) => p.seat),
  };
}
export function endMatch(S, res) {
  S.phase = 'over'; S.pt = OVER_T;
  const won = (p) => (res.team != null ? p.team === res.team : p.seat === res.seat);
  for (const p of active(S)) if (MODES[S.cfg.mode].royale && p.alive) p.place = 1;
  S.result = { ...res, mvp: pickMvp(active(S), won) };
  S.ev.push({ k: 'over', s: res.seat ?? -1, t: res.team ?? -1, mvp: S.result.mvp ?? -1, why: res.reason });
}
export const isWinner = (S, p) => !!S.result && (S.result.team != null ? p.team === S.result.team : p.seat === S.result.seat);

// ---------- Paso de simulación ----------
export function step(S, dt, now = null) {
  S.t += dt;
  S.ms = now != null ? now : S.ms + dt * 1000;
  for (const p of S.players) {
    if (!p) continue;
    p.prot = Math.max(0, p.prot - dt); p.tcd = Math.max(0, p.tcd - dt); p.mcd = Math.max(0, p.mcd - dt); p.hurtT = Math.max(0, p.hurtT - dt);
    refillBudget(p, dt);
  }
  if (S.phase === 'lobby') return;
  if (S.phase === 'intro') {
    S.pt -= dt;
    for (const p of S.players) if (p?.alive) S.hist[p.seat].push(S.ms, p.x, p.y, p.cr, true);
    if (S.pt <= 0) { S.phase = 'live'; S.pt = 0; S.ev.push({ k: 'go' }); }
    return;
  }
  if (S.phase === 'round') {
    S.pt -= dt;
    if (S.pt <= 0) startRound(S);
    return;
  }
  if (S.phase === 'over') { S.pt -= dt; return; }
  // en vivo
  const M = MODES[S.cfg.mode];
  if (S.cfg.time || M.rounds) S.clock = Math.max(0, S.clock - dt);
  for (const p of S.players) {
    if (!p || p.spec) continue;
    if (p.bot && p.alive && !p.botFrozen) botThink(S, p, dt);
    if (!p.alive && p.respawnT > 0) { p.respawnT -= dt; if (p.respawnT <= 0) spawn(S, p); }
    if (p.alive) S.hist[p.seat].push(S.ms, p.x, p.y, p.cr, true);
  }
  if (M.royale && S.zplan) {
    S.zt += dt;
    const prev = S.zone?.phase;
    S.zone = zoneAt(S.zplan, S.zt);
    if (S.zone.phase !== prev && S.zone.phase > 0) S.ev.push({ k: 'zone', n: S.zone.phase });
    for (const p of S.players) if (p?.alive && Math.hypot(p.x - S.zone.x, p.y - S.zone.y) > S.zone.r) { p.zoneTick = (p.zoneTick || 0) + dt; if (p.zoneTick >= 0.5) { damagePlayer(S, p, S.zone.dps * p.zoneTick, -1, -1, false, null); p.zoneTick = 0; } }
  }
  updatePickups(S, dt);
  updateZones(S, dt);
  if (S.phase === 'live' && (S.clock <= 0 && (S.cfg.time || M.rounds))) checkEnd(S);
  if (S.phase === 'live' && M.royale) checkEnd(S);
}

// ---------- Bots: miran, deambulan, apuntan con error y disparan ----------
function fieldTo(S, goal) {
  const key = `${Math.floor(goal.x)},${Math.floor(goal.y)}`;
  let f = S.fields.get(key);
  if (!f) {
    f = distanceField(S.level, [goal]);
    S.fields.set(key, f);
    if (S.fields.size > 48) S.fields.delete(S.fields.keys().next().value);
  }
  return f;
}
function downhill(S, f, x, y) {
  const L = S.level;
  const i = Math.floor(x), j = Math.floor(y);
  const cur = f[j * L.W + i];
  let best = null, bv = cur < 0 ? 1e9 : cur;
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
    const ni = i + dx, nj = j + dy;
    if (ni < 0 || nj < 0 || ni >= L.W || nj >= L.H) continue;
    if (dx && dy && (f[j * L.W + ni] < 0 || f[nj * L.W + i] < 0)) continue;
    const v = f[nj * L.W + ni];
    if (v >= 0 && v < bv - (dx && dy ? 0.4 : 0)) { bv = v; best = { x: ni + 0.5, y: nj + 0.5 }; }
  }
  return best;
}
function turnTo(a, b, max) { const d = angDiff(a, b); return a + clamp(d, -max, max); }

export function botThink(S, P, dt) {
  const L = S.level;
  const D = DIFF[S.cfg.diff] || DIFF.normal;
  const B = P.ai || (P.ai = { goal: null, tgt: -1, seen: 0, ea: 0, ep: 0, strafe: 1, strafeT: 0, reload: 0, goalT: 0, cr: 0, stuck: 0, lx: P.x, ly: P.y, swing: 0 });
  if (S.phase !== 'live') return;
  const W = ARMS[P.w];
  // elegir arma: la mejor que tenga balas (o la espada)
  const guns = P.owned.map((o, i) => (o && ARMS[i].kind === 'gun' && P.mag[i] + (P.res[i] === Infinity ? 1 : P.res[i]) > 0 ? i : -1)).filter((i) => i >= 0);
  const best = guns.sort((a, b) => (ARMS[b].cost || 0) - (ARMS[a].cost || 0))[0];
  if (best != null && (W.kind !== 'gun' || P.mag[P.w] + (P.res[P.w] === Infinity ? 1 : P.res[P.w]) <= 0) && B.reload <= 0) P.w = best;
  else if (best == null) P.w = P.owned.findIndex((o, i) => o && isSword(i));
  const Wc = ARMS[P.w] || W;
  // ¿a quién veo?
  let tgt = null, td = 1e9;
  const eye = { x: P.x, y: P.y };
  for (const q of S.players) {
    if (!q || !q.alive || !enemyOf(S, P, q)) continue;
    const d = dist(P, q);
    if (d > D.range) continue;
    const inView = offAngle(P.a, P.x, P.y, q.x, q.y) < 1.1 || B.tgt === q.seat || P.hurtT > 0 || d < 3;
    if (!inView || !arenaLos(L, eye.x, eye.y, q.x, q.y)) continue;
    if (d < td) { td = d; tgt = q; }
  }
  if (tgt) { if (B.tgt !== tgt.seat) { B.tgt = tgt.seat; B.seen = 0; B.ea = (S.rand() - 0.5) * D.err * 6; B.ep = (S.rand() - 0.5) * D.err * 3; } B.seen += dt; }
  else { B.tgt = -1; B.seen = 0; }
  B.reload = Math.max(0, B.reload - dt);
  B.swing = Math.max(0, B.swing - dt);
  let f = 0, s = 0, sprint = false;
  if (tgt) {
    // apuntar: el error se va cerrando mientras más lo sigue
    const want = Math.atan2(tgt.y - P.y, tgt.x - P.x);
    B.ea *= Math.pow(0.18, dt); B.ep *= Math.pow(0.18, dt);
    B.ea += (S.rand() - 0.5) * D.err * dt * 4; B.ep += (S.rand() - 0.5) * D.err * dt * 2;
    P.a = turnTo(P.a, want + B.ea, D.turn * dt);
    const chest = stanceOf(tgt.cr).top - 0.55;
    P.p = turnTo(P.p, Math.atan2(chest - eyeOf(P), td * TILE_M) + B.ep, D.turn * 0.6 * dt);
    const err = Math.abs(angDiff(P.a, want));
    if (Wc.kind === 'gun') {
      // distancia preferida según el arma
      const pref = Wc.id === 'cafetera' ? 3 : Wc.id === 'laser' ? 14 : 8;
      f = td > pref + 2 ? 1 : td < pref - 2 ? -0.7 : 0;
      B.strafeT -= dt;
      if (B.strafeT <= 0) { B.strafeT = 0.5 + S.rand() * 1.1; B.strafe = S.rand() < 0.5 ? -1 : 1; B.cr = Wc.id === 'laser' && S.rand() < 0.5 ? 1 : 0; }
      s = B.strafe * D.strafe;
      P.cr = B.cr;
      if (B.seen >= D.react && err < D.cone * (1 + 4 / Math.max(2, td)) && B.reload <= 0 && S.t >= (B.next || 0)) {
        if (P.mag[P.w] <= 0) { if (P.res[P.w] > 0) { B.reload = Wc.reload; P.lastFire[P.w] = S.ms - Wc.reload * 1000; } }
        else {
          // al ritmo promedio del arma (las ráfagas se reparten)
          const cycle = Wc.burst ? (Wc.every + Wc.burst * Wc.burstEvery) / Wc.burst : Wc.every;
          B.next = S.t + cycle * 1.12;
          fire(S, P.seat, { x: P.x, y: P.y, a: P.a, p: P.p, w: P.w, seed: (S.rand() * 2 ** 31) | 0, sp: Wc.spread * (P.mv ? 1.4 : 1), rt: S.ms }, S.ms);
        }
      }
    } else {
      // espada: corre hacia él y corta
      f = 1; sprint = td > 3; s = Math.sin(S.t * 3 + P.seat) * 0.3; P.cr = 0;
      if (td < (Wc.range || 1.6) + 0.2 && B.swing <= 0 && err < 0.5) { const sw = swingOf(Wc, 'light', 0); B.swing = sw.dur * 1.4; melee(S, P.seat, { kind: 'light', step: 0, w: P.w, x: P.x, y: P.y, a: P.a, rt: S.ms }, S.ms); }
    }
  } else {
    P.cr = 0;
    B.goalT -= dt;
    // a dónde ir: botín si le falta algo, la zona si está afuera, si no, un lugar al azar
    if (!B.goal || B.goalT <= 0 || dist(P, B.goal) < 0.8) B.goal = pickGoal(S, P), B.goalT = 6 + S.rand() * 6;
    const fl = fieldTo(S, B.goal);
    const nxt = downhill(S, fl, P.x, P.y) || B.goal;
    const want = Math.atan2(nxt.y - P.y, nxt.x - P.x);
    P.a = turnTo(P.a, want, D.turn * 0.8 * dt);
    P.p = turnTo(P.p, 0, 2 * dt);
    f = Math.abs(angDiff(P.a, want)) < 1.2 ? 1 : 0.2;
    sprint = Math.abs(angDiff(P.a, want)) < 0.4;
    // si se atora, cambia de rumbo
    B.stuck = dist(P, { x: B.lx, y: B.ly }) < 0.02 ? B.stuck + dt : 0;
    if (B.stuck > 0.8) { B.goal = null; B.stuck = 0; s = S.rand() < 0.5 ? -1 : 1; }
  }
  B.lx = P.x; B.ly = P.y;
  movePlayer(L, P, { f, s, sprint, cr: P.cr }, dt, S.players);
}
function pickGoal(S, P) {
  const L = S.level;
  if (S.zone && Math.hypot(P.x - S.zone.x, P.y - S.zone.y) > S.zone.r * 0.8) {
    const c = L.open.reduce((b, c) => (Math.hypot(c.x - S.zone.x, c.y - S.zone.y) < Math.hypot(b.x - S.zone.x, b.y - S.zone.y) ? c : b), L.open[0]);
    return c;
  }
  const needGun = !P.owned.some((o, i) => o && ARMS[i].kind === 'gun');
  const wants = S.pickups.filter((k) => k.on && ((needGun && k.kind === 'gun') || (P.hp < 60 && k.kind === 'health') || (P.armor < 50 && k.kind === 'armor') || (MODES[S.cfg.mode].royale && k.kind === 'gun' && !P.owned[k.w])));
  if (wants.length && S.rand() < 0.85) return wants.reduce((b, k) => (dist(P, k) < dist(P, b) ? k : b), wants[0]);
  const pool = L.open.length ? L.open : L.spawns;
  return pool[(S.rand() * pool.length) | 0];
}

// ---------- Estado compacto para la red ----------
// Índices de cada jugador en el arreglo P
export const PI = { x: 0, y: 1, a: 2, p: 3, hp: 4, ar: 5, alive: 6, w: 7, team: 8, kills: 9, deaths: 10, assists: 11, cr: 12, mv: 13, sp: 14, prot: 15, streak: 16, hs: 17, bot: 18, spec: 19, en: 20, tcd: 21, rsp: 22, killer: 23, ready: 24, dmg: 25, shots: 26, hits: 27, place: 28, owned: 29, load: 30, kw: 31, khd: 32, best: 33, wt: 34 };
const ownedBits = (o) => o.reduce((m, v, i) => (v ? m | (1 << i) : m), 0);
export const bitsOwned = (b) => ARMS.map((_, i) => !!(b & (1 << i)));
export function packPlayer(p) {
  return [q2(p.x), q2(p.y), Math.round(p.a * 1000), Math.round(p.p * 1000), Math.ceil(Math.max(0, p.hp)), Math.ceil(p.armor), p.alive ? 1 : 0, p.w, p.team, p.kills, p.deaths, p.assists, p.cr, p.mv, p.sp, p.prot > 0 ? 1 : 0, p.streak, p.hs, p.bot ? 1 : 0, p.spec ? 1 : 0, Math.floor(p.energy), Math.ceil(p.tcd * 10), Math.ceil(Math.max(0, p.respawnT) * 10), p.killer, p.ready ? 1 : 0, Math.round(p.dmg), p.shots, p.hits, p.place, ownedBits(p.owned), p.load.map((x) => x + 1).join('.'), p.killerW, p.killerHd ? 1 : 0, p.best, p.wantTeam ?? -1];
}
export function unpackPlayer(a, seat) {
  if (!a) return null;
  return {
    seat, x: a[0] / 100, y: a[1] / 100, a: a[2] / 1000, p: a[3] / 1000, hp: a[4], armor: a[5], alive: !!a[6], w: a[7], team: a[8], kills: a[9], deaths: a[10], assists: a[11], cr: a[12], mv: a[13], sp: a[14],
    prot: !!a[15], streak: a[16], hs: a[17], bot: !!a[18], spec: !!a[19], energy: a[20], tcd: a[21] / 10, respawnT: a[22] / 10, killer: a[23], ready: !!a[24], dmg: a[25], shots: a[26], hits: a[27], place: a[28],
    owned: bitsOwned(a[29]), load: String(a[30] || '').split('.').map((x) => Number(x) - 1), killerW: a[31], killerHd: !!a[32], best: a[33], wantTeam: a[34] >= 0 ? a[34] : null,
  };
}
export function pack(S) {
  const z = S.zone;
  return {
    ph: S.phase, pt: Math.round(S.pt * 10) / 10, clk: Math.round(S.clock * 10) / 10, cfg: S.cfg, ts: S.teamScore, rw: S.roundWins, rn: S.round, du: S.duel,
    P: S.players.map((p) => p && packPlayer(p)),
    N: S.players.map((p) => (p?.bot ? p.name : null)),
    K: S.pickups.filter((k) => k.on).map((k) => [k.id, PICK_KINDS.indexOf(k.kind), q2(k.x), q2(k.y), k.w]),
    Q: S.zones.map((q) => [q.id, q2(q.x), q2(q.y), q2(q.r), Math.ceil(q.t * 10)]),
    z: z ? [q2(z.x), q2(z.y), q2(z.r), z.phase, Math.ceil(z.next), z.shrinking ? 1 : 0, z.dps, q2(z.to.x), q2(z.to.y), q2(z.to.r)] : 0,
    zs: S.zseed, zt: Math.round(S.zt * 10) / 10, res: S.result, fb: S.firstBlood ? 1 : 0, mid: S.mid,
    ev: S.ev.splice(0),
  };
}
export const unpackPlayers = (d) => (d.P || []).map((a, i) => unpackPlayer(a, i));
export function unpackZone(z) {
  if (!z) return null;
  return { x: z[0] / 100, y: z[1] / 100, r: z[2] / 100, phase: z[3], next: z[4], shrinking: !!z[5], dps: z[6], to: { x: z[7] / 100, y: z[8] / 100, r: z[9] / 100 } };
}

// El anfitrión se fue: el siguiente rearma la partida con el último estado que recibió
export function restoreSim(level, d, { seed = (Math.random() * 2 ** 31) | 0 } = {}) {
  const S = createSim(level, { cfg: d.cfg || {}, seed });
  S.phase = PHASES.includes(d.ph) ? d.ph : 'lobby'; S.pt = d.pt || 0; S.clock = d.clk || 0; S.teamScore = (d.ts || [0, 0]).slice(); S.roundWins = (d.rw || []).slice();
  while (S.roundWins.length < MAX_PLAYERS) S.roundWins.push(0);
  S.round = d.rn || 0; S.duel = (d.du || []).slice(); S.result = d.res || null; S.firstBlood = !!d.fb; S.started = S.phase !== 'lobby';
  S.zseed = d.zs || S.zseed; S.zt = d.zt || 0; S.mid = d.mid || 0;
  unpackPlayers(d).forEach((u, i) => {
    if (!u) return;
    const P = newPlayer(i, { bot: u.bot, load: u.load, name: d.N?.[i] || null });
    Object.assign(P, { x: u.x, y: u.y, a: u.a, p: u.p, hp: u.hp, armor: u.armor, alive: u.alive, w: u.w, team: u.team, kills: u.kills, deaths: u.deaths, assists: u.assists, cr: u.cr, sp: u.sp, prot: 1.5, streak: u.streak, hs: u.hs, spec: u.spec, energy: u.energy, tcd: u.tcd, respawnT: u.alive ? 0 : Math.max(0.5, u.respawnT || 0), dmg: u.dmg, shots: u.shots, hits: u.hits, place: u.place, owned: u.owned, ready: u.ready, best: u.best, budget: 2 });
    if (!P.alive && !MODES[S.cfg.mode].respawn) P.respawnT = -1;
    S.players[i] = P;
  });
  if (MODES[S.cfg.mode].royale && S.phase !== 'lobby') { S.zplan = zonePlan(level, S.zseed, (x, y) => cellAt(level, x, y) === CELL.EMPTY); S.zone = zoneAt(S.zplan, S.zt); }
  let maxId = 1;
  for (const k of d.K || []) { maxId = Math.max(maxId, k[0]); S.pickups.push({ id: k[0], kind: PICK_KINDS[k[1]], x: k[2] / 100, y: k[3] / 100, w: k[4], on: true, t: 0, fixed: PICK_KINDS[k[1]] !== 'gun' && !MODES[S.cfg.mode].royale }); }
  // los recogibles fijos que estaban tomados vuelven a su lugar (con su tiempo)
  if (!MODES[S.cfg.mode].royale) for (const p of level.pickups) if (!S.pickups.some((k) => Math.hypot(k.x - p.x, k.y - p.y) < 0.1)) S.pickups.push({ id: ++maxId, kind: p.kind, w: -1, x: p.x, y: p.y, on: false, t: 8, fixed: true });
  S.nextId = maxId + 1000;
  return S;
}
