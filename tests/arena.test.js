// Arena HUB (jugador contra jugador): reglas de los modos, zona, aparecer seguro, compensación de
// retraso, límites del anfitrión, daño contra personas, botín, mapas y la simulación completa con bots.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { getTemplate, composeFloor } from '../shared/map.js';
import { ARMS, armIndex, TECHNIQUES, rng } from '../shared/arsenal.js';
import { CELL, cellAt, floodReach } from '../shared/zombies.js';
import {
  MODES, cleanConfig, cleanLoadout, roundsToWin, matchResult, roundWinner, pickMvp, ZONE_PHASES, zonePlan, zoneAt, zoneDamage, outsideZone,
  autoBalance, canSwitchTeam, chooseSpawn, spawnScore, PosHistory, rewindTime, MAX_REWIND, fireGate, gateAllow, acceptMove, refillBudget, MOVE_SLACK, shotTime, syncClock,
  pvpDamage, pvpTech, PVP, PRIMARIES, SECONDARIES, MELEES, CLASSES, LOOT, lootPick, rollLoot, matchXp, levelFor, xpForLevel, levelProgress,
  traceShot, arenaRay, arenaLos, BODY, MAX_HP,
} from '../shared/arena.js';
import { ARENA_MAPS, MAP_IDS, arenaLevel, officeArenaLevel, arenaFloor } from '../shared/arenaMaps.js';
import * as sim from '../client/src/games/arena/sim.js';

const W = (id) => armIndex(id);

// Un cuarto vacío de w × h con muros alrededor
function room(w = 20, h = 12, extra = null) {
  const grid = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (x === 0 || y === 0 || x === w - 1 || y === h - 1) grid[y * w + x] = CELL.WALL;
  const L = { W: w, H: h, grid, tall: new Uint8Array(w * h), ox: 0, oy: 0, portals: [], objects: [], signs: [], start: { x: 2.5, y: 2.5 } };
  extra?.(L);
  const open = [];
  for (let y = 2; y < h - 2; y++) for (let x = 2; x < w - 2; x++) if (grid[y * w + x] === CELL.EMPTY) open.push({ x: x + 0.5, y: y + 0.5 });
  L.open = open;
  L.spawns = [{ x: 2.5, y: 2.5, a: 0, team: 0 }, { x: 2.5, y: h - 2.5, a: 0, team: 0 }, { x: w - 2.5, y: 2.5, a: Math.PI, team: 1 }, { x: w - 2.5, y: h - 2.5, a: Math.PI, team: 1 }, { x: w / 2, y: h / 2, a: 0, team: null }];
  L.pickups = [{ x: w / 2 + 0.5, y: 2.5, kind: 'health' }, { x: w / 2 + 0.5, y: h - 2.5, kind: 'armor' }];
  L.loot = open.filter((_, i) => i % 9 === 0).slice(0, 12);
  return L;
}
// Dos jugadores frente a frente en un cuarto; devuelve la simulación ya en vivo
function duelSim(mode = 'ffa', extra = {}) {
  const L = room(24, 12);
  const S = sim.createSim(L, { cfg: { mode, ...extra }, seats: [true, true], seed: 5 });
  sim.startMatch(S);
  S.phase = 'live';
  const [A, B] = S.players;
  Object.assign(A, { x: 4.5, y: 6.5, a: 0, p: 0, prot: 0 });
  Object.assign(B, { x: 14.5, y: 6.5, a: Math.PI, p: 0, prot: 0 });
  return { S, A, B, L };
}
const aimAt = (A, B, h = 1.2) => ({ a: Math.atan2(B.y - A.y, B.x - A.x), p: Math.atan2(h - BODY.stand.eye, Math.hypot(B.x - A.x, B.y - A.y) * 1.25) });

