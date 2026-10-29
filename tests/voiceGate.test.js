// Compuerta de voz (server/voiceGate.js): la señalización WebRTC solo pasa entre quienes
// de verdad pueden oírse; al alejarse se corta; el Hotel por sala; llamadas aceptadas;
// el historial del Hotel sin mensajes de quien bloqueaste; y LiveKit por ámbito.
import { test, before, after, describe } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { io } from 'socket.io-client';
import { startServer, adminClient, createMember, freePort } from './helpers/server.js';
import { composeFloor, nearestWalkable, isWalkable } from '../shared/map.js';

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const once = (s, ev, ms = 3000) => new Promise((resolve, reject) => {
  const t = setTimeout(() => reject(new Error(`sin ${ev}`)), ms);
  s.once(ev, (m) => { clearTimeout(t); resolve(m); });
});

function connector(srv) {
  return (c) => new Promise((resolve, reject) => {
    const s = io(srv.url, { extraHeaders: { cookie: [...c.cookies].map(([k, v]) => `${k}=${v}`).join('; ') }, transports: ['websocket'] });
    s.on('hello', () => resolve(s));
    s.on('connect_error', reject);
  });
}

// ¿Le llega a `b` una señal que manda `a`?
async function relays(a, b, bId) {
  const tag = Math.random().toString(36).slice(2);
  let got = false;
  const on = ({ data }) => { if (data?.tag === tag) got = true; };
  b.on('rtc', on);
  a.emit('rtc', { to: bId, data: { candidate: null, tag } });
  await wait(250);
  b.off('rtc', on);
  return got;
}

const tp = async (s, x, y) => { s.emit('move', { floorId: 1, x, y, tp: true }); await wait(120); };

