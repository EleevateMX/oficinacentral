// Escenario con micrófono: quién oye a quién y la fila de manos levantadas.
import { test, before, after, describe } from 'node:test';
import assert from 'node:assert/strict';
import { io } from 'socket.io-client';
import { composeFloor, getTemplate, canTalk, nearestWalkable } from '../shared/map.js';
import { stageAt, stageScopeAt, guestSpot, STAGE_RADIUS } from '../shared/stage.js';
import { startServer, adminClient, createMember } from './helpers/server.js';

// Piso HQ con ids (como en la base de datos)
function hqFloor(extraObjects = []) {
  const t = getTemplate('hq');
  const areas = t.areas.map((a, i) => ({ ...a, id: i + 1 }));
  const objects = [...t.objects, ...extraObjects].map((o, i) => ({ ...o, id: i + 1 }));
  return composeFloor({ template: 'hq', areas, objects });
}
const at = (x, y) => ({ floorId: 1, x, y });

describe('escenario: quién oye a quién', () => {
  const f = hqFloor();

  test('la plantilla HQ trae un escenario en Staff / Orgs', () => {
    const s = stageAt(f, 75, 24);
    assert.ok(s, 'hay escenario');
    assert.equal(s.area.name, 'Staff / Orgs');
  });

  test('el ponente se oye en toda el área; el público lejano no se oye entre sí', () => {
    const speaker = at(75, 24);
    const farA = at(91, 37); // escritorio del otro lado del área
    const farB = at(61, 33);
    assert.equal(canTalk(f, speaker, farA), true);
    assert.equal(canTalk(f, farA, speaker), true);
    assert.equal(canTalk(f, speaker, farB), true);
    assert.equal(canTalk(f, farA, farB), false);
    // Fuera del área no se oye (recepción, sala de juntas privada)
    assert.equal(canTalk(f, speaker, at(42, 53)), false);
    assert.equal(canTalk(f, speaker, at(10, 14)), false);
    // En otro piso tampoco
    assert.equal(canTalk(f, speaker, { floorId: 2, x: 91, y: 37 }), false);
  });

  test('dos ponentes en el mismo escenario se oyen', () => {
    assert.equal(canTalk(f, at(72, 22), at(77, 24)), true);
  });

  test('escenario fuera de un área: alcance por radio (y no entra a salas privadas)', () => {
    // Exterior, en el pasto de abajo
    const g = hqFloor([{ type: 'stage', x: 10, y: 60, rot: 0, color: null }]);
    const s = stageAt(g, 12, 61);
    assert.ok(s && !s.area);
    assert.equal(canTalk(g, at(12, 61), at(12 + STAGE_RADIUS - 3, 64)), true);
    assert.equal(canTalk(g, at(12, 61), at(12 + STAGE_RADIUS + 5, 64)), false);
    assert.equal(canTalk(g, at(12, 61), at(10, 52)), false); // Dev Oeste es privada
  });

  test('alcance y lugar de invitado', () => {
    assert.ok(stageScopeAt(f, 91, 37));
    assert.equal(stageScopeAt(f, 42, 53), null);
    const s = stageAt(f, 75, 24);
    const p = guestSpot(f, s, [{ x: 75, y: 24 }]);
    assert.ok(stageAt(f, p.x, p.y), 'el lugar está arriba del escenario');
    assert.notDeepEqual(p, { x: 75, y: 24 });
  });
});