describe('modos y configuración', () => {
  test('la configuración se limpia: modo, límite y mapa válidos', () => {
    assert.deepEqual(cleanConfig({ mode: 'nada', limit: 999, map: 'x' }, MAP_IDS), { mode: 'ffa', map: 'bodega', limit: 20, time: 480, bots: 0, diff: 'normal' });
    const c = cleanConfig({ mode: 'equipos', limit: 25, time: 300, map: 'azotea', bots: 20, diff: 'dificil' }, MAP_IDS);
    assert.equal(c.limit, 25); assert.equal(c.time, 300); assert.equal(c.map, 'azotea'); assert.equal(c.bots, 7); assert.equal(c.diff, 'dificil');
    assert.equal(roundsToWin(3), 2); assert.equal(roundsToWin(5), 3); assert.equal(roundsToWin(7), 4);
    for (const m of Object.values(MODES)) assert.ok(m.name && m.desc && m.limits.length);
  });

  test('todos contra todos: gana el primero al límite; con el tiempo, el de más bajas (empate = nadie)', () => {
    const ps = [{ seat: 0, kills: 19, deaths: 2 }, { seat: 1, kills: 20, deaths: 9 }, { seat: 2, kills: 4, deaths: 3 }];
    assert.deepEqual(matchResult({ mode: 'ffa', limit: 20, clock: 50, players: ps }), { seat: 1, team: null, reason: 'limit' });
    assert.equal(matchResult({ mode: 'ffa', limit: 30, clock: 50, players: ps }), null, 'sigue la partida');
    assert.equal(matchResult({ mode: 'ffa', limit: 30, clock: 0, players: ps }).seat, 1, 'se acabó el tiempo');
    const tie = [{ seat: 0, kills: 5, deaths: 2 }, { seat: 1, kills: 5, deaths: 2 }];
    assert.equal(matchResult({ mode: 'ffa', limit: 30, clock: 0, players: tie }).seat, null, 'empate');
    const tieKd = [{ seat: 0, kills: 5, deaths: 4 }, { seat: 1, kills: 5, deaths: 2 }];
    assert.equal(matchResult({ mode: 'ffa', limit: 30, clock: 0, players: tieKd }).seat, 1, 'desempata quien murió menos');
  });

  test('por equipos: suma del equipo, límite y tiempo', () => {
    const ps = [{ seat: 0, team: 0, kills: 3, deaths: 1 }, { seat: 1, team: 1, kills: 1, deaths: 3 }];
    assert.deepEqual(matchResult({ mode: 'equipos', limit: 40, clock: 10, teamScore: [40, 12], players: ps }), { seat: null, team: 0, reason: 'limit' });
    assert.equal(matchResult({ mode: 'equipos', limit: 40, clock: 10, teamScore: [39, 39], players: ps }), null);
    assert.equal(matchResult({ mode: 'equipos', limit: 40, clock: 0, teamScore: [10, 12], players: ps }).team, 1);
    assert.equal(matchResult({ mode: 'equipos', limit: 40, clock: 0, teamScore: [12, 12], players: ps }).team, null, 'empate');
  });

  test('duelo: rondas al mejor de N y ganador de cada ronda', () => {
    const ps = [{ seat: 0 }, { seat: 3 }];
    assert.equal(matchResult({ mode: 'duelo', limit: 5, roundWins: { 0: 2, 3: 2 }, players: ps }), null);
    assert.deepEqual(matchResult({ mode: 'duelo', limit: 5, roundWins: { 0: 2, 3: 3 }, players: ps }), { seat: 3, team: null, reason: 'rounds' });
    assert.equal(roundWinner({ seat: 0, alive: true, hp: 10, armor: 0 }, { seat: 1, alive: false, hp: 0, armor: 0 }), 0);
    assert.equal(roundWinner({ seat: 0, alive: true, hp: 40, armor: 0 }, { seat: 1, alive: true, hp: 70, armor: 0 }), 1, 'tiempo: más vida');
    assert.equal(roundWinner({ seat: 0, alive: true, hp: 50, armor: 0 }, { seat: 1, alive: true, hp: 50, armor: 0 }), null, 'empate');
  });

  test('último en pie: gana el que queda vivo', () => {
    const ps = [{ seat: 0 }, { seat: 1 }, { seat: 2 }];
    assert.equal(matchResult({ mode: 'royale', players: ps, alive: [0, 2] }), null);
    assert.deepEqual(matchResult({ mode: 'royale', players: ps, alive: [2] }), { seat: 2, team: null, reason: 'last' });
    assert.equal(matchResult({ mode: 'royale', players: ps, alive: [] }).seat, null, 'si caen todos, nadie');
  });

  test('el mejor de la partida (MVP) premia bajas, asistencias y ganar', () => {
    const ps = [{ seat: 0, kills: 10, deaths: 4, assists: 0, dmg: 1200 }, { seat: 1, kills: 9, deaths: 1, assists: 4, dmg: 1100 }, null];
    assert.equal(pickMvp(ps, () => false), 1);
    assert.equal(pickMvp(ps, (p) => p.seat === 0), 0, 'ganar pesa');
  });
});

describe('zona que se apaga (Último en pie)', () => {
  const L = { W: 40, H: 30 };
  const plan = zonePlan(L, 7);
  test('cada círculo cabe dentro del anterior y se cierra hasta nada', () => {
    assert.equal(plan.length, ZONE_PHASES.length + 1);
    for (let i = 1; i < plan.length; i++) {
      const a = plan[i - 1], b = plan[i];
      assert.ok(b.r <= a.r, 'más chico');
      assert.ok(Math.hypot(b.x - a.x, b.y - a.y) + b.r <= a.r + 1e-6, `círculo ${i} adentro del ${i - 1}`);
    }
    assert.equal(plan[plan.length - 1].r, 0);
    assert.ok(plan[0].r >= Math.hypot(40, 30) / 2, 'al principio cubre todo el mapa');
  });
  test('espera, se cierra poco a poco, y el daño de afuera sube en cada fase', () => {
    const z0 = zoneAt(plan, 1);
    assert.equal(z0.phase, 0); assert.equal(z0.shrinking, false); assert.equal(z0.r, plan[0].r);
    const t1 = ZONE_PHASES[0].wait + ZONE_PHASES[0].shrink / 2;
    const z1 = zoneAt(plan, t1);
    assert.equal(z1.shrinking, true);
    assert.ok(z1.r < plan[0].r && z1.r > plan[1].r, 'a la mitad del cierre');
    const zEnd = zoneAt(plan, 1e5);
    assert.equal(zEnd.r, 0);
    let prev = 0;
    for (const ph of ZONE_PHASES) { assert.ok(ph.dps > prev); prev = ph.dps; }
    // daño: adentro nada, afuera dps × dt
    const z = zoneAt(plan, ZONE_PHASES[0].wait + ZONE_PHASES[0].shrink + 1);
    assert.equal(zoneDamage(z, z.x, z.y, 1), 0);
    assert.ok(outsideZone(z, z.x + z.r + 1, z.y));
    assert.equal(zoneDamage(z, z.x + z.r + 1, z.y, 0.5), z.dps * 0.5);
  });
  test('en la simulación la zona lastima a quien se queda afuera', () => {
    const L2 = room(30, 20);
    const S = sim.createSim(L2, { cfg: { mode: 'royale' }, seats: [true, true, true], seed: 3 });
    sim.startMatch(S);
    S.phase = 'live';
    S.zt = 1e4; // ya se cerró
    const P = S.players[0];
    P.prot = 0;
    const hp0 = P.hp;
    for (let i = 0; i < 60; i++) sim.step(S, 1 / 60);
    assert.ok(P.hp < hp0, `bajó la vida (${P.hp})`);
  });
});

