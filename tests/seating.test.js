// Pruebas de los asientos: hacia dónde mira quien se sienta y el cuadro de "sentado".
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { SEAT_TYPES, seatAt, seatDir, CATALOG } from '../shared/catalog.js';
import { renderFullSheet, normalizeSpec, frameCol, POSES, SIT_POSE, POSE_COL0, FULL_COLS, FRAME_W, FRAME_H } from '../shared/sprite.js';

describe('asientos', () => {
  test('todos los tipos de asiento existen en el catálogo y no son sólidos', () => {
    for (const type of Object.keys(SEAT_TYPES)) {
      assert.ok(CATALOG[type], type);
      assert.equal(CATALOG[type].solid, false, `${type} debe poder pisarse`);
    }
  });

  test('sillas: rot 0 mira arriba (al escritorio), 1 derecha, 2 abajo, 3 izquierda', () => {
    for (const type of ['chair', 'officeChair', 'gamingChair', 'confChair']) {
      assert.deepEqual([0, 1, 2, 3].map((rot) => seatDir({ type, rot })), ['up', 'right', 'down', 'left'], type);
    }
  });

  test('sofás, sillones y bancas: rot 0 mira abajo (respaldo atrás), 2 arriba, 1/3 de lado', () => {
    for (const type of ['sofa', 'sofaSmall', 'armchair', 'bench']) {
      assert.deepEqual([0, 1, 2, 3].map((rot) => seatDir({ type, rot })), ['down', 'right', 'up', 'left'], type);
    }
  });

  test('banco y puff también son asientos: el banco conserva la dirección, el puff mira abajo', () => {
    const f = { objects: [{ type: 'stool', x: 2, y: 3 }, { type: 'beanBag', x: 5, y: 3 }, { type: 'plant', x: 7, y: 3 }] };
    const st = seatAt(f, 2, 3);
    assert.ok(st, 'el banco es asiento');
    assert.equal(st.dir, null);
    assert.equal(st.obj.type, 'stool');
    assert.equal(seatAt(f, 5, 3)?.dir, 'down');
    assert.equal(seatAt(f, 7, 3), null);
    assert.equal(seatAt(f, 3, 3), null);
  });

  test('un sofá vertical (rot 1) ocupa sus 3 casillas y mira a la derecha', () => {
    const f = { objects: [{ type: 'sofaSmall', x: 4, y: 4, rot: 1 }] };
    for (const y of [4, 5, 6]) assert.equal(seatAt(f, 4, y)?.dir, 'right');
    assert.equal(seatAt(f, 5, 4), null);
  });
});

describe('cuadro de sentado', () => {
  const spec = normalizeSpec({ preset: 'dev' });
  const { data, width } = renderFullSheet(spec);
  const col = frameCol(0, SIT_POSE, FULL_COLS);
  const opaque = (c, row, y) => {
    let n = 0;
    for (let x = 0; x < FRAME_W; x++) if (data[((row * FRAME_H + y) * width + c * FRAME_W + x) * 4 + 3]) n++;
    return n;
  };

  test('la postura de sentado está en la hoja completa y las hojas de 3 columnas usan el cuadro normal', () => {
    assert.ok(POSES.includes(SIT_POSE));
    assert.equal(col, POSE_COL0 + POSES.indexOf(SIT_POSE));
    assert.equal(frameCol(0, SIT_POSE, 3), 0);
  });

  test('sentado, la cabeza queda más abajo que parado y los pies siguen en la fila 46', () => {
    const top = (c, row) => { for (let y = 0; y < FRAME_H; y++) if (opaque(c, row, y)) return y; return -1; };
    for (const row of [0, 1, 2, 3]) assert.ok(top(col, row) > top(0, row), `fila ${row}`);
    for (const row of [0, 1, 2]) assert.ok(opaque(col, row, 46) > 0, `pies en la fila ${row}`);
  });

  test('de lado, las rodillas van al frente: el regazo es más ancho que parado', () => {
    // fila 1 = mira a la izquierda; a la altura del muslo (fila 42) hay más píxeles que parado
    assert.ok(opaque(col, 1, 42) > opaque(0, 1, 42) + 4);
    assert.ok(opaque(col, 2, 42) > opaque(0, 2, 42) + 4);
  });
});
