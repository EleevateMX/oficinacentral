// Pruebas unitarias del código compartido (plantillas de mapa, catálogo y sprites).
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { TEMPLATES, getTemplate, composeFloor, isWalkable } from '../shared/map.js';
import { CATALOG, objSize, CHAIR_TYPES } from '../shared/catalog.js';
import { PRESETS, normalizeSpec, renderSheet, renderFullSheet, frameCol, POSES, FULL_COLS, SHEET_W, SHEET_H } from '../shared/sprite.js';

const templateIds = Object.keys(TEMPLATES);

// Problemas conocidos de las plantillas: se reportan como TODO sin romper la CI.
// Quitar la entrada en cuanto se corrija la plantilla.
const KNOWN_ISSUES = {};

// Estado jugable de una plantilla tal como lo arma el servidor al crear el piso
function floorOf(id) {
  const t = getTemplate(id);
  const objects = t.objects.map((o, i) => ({ ...o, id: i + 1 }));
  return { t, objects, f: composeFloor({ template: id, areas: t.areas, objects }) };
}

function tilesOf(o) {
  const { w, h } = objSize(o);
  const out = [];
  for (let j = Math.floor(o.y); j < Math.ceil(o.y + h); j++) {
    for (let i = Math.floor(o.x); i < Math.ceil(o.x + w); i++) out.push([i, j]);
  }
  return out;
}

function reachableFrom(f, start) {
  const seen = new Set([start.y * f.W + start.x]);
  const queue = [start];
  for (let head = 0; head < queue.length; head++) {
    const c = queue[head];
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const x = c.x + dx;
      const y = c.y + dy;
      if (isWalkable(f, x, y) && !seen.has(y * f.W + x)) {
        seen.add(y * f.W + x);
        queue.push({ x, y });
      }
    }
  }
  return seen;
}

// Casilla de la silla de un escritorio: la silla colocada en la fila de abajo
// o, si no tiene, la casilla central bajo el escritorio.
function chairTile(desk, objects) {
  const o = desk.object;
  const { w, h } = objSize(o);
  const chair = objects.find((c) => CHAIR_TYPES.includes(c.type)
    && c.y >= o.y + h && c.y < o.y + h + 1 && c.x >= o.x && c.x < o.x + w);
  if (chair) return { x: Math.floor(chair.x), y: Math.floor(chair.y) };
  return { x: Math.floor(o.x + w / 2), y: Math.floor(o.y + h) };
}

test('hay al menos una plantilla', () => {
  assert.ok(templateIds.length > 0);
});

for (const id of templateIds) {
  describe(`plantilla "${id}"`, () => {
    test('se construye con dimensiones, suelos, muros y spawn válidos', () => {
      const t = TEMPLATES[id].build();
      assert.ok(Number.isInteger(t.W) && t.W > 0);
      assert.ok(Number.isInteger(t.H) && t.H > 0);
      assert.equal(t.walls.length, t.H);
      assert.equal(t.floor.length, t.H);
      for (const row of t.walls) assert.equal(row.length, t.W);
      assert.ok(Array.isArray(t.objects) && t.objects.length > 0);
      assert.ok(Array.isArray(t.areas));
      const { f } = floorOf(id);
      assert.ok(isWalkable(f, t.spawn.x, t.spawn.y), `spawn ${t.spawn.x},${t.spawn.y} no es caminable`);
    });

    test('todos los tipos de objeto existen en el catálogo', () => {
      const missing = [...new Set(getTemplate(id).objects.map((o) => o.type).filter((t) => !CATALOG[t]))];
      assert.deepEqual(missing, []);
    });

    test('los objetos quedan dentro del mapa', () => {
      const t = getTemplate(id);
      const out = t.objects.filter((o) => {
        const { w, h } = objSize(o);
        return o.x < 0 || o.y < 0 || o.x + w > t.W || o.y + h > t.H;
      });
      assert.deepEqual(out.map((o) => `${o.type}@${o.x},${o.y}`), []);
    });

    test('ningún mueble sólido se encima con otro ni con un muro', { todo: KNOWN_ISSUES[id]?.overlaps }, () => {
      const { t, objects, f } = floorOf(id);
      const occupied = new Map();
      const problems = [];
      for (const o of objects) {
        if (!CATALOG[o.type]?.solid) continue;
        const label = `${o.type}@${o.x},${o.y}`;
        for (const [i, j] of tilesOf(o)) {
          if (t.walls[j]?.[i]) problems.push(`${label} sobre muro en ${i},${j}`);
          const k = j * f.W + i;
          if (occupied.has(k)) problems.push(`${label} se encima con ${occupied.get(k)} en ${i},${j}`);
          else occupied.set(k, label);
        }
      }
      assert.deepEqual(problems, []);
    });

    test('la silla de cada escritorio reclamable es alcanzable desde el spawn', (t) => {
      const { objects, f } = floorOf(id);
      if (!f.desks.length) return t.skip('la plantilla no tiene escritorios reclamables');
      const seen = reachableFrom(f, f.spawn);
      const unreachable = f.desks
        .map((d) => ({ d, c: chairTile(d, objects) }))
        .filter(({ c }) => !seen.has(c.y * f.W + c.x))
        .map(({ d, c }) => `${d.object.type}@${d.object.x},${d.object.y} (silla ${c.x},${c.y})`);
      assert.deepEqual(unreachable, []);
    });
  });
}

