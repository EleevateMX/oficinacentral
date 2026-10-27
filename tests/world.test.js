// API: escritorios, decoración y reglas de líderes de departamento.
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startServer, adminClient, createMember } from './helpers/server.js';
import { composeFloor, inRect } from '../shared/map.js';
import { CATALOG, objSize, CHAIR_TYPES } from '../shared/catalog.js';

const FLOOR = 1;
const DECOR = 'floorPlant'; // decoración 1×1
const FURNITURE = 'plant'; // mueble sólido 1×1

let srv;
let admin;

before(async () => {
  srv = await startServer();
  admin = await adminClient(srv.url);
});

after(async () => {
  await srv?.stop();
});

async function floor(c = admin) {
  const r = await c.get(`/floors/${FLOOR}`);
  assert.equal(r.status, 200);
  const p = r.data.floor;
  return { ...p, state: composeFloor({ template: p.template, areas: p.areas, objects: p.objects }) };
}

const rectInside = (inner, outer) => inner.x >= outer.x && inner.y >= outer.y
  && inner.x + inner.w <= outer.x + outer.w && inner.y + inner.h <= outer.y + outer.h;
const box = (o) => ({ x: o.x, y: o.y, ...objSize(o) });
const areaNamed = (f, name) => {
  const a = f.areas.find((x) => x.name === name);
  assert.ok(a, `no existe el área ${name}`);
  return a;
};
const desksIn = (f, a) => f.state.desks.filter((d) => rectInside(box(d.object), a));
const freeDesksIn = (f, a) => desksIn(f, a).filter((d) => !f.claims[d.id]);
const chairOf = (f, desk) => f.objects.find((o) => CHAIR_TYPES.includes(o.type) && o.deskId == null && rectInside(box(o), desk.zone));

// Casilla libre (sin muro, sin mueble sólido y fuera de cualquier escritorio) dentro de un rectángulo
function freeTile(f, rect, skip = []) {
  for (let y = rect.y; y < rect.y + rect.h; y++) {
    for (let x = rect.x; x < rect.x + rect.w; x++) {
      if (f.state.solid[y][x]) continue;
      if (f.state.desks.some((d) => inRect(d.zone, x, y))) continue;
      if (f.objects.some((o) => inRect(box(o), x, y))) continue;
      if (skip.some((s) => s.x === x && s.y === y)) continue;
      return { x, y };
    }
  }
  assert.fail(`no hay casillas libres en ${JSON.stringify(rect)}`);
}

// Casilla libre fuera de toda área
function tileOutsideAreas(f) {
  for (let y = 0; y < f.state.H; y++) {
    for (let x = 0; x < f.state.W; x++) {
      if (f.state.solid[y][x] || f.areas.some((a) => inRect(a, x, y))) continue;
      if (f.objects.some((o) => inRect(box(o), x, y))) continue;
      return { x, y };
    }
  }
  assert.fail('no hay casillas fuera de las áreas');
}

async function claim(c, desk) {
  const r = await c.post(`/desks/${desk.id}/claim`);
  assert.equal(r.status, 200, JSON.stringify(r.data));
}

describe('escritorios', () => {
  test('un miembro reclama un escritorio libre y otro ya no puede', async () => {
    const a = await createMember(srv.url, admin, 'Fer');
    const b = await createMember(srv.url, admin, 'Gabo');
    let f = await floor(a);
    const [d1, d2] = freeDesksIn(f, areaNamed(f, 'Staff / Orgs'));

    await claim(a, d1);
    f = await floor(a);
    assert.equal(f.claims[d1.id], a.user.id);

    const taken = await b.post(`/desks/${d1.id}/claim`);
    assert.equal(taken.status, 400);

    // Reclamar otro escritorio libera el anterior
    await claim(a, d2);
    f = await floor(a);
    assert.equal(f.claims[d2.id], a.user.id);
    assert.equal(f.claims[d1.id], undefined);

    // Liberar un escritorio ajeno no está permitido
    assert.equal((await b.post(`/desks/${d2.id}/release`)).status, 403);
    assert.equal((await a.post(`/desks/${d2.id}/release`)).status, 200);
    assert.equal((await floor(a)).claims[d2.id], undefined);
  });

  test('reclamar un escritorio que no existe da 404', async () => {
    assert.equal((await admin.post('/desks/999999/claim')).status, 404);
  });
});