describe('equipos', () => {
  test('reparto parejo respetando lo que se pidió', () => {
    const t = autoBalance([0, 1, 2, 3, 4, 5], { 0: 1, 1: 1, 2: 1, 3: 1 });
    const n = [0, 0];
    for (const v of Object.values(t)) n[v]++;
    assert.ok(Math.abs(n[0] - n[1]) <= 1, `parejos ${n}`);
    assert.equal(t[0], 1);
    const odd = autoBalance([0, 1, 2]);
    assert.ok(Math.abs(Object.values(odd).filter((v) => v === 0).length - Object.values(odd).filter((v) => v === 1).length) <= 1);
    assert.equal(canSwitchTeam({ 0: 0, 1: 0, 2: 1, 3: 1 }, 0, 1), false, '3 contra 1 no');
    assert.equal(canSwitchTeam({ 0: 0, 1: 0, 2: 1 }, 0, 1), true);
  });
  test('sin fuego amigo y la baja suma al equipo', () => {
    const L = room(24, 12);
    const S = sim.createSim(L, { cfg: { mode: 'equipos' }, seats: [true, true, true, true], seed: 2 });
    sim.startMatch(S); S.phase = 'live';
    const [A, B, C] = S.players;
    A.team = 0; B.team = 1; C.team = 0;
    for (const p of [A, B, C]) p.prot = 0;
    assert.equal(sim.damagePlayer(S, C, 50, A.seat, W('grapadora')), 0, 'compañero: no');
    assert.ok(sim.damagePlayer(S, B, 150, A.seat, W('grapadora')) > 0);
    assert.equal(B.alive, false);
    assert.deepEqual(S.teamScore, [1, 0]);
    assert.equal(A.kills, 1);
  });
});

describe('aparecer seguro', () => {
  const spawns = [{ x: 2, y: 2 }, { x: 18, y: 2 }, { x: 10, y: 9 }];
  test('lejos y fuera de la vista de los enemigos', () => {
    // el enemigo ve todos menos el de (18,2) (detrás de un muro)
    const los = (ax, ay, bx, by) => !(bx === 18 && by === 2);
    const enemies = [{ x: 4, y: 3 }];
    for (let k = 0; k < 20; k++) assert.equal(chooseSpawn(spawns, { enemies, los, rand: rng(k) }), 1);
    // nunca en uno que ya está ocupado
    assert.ok(spawnScore(spawns[2], { occupied: [{ x: 10, y: 9 }] }) < -100);
  });
  test('si todos se ven, el más lejano; en equipos, de tu lado', () => {
    const enemies = [{ x: 2.5, y: 2.5 }];
    assert.equal(chooseSpawn(spawns, { enemies, los: () => true, rand: () => 0 }), 1);
    const side = [{ x: 2, y: 2, team: 0 }, { x: 18, y: 2, team: 1 }];
    assert.equal(chooseSpawn(side, { team: 1, rand: () => 0 }), 1);
  });
  test('la simulación usa un lugar que el enemigo no ve', () => {
    // muro largo al centro: los de la izquierda no ven a la derecha
    const L = room(24, 12, (Lv) => { for (let y = 1; y < 11; y++) Lv.grid[y * 24 + 12] = CELL.WALL; });
    L.spawns = [{ x: 4.5, y: 6.5, team: null }, { x: 8.5, y: 3.5, team: null }, { x: 18.5, y: 6.5, team: null }];
    const S = sim.createSim(L, { cfg: { mode: 'ffa' }, seats: [true, true], seed: 9 });
    sim.startMatch(S); S.phase = 'live';
    const [A, B] = S.players;
    Object.assign(A, { x: 5.5, y: 6.5, alive: true });
    B.alive = false;
    sim.spawn(S, B);
    assert.ok(B.x > 12, `apareció del otro lado del muro (${B.x})`);
    assert.ok(B.prot > 0, 'con protección');
  });
});

