// Amigo secreto: sorteo sin repetir, exclusiones, privacidad de asignaciones y revelación.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startServer, adminClient, createMember } from './helpers/server.js';
import { drawPairs, validPairs, chains } from '../shared/santa.js';

let srv;
before(async () => { srv = await startServer(); });
after(async () => { await srv?.stop(); });

test('sorteo: nadie se regala a sí mismo y se respetan exclusiones', () => {
  for (let n = 2; n <= 12; n++) {
    const ids = Array.from({ length: n }, (_, i) => i + 1);
    for (let k = 0; k < 30; k++) {
      const p = drawPairs(ids);
      assert.ok(validPairs(p, ids), `reparto inválido con ${n}`);
    }
  }
  const ids = [1, 2, 3, 4, 5, 6];
  const ex = [[1, 2], [3, 4], [5, 6], [1, 3]];
  for (let k = 0; k < 50; k++) {
    const p = drawPairs(ids, ex);
    assert.ok(validPairs(p, ids, ex));
    for (const [a, b] of ex) { assert.notEqual(p[a], b); assert.notEqual(p[b], a); }
  }
  // Sin una sola cadena posible pero con reparto válido: dos parejas que se excluyen en cruz
  const cross = [[1, 3], [1, 4], [2, 3], [2, 4]];
  const p4 = drawPairs([1, 2, 3, 4], cross);
  assert.ok(p4 && validPairs(p4, [1, 2, 3, 4], cross));
  // Imposible: falla con null
  assert.equal(drawPairs([1, 2, 3], [[1, 2], [1, 3]]), null);
  assert.equal(drawPairs([1]), null);
  // Las cadenas cubren a todos
  assert.equal(chains(drawPairs([1, 2, 3, 4, 5])).flat().length, 5);
});

