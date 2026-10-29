// Modelos 3D hechos con cajas y figuras simples (arte original, todo por código).
// - Mesher: junta muchas cajas de colores en una sola geometría (una llamada de dibujo).
// - Horde: todos los zombis comunes con InstancedMesh (una llamada por parte del cuerpo).
// - Jefes, el personaje del compañero (versión de cubos de su avatar) y las armas en primera persona.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _s = new THREE.Vector3(), _p = new THREE.Vector3();
const _c = new THREE.Color();

const prep = (g) => { const n = g.index ? g.toNonIndexed() : g; n.deleteAttribute('uv'); return n; };
export const GEO = {
  box: prep(new THREE.BoxGeometry(1, 1, 1)),
  cyl: prep(new THREE.CylinderGeometry(0.5, 0.5, 1, 12)),
  cyl6: prep(new THREE.CylinderGeometry(0.5, 0.5, 1, 6)),
  cone: prep(new THREE.ConeGeometry(0.5, 1, 8)),
  ball: prep(new THREE.IcosahedronGeometry(0.5, 1)),
  torus: prep(new THREE.TorusGeometry(0.35, 0.15, 6, 12)),
};

// ---------- Geometría combinada con colores por vértice ----------
export class Mesher {
  constructor() { this.parts = { lit: [], glow: [], glass: [] }; this.base = new THREE.Matrix4(); }
  place(x, z, ry = 0, y = 0) { this.base.compose(_p.set(x, y, z), _q.setFromEuler(_e.set(0, ry, 0)), _s.set(1, 1, 1)); return this; }
  add(geo, x, y, z, sx, sy, sz, color, { rx = 0, ry = 0, rz = 0, mat = 'lit' } = {}) {
    _m.compose(_p.set(x, y, z), _q.setFromEuler(_e.set(rx, ry, rz)), _s.set(sx, sy, sz));
    const g = geo.clone();
    g.applyMatrix4(new THREE.Matrix4().multiplyMatrices(this.base, _m));
    const n = g.attributes.position.count;
    const col = new Float32Array(n * 3);
    _c.set(color);
    for (let i = 0; i < n; i++) { col[i * 3] = _c.r; col[i * 3 + 1] = _c.g; col[i * 3 + 2] = _c.b; }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    this.parts[mat].push(g);
    return this;
  }
  // y = base (abajo) de la pieza
  box(w, h, d, x, y, z, color, o) { return this.add(GEO.box, x, y + h / 2, z, w, h, d, color, o); }
  cyl(r, h, x, y, z, color, o, geo = GEO.cyl) { return this.add(geo, x, y + h / 2, z, r * 2, h, r * 2, color, o); }
  ball(r, x, y, z, color, o, sy = 1) { return this.add(GEO.ball, x, y, z, r * 2, r * 2 * sy, r * 2, color, o); }
  cone(r, h, x, y, z, color, o) { return this.add(GEO.cone, x, y + h / 2, z, r * 2, h, r * 2, color, o); }
  build({ lit, glow, glass }) {
    const out = [];
    const mk = (list, mat) => {
      if (!list.length) return;
      // en tandas para no hacer búferes gigantes
      for (let i = 0; i < list.length; i += 4000) {
        const g = mergeGeometries(list.slice(i, i + 4000));
        out.push(new THREE.Mesh(g, mat));
      }
    };
    mk(this.parts.lit, lit); mk(this.parts.glow, glow); mk(this.parts.glass, glass);
    for (const g of [...this.parts.lit, ...this.parts.glow, ...this.parts.glass]) g.dispose();
    return out;
  }
}

// ---------- Muebles de la oficina ----------
// Cada modelo se arma en su marco local: ancho w (X), fondo d (Z), el frente mira a +Z.
const shade = (hex, amt) => { _c.set(hex || '#888888'); const h = {}; _c.getHSL(h); _c.setHSL(h.h, h.s, Math.max(0, Math.min(1, h.l + amt))); return '#' + _c.getHexString(); };
const LEG = '#2b2f3a', METAL = '#9aa3ad', DARK = '#1d1f26', SCREEN = '#5ec8ff';

function legs(m, w, d, h, col = LEG, t = 0.06) {
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) m.box(t, h, t, sx * (w / 2 - t), 0, sz * (d / 2 - t), col);
}
function deskModel(m, w, d, col, opts = {}) {
  const top = 0.76;
  m.box(w, 0.05, d * 0.86, 0, top - 0.05, -d * 0.04, col);
  if (opts.panel) { m.box(0.05, top - 0.05, d * 0.8, -w / 2 + 0.05, 0, -d * 0.04, shade(col, -0.12)); m.box(0.05, top - 0.05, d * 0.8, w / 2 - 0.05, 0, -d * 0.04, shade(col, -0.12)); m.box(w - 0.1, 0.4, 0.04, 0, 0.3, -d * 0.42, shade(col, -0.16)); }
  else legs(m, w, d * 0.8, top - 0.05, opts.leg || LEG);
  if (opts.glowEdge) m.box(w * 0.98, 0.02, 0.02, 0, top - 0.06, d * 0.39, opts.glowEdge, { mat: 'glow' });
  m.box(w * 0.25, 0.5, d * 0.5, w * 0.3, 0.05, -d * 0.1, shade(col, -0.2)); // cajonera
  return top;
}
function seat(m, w, d, col, { back = 0.5, h = 0.46, base = 'star', arms = false } = {}) {
  const sw = Math.min(w, 0.55), sd = Math.min(d, 0.55);
  m.box(sw, 0.09, sd, 0, h - 0.09, 0, col);
  if (back) m.box(sw, back, 0.08, 0, h, -sd / 2 + 0.04, shade(col, -0.06));
  if (arms) for (const s of [-1, 1]) m.box(0.06, 0.2, sd * 0.8, s * (sw / 2 - 0.03), h, 0, shade(col, -0.1));
  if (base === 'star') { m.cyl(0.04, h - 0.12, 0, 0.06, 0, METAL); m.box(0.5, 0.05, 0.08, 0, 0.03, 0, DARK); m.box(0.08, 0.05, 0.5, 0, 0.03, 0, DARK); }
  else legs(m, sw, sd, h - 0.09, LEG, 0.04);
}
function sofaModel(m, w, d, col, { arms = true } = {}) {
  const dd = Math.min(d, 1.0);
  m.box(w, 0.42, dd, 0, 0, 0, shade(col, -0.08));
  m.box(w - (arms ? 0.3 : 0), 0.14, dd * 0.75, 0, 0.42, dd * 0.1, col); // cojines
  const n = Math.max(1, Math.round(w / 0.9));
  for (let k = 1; k < n; k++) m.box(0.015, 0.145, dd * 0.75, -w / 2 + (w / n) * k, 0.42, dd * 0.1, shade(col, -0.2));
  m.box(w, 0.48, 0.22, 0, 0.42, -dd / 2 + 0.11, shade(col, -0.04)); // respaldo
  if (arms) for (const s of [-1, 1]) m.box(0.16, 0.28, dd, s * (w / 2 - 0.08), 0.42, 0, shade(col, -0.12));
}
function plantModel(m, w, d, { tall = 1, leaf = '#3f9a4a', pot = '#c99c72' } = {}) {
  const r = Math.min(w, d) * 0.28;
  m.cyl(r, 0.38, 0, 0, 0, pot, undefined, GEO.cyl6);
  m.cyl(r * 0.9, 0.04, 0, 0.36, 0, '#4a3020');
  const H = 0.5 + tall * 0.9;
  m.cyl(0.03, H * 0.6, 0, 0.38, 0, '#5b3b22');
  for (let k = 0; k < 5; k++) {
    const a = k * 2.4, rr = r * (0.9 + (k % 2) * 0.5);
    m.ball(r * 1.15, Math.cos(a) * rr * 0.6, 0.38 + H * (0.45 + (k / 5) * 0.55), Math.sin(a) * rr * 0.6, k % 2 ? leaf : shade(leaf, 0.08));
  }
}
function shelfModel(m, w, d, col = '#8a5a3c', h = 1.85) {
  const dd = Math.min(d, 0.45);
  const z = -d / 2 + dd / 2;
  m.box(w, h, 0.03, 0, 0, z - dd / 2 + 0.015, shade(col, -0.15));
  for (const s of [-1, 1]) m.box(0.05, h, dd, s * (w / 2 - 0.025), 0, z, col);
  const BOOK = ['#e63946', '#3a86ff', '#ffd23f', '#2bb673', '#9b5de5', '#f4a261', '#e8e8ee'];
  for (let k = 0; k < 4; k++) {
    const y = 0.08 + k * (h / 4);
    m.box(w - 0.1, 0.03, dd, 0, y, z, col);
    let x = -w / 2 + 0.1, i = k * 3;
    while (x < w / 2 - 0.15) {
      const bw = 0.06 + ((i * 37) % 5) * 0.012, bh = h / 4 * (0.55 + ((i * 13) % 4) * 0.08);
      if ((i * 7) % 9 !== 0) m.box(bw, bh, dd * 0.8, x + bw / 2, y + 0.03, z, BOOK[i % BOOK.length]);
      x += bw + 0.01; i++;
    }
  }
}
function screenModel(m, w, h, y, z, frame = DARK, seed = 0) {
  m.box(w, h, 0.06, 0, y, z, frame);
  m.box(w - 0.08, h - 0.08, 0.01, 0, y + 0.04, z + 0.031, [SCREEN, '#ff7ab6', '#8B7BFF', '#4ee1a0'][seed % 4], { mat: 'glow' });
}
function arcadeModel(m, w, d, col, { marquee = '#ffd23f', screen = '#58c9e8', zombie = false } = {}) {
  const W = Math.min(w, 0.95), D = Math.min(d, 0.9);
  m.box(W, 1.75, D * 0.7, 0, 0, -D * 0.12, col);
  m.box(W * 0.94, 0.25, D * 0.5, 0, 0.95, D * 0.15, shade(col, -0.15)); // tablero
  m.box(W * 0.94, 0.04, D * 0.5, 0, 1.2, D * 0.15, zombie ? '#1b2a1b' : '#c9b6ff');
  for (let k = 0; k < 4; k++) m.cyl(0.03, 0.04, -0.2 + k * 0.12, 1.22, D * 0.18, ['#e63946', '#3a86ff', '#ffd23f', '#2bb673'][k]);
  m.box(0.03, 0.12, 0.03, -0.32, 1.22, D * 0.18, DARK);
  m.box(W * 0.8, 0.5, 0.02, 0, 1.25, D * 0.23, screen, { mat: 'glow', rx: -0.2 });
  m.box(W, 0.3, D * 0.6, 0, 1.75, -D * 0.06, shade(col, -0.1));
  m.box(W * 0.9, 0.22, 0.02, 0, 1.79, D * 0.24, marquee, { mat: 'glow' });
  if (zombie) {
    // mano verde saliendo de la marquesina
    const g = '#6fdc4f';
    m.box(0.16, 0.2, 0.1, 0, 2.05, D * 0.05, g);
    for (let k = 0; k < 4; k++) m.box(0.035, 0.13, 0.035, -0.06 + k * 0.04, 2.25, D * 0.05, shade(g, -0.06), { rz: (k - 1.5) * 0.12 });
    m.box(0.04, 0.1, 0.04, 0.11, 2.12, D * 0.05, g, { rz: -0.8 });
    m.box(0.22, 0.12, 0.12, 0, 1.93, D * 0.05, '#3d2b1f'); // tierra
  }
  m.box(W * 0.3, 0.16, 0.02, 0, 0.35, D * 0.24, DARK);
  m.box(0.05, 0.08, 0.01, -0.05, 0.38, D * 0.25, '#e63946', { mat: 'glow' });
}

