// Arena HUB en 3D: muebles propios de las arenas (anaqueles, pilas de cajas, pretiles, climas,
// tinacos…), el cielo nocturno con la ciudad para la azotea, el muro de la zona que se apaga y los
// recogibles (dona, chaleco, munición y armas). Todo se combina en pocas geometrías.
import * as THREE from 'three';
import { FURNITURE, GEO, part, mat } from '../zombies/models.js';
import { viewWeapon, avatarSword } from '../zombies/arsenalModels.js';
import { ARMS } from '@shared/arsenal.js';
import { TILE_M } from '@shared/zombies.js';

const S = TILE_M;
const hash = (a, b, k = 0) => { let h = (a * 374761393 + b * 668265263 + k * 2147483647) >>> 0; h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0; return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
const CARD = ['#c99c62', '#b98a52', '#d6ae74', '#a87a46'];
const REAM = ['#f4f6f8', '#bcd4ee', '#f2c9d4', '#fff3a8', '#c7e3c0'];

// Caja de cartón con su cinta (y, si toca, una etiqueta)
function box(m, w, h, d, x, y, z, seed) {
  const col = CARD[Math.floor(hash(seed, 1) * CARD.length)];
  m.box(w, h, d, x, y, z, col);
  m.box(w * 1.01, h * 0.12, d * 0.22, x, y + h * 0.88, z, '#d8c49a');
  if (hash(seed, 2) < 0.5) m.box(w * 0.32, h * 0.22, 0.01, x - w * 0.18, y + h * 0.45, z + d / 2 + 0.003, '#f4f6f8');
  if (hash(seed, 3) < 0.25) m.box(w * 0.2, h * 0.08, 0.012, x + w * 0.2, y + h * 0.3, z + d / 2 + 0.004, '#FE3377');
}
function pallet(m, w, d, x, z) {
  m.box(w, 0.04, d, x, 0, z, '#8a6a42');
  for (const k of [-0.42, 0, 0.42]) m.box(w * 0.98, 0.1, 0.1, x, 0.04, z + k * d, '#6b4f2e');
  m.box(w, 0.03, d, x, 0.14, z, '#a07a4a');
}

export const ARENA_PROPS = {
  // Anaquel metálico alto con cajas y resmas de papel en cada repisa
  arenaRack(m, w, d, c, o) {
    const n = Math.max(1, Math.round(w / S));
    const dd = d * 0.82;
    for (let k = 0; k <= n; k++) {
      const x = -w / 2 + (k / n) * w + (k === 0 ? 0.04 : k === n ? -0.04 : 0);
      for (const z of [-dd / 2 + 0.03, dd / 2 - 0.03]) m.box(0.06, 2.75, 0.06, x, 0, z, '#3a4a6b');
    }
    for (const y of [0.12, 0.8, 1.48, 2.16]) {
      m.box(w - 0.04, 0.05, dd, 0, y, 0, '#ff8a3d');
      m.box(w - 0.04, 0.08, 0.04, 0, y - 0.02, dd / 2 - 0.02, '#e06a20');
      for (let k = 0; k < n * 2; k++) {
        const s = (o.x + k) * 31 + o.y * 7 + y * 13;
        if (hash(s, 4) < 0.18) continue;
        const bw = S * (0.36 + hash(s, 5) * 0.08), bh = 0.3 + hash(s, 6) * 0.26, bd = dd * (0.7 + hash(s, 7) * 0.2);
        const x = -w / 2 + (k + 0.5) * (w / (n * 2));
        if (hash(s, 8) < 0.3) { const col = REAM[Math.floor(hash(s, 9) * REAM.length)]; for (let r = 0; r < 3; r++) m.box(bw * 0.9, 0.08, bd * 0.7, x, y + 0.05 + r * 0.085, 0, r % 2 ? col : '#ffffff'); }
        else box(m, bw, bh, bd, x, y + 0.05, (hash(s, 10) - 0.5) * 0.08, s);
      }
    }
    m.box(w - 0.04, 0.04, dd, 0, 2.72, 0, '#3a4a6b');
  },
  // Pila alta de cajas sobre tarimas (tapa de pie)
  arenaStack(m, w, d, c, o) {
    const nx = Math.max(1, Math.round(w / S)), nz = Math.max(1, Math.round(d / S));
    for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) {
      const x = -w / 2 + (i + 0.5) * (w / nx), z = -d / 2 + (j + 0.5) * (d / nz);
      pallet(m, S * 0.92, S * 0.92, x, z);
      const lv = 3 + (hash(o.x + i, o.y + j) < 0.4 ? 1 : 0);
      let y = 0.17;
      for (let k = 0; k < lv; k++) {
        const s = (o.x + i) * 17 + (o.y + j) * 5 + k;
        const bh = 0.5 + hash(s, 1) * 0.12;
        box(m, S * (0.86 - k * 0.03), bh, S * (0.84 - k * 0.03), x + (hash(s, 2) - 0.5) * 0.06, y, z + (hash(s, 3) - 0.5) * 0.06, s);
        y += bh;
      }
    }
  },
  // Caja suelta o huacal bajo (tapa agachado)
  arenaCrate(m, w, d, c, o) {
    const s = o.x * 13 + o.y * 7;
    if (hash(s, 1) < 0.45) {
      // huacal de madera
      m.box(w * 0.9, 0.95, d * 0.9, 0, 0, 0, '#a2723f');
      for (const y of [0.05, 0.45, 0.85]) { m.box(w * 0.92, 0.1, d * 0.92, 0, y, 0, '#8a5a2b'); }
      m.box(0.08, 0.95, d * 0.93, -w * 0.43, 0, 0, '#7a4a20'); m.box(0.08, 0.95, d * 0.93, w * 0.43, 0, 0, '#7a4a20');
    } else {
      pallet(m, w * 0.92, d * 0.92, 0, 0);
      box(m, w * 0.8, 0.48, d * 0.8, 0, 0.17, 0, s);
      box(m, w * 0.62, 0.36, d * 0.6, (hash(s, 4) - 0.5) * 0.1, 0.65, (hash(s, 5) - 0.5) * 0.1, s + 1);
    }
  },
  // Mesa de empaque: lámina, rollo de papel kraft y cinta
  arenaTable(m, w, d) {
    m.box(w - 0.04, 0.06, d * 0.86, 0, 0.88, 0, '#c9ced6');
    for (const x of [-w / 2 + 0.1, w / 2 - 0.1]) for (const z of [-d * 0.36, d * 0.36]) m.box(0.06, 0.88, 0.06, x, 0, z, '#3a3f4b');
    m.box(w - 0.2, 0.05, d * 0.7, 0, 0.3, 0, '#5a5f6b');
    m.add(GEO.cyl, -w * 0.18, 1.07, 0, 0.26, Math.min(1.1, w * 0.5), 0.26, '#c99c62', { rz: Math.PI / 2 });
    m.cyl(0.07, 0.05, w * 0.25, 0.94, 0.1, '#d8c49a');
    box(m, 0.4, 0.3, 0.35, w * 0.3, 0.94, -0.12, Math.round(w * 10));
  },
  // Pretil de la azotea con barandal
  arenaParapet(m, w, d) {
    m.box(w, 0.95, d * 0.7, 0, 0, 0, '#8d939e');
    m.box(w + 0.02, 0.08, d * 0.78, 0, 0.95, 0, '#b3b8c0');
    const n = Math.max(1, Math.round(w / 1.6));
    for (let k = 0; k <= n; k++) m.box(0.05, 0.45, 0.05, -w / 2 + (k / n) * w, 1.03, 0, '#3a3f4b');
    m.box(w, 0.05, 0.06, 0, 1.46, 0, '#FFCC00');
  },
  // Unidad de clima (alta): caja con rejilla y ventiladores
  arenaAC(m, w, d) {
    m.box(w * 0.96, 2.1, d * 0.92, 0, 0.12, 0, '#c4c9d1');
    m.box(w, 0.12, d, 0, 0, 0, '#5a5f6b');
    m.box(w * 0.98, 0.06, d * 0.94, 0, 2.22, 0, '#9aa3ad');
    const nf = Math.max(1, Math.round(w / 1.3));
    for (let k = 0; k < nf; k++) {
      const x = -w / 2 + (k + 0.5) * (w / nf);
      m.cyl(Math.min(0.5, (w / nf) * 0.4), 0.05, x, 2.26, 0, '#3a3f4b');
      m.box(0.9 * (w / nf) * 0.7, 0.03, 0.06, x, 2.31, 0, '#20232c');
    }
    for (let k = 0; k < 6; k++) m.box(w * 0.85, 0.035, 0.02, 0, 0.45 + k * 0.22, d * 0.465, '#8d939e');
    m.add(GEO.cyl, w * 0.4, 0.5, 0, 0.14, d * 0.9, 0.14, '#7a8089', { rx: Math.PI / 2 });
  },
  // Ventila baja con aspas
  arenaVent(m, w, d) {
    m.box(w * 0.86, 0.75, d * 0.8, 0, 0, 0, '#9aa3ad');
    m.box(w * 0.9, 0.12, d * 0.85, 0, 0.75, 0, '#7a8089');
    for (let k = 0; k < 5; k++) m.box(w * 0.7, 0.03, 0.02, 0, 0.12 + k * 0.12, d * 0.405, '#3a3f4b');
    m.cyl(0.18, 0.18, 0, 0.87, 0, '#5a5f6b');
  },
  // Tinaco sobre su base
  arenaTank(m, w, d) {
    const r = Math.min(w, d) * 0.42;
    m.box(w * 0.9, 0.35, d * 0.9, 0, 0, 0, '#5a5f6b');
    m.cyl(r, 1.9, 0, 0.35, 0, '#2b2f3a', {}, GEO.cyl);
    for (const y of [0.75, 1.35, 1.95]) m.cyl(r * 1.02, 0.06, 0, y, 0, '#3a3f4b');
    m.cyl(r * 0.6, 0.18, 0, 2.25, 0, '#20232c');
    m.cyl(0.05, 1.2, r * 0.9, 0, r * 0.4, '#9aa3ad');
  },
};
// Los modelos de Zombies dibujan cada tipo de mueble con FURNITURE[tipo]: se agregan los de la arena
Object.assign(FURNITURE, ARENA_PROPS);

