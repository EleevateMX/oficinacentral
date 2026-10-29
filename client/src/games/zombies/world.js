// La oficina en 3D: piso (con el mismo dibujo del mapa), muros, cristales, puertas de donde salen
// los zombis, techo con lámparas, muebles combinados en pocas geometrías y letreros de las salas.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { CATALOG } from '@shared/catalog.js';
import { areaAt, TILE } from '@shared/map.js';
import { CELL, TILE_M, WALL_H } from '@shared/zombies.js';
import { drawFloorLayer, drawObject, renderBrand } from '../../lib/render.js';
import { Mesher, FURNITURE, DECOR, SURFACE, WALL_DECOR } from './models.js';

const S = TILE_M;
const ROT_SEAT = { chair: 1, gamingChair: 1, officeChair: 1, confChair: 1 };

function canvasTex(w, h, draw, { nearest = false, repeat = false } = {}) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  if (nearest) { t.magFilter = THREE.NearestFilter; }
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; }
  t.anisotropy = 4;
  return t;
}

// Textura de muro: pintura, rodapié y franja de color de la marca
function wallTexture(kind) {
  const B = renderBrand().walls;
  const face = B?.face ? mix(B.face, '#e9e4dc', 0.55) : '#dcd6cc';
  const stripe = B?.stripe || '#FE3377';
  return canvasTex(64, 128, (g, w, h) => {
    g.fillStyle = face; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 260; i++) { g.fillStyle = `rgba(0,0,0,${Math.random() * 0.035})`; g.fillRect(Math.random() * w, Math.random() * h, 2, 2); }
    g.fillStyle = 'rgba(255,255,255,.18)'; g.fillRect(0, 0, w, 6);
    g.fillStyle = stripe; g.fillRect(0, h * 0.6, w, 4);
    g.fillStyle = '#4a4f5c'; g.fillRect(0, h - 10, w, 10);
    g.fillStyle = 'rgba(0,0,0,.25)'; g.fillRect(0, h - 11, w, 1);
    g.fillStyle = 'rgba(0,0,0,.08)'; g.fillRect(w - 1, 0, 1, h);
    if (kind === 'window') {
      // ventana: noche afuera, con luna y luces de la ciudad
      const x0 = 8, y0 = 22, ww = w - 16, hh = 52;
      const gr = g.createLinearGradient(0, y0, 0, y0 + hh);
      gr.addColorStop(0, '#1b1f3f'); gr.addColorStop(1, '#5a3d6b');
      g.fillStyle = '#3a3f4b'; g.fillRect(x0 - 3, y0 - 3, ww + 6, hh + 6);
      g.fillStyle = gr; g.fillRect(x0, y0, ww, hh);
      for (let i = 0; i < 6; i++) { g.fillStyle = '#121528'; const bw = 6 + Math.random() * 8, bh = 10 + Math.random() * 22; g.fillRect(x0 + Math.random() * (ww - bw), y0 + hh - bh, bw, bh); }
      for (let i = 0; i < 10; i++) { g.fillStyle = '#ffd66b'; g.fillRect(x0 + Math.random() * ww, y0 + hh - Math.random() * 20, 1, 1); }
      g.fillStyle = '#3a3f4b'; g.fillRect(x0 + ww / 2 - 1, y0, 2, hh); g.fillRect(x0, y0 + hh / 2 - 1, ww, 2);
    }
  });
}
function mix(a, b, k) { const A = new THREE.Color(a), B = new THREE.Color(b); return '#' + A.lerp(B, k).getHexString(); }

function signTexture(text, color = '#FE3377', sub = '') {
  return canvasTex(512, 128, (g, w, h) => {
    g.fillStyle = '#141414'; g.beginPath(); g.roundRect(4, 4, w - 8, h - 8, 18); g.fill();
    g.strokeStyle = color; g.lineWidth = 6; g.beginPath(); g.roundRect(10, 10, w - 20, h - 20, 14); g.stroke();
    g.fillStyle = '#fff'; g.textAlign = 'center'; g.textBaseline = 'middle';
    let size = 58;
    g.font = `900 ${size}px "Archivo Black", system-ui, sans-serif`;
    while (g.measureText(text).width > w - 60 && size > 22) { size -= 2; g.font = `900 ${size}px "Archivo Black", system-ui, sans-serif`; }
    g.shadowColor = color; g.shadowBlur = 16;
    g.fillText(text, w / 2, h / 2 + (sub ? -8 : 2));
    if (sub) { g.shadowBlur = 0; g.font = '700 20px system-ui, sans-serif'; g.fillStyle = color; g.fillText(sub, w / 2, h - 26); }
  });
}