// tipo → modelo. Regresa la altura de la superficie (para poner cosas encima) o 0.
export const FURNITURE = {
  desk: (m, w, d, c) => deskModel(m, w, d, c),
  standingDesk: (m, w, d, c) => deskModel(m, w, d, c, { leg: '#cfd4da' }),
  gamingDesk: (m, w, d, c) => deskModel(m, w, d, c, { glowEdge: '#FE3377' }),
  woodDesk: (m, w, d, c) => deskModel(m, w, d, c, { panel: true }),
  glassDesk: (m, w, d, c) => { m.box(w, 0.04, d * 0.86, 0, 0.72, -d * 0.04, '#bfe3f2', { mat: 'glass' }); legs(m, w, d * 0.8, 0.72, METAL); return 0.76; },
  cubicle: (m, w, d, c) => { const t = deskModel(m, w, d, c); m.box(w, 1.25, 0.05, 0, 0, -d / 2 + 0.03, shade(c, -0.1)); return t; },
  cubicleWalls: (m, w, d, c) => { m.box(w, 1.3, 0.05, 0, 0, -d / 2 + 0.03, c); for (const s of [-1, 1]) m.box(0.05, 1.3, d * 0.7, s * (w / 2 - 0.03), 0, -d * 0.15, shade(c, -0.08)); },
  chair: (m, w, d, c) => seat(m, w, d, c),
  officeChair: (m, w, d, c) => seat(m, w, d, c, { back: 0.75 }),
  gamingChair: (m, w, d, c) => { seat(m, w, d, c, { back: 0.85, arms: true }); m.box(0.3, 0.6, 0.02, 0, 0.6, -0.22, DARK); },
  confChair: (m, w, d, c) => seat(m, w, d, c, { base: 'legs', back: 0.4 }),
  stool: (m, w, d, c) => { m.cyl(0.18, 0.06, 0, 0.6, 0, c); m.cyl(0.03, 0.6, 0, 0, 0, METAL); m.cyl(0.16, 0.03, 0, 0, 0, DARK); },
  armchair: (m, w, d, c) => sofaModel(m, Math.min(w, 0.95), d, c),
  sofa: (m, w, d, c) => sofaModel(m, w, d, c),
  sofaSmall: (m, w, d, c) => sofaModel(m, w, d, c),
  lSofa: (m, w, d, c) => { sofaModel(m, w, Math.min(d, 1), c); m.box(1, 0.42, d - 1, -w / 2 + 0.5, 0, 0.5, shade(c, -0.08)); m.box(0.9, 0.14, d - 1, -w / 2 + 0.5, 0.42, 0.5, c); },
  bench: (m, w, d) => { m.box(w, 0.06, 0.4, 0, 0.42, 0, '#a0673f'); legs(m, w, 0.4, 0.42, DARK); },
  beanBag: (m, w, d, c) => { m.ball(0.42, 0, 0.26, 0, c, undefined, 0.62); m.ball(0.3, 0, 0.36, -0.14, shade(c, -0.08), undefined, 0.8); },
  table: (m, w, d, c) => { m.box(w, 0.06, d * 0.9, 0, 0.7, 0, c); legs(m, w * 0.95, d * 0.85, 0.7); return 0.76; },
  meetingTable: (m, w, d, c) => { m.box(w, 0.07, d * 0.85, 0, 0.7, 0, c); m.box(w * 0.6, 0.7, 0.3, 0, 0, 0, shade(c, -0.25)); return 0.77; },
  confTable: (m, w, d, c) => { m.box(w, 0.07, d * 0.8, 0, 0.7, 0, c); for (const s of [-0.35, 0, 0.35]) m.box(0.3, 0.7, d * 0.4, s * w, 0, 0, shade(c, -0.25)); return 0.77; },
  roundTable: (m, w, d, c) => { const r = Math.min(w, d) * 0.48; m.cyl(r, 0.05, 0, 0.7, 0, c); m.cyl(0.05, 0.7, 0, 0, 0, METAL); m.cyl(r * 0.5, 0.03, 0, 0, 0, DARK); return 0.75; },
  reception: (m, w, d, c) => { m.box(w, 1.05, d * 0.7, 0, 0, 0, c); m.box(w, 0.05, d * 0.8, 0, 1.05, 0, '#e8e8ee'); m.box(w * 0.9, 0.04, 0.02, 0, 0.5, d * 0.35, '#FE3377', { mat: 'glow' }); return 1.1; },
  bookshelf: (m, w, d) => shelfModel(m, w, d, '#8a5a3c'),
  shelf: (m, w, d) => shelfModel(m, w, d, '#cfd4da', 1.4),
  plantShelf: (m, w, d) => { shelfModel(m, w, d, '#c99c72', 1.2); for (const x of [-0.4, 0.4]) m.ball(0.2, x, 1.32, -0.1, '#3f9a4a'); },
  cabinet: (m, w, d, c) => { m.box(w * 0.7, 1.25, d * 0.6, 0, 0, -d * 0.15, c); for (let k = 0; k < 3; k++) m.box(w * 0.3, 0.03, 0.02, 0, 0.3 + k * 0.4, d * 0.16, METAL); },
  trophyCase: (m, w, d, c) => { m.box(w, 1.8, d * 0.5, 0, 0, -d * 0.2, shade(c || '#c8aa6e', -0.25)); m.box(w * 0.9, 1.5, 0.02, 0, 0.2, d * 0.06, '#bfe3f2', { mat: 'glass' }); for (let k = 0; k < 3; k++) m.cyl(0.07, 0.22, -0.5 + k * 0.5, 1.0, -0.2, '#FFCC00'); return 0; },
  whiteboard: (m, w, d) => { m.box(w * 0.9, 1.05, 0.04, 0, 0.85, -d / 2 + 0.1, '#f4f6f8'); m.box(w * 0.9, 0.05, 0.08, 0, 0.82, -d / 2 + 0.12, METAL); for (const s of [-1, 1]) m.box(0.04, 1.9, 0.04, s * w * 0.44, 0, -d / 2 + 0.08, METAL); m.box(w * 0.3, 0.02, 0.01, -w * 0.15, 1.5, -d / 2 + 0.125, '#3a86ff'); m.box(w * 0.4, 0.02, 0.01, 0.1, 1.35, -d / 2 + 0.125, '#e63946'); },
  noticeBoard: (m, w, d) => { m.box(w * 0.9, 0.9, 0.04, 0, 1.0, -d / 2 + 0.06, '#c58f5b'); for (let k = 0; k < 6; k++) m.box(0.22, 0.26, 0.01, -w * 0.35 + k * w * 0.14, 1.25 - (k % 2) * 0.35, -d / 2 + 0.085, ['#ffd23f', '#fff', '#8ecae6', '#f15bb5'][k % 4]); },
  easel: (m, w, d) => { m.box(0.7, 0.9, 0.03, 0, 0.8, 0, '#f4f6f8', { rx: -0.12 }); for (const s of [-1, 1]) m.box(0.04, 1.7, 0.04, s * 0.32, 0, 0.05, '#a0673f', { rz: s * 0.08 }); },
  tv: (m, w, d) => { screenModel(m, w * 0.8, 0.75, 1.2, -d / 2 + 0.06, DARK, 1); },
  bigScreen: (m, w, d, c) => { screenModel(m, w * 0.92, 1.45, 0.75, -d / 2 + 0.06, c || DARK, 2); m.box(w * 0.5, 0.75, 0.3, 0, 0, -d / 2 + 0.2, DARK); },
  fridge: (m, w, d) => { m.box(w * 0.8, 1.85, d * 0.7, 0, 0, -d * 0.1, '#e9edf2'); m.box(0.03, 0.4, 0.03, w * 0.3, 1.1, d * 0.26, METAL); m.box(w * 0.8, 0.01, 0.01, 0, 1.25, d * 0.26, '#b9c1cc'); },
  counter: (m, w, d, c) => { m.box(w, 0.9, d * 0.7, 0, 0, -d * 0.1, c || '#d9dde2'); m.box(w, 0.05, d * 0.8, 0, 0.9, -d * 0.1, '#3a3f4b'); return 0.95; },
  coffee: (m, w, d) => { m.box(w * 0.9, 0.9, d * 0.6, 0, 0, -d * 0.15, '#3a3f4b'); m.box(0.35, 0.45, 0.3, -0.3, 0.9, -d * 0.15, '#1d1f26'); m.box(0.08, 0.04, 0.01, -0.3, 1.2, -d * 0.15 + 0.15, '#ff4655', { mat: 'glow' }); m.cyl(0.05, 0.1, -0.3, 0.92, 0, '#fff'); return 0.9; },
  watercooler: (m, w, d) => { m.box(0.35, 0.95, 0.35, 0, 0, 0, '#e9edf2'); m.cyl(0.16, 0.45, 0, 0.95, 0, '#8ecae6', { mat: 'glass' }); },
  vending: (m, w, d, c) => { m.box(w * 0.92, 1.9, d * 0.8, 0, 0, -d * 0.05, c); m.box(w * 0.6, 1.3, 0.02, -w * 0.1, 0.45, d * 0.36, '#bfe3f2', { mat: 'glow' }); for (let r = 0; r < 4; r++) for (let k = 0; k < 3; k++) m.box(0.12, 0.14, 0.02, -w * 0.3 + k * 0.17, 0.6 + r * 0.3, d * 0.37, ['#ffd23f', '#e63946', '#2bb673', '#3a86ff'][(r + k) % 4], { mat: 'glow' }); },
  arcade: (m, w, d, c) => arcadeModel(m, w, d, c),
  zombieArcade: (m, w, d, c) => arcadeModel(m, w, d, c || '#1f3b24', { marquee: '#7CFF4F', screen: '#2c8a3c', zombie: true }),
  jukebox: (m, w, d, c) => { m.box(w * 0.8, 1.45, d * 0.6, 0, 0, -d * 0.1, c); m.cyl(w * 0.4, d * 0.6, 0, 1.25, -d * 0.1, shade(c, 0.1), { rx: Math.PI / 2 }); m.box(w * 0.6, 0.5, 0.02, 0, 0.75, d * 0.21, '#ffd23f', { mat: 'glow' }); },
  poolTable: (m, w, d, c) => { m.box(w, 0.18, d, 0, 0.62, 0, '#6b3f22'); m.box(w - 0.24, 0.02, d - 0.24, 0, 0.8, 0, c); legs(m, w * 0.9, d * 0.8, 0.62, '#4a2b17', 0.14); for (let k = 0; k < 6; k++) m.ball(0.035, -0.6 + k * 0.17, 0.85, (k % 2) * 0.12 - 0.06, ['#ffd23f', '#3a86ff', '#e63946', '#9b5de5', '#f4a261', '#fff'][k]); return 0; },
  pingPong: (m, w, d, c) => { m.box(w, 0.05, d, 0, 0.74, 0, c); m.box(w, 0.006, 0.03, 0, 0.79, 0, '#fff'); m.box(0.03, 0.006, d, 0, 0.79, 0, '#fff'); m.box(0.02, 0.15, d, 0, 0.79, 0, '#e8e8ee', { mat: 'glass' }); legs(m, w * 0.9, d * 0.8, 0.74); },
  foosball: (m, w, d) => { m.box(w * 0.9, 0.3, d * 0.6, 0, 0.6, 0, '#7a4a2b'); m.box(w * 0.8, 0.02, d * 0.5, 0, 0.9, 0, '#3f9a4a'); for (let k = 0; k < 8; k++) m.cyl(0.015, d * 0.9, -w * 0.35 + k * w * 0.1, 0.95, 0, METAL, { rx: Math.PI / 2 }); legs(m, w * 0.8, d * 0.5, 0.6, DARK, 0.1); },
  drum: (m) => { m.cyl(0.3, 0.45, 0, 0.1, 0, '#e63946'); m.cyl(0.29, 0.02, 0, 0.55, 0, '#f4f6f8'); legs(m, 0.5, 0.5, 0.15, METAL, 0.03); },
  plant: (m, w, d) => plantModel(m, w, d),
  tallPlant: (m, w, d) => plantModel(m, w, d, { tall: 1.6 }),
  floorPlant: (m, w, d) => plantModel(m, w, d, { tall: 1.3, leaf: '#2f8a4a' }),
  fern: (m, w, d) => plantModel(m, w, d, { tall: 0.4, leaf: '#5aa83c' }),
  bamboo: (m, w, d) => { m.cyl(0.25, 0.3, 0, 0, 0, '#c99c72'); for (let k = 0; k < 4; k++) m.cyl(0.03, 1.6 + k * 0.1, -0.1 + (k % 2) * 0.2, 0.3, -0.1 + (k >> 1) * 0.2, '#7cb342'); },
  tree2: (m, w, d) => { m.cyl(0.4, 0.5, 0, 0, 0, '#c99c72'); m.cyl(0.08, 1.4, 0, 0.5, 0, '#5b3b22'); for (let k = 0; k < 6; k++) m.ball(0.55, Math.cos(k) * 0.4, 1.7 + (k % 3) * 0.25, Math.sin(k) * 0.4, k % 2 ? '#3f9a4a' : '#4caf50'); },
  planter: (m, w, d, c) => { m.box(w * 0.95, 0.5, d * 0.7, 0, 0, 0, c); for (let k = 0; k < 4; k++) m.ball(0.3, -w * 0.35 + k * w * 0.23, 0.65, 0, k % 2 ? '#3f9a4a' : '#57b35a'); },
  hedge: (m, w, d) => m.box(w * 0.95, 0.9, d * 0.8, 0, 0, 0, '#3f8a3f'),
  bush: (m) => m.ball(0.5, 0, 0.45, 0, '#3f8a3f', undefined, 0.9),
  aquarium: (m, w, d) => { m.box(w * 0.9, 0.7, d * 0.6, 0, 0, 0, DARK); m.box(w * 0.88, 0.6, d * 0.55, 0, 0.7, 0, '#3fa7d6', { mat: 'glow' }); m.box(w * 0.9, 0.05, d * 0.6, 0, 1.3, 0, DARK); return 0; },
  serverRack: (m, w, d) => { m.box(w * 0.7, 2, d * 0.7, 0, 0, 0, '#22252d'); for (let k = 0; k < 8; k++) m.box(w * 0.5, 0.02, 0.01, 0, 0.3 + k * 0.2, d * 0.351, k % 3 ? '#2bb673' : '#3a86ff', { mat: 'glow' }); },
  robotArm: (m) => { m.cyl(0.25, 0.2, 0, 0, 0, '#ffb703'); m.box(0.12, 0.8, 0.12, 0, 0.2, 0, '#ffb703', { rz: 0.3 }); m.box(0.1, 0.6, 0.1, 0.25, 0.9, 0, '#3a3f4b', { rz: -0.9 }); },
  barrel: (m) => { m.cyl(0.36, 0.9, 0, 0, 0, '#8b5a2b'); for (const y of [0.15, 0.7]) m.cyl(0.37, 0.05, 0, y, 0, '#3a3f4b'); },
  fireplace: (m, w, d) => { m.box(w, 1.3, d * 0.6, 0, 0, -d * 0.2, '#8c3d38'); m.box(w * 0.5, 0.5, 0.02, 0, 0.15, d * 0.11, '#ff9d2e', { mat: 'glow' }); },
  voxelBlock: (m, w, d, c) => { m.box(w * 0.98, 0.98 * 1.25, d * 0.98, 0, 0, 0, c); m.box(w * 0.98, 0.2, d * 0.98, 0, 1.03, 0, shade(c, 0.12)); },
  stage: (m, w, d, c) => { m.box(w, 0.3, d, 0, 0, 0, '#26262e'); m.box(w, 0.03, 0.04, 0, 0.27, d / 2, c || '#FE3377', { mat: 'glow' }); return 0.3; },
  stageMic: (m) => { m.cyl(0.02, 1.5, 0, 0, 0, METAL); m.ball(0.05, 0, 1.55, 0, DARK); },
  coatRack: (m) => { m.cyl(0.03, 1.8, 0, 0, 0, '#5b3b22'); m.ball(0.18, 0, 1.6, 0, '#3a86ff', undefined, 1.3); },
  wavingFlag: (m, w, d, c) => { m.cyl(0.025, 2.3, 0, 0, 0, METAL); m.box(0.7, 0.45, 0.02, 0.36, 1.75, 0, c || '#FE3377'); },
  logoTotem: (m, w, d, c) => { m.box(0.5, 1.9, 0.4, 0, 0, 0, '#141414'); m.box(0.4, 0.4, 0.02, 0, 1.3, 0.21, c || '#FE3377', { mat: 'glow' }); },
  rollupBanner: (m, w, d, c) => { m.box(0.8, 1.9, 0.03, 0, 0.05, 0, c || '#FE3377'); m.box(0.85, 0.08, 0.2, 0, 0, 0, METAL); },
  photocall: (m, w, d, c) => m.box(w, 2.1, 0.05, 0, 0, -d / 2 + 0.05, c || '#FE3377'),
  hotelElevator: (m, w, d) => { m.box(w, 2.3, 0.2, 0, 0, -d / 2 + 0.1, '#9aa3ad'); m.box(w * 0.8, 2.0, 0.02, 0, 0, -d / 2 + 0.21, '#cfd4da'); m.box(0.02, 2.0, 0.03, 0, 0, -d / 2 + 0.22, '#6b7a77'); },
};
// Superficies conocidas (para lo que va encima de los escritorios)
export const SURFACE = { desk: 0.76, standingDesk: 0.76, gamingDesk: 0.76, woodDesk: 0.76, glassDesk: 0.76, cubicle: 0.76, table: 0.76, meetingTable: 0.77, confTable: 0.77, roundTable: 0.75, reception: 1.1, counter: 0.95, coffee: 0.9, stage: 0.3 };

