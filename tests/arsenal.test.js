// Arsenal: armas de fuego, espadas, técnicas, caja misteriosa y tienda (shared/arsenal.js + sim.js).
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { getTemplate, composeFloor } from '../shared/map.js';
import {
  ARMS, GUNS, SWORDS, TECHNIQUES, ENERGY_MAX, BASH, COMBO, spreadAt, spreadLimits, falloff, pelletDirs, inArc, arcHits, pathHits, segDist,
  techPath, swingOf, energyGain, boxPick, boxPool, BOX_WEIGHTS, ownedBits, bitsOwned, armIndex, rng,
} from '../shared/arsenal.js';
import { WEAPONS, SHOP, buildLevel, CELL, cellAt, rayCast, WALL_H, waveSpec, killPoints, upgradeCost, swordUpCost, energyUpCost, UPGRADE_MAX } from '../shared/zombies.js';
import * as sim from '../client/src/games/zombies/sim.js';

function floorOf(id) {
  const t = getTemplate(id);
  return composeFloor({ template: id, areas: t.areas.map((a, i) => ({ ...a, id: i + 1 })), objects: t.objects.map((o, i) => ({ ...o, id: i + 1 })) });
}
const F = floorOf('recreativo');
const LV = buildLevel(F, F.objects.find((o) => o.type === 'zombieArcade'));

// Un zombi quieto en (x, y)
function zombie(S, x, y, kind = 'normal', hp = 500) {
  const z = sim.spawnZombie(S, kind, { mode: 'rise', x, y });
  Object.assign(z, { st: 'walk', t: 0, sp: 0, cd: 99, hp, max: hp });
  return z;
}
// Busca desde el inicio una dirección con espacio libre de al menos `need` casillas
function openDir(L, x, y, need) {
  for (let a = 0; a < Math.PI * 2; a += 0.05) if (rayCast(L, x, y, a, 30).t > need) return a;
  return null;
}
function fresh(seed = 3) {
  const S = sim.createSim(LV, { seed });
  sim.startWave(S, 1);
  S.roster = []; S.bossPending = 0;
  const P = S.players[0];
  P.owned = ARMS.map(() => true);
  return { S, P };
}

