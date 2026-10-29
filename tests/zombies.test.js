// Zombies en la oficina: reglas puras (hordas, jefes, nivel desde el piso, simulación) e interpolación de red.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { getTemplate, composeFloor, isWalkable } from '../shared/map.js';
import { CATALOG } from '../shared/catalog.js';
import {
  waveSpec, waveRoster, bossForWave, isBossWave, BOSSES, ZOMBIE_TYPES, WEAPONS, SHOP, buildLevel, CELL, moveCircle, rayCast, distanceField, floodReach,
} from '../shared/zombies.js';
import * as sim from '../client/src/games/zombies/sim.js';
import { SnapBuffer, lerpState, gameLoop } from '../client/src/games/netSync.js';

function floorOf(id) {
  const t = getTemplate(id);
  return composeFloor({ template: id, areas: t.areas.map((a, i) => ({ ...a, id: i + 1 })), objects: t.objects.map((o, i) => ({ ...o, id: i + 1 })) });
}

describe('hordas y jefes', () => {
  test('cada horda trae más zombis, más rápidos y con más vida', () => {
    let prev = waveSpec(1);
    assert.ok(prev.count >= 5);
    for (let n = 2; n <= 30; n++) {
      const s = waveSpec(n);
      if (!isBossWave(n) && !isBossWave(n - 1)) assert.ok(s.count > prev.count, `horda ${n}: ${s.count} > ${prev.count}`);
      assert.ok(s.speedMul >= prev.speedMul);
      assert.ok(s.hpMul > prev.hpMul);
      assert.ok(Math.abs(Object.values(s.mix).reduce((a, b) => a + b, 0) - 1) < 1e-9, 'la mezcla suma 1');
      prev = s;
    }
    assert.ok(waveSpec(4, 3).count > waveSpec(4, 1).count, 'en equipo salen más');
    assert.equal(waveSpec(1).mix.runner, 0);
    assert.ok(waveSpec(8).mix.runner > 0 && waveSpec(8).mix.spitter > 0 && waveSpec(8).mix.tank > 0);
  });

  test('jefe cada 5 hordas, en orden y cada vuelta más fuerte', () => {
    for (const n of [1, 2, 3, 4, 6, 7, 9, 11]) assert.equal(bossForWave(n), null);
    assert.equal(bossForWave(5).id, 'gerente');
    assert.equal(bossForWave(10).id, 'impresora');
    assert.equal(bossForWave(15).id, 'becario');
    assert.equal(bossForWave(20).id, 'gerente');
    assert.ok(bossForWave(20).hp > bossForWave(5).hp);
    assert.ok(waveSpec(5).boss && waveSpec(5).count < waveSpec(4).count, 'en horda de jefe hay menos zombis');
    for (const b of Object.values(BOSSES)) assert.ok(b.name && b.attacks.length === 2);
  });

  test('la lista de una horda es determinista y respeta la cantidad', () => {
    const s = waveSpec(9);
    const a = waveRoster(s, 7), b = waveRoster(s, 7);
    assert.deepEqual(a, b);
    assert.equal(a.length, s.count);
    for (const t of a) assert.ok(ZOMBIE_TYPES[t]);
  });

  test('armas y tienda', () => {
    assert.ok(WEAPONS.length >= 3);
    assert.equal(WEAPONS[0].reserve, Infinity, 'la grapadora nunca se acaba');
    assert.ok(SHOP.some((s) => s.id === 'ammo') && SHOP.some((s) => s.id === 'heal'));
  });
});