// Decoración chica (va encima de la superficie que tenga abajo)
export const DECOR = {
  monitor: (m, w, d, c) => { m.box(0.05, 0.12, 0.05, 0, 0, 0, c); m.box(0.2, 0.02, 0.15, 0, 0, 0, c); screenModel(m, 0.55, 0.34, 0.12, 0, c, 0); },
  dualMonitor: (m, w, d, c) => { for (const s of [-0.29, 0.29]) { m.box(0.05, 0.12, 0.05, s, 0, 0, c); screenModel(m, 0.54, 0.33, 0.12, 0, c, s > 0 ? 3 : 0); m.parts.lit.length; } },
  curvedMonitor: (m, w, d, c) => { m.box(0.05, 0.12, 0.05, 0, 0, 0, c); screenModel(m, 1.0, 0.36, 0.12, 0, c, 2); },
  imac: (m, w, d, c) => { m.box(0.06, 0.15, 0.06, 0, 0, 0, METAL); screenModel(m, 0.6, 0.42, 0.15, 0, c, 1); },
  laptop: (m, w, d, c) => { m.box(0.38, 0.02, 0.26, 0, 0, 0, c); m.box(0.38, 0.25, 0.02, 0, 0.02, -0.13, c, { rx: -0.25 }); m.box(0.34, 0.2, 0.005, 0, 0.04, -0.115, SCREEN, { rx: -0.25, mat: 'glow' }); },
  keyboard: (m, w, d, c) => m.box(0.42, 0.025, 0.14, 0, 0, 0, c),
  pcTower: (m, w, d, c) => { m.box(0.2, 0.45, 0.42, 0, 0, 0, c); m.box(0.01, 0.3, 0.3, 0.101, 0.08, 0, '#8B7BFF', { mat: 'glow' }); },
  gamingPC: (m, w, d, c) => { m.box(0.24, 0.5, 0.45, 0, 0, 0, '#141414'); m.box(0.01, 0.4, 0.38, 0.121, 0.05, 0, c || '#FE3377', { mat: 'glow' }); },
  mug: (m, w, d, c) => m.cyl(0.045, 0.1, 0, 0, 0, c || '#fff'),
  can: (m, w, d, c) => m.cyl(0.035, 0.12, 0, 0, 0, c),
  boba: (m, w, d, c) => { m.cyl(0.05, 0.16, 0, 0, 0, c, { mat: 'glass' }); m.cyl(0.006, 0.08, 0.02, 0.16, 0, '#e63946'); },
  donut: (m, w, d, c) => m.add(GEO.torus, 0, 0.04, 0, 0.3, 0.3, 0.3, c || '#f15bb5', { rx: Math.PI / 2 }),
  pizza: (m) => { m.cyl(0.2, 0.03, 0, 0, 0, '#f4a261'); m.cyl(0.18, 0.012, 0, 0.03, 0, '#e63946'); },
  tacos: (m) => { for (const x of [-0.12, 0, 0.12]) m.box(0.08, 0.06, 0.18, x, 0, 0, '#f4d06f'); },
  cake: (m, w, d, c) => { m.cyl(0.14, 0.14, 0, 0, 0, c); m.cyl(0.006, 0.06, 0, 0.14, 0, '#ffd23f'); },
  lamp: (m, w, d, c) => { m.cyl(0.07, 0.02, 0, 0, 0, DARK); m.cyl(0.012, 0.32, 0, 0, 0, METAL); m.cone(0.1, 0.12, 0, 0.3, 0, c, { mat: 'glow' }); },
  books: (m, w, d, c) => { for (let k = 0; k < 3; k++) m.box(0.22, 0.05, 0.16, 0, k * 0.05, 0, k ? shade(c, k * 0.1) : c); },
  notebook: (m) => m.box(0.18, 0.02, 0.24, 0, 0, 0, '#3a86ff'),
  trophy: (m) => { m.box(0.08, 0.05, 0.08, 0, 0, 0, DARK); m.cyl(0.05, 0.12, 0, 0.05, 0, '#FFCC00'); },
  smallPlant: (m) => { m.cyl(0.06, 0.08, 0, 0, 0, '#c99c72'); m.ball(0.08, 0, 0.12, 0, '#3f9a4a'); },
  succulent: (m) => { m.cyl(0.06, 0.06, 0, 0, 0, '#e8e8ee'); m.ball(0.07, 0, 0.09, 0, '#7cb342', undefined, 0.7); },
  cactus: (m) => { m.cyl(0.07, 0.08, 0, 0, 0, '#c99c72'); m.cyl(0.04, 0.22, 0, 0.08, 0, '#5aa83c'); },
  vase: (m, w, d, c) => { m.cyl(0.06, 0.2, 0, 0, 0, c); m.ball(0.06, 0, 0.26, 0, '#ff9dbb'); },
  floorLamp: (m, w, d, c) => { m.cyl(0.14, 0.03, 0, 0, 0, DARK); m.cyl(0.02, 1.5, 0, 0, 0, METAL); m.cyl(0.18, 0.25, 0, 1.45, 0, c, { mat: 'glow' }); },
  arcLamp: (m, w, d, c) => { m.cyl(0.16, 0.05, 0.3, 0, 0, '#aeb5bf'); m.box(0.03, 1.8, 0.03, 0.3, 0, 0, '#cdd3da'); m.box(0.7, 0.03, 0.03, -0.05, 1.8, 0, '#cdd3da'); m.cone(0.15, 0.15, -0.38, 1.66, 0, c, { mat: 'glow' }); },
  tallSpeaker: (m, w, d, c) => { m.box(0.4, 1.1, 0.35, 0, 0, 0, c || DARK); m.cyl(0.13, 0.02, 0, 0.75, 0.18, '#3a3f4b', { rx: Math.PI / 2 }); m.cyl(0.08, 0.02, 0, 0.35, 0.18, '#3a3f4b', { rx: Math.PI / 2 }); },
  guitar: (m, w, d, c) => { m.ball(0.2, 0, 0.3, 0, c, undefined, 1.2); m.box(0.05, 0.6, 0.03, 0, 0.45, 0, '#5b3b22'); },
  mic: (m) => { m.cyl(0.08, 0.02, 0, 0, 0, DARK); m.cyl(0.012, 0.35, 0, 0, 0, METAL); m.ball(0.04, 0, 0.38, 0, '#3a3f4b'); },
  ringLight: (m) => { m.cyl(0.012, 1.4, 0, 0, 0, METAL); m.add(GEO.torus, 0, 1.5, 0, 0.6, 0.6, 0.6, '#fff', { mat: 'glow' }); },
  trashCan: (m, w, d, c) => m.cyl(0.15, 0.4, 0, 0, 0, c || '#6b7a77'),
  miniFridge: (m) => m.box(0.5, 0.8, 0.5, 0, 0, 0, '#e8e8ee'),
  plushie: (m, w, d, c) => { m.ball(0.12, 0, 0.12, 0, c); m.ball(0.09, 0, 0.3, 0, c); },
  cat: (m, w, d, c) => { m.box(0.3, 0.14, 0.14, 0, 0.05, 0, c); m.box(0.12, 0.12, 0.12, 0.17, 0.12, 0, c); },
  dog: (m, w, d, c) => { m.box(0.4, 0.2, 0.18, 0, 0.12, 0, c); m.box(0.16, 0.16, 0.16, 0.24, 0.24, 0, c); legs(m, 0.35, 0.15, 0.12, shade(c, -0.15), 0.05); },
  headphones: (m, w, d, c) => m.add(GEO.torus, 0, 0.1, 0, 0.3, 0.3, 0.3, c),
  controller: (m, w, d, c) => m.box(0.16, 0.04, 0.1, 0, 0, 0, c),
  handheld: (m, w, d, c) => m.box(0.2, 0.03, 0.09, 0, 0, 0, c),
  tablet: (m) => m.box(0.22, 0.015, 0.3, 0, 0, 0, '#2b2f3a'),
  phone: (m) => m.box(0.07, 0.01, 0.14, 0, 0, 0, '#2b2f3a'),
  globe: (m) => { m.cyl(0.05, 0.1, 0, 0, 0, DARK); m.ball(0.12, 0, 0.22, 0, '#3a86ff'); },
  photo: (m, w, d, c) => m.box(0.15, 0.12, 0.02, 0, 0, 0, c, { rx: -0.2 }),
  deskCalendar: (m, w, d, c) => m.box(0.15, 0.1, 0.06, 0, 0, 0, c),
  pencilCup: (m, w, d, c) => m.cyl(0.04, 0.1, 0, 0, 0, c),
  stickyNotes: (m, w, d, c) => m.box(0.08, 0.02, 0.08, 0, 0, 0, c || '#ffd23f'),
  mousepad: (m, w, d, c) => m.box(0.3, 0.005, 0.22, 0, 0, 0, c),
  speaker: (m, w, d, c) => m.box(0.12, 0.2, 0.12, 0, 0, 0, c),
  camera: (m) => { legs(m, 0.3, 0.3, 1.2, DARK, 0.02); m.box(0.18, 0.12, 0.24, 0, 1.2, 0, DARK); },
  duck: (m, w, d, c) => { m.ball(0.07, 0, 0.06, 0, c); m.ball(0.045, 0.04, 0.13, 0, c); },
  figure: (m, w, d, c) => { m.box(0.05, 0.15, 0.04, 0, 0, 0, c); m.box(0.05, 0.05, 0.05, 0, 0.15, 0, '#f6c9a0'); },
  carModel: (m, w, d, c) => { m.box(0.3, 0.06, 0.14, 0, 0.02, 0, c); m.box(0.16, 0.05, 0.12, -0.02, 0.08, 0, shade(c, 0.1)); },
  rubik: (m) => m.box(0.06, 0.06, 0.06, 0, 0, 0, '#ffd23f'),
  ball: (m) => m.ball(0.12, 0, 0.12, 0, '#f4f6f8'),
  flag: (m, w, d, c) => { m.cyl(0.006, 0.25, 0, 0, 0, METAL); m.box(0.12, 0.08, 0.005, 0.06, 0.16, 0, c); },
  hexLamp: (m, w, d, c) => { m.cyl(0.05, 0.3, 0, 0, 0, METAL); m.cyl(0.12, 0.12, 0, 0.3, 0, c, { mat: 'glow' }, GEO.cyl6); },
  cubeLogo: (m, w, d, c) => m.box(0.14, 0.14, 0.14, 0, 0, 0, c, { ry: 0.78 }),
  hexBadge: (m, w, d, c) => m.cyl(0.08, 0.02, 0, 0, 0, c, undefined, GEO.cyl6),
  deskFlag: (m, w, d, c) => { m.cyl(0.006, 0.25, 0, 0, 0, METAL); m.box(0.12, 0.08, 0.005, 0.06, 0.16, 0, c || '#FE3377'); },
  balloons: (m, w, d, c) => { for (const [x, y, col] of [[-0.12, 1.6, c || '#FE3377'], [0.1, 1.75, '#FFCC00'], [0, 1.5, '#8B7BFF']]) { m.ball(0.14, x, y, 0, col, undefined, 1.15); m.box(0.005, y - 0.15, 0.005, x * 0.5, 0, 0, '#eee'); } },
  petBed: (m, w, d, c) => m.cyl(0.3, 0.1, 0, 0, 0, c),
  fishbowl: (m) => m.ball(0.12, 0, 0.12, 0, '#8ecae6', { mat: 'glass' }),
  bird: (m, w, d, c) => m.ball(0.06, 0, 0.06, 0, c),
};
// Decoración que va colgada en la pared (cuadros, ventanas, neones…)
export const WALL_DECOR = new Set(['painting', 'window', 'clock', 'poster', 'gamePoster', 'neonSign', 'neonGG', 'neonHub', 'neonLogo', 'brandWall', 'wallBanner', 'ledStrip', 'bunting', 'fairyLights', 'roomSign']);