describe('escenario: fila de manos levantadas', () => {
  let srv;
  before(async () => { srv = await startServer(); });
  after(async () => { await srv?.stop(); });

  const connect = (c) => new Promise((resolve, reject) => {
    const s = io(srv.url, { extraHeaders: { cookie: [...c.cookies].map(([k, v]) => `${k}=${v}`).join('; ') }, transports: ['websocket'] });
    s.on('hello', () => resolve(s));
    s.on('connect_error', reject);
  });
  const once = (s, ev, pred = () => true, ms = 4000) => new Promise((res, rej) => {
    const t = setTimeout(() => { s.off(ev, f); rej(new Error(`sin ${ev}`)); }, ms);
    const f = (m) => { if (pred(m)) { clearTimeout(t); s.off(ev, f); res(m); } };
    s.on(ev, f);
  });
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  test('levantar, orden, dar la palabra, bajar y limpiar al salir', async () => {
    const admin = await adminClient(srv.url);
    const ana = await createMember(srv.url, admin, 'Ana');
    const beto = await createMember(srv.url, admin, 'Beto');
    const caro = await createMember(srv.url, admin, 'Caro');
    const payload = (await admin.get('/floors/1')).data.floor;
    assert.ok(payload.objects.some((o) => o.type === 'stage'), 'el piso nuevo trae escenario');
    const f = composeFloor(payload);
    const spot = (x, y) => nearestWalkable(f, x, y);
    const [sa, sb, sc, sd] = await Promise.all([admin, ana, beto, caro].map(connect));
    try {
      const go = (s, p) => s.emit('move', { floorId: payload.id, ...p, dir: 'down', tp: true });
      go(sa, { x: 75, y: 24 }); // ponente
      go(sb, spot(90, 37)); go(sc, spot(62, 33)); go(sd, spot(70, 29));
      await sleep(200);

      // El ponente no puede levantar la mano; el público sí, en orden
      sa.emit('stage:raise');
      let q = once(sa, 'stage:queue', (m) => m.queue.length === 1);
      const hand = once(sa, 'stage:hand');
      sb.emit('stage:raise');
      assert.deepEqual((await q).queue, [ana.user.id]);
      assert.equal((await hand).from, ana.user.id);
      q = once(sb, 'stage:queue', (m) => m.queue.length === 3);
      sc.emit('stage:raise'); await sleep(50); sd.emit('stage:raise');
      assert.deepEqual((await q).queue, [ana.user.id, beto.user.id, caro.user.id]);
      sb.emit('stage:raise'); // repetir no duplica
      // Sincronizar la fila al llegar
      const sync = once(sd, 'stage:queue', (m) => m.queue.length === 3);
      sd.emit('stage:sync');
      await sync;

      // Alguien del público no puede dar la palabra
      sc.emit('stage:give', { userId: ana.user.id });
      await sleep(150);
      // El ponente da la palabra a Beto: le llega la invitación con un lugar arriba del escenario
      const inv = once(sc, 'stage:invited');
      q = once(sa, 'stage:queue', (m) => m.queue.length === 2);
      sa.emit('stage:give', { userId: beto.user.id });
      const invited = await inv;
      assert.equal(invited.by, admin.user.id);
      assert.ok(stageAt(f, invited.x, invited.y), 'el lugar de invitado está en el escenario');
      assert.deepEqual((await q).queue, [ana.user.id, caro.user.id]);

      // Bajar la mano propia
      q = once(sa, 'stage:queue', (m) => m.queue.length === 1);
      sb.emit('stage:lower');
      assert.deepEqual((await q).queue, [caro.user.id]);
      // Ana vuelve a levantarla y el ponente se la baja
      q = once(sa, 'stage:queue', (m) => m.queue.length === 2);
      sb.emit('stage:raise');
      assert.deepEqual((await q).queue, [caro.user.id, ana.user.id]);
      q = once(sa, 'stage:queue', (m) => m.queue.length === 1);
      sa.emit('stage:lower', { userId: caro.user.id });
      assert.deepEqual((await q).queue, [ana.user.id]);

      // Salir del área la saca de la fila (y se le avisa)
      q = once(sa, 'stage:queue', (m) => m.queue.length === 0);
      const left = once(sb, 'stage:queue', (m) => !m.queue.includes(ana.user.id));
      go(sb, { x: 42, y: 53 });
      await q; await left;

      // Desconectarse también
      sd.emit('stage:raise');
      await once(sa, 'stage:queue', (m) => m.queue.length === 1);
      q = once(sa, 'stage:queue', (m) => m.queue.length === 0);
      sd.disconnect();
      await q;
    } finally {
      for (const s of [sa, sb, sc, sd]) s.disconnect();
    }
  });

  test('el chat de la sala del ponente le llega a todo el público del área', async () => {
    const admin = await adminClient(srv.url);
    const dani = await createMember(srv.url, admin, 'Dani');
    const eli = await createMember(srv.url, admin, 'Eli');
    const payload = (await admin.get('/floors/1')).data.floor;
    const f = composeFloor(payload);
    const [sd, se] = await Promise.all([dani, eli].map(connect));
    try {
      sd.emit('move', { floorId: payload.id, x: 74, y: 24, dir: 'down', tp: true });
      se.emit('move', { floorId: payload.id, ...nearestWalkable(f, 91, 33), dir: 'down', tp: true });
      await sleep(200);
      const got = once(se, 'room-msg', (m) => m.from === dani.user.id);
      sd.emit('room-msg', { text: 'Bienvenidos a la junta' });
      assert.equal((await got).text, 'Bienvenidos a la junta');
    } finally {
      sd.disconnect(); se.disconnect();
    }
  });
});
