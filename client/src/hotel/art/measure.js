// Mide el dibujo de un furni en su espacio de modelo (sin DOM): base, punto más alto y la superficie
// (asiento, colchón, cubierta) en un punto de la huella. Sirve para que def.h / def.sit / def.lay
// coincidan con lo que se ve: nada flota ni se hunde.
import { Scene } from './iso.js';
import { FLOOR, DEFAULT_COLOR } from './floor.js';
import { LINE_FLOOR, LINE_DEFAULT_COLOR } from './lines/index.js';

const colorOf = (def) => def.colors?.[0] || DEFAULT_COLOR[def.id] || LINE_DEFAULT_COLOR[def.id] || '#9aa3ad';

// Partes del dibujo en espacio de MODELO (rot 0): [{ box: [u0, v0, z0, u1, v1, z1], kind }]
export function artParts(def, state = 0) {
  const s = new Scene(def.w || 1, def.l || 1, 0);
  (FLOOR[def.id] || LINE_FLOOR[def.id] || FLOOR._fallback)(s, { c: colorOf(def), st: state, t: 0, def });
  return s.parts.map((p) => ({ box: p.box, kind: p.kind }));
}

// Punto de la huella (modelo) donde se apoya quien se sienta / acuesta / lo que se apila
export function surfacePoint(def) {
  const w = def.w || 1, l = def.l || 1;
  if (def.sit) return [w / 2, l * 0.62];
  if (def.lay) return [w / 2, l * 0.6];
  return [w / 2, l / 2];
}

// Lo más alto que se dibuja justo sobre (u, v) (con una tolerancia chiquita para postes delgados)
// Las piezas 'custom' (dibujo libre) solo traen una caja aproximada: cuentan solo si no hay otra cosa ahí.
export function surfaceAt(parts, u, v, r = 0.06) {
  let z = -Infinity, zc = -Infinity;
  for (const { box: b, kind } of parts) {
    if (!(b[0] - r <= u && b[3] + r >= u && b[1] - r <= v && b[4] + r >= v)) continue;
    if (kind === 'custom') zc = Math.max(zc, b[5]); else z = Math.max(z, b[5]);
  }
  return Math.max(z, zc);
}
// ¿lo más alto en ese punto es un dibujo libre? (su caja es aproximada: el asiento se revisa a ojo)
export function onlyCustomAt(parts, u, v, r = 0.06) {
  let z = -Infinity, zc = -Infinity;
  for (const { box: b, kind } of parts) {
    if (!(b[0] - r <= u && b[3] + r >= u && b[1] - r <= v && b[4] + r >= v)) continue;
    if (kind === 'custom') zc = Math.max(zc, b[5]); else z = Math.max(z, b[5]);
  }
  return zc > z;
}

// Resumen del dibujo de un furni de piso → { bottom, top, surface }
export function measureArt(def) {
  let bottom = Infinity, top = -Infinity, surface = -Infinity, custom = false;
  const [u, v] = surfacePoint(def);
  for (let st = 0; st < Math.max(1, def.states || 1); st++) {
    const parts = artParts(def, st);
    for (const { box: b } of parts) { bottom = Math.min(bottom, b[2]); top = Math.max(top, b[5]); }
    surface = Math.max(surface, surfaceAt(parts, u, v));
    custom = custom || onlyCustomAt(parts, u, v);
  }
  return { bottom, top, surface, custom };
}