// ---------- Zombis (InstancedMesh por parte) ----------
// Partes en metros, en el marco del zombi (mira a +Z). parent: índice de la pieza padre.
// pivot = dónde se articula respecto al padre; off = centro de la caja respecto al pivote.
const ZPARTS = [
  { key: 'torso', size: [0.52, 0.62, 0.3], pivot: [0, 0.84, 0], off: [0, 0.31, 0], col: 'shirt' }, // 0
  { key: 'legL', size: [0.2, 0.84, 0.22], pivot: [-0.13, 0.84, 0], off: [0, -0.42, 0], col: 'pants', root: true }, // 1
  { key: 'legR', size: [0.2, 0.84, 0.22], pivot: [0.13, 0.84, 0], off: [0, -0.42, 0], col: 'pants', root: true }, // 2
  { key: 'tie', size: [0.08, 0.42, 0.03], parent: 0, pivot: [0, 0.6, 0.16], off: [0, -0.21, 0], col: 'tie' }, // 3
  { key: 'stain', size: [0.18, 0.14, 0.02], parent: 0, pivot: [0.12, 0.22, 0.155], off: [0, 0, 0], col: 'stain' }, // 4
  { key: 'head', size: [0.38, 0.38, 0.38], parent: 0, pivot: [0, 0.62, 0], off: [0, 0.2, 0.02], col: 'skin' }, // 5
  { key: 'hair', size: [0.41, 0.11, 0.41], parent: 5, pivot: [0, 0.4, 0.02], off: [0, 0, -0.01], col: 'hair' }, // 6
  { key: 'armL', size: [0.15, 0.48, 0.17], parent: 0, pivot: [-0.34, 0.56, 0], off: [0, -0.22, 0], col: 'shirt' }, // 7
  { key: 'armR', size: [0.15, 0.48, 0.17], parent: 0, pivot: [0.34, 0.56, 0], off: [0, -0.22, 0], col: 'shirt' }, // 8
  { key: 'handL', size: [0.13, 0.16, 0.14], parent: 7, pivot: [0, -0.44, 0], off: [0, -0.08, 0], col: 'skin' }, // 9
  { key: 'handR', size: [0.13, 0.16, 0.14], parent: 8, pivot: [0, -0.44, 0], off: [0, -0.08, 0], col: 'skin' }, // 10
  { key: 'shoeL', size: [0.21, 0.08, 0.28], parent: 1, pivot: [0, -0.84, 0.03], off: [0, 0.04, 0], col: 'shoe' }, // 11
  { key: 'shoeR', size: [0.21, 0.08, 0.28], parent: 2, pivot: [0, -0.84, 0.03], off: [0, 0.04, 0], col: 'shoe' }, // 12
];
const EYE_PARENT = 5;

