// Dibujo de furnis del Hotel: corre todos los furnis × rotaciones × estados × colores sobre un contexto 2D falso.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { HOTEL_FURNI } from '../shared/hotelCatalog.js';
import { drawFurni, drawWallItem, furniBounds, wallBounds, rotFacing, drawFurniIcon } from '../client/src/hotel/furniArt.js';

// Contexto falso: registra las llamadas y truena si recibe números no finitos
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

test('todos los furnis de piso se dibujan en cada rotación, estado y color', () => {
  for (const def of HOTEL_FURNI.filter((d) => d.kind === 'floor')) {
    for (const rot of def.rots) {
      const b = furniBounds(def, rot);
      assert.ok(finiteBox(b), `${def.id} r${rot} límites inválidos`);
      for (let state = 0; state < (def.states || 1); state++) {
        for (const color of [undefined, ...(def.colors || [])]) {
          for (const opts of [{ t: 0 }, { t: 1234, hover: true }, { t: 777, ghost: true, tint: '#ff0000' }]) {
            const ctx = fakeCtx();
            drawFurni(ctx, def, { type: def.id, rot, state, color, x: 0, y: 0, z: 0 }, opts);
            assert.ok(ctx.calls.length > 5, `${def.id} r${rot} s${state} no dibujó nada`);
          }
        }
      }
    }
  }
});

test('los furnis de pared se dibujan y sus límites son finitos', () => {
  for (const def of HOTEL_FURNI.filter((d) => d.kind === 'wall')) {
    const b = wallBounds(def);
    assert.ok(finiteBox(b), `${def.id} límites inválidos`);
    assert.ok(b.y + b.h <= 2, `${def.id} debe quedar arriba de su base`);
    for (let state = 0; state < (def.states || 1); state++) {
      for (const color of [undefined, ...(def.colors || [])]) {
        const ctx = fakeCtx();
        drawWallItem(ctx, def, { type: def.id, rot: 2, state, color }, { hover: true });
        assert.ok(ctx.calls.length > 3, `${def.id} s${state} no dibujó nada`);
      }
    }
  }
});

test('los límites encierran la huella y son estables', () => {
  for (const def of HOTEL_FURNI.filter((d) => d.kind === 'floor')) {
    for (const rot of def.rots) {
      const b = furniBounds(def, rot);
      const w = rot === 2 || rot === 6 ? def.l : def.w, l = rot === 2 || rot === 6 ? def.w : def.l;
      // el centro de la huella cae dentro del rectángulo
      const cx = (w - l) * 16, cy = (w + l) * 8;
      assert.ok(cx >= b.x && cx <= b.x + b.w && cy >= b.y && cy <= b.y + b.h, `${def.id} r${rot}`);
      assert.deepEqual(furniBounds(def, rot), b);
    }
  }
});

test('rotFacing sigue la convención 0:+y, 2:−x, 4:−y, 6:+x', () => {
  assert.deepEqual(rotFacing(0), { dx: 0, dy: 1 });
  assert.deepEqual(rotFacing(2), { dx: -1, dy: 0 });
  assert.deepEqual(rotFacing(4), { dx: 0, dy: -1 });
  assert.deepEqual(rotFacing(6), { dx: 1, dy: 0 });
});

test('drawFurniIcon funciona con un canvas falso', () => {
  for (const def of HOTEL_FURNI) {
    const ctx = fakeCtx();
    drawFurniIcon({ width: 64, height: 64, getContext: () => ctx }, def, def.colors?.[1]);
    assert.ok(ctx.calls.includes('setTransform'));
  }
});
