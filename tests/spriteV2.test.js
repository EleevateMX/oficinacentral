// Personajes HUB v2 (shared/spriteV2.js) y movimiento suave (client/src/lib/motion.js, shared/hotelWalk.js)
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { PRESETS, PARTS, COLOR_KEYS, normalizeSpec } from '../shared/sprite.js';
import {
  renderFrameV2, renderSheetV2, normalizeSpecV2, V2_W, V2_H, V2_FOOT, V2_WALK, V2_RING, V2_POSES, V2_PARTS, V2_EXTRA, V2_NAMES, frameKeyV2,
} from '../shared/spriteV2.js';
import { setAvatarStyle, avatarStyle } from '../shared/avatarStyle.js';
import { renderAvatarPixels } from '../client/src/hotel/avatarIso.js';
import { usesV2, crispScale, turnToward, viewFromVec, walkFrame } from '../client/src/lib/avatarV2.js';
import { stepPlayer, trackRemoteMove, sampleAt, walkStepV2 } from '../client/src/lib/motion.js';
import { walkAt, walkVisual, strideAdvance, STEP_MS } from '../shared/hotelWalk.js';
import { startServer, adminClient, createMember } from './helpers/server.js';

const hash = (d) => createHash('sha256').update(Buffer.from(d)).digest('hex');
const opaque = (d) => { let n = 0; for (let i = 3; i < d.length; i += 4) if (d[i]) n++; return n; };