const pick = (arr, n) => arr[Math.abs(n | 0) % arr.length];
const SKINS = ['#8fb573', '#7ea86a', '#9cbf7e', '#a3b88a', '#86a77c'];
const SHIRTS = ['#e8edf2', '#bcd4ee', '#f2c9d4', '#d9d9d9', '#c7e3c0', '#f5e6b8', '#a9c4e8'];
const TIES = ['#c0392b', '#2c5aa0', '#7a2b8f', '#1f7a5a', '#d68910'];
const PANTS = ['#2b2f3a', '#3e4462', '#5a4a3a', '#24304a', '#4a4f5c'];
const HAIR = ['#2a2018', '#4a3020', '#777777', '#1b1720', '#8a5a2b'];

export function zombieLook(kind, id) {
  const h = (id * 2654435761) >>> 0;
  const look = {
    skin: pick(SKINS, h), shirt: pick(SHIRTS, h >> 3), tie: pick(TIES, h >> 6), pants: pick(PANTS, h >> 9), hair: pick(HAIR, h >> 12),
    stain: '#5f8f3a', shoe: '#1d1f26', bald: (h >> 15) % 5 === 0, eye: '#e6ff4a', scale: 1, wide: 1,
  };
  if (kind === 'runner') { look.shirt = pick(['#ff8a3d', '#1f9e9e', '#e05ca5', '#3d7be0'], h >> 4); look.tie = look.shirt; look.eye = '#ff5040'; look.scale = 0.92; look.wide = 0.88; }
  if (kind === 'tank') { look.shirt = '#5a4636'; look.tie = '#c8aa6e'; look.pants = '#3b2e24'; look.scale = 1.3; look.wide = 1.2; look.eye = '#ffb03b'; }
  if (kind === 'spitter') { look.shirt = '#c9a227'; look.tie = '#5a3a1a'; look.stain = '#6b3f22'; look.wide = 1.3; look.eye = '#b6ff3b'; }
  if (look.bald) look.hair = look.skin;
  return look;
}

