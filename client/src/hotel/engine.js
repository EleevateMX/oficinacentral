// Hotel: motor isométrico (piso, paredes, furnis, personajes, globitos de chat).
// Dibuja en vectores a la resolución del dispositivo (nítido con cualquier zoom).
// Orden de dibujo: oscuridad de la puerta → casilla de la puerta → paredes → cuadros de pared →
// piso → resaltado → furnis y personajes ordenados por profundidad (orden topológico de cajas) → etiquetas → globitos.
import { TILE_W, TILE_H, Z_PX, WALL_H, toScreen, fromScreen } from '@shared/hotel.js';
import { FURNI_BY_ID, footprint } from '@shared/hotelCatalog.js';
import { buildRoom, canPlace, canPlaceWall, tileInfo, wallTiles, wallBase, maxFloorHeight, floorAt, ROT_VEC, WALL_ITEM_MAX_H } from '@shared/hotelRoom.js';
import { drawFurni, furniBounds, drawWallItem, wallBounds } from './furniArt.js';
import { drawAvatar, drawAvatarFace } from '../lib/render.js';
import { hotel } from './hotelStore.js';

export const DEFAULT_FLOOR = '#b59a7a';
export const DEFAULT_WALL = '#e7dfd3';
const AV_SCALE = 2; // los personajes de la oficina (32×48) al doble para que tengan el tamaño de la casilla
const WALL_T = 0.16; // grosor de la pared (en casillas)
const FLOOR_T = 0.28; // grosor del piso en los bordes
const DOOR_H = 2.45; // alto del hueco de la puerta
const ZOOM_MIN = 0.35, ZOOM_MAX = 3;
const USER_COLORS = ['#FE3377', '#FFCC00', '#3a86ff', '#2fb67c', '#9b5de5', '#ff8a3d', '#00b4d8', '#e05ca5'];
export const userColor = (id) => USER_COLORS[Math.abs(Number(id) || 0) % USER_COLORS.length];

export function shade(hex, k) {
  const n = parseInt(String(hex || '#888888').slice(1), 16);
  const f = (c) => Math.max(0, Math.min(255, Math.round(c + (k > 0 ? (255 - c) * k : c * k))));
  return `rgb(${f(n >> 16)},${f((n >> 8) & 255)},${f(n & 255)})`;
}
const P = (x, y, z = 0) => { const s = toScreen(x, y, z); return [s.sx, s.sy]; };
function poly(ctx, pts, fill, stroke, lw) {
  ctx.beginPath();
  pts.forEach(([a, b], i) => (i ? ctx.lineTo(a, b) : ctx.moveTo(a, b)));
  ctx.closePath();
  if (fill) { ctx.fillStyle = fill; ctx.fill(); }
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lw || 1; ctx.stroke(); }
}
function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}

// ¿a va antes (detrás) que b? Cajas alineadas a la cuadrícula: x1..x2, y1..y2, z1..z2
function behind(a, b) {
  const e = 1e-6;
  const ax = a.x2 <= b.x1 + e, bx = b.x2 <= a.x1 + e, ay = a.y2 <= b.y1 + e, by = b.y2 <= a.y1 + e;
  if ((ax && !by) || (ay && !bx)) return true;
  if ((bx && !ay) || (by && !ax)) return false;
  if (a.z2 <= b.z1 + e) return true;
  if (b.z2 <= a.z1 + e) return false;
  if (!!a.avatar !== !!b.avatar) return !a.avatar; // sentado/acostado: el furni primero
  return a.x1 + a.y1 + a.z1 < b.x1 + b.y1 + b.z1;
}
export function depthSort(list) {
  const n = list.length;
  const before = Array.from({ length: n }, () => []);
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
    const a = list[i], b = list[j];
    // Solo importa si se enciman en pantalla
    if (a.sx2 < b.sx1 || b.sx2 < a.sx1 || a.sy2 < b.sy1 || b.sy2 < a.sy1) continue;
    if (behind(a, b)) before[j].push(i); else before[i].push(j);
  }
  const out = [], mark = new Uint8Array(n);
  const visit = (i) => {
    if (mark[i]) return;
    mark[i] = 1;
    for (const k of before[i]) visit(k);
    out.push(list[i]);
  };
  // Orden base estable (de atrás hacia adelante) para que los empates no parpadeen
  const order = [...list.keys()].sort((i, j) => (list[i].x1 + list[i].y1) - (list[j].x1 + list[j].y1) || list[i].z1 - list[j].z1 || list[i].key - list[j].key);
  for (const i of order) visit(i);
  return out;
}

const faceCache = new Map();
function faceOf(U) {
  const k = `${U.id}:${JSON.stringify(U.avatar || {})}`;
  let c = faceCache.get(k);
  if (!c) {
    c = document.createElement('canvas'); c.width = 24; c.height = 24;
    try { drawAvatarFace(c, U.avatar || {}); } catch { /* sin cara */ }
    faceCache.set(k, c);
  }
  return c;
}

export class HotelEngine {
  constructor(canvas, cb = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.cb = cb;
    this.cam = { x: 0, y: 0, zoom: 1 };
    this.mouse = null;
    this.hover = null;
    this.pick = [];
    this.pointers = new Map();
    this.centeredFor = null;
    this.font = getComputedStyle(document.body).fontFamily || 'system-ui, sans-serif';
    this.lastClick = { t: 0, id: null };
    this.raf = 0;
  }

