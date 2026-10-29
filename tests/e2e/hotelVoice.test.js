// Navegador: voz dentro de una sala del Hotel (micrófono falso de Chromium).
// Dos personas en la misma sala del Hotel se conectan y se oyen (con la ondita de "hablando");
// al salir una de la sala se desconectan, y al volver a la oficina regresa la voz por cercanía de allá.
// Requiere `npm run build` y Playwright con Chromium (se corre con `npm run test:e2e`).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { DatabaseSync } from 'node:sqlite';
import { startServer, adminClient, createMember, ROOT, ADMIN } from '../helpers/server.js';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const START = /[\\/]\./.test(ROOT) ? '/index.html' : '/';

let srv, browser, admin, member, room;

before(async () => {
  assert.ok(fs.existsSync(path.join(ROOT, 'dist', 'index.html')), 'Falta dist/: corre `npm run build` antes');
  srv = await startServer();
  admin = await adminClient(srv.url);
  member = await createMember(srv.url, admin, 'Kevin');
  room = (await admin.post('/hotel/rooms', { name: 'Sala de voz', model: 'b' })).data.room;
  // En la oficina están en la misma sala privada (para ver que al volver se oyen allá otra vez)
  const floorId = (await admin.get('/floors')).data.floors[0].id;
  const db = new DatabaseSync(path.join(srv.dataDir, 'office.db'));
  const put = db.prepare('UPDATE users SET pos_x = ?, pos_y = ?, floor_id = ? WHERE id = ?');
  put.run(19, 55, floorId, admin.user.id);
  put.run(22, 55, floorId, member.user.id);
  db.close();
  browser = await chromium.launch({ args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--autoplay-policy=no-user-gesture-required'] });
});

after(async () => {
  await browser?.close();
  await srv?.stop();
});

async function enter(username, password) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  await context.grantPermissions(['microphone', 'camera'], { origin: srv.url });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(srv.url + START);
  await page.fill('#u', username);
  await page.fill('#p', password);
  await page.click('button.btn.primary');
  await page.waitForFunction(() => window.__office?.state.ready && window.__office.media, null, { timeout: 15000 });
  const skip = page.locator('.onb button', { hasText: 'Saltar' });
  await skip.waitFor({ timeout: 5000 }).then(() => skip.click()).catch(() => {});
  return { context, page, errors };
}
const talking = (p, id, on = true) => p.waitForFunction(([i, o]) => window.__office.state.talkingWith.includes(i) === o, [id, on], { timeout: 15000 });

test('voz en el Hotel: misma sala se oye, al salir se corta, en la oficina vuelve', async () => {
  const a = await enter(ADMIN.username, ADMIN.password);
  const b = await enter(member.user.username, 'secreto123');
  const A = admin.user.id, B = member.user.id;
  try {
    await talking(a.page, B);
    // Al Hotel: mientras no estén en una sala, no se oye nada de la oficina
    for (const x of [a, b]) {
      await x.page.evaluate(() => window.__office.set({ view: 'hotel' }));
      await x.page.waitForFunction(() => window.__hotel, null, { timeout: 15000 });
    }
    await talking(a.page, B, false);
    // Los dos en la misma sala del Hotel
    for (const x of [a, b]) {
      await x.page.evaluate((id) => window.__hotel.enter(id), room.id);
      await x.page.waitForFunction(() => window.__hotel.state.screen === 'room', null, { timeout: 10000 });
    }
    await talking(a.page, B);
    await talking(b.page, A);
    // Micrófono desde la barra del Hotel; la conexión P2P queda lista y llega su voz (ondita)
    await a.page.click('.ht-mic');
    await a.page.waitForFunction(() => window.__office.state.media.mic, null, { timeout: 10000 });
    await b.page.waitForFunction((id) => window.__office.state.peers.some((p) => p.id === id && p.state === 'connected'), A, { timeout: 15000 });
    await b.page.waitForFunction((id) => window.__hotelVoice.level(id) > 0, A, { timeout: 15000 });
    await a.page.waitForFunction((id) => window.__hotelVoice.level(id) > 0, A, { timeout: 10000 });
    const vol = await b.page.evaluate(() => window.__hotelVoice.peers());
    assert.deepEqual(vol.ids, [A]);
    assert.ok(vol.vol[A] > 0 && vol.vol[A] <= 1);
    // Kevin sale de la sala: se corta la voz para los dos
    await b.page.evaluate(() => window.__hotel.leave());
    await talking(a.page, B, false);
    await a.page.waitForFunction((id) => !window.__office.state.peers.some((p) => p.id === id), B, { timeout: 15000 });
    // De regreso a la oficina: vuelve la voz por cercanía de allá
    for (const x of [a, b]) await x.page.evaluate(() => window.__office.set({ view: 'map' }));
    await talking(a.page, B);
    await talking(b.page, A);
    assert.deepEqual([...a.errors, ...b.errors], []);
  } finally {
    await a.context.close();
    await b.context.close();
  }
});