// ---------- Cielo nocturno con la ciudad (azotea) ----------
function canvasTex(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
export function skyline(level) {
  const g = new THREE.Group();
  const disposables = [];
  const cx = (level.W * S) / 2, cz = (level.H * S) / 2;
  // cúpula con degradado y estrellas
  const skyTex = canvasTex(64, 512, (c, w, h) => {
    const gr = c.createLinearGradient(0, 0, 0, h);
    gr.addColorStop(0, '#05060f'); gr.addColorStop(0.45, '#151a3d'); gr.addColorStop(0.62, '#3b2456'); gr.addColorStop(0.7, '#7a2f5c'); gr.addColorStop(1, '#1a0f22');
    c.fillStyle = gr; c.fillRect(0, 0, w, h);
    for (let i = 0; i < 80; i++) { c.fillStyle = `rgba(255,255,255,${0.3 + Math.random() * 0.6})`; c.fillRect(Math.random() * w, Math.random() * h * 0.5, 1, 1); }
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(160, 24, 16), new THREE.MeshBasicMaterial({ map: skyTex, side: THREE.BackSide, fog: false, depthWrite: false }));
  sky.position.set(cx, -20, cz);
  g.add(sky);
  disposables.push(skyTex, sky.geometry, sky.material);
  // edificios alrededor (más bajos que la azotea cerca, más altos a lo lejos)
  const winTex = canvasTex(64, 128, (c, w, h) => {
    c.fillStyle = '#0d1020'; c.fillRect(0, 0, w, h);
    for (let y = 4; y < h - 4; y += 8) for (let x = 4; x < w - 4; x += 8) {
      const on = Math.random() < 0.35;
      c.fillStyle = on ? ['#ffd66b', '#ffe9b0', '#9fe3ff', '#ff9dbf'][(Math.random() * 4) | 0] : '#161a2e';
      c.fillRect(x, y, 4, 5);
    }
  });
  winTex.wrapS = winTex.wrapT = THREE.RepeatWrapping;
  const bmat = new THREE.MeshBasicMaterial({ map: winTex, fog: false });
  const geos = [];
  const R0 = Math.max(level.W, level.H) * S * 0.75 + 14;
  for (let i = 0; i < 56; i++) {
    const a = (i / 56) * Math.PI * 2 + Math.random() * 0.05;
    const r = R0 + Math.random() * 40;
    const w = 8 + Math.random() * 14, d = 8 + Math.random() * 12, h = 10 + Math.random() * (r > R0 + 20 ? 70 : 30);
    const bx = new THREE.BoxGeometry(w, h, d);
    const uv = bx.attributes.uv;
    for (let k = 0; k < uv.count; k++) uv.setXY(k, uv.getX(k) * (w / 10), uv.getY(k) * (h / 14));
    bx.translate(cx + Math.cos(a) * r, h / 2 - 34, cz + Math.sin(a) * r);
    geos.push(bx);
  }
  const city = new THREE.Mesh(mergeBoxes(geos), bmat);
  g.add(city);
  disposables.push(winTex, bmat, city.geometry);
  // luna
  const moonTex = canvasTex(64, 64, (c) => { const gr = c.createRadialGradient(32, 32, 4, 32, 32, 30); gr.addColorStop(0, 'rgba(255,250,230,1)'); gr.addColorStop(0.45, 'rgba(255,240,210,.95)'); gr.addColorStop(0.55, 'rgba(255,220,200,.25)'); gr.addColorStop(1, 'rgba(255,200,200,0)'); c.fillStyle = gr; c.fillRect(0, 0, 64, 64); });
  const moon = new THREE.Sprite(new THREE.SpriteMaterial({ map: moonTex, fog: false, depthWrite: false, transparent: true }));
  moon.scale.setScalar(26); moon.position.set(cx + 70, 70, cz - 110);
  g.add(moon);
  disposables.push(moonTex, moon.material);
  return { group: g, dispose() { for (const d of disposables) d.dispose?.(); } };
}
function mergeBoxes(list) {
  let n = 0, ni = 0;
  for (const b of list) { n += b.attributes.position.count; ni += b.index.count; }
  const pos = new Float32Array(n * 3), uv = new Float32Array(n * 2), idx = new Uint32Array(ni);
  let o = 0, oi = 0;
  for (const b of list) {
    pos.set(b.attributes.position.array, o * 3); uv.set(b.attributes.uv.array, o * 2);
    for (let k = 0; k < b.index.count; k++) idx[oi + k] = b.index.array[k] + o;
    o += b.attributes.position.count; oi += b.index.count;
    b.dispose();
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); g.setIndex(new THREE.BufferAttribute(idx, 1));
  return g;
}

// Letrero de neón con texto (para la azotea y la sala)
export function neonBoard(text, color = '#FE3377', w = 4) {
  const tex = canvasTex(512, 128, (c, W, H) => {
    c.fillStyle = 'rgba(8,8,14,.9)'; c.beginPath(); c.roundRect(6, 6, W - 12, H - 12, 20); c.fill();
    c.strokeStyle = color; c.lineWidth = 6; c.shadowColor = color; c.shadowBlur = 18; c.beginPath(); c.roundRect(14, 14, W - 28, H - 28, 16); c.stroke();
    c.font = '900 76px "Archivo Black", system-ui, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillStyle = '#fff'; c.fillText(text, W / 2, H / 2 + 4);
  });
  const m = new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, w / 4), m);
  mesh.userData.dispose = () => { tex.dispose(); m.dispose(); mesh.geometry.dispose(); };
  return mesh;
}