describe('compensación de retraso', () => {
  test('el historial interpola y no rebobina de más', () => {
    const h = new PosHistory(10);
    for (let t = 0; t <= 200; t += 50) h.push(t, t / 100, 0);
    assert.deepEqual([h.at(75).x, h.at(75).y], [0.75, 0]);
    assert.equal(h.at(-50).x, 0);
    assert.equal(h.at(999).x, 2);
    // un salto (reapareció) no se interpola
    h.push(250, 90, 0);
    assert.ok([2, 90].includes(h.at(240).x));
    assert.equal(rewindTime(1000, 200), 1000 - MAX_REWIND, 'tope');
    assert.equal(rewindTime(1000, 900), 900);
    assert.equal(rewindTime(1000, 5000), 1000, 'no al futuro');
    assert.equal(rewindTime(1000, NaN), 1000);
  });
  test('el disparo pega donde lo veía quien disparó (y falla donde está ahora)', () => {
    const { S, A, B } = duelSim();
    // B camina hacia arriba; el que dispara lo veía 150 ms antes en y = 6.5
    for (let k = 0; k <= 20; k++) { S.ms = 1000 + k * 10; B.y = 6.5 - k * 0.04; S.hist[B.seat].push(S.ms, B.x, B.y, 0, true); }
    S.ms = 1200;
    const aim = aimAt(A, { x: B.x, y: 6.5 });
    const g = A.gate;
    const r = sim.fire(S, A.seat, { x: A.x, y: A.y, ...aim, w: W('grapadora'), seed: 1, sp: ARMS[W('grapadora')].ads, rt: 1000 }, 1200);
    assert.equal(r[0].hit, true, 'rebobinado: le pega');
    assert.ok(B.hp < MAX_HP);
    const hp = B.hp;
    A.gate = g; A.gate.tok = {};
    const r2 = sim.fire(S, A.seat, { x: A.x, y: A.y, ...aim, w: W('grapadora'), seed: 1, sp: ARMS[W('grapadora')].ads, rt: 1200 }, 1700);
    assert.equal(r2[0].hit, false, 'sin rebobinar ya no está ahí');
    assert.equal(B.hp, hp);
  });
});

describe('límites del anfitrión', () => {
  test('cadencia: no se puede disparar más rápido que el arma', () => {
    const g = fireGate();
    const w = W('grapadora');
    let ok = 0;
    for (let t = 0; t < 1000; t += 10) if (gateAllow(g, w, t)) ok++;
    const every = ARMS[w].every;
    assert.ok(ok <= Math.ceil(1 / every * 1.25) + 2, `en 1 s: ${ok}`);
    // al ritmo normal sí pasan todos
    const g2 = fireGate();
    let ok2 = 0;
    for (let i = 0; i < 20; i++) if (gateAllow(g2, w, i * every * 1000)) ok2++;
    assert.equal(ok2, 20);
    // ráfaga del tóner: 3 seguidos sí, el 4º de inmediato no
    const g3 = fireGate(); const tn = W('toner'); const T = ARMS[tn];
    const shots = [0, 1, 2].map((i) => gateAllow(g3, tn, i * T.burstEvery * 1000));
    assert.deepEqual(shots, [true, true, true]);
    assert.equal(gateAllow(g3, tn, 3 * T.burstEvery * 1000), false);
    assert.equal(gateAllow(fireGate(), W('katana'), 0), false, 'una espada no dispara');
    // balas que llegan juntas por la red: cuenta la hora en que se dispararon
    const P = {};
    const g4 = fireGate();
    const arrive = 5000;
    for (let i = 0; i < 3; i++) syncClock(P, 100 + i * T.burstEvery * 1000, arrive);
    const got = [0, 1, 2].map((i) => gateAllow(g4, tn, shotTime(P, 100 + i * T.burstEvery * 1000, arrive)));
    assert.deepEqual(got, [true, true, true], 'ráfaga que llegó en un solo paquete');
    assert.equal(gateAllow(g4, tn, shotTime(P, 100 + 3 * T.burstEvery * 1000, arrive)), false, 'pero no una cuarta pegada');
    assert.ok(shotTime({}, -1e9, 5000) >= 4000, 'no más de 1 s atrás');
  });
  test('velocidad: se aceptan pasos normales y se rechaza teletransportarse', () => {
    const P = { x: 5, y: 5, w: W('grapadora'), budget: 0 };
    for (let i = 0; i < 30; i++) { refillBudget(P, 1 / 30); assert.ok(acceptMove(P, P.x + 5 / 30, P.y), `paso ${i}`); P.x += 5 / 30; }
    refillBudget(P, 1 / 30);
    assert.equal(acceptMove(P, P.x + 6, P.y), false, 'brinco de 6 casillas');
    // aunque espere mucho, el presupuesto tiene tope
    for (let i = 0; i < 300; i++) refillBudget(P, 1 / 30);
    assert.ok(P.budget <= MOVE_SLACK + 8);
    assert.equal(acceptMove(P, P.x + 15, P.y), false);
    assert.equal(acceptMove(P, NaN, 1), false);
  });
  test('en la simulación: posición imposible se corrige; muros no se atraviesan', () => {
    const L = room(24, 12, (Lv) => { for (let y = 1; y < 11; y++) Lv.grid[y * 24 + 8] = CELL.WALL; });
    const S = sim.createSim(L, { cfg: { mode: 'ffa' }, seats: [true, true], seed: 1 });
    sim.startMatch(S); S.phase = 'live';
    const A = S.players[0];
    Object.assign(A, { x: 4.5, y: 5.5, budget: 1 });
    const ok = sim.applyInput(S, 0, { x: 4.7, y: 5.5, a: 0, p: 0, w: A.w, sp: A.sp });
    assert.equal(ok.ok, true); assert.equal(A.x, 4.7);
    const tp = sim.applyInput(S, 0, { x: 15.5, y: 5.5, a: 0, p: 0, w: A.w, sp: A.sp });
    assert.equal(tp.ok, false); assert.equal(tp.fix.k, 'pos'); assert.equal(A.x, 4.7, 'se queda');
    A.budget = 5;
    const wall = sim.applyInput(S, 0, { x: 9.5, y: 5.5, a: 0, p: 0, w: A.w, sp: A.sp });
    assert.equal(wall.ok, false, 'del otro lado del muro');
    const inWall = sim.applyInput(S, 0, { x: 8.5, y: 5.5, a: 0, p: 0, w: A.w, sp: A.sp });
    assert.equal(inWall.ok, false, 'dentro del muro');
    // mientras no sabe que reapareció, no se mueve con lo viejo
    A.sp = 7;
    assert.equal(sim.applyInput(S, 0, { x: 4.8, y: 5.5, a: 0, p: 0, w: A.w, sp: 6 }).ok, true);
    assert.equal(A.x, 4.7);
  });
  test('en la simulación: cadencia, balas, arma que no tienes, dispersión cero y origen lejano', () => {
    const { S, A, B } = duelSim();
    const aim = aimAt(A, B);
    const g = W('grapadora');
    let hits = 0;
    for (let i = 0; i < 10; i++) if (sim.fire(S, A.seat, { x: A.x, y: A.y, ...aim, w: g, seed: i, sp: 0 }, 5000 + i).length) hits++;
    assert.ok(hits <= 2, `disparos aceptados de golpe: ${hits}`);
    assert.equal(sim.fire(S, A.seat, { x: A.x, y: A.y, ...aim, w: W('laser'), seed: 1 }, 9000).length, 0, 'no tiene el láser');
    // sin balas (y sin esperar la recarga) no dispara
    const t = W('toner');
    A.owned[t] = true; A.mag[t] = 0; A.res[t] = 30; A.lastFire[t] = 9990;
    assert.equal(sim.fire(S, A.seat, { x: A.x, y: A.y, ...aim, w: t, seed: 1 }, 10000).length, 0, 'recargando');
    assert.ok(sim.fire(S, A.seat, { x: A.x, y: A.y, ...aim, w: t, seed: 1 }, 13000).length > 0, 'ya recargó');
    // origen falso: se usa la posición del anfitrión
    const shots = [];
    S.ev.length = 0;
    sim.fire(S, A.seat, { x: B.x - 0.5, y: B.y, a: 0, p: 0, w: g, seed: 3 }, 20000);
    shots.push(...S.ev.filter((e) => e.k === 'hit'));
    for (const e of shots) assert.ok(Math.abs(e.fx - A.x) < 0.01, 'el disparo sale de donde está');
  });
});