describe('decoración del escritorio', () => {
  let owner;
  let other;
  let desk;

  before(async () => {
    owner = await createMember(srv.url, admin, 'Hugo');
    other = await createMember(srv.url, admin, 'Ines');
    const f = await floor();
    const [d1, d2] = freeDesksIn(f, areaNamed(f, 'Staff / Orgs')).slice(-2);
    desk = d1;
    await claim(owner, d1);
    await claim(other, d2);
  });

  test('se puede decorar el propio escritorio', async () => {
    const pos = { x: desk.object.x + 0.25, y: desk.object.y + 0.5 };
    const r = await owner.post(`/floors/${FLOOR}/objects`, { type: 'deskFlag', ...pos });
    assert.equal(r.status, 200, JSON.stringify(r.data));
    const f = await floor();
    const obj = f.objects.find((o) => o.id === r.data.id);
    assert.equal(obj.deskId, desk.id);
    assert.equal(obj.by, owner.user.id);

    // moverla dentro del escritorio sí, fuera no
    assert.equal((await owner.patch(`/objects/${obj.id}`, { x: desk.object.x + 1 })).status, 200);
    assert.equal((await owner.patch(`/objects/${obj.id}`, { x: desk.zone.x + desk.zone.w + 3 })).status, 403);
    // y se puede borrar
    assert.equal((await owner.del(`/objects/${obj.id}`)).status, 200);
  });

  test('no se puede decorar ni tocar el escritorio de otra persona', async () => {
    const put = await owner.post(`/floors/${FLOOR}/objects`, { type: 'deskFlag', x: desk.object.x + 0.5, y: desk.object.y + 0.25 });
    assert.equal(put.status, 200);

    const r = await other.post(`/floors/${FLOOR}/objects`, { type: 'deskFlag', x: desk.object.x + 1.5, y: desk.object.y + 0.25 });
    assert.equal(r.status, 403);
    assert.equal((await other.patch(`/objects/${put.data.id}`, { x: desk.object.x + 1 })).status, 403);
    assert.equal((await other.del(`/objects/${put.data.id}`)).status, 403);
    assert.equal((await other.patch(`/objects/${desk.id}`, { color: '#ffffff' })).status, 403);
    assert.equal((await other.del(`/objects/${desk.id}`)).status, 403);
  });

  test('sin escritorio en el piso no se puede decorar', async () => {
    const nobody = await createMember(srv.url, admin, 'Javi');
    const r = await nobody.post(`/floors/${FLOOR}/objects`, { type: DECOR, x: desk.object.x, y: desk.object.y + 1 });
    assert.equal(r.status, 403);
  });

  test('la propia silla y el propio escritorio no se pueden borrar, pero sí cambiar de modelo', async () => {
    const f = await floor();
    const chair = chairOf(f, desk);
    assert.ok(chair, 'el escritorio debe tener silla');
    const del = await owner.del(`/objects/${chair.id}`);
    assert.equal(del.status, 403);
    assert.equal((await owner.del(`/objects/${desk.id}`)).status, 403);
    assert.ok((await floor()).objects.some((o) => o.id === chair.id), 'la silla sigue ahí');

    const other = CHAIR_TYPES.find((t) => t !== chair.type);
    assert.equal((await owner.patch(`/objects/${chair.id}`, { type: other })).status, 200);
    assert.equal((await owner.patch(`/objects/${desk.id}`, { color: '#123456' })).status, 200);
    // Un escritorio no se puede convertir en otra cosa
    assert.equal((await owner.patch(`/objects/${desk.id}`, { type: 'sofa' })).status, 400);
    const after = await floor();
    assert.equal(after.objects.find((o) => o.id === chair.id).type, other);
    assert.equal(after.objects.find((o) => o.id === desk.id).color, '#123456');
  });

  test('un miembro no puede poner muebles en áreas comunes', async () => {
    const f = await floor();
    const t = freeTile(f, areaNamed(f, 'Lounge'));
    assert.equal((await owner.post(`/floors/${FLOOR}/objects`, { type: FURNITURE, ...t })).status, 403);
  });
});

