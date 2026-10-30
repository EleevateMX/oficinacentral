// Rendimiento de los juegos 3D (partes puras): calidad automática con histéresis, estados por
// diferencias (ida y vuelta), rejilla espacial, tope de pasos de la simulación y red adaptable.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { getTemplate, composeFloor } from '../shared/map.js';
import { buildLevel } from '../shared/zombies.js';
import { SpatialHash } from '../shared/spatialHash.js';
import { AdaptiveQuality, pixelRatio, isQualityMode } from '../client/src/games/quality.js';
import { SnapEncoder, SnapDecoder } from '../client/src/games/zombies/snapDelta.js';
import { catchUp, gameLoop, SnapBuffer, NetStats } from '../client/src/games/netSync.js';
import * as sim from '../client/src/games/zombies/sim.js';

function floorOf(id) {
  const t = getTemplate(id);
  return composeFloor({ template: id, areas: t.areas.map((a, i) => ({ ...a, id: i + 1 })), objects: t.objects.map((o, i) => ({ ...o, id: i + 1 })) });
}
const run = (q, ms, secs, work = null) => { const out = []; for (let t = 0; t < secs * 1000; t += ms) { const r = q.sample(ms, work); if (r != null) out.push(r); } return out; };

describe('calidad automática (AdaptiveQuality)', () => {
  test('baja un escalón si los cuadros van lentos de forma sostenida, no por un tirón', () => {
    const q = new AdaptiveQuality({ levels: 5, start: 1 });
    run(q, 16.7, 3);
    // un tirón de 300 ms suelto no cambia nada
    q.sample(300);
    run(q, 16.7, 2);
    assert.equal(q.level, 1);
    // 30 fps sostenidos: baja
    const ch = run(q, 33.3, 3);
    assert.ok(ch.length >= 1 && q.level >= 2, `nivel ${q.level}`);
  });

  test('no parpadea: espera entre cambios y no baja de más en un solo bache', () => {
    const q = new AdaptiveQuality({ levels: 6, start: 0, cooldown: 2.5, downAfter: 1.5 });
    run(q, 16.7, 2.5);
    const ch = run(q, 40, 4); // 4 s a 25 fps
    assert.ok(ch.length <= 2, `cambios ${ch}`);
  });

  test('sube solo con tiempo de sobra durante varios segundos', () => {
    const q = new AdaptiveQuality({ levels: 5, start: 3, upAfter: 6 });
    run(q, 16.7, 2 + 5, 14); // a 60 fps pero el cuadro trabaja 14 ms: no sobra
    assert.equal(q.level, 3);
    run(q, 16.7, 7, 5); // ahora sí sobra
    assert.equal(q.level, 2);
  });

  test('histéresis: si al subir se traba, ese escalón queda bloqueado un rato', () => {
    const q = new AdaptiveQuality({ levels: 5, start: 2, upAfter: 4, lockFor: 20 });
    run(q, 16.7, 2 + 4.5, 4); // sobra → sube a 1
    assert.equal(q.level, 1);
    run(q, 33, 3); // en 1 se traba → regresa a 2 y bloquea el 1
    assert.equal(q.level, 2);
    run(q, 16.7, 12, 4); // aunque sobre tiempo, no vuelve a subir (bloqueado)
    assert.equal(q.level, 2, JSON.stringify(q.history));
    run(q, 16.7, 20, 4); // pasado el bloqueo, lo vuelve a intentar
    assert.ok(q.level <= 1, `nivel ${q.level}`);
  });

  test('resolución dinámica: tope del dpr y factor', () => {
    assert.equal(pixelRatio(2, 1.5, 1), 1.5);
    assert.equal(pixelRatio(1, 1.5, 1), 1);
    assert.equal(pixelRatio(2, 1, 0.5), 0.5);
    assert.ok(pixelRatio(1, 1, 0.1) >= 0.35);
    assert.ok(isQualityMode('auto') && isQualityMode('media') && !isQualityMode('ultra'));
  });
});

