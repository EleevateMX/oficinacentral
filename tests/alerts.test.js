// Avisos: llegan al webhook con formato de Discord y no se repiten.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { startServer, adminClient } from './helpers/server.js';

let hook;
let received = [];
let srv;
let admin;

before(async () => {
  hook = http.createServer((req, res) => {
    let b = '';
    req.on('data', (c) => { b += c; });
    req.on('end', () => { received.push({ path: req.url, body: JSON.parse(b) }); res.end('ok'); });
  });
  await new Promise((r) => hook.listen(0, '127.0.0.1', r));
  // Ruta que imita la de Discord para que use su formato
  const url = `http://127.0.0.1:${hook.address().port}/discord.com/api/webhooks/1/abc`;
  srv = await startServer({ env: { ALERT_WEBHOOK_URL: url } });
  admin = await adminClient(srv.url);
});

after(async () => {
  await srv?.stop();
  hook?.close();
});

const waitFor = async (fn, ms = 3000) => {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) { if (fn()) return true; await new Promise((r) => setTimeout(r, 50)); }
  return false;
};

test('avisa al arrancar con formato de Discord', async () => {
  assert.ok(await waitFor(() => received.some((r) => r.body.embeds?.[0]?.title?.includes('en línea'))));
});

test('un error del navegador avisa una sola vez aunque se repita', async () => {
  received = [];
  for (let i = 0; i < 3; i++) await admin.post('/client-errors', { message: 'TypeError: x is undefined', stack: 'at foo', url: '/' });
  await waitFor(() => received.length > 0);
  await new Promise((r) => setTimeout(r, 300));
  const hits = received.filter((r) => r.body.embeds?.[0]?.title?.includes('x is undefined'));
  assert.equal(hits.length, 1);
});

test('health informa tiempo en línea', async () => {
  const r = await admin.get('/health');
  assert.equal(r.data.ok, true);
  assert.equal(typeof r.data.uptime, 'number');
});
