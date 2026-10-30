// Medición de "Zombies en la oficina" en Chromium sin GPU (SwiftShader).
// SwiftShader es lento: los números sirven para COMPARAR (antes / después), no como fps reales.
//
//   npx vite build --minify false          (nombres legibles en el perfil de CPU)
//   node tools/perf/zombiesPerf.mjs --label antes --quality alta --seconds 12 --out /tmp/antes.json
//   node tools/perf/zombiesPerf.mjs --label red --net 90:60:0.05   (retraso:vaivén:pérdida en el invitado)
//
// Escenario: anfitrión + 1 invitado, horda de jefe (10) con ~30 zombis, disparos constantes con armas
// de área y una técnica de espada cada ~2 s. Se mide en las dos páginas:
//  - tiempo por cuadro (deltas de requestAnimationFrame con performance.now) y tareas largas
//  - perfil de CPU (CDP Profiler) del anfitrión: funciones con más tiempo propio
//  - llamadas de dibujo / triángulos / geometrías / texturas (renderer.info vía window.__zombies.perf)
//  - bytes asignados por cuadro (muestreo de HeapProfiler incluyendo lo que ya recogió el GC)
//  - tamaño y frecuencia de los estados por WebSocket (CDP Network)
import { createRequire } from 'node:module';
import fs from 'node:fs';
import { startServer, adminClient, createMember, ADMIN } from '../../tests/helpers/server.js';
import { login, openGame } from './common.mjs';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
const LABEL = arg('label', 'run');
const QUALITY = arg('quality', 'alta');
const SECONDS = Number(arg('seconds', 12));
const DPR = Number(arg('dpr', 2));
const NET = arg('net', ''); // "retraso:vaivén:pérdida" para los estados que recibe el invitado
const OUT = arg('out', '');
const SOLO = process.argv.includes('--solo');
const SHOTS = arg('shots', '');
const VW = Number(arg('w', 960)), VH = Number(arg('h', 540));

const pct = (arr, p) => { if (!arr.length) return 0; const s = [...arr].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(s.length * p))]; };
const avg = (arr) => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0);
const r1 = (v) => Math.round(v * 10) / 10;

const NETINFO = process.argv.includes('--netinfo');
async function openZombies(page, quality) { await openGame(page, { quality, opts: NETINFO ? { netInfo: true } : null }); }
// Mide cuadros y tareas largas desde la página (no depende del juego)
const RECORDER = () => {
  const rec = { d: [], lt: [], last: 0, on: false, heap: [] };
  window.__rec = rec;
  const loop = (t) => { if (rec.on && rec.last) rec.d.push(t - rec.last); rec.last = t; requestAnimationFrame(loop); };
  requestAnimationFrame(loop);
  try { new PerformanceObserver((l) => { if (rec.on) for (const e of l.getEntries()) rec.lt.push(e.duration); }).observe({ type: 'longtask', buffered: false }); } catch { /* sin soporte */ }
  rec.perf = [];
  setInterval(() => { if (rec.on && window.__zombies?.perf) rec.perf.push(window.__zombies.perf()); if (rec.on && performance.memory) rec.heap.push(performance.memory.usedJSHeapSize); }, 200);
};
// Red mala en el invitado: retrasa y pierde estados (y retrasa lo que manda)
const BAD_NET = ([delay, jitter, drop]) => {
  const s = window.__office.socket;
  const on = s.onevent.bind(s);
  window.__net = { dropped: 0, got: 0 };
  s.onevent = (packet) => {
    const ev = packet?.data?.[0];
    if (ev === 'game:state' || ev === 'game:event') {
      if (ev === 'game:state' && Math.random() < drop) { window.__net.dropped++; return; }
      window.__net.got++;
      setTimeout(() => on(packet), delay + Math.random() * jitter);
      return;
    }
    on(packet);
  };
  const emit = s.emit.bind(s);
  s.emit = (ev, ...rest) => { if (typeof ev === 'string' && ev.startsWith('game:')) { setTimeout(() => emit(ev, ...rest), delay / 2 + Math.random() * jitter / 2); return s; } return emit(ev, ...rest); };
};
// Dispara sin parar, técnica cada ~2 s y mantiene la horda llena (solo el anfitrión crea zombis)
const DRIVER = (host) => {
  const Z = window.__zombies;
  let n = 0;
  window.__drive = setInterval(() => {
    try {
      n++;
      if (host && n % 8 === 0 && Z.alive() < 30) Z.horde(6);
      if (n % 17 === 0) { Z.give('katana'); if (host) Z.energy(100); Z.aim(); Z.tech(); }
      else if (n % 17 === 2) Z.give(n % 34 < 17 ? 'lanzatazas' : 'trituradora');
      else { Z.aim(); Z.shoot(); }
    } catch { /* sigue */ }
  }, 120);
};

