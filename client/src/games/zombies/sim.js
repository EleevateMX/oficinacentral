// Simulación de "Zombies en la oficina". La corre el anfitrión (asiento 0) con paso fijo;
// el invitado solo manda su posición, sus disparos y sus compras. Sin DOM ni three.js.
import {
  ZOMBIE_TYPES, ZOMBIE_TYPE_IDS, BOSSES, BOSS_ORDER, WEAPONS, SHOP, upgradeCost, DROPS, CELL, TILE_M, EYE_H, PLAYER_R,
  waveSpec, waveRoster, distanceField, moveCircle, rayCast, lineOfSight, killPoints, cellAt,
} from '../../../../shared/zombies.js';

export const ZSTATES = ['rise', 'emerge', 'walk', 'attack', 'dead', 'windup', 'charge', 'stun', 'cast'];
export const PROJ = ['acid', 'paper', 'coffee'];
export const DROP_KINDS = ['ammo', 'health', 'points'];
const KINDS = [...ZOMBIE_TYPE_IDS, 'boss'];

// Generador pseudoaleatorio con semilla (mulberry32)
export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const MAX_PLAYERS = 4;
const SPAWN_OFF = [[0, 0], [0.8, 0], [-0.8, 0], [0, 0.8]];
export function newPlayer(seat, level) {
  const [ox, oy] = SPAWN_OFF[seat] || [0, 0];
  const open = (x, y) => cellAt(level, x, y) === CELL.EMPTY;
  const x = open(level.start.x + ox, level.start.y + oy) ? level.start.x + ox : level.start.x;
  const y = open(level.start.x + ox, level.start.y + oy) ? level.start.y + oy : level.start.y;
  return {
    seat, x, y, a: level.startA ?? Math.PI / 2, p: 0, down: false, downT: 0, rv: 0, revive: 0, prot: 0,
    hp: 100, maxHp: 100, armor: 0, alive: true, pts: 500, earned: 0, kills: 0, dmgLvl: 0, owned: [true, false, false], w: 0,
    ready: false, streak: 0, streakT: 0, hurtT: 0, mv: 0,
  };
}

// seats: qué asientos tienen jugador (hasta 4)
export function createSim(level, { players = 1, seats = null, seed = (Math.random() * 2 ** 31) | 0 } = {}) {
  seats = seats || Array.from({ length: MAX_PLAYERS }, (_, i) => i < players);
  const S = {
    level, seed, rand: rng(seed), t: 0, phase: 'intro', pt: 4, wave: 0, spec: null,
    players: Array.from({ length: MAX_PLAYERS }, (_, i) => (seats[i] ? newPlayer(i, level) : null)),
    zombies: [], shots: [], drops: [], roster: [], spawnT: 0, nextId: 1, kills: 0,
    ev: [], grants: [], field: null, fieldT: 0, bossId: 0, flicker: 0, god: false,
  };
  return S;
}

const alivePlayers = (S) => S.players.filter((p) => p && p.alive);

// Alguien se une a la partida (en cualquier momento): entra ya, con unos segundos de protección
export function addPlayer(S, seat) {
  if (seat < 0 || seat >= MAX_PLAYERS || S.players[seat]) return S.players[seat];
  const P = newPlayer(seat, S.level);
  P.prot = 3;
  if (S.phase === 'over') P.alive = false;
  S.players[seat] = P;
  S.ev.push({ k: 'join', s: seat });
  return P;
}
export function removePlayer(S, seat) {
  if (!S.players[seat]) return;
  S.players[seat] = null;
  S.ev.push({ k: 'left', s: seat });
  if (S.phase !== 'over' && S.phase !== 'intro' && !alivePlayers(S).length) gameOver(S);
}
function gameOver(S) {
  S.phase = 'over';
  S.pt = 0;
  S.ev.push({ k: 'over', n: S.wave });
}
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

// ---------- Movimiento del jugador (lo usa cada quien para sí mismo) ----------
// input: { f, s (adelante/lado de -1 a 1), sprint, turn }
export function movePlayer(level, me, input, dt, others = []) {
  if (!me.alive) return;
  const sp = (input.sprint ? 5.0 : 3.3) * dt;
  const ca = Math.cos(me.a), sa = Math.sin(me.a);
  let dx = (ca * input.f - sa * input.s), dy = (sa * input.f + ca * input.s);
  const len = Math.hypot(dx, dy);
  if (len > 1) { dx /= len; dy /= len; }
  const r = moveCircle(level, me.x, me.y, PLAYER_R, dx * sp, dy * sp);
  me.x = r.x; me.y = r.y;
  // No atravesar zombis
  for (const z of others) {
    if (z.st === 'dead' || z.st === 'rise') continue;
    const rr = (z.r || 0.3) + PLAYER_R;
    const ex = me.x - z.x, ey = me.y - z.y, d = Math.hypot(ex, ey);
    if (d < rr && d > 1e-4) {
      const push = (rr - d);
      const m = moveCircle(level, me.x, me.y, PLAYER_R, (ex / d) * push, (ey / d) * push);
      me.x = m.x; me.y = m.y;
    }
  }
  me.mv = len > 0.1 ? (input.sprint ? 2 : 1) : 0;
}

