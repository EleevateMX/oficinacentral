// Hotel — Parte 2, agente A (economía): monedero, premios (reloj falso), compras, fondos insuficientes,
// intercambio seguro (re-aceptar y atomicidad), regalos, códigos y monedas canjeables.
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { io } from 'socket.io-client';
import { startServer, adminClient, createMember } from './helpers/server.js';
import { FURNI_BY_ID, HOTEL_FURNI } from '../shared/hotelCatalog.js';
import * as E from '../shared/hotelEconomy.js';

// ---------- Reglas puras ----------
describe('reglas de la economía', () => {
  test('precios: todo lo que se vende tiene precio y los exclusivos solo para admins (gratis)', () => {
    for (const d of HOTEL_FURNI) {
      const p = E.priceOf(d);
      assert.ok(Number.isInteger(p) && p >= 0, `${d.id}: ${p}`);
      if (E.inShop(d) && !d.exclusive) assert.ok(p > 0, `${d.id} sin precio`);
    }
    assert.equal(E.priceOf(FURNI_BY_ID.chair_basic), 8);
    assert.equal(E.priceOf(FURNI_BY_ID.economia_lingote), 100);
    assert.equal(E.coinValue(FURNI_BY_ID.economia_moneda), 10);
    assert.equal(E.coinValue(FURNI_BY_ID.chair_basic), 0);
    assert.deepEqual(E.quote(FURNI_BY_ID.chair_basic, 3), { qty: 3, unit: 8, total: 24, items: 3 });
    assert.equal(E.quote(FURNI_BY_ID.teleport, 2).items, 4);
    assert.ok(E.quote(FURNI_BY_ID.throne, 1).error);
    assert.equal(E.quote(FURNI_BY_ID.throne, 1, { admin: true }).total, 0);
    assert.ok(E.quote(FURNI_BY_ID.chair_basic, 0).error);
    assert.ok(E.quote(FURNI_BY_ID.chair_basic, E.MAX_BUY_QTY + 1).error);
    assert.ok(E.quote(FURNI_BY_ID[E.PRESENT_TYPE], 1).error, 'la caja de regalo no se vende suelta');
  });

  test('premio diario: una vez por día de oficina (reloj falso, zona de la oficina)', () => {
    const tz = 'America/Mexico_City';
    const t0 = Date.UTC(2026, 9, 29, 15, 0); // 9:00 en CDMX
    assert.equal(E.dailyDue(null, t0, tz), true);
    const day = E.officeDay(t0, tz);
    assert.equal(day, '2026-10-29');
    assert.equal(E.dailyDue(day, t0 + 8 * 3600e3, tz), false, 'mismo día (23:00 CDMX)');
    assert.equal(E.dailyDue(day, Date.UTC(2026, 9, 30, 5, 59), tz), false, '23:59 CDMX sigue siendo el mismo día');
    assert.equal(E.dailyDue(day, Date.UTC(2026, 9, 30, 6, 1), tz), true, 'pasó la medianoche de CDMX');
  });

  test('tiempo en el Hotel: +1 pago cada 15 min, sin regalar pausas largas (reloj falso)', () => {
    let s = null, paid = 0;
    const t0 = 1_000_000;
    for (let m = 0; m <= 45; m++) { const r = E.accrueOnline(s, t0 + m * 60e3); s = r.state; paid += r.pay; }
    assert.equal(paid, 3);
    // Una pausa de 2 horas cuenta como máximo 5 minutos
    const r = E.accrueOnline(s, t0 + 45 * 60e3 + 2 * 3600e3);
    assert.equal(r.pay, 0);
    assert.equal(r.state.acc, 5 * 60e3);
    // Salir y volver (last = null) no cuenta el tiempo de afuera
    assert.equal(E.accrueOnline({ last: null, acc: 0 }, t0).state.acc, 0);
  });

  test('intercambio: aceptar los dos → confirmar; cualquier cambio obliga a aceptar otra vez', () => {
    const T = E.newTrade(1, 2);
    assert.ok(E.tradeAccept(T, 1).error, 'vacío no se acepta');
    E.tradeSetOffer(T, 1, { items: [10, 11] });
    E.tradeSetOffer(T, 2, { credits: 30 });
    assert.equal(E.tradeAccept(T, 1).phase, 'offer');
    assert.ok(E.tradeConfirm(T, 1).error, 'no se confirma sin que acepten los dos');
    // Cambio: se pierden los "Aceptar"
    E.tradeSetOffer(T, 2, { credits: 25 });
    assert.equal(T.accepted[1], false);
    assert.equal(E.tradeAccept(T, 2).phase, 'offer');
    assert.equal(E.tradeAccept(T, 1).phase, 'confirm');
    assert.ok(E.tradeAccept(T, 1, false).error, 'en confirmación ya no se quita el aceptar: se cambia la oferta o se cancela');
    // Cambio en la confirmación: regresa a ofertar
    const v = T.v;
    E.tradeSetOffer(T, 1, { items: [10] });
    assert.equal(T.phase, 'offer');
    assert.ok(T.v > v);
    E.tradeAccept(T, 1); E.tradeAccept(T, 2);
    assert.equal(E.tradeConfirm(T, 1).phase, 'confirm');
    assert.equal(E.tradeConfirm(T, 2).phase, 'done');
    // Repetir lo mismo no cambia nada; un tercero no puede tocarlo
    const T2 = E.newTrade(1, 2);
    E.tradeSetOffer(T2, 1, { items: [5] }); E.tradeAccept(T2, 1);
    assert.equal(E.tradeSetOffer(T2, 1, { items: [5] }).changed, false);
    assert.equal(T2.accepted[1], true);
    assert.ok(E.tradeSetOffer(T2, 3, { items: [1] }).error);
    assert.ok(E.tradeSetOffer(T2, 1, { items: Array.from({ length: 21 }, (_, i) => i + 1) }).error);
    assert.ok(E.tradeSetOffer(T2, 1, { credits: -5 }).error);
  });
});