describe('definiciones del arsenal', () => {
  test('al menos 7 armas de fuego y 3 espadas, cada una con su técnica, todas con nombre propio', () => {
    assert.ok(GUNS.length >= 7);
    assert.ok(SWORDS.length >= 3);
    assert.equal(WEAPONS, ARMS, 'shared/zombies.js reexporta el arsenal');
    assert.deepEqual(WEAPONS.slice(0, 3).map((w) => w.id), ['grapadora', 'cafetera', 'clavadora'], 'los índices viejos no cambian');
    const ids = new Set();
    for (const w of ARMS) {
      assert.ok(!ids.has(w.id)); ids.add(w.id);
      assert.ok(w.name && w.mode && w.desc, w.id);
      if (w.kind === 'gun') { assert.ok(w.dmg > 0 && w.every > 0 && w.mag > 0 && w.reload > 0 && w.ads < w.spread && w.zoom >= 1 && w.sound, w.id); }
      else { assert.ok(TECHNIQUES[w.tech], w.id); assert.ok(w.range > 1 && w.dmg > 0 && w.energy > 0, w.id); }
    }
    const els = new Set(SWORDS.map((w) => TECHNIQUES[w.tech].id));
    assert.deepEqual([...els].sort(), ['agua', 'llama', 'rayo']);
    for (const T of Object.values(TECHNIQUES)) {
      assert.match(T.name, /^(Primera|Segunda|Tercera) Forma: /);
      assert.ok(T.cost > 0 && T.cost <= ENERGY_MAX && T.cd > 0 && T.range > 0 && T.width > 0);
    }
  });

  test('dispersión: apuntar la baja, moverse la sube; límites del anfitrión', () => {
    for (const g of GUNS) {
      const hip = spreadAt(g), ads = spreadAt(g, { ads: true }), run = spreadAt(g, { moving: 2 }), kick = spreadAt(g, { recoil: 1 });
      assert.ok(ads < hip && run > hip && kick > hip, g.id);
      const [lo, hi] = spreadLimits(g);
      assert.ok(lo <= ads && hi >= run, g.id);
      const dirs = pelletDirs(g, 0, 0, 42, hip);
      assert.equal(dirs.length, g.pellets);
      assert.deepEqual(dirs, pelletDirs(g, 0, 0, 42, hip), 'determinista con la semilla');
      for (const d of dirs) assert.ok(Math.abs(d.a) <= hip + 1e-9);
    }
    assert.equal(spreadAt(SWORDS[0]), 0);
  });

  test('caída de daño por distancia', () => {
    const sg = GUNS.find((g) => g.id === 'cafetera'), sn = GUNS.find((g) => g.id === 'laser');
    assert.equal(falloff(sg, 1), 1);
    assert.ok(falloff(sg, 8) < 1 && falloff(sg, 8) > falloff(sg, 10));
    assert.equal(falloff(sg, 50), sg.falloff[2]);
    assert.equal(falloff(sn, 30), 1, 'el francotirador no pierde daño');
  });

  test('arco: pega al frente y no atrás; caminos con ancho', () => {
    const o = { x: 5, y: 5, a: 0 };
    assert.ok(inArc(o, { x: 6.2, y: 5, r: 0.3 }, 1.6, Math.PI / 2));
    assert.ok(!inArc(o, { x: 3.8, y: 5, r: 0.3 }, 1.6, Math.PI / 2), 'atrás no');
    assert.ok(!inArc(o, { x: 5, y: 6.2, r: 0.1 }, 1.6, Math.PI / 2), 'a un lado no (arco de 90°)');
    assert.ok(inArc(o, { x: 5, y: 6.2, r: 0.1 }, 1.6, Math.PI * 1.2), 'con arco ancho sí');
    assert.ok(!inArc(o, { x: 8, y: 5, r: 0.3 }, 1.6, Math.PI / 2), 'lejos no');
    const hits = arcHits(o, [{ x: 6.4, y: 5, r: 0.3, n: 2 }, { x: 5.9, y: 5.2, r: 0.3, n: 1 }, { x: 4, y: 5, r: 0.3, n: 3 }], { range: 1.8, arc: 1.8 });
    assert.deepEqual(hits.map((h) => h.n), [1, 2], 'del más cercano al más lejano');
    assert.deepEqual(arcHits(o, [{ x: 6, y: 5, r: 0.3 }], { range: 2, arc: 2, los: () => false }), [], 'un muro tapa');
    const path = pathHits(0, 0, 10, 0, 1, [{ x: 7, y: 0.5, r: 0.3, n: 'b' }, { x: 2, y: -0.8, r: 0.3, n: 'a' }, { x: 5, y: 3, r: 0.3, n: 'x' }, { x: 12, y: 0, r: 0.3, n: 'y' }]);
    assert.deepEqual(path.map((t) => t.n), ['a', 'b']);
    assert.ok(Math.abs(segDist(5, 2, 0, 0, 10, 0).d - 2) < 1e-9);
    const p = techPath(TECHNIQUES.rayo, 0, 0, 0, () => 3);
    assert.ok(p.len <= 3 && Math.abs(p.bx - p.len) < 1e-9, 'el camino se corta en el muro');
  });

  test('golpes de espada: combo de 3 arcos distintos y el cargado pega más', () => {
    for (const w of SWORDS) {
      const s = [0, 1, 2].map((k) => swingOf(w, 'light', k));
      assert.equal(new Set(s.map((x) => x.arc)).size, 3, 'arcos distintos');
      assert.ok(s[2].dmg > s[0].dmg, 'el tercero remata');
      assert.equal(swingOf(w, 'light', 4).step, 1, 'el combo da la vuelta');
      const h = swingOf(w, 'heavy');
      assert.ok(h.dmg > s[2].dmg && h.arc > s[0].arc);
      assert.ok(swingOf(w, 'light', 0, 3).dmg > s[0].dmg, 'las mejoras de filo suben el daño');
      assert.ok(energyGain(w, 'heavy') > energyGain(w) && energyGain(w, 'light', 2) > energyGain(w));
    }
    assert.equal(COMBO.length, 3);
  });

  test('bits de armas y caja misteriosa', () => {
    const owned = ARMS.map((_, i) => i % 3 === 0);
    assert.deepEqual(bitsOwned(ownedBits(owned)), owned);
    const r = rng(9);
    const start = ARMS.map((_, i) => i === 0);
    const seen = new Set();
    for (let k = 0; k < 400; k++) {
      const i = boxPick(r, start);
      assert.ok(Number.isInteger(i) && ARMS[i] && i !== 0, `índice ${i}`);
      seen.add(i);
    }
    assert.equal(seen.size, Object.keys(BOX_WEIGHTS).length, 'puede salir cualquiera');
    // ya tiene casi todas: solo salen las que le faltan
    const most = ARMS.map((w) => w.id !== 'laser');
    for (let k = 0; k < 50; k++) assert.equal(ARMS[boxPick(r, most)].id, 'laser');
    // las tiene todas: sale una válida (se le llenan las balas)
    const all = ARMS.map(() => true);
    for (let k = 0; k < 50; k++) assert.ok(boxPool(all).includes(boxPick(r, all)));
    for (const v of [0, 0.5, 0.999999, 1]) assert.ok(ARMS[boxPick(() => v, start)]);
  });
});

