// Zombies en la oficina en el navegador: abrir la máquina con X, jugar, matar zombis, llegar al jefe,
// tienda y fin de partida, sin errores de página. Usa el gancho de pruebas window.__zombies.
// Requiere `npm run build` y Playwright con Chromium (WebGL por software: va lento, por eso se adelanta la simulación).
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

test('zombies: abrir la máquina, disparar, jefe, tienda y fin', { timeout: 240000 }, async () => {
  const context = await browser.newContext({ viewport: { width: 1100, height: 700 } });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(srv.url + START);
  await page.fill('#u', ADMIN.username);
  await page.fill('#p', ADMIN.password);
  await page.click('button.btn.primary');
  await page.waitForFunction(() => window.__office?.state?.ready, null, { timeout: 20000, polling: 300 });
  await page.waitForTimeout(1500);
  for (let i = 0; i < 3; i++) {
    const skip = page.locator('text=Saltar');
    if (await skip.count()) await skip.first().click().catch(() => {});
    await page.waitForTimeout(300);
  }
  await page.evaluate(() => localStorage.setItem('zombies.quality', 'baja'));
  // junto a la máquina, X para jugar
  await page.evaluate(() => window.__office.moveMe(65, 24, 'up', { tp: true }));
  await page.waitForTimeout(1000);
  await page.locator('.map-wrap > canvas').focus().catch(() => {});
  await page.keyboard.press('x');
  await page.waitForFunction(() => window.__zombies?.state().ready, null, { timeout: 60000, polling: 500 })
    .catch(async (e) => { throw new Error(`${e.message} · modal=${JSON.stringify(await page.evaluate(() => window.__office.state.modal))} · ${errors.join(' | ')}`); });
  assert.equal(await page.evaluate(() => window.__office.state.modal?.game), 'zombies');
  const Z = (fn, ...a) => page.evaluate(([f, args]) => window.__zombies[f](...args), [fn, a]);
  let st = await Z('state');
  assert.equal(st.host, true);
  assert.equal(st.phase, 'intro');
  // jugar: llega la horda 1
  await Z('play');
  await Z('god', true);
  await Z('advance', 9);
  st = await Z('state');
  assert.equal(st.phase, 'fight');
  assert.equal(st.wave, 1);
  assert.ok(st.zombies > 0, 'hay zombis');
  // moverse con el teclado
  const before = await Z('state');
  await page.keyboard.down('KeyW');
  await page.waitForFunction((b) => { const s = window.__zombies.state(); return Math.hypot(s.x - b.x, s.y - b.y) > 0.05; }, before, { timeout: 30000, polling: 200 }).catch(() => {});
  await page.keyboard.up('KeyW');
  const moved = await Z('state');
  assert.ok(Math.hypot(moved.x - before.x, moved.y - before.y) > 0.05, 'se movió');
  // disparar hasta matar al menos uno
  for (let i = 0; i < 40 && (await Z('state')).kills < 1; i++) {
    await Z('aim'); await Z('shoot'); await Z('advance', 0.3);
  }
  st = await Z('state');
  assert.ok(st.kills >= 1, `mató zombis (${st.kills})`);
  assert.ok(st.score > 0);
  // horda de jefe
  await Z('skipTo', 5);
  await Z('advance', 5);
  st = await Z('state');
  assert.equal(st.boss, 'El Gerente Regional');
  // descanso y tienda
  await Z('breakNow'); await Z('advance', 1);
  assert.equal((await Z('state')).phase, 'break');
  await Z('points', 1000);
  await Z('shop', true);
  await Z('buy', 'cafetera');
  st = await Z('state');
  assert.ok(st.shopOpen);
  // fin: sin protección y con un golpe
  await Z('shop', false);
  await Z('god', false);
  await Z('skipTo', 6);
  await Z('die');
  await Z('advance', 30);
  st = await Z('state');
  assert.equal(st.phase, 'over');
  // la puntuación quedó en la tabla
  await page.waitForTimeout(1500);
  const top = await page.evaluate(() => fetch('/api/games/zombies/top').then((r) => r.json()));
  assert.ok(top.top.length >= 1, 'puntuación guardada');
  // volver a la oficina
  await page.click('.game-back');
  await page.waitForTimeout(500);
  assert.equal(await page.evaluate(() => window.__office.state.modal), null);
  assert.deepEqual(errors, []);
  await context.close();
});