  start() {
    const c = this.canvas;
    this.onResize = () => this.resize();
    window.addEventListener('resize', this.onResize);
    this.ro = new ResizeObserver(this.onResize);
    this.ro.observe(c.parentElement);
    c.addEventListener('pointerdown', this.down);
    c.addEventListener('pointermove', this.move);
    c.addEventListener('pointerup', this.up);
    c.addEventListener('pointercancel', this.up);
    c.addEventListener('pointerleave', this.leave);
    c.addEventListener('wheel', this.wheel, { passive: false });
    c.addEventListener('contextmenu', (e) => e.preventDefault());
    this.resize();
    const loop = (t) => { this.raf = requestAnimationFrame(loop); try { this.frame(t); } catch (e) { console.error(e); } };
    this.raf = requestAnimationFrame(loop);
  }
  stop() {
    cancelAnimationFrame(this.raf);
    window.removeEventListener('resize', this.onResize);
    this.ro?.disconnect();
    const c = this.canvas;
    c.removeEventListener('pointerdown', this.down);
    c.removeEventListener('pointermove', this.move);
    c.removeEventListener('pointerup', this.up);
    c.removeEventListener('pointercancel', this.up);
    c.removeEventListener('pointerleave', this.leave);
    c.removeEventListener('wheel', this.wheel);
  }
  resize() {
    const c = this.canvas, r = c.parentElement.getBoundingClientRect();
    this.dpr = Math.min(3, window.devicePixelRatio || 1);
    this.W = Math.max(1, r.width); this.H = Math.max(1, r.height);
    c.width = Math.round(this.W * this.dpr); c.height = Math.round(this.H * this.dpr);
    c.style.width = `${this.W}px`; c.style.height = `${this.H}px`;
    if (this.bounds) this.clampCam();
  }