describe('armas contra personas', () => {
  test('daño ajustado y técnicas más débiles y con más espera', () => {
    for (const w of ARMS) {
      const k = PVP.dmg[w.id];
      assert.ok(k > 0 && k <= 1, `${w.id} tiene multiplicador`);
      assert.equal(pvpDamage(armIndex(w.id), 100), 100 * k);
    }
    for (const T of Object.values(TECHNIQUES)) {
      const P = pvpTech(T);
      assert.ok(P.dmg < T.dmg && P.dmg < MAX_HP, `${T.id}: no mata de un golpe (${P.dmg})`);
      assert.ok(P.cd > T.cd);
    }
    // el láser a la cabeza sí mata de un tiro; al cuerpo no con chaleco
    const L = ARMS[W('laser')];
    assert.ok(pvpDamage(W('laser'), L.dmg) * L.head >= MAX_HP);
    // la escopeta de cerca mata con todos los granos; de lejos no
    const C = ARMS[W('cafetera')];
    assert.ok(pvpDamage(W('cafetera'), C.dmg) * C.pellets >= MAX_HP);
  });
  test('tiro a la cabeza, caída de daño, chaleco y bajas', () => {
    const { S, A, B } = duelSim();
    const g = W('grapadora');
    const G = ARMS[g];
    sim.fire(S, A.seat, { x: A.x, y: A.y, ...aimAt(A, B, 1.0), w: g, seed: 1, sp: G.ads }, 1000);
    const body = MAX_HP - B.hp;
    B.hp = MAX_HP;
    sim.fire(S, A.seat, { x: A.x, y: A.y, ...aimAt(A, B, 1.7), w: g, seed: 1, sp: G.ads }, 2000);
    const head = MAX_HP - B.hp;
    assert.ok(Math.abs(head / body - G.head) < 0.01, `cabeza ×${G.head} (${body} → ${head})`);
    assert.ok(S.ev.some((e) => e.k === 'hit' && e.hd === 1));
    // con chaleco absorbe la mitad
    B.hp = MAX_HP; B.armor = 50;
    sim.fire(S, A.seat, { x: A.x, y: A.y, ...aimAt(A, B, 1.0), w: g, seed: 1, sp: G.ads }, 3000);
    assert.ok(Math.abs((MAX_HP - B.hp) - body / 2) < 0.6, 'la mitad a la vida');
    assert.ok(B.armor < 50);
    // de lejos pega menos
    B.hp = MAX_HP; B.armor = 0; B.x = 22.5; A.x = 1.5;
    sim.fire(S, A.seat, { x: A.x, y: A.y, ...aimAt(A, B, 1.0), w: g, seed: 1, sp: G.ads }, 4000);
    assert.ok(MAX_HP - B.hp <= body + 0.01);
    // agachado detrás de un mueble bajo no le pega
  });
  test('cobertura: los muebles bajos tapan al agachado; los altos tapan todo', () => {
    const L = room(24, 12, (Lv) => { Lv.grid[6 * 24 + 12] = CELL.SOLID; Lv.grid[3 * 24 + 12] = CELL.SOLID; Lv.tall[3 * 24 + 12] = 1; });
    const shooter = { x: 4.5, y: 6.5 };
    const tgt = { seat: 1, x: 13.5, y: 6.5, cr: 1 };
    const low = { x: shooter.x, y: shooter.y, a: 0, p: Math.atan2(0.6 - 1.6, 9 * 1.25), h: 1.6 };
    assert.equal(traceShot(L, [tgt], low).hit, null, 'al cuerpo agachado: tapado');
    const head = { ...low, p: Math.atan2(1.2 - 1.6, 9 * 1.25) };
    assert.ok(traceShot(L, [tgt], head).hit, 'la cabeza asoma');
    const tall = { seat: 1, x: 13.5, y: 3.5, cr: 0 };
    assert.equal(traceShot(L, [tall], { x: 4.5, y: 3.5, a: 0, p: 0, h: 1.6 }).hit, null, 'el estante alto tapa');
    assert.equal(arenaLos(L, 4.5, 3.5, 13.5, 3.5), false);
    assert.equal(arenaLos(L, 4.5, 6.5, 13.5, 6.5), true, 'por encima del mueble bajo se ve');
    assert.ok(arenaRay(L, 4.5, 6.5, 0).low < 8);
    // fallar: rayo al aire, sin blancos
    const miss = traceShot(L, [tgt], { x: 4.5, y: 6.5, a: Math.PI / 2, p: 0, h: 1.6 });
    assert.equal(miss.hit, null); assert.ok(miss.d > 0);
  });
  test('espadas y golpe rápido pegan de cerca; técnica con energía y espera', () => {
    const { S, A, B } = duelSim();
    const k = W('katana');
    B.x = A.x + 1.2;
    A.w = k;
    const hits = sim.melee(S, A.seat, { kind: 'light', step: 0, w: k, x: A.x, y: A.y, a: 0 });
    assert.equal(hits.length, 1);
    assert.ok(B.hp < MAX_HP && B.hp > 0);
    assert.ok(A.energy > 0, 'gana energía');
    A.mcd = 0;
    B.x = A.x + 4;
    assert.equal(sim.melee(S, A.seat, { kind: 'bash', w: k, x: A.x, y: A.y, a: 0 }).length, 0, 'de lejos no');
    assert.equal(sim.technique(S, A.seat, { w: k, x: A.x, y: A.y, a: 0 }).ok, false, 'sin energía');
    A.energy = 100;
    const r = sim.technique(S, A.seat, { w: k, x: A.x, y: A.y, a: 0 });
    assert.equal(r.ok, true);
    assert.ok(A.tcd >= TECHNIQUES.agua.cd * PVP.tech.cd - 0.01, 'espera más que en Zombies');
    assert.equal(sim.technique(S, A.seat, { w: k, x: A.x, y: A.y, a: 0 }).ok, false, 'en espera');
  });
});