// ---------- Disparos ----------
// Busca el zombi que pega un disparo (el más cercano antes del muro). shot = { x, y, a, p }
export function traceShot(level, zombies, shot, maxD = 40) {
  const wall = rayCast(level, shot.x, shot.y, shot.a, maxD);
  const ca = Math.cos(shot.a), sa = Math.sin(shot.a);
  const tp = Math.tan(shot.p);
  let best = null;
  for (const z of zombies) {
    if (z.st === 'dead') continue;
    const ox = z.x - shot.x, oy = z.y - shot.y;
    const along = ox * ca + oy * sa;
    if (along <= 0) continue;
    const perp = Math.abs(-ox * sa + oy * ca);
    const r = z.r || 0.3;
    if (perp > r) continue;
    const d = along - Math.sqrt(Math.max(0, r * r - perp * perp));
    if (d > wall.t || (best && d > best.d)) continue;
    // altura del disparo en ese punto (m) contra la altura del zombi (que puede ir saliendo del piso)
    const hgt = EYE_H + tp * d * TILE_M;
    const rise = z.st === 'rise' ? Math.min(1, (z.t || 0) / 1.4) : 1;
    const top = (z.h || 1.8) * rise, bottom = (z.h || 1.8) * (rise - 1);
    if (hgt < Math.max(0, bottom) - 0.05 || hgt > top + 0.05) continue;
    if (d > wall.low && hgt < 0.95) continue; // tapado por un mueble
    best = { z, d, h: hgt, head: hgt > top * 0.8 };
  }
  if (best) return { hit: best.z, d: best.d, h: best.h, head: best.head, x: shot.x + ca * best.d, y: shot.y + sa * best.d };
  // pega en el muro o en el piso
  let d = wall.t;
  let h = EYE_H + tp * d * TILE_M;
  if (h < 0) { d = -EYE_H / tp / TILE_M; h = 0; }
  else if (h > 2.7) { d = (2.7 - EYE_H) / tp / TILE_M; h = 2.7; }
  return { hit: null, d, h, x: shot.x + ca * d, y: shot.y + sa * d };
}

// Ángulos de los perdigones de un disparo (deterministas con la semilla)
export function pellets(weapon, a, p, seed) {
  const W = WEAPONS[weapon];
  const r = rng(seed);
  const out = [];
  for (let i = 0; i < W.pellets; i++) out.push({ a: a + (r() - 0.5) * 2 * W.spread, p: p + (r() - 0.5) * 2 * W.spread * 0.6 });
  return out;
}

// Un disparo de un jugador (lo resuelve el anfitrión). shot = { x, y, a, p, w, seed }
export function fire(S, seat, shot) {
  const P = S.players[seat];
  if (!P || !P.alive || S.phase === 'over') return [];
  const W = WEAPONS[shot.w] || WEAPONS[0];
  if (!P.owned[shot.w]) return [];
  S.ev.push({ k: 'fire', s: seat, w: shot.w });
  const results = [];
  for (const pl of pellets(shot.w, shot.a, shot.p, shot.seed)) {
    const r = traceShot(S.level, S.zombies, { x: shot.x, y: shot.y, a: pl.a, p: pl.p });
    results.push(r);
    if (!r.hit) continue;
    let dmg = W.dmg * (1 + 0.25 * P.dmgLvl) * (r.head ? 1.8 : 1);
    if (W.pellets > 1 && r.d > 5) dmg *= Math.max(0.35, 1 - (r.d - 5) * 0.12);
    damageZombie(S, r.hit, dmg, seat, shot.a, r.head, r.h);
  }
  return results;
}

export function damageZombie(S, z, dmg, seat, ang, head, h) {
  if (z.st === 'dead') return;
  z.hp -= dmg;
  z.flash = 0.12;
  const kb = z.kind === 'boss' ? 0.4 : z.kind === 'tank' ? 0.9 : 2.2;
  z.vx += Math.cos(ang) * kb * Math.min(2, dmg / 20);
  z.vy += Math.sin(ang) * kb * Math.min(2, dmg / 20);
  const P = S.players[seat];
  if (P) { P.pts += 10; P.earned += 10; }
  S.ev.push({ k: 'hit', s: seat, id: z.id, x: r2(z.x), y: r2(z.y), h: r2(h ?? 1.2), hd: head ? 1 : 0 });
  if (z.hp <= 0) killZombie(S, z, seat);
}

function killZombie(S, z, seat) {
  z.hp = 0; z.st = 'dead'; z.t = 0;
  S.kills++;
  const P = S.players[seat];
  let pts = 0;
  if (P) {
    P.streak = P.streakT > 0 ? P.streak + 1 : 1;
    P.streakT = 3;
    pts = killPoints(z.kind === 'boss' ? z.boss : z.kind, P.streak - 1);
    P.pts += pts; P.earned += pts; P.kills++;
  }
  S.ev.push({ k: 'kill', s: seat ?? -1, id: z.id, x: r2(z.x), y: r2(z.y), pts, boss: z.kind === 'boss' ? 1 : 0 });
  if (z.kind === 'boss') {
    S.bossId = 0;
    // El jefe suelta de todo
    for (const kind of DROP_KINDS) spawnDrop(S, kind, z.x + (S.rand() - 0.5), z.y + (S.rand() - 0.5));
  } else if (!z.minion) {
    const r = S.rand();
    let acc = 0;
    for (const kind of DROP_KINDS) { acc += DROPS[kind].chance; if (r < acc) { spawnDrop(S, kind, z.x, z.y); break; } }
  }
}