// ---------- Servidor ----------
let srv;
before(async () => { srv = await startServer({ env: { HOTEL_TRADE_SWEEP_MS: '60000' } }); });
after(async () => { await srv?.stop(); });

const connect = (c, url = srv.url) => new Promise((resolve, reject) => {
  const s = io(url, { extraHeaders: { cookie: [...c.cookies].map(([k, v]) => `${k}=${v}`).join('; ') }, transports: ['websocket'] });
  s.on('hello', () => resolve(s));
  s.on('connect_error', reject);
});
const once = (s, ev, pred = () => true, ms = 4000) => new Promise((resolve, reject) => {
  const t = setTimeout(() => { s.off(ev, f); reject(new Error(`timeout esperando ${ev}`)); }, ms);
  const f = (m) => { if (pred(m)) { clearTimeout(t); s.off(ev, f); resolve(m); } };
  s.on(ev, f);
});
const enter = async (s, roomId) => { const p = once(s, 'hotel:room'); s.emit('hotel:enter', { roomId }); return p; };
const credits = async (c) => (await c.get('/hotel/wallet')).data.credits;
const owner = async (c, itemId) => (await c.get('/hotel/inventory')).data.items.some((i) => i.id === itemId);

test('monedero: bienvenida 500 + premio diario 50, una sola vez', async () => {
  const admin = await adminClient(srv.url);
  const m = await createMember(srv.url, admin, 'Cartera');
  const w = (await m.get('/hotel/wallet')).data;
  assert.equal(w.credits, E.START_CREDITS + E.DAILY_CREDITS);
  assert.equal(w.daily, E.DAILY_CREDITS);
  assert.deepEqual(w.log.map((x) => x.reason).sort(), ['daily', 'start']);
  const w2 = (await m.get('/hotel/wallet')).data;
  assert.equal(w2.credits, 550);
  assert.equal(w2.daily, 0);
});