export class Horde {
  constructor(scene, cap = 64) {
    this.cap = cap;
    this.meshes = ZPARTS.map((p) => {
      const g = GEO.box.clone();
      g.scale(p.size[0], p.size[1], p.size[2]);
      g.translate(p.off[0], p.off[1], p.off[2]);
      const mesh = new THREE.InstancedMesh(g, new THREE.MeshLambertMaterial(), cap);
      mesh.castShadow = true; mesh.receiveShadow = false;
      mesh.frustumCulled = false;
      mesh.count = 0;
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.setColorAt(0, _c.set('#fff'));
      scene.add(mesh);
      return mesh;
    });
    // ojos que brillan
    const eg = mergeGeometries([GEO.box.clone().scale(0.08, 0.06, 0.02).translate(-0.085, 0.24, 0.215), GEO.box.clone().scale(0.08, 0.06, 0.02).translate(0.085, 0.24, 0.215)]);
    this.eyes = new THREE.InstancedMesh(eg, new THREE.MeshBasicMaterial(), cap);
    this.eyes.count = 0; this.eyes.frustumCulled = false;
    this.eyes.setColorAt(0, _c.set('#fff'));
    scene.add(this.eyes);
    this.tmp = ZPARTS.map(() => new THREE.Matrix4());
    this.local = new THREE.Matrix4();
    this.base = new THREE.Matrix4();
    this.white = new THREE.Color('#ffffff');
  }
  // list: [{ id, kind, x, z (m), a (yaw), st, t, flash, rise (0..1), walkPhase, scaleMul }]
  update(list, time) {
    let n = 0;
    for (const z of list) {
      if (n >= this.cap) break;
      const L = zombieLook(z.kind, z.id);
      const s = L.scale * (z.scaleMul || 1);
      // postura
      const ph = z.walk || 0;
      let lean = 0.18, armA = -1.45 + Math.sin(ph * 0.5 + z.id) * 0.12, armB = -1.45 + Math.sin(ph * 0.5 + z.id + 1.7) * 0.12;
      let legA = Math.sin(ph) * 0.55, legB = -legA, headZ = Math.sin(time * 1.3 + z.id) * 0.22, headX = 0.12, y = 0, fall = 0;
      if (z.st === 'attack') {
        const k = Math.min(1, z.t / 0.45);
        const sw = z.t < 0.45 ? -1.45 - k * 1.1 : -2.55 + Math.min(1, (z.t - 0.45) / 0.15) * 1.9;
        armA = sw; armB = sw + 0.15; lean = 0.18 + (z.t < 0.45 ? -0.1 * k : 0.35); legA = 0.15; legB = -0.15;
      } else if (z.st === 'rise') {
        const k = Math.min(1, z.t / 1.4);
        const e = 1 - (1 - k) * (1 - k);
        y = -(z.h || 1.8) * s * (1 - e) * 1.05;
        armA = -2.9 + Math.sin(time * 9 + z.id) * 0.25; armB = -2.9 + Math.cos(time * 9 + z.id) * 0.25;
        lean = 0.5 * (1 - e); legA = 0; legB = 0; headX = 0.4 * (1 - e);
      } else if (z.st === 'dead') {
        const k = Math.min(1, z.t / 0.55);
        fall = -(Math.PI / 2) * (k * k);
        y = -Math.max(0, z.t - 1.6) * 0.9;
        armA = -2.6; armB = -2.2; legA = 0.1; legB = -0.1; lean = 0;
      }
      const yaw = Math.PI / 2 - z.a;
      this.base.compose(_p.set(z.x, y, z.z), _q.setFromEuler(_e.set(fall, yaw, 0, 'YXZ')), _s.set(s * L.wide, s, s));
      const rot = [
        [lean, 0, 0], [legA, 0, 0], [legB, 0, 0], [0.05, 0, 0], [0, 0, 0], [headX, 0, headZ], [0, 0, 0],
        [armA, 0, 0.08], [armB, 0, -0.08], [0, 0, 0], [0, 0, 0], [0, 0, 0], [0, 0, 0],
      ];
      for (let i = 0; i < ZPARTS.length; i++) {
        const P = ZPARTS[i];
        const r = rot[i];
        this.local.compose(_p.set(P.pivot[0], P.pivot[1], P.pivot[2]), _q.setFromEuler(_e.set(r[0], r[1], r[2])), _s.set(1, 1, 1));
        const parent = P.parent != null ? this.tmp[P.parent] : this.base;
        this.tmp[i].multiplyMatrices(parent, this.local);
        this.meshes[i].setMatrixAt(n, this.tmp[i]);
        const flash = z.flash && (P.col === 'shirt' || P.col === 'skin' || P.col === 'pants');
        this.meshes[i].setColorAt(n, flash ? this.white : _c.set(L[P.col]));
      }
      this.eyes.setMatrixAt(n, this.tmp[EYE_PARENT]);
      this.eyes.setColorAt(n, _c.set(z.st === 'dead' ? '#334' : L.eye));
      n++;
    }
    for (const m of [...this.meshes, this.eyes]) {
      m.count = n;
      m.instanceMatrix.needsUpdate = true;
      if (m.instanceColor) m.instanceColor.needsUpdate = true;
    }
  }
}

// ---------- Piezas sueltas (jefes, avatar, armas) ----------
const matCache = new Map();
export function mat(color, glow = false) {
  const k = color + (glow ? 'g' : '');
  if (!matCache.has(k)) matCache.set(k, glow ? new THREE.MeshBasicMaterial({ color }) : new THREE.MeshLambertMaterial({ color }));
  return matCache.get(k);
}
// Caja con su pivote arriba (para brazos y piernas) o centrada
export function part(w, h, d, color, { pivotTop = false, glow = false, x = 0, y = 0, z = 0, shadow = true, geo = GEO.box } = {}) {
  const g = geo.clone();
  g.scale(w, h, d);
  if (pivotTop) g.translate(0, -h / 2, 0);
  const m = new THREE.Mesh(g, mat(color, glow));
  m.position.set(x, y, z);
  m.castShadow = shadow;
  return m;
}

// Etiqueta con nombre (sprite)
export function nameTag(text, color = '#FE3377') {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 64;
  const g = c.getContext('2d');
  g.font = '700 30px system-ui, sans-serif';
  const w = Math.min(240, g.measureText(text).width + 30);
  g.fillStyle = 'rgba(10,10,16,.75)';
  g.beginPath(); g.roundRect((256 - w) / 2, 8, w, 46, 14); g.fill();
  g.fillStyle = color; g.fillRect((256 - w) / 2 + 12, 25, 10, 10);
  g.fillStyle = '#fff'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(text, 128 + 8, 32, 200);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: true, transparent: true }));
  sp.scale.set(1.2, 0.3, 1);
  return sp;
}

// Personaje del compañero: versión de cubos de su avatar (piel, pelo, ropa)
export function voxelAvatar(av = {}, name = '', color = '#3a86ff') {
  const skin = av.skin || '#f6c9a0', hair = av.hair || '#1b1720', shirt = av.shirt || '#3d7be0', pants = av.pants || '#2b2d42', shoes = av.shoes || '#1d1d22', accent = av.accent || '#f4f4f6';
  const root = new THREE.Group();
  const hip = new THREE.Group(); hip.position.y = 0.82; root.add(hip);
  const legL = part(0.19, 0.74, 0.22, pants, { pivotTop: true, x: -0.12 }), legR = part(0.19, 0.74, 0.22, pants, { pivotTop: true, x: 0.12 });
  legL.add(part(0.2, 0.09, 0.28, shoes, { y: -0.78, z: 0.03 })); legR.add(part(0.2, 0.09, 0.28, shoes, { y: -0.78, z: 0.03 }));
  hip.add(legL, legR);
  const torso = new THREE.Group(); hip.add(torso);
  torso.add(part(0.48, 0.6, 0.27, shirt, { y: 0.3 }));
  if (av.top === 'shirt' || av.top === 'suit' || av.top === 'uniform') torso.add(part(0.07, 0.36, 0.02, accent, { y: 0.36, z: 0.14 }));
  else torso.add(part(0.3, 0.06, 0.02, accent, { y: 0.56, z: 0.14 }));
  const head = new THREE.Group(); head.position.y = 0.62; torso.add(head);
  head.add(part(0.42, 0.42, 0.4, skin, { y: 0.21 }));
  // pelo
  const long = ['long', 'ponytail', 'pigtails', 'bob'].includes(av.hairStyle);
  if (av.hairStyle !== 'buzz') head.add(part(0.45, 0.14, 0.44, hair, { y: 0.44 }));
  head.add(part(0.45, long ? 0.45 : 0.22, 0.1, hair, { y: long ? 0.2 : 0.3, z: -0.18 }));
  if (av.hairStyle === 'afro' || av.hairStyle === 'curly') head.add(part(0.55, 0.28, 0.52, hair, { y: 0.48 }));
  if (av.hairStyle === 'mohawk') head.add(part(0.1, 0.18, 0.4, hair, { y: 0.56 }));
  if (av.hat === 'cap') { head.add(part(0.46, 0.12, 0.46, av.hatColor || '#101010', { y: 0.47 })); head.add(part(0.4, 0.03, 0.2, av.hatColor || '#101010', { y: 0.43, z: 0.28 })); }
  if (av.hat === 'beanie') head.add(part(0.46, 0.16, 0.46, av.hatColor || '#101010', { y: 0.5 }));
  if (av.hat === 'cowboy') { head.add(part(0.7, 0.03, 0.7, av.hatColor || '#7a4a2b', { y: 0.44 })); head.add(part(0.4, 0.18, 0.4, av.hatColor || '#7a4a2b', { y: 0.53 })); }
  for (const s of [-1, 1]) head.add(part(0.07, 0.07, 0.02, av.eyewear === 'sunglasses' ? '#101010' : '#261e30', { x: s * 0.1, y: 0.24, z: 0.205 }));
  if (av.eyewear === 'glasses' || av.eyewear === 'round') head.add(part(0.34, 0.02, 0.02, '#101010', { y: 0.26, z: 0.21 }));
  if (av.facialHair && av.facialHair !== 'none') head.add(part(0.3, av.facialHair === 'beard' ? 0.14 : 0.05, 0.02, hair, { y: av.facialHair === 'beard' ? 0.06 : 0.12, z: 0.205 }));
  // brazos al frente, sosteniendo el arma
  const armL = new THREE.Group(), armR = new THREE.Group();
  armL.position.set(-0.32, 0.55, 0); armR.position.set(0.32, 0.55, 0);
  for (const a of [armL, armR]) { a.add(part(0.15, 0.42, 0.17, shirt, { pivotTop: true })); a.add(part(0.13, 0.16, 0.14, skin, { y: -0.48 })); torso.add(a); }
  armL.rotation.set(-1.3, 0, 0.35); armR.rotation.set(-1.45, 0, -0.05);
  const gun = new THREE.Group();
  gun.add(part(0.08, 0.1, 0.42, '#2b2f3a', { z: 0.1 }));
  gun.add(part(0.06, 0.12, 0.08, '#d62f3a', { y: -0.08, z: -0.05 }));
  gun.position.set(0, -0.52, 0.05);
  gun.rotation.x = Math.PI / 2;
  armR.add(gun);
  const flash = part(0.18, 0.18, 0.05, '#fff2a8', { glow: true, shadow: false });
  flash.position.set(0, 0.32, 0); flash.visible = false;
  gun.add(flash);
  const tag = nameTag(name, color);
  tag.position.y = 2.15;
  root.add(tag);
  root.userData = { hip, legL, legR, torso, head, armL, armR, flash, walk: 0 };
  return root;
}
export function animateAvatar(g, { speed = 0, dt = 0, alive = true, pitch = 0, fire = 0 }) {
  const u = g.userData;
  u.walk += speed * dt * 7;
  const s = Math.sin(u.walk) * Math.min(1, speed) * 0.6;
  u.legL.rotation.x = s; u.legR.rotation.x = -s;
  u.hip.position.y = 0.82 + Math.abs(Math.cos(u.walk)) * 0.03 * Math.min(1, speed);
  u.armL.rotation.x = -1.3 - pitch; u.armR.rotation.x = -1.45 - pitch - fire * 0.25;
  u.head.rotation.x = -pitch * 0.6;
  u.flash.visible = fire > 0.5;
  g.rotation.z = 0;
  if (!alive) { u.torso.rotation.x = -1.2; u.hip.position.y = 0.25; u.legL.rotation.x = -1.4; u.legR.rotation.x = -1.4; }
  else u.torso.rotation.x = 0;
}

