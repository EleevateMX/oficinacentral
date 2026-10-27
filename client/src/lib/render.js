// Dibujo del mapa en canvas, estilo pixel-art, sin imágenes externas.
import { TILE } from '@shared/map.js';
import { CATALOG, objSize } from '@shared/catalog.js';
import { getSheet, drawSprite, FRAME_W, FRAME_H } from './sprites.js';

const T = TILE;

// Colores de marca de la oficina (los fija el mapa según el tema; ver themes.js → mapBrand)
let BRAND = { name: 'NUVORA', primary: '#157A6E', secondary: '#FF8A3D', dark: '#0A2B2C', light: '#F3F4EE', walls: null };
export function setRenderBrand(b) { BRAND = { ...BRAND, ...b }; }

const hash = (x, y, s = 0) => {
  let h = (x * 374761393 + y * 668265263 + s * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
};

function shade(hex, amt) {
  const n = parseInt(hex.slice(1), 16);
  const c = (v) => Math.max(0, Math.min(255, Math.round(v + amt * 255)));
  const r = c((n >> 16) & 255), g = c((n >> 8) & 255), b = c(n & 255);
  return `#${((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1)}`;
}

const R = (ctx, c, x, y, w, h) => { ctx.fillStyle = c; ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h)); };
function RR(ctx, c, x, y, w, h, r) {
  ctx.fillStyle = c;
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
  ctx.fill();
}
function circle(ctx, c, x, y, r) {
  ctx.fillStyle = c;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
}

// ---------------- Suelos ----------------
const FLOORS = {
  grass(ctx, x, y, i, j) {
    R(ctx, '#c4e5b8', x, y, T, T);
    if (hash(i, j) > 0.7) { R(ctx, '#afd8a1', x + 6 + hash(i, j, 1) * 16, y + 8 + hash(i, j, 2) * 14, 2, 4); R(ctx, '#afd8a1', x + 9 + hash(i, j, 1) * 16, y + 10 + hash(i, j, 2) * 14, 2, 3); }
  },
  grass2(ctx, x, y, i, j) {
    R(ctx, '#a9d99b', x, y, T, T);
    if (hash(i, j) > 0.6) R(ctx, '#96cc87', x + hash(i, j, 3) * 26, y + hash(i, j, 4) * 26, 3, 3);
  },
  wood(ctx, x, y, i, j) { planks(ctx, x, y, i, j, '#f3dec3', '#e7cdac'); },
  wood2(ctx, x, y, i, j) { planks(ctx, x, y, i, j, '#c99c72', '#b78a61'); },
  carpet(ctx, x, y, i, j) {
    R(ctx, '#8f979f', x, y, T, T);
    if ((i + j) % 2 === 0) R(ctx, '#899199', x, y, T, T);
    R(ctx, '#959da5', x + 2, y + 2, 2, 2);
  },
  purple(ctx, x, y, i, j) { pattern(ctx, x, y, i, j, '#7d7fc6', '#8a8cd1'); },
  lilac(ctx, x, y, i, j) { pattern(ctx, x, y, i, j, '#c592d3', '#cf9fdc'); },
  rose(ctx, x, y, i, j) { pattern(ctx, x, y, i, j, '#ec9b91', '#f3aaa0'); },
  mint(ctx, x, y, i, j) { pattern(ctx, x, y, i, j, '#93d8bd', '#a3e1c8'); },
  rug(ctx, x, y) {
    R(ctx, '#9fd4ec', x, y, T, T);
    ctx.strokeStyle = '#87c4e0';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x + 16, y); ctx.lineTo(x + 32, y + 16); ctx.lineTo(x + 16, y + 32); ctx.lineTo(x, y + 16); ctx.closePath();
    ctx.stroke();
  },
  sand(ctx, x, y) { R(ctx, '#f3d8b6', x, y, T, T); R(ctx, '#ecd0ab', x, y + 30, T, 2); },
  lavender(ctx, x, y, i, j) { planks(ctx, x, y, i, j, '#f1dcc6', '#e5ceb4'); },
  tile(ctx, x, y) { R(ctx, '#eeede8', x, y, T, T); R(ctx, '#deddd5', x, y, T, 1); R(ctx, '#deddd5', x, y, 1, T); },
  kitchen(ctx, x, y, i, j) {
    for (let a = 0; a < 2; a++) for (let b = 0; b < 2; b++) R(ctx, (a + b + i + j) % 2 ? '#e2e2e2' : '#f7f7f7', x + a * 16, y + b * 16, 16, 16);
  },
  pattern(ctx, x, y, i, j) {
    R(ctx, '#e9eef7', x, y, T, T);
    ctx.strokeStyle = '#6f97d4';
    ctx.lineWidth = 3;
    ctx.beginPath();
    const o = hash(i, j) * 8;
    ctx.moveTo(x + 2, y + 10 + o); ctx.bezierCurveTo(x + 10, y + o, x + 20, y + 24, x + 30, y + 12 + o / 2);
    ctx.stroke();
  },
  water(ctx, x, y, i, j) {
    R(ctx, '#5bb3d6', x, y, T, T);
    if (hash(i, j) > 0.5) R(ctx, '#8fd0ea', x + 6 + hash(i, j, 5) * 14, y + 10 + hash(i, j, 6) * 12, 8, 2);
    if (hash(i, j, 9) > 0.85) { circle(ctx, '#f28c38', x + 16, y + 16, 3); R(ctx, '#f28c38', x + 10, y + 15, 4, 2); }
  },
  blue(ctx, x, y, i, j) {
    R(ctx, '#8c9fd6', x, y, T, T);
    if ((i + j) % 2 === 0) R(ctx, '#879ad1', x, y, T, T);
    R(ctx, '#97a9dc', x + 3 + hash(i, j) * 20, y + 4 + hash(i, j, 1) * 20, 2, 2);
  },
  green(ctx, x, y, i, j) { pattern(ctx, x, y, i, j, '#9fcf95', '#abd8a1'); },
  terra(ctx, x, y, i, j) { pattern(ctx, x, y, i, j, '#e3a27f', '#eab08f'); },
  slate(ctx, x, y, i, j) {
    R(ctx, '#4b5160', x, y, T, T);
    if ((i + j) % 2 === 0) R(ctx, '#474d5b', x, y, T, T);
    R(ctx, '#545b6b', x, y, T, 1);
  },
  concrete(ctx, x, y, i, j) {
    R(ctx, '#cfd2d4', x, y, T, T);
    if (hash(i, j) > 0.5) R(ctx, '#c7cacc', x + hash(i, j, 2) * 20, y + hash(i, j, 3) * 20, 10, 6);
    if (i % 4 === 0) R(ctx, '#bfc2c5', x, y, 1, T);
    if (j % 4 === 0) R(ctx, '#bfc2c5', x, y, T, 1);
  },
  hex(ctx, x, y, i, j) {
    R(ctx, '#181818', x, y, T, T);
    ctx.strokeStyle = (i * 7 + j * 3) % 11 === 0 ? 'rgba(254,51,119,.55)' : '#262626';
    ctx.lineWidth = 1.5;
    const cx = x + 16 + (j % 2 ? 8 : -8), cy = y + 16;
    ctx.beginPath();
    for (let k = 0; k < 6; k++) { const a = Math.PI / 3 * k; ctx[k ? 'lineTo' : 'moveTo'](cx + 9 * Math.cos(a), cy + 9 * Math.sin(a)); }
    ctx.closePath();
    ctx.stroke();
  },
  path(ctx, x, y, i, j) {
    R(ctx, '#ddd2bf', x, y, T, T);
    RR(ctx, '#cfc2ab', x + 3 + hash(i, j) * 6, y + 4, 12, 9, 3);
    RR(ctx, '#cfc2ab', x + 14, y + 17 + hash(i, j, 2) * 4, 13, 9, 3);
  },
};

function planks(ctx, x, y, i, j, base, line) {
  R(ctx, base, x, y, T, T);
  for (let k = 0; k < 4; k++) {
    R(ctx, line, x, y + k * 8 + 7, T, 1);
    const seam = Math.floor(hash(i, j * 4 + k) * 4) * 8;
    R(ctx, line, x + seam, y + k * 8, 1, 8);
  }
}

function pattern(ctx, x, y, i, j, base, alt) {
  R(ctx, base, x, y, T, T);
  R(ctx, alt, x + 4, y + 4, 8, 8);
  R(ctx, alt, x + 20, y + 20, 8, 8);
  R(ctx, shade(base, -0.04), x + 20, y + 4, 8, 8);
  R(ctx, shade(base, -0.04), x + 4, y + 20, 8, 8);
}

function drawWall(ctx, f, i, j) {
  const x = i * T, y = j * T;
  const below = j + 1 < f.H ? f.walls[j + 1][i] === true : false;
  const w = BRAND.walls;
  if (below) {
    R(ctx, w ? w.cap : '#46515d', x, y, T, T);
    R(ctx, w ? shade(w.cap, -0.04) : '#3d4752', x, y, T, 2);
  } else {
    R(ctx, w ? w.face : '#66727f', x, y, T, T);
    R(ctx, w ? w.top : '#7c8894', x, y, T, 3);
    R(ctx, w ? w.base : '#56616d', x, y + T - 4, T, 4);
    // Franja de color de la marca en los muros que dan a una sala
    if (w && f.walls[j - 1]?.[i] === true) R(ctx, w.stripe, x, y + T - 7, T, 2);
  }
}

// Borde de cada alfombra de área
const RUG_EDGE = {
  carpet: '#79818a', purple: '#6668b3', lilac: '#b07fc0', rose: '#d9867c', rug: '#78b8d6', mint: '#7cc4a8',
  sand: '#e2c49f', lavender: '#d8c0a6', tile: '#d3d2ca', wood2: '#a8805a', blue: '#7487c4', green: '#86bd7b',
  terra: '#cf8c69', slate: '#3a3f4b', concrete: '#b5b8bb', hex: '#FE3377', kitchen: '#cfcfcf', pattern: '#9db6e0',
};

function areaPath(ctx, a) {
  const pad = 0.12 * T;
  const x = a.x * T + pad, y = a.y * T + pad, w = a.w * T - pad * 2, h = a.h * T - pad * 2;
  ctx.beginPath();
  if (a.shape === 'round') ctx.ellipse(x + w / 2, y + h / 2, w / 2, h / 2, 0, 0, Math.PI * 2);
  else if (a.shape === 'square') ctx.rect(x, y, w, h);
  else ctx.roundRect(x, y, w, h, Math.min(T * 1.4, w / 3, h / 3));
}

function drawAreaRug(ctx, f, a) {
  const paint = FLOORS[a.color];
  if (!paint) return;
  ctx.save();
  areaPath(ctx, a);
  ctx.clip();
  for (let j = a.y; j < a.y + a.h; j++) for (let i = a.x; i < a.x + a.w; i++) {
    if (j >= 0 && i >= 0 && j < f.H && i < f.W && f.walls[j][i] !== true) paint(ctx, i * T, j * T, i, j);
  }
  ctx.restore();
  ctx.save();
  areaPath(ctx, a);
  ctx.strokeStyle = RUG_EDGE[a.color] || 'rgba(0,0,0,.18)';
  ctx.lineWidth = 3;
  ctx.stroke();
  ctx.restore();
}

