// Prueba de humo en navegador: entrar, ver el mapa dibujado y sin errores de página.
// Requiere el cliente compilado (`npm run build`) y Playwright con Chromium.
// Se ejecuta con `npm run test:e2e` (no forma parte de `npm test`).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { startServer, ROOT, ADMIN } from '../helpers/server.js';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

let srv;
let browser;

// express `res.sendFile` (usado para la ruta "/" del SPA) responde 404 si la ruta
// absoluta de dist/ tiene una carpeta que empieza con punto (p. ej. .claude/worktrees).
// En ese caso entramos por /index.html, que sirve express.static sin ese problema.
const START = /[\\/]\./.test(ROOT) ? '/index.html' : '/';

before(async () => {
  assert.ok(fs.existsSync(path.join(ROOT, 'dist', 'index.html')), 'Falta dist/: corre `npm run build` antes');
  srv = await startServer();
  browser = await chromium.launch();
});

after(async () => {
  await browser?.close();
  await srv?.stop();
});

test('login y mapa dibujado sin errores', async () => {
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();
  const pageErrors = [];
  const consoleErrors = [];
  page.on('pageerror', (e) => pageErrors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });

  const res = await page.goto(srv.url + START);
  assert.equal(res.status(), 200, `GET ${START}`);
  await page.fill('#u', ADMIN.username);
  await page.fill('#p', ADMIN.password);
  // Antes de entrar, GET /api/auth/me responde 401 a propósito: no cuenta como error
  consoleErrors.length = 0;
  await page.click('button.btn.primary');

  const canvas = page.locator('.map-wrap > canvas');
  await canvas.waitFor({ state: 'visible', timeout: 15000 });

  // Esperar a que el mapa tenga contenido: varios colores distintos en el lienzo
  await page.waitForFunction(() => {
    const c = document.querySelector('.map-wrap > canvas');
    if (!c || !c.width || !c.height) return false;
    const ctx = c.getContext('2d');
    const { data } = ctx.getImageData(0, 0, c.width, c.height);
    const colors = new Set();
    const step = Math.max(4, Math.floor(data.length / 4 / 5000)) * 4;
    for (let i = 0; i < data.length && colors.size < 20; i += step) colors.add(`${data[i]},${data[i + 1]},${data[i + 2]},${data[i + 3]}`);
    return colors.size >= 20;
  }, null, { timeout: 15000 });

  const box = await canvas.boundingBox();
  assert.ok(box.width > 300 && box.height > 200, `lienzo muy chico: ${JSON.stringify(box)}`);

  // Pequeña pausa para que salgan errores tardíos (sockets, imágenes)
  await page.waitForTimeout(1000);
  assert.deepEqual(pageErrors, [], `errores de página:\n${pageErrors.join('\n')}`);
  // Los errores de consola por permisos de cámara/micrófono no cuentan
  const relevant = consoleErrors.filter((t) => !/getUserMedia|NotAllowedError|NotFoundError|Permission|device/i.test(t));
  assert.deepEqual(relevant, [], `errores en consola:\n${relevant.join('\n')}`);
  await context.close();
});
