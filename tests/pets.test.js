// Mascotas interactivas: ánimo, quién puede alimentar/acariciar, enfriamientos y alegría al conectarse.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { io } from 'socket.io-client';
import { startServer, adminClient, createMember } from './helpers/server.js';

let srv;
before(async () => { srv = await startServer(); });
after(async () => { await srv?.stop(); });

const connect = (c) => new Promise((resolve, reject) => {
  const s = io(srv.url, { extraHeaders: { cookie: [...c.cookies].map(([k, v]) => `${k}=${v}`).join('; ') }, transports: ['websocket'] });
  s.on('hello', (h) => { s.hello = h; resolve(s); });
  s.on('connect_error', reject);
});
const once = (s, ev, pred = () => true, ms = 4000) => new Promise((r, j) => {
  const to = setTimeout(() => j(new Error(`sin ${ev}`)), ms);
  const f = (m) => { if (pred(m)) { clearTimeout(to); s.off(ev, f); r(m); } };
  s.on(ev, f);
});
const act = (s, m) => new Promise((r) => s.emit('pet:action', m, r));
const mood = (s, owner) => new Promise((r) => s.emit('pet:mood', owner, r));
const moveTo = async (s, floorId, x, y) => { s.emit('move', { floorId, x, y, dir: 'down', tp: true }); await new Promise((r) => setTimeout(r, 120)); };

test('mascotas: ánimo, validación, enfriamientos y alegría al llegar', async () => {
  const admin = await adminClient(srv.url);
  const ana = await createMember(srv.url, admin, 'Ana');
  const beto = await createMember(srv.url, admin, 'Beto');
  await ana.patch('/me', { avatar: { pet: 'corgi', petName: 'Toby' } });

  // Al conectarse, la mascota de Ana se pone feliz (lo ve todo el mundo)
  const b = await connect(beto);
  const seen = once(b, 'pet:action', (m) => m.kind === 'happy' && m.owner === ana.user.id);
  const a = await connect(ana);
  const hp = await seen;
  assert.ok(hp.mood >= 70);
  try {
    // Sin mascota: no hay nada que hacer
    assert.equal((await act(b, { kind: 'feed' })).ok, false);
    assert.equal((await mood(a, beto.user.id)).ok, false);
    const m0 = await mood(b, ana.user.id);
    assert.equal(m0.ok, true);
    assert.equal(m0.name, 'Toby');

    // Solo su dueña la alimenta
    const notOwner = await act(b, { kind: 'feed', owner: ana.user.id });
    assert.equal(notOwner.ok, false);
    assert.match(notOwner.error, /dueño/);
    const fedSeen = once(b, 'pet:action', (m) => m.kind === 'feed' && m.owner === ana.user.id);
    const fed = await act(a, { kind: 'feed' });
    assert.equal(fed.ok, true);
    assert.ok(fed.mood > hp.mood);
    assert.equal((await fedSeen).mood, fed.mood);
    // Ya comió: hay que esperar
    const again = await act(a, { kind: 'feed' });
    assert.equal(again.ok, false);
    assert.ok(again.wait > 0);
    const m1 = await mood(a, ana.user.id);
    assert.equal(m1.happiness, fed.mood);
    assert.ok(m1.lastFed > 0);

    // Acariciar requiere estar junto a la mascota
    const fid = a.hello.players[ana.user.id].floorId;
    await moveTo(a, fid, 10, 22);
    await moveTo(b, fid, 20, 30);
    const far = await act(b, { kind: 'pet', owner: ana.user.id });
    assert.equal(far.ok, false);
    assert.match(far.error, /Acércate/);
    await moveTo(b, fid, 11, 22);
    const notified = once(a, 'pet:action', (m) => m.kind === 'pet' && m.by === beto.user.id);
    const petted = await act(b, { kind: 'pet', owner: ana.user.id });
    assert.equal(petted.ok, true);
    assert.equal((await notified).notify, true);
    // Muy seguido: espera un momentito
    assert.equal((await act(b, { kind: 'pet', owner: ana.user.id })).ok, false);
    // Pasado el enfriamiento se puede otra vez, pero ya no se avisa a la dueña (máximo uno por minuto)
    await new Promise((r) => setTimeout(r, 1600));
    const quiet = once(a, 'pet:action', (m) => m.kind === 'pet' && m.by === beto.user.id);
    assert.equal((await act(b, { kind: 'pet', owner: ana.user.id })).ok, true);
    assert.equal((await quiet).notify, undefined);

    // La pelota: quien está cerca puede lanzarla; cae a máximo 6 casillas
    const ball = once(a, 'pet:action', (m) => m.kind === 'ball');
    assert.equal((await act(b, { kind: 'ball', owner: ana.user.id, x: 40, y: 22 })).ok, true);
    const bm = await ball;
    assert.equal(bm.fx, 11);
    assert.equal(bm.x, 17);
    assert.equal(bm.y, 22);

    // Trucos: solo la dueña
    assert.equal((await act(b, { kind: 'trick', owner: ana.user.id, trick: 'sit' })).ok, false);
    const tr = await act(a, { kind: 'trick', trick: 'roll' });
    assert.equal(tr.ok, true);
    assert.equal(tr.trick, 'roll');

    // El ánimo nunca pasa de 100
    assert.ok((await mood(a, ana.user.id)).happiness <= 100);

    // Regresar de ausente también la pone feliz (aunque no suba el ánimo otra vez tan pronto)
    a.emit('state', { status: 'away' });
    await new Promise((r) => setTimeout(r, 100));
    const back = once(b, 'pet:action', (m) => m.kind === 'happy' && m.owner === ana.user.id);
    a.emit('state', { status: 'active' });
    await back;
  } finally {
    a.close();
    b.close();
  }
});

test('mascotas: el ánimo baja despacito y nunca de 10', async () => {
  const fs = await import('node:fs');
  const os = await import('node:os');
  const path = await import('node:path');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nuvora-pets-'));
  const prev = process.env.DATA_DIR;
  process.env.DATA_DIR = dir;
  try {
    const { db } = await import('../server/db.js');
    const pets = await import('../server/pets.js');
    const id = Number(db.prepare("INSERT INTO users (username, display_name, password_hash, created_at) VALUES ('m', 'M', 'x', 0)").run().lastInsertRowid);
    assert.equal(pets.getMood(id).happiness, pets.MOOD_DEFAULT);
    assert.equal(pets.addMood(id, 20, 'feed'), 90);
    const t = Date.now();
    assert.equal(pets.getMood(id, t + 5 * 3600e3).happiness, 90 - 5 * pets.DECAY_PER_HOUR);
    assert.equal(pets.getMood(id, t + 1000 * 3600e3).happiness, pets.MOOD_MIN);
    assert.equal(pets.addMood(id, 500), 100);
    db.close();
  } finally {
    if (prev === undefined) delete process.env.DATA_DIR; else process.env.DATA_DIR = prev;
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