// Formas curvas (estanques, caminos, jardines) dibujadas sobre las casillas
const DECAL_EDGE = { water: '#3f97bd', path: '#c9bba3', grass2: '#97c98a' };
function drawDecal(ctx, f, d) {
  const paint = FLOORS[d.t];
  if (!paint) return;
  if (d.rect) {
    const [x, y, w, h] = d.rect;
    ctx.save();
    ctx.beginPath(); ctx.roundRect(x * T, y * T, w * T, h * T, T * 0.4); ctx.clip();
    for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) paint(ctx, i * T, j * T, i, j);
    ctx.restore();
    return;
  }
  // Las casillas marcadas que quedan fuera de la curva se repintan con el suelo de alrededor
  const under = FLOORS[d.under];
  ctx.save();
  ctx.beginPath();
  ctx.ellipse(d.cx * T, d.cy * T, d.rx * T + T * 1.5, d.ry * T + T * 1.5, 0, 0, Math.PI * 2);
  ctx.ellipse(d.cx * T, d.cy * T, d.rx * T, d.ry * T, 0, 0, Math.PI * 2);
  ctx.clip('evenodd');
  if (under) for (const [i, j] of d.cells || []) under(ctx, i * T, j * T, i, j);
  ctx.restore();
  ctx.save();
  ctx.beginPath();
  ctx.ellipse(d.cx * T, d.cy * T, d.rx * T, d.ry * T, 0, 0, Math.PI * 2);
  ctx.clip();
  for (let j = Math.floor(d.cy - d.ry); j <= Math.ceil(d.cy + d.ry); j++) for (let i = Math.floor(d.cx - d.rx); i <= Math.ceil(d.cx + d.rx); i++) {
    if (j >= 0 && i >= 0 && j < f.H && i < f.W) paint(ctx, i * T, j * T, i, j);
  }
  ctx.restore();
  ctx.beginPath();
  ctx.ellipse(d.cx * T, d.cy * T, d.rx * T, d.ry * T, 0, 0, Math.PI * 2);
  ctx.strokeStyle = DECAL_EDGE[d.t] || 'rgba(0,0,0,.15)';
  ctx.lineWidth = d.t === 'water' ? 4 : 2;
  ctx.stroke();
}

// Sombra suave que dejan los muros sobre el suelo
function drawWallShadows(ctx, f) {
  for (let j = 1; j < f.H; j++) for (let i = 0; i < f.W; i++) {
    if (f.walls[j][i]) continue;
    const x = i * T, y = j * T;
    if (f.walls[j - 1][i] === true) {
      const g = ctx.createLinearGradient(0, y, 0, y + 10);
      g.addColorStop(0, 'rgba(20,24,30,.28)'); g.addColorStop(1, 'rgba(20,24,30,0)');
      ctx.fillStyle = g; ctx.fillRect(x, y, T, 10);
    }
    if (i > 0 && f.walls[j][i - 1] === true) {
      const g = ctx.createLinearGradient(x, 0, x + 6, 0);
      g.addColorStop(0, 'rgba(20,24,30,.18)'); g.addColorStop(1, 'rgba(20,24,30,0)');
      ctx.fillStyle = g; ctx.fillRect(x, y, 6, T);
    }
  }
}

// Mampara de cristal
function drawGlass(ctx, f, i, j) {
  const x = i * T, y = j * T;
  const isW = (a, b) => !!f.walls[b]?.[a] && f.walls[b][a] !== 'water';
  const horizontal = isW(i - 1, j) || isW(i + 1, j) || !(isW(i, j - 1) || isW(i, j + 1));
  if (horizontal) {
    R(ctx, 'rgba(20,24,30,.12)', x, y + 22, T, 5);
    R(ctx, 'rgba(178,222,245,.55)', x, y + 8, T, 14);
    R(ctx, 'rgba(255,255,255,.75)', x + 4, y + 10, 10, 2);
    R(ctx, '#5f6f7d', x, y + 6, T, 3);
    R(ctx, '#4d5b67', x, y + 21, T, 2);
    if (!isW(i - 1, j)) R(ctx, '#4d5b67', x, y + 6, 3, 17);
    if (!isW(i + 1, j)) R(ctx, '#4d5b67', x + T - 3, y + 6, 3, 17);
  } else {
    R(ctx, 'rgba(20,24,30,.10)', x + 20, y, 4, T);
    R(ctx, 'rgba(178,222,245,.55)', x + 11, y, 9, T);
    R(ctx, 'rgba(255,255,255,.7)', x + 13, y + 4, 2, 10);
    R(ctx, '#5f6f7d', x + 10, y, 2, T);
    R(ctx, '#4d5b67', x + 19, y, 2, T);
    if (!isW(i, j + 1)) R(ctx, '#4d5b67', x + 10, y + T - 3, 11, 3);
  }
}

export function drawFloorLayer(ctx, f) {
  for (let j = 0; j < f.H; j++) {
    for (let i = 0; i < f.W; i++) {
      const w = f.walls[j][i];
      if (w === true) continue;
      const t = w === 'water' ? 'water' : f.floor[j][i];
      (FLOORS[t] || FLOORS.wood)(ctx, i * T, j * T, i, j);
    }
  }
  for (const d of f.decals || []) drawDecal(ctx, f, d);
  for (const a of f.areas || []) if (a.color && a.color !== 'none') drawAreaRug(ctx, f, a);
  drawWallShadows(ctx, f);
  for (let j = 0; j < f.H; j++) for (let i = 0; i < f.W; i++) {
    if (f.walls[j][i] === true) drawWall(ctx, f, i, j);
    else if (f.walls[j][i] === 'glass') drawGlass(ctx, f, i, j);
  }
}

// ---------------- Objetos ----------------
const D = {};

