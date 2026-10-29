// Las pistas en 3D: la pista (piso, bordillos, barreras, turbos, rampas, salida), la oficina alrededor
// con el mismo estilo de cubos de Zombies (escritorios, sillas, sofás, plantas, arcades, letreros de
// las salas, alfombras y pisos de madera) y, en la Torre, los pisos, el elevador, la azotea y la ciudad.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { Mesher, FURNITURE, DECOR, SURFACE } from '../zombies/models.js';
import { renderBrand } from '../../lib/render.js';
import { sampleAt, pointAt, groundAt } from '@shared/karts.js';
import { itemBoxTexture } from './models.js';

const PINK = '#FE3377', YEL = '#FFCC00', INK = '#141414';

function canvasTex(w, h, draw, { repeat = false, nearest = false, aniso = 4 } = {}) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  if (nearest) t.magFilter = THREE.NearestFilter;
  t.anisotropy = aniso;
  return t;
}
const rnd = (seed) => { let s = seed >>> 0 || 1; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; };
const mixHex = (a, b, k) => '#' + new THREE.Color(a).lerp(new THREE.Color(b), k).getHexString();

export function signTexture(text, color = PINK, sub = '') {
  return canvasTex(512, 128, (g, w, h) => {
    g.fillStyle = INK; g.beginPath(); g.roundRect(4, 4, w - 8, h - 8, 18); g.fill();
    g.strokeStyle = color; g.lineWidth = 6; g.beginPath(); g.roundRect(10, 10, w - 20, h - 20, 14); g.stroke();
    g.fillStyle = '#fff'; g.textAlign = 'center'; g.textBaseline = 'middle';
    let size = 60;
    g.font = `900 ${size}px "Archivo Black", system-ui, sans-serif`;
    while (g.measureText(text).width > w - 60 && size > 22) { size -= 2; g.font = `900 ${size}px "Archivo Black", system-ui, sans-serif`; }
    g.shadowColor = color; g.shadowBlur = 16;
    g.fillText(text, w / 2, h / 2 + (sub ? -10 : 2));
    if (sub) { g.shadowBlur = 0; g.font = '700 20px system-ui, sans-serif'; g.fillStyle = color; g.fillText(sub, w / 2, h - 26); }
  });
}

// ---------- Texturas ----------
function roadTexture(theme) {
  const base = theme === 'juegos' ? '#33313f' : theme === 'torre' ? '#2c2f38' : '#3a3e48';
  return canvasTex(256, 512, (g, w, h) => {
    g.fillStyle = base; g.fillRect(0, 0, w, h);
    const r = rnd(7);
    for (let i = 0; i < 2600; i++) { g.fillStyle = `rgba(${r() < 0.5 ? '255,255,255' : '0,0,0'},${r() * 0.07})`; g.fillRect(r() * w, r() * h, 2, 2); }
    // líneas de orilla y centro punteado
    g.fillStyle = 'rgba(255,255,255,.85)'; g.fillRect(w * 0.115, 0, 4, h); g.fillRect(w * 0.885 - 4, 0, 4, h);
    g.fillStyle = 'rgba(255,255,255,.55)'; g.fillRect(w / 2 - 3, 0, 6, h * 0.45);
    // marcas de llanta
    g.fillStyle = 'rgba(0,0,0,.12)'; g.fillRect(w * 0.3, 0, 10, h); g.fillRect(w * 0.66, 0, 10, h);
  }, { repeat: true });
}
function curbTexture(a, b) {
  return canvasTex(32, 128, (g, w, h) => {
    g.fillStyle = a; g.fillRect(0, 0, w, h / 2); g.fillStyle = b; g.fillRect(0, h / 2, w, h / 2);
    g.fillStyle = 'rgba(0,0,0,.18)'; g.fillRect(0, 0, 3, h);
  }, { repeat: true });
}
function barrierTexture(colors, label = 'HUB') {
  return canvasTex(512, 64, (g, w, h) => {
    const n = colors.length * 2;
    for (let k = 0; k < n; k++) {
      const c = colors[k % colors.length];
      g.fillStyle = c; g.fillRect((k * w) / n, 0, w / n, h);
      g.fillStyle = 'rgba(255,255,255,.18)'; g.fillRect((k * w) / n, 0, w / n, 6);
      g.fillStyle = 'rgba(0,0,0,.25)'; g.fillRect((k * w) / n, h - 6, w / n, 6); g.fillRect(((k + 1) * w) / n - 2, 0, 2, h);
      if (k % 2 === 0) {
        g.fillStyle = c === '#ffffff' || c === '#f4f4f6' ? INK : '#fff';
        g.font = '900 30px "Archivo Black", system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
        g.fillText(label, ((k + 0.5) * w) / n, h / 2 + 1);
      }
    }
  }, { repeat: true });
}
function chevronTexture(a, b) {
  return canvasTex(128, 128, (g, w, h) => {
    g.fillStyle = b; g.fillRect(0, 0, w, h);
    g.fillStyle = a;
    for (let k = 0; k < 2; k++) {
      const y = k * 64;
      g.beginPath(); g.moveTo(0, y + 40); g.lineTo(w / 2, y + 4); g.lineTo(w, y + 40); g.lineTo(w, y + 62); g.lineTo(w / 2, y + 26); g.lineTo(0, y + 62); g.fill();
    }
  }, { repeat: true });
}
function checkerTexture(n = 8) {
  return canvasTex(128, 32, (g, w, h) => {
    const cs = w / n;
    for (let i = 0; i < n; i++) for (let j = 0; j < 2; j++) { g.fillStyle = (i + j) % 2 ? INK : '#fff'; g.fillRect(i * cs, j * (h / 2), cs, h / 2); }
  }, { repeat: true, nearest: true });
}
function windowWallTexture(stripe) {
  return canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = '#d9d4cb'; g.fillRect(0, 0, w, h);
    const r = rnd(3);
    for (let i = 0; i < 300; i++) { g.fillStyle = `rgba(0,0,0,${r() * 0.03})`; g.fillRect(r() * w, r() * h, 3, 3); }
    // ventanal con la ciudad de noche
    const x0 = 14, y0 = 26, ww = w - 28, hh = 150;
    const gr = g.createLinearGradient(0, y0, 0, y0 + hh);
    gr.addColorStop(0, '#141836'); gr.addColorStop(0.7, '#3a2f5c'); gr.addColorStop(1, '#6a3d6b');
    g.fillStyle = '#3a3f4b'; g.fillRect(x0 - 5, y0 - 5, ww + 10, hh + 10);
    g.fillStyle = gr; g.fillRect(x0, y0, ww, hh);
    for (let i = 0; i < 9; i++) {
      const bw = 14 + r() * 26, bh = 30 + r() * 90, bx = x0 + r() * (ww - bw);
      g.fillStyle = '#0d1022'; g.fillRect(bx, y0 + hh - bh, bw, bh);
      for (let k = 0; k < 14; k++) if (r() < 0.6) { g.fillStyle = r() < 0.8 ? '#ffd66b' : '#9fe3ff'; g.fillRect(bx + 2 + r() * (bw - 5), y0 + hh - bh + 4 + r() * (bh - 8), 2, 2); }
    }
    for (let i = 0; i < 14; i++) { g.fillStyle = 'rgba(255,255,255,.7)'; g.fillRect(x0 + r() * ww, y0 + r() * 40, 1, 1); }
    g.fillStyle = '#3a3f4b'; g.fillRect(x0 + ww / 2 - 2, y0, 4, hh); g.fillRect(x0, y0 + hh * 0.55, ww, 3);
    g.fillStyle = 'rgba(255,255,255,.1)'; g.beginPath(); g.moveTo(x0, y0); g.lineTo(x0 + 50, y0); g.lineTo(x0, y0 + 60); g.fill();
    g.fillStyle = stripe; g.fillRect(0, 196, w, 8);
    g.fillStyle = '#4a4f5c'; g.fillRect(0, h - 22, w, 22);
  }, { repeat: true });
}
function ceilingTexture(lit) {
  return canvasTex(128, 128, (g, w, h) => {
    g.fillStyle = lit ? '#000' : '#cfd2d6'; g.fillRect(0, 0, w, h);
    if (!lit) { g.fillStyle = '#b8bcc2'; for (let x = 0; x < w; x += 32) g.fillRect(x, 0, 1, h); for (let y = 0; y < h; y += 32) g.fillRect(0, y, w, 1); }
    g.fillStyle = lit ? '#fff' : '#f4f6ff';
    g.fillRect(36, 44, 56, 18);
    if (!lit) { g.fillStyle = '#9aa3ad'; g.fillRect(35, 43, 58, 1); }
  }, { repeat: true });
}
function boostTexture() {
  return canvasTex(64, 128, (g, w, h) => {
    const gr = g.createLinearGradient(0, 0, 0, h);
    gr.addColorStop(0, '#ff8a3d'); gr.addColorStop(1, '#FFCC00');
    g.fillStyle = 'rgba(20,20,20,.5)'; g.fillRect(0, 0, w, h);
    g.fillStyle = gr;
    for (let k = 0; k < 2; k++) { const y = k * 64; g.beginPath(); g.moveTo(4, y + 52); g.lineTo(w / 2, y + 10); g.lineTo(w - 4, y + 52); g.lineTo(w - 4, y + 62); g.lineTo(w / 2, y + 24); g.lineTo(4, y + 62); g.fill(); }
  }, { repeat: true });
}