const AREA_ACCENT = ['#FE3377', '#FFCC00', '#3a86ff', '#2bb673', '#8B7BFF', '#ff8a3d'];

export function buildWorld(level, floor, { quality = 'alta' } = {}) {
  const root = new THREE.Group();
  const W = level.W, H = level.H;
  const at = (x, y) => (x < 0 || y < 0 || x >= W || y >= H ? CELL.WALL : level.grid[y * W + x]);
  const tmplWall = (x, y) => floor.walls[y + level.oy]?.[x + level.ox];
  const outside = (x, y) => { const t = floor.floor[y + level.oy]?.[x + level.ox]; return !t || t === 'grass' || t === 'path' || t === 'grass2'; };
  const disposables = [];

  // ---------- Piso ----------
  const px = TILE;
  const ftex = canvasTex(W * px, H * px, (g) => {
    g.imageSmoothingEnabled = false;
    g.translate(-level.ox * px, -level.oy * px);
    try { drawFloorLayer(g, floor); } catch { g.fillStyle = '#9a7652'; g.fillRect(0, 0, floor.W * px, floor.H * px); }
    for (const o of floor.objects || []) if (CATALOG[o.type]?.under) { try { drawObject(g, o); } catch { /* sin dibujo */ } }
  }, { nearest: true });
  ftex.minFilter = THREE.LinearMipmapLinearFilter;
  const floorMesh = new THREE.Mesh(new THREE.PlaneGeometry(W * S, H * S), new THREE.MeshLambertMaterial({ map: ftex }));
  floorMesh.rotation.x = -Math.PI / 2;
  floorMesh.position.set((W * S) / 2, 0, (H * S) / 2);
  floorMesh.receiveShadow = true;
  root.add(floorMesh);
  disposables.push(ftex, floorMesh.geometry, floorMesh.material);

  // ---------- Techo con lámparas ----------
  const panels = [];
  for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) if ((x % 4 === 2) && (y % 4 === 2) && at(x, y) !== CELL.WALL) panels.push({ x, y });
  const ctexPx = 16;
  const drawCeil = (lit) => (g, w, h) => {
    g.fillStyle = lit ? '#000' : '#cfd2d6'; g.fillRect(0, 0, w, h);
    if (!lit) { g.fillStyle = '#b5b9bf'; for (let x = 0; x < w; x += ctexPx / 2) g.fillRect(x, 0, 1, h); for (let y = 0; y < h; y += ctexPx / 2) g.fillRect(0, y, w, 1); }
    for (const p of panels) {
      g.fillStyle = lit ? '#fff' : '#f4f6ff';
      g.fillRect(p.x * ctexPx + 2, p.y * ctexPx + 4, ctexPx * 2 - 4, ctexPx - 8);
      if (!lit) { g.fillStyle = '#9aa3ad'; g.fillRect(p.x * ctexPx + 1, p.y * ctexPx + 3, ctexPx * 2 - 2, 1); }
    }
  };
  const ctex = canvasTex(W * ctexPx, H * ctexPx, drawCeil(false));
  const etex = canvasTex(W * ctexPx, H * ctexPx, drawCeil(true));
  const ceilMat = new THREE.MeshLambertMaterial({ map: ctex, emissiveMap: etex, emissive: new THREE.Color('#ffffff'), emissiveIntensity: 1 });
  const ceil = new THREE.Mesh(new THREE.PlaneGeometry(W * S, H * S), ceilMat);
  ceil.rotation.x = Math.PI / 2;
  ceil.position.set((W * S) / 2, WALL_H, (H * S) / 2);
  root.add(ceil);
  disposables.push(ctex, etex, ceil.geometry, ceilMat);

  // ---------- Muros ----------
  const wallGeos = { plain: [], window: [] };
  const glassGeos = [];
  const m = new Mesher();
  const unitBox = new THREE.BoxGeometry(1, 1, 1);
  const pushBox = (list, w, h, d, x, y, z) => { const g = unitBox.clone(); g.scale(w, h, d); g.translate(x, y + h / 2, z); list.push(g); };
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const c = at(x, y);
    const cx = (x + 0.5) * S, cz = (y + 0.5) * S;
    if (c === CELL.WALL) {
      const win = (outside(x, y + 1) || outside(x, y - 1) || outside(x + 1, y) || outside(x - 1, y)) && (x + y) % 3 === 0 && tmplWall(x, y) === true;
      pushBox(win ? wallGeos.window : wallGeos.plain, S, WALL_H, S, cx, 0, cz);
    } else if (c === CELL.GLASS) {
      const horiz = [CELL.GLASS, CELL.WALL].includes(at(x - 1, y)) || [CELL.GLASS, CELL.WALL].includes(at(x + 1, y));
      const [gw, gd] = horiz ? [S, 0.06] : [0.06, S];
      const g = unitBox.clone(); g.scale(gw, 2.25, gd); g.translate(cx, 0.1 + 1.125, cz); glassGeos.push(g);
      m.place(cx, cz).box(horiz ? S : 0.1, 0.1, horiz ? 0.1 : S, 0, 0, 0, '#3a3f4b').box(horiz ? S : 0.1, 0.06, horiz ? 0.1 : S, 0, 2.35, 0, '#3a3f4b');
      pushBox(wallGeos.plain, horiz ? S : 0.2, WALL_H - 2.41, horiz ? 0.2 : S, cx, 2.41, cz);
      if ((x + y) % 2 === 0) m.place(cx, cz).box(horiz ? 0.05 : 0.08, 2.25, horiz ? 0.08 : 0.05, horiz ? -S / 2 + 0.03 : 0, 0.1, horiz ? 0 : -S / 2 + 0.03, '#3a3f4b');
    }
  }
  // ---------- Portales: puertas oscuras de donde salen los zombis ----------
  const voidTex = canvasTex(64, 128, (g, w, h) => {
    const gr = g.createLinearGradient(0, h, 0, 0);
    gr.addColorStop(0, '#2d6b2a'); gr.addColorStop(0.12, '#0c1a0c'); gr.addColorStop(0.5, '#030503'); gr.addColorStop(1, '#000');
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 40; i++) { g.fillStyle = `rgba(110,220,80,${Math.random() * 0.25})`; g.fillRect(Math.random() * w, h - Math.random() * 30, 2, 2); }
  });
  const voidMat = new THREE.MeshBasicMaterial({ map: voidTex, fog: false });
  const voidGeos = [];
  const groups = [];
  for (const p of level.portals) {
    const dx = p.ix - p.x, dy = p.iy - p.y; // hacia adentro
    const cx = (p.x + 0.5) * S, cz = (p.y + 0.5) * S;
    // plano negro en el borde de afuera
    const ox = cx - dx * S * 0.45, oz = cz - dy * S * 0.45;
    const g = new THREE.PlaneGeometry(S, 2.2);
    g.rotateY(Math.atan2(dx, dy));
    g.translate(ox, 1.1, oz);
    voidGeos.push(g);
    // dintel
    pushBox(wallGeos.plain, dx ? 0.25 : S, WALL_H - 2.2, dy ? 0.25 : S, cx - dx * S * 0.38, 2.2, cz - dy * S * 0.38);
    // marco donde la puerta toca un muro
    const side = dx ? [[0, 1], [0, -1]] : [[1, 0], [-1, 0]];
    for (const [sx, sy] of side) {
      const n = at(p.x + sx, p.y + sy);
      if (n === CELL.WALL || n === CELL.GLASS) m.place(cx + sx * S * 0.45, cz + sy * S * 0.45).box(dx ? 0.25 : 0.1, 2.2, dy ? 0.25 : 0.1, 0, 0, 0, '#2b2f3a');
    }
    m.place(cx, cz).box(dx ? 0.05 : S * 0.9, 0.02, dy ? 0.05 : S * 0.9, -dx * S * 0.3, 0.005, -dy * S * 0.3, '#6fdc4f', { mat: 'glow' });
    const last = groups[groups.length - 1];
    if (last && last.dx === dx && last.dy === dy && Math.abs(last.end.x - p.x) + Math.abs(last.end.y - p.y) === 1) { last.end = p; last.n++; }
    else groups.push({ start: p, end: p, dx, dy, n: 1 });
  }
  // Letrero de salida en cada grupo de portales y cinta de precaución en los largos
  const exitTex = signTexture('SALIDA', '#2bb673', '⚠ zona de zombis');
  const exitMat = new THREE.MeshBasicMaterial({ map: exitTex, side: THREE.DoubleSide });
  const tapeTex = canvasTex(128, 16, (g, w, h) => { for (let x = -16; x < w; x += 16) { g.fillStyle = '#ffcc00'; g.fillRect(x, 0, 8, h); g.fillStyle = '#141414'; g.fillRect(x + 8, 0, 8, h); } g.fillStyle = '#141414'; g.font = '900 11px system-ui'; }, { repeat: true });
  const tapeMat = new THREE.MeshLambertMaterial({ map: tapeTex, side: THREE.DoubleSide });
  for (const gr of groups) {
    const cx = ((gr.start.x + gr.end.x) / 2 + 0.5) * S - gr.dx * S * 0.38, cz = ((gr.start.y + gr.end.y) / 2 + 0.5) * S - gr.dy * S * 0.38;
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.22), exitMat);
    sign.position.set(cx + gr.dx * 0.14, 2.42, cz + gr.dy * 0.14);
    sign.rotation.y = Math.atan2(gr.dx, gr.dy);
    root.add(sign);
    if (gr.n >= 4) {
      const len = gr.n * S;
      for (const hy of [0.95, 1.35]) {
        const t = new THREE.Mesh(new THREE.PlaneGeometry(len, 0.1), tapeMat);
        t.position.set(cx + gr.dx * 0.3, hy, cz + gr.dy * 0.3);
        t.rotation.set(0, Math.atan2(gr.dx, gr.dy), (hy > 1 ? 0.03 : -0.02));
        tapeTex.repeat.set(len / 1.2, 1);
        root.add(t);
      }
    }
  }
  disposables.push(voidTex, voidMat, exitTex, exitMat, tapeTex, tapeMat);
  const wmPlain = new THREE.MeshLambertMaterial({ map: wallTexture('plain') });
  const wmWin = new THREE.MeshLambertMaterial({ map: wallTexture('window') });
  for (const [list, mt] of [[wallGeos.plain, wmPlain], [wallGeos.window, wmWin]]) {
    if (!list.length) continue;
    const mesh = new THREE.Mesh(mergeGeometries(list), mt);
    mesh.castShadow = true; mesh.receiveShadow = true;
    root.add(mesh);
    disposables.push(mesh.geometry, mt, mt.map);
    list.forEach((g) => g.dispose());
  }
  if (glassGeos.length) {
    const gm = new THREE.MeshLambertMaterial({ color: '#a8d8ff', transparent: true, opacity: 0.2, depthWrite: false });
    const mesh = new THREE.Mesh(mergeGeometries(glassGeos), gm);
    mesh.renderOrder = 2;
    root.add(mesh);
    disposables.push(mesh.geometry, gm);
  }
  if (voidGeos.length) { const vm = new THREE.Mesh(mergeGeometries(voidGeos), voidMat); root.add(vm); disposables.push(vm.geometry); }

  // ---------- Muebles ----------
  const surfaces = [];
  const decor = [], wallDecor = [];
  for (const o of level.objects) {
    if (o.under) continue;
    if (WALL_DECOR.has(o.type)) { wallDecor.push(o); continue; }
    if (o.decor || !FURNITURE[o.type]) { decor.push(o); continue; }
    const c = CATALOG[o.type];
    const r = ((o.rot || 0) % 4 + 4) % 4;
    const uw = (r % 2 ? o.h : o.w) * S, ud = (r % 2 ? o.w : o.h) * S;
    const yaw = ROT_SEAT[o.type] ? [Math.PI, Math.PI / 2, 0, -Math.PI / 2][r] : [0, Math.PI / 2, Math.PI, -Math.PI / 2][r];
    m.place((o.x + o.w / 2) * S, (o.y + o.h / 2) * S, yaw);
    try { FURNITURE[o.type](m, uw, ud, o.color || c.color || '#9aa3ad', o); } catch { m.box(uw * 0.9, 0.8, ud * 0.9, 0, 0, 0, '#9aa3ad'); }
    if (SURFACE[o.type]) surfaces.push({ x0: o.x, y0: o.y, x1: o.x + o.w, y1: o.y + o.h, h: SURFACE[o.type] });
  }
  for (const o of decor) {
    const c = CATALOG[o.type];
    const cx = o.x + o.w / 2, cy = o.y + o.h / 2;
    const s = surfaces.find((q) => cx >= q.x0 && cx < q.x1 && cy >= q.y0 && cy < q.y1);
    m.place(cx * S, cy * S, 0, s ? s.h : 0);
    const fn = DECOR[o.type];
    if (fn) { try { fn(m, o.w * S, o.h * S, o.color || c?.color || '#9aa3ad', o); } catch { /* nada */ } }
    else if (c?.kind === 'furniture') m.box(o.w * S * 0.85, 0.8, o.h * S * 0.85, 0, 0, 0, o.color || c.color || '#9aa3ad');
    else m.box(Math.min(0.3, o.w * S * 0.5), 0.12, Math.min(0.3, o.h * S * 0.5), 0, 0, 0, o.color || c?.color || '#9aa3ad');
  }
  // ---------- Decoración de pared y letreros ----------
  const signs = [...level.signs.map((s) => ({ ...s, color: AREA_ACCENT[s.text.length % AREA_ACCENT.length] }))];
  for (const o of wallDecor) {
    const cx = o.x + o.w / 2;
    let cz = o.y + o.h / 2;
    const cell = at(Math.floor(cx), Math.floor(cz));
    if (cell === CELL.WALL || cell === CELL.GLASS) cz = Math.floor(cz) + 1.06;
    else if (at(Math.floor(cx), Math.floor(cz) - 1) === CELL.WALL) cz = Math.floor(cz) + 0.04;
    const X = cx * S, Z = cz * S;
    const col = o.color || CATALOG[o.type]?.color || '#FE3377';
    if (o.type === 'roomSign') {
      const a = areaAt(floor, o.x + level.ox + o.w / 2, o.y + level.oy + o.h + 0.6) || areaAt(floor, o.x + level.ox + o.w / 2, o.y + level.oy + o.h / 2);
      if (a && !signs.some((s) => s.text === a.name && Math.abs(s.x - cx) < 6 && Math.abs(s.y - (o.y + o.h)) < 5)) signs.push({ text: a.name, x: cx, y: o.y + o.h, w: Math.min(5, o.w), color: col });
      continue;
    }
    m.place(X, Z);
    if (o.type === 'painting') { m.box(o.w * S * 0.8, 0.7, 0.04, 0, 1.3, 0.02, '#3a2a1a').box(o.w * S * 0.7, 0.6, 0.02, 0, 1.35, 0.05, col); }
    else if (o.type === 'clock') { m.cyl(0.18, 0.04, 0, 1.9, 0.03, '#f4f6f8', { rx: Math.PI / 2 }); m.box(0.02, 0.12, 0.01, 0, 1.9, 0.06, '#141414'); }
    else if (o.type === 'window') { /* las ventanas ya vienen en la textura del muro */ }
    else if (o.type === 'bunting') { for (let k = 0; k < 8; k++) m.cone(0.08, 0.22, -o.w * S * 0.45 + k * o.w * S * 0.13, 2.25, 0.05, ['#FE3377', '#FFCC00', '#3a86ff', '#2bb673'][k % 4], { rx: Math.PI }); }
    else if (o.type === 'fairyLights') { for (let k = 0; k < 10; k++) m.ball(0.04, -o.w * S * 0.45 + k * o.w * S * 0.1, 2.35 - Math.sin(k / 9 * Math.PI) * 0.2, 0.05, ['#ffd66b', '#ff7ab6', '#7ad0ff'][k % 3], { mat: 'glow' }); }
    else if (o.type === 'ledStrip') m.box(o.w * S, 0.03, 0.02, 0, 0.2, 0.03, col, { mat: 'glow' });
    else if (o.type.startsWith('neon')) m.box(o.w * S * 0.8, 0.3, 0.03, 0, 1.75, 0.03, col, { mat: 'glow' });
    else m.box(o.w * S * 0.7, o.h * S * 0.6, 0.02, 0, 1.4, 0.03, col);
  }
  for (const s of signs) {
    const tex = signTexture(s.text.toUpperCase(), s.color || '#FE3377');
    const smat = new THREE.MeshBasicMaterial({ map: tex });
    const w = Math.max(2.2, Math.min(5, (s.w || 4) * S * 0.8));
    // dos caras (una por lado) para que se lea de frente y de espaldas
    for (const back of [false, true]) {
      const board = new THREE.Mesh(new THREE.PlaneGeometry(w, w / 4), smat);
      board.position.set(s.x * S, WALL_H - 0.55, s.y * S + 0.2 + (back ? -0.01 : 0.01));
      if (back) board.rotation.y = Math.PI;
      root.add(board);
      disposables.push(board.geometry);
    }
    for (const k of [-1, 1]) m.place(s.x * S + k * w * 0.4, s.y * S + 0.2).box(0.015, 0.4, 0.015, 0, WALL_H - 0.4, 0, '#2b2f3a');
    disposables.push(tex, smat);
  }

  const litMat = new THREE.MeshLambertMaterial({ vertexColors: true });
  const glowMat = new THREE.MeshBasicMaterial({ vertexColors: true });
  const glassMat = new THREE.MeshLambertMaterial({ vertexColors: true, transparent: true, opacity: 0.45, depthWrite: false });
  for (const mesh of m.build({ lit: litMat, glow: glowMat, glass: glassMat })) {
    if (mesh.material === litMat) { mesh.castShadow = true; mesh.receiveShadow = true; }
    root.add(mesh);
    disposables.push(mesh.geometry);
  }
  disposables.push(litMat, glowMat, glassMat);

  // ---------- Luces ----------
  const hi = quality === 'alta';
  const hemi = new THREE.HemisphereLight('#eef3ff', '#463c52', hi ? 1.25 : 1.9);
  root.add(hemi);
  const sun = new THREE.DirectionalLight('#fff4e0', hi ? 1.5 : 1.1);
  const cx = (W * S) / 2, cz = (H * S) / 2;
  sun.position.set(cx + 6, 24, cz + 9);
  sun.target.position.set(cx, 0, cz);
  root.add(sun, sun.target);
  if (hi) {
    sun.castShadow = true;
    const ext = Math.max(W, H) * S * 0.62;
    Object.assign(sun.shadow.camera, { left: -ext, right: ext, top: ext, bottom: -ext, near: 1, far: 60 });
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.bias = -0.0008;
    sun.shadow.normalBias = 0.03;
  }
  const points = [];
  const nP = hi ? 4 : 1;
  for (let k = 0; k < nP; k++) {
    const pl = new THREE.PointLight('#ffe8c4', 18, 15, 1.6);
    const fx = nP === 1 ? 0.5 : (k % 2 ? 0.72 : 0.28), fz = nP === 1 ? 0.5 : (k < 2 ? 0.3 : 0.7);
    pl.position.set(W * S * fx, WALL_H - 0.25, H * S * fz);
    root.add(pl);
    points.push(pl);
  }
  // Alarma roja para los jefes
  const alarm = new THREE.PointLight('#ff2a2a', 0, 30, 1.2);
  alarm.position.set(cx, WALL_H - 0.3, cz);
  root.add(alarm);

  let flickT = 0;
  return {
    group: root,
    update(dt, t, boss) {
      // en las hordas de jefe las luces parpadean y hay alarma
      flickT -= dt;
      let k = 1;
      if (boss) {
        if (flickT <= 0) flickT = 0.05 + Math.random() * 0.4;
        k = Math.random() < 0.12 ? 0.25 : 0.85 + Math.sin(t * 23) * 0.08;
        alarm.intensity = (Math.sin(t * 4) * 0.5 + 0.5) * 40;
      } else alarm.intensity = 0;
      ceilMat.emissiveIntensity = k;
      for (const p of points) p.intensity = 18 * k;
      hemi.intensity = (hi ? 1.25 : 1.9) * (boss ? 0.75 + k * 0.2 : 1);
    },
    dispose() {
      for (const d of disposables) d?.dispose?.();
      root.traverse((o) => { if (o.geometry) o.geometry.dispose?.(); });
    },
  };
}