function spawnDrop(S, kind, x, y) {
  if (cellAt(S.level, x, y) !== CELL.EMPTY) { x = Math.floor(x) + 0.5; y = Math.floor(y) + 0.5; }
  if (cellAt(S.level, x, y) !== CELL.EMPTY) return;
  S.drops.push({ id: S.nextId++, kind, x, y, t: 0 });
}

const r2 = (v) => Math.round(v * 100) / 100;

// ---------- Hordas ----------
export function startWave(S, n = S.wave + 1) {
  S.wave = n;
  S.spec = waveSpec(n, S.players.filter(Boolean).length);
  S.roster = waveRoster(S.spec, S.seed + n * 7919);
  S.spawnT = 1.2;
  S.phase = 'fight';
  S.pt = 0;
  S.bossPending = S.spec.boss ? 3.5 : 0;
  for (const p of S.players) if (p) p.ready = false;
  S.ev.push({ k: 'wave', n, boss: S.spec.boss?.id || 0 });
}

function startBreak(S) {
  S.phase = 'break';
  S.pt = S.spec?.breakTime || 20;
  const bonus = 100 * S.wave;
  for (const p of S.players) {
    if (!p) continue;
    if (!p.alive) { p.alive = true; p.hp = 50; p.down = false; p.revive = 0; p.prot = 2; } // al terminar la horda, todos de vuelta
    p.pts += bonus; p.earned += bonus; p.ready = false;
  }
  S.ev.push({ k: 'clear', n: S.wave, bonus });
}

export function remaining(S) {
  return S.roster.length + S.zombies.filter((z) => z.st !== 'dead').length + (S.bossPending > 0 ? 1 : 0);
}

function pickSpawn(S) {
  const L = S.level;
  const ps = alivePlayers(S);
  const far = (x, y, d) => ps.every((p) => Math.hypot(p.x - x, p.y - y) > d);
  if (L.portals.length && S.rand() < 0.65) {
    for (let k = 0; k < 8; k++) {
      const q = L.portals[(S.rand() * L.portals.length) | 0];
      if (far(q.x, q.y, 5)) return { mode: 'emerge', x: q.x + 0.5, y: q.y + 0.5, tx: q.ix + 0.5, ty: q.iy + 0.5 };
    }
  }
  for (let k = 0; k < 12; k++) {
    const q = L.rises[(S.rand() * L.rises.length) | 0];
    if (q && far(q.x, q.y, 6.5)) return { mode: 'rise', x: q.x + 0.5, y: q.y + 0.5 };
  }
  const q = L.portals[(S.rand() * L.portals.length) | 0] || L.rises[0];
  return q.ix != null ? { mode: 'emerge', x: q.x + 0.5, y: q.y + 0.5, tx: q.ix + 0.5, ty: q.iy + 0.5 } : { mode: 'rise', x: q.x + 0.5, y: q.y + 0.5 };
}

export function spawnZombie(S, kind, at = pickSpawn(S)) {
  const T = ZOMBIE_TYPES[kind] || ZOMBIE_TYPES.normal;
  const spec = S.spec || waveSpec(1);
  const hp = Math.round(T.hp * spec.hpMul);
  const z = {
    id: S.nextId++, kind, boss: null, x: at.x, y: at.y, a: 0, hp, max: hp, st: at.mode, t: 0,
    tx: at.tx, ty: at.ty, sp: T.speed * spec.speedMul * (0.9 + S.rand() * 0.2), dmg: T.dmg, r: T.r, h: T.h,
    cd: 0.5, vx: 0, vy: 0, flash: 0, look: S.rand() * 6, ranged: T.ranged || null, rcd: 1 + S.rand() * 2,
  };
  if (at.mode === 'emerge') z.a = Math.atan2(at.ty - at.y, at.tx - at.x);
  S.zombies.push(z);
  S.ev.push({ k: 'spawn', id: z.id, m: at.mode === 'rise' ? 1 : 0, x: r2(z.x), y: r2(z.y) });
  return z;
}

export function spawnBoss(S, bossDef) {
  const L = S.level;
  // en un portal lejos de los jugadores (o en el centro del recorte, saliendo del piso)
  let at = null;
  const ps = alivePlayers(S);
  let bestD = -1;
  for (const q of L.portals) {
    const d = Math.min(...ps.map((p) => Math.hypot(p.x - q.ix, p.y - q.iy)));
    if (d > bestD) { bestD = d; at = { mode: 'emerge', x: q.x + 0.5, y: q.y + 0.5, tx: q.ix + 0.5, ty: q.iy + 0.5 }; }
  }
  if (!at) at = pickSpawn(S);
  const z = {
    id: S.nextId++, kind: 'boss', boss: bossDef.id, x: at.x, y: at.y, a: 0, hp: bossDef.hp, max: bossDef.hp, st: at.mode, t: 0,
    tx: at.tx, ty: at.ty, sp: bossDef.speed, dmg: bossDef.dmg, r: bossDef.r, h: bossDef.h, cd: 1, vx: 0, vy: 0, flash: 0,
    look: 0, a1: 3, a2: 8, cx: 0, cy: 0,
  };
  // el jefe cabe por la puerta: sale del portal sin chocar
  S.zombies.push(z);
  S.bossId = z.id;
  S.ev.push({ k: 'boss', id: z.id, b: bossDef.id });
  return z;
}