test('amigo secreto: inscripción, sorteo privado, mensajes anónimos y revelación', async () => {
  const admin = await adminClient(srv.url);
  const ana = await createMember(srv.url, admin, 'Ana');
  const beto = await createMember(srv.url, admin, 'Beto');
  const caro = await createMember(srv.url, admin, 'Caro');
  const dani = await createMember(srv.url, admin, 'Dani');

  assert.equal((await ana.get('/santa')).data.exchange, null);
  assert.equal((await ana.post('/santa/join', {})).status, 404);
  // Solo el admin crea el intercambio
  assert.equal((await ana.post('/santa', { name: 'X' })).status, 403);
  const created = await admin.post('/santa', { name: 'Intercambio GTAHUB', budget: '$300 MXN', revealAt: Date.now() + 86400e3 });
  assert.equal(created.status, 200);
  assert.equal(created.data.exchange.name, 'Intercambio GTAHUB');
  assert.equal((await admin.post('/santa', { name: 'Otro' })).status, 409);

  // Participar con lista de deseos; editarla; salirse y volver
  const j = await ana.post('/santa/join', { wishlist: 'Una taza de GTAHUB' });
  assert.equal(j.status, 200);
  assert.equal(j.data.me.joined, true);
  assert.equal((await ana.post('/santa/join', {})).status, 409);
  assert.equal((await ana.patch('/santa/wishlist', { wishlist: 'Taza y stickers' })).data.me.wishlist, 'Taza y stickers');
  await beto.post('/santa/join', { wishlist: 'Audífonos' });
  assert.equal((await beto.post('/santa/leave')).data.me.joined, false);
  await beto.post('/santa/join', { wishlist: 'Audífonos' });

  // Con 2 no alcanza para sortear
  assert.match((await admin.post('/santa/draw')).data.error, /al menos 3/);
  await caro.post('/santa/join', { wishlist: 'Libro' });
  await dani.post('/santa/join', { wishlist: 'Chocolates' });
  // Los miembros no ven las exclusiones; el admin sí
  await admin.patch('/santa', { exclusions: [[ana.user.id, beto.user.id]] });
  assert.equal((await ana.get('/santa')).data.exchange.exclusions, undefined);
  assert.deepEqual((await admin.get('/santa')).data.exchange.exclusions, [[ana.user.id, beto.user.id]]);
  // Antes del sorteo nadie tiene asignado y el admin no puede ver asignaciones
  assert.equal((await ana.get('/santa')).data.giftee, undefined);
  assert.equal((await admin.post('/santa/peek')).status, 400);
  assert.equal((await ana.post('/santa/draw')).status, 403);

  const d = await admin.post('/santa/draw');
  assert.equal(d.status, 200);
  assert.equal(d.data.exchange.status, 'drawn');
  assert.equal(d.data.giftee, undefined); // el admin no participa: no ve nada
  assert.equal(d.data.pairs, undefined);

  // Cada quien ve SOLO a su persona y su lista
  const people = { [ana.user.id]: ana, [beto.user.id]: beto, [caro.user.id]: caro, [dani.user.id]: dani };
  const wish = { [ana.user.id]: 'Taza y stickers', [beto.user.id]: 'Audífonos', [caro.user.id]: 'Libro', [dani.user.id]: 'Chocolates' };
  const got = {};
  for (const [id, c] of Object.entries(people)) {
    const s = (await c.get('/santa')).data;
    assert.ok(s.giftee);
    assert.notEqual(s.giftee.userId, Number(id));
    assert.equal(s.giftee.wishlist, wish[s.giftee.userId]);
    assert.equal(s.pairs, undefined);
    assert.equal(s.chains, undefined);
    got[id] = s.giftee.userId;
  }
  assert.ok(validPairs(got, Object.keys(people).map(Number), [[ana.user.id, beto.user.id]]));
  assert.notEqual(got[ana.user.id], beto.user.id);
  assert.notEqual(got[beto.user.id], ana.user.id);
  // Aviso privado del sorteo
  const notes = (await ana.get('/notifications')).data.notifications.filter((n) => n.type === 'santa');
  assert.equal(notes.length, 1);
  assert.equal(notes[0].data.kind, 'drawn');

  // Después del sorteo ya no se entra, sale ni cambia la lista
  const eva = await createMember(srv.url, admin, 'Eva');
  assert.equal((await eva.post('/santa/join', {})).status, 400);
  assert.equal((await ana.post('/santa/leave')).status, 400);
  assert.equal((await ana.patch('/santa/wishlist', { wishlist: 'x' })).status, 400);
  assert.equal((await eva.post('/santa/messages', { body: 'hola' })).status, 400);

  // Mensaje anónimo a mi amigo secreto y respuesta a mi santa
  const giftee = people[got[ana.user.id]];
  assert.equal((await ana.post('/santa/messages', { to: 'giftee', body: 'Jo jo jo 🎅' })).status, 200);
  const gs = (await giftee.get('/santa')).data;
  assert.equal(gs.fromSanta.length, 1);
  assert.equal(gs.fromSanta[0].body, 'Jo jo jo 🎅');
  assert.equal(gs.fromSanta[0].mine, false);
  const n = (await giftee.get('/notifications')).data.notifications.find((x) => x.type === 'santa' && x.data.kind === 'message');
  assert.equal(n.actorId, null); // anónimo
  await giftee.post('/santa/messages', { to: 'santa', body: '¡Gracias!' });
  const as = (await ana.get('/santa')).data;
  assert.deepEqual(as.toGiftee.map((m) => [m.mine, m.body]), [[true, 'Jo jo jo 🎅'], [false, '¡Gracias!']]);

  // El admin puede ver asignaciones solo pidiéndolo, y queda registrado
  const peek = await admin.post('/santa/peek');
  assert.equal(peek.status, 200);
  assert.equal(peek.data.pairs.length, 4);
  const audit = (await admin.get('/admin/audit?q=asignaciones')).data.entries;
  assert.ok(audit.some((e) => /Vio las asignaciones/.test(e.action)));

  // Revelar: todos ven la cadena completa
  assert.equal((await ana.post('/santa/reveal')).status, 403);
  const rv = await admin.post('/santa/reveal');
  assert.equal(rv.data.exchange.status, 'revealed');
  const pub = (await eva.get('/santa')).data;
  assert.equal(pub.pairs.length, 4);
  assert.equal(pub.chains.flat().length, 4);
  for (const p of pub.pairs) assert.equal(got[p.from], p.to);

  // Terminado: se puede crear uno nuevo
  assert.equal((await admin.post('/santa', { name: 'Navidad 2027' })).status, 200);
  assert.equal((await admin.del('/santa')).status, 200);
});

test('amigo secreto: cierre de inscripción y sorteo automático en su fecha', async () => {
  const admin = await adminClient(srv.url);
  while ((await admin.get('/santa')).data.exchange) await admin.del('/santa');
  const a = await createMember(srv.url, admin, 'Fer');
  const b = await createMember(srv.url, admin, 'Gabi');
  const c = await createMember(srv.url, admin, 'Hugo');
  await admin.post('/santa', { name: 'Auto', drawAt: Date.now() + 1500 });
  for (const x of [a, b, c]) assert.equal((await x.post('/santa/join', { wishlist: 'algo' })).status, 200);
  await new Promise((r) => setTimeout(r, 1700));
  const s = (await a.get('/santa')).data;
  assert.equal(s.exchange.status, 'drawn');
  assert.ok(s.giftee);
  await admin.del('/santa');
  // Inscripción cerrada
  await admin.post('/santa', { name: 'Cerrado', signupUntil: Date.now() - 1000 });
  assert.equal((await a.get('/santa')).data.canJoin, false);
  assert.equal((await a.post('/santa/join', {})).status, 400);
  assert.equal((await admin.patch('/santa', { drawAt: 'mañana' })).status, 400);
  await admin.del('/santa');
});