describe('líderes de departamento', () => {
  let leader;
  let member;
  let area;
  let memberDesk;

  before(async () => {
    leader = await createMember(srv.url, admin, 'Lider');
    member = await createMember(srv.url, admin, 'Miembro');
    const f = await floor();
    area = areaNamed(f, 'Engineering');
    [memberDesk] = freeDesksIn(f, area);
    await claim(member, memberDesk);
  });

  test('solo el admin asigna líderes', async () => {
    assert.equal((await member.put(`/areas/${area.id}/leaders`, { userIds: [member.user.id] })).status, 403);
    const r = await admin.put(`/areas/${area.id}/leaders`, { userIds: [leader.user.id] });
    assert.equal(r.status, 200, JSON.stringify(r.data));
    const f = await floor();
    assert.deepEqual(areaNamed(f, 'Engineering').leaders, [leader.user.id]);
  });

  test('el líder coloca, mueve y borra muebles dentro de su área, no fuera', async () => {
    let f = await floor();
    const t = freeTile(f, area);
    const r = await leader.post(`/floors/${FLOOR}/objects`, { type: FURNITURE, ...t });
    assert.equal(r.status, 200, JSON.stringify(r.data));

    f = await floor();
    const t2 = freeTile(f, area);
    assert.equal((await leader.patch(`/objects/${r.data.id}`, t2)).status, 200);

    const out = tileOutsideAreas(f);
    assert.equal((await leader.post(`/floors/${FLOOR}/objects`, { type: FURNITURE, ...out })).status, 403);
    assert.equal((await leader.patch(`/objects/${r.data.id}`, out)).status, 403);
    const other = freeTile(f, areaNamed(f, 'Marketing'));
    assert.equal((await leader.post(`/floors/${FLOOR}/objects`, { type: FURNITURE, ...other })).status, 403);

    assert.equal((await leader.del(`/objects/${r.data.id}`)).status, 200);
  });

  test('el líder no puede editar el escritorio de otra persona ni poner cosas en él', async () => {
    const f = await floor();
    assert.equal((await leader.patch(`/objects/${memberDesk.id}`, { color: '#ffffff' })).status, 403);
    assert.equal((await leader.del(`/objects/${memberDesk.id}`)).status, 403);
    const chair = chairOf(f, memberDesk);
    assert.equal((await leader.del(`/objects/${chair.id}`)).status, 403);
    const r = await leader.post(`/floors/${FLOOR}/objects`, { type: DECOR, x: memberDesk.object.x, y: memberDesk.object.y + 1 });
    assert.equal(r.status, 403);
  });

  test('sin decoración abierta el miembro no puede decorar el departamento', async () => {
    const f = await floor();
    const t = freeTile(f, area);
    assert.equal((await member.post(`/floors/${FLOOR}/objects`, { type: DECOR, ...t })).status, 403);
  });

  test('solo el líder (o admin) cambia el estilo del área', async () => {
    assert.equal((await member.patch(`/areas/${area.id}/style`, { openDecor: true })).status, 403);
    const r = await leader.patch(`/areas/${area.id}/style`, { color: 'purple', shape: 'round', openDecor: true });
    assert.equal(r.status, 200, JSON.stringify(r.data));
    const a = areaNamed(await floor(), 'Engineering');
    assert.equal(a.openDecor, true);
    assert.equal(a.color, 'purple');
    assert.equal(a.shape, 'round');
    // El líder no puede mover ni renombrar el área desde aquí
    await leader.patch(`/areas/${area.id}/style`, { x: 0, y: 0, name: 'Hackeado' });
    const same = areaNamed(await floor(), 'Engineering');
    assert.equal(same.x, area.x);
    assert.equal(same.y, area.y);
    assert.equal((await leader.patch(`/areas/${area.id}`, { name: 'Hackeado' })).status, 403);
  });

  test('con decoración abierta el miembro pone decoración, pero no muebles, y no la saca del área', async () => {
    let f = await floor();
    const t = freeTile(f, area);
    assert.equal((await member.post(`/floors/${FLOOR}/objects`, { type: FURNITURE, ...t })).status, 403);

    const r = await member.post(`/floors/${FLOOR}/objects`, { type: DECOR, ...t });
    assert.equal(r.status, 200, JSON.stringify(r.data));
    f = await floor();
    const obj = f.objects.find((o) => o.id === r.data.id);
    assert.equal(obj.deskId, null, 'es decoración del departamento, no del escritorio');

    const t2 = freeTile(f, area);
    assert.equal((await member.patch(`/objects/${obj.id}`, t2)).status, 200);
    const out = tileOutsideAreas(f);
    assert.equal((await member.patch(`/objects/${obj.id}`, out)).status, 403);
    const inOther = freeTile(f, areaNamed(f, 'Marketing'));
    assert.equal((await member.patch(`/objects/${obj.id}`, inOther)).status, 403);
    assert.equal((await member.post(`/floors/${FLOOR}/objects`, { type: DECOR, ...out })).status, 403);
  });

  test('el miembro no puede tocar lo que puso el líder ni lo de otros miembros', async () => {
    let f = await floor();
    const t = freeTile(f, area);
    const byLeader = await leader.post(`/floors/${FLOOR}/objects`, { type: DECOR, ...t });
    assert.equal(byLeader.status, 200);
    f = await floor();
    const t2 = freeTile(f, area);
    assert.equal((await member.patch(`/objects/${byLeader.data.id}`, t2)).status, 403);
    assert.equal((await member.del(`/objects/${byLeader.data.id}`)).status, 403);

    // un miembro de otro departamento tampoco
    const outsider = await createMember(srv.url, admin, 'Fuera');
    const [d] = freeDesksIn(f, areaNamed(f, 'Marketing'));
    await claim(outsider, d);
    assert.equal((await outsider.post(`/floors/${FLOOR}/objects`, { type: DECOR, ...t2 })).status, 403);
    assert.equal((await outsider.del(`/objects/${byLeader.data.id}`)).status, 403);
  });

  test('al cerrar la decoración abierta el miembro ya no puede decorar', async () => {
    assert.equal((await leader.patch(`/areas/${area.id}/style`, { openDecor: false })).status, 200);
    const f = await floor();
    const t = freeTile(f, area);
    assert.equal((await member.post(`/floors/${FLOOR}/objects`, { type: DECOR, ...t })).status, 403);
  });

  test('al quitarle el liderazgo pierde los permisos', async () => {
    assert.equal((await admin.put(`/areas/${area.id}/leaders`, { userIds: [] })).status, 200);
    const f = await floor();
    const t = freeTile(f, area);
    assert.equal((await leader.post(`/floors/${FLOOR}/objects`, { type: FURNITURE, ...t })).status, 403);
    assert.equal((await leader.patch(`/areas/${area.id}/style`, { openDecor: true })).status, 403);
  });
});