test('tienda: comprar N, exclusivos, fondos insuficientes y límites', async () => {
  const admin = await adminClient(srv.url);
  const m = await createMember(srv.url, admin, 'Compras');
  assert.equal(await credits(m), 550);
  const r = await m.post('/hotel/buy', { type: 'chair_basic', qty: 3, color: '#2b2b2f' });
  assert.equal(r.status, 200);
  assert.equal(r.data.items.length, 3);
  assert.ok(r.data.items.every((i) => i.color === '#2b2b2f'));
  assert.equal(r.data.spent, 24);
  assert.equal(r.data.credits, 526);
  // Teletransportador: 2 en par = 4 furnis, 60 créditos
  const tp = await m.post('/hotel/buy', { type: 'teleport', qty: 2 });
  assert.equal(tp.data.items.length, 4);
  assert.equal(tp.data.credits, 466);
  // Fondos insuficientes (cofre = 500): mensaje amable y nada cambia
  const inv0 = (await m.get('/hotel/inventory')).data.items.length;
  const no = await m.post('/hotel/buy', { type: 'economia_cofre' });
  assert.equal(no.status, 402);
  assert.match(no.data.error, /Te faltan 34 créditos HUB/);
  assert.equal(await credits(m), 466);
  assert.equal((await m.get('/hotel/inventory')).data.items.length, inv0);
  // Cantidad inválida, exclusivo y regalo suelto
  assert.equal((await m.post('/hotel/buy', { type: 'chair_basic', qty: 21 })).status, 400);
  assert.equal((await m.post('/hotel/buy', { type: 'throne' })).status, 403);
  assert.equal((await m.post('/hotel/buy', { type: E.PRESENT_TYPE })).status, 400);
  assert.equal((await m.post('/hotel/buy', { type: 'nope' })).status, 400);
  // Admin: el exclusivo no le cuesta; lo normal sí
  const a0 = await credits(admin);
  assert.equal((await admin.post('/hotel/buy', { type: 'hub_dragon' })).data.spent, 0);
  assert.equal((await admin.post('/hotel/buy', { type: 'plant_small' })).data.spent, 5);
  assert.equal(await credits(admin), a0 - 5);
});

test('admin: dar y quitar créditos (con bitácora); un miembro no puede', async () => {
  const admin = await adminClient(srv.url);
  const m = await createMember(srv.url, admin, 'Premiada');
  const uid = m.user.id;
  assert.equal(await credits(m), 550);
  assert.equal((await m.post('/hotel/admin/credits', { userId: uid, delta: 1000 })).status, 403);
  assert.equal((await m.get('/hotel/admin/vouchers')).status, 403);
  const g = await admin.post('/hotel/admin/credits', { userId: uid, delta: 250, note: 'Ganó el evento' });
  assert.equal(g.data.credits, 800);
  const q = await admin.post('/hotel/admin/credits', { userId: uid, delta: -100 });
  assert.equal(q.data.credits, 700);
  assert.equal((await admin.post('/hotel/admin/credits', { userId: uid, delta: -5000 })).status, 402, 'no queda negativo');
  assert.equal((await admin.post('/hotel/admin/credits', { userId: uid, delta: 0 })).status, 400);
  assert.equal(await credits(m), 700);
  const audit = (await admin.get('/admin/audit?q=créditos HUB')).data.entries;
  assert.ok(audit.some((e) => /Dio 250 créditos HUB a Premiada/.test(e.action)));
  assert.ok(audit.some((e) => /Quitó 100 créditos HUB a Premiada/.test(e.action)));
  const list = (await admin.get('/hotel/admin/wallets?q=Premiada')).data.users;
  assert.equal(list[0].credits, 700);
  const log = (await admin.get(`/hotel/admin/wallets/${uid}`)).data.log;
  assert.equal(log[0].reason, 'admin');
});

