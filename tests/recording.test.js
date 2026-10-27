// Clips y grabaciones: armado de WebM, nombres de archivo y avisos en tiempo real.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { io } from 'socket.io-client';
import { startServer, adminClient, createMember } from './helpers/server.js';
import { WebmClipBuffer, durationPatch, inspectWebm } from '../client/src/lib/webm.js';
import { fileName, pickMime, extFor } from '../client/src/lib/recorder.js';

// ---------- WebM sintético (como lo escribe MediaRecorder de Chrome) ----------
const id = (n) => { const o = []; while (n > 0) { o.unshift(n & 0xff); n = Math.floor(n / 256); } return o; };
const size = (n) => { const o = [0x01]; for (let k = 6; k >= 0; k--) o.push(Math.floor(n / 2 ** (8 * k)) & 0xff); return o; };
const uint = (n) => { const o = []; do { o.unshift(n & 0xff); n = Math.floor(n / 256); } while (n > 0); return o; };
const el = (i, data) => [...id(i), ...size(data.length), ...data];
const UNKNOWN = [0x01, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff];

function block(track, rel, key, payload = 20) {
  const r = rel & 0xffff;
  return el(0xa3, [0x80 | track, r >> 8, r & 0xff, key ? 0x80 : 0, ...new Array(payload).fill(track)]);
}

// Video a 10 cuadros/s con cuadro clave cada `kfEvery` ms y audio cada 20 ms; un cluster por cuadro clave
function fakeWebm({ seconds = 40, kfEvery = 3000 } = {}) {
  const head = [
    ...el(0x1a45dfa3, el(0x4282, [...'webm'].map((c) => c.charCodeAt(0)))),
    ...id(0x18538067), ...UNKNOWN,
    ...el(0x1549a966, [...el(0x2ad7b1, uint(1_000_000)), ...el(0x4d80, [65, 66])]),
    ...el(0x1654ae6b, [
      ...el(0xae, [...el(0xd7, [1]), ...el(0x83, [1])]),
      ...el(0xae, [...el(0xd7, [2]), ...el(0x83, [2])]),
    ]),
  ];
  const out = [...head];
  const end = seconds * 1000;
  for (let c = 0; c < end; c += kfEvery) {
    out.push(...id(0x1f43b675), ...UNKNOWN, ...el(0xe7, uint(c)));
    for (let t = c; t < Math.min(end, c + kfEvery); t += 20) {
      if (t % 100 === 0) out.push(...block(1, t - c, t === c));
      out.push(...block(2, t - c, true, 6));
    }
  }
  return new Uint8Array(out);
}

test('webm: el búfer guarda solo lo reciente y arma un clip que empieza en cuadro clave', () => {
  const src = fakeWebm({ seconds: 40, kfEvery: 3000 });
  const buf = new WebmClipBuffer({ keepMs: 10_000, marginMs: 2000 });
  for (let i = 0; i < src.length; i += 997) buf.push(src.subarray(i, i + 997)); // trozos que cortan elementos
  assert.equal(buf.broken, false);
  assert.ok(buf.ready);
  assert.ok(buf.spanMs <= 10_000 + 2000 + 3000, `búfer acotado (${buf.spanMs} ms)`);
  const out = buf.build(10_000);
  const bytes = new Uint8Array(Buffer.concat(out.parts.map((p) => Buffer.from(p))));
  const info = inspectWebm(bytes);
  assert.equal(info.firstT, 0, 'los tiempos empiezan en 0');
  assert.equal(info.keyframes[0], 0, 'el primer cuadro es clave');
  // Último cuadro clave antes de 39.98 - 10 s = 29.98 → 27 s; el clip dura ~13 s
  assert.ok(out.durationMs >= 10_000 && out.durationMs <= 13_100, `duración ${out.durationMs}`);
  assert.ok(Math.abs(info.duration - out.durationMs) < 1, 'Duration escrita en la cabecera');
  assert.equal(info.lastT, 39_980 - 27_000);
  assert.ok(info.keyframes.length >= 4);
});

test('webm: con menos video que el pedido se guarda todo desde el inicio', () => {
  const src = fakeWebm({ seconds: 5, kfEvery: 3000 });
  const buf = new WebmClipBuffer({ keepMs: 30_000 });
  buf.push(src);
  const out = buf.build(30_000);
  const info = inspectWebm(new Uint8Array(Buffer.concat(out.parts.map((p) => Buffer.from(p)))));
  assert.equal(info.blocks, inspectWebm(src).blocks);
  assert.ok(out.durationMs > 4900 && out.durationMs < 5100);
});

test('webm: sin cabecera completa no hay clip', () => {
  const buf = new WebmClipBuffer();
  buf.push(fakeWebm().subarray(0, 30));
  assert.equal(buf.build(), null);
});

