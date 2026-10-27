// Genera los íconos PNG de la app instalable (PWA) a partir de client/public/logo.svg.
// Uso (requiere Playwright con Chromium; no es dependencia del proyecto):
//   NODE_PATH=$(npm root -g) node tools/icons/generate.js
// Los PNG resultantes se guardan en client/public/icons/ y se versionan en git.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const svg = fs.readFileSync(path.join(ROOT, 'client/public/logo.svg'), 'utf8').trim();
const OUT = path.join(ROOT, 'client/public/icons');
fs.mkdirSync(OUT, { recursive: true });

// El dibujo del logo sin su fondo redondeado, para poder recolocarlo
const glyph = svg.replace(/^<svg[^>]*>/, '').replace(/<\/svg>$/, '').replace(/<rect width="64" height="64"[^>]*\/>/, '');
const BG = '#0A2B2C';

// any: el logo tal cual (esquinas redondeadas, fondo transparente)
// full: fondo a sangre (iOS redondea por su cuenta)
// maskable: fondo a sangre y dibujo dentro de la zona segura (círculo central del 80 %)
const variants = {
  any: svg,
  full: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" fill="${BG}"/>${glyph}</svg>`,
  maskable: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" fill="${BG}"/><g transform="translate(32 32) scale(0.68) translate(-32 -32)">${glyph}</g></svg>`,
};

const targets = [
  ['icon-192.png', 'any', 192],
  ['icon-512.png', 'any', 512],
  ['maskable-192.png', 'maskable', 192],
  ['maskable-512.png', 'maskable', 512],
  ['apple-touch-icon.png', 'full', 180],
];

const browser = await chromium.launch();
const page = await browser.newPage();
for (const [file, kind, size] of targets) {
  await page.setViewportSize({ width: size, height: size });
  const body = variants[kind].replace('<svg ', `<svg width="${size}" height="${size}" style="display:block" `);
  await page.setContent(`<html><body style="margin:0;background:transparent">${body}</body></html>`);
  await page.screenshot({ path: path.join(OUT, file), omitBackground: true, clip: { x: 0, y: 0, width: size, height: size } });
  console.log('✓', file);
}
await browser.close();