test('monedas: se compran, se canjean desde el inventario y en la sala (doble clic)', async () => {
  const admin = await adminClient(srv.url);
  const m = await createMember(srv.url, admin, 'Monedas');
  const [coin] = (await m.post('/hotel/buy', { type: 'economia_moneda', qty: 2 })).data.items;
  const [bar] = (await m.post('/hotel/buy', { type: 'economia_lingote' })).data.items;
  assert.equal(await credits(m), 550 - 20 - 100);
  // Desde el inventario: una
  const r = await m.post('/hotel/coins/redeem', { itemIds: [coin.id] });
  assert.equal(r.data.amount, 10);
  assert.equal(r.data.credits, 440);
  assert.equal(await owner(m, coin.id), false);
  // En la sala: el lingote desaparece y da 100
  const room = (await m.post('/hotel/rooms', { name: 'Banco', model: 'b' })).data.room;
  const s = await connect(m);
  try {
    await enter(s, room.id);
    const placed = once(s, 'hotel:item', (x) => x.op === 'add');
    s.emit('hotel:place', { itemId: bar.id, x: 3, y: 3, rot: 0 });
    await placed;
    const gone = once(s, 'hotel:item', (x) => x.op === 'remove' && x.id === bar.id);
    const wallet = once(s, 'hotel:wallet', (x) => x.reason === 'coin');
    s.emit('hotel:use', { itemId: bar.id });
    await gone;
    assert.equal((await wallet).credits, 540);
  } finally { s.close(); }
  // La otra moneda: todas de un jalón
  const all = await m.post('/hotel/coins/redeem', {});
  assert.equal(all.data.amount, 10);
  assert.equal((await m.post('/hotel/coins/redeem', {})).status, 400);
  assert.equal(await credits(m), 550);
});

test('regalos: se compran para alguien con mensaje, llegan en caja y se abren en la sala', async () => {
  const admin = await adminClient(srv.url);
  const a = await createMember(srv.url, admin, 'Regala');
  const b = await createMember(srv.url, admin, 'Recibe');
  await b.get('/hotel/inventory');
  assert.equal((await a.post('/hotel/buy', { type: 'sofa_2', gift: { userId: a.user.id } })).status, 400, 'a ti no');
  const g = await a.post('/hotel/buy', { type: 'sofa_2', color: '#3a86ff', gift: { userId: b.user.id, message: '¡Feliz cumple! 🎂', wrap: '#FFCC00' } });
  assert.equal(g.status, 200);
  assert.equal(g.data.spent, E.priceOf(FURNI_BY_ID.sofa_2));
  const box = (await b.get('/hotel/inventory')).data.items.find((i) => i.type === E.PRESENT_TYPE);
  assert.ok(box, 'la caja llegó');
  assert.equal(box.color, '#FFCC00');
  assert.equal(JSON.stringify(box.extra).includes('sofa'), false, 'el contenido no se ve antes de abrir');
  const notif = (await b.get('/notifications')).data;
  assert.ok(JSON.stringify(notif).includes('regalo'));
  const room = (await b.post('/hotel/rooms', { name: 'Fiesta', model: 'b' })).data.room;
  const sb = await connect(b), sa = await connect(a);
  try {
    await enter(sb, room.id);
    await enter(sa, room.id);
    const placed = once(sb, 'hotel:item', (x) => x.op === 'add' && x.item.id === box.id);
    sb.emit('hotel:place', { itemId: box.id, x: 4, y: 4, rot: 0 });
    await placed;
    // Alguien más no lo puede abrir
    const no = once(sa, 'hotel:notice', (x) => x.error);
    sa.emit('hotel:use', { itemId: box.id });
    assert.match((await no).text, /no es tuyo/);
    const open = once(sb, 'hotel:present:open', (x) => x.mine);
    const seen = once(sa, 'hotel:present:open');
    const appear = once(sa, 'hotel:item', (x) => x.op === 'add' && x.item.type === 'sofa_2');
    sb.emit('hotel:use', { itemId: box.id });
    const o = await open;
    assert.equal(o.type, 'sofa_2');
    assert.equal(o.message, '¡Feliz cumple! 🎂');
    assert.equal(o.fromName, 'Regala');
    assert.ok(o.placedId, 'el sofá queda donde estaba la caja');
    const other = await seen;
    assert.equal(other.message, undefined, 'el mensaje solo lo ve quien abre');
    const it = (await appear).item;
    assert.equal(it.color, '#3a86ff');
    assert.equal(it.ownerId, b.user.id);
  } finally { sa.close(); sb.close(); }
});