// Piso de la oficina pintado en un lienzo grande (madera, alfombra, loseta, alfombra de arcade)
function paintFloor(g, kind, x, y, w, h, r, opts = {}) {
  if (kind === 'wood') {
    g.fillStyle = opts.color || '#b07a4c'; g.fillRect(x, y, w, h);
    const pw = opts.plank || 7;
    for (let yy = y; yy < y + h; yy += pw) {
      let xx = x - r() * 40;
      while (xx < x + w) {
        const len = 30 + r() * 50;
        g.fillStyle = `rgba(${r() < 0.5 ? '255,230,200' : '60,30,10'},${0.06 + r() * 0.1})`;
        g.fillRect(xx, yy, len, pw - 1);
        g.fillStyle = 'rgba(60,30,10,.35)'; g.fillRect(xx, yy + pw - 1, len, 1); g.fillRect(xx + len - 1, yy, 1, pw);
        xx += len;
      }
    }
  } else if (kind === 'carpet') {
    g.fillStyle = opts.color || '#5a6478'; g.fillRect(x, y, w, h);
    const ts = opts.tile || 24;
    for (let yy = y; yy < y + h; yy += ts) for (let xx = x; xx < x + w; xx += ts) {
      g.fillStyle = `rgba(${((xx + yy) / ts) % 2 ? '255,255,255' : '0,0,0'},0.05)`; g.fillRect(xx, yy, ts, ts);
      g.fillStyle = 'rgba(0,0,0,.12)'; g.fillRect(xx, yy, ts, 1); g.fillRect(xx, yy, 1, ts);
    }
    for (let i = 0; i < (w * h) / 40; i++) { g.fillStyle = `rgba(255,255,255,${r() * 0.05})`; g.fillRect(x + r() * w, y + r() * h, 1, 1); }
  } else if (kind === 'arcade') {
    // alfombra de arcade: azul marino con figuras neón
    g.fillStyle = '#17142c'; g.fillRect(x, y, w, h);
    const cols = ['#FE3377', '#FFCC00', '#3ad1ff', '#8B7BFF', '#2bb673'];
    for (let i = 0; i < (w * h) / 900; i++) {
      const cx = x + r() * w, cy = y + r() * h, s = 6 + r() * 10, c = cols[(r() * cols.length) | 0];
      g.strokeStyle = c; g.fillStyle = c; g.lineWidth = 2;
      const t = r();
      if (t < 0.3) { g.beginPath(); g.moveTo(cx, cy - s); g.lineTo(cx + s, cy + s); g.lineTo(cx - s, cy + s); g.closePath(); g.stroke(); }
      else if (t < 0.55) { g.beginPath(); g.arc(cx, cy, s * 0.6, 0, Math.PI * 2); g.stroke(); }
      else if (t < 0.8) { g.beginPath(); g.moveTo(cx - s, cy); for (let k = 1; k <= 4; k++) g.lineTo(cx - s + (k * s) / 2, cy + (k % 2 ? -s / 2 : s / 2)); g.stroke(); }
      else { g.fillRect(cx, cy, 3, 3); }
    }
  } else if (kind === 'tile') {
    g.fillStyle = opts.color || '#d8d2c6'; g.fillRect(x, y, w, h);
    const ts = opts.tile || 36;
    for (let yy = y; yy < y + h; yy += ts) for (let xx = x; xx < x + w; xx += ts) {
      g.fillStyle = `rgba(255,255,255,${0.04 + r() * 0.08})`; g.fillRect(xx + 1, yy + 1, ts - 2, ts - 2);
      g.fillStyle = 'rgba(80,70,60,.25)'; g.fillRect(xx, yy, ts, 1); g.fillRect(xx, yy, 1, ts);
    }
  } else if (kind === 'street') {
    g.fillStyle = '#23252c'; g.fillRect(x, y, w, h);
    for (let i = 0; i < (w * h) / 30; i++) { g.fillStyle = `rgba(255,255,255,${r() * 0.04})`; g.fillRect(x + r() * w, y + r() * h, 2, 2); }
  } else if (kind === 'concrete') {
    g.fillStyle = opts.color || '#6b6f78'; g.fillRect(x, y, w, h);
    const ts = opts.tile || 48;
    for (let yy = y; yy < y + h; yy += ts) for (let xx = x; xx < x + w; xx += ts) { g.fillStyle = `rgba(0,0,0,${0.03 + r() * 0.06})`; g.fillRect(xx + 1, yy + 1, ts - 2, ts - 2); g.fillStyle = 'rgba(0,0,0,.25)'; g.fillRect(xx, yy, ts, 1); g.fillRect(xx, yy, 1, ts); }
  }
}