// ---------- La zona (Último en pie): muro de "apagón" y sombra afuera ----------
export class ZoneFx {
  constructor(scene) {
    this.scene = scene;
    const tex = canvasTex(256, 64, (c, w, h) => {
      const gr = c.createLinearGradient(0, h, 0, 0);
      gr.addColorStop(0, 'rgba(120,40,200,.85)'); gr.addColorStop(0.3, 'rgba(40,10,80,.6)'); gr.addColorStop(1, 'rgba(10,4,24,.15)');
      c.fillStyle = gr; c.fillRect(0, 0, w, h);
      c.strokeStyle = 'rgba(254,51,119,.9)'; c.lineWidth = 2;
      for (let x = -h; x < w; x += 16) { c.beginPath(); c.moveTo(x, h); c.lineTo(x + h, 0); c.stroke(); }
      c.fillStyle = 'rgba(255,255,255,.9)'; c.fillRect(0, h - 3, w, 3);
    });
    tex.wrapS = THREE.RepeatWrapping;
    this.tex = tex;
    this.wallMat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, side: THREE.DoubleSide, depthWrite: false, fog: false });
    this.wall = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 6, 64, 1, true), this.wallMat);
    this.wall.renderOrder = 3;
    this.dark = new THREE.Mesh(new THREE.RingGeometry(1, 2, 64), new THREE.MeshBasicMaterial({ color: '#05020c', transparent: true, opacity: 0.55, depthWrite: false, side: THREE.DoubleSide }));
    this.dark.rotation.x = -Math.PI / 2;
    this.next = new THREE.Mesh(new THREE.RingGeometry(0.97, 1, 64), new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.7, depthWrite: false, side: THREE.DoubleSide }));
    this.next.rotation.x = -Math.PI / 2;
    this.group = new THREE.Group();
    this.group.add(this.wall, this.dark, this.next);
    this.group.visible = false;
    scene.add(this.group);
    this.r = -1;
  }
  // z = { x, y, r, to: { x, y, r } } en casillas (o null)
  update(z, t, far = 120) {
    this.group.visible = !!z;
    if (!z) return;
    const r = Math.max(0.05, z.r * S);
    this.wall.position.set(z.x * S, 3, z.y * S);
    this.wall.scale.set(r, 1, r);
    this.tex.offset.x = (t * 0.08) % 1;
    this.tex.repeat.x = Math.max(4, Math.round(r / 1.2));
    if (Math.abs(r - this.r) > 0.05) {
      this.r = r;
      this.dark.geometry.dispose();
      this.dark.geometry = new THREE.RingGeometry(r, far, 64);
    }
    this.dark.position.set(z.x * S, 0.04, z.y * S);
    const n = z.to;
    this.next.visible = !!n && n.r > 0.2 && n.r < z.r - 0.1;
    if (this.next.visible) { this.next.position.set(n.x * S, 0.05, n.y * S); this.next.scale.setScalar(n.r * S); }
  }
  warm() { this.group.visible = true; this.update({ x: 0, y: 0, r: 4, to: { x: 0, y: 0, r: 2 } }, 0); }
  dispose() { this.scene.remove(this.group); this.wall.geometry.dispose(); this.dark.geometry.dispose(); this.next.geometry.dispose(); this.wallMat.dispose(); this.tex.dispose(); }
}

