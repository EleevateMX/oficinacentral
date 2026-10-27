// API: inicio de sesión e invitaciones.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startServer, Client, adminClient, createMember, ADMIN } from './helpers/server.js';

let srv;
let admin;

before(async () => {
  srv = await startServer();
  admin = await adminClient(srv.url);
});

after(async () => {
  await srv?.stop();
});

test('GET /health responde ok', async () => {
  const r = await new Client(srv.url).get('/health');
  assert.equal(r.status, 200);
  assert.equal(r.data.ok, true);
});

test('login correcto devuelve el usuario y deja la sesión abierta', async () => {
  const c = new Client(srv.url);
  const r = await c.login(ADMIN.username, ADMIN.password);
  assert.equal(r.status, 200);
  assert.equal(r.data.user.username, 'admin');
  assert.equal(r.data.user.role, 'admin');
  assert.equal(r.data.user.displayName, 'Yamii');
  assert.ok(c.cookies.has('oc_sid'), 'debe recibir la cookie oc_sid');
  const me = await c.get('/auth/me');
  assert.equal(me.status, 200);
  assert.equal(me.data.user.id, r.data.user.id);
});

test('login con contraseña incorrecta se rechaza', async () => {
  const c = new Client(srv.url);
  const r = await c.login(ADMIN.username, 'mala-contraseña');
  assert.equal(r.status, 401);
  assert.ok(r.data.error);
  assert.equal(c.cookies.has('oc_sid'), false);
  assert.equal((await c.get('/auth/me')).status, 401);
});

test('login con usuario inexistente se rechaza', async () => {
  const r = await new Client(srv.url).login('nadie', 'admin1234');
  assert.equal(r.status, 401);
});

test('sin sesión no se puede leer la API privada', async () => {
  const c = new Client(srv.url);
  assert.equal((await c.get('/floors')).status, 401);
  assert.equal((await c.post('/admin/invites', {})).status, 401);
});

test('logout cierra la sesión', async () => {
  const c = new Client(srv.url);
  await c.login(ADMIN.username, ADMIN.password);
  assert.equal((await c.post('/auth/logout')).status, 200);
  assert.equal((await c.get('/auth/me')).status, 401);
});

test('la invitación se puede usar una sola vez', async () => {
  const inv = await admin.post('/admin/invites', {});
  assert.equal(inv.status, 200);
  const { token } = inv.data.invite;
  assert.ok(token);

  const anon = new Client(srv.url);
  assert.equal((await anon.get(`/invites/${token}`)).status, 200);

  const first = new Client(srv.url);
  const r1 = await first.post(`/invites/${token}/accept`, { displayName: 'Ana', username: 'ana', password: 'secreto123' });
  assert.equal(r1.status, 200, JSON.stringify(r1.data));
  assert.equal(r1.data.user.username, 'ana');
  assert.equal(r1.data.user.role, 'member');
  assert.equal((await first.get('/auth/me')).status, 200, 'aceptar deja la sesión abierta');

  const second = new Client(srv.url);
  const r2 = await second.post(`/invites/${token}/accept`, { displayName: 'Beto', username: 'beto', password: 'secreto123' });
  assert.equal(r2.status, 404);
  assert.equal((await anon.get(`/invites/${token}`)).status, 404);

  const list = await admin.get('/admin/invites');
  assert.equal(list.data.invites.find((i) => i.token === token).status, 'used');

  // El nuevo usuario puede entrar con su contraseña
  const again = new Client(srv.url);
  assert.equal((await again.login('ana', 'secreto123')).status, 200);
});

test('aceptar una invitación valida los datos de la cuenta', async () => {
  const { data } = await admin.post('/admin/invites', {});
  const c = new Client(srv.url);
  const short = await c.post(`/invites/${data.invite.token}/accept`, { displayName: 'Ceci', username: 'ceci', password: 'corta' });
  assert.equal(short.status, 400);
  // La invitación sigue disponible después de un intento inválido
  const ok = await c.post(`/invites/${data.invite.token}/accept`, { displayName: 'Ceci', username: 'ceci', password: 'secreto123' });
  assert.equal(ok.status, 200);
});

test('una invitación con token inventado no existe', async () => {
  const r = await new Client(srv.url).post('/invites/no-existe/accept', { displayName: 'X', username: 'xxx', password: 'secreto123' });
  assert.equal(r.status, 404);
});

test('un miembro no puede crear ni ver invitaciones', async () => {
  const member = await createMember(srv.url, admin, 'Dani');
  assert.equal(member.user.role, 'member');
  assert.equal((await member.post('/admin/invites', {})).status, 403);
  assert.equal((await member.post('/admin/invites', { role: 'admin' })).status, 403);
  assert.equal((await member.get('/admin/invites')).status, 403);
});

test('una invitación revocada ya no sirve', async () => {
  const { data } = await admin.post('/admin/invites', {});
  assert.equal((await admin.del(`/admin/invites/${data.invite.token}`)).status, 200);
  const r = await new Client(srv.url).post(`/invites/${data.invite.token}/accept`, { displayName: 'Eli', username: 'eli', password: 'secreto123' });
  assert.equal(r.status, 404);
});
