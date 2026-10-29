// LiveKit: el servidor firma tokens solo si está configurado.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { startServer, adminClient } from './helpers/server.js';

let srv;
let admin;
before(async () => {
  srv = await startServer({ env: { LIVEKIT_URL: 'wss://lk.example.com', LIVEKIT_API_KEY: 'devkey', LIVEKIT_API_SECRET: 'secret-de-prueba' } });
  admin = await adminClient(srv.url);
});
after(async () => { await srv?.stop(); });

test('la configuración anuncia la URL de LiveKit', async () => {
  const r = await admin.get('/config');
  assert.equal(r.data.livekitUrl, 'wss://lk.example.com');
});

test('el token es un JWT válido para la sala de la oficina', async () => {
  const r = await admin.get('/livekit/token');
  assert.equal(r.status, 200);
  const [h, c, sig] = r.data.token.split('.');
  const expected = crypto.createHmac('sha256', 'secret-de-prueba').update(`${h}.${c}`).digest('base64url');
  assert.equal(sig, expected, 'firma HS256 correcta');
  const claims = JSON.parse(Buffer.from(c, 'base64url').toString());
  assert.equal(claims.iss, 'devkey');
  assert.equal(claims.sub, String(admin.user.id));
  assert.match(claims.video.room, /^oficina-/); // una sala por ámbito (server/voiceGate.js)
  assert.equal(claims.video.roomJoin, true);
  assert.ok(claims.exp > Date.now() / 1000);
});

test('sin sesión no hay token', async () => {
  const r = await fetch(`${srv.url}/api/livekit/token`);
  assert.equal(r.status, 401);
});
