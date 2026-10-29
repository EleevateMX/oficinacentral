// Temas de la interfaz: Eleevate predeterminado, migración única y tema propio de cada persona.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { startServer, adminClient, createMember, Client } from './helpers/server.js';
import { UI_THEMES, THEME_IDS, USER_THEME_IDS } from '../shared/uiThemes.js';

// La migración se prueba con su propia base: ya traía otro tema guardado (como producción)
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nuvora-themes-'));
process.env.DATA_DIR = dataDir;
process.env.OFFICE_THEME = 'gtahub';
const { db, getSetting, setSetting } = await import('../server/db.js');
setSetting('theme', 'gtahub');
const themes = await import('../server/themes.js');

let srv;
before(async () => { srv = await startServer({ env: { OFFICE_THEME: 'gtahub' } }); });
after(async () => {
  await srv?.stop();
  try { db.close(); } catch { /* ya cerrada */ }
  fs.rmSync(dataDir, { recursive: true, force: true });
});

test('la migración pone Eleevate una sola vez, aunque OFFICE_THEME diga gtahub', () => {
  assert.equal(getSetting('theme'), 'eleevate');
  assert.equal(getSetting('migr_theme_eleevate_v1'), '1');
  assert.equal(themes.officeTheme(), 'eleevate');
  // Después el admin elige otro: la migración ya no lo pisa
  setSetting('theme', 'gtahub');
  assert.equal(themes.migrateTheme(), false);
  assert.equal(themes.officeTheme(), 'gtahub');
});

test('cada tema nuevo trae el juego completo de variables', () => {
  const keys = ['bg', 'panel', 'panel-2', 'hover', 'border', 'text', 'text-2', 'text-3', 'accent', 'accent-2', 'accent-soft', 'on-accent', 'alt', 'btn-primary', 'btn-secondary', 'on-secondary', 'chrome', 'font-display', 'font-body'];
  for (const t of UI_THEMES) for (const k of keys) assert.ok(t.vars[k], `${t.id} sin --${k}`);
  for (const id of ['eleevate', 'lol', 'valorant', 'fortnite', 'minecraft', 'overwatch', 'rocket', 'amongus', 'gtarp', 'gtahub', 'nuvora']) assert.ok(THEME_IDS.includes(id), id);
  assert.ok(!USER_THEME_IDS.includes('custom'));
});

test('la oficina arranca en Eleevate y la API expone la lista de temas', async () => {
  const admin = await adminClient(srv.url);
  const cfg = await admin.get('/config');
  assert.equal(cfg.data.theme, 'eleevate');
  const r = await admin.get('/themes');
  assert.equal(r.status, 200);
  assert.equal(r.data.office, 'eleevate');
  assert.equal(r.data.mine, null);
  const ids = r.data.themes.map((t) => t.id);
  for (const id of ['eleevate', 'lol', 'valorant', 'fortnite', 'minecraft', 'gtahub']) assert.ok(ids.includes(id), id);
  assert.ok(r.data.themes.every((t) => t.name && t.group && Array.isArray(t.swatches) && !t.vars));
  // Sin sesión no hay lista
  assert.equal((await new Client(srv.url).get('/themes')).status, 401);
});

test('el tema propio se guarda en la cuenta y vuelve en /auth/me', async () => {
  const admin = await adminClient(srv.url);
  const ana = await createMember(srv.url, admin, 'Ana');
  assert.equal((await ana.get('/auth/me')).data.user.uiTheme, null);

  assert.equal((await ana.put('/me/theme', { theme: 'valorant' })).status, 200);
  // Otra sesión (otro dispositivo) lo ve igual
  const again = new Client(srv.url);
  await again.login(ana.user.username, 'secreto123');
  assert.equal((await again.get('/auth/me')).data.user.uiTheme, 'valorant');
  assert.equal((await again.get('/themes')).data.mine, 'valorant');
  // No afecta a los demás
  assert.equal((await admin.get('/auth/me')).data.user.uiTheme, null);

  assert.equal((await ana.put('/me/theme', { theme: 'pirata' })).status, 400);
  assert.equal((await ana.put('/me/theme', { theme: 'custom' })).status, 400);
  assert.equal((await ana.put('/me/theme', { theme: null })).status, 200);
  assert.equal((await ana.get('/auth/me')).data.user.uiTheme, null);
});

test('el admin cambia el tema de la oficina (también a uno de juegos)', async () => {
  const admin = await adminClient(srv.url);
  assert.equal((await admin.patch('/admin/office', { theme: 'lol' })).status, 200);
  assert.equal((await admin.get('/config')).data.theme, 'lol');
  assert.equal((await admin.patch('/admin/office', { theme: 'nope' })).status, 400);
  assert.equal((await admin.patch('/admin/office', { theme: 'eleevate' })).status, 200);
  const ana = await createMember(srv.url, admin, 'Beto');
  assert.equal((await ana.patch('/admin/office', { theme: 'gtahub' })).status, 403);
});