describe('voz P2P: quién se conecta con quién', () => {
  let srv, admin, f, connect;
  const W = (x, y) => nearestWalkable(f, x, y);
  before(async () => {
    srv = await startServer();
    admin = await adminClient(srv.url);
    connect = connector(srv);
    const payload = (await admin.get('/floors/1')).data.floor;
    f = { ...payload, ...composeFloor(payload) };
  });
  after(async () => { await srv?.stop(); });

  test('cerca sí, lejos en el mismo piso no; al alejarse se corta', async () => {
    const ana = await createMember(srv.url, admin, 'Ana');
    const beto = await createMember(srv.url, admin, 'Beto');
    const a = await connect(ana);
    const b = await connect(beto);
    try {
      const near = W(70, 28);
      const near2 = W(near.x + 2, near.y);
      const far = W(15, 15); // Café, del otro lado del mapa
      await tp(a, near.x, near.y);
      await tp(b, far.x, far.y);
      assert.equal(await relays(a, b, beto.user.id), false, 'lejos: no pasa');
      await tp(b, near2.x, near2.y);
      assert.equal(await relays(a, b, beto.user.id), true, 'cerca: pasa');
      assert.equal(await relays(b, a, ana.user.id), true, 'y de regreso');
      // Conexión preparada: un poco más lejos que el rango de voz (hasta PROXIMITY_RADIUS + 7)
      const warm = W(near.x + 9, near.y);
      if (Math.abs(warm.x - near.x) <= 11 && warm.y === near.y) {
        await tp(b, warm.x, warm.y);
        assert.equal(await relays(a, b, beto.user.id), true, 'conexión preparada');
      }
      // Se aleja: a los dos les llega rtc:drop
      const da = once(a, 'rtc:drop');
      const db = once(b, 'rtc:drop');
      await tp(b, far.x, far.y);
      assert.equal((await da).peer, beto.user.id);
      assert.equal((await db).peer, ana.user.id);
      // Colgar ('bye') siempre se puede
      let bye = false;
      b.on('rtc', ({ data }) => { if (data?.bye) bye = true; });
      a.emit('rtc', { to: beto.user.id, data: { bye: true } });
      await wait(200);
      assert.equal(bye, true);
    } finally { a.close(); b.close(); }
  });

  test('sala cerrada: desde fuera no; al dejarte pasar y entrar, sí', async () => {
    const room = f.areas.find((x) => x.name === 'Roleplay');
    const cells = [];
    for (let y = room.y; y < room.y + room.h; y++) for (let x = room.x; x < room.x + room.w; x++) if (isWalkable(f, x, y)) cells.push({ x, y });
    const inside = cells[Math.floor(cells.length / 2)];
    const inside2 = cells.find((c) => Math.abs(c.x - inside.x) + Math.abs(c.y - inside.y) === 2) || cells[0];
    let outside = null; // junto a la sala, a 1–2 casillas de la pared
    for (let x = room.x; x < room.x + room.w && !outside; x++) for (const y of [room.y - 1, room.y + room.h]) if (isWalkable(f, x, y)) { outside = { x, y }; break; }
    assert.ok(inside && outside);
    const ana = await createMember(srv.url, admin, 'Carla');
    const beto = await createMember(srv.url, admin, 'Dani');
    const a = await connect(ana);
    const b = await connect(beto);
    try {
      await tp(a, inside.x, inside.y);
      await tp(b, outside.x, outside.y);
      // Abierta (sala privada): la conexión preparada sí pasa, aunque no se oigan
      assert.equal(await relays(b, a, ana.user.id), true, 'abierta: conexión preparada');
      // Se cierra: a quien quedó fuera se le corta
      const dropped = once(b, 'rtc:drop');
      a.emit('room:close', { areaId: room.id, closed: true });
      await dropped;
      assert.equal(await relays(b, a, ana.user.id), false, 'cerrada: desde fuera no');
      assert.equal(await relays(a, b, beto.user.id), false, 'ni de dentro hacia fuera');
      // Toca, la dejan pasar y entra
      b.emit('room:knock', { areaId: room.id });
      const admitted = once(b, 'room:admitted');
      a.emit('room:admit', { areaId: room.id, userId: beto.user.id });
      await admitted;
      b.emit('move', { floorId: 1, x: inside2.x, y: inside2.y });
      await wait(150);
      assert.equal(await relays(b, a, ana.user.id), true, 'dentro: sí');
    } finally {
      a.close(); b.close();
      await wait(150);
    }
  });

  test('el ponente del escenario llega a todo su público', async () => {
    const ana = await createMember(srv.url, admin, 'Ponente');
    const beto = await createMember(srv.url, admin, 'Publico');
    const a = await connect(ana);
    const b = await connect(beto);
    try {
      const stage = W(46, 25); // escenario de Torneos
      const back = W(40, 43); // fondo del área de Torneos, lejos
      assert.ok(Math.max(Math.abs(stage.x - back.x), Math.abs(stage.y - back.y)) > 12);
      await tp(a, stage.x, stage.y);
      await tp(b, back.x, back.y);
      assert.equal(await relays(a, b, beto.user.id), true, 'ponente → público');
      assert.equal(await relays(b, a, ana.user.id), true, 'público → ponente');
      // Bajándose del escenario ya no
      const off = W(back.x, back.y - 17);
      await tp(a, off.x, off.y);
      if (Math.max(Math.abs(off.x - back.x), Math.abs(off.y - back.y)) > 12) assert.equal(await relays(b, a, ana.user.id), false);
    } finally { a.close(); b.close(); }
  });

  test('llamada aceptada: se conectan aunque estén lejos', async () => {
    const ana = await createMember(srv.url, admin, 'Eva');
    const beto = await createMember(srv.url, admin, 'Fer');
    const a = await connect(ana);
    const b = await connect(beto);
    try {
      const p1 = W(70, 28), p2 = W(15, 15);
      await tp(a, p1.x, p1.y);
      await tp(b, p2.x, p2.y);
      // "Contestar" sin que te hayan llamado no abre nada
      await beto.post(`/call/${ana.user.id}/answer`, { accept: true });
      assert.equal(await relays(a, b, beto.user.id), false, 'sin llamada no');
      assert.equal((await ana.post(`/call/${beto.user.id}`)).status, 200);
      assert.equal((await beto.post(`/call/${ana.user.id}/answer`, { accept: true })).status, 200);
      assert.equal(await relays(a, b, beto.user.id), true, 'llamada aceptada');
      assert.equal(await relays(b, a, ana.user.id), true);
    } finally { a.close(); b.close(); }
  });

  test('silenciar corta su voz ya conectada', async () => {
    const ana = await createMember(srv.url, admin, 'Gabo');
    const beto = await createMember(srv.url, admin, 'Hugo');
    const a = await connect(ana);
    const b = await connect(beto);
    try {
      const p = W(75, 40);
      await tp(a, p.x, p.y);
      await tp(b, p.x, p.y);
      assert.equal(await relays(a, b, beto.user.id), true);
      const dropped = once(b, 'rtc:drop');
      assert.equal((await admin.post(`/admin/moderation/${ana.user.id}`, { action: 'mute', minutes: 5 })).status, 200);
      assert.equal((await dropped).peer, ana.user.id);
      assert.equal(await relays(a, b, beto.user.id), false);
    } finally { a.close(); b.close(); }
  });
});