describe('HUB v2: hojas', () => {
  test('cuadros de 40×64, deterministas, en las 8 direcciones', () => {
    for (const p of [PRESETS[0], PRESETS.find((x) => x.hat === 'cowboy'), PRESETS.find((x) => x.hairStyle === 'afro'), {}]) {
      for (const dir of V2_RING) {
        const a = renderFrameV2(p, { dir }), b = renderFrameV2(p, { dir });
        assert.equal(a.width, V2_W); assert.equal(a.height, V2_H);
        assert.equal(a.data.length, V2_W * V2_H * 4);
        assert.equal(hash(a.data), hash(b.data), `${dir}: determinista`);
        assert.ok(opaque(a.data) > 500, `${dir}: ${opaque(a.data)} px`);
      }
    }
    assert.equal(hash(renderSheetV2(PRESETS[3]).data), hash(renderSheetV2(PRESETS[3]).data));
  });

  test('los pies pisan la fila del ancla en todas las vistas', () => {
    for (const dir of V2_RING) for (let w = 0; w <= V2_WALK; w++) {
      const { data } = renderFrameV2(PRESETS[2], { dir, walk: w });
      let low = -1;
      for (let y = V2_H - 1; y >= 0 && low < 0; y--) for (let x = 0; x < V2_W; x++) if (data[(y * V2_W + x) * 4 + 3]) { low = y; break; }
      assert.ok(low >= V2_FOOT - 1 && low <= V2_FOOT + 1, `${dir} paso ${w}: pies en ${low}`);
    }
  });

  test('hay cuadro para cada postura y dirección, y el ciclo de caminar tiene 8 cuadros distintos', () => {
    const spec = PRESETS[0];
    for (const dir of V2_RING) {
      const idle = hash(renderFrameV2(spec, { dir }).data);
      const walks = new Set();
      for (let w = 1; w <= V2_WALK; w++) walks.add(hash(renderFrameV2(spec, { dir, walk: w }).data));
      assert.ok(walks.size >= 6, `${dir}: ${walks.size} cuadros de caminar distintos`);
      for (const pose of V2_POSES) {
        const f = renderFrameV2(spec, { dir, pose });
        assert.ok(opaque(f.data) > 400, `${dir} ${pose}`);
        if (dir === 'down' && pose !== 'sign') assert.notEqual(hash(f.data), idle, `${pose} se ve distinto a estar quieto`);
      }
    }
    // Respirar, parpadear y hablar cambian el cuadro
    for (const k of ['breathe', 'blink', 'talk']) assert.notEqual(hash(renderFrameV2(spec, { dir: 'down', [k]: 1 }).data), hash(renderFrameV2(spec, { dir: 'down' }).data), k);
  });

  test('todas las piezas de la ficha (y las nuevas) se ven en el personaje', () => {
    const base = { ...PRESETS[0], hat: 'none', eyewear: 'none', audio: 'none', extra: 'none', facialHair: 'none' };
    const look = (spec) => hash(Buffer.concat(['down', 'left', 'up', 'downLeft'].map((dir) => Buffer.from(renderFrameV2(spec, { dir }).data))));
    for (const [k, list] of Object.entries(V2_PARTS)) {
      const seen = new Map();
      for (const v of list) {
        const h = look({ ...base, [k]: v });
        assert.ok(!seen.has(h), `${k}: "${v}" se ve igual que "${seen.get(h)}"`);
        seen.set(h, v);
        assert.ok(V2_NAMES[k][v], `${k}.${v} tiene nombre`);
      }
    }
    // Los colores de la ficha se respetan
    for (const k of COLOR_KEYS) {
      const spec = { ...base, hat: 'cap', [k]: '#00ff88' };
      assert.notEqual(look(spec), look({ ...base, hat: 'cap' }), `color ${k}`);
    }
  });

  test('el color base de la ropa queda igual (los tonos se agregan alrededor)', () => {
    const { data } = renderFrameV2({ ...PRESETS[0], shirt: '#3d7be0' }, { dir: 'down' });
    let found = false;
    for (let i = 0; i < data.length; i += 4) if (data[i] === 0x3d && data[i + 1] === 0x7b && data[i + 2] === 0xe0) { found = true; break; }
    assert.ok(found);
  });

  test('cada avatar existente se convierte solo: presets, fichas viejas y vacías', () => {
    for (const p of PRESETS) assert.ok(opaque(renderFrameV2({ preset: p.id }, { dir: 'down' }).data) > 500, p.id);
    assert.ok(opaque(renderFrameV2({ accessory: 'headphones', hairStyle: 'bald' }, { dir: 'down' }).data) > 500);
    assert.ok(opaque(renderFrameV2({ hairStyle: 'no-existe', skin: 'rojo' }, { dir: 'left' }).data) > 500);
    // Las piezas nuevas son solo de v2: el clásico las cambia por las de siempre, sin cambiar el formato guardado
    const av = { ...PRESETS[0], top: 'dress', hat: 'beret', extra: 'necklace' };
    assert.equal(normalizeSpecV2(av).top, 'dress');
    assert.equal(normalizeSpec(av).top, PARTS.top[0]);
    for (const [k, l] of Object.entries(V2_EXTRA)) for (const v of l) assert.ok(!PARTS[k].includes(v), `${v} no está en el clásico`);
  });

  test('objetos en la mano y la mano cercana a la cámara', () => {
    const plain = renderFrameV2(PRESETS[0], { dir: 'down' });
    const held = renderFrameV2(PRESETS[0], { dir: 'down', hold: 'cafe' });
    assert.notEqual(hash(plain.data), hash(held.data));
    assert.equal(held.holdArm, 'b');
    assert.equal(renderFrameV2(PRESETS[0], { dir: 'right', hold: 'cafe' }).holdArm, 'a');
    assert.ok(held.hands.a && held.hands.b);
    assert.ok(renderFrameV2(PRESETS[0], { dir: 'down', pose: 'sit' }).seat < V2_FOOT - 4, 'sentado: la cadera está arriba del piso');
  });

  test('clave de caché distinta por cuadro', () => {
    assert.notEqual(frameKeyV2({ dir: 'down', walk: 1 }), frameKeyV2({ dir: 'down', walk: 2 }));
    assert.notEqual(frameKeyV2({ dir: 'down' }), frameKeyV2({ dir: 'down', blink: 1 }));
  });
});