describe('nivel desde el piso de la oficina', () => {
  const f = floorOf('recreativo');
  const cab = f.objects.find((o) => o.type === 'zombieArcade');
  const L = buildLevel(f, cab);

  test('la máquina de Zombies está en la sala de juegos', () => {
    assert.ok(cab, 'hay máquina en la plantilla');
    assert.equal(CATALOG.zombieArcade.interactive, 'game');
    const area = f.areas.find((a) => cab.x >= a.x && cab.x < a.x + a.w && cab.y >= a.y && cab.y < a.y + a.h);
    assert.equal(area?.name, 'Juegos');
  });

  test('recorte razonable alrededor de la sala de juegos, con su nombre en un letrero', () => {
    assert.ok(L.W <= 46 && L.H <= 30 && L.W >= 12 && L.H >= 10, `${L.W}x${L.H}`);
    assert.ok(cab.x >= L.ox && cab.x < L.ox + L.W && cab.y >= L.oy && cab.y < L.oy + L.H);
    assert.ok(L.signs.some((s) => s.text === 'Juegos'));
    assert.ok(L.signs.some((s) => s.text === 'Charla General'));
    assert.ok(L.objects.some((o) => o.type === 'zombieArcade'));
  });

  test('hay muro donde la oficina tiene muro y piso donde se camina', () => {
    let walls = 0;
    for (let y = 0; y < L.H; y++) for (let x = 0; x < L.W; x++) {
      const w = f.walls[y + L.oy][x + L.ox];
      const c = L.grid[y * L.W + x];
      if (w === true) { assert.equal(c, CELL.WALL, `muro en ${x + L.ox},${y + L.oy}`); walls++; }
      if (w === 'glass') assert.equal(c, CELL.GLASS);
      if (c === CELL.EMPTY) assert.ok(isWalkable(f, x + L.ox, y + L.oy), `casilla jugable caminable ${x + L.ox},${y + L.oy}`);
    }
    assert.ok(walls > 10);
  });

  test('inicio, portales y lugares de aparición son alcanzables', () => {
    const s = { x: Math.floor(L.start.x), y: Math.floor(L.start.y) };
    assert.equal(L.grid[s.y * L.W + s.x], CELL.EMPTY);
    const reach = floodReach(L.grid, L.W, L.H, s);
    assert.ok(L.portals.length >= 4, 'hay salidas por donde llegan los zombis');
    for (const p of L.portals) {
      assert.equal(L.grid[p.y * L.W + p.x], CELL.PORTAL);
      assert.ok(reach[p.iy * L.W + p.ix], 'el portal da a una casilla alcanzable');
    }
    assert.ok(L.rises.length > 50);
    for (const r of L.rises) assert.ok(reach[r.y * L.W + r.x]);
    // el mapa de distancias llega a todos los portales
    const d = distanceField(L, [L.start]);
    for (const p of L.portals) assert.ok(d[p.y * L.W + p.x] > 0);
  });

  test('también sale un nivel jugable en la plantilla HQ y en la clásica', () => {
    for (const id of ['hq', 'main', 'open']) {
      const g = floorOf(id);
      const c = g.objects.find((o) => o.type === 'zombieArcade' || o.type === 'arcade') || g.spawn;
      const lv = buildLevel(g, c);
      assert.ok(lv.portals.length + lv.rises.length > 5, id);
      assert.equal(lv.grid[Math.floor(lv.start.y) * lv.W + Math.floor(lv.start.x)], CELL.EMPTY, id);
    }
  });

  test('choques y rayos', () => {
    const r = moveCircle(L, L.start.x, L.start.y, 0.26, 0, -60);
    assert.ok(r.hit && r.y > 0.2, 'no atraviesa el muro');
    const ray = rayCast(L, L.start.x, L.start.y, -Math.PI / 2);
    assert.ok(ray.t > 0 && ray.t < L.H);
  });
});

describe('simulación', () => {
  const f = floorOf('recreativo');
  const L = buildLevel(f, f.objects.find((o) => o.type === 'zombieArcade'));

  test('intro, primera horda, disparos que matan y descanso con bono', () => {
    const S = sim.createSim(L, { seed: 3 });
    S.god = true;
    for (let i = 0; i < 60 * 5; i++) sim.step(S, 1 / 60);
    assert.equal(S.phase, 'fight');
    assert.equal(S.wave, 1);
    const P = S.players[0];
    let guard = 0;
    while (S.phase === 'fight' && guard++ < 60 * 120) {
      sim.step(S, 1 / 60);
      const z = S.zombies.find((q) => q.st === 'walk');
      if (z && guard % 6 === 0) {
        const d = Math.hypot(z.x - P.x, z.y - P.y);
        sim.fire(S, 0, { x: P.x, y: P.y, a: Math.atan2(z.y - P.y, z.x - P.x), p: Math.atan2(1.2 - 1.6, d * 1.25), w: 0, seed: guard });
      }
    }
    assert.equal(S.phase, 'break', 'la horda se acaba');
    assert.ok(S.kills >= waveSpec(1).count);
    assert.ok(P.kills > 0 && P.earned > 0 && P.pts > 500);
    // tienda: comprar, no comprar dos veces la misma arma, faltan puntos
    P.pts = 1000;
    assert.equal(sim.buy(S, 0, 'cafetera').ok, true);
    assert.equal(sim.buy(S, 0, 'cafetera').ok, false);
    assert.equal(sim.buy(S, 0, 'clavadora').ok, false);
    assert.ok(S.grants.some((g) => g.weapon === 1));
  });

  test('de 1 a 4 jugadores; caídos, revivir y fin de partida', () => {
    const S = sim.createSim(L, { seats: [true, false, false, false], seed: 5 });
    sim.startWave(S, 1);
    const B = sim.addPlayer(S, 1);
    assert.ok(B && B.prot > 0, 'quien llega tiene protección');
    assert.equal(sim.addPlayer(S, 7), undefined);
    const [A] = S.players;
    // A cae: con B vivo queda caído y B lo levanta con E
    A.hp = 1; A.prot = 0;
    S.zombies.push({ id: 999, kind: 'normal', x: A.x - 0.6, y: A.y, a: 0, hp: 50, max: 50, st: 'attack', t: 0.44, hitDone: false, sp: 1, dmg: 20, r: 0.27, h: 1.8, cd: 0, vx: 0, vy: 0, flash: 0, look: 0 });
    sim.step(S, 1 / 30);
    assert.equal(A.alive, false);
    assert.equal(A.down, true);
    S.zombies.length = 0; S.roster = [S.roster[0] || 'normal'];
    B.x = A.x + 0.5; B.y = A.y; B.rv = 1;
    for (let i = 0; i < 60 * 3; i++) sim.step(S, 1 / 60);
    assert.equal(A.alive, true, 'revivió');
    // todos fuera → fin
    sim.removePlayer(S, 1);
    A.hp = 0; A.alive = false;
    sim.step(S, 1 / 60);
    assert.equal(S.phase, 'over');
  });

  test('el nuevo anfitrión rearma la partida con el último estado', () => {
    const S = sim.createSim(L, { seats: [true, true, false, false], seed: 9 });
    sim.startWave(S, 3);
    for (let i = 0; i < 60 * 6; i++) sim.step(S, 1 / 60);
    S.players[1].pts = 777;
    const d = sim.pack(S);
    const R = sim.restoreSim(L, d);
    assert.equal(R.phase, 'fight');
    assert.equal(R.wave, 3);
    assert.equal(R.players[1].pts, 777);
    assert.equal(R.zombies.length, S.zombies.filter((z) => z.st !== 'dead').length);
    assert.equal(sim.remaining(R), d.left);
    for (let i = 0; i < 60; i++) sim.step(R, 1 / 60); // sigue corriendo
  });

  test('estado compacto pequeño para la red', () => {
    const S = sim.createSim(L, { seed: 1 });
    sim.startWave(S, 10);
    for (let i = 0; i < 60 * 15; i++) sim.step(S, 1 / 60);
    const json = JSON.stringify(sim.pack(S));
    assert.ok(json.length < 4000, `${json.length} bytes`);
  });
});