// Costo de GPU de un cuadro: dibuja el mundo N veces seguidas esperando a que la tarjeta termine
// (readPixels obliga a esperar). Mediana de 3 tandas. Sin depender del ritmo de requestAnimationFrame.
const BENCH = () => {
  const Z = window.__zombies, t = Z.three();
  const gl = t.renderer.getContext(), px = new Uint8Array(4);
  const once = Z.renderOnce || (() => t.renderer.render(t.scene, t.camera));
  const run = (n) => { once(); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); const t0 = performance.now(); for (let i = 0; i < n; i++) { once(); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); } return (performance.now() - t0) / n; };
  const r = [run(8), run(8), run(8)].sort((a, b) => a - b);
  return Math.round(r[1] * 10) / 10;
};

async function measure(page, cdp, { profile = false }) {
  if (profile) {
    await cdp.send('Profiler.enable');
    await cdp.send('Profiler.setSamplingInterval', { interval: 400 });
    await cdp.send('Profiler.start');
  }
  await cdp.send('HeapProfiler.enable');
  await cdp.send('HeapProfiler.collectGarbage');
  await cdp.send('HeapProfiler.startSampling', { samplingInterval: 8192, includeObjectsCollectedByMajorGC: true, includeObjectsCollectedByMinorGC: true });
  await cdp.send('Performance.enable');
  const m0 = Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map((m) => [m.name, m.value]));
  await page.evaluate(() => { window.__progs0 = window.__zombies.three().renderer.info.programs.map((p) => p.cacheKey); });
  await page.evaluate(() => { window.__rec.d.length = 0; window.__rec.lt.length = 0; window.__rec.perf.length = 0; window.__rec.on = true; });
  return { m0 };
}
async function finish(page, cdp, { m0 }, { profile = false }) {
  await page.evaluate(() => { window.__rec.on = false; });
  const newPrograms = await page.evaluate(() => window.__zombies.three().renderer.info.programs.filter((p) => !window.__progs0.includes(p.cacheKey)).map((p) => p.name + ' ' + p.cacheKey.slice(0, 160)));
  const rec = await page.evaluate(() => ({ d: window.__rec.d, lt: window.__rec.lt, perf: window.__rec.perf, heap: window.__rec.heap, net: window.__net || null }));
  const m1 = Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map((m) => [m.name, m.value]));
  const { profile: heap } = await cdp.send('HeapProfiler.stopSampling');
  let allocated = 0;
  const walk = (n) => { allocated += n.selfSize; for (const c of n.children || []) walk(c); };
  walk(heap.head);
  // quién asigna más
  const byFn = new Map();
  const walk2 = (n) => { const k = `${n.callFrame.functionName || '(anónima)'} ${(n.callFrame.url || '').split('/').pop()}:${n.callFrame.lineNumber}`; byFn.set(k, (byFn.get(k) || 0) + n.selfSize); for (const c of n.children || []) walk2(c); };
  walk2(heap.head);
  const topAlloc = [...byFn].sort((a, b) => b[1] - a[1]).slice(0, 12).map(([k, v]) => ({ fn: k, kb: Math.round(v / 1024) }));
  let cpu = null;
  if (profile) {
    const { profile: P } = await cdp.send('Profiler.stop');
    const dt = new Map();
    for (let i = 0; i < P.samples.length; i++) dt.set(P.samples[i], (dt.get(P.samples[i]) || 0) + (P.timeDeltas[i] || 0));
    const self = new Map();
    let total = 0;
    for (const n of P.nodes) {
      const t = (dt.get(n.id) || 0) / 1000;
      total += t;
      const f = n.callFrame;
      const file = (f.url || '').split('/').pop().replace(/\?.*$/, '');
      const k = `${f.functionName || '(anónima)'} ${file}:${f.lineNumber + 1}`;
      self.set(k, (self.get(k) || 0) + t);
    }
    const idle = self.get('(idle) :0') || 0;
    cpu = { totalMs: Math.round(total), busyMs: Math.round(total - idle), top: [...self].sort((a, b) => b[1] - a[1]).slice(0, 25).map(([k, v]) => ({ fn: k, ms: Math.round(v), pct: r1((v / total) * 100) })) };
  }
  const frames = rec.d.length;
  const secs = rec.d.reduce((a, b) => a + b, 0) / 1000;
  const P = rec.perf.filter((p) => p && p.calls != null);
  let gcDrops = 0;
  for (let i = 1; i < rec.heap.length; i++) if (rec.heap[i] < rec.heap[i - 1] - 256 * 1024) gcDrops++;
  return {
    frames, secs: r1(secs), fps: r1(frames / (secs || 1)),
    avgMs: r1(avg(rec.d)), p50: r1(pct(rec.d, 0.5)), p95: r1(pct(rec.d, 0.95)), p99: r1(pct(rec.d, 0.99)), maxMs: r1(Math.max(0, ...rec.d)),
    longTasks: rec.lt.length, longTaskMs: Math.round(rec.lt.reduce((a, b) => a + b, 0)),
    calls: Math.round(avg(P.map((p) => p.calls))), triangles: Math.round(avg(P.map((p) => p.triangles))), geometries: P.at(-1)?.geometries, textures: P.at(-1)?.textures, programs: P.at(-1)?.programs,
    zombies: Math.round(avg(P.map((p) => p.zombies))), pixelRatio: P.at(-1)?.pr, canvas: P.at(-1) ? `${P.at(-1).w}x${P.at(-1).h}` : '', hud: P.at(-1) ? `${P.at(-1).hudW}x${P.at(-1).hudH}` : '',
    quality: P.at(-1)?.quality, netStats: P.at(-1)?.net || null, ping: P.at(-1)?.ping ?? null, loss: P.at(-1)?.loss ?? null,
    allocKBperFrame: r1(allocated / 1024 / (frames || 1)), allocMBperSec: r1(allocated / 1048576 / (secs || 1)), gcDrops,
    scriptMs: Math.round((m1.ScriptDuration - m0.ScriptDuration) * 1000), taskMs: Math.round((m1.TaskDuration - m0.TaskDuration) * 1000),
    topAlloc, cpu, net: rec.net, newPrograms,
    busyMsPerFrame: cpu ? r1(cpu.busyMs / (frames || 1)) : null,
  };
}