// ---------- Constructor de la pista ----------
export function buildTrackWorld(T, { quality = 'alta' } = {}) {
  const root = new THREE.Group();
  const disposables = [];
  const hi = quality === 'alta';
  const theme = T.def.theme;
  const brand = renderBrand();
  const accent = T.def.accent;
  const S = T.samples, N = T.N;
  const m = new Mesher();
  const R = rnd(T.N * 31 + theme.length);
  const updaters = [];
  const signs = []; // letreros sobre la pista { text, s, color }

  // límites
  let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
  for (const p of S) { x0 = Math.min(x0, p.x - p.hw); x1 = Math.max(x1, p.x + p.hw); z0 = Math.min(z0, p.z - p.hw); z1 = Math.max(z1, p.z + p.hw); }
  const pad = theme === 'torre' ? 30 : 16;
  const B = { x0: x0 - pad, x1: x1 + pad, z0: z0 - pad, z1: z1 + pad };
  const cx = (B.x0 + B.x1) / 2, cz = (B.z0 + B.z1) / 2;

  // ¿un punto queda libre de la pista? (para no poner muebles encima)
  const reserved = [];
  function clear(x, z, rad = 1, y = 0, margin = 1.6) {
    for (const r of reserved) if (Math.hypot(x - r.x, z - r.z) < r.r + rad) return false;
    for (let i = 0; i < N; i += 1) {
      const p = S[i];
      if (Math.abs(p.y - y) > 3.5) continue;
      const d = Math.hypot(p.x - x, p.z - z);
      if (d < p.hw + margin + rad) return false;
    }
    return true;
  }
  // ¿adentro del circuito? (para saber qué lado es el "infield")
  const poly = S.filter((_, i) => i % 3 === 0).map((p) => [p.x, p.z]);
  function inside(x, z) {
    let c = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const [xi, zi] = poly[i], [xj, zj] = poly[j];
      if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi + 1e-9) + xi) c = !c;
    }
    return c;
  }
  const outSide = (s) => { const p = pointAt(T, s, 8); return inside(p.x, p.z) ? -1 : 1; }; // signo de lat hacia afuera

  // ---------- Piso de la oficina ----------
  const PX = hi ? 6 : 4;
  const FW = Math.ceil((B.x1 - B.x0) * PX), FH = Math.ceil((B.z1 - B.z0) * PX);
  const toPx = (x, z) => [(x - B.x0) * PX, (z - B.z0) * PX];
  const floorTex = canvasTex(FW, FH, (g) => {
    const r = rnd(11);
    if (theme === 'oficina') {
      paintFloor(g, 'wood', 0, 0, FW, FH, r, { color: '#b9824f', plank: Math.round(PX * 0.9) });
      // alfombra del área de escritorios (adentro del óvalo)
      g.save(); g.beginPath(); poly.forEach(([x, z], i) => { const [px, pz] = toPx(x, z); i ? g.lineTo(px, pz) : g.moveTo(px, pz); }); g.closePath(); g.clip();
      paintFloor(g, 'carpet', 0, 0, FW, FH, r, { color: '#55617a', tile: PX * 3 });
      g.restore();
    } else if (theme === 'juegos') {
      paintFloor(g, 'arcade', 0, 0, FW, FH, r);
    } else {
      paintFloor(g, 'street', 0, 0, FW, FH, r);
    }
  });
  floorTex.minFilter = THREE.LinearMipmapLinearFilter;
  const floorMesh = new THREE.Mesh(new THREE.PlaneGeometry(B.x1 - B.x0, B.z1 - B.z0), new THREE.MeshLambertMaterial({ map: floorTex }));
  floorMesh.rotation.x = -Math.PI / 2;
  floorMesh.position.set(cx, -0.03, cz);
  root.add(floorMesh);
  disposables.push(floorTex, floorMesh.geometry, floorMesh.material);

  // Alfombras y zonas pintadas encima (planos con su propia textura)
  function rug(x, z, w, d, draw, rot = 0, y = 0.012) {
    const tex = canvasTex(Math.ceil(w * 16), Math.ceil(d * 16), draw);
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, d), new THREE.MeshLambertMaterial({ map: tex, transparent: true }));
    mesh.rotation.set(-Math.PI / 2, 0, rot);
    mesh.position.set(x, y, z);
    root.add(mesh);
    disposables.push(tex, mesh.geometry, mesh.material);
    return mesh;
  }

  // ---------- La pista ----------
  // Tira a lo largo de la pista entre dos desplazamientos laterales (a y b) a cierta altura
  function strip(latA, latB, yA, yB, { vLen = 8, filter = null, uA = 0, uB = 1 } = {}) {
    const pos = [], uv = [], idx = [];
    for (let i = 0; i <= N; i++) {
      const p = S[i % N];
      const s = i === N ? T.length : p.s;
      const la = typeof latA === 'function' ? latA(p) : latA, lb = typeof latB === 'function' ? latB(p) : latB;
      const ya = typeof yA === 'function' ? yA(p) : yA, yb = typeof yB === 'function' ? yB(p) : yB;
      pos.push(p.x + p.nx * la, p.y + ya, p.z + p.nz * la, p.x + p.nx * lb, p.y + yb, p.z + p.nz * lb);
      uv.push(uA, s / vLen, uB, s / vLen);
    }
    for (let i = 0; i < N; i++) {
      if (filter && !filter(S[i], S[(i + 1) % N])) continue;
      const a = i * 2, b = a + 1, c = a + 2, d = a + 3;
      idx.push(a, b, c, b, d, c);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    return geo;
  }
  function addMesh(geo, material, { order = 0 } = {}) {
    const mesh = new THREE.Mesh(geo, material);
    mesh.renderOrder = order;
    root.add(mesh);
    disposables.push(geo, material);
    return mesh;
  }
  const roadTex = roadTexture(theme);
  addMesh(strip((p) => -p.hw, (p) => p.hw, 0.02, 0.02, { vLen: 10 }), new THREE.MeshLambertMaterial({ map: roadTex, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2 }));
  disposables.push(roadTex);
  // bordillos
  const curbA = accent === YEL ? YEL : PINK;
  const curbTex = curbTexture(curbA, '#f4f4f6');
  const curbMat = new THREE.MeshLambertMaterial({ map: curbTex, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 });
  const curbW = 0.85;
  addMesh(strip((p) => -p.hw, (p) => -p.hw + curbW, 0.05, 0.035, { vLen: 2.4 }), curbMat);
  addMesh(strip((p) => p.hw - curbW, (p) => p.hw, 0.035, 0.05, { vLen: 2.4 }), curbMat.clone());
  disposables.push(curbTex);

  // barreras: bloques de espuma con el logo (en lo alto, barandal de vidrio)
  const elevated = (p) => p.y > 0.6;
  const barColors = [brand.primary && brand.primary !== '#157A6E' ? brand.primary : PINK, '#f4f4f6', accent === PINK ? YEL : accent];
  const barTex = barrierTexture(barColors, 'HUB');
  const barMat = new THREE.MeshLambertMaterial({ map: barTex, side: THREE.DoubleSide });
  const capMat = new THREE.MeshLambertMaterial({ color: '#2b2f3a', side: THREE.DoubleSide });
  const BH = 0.75;
  for (const side of [-1, 1]) {
    const li = (p) => side * (p.hw + 0.1), lo = (p) => side * (p.hw + 0.55);
    addMesh(strip(li, li, 0, BH, { vLen: 7.5 }), barMat);
    addMesh(strip(lo, lo, 0, BH, { vLen: 7.5 }), barMat);
    addMesh(strip(li, lo, BH, BH, { vLen: 7.5 }), capMat);
  }
  // en lo alto: barandal de vidrio arriba de la barrera, faldón y columnas
  const glassMat = new THREE.MeshLambertMaterial({ color: '#a8d8ff', transparent: true, opacity: 0.22, depthWrite: false, side: THREE.DoubleSide });
  const skirtMat = new THREE.MeshLambertMaterial({ color: theme === 'torre' ? '#3a3f4b' : '#5a5f6b', side: THREE.DoubleSide });
  const elevF = (p, q) => elevated(p) || elevated(q);
  for (const side of [-1, 1]) {
    const lo = (p) => side * (p.hw + 0.55);
    addMesh(strip(lo, lo, BH, BH + 0.8, { filter: elevF }), glassMat, { order: 3 });
    addMesh(strip(lo, lo, -0.7, 0, { filter: elevF }), skirtMat);
  }
  addMesh(strip((p) => -p.hw - 0.55, (p) => p.hw + 0.55, -0.7, -0.7, { filter: elevF }), skirtMat.clone());
  // columnas (si no hay otra parte de la pista abajo)
  for (let i = 0; i < N; i += 9) {
    const p = S[i];
    if (p.y < 1.4) continue;
    let below = false;
    for (const q of S) if (q.y < p.y - 2 && Math.hypot(q.x - p.x, q.z - p.z) < q.hw + 1.5) { below = true; break; }
    if (below) continue;
    for (const side of [-1, 1]) m.place(p.x + p.nx * side * (p.hw - 1), p.z + p.nz * side * (p.hw - 1)).box(0.7, p.y - 0.7, 0.7, 0, 0, 0, '#6b7080');
  }
  disposables.push(barTex);

  // ---------- Salida / meta ----------
  const st = sampleAt(T, 0);
  const startYaw = Math.atan2(st.tx, st.tz);
  const chk = checkerTexture(10);
  {
    const g = new THREE.PlaneGeometry(st.hw * 2, 1.6);
    const mesh = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ map: chk, polygonOffset: true, polygonOffsetFactor: -2 }));
    mesh.rotation.set(-Math.PI / 2, 0, startYaw + Math.PI / 2);
    mesh.position.set(st.x, st.y + 0.03, st.z);
    root.add(mesh);
    disposables.push(g, mesh.material, chk);
    // parrilla: líneas blancas
    for (const gp of T.grid) {
      const L = sampleAt(T, gp.s);
      m.place(gp.x + L.tx * 1.0, gp.z + L.tz * 1.0, Math.atan2(L.tx, L.tz), L.y + 0.03).box(1.5, 0.005, 0.12, 0, 0, 0, '#f4f4f6').box(0.1, 0.005, 0.7, -0.7, 0, -0.3, '#f4f4f6').box(0.1, 0.005, 0.7, 0.7, 0, -0.3, '#f4f4f6');
    }
  }
  // arco de salida con el letrero y el semáforo
  const lights = [];
  {
    const w = st.hw * 2 + 2.4, hgt = 4.6;
    for (const side of [-1, 1]) m.place(st.x + st.nx * side * (st.hw + 1.1), st.z + st.nz * side * (st.hw + 1.1), startYaw, st.y).box(0.6, hgt, 0.6, 0, 0, 0, '#2b2f3a').box(0.7, 0.3, 0.7, 0, 0, 0, accent);
    m.place(st.x, st.z, startYaw, st.y).box(w, 0.25, 0.7, 0, hgt - 0.1, 0, '#2b2f3a');
    const tex = signTexture('SALIDA · META', accent, 'KARTS DE OFICINA');
    const bm = new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide });
    const board = new THREE.Mesh(new THREE.PlaneGeometry(Math.min(w - 1, 9), Math.min(w - 1, 9) / 4), bm);
    board.position.set(st.x, st.y + hgt + 1.1, st.z);
    board.rotation.y = startYaw + Math.PI;
    root.add(board);
    disposables.push(tex, bm, board.geometry);
    for (let k = 0; k < 3; k++) {
      const lm = new THREE.MeshBasicMaterial({ color: '#331111' });
      const l = new THREE.Mesh(new THREE.CircleGeometry(0.32, 16), lm);
      const off = (k - 1) * 0.9;
      l.position.set(st.x - st.nx * off - st.tx * 0.36, st.y + hgt - 0.6, st.z - st.nz * off - st.tz * 0.36);
      l.rotation.y = startYaw + Math.PI;
      root.add(l);
      lights.push(l);
      m.place(st.x - st.nx * off, st.z - st.nz * off, startYaw, st.y).box(0.85, 0.85, 0.6, 0, hgt - 1.02, 0, INK);
      disposables.push(lm, l.geometry);
    }
  }
  reserved.push({ x: st.x, z: st.z, r: st.hw + 3 });

  // ---------- Turbos ----------
  const btex = boostTexture();
  const boostMat = new THREE.MeshBasicMaterial({ map: btex, transparent: true, polygonOffset: true, polygonOffsetFactor: -3 });
  for (const b of T.boosts) {
    const p = pointAt(T, b.s + b.len / 2, b.lat);
    const L = sampleAt(T, b.s + b.len / 2);
    const g = new THREE.PlaneGeometry(b.w, b.len);
    const mesh = new THREE.Mesh(g, boostMat);
    mesh.rotation.set(-Math.PI / 2, 0, Math.atan2(L.tx, L.tz) + Math.PI);
    mesh.position.set(p.x, p.y + 0.04, p.z);
    root.add(mesh);
    disposables.push(g);
    m.place(p.x, p.z, Math.atan2(L.tx, L.tz), p.y).box(b.w + 0.3, 0.03, b.len + 0.3, 0, 0.005, 0, '#141414');
  }
  btex.repeat.set(1, 2);
  updaters.push((dt, t) => { btex.offset.y = -(t * 2.2) % 1; });
  disposables.push(btex, boostMat);

  // ---------- Rampas (y el sofá) ----------
  const chev = chevronTexture(INK, YEL);
  const rampMat = new THREE.MeshLambertMaterial({ map: chev });
  const rampSide = new THREE.MeshLambertMaterial({ color: '#2b2f3a' });
  for (const r of T.ramps) {
    const pos = [], uv = [], idx = [], side = [];
    const n = Math.ceil(r.len / 0.5);
    const p0 = sampleAt(T, r.s);
    const l0 = Math.max(r.l0, -p0.hw + 0.1), l1 = Math.min(r.l1, p0.hw - 0.1);
    for (let k = 0; k <= n; k++) {
      const s = r.s + (r.len * k) / n;
      const P = sampleAt(T, s);
      const y = groundAt(T, s, (l0 + l1) / 2) + 0.025;
      pos.push(P.x + P.nx * l0, y, P.z + P.nz * l0, P.x + P.nx * l1, y, P.z + P.nz * l1);
      uv.push(0, (k / n) * (r.len / 2.5), (l1 - l0) / 2.5, (k / n) * (r.len / 2.5));
      side.push({ P, y });
    }
    for (let k = 0; k < n; k++) { const a = k * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    geo.setIndex(idx); geo.computeVertexNormals();
    addMesh(geo, rampMat);
    // lados y la cara de atrás
    const sp = [];
    for (const l of [l0, l1]) for (let k = 0; k < n; k++) {
      const A = side[k], Bq = side[k + 1];
      const ax = A.P.x + A.P.nx * l, az = A.P.z + A.P.nz * l, bx = Bq.P.x + Bq.P.nx * l, bz = Bq.P.z + Bq.P.nz * l;
      sp.push(ax, A.P.y, az, bx, Bq.P.y, bz, bx, Bq.y, bz, ax, A.P.y, az, bx, Bq.y, bz, ax, A.y, az);
    }
    const E = side[n];
    for (const [la, lb] of [[l0, l1]]) {
      const ax = E.P.x + E.P.nx * la, az = E.P.z + E.P.nz * la, bx = E.P.x + E.P.nx * lb, bz = E.P.z + E.P.nz * lb;
      sp.push(ax, E.P.y, az, bx, E.P.y, bz, bx, E.y, bz, ax, E.P.y, az, bx, E.y, bz, ax, E.y, az);
    }
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.Float32BufferAttribute(sp, 3));
    sg.computeVertexNormals();
    const sm = new THREE.Mesh(sg, rampSide); sm.material.side = THREE.DoubleSide;
    root.add(sm); disposables.push(sg);
    if (r.sofa) {
      const P = sampleAt(T, r.s + r.len + 2.8);
      const lc = (l0 + l1) / 2;
      m.place(P.x + P.nx * lc, P.z + P.nz * lc, Math.atan2(P.tx, P.tz) + Math.PI, P.y);
      FURNITURE.sofa(m, l1 - l0, 1.0, PINK);
      // letrero "¡Salta el sofá!"
      signs.push({ text: '¡SALTA EL SOFÁ!', s: r.s - 6, color: YEL, over: true });
    }
  }
  disposables.push(chev, rampMat, rampSide);

  // ---------- Cajas de objetos ----------
  const boxTex = itemBoxTexture();
  const boxMat = new THREE.MeshLambertMaterial({ map: boxTex, emissive: new THREE.Color('#552233'), transparent: true, opacity: 0.92 });
  const boxGeo = new THREE.BoxGeometry(0.9, 0.9, 0.9);
  const boxes = T.boxes.map((b) => {
    const p = pointAt(T, b.s, b.lat);
    const mesh = new THREE.Mesh(boxGeo, boxMat);
    mesh.position.set(p.x, p.y + 1, p.z);
    root.add(mesh);
    return { ...b, mesh, x: p.x, y: p.y, z: p.z, hidden: 0 };
  });
  disposables.push(boxTex, boxMat, boxGeo);
  updaters.push((dt, t) => {
    for (const b of boxes) {
      b.hidden = Math.max(0, b.hidden - dt);
      const sc = b.hidden > 0 ? 0 : Math.min(1, b.mesh.scale.x + dt * 3);
      b.mesh.scale.setScalar(Math.max(0.001, sc));
      b.mesh.visible = sc > 0.01;
      b.mesh.rotation.set(t * 0.7 + b.id, t * 1.1 + b.id, 0);
      b.mesh.position.y = b.y + 1 + Math.sin(t * 2.4 + b.id) * 0.12;
    }
  });

  // ---------- Muebles de la oficina (mismo estilo que Zombies) ----------
  const surf = (type) => SURFACE[type] || 0;
  function furn(type, x, z, yaw = 0, color, { w = 1, d = 1, y = 0, rad = null, check = true } = {}) {
    if (check && !clear(x, z, rad ?? Math.max(w, d) / 2, y)) return false;
    m.place(x, z, yaw, y);
    const fn = FURNITURE[type] || DECOR[type];
    if (!fn) return false;
    try { fn(m, w, d, color || '#9aa3ad'); } catch { m.box(w * 0.9, 0.8, d * 0.9, 0, 0, 0, '#9aa3ad'); }
    return true;
  }
  function decor(type, x, z, yaw, color, y) { m.place(x, z, yaw, y); try { DECOR[type]?.(m, 0.5, 0.5, color); } catch { /* nada */ } }
  // local → mundo
  const rot = (x, z, yaw, lx, lz) => [x + Math.cos(yaw) * lx + Math.sin(yaw) * lz, z - Math.sin(yaw) * lx + Math.cos(yaw) * lz];
  // grupo de dos escritorios frente a frente con monitores, sillas y una planta
  function deskPod(x, z, yaw, { type = 'desk', color = '#a0673f', chair = '#1d1d22', chairType = 'officeChair', y = 0, gamer = false } = {}) {
    if (!clear(x, z, 2.6, y)) return false;
    for (const side of [-1, 1]) {
      for (const k of [-1, 1]) {
        const [dx, dz] = rot(x, z, yaw, k * 1.25, side * 0.6);
        const fy = side > 0 ? yaw : yaw + Math.PI;
        m.place(dx, dz, fy, y);
        FURNITURE[type](m, 2.4, 1.1, color);
        const top = surf(type) + y;
        const [mx, mz] = rot(x, z, yaw, k * 1.25, side * 0.35);
        decor(gamer ? 'curvedMonitor' : (k + side) % 4 === 0 ? 'dualMonitor' : 'monitor', mx, mz, fy + Math.PI, '#26262e', top);
        const [kx, kz] = rot(x, z, yaw, k * 1.25, side * 0.85);
        decor('keyboard', kx, kz, fy + Math.PI, '#2b2f3a', top);
        if (R() < 0.5) { const [ux, uz] = rot(x, z, yaw, k * 1.25 + 0.7, side * 0.75); decor(R() < 0.5 ? 'mug' : 'smallPlant', ux, uz, 0, ['#fff', PINK, YEL][(R() * 3) | 0], top); }
        if (gamer) { const [gx, gz] = rot(x, z, yaw, k * 1.25 - 0.95, side * 0.5); decor('gamingPC', gx, gz, fy, PINK, y); }
        const [cxx, czz] = rot(x, z, yaw, k * 1.25, side * 1.55);
        m.place(cxx, czz, fy + Math.PI + (R() - 0.5) * 0.5, y);
        FURNITURE[chairType](m, 0.7, 0.7, chair);
      }
    }
    const [px, pz] = rot(x, z, yaw, 2.9, 0);
    m.place(px, pz, 0, y); FURNITURE.plant(m, 0.9, 0.9);
    return true;
  }
  // letreros colgados (encima de la pista o de una sala)
  function hangSign(text, x, z, yaw, { color = accent, y = 4.2, w = 5, sub = '' } = {}) {
    const tex = signTexture(text.toUpperCase(), color, sub);
    const smat = new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide });
    const board = new THREE.Mesh(new THREE.PlaneGeometry(w, w / 4), smat);
    board.position.set(x, y, z);
    board.rotation.y = yaw;
    root.add(board);
    disposables.push(tex, smat, board.geometry);
    m.place(x, z, yaw, 0).box(w + 0.15, w / 4 + 0.15, 0.06, 0, y - w / 8 - 0.075, -0.05, INK);
    if (y < 7) for (const k of [-1, 1]) m.place(x, z, yaw).box(0.03, 6 - y, 0.03, k * w * 0.4, y + w / 8, 0, '#2b2f3a');
  }

  // muro con ventanales de la ciudad (con huecos donde pasa la pista)
  const wallTex = windowWallTexture(brand.primary && brand.primary !== '#157A6E' ? brand.primary : PINK);
  const wallGeos = [];
  function wall(ax, az, bx, bz, h = 5.4, y = 0) {
    const len = Math.hypot(bx - ax, bz - az);
    const n = Math.max(1, Math.round(len / 3));
    for (let k = 0; k < n; k++) {
      const t0 = k / n, t1 = (k + 1) / n;
      const px = ax + (bx - ax) * (t0 + t1) / 2, pz = az + (bz - az) * (t0 + t1) / 2;
      if (!clear(px, pz, 1.2, y, 0.4)) continue;
      const g = new THREE.BoxGeometry(len / n, h, 0.3);
      const uvs = g.attributes.uv;
      for (let i = 0; i < uvs.count; i++) uvs.setXY(i, uvs.getX(i) * ((len / n) / 4), uvs.getY(i) * (h / 4));
      g.rotateY(-Math.atan2(bz - az, bx - ax));
      g.translate(px, y + h / 2, pz);
      wallGeos.push(g);
    }
  }
  // techo con lámparas
  function ceiling(ax, az, bx, bz, h = 5.4) {
    const w = bx - ax, d = bz - az;
    const ct = ceilingTexture(false), et = ceilingTexture(true);
    for (const t of [ct, et]) t.repeat.set(w / 4, d / 4);
    const cm = new THREE.MeshLambertMaterial({ map: ct, emissiveMap: et, emissive: new THREE.Color('#ffffff'), emissiveIntensity: 1 });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, d), cm);
    mesh.rotation.x = Math.PI / 2;
    mesh.position.set(ax + w / 2, h, az + d / 2);
    root.add(mesh);
    disposables.push(ct, et, cm, mesh.geometry);
  }
  // colocar a lo largo de la pista, del lado de afuera (o adentro) a cierta distancia
  function besideTrack(s, lat) { return pointAt(T, s, lat); }
  const yawFacing = (fromX, fromZ, toX, toZ) => Math.atan2(toX - fromX, toZ - fromZ);

  // ---------- Temas ----------
  if (theme === 'oficina') {
    // escritorios en el centro del óvalo
    for (let x = B.x0 + 8; x < B.x1 - 8; x += hi ? 8.6 : 11) for (let z = B.z0 + 8; z < B.z1 - 8; z += hi ? 7.4 : 9.5) {
      if (!inside(x, z)) continue;
      deskPod(x + (R() - 0.5) * 0.6, z, 0, { color: ['#a0673f', '#f4f4f6', '#c9a27c'][(R() * 3) | 0], chair: ['#1d1d22', PINK, '#3a86ff'][(R() * 3) | 0] });
    }
    // Charla General: sofás y alfombra afuera de la recta de abajo
    const sC = T.marks.charla + 30, oc = outSide(sC);
    const L0 = besideTrack(sC, oc * (sampleAt(T, sC).hw + 9));
    const yawL = yawFacing(L0.x, L0.z, pointAt(T, sC, 0).x, pointAt(T, sC, 0).z);
    rug(L0.x, L0.z, 12, 8, (g, w, h) => {
      g.fillStyle = PINK; g.beginPath(); g.roundRect(0, 0, w, h, 40); g.fill();
      g.fillStyle = YEL; g.beginPath(); g.roundRect(14, 14, w - 28, h - 28, 30); g.fill();
      g.fillStyle = '#fff'; g.font = `900 ${h * 0.22}px "Archivo Black", system-ui`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('CHARLA GENERAL', w / 2, h / 2);
    }, yawL);
    for (const [lx, lz, ry, t, w] of [[-4.6, 0, Math.PI / 2, 'sofa', 4.4], [4.6, 0, -Math.PI / 2, 'sofa', 4.4], [0, -3.4, 0, 'sofa', 5.4], [0, 0, 0, 'roundTable', 1.6]]) {
      const [x, z] = rot(L0.x, L0.z, yawL, lx, lz);
      furn(t, x, z, yawL + ry, t === 'sofa' ? [PINK, '#3a86ff', '#e8a27c'][Math.abs(lx | 0) % 3] : '#f4f4f6', { w, d: t === 'sofa' ? 1 : 1.6, check: false });
    }
    { const [x, z] = rot(L0.x, L0.z, yawL, 0, -5.4); furn('bigScreen', x, z, yawL, INK, { w: 6, d: 1, check: false }); }
    for (const k of [-6.5, 6.5]) { const [x, z] = rot(L0.x, L0.z, yawL, k, -3.5); furn('tallPlant', x, z, 0, null, { check: false }); }
    { const [x, z] = rot(L0.x, L0.z, yawL, 0, 4.2); hangSign('Charla General', x, z, yawL, { color: PINK, w: 6 }); }
    reserved.push({ x: L0.x, z: L0.z, r: 8 });
    // letreros encima de la pista
    signs.push({ text: 'Escritorios', s: T.marks.recta1 + 4, color: '#3a86ff' }, { text: 'Charla General', s: T.marks.charla + 4, color: PINK }, { text: 'Café', s: T.marks.recta2 + 30, color: YEL });
    // cocineta
    const sK = T.marks.recta2 + 30, ok = outSide(sK);
    const K0 = besideTrack(sK, ok * (sampleAt(T, sK).hw + 4));
    const yawK = yawFacing(K0.x, K0.z, pointAt(T, sK, 0).x, pointAt(T, sK, 0).z);
    for (const [lx, t, w] of [[-3, 'counter', 4], [0.4, 'coffee', 2], [2.2, 'fridge', 1], [3.4, 'watercooler', 1], [4.6, 'vending', 1.2]]) { const [x, z] = rot(K0.x, K0.z, yawK, lx, -1); furn(t, x, z, yawK, t === 'vending' ? PINK : null, { w, d: 1 }); }
    // sala de juntas de vidrio
    const sJ = T.marks.recta1 + 30, oj = outSide(sJ);
    const J0 = besideTrack(sJ, oj * (sampleAt(T, sJ).hw + 7));
    const yawJ = yawFacing(J0.x, J0.z, pointAt(T, sJ, 0).x, pointAt(T, sJ, 0).z);
    if (clear(J0.x, J0.z, 4.5)) {
      furn('meetingTable', J0.x, J0.z, yawJ, '#eef0f4', { w: 5, d: 2, check: false });
      for (const k of [-1.6, 0, 1.6]) for (const sd of [-1.5, 1.5]) { const [x, z] = rot(J0.x, J0.z, yawJ, k, sd); furn('confChair', x, z, yawJ + (sd > 0 ? Math.PI : 0), '#e07a3a', { check: false }); }
      for (const [ax, az, bx, bz] of [[-4, -3, 4, -3], [-4, 3, 4, 3], [-4, -3, -4, 3], [4, -3, 4, 3]]) {
        const [p, q] = [rot(J0.x, J0.z, yawJ, ax, az), rot(J0.x, J0.z, yawJ, bx, bz)];
        const len = Math.hypot(q[0] - p[0], q[1] - p[1]);
        m.place((p[0] + q[0]) / 2, (p[1] + q[1]) / 2, -Math.atan2(q[1] - p[1], q[0] - p[0]) + Math.PI / 2).box(0.08, 2.4, len, 0, 0, 0, '#a8d8ff', { mat: 'glass' }).box(0.12, 0.1, len, 0, 2.4, 0, '#3a3f4b');
      }
      const [sx, sz] = rot(J0.x, J0.z, yawJ, 0, 3.1);
      hangSign('Sala de juntas', sx, sz, yawJ, { color: '#3a86ff', w: 4, y: 3 });
    }
  } else if (theme === 'juegos') {
    // mesas de juego, arcades y pufs por toda la sala
    const kinds = [['poolTable', 4.6, 2.5, '#1f8a5b'], ['pingPong', 4.6, 2.5, '#2f6fd6'], ['foosball', 3, 1.8, null], ['poolTable', 4.6, 2.5, '#8B1E3F']];
    let n = 0;
    for (let x = B.x0 + 7; x < B.x1 - 7; x += 9) for (let z = B.z0 + 7; z < B.z1 - 7; z += 7) {
      const [t, w, d, c] = kinds[n++ % kinds.length];
      const xx = x + (R() - 0.5) * 2, zz = z + (R() - 0.5) * 2;
      if (furn(t, xx, zz, (R() < 0.5 ? 0 : Math.PI / 2), c, { w, d, rad: 3 })) {
        for (let k = 0; k < 2; k++) { const a = R() * Math.PI * 2; furn('beanBag', xx + Math.cos(a) * 3.4, zz + Math.sin(a) * 3.4, 0, [PINK, YEL, '#3a86ff', '#9b5de5'][(R() * 4) | 0], { rad: 0.6 }); }
      }
    }
    // filas de arcades mirando a la pista
    for (let s = 6; s < T.length; s += 15) {
      const P = sampleAt(T, s);
      for (const side of [-1, 1]) {
        if (R() < 0.45) continue;
        for (let k = -1; k <= 1; k++) {
          const p = pointAt(T, s + k * 1.1, side * (P.hw + 2.2));
          furn(k === 0 && R() < 0.4 ? 'zombieArcade' : 'arcade', p.x, p.z, yawFacing(p.x, p.z, P.x, P.z), [PINK, YEL, '#3a86ff', '#2bb673', '#8B7BFF'][(R() * 5) | 0], { w: 1, d: 1, rad: 0.5, y: 0 });
        }
      }
    }
    // League of Legends: escritorios gamer
    const sL = T.marks.billar + 10, ol = outSide(sL);
    const L0 = besideTrack(sL, ol * (sampleAt(T, sL).hw + 9));
    const yawL = yawFacing(L0.x, L0.z, pointAt(T, sL, 0).x, pointAt(T, sL, 0).z);
    rug(L0.x, L0.z, 15, 10, (g, w, h) => { g.fillStyle = '#0a1428'; g.fillRect(0, 0, w, h); g.strokeStyle = '#C8AA6E'; g.lineWidth = 8; g.strokeRect(8, 8, w - 16, h - 16); g.fillStyle = 'rgba(10,200,185,.25)'; g.beginPath(); g.arc(w / 2, h / 2, h * 0.35, 0, Math.PI * 2); g.fill(); }, yawL);
    for (const k of [-3.6, 3.6]) { const [x, z] = rot(L0.x, L0.z, yawL, k, 0); deskPod(x, z, yawL, { type: 'gamingDesk', color: '#1b1b22', chair: '#C8AA6E', chairType: 'gamingChair', gamer: true }); }
    { const [x, z] = rot(L0.x, L0.z, yawL, 0, 5.4); hangSign('League of Legends', x, z, yawL, { color: '#C8AA6E', w: 6.5 }); }
    reserved.push({ x: L0.x, z: L0.z, r: 8 });
    // sala de videojuegos con pantalla gigante y sofás
    const sV = T.marks.salida + 40, ov = outSide(sV);
    const V0 = besideTrack(sV, ov * (sampleAt(T, sV).hw + 8));
    const yawV = yawFacing(V0.x, V0.z, pointAt(T, sV, 0).x, pointAt(T, sV, 0).z);
    { const [x, z] = rot(V0.x, V0.z, yawV, 0, -3.5); furn('bigScreen', x, z, yawV, INK, { w: 6, d: 1, check: false }); }
    { const [x, z] = rot(V0.x, V0.z, yawV, 0, 0.5); furn('sofa', x, z, yawV + Math.PI, '#3a86ff', { w: 4.5, d: 1, check: false }); }
    for (const k of [-2.5, 0, 2.5]) { const [x, z] = rot(V0.x, V0.z, yawV, k, -1.5); furn('beanBag', x, z, 0, [PINK, YEL, '#9b5de5'][Math.abs(k | 0) % 3], { check: false }); }
    { const [x, z] = rot(V0.x, V0.z, yawV, 0, 2.6); hangSign('Juegos', x, z, yawV, { color: '#8B7BFF', w: 5 }); }
    reserved.push({ x: V0.x, z: V0.z, r: 6 });
    signs.push({ text: 'Juegos', s: T.marks.salida + 4, color: '#8B7BFF' }, { text: 'League of Legends', s: T.marks.billar - 4, color: '#C8AA6E' }, { text: 'Torneos', s: T.marks.trasSofa + 30, color: YEL });
    // luces neón sobre las barreras
    for (const side of [-1, 1]) {
      const li = (p) => side * (p.hw + 0.32);
      addMesh(strip(li, li, BH + 0.01, BH + 0.06, { filter: (p) => p.y < 0.6 }), new THREE.MeshBasicMaterial({ color: side < 0 ? '#ff4fd8' : '#3ad1ff', side: THREE.DoubleSide }));
    }
  } else if (theme === 'torre') {
    buildTower();
  }

  // relleno: plantas, libreros y botes a lo largo de las barreras de afuera
  for (let s = 3; s < T.length; s += hi ? 7 : 12) {
    const P = sampleAt(T, s);
    if (P.y > 0.6 && theme !== 'torre') continue;
    for (const side of [-1, 1]) {
      if (R() < 0.35) continue;
      const p = pointAt(T, s, side * (P.hw + 1.6 + R() * 0.8));
      const y = P.y > 0.6 ? P.y : 0;
      if (P.y > 0.6 && theme === 'torre' && p.y < 12) continue;
      const t = ['plant', 'tallPlant', 'floorPlant', 'trashCan', 'plant', 'watercooler'][(R() * 6) | 0];
      furn(t, p.x, p.z, R() * 6, t === 'trashCan' ? '#6b7a77' : null, { w: 0.9, d: 0.9, y, rad: 0.45 });
    }
  }
  // letreros sobre la pista (pórticos)
  for (const sg of signs) {
    const P = sampleAt(T, sg.s);
    const yaw = Math.atan2(P.tx, P.tz) + Math.PI;
    const y = P.y + 4.3;
    hangSign(sg.text, P.x, P.z, yaw, { color: sg.color || accent, y, w: Math.min(7, P.hw * 1.1) });
    if (P.y > 0.6 || theme === 'torre') for (const side of [-1, 1]) m.place(P.x + P.nx * side * (P.hw + 0.9), P.z + P.nz * side * (P.hw + 0.9), 0, P.y).box(0.3, 4.6, 0.3, 0, 0, 0, '#2b2f3a');
  }

  // muros de la oficina y techo (adentro)
  if (theme !== 'torre') {
    const e = 1;
    wall(B.x0 + e, B.z0 + e, B.x1 - e, B.z0 + e); wall(B.x0 + e, B.z1 - e, B.x1 - e, B.z1 - e);
    wall(B.x0 + e, B.z0 + e, B.x0 + e, B.z1 - e); wall(B.x1 - e, B.z0 + e, B.x1 - e, B.z1 - e);
    ceiling(B.x0, B.z0, B.x1, B.z1, 5.4);
    // muebles pegados a los muros
    for (let x = B.x0 + 4; x < B.x1 - 4; x += 6) {
      for (const [z, yaw] of [[B.z0 + 1.8, 0], [B.z1 - 1.8, Math.PI]]) {
        const t = ['bookshelf', 'tallPlant', 'whiteboard', 'bookshelf', 'vending', 'plant'][(R() * 6) | 0];
        furn(t, x, z, yaw, t === 'vending' ? PINK : null, { w: t === 'bookshelf' || t === 'whiteboard' ? 2.6 : 1, d: 0.8, rad: 1.2 });
      }
    }
    // logo neón de la marca en el muro
    const neon = canvasTex(512, 160, (g, w, h) => { g.font = '900 120px "Archivo Black", system-ui'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.shadowColor = PINK; g.shadowBlur = 24; g.fillStyle = '#ffd1e0'; g.fillText('HUB', w / 2, h / 2 + 6); });
    const nm = new THREE.MeshBasicMaterial({ map: neon, transparent: true });
    const nmesh = new THREE.Mesh(new THREE.PlaneGeometry(9, 2.8), nm);
    nmesh.position.set(cx, 3.6, B.z0 + 1.2);
    root.add(nmesh);
    disposables.push(neon, nm, nmesh.geometry);
  }

  // ---------- Torre HUB ----------
  function buildTower() {
    // lobby: loseta, techo, recepción y elevadores
    const ground = S.filter((p) => p.y < 0.8);
    let lx0 = Infinity, lx1 = -Infinity, lz0 = Infinity, lz1 = -Infinity;
    const sEsp = T.marks.espiral, sAbajo = T.marks.abajo;
    for (const p of ground) { if (p.s > sEsp - 2 && p.s < sAbajo) continue; lx0 = Math.min(lx0, p.x - p.hw); lx1 = Math.max(lx1, p.x + p.hw); lz0 = Math.min(lz0, p.z - p.hw); lz1 = Math.max(lz1, p.z + p.hw); }
    lx0 -= 6; lx1 += 2; lz0 -= 12; lz1 += 12;
    rug((lx0 + lx1) / 2, (lz0 + lz1) / 2, lx1 - lx0, lz1 - lz0, (g, w, h) => paintFloor(g, 'tile', 0, 0, w, h, rnd(5), { color: '#d6cfc2', tile: 48 }), 0, 0.006);
    ceiling(lx0, lz0, lx1, lz1, 5.6);
    wall(lx0, lz0, lx1, lz0, 5.6); wall(lx0, lz1, lx1, lz1, 5.6); wall(lx0, lz0, lx0, lz1, 5.6); wall(lx1, lz0, lx1, lz1, 5.6);
    // recepción con el logo
    const sR = T.marks.lobby + 10, oR = outSide(sR);
    const R0 = besideTrack(sR, oR * (sampleAt(T, sR).hw + 4.5));
    const yawR = yawFacing(R0.x, R0.z, pointAt(T, sR, 0).x, pointAt(T, sR, 0).z);
    furn('reception', R0.x, R0.z, yawR, INK, { w: 5, d: 1.2, check: false });
    { const [x, z] = rot(R0.x, R0.z, yawR, 0, -1.6); hangSign('Recepción', x, z, yawR, { color: accent, y: 3.4, w: 4 }); }
    for (const k of [-4, 4]) { const [x, z] = rot(R0.x, R0.z, yawR, k, 0); furn('tallPlant', x, z, 0, null, { check: false }); }
    // elevadores
    const sE = T.marks.elevador, oE = outSide(sE);
    const E0 = besideTrack(sE, oE * (sampleAt(T, sE).hw + 2.2));
    const yawE = yawFacing(E0.x, E0.z, pointAt(T, sE, 0).x, pointAt(T, sE, 0).z);
    for (const k of [-3.2, 0, 3.2]) { const [x, z] = rot(E0.x, E0.z, yawE, k, -0.5); furn('hotelElevator', x, z, yawE, null, { w: 2.6, d: 1, check: false }); m.place(x, z, yawE).box(0.5, 0.18, 0.05, 0, 2.55, 0.2, '#ff8a3d', { mat: 'glow' }); }
    { const [x, z] = rot(E0.x, E0.z, yawE, 0, 0.3); hangSign('Elevador', x, z, yawE, { color: YEL, y: 3.6, w: 4 }); }
    signs.push({ text: 'Torre HUB', s: T.marks.lobby - 4, color: YEL }, { text: 'Elevador', s: T.marks.elevador - 8, color: '#ff8a3d' }, { text: 'Azotea', s: T.marks.azotea + 2, color: PINK });
    // sofás de espera
    const sW = T.marks.lobby + 34, oW = outSide(sW);
    const W0 = besideTrack(sW, oW * (sampleAt(T, sW).hw + 4));
    furn('sofa', W0.x, W0.z, yawFacing(W0.x, W0.z, pointAt(T, sW, 0).x, pointAt(T, sW, 0).z), '#3a86ff', { w: 4, d: 1 });

    // atrio con la espiral: columna central con los pisos
    const hel = S.filter((p) => p.s > sEsp + 5 && p.s < T.marks.azotea - 5);
    const hx = hel.reduce((a, p) => a + p.x, 0) / hel.length, hz = hel.reduce((a, p) => a + p.z, 0) / hel.length;
    const rIn = Math.min(...hel.map((p) => Math.hypot(p.x - hx, p.z - hz) - p.hw)) - 0.9;
    const core = canvasTex(512, 512, (g, w, h) => {
      g.fillStyle = '#20232c'; g.fillRect(0, 0, w, h);
      const r = rnd(9);
      for (let fl = 0; fl < 3; fl++) {
        const y0 = h - (fl + 1) * (h / 3);
        g.fillStyle = '#3a3f4b'; g.fillRect(0, y0, w, 10);
        for (let x = 10; x < w - 30; x += 34) { g.fillStyle = r() < 0.7 ? '#ffe7a8' : '#9fe3ff'; g.fillRect(x, y0 + 30, 24, 60); g.fillStyle = 'rgba(0,0,0,.25)'; g.fillRect(x, y0 + 70, 24, 3); }
        g.fillStyle = accent; g.font = '900 40px "Archivo Black", system-ui'; g.textAlign = 'center';
        for (const xx of [w * 0.25, w * 0.75]) g.fillText(`PISO ${fl + 1}`, xx, y0 + 140);
      }
    }, { repeat: true });
    core.repeat.set(3, 1);
    const coreH = Math.max(...hel.map((p) => p.y)) + 4;
    const cm = new THREE.Mesh(new THREE.CylinderGeometry(rIn, rIn, coreH, 24, 1, true), new THREE.MeshLambertMaterial({ map: core, emissive: new THREE.Color('#222222') }));
    cm.position.set(hx, coreH / 2, hz);
    root.add(cm);
    disposables.push(core, cm.geometry, cm.material);
    // logo en la punta
    const top = canvasTex(256, 256, (g, w, h) => { g.fillStyle = INK; g.fillRect(0, 0, w, h); g.fillStyle = accent; g.font = '900 96px "Archivo Black", system-ui'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('HUB', w / 2, h / 2); });
    const tm = new THREE.Mesh(new THREE.CircleGeometry(rIn, 24), new THREE.MeshBasicMaterial({ map: top }));
    tm.rotation.x = -Math.PI / 2; tm.position.set(hx, coreH + 0.01, hz);
    root.add(tm); disposables.push(top, tm.geometry, tm.material);
    // pisos alrededor del atrio (losas con escritorios)
    const rOut = Math.max(...hel.map((p) => Math.hypot(p.x - hx, p.z - hz) + p.hw)) + 1.2;
    for (const fy of [4.6, 9.2]) {
      for (let a = 0; a < Math.PI * 2; a += Math.PI / 12) {
        const mx = hx + Math.cos(a + Math.PI / 24) * (rOut + 3.5), mz = hz + Math.sin(a + Math.PI / 24) * (rOut + 3.5);
        if (!clear(mx, mz, 3.6, fy, 0.5) || !clear(mx, mz, 3.6, 0, 0.5)) continue;
        m.place(mx, mz, -(a + Math.PI / 24) + Math.PI / 2, fy - 0.25).box(Math.PI * 2 * (rOut + 3.5) / 24 + 0.2, 0.25, 7, 0, 0, 0, '#cfc8bc').box(Math.PI * 2 * (rOut + 3.5) / 24 + 0.2, 1.0, 0.08, 0, 0.25, -3.5, '#a8d8ff', { mat: 'glass' });
        if (R() < 0.6) { const yaw = -(a + Math.PI / 24) + Math.PI / 2; m.place(mx, mz, yaw, fy); FURNITURE.desk(m, 2.4, 1.1, '#f4f4f6'); decor('monitor', mx, mz, yaw + Math.PI, '#26262e', fy + 0.76); m.place(mx + Math.sin(yaw) * 1.2, mz + Math.cos(yaw) * 1.2, yaw + Math.PI, fy); FURNITURE.officeChair(m, 0.7, 0.7, PINK); }
      }
    }
    // azotea: losa ancha bajo la pista, pretil, helipuerto y letrero de neón
    const roofY = (p) => p.y > 11.5;
    const deck = canvasTex(256, 256, (g, w, h) => paintFloor(g, 'concrete', 0, 0, w, h, rnd(4), { color: '#5d616b', tile: 64 }), { repeat: true });
    const deckMat = new THREE.MeshLambertMaterial({ map: deck });
    addMesh(strip((p) => -p.hw - 9, (p) => p.hw + 9, -0.03, -0.03, { filter: (p, q) => roofY(p) && roofY(q), vLen: 8, uA: 0, uB: 4 }), deckMat);
    for (const side of [-1, 1]) {
      const le = (p) => side * (p.hw + 9);
      addMesh(strip(le, le, -0.03, 1.1, { filter: (p, q) => roofY(p) && roofY(q) }), new THREE.MeshLambertMaterial({ color: '#3a3f4b', side: THREE.DoubleSide }));
      addMesh(strip(le, le, -8, -0.03, { filter: (p, q) => roofY(p) && roofY(q) }), new THREE.MeshLambertMaterial({ color: '#2a2d36', side: THREE.DoubleSide }));
      // luces de colores en el pretil
      addMesh(strip(le, le, 1.1, 1.18, { filter: (p, q) => roofY(p) && roofY(q) }), new THREE.MeshBasicMaterial({ color: side < 0 ? PINK : YEL, side: THREE.DoubleSide }));
    }
    disposables.push(deck);
    // cosas de azotea
    for (let s = T.marks.azotea; s < T.marks.bajada; s += 9) {
      const P = sampleAt(T, s);
      if (P.y < 11.5) continue;
      for (const side of [-1, 1]) {
        const p = pointAt(T, s, side * (P.hw + 4 + R() * 3));
        const t = R();
        if (t < 0.3) { m.place(p.x, p.z, R() * 3, P.y).box(1.8, 1.2, 1.4, 0, 0, 0, '#9aa3ad').box(1.2, 0.05, 1.2, 0, 1.2, 0, '#5a5f6b').cyl(0.5, 0.06, 0, 1.25, 0, '#2b2f3a'); }
        else if (t < 0.5) { m.place(p.x, p.z, 0, P.y).cyl(0.9, 2.4, 0, 0, 0, '#7a7f8b').cyl(0.95, 0.15, 0, 2.4, 0, '#5a5f6b'); }
        else if (t < 0.75) furn('planter', p.x, p.z, R() * 3, '#5a5f6b', { w: 2, d: 0.9, y: P.y, rad: 1, check: false });
        else { m.place(p.x, p.z, 0, P.y).cyl(0.05, 5, 0, 0, 0, '#9aa3ad').ball(0.12, 0, 5.05, 0, '#ff2a2a', { mat: 'glow' }); }
      }
    }
    // helipuerto en la azotea
    {
      const sH = T.marks.mirador - 30, oH = outSide(sH);
      const P = sampleAt(T, sH);
      const p = pointAt(T, sH, oH * (P.hw + 5));
      const hp = canvasTex(256, 256, (g, w, h) => { g.fillStyle = '#3a3f4b'; g.beginPath(); g.arc(w / 2, h / 2, w / 2 - 2, 0, Math.PI * 2); g.fill(); g.strokeStyle = YEL; g.lineWidth = 10; g.beginPath(); g.arc(w / 2, h / 2, w / 2 - 18, 0, Math.PI * 2); g.stroke(); g.fillStyle = '#fff'; g.font = '900 150px "Archivo Black", system-ui'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('H', w / 2, h / 2 + 8); });
      const hm = new THREE.Mesh(new THREE.CircleGeometry(4.5, 32), new THREE.MeshLambertMaterial({ map: hp, transparent: true }));
      hm.rotation.x = -Math.PI / 2; hm.position.set(p.x, P.y + 0.01, p.z);
      root.add(hm); disposables.push(hp, hm.geometry, hm.material);
    }
    // letrero gigante "HUB" en neón sobre la azotea
    {
      const sN = T.marks.azotea + 30, oN = outSide(sN);
      const P = sampleAt(T, sN);
      const p = pointAt(T, sN, oN * (P.hw + 8.5));
      const neon = canvasTex(1024, 300, (g, w, h) => { g.font = '900 250px "Archivo Black", system-ui'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.shadowColor = PINK; g.shadowBlur = 40; g.fillStyle = '#ffd1e0'; g.fillText('HUB', w / 2, h / 2 + 10); g.shadowBlur = 0; g.lineWidth = 6; g.strokeStyle = PINK; g.strokeText('HUB', w / 2, h / 2 + 10); });
      const nm = new THREE.MeshBasicMaterial({ map: neon, transparent: true, side: THREE.DoubleSide, fog: false });
      const sign = new THREE.Mesh(new THREE.PlaneGeometry(16, 4.7), nm);
      sign.position.set(p.x, P.y + 4.6, p.z);
      sign.rotation.y = yawFacing(p.x, p.z, P.x, P.z);
      root.add(sign);
      m.place(p.x, p.z, sign.rotation.y, P.y).box(14, 0.25, 0.25, 0, 2.2, 0, '#5a5f6b');
      for (const k of [-6, 0, 6]) m.place(p.x, p.z, sign.rotation.y, P.y).box(0.2, 2.3, 0.2, k, 0, 0, '#5a5f6b');
      disposables.push(neon, nm, sign.geometry);
    }
    // la ciudad de noche alrededor
    buildCity();
  }

  function buildCity() {
    const mats = [0, 1, 2].map((v) => {
      const tex = canvasTex(128, 256, (g, w, h) => {
        g.fillStyle = ['#151a2e', '#1b1830', '#121c26'][v]; g.fillRect(0, 0, w, h);
        const r = rnd(21 + v);
        for (let y = 6; y < h - 6; y += 10) for (let x = 5; x < w - 6; x += 9) { if (r() < 0.42) { g.fillStyle = r() < 0.75 ? '#ffd27a' : r() < 0.5 ? '#9fe3ff' : '#ff9ad0'; g.fillRect(x, y, 5, 6); } }
      }, { repeat: true });
      disposables.push(tex);
      return new THREE.MeshBasicMaterial({ map: tex, fog: true });
    });
    const geos = [[], [], []];
    const r = rnd(77);
    const n = hi ? 110 : 60;
    const rad0 = Math.max(B.x1 - B.x0, B.z1 - B.z0) * 0.7 + 30;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + r() * 0.05;
      const rad = rad0 + r() * 120;
      const w = 12 + r() * 22, d = 12 + r() * 22, h = 18 + r() * r() * 110;
      const g = new THREE.BoxGeometry(w, h, d);
      const uvs = g.attributes.uv;
      for (let k = 0; k < uvs.count; k++) uvs.setXY(k, uvs.getX(k) * (w / 14), uvs.getY(k) * (h / 28));
      g.translate(cx + Math.cos(a) * rad, h / 2 - 2, cz + Math.sin(a) * rad);
      geos[i % 3].push(g);
      if (r() < 0.4) m.place(cx + Math.cos(a) * rad, cz + Math.sin(a) * rad, 0, h - 2).box(0.4, 4, 0.4, 0, 0, 0, '#3a3f4b').ball(0.4, 0, 4.2, 0, '#ff2a2a', { mat: 'glow' });
    }
    geos.forEach((list, k) => { if (!list.length) return; const mesh = new THREE.Mesh(mergeGeometries(list), mats[k]); root.add(mesh); disposables.push(mesh.geometry, mats[k]); list.forEach((g) => g.dispose()); });
    // cielo con estrellas y luna
    const sky = canvasTex(1024, 512, (g, w, h) => {
      const gr = g.createLinearGradient(0, 0, 0, h);
      gr.addColorStop(0, '#05060f'); gr.addColorStop(0.5, '#141a3a'); gr.addColorStop(0.62, '#3b2a55'); gr.addColorStop(0.7, '#5a2f5a'); gr.addColorStop(1, '#1a1222');
      g.fillStyle = gr; g.fillRect(0, 0, w, h);
      const rr = rnd(5);
      for (let i = 0; i < 500; i++) { g.fillStyle = `rgba(255,255,255,${0.3 + rr() * 0.7})`; const s = rr() < 0.08 ? 2 : 1; g.fillRect(rr() * w, rr() * h * 0.55, s, s); }
      g.fillStyle = '#fff6d8'; g.shadowColor = '#fff6d8'; g.shadowBlur = 30; g.beginPath(); g.arc(w * 0.72, h * 0.18, 18, 0, Math.PI * 2); g.fill();
    });
    const skyMesh = new THREE.Mesh(new THREE.SphereGeometry(520, 32, 16), new THREE.MeshBasicMaterial({ map: sky, side: THREE.BackSide, fog: false }));
    skyMesh.position.set(cx, 0, cz);
    root.add(skyMesh);
    disposables.push(sky, skyMesh.geometry, skyMesh.material);
    // calle de abajo
    const street = new THREE.Mesh(new THREE.PlaneGeometry(1200, 1200), new THREE.MeshLambertMaterial({ color: '#15161c' }));
    street.rotation.x = -Math.PI / 2; street.position.set(cx, -0.05, cz);
    root.add(street); disposables.push(street.geometry, street.material);
  }

  // ---------- Combinar los muebles ----------
  if (wallGeos.length) {
    const wm = new THREE.MeshLambertMaterial({ map: wallTex });
    const mesh = new THREE.Mesh(mergeGeometries(wallGeos), wm);
    root.add(mesh);
    disposables.push(mesh.geometry, wm);
    wallGeos.forEach((g) => g.dispose());
  }
  disposables.push(wallTex);
  const litMat = new THREE.MeshLambertMaterial({ vertexColors: true });
  const glowMat = new THREE.MeshBasicMaterial({ vertexColors: true });
  const glassM = new THREE.MeshLambertMaterial({ vertexColors: true, transparent: true, opacity: 0.4, depthWrite: false });
  for (const mesh of m.build({ lit: litMat, glow: glowMat, glass: glassM })) { root.add(mesh); disposables.push(mesh.geometry); }
  disposables.push(litMat, glowMat, glassM);

  // ---------- Luces ----------
  const night = theme === 'torre';
  const hemi = new THREE.HemisphereLight(night ? '#9fb0ff' : '#fff6ea', night ? '#2a2440' : '#5a4f62', night ? 1.25 : 1.9);
  const sun = new THREE.DirectionalLight(night ? '#c9d2ff' : '#fff1dc', night ? 0.9 : 1.35);
  sun.position.set(cx + 40, 80, cz + 30);
  sun.target.position.set(cx, 0, cz);
  root.add(hemi, sun, sun.target);
  const fog = night ? { color: '#1a1830', near: 70, far: 420 } : { color: theme === 'juegos' ? '#1e1a33' : '#d9d2c7', near: 60, far: 190 };

  // ---------- Podio (se ve en los resultados) ----------
  const podium = new THREE.Group();
  {
    const sP = 18, oP = outSide(sP);
    const P = sampleAt(T, sP);
    const off = P.hw + (theme === 'torre' ? 5 : 6);
    const p = pointAt(T, sP, oP * off);
    podium.position.set(p.x, P.y > 0.6 ? P.y : 0, p.z);
    podium.rotation.y = yawFacing(p.x, p.z, P.x, P.z);
    const pm = new Mesher();
    pm.box(2.2, 1.2, 2.2, 0, 0, 0, YEL).box(2.2, 0.8, 2.2, -2.3, 0, 0, '#cfd4da').box(2.2, 0.5, 2.2, 2.3, 0, 0, '#cd7f32');
    pm.box(7.2, 0.08, 2.6, 0, 0, 0, INK);
    for (const mesh of pm.build({ lit: litMat, glow: glowMat, glass: glassM })) podium.add(mesh);
    const ptex = signTexture('PODIO', PINK, 'KARTS DE OFICINA');
    const pmat = new THREE.MeshBasicMaterial({ map: ptex });
    const back = new THREE.Mesh(new THREE.PlaneGeometry(8, 2), pmat);
    back.position.set(0, 3.8, -1.6);
    podium.add(back);
    disposables.push(ptex, pmat, back.geometry);
    for (const [x, n] of [[0, '1'], [-2.3, '2'], [2.3, '3']]) {
      const t = canvasTex(128, 128, (g, w, h) => { g.fillStyle = INK; g.font = '900 100px "Archivo Black", system-ui'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(n, w / 2, h / 2 + 6); });
      const mm = new THREE.MeshBasicMaterial({ map: t, transparent: true });
      const pl = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 1.2), mm);
      pl.position.set(x, (n === '1' ? 1.2 : n === '2' ? 0.8 : 0.5) / 2, 1.11);
      podium.add(pl);
      disposables.push(t, mm, pl.geometry);
    }
    podium.visible = false;
    root.add(podium);
    reserved.push({ x: p.x, z: p.z, r: 5 });
  }

  return {
    group: root,
    boxes,
    fog,
    night,
    podium,
    bounds: B,
    // semáforo: n luces rojas encendidas (0–3) o verde
    setLights(n, green = false) {
      lights.forEach((l, k) => { l.material.color.set(green ? '#3dff6a' : k < n ? '#ff2a2a' : '#331111'); });
    },
    update(dt, t) { for (const u of updaters) u(dt, t); },
    dispose() {
      for (const d of disposables) d?.dispose?.();
      root.traverse((o) => { if (o.geometry) o.geometry.dispose?.(); });
    },
  };
}
