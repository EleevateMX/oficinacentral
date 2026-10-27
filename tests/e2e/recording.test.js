// Navegador: micrófono con RNNoise, pantalla compartida, clip y grabación.
// Dos personas en la "Sala de reuniones Sur" (sala privada): Yamii comparte su
// pantalla, Kevin la ve, guarda un clip y graba una junta corta. Los archivos
// descargados deben poderse reproducir (duración > 0, sin error).
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

let srv;
let browser;
let admin;
let member;

before(async () => {
  assert.ok(fs.existsSync(path.join(ROOT, 'dist', 'index.html')), 'Falta dist/: corre `npm run build` antes');
  srv = await startServer();
  admin = await adminClient(srv.url);
  member = await createMember(srv.url, admin, 'Kevin');
  // Ambos dentro de la Sala de reuniones Sur (piso 1, privada)
  const floorId = (await admin.get('/floors')).data.floors[0].id;
  const db = new DatabaseSync(path.join(srv.dataDir, 'office.db'));
  const put = db.prepare('UPDATE users SET pos_x = ?, pos_y = ?, floor_id = ? WHERE id = ?');
  put.run(24, 55, floorId, admin.user.id);
  put.run(27, 55, floorId, member.user.id);
  db.close();
  browser = await chromium.launch({
    args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--auto-select-desktop-capture-source=Entire screen', '--autoplay-policy=no-user-gesture-required'],
  });
});

after(async () => {
  await browser?.close();
  await srv?.stop();
});

async function enter(username, password) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, acceptDownloads: true });
  await context.grantPermissions(['microphone', 'camera'], { origin: srv.url });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  if (process.env.E2E_LOG) page.on('console', (m) => console.log(username, m.type(), m.text()));
  await page.goto(srv.url + START);
  await page.fill('#u', username);
  await page.fill('#p', password);
  await page.click('button.btn.primary');
  await page.locator('.map-wrap > canvas').waitFor({ state: 'visible', timeout: 15000 });
  await page.waitForFunction(() => window.__office?.state.ready && window.__office.media, null, { timeout: 15000 });
  // La primera vez sale "Primeros pasos": se salta
  const skip = page.locator('.onb button', { hasText: 'Saltar' });
  await skip.waitFor({ timeout: 5000 }).then(() => skip.click()).catch(() => {});
  return { context, page, errors };
}

// Abre el archivo descargado dentro de la página y revisa que se reproduzca
async function playable(page, file) {
  const b64 = fs.readFileSync(file).toString('base64');
  return page.evaluate(async (data) => {
    const bytes = Uint8Array.from(atob(data), (c) => c.charCodeAt(0));
    const v = document.createElement('video');
    v.muted = true;
    v.src = URL.createObjectURL(new Blob([bytes], { type: 'video/webm' }));
    const r = await new Promise((ok) => {
      v.onloadedmetadata = () => ok({ duration: v.duration, width: v.videoWidth, height: v.videoHeight });
      v.onerror = () => ok({ error: v.error?.message || String(v.error?.code) });
      setTimeout(() => ok({ error: 'timeout' }), 8000);
    });
    if (r.error) return r;
    await v.play().catch((e) => { r.error = String(e); });
    await new Promise((ok) => setTimeout(ok, 700));
    r.played = v.currentTime;
    if (v.error) r.error = v.error.message;
    return r;
  }, b64);
}

