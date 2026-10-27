// Verificación en dos pasos y registro de actividad.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { startServer, Client, adminClient, createMember, ADMIN } from './helpers/server.js';

// TOTP propio de la prueba (RFC 6238), independiente del servidor
function b32decode(s) {
  const A = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = 0, v = 0; const out = [];
  for (const ch of s.replace(/[^A-Z2-7]/g, '')) { v = (v << 5) | A.indexOf(ch); bits += 5; if (bits >= 8) { out.push((v >>> (bits - 8)) & 255); bits -= 8; } }
  return Buffer.from(out);
}
function code(secret, offset = 0) {
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30000) + offset));
  const h = crypto.createHmac('sha1', b32decode(secret)).update(msg).digest();
  const o = h[h.length - 1] & 15;
  return String((h.readUInt32BE(o) & 0x7fffffff) % 1e6).padStart(6, '0');
}

let srv;
let admin;
before(async () => { srv = await startServer(); admin = await adminClient(srv.url); });
after(async () => { await srv?.stop(); });

test('activar 2FA y entrar en dos pasos (código, sin reutilizarlo, y código de respaldo)', async () => {
  const m = await createMember(srv.url, admin, 'Segura');
  const setup = await m.post('/me/2fa/setup');
  assert.equal(setup.status, 200);
  assert.match(setup.data.otpauth, /^otpauth:\/\/totp\//);
  assert.equal((await m.post('/me/2fa/enable', { code: '000000' })).status, 400);
  const en = await m.post('/me/2fa/enable', { code: code(setup.data.secret) });
  assert.equal(en.status, 200);
  assert.equal(en.data.recoveryCodes.length, 10);

  // Primer paso: contraseña → ticket, sin sesión todavía
  const c = new Client(srv.url);
  const r1 = await c.login(m.user.username, 'secreto123');
  assert.equal(r1.data.needs2fa, true);
  assert.equal(c.cookies.has('oc_sid'), false);
  assert.equal((await c.post('/auth/2fa', { ticket: r1.data.ticket, code: '123456' })).status, 401);
  // El código usado al activar no se puede reutilizar; el siguiente sí
  const r2 = await c.post('/auth/2fa', { ticket: r1.data.ticket, code: code(setup.data.secret, 1) });
  assert.equal(r2.status, 200);
  assert.ok(c.cookies.has('oc_sid'));

  // Código de respaldo: sirve una sola vez
  const d = new Client(srv.url);
  const t = (await d.login(m.user.username, 'secreto123')).data.ticket;
  assert.equal((await d.post('/auth/2fa', { ticket: t, code: en.data.recoveryCodes[0] })).status, 200);
  const e = new Client(srv.url);
  const t2 = (await e.login(m.user.username, 'secreto123')).data.ticket;
  assert.equal((await e.post('/auth/2fa', { ticket: t2, code: en.data.recoveryCodes[0] })).status, 401);
});

test('el ticket se invalida tras 5 intentos', async () => {
  const m = await createMember(srv.url, admin, 'Intentos');
  const s = (await m.post('/me/2fa/setup')).data.secret;
  await m.post('/me/2fa/enable', { code: code(s) });
  const c = new Client(srv.url);
  const t = (await c.login(m.user.username, 'secreto123')).data.ticket;
  for (let i = 0; i < 5; i++) await c.post('/auth/2fa', { ticket: t, code: '999999' });
  const r = await c.post('/auth/2fa', { ticket: t, code: code(s, 1) });
  assert.equal(r.status, 401);
});

test('exigir 2FA a admins bloquea la administración hasta activarla', async () => {
  // Otro admin sin 2FA
  const other = await createMember(srv.url, admin, 'OtroAdmin');
  await admin.patch(`/admin/users/${other.user.id}`, { role: 'admin' });
  // No se puede exigir si el propio admin no la tiene
  assert.equal((await admin.patch('/admin/office', { requireAdmin2fa: true })).status, 400);
  const s = (await admin.post('/me/2fa/setup')).data.secret;
  assert.equal((await admin.post('/me/2fa/enable', { code: code(s) })).status, 200);
  assert.equal((await admin.patch('/admin/office', { requireAdmin2fa: true })).status, 200);
  const blocked = await other.get('/admin/invites');
  assert.equal(blocked.status, 403);
  assert.equal(blocked.data.code, 'need2fa');
  assert.equal((await admin.get('/admin/invites')).status, 200);
  // Un admin puede quitarle 2FA a otra persona
  assert.equal((await admin.post(`/admin/users/${other.user.id}/reset-2fa`)).status, 200);
  await admin.patch('/admin/office', { requireAdmin2fa: false });
});

test('el registro guarda acciones de admin y logins fallidos, sin contraseñas', async () => {
  await new Client(srv.url).login(ADMIN.username, 'incorrecta');
  const m = await createMember(srv.url, admin, 'Auditada');
  await admin.patch(`/admin/users/${m.user.id}`, { disabled: true });
  await admin.post('/floors', { name: 'Piso Auditoría', template: 'open' });
  const { entries } = (await admin.get('/admin/audit')).data;
  const actions = entries.map((e) => e.action);
  assert.ok(actions.some((a) => a.includes('Desactivó la cuenta de Auditada')));
  assert.ok(actions.some((a) => a.includes('Creó el piso "Piso Auditoría"')));
  assert.ok(actions.some((a) => a.startsWith('Inicio de sesión fallido')));
  assert.ok(actions.some((a) => a.startsWith('Creó una invitación')));
  assert.ok(!JSON.stringify(entries).includes('incorrecta'), 'no guarda contraseñas');
  const filtered = (await admin.get('/admin/audit?q=Piso')).data.entries;
  assert.ok(filtered.length >= 1 && filtered.every((e) => /Piso/.test(e.action) || /Piso/.test(e.actorName)));
  assert.equal((await m.get('/admin/audit')).status, 401);
});