// ---------- Jefes ----------
export function bossModel(id) {
  const root = new THREE.Group();
  const body = new THREE.Group(); root.add(body);
  const U = {};
  if (id === 'gerente') {
    // Traje azul marino, corbata roja, portafolios, lentes y gafete
    const S = 1.75, skin = '#9cbf7e', suit = '#22305a';
    const hip = new THREE.Group(); hip.position.y = 0.84 * S; body.add(hip);
    U.legL = part(0.22 * S, 0.84 * S, 0.24 * S, '#1a2444', { pivotTop: true, x: -0.14 * S }); U.legR = part(0.22 * S, 0.84 * S, 0.24 * S, '#1a2444', { pivotTop: true, x: 0.14 * S });
    hip.add(U.legL, U.legR);
    U.torso = new THREE.Group(); hip.add(U.torso);
    U.torso.add(part(0.62 * S, 0.7 * S, 0.36 * S, suit, { y: 0.35 * S }));
    U.torso.add(part(0.22 * S, 0.5 * S, 0.02, '#f4f6f8', { y: 0.45 * S, z: 0.185 * S }));
    U.torso.add(part(0.09 * S, 0.45 * S, 0.03, '#d62828', { y: 0.42 * S, z: 0.195 * S }));
    U.torso.add(part(0.12 * S, 0.16 * S, 0.02, '#FFCC00', { x: 0.2 * S, y: 0.5 * S, z: 0.19 * S })); // gafete
    U.head = new THREE.Group(); U.head.position.y = 0.72 * S; U.torso.add(U.head);
    U.head.add(part(0.5 * S, 0.48 * S, 0.46 * S, skin, { y: 0.24 * S }));
    U.head.add(part(0.52 * S, 0.1 * S, 0.48 * S, '#bfc4c9', { y: 0.5 * S })); // canas
    U.head.add(part(0.4 * S, 0.06 * S, 0.02, '#101010', { y: 0.3 * S, z: 0.24 * S }));
    for (const s of [-1, 1]) U.head.add(part(0.12 * S, 0.08 * S, 0.02, '#ff4040', { glow: true, x: s * 0.1 * S, y: 0.3 * S, z: 0.245 * S }));
    U.head.add(part(0.22 * S, 0.05 * S, 0.02, '#3a1a1a', { y: 0.12 * S, z: 0.235 * S }));
    U.armL = new THREE.Group(); U.armR = new THREE.Group();
    U.armL.position.set(-0.4 * S, 0.65 * S, 0); U.armR.position.set(0.4 * S, 0.65 * S, 0);
    for (const a of [U.armL, U.armR]) { a.add(part(0.18 * S, 0.62 * S, 0.2 * S, suit, { pivotTop: true })); a.add(part(0.15 * S, 0.18 * S, 0.16 * S, skin, { y: -0.7 * S })); U.torso.add(a); }
    const brief = part(0.45 * S, 0.32 * S, 0.12 * S, '#5a3a1a', { y: -0.9 * S }); brief.add(part(0.16 * S, 0.05 * S, 0.04 * S, '#c8aa6e', { y: 0.18 * S }));
    U.armR.add(brief);
  } else if (id === 'impresora') {
    // Impresora gigante con charola, ranura roja que brilla y hojas
    const S = 1.6;
    U.torso = new THREE.Group(); body.add(U.torso);
    U.torso.position.y = 0.35;
    U.torso.add(part(1.2 * S, 0.75 * S, 0.95 * S, '#d9dde2', { y: 0.375 * S }));
    U.torso.add(part(1.22 * S, 0.12 * S, 0.97 * S, '#3a3f4b', { y: 0.06 * S }));
    U.torso.add(part(1.0 * S, 0.06 * S, 0.7 * S, '#9aa3ad', { y: 0.78 * S, z: -0.05 * S })); // tapa
    U.torso.add(part(0.8 * S, 0.06 * S, 0.02, '#ff2a2a', { glow: true, y: 0.5 * S, z: 0.48 * S })); // ranura
    for (const s of [-1, 1]) U.torso.add(part(0.16 * S, 0.1 * S, 0.02, '#ff3b3b', { glow: true, x: s * 0.3 * S, y: 0.66 * S, z: 0.48 * S }));
    U.torso.add(part(0.3 * S, 0.14 * S, 0.02, '#2bb673', { glow: true, x: 0.4 * S, y: 0.25 * S, z: 0.48 * S })); // pantallita
    U.paper = new THREE.Group(); U.torso.add(U.paper);
    for (let k = 0; k < 3; k++) U.paper.add(part(0.6 * S, 0.01, 0.42 * S, '#ffffff', { y: 0.82 * S + k * 0.02, z: -0.1 * S + k * 0.06 }));
    U.tray = part(0.7 * S, 0.03, 0.4 * S, '#9aa3ad', { y: 0.2 * S, z: 0.6 * S }); U.torso.add(U.tray);
    for (const s of [-1, 1]) for (const t of [-1, 1]) U.torso.add(part(0.08, 0.35, 0.08, '#2b2f3a', { x: s * 0.5 * S, y: -0.17, z: t * 0.35 * S }));
    U.armL = new THREE.Group(); U.armR = new THREE.Group();
  } else {
    // Becario gigante: gorra, gafete, mochila y su café
    const S = 2.0, skin = '#a3b88a';
    const hip = new THREE.Group(); hip.position.y = 0.84 * S; body.add(hip);
    U.legL = part(0.22 * S, 0.84 * S, 0.24 * S, '#24477a', { pivotTop: true, x: -0.14 * S }); U.legR = part(0.22 * S, 0.84 * S, 0.24 * S, '#24477a', { pivotTop: true, x: 0.14 * S });
    hip.add(U.legL, U.legR);
    U.torso = new THREE.Group(); hip.add(U.torso);
    U.torso.add(part(0.6 * S, 0.66 * S, 0.34 * S, '#ff8a3d', { y: 0.33 * S }));
    U.torso.add(part(0.5 * S, 0.5 * S, 0.22 * S, '#2b2f3a', { y: 0.35 * S, z: -0.27 * S })); // mochila
    U.torso.add(part(0.03, 0.4 * S, 0.02, '#3a86ff', { y: 0.42 * S, z: 0.18 * S }));
    U.torso.add(part(0.14 * S, 0.18 * S, 0.02, '#ffffff', { y: 0.2 * S, z: 0.18 * S })); // gafete
    U.head = new THREE.Group(); U.head.position.y = 0.68 * S; U.torso.add(U.head);
    U.head.add(part(0.46 * S, 0.46 * S, 0.44 * S, skin, { y: 0.23 * S }));
    U.head.add(part(0.48 * S, 0.12 * S, 0.48 * S, '#2bb673', { y: 0.48 * S }));
    U.head.add(part(0.4 * S, 0.03, 0.22 * S, '#2bb673', { y: 0.43 * S, z: 0.3 * S }));
    for (const s of [-1, 1]) U.head.add(part(0.1 * S, 0.1 * S, 0.02, '#e6ff4a', { glow: true, x: s * 0.1 * S, y: 0.27 * S, z: 0.225 * S }));
    U.head.add(part(0.2 * S, 0.08 * S, 0.02, '#3a1a1a', { y: 0.1 * S, z: 0.225 * S }));
    U.armL = new THREE.Group(); U.armR = new THREE.Group();
    U.armL.position.set(-0.39 * S, 0.6 * S, 0); U.armR.position.set(0.39 * S, 0.6 * S, 0);
    for (const a of [U.armL, U.armR]) { a.add(part(0.17 * S, 0.6 * S, 0.19 * S, '#ff8a3d', { pivotTop: true })); a.add(part(0.15 * S, 0.18 * S, 0.16 * S, skin, { y: -0.68 * S })); U.torso.add(a); }
    const cup = part(0.14 * S, 0.24 * S, 0.14 * S, '#f4f6f8', { y: -0.84 * S, geo: GEO.cyl }); cup.add(part(0.15 * S, 0.06 * S, 0.15 * S, '#6b3f22', { y: 0.12 * S, geo: GEO.cyl }));
    U.armL.add(cup);
  }
  root.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  root.userData = { ...U, body, id, walk: 0 };
  return root;
}