describe('HUB v2: estilo y dibujo', () => {
  after(() => setAvatarStyle('classic'));
  test('el estilo cambia al personaje del Hotel; los personajes subidos siguen con su hoja', () => {
    setAvatarStyle('v2');
    assert.equal(avatarStyle(), 'v2');
    const v2 = renderAvatarPixels(PRESETS[0], { dir: 3, pose: 'stand' });
    assert.equal(v2.w, 60); assert.equal(v2.h, 96);
    assert.ok(usesV2(PRESETS[0]));
    assert.ok(!usesV2({ sprite: 'abc' }), 'personaje subido: hoja propia');
    const up = renderAvatarPixels({ sprite: 'abc' }, { dir: 3, pose: 'stand' });
    assert.equal(up.w, 64, 'el personaje subido se dibuja como siempre (32×48 a 2 px)');
    setAvatarStyle('classic');
    assert.ok(!usesV2(PRESETS[0]));
    const c = renderAvatarPixels(PRESETS[0], { dir: 3, pose: 'stand' });
    assert.equal(c.w, 64); assert.equal(c.h, 96);
    setAvatarStyle('v2');
    setAvatarStyle('cualquier-cosa');
    assert.equal(avatarStyle(), 'classic', 'un valor raro regresa al clásico');
  });

  test('escala nítida: entero cuando queda cerca; si no, el tamaño exacto', () => {
    assert.equal(crispScale(1), 1);
    assert.equal(crispScale(2), 2);
    assert.equal(crispScale(2.1), 2);
    assert.equal(crispScale(3.4), 3);
    assert.equal(crispScale(1.44), 1.44);
    assert.equal(crispScale(0.6), 0.6);
  });

  test('voltear pasa por las direcciones intermedias', () => {
    assert.ok(['downLeft', 'downRight'].includes(turnToward('down', 'up')));
    assert.equal(turnToward('downLeft', 'left'), 'left');
    assert.ok(['left', 'right'].includes(turnToward('down', 'up', false)));
    assert.equal(turnToward('down', 'right', false), 'right');
    assert.equal(viewFromVec(1, 1), 'downRight');
    assert.equal(viewFromVec(-1, 0), 'left');
    assert.equal(viewFromVec(0, -1), 'up');
  });
});