test('webm: a una grabación completa se le agrega la duración', () => {
  const src = fakeWebm({ seconds: 4 });
  assert.equal(inspectWebm(src).duration, null);
  const patch = durationPatch(src.subarray(0, 4096), 4000);
  assert.ok(patch);
  const fixed = new Uint8Array([...patch.head, ...src.subarray(patch.skip)]);
  const info = inspectWebm(fixed);
  assert.equal(info.duration, 4000);
  assert.equal(info.blocks, inspectWebm(src).blocks, 'no se pierde ningún bloque');
  assert.equal(durationPatch(new Uint8Array([1, 2, 3]), 10), null);
});

test('nombres de archivo y formato', () => {
  const d = new Date(2026, 9, 27, 14, 5);
  assert.equal(fileName('clip', 'Kevin', d), 'clip-Kevin-2026-10-27-14-05.webm');
  assert.equal(fileName('junta', 'José Peña / GTA', d), 'junta-Jose_Pena_GTA-2026-10-27-14-05.webm');
  assert.equal(fileName('grabacion', '', d, 'mp4'), 'grabacion-pantalla-2026-10-27-14-05.mp4');
  assert.equal(pickMime(undefined, (t) => t.includes('vp8')), 'video/webm;codecs=vp8,opus');
  assert.equal(pickMime(undefined, () => true), 'video/webm;codecs=vp9,opus');
  assert.equal(pickMime(undefined, (t) => t === 'video/mp4'), 'video/mp4');
  assert.equal(pickMime(undefined, () => false), null);
  assert.equal(extFor('video/mp4;codecs=avc1'), 'mp4');
  assert.equal(extFor('video/webm;codecs=vp9'), 'webm');
});

// ---------- Tiempo real ----------
let srv;
let admin;
let member;
let other;
before(async () => {
  srv = await startServer();
  admin = await adminClient(srv.url);
  member = await createMember(srv.url, admin, 'Kevin');
  other = await createMember(srv.url, admin, 'Ana');
});
after(async () => { await srv?.stop(); });

const connect = (c) => new Promise((resolve, reject) => {
  const s = io(srv.url, { extraHeaders: { cookie: [...c.cookies].map(([k, v]) => `${k}=${v}`).join('; ') }, transports: ['websocket'] });
  s.once('hello', () => resolve(s));
  s.on('connect_error', reject);
});
const waitFor = (s, ev, pred = () => true, ms = 3000) => new Promise((resolve, reject) => {
  const t = setTimeout(() => { s.off(ev, h); reject(new Error(`sin ${ev}`)); }, ms);
  const h = (m) => { if (pred(m)) { clearTimeout(t); s.off(ev, h); resolve(m); } };
  s.on(ev, h);
});
const nothing = (s, ev, ms = 400) => new Promise((resolve) => {
  let got = null;
  const h = (m) => { got = m; };
  s.on(ev, h);
  setTimeout(() => { s.off(ev, h); resolve(got); }, ms);
});

test('presencia: "grabando" se anuncia a todos', async () => {
  const a = await connect(admin);
  const b = await connect(member);
  try {
    const seen = waitFor(b, 'player', (p) => p.id === admin.user.id && p.recording === true);
    a.emit('state', { recording: true });
    await seen;
    const off = waitFor(b, 'player', (p) => p.id === admin.user.id && p.recording === false);
    a.emit('state', { recording: 'sí' }); // inválido: se ignora
    a.emit('state', { recording: false });
    await off;
  } finally { a.close(); b.close(); }
});

test('clip: solo llega a quien transmite, si de verdad lo ves, y con límite', async () => {
  const a = await connect(admin); // transmite
  const b = await connect(member); // ve y guarda clips
  const c = await connect(other); // no tiene que enterarse
  try {
    const live = waitFor(b, 'player', (p) => p.id === admin.user.id && p.screen);
    a.emit('state', { screen: true });
    await live;
    // Sin estar viéndolo no se avisa
    let none = nothing(a, 'clip');
    b.emit('clip', { sharer: admin.user.id });
    assert.equal(await none, null);
    const watching = waitFor(a, 'player', (p) => p.id === member.user.id && (p.watching || []).includes(admin.user.id));
    b.emit('state', { watching: [admin.user.id] });
    await watching;
    const cNone = nothing(c, 'clip');
    const got = waitFor(a, 'clip');
    b.emit('clip', { sharer: admin.user.id });
    assert.deepEqual(await got, { from: member.user.id });
    assert.equal(await cNone, null, 'nadie más recibe el aviso');
    // Datos inválidos
    none = nothing(a, 'clip');
    b.emit('clip', { sharer: 'abc' });
    b.emit('clip', null);
    assert.equal(await none, null);
    // Límite: 6 por minuto
    let count = 1;
    const h = () => { count++; };
    a.on('clip', h);
    for (let i = 0; i < 10; i++) b.emit('clip', { sharer: admin.user.id });
    await new Promise((r) => setTimeout(r, 500));
    a.off('clip', h);
    assert.equal(count, 6);
  } finally { a.close(); b.close(); c.close(); }
});