describe('estados por diferencias (snapDelta)', () => {
  const L = buildLevel(floorOf('recreativo'));
  const near = (a, b) => {
    // igual, salvo la columna del tiempo de los zombis que se predice (±3 centésimas)
    assert.equal(a.ph, b.ph); assert.equal(a.w, b.w); assert.equal(a.left, b.left);
    assert.deepEqual(a.P, b.P);
    assert.equal(a.Z.length, b.Z.length);
    const bz = new Map(b.Z.map((r) => [r[0], r]));
    for (const r of a.Z) {
      const s = bz.get(r[0]);
      assert.ok(s, `zombi ${r[0]}`);
      for (let i = 0; i < r.length; i++) {
        if (i === 8) assert.ok(Math.abs(r[i] - s[i]) <= 3, `t ${r[i]} vs ${s[i]}`);
        else assert.equal(s[i], r[i], `col ${i} zombi ${r[0]}`);
      }
    }
    assert.deepEqual(a.J, b.J); assert.deepEqual(a.K, b.K); assert.deepEqual(a.B, b.B);
  };

  test('ida y vuelta en una horda real (con zombis nuevos, muertos y que se van)', () => {
    const S = sim.createSim(L, { seats: [true, true, false, false], seed: 7 });
    sim.startWave(S, 6);
    const enc = new SnapEncoder({ every: 20 }), dec = new SnapDecoder();
    let full = 0, sent = 0, t = 1000, deltas = 0;
    for (let i = 0; i < 60 * 20; i++) {
      sim.step(S, 1 / 60);
      t += 1000 / 60;
      if (i % 3) continue;
      // alguien dispara de vez en cuando (muertes, botín, eventos)
      if (i % 30 === 0) { const z = S.zombies.find((q) => q.st === 'walk'); if (z) sim.damageZombie(S, z, 1e6, 0, 0, false, 1); }
      const d = sim.pack(S); d._t = Math.round(t);
      const m = enc.encode(d);
      if (m.kb != null) deltas++;
      const wire = JSON.parse(JSON.stringify(m));
      full += JSON.stringify(d).length; sent += JSON.stringify(m).length;
      const back = dec.decode(wire);
      assert.ok(back, `estado ${i} se pudo leer`);
      near(d, back);
    }
    assert.ok(deltas > 100, `deltas ${deltas}`);
    assert.ok(sent < full * 0.8, `menos bytes: ${sent} vs ${full}`);
  });

  test('perder deltas no rompe nada; sin la llave se espera a la siguiente', () => {
    const S = sim.createSim(L, { seed: 3 });
    sim.startWave(S, 3);
    for (let i = 0; i < 60 * 4; i++) sim.step(S, 1 / 60);
    const enc = new SnapEncoder({ every: 5 }), dec = new SnapDecoder();
    let t = 0, missing = 0, ok = 0;
    for (let i = 0; i < 40; i++) {
      for (let k = 0; k < 3; k++) sim.step(S, 1 / 60);
      t += 50;
      const d = sim.pack(S); d._t = t;
      const m = enc.encode(d);
      if (i % 4 === 1 || i === 0) continue; // se pierden (incluida la primera llave)
      const back = dec.decode(JSON.parse(JSON.stringify(m)));
      if (!back) { missing++; continue; }
      ok++;
      near(d, back);
    }
    assert.ok(missing >= 1 && missing <= 6, `sin llave: ${missing}`);
    assert.ok(ok > 20);
  });

  test('estado viejo (sin número de secuencia) pasa tal cual', () => {
    const dec = new SnapDecoder();
    const d = { ph: 'intro', P: [], Z: [] };
    assert.equal(dec.decode(d), d);
  });
});

describe('rejilla espacial (SpatialHash)', () => {
  test('encuentra a los mismos vecinos que revisar todos contra todos', () => {
    let s = 12345;
    const rnd = () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
    const pts = Array.from({ length: 300 }, (_, i) => ({ i, x: rnd() * 40 - 5, y: rnd() * 30 - 5 }));
    const H = new SpatialHash(1, 8); // crece sola
    for (const p of pts) H.insert(p, p.x, p.y);
    assert.equal(H.size, 300);
    for (let k = 0; k < 50; k++) {
      const x = rnd() * 40 - 5, y = rnd() * 30 - 5, r = 0.3 + rnd() * 2;
      const want = pts.filter((p) => Math.hypot(p.x - x, p.y - y) <= r).map((p) => p.i).sort((a, b) => a - b);
      const got = [];
      H.query(x, y, r, (p) => { if (Math.hypot(p.x - x, p.y - y) <= r) got.push(p.i); });
      assert.deepEqual(got.sort((a, b) => a - b), want);
    }
    // cortar la búsqueda
    let n = 0;
    H.query(15, 10, 50, () => { n++; return n === 3; });
    assert.equal(n, 3);
    H.clear();
    let any = false; H.query(0, 0, 100, () => { any = true; });
    assert.equal(any, false);
  });

  test('la simulación separa a los zombis igual que antes (sin encimarse)', () => {
    const L = buildLevel(floorOf('recreativo'));
    const S = sim.createSim(L, { seed: 11 });
    sim.startWave(S, 8);
    S.god = true;
    for (let i = 0; i < 60 * 25; i++) sim.step(S, 1 / 60);
    const zs = S.zombies.filter((z) => z.st === 'walk' || z.st === 'attack');
    assert.ok(zs.length >= 6, `zombis ${zs.length}`);
    let worst = 0;
    for (const a of zs) for (const b of zs) if (a !== b) worst = Math.max(worst, (a.r + b.r) - Math.hypot(a.x - b.x, a.y - b.y));
    assert.ok(worst < 0.35, `se enciman ${worst.toFixed(2)}`);
  });
});