describe('Movimiento suave', () => {
  test('el ciclo de caminar avanza por distancia, no por tiempo', () => {
    // Mismo recorrido con cuadros de 16 ms o de 50 ms: misma fase
    const run = (dtMs) => {
      const p = { x: 0, y: 0, rx: 0, ry: 0, dir: 'right' };
      let t = 0;
      p.x = 1;
      for (let i = 0; i < 2000 && p.rx < 1; i++) { t += dtMs; stepPlayer(p, { now: t, dt: dtMs / 1000, mine: true, stepMs: 135, stride: 2 }); }
      return p;
    };
    const a = run(16), b = run(50);
    assert.ok(Math.abs(a.rx - 1) < 1e-9 && Math.abs(b.rx - 1) < 1e-9);
    assert.ok(Math.abs(a.walkPhase - 0.5) < 1e-6, `una casilla = medio ciclo (${a.walkPhase})`);
    assert.ok(Math.abs(a.walkPhase - b.walkPhase) < 1e-6);
    // Parado no avanza aunque pase el tiempo
    const ph = a.walkPhase;
    stepPlayer(a, { now: 10, dt: 0.5, mine: true });
    assert.ok(a.walkPhase === ph || a.walkPhase === 0);
    assert.equal(walkFrame(0), 1); assert.equal(walkFrame(0.5), 5); assert.equal(walkFrame(0.99), 8);
    assert.equal(walkStepV2({ moving: false, walkPhase: 0.3 }), 0);
  });

  test('los demás: interpolación con búfer, sin tirones aunque los mensajes lleguen a destiempo', () => {
    const p = { x: 5, y: 5, rx: 5, ry: 5, dir: 'right' };
    // llegan en bola: 3 pasos casi al mismo tiempo
    for (const [t, x] of [[1000, 6], [1005, 7], [1010, 8]]) { p.x = x; trackRemoteMove(p, false, t, 135); }
    const xs = [];
    for (let t = 1000; t <= 1700; t += 16) { stepPlayer(p, { now: t, dt: 0.016, mine: false, stepMs: 135 }); xs.push(p.rx); }
    for (let i = 1; i < xs.length; i++) {
      assert.ok(xs[i] >= xs[i - 1] - 1e-9, 'nunca regresa');
      assert.ok(xs[i] - xs[i - 1] < 0.35, `sin saltos (${xs[i] - xs[i - 1]})`);
    }
    assert.equal(xs.at(-1), 8);
    // teletransporte: sin interpolar
    p.x = 30; trackRemoteMove(p, true, 2000);
    stepPlayer(p, { now: 2001, dt: 0.016, mine: false });
    assert.equal(p.rx, 30);
    assert.deepEqual(sampleAt([{ t: 0, x: 0, y: 0 }, { t: 100, x: 1, y: 0 }], 50), { x: 0.5, y: 0 });
  });

  test('Hotel: arranque y frenado suaves con los mismos tiempos del servidor; zancada según la distancia', () => {
    const w = { from: [0, 0, 0], path: [[1, 0, 0], [2, 0, 0], [3, 0, 0]], t0: 0, n0: 0 };
    for (let i = 0; i <= 3; i++) {
      const t = i * STEP_MS;
      const a = walkAt(w, t), b = walkVisual(w, t);
      assert.ok(Math.abs(a.x - b.x) < 1e-9, `paso ${i}: misma casilla al mismo tiempo`);
    }
    assert.ok(walkVisual(w, STEP_MS * 0.25).x < walkAt(w, STEP_MS * 0.25).x, 'arranca suave');
    assert.ok(walkVisual(w, STEP_MS * 2.75).x > walkAt(w, STEP_MS * 2.75).x, 'frena suave');
    assert.equal(walkVisual(w, STEP_MS * 1.5).x, walkAt(w, STEP_MS * 1.5).x, 'en medio va parejo');
    // Al cambiar de rumbo (n0 > 0) ya venía caminando: no vuelve a arrancar
    const re = { ...w, n0: 2 };
    assert.equal(walkVisual(re, STEP_MS * 0.25).x, walkAt(re, STEP_MS * 0.25).x);
    // En pantalla, la diagonal de lado (64 px) avanza más ciclo que un paso recto (36 px)
    assert.ok(strideAdvance(1, -1) > strideAdvance(1, 0) * 1.5);
    assert.ok(strideAdvance(1, 0) > 0.45 && strideAdvance(1, 0) < 0.55);
  });
});

describe('Ajuste del admin: estilo de personajes', () => {
  let srv, admin;
  before(async () => { srv = await startServer(); admin = await adminClient(srv.url); });
  after(async () => { await srv?.stop(); });
  test('Clásico por omisión; el admin lo cambia y lo puede regresar', async () => {
    assert.equal((await admin.get('/config')).data.avatarStyle, 'classic');
    assert.equal((await admin.patch('/admin/office', { avatarStyle: 'v2' })).status, 200);
    assert.equal((await admin.get('/config')).data.avatarStyle, 'v2');
    assert.equal((await admin.patch('/admin/office', { avatarStyle: 'classic' })).status, 200);
    assert.equal((await admin.get('/config')).data.avatarStyle, 'classic');
    assert.equal((await admin.patch('/admin/office', { avatarStyle: 'otro' })).status, 400);
    const m = await createMember(srv.url, admin, 'estilo');
    assert.equal((await m.patch('/admin/office', { avatarStyle: 'v2' })).status, 403);
    assert.equal((await admin.patch('/admin/office', { avatarStyle: 'v2' })).status, 200);
    assert.equal((await m.get('/config')).data.avatarStyle, 'v2');
    // Las piezas nuevas se guardan tal cual (el formato del avatar no cambia)
    const r = await m.patch('/me', { displayName: 'Estilo', avatar: { ...PRESETS[0], id: undefined, top: 'dress', hat: 'beret' } });
    assert.equal(r.status, 200);
    assert.equal(r.data.user.avatar.top, 'dress');
    assert.equal(r.data.user.avatar.hat, 'beret');
  });
});