describe('sprites', () => {
  test('hay presets', () => {
    assert.ok(PRESETS.length > 0);
  });

  for (const p of PRESETS) {
    test(`preset "${p.id}" se normaliza y genera una hoja de ${SHEET_W}×${SHEET_H}`, () => {
      const spec = normalizeSpec({ preset: p.id });
      assert.equal(typeof spec, 'object');
      const again = normalizeSpec(spec);
      assert.deepEqual(again, spec, 'normalizar dos veces debe dar lo mismo');
      const data = renderSheet(spec);
      assert.ok(data instanceof Uint8ClampedArray);
      assert.equal(SHEET_W, 96);
      assert.equal(SHEET_H, 192);
      assert.equal(data.length, 96 * 192 * 4);
      let opaque = 0;
      for (let i = 3; i < data.length; i += 4) if (data[i]) opaque++;
      assert.ok(opaque > 0, 'la hoja no tiene píxeles visibles');
    });
  }

  test('hoja completa: empieza igual que la clásica y agrega caminar de 4 cuadros y posturas', () => {
    const spec = normalizeSpec({ preset: 'dev' });
    const classic = renderSheet(spec);
    const full = renderFullSheet(spec);
    assert.equal(full.width, 32 * FULL_COLS);
    assert.equal(full.height, 192);
    assert.equal(full.data.length, full.width * full.height * 4);
    // las 3 primeras columnas son idénticas a la hoja clásica
    for (let y = 0; y < 192; y += 3) for (let x = 0; x < 96; x++) {
      for (let k = 0; k < 4; k++) assert.equal(full.data[(y * full.width + x) * 4 + k], classic[(y * 96 + x) * 4 + k]);
    }
    // cada postura tiene píxeles y es distinta del cuadro quieto
    const frame = (col, row) => {
      const out = [];
      for (let y = 0; y < 48; y++) for (let x = 0; x < 32; x++) out.push(full.data[((row * 48 + y) * full.width + col * 32 + x) * 4 + 3] ? full.data[((row * 48 + y) * full.width + col * 32 + x) * 4] : -1);
      return out.join(',');
    };
    const idle = frame(0, 0);
    for (const p of POSES) assert.notEqual(frame(frameCol(0, p, FULL_COLS), 0), idle, `postura ${p}`);
  });

  test('frameCol: hojas subidas de 3 columnas usan los cuadros clásicos', () => {
    assert.deepEqual([0, 1, 2, 3, 4].map((s) => frameCol(s, null, 3)), [0, 1, 1, 2, 2]);
    assert.deepEqual([0, 1, 2, 3, 4].map((s) => frameCol(s, null, FULL_COLS)), [0, 1, 3, 2, 4]);
    assert.equal(frameCol(0, 'armsUp', 3), 0);
    assert.equal(frameCol(2, 'armsUp', 3), 1);
    assert.ok(frameCol(0, 'armsUp', FULL_COLS) >= 5);
    assert.equal(frameCol(0, 'no-existe', FULL_COLS), 0);
  });

  test('normalizeSpec tolera avatares vacíos o con datos inválidos', () => {
    const s = normalizeSpec({ hairStyle: 'no-existe', skin: 'rojo' });
    assert.equal(renderSheet(s).length, 96 * 192 * 4);
    assert.equal(renderSheet({}).length, 96 * 192 * 4);
  });
});
