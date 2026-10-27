// "Actualizar a todos": solo admins, con límite de frecuencia.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startServer, adminClient, createMember } from './helpers/server.js';

let srv;
before(async () => { srv = await startServer(); });
after(async () => { await srv?.stop(); });

test('solo un admin puede recargar a todos y no dos veces seguidas', async () => {
  const admin = await adminClient(srv.url);
  const member = await createMember(srv.url, admin, 'Lupita');
  assert.equal((await member.post('/admin/reload-all', {})).status, 403);
  const r = await admin.post('/admin/reload-all', { message: 'Nueva versión' });
  assert.equal(r.status, 200);
  assert.equal(r.data.ok, true);
  assert.equal((await admin.post('/admin/reload-all', {})).status, 429);
});
