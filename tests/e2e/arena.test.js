// Arena HUB en el navegador: abrir la máquina con X, sala (modo, mapa y clase), práctica con bots
// (una baja, el marcador con Tab, la cámara de la baja y la pantalla final con XP) y un duelo 1v1 entre
// dos personas donde una elimina a la otra. Sin errores de página y sin compilar materiales nuevos
// después del precalentado (eso congela el juego). Usa el gancho de pruebas window.__arena.
// Requiere `npm run build` y Playwright con Chromium (WebGL por software: se adelanta la simulación).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { startServer, adminClient, createMember, ROOT, ADMIN } from '../helpers/server.js';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const START = /[\\/]\./.test(ROOT) ? '/index.html' : '/';

let srv, browser, member;
before(async () => {
  srv = await startServer({ env: { OFFICE_NAME: 'HUB' } });
  const admin = await adminClient(srv.url);
  member = await createMember(srv.url, admin, 'Kevin');
  browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
});
after(async () => { await browser?.close(); await srv?.stop(); });

async function enter(username, password) {
  const context = await browser.newContext({ viewport: { width: 1100, height: 700 } });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(srv.url + START);
  await page.fill('#u', username);
  await page.fill('#p', password);
  await page.click('button.btn.primary');
  await page.waitForFunction(() => window.__office?.state?.ready, null, { timeout: 20000, polling: 300 });
  // la bienvenida puede tardar en salir: se salta (también la de la primera vez del admin)
  await page.locator('text=Saltar').first().waitFor({ timeout: 5000 }).catch(() => {});
  for (let i = 0; i < 4; i++) {
    const skip = page.locator('text=Saltar');
    if (await skip.count()) await skip.first().click().catch(() => {});
    await page.waitForTimeout(400);
  }
  await page.evaluate(() => localStorage.setItem('zombies.quality', 'baja'));
  const A = (fn, ...a) => page.evaluate(([f, args]) => window.__arena[f](...args), [fn, a]);
  return { context, page, errors, A };
}
// Abre la máquina de la Arena (junto a ella, tecla X)
async function openArena(page, errors) {
  const cab = await page.evaluate(() => window.__office.state.floor.objects.find((o) => o.type === 'arenaArcade'));
  assert.ok(cab, 'hay máquina de la Arena');
  await page.evaluate((c) => window.__office.moveMe(c.x, c.y + 1, 'up', { tp: true }), cab);
  await page.waitForTimeout(800);
  await page.locator('.map-wrap > canvas').focus().catch(() => {});
  await page.keyboard.press('x');
  await page.waitForFunction(() => window.__arena?.state().ready, null, { timeout: 60000, polling: 500 })
    .catch(async (e) => { throw new Error(`${e.message} · modal=${JSON.stringify(await page.evaluate(() => window.__office.state.modal))} · ${errors.join(' | ')}`); });
  return cab;
}

