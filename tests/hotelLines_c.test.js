// Líneas del Hotel: Zen, Retro 70s, Cocina y Baño (definiciones y dibujo en todas sus rotaciones y estados).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { HOTEL_CATS, HOTEL_FURNI, HOTEL_LINES } from '../shared/hotelCatalog.js';
import zen from '../shared/hotelLines/zen.js';
import retro70 from '../shared/hotelLines/retro70.js';
import cocina from '../shared/hotelLines/cocina.js';
import bano from '../shared/hotelLines/bano.js';
import zenArt from '../client/src/hotel/art/lines/zen.js';
import retro70Art from '../client/src/hotel/art/lines/retro70.js';
import cocinaArt from '../client/src/hotel/art/lines/cocina.js';
import banoArt from '../client/src/hotel/art/lines/bano.js';
import { drawFurni, drawWallItem, furniBounds, wallBounds, drawFurniIcon } from '../client/src/hotel/furniArt.js';

const LINES = { zen: [zen, zenArt], retro70: [retro70, retro70Art], cocina: [cocina, cocinaArt], bano: [bano, banoArt] };
const CATS = new Set(HOTEL_CATS.map((c) => c.id));
const ALL = Object.values(LINES).flatMap(([defs]) => defs);

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

test('las líneas zen, retro70, cocina y baño están registradas y tienen 6–9 furnis', () => {
  for (const [id, [defs]] of Object.entries(LINES)) {
    assert.ok(HOTEL_LINES.some((l) => l.id === id), `${id} no está en HOTEL_LINES`);
    assert.ok(defs.length >= 6 && defs.length <= 9, `${id} tiene ${defs.length} furnis`);
    assert.ok(defs.some((d) => d.kind === 'wall'), `${id} sin furni de pared`);
    assert.ok(defs.some((d) => d.interact), `${id} sin furni interactivo`);
    for (const d of defs) assert.ok(HOTEL_FURNI.includes(d), `${d.id} no entró al catálogo`);
  }
});

test('cada definición es válida', () => {
  const ids = new Set(HOTEL_FURNI.map((d) => d.id));
  assert.equal(ids.size, HOTEL_FURNI.length, 'ids repetidos en el catálogo');
  for (const [line, [defs]] of Object.entries(LINES)) {
    for (const d of defs) {
      assert.equal(d.line, line, `${d.id} line`);
      assert.ok(d.id.startsWith(line + '_'), `${d.id} sin prefijo`);
      assert.ok(CATS.has(d.cat), `${d.id} cat inválida ${d.cat}`);
      assert.ok(typeof d.name === 'string' && d.name.length > 2, `${d.id} sin nombre`);
      assert.ok(Number.isInteger(d.price) && d.price >= 2 && d.price <= 60, `${d.id} precio ${d.price}`);
      assert.ok(!d.exclusive, `${d.id} no debe ser exclusivo`);
      assert.ok(['floor', 'wall'].includes(d.kind));
      assert.ok(d.w >= 1 && d.l >= 1 && Array.isArray(d.rots) && d.rots.length > 0);
      if (d.interact) assert.ok(['toggle', 'dice', 'teleport', 'gate'].includes(d.interact) && d.states >= 2, `${d.id} interact`);
      if (d.sit) assert.ok(d.sit > 0 && d.sit <= d.h, `${d.id} sit`);
      if (d.walk) assert.ok(d.h <= 0.05, `${d.id} walk debe ser plano`);
      for (const c of d.colors || []) assert.match(c, /^#[0-9a-f]{6}$/i, `${d.id} color ${c}`);
    }
  }
});

test('cada furni tiene su dibujo y periodo coherente', () => {
  for (const [, [defs, art]] of Object.entries(LINES)) {
    for (const d of defs) {
      if (d.kind === 'floor') assert.equal(typeof art.floor[d.id], 'function', `${d.id} sin dibujo de piso`);
      else assert.equal(typeof art.wall[d.id], 'function', `${d.id} sin dibujo de pared`);
    }
    for (const id of Object.keys(art.period || {})) {
      const d = defs.find((x) => x.id === id);
      assert.ok(d, `periodo de ${id} sin definición`);
      for (let st = 0; st < (d.states || 1); st++) { const p = art.period[id](st); assert.ok(Number.isFinite(p) && p >= 0); }
    }
    for (const id of Object.keys(art.floor)) assert.ok(defs.some((d) => d.id === id && d.kind === 'floor'), `dibujo huérfano ${id}`);
    for (const id of Object.keys(art.wall)) assert.ok(defs.some((d) => d.id === id && d.kind === 'wall'), `dibujo huérfano ${id}`);
  }
});

test('los furnis de piso se dibujan en cada rotación, estado y color', () => {
  for (const def of ALL.filter((d) => d.kind === 'floor')) {
    for (const rot of def.rots) {
      const b = furniBounds(def, rot);
      assert.ok(finiteBox(b), `${def.id} r${rot} límites inválidos`);
      const w = rot === 2 || rot === 6 ? def.l : def.w, l = rot === 2 || rot === 6 ? def.w : def.l;
      const cx = (w - l) * 16, cy = (w + l) * 8;
      assert.ok(cx >= b.x && cx <= b.x + b.w && cy >= b.y && cy <= b.y + b.h, `${def.id} r${rot} límites no encierran la huella`);
      for (let state = 0; state < (def.states || 1); state++) {
        for (const color of [undefined, ...(def.colors || [])]) {
          for (const opts of [{ t: 0 }, { t: 1234, hover: true }, { t: 98765, ghost: true, tint: '#ff0000' }]) {
            const ctx = fakeCtx();
            drawFurni(ctx, def, { type: def.id, rot, state, color, x: 0, y: 0, z: 0 }, opts);
            assert.ok(ctx.calls.length > 5, `${def.id} r${rot} s${state} no dibujó nada`);
          }
        }
      }
    }
  }
});

test('los furnis de pared se dibujan y quedan arriba de su base', () => {
  for (const def of ALL.filter((d) => d.kind === 'wall')) {
    const b = wallBounds(def);
    assert.ok(finiteBox(b), `${def.id} límites inválidos`);
    assert.ok(b.y + b.h <= 2, `${def.id} debe quedar arriba de su base`);
    assert.ok(b.x >= -8 && b.x + b.w <= def.w * 32 + 8, `${def.id} se sale de su ancho`);
    for (let state = 0; state < (def.states || 1); state++) {
      for (const rot of def.rots) {
        const ctx = fakeCtx();
        drawWallItem(ctx, def, { type: def.id, rot, state }, { hover: true });
        assert.ok(ctx.calls.length > 3, `${def.id} s${state} no dibujó nada`);
      }
    }
  }
});

test('las miniaturas del catálogo se dibujan', () => {
  for (const def of ALL) {
    const ctx = fakeCtx();
    drawFurniIcon({ width: 64, height: 64, getContext: () => ctx }, def, def.colors?.[1]);
    assert.ok(ctx.calls.includes('setTransform'));
  }
});