D.desk = (ctx, x, y, w, h, o, c) => {
  const col = o.color || c.color;
  R(ctx, 'rgba(0,0,0,.12)', x + 2, y + h - 2, w - 2, 5);
  R(ctx, shade(col, -0.18), x, y + 4, w, h - 4);
  R(ctx, col, x, y, w, h - 8);
  R(ctx, shade(col, 0.08), x, y, w, 3);
  R(ctx, shade(col, -0.3), x + 3, y + h - 4, 3, 4);
  R(ctx, shade(col, -0.3), x + w - 6, y + h - 4, 3, 4);
};
D.standingDesk = D.desk;
D.cubicle = (ctx, x, y, w, h, o, c) => {
  const col = o.color || c.color;
  R(ctx, '#e47b70', x, y - 10, w, 12);
  R(ctx, '#f39a8f', x + 2, y - 8, w - 4, 6);
  D.desk(ctx, x, y + 2, w, h - 2, { color: col }, c);
  R(ctx, '#e47b70', x, y - 10, 3, h + 10);
  R(ctx, '#e47b70', x + w - 3, y - 10, 3, h + 10);
};
// Sillas vistas desde arriba: base de 5 ruedas, asiento acolchado, respaldo y
// descansabrazos. Se dibujan "mirando hacia arriba" (respaldo abajo) y se giran.
function withRot(ctx, x, y, w, h, r, fn) {
  ctx.save();
  ctx.translate(x + w / 2, y + h / 2);
  ctx.rotate(((r || 0) * Math.PI) / 2);
  fn();
  ctx.restore();
}
function chairBase(ctx, s = 1) {
  ctx.fillStyle = 'rgba(0,0,0,.16)';
  ctx.beginPath(); ctx.ellipse(1, 3, 13 * s, 10 * s, 0, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = '#3b3f47'; ctx.lineWidth = 2.2; ctx.lineCap = 'round';
  for (let k = 0; k < 5; k++) {
    const a = -Math.PI / 2 + (k * 2 * Math.PI) / 5;
    const ex = Math.cos(a) * 12 * s, ey = Math.sin(a) * 12 * s;
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(ex, ey); ctx.stroke();
    circle(ctx, '#1f2228', ex, ey, 2.1 * s);
  }
}
function drawChair(ctx, col, { back = 6, arms = true, tall = false, tufts = false, accent = null } = {}) {
  chairBase(ctx);
  // asiento
  RR(ctx, shade(col, -0.22), -10, -9, 20, 18, 6);
  RR(ctx, col, -9, -10, 18, 16, 6);
  const g = ctx.createLinearGradient(0, -10, 0, 6);
  g.addColorStop(0, 'rgba(255,255,255,.28)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g; ctx.beginPath(); ctx.roundRect(-8, -9, 16, 12, 5); ctx.fill();
  if (tufts) for (const [tx, ty] of [[-4, -5], [4, -5], [-4, 1], [4, 1]]) circle(ctx, shade(col, -0.25), tx, ty, 1.1);
  // descansabrazos
  if (arms) {
    RR(ctx, shade(col, -0.35), -13, -6, 4, 12, 2);
    RR(ctx, shade(col, -0.35), 9, -6, 4, 12, 2);
  }
  // respaldo (curvo, del lado de abajo)
  const by = tall ? 3 : 5;
  RR(ctx, shade(col, -0.3), -12, by, 24, back + 3, 5);
  RR(ctx, shade(col, -0.1), -11, by - 1, 22, back, 5);
  R(ctx, 'rgba(255,255,255,.22)', -8, by, 16, 1.5);
  if (accent) { R(ctx, accent, -3, by - 1, 2, back); R(ctx, accent, 1, by - 1, 2, back); }
  if (tall) RR(ctx, shade(col, -0.45), -6, by + back + 1, 12, 4, 2); // cabecera
}
// Mamparas de cubículo: panel detrás del escritorio y laterales
D.cubicleWalls = (ctx, x, y, w, h, o, c) => {
  const col = o.color || c.color;
  const edge = shade(col, -0.28);
  const top = shade(col, 0.18);
  // panel trasero (se ve su canto superior y su cara)
  R(ctx, 'rgba(0,0,0,.14)', x - 1, y + 2, w + 2, 4);
  R(ctx, edge, x - 2, y - 12, w + 4, 14);
  R(ctx, col, x - 1, y - 11, w + 2, 11);
  R(ctx, top, x - 2, y - 12, w + 4, 3);
  for (let k = 8; k < w - 4; k += 12) R(ctx, shade(col, -0.08), x + k, y - 8, 1, 6);
  // laterales
  for (const sx of [x - 2, x + w - 2]) {
    R(ctx, edge, sx, y - 12, 4, h - 4);
    R(ctx, top, sx, y - 12, 4, 2);
    R(ctx, 'rgba(0,0,0,.12)', sx + 4, y - 6, 2, h - 10);
  }
};
D.chair = (ctx, x, y, w, h, o, c) => {
  withRot(ctx, x, y, w, h, o.rot, () => drawChair(ctx, o.color || c.color, { back: 6 }));
};
D.gamingChair = (ctx, x, y, w, h, o, c) => {
  withRot(ctx, x, y, w, h, o.rot, () => drawChair(ctx, o.color || c.color, { back: 8, tall: true, accent: '#1d1d22' }));
};
D.beanBag = (ctx, x, y, w, h, o, c) => {
  const col = o.color || c.color;
  circle(ctx, 'rgba(0,0,0,.12)', x + 16, y + 22, 12);
  circle(ctx, col, x + 16, y + 17, 12);
  circle(ctx, shade(col, 0.15), x + 13, y + 13, 6);
};
D.sofa = (ctx, x, y, w, h, o, c) => {
  const col = o.color || c.color;
  const up = (o.rot || 0) === 2;
  R(ctx, 'rgba(0,0,0,.1)', x + 2, y + h - 3, w - 4, 4);
  RR(ctx, shade(col, -0.12), x, y + (up ? 14 : 2), w, h - 14, 4);
  RR(ctx, col, x + 3, y + (up ? 4 : 10), w - 6, h - 12, 4);
  const n = Math.max(1, Math.round(w / T));
  for (let k = 1; k < n; k++) R(ctx, shade(col, -0.08), x + (k * w) / n, y + (up ? 6 : 12), 1, h - 16);
  RR(ctx, shade(col, -0.2), x, y + 4, 5, h - 8, 2);
  RR(ctx, shade(col, -0.2), x + w - 5, y + 4, 5, h - 8, 2);
};
D.sofaSmall = D.sofa;
D.table = (ctx, x, y, w, h, o, c) => {
  const col = o.color || c.color;
  R(ctx, 'rgba(0,0,0,.12)', x + 3, y + 6, w - 2, h - 2);
  RR(ctx, shade(col, -0.2), x, y + 4, w, h - 4, 3);
  RR(ctx, col, x, y, w, h - 6, 3);
  R(ctx, shade(col, 0.1), x + 3, y + 3, w - 6, 2);
};
D.meetingTable = (ctx, x, y, w, h, o, c) => {
  D.table(ctx, x, y, w, h, o, c);
  for (let k = 0; k < Math.floor(w / T); k++) {
    R(ctx, '#c9ced6', x + 10 + k * T, y + 14, 12, 8);
    R(ctx, '#6fa8dc', x + 12 + k * T, y + 16, 8, 4);
  }
};
D.confTable = D.table;
D.roundTable = (ctx, x, y, w, h, o, c) => {
  const col = o.color || c.color;
  ctx.fillStyle = 'rgba(0,0,0,.12)';
  ctx.beginPath(); ctx.ellipse(x + w / 2 + 2, y + h / 2 + 4, w / 2, h / 2 + 2, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = shade(col, -0.18);
  ctx.beginPath(); ctx.ellipse(x + w / 2, y + h / 2 + 3, w / 2, h / 2 + 2, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = col;
  ctx.beginPath(); ctx.ellipse(x + w / 2, y + h / 2, w / 2, h / 2 + 1, 0, 0, Math.PI * 2); ctx.fill();
};
D.bookshelf = (ctx, x, y, w, h) => {
  R(ctx, '#8a5a3c', x, y - 14, w, h + 14);
  R(ctx, '#f3f1ec', x + 3, y - 11, w - 6, h + 8);
  const cols = ['#e63946', '#3a86ff', '#2bb673', '#ffd23f', '#9b5de5', '#f4a261'];
  for (let row = 0; row < 2; row++) {
    for (let k = 0; k * 5 + 4 < w - 6; k++) {
      const hh = 8 + hash(x + k, y + row) * 5;
      R(ctx, cols[Math.floor(hash(k, row, x) * cols.length)], x + 4 + k * 5, y - 10 + row * 17 + (13 - hh), 4, hh);
    }
    R(ctx, '#8a5a3c', x + 3, y + 3 + row * 17 - 14, w - 6, 2);
  }
};
D.shelf = (ctx, x, y, w, h) => {
  R(ctx, '#56616d', x, y - 10, w, h + 10);
  for (let k = 0; k < 3; k++) R(ctx, ['#f4a261', '#8ecae6', '#e9edf2'][k], x + 4 + k * (w / 3), y - 6, w / 3 - 8, 10);
  R(ctx, '#3f4852', x, y + 8, w, 3);
  for (let k = 0; k < 3; k++) R(ctx, ['#2bb673', '#ffd23f', '#9b5de5'][k], x + 6 + k * (w / 3), y + 12, w / 3 - 10, 10);
};
D.cabinet = (ctx, x, y, w, h, o, c) => {
  const col = o.color || c.color;
  R(ctx, col, x + 4, y - 6, w - 8, h + 4);
  R(ctx, shade(col, -0.15), x + 6, y + 2, w - 12, 1);
  R(ctx, shade(col, -0.15), x + 6, y + 12, w - 12, 1);
  R(ctx, '#666', x + 14, y + 5, 4, 2); R(ctx, '#666', x + 14, y + 15, 4, 2);
};
D.noticeBoard = (ctx, x, y, w, h) => {
  R(ctx, 'rgba(0,0,0,.15)', x + 4, y + h - 2, w - 6, 4);
  R(ctx, '#7a4a2b', x + 2, y - 14, w - 4, h + 8);
  R(ctx, '#c99c72', x + 4, y - 12, w - 8, h + 4);
  const notes = [['#fff3a8', 8, -10], ['#ffc9de', 26, -8], ['#c9e4ff', 46, -11], ['#c9f2d4', 64, -7], ['#fff3a8', 16, 4], ['#ffffff', 52, 3]];
  for (const [c, dx, dy] of notes) if (dx + 14 < w - 4) { R(ctx, c, x + dx, y + dy, 13, 11); circle(ctx, '#e63946', x + dx + 6.5, y + dy + 1.5, 1.6); }
  R(ctx, '#5a3820', x + 6, y + h - 6, 2, 8); R(ctx, '#5a3820', x + w - 8, y + h - 6, 2, 8);
};
D.whiteboard = (ctx, x, y, w, h) => {
  R(ctx, '#9aa3ad', x + 2, y - 14, w - 4, h + 6);
  R(ctx, '#ffffff', x + 4, y - 12, w - 8, h + 2);
  R(ctx, '#3a86ff', x + 8, y - 7, w * 0.3, 2);
  R(ctx, '#e63946', x + 8, y - 2, w * 0.45, 2);
  R(ctx, '#2bb673', x + 8, y + 3, w * 0.25, 2);
  R(ctx, '#ffd23f', x + w - 18, y - 8, 8, 8);
  R(ctx, '#666', x + 6, y + h - 6, 2, 8); R(ctx, '#666', x + w - 8, y + h - 6, 2, 8);
};
D.tv = (ctx, x, y, w, h) => {
  R(ctx, '#1f232b', x + 2, y - 10, w - 4, h + 2);
  R(ctx, '#3d4b63', x + 4, y - 8, w - 8, h - 2);
  R(ctx, '#5c7396', x + 6, y - 6, (w - 12) / 2, 3);
};
D.easel = (ctx, x, y) => {
  R(ctx, '#7a4a2b', x + 8, y + 10, 2, 20); R(ctx, '#7a4a2b', x + 22, y + 10, 2, 20);
  R(ctx, '#ffffff', x + 5, y - 4, 22, 18);
  R(ctx, '#2bb673', x + 9, y + 6, 4, 6); R(ctx, '#3a86ff', x + 15, y + 2, 4, 10); R(ctx, '#e63946', x + 21, y + 4, 3, 8);
};
D.fridge = (ctx, x, y) => {
  R(ctx, '#3b4350', x + 3, y - 14, 26, 44);
  R(ctx, '#4a5362', x + 5, y - 12, 22, 16); R(ctx, '#4a5362', x + 5, y + 6, 22, 22);
  R(ctx, '#aab', x + 23, y - 6, 2, 6); R(ctx, '#aab', x + 23, y + 10, 2, 8);
};
D.counter = (ctx, x, y, w, h) => {
  R(ctx, '#c7cdd4', x, y - 6, w, h + 4);
  R(ctx, '#e8ebef', x, y - 6, w, 8);
  for (let k = 0; k < w / T; k++) { R(ctx, '#b0b7bf', x + k * T + 2, y + 6, T - 4, 1); R(ctx, '#888', x + k * T + 14, y + 10, 4, 2); }
  R(ctx, '#8ecae6', x + 8, y - 4, 14, 5);
};
D.coffee = (ctx, x, y, w, h) => {
  R(ctx, '#7a4a2b', x, y + 4, w, h - 4);
  R(ctx, '#222831', x + 6, y - 10, 18, 22);
  R(ctx, '#e63946', x + 9, y - 6, 4, 4);
  R(ctx, '#fff', x + 34, y - 2, 8, 8); R(ctx, '#fff', x + 46, y - 2, 8, 8);
};
D.watercooler = (ctx, x, y) => {
  R(ctx, '#e9edf2', x + 8, y + 2, 16, 26);
  R(ctx, '#7fc8f8', x + 9, y - 14, 14, 16);
  R(ctx, '#a6dcff', x + 11, y - 12, 4, 10);
  R(ctx, '#3a86ff', x + 12, y + 8, 3, 3); R(ctx, '#e63946', x + 17, y + 8, 3, 3);
};
D.arcade = (ctx, x, y, w, h, o, c) => {
  const col = o.color || c.color;
  R(ctx, shade(col, -0.25), x + 3, y - 14, 26, 44);
  R(ctx, col, x + 5, y - 12, 22, 40);
  R(ctx, '#1b1f2a', x + 7, y - 9, 18, 14);
  R(ctx, '#4ee1a0', x + 9, y - 7, 6, 4); R(ctx, '#ff5d8f', x + 16, y - 3, 5, 4);
  R(ctx, '#222', x + 7, y + 8, 18, 6);
  circle(ctx, '#e63946', x + 11, y + 11, 2); circle(ctx, '#ffd23f', x + 20, y + 11, 2);
};
D.foosball = (ctx, x, y, w, h) => {
  R(ctx, '#3d2b1f', x, y, w, h);
  R(ctx, '#4caf50', x + 4, y + 4, w - 8, h - 8);
  R(ctx, '#fff', x + w / 2 - 1, y + 4, 2, h - 8);
  for (let k = 1; k < 6; k++) {
    R(ctx, '#aaa', x + (k * w) / 6, y - 2, 2, h + 4);
    R(ctx, k % 2 ? '#e63946' : '#3a86ff', x + (k * w) / 6 - 2, y + h / 2 - 6, 6, 4);
    R(ctx, k % 2 ? '#e63946' : '#3a86ff', x + (k * w) / 6 - 2, y + h / 2 + 4, 6, 4);
  }
};
D.drum = (ctx, x, y) => {
  circle(ctx, '#7a4a2b', x + 16, y + 18, 12);
  circle(ctx, '#f1d39a', x + 16, y + 14, 11);
  R(ctx, '#333', x + 4, y + 22, 24, 6);
};
D.plant = (ctx, x, y) => {
  R(ctx, '#b5651d', x + 10, y + 18, 12, 11);
  R(ctx, '#8b4513', x + 9, y + 17, 14, 3);
  circle(ctx, '#3a9d4a', x + 16, y + 10, 9);
  circle(ctx, '#4cb35c', x + 12, y + 7, 6);
  circle(ctx, '#2e8540', x + 20, y + 13, 5);
};
D.tallPlant = (ctx, x, y) => {
  R(ctx, '#6b8f71', x + 12, y + 20, 8, 10);
  for (let k = 0; k < 4; k++) circle(ctx, k % 2 ? '#2e8540' : '#3a9d4a', x + 16 + (k % 2 ? 4 : -4), y + 4 + k * 5, 6);
};
D.tree2 = (ctx, x, y, w, h) => {
  circle(ctx, 'rgba(0,0,0,.12)', x + w / 2, y + h - 8, 18);
  R(ctx, '#ffffff', x + w / 2 - 8, y + h - 18, 16, 14);
  for (let k = 0; k < 9; k++) circle(ctx, k % 3 ? '#f8c8d8' : '#f39cbc', x + 10 + hash(k, 1) * (w - 20), y + 6 + hash(k, 2) * (h - 26), 7);
  R(ctx, '#6b4423', x + w / 2 - 2, y + h - 26, 4, 10);
};
D.hedge = (ctx, x, y, w, h) => {
  RR(ctx, '#3f9447', x, y + 4, w, h - 4, 6);
  circle(ctx, '#4fae57', x + 8, y + 10, 7);
  circle(ctx, '#4fae57', x + 22, y + 12, 7);
  circle(ctx, '#62c46a', x + 14, y + 6, 5);
};
D.flowers = (ctx, x, y) => {
  for (let k = 0; k < 5; k++) {
    const fx = x + 6 + hash(x, y, k) * 20, fy = y + 6 + hash(y, x, k) * 18;
    R(ctx, '#3f9447', fx, fy + 3, 2, 6);
    circle(ctx, ['#ffd23f', '#f15bb5', '#ff7b00', '#ffffff'][k % 4], fx + 1, fy + 2, 3);
  }
};
D.bush = (ctx, x, y) => { circle(ctx, '#3f9447', x + 16, y + 18, 12); circle(ctx, '#56b55f', x + 12, y + 14, 6); };
D.tree = (ctx, x, y) => {
  R(ctx, '#7a4a2b', x + 14, y + 20, 5, 12);
  ctx.fillStyle = '#2f7d4a';
  for (let k = 0; k < 3; k++) {
    ctx.beginPath();
    ctx.moveTo(x + 16, y - 14 + k * 10);
    ctx.lineTo(x + 30 - k, y + 6 + k * 8);
    ctx.lineTo(x + 2 + k, y + 6 + k * 8);
    ctx.fill();
    ctx.fillStyle = k ? '#2f7d4a' : '#3a9254';
  }
};
D.bench = (ctx, x, y, w, h) => {
  R(ctx, '#7a4a2b', x + 2, y + 8, w - 4, h - 14);
  R(ctx, '#a0673f', x + 2, y + 6, w - 4, 4);
  R(ctx, '#a0673f', x + 2, y + 14, w - 4, 4);
  R(ctx, '#555', x + 4, y + h - 8, 3, 6); R(ctx, '#555', x + w - 7, y + h - 8, 3, 6);
};
D.fountain = (ctx, x, y, w, h) => {
  circle(ctx, '#b8bec6', x + w / 2, y + h / 2, w / 2 - 2);
  circle(ctx, '#5bb3d6', x + w / 2, y + h / 2, w / 2 - 7);
  circle(ctx, '#b8bec6', x + w / 2, y + h / 2, 6);
  circle(ctx, '#bfe7f7', x + w / 2, y + h / 2 - 6, 4);
};
D.bikeRack = (ctx, x, y, w) => {
  for (let k = 0; k < 3; k++) {
    const bx = x + 4 + k * (w / 3);
    ctx.strokeStyle = ['#3a86ff', '#e63946', '#2bb673'][k]; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(bx + 6, y + 20, 6, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.arc(bx + 20, y + 20, 6, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(bx + 6, y + 20); ctx.lineTo(bx + 12, y + 10); ctx.lineTo(bx + 20, y + 20); ctx.stroke();
  }
};
D.coatRack = (ctx, x, y) => {
  R(ctx, '#7a4a2b', x + 15, y - 8, 3, 34);
  R(ctx, '#7a4a2b', x + 10, y + 26, 13, 3);
  circle(ctx, '#e9c46a', x + 11, y - 4, 4); circle(ctx, '#f4f1de', x + 21, y - 2, 4);
};
D.robotArm = (ctx, x, y) => {
  R(ctx, '#555', x + 8, y + 22, 16, 8);
  ctx.strokeStyle = '#f4a300'; ctx.lineWidth = 6; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(x + 16, y + 22); ctx.lineTo(x + 10, y + 8); ctx.lineTo(x + 24, y); ctx.stroke();
  ctx.lineCap = 'butt';
  circle(ctx, '#333', x + 10, y + 8, 3);
  R(ctx, '#333', x + 24, y - 4, 6, 6);
};
D.serverRack = (ctx, x, y) => {
  R(ctx, '#2b2f3a', x + 4, y - 12, 24, 42);
  for (let k = 0; k < 5; k++) { R(ctx, '#3d4352', x + 6, y - 9 + k * 8, 20, 6); R(ctx, k % 2 ? '#4ee1a0' : '#3a86ff', x + 8, y - 7 + k * 8, 2, 2); }
};
D.painting = (ctx, x, y, w, h, o, c) => {
  const col = o.color || c.color;
  R(ctx, '#2b2f3a', x + 6, y + 4, w - 12, h - 8);
  R(ctx, '#fff', x + 8, y + 6, w - 16, h - 12);
  R(ctx, col, x + 10, y + 8, (w - 20) / 2, (h - 16) / 2);
  R(ctx, '#3a86ff', x + w / 2, y + h / 2, (w - 20) / 2, (h - 16) / 2);
  R(ctx, '#ffd23f', x + 10, y + h / 2, 8, (h - 16) / 2);
};
D.clock = (ctx, x, y) => {
  circle(ctx, '#e9edf2', x + 16, y + 14, 9);
  ctx.strokeStyle = '#333'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(x + 16, y + 14); ctx.lineTo(x + 16, y + 8); ctx.moveTo(x + 16, y + 14); ctx.lineTo(x + 20, y + 15); ctx.stroke();
};
D.window = (ctx, x, y, w, h) => {
  R(ctx, '#3f4852', x + 2, y + 2, w - 4, h + 20);
  for (let k = 0; k < 3; k++) for (let r = 0; r < 2; r++) R(ctx, r ? '#8fd8c8' : '#a9e5d7', x + 5 + (k * (w - 10)) / 3, y + 5 + r * 14, (w - 10) / 3 - 3, 11);
};
D.rug = (ctx, x, y, w, h, o, c) => {
  const col = o.color || c.color;
  RR(ctx, col, x + 2, y + 2, w - 4, h - 4, 4);
  ctx.strokeStyle = shade(col, -0.2); ctx.lineWidth = 2;
  ctx.strokeRect(x + 7, y + 7, w - 14, h - 14);
};

// Decoraciones (tamaño pequeño)
D.monitor = (ctx, x, y, w, h, o, c) => {
  const col = o.color || c.color;
  R(ctx, col, x, y, w, h - 6);
  R(ctx, '#5aa9e6', x + 2, y + 2, w - 4, h - 10);
  R(ctx, '#a0e7ff', x + 4, y + 4, (w - 8) / 2, 2);
  R(ctx, col, x + w / 2 - 2, y + h - 6, 4, 4);
  R(ctx, col, x + w / 2 - 6, y + h - 3, 12, 3);
};
D.dualMonitor = (ctx, x, y, w, h, o, c) => {
  D.monitor(ctx, x, y, w / 2 - 1, h, o, c);
  D.monitor(ctx, x + w / 2 + 1, y, w / 2 - 1, h, o, c);
};
D.imac = (ctx, x, y, w, h, o, c) => {
  const col = o.color || c.color;
  R(ctx, col, x, y, w, h - 8);
  R(ctx, '#3a86ff', x + 3, y + 3, w - 6, h - 16);
  R(ctx, '#7ad3ff', x + 5, y + 5, w / 3, 3);
  R(ctx, '#ff5d8f', x + w / 2, y + h - 18, 6, 3);
  R(ctx, shade(col, -0.2), x + w / 2 - 3, y + h - 8, 6, 5);
  R(ctx, shade(col, -0.2), x + w / 2 - 8, y + h - 3, 16, 3);
};
D.laptop = (ctx, x, y, w, h, o, c) => {
  const col = o.color || c.color;
  R(ctx, col, x, y, w, h - 4);
  R(ctx, '#2b2f3a', x + 2, y + 2, w - 4, h - 8);
  R(ctx, shade(col, -0.2), x - 2, y + h - 4, w + 4, 4);
};
D.keyboard = (ctx, x, y, w, h, o, c) => {
  const col = o.color || c.color;
  R(ctx, col, x, y, w, h);
  for (let k = 0; k < 5; k++) R(ctx, shade(col, 0.25), x + 2 + k * ((w - 4) / 5), y + 2, (w - 4) / 5 - 1, h - 4);
};
D.pcTower = (ctx, x, y, w, h, o, c) => {
  const col = o.color || c.color;
  R(ctx, col, x, y, w, h);
  R(ctx, '#ff5d8f', x + 3, y + 4, w - 6, 2);
  R(ctx, '#4ee1a0', x + 3, y + 8, 2, 2);
};
D.controller = (ctx, x, y, w, h, o, c) => { RR(ctx, o.color || c.color, x, y, w, h, 3); R(ctx, '#fff', x + 3, y + 3, 2, 2); R(ctx, '#fff', x + w - 5, y + 3, 2, 2); };
D.headphones = (ctx, x, y, w, h, o, c) => {
  const col = o.color || c.color;
  ctx.strokeStyle = '#222'; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.arc(x + w / 2, y + h / 2, w / 2 - 3, Math.PI, 0); ctx.stroke();
  R(ctx, col, x, y + h / 2 - 2, 5, 8); R(ctx, col, x + w - 5, y + h / 2 - 2, 5, 8);
};
D.speaker = (ctx, x, y, w, h, o, c) => { R(ctx, o.color || c.color, x, y, w, h); circle(ctx, '#666', x + w / 2, y + h / 2 + 2, 2.5); circle(ctx, '#666', x + w / 2, y + 4, 1.5); };
D.camera = (ctx, x, y, w, h) => {
  ctx.strokeStyle = '#333'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(x + w / 2, y + 8); ctx.lineTo(x + 2, y + h); ctx.moveTo(x + w / 2, y + 8); ctx.lineTo(x + w - 2, y + h); ctx.moveTo(x + w / 2, y + 8); ctx.lineTo(x + w / 2, y + h); ctx.stroke();
  R(ctx, '#2b2f3a', x + 2, y, w - 4, 9); circle(ctx, '#3a86ff', x + w / 2, y + 4, 2);
};
D.mug = (ctx, x, y, w, h, o, c) => { R(ctx, o.color || c.color, x + 1, y + 1, w - 3, h - 1); R(ctx, '#6b4423', x + 2, y + 2, w - 5, 2); R(ctx, o.color || c.color, x + w - 2, y + 3, 2, 3); };
D.can = (ctx, x, y, w, h, o, c) => { R(ctx, o.color || c.color, x + 1, y, w - 2, h); R(ctx, '#ccc', x + 1, y, w - 2, 2); };
D.burger = (ctx, x, y, w, h) => {
  RR(ctx, '#f4a261', x, y + 2, w, h / 2, 6);
  R(ctx, '#2bb673', x, y + h / 2, w, 2);
  R(ctx, '#7a3b1e', x, y + h / 2 + 2, w, 4);
  RR(ctx, '#e9a35e', x, y + h / 2 + 6, w, 4, 2);
};
D.fries = (ctx, x, y, w, h) => {
  for (let k = 0; k < 4; k++) R(ctx, '#ffd23f', x + 3 + k * 2.5, y + 1 + (k % 2) * 2, 2, 8);
  R(ctx, '#e63946', x + 2, y + 7, w - 4, h - 7);
};
D.pizza = (ctx, x, y, w, h) => { circle(ctx, '#f4a261', x + w / 2, y + h / 2, h / 2); circle(ctx, '#ffd23f', x + w / 2, y + h / 2, h / 2 - 2); circle(ctx, '#e63946', x + w / 2 - 3, y + h / 2 - 1, 1.5); circle(ctx, '#e63946', x + w / 2 + 3, y + h / 2 + 2, 1.5); };
D.cactus = (ctx, x, y, w, h) => {
  R(ctx, '#e9edf2', x + 2, y + h - 8, w - 4, 8);
  RR(ctx, '#2e8540', x + w / 2 - 4, y + 4, 8, h - 10, 4);
  RR(ctx, '#2e8540', x + 2, y + 8, 4, 6, 2);
  circle(ctx, '#f15bb5', x + w / 2, y + 4, 3);
};
D.smallPlant = (ctx, x, y, w, h) => { R(ctx, '#b5651d', x + 4, y + h - 7, w - 8, 7); circle(ctx, '#3a9d4a', x + w / 2, y + 6, 6); };
D.blossom = (ctx, x, y, w, h) => {
  R(ctx, '#3d2b1f', x + w / 2 - 5, y + h - 7, 10, 7);
  R(ctx, '#6b4423', x + w / 2 - 1, y + h / 2, 2, h / 2 - 6);
  for (let k = 0; k < 6; k++) circle(ctx, k % 2 ? '#f8a5c2' : '#f472a8', x + 5 + hash(k, 3) * (w - 10), y + 4 + hash(k, 7) * (h / 2), 4);
};
D.books = (ctx, x, y, w, h, o, c) => {
  const col = o.color || c.color;
  R(ctx, col, x, y + 4, w, h - 4);
  R(ctx, '#fff', x + 2, y + 6, w - 4, 2);
  R(ctx, '#ffd23f', x + w - 3, y, 2, h);
};
D.notebook = (ctx, x, y, w, h) => { R(ctx, '#fff', x, y, w, h); R(ctx, '#cfd6e0', x + 2, y + 4, w - 4, 1); R(ctx, '#cfd6e0', x + 2, y + 8, w - 4, 1); R(ctx, '#9b5de5', x + w - 3, y + 2, 2, h - 2); };
D.lamp = (ctx, x, y, w, h, o, c) => {
  R(ctx, '#333', x + w / 2 - 4, y + h - 3, 8, 3);
  R(ctx, '#333', x + w / 2 - 1, y + 8, 2, h - 10);
  ctx.fillStyle = o.color || c.color;
  ctx.beginPath(); ctx.moveTo(x + 2, y + 10); ctx.lineTo(x + w - 2, y + 10); ctx.lineTo(x + w - 5, y); ctx.lineTo(x + 5, y); ctx.fill();
};
D.photo = (ctx, x, y, w, h, o, c) => { R(ctx, '#333', x, y, w, h); R(ctx, o.color || c.color, x + 2, y + 2, w - 4, h - 4); circle(ctx, '#fff', x + w / 2, y + h / 2 - 1, 2.5); };
D.trophy = (ctx, x, y, w, h) => { RR(ctx, '#ffc300', x + 3, y, w - 6, h / 2, 3); R(ctx, '#ffc300', x + w / 2 - 1, y + h / 2, 2, 4); R(ctx, '#7a4a2b', x + 4, y + h - 4, w - 8, 4); };
D.duck = (ctx, x, y, w, h, o, c) => {
  const col = o.color || c.color;
  circle(ctx, col, x + w / 2, y + h - 6, 6);
  circle(ctx, col, x + w / 2 + 3, y + 5, 4);
  R(ctx, '#f77f00', x + w / 2 + 6, y + 5, 3, 2);
  R(ctx, '#111', x + w / 2 + 4, y + 3, 1.5, 1.5);
};
D.ball = (ctx, x, y, w, h) => { circle(ctx, '#fff', x + w / 2, y + h / 2, w / 2 - 1); circle(ctx, '#222', x + w / 2, y + h / 2, 2.5); circle(ctx, '#222', x + 3, y + 5, 1.5); circle(ctx, '#222', x + w - 4, y + h - 4, 1.5); };
D.figure = (ctx, x, y, w, h, o, c) => { circle(ctx, '#ffdbac', x + w / 2, y + 3, 3); R(ctx, o.color || c.color, x + 1, y + 6, w - 2, h - 9); R(ctx, '#333', x + 1, y + h - 3, w - 2, 3); };
D.flag = (ctx, x, y, w, h, o, c) => {
  R(ctx, '#555', x + 2, y, 2, h);
  ctx.fillStyle = o.color || c.color;
  ctx.beginPath(); ctx.moveTo(x + 4, y + 1); ctx.lineTo(x + w, y + 5); ctx.lineTo(x + 4, y + 9); ctx.fill();
};

// ----- Escritorios y sillas extra -----
D.gamingDesk = (ctx, x, y, w, h, o, c) => {
  const col = o.color || c.color;
  D.desk(ctx, x, y, w, h, { color: col }, c);
  R(ctx, '#FE3377', x + 2, y + h - 9, w - 4, 1);
  R(ctx, '#8B7BFF', x + 2, y + h - 8, w - 4, 1);
};
D.woodDesk = (ctx, x, y, w, h, o, c) => {
  D.desk(ctx, x, y, w, h, o, c);
  const col = o.color || c.color;
  for (let k = 6; k < w - 4; k += 9) R(ctx, shade(col, -0.1), x + k, y + 2, 4, 1);
};
D.glassDesk = (ctx, x, y, w, h, o, c) => {
  const col = o.color || c.color;
  ctx.globalAlpha = 0.75;
  R(ctx, col, x, y, w, h - 8);
  ctx.globalAlpha = 1;
  R(ctx, shade(col, 0.4), x, y, w, 2);
  R(ctx, '#9aa3ad', x + 3, y + h - 8, 2, 8); R(ctx, '#9aa3ad', x + w - 5, y + h - 8, 2, 8);
};
D.officeChair = (ctx, x, y, w, h, o, c) => {
  withRot(ctx, x, y, w, h, o.rot, () => drawChair(ctx, o.color || c.color, { back: 8, tufts: true }));
};
D.stool = (ctx, x, y, w, h, o, c) => {
  const col = o.color || c.color;
  R(ctx, shade(col, -0.3), x + 11, y + 16, 2, 12); R(ctx, shade(col, -0.3), x + 19, y + 16, 2, 12);
  circle(ctx, col, x + 16, y + 14, 8);
  circle(ctx, shade(col, 0.15), x + 14, y + 12, 3);
};

// ----- Escritorio -----
D.mousepad = (ctx, x, y, w, h, o, c) => { RR(ctx, o.color || c.color, x, y + 2, w, h - 2, 3); RR(ctx, '#e8e8ee', x + w - 9, y + 4, 6, 8, 3); };
D.stickyNotes = (ctx, x, y, w, h, o, c) => { const col = o.color || c.color; R(ctx, shade(col, -0.15), x + 4, y + 4, 11, 11); R(ctx, col, x + 1, y + 1, 11, 11); R(ctx, shade(col, -0.35), x + 3, y + 4, 7, 1); R(ctx, shade(col, -0.35), x + 3, y + 7, 5, 1); };
D.pencilCup = (ctx, x, y, w, h, o, c) => { R(ctx, '#e63946', x + 2, y, 1, 6); R(ctx, '#ffd23f', x + 4, y + 1, 1, 5); R(ctx, '#2bb673', x + 6, y, 1, 6); R(ctx, o.color || c.color, x + 1, y + 6, w - 2, h - 6); };
D.deskCalendar = (ctx, x, y, w, h, o, c) => { R(ctx, '#fff', x + 1, y + 3, w - 2, h - 3); R(ctx, o.color || c.color, x + 1, y + 3, w - 2, 4); R(ctx, '#333', x + 5, y + 9, 6, 4); };
D.tablet = (ctx, x, y, w, h, o, c) => { RR(ctx, o.color || c.color, x + 1, y + 1, w - 2, h - 2, 2); R(ctx, '#7ad3ff', x + 3, y + 3, w - 6, h - 6); R(ctx, '#FE3377', x + 5, y + 6, 4, 3); };
D.phone = (ctx, x, y, w, h, o, c) => { RR(ctx, o.color || c.color, x, y + 1, w, h - 2, 2); R(ctx, '#5aa9e6', x + 1, y + 3, w - 2, h - 7); };
D.globe = (ctx, x, y, w, h) => { R(ctx, '#7a4a2b', x + 3, y + h - 3, w - 6, 3); R(ctx, '#aaa', x + w / 2 - 1, y + 14, 2, h - 16); circle(ctx, '#3a86ff', x + w / 2, y + 8, 7); R(ctx, '#2bb673', x + w / 2 - 4, y + 5, 4, 3); R(ctx, '#2bb673', x + w / 2 + 1, y + 9, 3, 3); };
D.rubik = (ctx, x, y) => { const cs = ['#e63946', '#ffd23f', '#2bb673', '#3a86ff', '#fff', '#f4a261']; for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) R(ctx, cs[(i * 3 + j) % 6], x + i * 2.6, y + j * 2.6, 2.4, 2.4); };
D.plushie = (ctx, x, y, w, h, o, c) => { const col = o.color || c.color; circle(ctx, col, x + w / 2, y + 11, 6); circle(ctx, col, x + w / 2, y + 5, 5); circle(ctx, col, x + w / 2 - 4, y + 1, 2); circle(ctx, col, x + w / 2 + 4, y + 1, 2); R(ctx, '#222', x + w / 2 - 2, y + 4, 1, 1); R(ctx, '#222', x + w / 2 + 1, y + 4, 1, 1); };
D.vase = (ctx, x, y, w, h, o, c) => { RR(ctx, o.color || c.color, x + 4, y + 12, w - 8, h - 12, 3); R(ctx, '#3f9447', x + w / 2 - 1, y + 4, 1, 9); circle(ctx, '#ffd23f', x + w / 2 - 3, y + 4, 2.5); circle(ctx, '#f15bb5', x + w / 2 + 3, y + 6, 2.5); circle(ctx, '#fff', x + w / 2, y + 2, 2.5); };
D.succulent = (ctx, x, y, w, h) => { R(ctx, '#d0d4da', x + 3, y + 9, w - 6, h - 9); for (let k = 0; k < 5; k++) circle(ctx, k % 2 ? '#6fbf73' : '#4caf50', x + 4 + k * 2, y + 7 - (k % 2) * 2, 2.5); };

// ----- Gamer y stream -----
D.gamingPC = (ctx, x, y, w, h, o, c) => { const col = o.color || c.color; R(ctx, '#1d1d22', x, y, w, h); R(ctx, '#2f2f38', x + 2, y + 2, w - 4, h - 6); R(ctx, col, x + 3, y + 4, w - 6, 2); R(ctx, col, x + 3, y + 12, w - 6, 2); circle(ctx, col, x + w / 2, y + 22, 3); };
D.mic = (ctx, x, y, w, h, o, c) => { const col = o.color || c.color; R(ctx, '#555', x + w / 2 - 1, y + 12, 2, h - 14); R(ctx, '#555', x + 2, y + h - 3, w - 4, 3); RR(ctx, col, x + w / 2 - 4, y, 8, 13, 4); R(ctx, shade(col, 0.3), x + w / 2 - 2, y + 3, 4, 1); R(ctx, shade(col, 0.3), x + w / 2 - 2, y + 6, 4, 1); };
D.ringLight = (ctx, x, y, w, h) => { ctx.strokeStyle = '#fff8e0'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(x + w / 2, y + 9, 8, 0, Math.PI * 2); ctx.stroke(); R(ctx, '#555', x + w / 2 - 1, y + 17, 2, h - 18); };
D.streamDeck = (ctx, x, y, w, h) => { R(ctx, '#1d1d22', x, y, w, h); const cs = ['#FE3377', '#FFCC00', '#3DDC84', '#3a86ff']; for (let k = 0; k < 4; k++) R(ctx, cs[k], x + 2 + k * 3.5, y + 2, 2.5, 3); };
D.handheld = (ctx, x, y, w, h, o, c) => { RR(ctx, o.color || c.color, x, y, w, h, 3); R(ctx, '#1d1d22', x + 5, y + 1, w - 10, h - 2); };
D.ledStrip = (ctx, x, y, w, h, o, c) => { const col = o.color || c.color; ctx.fillStyle = col; ctx.globalAlpha = 0.35; ctx.fillRect(x, y - 2, w, h + 4); ctx.globalAlpha = 1; R(ctx, col, x, y + 2, w, 3); R(ctx, '#fff', x, y + 3, w, 1); };
D.neonSign = (ctx, x, y, w, h, o, c) => {
  const col = o.color || c.color;
  ctx.save(); ctx.shadowColor = col; ctx.shadowBlur = 8; ctx.strokeStyle = col; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(x + w / 2, y + h - 3); ctx.bezierCurveTo(x + 2, y + 6, x + w / 2 - 6, y - 2, x + w / 2, y + 5); ctx.bezierCurveTo(x + w / 2 + 6, y - 2, x + w - 2, y + 6, x + w / 2, y + h - 3); ctx.stroke(); ctx.restore();
};
D.carModel = (ctx, x, y, w, h, o, c) => { const col = o.color || c.color; RR(ctx, col, x, y + 5, w, 7, 3); RR(ctx, shade(col, -0.2), x + 5, y + 1, w - 11, 6, 2); R(ctx, '#a6dcff', x + 7, y + 2, w - 15, 3); circle(ctx, '#111', x + 5, y + 13, 2.5); circle(ctx, '#111', x + w - 5, y + 13, 2.5); };

// ----- Mascotas -----
D.cat = (ctx, x, y, w, h, o, c) => {
  const col = o.color || c.color;
  ctx.fillStyle = col; ctx.beginPath(); ctx.ellipse(x + w / 2 + 1, y + 11, 6, 4, 0, 0, Math.PI * 2); ctx.fill();
  circle(ctx, col, x + 4, y + 6, 4); R(ctx, col, x + 1, y + 1, 2, 3); R(ctx, col, x + 5, y + 1, 2, 3);
  R(ctx, '#222', x + 2, y + 5, 1, 1); R(ctx, '#222', x + 5, y + 5, 1, 1);
  R(ctx, col, x + w - 2, y + 4, 2, 7);
};
D.dog = (ctx, x, y, w, h, o, c) => {
  const col = o.color || c.color;
  ctx.fillStyle = col; ctx.beginPath(); ctx.ellipse(x + w / 2 + 2, y + 15, 8, 5, 0, 0, Math.PI * 2); ctx.fill();
  circle(ctx, col, x + 7, y + 8, 6); R(ctx, shade(col, -0.3), x + 1, y + 5, 3, 7); R(ctx, shade(col, -0.3), x + 10, y + 5, 3, 7);
  R(ctx, '#222', x + 5, y + 7, 1.5, 1.5); R(ctx, '#222', x + 8, y + 7, 1.5, 1.5); R(ctx, '#222', x + 6, y + 10, 2, 1.5);
  R(ctx, '#e63946', x + 5, y + 13, 5, 1.5);
};
D.fishbowl = (ctx, x, y, w, h) => { circle(ctx, '#bfe7f7', x + w / 2, y + h / 2 + 1, 7); R(ctx, '#e8f7fd', x + 3, y + 2, w - 6, 2); R(ctx, '#f77f00', x + w / 2 - 2, y + h / 2, 4, 2); R(ctx, '#f77f00', x + w / 2 + 2, y + h / 2 - 1, 2, 4); R(ctx, '#3f9447', x + 4, y + h - 4, 2, 3); };
D.bird = (ctx, x, y, w, h, o, c) => { const col = o.color || c.color; circle(ctx, col, x + 4, y + 10, 4); circle(ctx, col, x + 4, y + 5, 3); R(ctx, '#f77f00', x + 7, y + 5, 2, 1); R(ctx, '#222', x + 5, y + 4, 1, 1); R(ctx, '#7a4a2b', x, y + 14, 8, 1); };

// ----- Comida -----
D.donut = (ctx, x, y, w, h, o, c) => { circle(ctx, '#d9a066', x + w / 2, y + h / 2 + 1, 6); circle(ctx, o.color || c.color, x + w / 2, y + h / 2, 5); circle(ctx, '#7a4a2b', x + w / 2, y + h / 2, 1.5); };
D.boba = (ctx, x, y, w, h, o, c) => { R(ctx, o.color || c.color, x + 1, y + 4, w - 2, h - 4); R(ctx, '#2b1d14', x + 2, y + h - 5, w - 4, 3); R(ctx, '#e63946', x + w / 2, y, 1, 6); R(ctx, '#fff', x + 1, y + 4, w - 2, 1); };
D.tacos = (ctx, x, y, w, h) => { for (let k = 0; k < 3; k++) { ctx.fillStyle = '#f2c94c'; ctx.beginPath(); ctx.arc(x + 5 + k * 7, y + 12, 5, Math.PI, 0); ctx.fill(); R(ctx, '#3f9447', x + 1 + k * 7, y + 9, 8, 2); R(ctx, '#e63946', x + 3 + k * 7, y + 8, 3, 1); } };
D.cake = (ctx, x, y, w, h, o, c) => { R(ctx, '#7a4a2b', x + 2, y + 7, w - 4, 7); R(ctx, o.color || c.color, x + 2, y + 6, w - 4, 3); R(ctx, '#fff', x + 2, y + 6, w - 4, 1); R(ctx, '#ffd23f', x + w / 2 - 1, y + 1, 2, 5); R(ctx, '#FF8A3D', x + w / 2 - 1, y, 2, 2); };

// ----- GTAHUB -----
// Logo de la oficina como imagen (el de GTAHUB o el que suba el admin)
const logoCache = new Map();
function brandLogo() {
  const url = BRAND.logo;
  if (!url) return null;
  let im = logoCache.get(url);
  if (!im) { im = new Image(); im.src = url; logoCache.set(url, im); }
  return im.complete && im.naturalWidth ? im : null;
}
// Carga el logo antes de pintar la capa fija del mapa
export function preloadBrandLogo(url) {
  if (!url) return Promise.resolve(false);
  let im = logoCache.get(url);
  if (!im) { im = new Image(); im.src = url; logoCache.set(url, im); }
  if (im.complete && im.naturalWidth) return Promise.resolve(true);
  return new Promise((res) => { im.addEventListener('load', () => res(true), { once: true }); im.addEventListener('error', () => res(false), { once: true }); });
}
function drawLogo(ctx, cx, cy, size) {
  const im = brandLogo();
  if (!im) return false;
  const k = size / Math.max(im.naturalWidth, im.naturalHeight);
  const w = im.naturalWidth * k;
  const h = im.naturalHeight * k;
  ctx.save();
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(im, cx - w / 2, cy - h / 2, w, h);
  ctx.restore();
  return true;
}
function hexPath(ctx, cx, cy, r) {
  ctx.beginPath();
  for (let k = 0; k < 6; k++) { const a = Math.PI / 3 * k - Math.PI / 2; ctx[k ? 'lineTo' : 'moveTo'](cx + r * Math.cos(a), cy + r * Math.sin(a)); }
  ctx.closePath();
}
D.hexLamp = (ctx, x, y, w, h, o, c) => {
  const col = o.color || c.color;
  R(ctx, '#1d1d22', x + w / 2 - 5, y + h - 3, 10, 3);
  ctx.save(); ctx.shadowColor = col; ctx.shadowBlur = 10;
  ctx.strokeStyle = col; ctx.lineWidth = 2.5; hexPath(ctx, x + w / 2, y + 10, 9); ctx.stroke(); ctx.restore();
};
D.hexBadge = (ctx, x, y, w, h, o, c) => {
  const col = o.color || c.color;
  ctx.fillStyle = col; hexPath(ctx, x + w / 2, y + h / 2, 7.5); ctx.fill();
  ctx.fillStyle = '#141414'; hexPath(ctx, x + w / 2, y + h / 2, 5.5); ctx.fill();
  ctx.fillStyle = col; hexPath(ctx, x + w / 2, y + h / 2, 2.5); ctx.fill();
};
D.cubeLogo = (ctx, x, y, w, h, o, c) => {
  const col = o.color || c.color; const cx = x + w / 2; const cy = y + h / 2; const r = 7;
  if (drawLogo(ctx, cx, cy, 16)) return;
  ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.moveTo(cx, cy - r); ctx.lineTo(cx + r, cy - r / 2); ctx.lineTo(cx, cy); ctx.lineTo(cx - r, cy - r / 2); ctx.closePath(); ctx.fill();
  ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(cx - r, cy - r / 2); ctx.lineTo(cx, cy); ctx.lineTo(cx, cy + r); ctx.lineTo(cx - r, cy + r / 2); ctx.closePath(); ctx.fill();
  ctx.fillStyle = shade(col, -0.35); ctx.beginPath(); ctx.moveTo(cx + r, cy - r / 2); ctx.lineTo(cx, cy); ctx.lineTo(cx, cy + r); ctx.lineTo(cx + r, cy + r / 2); ctx.closePath(); ctx.fill();
};
D.hexNeon = (ctx, x, y, w, h, o, c) => {
  const col = o.color || c.color;
  ctx.save(); ctx.shadowColor = col; ctx.shadowBlur = 10; ctx.strokeStyle = col; ctx.lineWidth = 2;
  hexPath(ctx, x + w / 2 - 6, y + h / 2, 7); ctx.stroke(); hexPath(ctx, x + w / 2 + 6, y + h / 2, 7); ctx.stroke(); ctx.restore();
};

// ----- Piso -----
D.floorPlant = (ctx, x, y, w, h) => { R(ctx, '#3d2b1f', x + 9, y + 20, 14, 11); R(ctx, '#2b1d14', x + 8, y + 19, 16, 3); for (let k = 0; k < 7; k++) circle(ctx, k % 2 ? '#2e8540' : '#3a9d4a', x + 7 + hash(k, 4) * 18, y + 4 + hash(k, 9) * 14, 6); };
D.floorLamp = (ctx, x, y, w, h, o, c) => { R(ctx, '#333', x + w / 2 - 1, y + 10, 2, h - 12); R(ctx, '#333', x + 2, y + h - 3, w - 4, 3); ctx.fillStyle = o.color || c.color; ctx.beginPath(); ctx.moveTo(x + 1, y + 11); ctx.lineTo(x + w - 1, y + 11); ctx.lineTo(x + w - 4, y); ctx.lineTo(x + 4, y); ctx.fill(); };
D.miniFridge = (ctx, x, y, w, h, o, c) => { const col = o.color || c.color; RR(ctx, col, x + 1, y + 4, w - 2, h - 4, 2); R(ctx, shade(col, -0.15), x + 1, y + 14, w - 2, 1); R(ctx, '#888', x + w - 6, y + 8, 2, 4); R(ctx, '#888', x + w - 6, y + 17, 2, 6); };
D.guitar = (ctx, x, y, w, h, o, c) => { const col = o.color || c.color; R(ctx, '#3d2b1f', x + w / 2 - 1, y, 2, 16); R(ctx, '#3d2b1f', x + w / 2 - 2, y, 4, 3); circle(ctx, col, x + w / 2, y + 20, 6); circle(ctx, col, x + w / 2, y + 26, 7); circle(ctx, '#2b1d14', x + w / 2, y + 22, 2); };
D.roundRug = (ctx, x, y, w, h, o, c) => { const col = o.color || c.color; ctx.fillStyle = col; ctx.beginPath(); ctx.ellipse(x + w / 2, y + h / 2, w / 2 - 1, h / 2 - 3, 0, 0, Math.PI * 2); ctx.fill(); ctx.strokeStyle = shade(col, -0.18); ctx.lineWidth = 2; ctx.beginPath(); ctx.ellipse(x + w / 2, y + h / 2, w / 2 - 6, h / 2 - 7, 0, 0, Math.PI * 2); ctx.stroke(); };
D.petBed = (ctx, x, y, w, h, o, c) => { const col = o.color || c.color; ctx.fillStyle = shade(col, -0.2); ctx.beginPath(); ctx.ellipse(x + w / 2, y + h / 2 + 1, w / 2, h / 2, 0, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = shade(col, 0.3); ctx.beginPath(); ctx.ellipse(x + w / 2, y + h / 2 + 1, w / 2 - 4, h / 2 - 3, 0, 0, Math.PI * 2); ctx.fill(); };
D.trashCan = (ctx, x, y, w, h, o, c) => { const col = o.color || c.color; R(ctx, col, x + 3, y + 3, w - 6, h - 3); R(ctx, shade(col, 0.2), x + 2, y + 2, w - 4, 2); R(ctx, shade(col, -0.2), x + 6, y + 6, 1, h - 8); R(ctx, shade(col, -0.2), x + 10, y + 6, 1, h - 8); };
D.tallSpeaker = (ctx, x, y, w, h, o, c) => { R(ctx, o.color || c.color, x + 1, y, w - 2, h); circle(ctx, '#555', x + w / 2, y + 8, 4); circle(ctx, '#333', x + w / 2, y + 8, 2); circle(ctx, '#555', x + w / 2, y + 21, 5); circle(ctx, '#333', x + w / 2, y + 21, 2.5); };

// ----- Salas y juegos -----
D.poolTable = (ctx, x, y, w, h, o, c) => {
  const col = o.color || c.color;
  R(ctx, 'rgba(0,0,0,.15)', x + 3, y + h - 2, w - 4, 5);
  RR(ctx, '#6b3f22', x, y, w, h, 6);
  RR(ctx, col, x + 6, y + 6, w - 12, h - 12, 3);
  for (const [px, py] of [[7, 7], [w / 2, 5], [w - 7, 7], [7, h - 7], [w / 2, h - 5], [w - 7, h - 7]]) circle(ctx, '#111', x + px, y + py, 3);
  circle(ctx, '#fff', x + w * 0.3, y + h / 2, 2.5);
  for (const [k, cc] of [[0, '#ffd23f'], [1, '#e63946'], [2, '#3a86ff'], [3, '#111']]) circle(ctx, cc, x + w * 0.62 + (k % 2) * 6, y + h / 2 - 4 + Math.floor(k / 2) * 7, 2.5);
};
D.pingPong = (ctx, x, y, w, h, o, c) => {
  const col = o.color || c.color;
  R(ctx, 'rgba(0,0,0,.15)', x + 3, y + h - 2, w - 4, 5);
  RR(ctx, shade(col, -0.2), x + 2, y + 4, w - 4, h - 4, 2);
  RR(ctx, col, x + 2, y + 2, w - 4, h - 8, 2);
  R(ctx, '#fff', x + 4, y + 4, w - 8, 1); R(ctx, '#fff', x + 4, y + h - 8, w - 8, 1); R(ctx, '#fff', x + 2, y + (h - 6) / 2, w - 4, 1);
  R(ctx, '#ddd', x + w / 2 - 1, y, 2, h - 6);
  circle(ctx, '#e63946', x + 10, y + h / 2, 3); circle(ctx, '#111', x + w - 10, y + h / 2 + 2, 3);
};
D.reception = (ctx, x, y, w, h, o, c) => {
  const col = o.color || c.color;
  const p = BRAND.primary || '#FE3377';
  R(ctx, 'rgba(0,0,0,.22)', x + 2, y + h - 1, w - 2, 6);
  // cubierta
  RR(ctx, shade(col, 0.28), x - 2, y - 7, w + 4, 8, 3);
  R(ctx, 'rgba(255,255,255,.18)', x + 2, y - 6, w - 4, 1.5);
  // frente
  RR(ctx, col, x, y - 1, w, h + 1, 3);
  R(ctx, shade(col, 0.12), x + 3, y + 1, w - 6, 2);
  // tira de luz
  ctx.save(); ctx.shadowColor = p; ctx.shadowBlur = 8;
  R(ctx, p, x + 4, y + h - 5, w - 8, 2);
  ctx.restore();
  // logo al frente
  if (!drawLogo(ctx, x + w / 2, y + h / 2 - 2, 18)) { ctx.fillStyle = p; hexPath(ctx, x + w / 2, y + h / 2 - 2, 6); ctx.fill(); }
};
D.vending = (ctx, x, y, w, h, o, c) => {
  const col = o.color || c.color;
  R(ctx, 'rgba(0,0,0,.15)', x + 2, y + h - 2, w - 2, 4);
  RR(ctx, col, x + 2, y - 12, w - 4, h + 12, 3);
  R(ctx, '#cfe8f5', x + 5, y - 9, 15, 26);
  for (let r = 0; r < 4; r++) for (let k = 0; k < 3; k++) R(ctx, ['#e63946', '#ffd23f', '#06d6a0', '#3a86ff'][(r + k) % 4], x + 6 + k * 5, y - 7 + r * 6, 3, 4);
  R(ctx, '#222', x + 22, y - 6, 4, 8);
};
D.planter = (ctx, x, y, w, h, o, c) => {
  const col = o.color || c.color;
  R(ctx, 'rgba(0,0,0,.12)', x + 2, y + h - 2, w - 4, 4);
  RR(ctx, col, x + 1, y + 12, w - 2, h - 12, 3);
  R(ctx, shade(col, 0.15), x + 1, y + 12, w - 2, 2);
  for (let k = 0; k < Math.round(w / 6); k++) circle(ctx, k % 2 ? '#2e8540' : '#3a9d4a', x + 5 + k * 6 + hash(k, 2) * 2, y + 9 + hash(k, 7) * 4, 6);
};
D.armchair = (ctx, x, y, w, h, o, c) => {
  const col = o.color || c.color;
  const r = o.rot || 0;
  RR(ctx, 'rgba(0,0,0,.12)', x + 4, y + 24, 24, 6, 3);
  RR(ctx, shade(col, -0.15), x + 3, y + 5, 26, 23, 6);
  RR(ctx, col, x + 7, y + 9, 18, 15, 4);
  if (r === 0) RR(ctx, shade(col, -0.25), x + 3, y + 20, 26, 8, 4);
  if (r === 2) RR(ctx, shade(col, -0.25), x + 3, y + 3, 26, 8, 4);
  if (r === 1) RR(ctx, shade(col, -0.25), x + 2, y + 5, 8, 23, 4);
  if (r === 3) RR(ctx, shade(col, -0.25), x + 22, y + 5, 8, 23, 4);
};
D.bigScreen = (ctx, x, y, w, h, o, c) => {
  const col = o.color || c.color;
  R(ctx, 'rgba(0,0,0,.15)', x + 4, y + h - 2, w - 8, 4);
  RR(ctx, col, x + 2, y - 6, w - 4, h + 2, 3);
  const g = ctx.createLinearGradient(x, y, x + w, y + h);
  g.addColorStop(0, '#2a3a8c'); g.addColorStop(0.5, '#FE3377'); g.addColorStop(1, '#FFCC00');
  ctx.fillStyle = g; ctx.fillRect(x + 5, y - 3, w - 10, h - 6);
  R(ctx, 'rgba(255,255,255,.25)', x + 8, y - 1, w / 3, 2);
};

// ----- Marca (toman los colores del tema si no se eligió color) -----
const brandCols = (o) => {
  const p = o.color || BRAND.primary;
  return { p, s: o.color ? shade(o.color, 0.25) : BRAND.secondary, d: BRAND.dark, l: BRAND.light };
};
D.bunting = (ctx, x, y, w, h, o) => {
  const { p, s, l } = brandCols(o);
  const sag = 7;
  const at = (t) => ({ x: x + w * t, y: y + 2 + 4 * sag * t * (1 - t) });
  ctx.strokeStyle = '#3a3a3a'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(x, y + 2); ctx.quadraticCurveTo(x + w / 2, y + 2 + sag * 2, x + w, y + 2); ctx.stroke();
  const n = Math.max(3, Math.floor(w / 11));
  const cols = [p, s, l];
  for (let k = 0; k < n; k++) {
    const a = at((k + 0.5) / n);
    ctx.fillStyle = cols[k % 3];
    ctx.beginPath(); ctx.moveTo(a.x - 4.5, a.y); ctx.lineTo(a.x + 4.5, a.y); ctx.lineTo(a.x, a.y + 11); ctx.closePath(); ctx.fill();
    ctx.fillStyle = 'rgba(0,0,0,.12)';
    ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(a.x + 4.5, a.y); ctx.lineTo(a.x, a.y + 11); ctx.closePath(); ctx.fill();
  }
};
D.wallBanner = (ctx, x, y, w, h, o) => {
  const { p, s, d, l } = brandCols(o);
  R(ctx, 'rgba(0,0,0,.15)', x + 6, y + 4, w - 8, h - 10);
  R(ctx, '#2b2b2b', x + 1, y + 1, w - 2, 3);
  circle(ctx, s, x + 2, y + 2, 2); circle(ctx, s, x + w - 2, y + 2, 2);
  ctx.fillStyle = p;
  ctx.beginPath(); ctx.moveTo(x + 5, y + 4); ctx.lineTo(x + w - 5, y + 4); ctx.lineTo(x + w - 5, y + h - 4); ctx.lineTo(x + w / 2, y + h - 11); ctx.lineTo(x + 5, y + h - 4); ctx.closePath(); ctx.fill();
  R(ctx, shade(p, -0.18), x + w - 9, y + 4, 4, h - 12);
  R(ctx, d, x + 5, y + 7, w - 10, 2);
  if (drawLogo(ctx, x + w / 2, y + h / 2 - 3, 15)) return;
  ctx.fillStyle = l; hexPath(ctx, x + w / 2, y + h / 2 - 3, 7); ctx.fill();
  ctx.fillStyle = p; hexPath(ctx, x + w / 2, y + h / 2 - 3, 4.5); ctx.fill();
  ctx.fillStyle = s; hexPath(ctx, x + w / 2, y + h / 2 - 3, 2); ctx.fill();
};
D.neonLogo = (ctx, x, y, w, h, o) => {
  const { p, s } = brandCols(o);
  RR(ctx, '#121214', x + 1, y + 1, w - 2, h - 2, 4);
  ctx.save();
  ctx.shadowColor = p; ctx.shadowBlur = 8;
  ctx.strokeStyle = p; ctx.lineWidth = 1.6;
  if (!drawLogo(ctx, x + 11, y + h / 2, 14)) { hexPath(ctx, x + 11, y + h / 2, 6); ctx.stroke(); }
  const name = BRAND.name.slice(0, 18);
  let size = 13;
  ctx.font = `${size}px "Archivo Black", "Arial Black", sans-serif`;
  const room = w - 26;
  const tw = ctx.measureText(name).width;
  if (tw > room) { size = Math.max(6, Math.floor(size * room / tw)); ctx.font = `${size}px "Archivo Black", "Arial Black", sans-serif`; }
  ctx.fillStyle = '#fff'; ctx.textBaseline = 'middle';
  ctx.fillText(name, x + 21, y + h / 2 + 1);
  ctx.restore();
  R(ctx, s, x + 21, y + h - 4, Math.min(room, ctx.measureText(name).width), 1);
};
D.floorLogo = (ctx, x, y, w, h, o) => {
  const { p, s, d, l } = brandCols(o);
  const cx = x + w / 2, cy = y + h / 2, r = Math.min(w, h) / 2 - 3;
  ctx.save();
  ctx.globalAlpha = 0.9;
  ctx.fillStyle = d; hexPath(ctx, cx, cy, r); ctx.fill();
  ctx.strokeStyle = p; ctx.lineWidth = 3; hexPath(ctx, cx, cy, r - 2); ctx.stroke();
  ctx.strokeStyle = s; ctx.lineWidth = 1.5; hexPath(ctx, cx, cy, r - 9); ctx.stroke();
  if (drawLogo(ctx, cx, cy, r * 1.15)) { ctx.restore(); return; }
  // cubo isométrico
  const c = r * 0.32;
  ctx.fillStyle = l; ctx.beginPath(); ctx.moveTo(cx, cy - c); ctx.lineTo(cx + c, cy - c / 2); ctx.lineTo(cx, cy); ctx.lineTo(cx - c, cy - c / 2); ctx.closePath(); ctx.fill();
  ctx.fillStyle = p; ctx.beginPath(); ctx.moveTo(cx - c, cy - c / 2); ctx.lineTo(cx, cy); ctx.lineTo(cx, cy + c); ctx.lineTo(cx - c, cy + c / 2); ctx.closePath(); ctx.fill();
  ctx.fillStyle = shade(p, -0.35); ctx.beginPath(); ctx.moveTo(cx + c, cy - c / 2); ctx.lineTo(cx, cy); ctx.lineTo(cx, cy + c); ctx.lineTo(cx + c, cy + c / 2); ctx.closePath(); ctx.fill();
  ctx.restore();
};
D.poster = (ctx, x, y, w, h, o) => {
  const { p, s, d, l } = brandCols(o);
  R(ctx, 'rgba(0,0,0,.15)', x + 4, y + 3, w - 4, h - 3);
  R(ctx, d, x + 2, y + 1, w - 4, h - 4);
  const g = ctx.createLinearGradient(x, y, x, y + h);
  g.addColorStop(0, p); g.addColorStop(1, s);
  ctx.fillStyle = g; ctx.fillRect(x + 4, y + 3, w - 8, h - 14);
  if (!drawLogo(ctx, x + w / 2, y + 3 + (h - 14) / 2, 14)) { ctx.strokeStyle = l; ctx.lineWidth = 1.5; hexPath(ctx, x + w / 2, y + 3 + (h - 14) / 2, 6); ctx.stroke(); }
  R(ctx, l, x + 6, y + h - 9, w - 12, 2); R(ctx, shade(l, -0.4), x + 6, y + h - 6, (w - 12) * 0.6, 1);
};
D.fairyLights = (ctx, x, y, w, h, o) => {
  const { p, s, l } = brandCols(o);
  ctx.strokeStyle = '#3a3a3a'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(x, y + 2);
  for (let k = 1; k <= 4; k++) ctx.quadraticCurveTo(x + w * (k - 0.5) / 4, y + 10, x + w * k / 4, y + 2);
  ctx.stroke();
  const cols = [s, p, l, '#8ecae6'];
  const n = Math.floor(w / 7);
  ctx.save();
  for (let k = 0; k < n; k++) {
    const t = (k + 0.5) / n;
    const seg = (t * 4) % 1;
    const yy = y + 2 + 8 * 4 * seg * (1 - seg) * 0.5;
    ctx.shadowColor = cols[k % 4]; ctx.shadowBlur = 6;
    circle(ctx, cols[k % 4], x + w * t, yy + 3, 2.2);
  }
  ctx.restore();
};
D.balloons = (ctx, x, y, w, h, o) => {
  const { p, s, l } = brandCols(o);
  ctx.strokeStyle = '#777'; ctx.lineWidth = 0.8;
  for (const dx of [-5, 0, 5]) { ctx.beginPath(); ctx.moveTo(x + w / 2, y + h - 2); ctx.lineTo(x + w / 2 + dx * 1.4, y + 18); ctx.stroke(); }
  R(ctx, '#555', x + w / 2 - 2, y + h - 3, 4, 3);
  for (const [dx, dy, c] of [[-7, 10, p], [7, 11, s], [0, 4, l]]) {
    ctx.fillStyle = c; ctx.beginPath(); ctx.ellipse(x + w / 2 + dx, y + dy + 4, 6, 7.5, 0, 0, Math.PI * 2); ctx.fill();
    circle(ctx, 'rgba(255,255,255,.55)', x + w / 2 + dx - 2, y + dy + 1, 1.6);
  }
};
D.deskFlag = (ctx, x, y, w, h, o) => {
  const { p, s } = brandCols(o);
  R(ctx, '#444', x + 3, y + 2, 1, h - 4);
  R(ctx, '#333', x + 1, y + h - 3, 6, 2);
  ctx.fillStyle = p; ctx.beginPath(); ctx.moveTo(x + 4, y + 2); ctx.lineTo(x + w, y + 6); ctx.lineTo(x + 4, y + 10); ctx.closePath(); ctx.fill();
  R(ctx, s, x + 4, y + 5, 6, 1.5);
};
D.flagPole = (ctx, x, y, w, h, o) => {
  const { p, s, l } = brandCols(o);
  circle(ctx, 'rgba(0,0,0,.18)', x + w / 2 + 2, y + h - 5, 7);
  R(ctx, '#8a8f98', x + w / 2 - 6, y + h - 9, 12, 6);
  R(ctx, '#c5cad1', x + w / 2 - 1.5, y - 46, 3, h + 38);
  circle(ctx, '#FFCC00', x + w / 2, y - 47, 2.5);
  ctx.fillStyle = p;
  ctx.beginPath();
  ctx.moveTo(x + w / 2 + 1, y - 44);
  ctx.quadraticCurveTo(x + w / 2 + 14, y - 49, x + w / 2 + 28, y - 43);
  ctx.lineTo(x + w / 2 + 28, y - 27);
  ctx.quadraticCurveTo(x + w / 2 + 14, y - 33, x + w / 2 + 1, y - 28);
  ctx.closePath(); ctx.fill();
  if (drawLogo(ctx, x + w / 2 + 14, y - 36.5, 12)) return;
  ctx.fillStyle = l; hexPath(ctx, x + w / 2 + 14, y - 36.5, 4.5); ctx.fill();
  ctx.fillStyle = s; hexPath(ctx, x + w / 2 + 14, y - 36.5, 2); ctx.fill();
};

D.carpetRunner = (ctx, x, y, w, h, o, c) => {
  const col = o.color || c.color;
  R(ctx, shade(col, -0.25), x + 2, y, w - 4, h);
  R(ctx, col, x + 4, y, w - 8, h);
  const s = BRAND.secondary || '#FFCC00';
  R(ctx, s, x + 6, y, 1.5, h); R(ctx, s, x + w - 7.5, y, 1.5, h);
};

const fallback = (ctx, x, y, w, h) => RR(ctx, '#c9ced6', x + 2, y + 2, w - 4, h - 4, 4);

export function drawObject(ctx, o, offX = 0, offY = 0) {
  const c = CATALOG[o.type];
  if (!c) return;
  const { w, h } = objSize(o);
  (D[o.type] || fallback)(ctx, offX + o.x * T, offY + o.y * T, w * T, h * T, o, c);
}

// Dibuja un objeto centrado en una caja (para el catálogo del decorador)
export function drawObjectPreview(canvas, type, color) {
  const ctx = canvas.getContext('2d');
  const c = CATALOG[type];
  const { width, height } = canvas;
  ctx.clearRect(0, 0, width, height);
  ctx.imageSmoothingEnabled = false;
  const pad = 14;
  const scale = Math.min((width - pad * 2) / (c.w * T), (height - pad * 2) / (c.h * T + 14), 2);
  ctx.save();
  ctx.translate(width / 2 - (c.w * T * scale) / 2, height / 2 - (c.h * T * scale) / 2 + 6 * scale);
  ctx.scale(scale, scale);
  (D[type] || fallback)(ctx, 0, 0, c.w * T, c.h * T, { type, color: color || null, rot: 0 }, c);
  ctx.restore();
}

export function sortObjects(objects) {
  const under = [], furniture = [], decor = [];
  for (const o of objects) {
    const c = CATALOG[o.type];
    if (!c) continue;
    if (c.under) under.push(o);
    else if (c.kind === 'decor') decor.push(o);
    else furniture.push(o);
  }
  const byY = (a, b) => a.y + objSize(a).h - (b.y + objSize(b).h);
  return [...under, ...furniture.sort(byY), ...decor.sort(byY)];
}

// ---------------- Avatares ----------------
// cx = centro horizontal, by = base (pies). El sprite mide 32×48.
export function drawAvatar(ctx, cx, by, avatar = {}, dir = 'down', step = 0, sit = false, blink = false) {
  // Parpadeo: la misma ficha con los ojos cerrados (no aplica a personajes dibujados ni lentes de sol)
  if (blink && !avatar?.sprite && avatar?.eyewear !== 'sunglasses' && (dir === 'down' || dir === 'left' || dir === 'right')) avatar = { ...avatar, eyes: 'sleepy' };
  if (sit) {
    // Sentado: más abajo y sin piernas (quedan detrás del asiento)
    const top = Math.round(by - FRAME_H + 4);
    ctx.save();
    ctx.beginPath();
    ctx.rect(cx - FRAME_W, top - 2, FRAME_W * 2, FRAME_H - 8);
    ctx.clip();
    drawSprite(ctx, getSheet(avatar), Math.round(cx - FRAME_W / 2), top, dir, 0);
    ctx.restore();
    return;
  }
  ctx.fillStyle = 'rgba(0,0,0,.2)';
  ctx.beginPath();
  ctx.ellipse(cx, by - 1, 10, 3.5, 0, 0, Math.PI * 2);
  ctx.fill();
  drawSprite(ctx, getSheet(avatar), Math.round(cx - FRAME_W / 2), Math.round(by - FRAME_H + 1), dir, step);
}

// Vista previa: el cuadro quieto en la dirección pedida, escalado a número entero.
export function drawAvatarPreview(canvas, avatar, dir = 'down', step = 0) {
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.imageSmoothingEnabled = false;
  const k = Math.max(1, Math.floor(Math.min(canvas.width / FRAME_W, canvas.height / FRAME_H)));
  drawSprite(ctx, getSheet(avatar), Math.round((canvas.width - FRAME_W * k) / 2), Math.round((canvas.height - FRAME_H * k) / 2), dir, step, k);
}

// Solo la cara (para usar como foto de perfil cuando no hay foto)
export function drawAvatarFace(canvas, avatar) {
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.imageSmoothingEnabled = false;
  const sheet = getSheet(avatar);
  if (sheet) ctx.drawImage(sheet, 4, 8, 24, 24, 0, 0, canvas.width, canvas.height);
}
