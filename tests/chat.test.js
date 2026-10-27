// Chat: adjuntos, reacciones y chat de la sala.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { io } from 'socket.io-client';
import { startServer, adminClient, createMember } from './helpers/server.js';

let srv;
let admin;
let kev;
before(async () => { srv = await startServer(); admin = await adminClient(srv.url); kev = await createMember(srv.url, admin, 'Kev'); });
after(async () => { await srv?.stop(); });

const PNG = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d4944415478da63f8cfc0f01f0005000201a3f1e5b40000000049454e44ae426082', 'hex');
const cookie = (c) => [...c.cookies].map(([k, v]) => `${k}=${v}`).join('; ');

async function upload(c, buf, name, type) {
  const r = await fetch(`${srv.url}/api/files`, { method: 'POST', headers: { cookie: cookie(c), 'content-type': type, 'x-file-name': encodeURIComponent(name), 'x-width': '1', 'x-height': '1' }, body: buf });
  return { status: r.status, data: await r.json() };
}

test('subir una imagen y mandarla en un mensaje', async () => {
  const up = await upload(kev, PNG, 'captura.png', 'image/png');
  assert.equal(up.status, 200);
  assert.equal(up.data.file.mime, 'image/png');
  const m = await kev.post('/messages', { conv: 'c:1', body: '', files: [up.data.file.id] });
  assert.equal(m.status, 200);
  assert.equal(m.data.message.attachments[0].name, 'captura.png');
  const got = await fetch(`${srv.url}${up.data.file.url}`, { headers: { cookie: cookie(admin) } });
  assert.equal(got.status, 200);
  assert.equal(got.headers.get('content-type'), 'image/png');
  assert.match(got.headers.get('content-security-policy'), /sandbox/);
  assert.equal((await fetch(`${srv.url}${up.data.file.url}`)).status, 401, 'sin sesión no se ve');
});

test('un archivo que dice ser imagen pero no lo es se descarga, no se muestra', async () => {
  const up = await upload(kev, Buffer.from('<html><script>alert(1)</script></html>'), 'falsa.png', 'image/png');
  assert.equal(up.data.file.mime, 'application/octet-stream');
  const got = await fetch(`${srv.url}${up.data.file.url}`, { headers: { cookie: cookie(kev) } });
  assert.match(got.headers.get('content-disposition'), /^attachment/);
});

test('no se pueden adjuntar archivos de otra persona', async () => {
  const up = await upload(admin, PNG, 'del-admin.png', 'image/png');
  const m = await kev.post('/messages', { conv: 'c:1', body: 'hola', files: [up.data.file.id] });
  assert.equal(m.data.message.attachments.length, 0);
});

test('reacciones: poner y quitar, y no en mensajes directos ajenos', async () => {
  const m = (await admin.post('/messages', { conv: 'c:1', body: 'Reunión a las 5' })).data.message;
  let r = await kev.post(`/messages/${m.id}/react`, { emoji: '🔥' });
  assert.deepEqual(r.data.reactions, [{ emoji: '🔥', users: [kev.user.id] }]);
  r = await admin.post(`/messages/${m.id}/react`, { emoji: '🔥' });
  assert.equal(r.data.reactions[0].users.length, 2);
  r = await kev.post(`/messages/${m.id}/react`, { emoji: '🔥' });
  assert.deepEqual(r.data.reactions[0].users, [admin.user.id]);
  const other = await createMember(srv.url, admin, 'Otro');
  const dm = (await admin.post('/messages', { conv: `d:${other.user.id}`, body: 'privado' })).data.message;
  assert.equal((await kev.post(`/messages/${dm.id}/react`, { emoji: '👀' })).status, 403);
  const list = await admin.get('/messages?conv=c:1');
  assert.ok(list.data.messages.find((x) => x.id === m.id).reactions.length === 1);
});

test('chat de la sala: llega a quien está cerca y no a quien está lejos', async () => {
  const far = await createMember(srv.url, admin, 'Lejos');
  const conn = (c) => new Promise((resolve, reject) => {
    const s = io(srv.url, { extraHeaders: { cookie: cookie(c) }, transports: ['websocket'] });
    s.on('hello', () => resolve(s));
    s.on('connect_error', reject);
  });
  const a = await conn(admin);
  const b = await conn(kev);
  const c = await conn(far);
  try {
    // Pasillo abierto del mapa HQ: dos juntos y uno lejos
    a.emit('move', { floorId: 1, x: 40, y: 21, dir: 'down', tp: true });
    b.emit('move', { floorId: 1, x: 41, y: 21, dir: 'down', tp: true });
    c.emit('move', { floorId: 1, x: 80, y: 44, dir: 'down', tp: true });
    await new Promise((r) => setTimeout(r, 200));
    const gotB = new Promise((r) => b.once('room-msg', r));
    let gotC = false;
    c.on('room-msg', () => { gotC = true; });
    a.emit('room-msg', { text: '¿Alguien me ayuda con el servidor?' });
    const m = await gotB;
    assert.equal(m.text, '¿Alguien me ayuda con el servidor?');
    assert.equal(m.from, admin.user.id);
    await new Promise((r) => setTimeout(r, 200));
    assert.equal(gotC, false);
  } finally {
    a.close(); b.close(); c.close();
  }
});