  // ---------- Cámara ----------
  roomBounds(grid) {
    let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
    const top = maxFloorHeight(grid) + WALL_H;
    for (let y = 0; y < grid.H; y++) for (let x = 0; x < grid.W; x++) {
      const h = floorAt(grid, x, y);
      if (Number.isNaN(h)) continue;
      for (const [a, b, z] of [[x, y, top], [x + 1, y, h], [x, y + 1, h], [x + 1, y + 1, -FLOOR_T]]) {
        const [sx, sy] = P(a, b, z);
        x1 = Math.min(x1, sx); x2 = Math.max(x2, sx); y1 = Math.min(y1, sy); y2 = Math.max(y2, sy);
      }
    }
    return { x1, y1, x2, y2 };
  }
  center(grid) {
    const b = this.bounds = this.roomBounds(grid);
    const fit = Math.min((this.W - 40) / (b.x2 - b.x1), (this.H - 150) / (b.y2 - b.y1));
    const z = Math.max(0.35, Math.min(1.5, fit >= 0.75 ? Math.floor(fit * 4) / 4 : fit));
    this.cam.zoom = z;
    this.cam.x = this.W / 2 - ((b.x1 + b.x2) / 2) * z;
    this.cam.y = (this.H - 60) / 2 - ((b.y1 + b.y2) / 2) * z;
  }
  clampCam() {
    const b = this.bounds, z = this.cam.zoom;
    if (!b) return;
    // La sala no se puede perder de vista
    const m = 80;
    this.cam.x = Math.min(this.W - m - b.x1 * z, Math.max(m - b.x2 * z, this.cam.x));
    this.cam.y = Math.min(this.H - m - b.y1 * z, Math.max(m - b.y2 * z, this.cam.y));
  }
  zoomAt(f, sx = this.W / 2, sy = this.H / 2) {
    const z0 = this.cam.zoom, z1 = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, z0 * f));
    this.cam.x = sx - (sx - this.cam.x) * (z1 / z0);
    this.cam.y = sy - (sy - this.cam.y) * (z1 / z0);
    this.cam.zoom = z1;
    this.clampCam();
  }
  toWorld(sx, sy) { return { wx: (sx - this.cam.x) / this.cam.zoom, wy: (sy - this.cam.y) / this.cam.zoom }; }
  toScr(wx, wy) { return { x: wx * this.cam.zoom + this.cam.x, y: wy * this.cam.zoom + this.cam.y }; }

  // ---------- Entrada ----------
  rel(e) { const r = this.canvas.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; }
  down = (e) => {
    const p = this.rel(e);
    this.canvas.setPointerCapture?.(e.pointerId);
    this.pointers.set(e.pointerId, { ...p, sx: p.x, sy: p.y, t: performance.now() });
    if (this.pointers.size === 2) {
      const [a, b] = [...this.pointers.values()];
      this.pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), zoom: this.cam.zoom };
    }
    this.drag = { x: p.x, y: p.y, cx: this.cam.x, cy: this.cam.y, moved: false };
  };
  move = (e) => {
    const p = this.rel(e);
    this.mouse = p;
    const pt = this.pointers.get(e.pointerId);
    if (pt) { pt.x = p.x; pt.y = p.y; }
    if (this.pointers.size === 2 && this.pinch) {
      const [a, b] = [...this.pointers.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      this.zoomAt((this.pinch.zoom * d / this.pinch.d) / this.cam.zoom, (a.x + b.x) / 2, (a.y + b.y) / 2);
      this.drag.moved = true;
      return;
    }
    if (this.drag && pt) {
      const dx = p.x - this.drag.x, dy = p.y - this.drag.y;
      if (!this.drag.moved && Math.hypot(dx, dy) > 6) this.drag.moved = true;
      if (this.drag.moved && !hotel.state.placing) {
        this.cam.x = this.drag.cx + dx; this.cam.y = this.drag.cy + dy;
        this.clampCam();
      }
    }
  };
  up = (e) => {
    const pt = this.pointers.get(e.pointerId);
    this.pointers.delete(e.pointerId);
    if (this.pointers.size < 2) this.pinch = null;
    if (!pt || !this.drag) return;
    const wasDrag = this.drag.moved;
    if (!this.pointers.size) this.drag = null;
    if (wasDrag && !hotel.state.placing) return;
    if (e.type === 'pointercancel') return;
    const p = this.rel(e);
    if (e.pointerType !== 'mouse') this.mouse = p;
    this.click(p, e);
  };
  leave = (e) => { if (e.pointerType === 'mouse' && !this.pointers.size) this.mouse = null; };
  wheel = (e) => {
    e.preventDefault();
    const p = this.rel(e);
    this.zoomAt(Math.exp(-e.deltaY * 0.0015), p.x, p.y);
  };

  click(p, e) {
    const st = hotel.state;
    const hit = this.hitTest(p);
    if (st.placing) {
      const g = this.ghost;
      if (e.button === 2) { hotel.set({ placing: null }); return; }
      if (g?.ok) hotel.place(g.target);
      else if (g?.reason) this.cb.onInvalid?.(g.reason);
      return;
    }
    const t = performance.now();
    if (hit?.kind === 'user') { this.cb.onUser?.(hit.id); return; }
    if (hit?.kind === 'item') {
      const dbl = this.lastClick.id === hit.item.id && t - this.lastClick.t < 380;
      this.lastClick = { t, id: hit.item.id };
      if (dbl) { this.cb.onUse?.(hit.item); return; }
      const def = FURNI_BY_ID[hit.item.type];
      this.cb.onItem?.(hit.item);
      // Sillas, camas, tapetes y teletransportadores: además caminas hacia ahí
      if (def && !hit.item.wall && (def.walk || def.sit || def.lay)) {
        const tile = this.tileAt(p);
        if (tile) this.cb.onTile?.(tile.x, tile.y);
      }
      return;
    }
    const tile = this.tileAt(p);
    if (tile) this.cb.onTile?.(tile.x, tile.y);
    else this.cb.onEmpty?.();
  }

  // Casilla bajo el puntero (por altura de piso, de la más alta a la más baja)
  tileAt(p) {
    const grid = hotel.live.grid;
    if (!grid || !p) return null;
    const { wx, wy } = this.toWorld(p.x, p.y);
    const hs = [...new Set(grid.heights.flat().filter((h) => !Number.isNaN(h)))].sort((a, b) => b - a);
    for (const h of hs) {
      const f = fromScreen(wx, wy, h);
      const x = Math.floor(f.x), y = Math.floor(f.y);
      if (floorAt(grid, x, y) === h) return { x, y, z: h };
    }
    return null;
  }
  hitTest(p) {
    if (!p) return null;
    for (let i = this.pick.length - 1; i >= 0; i--) {
      const k = this.pick[i];
      if (k.test(p)) return k;
    }
    return null;
  }

  // Punto de la pared bajo el puntero → { wall, pos, h } para colocar un cuadro
  wallAt(p, def) {
    const grid = hotel.live.grid;
    if (!grid || !p) return null;
    const { wx, wy } = this.toWorld(p.x, p.y);
    const half = TILE_W / 2;
    const top = maxFloorHeight(grid) + WALL_H;
    const b = wallBounds(def);
    const itemH = (b.y + b.h / 2) / Z_PX; // centro del dibujo respecto a su base (negativo = arriba)
    const pick = (wall) => {
      // Pared izquierda: plano x = 1; derecha: plano y = 1
      let along, z;
      if (wall === 'l') { along = 1 - wx / half; z = ((1 + along) * (TILE_H / 2) - wy) / Z_PX; } else { along = 1 + wx / half; z = ((along + 1) * (TILE_H / 2) - wy) / Z_PX; }
      const tiles = wallTiles(grid, wall);
      if (!tiles.length || along < tiles[0] || along > tiles[tiles.length - 1] + 1) return null;
      const base = wallBase(grid, wall, Math.min(tiles[tiles.length - 1], Math.max(tiles[0], Math.floor(along))));
      if (z < base - 0.2 || z > top + 0.2) return null;
      const pos = wall === 'l' ? Math.round(along - def.w / 2) : Math.round(along - def.w / 2);
      let h = Math.round((z - base + itemH) * 4) / 4;
      h = Math.max(0, Math.min(WALL_ITEM_MAX_H, h));
      return { wall, pos, h };
    };
    return wx < 0 ? pick('l') || pick('r') : pick('r') || pick('l');
  }

  // ---------- Dibujo ----------
  frame(t) {
    const L = hotel.live, grid = L.grid, ctx = this.ctx;
    const dpr = this.dpr;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    // Fondo
    const g = ctx.createLinearGradient(0, 0, 0, this.canvas.height);
    g.addColorStop(0, '#191920'); g.addColorStop(1, '#0d0d10');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    if (!grid || !L.room) return;
    hotel.tick(t);
    const key = `${L.room.room.id}:${grid.model}`;
    if (this.centeredFor !== key) { this.center(grid); this.centeredFor = key; }
    const z = this.cam.zoom;
    ctx.setTransform(dpr * z, 0, 0, dpr * z, dpr * this.cam.x, dpr * this.cam.y);
    ctx.lineJoin = 'round';
    const room = hotel.state.room || L.room.room;
    const floorC = room.floorColor || DEFAULT_FLOOR, wallC = room.wallColor || DEFAULT_WALL;
    const placing = hotel.state.placing;
    const pdef = placing && FURNI_BY_ID[placing.type];

    this.drawDoorBack(ctx, grid, floorC);
    this.drawWalls(ctx, grid, wallC);
    const pick = [];
    // Cuadros de pared
    const wallItems = [...L.items.values()].filter((i) => i.wall);
    let ghostWall = null;
    if (pdef?.kind === 'wall' && this.mouse) {
      const w = this.wallAt(this.mouse, pdef);
      if (w) {
        const v = canPlaceWall(grid, pdef, w.wall, w.pos, w.h);
        ghostWall = { id: -1, type: placing.type, color: placing.color, state: 0, rot: w.wall === 'l' ? 2 : 4, wall: w, ghost: true };
        this.ghost = { ok: v.ok, reason: v.reason, target: w };
      } else this.ghost = { ok: false, reason: 'Pon el cuadro sobre una pared' };
    }
    for (const it of ghostWall ? [...wallItems.filter((i) => i.id !== placing.itemId), ghostWall] : wallItems) {
      const def = FURNI_BY_ID[it.type];
      if (!def) continue;
      const m = this.wallMatrix(grid, def, it.wall);
      ctx.save();
      ctx.transform(1, m.b, 0, 1, m.ox, m.oy);
      if (it.ghost) ctx.globalAlpha = this.ghost?.ok ? 0.75 : 0.4;
      const hov = this.hover?.kind === 'item' && this.hover.item.id === it.id;
      drawWallItem(ctx, def, it, { t, hover: hov, ghost: !!it.ghost });
      ctx.restore();
      if (!it.ghost) {
        const wb = wallBounds(def);
        pick.push({ kind: 'item', item: it, test: (p) => { const { wx, wy } = this.toWorld(p.x, p.y); const u = wx - m.ox, v = wy - m.oy - m.b * u; return u >= wb.x && u <= wb.x + wb.w && v >= wb.y && v <= wb.y + wb.h; } });
      }
    }
    this.drawFloor(ctx, grid, floorC);

    // Resaltado de la casilla bajo el puntero / huella del furni a colocar
    const tile = this.mouse ? this.tileAt(this.mouse) : null;
    let ghostItem = null;
    if (pdef?.kind === 'floor') {
      this.ghost = { ok: false, reason: 'Pon el furni dentro de la sala' };
      if (tile) {
        const users = [...L.users.values()].map((U) => ({ x: Math.round(U.rx), y: Math.round(U.ry) }));
        const v = canPlace(grid, pdef, tile.x, tile.y, placing.rot, { ignoreId: placing.move ? placing.itemId : null, users });
        const { w, l } = footprint(pdef, placing.rot);
        const base = floorAt(grid, tile.x, tile.y);
        poly(ctx, [P(tile.x, tile.y, base), P(tile.x + w, tile.y, base), P(tile.x + w, tile.y + l, base), P(tile.x, tile.y + l, base)], v.ok ? 'rgba(47,182,124,.35)' : 'rgba(230,57,70,.35)', v.ok ? '#2fb67c' : '#e63946', 1.5);
        ghostItem = { id: -1, type: placing.type, x: tile.x, y: tile.y, z: v.ok ? v.z : base, rot: placing.rot, color: placing.color, state: placing.state || 0, extra: placing.extra || {}, ghost: true, ok: v.ok };
        this.ghost = { ok: v.ok, reason: v.reason, target: { x: tile.x, y: tile.y, rot: placing.rot } };
      }
    } else if (tile && !placing && this.mouse && !(this.hover && this.hover.kind !== 'tile')) {
      const ti = tileInfo(grid, tile.x, tile.y);
      const zz = ti && ti.kind !== 'block' ? (ti.kind === 'walk' ? ti.z : tile.z) : tile.z;
      poly(ctx, [P(tile.x, tile.y, zz), P(tile.x + 1, tile.y, zz), P(tile.x + 1, tile.y + 1, zz), P(tile.x, tile.y + 1, zz)], 'rgba(255,255,255,.16)', 'rgba(255,255,255,.85)', 1.5 / z);
    }

    // Furnis y personajes
    const list = [];
    let k = 0;
    const addItem = (it) => {
      const def = FURNI_BY_ID[it.type];
      if (!def) return;
      const { w, l } = footprint(def, it.rot);
      const [ox, oy] = P(it.x, it.y, it.z);
      const fb = furniBounds(def, it.rot);
      list.push({ key: k++, item: it, def, ox, oy, fb, x1: it.x, y1: it.y, x2: it.x + w, y2: it.y + l, z1: it.z, z2: it.z + Math.max(0.03, def.h), sx1: ox + fb.x, sx2: ox + fb.x + fb.w, sy1: oy + fb.y, sy2: oy + fb.y + fb.h });
    };
    for (const it of L.items.values()) if (!it.wall && !(placing?.move && it.id === placing.itemId)) addItem(it);
    if (ghostItem) addItem(ghostItem);
    for (const U of L.users.values()) {
      const [fx, fy] = P(U.rx + 0.5, U.ry + 0.5, U.rz);
      const lay = !!U.lay && !U.moving;
      list.push({ key: k++, avatar: true, U, fx, fy, x1: U.rx + 0.3, x2: U.rx + 0.7, y1: U.ry + 0.3, y2: U.ry + 0.7, z1: U.rz, z2: U.rz + (lay ? 0.5 : 2.6), sx1: fx - 36, sx2: fx + 36, sy1: fy - 100, sy2: fy + 8 });
    }
    const sorted = depthSort(list);
    for (const d of sorted) {
      if (d.avatar) { this.drawUser(ctx, d.U, d.fx, d.fy, t); pick.push(this.userPick(d)); continue; }
      ctx.save();
      ctx.translate(d.ox, d.oy);
      if (d.item.ghost) ctx.globalAlpha = d.item.ok ? 0.8 : 0.45;
      const hov = this.hover?.kind === 'item' && this.hover.item.id === d.item.id;
      drawFurni(ctx, d.def, d.item, { t, hover: hov, ghost: !!d.item.ghost });
      ctx.restore();
      if (!d.item.ghost) pick.push({ kind: 'item', item: d.item, test: (p) => { const { wx, wy } = this.toWorld(p.x, p.y); return wx >= d.sx1 && wx <= d.sx2 && wy >= d.sy1 && wy <= d.sy2 && this.inItemShape(d, wx, wy); } });
    }
    this.pick = pick;
    this.hover = this.mouse ? this.hitTest(this.mouse) : null;
    this.canvas.style.cursor = placing ? (this.ghost?.ok ? 'copy' : 'not-allowed') : this.hover ? 'pointer' : 'default';

    // Etiquetas y globitos en coordenadas de pantalla (CSS px)
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    for (const d of sorted) if (d.avatar) this.drawTags(ctx, d, t);
    this.drawBubbles(ctx, t);
  }

  // Forma del furni para clics: la silueta (hexágono) de su caja, tan alta como su dibujo
  inItemShape(d, wx, wy) {
    const { w, l } = footprint(d.def, d.item.rot);
    const hz = Math.max(0.15, d.def.h, -d.fb.y / Z_PX);
    const pts = [P(0, 0, hz), P(w, 0, hz), P(w, 0, 0), P(w, l, 0), P(0, l, 0), P(0, l, hz)];
    const x = wx - d.ox, y = wy - d.oy;
    let inside = false;
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      const [xi, yi] = pts[i], [xj, yj] = pts[j];
      if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
  }

  wallMatrix(grid, def, w) {
    const base = wallBase(grid, w.wall, w.pos);
    if (w.wall === 'l') { const [ox, oy] = P(1, w.pos + def.w, base + w.h); return { ox, oy, b: -0.5 }; }
    const [ox, oy] = P(w.pos, 1, base + w.h);
    return { ox, oy, b: 0.5 };
  }

  drawDoorBack(ctx, grid, floorC) {
    const d = grid.door;
    const h = floorAt(grid, d.x, d.y);
    if (Number.isNaN(h)) return;
    // Pasillo oscuro detrás de la puerta
    poly(ctx, [P(d.x, d.y, h), P(d.x, d.y + 1, h), P(d.x, d.y + 1, h + DOOR_H), P(d.x, d.y, h + DOOR_H)], '#08080a');
    this.drawTile(ctx, grid, d.x, d.y, floorC, true);
  }

  drawWalls(ctx, grid, wallC, { onlyAfterDoor = false } = {}) {
    const top = maxFloorHeight(grid) + WALL_H;
    const door = grid.door;
    const lc = shade(wallC, -0.1), rc = wallC, cap = shade(wallC, -0.42), endC = shade(wallC, -0.3);
    const ly = wallTiles(grid, 'l'), rx = wallTiles(grid, 'r');
    const lw = 0.8 / this.cam.zoom;
    const poly = (c, pts, fill) => { ctx.beginPath(); pts.forEach(([a, b], i) => (i ? ctx.lineTo(a, b) : ctx.moveTo(a, b))); ctx.closePath(); ctx.fillStyle = fill; ctx.fill(); ctx.strokeStyle = fill; ctx.lineWidth = lw; ctx.stroke(); };
    if (!onlyAfterDoor) {
      // Pared derecha (a lo largo de +x en y = 1)
      for (const x of rx) {
        const b = floorAt(grid, x, 1);
        poly(ctx, [P(x, 1, b), P(x + 1, 1, b), P(x + 1, 1, top), P(x, 1, top)], rc);
        // Zoclo
        poly(ctx, [P(x, 1, b), P(x + 1, 1, b), P(x + 1, 1, b + 0.12), P(x, 1, b + 0.12)], shade(wallC, -0.18));
        poly(ctx, [P(x, 1 - WALL_T, top), P(x + 1, 1 - WALL_T, top), P(x + 1, 1, top), P(x, 1, top)], cap);
      }
      if (rx.length) {
        const xe = rx[rx.length - 1] + 1, b = floorAt(grid, xe - 1, 1);
        poly(ctx, [P(xe, 1 - WALL_T, b - FLOOR_T), P(xe, 1, b - FLOOR_T), P(xe, 1, top), P(xe, 1 - WALL_T, top)], endC);
      }
    }
    // Pared izquierda (a lo largo de +y en x = 1)
    for (const y of ly) {
      if (onlyAfterDoor && y <= door.y) continue;
      const b = floorAt(grid, 1, y);
      const isDoor = door.x < 1 && y === door.y;
      const from = isDoor ? b + DOOR_H : b;
      poly(ctx, [P(1, y, from), P(1, y + 1, from), P(1, y + 1, top), P(1, y, top)], lc);
      if (!isDoor) poly(ctx, [P(1, y, b), P(1, y + 1, b), P(1, y + 1, b + 0.12), P(1, y, b + 0.12)], shade(wallC, -0.26));
      else {
        // Marco de la puerta
        poly(ctx, [P(1, y, from), P(1, y + 1, from), P(1 - WALL_T, y + 1, from), P(1 - WALL_T, y, from)], shade(wallC, -0.35));
        poly(ctx, [P(1 - WALL_T, y + 1, b), P(1, y + 1, b), P(1, y + 1, from), P(1 - WALL_T, y + 1, from)], endC);
      }
      poly(ctx, [P(1 - WALL_T, y, top), P(1, y, top), P(1, y + 1, top), P(1 - WALL_T, y + 1, top)], cap);
    }
    if (ly.length) {
      const ye = ly[ly.length - 1] + 1, b = floorAt(grid, 1, ye - 1);
      poly(ctx, [P(1 - WALL_T, ye, b - FLOOR_T), P(1, ye, b - FLOOR_T), P(1, ye, top), P(1 - WALL_T, ye, top)], endC);
    }
    // Esquina
    if (ly.length && rx.length && !onlyAfterDoor) poly(ctx, [P(1 - WALL_T, 1 - WALL_T, top), P(1, 1 - WALL_T, top), P(1, 1, top), P(1 - WALL_T, 1, top)], cap);
  }

  drawTile(ctx, grid, x, y, floorC) {
    const h = floorAt(grid, x, y);
    const z = this.cam.zoom;
    const base = (x + y) % 2 ? shade(floorC, 0.05) : floorC;
    poly(ctx, [P(x, y, h), P(x + 1, y, h), P(x + 1, y + 1, h), P(x, y + 1, h)], base, shade(floorC, -0.14), 1 / z);
    // Caras de los lados (bordes del piso y escalones)
    const below = floorAt(grid, x, y + 1), right = floorAt(grid, x + 1, y);
    const bz = Number.isNaN(below) ? -FLOOR_T : below, rz = Number.isNaN(right) ? -FLOOR_T : right;
    if (bz < h) poly(ctx, [P(x, y + 1, h), P(x + 1, y + 1, h), P(x + 1, y + 1, bz), P(x, y + 1, bz)], shade(floorC, -0.28), shade(floorC, -0.36), 1 / z);
    if (rz < h) poly(ctx, [P(x + 1, y, h), P(x + 1, y + 1, h), P(x + 1, y + 1, rz), P(x + 1, y, rz)], shade(floorC, -0.42), shade(floorC, -0.5), 1 / z);
  }

  drawFloor(ctx, grid, floorC) {
    const d = grid.door;
    for (let s = 0; s < grid.W + grid.H; s++) for (let y = 0; y <= s; y++) {
      const x = s - y;
      if (x >= grid.W || y >= grid.H || Number.isNaN(floorAt(grid, x, y)) || (x === d.x && y === d.y)) continue;
      this.drawTile(ctx, grid, x, y, floorC);
    }
  }

  drawUser(ctx, U, fx, fy, t) {
    const step = U.moving ? 1 + (Math.floor(t / 125) % 4) : 0;
    const blink = !U.moving && (t + U.id * 1337) % 4200 < 140;
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    if (U.lay && !U.moving) {
      // Acostado: el personaje girado a lo largo de la cama, con la cabeza hacia la cabecera
      const it = hotel.live.grid && tileInfo(hotel.live.grid, U.x, U.y)?.item;
      const rv = ROT_VEC[it?.rot ?? 0] || [0, 1];
      const [hx, hy] = [-rv[0], -rv[1]];
      const ang = Math.atan2((hx + hy) * (TILE_H / 2), (hx - hy) * (TILE_W / 2));
      ctx.translate(fx, fy - 6);
      ctx.rotate(ang + Math.PI / 2);
      ctx.scale(1.75, 1.75);
      drawAvatar(ctx, 0, 22, U.avatar, 'down', 0, false, true);
    } else {
      ctx.translate(fx, fy + (U.sit?.floor ? 4 : 0));
      ctx.scale(AV_SCALE, AV_SCALE);
      drawAvatar(ctx, 0, 0, U.avatar, U.dir, step, !!U.sit, blink);
    }
    ctx.restore();
  }
  userPick(d) {
    return { kind: 'user', id: d.U.id, test: (p) => { const { wx, wy } = this.toWorld(p.x, p.y); return wx >= d.fx - 18 && wx <= d.fx + 18 && wy >= d.fy - (d.U.lay ? 40 : 84) && wy <= d.fy + 4; } };
  }

  drawTags(ctx, d, t) {
    const U = d.U;
    const s = this.toScr(d.fx, d.fy - (U.lay ? 40 : U.sit ? 78 : 92));
    const me = U.id === hotel.me;
    const hov = this.hover?.kind === 'user' && this.hover.id === U.id;
    const sel = hotel.state.selected?.userId === U.id;
    if (hov || sel) {
      ctx.font = `700 12px ${this.font}`;
      const w = ctx.measureText(U.name).width + 14;
      ctx.fillStyle = 'rgba(20,20,20,.82)';
      roundRect(ctx, s.x - w / 2, s.y - 20, w, 19, 9.5); ctx.fill();
      ctx.fillStyle = me ? '#FFCC00' : '#fff';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(U.name, s.x, s.y - 10.5);
    } else if (me && !hotel.live.bubbles.length) {
      // Flechita sobre tu personaje para ubicarte
      const bob = Math.sin(t / 300) * 2;
      poly(ctx, [[s.x - 5, s.y - 12 + bob], [s.x + 5, s.y - 12 + bob], [s.x, s.y - 5 + bob]], '#FFCC00', 'rgba(0,0,0,.5)', 1);
    }
    // Escribiendo…
    const ty = hotel.live.typing.get(U.id);
    if (ty && Date.now() - ty < 6000) {
      const y = s.y - (hov || sel ? 28 : 8);
      ctx.fillStyle = '#fff';
      roundRect(ctx, s.x - 17, y - 16, 34, 16, 8); ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,.35)'; ctx.lineWidth = 1; ctx.stroke();
      for (let i = 0; i < 3; i++) {
        ctx.fillStyle = Math.floor(t / 250) % 3 === i ? '#141414' : '#9a9aa2';
        ctx.beginPath(); ctx.arc(s.x - 8 + i * 8, y - 8, 2.4, 0, Math.PI * 2); ctx.fill();
      }
    }
  }

  // Globitos de chat: aparecen sobre la cabeza y suben en filas, como en el hotel clásico
  drawBubbles(ctx, t) {
    const L = hotel.live;
    const now = Date.now();
    const pad = 8, lineH = 16;
    if (L.pendingBubbles?.length) {
      for (const m of L.pendingBubbles.splice(0)) {
        const U = L.users.get(m.from);
        let anchor = { x: this.W / 2, y: this.H / 2 };
        if (U) { const [fx, fy] = P(U.rx + 0.5, U.ry + 0.5, U.rz); anchor = this.toScr(fx, fy - (U.lay ? 44 : U.sit ? 80 : 96)); }
        const shout = m.mode === 'shout', whisper = m.mode === 'whisper';
        const size = shout ? 15 : 13;
        const font = `${whisper ? 'italic ' : ''}${shout ? 800 : 500} ${size}px ${this.font}`;
        const nameFont = `800 ${size}px ${this.font}`;
        ctx.font = nameFont;
        const name = `${m.name}${whisper ? (m.from === hotel.me ? ` → ${L.users.get(m.to)?.name || ''}` : ' (susurro)') : ''}: `;
        const nameW = ctx.measureText(name).width;
        ctx.font = font;
        // Partir en líneas (máx. 300 px de ancho)
        const maxW = Math.min(380, this.W - 60);
        const words = m.text.split(' ');
        const lines = [];
        let cur = '', first = true;
        for (const wd of words) {
          const test = cur ? `${cur} ${wd}` : wd;
          const avail = maxW - (first ? nameW : 0);
          if (ctx.measureText(test).width > avail && cur) { lines.push(cur); cur = wd; first = false; } else cur = test;
          // Palabras larguísimas: se cortan
          while (ctx.measureText(cur).width > maxW - (first ? nameW : 0) && cur.length > 4) {
            let cut = cur.length - 1;
            while (cut > 1 && ctx.measureText(cur.slice(0, cut)).width > maxW - (first ? nameW : 0)) cut--;
            lines.push(cur.slice(0, cut)); cur = cur.slice(cut); first = false;
          }
        }
        if (cur) lines.push(cur);
        const textW = Math.max(...lines.map((ln, i) => ctx.measureText(ln).width + (i === 0 ? nameW : 0)));
        const w = Math.ceil(textW + pad * 2 + 26);
        const h = lines.length * (lineH + (shout ? 2 : 0)) + 10;
        const b = { m, U: U ? { id: U.id, avatar: U.avatar } : null, lines, name, nameW, font, nameFont, size, w, h, ax: anchor.x, x: Math.max(6, Math.min(this.W - w - 6, anchor.x - w / 2)), ty: anchor.y - h - 8, born: now };
        b.y = b.ty + 10;
        // Los anteriores suben lo necesario para dejarle su fila
        const need = Math.max(0, ...L.bubbles.map((o) => o.ty + o.h - (b.ty - 3)));
        if (need > 0) for (const o of L.bubbles) o.ty -= need;
        L.bubbles.push(b);
        L.lastShift = now;
      }
    }
    // Con el tiempo, todos suben una fila
    if (L.bubbles.length && now - L.lastShift > 4500) { for (const o of L.bubbles) o.ty -= 24; L.lastShift = now; }
    L.bubbles = L.bubbles.filter((o) => o.y + o.h > -10 && now - o.born < 60e3);
    for (const o of L.bubbles) {
      o.y += (o.ty - o.y) * 0.25;
      const { x, y, w, h, m } = o;
      const whisper = m.mode === 'whisper', shout = m.mode === 'shout';
      const col = userColor(m.from);
      ctx.save();
      ctx.globalAlpha = Math.min(1, (now - o.born) / 120);
      // Piquito hacia quien habla
      const px = Math.max(x + 12, Math.min(x + w - 12, o.ax));
      ctx.fillStyle = whisper ? '#ecebf3' : '#fff';
      ctx.strokeStyle = shout ? '#141414' : 'rgba(20,20,20,.55)';
      ctx.lineWidth = shout ? 2 : 1.25;
      ctx.beginPath(); ctx.moveTo(px - 5, y + h - 1); ctx.lineTo(px, y + h + 6); ctx.lineTo(px + 5, y + h - 1); ctx.closePath(); ctx.fill(); ctx.stroke();
      roundRect(ctx, x, y, w, h, 9); ctx.fill(); ctx.stroke();
      ctx.fillStyle = whisper ? '#ecebf3' : '#fff';
      ctx.fillRect(px - 4, y + h - 2.5, 8, 2.5);
      // Carita con el color de la persona
      ctx.fillStyle = col;
      roundRect(ctx, x + 4, y + 4, 22, h - 8, 6); ctx.fill();
      if (o.U) { ctx.imageSmoothingEnabled = false; ctx.drawImage(faceOf(o.U), x + 5, y + h / 2 - 10, 20, 20); }
      ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
      const lh = lineH + (shout ? 2 : 0);
      o.lines.forEach((ln, i) => {
        let tx = x + pad + 24;
        const ty = y + 5 + lh * i + lh / 2;
        if (i === 0) { ctx.font = o.nameFont; ctx.fillStyle = '#141414'; ctx.fillText(o.name, tx, ty); tx += o.nameW; }
        ctx.font = o.font; ctx.fillStyle = whisper ? '#55546a' : '#1d1d22';
        ctx.fillText(ln, tx, ty);
      });
      ctx.restore();
    }
  }
}