describe('simulación con el arsenal', () => {
  test('cada arma de fuego dispara, le da a un zombi y también falla sin romperse', () => {
    for (const W of GUNS) {
      const wi = armIndex(W.id);
      const { S, P } = fresh();
      const a = openDir(LV, P.x, P.y, 4);
      assert.ok(a != null);
      P.a = a;
      // fallar: sin zombis, al frente, al techo y al piso
      for (const p of [0, 1.2, -1.2]) {
        const r = sim.fire(S, 0, { x: P.x, y: P.y, a, p, w: wi, seed: 7, sp: W.spread });
        assert.ok(r.length >= W.pellets, W.id);
        for (const t of r) { assert.equal(t.hit, null); assert.ok(Number.isFinite(t.d) && t.d >= 0 && t.h >= 0 && t.h <= WALL_H, `${W.id} ${t.d} ${t.h}`); }
      }
      // pegar
      const z = zombie(S, P.x + Math.cos(a) * 2.2, P.y + Math.sin(a) * 2.2);
      const hp = z.hp;
      const d = Math.hypot(z.x - P.x, z.y - P.y);
      const r = sim.fire(S, 0, { x: P.x, y: P.y, a, p: Math.atan2(1.2 - 1.6, d * 1.25), w: wi, seed: 3, sp: W.ads });
      assert.ok(r.some((t) => t.hit === z), `${W.id} le da`);
      assert.ok(z.hp < hp, `${W.id} hace daño`);
      assert.ok(S.ev.some((e) => e.k === 'hit' && e.w === wi && e.d > 0), 'el evento lleva arma y daño');
      // dispersión imposible: el anfitrión la acota
      assert.doesNotThrow(() => sim.fire(S, 0, { x: P.x, y: P.y, a, p: 0, w: wi, seed: 1, sp: -5 }));
      assert.doesNotThrow(() => sim.fire(S, 0, { x: P.x, y: P.y, a, p: 0, w: wi, seed: 1, sp: NaN }));
    }
  });

  test('sin el arma o con una espada no se dispara; armas raras se ignoran', () => {
    const { S, P } = fresh();
    P.owned = ARMS.map((_, i) => i === 0);
    assert.deepEqual(sim.fire(S, 0, { x: P.x, y: P.y, a: 0, p: 0, w: 4, seed: 1 }), []);
    P.owned = ARMS.map(() => true);
    assert.deepEqual(sim.fire(S, 0, { x: P.x, y: P.y, a: 0, p: 0, w: armIndex('katana'), seed: 1 }), []);
    assert.deepEqual(sim.fire(S, 0, { x: P.x, y: P.y, a: 0, p: 0, w: 99, seed: 1 }), []);
    assert.deepEqual(sim.fire(S, 0, null), []);
  });

  test('el láser atraviesa varios zombis en fila', () => {
    const { S, P } = fresh();
    const a = openDir(LV, P.x, P.y, 6);
    P.a = a;
    const zs = [1.6, 2.6, 3.6].map((k) => zombie(S, P.x + Math.cos(a) * k, P.y + Math.sin(a) * k));
    sim.fire(S, 0, { x: P.x, y: P.y, a, p: -0.12, w: armIndex('laser'), seed: 1, sp: 0 });
    assert.ok(zs.every((z) => z.hp < 500), 'los tres reciben daño');
  });

  test('las tazas explotan: daño en área (también si fallas por poco)', () => {
    const { S, P } = fresh();
    const a = openDir(LV, P.x, P.y, 6);
    const c = { x: P.x + Math.cos(a) * 3, y: P.y + Math.sin(a) * 3 };
    const side = zombie(S, c.x + Math.cos(a + Math.PI / 2) * 0.9, c.y + Math.sin(a + Math.PI / 2) * 0.9);
    const main = zombie(S, c.x, c.y);
    sim.fire(S, 0, { x: P.x, y: P.y, a, p: Math.atan2(1.2 - 1.6, 3 * 1.25), w: armIndex('lanzatazas'), seed: 1, sp: 0 });
    assert.ok(main.hp < 500 && side.hp < 500, 'el de al lado también');
    assert.ok(S.ev.some((e) => e.k === 'boom'));
    // al muro: explota sin romperse
    const { S: S2, P: P2 } = fresh();
    assert.doesNotThrow(() => sim.fire(S2, 0, { x: P2.x, y: P2.y, a: 0, p: -1.3, w: armIndex('lanzatazas'), seed: 2, sp: 0 }));
  });

  test('cuerpo a cuerpo: el arco pega al de enfrente y no al de atrás; da energía', () => {
    for (const W of SWORDS) {
      const wi = armIndex(W.id);
      const { S, P } = fresh();
      const a = openDir(LV, P.x, P.y, 3);
      const back = openDir(LV, P.x, P.y, 2) != null ? a + Math.PI : a + Math.PI;
      P.a = a;
      const front = zombie(S, P.x + Math.cos(a) * 1.1, P.y + Math.sin(a) * 1.1);
      const behind = cellAt(LV, P.x + Math.cos(back) * 1.1, P.y + Math.sin(back) * 1.1) === CELL.EMPTY ? zombie(S, P.x + Math.cos(back) * 1.1, P.y + Math.sin(back) * 1.1) : null;
      const hits = sim.melee(S, 0, { kind: 'light', step: 0, w: wi, x: P.x, y: P.y, a });
      assert.ok(hits.includes(front), `${W.id}: pega al frente`);
      if (behind) { assert.ok(!hits.includes(behind)); assert.equal(behind.hp, 500, 'el de atrás no'); }
      assert.ok(front.hp < 500);
      assert.ok(P.energy > 0, 'conectar da energía');
      assert.ok(S.ev.some((e) => e.k === 'slash' && e.w === wi && e.n >= 1));
      // muy rápido: el anfitrión no acepta golpes más seguidos que la animación
      assert.deepEqual(sim.melee(S, 0, { kind: 'light', step: 1, w: wi, x: P.x, y: P.y, a }), []);
      sim.step(S, 0.4);
      // golpe al aire: no rompe y no da energía
      const e0 = P.energy;
      assert.deepEqual(sim.melee(S, 0, { kind: 'heavy', w: wi, x: P.x, y: P.y, a: a + Math.PI / 2 + 0.3 }).filter((z) => z === front), []);
      assert.ok(P.energy === e0 || P.energy > e0);
    }
  });

  test('golpe rápido con cualquier arma; sin espada no hay cortes de espada', () => {
    const { S, P } = fresh();
    P.owned = ARMS.map((_, i) => i === 0);
    const a = openDir(LV, P.x, P.y, 3);
    const z = zombie(S, P.x + Math.cos(a) * 1, P.y + Math.sin(a) * 1);
    assert.deepEqual(sim.melee(S, 0, { kind: 'light', w: armIndex('katana'), x: P.x, y: P.y, a }), [], 'no tiene la katana');
    const hits = sim.melee(S, 0, { kind: 'bash', w: 0, x: P.x, y: P.y, a });
    assert.ok(hits.includes(z));
    assert.equal(Math.round(500 - z.hp), BASH.dmg);
    assert.equal(P.energy, 0, 'el golpe rápido no llena la técnica');
    assert.deepEqual(sim.melee(S, 0, null), []);
    assert.deepEqual(sim.melee(S, 0, { kind: 'raro', w: 0, x: NaN, y: 'x', a: Infinity }).length >= 0, true);
  });

  test('cada técnica daña a lo largo de su camino, gasta energía y respeta el enfriamiento', () => {
    for (const W of SWORDS) {
      const T = TECHNIQUES[W.tech];
      const wi = armIndex(W.id);
      const { S, P } = fresh();
      const a = openDir(LV, P.x, P.y, T.range + 0.5);
      assert.ok(a != null, 'hay espacio');
      P.a = a;
      // sin energía no sale
      assert.equal(sim.technique(S, 0, { w: wi, x: P.x, y: P.y, a }).ok, false);
      P.energy = ENERGY_MAX;
      const x0 = P.x, y0 = P.y;
      const along = [1.2, T.range * 0.55, T.range * 0.9].map((k) => zombie(S, x0 + Math.cos(a) * k, y0 + Math.sin(a) * k));
      const far = zombie(S, x0 + Math.cos(a + Math.PI / 2) * 3, y0 + Math.sin(a + Math.PI / 2) * 3);
      const boss = zombie(S, x0 + Math.cos(a) * 2, y0 + Math.sin(a) * 2);
      boss.kind = 'boss'; boss.boss = 'gerente'; boss.r = 0.6; boss.hp = boss.max = 2600;
      const r = sim.technique(S, 0, { w: wi, x: x0, y: y0, a });
      assert.equal(r.ok, true, W.id);
      for (const z of along) assert.ok(z.hp < 500, `${T.id}: pega en el camino`);
      assert.ok(boss.hp < 2600 && boss.hp > 2600 * 0.8, `${T.id}: al jefe le pega, pero no lo borra`);
      if (cellAt(LV, far.x, far.y) === CELL.EMPTY) assert.equal(far.hp, 500, `${T.id}: lejos del camino no`);
      assert.equal(P.energy, ENERGY_MAX - T.cost);
      assert.ok(S.ev.some((e) => e.k === 'tech' && e.id === T.id && e.s === 0));
      if (T.kind !== 'wave') assert.ok(Math.hypot(P.x - x0, P.y - y0) > 1, `${T.id}: la embestida te mueve`);
      // en enfriamiento: no sale aunque tenga energía
      P.energy = ENERGY_MAX;
      assert.equal(sim.technique(S, 0, { w: wi, x: P.x, y: P.y, a }).why, 'Técnica en espera');
      for (let i = 0; i < Math.ceil(T.cd * 60) + 2; i++) sim.step(S, 1 / 60);
      assert.equal(sim.technique(S, 0, { w: wi, x: P.x, y: P.y, a: a + Math.PI }).ok, true, 'ya enfrió');
      // no es infinita: una técnica no limpia una horda de jefe de un golpe
      assert.ok(T.dmg < 600);
    }
  });

  test('las técnicas no pegan a través de los muros (ni te llevan del otro lado)', () => {
    for (const W of SWORDS) {
      const T = TECHNIQUES[W.tech];
      const wi = armIndex(W.id);
      // nivel de prueba: dos cuartos separados por un muro (sin puerta)
      const W0 = 24, H0 = 7, grid = new Uint8Array(W0 * H0);
      for (let y = 0; y < H0; y++) for (let x = 0; x < W0; x++) if (x === 0 || y === 0 || x === W0 - 1 || y === H0 - 1 || x === 8) grid[y * W0 + x] = CELL.WALL;
      const box = { W: W0, H: H0, grid, start: { x: 6.5, y: 3.5 }, startA: 0, portals: [], rises: [{ x: 3, y: 3 }], doors: [], objects: [], signs: [] };
      const found = { x: 6.5, y: 3.5, a: 0, wall: rayCast(box, 6.5, 3.5, 0, 30).t, bx: 10.5, by: 3.5 };
      const S = sim.createSim(box, { seed: 4 });
      sim.startWave(S, 1); S.roster = []; S.bossPending = 0;
      const P = S.players[0];
      P.owned = ARMS.map(() => true);
      P.x = found.x; P.y = found.y; P.energy = ENERGY_MAX;
      const behind = zombie(S, found.bx, found.by);
      const r = sim.technique(S, 0, { w: wi, x: P.x, y: P.y, a: found.a });
      assert.ok(r.ok);
      assert.equal(behind.hp, 500, `${T.id}: el del otro lado del muro no recibe daño`);
      assert.ok(Math.hypot(r.path.bx - found.x, r.path.by - found.y) <= found.wall + 0.01, 'el camino se corta en el muro');
      assert.notEqual(cellAt(LV, P.x, P.y), CELL.WALL, 'no queda dentro del muro');
    }
  });

  test('el piso en llamas quema a los zombis un rato y luego se apaga', () => {
    const { S, P } = fresh();
    const a = openDir(LV, P.x, P.y, 6);
    P.energy = ENERGY_MAX;
    const r = sim.technique(S, 0, { w: armIndex('carton'), x: P.x, y: P.y, a });
    assert.ok(r.ok && S.zones.length === 3);
    const z = zombie(S, S.zones[1].x, S.zones[1].y);
    for (let i = 0; i < 60; i++) sim.step(S, 1 / 60);
    assert.ok(z.hp < 500, 'se quema');
    for (let i = 0; i < 60 * 5; i++) sim.step(S, 1 / 60);
    assert.equal(S.zones.length, 0, 'se apaga');
    const d = sim.pack(S);
    assert.deepEqual(d.Q, []);
  });

  test('la energía, las mejoras y las armas nuevas viajan en el estado compacto', () => {
    const { S, P } = fresh();
    P.owned = ARMS.map((_, i) => i === 0 || i === 4 || i === 8);
    P.energy = 73.6; P.tcd = 2.34; P.swLvl = 2; P.enLvl = 1;
    S.zones.push({ id: 77, x: 3, y: 4, r: 1.5, t: 2, dps: 10, seat: 0, tick: 0, w: 9 });
    const d = sim.pack(S);
    const u = sim.unpackPlayers(d)[0];
    assert.deepEqual(u.owned, P.owned);
    assert.equal(u.energy, 73); assert.ok(Math.abs(u.tcd - 2.4) < 1e-9); assert.equal(u.swLvl, 2); assert.equal(u.enLvl, 1);
    assert.deepEqual(d.Q[0], [77, 300, 400, 150, 20]);
    const R = sim.restoreSim(LV, d);
    assert.deepEqual(R.players[0].owned, P.owned);
    assert.equal(R.players[0].swLvl, 2);
  });

  test('caja misteriosa en la tienda: un arma válida y nueva; si ya tienes todo, balas', () => {
    const S = sim.createSim(LV, { seed: 11 });
    S.phase = 'break';
    const P = S.players[0];
    P.pts = 100000;
    const got = new Set();
    for (let k = 0; k < ARMS.length - 1; k++) {
      const r = sim.buy(S, 0, 'box');
      assert.ok(r.ok && ARMS[r.w] && r.w !== 0);
      assert.ok(!got.has(r.w), 'no repite mientras falten'); got.add(r.w);
      assert.ok(P.owned[r.w]);
    }
    assert.ok(P.owned.every(Boolean));
    const r = sim.buy(S, 0, 'box');
    assert.ok(r.ok);
    assert.ok(S.grants.some((g) => g.ammo === 'full' && g.box));
    assert.ok(S.ev.some((e) => e.k === 'box' && e.had === 1));
    P.pts = 10;
    assert.equal(sim.buy(S, 0, 'box').ok, false);
  });

  test('la caja misteriosa también puede salir de un zombi', () => {
    const S = sim.createSim(LV, { seed: 2 });
    sim.startWave(S, 1);
    const P = S.players[0];
    S.drops.push({ id: 999, kind: 'box', x: P.x, y: P.y, t: 0 });
    S.roster = ['normal'];
    sim.step(S, 1 / 60);
    assert.ok(S.ev.some((e) => e.k === 'box') || S.grants.some((g) => g.box));
    assert.ok(P.owned.filter(Boolean).length === 2);
  });

  test('mejoras de espada y de energía: suben de nivel, de precio y tienen tope', () => {
    const S = sim.createSim(LV, { seed: 1 });
    S.phase = 'break';
    const P = S.players[0];
    P.pts = 1e6;
    for (const [id, key, cost] of [['swordup', 'swLvl', swordUpCost], ['energy', 'enLvl', energyUpCost], ['upgrade', 'dmgLvl', upgradeCost]]) {
      for (let k = 0; k < UPGRADE_MAX; k++) {
        const it = SHOP.find((x) => x.id === id);
        assert.equal(sim.itemCost(P, it), cost(k));
        assert.ok(sim.buy(S, 0, id).ok);
        assert.equal(P[key], k + 1);
      }
      assert.equal(sim.buy(S, 0, id).ok, false, 'tope');
    }
    for (const w of [...GUNS.filter((g) => g.cost), ...SWORDS]) {
      assert.ok(sim.buy(S, 0, w.id).ok, w.id);
      assert.equal(sim.buy(S, 0, w.id).ok, false, 'no dos veces');
    }
  });

  test('los precios se pueden pagar conforme avanzan las hordas', () => {
    // ingreso aproximado por horda (un jugador): muertes + 3 golpes por zombi + bono del descanso
    let bank = 500;
    const byWave = [];
    for (let n = 1; n <= 20; n++) {
      const s = waveSpec(n, 1);
      const types = Object.entries(s.mix);
      const avgPts = types.reduce((a, [t, k]) => a + k * killPoints(t), 0);
      bank += s.count * (avgPts + 30) + 100 * n + (s.boss ? killPoints(s.boss.id) : 0);
      byWave[n] = bank;
    }
    const cheapest = Math.min(...SHOP.filter((it) => it.weapon != null).map((it) => it.cost));
    assert.ok(byWave[1] >= cheapest, `primera arma tras la horda 1 (${byWave[1]} vs ${cheapest})`);
    assert.ok(byWave[2] >= SHOP.find((it) => it.id === 'box').cost, 'la caja misteriosa tras la horda 2');
    for (const it of SHOP) assert.ok(byWave[6] >= it.cost, `${it.id} se puede pagar hacia la horda 6`);
    const all = SHOP.filter((it) => it.weapon != null).reduce((a, it) => a + it.cost, 0);
    assert.ok(byWave[14] >= all, `todo el arsenal hacia la horda 14 (${byWave[14]} vs ${all})`);
    assert.ok(byWave[3] < all, 'pero no todo de entrada');
  });
});