test('arena: práctica con bots, una baja, marcador, cámara de la baja y pantalla final', { timeout: 300000 }, async () => {
  const { context, page, errors, A } = await enter(ADMIN.username, ADMIN.password);
  await openArena(page, errors);
  assert.equal(await page.evaluate(() => window.__office.state.modal?.game), 'arena');
  const myPos = () => page.evaluate(() => { const p = window.__office.players[window.__office.state.me.id]; return { x: p.x, y: p.y }; });
  const officeAt = await myPos();
  // pantalla completa y sala
  const box = await page.locator('.game-backdrop.game-full .game-modal').boundingBox();
  assert.ok(box.width >= 1090 && box.height >= 690, `pantalla completa (${box.width}x${box.height})`);
  await page.waitForSelector('.am-root .zm-main .zm-title', { timeout: 20000 });
  let st = await A('state');
  assert.equal(st.host, true);
  assert.equal(st.phase, 'lobby');
  assert.equal(st.screen, 'main');
  assert.ok(st.bots >= 1, 'la práctica trae bots');
  // modo, mapa y clase desde el menú
  await page.click('.zm-item:has-text("Modo de juego")');
  await page.waitForSelector('.am-modes');
  assert.equal(await page.locator('.am-mode').count(), 4);
  await page.click('.am-mode:has-text("Todos contra todos")');
  await page.click('.zm-item:has-text("Mapa")');
  await page.waitForSelector('.am-maps');
  assert.equal(await page.locator('.am-map').count(), 3);
  await page.click('.am-map:has-text("Bodega")');
  assert.equal((await A('state')).map, 'bodega');
  await page.click('.zm-item:has-text("Clase")');
  await page.waitForSelector('.am-load');
  await page.click('.am-class:has-text("Asalto")');
  await page.click('.zm-item:has-text("Controles")');
  await page.waitForSelector('.zm-kb');
  assert.ok(await page.locator('.zm-leg:has-text("Marcador")').count(), 'Tab = marcador en Controles');
  // en la sala no corre nada
  await A('advance', 3);
  assert.equal((await A('state')).phase, 'lobby');
  // comenzar
  await page.click('.zm-item:has-text("Comenzar partida")');
  await page.waitForFunction(() => window.__arena.state().phase === 'intro', null, { timeout: 10000 });
  await A('play');
  await A('advance', 4.5);
  await A('god', true);
  st = await A('state');
  assert.equal(st.phase, 'live');
  assert.equal(st.alive, true);
  // la oficina de abajo no se movió y quien juega no se ve en el mapa
  assert.deepEqual(await myPos(), officeAt);
  // moverse
  const b0 = await A('me');
  await page.keyboard.down('KeyW');
  await page.waitForFunction((b) => { const s = window.__arena.me(); return Math.hypot(s.x - b.x, s.y - b.y) > 0.05; }, b0, { timeout: 30000, polling: 200 }).catch(() => {});
  await page.keyboard.up('KeyW');
  const b1 = await A('me');
  assert.ok(Math.hypot(b1.x - b0.x, b1.y - b0.y) > 0.05, 'se movió');
  // ya se preparó todo: disparar, matar, la cámara de la baja y el marcador no compilan nada nuevo
  await page.waitForFunction(() => window.__arena.state().warmed, null, { timeout: 30000, polling: 200 });
  await page.waitForTimeout(500);
  const programs = (await A('state')).programs;
  assert.ok(programs > 0);
  for (let i = 0; i < 50 && (await A('state')).kills < 1; i++) {
    await A('bringEnemy', 5); await A('aim'); await A('shoot'); await A('advance', 0.15);
  }
  st = await A('state');
  assert.ok(st.kills >= 1, `hizo una baja (${st.kills})`);
  // marcador (mantén Tab)
  await page.keyboard.down('Tab');
  await page.waitForTimeout(300);
  assert.equal((await A('state')).scoreboard, true);
  await page.keyboard.up('Tab');
  assert.equal((await A('state')).scoreboard, false);
  // cae: cámara de la baja y reaparece
  await A('god', false);
  assert.equal(await A('hurtMe', 500), true);
  await A('advance', 0.1);
  st = await A('state');
  assert.equal(st.killcam, true);
  assert.equal(st.deaths, 1);
  await A('advance', 4);
  await page.waitForTimeout(400);
  st = await A('state');
  assert.equal(st.alive, true, 'reapareció');
  assert.equal(st.killcam, false);
  // las otras armas
  for (const id of ['grapadora', 'katana']) { assert.equal(await A('weapon', id), id); await A('advance', 0.2); }
  await A('slash');
  await A('advance', 0.5);
  await page.waitForTimeout(800);
  assert.equal((await A('state')).programs, programs, 'sin compilar materiales nuevos al jugar');
  // fin de la partida: pantalla final con MVP, estadísticas y XP
  await A('endNow');
  await page.waitForSelector('.zm-over .am-over', { timeout: 15000 });
  await page.waitForFunction(() => window.__arena.state().summary?.xp > 0, null, { timeout: 15000, polling: 300 });
  await page.waitForSelector('.am-xp', { timeout: 15000 });
  st = await A('state');
  assert.equal(st.phase, 'over');
  assert.equal(st.summary.won, true);
  assert.ok(await page.locator('.am-mvp').count(), 'hay MVP');
  assert.ok(await page.locator('.am-xp').count(), 'XP ganada');
  // de vuelta a la sala
  await page.click('.zm-item:has-text("Volver a la sala")');
  await page.waitForFunction(() => window.__arena.state().phase === 'lobby', null, { timeout: 10000 });
  // volver a la oficina
  await page.click('.game-back');
  await page.waitForFunction(() => !window.__office.state.modal, null, { timeout: 10000 });
  assert.deepEqual(errors, [], `sin errores: ${errors.join(' | ')}`);
  await context.close();
});

