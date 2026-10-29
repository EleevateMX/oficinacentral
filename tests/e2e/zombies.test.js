// Zombies en la oficina en el navegador: abrir la máquina con X (pantalla completa, menú principal),
// opciones, "Jugar solo", matar zombis, jefe, tienda, fin de partida y revancha, sin errores de página
// y sin que la oficina de abajo se mueva. Usa el gancho de pruebas window.__zombies.
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
  const myPos = () => page.evaluate(() => { const p = window.__office.players[window.__office.state.me.id]; return { x: p.x, y: p.y }; });
  const officeAt = await myPos();
  let st = await Z('state');
  assert.equal(st.host, true);
  assert.equal(st.phase, 'intro');
  // el juego ocupa toda la ventana y empieza en el menú principal (sala)
  const box = await page.locator('.game-backdrop.game-full .game-modal').boundingBox();
  assert.ok(box.width >= 1090 && box.height >= 690, `pantalla completa (${box.width}x${box.height})`);
  await page.waitForSelector('.zm-main .zm-title', { timeout: 20000 });
  assert.equal(st.screen, 'main');
  assert.equal(st.lobby, true);
  // en la sala no corre nada
  await Z('advance', 6);
  assert.equal((await Z('state')).phase, 'intro');
  // opciones: se guardan en este navegador
  await page.click('.zm-item:has-text("Opciones")');
  await page.waitForSelector('.zm-p-options');
  await page.click('.zm-orow:has-text("minimapa") .zm-toggle');
  assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('zombies.opts')).minimap), false);
  assert.equal((await Z('opts')).minimap, false);
  await page.keyboard.press('Escape');
  await page.waitForSelector('.zm-p-options', { state: 'detached' });
  // controles y récords se abren
  await page.click('.zm-item:has-text("Controles")');
  await page.waitForSelector('.zm-kb');
  await page.click('.zm-item:has-text("Récords")');
  await page.waitForSelector('.zm-p-records');
  // Jugar solo
  await page.click('.zm-item:has-text("Jugar solo")');
  await page.waitForFunction(() => window.__zombies.state().lobby === false, null, { timeout: 10000 });
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
  // ya se prepararon los efectos: disparar, cambiar de arma o que llegue un jefe no compila nada nuevo (eso congelaba el juego)
  await page.waitForFunction(() => window.__zombies.state().warmed, null, { timeout: 30000, polling: 200 });
  const programs = (await Z('state')).programs;
  assert.ok(programs > 0);
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
  await page.waitForTimeout(500);
  assert.equal((await Z('state')).programs, programs, 'sin compilar materiales nuevos al disparar ni con el jefe');
  // arsenal: armas nuevas (ráfaga, francotirador con mira, ametralladora y tazas explosivas)
  for (const id of ['toner', 'laser', 'trituradora', 'lanzatazas']) {
    assert.ok((await Z('give', id)) >= 3);
    if (id === 'laser') await Z('ads', true);
    await Z('aim');
    assert.equal(await Z('shoot'), id);
    await Z('advance', 0.3);
    await Z('ads', false);
  }
  // espada: combo de 3, la barra de energía y las 3 técnicas
  await Z('give', 'katana');
  await page.waitForTimeout(400);
  const zid = await Z('zombieAt', 1.2, 0);
  assert.ok(zid, 'zombi de práctica enfrente');
  for (let k = 0; k < 3; k++) {
    const r = await Z('swing', 'light');
    assert.equal(r.step, k, `golpe ${k + 1} del combo`);
    await Z('advance', 0.4);
  }
  assert.ok((await Z('zombieHp', zid)) < 500, 'el combo le pegó');
  assert.ok((await Z('arms')).energy > 0, 'conectar golpes llena la energía');
  await Z('swing', 'heavy');
  await Z('advance', 0.5);
  for (const id of ['katana', 'carton', 'regla']) {
    await Z('give', id);
    await Z('zombieAt', 2.5, 0);
    await Z('energy', 100);
    assert.equal(await Z('tech'), true, `técnica de ${id}`);
    await page.waitForSelector('.zm-bn-tech', { timeout: 5000 });
    await Z('advance', 0.2);
    const a = await Z('arms');
    assert.ok(a.energy < 100 && a.tcd > 0, 'gasta energía y entra en espera');
    assert.equal(await Z('tech'), false, 'en espera no sale otra vez');
    await page.waitForTimeout(700);
    await Z('advance', 1);
  }
  // golpe rápido (V) y rueda de armas (Tab)
  await Z('bash');
  assert.equal(await Z('wheel', true), true);
  await Z('wheelPick', 0);
  await Z('wheel', false);
  assert.equal((await Z('arms')).id, 'grapadora', 'la rueda cambia de arma');
  await page.waitForTimeout(800);
  assert.equal((await Z('state')).programs, programs, 'espadas, técnicas, mira y rueda sin compilar nada nuevo');
  // descanso y tienda (tarjetas; 1-6 compran)
  await Z('breakNow'); await Z('advance', 1);
  assert.equal((await Z('state')).phase, 'break');
  await Z('points', 1000);
  await Z('shop', true);
  await page.waitForSelector('.zm-card[data-buy="box"].can');
  const ptsBefore = (await Z('state')).pts;
  await page.keyboard.press('Digit5');
  await page.waitForFunction((p) => window.__zombies.state().pts < p, ptsBefore, { timeout: 10000 });
  await page.waitForSelector('.zm-card[data-buy="cafetera"].owned');
  st = await Z('state');
  assert.ok(st.shopOpen);
  // caja misteriosa: gira y da un arma
  await Z('points', 1000);
  await page.click('.zm-card[data-buy="box"]');
  await page.waitForSelector('.zm-box', { timeout: 5000 });
  await page.waitForSelector('.zm-box.done', { timeout: 15000 });
  assert.equal((await Z('state')).programs, programs, 'la tienda y la caja tampoco compilan nada');
  // fin: sin protección y con un golpe
  await Z('shop', false);
  await Z('god', false);
  await Z('skipTo', 6);
  await Z('die');
  await Z('advance', 30);
  st = await Z('state');
  assert.equal(st.phase, 'over');
  // pantalla final con estadísticas
  await page.waitForSelector('.zm-over .zm-res.me', { timeout: 20000 });
  // la puntuación quedó en la tabla
  await page.waitForTimeout(1500);
  const top = await page.evaluate(() => fetch('/api/games/zombies/top').then((r) => r.json()));
  assert.ok(top.top.length >= 1, 'puntuación guardada');
  assert.equal(top.me.rank, 1);
  await page.waitForSelector('.zm-badge.gold', { timeout: 10000 });
  // clics y teclas dentro del juego no movieron a tu personaje en la oficina
  const canvas = page.locator('.game-stage > canvas');
  await canvas.click({ position: { x: 300, y: 300 }, force: true }).catch(() => {});
  await page.mouse.move(500, 400); await page.mouse.down(); await page.mouse.move(700, 300); await page.mouse.up();
  await page.keyboard.down('KeyD'); await page.waitForTimeout(600); await page.keyboard.up('KeyD');
  assert.deepEqual(await myPos(), officeAt, 'la oficina no se movió');
  // revancha: de vuelta a la sala con el mismo escuadrón
  await page.click('.zm-item:has-text("Revancha")');
  await page.waitForFunction(() => window.__zombies.state().lobby === true && window.__zombies.state().phase === 'intro', null, { timeout: 10000 });
  await page.waitForSelector('.zm-main');
  // volver a la oficina
  await page.click('.game-back');
  await page.waitForTimeout(500);
  assert.equal(await page.evaluate(() => window.__office.state.modal), null);
  assert.deepEqual(errors, []);
  await context.close();
});