describe('Hotel: voz por sala e historial sin bloqueados', () => {
  let srv, admin, connect;
  before(async () => {
    srv = await startServer();
    admin = await adminClient(srv.url);
    connect = connector(srv);
  });
  after(async () => { await srv?.stop(); });

  const enter = async (s, roomId) => { const p = once(s, 'hotel:room'); s.emit('hotel:enter', { roomId }); return p; };

  test('misma sala del Hotel sí (aunque en la oficina estén lejos); otra sala no', async () => {
    const ana = await createMember(srv.url, admin, 'Ivan');
    const beto = await createMember(srv.url, admin, 'Juan');
    const caro = await createMember(srv.url, admin, 'Karen');
    const [a, b, c] = [await connect(ana), await connect(beto), await connect(caro)];
    try {
      a.emit('move', { floorId: 1, x: 15, y: 15, tp: true });
      b.emit('move', { floorId: 1, x: 70, y: 28, tp: true });
      const rooms = (await ana.get('/hotel/rooms?tab=official')).data.rooms;
      assert.ok(rooms.length >= 2);
      await enter(a, rooms[0].id);
      await enter(b, rooms[0].id);
      await enter(c, rooms[1].id);
      assert.equal(await relays(a, b, beto.user.id), true, 'misma sala');
      assert.equal(await relays(b, a, ana.user.id), true);
      assert.equal(await relays(a, c, caro.user.id), false, 'otra sala');
      // Sale del Hotel: ya no (en la oficina están lejos)
      const dropped = once(a, 'rtc:drop', 4000);
      b.emit('hotel:leave');
      await dropped;
      assert.equal(await relays(a, b, beto.user.id), false);
    } finally { a.close(); b.close(); c.close(); }
  });

  test('al entrar, el historial no trae mensajes de quien bloqueaste', async () => {
    const ana = await createMember(srv.url, admin, 'Lalo');
    const beto = await createMember(srv.url, admin, 'Mia');
    const caro = await createMember(srv.url, admin, 'Nico');
    const [a, c] = [await connect(ana), await connect(caro)];
    const roomId = (await ana.get('/hotel/rooms?tab=official')).data.rooms[0].id;
    try {
      await enter(a, roomId);
      await enter(c, roomId);
      a.emit('hotel:chat', { text: 'hola soy lalo' });
      await wait(150);
      c.emit('hotel:chat', { text: 'hola soy nico' });
      await wait(150);
      assert.equal((await beto.put(`/me/blocks/${ana.user.id}`)).status, 200);
      const b = await connect(beto);
      try {
        const snap = await enter(b, roomId);
        const texts = snap.chat.map((m) => m.text);
        assert.ok(texts.includes('hola soy nico'), 'lo de los demás sí');
        assert.ok(!texts.includes('hola soy lalo'), 'lo de quien bloqueó no');
        assert.ok(!snap.chat.some((m) => m.from === ana.user.id));
      } finally { b.close(); }
    } finally { a.close(); c.close(); }
  });
});