describe('tope de pasos de la simulación', () => {
  test('catchUp: nunca más de maxSteps y el atraso que sobra se tira', () => {
    assert.deepEqual(catchUp(0.05, 1 / 60, 5), { steps: 3, acc: catchUp(0.05, 1 / 60, 5).acc, dropped: 0 });
    const r = catchUp(1, 1 / 60, 5);
    assert.equal(r.steps, 5);
    assert.ok(r.acc < 1 / 60 && r.dropped > 0.85, JSON.stringify(r));
    const z = catchUp(0.001, 1 / 60, 5);
    assert.equal(z.steps, 0); assert.ok(Math.abs(z.acc - 0.001) < 1e-12);
  });

  test('gameLoop: con cuadros lentos no se espiralea (tope de pasos y de milisegundos)', () => {
    let cb = null, steps = 0, clock = 0;
    const loop = gameLoop({ step: () => { steps++; clock += 4; }, frame: () => {}, hz: 60, maxSteps: 5, budgetMs: 10, now: () => clock, raf: (f) => { cb = f; return 1; }, caf: () => {} });
    let t = 0;
    for (let i = 0; i < 20; i++) { const f = cb; cb = null; f(t); t += 250; } // 4 fps
    loop.stop();
    // cada paso "tarda" 4 ms: con 10 ms de presupuesto caben 3 por cuadro (19 cuadros con tiempo)
    assert.ok(steps <= 19 * 3, `pasos ${steps}`);
    assert.ok(loop.stats.dropped > 0);
  });
});

describe('red adaptable', () => {
  test('SnapBuffer: con vaivén dibuja más en el pasado y luego vuelve a bajar despacio', () => {
    const b = new SnapBuffer({ delay: 80, maxDelay: 400, adaptive: true });
    let s = 1;
    const rnd = () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
    for (let t = 0; t < 3000; t += 50) b.push({ _t: t }, t + 40);
    const calm = b.delay;
    assert.ok(calm < 100, `tranquilo ${calm}`);
    for (let t = 3000; t < 8000; t += 50) b.push({ _t: t }, t + 40 + rnd() * 140);
    const rough = b.delay;
    assert.ok(rough > calm + 60, `con vaivén ${rough} vs ${calm}`);
    // con la red ya tranquila baja, pero despacio (no de golpe)
    for (let t = 8000; t < 8500; t += 50) b.push({ _t: t }, t + 40);
    assert.ok(b.delay > calm + 20, 'no baja de golpe');
    for (let t = 8500; t < 30000; t += 50) b.push({ _t: t }, t + 40);
    assert.ok(b.delay < rough - 40, `baja con el tiempo ${b.delay}`);
  });

  test('SnapBuffer: con vaivén casi nunca se queda sin estado (no se congela)', () => {
    const holds = (adaptive) => {
      const b = new SnapBuffer({ delay: 100, maxDelay: 400, adaptive });
      let s = 7;
      const rnd = () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
      const arrivals = [];
      for (let t = 0; t < 20000; t += 50) if (rnd() > 0.05) arrivals.push([t, t + 30 + rnd() * rnd() * 260]);
      arrivals.sort((a, c) => a[1] - c[1]);
      let i = 0;
      for (let now = 0; now < 20500; now += 16) {
        while (i < arrivals.length && arrivals[i][1] <= now) { b.push({ _t: arrivals[i][0] }, arrivals[i][1]); i++; }
        if (now > 2000) { b.sample(now); sum += b.delay; n++; }
      }
      return { holds: b.stats.holds / b.stats.samples, delay: sum / n };
    };
    let sum = 0, n = 0;
    const fixed = holds(false);
    sum = 0; n = 0;
    const adapt = holds(true);
    // casi nunca se congela, y sin dibujar mucho más en el pasado que antes
    assert.ok(adapt.holds < 0.03, `adaptable ${JSON.stringify(adapt)}`);
    assert.ok(adapt.delay < fixed.delay * 1.3, `${JSON.stringify(adapt)} vs ${JSON.stringify(fixed)}`);
  });

  test('NetStats: ping, pérdida por secuencia y diagnóstico red / equipo', () => {
    const n = new NetStats({ window: 1000 });
    for (const p of [40, 60, 50]) n.addPing(p);
    assert.ok(n.ping > 40 && n.ping < 60);
    let t = 0;
    for (let sq = 1; sq <= 200; sq++) { t += 50; if (sq % 10 !== 0) n.addSeq(sq, t); }
    assert.ok(n.loss > 0.06 && n.loss < 0.14, `pérdida ${n.loss}`);
    assert.equal(n.diagnose({ frameMs: 16 }).level, 'net');
    // desordenados no son pérdida
    const o = new NetStats({ window: 1000 });
    let t2 = 0;
    for (let sq = 1; sq <= 200; sq += 2) { t2 += 100; o.addSeq(sq + 1, t2); o.addSeq(sq, t2); }
    o.roll(t2);
    assert.ok(o.loss < 0.02, `desordenados ${o.loss}`);
    const g = new NetStats();
    g.addPing(30);
    assert.equal(g.diagnose({ frameMs: 16 }).level, 'ok');
    assert.equal(g.diagnose({ frameMs: 45 }).level, 'device');
    assert.equal(g.diagnose({ frameMs: 16, holds: 0.3 }).text, 'Conexión inestable');
  });
});
