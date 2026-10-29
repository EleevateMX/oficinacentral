// Rocola: ids de YouTube, fila con votos, límites, saltar canciones y quién la oye.
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { io } from 'socket.io-client';
import { parseVideoId, cleanTitle, inJukeboxZone, jukeboxAt, JUKEBOX_MAX_QUEUE } from '../shared/jukebox.js';
import { createJukebox, addSong, voteSong, removeSong, advance, voteSkip, checkSkip, reportEnded, reportError, setDuration, tick, viewOf, skipNeeded } from '../server/jukeboxQueue.js';
import { composeFloor, getTemplate, areaAt } from '../shared/map.js';
import { startServer, adminClient, createMember } from './helpers/server.js';

const ID = (n) => `vid${String(n).padStart(8, '0')}`; // ids de 11 caracteres

describe('ids de YouTube', () => {
  test('acepta enlaces comunes e ids sueltos', () => {
    for (const s of ['dQw4w9WgXcQ', 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', 'youtube.com/watch?v=dQw4w9WgXcQ&t=42s', 'https://youtu.be/dQw4w9WgXcQ?si=abc', 'https://m.youtube.com/watch?v=dQw4w9WgXcQ', 'https://music.youtube.com/watch?v=dQw4w9WgXcQ&list=x', 'https://www.youtube.com/shorts/dQw4w9WgXcQ', 'https://www.youtube.com/embed/dQw4w9WgXcQ', ' dQw4w9WgXcQ ']) {
      assert.equal(parseVideoId(s), 'dQw4w9WgXcQ', s);
    }
  });
  test('rechaza lo que no es un video de YouTube', () => {
    for (const s of ['', 'hola', 'dQw4w9WgXc', 'dQw4w9WgXcQQ', 'dQw4w9Wg<cQ', 'https://vimeo.com/watch?v=dQw4w9WgXcQ', 'https://evil.com/youtu.be/dQw4w9WgXcQ', 'javascript:alert(1)', 'https://youtube.com/watch?v=bad', null, undefined]) {
      assert.equal(parseVideoId(s), null, String(s));
    }
  });
  test('limpia el título', () => {
    assert.equal(cleanTitle('  Hola\n<b>mundo</b>  '), 'Hola b mundo /b');
    assert.equal(cleanTitle(''), 'Canción de YouTube');
    assert.equal(cleanTitle('x'.repeat(500)).length, 120);
  });
});

describe('fila de la rocola', () => {
  test('la primera canción suena de inmediato y las demás van a la fila', () => {
    const jb = createJukebox();
    const r = addSong(jb, { videoId: ID(1), title: 'Uno', userId: 1 }, 1000);
    assert.ok(r.ok && r.started);
    assert.equal(jb.current.videoId, ID(1));
    assert.ok(jb.current.startedAt >= 1000);
    assert.ok(addSong(jb, { videoId: ID(2), title: 'Dos', userId: 1 }, 2000).ok);
    assert.equal(jb.queue.length, 1);
    assert.match(addSong(jb, { videoId: ID(2), userId: 2 }).error, /ya está/);
    assert.match(addSong(jb, { videoId: 'nope', userId: 2 }).error, /no es válido/);
  });

  test('ordena por votos y luego por llegada; votar dos veces quita el voto', () => {
    const jb = createJukebox();
    addSong(jb, { videoId: ID(0), userId: 9 }, 0);
    addSong(jb, { videoId: ID(1), userId: 1 }, 1);
    addSong(jb, { videoId: ID(2), userId: 2 }, 2);
    addSong(jb, { videoId: ID(3), userId: 3 }, 3);
    const [a, b, c] = jb.queue.map((s) => s.id);
    voteSong(jb, c, 1); voteSong(jb, c, 2); voteSong(jb, b, 1);
    assert.deepEqual(jb.queue.map((s) => s.id), [c, b, a]);
    voteSong(jb, c, 1); voteSong(jb, c, 2);
    assert.deepEqual(jb.queue.map((s) => s.id), [b, a, c]);
    assert.equal(viewOf(jb).queue[0].votes, 1);
    assert.deepEqual(viewOf(jb).queue[0].voters, [1]);
    // Avanza a la más votada
    advance(jb, 10);
    assert.equal(jb.current.id, b);
    advance(jb, 11); advance(jb, 12); advance(jb, 13);
    assert.equal(jb.current, null);
  });

  test('máximo 3 por persona y 30 en la fila', () => {
    const jb = createJukebox();
    addSong(jb, { videoId: ID(0), userId: 1 });
    for (let i = 1; i <= 3; i++) assert.ok(addSong(jb, { videoId: ID(i), userId: 1 }).ok);
    assert.match(addSong(jb, { videoId: ID(4), userId: 1 }).error, /máximo 3/);
    let n = 100;
    for (let u = 2; jb.queue.length < JUKEBOX_MAX_QUEUE; u++) assert.ok(addSong(jb, { videoId: ID(n++), userId: u }).ok);
    assert.match(addSong(jb, { videoId: ID(n++), userId: 999 }).error, /llena/);
    // Quitar: solo quien la puso o un admin
    const mine = jb.queue.find((s) => s.addedBy === 1);
    assert.equal(removeSong(jb, mine.id, 2), false);
    assert.equal(removeSong(jb, mine.id, 1), true);
    assert.equal(removeSong(jb, jb.queue[0].id, 77, true), true);
  });

  test('saltar: mayoría de quienes la oyen, quien la puso o un admin', () => {
    const jb = createJukebox();
    addSong(jb, { videoId: ID(1), userId: 1 });
    addSong(jb, { videoId: ID(2), userId: 2 });
    addSong(jb, { videoId: ID(3), userId: 2 });
    const ears = new Set([1, 2, 3, 4, 5]);
    assert.equal(skipNeeded(5), 3);
    assert.equal(skipNeeded(2), 2);
    assert.equal(voteSkip(jb, 3, ears).skipped, false);
    assert.equal(voteSkip(jb, 3, ears).skipped, false); // el mismo voto no cuenta doble
    assert.equal(voteSkip(jb, 99, ears).skipped, false); // alguien que no la oye no vota
    assert.equal(voteSkip(jb, 4, ears).skipped, false);
    assert.equal(voteSkip(jb, 5, ears).skipped, true);
    assert.equal(jb.current.videoId, ID(2));
    assert.equal(jb.skipVotes.size, 0);
    // Quien la puso la salta sola
    assert.equal(voteSkip(jb, 2, ears).skipped, true);
    assert.equal(jb.current.videoId, ID(3));
    // Si los que votaron siguen y los demás se van, se alcanza la mayoría
    voteSkip(jb, 4, ears);
    assert.equal(checkSkip(jb, ears).skipped, false);
    assert.equal(checkSkip(jb, new Set([4])).skipped, true);
    assert.equal(jb.current, null);
    // Admin
    addSong(jb, { videoId: ID(9), userId: 1 });
    assert.equal(voteSkip(jb, 50, new Set(), { isAdmin: true }).skipped, true);
  });

  test('terminó: se ignoran avisos repetidos o demasiado pronto; duración y errores', () => {
    const jb = createJukebox();
    addSong(jb, { videoId: ID(1), userId: 1 }, 0);
    addSong(jb, { videoId: ID(2), userId: 1 }, 0);
    addSong(jb, { videoId: ID(3), userId: 1 }, 0);
    const s0 = jb.current.startedAt;
    assert.equal(reportEnded(jb, ID(1), s0 + 1000), false); // demasiado pronto
    assert.ok(setDuration(jb, ID(1), 200));
    assert.equal(setDuration(jb, ID(1), 10), false); // la primera duración gana
    assert.equal(reportEnded(jb, ID(1), s0 + 60e3), false); // falta mucho para el final
    assert.equal(reportEnded(jb, ID(1), s0 + 199e3), true);
    assert.equal(reportEnded(jb, ID(1), s0 + 199e3), false); // el segundo aviso ya no cuenta
    assert.equal(jb.current.videoId, ID(2));
    // Error que no depende del video: no salta; video bloqueado: sí
    assert.equal(reportError(jb, ID(2), 5), false);
    assert.equal(reportError(jb, ID(2), 150), true);
    assert.equal(jb.current.videoId, ID(3));
    // Sin avisos, avanza al pasar la duración
    setDuration(jb, ID(3), 30);
    assert.equal(tick(jb, jb.current.startedAt + 20e3), false);
    assert.equal(tick(jb, jb.current.startedAt + 40e3), true);
    assert.equal(jb.current, null);
  });
});

describe('zona de la rocola en la plantilla', () => {
  test('la rocola de la zona de descanso se oye en toda la zona y no fuera', () => {
    const t = getTemplate('hq');
    const objects = t.objects.map((o, i) => ({ ...o, id: i + 1 }));
    const areas = t.areas.map((a, i) => ({ ...a, id: i + 1 }));
    const f = composeFloor({ template: 'hq', areas, objects });
    const jb = objects.find((o) => o.type === 'jukebox');
    assert.ok(jb, 'la plantilla HQ trae rocola');
    assert.equal(areaAt(f, jb.x, jb.y).name, 'Zona de descanso');
    assert.ok(inJukeboxZone(f, jb, 72, 54));
    assert.equal(jukeboxAt(f, 76, 57)?.id, jb.id);
    assert.equal(inJukeboxZone(f, jb, 85, 52), false); // sala de juegos
    assert.equal(jukeboxAt(f, 40, 52), null); // recepción
  });
});

describe('rocola en tiempo real', () => {
  let srv;
  before(async () => { srv = await startServer(); });
  after(async () => { await srv?.stop(); });
  const connect = (c) => new Promise((resolve, reject) => {
    const s = io(srv.url, { extraHeaders: { cookie: [...c.cookies].map(([k, v]) => `${k}=${v}`).join('; ') }, transports: ['websocket'] });
    s.on('hello', () => resolve(s));
    s.on('connect_error', reject);
  });
  const once = (s, ev, pred = () => true) => new Promise((r) => { const f = (m) => { if (pred(m)) { s.off(ev, f); r(m); } }; s.on(ev, f); });
  const call = (s, ev, m) => new Promise((r) => s.emit(ev, m, r));
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));

  test('solo quien está en la zona pone música; todos reciben el estado', async () => {
    const admin = await adminClient(srv.url);
    const ana = await createMember(srv.url, admin, 'Ana');
    const beto = await createMember(srv.url, admin, 'Beto');
    const floor = (await admin.get('/floors/1')).data.floor;
    const box = floor.objects.find((o) => o.type === 'jukebox');
    assert.ok(box, 'el piso nuevo trae la rocola');
    const a = await connect(ana), b = await connect(beto);
    try {
      // Beto está lejos (recepción): no puede poner música
      b.emit('move', { floorId: 1, x: 40, y: 53, dir: 'down', tp: true });
      a.emit('move', { floorId: 1, x: 70, y: 43, dir: 'down', tp: true });
      await wait(150);
      assert.match((await call(b, 'jukebox:add', { objectId: box.id, videoId: 'dQw4w9WgXcQ', title: 'X' })).error, /Acércate/);
      assert.match((await call(a, 'jukebox:add', { objectId: box.id, videoId: '../etc', title: 'X' })).error, /no es válido/);
      // Un objeto que no es rocola no sirve
      const tv = floor.objects.find((o) => o.type === 'tv');
      assert.match((await call(a, 'jukebox:add', { objectId: tv.id, videoId: 'bbbbbbbbbbb' })).error, /Acércate/);
      const got = once(b, 'jukebox:state', (m) => m.objectId === box.id && m.current);
      const r = await call(a, 'jukebox:add', { objectId: box.id, videoId: 'dQw4w9WgXcQ', title: 'Never <Gonna>' });
      assert.ok(r.ok && r.started);
      const st = await got;
      assert.equal(st.current.videoId, 'dQw4w9WgXcQ');
      assert.equal(st.current.title, 'Never Gonna');
      assert.equal(st.current.addedBy, ana.user.id);
      assert.equal(typeof st.now, 'number');
      // Sync al conectarse
      const all = await call(b, 'jukebox:sync', {});
      assert.equal(all.all.find((x) => x.objectId === box.id)?.current.videoId, 'dQw4w9WgXcQ');
      // Beto entra a la zona, vota por saltar: con 2 oyentes hacen falta 2 votos
      b.emit('move', { floorId: 1, x: 71, y: 43, dir: 'down', tp: true });
      await wait(150);
      await wait(2000); // límite de una canción cada 2 s
      assert.ok((await call(a, 'jukebox:add', { objectId: box.id, videoId: 'aaaaaaaaaaa', title: 'Dos' })).ok);
      const sk = await call(b, 'jukebox:skip', { objectId: box.id });
      assert.equal(sk.skipped, false);
      assert.equal(sk.needed, 2);
      // Ana la puso: ella la salta sola
      const next = once(b, 'jukebox:state', (m) => m.current?.videoId === 'aaaaaaaaaaa');
      assert.equal((await call(a, 'jukebox:skip', { objectId: box.id })).skipped, true);
      await next;
    } finally { a.close(); b.close(); }
  });
});