// ---------- Paso de simulación ----------
export function step(S, dt) {
  S.t += dt;
  for (const p of S.players) if (p) { p.hurtT = Math.max(0, p.hurtT - dt); p.streakT = Math.max(0, p.streakT - dt); p.prot = Math.max(0, p.prot - dt); }
  if (S.phase !== 'over') updateDowned(S, dt);
  S.flicker = Math.max(0, S.flicker - dt);
  if (S.phase === 'over') { updateZombies(S, dt); return; }
  if (S.phase === 'intro') {
    S.pt -= dt;
    if (S.pt <= 0) startWave(S, 1);
    return;
  }
  if (S.phase === 'break') {
    S.pt -= dt;
    const ps = S.players.filter(Boolean);
    if (ps.length && ps.every((p) => p.ready) && S.pt > 3) S.pt = 3;
    if (S.pt <= 0) startWave(S);
    updateZombies(S, dt);
    updateDrops(S, dt);
    return;
  }
  // Pelea
  S.pt += dt;
  if (S.bossPending > 0) {
    S.bossPending -= dt;
    if (S.bossPending <= 0) { S.bossPending = 0; spawnBoss(S, S.spec.boss); }
  }
  S.spawnT -= dt;
  const alive = S.zombies.filter((z) => z.st !== 'dead').length;
  if (S.roster.length && S.spawnT <= 0 && alive < S.spec.maxAlive) {
    S.spawnT = S.spec.spawnEvery * (0.7 + S.rand() * 0.6);
    spawnZombie(S, S.roster.shift());
  }
  updateZombies(S, dt);
  updateShots(S, dt);
  updateDrops(S, dt);
  if (!S.roster.length && S.bossPending <= 0 && !S.zombies.some((z) => z.st !== 'dead')) startBreak(S);
  if (!alivePlayers(S).length) gameOver(S);
}

// Caídos: un compañero los levanta si se queda junto a ellos (tecla E) antes de que se acabe el tiempo
function updateDowned(S, dt) {
  for (const D of S.players) {
    if (!D || !D.down) continue;
    D.downT -= dt;
    if (D.downT <= 0) { D.down = false; D.revive = 0; S.ev.push({ k: 'dead', s: D.seat }); continue; }
    const helper = S.players.find((p) => p && p.alive && p.rv && Math.hypot(p.x - D.x, p.y - D.y) < 1.4);
    if (helper) {
      D.revive += dt / 2.5;
      if (D.revive >= 1) {
        D.down = false; D.alive = true; D.hp = 40; D.prot = 2; D.revive = 0;
        S.ev.push({ k: 'revive', s: D.seat, by: helper.seat });
      }
    } else D.revive = Math.max(0, D.revive - dt * 0.5);
  }
}

function hurtPlayer(S, P, dmg, from) {
  if (!P.alive || S.god || P.prot > 0) return;
  const soak = Math.min(P.armor, dmg * 0.6);
  P.armor -= soak;
  P.hp -= dmg - soak;
  P.hurtT = 0.4;
  S.ev.push({ k: 'hurt', s: P.seat, d: Math.round(dmg), fx: from ? r2(from.x) : 0, fy: from ? r2(from.y) : 0 });
  if (P.hp <= 0) {
    P.hp = 0; P.alive = false;
    // Con compañeros vivos queda "caído" (lo pueden levantar); si no, se acabó para él
    const others = S.players.some((q) => q && q !== P && q.alive);
    P.down = others; P.downT = others ? 30 : 0; P.revive = 0;
    S.ev.push({ k: 'down', s: P.seat, rv: others ? 1 : 0 });
  }
}