describe('equipamiento, botín y recogibles', () => {
  test('el equipamiento se valida', () => {
    assert.deepEqual(cleanLoadout([W('laser'), W('grapadora'), W('carton')]), [W('laser'), W('grapadora'), W('carton')]);
    const bad = cleanLoadout([W('katana'), W('laser'), 99]);
    assert.ok(PRIMARIES.includes(bad[0]) && SECONDARIES.includes(bad[1]) && MELEES.includes(bad[2]));
    for (const c of CLASSES) { assert.deepEqual(cleanLoadout(c.load), c.load, c.id); }
  });
  test('tabla de botín: todo sale, en proporción a su peso', () => {
    const r = rng(42);
    const n = {};
    for (let i = 0; i < 20000; i++) { const l = lootPick(r); const k = l.kind === 'gun' ? ARMS[l.w].id : l.kind; n[k] = (n[k] || 0) + 1; }
    const total = LOOT.reduce((a, l) => a + l.weight, 0);
    for (const l of LOOT) {
      const k = l.kind === 'gun' ? l.w : l.kind;
      const want = (l.weight / total) * 20000;
      assert.ok(Math.abs(n[k] - want) < want * 0.15 + 30, `${k}: ${n[k]} ~ ${Math.round(want)}`);
    }
    assert.deepEqual(lootPick(() => 0.999999).kind, LOOT[LOOT.length - 1].kind, 'el borde');
    const spots = rollLoot([{ x: 1, y: 1 }, { x: 2, y: 2 }], 3);
    assert.equal(spots.length, 2);
    assert.deepEqual(rollLoot([{ x: 1, y: 1 }], 3), rollLoot([{ x: 1, y: 1 }], 3), 'determinista con la semilla');
  });
  test('recogibles: dona, chaleco y arma (y vuelven a salir)', () => {
    const { S, A } = duelSim();
    const hp = S.pickups.find((k) => k.kind === 'health');
    A.hp = 30;
    A.x = hp.x; A.y = hp.y;
    sim.step(S, 1 / 60);
    assert.equal(A.hp, 70);
    assert.equal(hp.on, false);
    A.x = 10.5; A.y = 6.5;
    for (let i = 0; i < 60 * 25; i++) sim.step(S, 1 / 60);
    assert.equal(hp.on, true, 'reaparece');
    // con la vida llena no se gasta
    A.hp = 100; A.x = hp.x; A.y = hp.y;
    sim.step(S, 1 / 60);
    assert.equal(hp.on, true);
    const ar = S.pickups.find((k) => k.kind === 'armor');
    A.x = ar.x; A.y = ar.y;
    sim.step(S, 1 / 60);
    assert.equal(A.armor, 50);
  });
  test('último en pie: empiezas solo con espada y recoges armas', () => {
    const L = room(30, 20);
    const S = sim.createSim(L, { cfg: { mode: 'royale' }, seats: [true, true], seed: 4 });
    sim.startMatch(S);
    const P = S.players[0];
    assert.deepEqual(P.owned.map((o, i) => (o ? ARMS[i].id : null)).filter(Boolean), ['regla']);
    assert.ok(S.pickups.length > 0);
    S.phase = 'live';
    S.pickups.push({ id: 999, kind: 'gun', w: W('toner'), x: 15.5, y: 10.5, on: true, t: 0 });
    P.x = 15.5; P.y = 10.5;
    S.grants.length = 0;
    sim.step(S, 1 / 60);
    assert.equal(P.owned[W('toner')], true);
    assert.deepEqual(S.grants.find((g) => g.s === 0), { s: 0, weapon: W('toner') });
    // al caer suelta su mejor arma
    P.prot = 0;
    sim.damagePlayer(S, P, 500, 1, W('regla'));
    assert.ok(S.pickups.some((k) => k.kind === 'gun' && k.w === W('toner') && k.on), 'la soltó');
    assert.equal(S.phase, 'over', 'quedó uno');
    assert.equal(S.result.seat, 1);
  });
});