// Vista previa de un modelo de sala (para el diálogo de crear sala)
export function drawModelPreview(canvas, model) {
  const ctx = canvas.getContext('2d');
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const W = canvas.clientWidth || 120, H = canvas.clientHeight || 80;
  canvas.width = W * dpr; canvas.height = H * dpr;
  { const br = buildRoom;
    const grid = br(model, []);
    let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
    for (let y = 0; y < grid.H; y++) for (let x = 0; x < grid.W; x++) {
      const h = floorAt(grid, x, y);
      if (Number.isNaN(h)) continue;
      for (const [a, b, z] of [[x, y, h + 1.2], [x + 1, y, h], [x, y + 1, h], [x + 1, y + 1, 0]]) { const [sx, sy] = P(a, b, z); x1 = Math.min(x1, sx); x2 = Math.max(x2, sx); y1 = Math.min(y1, sy); y2 = Math.max(y2, sy); }
    }
    const k = Math.min((W - 10) / (x2 - x1), (H - 10) / (y2 - y1));
    ctx.setTransform(dpr * k, 0, 0, dpr * k, dpr * (W / 2 - ((x1 + x2) / 2) * k), dpr * (H / 2 - ((y1 + y2) / 2) * k));
    ctx.clearRect(-1e4, -1e4, 2e4, 2e4);
    const fc = '#FE3377';
    // Paredes chiquitas
    for (const y of wallTiles(grid, 'l')) { const b = floorAt(grid, 1, y); if (y !== grid.door.y) poly(ctx, [P(1, y, b), P(1, y + 1, b), P(1, y + 1, b + 1.2), P(1, y, b + 1.2)], 'rgba(255,255,255,.18)'); }
    for (const x of wallTiles(grid, 'r')) { const b = floorAt(grid, x, 1); poly(ctx, [P(x, 1, b), P(x + 1, 1, b), P(x + 1, 1, b + 1.2), P(x, 1, b + 1.2)], 'rgba(255,255,255,.28)'); }
    for (let s = 0; s < grid.W + grid.H; s++) for (let y = 0; y <= s; y++) {
      const x = s - y, h = floorAt(grid, x, y);
      if (x >= grid.W || y >= grid.H || Number.isNaN(h)) continue;
      const door = x === grid.door.x && y === grid.door.y;
      poly(ctx, [P(x, y, h), P(x + 1, y, h), P(x + 1, y + 1, h), P(x, y + 1, h)], door ? '#FFCC00' : shade(fc, h * 0.18 - 0.1 + ((x + y) % 2) * 0.06), 'rgba(0,0,0,.35)', 1 / k);
      const below = floorAt(grid, x, y + 1), right = floorAt(grid, x + 1, y);
      if (!Number.isNaN(below) && below < h) poly(ctx, [P(x, y + 1, h), P(x + 1, y + 1, h), P(x + 1, y + 1, below), P(x, y + 1, below)], shade(fc, -0.4));
      if (!Number.isNaN(right) && right < h) poly(ctx, [P(x + 1, y, h), P(x + 1, y + 1, h), P(x + 1, y + 1, right), P(x + 1, y, right)], shade(fc, -0.55));
    }
  }
}