function updateZombies(S, dt) {
  const L = S.level;
  const ps = alivePlayers(S);
  S.fieldT -= dt;
  if (ps.length && (S.fieldT <= 0 || !S.field)) {
    S.fieldT = 0.25;
    S.field = distanceField(L, ps, S.field);
  }
  for (let i = S.zombies.length - 1; i >= 0; i--) {
    const z = S.zombies[i];
    z.t += dt;
    z.flash = Math.max(0, z.flash - dt);
    if (z.st === 'dead') { if (z.t > 2.6) S.zombies.splice(i, 1); continue; }
    if (z.st === 'rise') { if (z.t >= 1.4) { z.st = 'walk'; z.t = 0; } continue; }
    // retroceso por los disparos
    if (z.vx || z.vy) {
      const m = moveCircle(L, z.x, z.y, z.r, z.vx * dt, z.vy * dt);
      z.x = m.x; z.y = m.y;
      z.vx *= Math.pow(0.002, dt); z.vy *= Math.pow(0.002, dt);
      if (Math.abs(z.vx) + Math.abs(z.vy) < 0.02) { z.vx = 0; z.vy = 0; }
    }
    if (z.st === 'emerge') {
      const dx = z.tx - z.x, dy = z.ty - z.y, d = Math.hypot(dx, dy);
      z.a = Math.atan2(dy, dx);
      if (d < 0.08 || z.t > 3) { z.st = 'walk'; z.t = 0; continue; }
      const s = Math.min(d, z.sp * 0.8 * dt);
      z.x += (dx / d) * s; z.y += (dy / d) * s;
      continue;
    }
    if (!ps.length) { z.st = 'walk'; continue; }
    // objetivo: el jugador vivo más cercano
    let tgt = ps[0], td = dist(z, ps[0]);
    for (const p of ps) { const d = dist(z, p); if (d < td) { td = d; tgt = p; } }
    if (z.kind === 'boss') { bossThink(S, z, tgt, td, dt); continue; }
    z.cd = Math.max(0, z.cd - dt);
    const reach = z.r + PLAYER_R + 0.32;
    if (z.st === 'attack') {
      z.a = turn(z.a, Math.atan2(tgt.y - z.y, tgt.x - z.x), 6 * dt);
      if (z.t >= 0.45 && !z.hitDone) {
        z.hitDone = true;
        if (td <= reach + 0.25) hurtPlayer(S, tgt, z.dmg, z);
      }
      if (z.t >= 0.9) { z.st = 'walk'; z.t = 0; z.cd = 0.4; }
      continue;
    }
    if (td <= reach && z.cd <= 0) { z.st = 'attack'; z.t = 0; z.hitDone = false; S.ev.push({ k: 'swing', id: z.id }); continue; }
    // los que escupen: a media distancia se paran y escupen café
    if (z.ranged) {
      z.rcd -= dt;
      if (td < z.ranged.range && td > 2.2 && z.rcd <= 0 && lineOfSight(L, z.x, z.y, tgt.x, tgt.y)) {
        z.rcd = z.ranged.every * (0.8 + S.rand() * 0.4);
        shoot(S, z, 'acid', Math.atan2(tgt.y - z.y, tgt.x - z.x), z.ranged.speed, z.ranged.dmg, 1.4);
        z.st = 'walk'; z.t = 0; z.pause = 0.6;
      }
    }
    if (z.pause > 0) { z.pause -= dt; continue; }
    // ya está pegado al jugador: espera su siguiente golpe sin encimarse
    if (td <= reach) { z.a = turn(z.a, Math.atan2(tgt.y - z.y, tgt.x - z.x), 6 * dt); continue; }
    // caminar: directo si se ve, si no por el mapa de distancias
    let gx, gy;
    if (td < 2.5 && lineOfSight(L, z.x, z.y, tgt.x, tgt.y)) { gx = tgt.x; gy = tgt.y; }
    else {
      const nxt = downhill(S, z.x, z.y);
      gx = nxt ? nxt.x : tgt.x; gy = nxt ? nxt.y : tgt.y;
    }
    let dx = gx - z.x, dy = gy - z.y;
    const d = Math.hypot(dx, dy) || 1;
    dx /= d; dy /= d;
    // separarse de los demás
    let sx = 0, sy = 0;
    for (const o of S.zombies) {
      if (o === z || o.st === 'dead' || o.st === 'rise') continue;
      const ex = z.x - o.x, ey = z.y - o.y, e = Math.hypot(ex, ey), rr = z.r + o.r;
      if (e < rr && e > 1e-4) { sx += (ex / e) * (rr - e); sy += (ey / e) * (rr - e); }
    }
    const wob = Math.sin(S.t * 2.2 + z.look) * 0.25; // tambaleo
    const wx = dx - dy * wob, wy = dy + dx * wob;
    const sp = z.sp * dt;
    const m = moveCircle(L, z.x, z.y, z.r, wx * sp + sx * 0.5, wy * sp + sy * 0.5);
    z.x = m.x; z.y = m.y;
    z.a = turn(z.a, Math.atan2(dy, dx), 5 * dt);
  }
}

// siguiente casilla bajando por el mapa de distancias
function downhill(S, x, y) {
  const L = S.level, F = S.field;
  if (!F) return null;
  const i = Math.floor(x), j = Math.floor(y);
  const cur = F[j * L.W + i];
  let best = null, bv = cur < 0 ? 1e9 : cur;
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
    const ni = i + dx, nj = j + dy;
    if (ni < 0 || nj < 0 || ni >= L.W || nj >= L.H) continue;
    if (dx && dy && (F[j * L.W + ni] < 0 || F[nj * L.W + i] < 0)) continue; // sin cortar esquinas
    const v = F[nj * L.W + ni];
    if (v >= 0 && v < bv - (dx && dy ? 0.4 : 0)) { bv = v; best = { x: ni + 0.5, y: nj + 0.5 }; }
  }
  return best;
}

function turn(a, b, max) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + Math.max(-max, Math.min(max, d));
}

function shoot(S, from, kind, ang, speed, dmg, h = 1.4, extra = {}) {
  S.shots.push({ id: S.nextId++, kind, x: from.x + Math.cos(ang) * (from.r || 0.3), y: from.y + Math.sin(ang) * (from.r || 0.3), vx: Math.cos(ang) * speed, vy: Math.sin(ang) * speed, dmg, h, t: 0, ...extra });
  S.ev.push({ k: 'spit', id: from.id, p: kind });
}

