// Líneas de furnis del Hotel: Oficina, Cristal, Castillo y Vintage.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { HOTEL_FURNI, HOTEL_CATS, FURNI_BY_ID } from '../shared/hotelCatalog.js';
import oficina from '../shared/hotelLines/oficina.js';
import cristal from '../shared/hotelLines/cristal.js';
import castillo from '../shared/hotelLines/castillo.js';
import vintage from '../shared/hotelLines/vintage.js';
import artOficina from '../client/src/hotel/art/lines/oficina.js';
import artCristal from '../client/src/hotel/art/lines/cristal.js';
import artCastillo from '../client/src/hotel/art/lines/castillo.js';
import artVintage from '../client/src/hotel/art/lines/vintage.js';
import { drawFurni, drawWallItem, furniBounds, wallBounds, drawFurniIcon } from '../client/src/hotel/furniArt.js';

const LINES = { oficina: [oficina, artOficina], cristal: [cristal, artCristal], castillo: [castillo, artCastillo], vintage: [vintage, artVintage] };
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

test('cada línea tiene entre 6 y 9 furnis con datos válidos', () => {
  const ids = new Set();
  for (const [line, [defs]] of Object.entries(LINES)) {
    assert.ok(defs.length >= 6 && defs.length <= 9, `${line}: ${defs.length} furnis`);
    assert.ok(defs.some((d) => d.kind === 'wall'), `${line} sin furni de pared`);
    for (const d of defs) {
      assert.equal(d.line, line, d.id);
      assert.ok(d.id.startsWith(line + '_'), `${d.id} sin prefijo`);
      assert.ok(!ids.has(d.id), `${d.id} repetido`); ids.add(d.id);
      assert.ok(CATS.has(d.cat), `${d.id} categoría ${d.cat}`);
      assert.ok(typeof d.name === 'string' && d.name.length > 2, d.id);
      assert.ok(Number.isInteger(d.price) && d.price >= 2 && d.price <= 60, `${d.id} precio ${d.price}`);
      assert.ok(!d.exclusive, `${d.id} no debe ser exclusivo`);
      assert.ok(['floor', 'wall'].includes(d.kind));
      assert.ok(d.rots.length >= 1 && d.rots.every((r) => [0, 2, 4, 6].includes(r)), d.id);
      if (d.interact) { assert.ok(INTERACT.has(d.interact), d.id); assert.ok(d.states >= 2, d.id); }
      if (d.sit != null) assert.ok(d.sit > 0 && d.sit <= d.h, d.id);
      if (d.colors) assert.ok(d.colors.every((c) => /^#[0-9a-f]{6}$/i.test(c)), d.id);
      assert.equal(FURNI_BY_ID[d.id], d, `${d.id} no está en el catálogo`);
    }
  }
  // nada choca con el catálogo base ni con otras líneas
  const all = HOTEL_FURNI.map((d) => d.id);
  assert.equal(new Set(all).size, all.length);
});

test('cada furni tiene su dibujo y su periodo es válido', () => {
  for (const [line, [defs, art]] of Object.entries(LINES)) {
    for (const d of defs) {
      if (d.kind === 'floor') assert.equal(typeof art.floor[d.id], 'function', `${d.id} sin dibujo de piso`);
      else assert.equal(typeof art.wall[d.id], 'function', `${d.id} sin dibujo de pared`);
    }
    for (const [id, fn] of Object.entries(art.period || {})) {
      const d = defs.find((x) => x.id === id);
      assert.ok(d, `${line}: periodo de ${id} sin furni`);
      for (let st = 0; st < d.states; st++) { const p = fn(st); assert.ok(p === 0 || (p >= 60 && p <= 5000), `${id} s${st} periodo ${p}`); }
    }
    for (const id of Object.keys(art.floor)) assert.ok(defs.some((d) => d.id === id && d.kind === 'floor'), `${id} dibujo sobrante`);
    for (const id of Object.keys(art.wall)) assert.ok(defs.some((d) => d.id === id && d.kind === 'wall'), `${id} dibujo sobrante`);
  }
});

test('todos se dibujan en cada rotación, estado y color sin tronar', () => {
  for (const [defs] of Object.values(LINES)) {
    for (const def of defs) {
      if (def.kind === 'wall') {
        const b = wallBounds(def);
        assert.ok(finiteBox(b), `${def.id} límites`);
        assert.ok(b.y + b.h <= 2, `${def.id} debe quedar arriba de su base`);
        for (let state = 0; state < def.states; state++) for (const color of [undefined, ...(def.colors || [])]) for (const rot of def.rots) {
          const ctx = fakeCtx();
          drawWallItem(ctx, def, { type: def.id, rot, state, color }, { hover: true });
          assert.ok(ctx.calls.length > 3, `${def.id} s${state} no dibujó`);
        }
        continue;
      }
      for (const rot of def.rots) {
        const b = furniBounds(def, rot);
        assert.ok(finiteBox(b), `${def.id} r${rot} límites`);
        const w = rot === 2 || rot === 6 ? def.l : def.w, l = rot === 2 || rot === 6 ? def.w : def.l;
        const cx = (w - l) * 16, cy = (w + l) * 8;
        assert.ok(cx >= b.x && cx <= b.x + b.w && cy >= b.y && cy <= b.y + b.h, `${def.id} r${rot} huella fuera`);
        for (let state = 0; state < def.states; state++) for (const color of [undefined, ...(def.colors || [])]) {
          for (const opts of [{ t: 0 }, { t: 1234, hover: true }, { t: 98765, ghost: true, tint: '#ff0000', direct: true }]) {
            const ctx = fakeCtx();
            drawFurni(ctx, def, { type: def.id, rot, state, color, x: 0, y: 0, z: 0 }, opts);
            assert.ok(ctx.calls.length > 5, `${def.id} r${rot} s${state} no dibujó`);
          }
        }
      }
    }
  }
});

test('las miniaturas del catálogo se dibujan', () => {
  for (const [defs] of Object.values(LINES)) for (const def of defs) {
    const ctx = fakeCtx();
    drawFurniIcon({ width: 64, height: 64, getContext: () => ctx }, def, def.colors?.[1]);
    assert.ok(ctx.calls.includes('setTransform'), def.id);
  }
});