// ---------- Recogibles ----------
const RING_COL = { health: '#ff7ab6', armor: '#4FD8FF', ammo: '#FFCC00', gun: '#7CFF4F' };
export class Loot {
  constructor(scene) { this.scene = scene; this.pool = new Map(); }
  make(k) {
    const g = new THREE.Group();
    const inner = new THREE.Group();
    g.add(inner);
    if (k.kind === 'health') {
      const d = new THREE.Mesh(GEO.torus.clone(), mat('#f4a261')); d.scale.setScalar(0.62); d.rotation.x = Math.PI / 2; inner.add(d);
      const ic = new THREE.Mesh(GEO.torus.clone(), mat('#f15bb5')); ic.scale.set(0.64, 0.64, 0.3); ic.rotation.x = Math.PI / 2; ic.position.y = 0.05; inner.add(ic);
    } else if (k.kind === 'armor') {
      // chaleco reflectante
      inner.add(part(0.42, 0.46, 0.14, '#ff8a3d'));
      inner.add(part(0.44, 0.06, 0.15, '#e6ff4a', { y: 0.06 })); inner.add(part(0.44, 0.06, 0.15, '#e6ff4a', { y: -0.1 }));
      inner.add(part(0.12, 0.1, 0.15, '#ff8a3d', { x: -0.12, y: 0.27 })); inner.add(part(0.12, 0.1, 0.15, '#ff8a3d', { x: 0.12, y: 0.27 }));
      inner.add(part(0.1, 0.24, 0.16, '#20232c', { y: 0.06 }));
    } else if (k.kind === 'ammo') {
      inner.add(part(0.36, 0.22, 0.26, '#ffcc00')); inner.add(part(0.37, 0.05, 0.27, '#141414', { y: 0.04 })); inner.add(part(0.22, 0.08, 0.01, '#d62f3a', { z: 0.131 }));
    } else {
      const W = ARMS[k.w];
      if (W?.kind === 'sword') { const s = avatarSword(W.color); s.rotation.z = Math.PI / 2.4; s.position.set(-0.3, -0.05, 0); inner.add(s); }
      else if (W) { const v = viewWeapon(k.w).group; v.rotation.y = Math.PI / 2; v.scale.multiplyScalar(1.1); inner.add(v); }
    }
    const glow = new THREE.Mesh(new THREE.RingGeometry(0.28, 0.46, 24), new THREE.MeshBasicMaterial({ color: RING_COL[k.kind] || '#fff', transparent: true, opacity: 0.55, side: THREE.DoubleSide, depthWrite: false }));
    glow.rotation.x = -Math.PI / 2; glow.position.y = -0.33;
    g.add(glow);
    g.userData.inner = inner;
    this.scene.add(g);
    return g;
  }
  // list = [{ id, kind, w, x, z }] en metros
  update(list, t) {
    const seen = new Set();
    for (const k of list) {
      seen.add(k.id);
      let g = this.pool.get(k.id);
      if (!g) { g = this.make(k); this.pool.set(k.id, g); }
      g.position.set(k.x, 0.4 + Math.sin(t * 3 + k.id) * 0.06, k.z);
      g.userData.inner.rotation.y = t * 1.6 + k.id;
    }
    for (const [id, g] of this.pool) if (!seen.has(id)) { this.scene.remove(g); this.pool.delete(id); }
  }
  clear() { for (const [, g] of this.pool) this.scene.remove(g); this.pool.clear(); }
}