function updateShots(S, dt) {
  const L = S.level;
  for (let i = S.shots.length - 1; i >= 0; i--) {
    const q = S.shots[i];
    q.t += dt;
    q.x += q.vx * dt; q.y += q.vy * dt;
    if (q.arc) q.h = 1.6 + Math.sin(Math.min(1, q.t / q.arc) * Math.PI) * 1.2 - q.t * 0.4;
    let gone = false;
    const c = cellAt(L, q.x, q.y);
    if ((c !== CELL.EMPTY && !(c === CELL.SOLID && q.h > 1.1)) || q.t > 4) gone = true;
    for (const p of alivePlayers(S)) {
      if (Math.hypot(p.x - q.x, p.y - q.y) < PLAYER_R + 0.18) { hurtPlayer(S, p, q.dmg, q); gone = true; break; }
    }
    if (gone) {
      if (q.splash) for (const p of alivePlayers(S)) if (Math.hypot(p.x - q.x, p.y - q.y) < q.splash) hurtPlayer(S, p, q.dmg * 0.5, q);
      S.ev.push({ k: 'pop', p: q.kind, x: r2(q.x), y: r2(q.y), h: r2(q.h) });
      S.shots.splice(i, 1);
    }
  }
}

function updateDrops(S, dt) {
  for (let i = S.drops.length - 1; i >= 0; i--) {
    const d = S.drops[i];
    d.t += dt;
    if (d.t > 30) { S.drops.splice(i, 1); continue; }
    for (const p of alivePlayers(S)) {
      if (Math.hypot(p.x - d.x, p.y - d.y) > 0.65) continue;
      if (d.kind === 'health') { if (p.hp >= p.maxHp) continue; p.hp = Math.min(p.maxHp, p.hp + 30); }
      else if (d.kind === 'points') { p.pts += 150; p.earned += 150; }
      else if (d.kind === 'ammo') S.grants.push({ s: p.seat, ammo: 'pack' });
      S.ev.push({ k: 'pick', s: p.seat, d: d.kind });
      S.drops.splice(i, 1);
      break;
    }
  }
}

// ---------- Jefes ----------
function bossThink(S, z, tgt, td, dt) {
  const L = S.level;
  const enraged = z.hp < z.max * 0.4;
  const rate = enraged ? 1.5 : 1;
  z.a1 -= dt * rate; z.a2 -= dt * rate;
  const face = Math.atan2(tgt.y - z.y, tgt.x - z.x);
  if (z.st === 'windup') {
    z.a = turn(z.a, face, 3 * dt);
    if (z.t >= (z.cast === 'slam' ? 0.9 : 0.8)) {
      if (z.cast === 'charge') { z.st = 'charge'; z.t = 0; z.cx = Math.cos(z.a); z.cy = Math.sin(z.a); S.ev.push({ k: 'charge', id: z.id }); }
      else if (z.cast === 'slam') {
        z.st = 'walk'; z.t = 0;
        S.ev.push({ k: 'slam', id: z.id, x: r2(z.x), y: r2(z.y) });
        for (const p of alivePlayers(S)) if (dist(p, z) < 3.4) hurtPlayer(S, p, 24, z);
      }
    }
    return;
  }
  if (z.st === 'charge') {
    const m = moveCircle(L, z.x, z.y, z.r, z.cx * 7.5 * dt, z.cy * 7.5 * dt);
    z.x = m.x; z.y = m.y;
    for (const p of alivePlayers(S)) {
      if (!z.hitDone && dist(p, z) < z.r + PLAYER_R + 0.3) { z.hitDone = true; hurtPlayer(S, p, 30, z); }
    }
    if (m.hit || z.t > 1.3) { z.st = 'stun'; z.t = 0; S.ev.push({ k: 'thud', id: z.id, x: r2(z.x), y: r2(z.y) }); }
    return;
  }
  if (z.st === 'stun') { if (z.t > (m2(z) ? 1.3 : 1.0)) { z.st = 'walk'; z.t = 0; } return; }
  if (z.st === 'attack') {
    z.a = turn(z.a, face, 4 * dt);
    if (z.t >= 0.55 && !z.hitDone) { z.hitDone = true; if (td < z.r + PLAYER_R + 0.6) hurtPlayer(S, tgt, z.dmg, z); }
    if (z.t >= 1.1) { z.st = 'walk'; z.t = 0; z.cd = 0.5; }
    return;
  }
  if (z.st === 'cast') { if (z.t > 0.6) { z.st = 'walk'; z.t = 0; } return; }
  z.cd = Math.max(0, (z.cd || 0) - dt);
  const los = lineOfSight(L, z.x, z.y, tgt.x, tgt.y);
  // ataques especiales
  if (z.boss === 'gerente') {
    if (z.a1 <= 0 && los && td > 2.5 && td < 12) { z.a1 = 6; z.st = 'windup'; z.cast = 'charge'; z.t = 0; z.hitDone = false; S.ev.push({ k: 'roar', id: z.id }); return; }
    if (z.a2 <= 0) {
      z.a2 = 12; z.st = 'cast'; z.t = 0;
      S.ev.push({ k: 'summon', id: z.id });
      for (let k = 0; k < (enraged ? 4 : 3); k++) {
        const ang = (k / 3) * Math.PI * 2 + S.rand();
        const x = z.x + Math.cos(ang) * 1.4, y = z.y + Math.sin(ang) * 1.4;
        if (cellAt(L, x, y) === CELL.EMPTY) { const m = spawnZombie(S, 'normal', { mode: 'rise', x, y }); m.kind = 'normal'; m.minion = true; }
      }
      return;
    }
  } else if (z.boss === 'impresora') {
    if (z.a1 <= 0 && los) {
      z.a1 = 2.2; z.st = 'cast'; z.t = 0;
      const n = enraged ? 7 : 5;
      for (let k = 0; k < n; k++) shoot(S, z, 'paper', face + (k - (n - 1) / 2) * 0.16, 7, 9, 1.3);
      return;
    }
    if (z.a2 <= 0) {
      z.a2 = 9; z.st = 'cast'; z.t = 0;
      for (let k = 0; k < 16; k++) shoot(S, z, 'paper', (k / 16) * Math.PI * 2 + S.t, 5, 10, 1.0);
      S.ev.push({ k: 'jam', id: z.id });
      return;
    }
  } else if (z.boss === 'becario') {
    if (z.a1 <= 0 && td < 3.6) { z.a1 = 5; z.st = 'windup'; z.cast = 'slam'; z.t = 0; S.ev.push({ k: 'roar', id: z.id }); return; }
    if (z.a2 <= 0 && td > 4 && los) {
      z.a2 = 4; z.st = 'cast'; z.t = 0;
      const sp = Math.min(7, Math.max(3.5, td / 1.1));
      shoot(S, z, 'coffee', face, sp, 16, 2.4, { arc: td / sp, splash: 1.3 });
      return;
    }
  }
  if (td < z.r + PLAYER_R + 0.45 && z.cd <= 0) { z.st = 'attack'; z.t = 0; z.hitDone = false; S.ev.push({ k: 'swing', id: z.id }); return; }
  // la impresora prefiere guardar distancia
  if (z.boss === 'impresora' && td < 4.5 && los) {
    const m = moveCircle(L, z.x, z.y, z.r, -Math.cos(face) * z.sp * dt, -Math.sin(face) * z.sp * dt);
    z.x = m.x; z.y = m.y; z.a = turn(z.a, face, 3 * dt);
    return;
  }
  let gx = tgt.x, gy = tgt.y;
  if (!(td < 3 && los)) { const n = downhill(S, z.x, z.y); if (n) { gx = n.x; gy = n.y; } }
  const dx = gx - z.x, dy = gy - z.y, d = Math.hypot(dx, dy) || 1;
  const sp = z.sp * (enraged ? 1.3 : 1) * dt;
  const m = moveCircle(L, z.x, z.y, Math.min(z.r, 0.45), (dx / d) * sp, (dy / d) * sp);
  z.x = m.x; z.y = m.y;
  z.a = turn(z.a, Math.atan2(dy, dx), 3 * dt);
}
const m2 = (z) => z.hp < z.max * 0.4;

