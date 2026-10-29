// Karts de oficina en el navegador: abrir la máquina con X, arrancar una carrera contra bots desde la
// sala, manejar con el teclado, terminar las 3 vueltas y ver los resultados con el podio, sin errores.
// Usa el gancho de pruebas window.__karts (en Chromium sin GPU va lento, por eso se adelanta la simulación).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { startServer, ROOT, ADMIN } from '../helpers/server.js';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const START = /[\\/]\./.test(ROOT) ? '/index.html' : '/';

let srv;
let browser;
before(async () => {
  srv = await startServer({ env: { OFFICE_NAME: 'HUB' } });
  browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
});
after(async () => { await browser?.close(); await srv?.stop(); });

test('karts: abrir la máquina, carrera solo contra bots, manejar y llegar a los resultados', { timeout: 420000 }, async () => {
  const context = await browser.newContext({ viewport: { width: 1100, height: 700 } });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(srv.url + START);
  await page.fill('#u', ADMIN.username);
  await page.fill('#p', ADMIN.password);
  await page.click('button.btn.primary');
  await page.waitForFunction(() => window.__office?.state?.ready, null, { timeout: 30000, polling: 300 });
  await page.waitForTimeout(1500);
  for (let i = 0; i < 3; i++) {
    const skip = page.locator('text=Saltar');
    if (await skip.count()) await skip.first().click().catch(() => {});
    await page.waitForTimeout(300);
  }
  await page.evaluate(() => localStorage.setItem('karts.quality', 'baja'));
  // junto a la máquina de karts, X para jugar
  const cab = await page.evaluate(() => window.__office.state.floor.objects.find((o) => o.type === 'kartArcade'));
  assert.ok(cab, 'hay máquina de karts');
  await page.evaluate(([x, y]) => window.__office.moveMe(x, y, 'up', { tp: true }), [cab.x, cab.y + 1]);
  await page.waitForTimeout(1000);
  await page.locator('.map-wrap > canvas').focus().catch(() => {});
  await page.keyboard.press('x');
  await page.waitForFunction(() => window.__karts?.state().ready, null, { timeout: 90000, polling: 500 })
    .catch(async (e) => { throw new Error(`${e.message} · modal=${JSON.stringify(await page.evaluate(() => window.__office.state.modal))} · ${errors.join(' | ')}`); });
  assert.equal(await page.evaluate(() => window.__office.state.modal?.game), 'karts');
  const K = (fn, ...a) => page.evaluate(([f, args]) => window.__karts[f](...args), [fn, a]);
  let st = await K('state');
  assert.equal(st.host, true);
  assert.equal(st.phase, 'lobby');
  // la sala: escoger pista y arrancar con el botón
  await page.waitForSelector('.kt-lobby', { timeout: 60000 });
  await page.click('[data-act="bots"][data-v="3"]', { timeout: 60000 });
  await page.click('[data-act="start"]', { timeout: 60000 });
  await page.waitForFunction(() => window.__karts.state().phase === 'count', null, { timeout: 60000, polling: 300 });
  st = await K('state');
  assert.equal(st.racers, 4, 'yo y 3 bots');
  assert.equal(st.inRace, true);
  // cuenta regresiva y ¡ya!
  await K('advance', 3.7);
  assert.equal((await K('state')).phase, 'race');
  // manejar con el teclado
  const before = await K('state');
  await page.keyboard.down('KeyW');
  await page.waitForFunction((b) => { const s = window.__karts.state(); return Math.hypot(s.x - b.x, s.z - b.z) > 0.3; }, before, { timeout: 60000, polling: 200 }).catch(() => {});
  await page.keyboard.up('KeyW');
  const moved = await K('state');
  assert.ok(Math.hypot(moved.x - before.x, moved.z - before.z) > 0.3, 'avanzó con W');
  // el piloto automático termina la carrera (se adelanta la simulación)
  await K('autopilot', true);
  for (let i = 0; i < 40 && (await K('state')).phase !== 'done'; i++) await K('advance', 8);
  st = await K('state');
  assert.equal(st.finished, true, 'terminé las 3 vueltas');
  assert.equal(st.lap, 4);
  assert.equal(st.phase, 'done');
  assert.ok(st.best > 10, `mejor vuelta ${st.best}`);
  // resultados con la tabla
  await page.waitForSelector('.kt-results', { timeout: 60000 });
  const rows = await page.locator('.kt-table tbody tr').count();
  assert.equal(rows, 4);
  // la mejor vuelta quedó en los récords de la pista
  await page.waitForFunction(() => fetch('/api/games/karts_oficina/top').then((r) => r.json()).then((d) => d.top.length >= 1), null, { timeout: 30000, polling: 1000 });
  // otra carrera desde los resultados
  await page.click('[data-act="again"]', { timeout: 60000 });
  await page.waitForFunction(() => window.__karts.state().phase === 'count' && window.__karts.state().seq === 2, null, { timeout: 60000, polling: 300 });
  // volver a la oficina
  await page.click('.game-back');
  await page.waitForTimeout(500);
  assert.equal(await page.evaluate(() => window.__office.state.modal), null);
  assert.deepEqual(errors, []);
  await context.close();
});