test('códigos: créditos o furni, usos, vigencia y una vez por persona', async () => {
  const admin = await adminClient(srv.url);
  const m1 = await createMember(srv.url, admin, 'Codigo1');
  const m2 = await createMember(srv.url, admin, 'Codigo2');
  assert.equal((await m1.post('/hotel/admin/vouchers', { credits: 100 })).status, 403);
  const v = (await admin.post('/hotel/admin/vouchers', { code: 'bienvenida-hub', credits: 75, maxUses: 1 })).data.voucher;
  assert.equal(v.code, 'BIENVENIDA-HUB');
  assert.equal((await admin.post('/hotel/admin/vouchers', { code: 'BIENVENIDA-HUB', credits: 5 })).status, 409);
  assert.equal((await admin.post('/hotel/admin/vouchers', { code: 'X1' , credits: 5 })).status, 400);
  assert.equal((await admin.post('/hotel/admin/vouchers', {})).status, 400, 'tiene que dar algo');
  await m1.get('/hotel/wallet'); await m2.get('/hotel/wallet');
  const r = await m1.post('/hotel/vouchers/redeem', { code: ' bienvenida-hub ' });
  assert.equal(r.status, 200);
  assert.equal(r.data.balance, 625);
  assert.match((await m1.post('/hotel/vouchers/redeem', { code: 'BIENVENIDA-HUB' })).data.error, /usó todas|Ya canjeaste/);
  assert.match((await m2.post('/hotel/vouchers/redeem', { code: 'BIENVENIDA-HUB' })).data.error, /todas las veces/);
  assert.equal((await m2.post('/hotel/vouchers/redeem', { code: 'NO-EXISTE' })).status, 404);
  // Furni + varios usos
  const f = (await admin.post('/hotel/admin/vouchers', { furni: 'hub_flag', maxUses: 5 })).data.voucher;
  assert.match(f.code, /^HUB-[A-Z0-9]{8}$/);
  const got = await m2.post('/hotel/vouchers/redeem', { code: f.code });
  assert.equal(got.data.items[0].type, 'hub_flag');
  assert.equal((await m2.post('/hotel/vouchers/redeem', { code: f.code })).data.error, 'Ya canjeaste ese código');
  // Vencido
  await admin.post('/hotel/admin/vouchers', { code: 'VIEJO-1', credits: 10, expiresAt: Date.now() - 1000 });
  assert.equal((await m1.post('/hotel/vouchers/redeem', { code: 'VIEJO-1' })).data.error, 'Ese código ya expiró');
  assert.ok((await admin.get('/hotel/admin/vouchers')).data.vouchers.some((x) => x.code === 'VIEJO-1'));
  assert.equal((await admin.del('/hotel/admin/vouchers/VIEJO-1')).status, 200);
  assert.ok((await admin.get('/admin/audit?q=código del Hotel')).data.entries.length >= 3);
});