// ---------- Tienda ----------
export function buy(S, seat, id) {
  const P = S.players[seat];
  const item = SHOP.find((s) => s.id === id);
  if (!P || !item || S.phase !== 'break') return { ok: false, why: 'Solo entre hordas' };
  let cost = item.cost;
  if (id === 'upgrade') { if (P.dmgLvl >= 3) return { ok: false, why: 'Ya está al máximo' }; cost = upgradeCost(P.dmgLvl); }
  if (item.weapon != null && P.owned[item.weapon]) return { ok: false, why: 'Ya la tienes' };
  if (id === 'heal' && P.hp >= P.maxHp) return { ok: false, why: 'Ya tienes toda la vida' };
  if (P.pts < cost) return { ok: false, why: 'Te faltan puntos' };
  P.pts -= cost;
  if (id === 'ammo') S.grants.push({ s: seat, ammo: 'full' });
  else if (id === 'heal') P.hp = Math.min(P.maxHp, P.hp + 60);
  else if (id === 'armor') P.armor = Math.min(100, P.armor + 50);
  else if (id === 'upgrade') P.dmgLvl++;
  else if (item.weapon != null) { P.owned[item.weapon] = true; S.grants.push({ s: seat, weapon: item.weapon }); }
  S.ev.push({ k: 'buy', s: seat, id });
  return { ok: true };
}

export function itemCost(P, item) { return item.id === 'upgrade' ? upgradeCost(P?.dmgLvl || 0) : item.cost; }

// ---------- Estado compacto para la red ----------
const q2 = (v) => Math.round(v * 100);
export function pack(S) {
  const boss = S.bossId ? S.zombies.find((z) => z.id === S.bossId) : null;
  return {
    ph: S.phase, pt: Math.round(S.pt * 10) / 10, w: S.wave, left: remaining(S), k: S.kills, fl: S.flicker > 0 ? 1 : 0,
    P: S.players.map((p) => p && [q2(p.x), q2(p.y), Math.round(p.a * 1000), Math.round(p.p * 1000), Math.ceil(p.hp), Math.ceil(p.armor), p.alive ? 1 : 0, p.w, p.pts, p.earned, p.kills, p.dmgLvl, (p.owned[0] ? 1 : 0) | (p.owned[1] ? 2 : 0) | (p.owned[2] ? 4 : 0), p.ready ? 1 : 0, p.mv || 0, p.hurtT > 0 ? 1 : 0, p.down ? 1 : 0, Math.round(p.revive * 100), Math.ceil(p.downT), p.prot > 0 ? 1 : 0]),
    Z: S.zombies.map((z) => [z.id, KINDS.indexOf(z.kind), z.boss ? BOSS_ORDER.indexOf(z.boss) : -1, q2(z.x), q2(z.y), Math.round(z.a * 100), Math.round((z.hp / z.max) * 100), ZSTATES.indexOf(z.st), Math.round(z.t * 100), z.flash > 0 ? 1 : 0, z.minion ? 1 : 0]),
    J: S.shots.map((q) => [q.id, PROJ.indexOf(q.kind), q2(q.x), q2(q.y), q2(q.h)]),
    K: S.drops.map((d) => [d.id, DROP_KINDS.indexOf(d.kind), q2(d.x), q2(d.y)]),
    B: boss ? [BOSS_ORDER.indexOf(boss.boss), Math.max(0, Math.round(boss.hp)), boss.max] : 0,
    ev: S.ev.splice(0),
  };
}