export function animateBoss(g, z, time, dt) {
  const U = g.userData;
  const moving = z.st === 'walk' || z.st === 'emerge' || z.st === 'charge';
  U.walk += dt * (z.st === 'charge' ? 14 : moving ? 6 : 0);
  const s = Math.sin(U.walk) * 0.5;
  if (U.legL) { U.legL.rotation.x = s; U.legR.rotation.x = -s; }
  let armA = -0.3 + Math.sin(U.walk * 0.5) * 0.2, armB = -0.3 - Math.sin(U.walk * 0.5) * 0.2, lean = 0.1;
  if (z.st === 'windup') { armA = -2.8; armB = -2.8; lean = -0.25; }
  if (z.st === 'charge') { armA = -1.4; armB = -1.4; lean = 0.55; }
  if (z.st === 'stun') { armA = 0.2; armB = 0.2; lean = -0.1; U.torso.rotation.z = Math.sin(time * 12) * 0.1; } else U.torso.rotation.z = 0;
  if (z.st === 'attack') { const k = Math.min(1, z.t / 0.55); armA = z.t < 0.55 ? -0.3 - k * 2.4 : -0.6; armB = armA; lean = z.t < 0.55 ? -0.1 : 0.4; }
  if (z.st === 'cast') { armA = -2.2; armB = -0.4; }
  if (U.armL) { U.armL.rotation.x = armA; U.armR.rotation.x = armB; }
  if (U.id !== 'impresora') U.torso.rotation.x = lean;
  if (U.id === 'impresora') {
    // salta y "imprime"
    U.body.position.y = Math.abs(Math.sin(time * 3)) * 0.12 + (z.st === 'cast' ? 0.15 : 0);
    U.torso.rotation.x = z.st === 'cast' ? -0.15 : Math.sin(time * 2) * 0.04;
    U.paper.position.z = (time * 0.5) % 0.4;
    U.tray.rotation.x = z.st === 'cast' ? -0.4 : 0;
  }
  if (U.head) U.head.rotation.z = Math.sin(time * 1.4) * 0.12;
  if (z.st === 'dead') {
    const k = Math.min(1, z.t / 0.9);
    U.body.rotation.x = -k * Math.PI / 2;
    U.body.position.y = -Math.max(0, z.t - 1.4) * 1.2;
  } else { U.body.rotation.x = 0; if (U.id !== 'impresora') U.body.position.y = 0; }
  // destello al recibir golpe
  const fl = !!z.flash;
  if (U.flash !== fl) {
    U.flash = fl;
    g.traverse((o) => { if (o.isMesh && o.material.isMeshLambertMaterial) { o.material = fl ? mat('#ffffff') : (o.userData.base || o.material); } });
  }
}
export function rememberBossMaterials(g) { g.traverse((o) => { if (o.isMesh) o.userData.base = o.material; }); }

// ---------- Armas en primera persona ----------
// Marco de la cámara: -Z hacia el frente. Devuelve { group, muzzle (Object3D en la boca del arma) }
export function weaponModel(i) {
  const g = new THREE.Group();
  const muzzle = new THREE.Object3D();
  if (i === 0) {
    // Grapadora: base gris, brazo rojo, mango negro
    g.add(part(0.07, 0.035, 0.3, '#3a3f4b', { z: -0.05 }));
    const top = part(0.072, 0.055, 0.28, '#d62f3a', { y: 0.045, z: -0.06 }); top.rotation.x = 0.04; g.add(top);
    g.add(part(0.074, 0.02, 0.06, '#c9ced6', { y: 0.03, z: -0.19 }));
    g.add(part(0.076, 0.012, 0.1, '#e8e8ee', { y: 0.075, z: -0.12 })); // placa cromada
    g.add(part(0.077, 0.03, 0.03, '#141414', { y: 0.06, z: 0.02 })); // bisagra
    g.add(part(0.074, 0.01, 0.12, '#ffcc00', { y: -0.015, z: -0.02 })); // franja de la base
    g.add(part(0.02, 0.004, 0.03, '#d9dde2', { y: 0.005, z: -0.205 })); // grapa saliendo
    g.add(part(0.06, 0.13, 0.07, '#1d1f26', { y: -0.08, z: 0.07 }));
    g.children[g.children.length - 1].rotation.x = 0.25;
    muzzle.position.set(0, 0.02, -0.23);
    g.scale.setScalar(1.1);
  } else if (i === 1) {
    // Escopeta de café: cañón metálico, cafetera de vidrio abajo, culata café
    const barrel = part(0.05, 0.62, 0.05, '#9aa3ad', { z: -0.25, y: 0.01, geo: GEO.cyl }); barrel.rotation.x = Math.PI / 2; g.add(barrel);
    const b2 = part(0.045, 0.5, 0.045, '#6b7480', { z: -0.2, y: -0.04, geo: GEO.cyl }); b2.rotation.x = Math.PI / 2; g.add(b2);
    const pot = part(0.11, 0.16, 0.11, '#5a3a1a', { y: -0.09, z: -0.28, geo: GEO.cyl }); g.add(pot);
    g.add(part(0.12, 0.03, 0.12, '#1d1f26', { y: -0.0, z: -0.28, geo: GEO.cyl }));
    g.add(part(0.09, 0.08, 0.3, '#2b2f3a', { y: -0.01, z: 0.05 }));
    g.add(part(0.07, 0.15, 0.08, '#6b3f22', { y: -0.1, z: 0.12 }));
    g.add(part(0.075, 0.03, 0.06, '#ffd23f', { glow: true, y: 0.045, z: 0.0 }));
    muzzle.position.set(0, 0.0, -0.62);
  } else {
    // Clavadora: cuerpo amarillo, nariz negra, cargador naranja, batería
    g.add(part(0.09, 0.12, 0.34, '#f2c230', { z: -0.06 }));
    g.add(part(0.06, 0.06, 0.12, '#1d1f26', { y: -0.01, z: -0.28 }));
    const mag = part(0.04, 0.03, 0.3, '#ff8a3d', { y: -0.08, z: -0.16 }); mag.rotation.x = -0.35; g.add(mag);
    g.add(part(0.06, 0.15, 0.07, '#1d1f26', { y: -0.12, z: 0.06 }));
    g.add(part(0.1, 0.07, 0.12, '#2b2f3a', { y: -0.21, z: 0.07 }));
    g.add(part(0.091, 0.02, 0.2, '#1d1f26', { y: 0.05, z: -0.06 }));
    muzzle.position.set(0, -0.01, -0.35);
    g.scale.setScalar(0.82);
  }
  g.add(muzzle);
  g.traverse((o) => { if (o.isMesh) o.castShadow = false; });
  return { group: g, muzzle };
}

// Brazos con la piel y la manga del avatar
export function armsModel(skin = '#f6c9a0', sleeve = '#3d7be0') {
  const g = new THREE.Group();
  // cada brazo: la mano en el origen (sobre el mango) y el antebrazo hacia atrás (hacia la cámara)
  const arm = () => {
    const a = new THREE.Group();
    a.add(part(0.085, 0.075, 0.11, skin, { y: 0, z: 0 }));
    a.add(part(0.03, 0.03, 0.06, skin, { x: -0.045, y: 0.02, z: -0.04 })); // pulgar
    a.add(part(0.075, 0.075, 0.32, shade(skin, -0.04), { z: 0.2 }));
    a.add(part(0.1, 0.1, 0.26, sleeve, { z: 0.46 }));
    a.add(part(0.104, 0.03, 0.02, shade(sleeve, -0.2), { y: 0.0, z: 0.335 }));
    return a;
  };
  const R = arm(), L = arm();
  g.add(R, L);
  g.traverse((o) => { if (o.isMesh) o.castShadow = false; });
  return { group: g, R, L };
}