describe('progreso', () => {
  test('XP por partida y niveles', () => {
    assert.equal(matchXp({ kills: 0 }), 100);
    assert.equal(matchXp({ kills: 4, hs: 2, won: true }), 100 + 200 + 50 + 300);
    assert.equal(matchXp({ kills: 4, hs: 9 }), 100 + 200 + 100, 'tiros a la cabeza no más que bajas');
    assert.equal(matchXp({ kills: 4, bots: true }), 150, 'contra bots, la mitad');
    assert.equal(levelFor(0), 1); assert.equal(levelFor(499), 1); assert.equal(levelFor(500), 2); assert.equal(levelFor(1500), 3); assert.equal(levelFor(1499), 2);
    for (let n = 1; n < 40; n++) { assert.equal(levelFor(xpForLevel(n)), n); assert.equal(levelFor(xpForLevel(n + 1) - 1), n); }
    const p = levelProgress(1000);
    assert.equal(p.level, 2); assert.ok(p.k > 0 && p.k < 1);
  });
});

describe('mapas', () => {
  for (const id of ['bodega', 'azotea']) {
    test(`${ARENA_MAPS[id].name}: simétrica, alcanzable y con lugares de aparecer y recogibles`, () => {
      const L = arenaLevel(id);
      const f = arenaFloor(id);
      assert.equal(f.rows.length, L.H);
      for (const r of f.rows) assert.equal(r.length, L.W);
      // espejo: lo de la izquierda está a la derecha
      for (let y = 0; y < L.H; y++) for (let x = 0; x < L.W; x++) assert.equal(L.grid[y * L.W + x], L.grid[y * L.W + (L.W - 1 - x)], `simétrica en ${x},${y}`);
      const reach = floodReach(L.grid, L.W, L.H, { x: Math.floor(L.start.x), y: Math.floor(L.start.y) });
      for (const s of [...L.spawns, ...L.pickups, ...L.loot]) {
        assert.equal(cellAt(L, s.x, s.y), CELL.EMPTY, `libre ${s.x},${s.y}`);
        assert.ok(reach[Math.floor(s.y) * L.W + Math.floor(s.x)], `se llega a ${s.x},${s.y}`);
      }
      assert.ok(L.spawns.filter((s) => s.team === 0).length >= 3 && L.spawns.filter((s) => s.team === 1).length >= 3);
      assert.ok(L.spawns.length >= 8);
      assert.ok(L.loot.length >= 10);
      assert.ok(L.pickups.some((p) => p.kind === 'health') && L.pickups.some((p) => p.kind === 'armor') && L.pickups.some((p) => p.kind === 'ammo'));
      assert.ok(L.tall.some(Boolean), 'hay cobertura alta');
      assert.ok(L.objects.length > 5);
      // las salidas de cada equipo no se ven entre sí (no se aparece a la vista del otro)
      const A = L.spawns.filter((s) => s.team === 0), B = L.spawns.filter((s) => s.team === 1);
      const seen = A.filter((a) => B.some((b) => arenaLos(L, a.x, a.y, b.x, b.y))).length;
      assert.ok(seen < A.length, 'al menos una salida protegida');
    });
  }
  test('La Oficina: el piso real, sin salidas, con muebles altos que tapan', () => {
    const t = getTemplate('recreativo');
    const floor = composeFloor({ template: 'recreativo', areas: t.areas.map((a, i) => ({ ...a, id: i + 1 })), objects: t.objects.map((o, i) => ({ ...o, id: i + 1 })) });
    const L = officeArenaLevel(floor, { x: 69, y: 23 });
    assert.equal(L.portals.length, 0);
    assert.ok(!L.grid.includes(CELL.PORTAL), 'sin salidas');
    assert.ok(L.spawns.length >= 8);
    assert.ok(L.spawns.some((s) => s.team === 0) && L.spawns.some((s) => s.team === 1));
    assert.ok(L.pickups.length >= 6);
    for (const s of L.spawns) assert.equal(cellAt(L, s.x, s.y), CELL.EMPTY);
    assert.ok(L.tall.some(Boolean), 'los estantes y máquinas tapan');
  });
});