test('RNNoise, clip y grabación de una pantalla compartida', async () => {
  const yamii = await enter(ADMIN.username, ADMIN.password);
  const kevin = await enter(member.user.username, 'secreto123');
  const ids = { yamii: admin.user.id, kevin: member.user.id };
  try {
    // Están en la misma sala privada
    await yamii.page.waitForFunction((id) => window.__office.state.talkingWith.includes(id), ids.kevin, { timeout: 10000 });
    await kevin.page.waitForFunction((id) => window.__office.state.talkingWith.includes(id), ids.yamii, { timeout: 10000 });

    // Micrófono con supresión de ruido por IA (dispositivo falso)
    await yamii.page.click('button[title="Activar micrófono"]');
    await yamii.page.waitForFunction(() => window.__office.state.media.mic, null, { timeout: 10000 });
    const mic = await yamii.page.evaluate(async () => {
      const m = window.__office.media;
      const track = m.audioTrack;
      // Nivel de la pista procesada (la que se envía): el worklet produce muestras
      const ctx = new AudioContext();
      await ctx.resume();
      const an = ctx.createAnalyser();
      ctx.createMediaStreamSource(new MediaStream([track])).connect(an);
      const data = new Float32Array(an.fftSize);
      let frames = 0;
      for (let i = 0; i < 20; i++) {
        await new Promise((r) => setTimeout(r, 50));
        an.getFloatTimeDomainData(data);
        if (data.some((x) => x !== 0)) frames++;
      }
      ctx.close();
      return {
        ai: m.mic?.ai, state: track.readyState, kind: track.kind, sameAsRaw: track === m.mic?.raw,
        browserNs: m.mic?.raw.getSettings().noiseSuppression, inLocal: m.localStream.getAudioTracks().includes(track),
        stateFlag: window.__office.state.media.aiNoise, frames,
      };
    });
    assert.equal(mic.ai, true, 'RNNoise activo');
    assert.equal(mic.state, 'live');
    assert.equal(mic.kind, 'audio');
    assert.equal(mic.sameAsRaw, false, 'se envía la pista procesada, no la cruda');
    assert.equal(mic.browserNs, false, 'el filtro del navegador se apaga con RNNoise');
    assert.equal(mic.inLocal, true, 'el indicador de voz usa la pista procesada');
    assert.equal(mic.stateFlag, true);
    assert.ok(mic.frames > 0, 'la pista procesada lleva audio');

    // Yamii comparte pantalla; Kevin la ve
    await yamii.page.click('button[title="Compartir pantalla"]');
    await yamii.page.waitForFunction(() => window.__office.state.media.screen, null, { timeout: 10000 });
    const ver = kevin.page.locator('.live-card button', { hasText: 'Ver' });
    await ver.waitFor({ timeout: 10000 });
    await ver.click();
    await kevin.page.waitForFunction(() => {
      const v = document.querySelector('.stream-tile video');
      return v && v.videoWidth > 0 && v.currentTime > 0;
    }, null, { timeout: 15000 });

    // Grabar junta: todos en la sala ven el aviso
    const tile = kevin.page.locator('.stream-tile').first();
    await tile.hover();
    await tile.locator('button.rec-btn', { hasText: 'Grabar' }).click();
    await yamii.page.waitForFunction((id) => window.__office.state.users[id]?.recording === true, ids.kevin, { timeout: 5000 });
    await yamii.page.locator('.live-bar .rec-badge', { hasText: 'Kevin' }).waitFor({ timeout: 5000 });
    await kevin.page.locator('.rec-banner', { hasText: 'Estás grabando' }).waitFor({ timeout: 5000 });

    await kevin.page.waitForTimeout(4000);

    // Clip: se descarga y quien transmite recibe el aviso
    await tile.hover();
    const [clipDl] = await Promise.all([
      kevin.page.waitForEvent('download', { timeout: 10000 }),
      tile.locator('button.rec-btn', { hasText: 'Clip' }).click(),
    ]);
    assert.match(clipDl.suggestedFilename(), /^clip-Yamii-\d{4}-\d{2}-\d{2}-\d{2}-\d{2}\.webm$/);
    await yamii.page.locator('.toast, [class*="toast"]', { hasText: 'Kevin guardó un clip de tu pantalla' }).first().waitFor({ timeout: 5000 });

    // Detener la grabación
    await tile.hover();
    const [recDl] = await Promise.all([
      kevin.page.waitForEvent('download', { timeout: 10000 }),
      tile.locator('button.rec-btn.recording').click(),
    ]);
    assert.match(recDl.suggestedFilename(), /^junta-Yamii-\d{4}-\d{2}-\d{2}-\d{2}-\d{2}\.webm$/);
    await yamii.page.waitForFunction((id) => window.__office.state.users[id]?.recording === false, ids.kevin, { timeout: 5000 });

    for (const [name, dl, min] of [['clip', clipDl, 3], ['grabación', recDl, 3]]) {
      const file = await dl.path();
      if (process.env.KEEP_DL) fs.copyFileSync(file, path.join(process.env.KEEP_DL, dl.suggestedFilename()));
      assert.ok(fs.statSync(file).size > 10_000, `${name}: archivo con contenido`);
      const r = await playable(kevin.page, file);
      assert.equal(r.error, undefined, `${name}: ${r.error}`);
      assert.ok(Number.isFinite(r.duration) && r.duration > min, `${name}: duración ${r.duration}`);
      assert.ok(r.width > 0 && r.height > 0, `${name}: tiene video`);
      assert.ok(r.played > 0, `${name}: se reproduce`);
    }

    // Apagar el micrófono limpia la pista procesada
    const cleaned = await yamii.page.evaluate(async () => {
      const m = window.__office.media;
      const { track, raw } = m.mic;
      await window.__office.toggleMic();
      return { track: track.readyState, raw: raw.readyState, mic: m.mic, local: m.localStream.getAudioTracks().length };
    });
    assert.deepEqual(cleaned, { track: 'ended', raw: 'ended', mic: null, local: 0 });

    assert.deepEqual(yamii.errors, [], `errores (Yamii):\n${yamii.errors.join('\n')}`);
    assert.deepEqual(kevin.errors, [], `errores (Kevin):\n${kevin.errors.join('\n')}`);
  } finally {
    await yamii.context.close();
    await kevin.context.close();
  }
});
