// Renovar el mapa de un piso conserva los escritorios reclamados y su decoración.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startServer, adminClient, createMember } from './helpers/server.js';
import { composeFloor } from '../shared/map.js';

let srv;
before(async () => { srv = await startServer(); });
after(async () => { await srv?.stop(); });

test('renovar el mapa conserva escritorio, departamento y decoración', async () => {
  const admin = await adminClient(srv.url);
  const ana = await createMember(srv.url, admin, 'Ana');
  // Piso con la plantilla HQ (departamentos); la oficina principal es la recreativa
  const id = (await admin.post('/floors', { name: 'HQ', template: 'hq' })).data.floor.id;
  const floor = async () => { const p = (await admin.get(`/floors/${id}`)).data.floor; return { ...p, ...composeFloor(p) }; };
  const area = (f, o) => f.areas.find((a) => o.x >= a.x && o.y >= a.y && o.x < a.x + a.w && o.y < a.y + a.h)?.name;
  let f = await floor();
  const desk = f.desks.find((d) => area(f, d.object) === 'Marketing');
  assert.ok(desk, 'hay escritorios en Marketing');
  assert.equal((await ana.post(`/desks/${desk.id}/claim`)).status, 200);
  const flag = await ana.post(`/floors/${id}/objects`, { type: 'deskFlag', x: desk.object.x + 0.25, y: desk.object.y + 0.25 });
  assert.equal(flag.status, 200);

  assert.equal((await ana.post(`/floors/${id}/reset-layout`)).status, 403);
  const r = await admin.post(`/floors/${id}/reset-layout`);
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.equal(r.data.kept, 1);

  f = await floor();
  const mine = Object.entries(f.claims).find(([, uid]) => uid === ana.user.id);
  assert.ok(mine, 'Ana sigue teniendo escritorio');
  const nd = f.desks.find((d) => d.id === Number(mine[0]));
  assert.equal(area(f, nd.object), 'Marketing');
  assert.ok(f.objects.some((o) => o.type === 'deskFlag' && o.deskId === nd.id), 'su banderita viajó con ella');
  assert.ok(f.areas.some((a) => a.name === 'Gameplay / LiveOps / Testing'));
});
