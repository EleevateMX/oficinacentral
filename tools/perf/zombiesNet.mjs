// Red de Zombies sin navegador (Node): bytes por segundo de los estados (completos vs. por
// diferencias) en una horda de jefe con muchos zombis, y qué tan seguido se "congela" el invitado
// (se queda sin estado nuevo) con retraso, vaivén y pérdidas simulados.
//   node tools/perf/zombiesNet.mjs
import { getTemplate, composeFloor } from '../../shared/map.js';
import { buildLevel } from '../../shared/zombies.js';
import * as sim from '../../client/src/games/zombies/sim.js';
import { SnapEncoder, SnapDecoder } from '../../client/src/games/zombies/snapDelta.js';
import { SnapBuffer } from '../../client/src/games/netSync.js';

const t = getTemplate('recreativo');
const floor = composeFloor({ template: 'recreativo', areas: t.areas.map((a, i) => ({ ...a, id: i + 1 })), objects: t.objects.map((o, i) => ({ ...o, id: i + 1 })) });
const L = buildLevel(floor);

// --- tamaño de los estados ---
function bytes({ delta, rateFight = 20, rateIdle = 20, seconds = 30 }) {
  const S = sim.createSim(L, { seats: [true, true, false, false], seed: 21 });
  S.god = true;
  sim.startWave(S, 10);
  const enc = new SnapEncoder();
  let total = 0, n = 0, acc = 0, ms = 0;
  // 4 s de calentamiento + seconds medidos
  for (let i = 0; i < 60 * (4 + seconds); i++) {
    sim.step(S, 1 / 60);
    ms += 1000 / 60; acc += 1 / 60;
    if (i % 20 === 0) { const z = S.zombies.find((q) => q.st === 'walk'); if (z) sim.damageZombie(S, z, 40, 0, 0, false, 1.2); }
    if (S.zombies.filter((z) => z.st !== 'dead').length < 30) sim.spawnZombie(S, 'normal');
    const every = S.phase === 'fight' ? 1 / rateFight : 1 / rateIdle;
    if (acc < every) continue;
    acc = 0;
    const d = sim.pack(S); d._t = Math.round(ms);
    const wire = JSON.stringify(['game:state', { objectId: 317, data: delta ? enc.encode(d) : d }]);
    if (i >= 60 * 4) { total += wire.length; n++; }
  }
  return { perSec: Math.round(n / seconds), kbPerSec: Math.round(total / 1024 / seconds * 10) / 10, avg: Math.round(total / n) };
}

// --- congelones del invitado con red mala ---
function freezes({ adaptive, delay = 90, lat = 40, jitter = 0, drop = 0, stall = 0, rate = 20, seconds = 60, seed = 3 }) {
  const b = adaptive ? new SnapBuffer({ delay, maxDelay: 350, adaptive: true }) : new SnapBuffer({ delay: 100 });
  let s = seed;
  const rnd = () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
  const arr = [];
  for (let t0 = 0; t0 < seconds * 1000; t0 += 1000 / rate) {
    if (rnd() < drop) continue;
    let at = t0 + lat + rnd() * rnd() * jitter * 2;
    // tirones (wifi, TCP): cada ~4 s todo lo que se manda en `stall` ms llega junto al final
    if (stall) { const ph = t0 % 4000; if (ph < stall) at = Math.max(at, t0 - ph + stall + lat); }
    arr.push([t0, at]);
  }
  arr.sort((a, c) => a[1] - c[1]);
  let i = 0, sum = 0, n = 0;
  for (let now = 0; now < seconds * 1000; now += 1000 / 60) {
    while (i < arr.length && arr[i][1] <= now) { b.push({ _t: arr[i][0] }, arr[i][1]); i++; }
    if (now > 3000) { b.sample(now); sum += b.delay; n++; }
  }
  return { holds: Math.round((b.stats.holds / b.stats.samples) * 1000) / 10, delay: Math.round(sum / n) };
}

const full = bytes({ delta: false });
const delta = bytes({ delta: true });
console.log('Estados en horda 10 con ~30 zombis (anfitrión → cada invitado)');
console.log(`  antes  (completos, 20/s): ${full.kbPerSec} KB/s · ${full.avg} B por estado`);
console.log(`  ahora  (diferencias, 20/s): ${delta.kbPerSec} KB/s · ${delta.avg} B por estado`);
// descanso / sala: menos estados
const S = sim.createSim(L, { seats: [true, true, false, false], seed: 2 });
const pk = JSON.stringify(['game:state', { objectId: 317, data: sim.pack(S) }]).length;
console.log(`  sala o descanso: antes 20/s (${Math.round(pk * 20 / 1024 * 10) / 10} KB/s) · ahora 5–10/s (${Math.round(pk * 5 / 1024 * 10) / 10}–${Math.round(pk * 10 / 1024 * 10) / 10} KB/s)`);
console.log('\nInvitado: % de cuadros congelados (sin estado nuevo) y retraso medio con que dibuja');
for (const net of [{ lat: 40, jitter: 0, drop: 0 }, { lat: 60, jitter: 60, drop: 0.02 }, { lat: 90, jitter: 120, drop: 0.05 }, { lat: 60, jitter: 40, drop: 0.02, stall: 250 }]) {
  const a = freezes({ adaptive: false, ...net }), b = freezes({ adaptive: true, ...net });
  console.log(`  red ${net.lat} ms ±${net.jitter} pérdida ${net.drop * 100}%${net.stall ? ` tirones de ${net.stall} ms` : ''}: antes ${a.holds}% congelado (dibuja ${a.delay} ms atrás) · ahora ${b.holds}% (${b.delay} ms)`);
}