describe('admin', () => {
  test('el admin coloca muebles en cualquier lugar libre pero no sobre muros ni encimados', async () => {
    const f = await floor();
    const t = tileOutsideAreas(f);
    const r = await admin.post(`/floors/${FLOOR}/objects`, { type: FURNITURE, ...t });
    assert.equal(r.status, 200, JSON.stringify(r.data));
    assert.equal((await admin.post(`/floors/${FLOOR}/objects`, { type: FURNITURE, ...t })).status, 400, 'encimado');
    let wall = null;
    for (let y = 0; y < f.state.H && !wall; y++) for (let x = 0; x < f.state.W && !wall; x++) if (f.state.walls[y][x] === true) wall = { x, y };
    assert.equal((await admin.post(`/floors/${FLOOR}/objects`, { type: FURNITURE, ...wall })).status, 400, 'sobre muro');
    assert.equal((await admin.post(`/floors/${FLOOR}/objects`, { type: FURNITURE, x: -5, y: 0 })).status, 400, 'fuera del mapa');
    assert.equal((await admin.post(`/floors/${FLOOR}/objects`, { type: 'noExiste', ...t })).status, 400);
    assert.equal((await admin.del(`/objects/${r.data.id}`)).status, 200);
  });

  test('los tipos usados son del catálogo', () => {
    assert.equal(CATALOG[DECOR].kind, 'decor');
    assert.equal(CATALOG[FURNITURE].kind, 'furniture');
    assert.equal(CATALOG[FURNITURE].solid, true);
  });
});