async function main() {
  const srv = await startServer({ env: { OFFICE_NAME: 'HUB' } });
  // un navegador por jugador: cada uno con su propio proceso de GPU (SwiftShader no se reparte)
  const ARGS = ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-precise-memory-info'];
  const browser = await chromium.launch({ args: ARGS });
  const browser2 = SOLO ? null : await chromium.launch({ args: ARGS });
  const out = { label: LABEL, quality: QUALITY, seconds: SECONDS, dpr: DPR, net: NET || null };
  try {
    const hostCtx = await browser.newContext({ viewport: { width: VW, height: VH }, deviceScaleFactor: DPR });
    const host = await hostCtx.newPage();
    const errors = [];
    host.on('pageerror', (e) => errors.push(`host: ${e.message}`));
    await host.addInitScript(RECORDER);
    await login(host, srv.url, ADMIN.username, ADMIN.password);
    await openZombies(host, QUALITY);
    let guest = null, guestCtx = null;
    const wsHost = { stateBytes: 0, states: 0 };
    const hostCdp = await hostCtx.newCDPSession(host);
    await hostCdp.send('Network.enable');
    hostCdp.on('Network.webSocketFrameSent', ({ response }) => { const p = response.payloadData || ''; if (p.includes('"game:state"')) { if (wsHost.on) { wsHost.stateBytes += p.length; wsHost.states++; } } });
    if (!SOLO) {
      const admin = await adminClient(srv.url);
      const mem = await createMember(srv.url, admin, 'Invitado');
      guestCtx = await browser2.newContext({ viewport: { width: VW, height: VH }, deviceScaleFactor: DPR });
      guest = await guestCtx.newPage();
      guest.on('pageerror', (e) => errors.push(`guest: ${e.message}`));
      await guest.addInitScript(RECORDER);
      await login(guest, srv.url, mem.user.username, 'secreto123');
      await openZombies(guest, QUALITY);
      await host.waitForFunction(() => window.__zombies.state().players >= 2, null, { timeout: 60000, polling: 300 })
        .catch(async (e) => { throw new Error(`${e.message} · host=${JSON.stringify(await host.evaluate(() => [window.__office.state.modal, window.__office.state.floor?.id]))} guest=${JSON.stringify(await guest.evaluate(() => [window.__zombies?.state(), window.__office.state.me?.id]))} hostz=${JSON.stringify(await host.evaluate(() => window.__zombies.state()))}`); });
      if (NET) await guest.evaluate(BAD_NET, NET.split(':').map(Number));
    }
    const Z = (page, fn, ...a) => page.evaluate(([f, args]) => window.__zombies[f](...args), [fn, a]);
    await Z(host, 'start');
    await Z(host, 'play');
    await Z(host, 'god', true);
    if (guest) { await guest.waitForFunction(() => window.__zombies.state().lobby === false, null, { timeout: 60000, polling: 300 }); await Z(guest, 'play'); }
    for (const p of [host, guest].filter(Boolean)) for (const w of ['lanzatazas', 'trituradora', 'katana']) await Z(p, 'give', w);
    await Z(host, 'skipTo', 10);
    await Z(host, 'advance', 5);
    await Z(host, 'horde', 24);
    await Z(host, 'advance', 1.5);
    // calentar: que todo lo que se compila o se crea ya esté
    await host.evaluate(DRIVER, true);
    if (guest) await guest.evaluate(DRIVER, false);
    await host.waitForTimeout(4000);
    const hostCpu = hostCdp;
    const guestCpu = guest ? await guestCtx.newCDPSession(guest) : null;
    const wsGuest = { stateBytes: 0, states: 0 };
    if (guestCpu) { await guestCpu.send('Network.enable'); guestCpu.on('Network.webSocketFrameReceived', ({ response }) => { const p = response.payloadData || ''; if (wsGuest.on && p.includes('"game:state"')) { wsGuest.stateBytes += p.length; wsGuest.states++; } }); }
    const hm = await measure(host, hostCpu, { profile: true });
    const gm = guest ? await measure(guest, guestCpu, { profile: true }) : null;
    wsHost.on = true; wsGuest.on = true;
    const t0 = Date.now();
    if (SHOTS) {
      await host.waitForTimeout(SECONDS * 500);
      await host.screenshot({ path: `${SHOTS}-host.png` });
      if (guest) await guest.screenshot({ path: `${SHOTS}-guest.png` });
      await host.waitForTimeout(SECONDS * 500);
    } else await host.waitForTimeout(SECONDS * 1000);
    const secs = (Date.now() - t0) / 1000;
    wsHost.on = false; wsGuest.on = false;
    out.host = await finish(host, hostCpu, hm, { profile: true });
    if (guest) out.guest = await finish(guest, guestCpu, gm, { profile: true });
    out.host.gpuMs = await host.evaluate(BENCH);
    if (guest) out.guest.gpuMs = await guest.evaluate(BENCH);
    out.snapshots = { sentPerSec: r1(wsHost.states / secs), sentKBperSec: r1(wsHost.stateBytes / 1024 / secs), avgBytes: Math.round(wsHost.stateBytes / (wsHost.states || 1)), recvPerSec: r1(wsGuest.states / secs), recvKBperSec: r1(wsGuest.stateBytes / 1024 / secs) };
    out.errors = errors;
    out.final = await Z(host, 'state');
  } finally {
    await browser.close();
    await browser2?.close();
    await srv.stop();
  }
  const txt = JSON.stringify(out, null, 2);
  if (OUT) fs.writeFileSync(OUT, txt);
  // resumen
  const row = (n, m) => m && console.log(`${n.padEnd(6)} fps ${String(m.fps).padStart(5)} · avg ${m.avgMs} ms · p95 ${m.p95} · p99 ${m.p99} · long ${m.longTasks} · cpu ${m.busyMsPerFrame} ms/cuadro · gpu ${m.gpuMs} ms · calls ${m.calls} · tris ${m.triangles} · alloc ${m.allocKBperFrame} KB/cuadro · gc ${m.gcDrops} · zombis ${m.zombies}`);
  console.log(`[${LABEL}] calidad=${QUALITY} dpr=${DPR} red=${NET || 'normal'}`);
  row('host', out.host); row('guest', out.guest);
  console.log('estados', JSON.stringify(out.snapshots), out.guest?.netStats ? JSON.stringify(out.guest.netStats) : '');
  if (out.errors?.length) console.log('ERRORES', out.errors);
}
main().catch((e) => { console.error(e); process.exit(1); });