// Ícono de un furni (tienda / inventario)
export function drawFurniIcon(canvas, def, color, size = 64) {
  const ctx = canvas.getContext('2d');
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  canvas.width = size * dpr; canvas.height = size * dpr;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const item = { type: def.id, x: 0, y: 0, z: 0, rot: def.rots?.[0] ?? 0, state: def.interact === 'dice' ? 6 : def.states > 1 ? 1 : 0, color: color || def.colors?.[0] || null, extra: {} };
  try {
    if (def.kind === 'wall') {
      const b = wallBounds(def);
      const k = Math.min((size - 8) / b.w, (size - 8) / b.h, 1.4);
      ctx.setTransform(dpr * k, 0, 0, dpr * k, dpr * (size / 2 - (b.x + b.w / 2) * k), dpr * (size / 2 - (b.y + b.h / 2) * k));
      drawWallItem(ctx, def, { ...item, rot: 4 }, { t: 0 });
    } else {
      const b = furniBounds(def, item.rot);
      const k = Math.min((size - 6) / b.w, (size - 6) / b.h, 1.2);
      ctx.setTransform(dpr * k, 0, 0, dpr * k, dpr * (size / 2 - (b.x + b.w / 2) * k), dpr * (size / 2 - (b.y + b.h / 2) * k));
      drawFurni(ctx, def, item, { t: 0 });
    }
  } catch { /* dibujo provisional */ }
}