describe('LiveKit: una sala por ámbito y silencio al momento', () => {
  let srv, admin, connect, lk;
  const calls = [];
  before(async () => {
    // LiveKit falso: guarda las llamadas a RoomService
    const port = await freePort();
    lk = http.createServer((req, res) => {
      let body = '';
      req.on('data', (d) => { body += d; });
      req.on('end', () => {
        const method = req.url.split('/').pop();
        calls.push({ method, body: JSON.parse(body || '{}'), auth: req.headers.authorization || '' });
        res.setHeader('content-type', 'application/json');
        if (method === 'GetParticipant') return res.end(JSON.stringify({ identity: '1', tracks: [{ sid: 'TR_cam', source: 'CAMERA' }, { sid: 'TR_mic', source: 'MICROPHONE' }] }));
        res.end('{}');
      });
    });
    await new Promise((r) => lk.listen(port, '127.0.0.1', r));
    srv = await startServer({ env: { LIVEKIT_URL: `ws://127.0.0.1:${port}`, LIVEKIT_API_KEY: 'devkey', LIVEKIT_API_SECRET: 'secret-de-prueba' } });
    admin = await adminClient(srv.url);
    connect = connector(srv);
  });
  after(async () => { await srv?.stop(); lk?.close(); });

  const claims = (token) => JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString());

  test('el token es solo de tu piso; al entrar a una sala cerrada te cambias y te sacan de la anterior', async () => {
    const ana = await createMember(srv.url, admin, 'Olga');
    const a = await connect(ana);
    try {
      const payload = (await admin.get('/floors/1')).data.floor;
      const f = { ...payload, ...composeFloor(payload) };
      const room = f.areas.find((x) => x.name === 'Roleplay');
      const inside = nearestWalkable(f, room.x + Math.floor(room.w / 2), room.y + Math.floor(room.h / 2));
      const pos = nearestWalkable(f, 70, 28);
      await tp(a, pos.x, pos.y);
      const t1 = claims((await ana.get('/livekit/token')).data.token);
      assert.equal(t1.video.room, 'oficina-f1');
      await tp(a, inside.x, inside.y);
      const scope = once(a, 'lk:scope', 4000);
      a.emit('room:close', { areaId: room.id, closed: true });
      assert.equal((await scope).scope, `a${room.id}`);
      const t2 = claims((await ana.get('/livekit/token')).data.token);
      assert.equal(t2.video.room, `oficina-a${room.id}`);
      await wait(4500);
      const rm = calls.find((c) => c.method === 'RemoveParticipant' && c.body.identity === String(ana.user.id));
      assert.ok(rm, 'la saca de la sala del piso');
      assert.equal(rm.body.room, 'oficina-f1');
      assert.equal(claims(rm.auth.replace('Bearer ', '')).video.roomAdmin, true);
    } finally { a.close(); }
  });

  test('silenciar a alguien conectado le quita el micrófono en LiveKit al momento', async () => {
    const beto = await createMember(srv.url, admin, 'Pepe');
    const b = await connect(beto);
    try {
      await beto.get('/livekit/token');
      calls.length = 0;
      assert.equal((await admin.post(`/admin/moderation/${beto.user.id}`, { action: 'mute', minutes: 5 })).status, 200);
      await wait(400);
      const up = calls.find((c) => c.method === 'UpdateParticipant');
      assert.ok(up, 'actualiza permisos');
      assert.equal(up.body.identity, String(beto.user.id));
      assert.ok(!up.body.permission.canPublishSources.includes('MICROPHONE'));
      const mute = calls.find((c) => c.method === 'MutePublishedTrack');
      assert.ok(mute, 'silencia la pista publicada');
      assert.equal(mute.body.track_sid, 'TR_mic');
      assert.equal(mute.body.muted, true);
      // Al quitar el silencio, vuelve a poder publicar micrófono
      calls.length = 0;
      await admin.post(`/admin/moderation/${beto.user.id}`, { action: 'unmute' });
      await wait(400);
      assert.ok(calls.find((c) => c.method === 'UpdateParticipant')?.body.permission.canPublishSources.includes('MICROPHONE'));
    } finally { b.close(); }
  });
});
