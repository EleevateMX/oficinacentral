// Karts de oficina: lógica pura (pistas, vueltas, orden, física, IA y vehículos).
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import * as K from '../shared/karts.js';

const DT = 1 / 120;

describe('Karts: vehículos', () => {
  test('el registro tiene el kart con sus estadísticas y es fácil de ampliar', () => {
    const k = K.VEHICLES.kart;
    for (const f of ['speed', 'accel', 'handling', 'weight']) assert.ok(Number.isFinite(k[f]) && k[f] > 0, f);
    assert.equal(K.vehicleStats('no-existe'), K.VEHICLES[K.DEFAULT_VEHICLE]);
    assert.ok(K.KART_COLORS.length >= 4 && K.KART_COLORS.length <= 6);
    for (const c of K.KART_COLORS) assert.match(c.body, /^#[0-9a-f]{6}$/i);
  });
});

describe('Karts: pistas', () => {
  test('hay al menos 3 pistas con tema y dificultad distintos', () => {
    assert.ok(K.TRACKS.length >= 3);
    assert.equal(new Set(K.TRACKS.map((t) => t.theme)).size, K.TRACKS.length);
    assert.deepEqual(K.TRACKS.map((t) => t.difficulty), [1, 2, 3]);
    assert.deepEqual(K.TRACK_IDS, ['oficina', 'juegos', 'torre']);
    assert.equal(K.scoreKey('torre'), 'karts_torre');
  });

  for (const def of K.TRACKS) {
    describe(def.name, () => {
      const T = K.buildTrack(def.id);
      test('circuito cerrado, sin saltos y con largo razonable', () => {
        assert.ok(T.length > 250 && T.length < 700, `largo ${T.length}`);
        const S = T.samples;
        for (let i = 0; i < T.N; i++) {
          const a = S[i], b = S[(i + 1) % T.N];
          const d = Math.hypot(b.x - a.x, b.z - a.z);
          assert.ok(d > T.step * 0.5 && d < T.step * 1.6, `muestra ${i}: ${d}`);
          assert.ok(Math.abs(b.y - a.y) < 0.6, `escalón en ${i}`);
        }
      });
      test('no se cruza consigo misma (salvo en otro piso)', () => {
        const S = T.samples;
        for (let i = 0; i < T.N; i += 2) for (let j = i + 1; j < T.N; j += 2) {
          if (Math.min(j - i, T.N - (j - i)) * T.step < 30) continue;
          if (Math.abs(S[i].y - S[j].y) > 4) continue;
          const gap = Math.hypot(S[i].x - S[j].x, S[i].z - S[j].z) - S[i].hw - S[j].hw;
          assert.ok(gap > 2, `se enciman ${i} y ${j} (${gap.toFixed(2)} m)`);
        }
      });
      test('puntos de control en orden, empezando en la salida', () => {
        assert.ok(T.checkpoints.length >= 6);
        assert.equal(T.checkpoints[0], 0);
        for (let i = 1; i < T.checkpoints.length; i++) assert.ok(T.checkpoints[i] > T.checkpoints[i - 1]);
        assert.ok(T.checkpoints.at(-1) < T.length);
      });
      test('la parrilla está sobre la pista, detrás de la línea, sin karts encimados', () => {
        assert.equal(T.grid.length, K.MAX_RACERS);
        for (const g of T.grid) {
          const L = K.locateGlobal(T, g.x, g.z, g.y);
          assert.ok(Math.abs(L.lat) < T.samples[L.i].hw - K.KART_R, 'adentro de la pista');
          assert.ok(L.s > T.length * 0.8, 'antes de la salida');
        }
        for (let a = 0; a < T.grid.length; a++) for (let b = a + 1; b < T.grid.length; b++) assert.ok(Math.hypot(T.grid[a].x - T.grid[b].x, T.grid[a].z - T.grid[b].z) > K.KART_R * 2);
      });
      test('turbos, rampas y cajas de objetos', () => {
        assert.ok(T.boosts.length >= 2, 'turbos');
        assert.ok(T.ramps.length >= 1, 'rampas');
        assert.ok(T.boxes.length >= 8, 'cajas');
        for (const b of [...T.boosts, ...T.boxes]) assert.ok(Math.abs(b.lat) < K.sampleAt(T, b.s).hw, 'sobre la pista');
      });
    });
  }

  test('la Torre sube varios pisos y es la más larga', () => {
    const T = K.buildTrack('torre');
    assert.ok(Math.max(...T.samples.map((p) => p.y)) > 10, 'azotea en lo alto');
    assert.ok(T.length > K.buildTrack('oficina').length);
  });
});

describe('Karts: vueltas y orden', () => {
  const T = K.buildTrack('oficina');
  const placeAt = (k, s, lat = 0) => { const p = K.pointAt(T, s, lat); k.x = p.x; k.z = p.z; const L = K.locate(T, p.x, p.z, Math.floor((((s % T.length) + T.length) % T.length) / T.step), 6); Object.assign(k, { i: L.i, s: L.s, lat: L.lat }); };

  test('cuenta 3 vueltas pasando por todos los puntos de control', () => {
    const k = K.newKart(T, 0);
    let t = 0;
    const evs = [];
    for (let lap = 0; lap < 4 && !k.finished; lap++) {
      for (let s = T.length - 6; s < T.length * 2 - 6; s += 2) { t += 0.1; placeAt(k, s); evs.push(...K.updateLaps(T, k, t)); if (k.finished) break; }
    }
    assert.equal(k.finished, true);
    assert.equal(evs.filter((e) => e.k === 'lap').length, K.LAPS - 1);
    assert.equal(evs.filter((e) => e.k === 'finish').length, 1);
    assert.equal(k.lapTimes.length, K.LAPS);
    assert.ok(k.bestLap > 0 && k.bestLap <= Math.max(...k.lapTimes));
  });

  test('saltarse puntos de control (ir en reversa por la meta) no cuenta vuelta', () => {
    const k = K.newKart(T, 0);
    placeAt(k, 1); K.updateLaps(T, k, 1); // cruza la salida: vuelta 1
    assert.equal(k.lap, 1);
    placeAt(k, T.length - 3); K.updateLaps(T, k, 2); // se regresa
    placeAt(k, 2); K.updateLaps(T, k, 3); // vuelve a cruzar
    assert.equal(k.lap, 1, 'sigue en la vuelta 1');
    assert.ok(k.progress < T.length * 0.1);
  });

  test('orden de carrera: primero quien terminó (por tiempo) y luego quien va más adelante', () => {
    const list = [
      { id: 'a', finished: false, progress: 500 },
      { id: 'b', finished: true, finishT: 92 },
      { id: 'c', finished: false, progress: 800 },
      { id: 'd', finished: true, finishT: 88 },
    ];
    assert.deepEqual(K.raceOrder(list).map((x) => x.id), ['d', 'b', 'c', 'a']);
  });

  test('el progreso de carrera sube con las vueltas', () => {
    const a = K.newKart(T, 0), b = K.newKart(T, 1);
    placeAt(a, 5); K.updateLaps(T, a, 1); // ya cruzó
    assert.ok(a.progress > b.progress);
  });
});

describe('Karts: física', () => {
  const T = K.buildTrack('oficina');

  test('acelera hasta su velocidad máxima y frena', () => {
    const k = K.newKart(T, 0);
    for (let i = 0; i < 120 * 3; i++) K.stepKart(T, k, { throttle: 1, steer: 0 }, DT);
    assert.ok(k.speed > K.VEHICLES.kart.speed * 0.85, `velocidad ${k.speed}`);
    assert.ok(k.speed <= K.VEHICLES.kart.speed * 1.42 + 0.01, 'tope (con turbo del piso)');
    for (let i = 0; i < 120 * 2; i++) K.stepKart(T, k, { throttle: -1, steer: 0 }, DT);
    assert.ok(k.speed < 0, 'después de frenar, va en reversa');
  });

  test('no se sale de la pista: rebota en la barrera', () => {
    const k = K.newKart(T, 0);
    let walls = 0;
    for (let i = 0; i < 120 * 6; i++) {
      walls += K.stepKart(T, k, { throttle: 1, steer: 1 }, DT).filter((e) => e === 'wall').length;
      assert.ok(Math.abs(k.lat) <= T.samples[k.i].hw - K.KART_R + 0.05, 'dentro de las barreras');
    }
    assert.ok(walls >= 1, 'chocó con la barrera');
  });

  test('derrapar y soltar da un mini turbo', () => {
    // entra a la primera curva (a la derecha) a 20 m/s y derrapa
    const k = K.newKart(T, 0);
    const p = K.pointAt(T, T.marks.recta1 + 56, 0);
    Object.assign(k, { x: p.x, z: p.z, h: p.h, ...K.locateGlobal(T, p.x, p.z) });
    k.vx = Math.cos(p.h) * 20; k.vz = Math.sin(p.h) * 20;
    const ev = [];
    for (let i = 0; i < 120 * 1.4; i++) ev.push(...K.stepKart(T, k, { throttle: 1, steer: i < 60 ? 0.6 : -0.2, drift: true }, DT));
    assert.ok(ev.includes('drift'));
    assert.ok(k.tier >= 1, 'cargó el mini turbo');
    ev.push(...K.stepKart(T, k, { throttle: 1, steer: 0, drift: false }, DT));
    assert.ok(ev.includes('mini1') || ev.includes('mini2'));
    assert.ok(k.boostT > 0, 'con turbo');
  });

  test('las rampas lo hacen volar (el sofá de la Sala de Juegos)', () => {
    const J = K.buildTrack('juegos');
    const r = J.ramps.find((x) => x.sofa);
    const k = K.newKart(J, 0);
    const p = K.pointAt(J, r.s - 14, 0);
    Object.assign(k, { x: p.x, z: p.z, h: p.h, ...K.locateGlobal(J, p.x, p.z) });
    k.vx = Math.cos(p.h) * 22; k.vz = Math.sin(p.h) * 22;
    let flew = false, maxY = 0;
    for (let i = 0; i < 120 * 2; i++) {
      const ev = K.stepKart(J, k, { throttle: 1, steer: 0 }, DT);
      if (ev.includes('jump')) flew = true;
      maxY = Math.max(maxY, k.y);
    }
    assert.ok(flew, 'despega');
    assert.ok(maxY > 1.5, `altura ${maxY}`);
    assert.equal(k.air, false, 'aterriza');
  });

  test('dos karts que chocan se separan', () => {
    const a = K.newKart(T, 0, { id: 'a' }), b = K.newKart(T, 1, { id: 'b' });
    b.x = a.x + 0.5; b.z = a.z;
    K.stepKart(T, a, { throttle: 0 }, DT, { others: [b] });
    assert.ok(Math.hypot(a.x - b.x, a.z - b.z) >= K.KART_R * 2 - 1e-6);
  });

  test('reaparecer deja el kart en el centro de la pista', () => {
    const k = K.newKart(T, 0);
    for (let i = 0; i < 120 * 2; i++) K.stepKart(T, k, { throttle: 1, steer: -1 }, DT);
    K.respawn(T, k);
    assert.ok(Math.abs(k.lat) < 0.5);
    assert.equal(k.speed, 0);
    assert.ok(k.ghostT > 0);
  });
});

describe('Karts: IA', () => {
  for (const def of K.TRACKS) {
    test(`la IA sigue la línea y termina las 3 vueltas en ${def.name}`, () => {
      const T = K.buildTrack(def.id);
      const karts = [0, 1, 2, 3].map((i) => K.newKart(T, i, { id: 10 + i }));
      let t = 0;
      while (t < 300 && !karts.every((k) => k.finished)) {
        for (const k of karts) {
          K.stepKart(T, k, K.aiInput(T, k, { lane: ((k.id % 3) - 1) * 2, skill: 0.8, t }), DT, { others: karts, speedMul: 0.95 });
          K.updateLaps(T, k, t);
        }
        t += DT;
      }
      for (const k of karts) {
        assert.equal(k.finished, true, `bot ${k.id} terminó`);
        assert.ok(k.bestLap > 10 && k.bestLap < 60, `vuelta ${k.bestLap}`);
      }
    });
  }

  test('rubber banding ligero: los de atrás van un poco más rápido', () => {
    assert.ok(K.aiSpeedMul(60) > K.aiSpeedMul(0));
    assert.ok(K.aiSpeedMul(-60) < K.aiSpeedMul(0));
    assert.ok(K.aiSpeedMul(500) < 1.1);
  });
});

describe('Karts: objetos', () => {
  const T = K.buildTrack('oficina');
  test('al último le toca más café', () => {
    const n = 2000;
    const count = (place) => { let c = 0; for (let i = 0; i < n; i++) if (K.rollItem(place, 8, i / n) === 'cafe') c++; return c; };
    assert.ok(count(8) > count(1));
    for (let i = 0; i < 50; i++) assert.ok(K.ITEMS[K.rollItem(1 + (i % 8), 8)]);
  });
  test('la grapa avanza por la pista y le pega a quien alcanza', () => {
    const g = { s0: 10, lat: 0, t0: 0 };
    const p = K.grapaPos(T, g, 0.5);
    assert.ok(Math.abs(p.s - (10 + K.GRAPA_SPEED * 0.5)) < 1e-9);
    assert.equal(K.grapaPos(T, g, K.GRAPA_LIFE + 1).alive, false);
    const k = K.newKart(T, 0);
    Object.assign(k, { s: p.s + 0.5, lat: 0.4 });
    assert.ok(K.touches(T, k, p.s, p.lat));
    Object.assign(k, { s: p.s + 0.5, lat: 3 });
    assert.equal(K.touches(T, k, p.s, p.lat), false);
  });
  test('formato de tiempo', () => {
    assert.equal(K.fmtTime(83.456), '1:23.456');
    assert.equal(K.fmtTime(null), '--:--.---');
  });
});