// Convierte el estado compacto en objetos para dibujar
export function unpackPlayers(d) {
  return (d.P || []).map((p, seat) => p && ({
    seat, x: p[0] / 100, y: p[1] / 100, a: p[2] / 1000, p: p[3] / 1000, hp: p[4], armor: p[5], alive: !!p[6], w: p[7], pts: p[8], earned: p[9], kills: p[10], dmgLvl: p[11],
    owned: [!!(p[12] & 1), !!(p[12] & 2), !!(p[12] & 4)], ready: !!p[13], mv: p[14], hurt: !!p[15], down: !!p[16], revive: (p[17] || 0) / 100, downT: p[18] || 0, prot: !!p[19], maxHp: 100,
  }));
}
export function unpackZombie(z) {
  const kind = KINDS[z[1]];
  const boss = z[2] >= 0 ? BOSS_ORDER[z[2]] : null;
  const T = boss ? null : ZOMBIE_TYPES[kind];
  return { id: z[0], kind, boss, x: z[3] / 100, y: z[4] / 100, a: z[5] / 100, hpPct: z[6], st: ZSTATES[z[7]], t: z[8] / 100, flash: z[9], minion: !!z[10], r: boss ? BOSSES[boss].r : T.r, h: boss ? BOSSES[boss].h : T.h };
}

// El anfitrión se fue: el nuevo anfitrión rearma la partida con el último estado que recibió.
export function restoreSim(level, d, { seed = (Math.random() * 2 ** 31) | 0 } = {}) {
  const S = createSim(level, { seats: [false, false, false, false], seed });
  S.phase = d.ph || 'intro'; S.pt = d.pt || 0; S.wave = d.w || 0; S.kills = d.k || 0;
  const ps = unpackPlayers(d);
  ps.forEach((p, i) => {
    if (!p) return;
    S.players[i] = { ...newPlayer(i, level), x: p.x, y: p.y, a: p.a, p: p.p, hp: p.hp, armor: p.armor, alive: p.alive, w: p.w, pts: p.pts, earned: p.earned, kills: p.kills, dmgLvl: p.dmgLvl, owned: p.owned, ready: p.ready, down: p.down, downT: p.downT, revive: p.revive, prot: 2 };
  });
  if (S.wave) { S.spec = waveSpec(S.wave, ps.filter(Boolean).length); }
  let maxId = 1;
  for (const raw of d.Z || []) {
    const z = unpackZombie(raw);
    if (z.st === 'dead') continue;
    maxId = Math.max(maxId, z.id);
    const T = z.boss ? BOSSES[z.boss] : ZOMBIE_TYPES[z.kind];
    const spec = S.spec || waveSpec(1);
    const max = z.boss ? (d.B ? d.B[2] : T.hp) : Math.round(T.hp * spec.hpMul);
    S.zombies.push({
      id: z.id, kind: z.kind, boss: z.boss, x: z.x, y: z.y, a: z.a, hp: Math.max(1, (z.hpPct / 100) * max), max, st: z.st === 'rise' || z.st === 'emerge' ? 'walk' : (z.st === 'attack' ? 'walk' : z.st), t: 0,
      sp: T.speed * (z.boss ? 1 : spec.speedMul), dmg: T.dmg, r: T.r, h: T.h, cd: 0.5, vx: 0, vy: 0, flash: 0, look: z.id, ranged: T.ranged || null, rcd: 1, a1: 3, a2: 8, minion: z.minion,
    });
    if (z.boss) S.bossId = z.id;
    if (['windup', 'charge', 'stun', 'cast'].includes(S.zombies[S.zombies.length - 1].st)) S.zombies[S.zombies.length - 1].st = 'walk';
  }
  for (const k of d.K || []) maxId = Math.max(maxId, k[0]), S.drops.push({ id: k[0], kind: DROP_KINDS[k[1]], x: k[2] / 100, y: k[3] / 100, t: 0 });
  S.nextId = maxId + 1000;
  // los que faltan por salir en esta horda
  if (S.phase === 'fight' && S.spec) {
    const alive = S.zombies.length;
    const left = Math.max(0, (d.left || 0) - alive);
    S.roster = waveRoster({ ...S.spec, count: left }, S.seed);
    if (S.spec.boss && !S.bossId && left > 0 && !S.zombies.some((q) => q.kind === 'boss')) { S.bossPending = 1; S.roster.pop(); }
  }
  return S;
}