describe('interpolación de red (netSync)', () => {
  test('dibuja en el pasado e interpola entre dos estados', () => {
    const b = new SnapBuffer({ delay: 100 });
    // el anfitrión manda cada 50 ms; llegan con 30 ms de retraso
    for (let t = 0; t <= 300; t += 50) b.push({ _t: 1000 + t, x: t }, 5000 + t + 30);
    const s = b.state({ keys: ['x'] }, 5000 + 300 + 30);
    // se dibuja ~delay ms atrás: x ≈ 300 - delay
    assert.ok(Math.abs(s.x - (300 - b.delay)) < 6, `x=${s.x} delay=${b.delay}`);
    const mid = b.sample(5000 + 30 + 100 + 25 + 100);
    assert.ok(mid.k > 0 && mid.k < 1);
  });

  test('aguanta paquetes perdidos, repetidos y fuera de orden', () => {
    const b = new SnapBuffer({ delay: 100, extrapolate: 80 });
    b.push({ _t: 0, x: 0 }, 0);
    b.push({ _t: 50, x: 50 }, 50);
    assert.equal(b.push({ _t: 50, x: 999 }, 60), false, 'repetido');
    assert.equal(b.push({ _t: 20, x: 999 }, 70), false, 'viejo');
    // se pierden 100 y 150: sigue interpolando entre 50 y 200
    b.push({ _t: 200, x: 200 }, 200);
    const s = b.state({ keys: ['x'] }, 225);
    assert.ok(s.x > 50 && s.x < 200, `x=${s.x}`);
    // sin estados nuevos: extrapola poquito y luego se queda quieto
    const far = b.sample(5000);
    assert.ok(far.k > 1 && far.k <= 1 + 80 / 150 + 1e-9);
  });

  test('lerpState: saltos grandes no se interpolan y los ángulos van por el camino corto', () => {
    const o = lerpState({ b: { x: 0 }, a: 3.1, s: [1, 2] }, { b: { x: 500 }, a: -3.1, s: [1, 3] }, 0.5, { keys: ['b', 'a'], jump: 100, angles: ['a'] });
    assert.equal(o.b.x, 500);
    assert.ok(Math.abs(Math.abs(o.a) - Math.PI) < 0.05);
    assert.deepEqual(o.s, [1, 2], 'lo que no se interpola viene del estado anterior');
  });

  test('gameLoop: paso fijo sin importar los cuadros por segundo', () => {
    for (const fps of [30, 60, 144]) {
      let cb = null, steps = 0;
      const loop = gameLoop({ step: () => steps++, frame: () => {}, hz: 120, raf: (f) => { cb = f; return 1; }, caf: () => {} });
      let t = 0;
      for (let i = 0; i < fps * 2; i++) { const f = cb; cb = null; f(t); t += 1000 / fps; }
      loop.stop();
      const want = ((fps * 2 - 1) / fps) * 120; // el primer cuadro solo arranca el reloj
      assert.ok(Math.abs(steps - want) <= 2, `${fps} fps → ${steps} pasos (esperados ${want})`);
    }
  });
});