test('arena: duelo 1v1 entre dos personas, una elimina a la otra', { timeout: 300000 }, async () => {
  const a = await enter(ADMIN.username, ADMIN.password);
  const b = await enter(member.user.username, 'secreto123');
  try {
    await openArena(a.page, a.errors);
    await openArena(b.page, b.errors);
    await a.page.waitForFunction(() => window.__arena.state().players === 2, null, { timeout: 20000, polling: 300 });
    assert.equal((await a.A('state')).host, true);
    assert.equal((await b.A('state')).host, false);
    // el anfitrión elige Duelo sin bots; la otra persona lo ve
    await a.A('cfg', { mode: 'duelo', bots: 0, map: 'bodega' });
    await b.page.waitForFunction(() => window.__arena.state().mode === 'duelo', null, { timeout: 10000, polling: 200 });
    assert.equal((await b.A('state')).bots, 0);
    // listo y a jugar
    await b.page.click('.zm-item:has-text("Estoy listo")');
    await a.page.waitForFunction(() => window.__arena.state().phase !== 'lobby', null, { timeout: 15000, polling: 200 })
      .catch(async () => { await a.A('start'); });
    await b.page.waitForFunction(() => window.__arena.state().phase !== 'lobby', null, { timeout: 15000, polling: 200 });
    await a.A('play'); await b.A('play');
    await a.A('advance', 3.5);
    await b.page.waitForFunction(() => window.__arena.state().phase === 'live' && window.__arena.state().alive, null, { timeout: 15000, polling: 200 });
    // cada quien en su lado del mapa
    const pa = await a.A('me'), pb = await b.A('me');
    assert.ok(Math.hypot(pa.x - pb.x, pa.y - pb.y) > 10, 'salen lejos uno del otro');
    // el anfitrión "trae" al rival enfrente (como si caminara) y le dispara hasta eliminarlo
    let ok = false;
    for (let i = 0; i < 40 && !ok; i++) {
      if (i % 8 === 0) { await a.A('pull', 1, 5); await a.page.waitForTimeout(700); }
      await a.A('aim'); await a.A('shoot'); await a.A('advance', 0.2);
      await a.page.waitForTimeout(60);
      ok = (await a.A('state')).kills >= 1;
    }
    assert.ok(ok, 'el anfitrión eliminó al rival');
    await b.page.waitForFunction(() => window.__arena.state().deaths >= 1, null, { timeout: 15000, polling: 200 });
    const sb = await b.A('state');
    assert.equal(sb.alive, false);
    assert.equal(sb.killcam, true, 'quien cayó ve quién lo eliminó');
    // la ronda es para el anfitrión
    await a.A('advance', 1);
    await b.page.waitForFunction(() => (window.__arena.state().result || window.__arena.state().phase) && window.__arena.others().some(Boolean), null, { timeout: 5000 });
    assert.deepEqual(a.errors, [], `anfitrión sin errores: ${a.errors.join(' | ')}`);
    assert.deepEqual(b.errors, [], `invitado sin errores: ${b.errors.join(' | ')}`);
  } finally { await a.context.close(); await b.context.close(); }
});
