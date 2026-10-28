// Líneas del Hotel: jardín, deportes, fiesta y exclusivo HUB (definiciones y dibujo headless).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { HOTEL_CATS, FURNI_BY_ID } from '../shared/hotelCatalog.js';
import jardin from '../shared/hotelLines/jardin.js';
import deportes from '../shared/hotelLines/deportes.js';
import fiesta from '../shared/hotelLines/fiesta.js';
import hub from '../shared/hotelLines/hub.js';
import artJardin from '../client/src/hotel/art/lines/jardin.js';
import artDeportes from '../client/src/hotel/art/lines/deportes.js';
import artFiesta from '../client/src/hotel/art/lines/fiesta.js';
import artHub from '../client/src/hotel/art/lines/hub.js';
import { drawFurni, drawWallItem, furniBounds, wallBounds, drawFurniIcon } from '../client/src/hotel/furniArt.js';

const LINES = { jardin: [jardin, artJardin], deportes: [deportes, artDeportes], fiesta: [fiesta, artFiesta], hub: [hub, artHub] };
const CATS = new Set(HOTEL_CATS.map((c) => c.id));
const INTERACT = new Set(['toggle', 'dice', 'teleport', 'gate']);

function fakeCtx() {
  const calls = [];
  const grad = { addColorStop() {} };
  const target = {
    calls, lineWidth: 1, font: '10px sans-serif', globalAlpha: 1,
    getTransform: () => ({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 }),
    createLinearGradient: () => grad, createRadialGradient: () => grad,
    measureText: (t) => ({ width: String(t).length * 6 }),
  };
  return new Proxy(target, {
    get(t, k) {
      if (k in t) return t[k];
      return (...args) => {
        for (const a of args) if (typeof a === 'number' && !Number.isFinite(a)) throw new Error(`${String(k)} con número inválido: ${args}`);
        calls.push(k);
      };
    },
    set(t, k, v) { t[k] = v; return true; },
  });
}
const finiteBox = (b) => ['x', 'y', 'w', 'h'].every((k) => Number.isFinite(b[k])) && b.w > 0 && b.h > 0;

test('cada definición tiene línea, precio, categoría válida e id con prefijo', () => {
  const seen = new Set();
  for (const [line, [defs]] of Object.entries(LINES)) {
    assert.ok(defs.length >= 6, `${line} tiene muy pocos furnis`);
    for (const d of defs) {
      assert.equal(d.line, line, d.id);
      assert.ok(d.id.startsWith(line + '_'), `${d.id} sin prefijo`);
      assert.ok(!seen.has(d.id), `${d.id} repetido`); seen.add(d.id);
      assert.ok(CATS.has(d.cat), `${d.id} categoría ${d.cat}`);
      assert.ok(['floor', 'wall'].includes(d.kind), d.id);
      assert.ok(typeof d.name === 'string' && d.name.length > 2, d.id);
      assert.ok(Number.isInteger(d.price) && d.price > 0, `${d.id} precio`);
      assert.ok(Array.isArray(d.rots) && d.rots.length, d.id);
      if (d.interact) { assert.ok(INTERACT.has(d.interact), d.id); assert.ok(d.states >= 2, `${d.id} necesita estados`); }
      if (d.colors) for (const c of d.colors) assert.match(c, /^#[0-9a-f]{6}$/i, d.id);
      assert.equal(FURNI_BY_ID[d.id], d, `${d.id} no está en el catálogo`);
      if (line === 'hub') { assert.equal(d.exclusive, true, `${d.id} debe ser exclusivo`); assert.ok(d.price >= 150 && d.price <= 1500, `${d.id} precio HUB`); }
      else { assert.ok(!d.exclusive, `${d.id} no debe ser exclusivo`); assert.ok(d.price >= 2 && d.price <= 60, `${d.id} precio normal`); }
    }
  }
  assert.ok(hub.length >= 9 && hub.length <= 12);
});

test('cada furni tiene su dibujo (piso o pared) y los periodos son números', () => {
  for (const [line, [defs, art]] of Object.entries(LINES)) {
    for (const d of defs) {
      if (d.kind === 'floor') assert.equal(typeof art.floor[d.id], 'function', `${line}: falta FLOOR ${d.id}`);
      else assert.equal(typeof art.wall[d.id], 'function', `${line}: falta WALL ${d.id}`);
      if (art.period[d.id]) for (let st = 0; st < d.states; st++) assert.ok(Number.isFinite(art.period[d.id](st)), d.id);
    }
    for (const id of [...Object.keys(art.floor), ...Object.keys(art.wall)]) assert.ok(defs.some((d) => d.id === id), `${id} dibujado sin definición`);
  }
});

test('todos se dibujan en cada rotación, estado y color sin tronar', () => {
  for (const [defs] of Object.values(LINES)) {
    for (const d of defs) {
      if (d.kind === 'wall') {
        const b = wallBounds(d);
        assert.ok(finiteBox(b), `${d.id} límites`);
        assert.ok(b.y + b.h <= 2, `${d.id} debe quedar arriba de su base`);
        for (let state = 0; state < d.states; state++) for (const color of [undefined, ...(d.colors || [])]) {
          const ctx = fakeCtx();
          drawWallItem(ctx, d, { type: d.id, rot: 2, state, color }, { hover: true });
          assert.ok(ctx.calls.length > 3, `${d.id} s${state} no dibujó nada`);
        }
      } else {
        for (const rot of d.rots) {
          const b = furniBounds(d, rot);
          assert.ok(finiteBox(b), `${d.id} r${rot} límites`);
          for (let state = 0; state < d.states; state++) for (const color of [undefined, ...(d.colors || [])]) for (const t of [0, 777, 4321]) {
            const ctx = fakeCtx();
            drawFurni(ctx, d, { type: d.id, rot, state, color, x: 0, y: 0, z: 0 }, { t, direct: true });
            assert.ok(ctx.calls.length > 5, `${d.id} r${rot} s${state} no dibujó nada`);
          }
        }
      }
      const ctx = fakeCtx();
      drawFurniIcon({ width: 64, height: 64, getContext: () => ctx }, d, d.colors?.[1]);
      assert.ok(ctx.calls.includes('setTransform'));
    }
  }
});
