// Fotos para comparar la calidad (misma escena, misma cámara): zombis quietos enfrente, sombras,
// partículas y el indicador de red.
//   node tools/perf/zombiesShots.mjs --quality alta --out /tmp/fotos/alta [--net] [--dpr 2]
import { createRequire } from 'node:module';
import { startServer, ADMIN } from '../../tests/helpers/server.js';
import { login, openGame } from './common.mjs';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
const Q = arg('quality', 'alta'), OUT = arg('out', '/tmp/zombies'), DPR = Number(arg('dpr', 1));
const NET = process.argv.includes('--net');

const srv = await startServer({ env: { OFFICE_NAME: 'HUB' } });
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
try {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: DPR });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await login(page, srv.url, ADMIN.username, ADMIN.password);
  await openGame(page, { quality: Q, opts: NET ? { netInfo: true } : null });
  const Z = (fn, ...a) => page.evaluate(([f, args]) => window.__zombies[f](...args), [fn, a]);
  await page.waitForTimeout(2500);
  await page.screenshot({ path: `${OUT}-menu.png` });
  await Z('start'); await Z('play'); await Z('god', true);
  await Z('advance', 6); // horda 1
  await Z('breakNow'); await Z('advance', 0.5);
  const lv = await Z('level');
  await Z('teleport', lv.start.x, lv.start.y);
  // mirando hacia el centro del nivel
  await Z('face', lv.W / 2, lv.H / 2);
  for (const [d, a] of [[2.2, 0], [3, 0.35], [3, -0.35], [4.2, 0.6], [4.2, -0.6], [5.5, 0.15], [6.5, -0.2]]) await Z('zombieAt', d, a);
  await Z('look', -0.05);
  await page.waitForTimeout(2500);
  await page.screenshot({ path: `${OUT}-escena.png` });
  // mirando al piso: las sombras de los zombis
  await Z('look', -0.75);
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${OUT}-sombras.png` });
  await Z('look', -0.05);
  // disparos y partículas
  await Z('give', 'lanzatazas'); await Z('aim'); await Z('shoot');
  await page.waitForTimeout(150);
  await page.screenshot({ path: `${OUT}-disparo.png` });
  const perf = await Z('perf');
  console.log(JSON.stringify({ q: Q, calls: perf.calls, triangles: perf.triangles, pr: perf.pr, shadow: perf.shadow, cache: perf.shadowCache, warn: perf.warn, errors }));
} finally {
  await browser.close();
  await srv.stop();
}