describe('simulación completa', () => {
  test('todos contra todos con bots: hay bajas, reaparecen y termina al límite', () => {
    const L = arenaLevel('bodega');
    const S = sim.createSim(L, { cfg: { mode: 'ffa', limit: 10, diff: 'dificil' }, seats: [true], seed: 12 });
    sim.fillBots(S, 6);
    assert.equal(sim.bots(S).length, 5);
    sim.startMatch(S);
    assert.equal(S.phase, 'intro');
    let respawned = false, kills = 0;
    for (let i = 0; i < 60 * 300 && S.phase !== 'over'; i++) {
      sim.step(S, 1 / 60);
      for (const e of S.ev.splice(0)) { if (e.k === 'kill') kills++; if (e.k === 'spawn' && kills) respawned = true; }
    }
    assert.ok(kills > 0, 'los bots pelean');
    assert.ok(respawned, 'reaparecen');
    assert.equal(S.phase, 'over', `terminó (bajas ${kills})`);
    assert.ok(S.result.seat != null);
    assert.ok(S.players[S.result.seat].kills >= 10);
    assert.ok(S.result.mvp != null);
  });
  test('duelo contra un bot: rondas hasta que alguien gana', () => {
    const L = arenaLevel('bodega');
    const S = sim.createSim(L, { cfg: { mode: 'duelo', limit: 3, diff: 'dificil' }, seats: [false, false], seed: 3 });
    sim.addPlayer(S, 0, { bot: true }); sim.addPlayer(S, 1, { bot: true });
    sim.startMatch(S);
    assert.deepEqual(S.duel, [0, 1]);
    // las salidas son las de cada equipo
    assert.ok(S.players[0].x < L.W / 2 && S.players[1].x > L.W / 2);
    let rounds = 0;
    for (let i = 0; i < 60 * 600 && S.phase !== 'over'; i++) { sim.step(S, 1 / 60); for (const e of S.ev.splice(0)) if (e.k === 'round') rounds++; }
    assert.equal(S.phase, 'over');
    assert.ok(rounds >= 2, `rondas: ${rounds}`);
    assert.equal(S.roundWins[S.result.seat], 2);
  });
  test('quien llega a media partida: en TCT entra; en duelo mira', () => {
    const L = room(24, 12);
    const S = sim.createSim(L, { cfg: { mode: 'ffa' }, seats: [true, true], seed: 1 });
    sim.startMatch(S); S.phase = 'live';
    const P = sim.addPlayer(S, 2);
    assert.equal(P.spec, false);
    for (let i = 0; i < 120; i++) sim.step(S, 1 / 60);
    assert.equal(P.alive, true, 'ya entró');
    const D = sim.createSim(L, { cfg: { mode: 'duelo' }, seats: [true, true], seed: 1 });
    sim.startMatch(D);
    const Q = sim.addPlayer(D, 3);
    assert.equal(Q.spec, true);
    // si se va un duelista, gana el otro
    sim.removePlayer(D, 1);
    assert.equal(D.phase, 'over'); assert.equal(D.result.seat, 0);
  });
  test('estado compacto: se empaca, se desempaca y el siguiente anfitrión sigue', () => {
    const L = arenaLevel('azotea');
    const S = sim.createSim(L, { cfg: { mode: 'equipos', limit: 25 }, seats: [true, true, true], seed: 8 });
    sim.fillBots(S, 4);
    sim.startMatch(S);
    for (let i = 0; i < 60 * 8; i++) sim.step(S, 1 / 60);
    S.teamScore = [7, 4];
    const d = JSON.parse(JSON.stringify(sim.pack(S)));
    const ps = sim.unpackPlayers(d);
    assert.equal(ps.filter(Boolean).length, 4);
    assert.ok(Math.abs(ps[0].x - S.players[0].x) < 0.01);
    assert.equal(ps[3].bot, true);
    const R = sim.restoreSim(L, d);
    assert.equal(R.phase, S.phase);
    assert.deepEqual(R.teamScore, [7, 4]);
    assert.equal(R.cfg.mode, 'equipos');
    assert.equal(R.players.filter(Boolean).length, 4);
    assert.equal(R.players[3].bot, true);
    assert.equal(R.players[3].name, S.players[3].name);
    for (let i = 0; i < 60; i++) sim.step(R, 1 / 60);
  });
});