test('intercambio seguro: misma sala, re-aceptar tras cambios, confirmar, atómico y cancelar', async () => {
  const admin = await adminClient(srv.url);
  const a = await createMember(srv.url, admin, 'TruequeA');
  const b = await createMember(srv.url, admin, 'TruequeB');
  const c = await createMember(srv.url, admin, 'TruequeC');
  const [a1] = (await a.post('/hotel/buy', { type: 'lamp_lava' })).data.items;
  const [b1] = (await b.post('/hotel/buy', { type: 'cactus' })).data.items;
  const [b2] = (await b.post('/hotel/buy', { type: 'economia_moneda' })).data.items;
  await c.get('/hotel/wallet');
  const room = (await a.post('/hotel/rooms', { name: 'Mercado', model: 'b' })).data.room;
  const other = (await c.post('/hotel/rooms', { name: 'Lejos', model: 'a' })).data.room;
  const [sa, sb, sc] = await Promise.all([connect(a), connect(b), connect(c)]);
  const last = (s) => { const box = { v: null }; s.on('hotel:trade', (m) => { box.v = m; }); return box; };
  try {
    await enter(sa, room.id); await enter(sb, room.id); await enter(sc, other.id);
    // Con alguien de otra sala no se puede
    const far = once(sa, 'hotel:notice', (x) => x.error);
    sa.emit('hotel:trade:request', { userId: c.user.id });
    assert.match((await far).text, /misma sala/);
    // Pedir y aceptar
    const inv = once(sb, 'hotel:trade:invite');
    sa.emit('hotel:trade:request', { userId: b.user.id });
    assert.equal((await inv).from, a.user.id);
    const ta = last(sa), tb = last(sb);
    const open = once(sa, 'hotel:trade');
    sb.emit('hotel:trade:answer', { from: a.user.id, accept: true });
    assert.equal((await open).other.id, b.user.id);
    // Ofertas
    sa.emit('hotel:trade:offer', { items: [a1.id] });
    await once(sb, 'hotel:trade', (m) => m.theirs.items.length === 1);
    // No se ofrece lo que no es tuyo
    const notMine = once(sb, 'hotel:notice', (x) => x.error);
    sb.emit('hotel:trade:offer', { items: [a1.id] });
    assert.match((await notMine).text, /no está en tu inventario/);
    sb.emit('hotel:trade:offer', { items: [b1.id], credits: 20 });
    await once(sa, 'hotel:trade', (m) => m.theirs.credits === 20);
    sa.emit('hotel:trade:accept', { on: true });
    await once(sb, 'hotel:trade', (m) => m.accepted.theirs);
    // B cambia su oferta: A pierde su "Aceptar"
    sb.emit('hotel:trade:offer', { credits: 15 });
    const reset = await once(sa, 'hotel:trade', (m) => m.theirs.credits === 15);
    assert.equal(reset.accepted.mine, false);
    assert.equal(reset.phase, 'offer');
    // Confirmar antes de tiempo no sirve
    const early = once(sa, 'hotel:notice', (x) => x.error);
    sa.emit('hotel:trade:confirm', {});
    assert.match((await early).text, /aceptar los dos/);
    sa.emit('hotel:trade:accept', { on: true });
    sb.emit('hotel:trade:accept', { on: true });
    const conf = await once(sa, 'hotel:trade', (m) => m.phase === 'confirm');
    const ea = once(sa, 'hotel:trade:end'), eb = once(sb, 'hotel:trade:end');
    sa.emit('hotel:trade:confirm', { v: conf.v });
    await once(sb, 'hotel:trade', (m) => m.confirmed.theirs);
    sb.emit('hotel:trade:confirm', { v: tb.v.v });
    const [enda] = await Promise.all([ea, eb]);
    assert.equal(enda.ok, true);
    assert.equal(enda.received.items[0], 'cactus');
    assert.equal(await owner(a, b1.id), true);
    assert.equal(await owner(b, a1.id), true);
    assert.equal(await owner(b, b1.id), false);
    assert.equal(await credits(a), 550 - E.priceOf(FURNI_BY_ID.lamp_lava) + 15);
    assert.equal(await credits(b), 550 - E.priceOf(FURNI_BY_ID.cactus) - 10 - 15);

    // Atomicidad: B canjea su moneda ofrecida justo antes de confirmar → no pasa NADA
    const aBefore = await credits(a), bBefore = await credits(b);
    sa.emit('hotel:trade:request', { userId: b.user.id });
    await once(sb, 'hotel:trade:invite');
    sb.emit('hotel:trade:answer', { from: a.user.id, accept: true });
    await once(sa, 'hotel:trade');
    sa.emit('hotel:trade:offer', { items: [b1.id], credits: 5 });
    sb.emit('hotel:trade:offer', { items: [b2.id, a1.id] });
    await once(sa, 'hotel:trade', (m) => m.theirs.items.length === 2 && m.mine.items.length === 1);
    sa.emit('hotel:trade:accept', {}); sb.emit('hotel:trade:accept', {});
    await once(sb, 'hotel:trade', (m) => m.phase === 'confirm');
    assert.equal((await b.post('/hotel/coins/redeem', { itemIds: [b2.id] })).data.amount, 10);
    const failA = once(sa, 'hotel:notice', (x) => x.error && /ya no está disponible/.test(x.text));
    const endA = once(sa, 'hotel:trade:end');
    sa.emit('hotel:trade:confirm', {});
    await once(sb, 'hotel:trade', (m) => m.confirmed.theirs);
    sb.emit('hotel:trade:confirm', {});
    await failA;
    assert.equal((await endA).ok, false);
    assert.equal(await owner(a, b1.id), true, 'el cactus sigue con A');
    assert.equal(await owner(b, a1.id), true, 'la lámpara sigue con B');
    assert.equal(await credits(a), aBefore, 'los créditos de A no se movieron');
    assert.equal(await credits(b), bBefore + 10, 'solo el canje de la moneda');

    // Cancelar
    sb.emit('hotel:trade:request', { userId: a.user.id });
    await once(sa, 'hotel:trade:invite');
    sa.emit('hotel:trade:answer', { from: b.user.id, accept: true });
    await once(sb, 'hotel:trade');
    const cancel = once(sa, 'hotel:trade:end');
    sb.emit('hotel:trade:cancel');
    const cc = await cancel;
    assert.equal(cc.reason, 'cancel');
    assert.equal(cc.by, b.user.id);
    // Salir de la sala termina el intercambio
    await new Promise((r) => setTimeout(r, 4100)); // límite de solicitudes
    sa.emit('hotel:trade:request', { userId: b.user.id });
    await once(sb, 'hotel:trade:invite');
    sb.emit('hotel:trade:answer', { from: a.user.id, accept: true });
    await once(sa, 'hotel:trade');
    const left = once(sa, 'hotel:trade:end');
    sb.emit('hotel:leave');
    assert.equal((await left).reason, 'left');
    assert.ok(ta.v);
  } finally { sa.close(); sb.close(); sc.close(); }
});

test('tiempo en el Hotel: paga créditos mientras estás dentro de una sala', async () => {
  const fast = await startServer({ env: { HOTEL_ONLINE_EVERY_MS: '900', HOTEL_ONLINE_TICK_MS: '150' } });
  try {
    const admin = await adminClient(fast.url);
    const m = await createMember(fast.url, admin, 'Paseo');
    assert.equal(await credits(m), 550);
    const room = (await m.post('/hotel/rooms', { name: 'Lobby', model: 'a' })).data.room;
    const s = await connect(m, fast.url);
    try {
      await enter(s, room.id);
      const w = await once(s, 'hotel:wallet', (x) => x.reason === 'online', 5000);
      assert.equal(w.credits, 550 + E.ONLINE_CREDITS);
      s.emit('hotel:leave');
      await new Promise((r) => setTimeout(r, 1500));
      const after = await credits(m);
      await new Promise((r) => setTimeout(r, 1500));
      assert.equal(await credits(m), after, 'afuera del Hotel no se gana');
    } finally { s.close(); }
  } finally { await fast.stop(); }
});
