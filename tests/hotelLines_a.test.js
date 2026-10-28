// Líneas del Hotel: Urbana, Pura Vida, Plastik, Hielo y Cabaña (catálogo + dibujo).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { HOTEL_CATS, HOTEL_FURNI, HOTEL_LINES } from '../shared/hotelCatalog.js';
import { drawFurni, drawWallItem, furniBounds, wallBounds, drawFurniIcon } from '../client/src/hotel/furniArt.js';
import { LINE_FLOOR, LINE_WALL } from '../client/src/hotel/art/lines/index.js';

const LINES = ['urbana', 'puravida', 'plastik', 'hielo', 'cabana'];
const CATS = new Set(HOTEL_CATS.map((c) => c.id));
const INTERACT = new Set(['toggle', 'dice', 'teleport', 'gate']);
const defsOf = (line) => HOTEL_FURNI.filter((d) => d.line === line);

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

test('las líneas existen en el registro y tienen entre 6 y 10 furnis', () => {
  for (const line of LINES) {
    assert.ok(HOTEL_LINES.some((l) => l.id === line), `falta la línea ${line}`);
    const n = defsOf(line).length;
    assert.ok(n >= 6 && n <= 10, `${line}: ${n} furnis`);
    assert.ok(defsOf(line).some((d) => d.kind === 'wall'), `${line} sin furni de pared`);
    assert.ok(defsOf(line).some((d) => d.interact || d.sit || d.lay), `${line} sin nada que hacer`);
  }
});

test('cada definición es válida: línea, prefijo, categoría, precio y mecánicas', () => {
  const ids = new Set();
  for (const line of LINES) {
    for (const d of defsOf(line)) {
      assert.ok(d.id.startsWith(line + '_'), `${d.id} sin prefijo ${line}_`);
      assert.ok(!ids.has(d.id), `${d.id} repetido`); ids.add(d.id);
      assert.equal(HOTEL_FURNI.filter((x) => x.id === d.id).length, 1, `${d.id} choca con otro furni`);
      assert.ok(CATS.has(d.cat), `${d.id}: categoría ${d.cat}`);
      assert.ok(typeof d.name === 'string' && d.name.length > 2, `${d.id} sin nombre`);
      assert.ok(Number.isInteger(d.price) && d.price >= 2 && d.price <= 60, `${d.id}: precio ${d.price}`);
      assert.ok(!d.exclusive, `${d.id} no debe ser exclusivo`);
      assert.ok(d.kind === 'floor' || d.kind === 'wall', `${d.id}: kind`);
      assert.ok(Array.isArray(d.rots) && d.rots.length && d.rots.every((r) => [0, 2, 4, 6].includes(r)), `${d.id}: rots`);
      assert.ok(d.w >= 1 && d.l >= 1 && Number.isFinite(d.h), `${d.id}: medidas`);
      if (d.interact) { assert.ok(INTERACT.has(d.interact), `${d.id}: interact`); assert.ok(d.states >= 2, `${d.id}: states`); }
      if (d.sit != null) assert.ok(d.sit > 0 && d.sit <= d.h + 0.01, `${d.id}: sit`);
      for (const c of d.colors || []) assert.match(c, /^#[0-9a-f]{6}$/i, `${d.id}: color ${c}`);
      if (d.kind === 'floor') assert.equal(typeof LINE_FLOOR[d.id], 'function', `${d.id} sin dibujo de piso`);
      else assert.equal(typeof LINE_WALL[d.id], 'function', `${d.id} sin dibujo de pared`);
    }
  }
});

test('los furnis de piso se dibujan en cada rotación, estado y color', () => {
  for (const line of LINES) {
    for (const def of defsOf(line).filter((d) => d.kind === 'floor')) {
      for (const rot of def.rots) {
        const b = furniBounds(def, rot);
        assert.ok(finiteBox(b), `${def.id} r${rot} límites inválidos`);
        const w = rot === 2 || rot === 6 ? def.l : def.w, l = rot === 2 || rot === 6 ? def.w : def.l;
        const cx = (w - l) * 16, cy = (w + l) * 8;
        assert.ok(cx >= b.x && cx <= b.x + b.w && cy >= b.y && cy <= b.y + b.h, `${def.id} r${rot}: límites no cubren la huella`);
        for (let state = 0; state < (def.states || 1); state++) {
          for (const color of [undefined, ...(def.colors || [])]) {
            for (const opts of [{ t: 0 }, { t: 1234, hover: true }, { t: 777, ghost: true, tint: '#ff0000' }, { t: 99, direct: true }]) {
              const ctx = fakeCtx();
              drawFurni(ctx, def, { type: def.id, rot, state, color, x: 0, y: 0, z: 0 }, opts);
              assert.ok(ctx.calls.length > 3, `${def.id} r${rot} s${state} no dibujó nada`);
            }
          }
        }
      }
    }
  }
});

test('los furnis de pared se dibujan y quedan sobre su base', () => {
  for (const line of LINES) {
    for (const def of defsOf(line).filter((d) => d.kind === 'wall')) {
      const b = wallBounds(def);
      assert.ok(finiteBox(b), `${def.id} límites inválidos`);
      assert.ok(b.y + b.h <= 2, `${def.id} debe quedar arriba de su base`);
      // un halo de luz puede asomar un poco, pero el furni no debe invadir la casilla vecina
      assert.ok(b.x >= -8 && b.x + b.w <= def.w * 32 + 8, `${def.id} se sale de su ancho`);
      for (let state = 0; state < (def.states || 1); state++) {
        for (const color of [undefined, ...(def.colors || [])]) {
          for (const opts of [{ hover: true }, { direct: true }]) {
            const ctx = fakeCtx();
            drawWallItem(ctx, def, { type: def.id, rot: 2, state, color }, opts);
            assert.ok(ctx.calls.length > 3, `${def.id} s${state} no dibujó nada`);
          }
        }
      }
    }
  }
});

test('los íconos del catálogo se dibujan', () => {
  for (const line of LINES) {
    for (const def of defsOf(line)) {
      const ctx = fakeCtx();
      drawFurniIcon({ width: 64, height: 64, getContext: () => ctx }, def, def.colors?.[1]);
      assert.ok(ctx.calls.includes('setTransform'), def.id);
    }
  }
});
