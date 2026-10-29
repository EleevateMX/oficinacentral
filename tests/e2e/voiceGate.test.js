// Navegador: la compuerta de voz (server/voiceGate.js + client/src/lib/voiceGate.js) no rompe
// la voz de verdad: al acercarse se conectan, a través de una sala cerrada no, al dejarte
// pasar y entrar sí, y al alejarse se corta.
// Requiere `npm run build` y Playwright con Chromium (se corre con `npm run test:e2e`).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { startServer, adminClient, createMember, ROOT, ADMIN } from '../helpers/server.js';
import { composeFloor, isWalkable, nearestWalkable } from '../../shared/map.js';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const START = /[\\/]\./.test(ROOT) ? '/index.html' : '/';

let srv, browser, admin, member, f;

before(async () => {
  assert.ok(fs.existsSync(path.join(ROOT, 'dist', 'index.html')), 'Falta dist/: corre `npm run build` antes');
  srv = await startServer();
  admin = await adminClient(srv.url);
  member = await createMember(srv.url, admin, 'Kevin');
  const payload = (await admin.get('/floors/1')).data.floor;
  f = { ...payload, ...composeFloor(payload) };
  browser = await chromium.launch({ args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--autoplay-policy=no-user-gesture-required'] });
});

after(async () => {
  await browser?.close();
  await srv?.stop();
});

async function enter(username, password) {
  const context = await browser.newContext({ viewport: { width: 1100, height: 700 } });
  await context.grantPermissions(['microphone', 'camera'], { origin: srv.url });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (process.env.E2E_LOG) console.log(username, m.type(), m.text()); });
  await page.goto(srv.url + START);
  await page.fill('#u', username);
  await page.fill('#p', password);
  await page.click('button.btn.primary');
  await page.waitForFunction(() => window.__office?.state.ready && window.__office.media, null, { timeout: 15000 });
  const skip = page.locator('.onb button', { hasText: 'Saltar' });
  await skip.waitFor({ timeout: 4000 }).then(() => skip.click()).catch(() => {});
  return { context, page, errors };
}

const tp = (u, p) => u.page.evaluate(({ x, y }) => window.__office.moveMe(x, y, 'down', { tp: true }), p);
const connected = async (u, id, ms = 15000) => {
  try { await u.page.waitForFunction((pid) => window.__office.state.peers.some((p) => p.id === pid && p.state === 'connected'), id, { timeout: ms }); } catch (e) {
    console.log('DEBUG', await u.page.evaluate(() => { const m = window.__office.media; return JSON.stringify({ peers: window.__office.state.peers.map((p) => [p.id, p.state]), sig: [...m.peers.values()].map((p) => [p.id, p.pc.signalingState, p.pc.connectionState]), held: [...m.held.keys()], dropped: [...m.dropped], wanted: [...(m.wanted || [])], me: window.__office.myPlayer }); }));
    throw e;
  }
};
const gone = (u, id, ms = 15000) => u.page.waitForFunction((pid) => !window.__office.state.peers.some((p) => p.id === pid), id, { timeout: ms });

test('voz: acercarse, sala cerrada con permiso para pasar y alejarse', async () => {
  const yamii = await enter(ADMIN.username, ADMIN.password);
  const kevin = await enter(member.user.username, 'secreto123');
  const Y = admin.user.id, K = member.user.id;
  try {
    // Con micrófono (sin pistas no hay nada que negociar)
    for (const u of [yamii, kevin]) {
      await u.page.evaluate(() => window.__office.toggleMic());
      await u.page.waitForFunction(() => window.__office.state.media.mic, null, { timeout: 10000 });
    }
    const far = nearestWalkable(f, 15, 15);
    const near = nearestWalkable(f, 70, 28);
    await tp(yamii, far);
    await tp(kevin, near);
    await gone(yamii, K, 6000); // lejos: sin conexión (al aparecer juntos en la entrada sí había)
    await yamii.page.waitForTimeout(1500);
    assert.equal(await yamii.page.evaluate((id) => window.__office.state.peers.some((p) => p.id === id), K), false, 'lejos: sigue sin conexión');
    // Se acerca: conexión lista y hablando
    await tp(yamii, nearestWalkable(f, near.x + 2, near.y));
    await connected(yamii, K);
    await connected(kevin, Y);
    await yamii.page.waitForFunction((id) => window.__office.state.talkingWith.includes(id), K, { timeout: 10000 });
    // Se aleja: se corta
    await tp(yamii, far);
    await gone(yamii, K);
    await gone(kevin, Y);

    // Sala cerrada: Kevin dentro de Roleplay, la cierra; Yamii afuera junto a la puerta
    const room = f.areas.find((a) => a.name === 'Roleplay');
    const cells = [];
    for (let y = room.y; y < room.y + room.h; y++) for (let x = room.x; x < room.x + room.w; x++) if (isWalkable(f, x, y)) cells.push({ x, y });
    const inside = cells[Math.floor(cells.length / 2)];
    let outside = null;
    for (let x = room.x; x < room.x + room.w && !outside; x++) for (const y of [room.y - 1, room.y + room.h]) if (isWalkable(f, x, y)) { outside = { x, y }; break; }
    await tp(kevin, inside);
    await kevin.page.waitForTimeout(300);
    await kevin.page.evaluate((id) => window.__office.setRoomClosed(id, true), room.id);
    await kevin.page.waitForFunction((id) => window.__office.state.floor.areas.find((a) => a.id === id)?.closed, room.id, { timeout: 5000 });
    await tp(yamii, outside);
    await yamii.page.waitForFunction((id) => window.__office.state.floor.areas.find((a) => a.id === id)?.closed, room.id, { timeout: 5000 });
    await yamii.page.waitForTimeout(2500);
    assert.equal(await yamii.page.evaluate((id) => window.__office.state.peers.some((p) => p.id === id && p.state === 'connected'), K), false, 'a través de la sala cerrada no');
    // La dejan pasar y entra
    await yamii.page.evaluate((id) => window.__office.socket.emit('room:knock', { areaId: id }), room.id);
    await kevin.page.waitForTimeout(300);
    await kevin.page.evaluate(({ areaId, userId }) => window.__office.socket.emit('room:admit', { areaId, userId }), { areaId: room.id, userId: Y });
    await yamii.page.waitForTimeout(300);
    const spot = cells.find((c) => Math.abs(c.x - inside.x) + Math.abs(c.y - inside.y) === 2) || cells[0];
    await tp(yamii, spot);
    await connected(yamii, K);
    await connected(kevin, Y);
    await yamii.page.waitForFunction((id) => window.__office.state.talkingWith.includes(id), K, { timeout: 10000 });
    assert.deepEqual([...yamii.errors, ...kevin.errors], []);
  } finally {
    await yamii.context.close();
    await kevin.context.close();
  }
});
