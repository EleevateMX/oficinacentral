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
  wood(ctx, x, y, i, j) { brickPlanks(ctx, x, y, i, j, '#b37a5c'); },
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
    R(ctx, '#3f9fd0', x, y, T, T);
    if ((i + j) % 2) R(ctx, '#3e9dce', x, y, T, T);
    if (hash(i, j) > 0.5) { R(ctx, '#6cc0e6', x + 6 + hash(i, j, 5) * 14, y + 10 + hash(i, j, 6) * 12, 8, 1); R(ctx, '#6cc0e6', x + 9 + hash(i, j, 5) * 14, y + 12 + hash(i, j, 6) * 12, 5, 1); }
    // nenúfares
    if (hash(i, j, 4) > 0.72) {
      const lx = x + 6 + hash(i, j, 7) * 18, ly = y + 6 + hash(i, j, 8) * 18;
      pellF(ctx, '#2f6f3a', lx, ly + 1, 6, 4); pellF(ctx, '#57a84a', lx, ly, 6, 4); pellF(ctx, '#79c463', lx - 1, ly - 1, 3, 2);
      R(ctx, '#3f9fd0', lx, ly - 4, 1, 4);
      if (hash(i, j, 11) > 0.6) { pellF(ctx, '#f7b2cf', lx + 2, ly - 1, 2, 2); R(ctx, '#fff', lx + 1, ly - 2, 1, 1); }
    }
    // pez koi
    if (hash(i, j, 9) > 0.84) {
      const fx = x + 8 + hash(i, j, 12) * 10, fy = y + 10 + hash(i, j, 13) * 10;
      R(ctx, '#2a5f86', fx + 1, fy + 2, 9, 3);
      R(ctx, '#f28c38', fx, fy, 8, 3); R(ctx, '#fff', fx + 2, fy, 3, 2); R(ctx, '#f28c38', fx + 8, fy - 1, 3, 5);
      R(ctx, '#111', fx + 1, fy, 1, 1);
    }
  },
  // Alfombra roja ornamental (estilo Gather)
  redRug(ctx, x, y, i, j) {
    R(ctx, '#b4564f', x, y, T, T);
    const dk = '#9e4842', lt = '#c76c63';
    for (let t = 0; t < 14; t++) {
      R(ctx, dk, x + 16 + t, y + 2 + t, 2, 1); R(ctx, dk, x + 30 - t, y + 16 + t, 2, 1);
      R(ctx, dk, x + 16 - t - 1, y + 2 + t, 2, 1); R(ctx, dk, x + 2 + t, y + 16 + t, 2, 1);
    }
    R(ctx, lt, x + 14, y + 12, 4, 8); R(ctx, lt, x + 12, y + 14, 8, 4); R(ctx, dk, x + 15, y + 15, 2, 2);
    for (const [dx, dy] of [[0, 0], [30, 0], [0, 30], [30, 30]]) R(ctx, lt, x + dx, y + dy, 2, 2);
    R(ctx, lt, x + 6, y + 6, 2, 2); R(ctx, lt, x + 24, y + 6, 2, 2); R(ctx, lt, x + 6, y + 24, 2, 2); R(ctx, lt, x + 24, y + 24, 2, 2);
  },
  // Alfombra de rombos gris azulado
  diamond(ctx, x, y) {
    R(ctx, '#56627a', x, y, T, T);
    const lt = '#66738c';
    for (let t = 0; t < 32; t++) { R(ctx, lt, x + t, y + t, 1, 1); R(ctx, lt, x + 31 - t, y + t, 1, 1); }
    R(ctx, lt, x + 15, y + 6, 2, 2); R(ctx, lt, x + 15, y + 24, 2, 2); R(ctx, lt, x + 6, y + 15, 2, 2); R(ctx, lt, x + 24, y + 15, 2, 2);
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

// Duela cálida tipo ladrillo (como el piso de Gather)
function brickPlanks(ctx, x, y, i, j, base) {
  const line = shade(base, -0.13), tones = [base, shade(base, 0.025), shade(base, -0.025), shade(base, 0.012)];
  for (let k = 0; k < 4; k++) {
    const row = j * 4 + k, off = (row % 2) * 8, yy = y + k * 8;
    for (let px = -off; px < T; px += 16) {
      const sx = Math.max(0, px), ex = Math.min(T, px + 16);
      R(ctx, tones[Math.floor(hash(Math.floor((i * T + px + off) / 16), row, 3) * 4)], x + sx, yy, ex - sx, 7);
      if (px >= 0) R(ctx, line, x + px, yy, 1, 7);
      R(ctx, shade(base, 0.05), x + sx + (px >= 0 ? 1 : 0), yy, ex - sx - (px >= 0 ? 1 : 0), 1);
    }
    R(ctx, line, x, yy + 7, T, 1);
  }
}
function pellF(ctx, c, cx, cy, rx, ry) {
  ctx.fillStyle = c;
  for (let dy = -Math.ceil(ry); dy < Math.ceil(ry); dy++) {
    const t = (dy + 0.5) / ry;
    if (Math.abs(t) > 1) continue;
    const hw = Math.round(rx * Math.sqrt(1 - t * t));
    if (hw > 0) ctx.fillRect(Math.round(cx - hw), Math.round(cy + dy), hw * 2, 1);
  }
}

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
  redRug: '#8c3d38', diamond: '#3f4859',
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
  if (d.t === 'water') pondStones(ctx, d);
}
// Anillo de piedras alrededor del estanque
function pondStones(ctx, d) {
  const rx = d.rx * T, ry = d.ry * T, n = Math.max(10, Math.round((rx + ry) / 7));
  for (let k = 0; k < n; k++) {
    const a = (k / n) * Math.PI * 2 + hash(k, 1) * 0.2;
    const sx = d.cx * T + Math.cos(a) * (rx + 2), sy = d.cy * T + Math.sin(a) * (ry + 2);
    const r = 5 + Math.round(hash(k, 2) * 4);
    pellF(ctx, '#2a2a35', sx, sy + 1, r + 1, r);
    pellF(ctx, '#8d93a0', sx, sy, r, r - 1);
    pellF(ctx, '#b3b9c4', sx - 1, sy - 2, r - 2, r - 3);
    R(ctx, '#d6dbe2', sx - 3, sy - r + 2, 2, 1);
  }
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

D.noticeBoard = (ctx, x, y, w, h) => {
  R(ctx, 'rgba(0,0,0,.15)', x + 4, y + h - 2, w - 6, 4);
  R(ctx, '#7a4a2b', x + 2, y - 14, w - 4, h + 8);
  R(ctx, '#c99c72', x + 4, y - 12, w - 8, h + 4);
  const notes = [['#fff3a8', 8, -10], ['#ffc9de', 26, -8], ['#c9e4ff', 46, -11], ['#c9f2d4', 64, -7], ['#fff3a8', 16, 4], ['#ffffff', 52, 3]];
  for (const [c, dx, dy] of notes) if (dx + 14 < w - 4) { R(ctx, c, x + dx, y + dy, 13, 11); circle(ctx, '#e63946', x + dx + 6.5, y + dy + 1.5, 1.6); }
  R(ctx, '#5a3820', x + 6, y + h - 6, 2, 8); R(ctx, '#5a3820', x + w - 8, y + h - 6, 2, 8);
};
D.tv = (ctx, x, y, w, h) => {
  R(ctx, '#1f232b', x + 2, y - 10, w - 4, h + 2);
  R(ctx, '#3d4b63', x + 4, y - 8, w - 8, h - 2);
  R(ctx, '#5c7396', x + 6, y - 6, (w - 12) / 2, 3);
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
D.drum = (ctx, x, y) => {
  circle(ctx, '#7a4a2b', x + 16, y + 18, 12);
  circle(ctx, '#f1d39a', x + 16, y + 14, 11);
  R(ctx, '#333', x + 4, y + 22, 24, 6);
};
D.tree2 = (ctx, x, y, w, h) => {
  pot(ctx, x + w / 2, y + h - 2, 20, 14, '#e9e6df');
  R(ctx, OL, x + w / 2 - 3, y + h - 34, 6, 20); R(ctx, '#7a4a2b', x + w / 2 - 2, y + h - 34, 4, 19);
  R(ctx, OL, x + w / 2 - 10, y + h - 32, 9, 3); R(ctx, '#7a4a2b', x + w / 2 - 9, y + h - 31, 8, 1);
  leafBlobs(ctx, blobsIn(x + 4, y - 4, w - 8, h - 26, 9, 6, 9, 21), '#f39cbc');
};
D.tree = (ctx, x, y) => {
  pell(ctx, SH, x + 17, y + 29, 12, 3);
  R(ctx, OL, x + 13, y + 20, 7, 11); R(ctx, '#7a4a2b', x + 14, y + 20, 5, 10); R(ctx, '#9a6845', x + 14, y + 20, 2, 10);
  const tiers = [[y + 6, 14, 15], [y - 4, 12, 13], [y - 14, 9, 12]];
  for (const [ty, hw, hh] of tiers) {
    for (let r = 0; r <= hh; r++) { const ww = Math.round(1 + (hw * r) / hh); R(ctx, OL, x + 16 - ww - 1, ty + r - 1, ww * 2 + 2, 2); }
    for (let r = 0; r < hh; r++) {
      const ww = Math.round(1 + (hw * r) / hh);
      R(ctx, '#2f7d4a', x + 16 - ww, ty + r, ww * 2, 1);
      R(ctx, '#3d9a5a', x + 16 - ww, ty + r, ww, 1);
      if (r > hh - 3) R(ctx, '#256a3d', x + 16 - ww, ty + r, ww * 2, 1);
    }
    R(ctx, '#5cb874', x + 14, ty + 3, 2, 1);
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
D.rug = (ctx, x, y, w, h, o, c) => {
  const col = o.color || c.color;
  RR(ctx, col, x + 2, y + 2, w - 4, h - 4, 4);
  ctx.strokeStyle = shade(col, -0.2); ctx.lineWidth = 2;
  ctx.strokeRect(x + 7, y + 7, w - 14, h - 14);
};

// Decoraciones (tamaño pequeño)
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
D.mug = (ctx, x, y, w, h, o, c) => {
  const col = o.color || c.color;
  obox(ctx, col, x + 1, y + 1, w - 4, h - 2, 1);
  R(ctx, '#6b4423', x + 2, y + 1, w - 6, 2);
  R(ctx, OL, x + w - 3, y + 2, 2, 4); R(ctx, col, x + w - 3, y + 3, 1, 2);
};
D.can = (ctx, x, y, w, h, o, c) => {
  const col = o.color || c.color;
  obox(ctx, col, x + 1, y + 1, w - 3, h - 2, 1);
  R(ctx, '#d6dbe2', x + 1, y + 1, w - 3, 2);
  R(ctx, shade(col, 0.25), x + 2, y + 4, 1, h - 6);
};
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
  pot(ctx, x + w / 2, y + h, 10, 7, '#c8734a');
  obox(ctx, '#3f9a4a', x + w / 2 - 3, y + 4, 6, h - 11, 3);
  R(ctx, '#5fb85f', x + w / 2 - 2, y + 6, 1, h - 15);
  obox(ctx, '#3f9a4a', x + 2, y + 9, 3, 6, 1); R(ctx, '#3f9a4a', x + 4, y + 13, 3, 2);
  pell(ctx, '#f472a8', x + w / 2, y + 4, 2, 2);
};
D.smallPlant = (ctx, x, y, w, h) => {
  pot(ctx, x + w / 2, y + h, 10, 7, '#c8734a');
  leafBlobs(ctx, [[x + w / 2 - 3, y + 6, 4], [x + w / 2 + 3, y + 6, 4], [x + w / 2, y + 3, 4]], LEAF);
};
D.blossom = (ctx, x, y, w, h) => {
  R(ctx, '#3d2b1f', x + w / 2 - 5, y + h - 7, 10, 7);
  R(ctx, '#6b4423', x + w / 2 - 1, y + h / 2, 2, h / 2 - 6);
  for (let k = 0; k < 6; k++) circle(ctx, k % 2 ? '#f8a5c2' : '#f472a8', x + 5 + hash(k, 3) * (w - 10), y + 4 + hash(k, 7) * (h / 2), 4);
};
D.books = (ctx, x, y, w, h, o, c) => {
  const col = o.color || c.color;
  obox(ctx, shade(col, -0.3), x + 1, y + h - 6, w - 2, 5, 0); R(ctx, '#fff', x + 2, y + h - 5, w - 4, 1);
  obox(ctx, col, x + 2, y + h - 11, w - 4, 5, 0); R(ctx, '#fff', x + 3, y + h - 10, w - 6, 1);
  obox(ctx, '#ffd23f', x, y + h - 16, w - 3, 5, 0); R(ctx, '#fff', x + 1, y + h - 15, w - 5, 1);
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

// ----- Escritorio -----
D.mousepad = (ctx, x, y, w, h, o, c) => { RR(ctx, o.color || c.color, x, y + 2, w, h - 2, 3); RR(ctx, '#e8e8ee', x + w - 9, y + 4, 6, 8, 3); };
D.stickyNotes = (ctx, x, y, w, h, o, c) => { const col = o.color || c.color; R(ctx, shade(col, -0.15), x + 4, y + 4, 11, 11); R(ctx, col, x + 1, y + 1, 11, 11); R(ctx, shade(col, -0.35), x + 3, y + 4, 7, 1); R(ctx, shade(col, -0.35), x + 3, y + 7, 5, 1); };
D.pencilCup = (ctx, x, y, w, h, o, c) => { R(ctx, '#e63946', x + 2, y, 1, 6); R(ctx, '#ffd23f', x + 4, y + 1, 1, 5); R(ctx, '#2bb673', x + 6, y, 1, 6); R(ctx, o.color || c.color, x + 1, y + 6, w - 2, h - 6); };
D.deskCalendar = (ctx, x, y, w, h, o, c) => { R(ctx, '#fff', x + 1, y + 3, w - 2, h - 3); R(ctx, o.color || c.color, x + 1, y + 3, w - 2, 4); R(ctx, '#333', x + 5, y + 9, 6, 4); };
D.tablet = (ctx, x, y, w, h, o, c) => { RR(ctx, o.color || c.color, x + 1, y + 1, w - 2, h - 2, 2); R(ctx, '#7ad3ff', x + 3, y + 3, w - 6, h - 6); R(ctx, '#FE3377', x + 5, y + 6, 4, 3); };
D.phone = (ctx, x, y, w, h, o, c) => { RR(ctx, o.color || c.color, x, y + 1, w, h - 2, 2); R(ctx, '#5aa9e6', x + 1, y + 3, w - 2, h - 7); };
D.rubik = (ctx, x, y) => { const cs = ['#e63946', '#ffd23f', '#2bb673', '#3a86ff', '#fff', '#f4a261']; for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) R(ctx, cs[(i * 3 + j) % 6], x + i * 2.6, y + j * 2.6, 2.4, 2.4); };
D.plushie = (ctx, x, y, w, h, o, c) => { const col = o.color || c.color; circle(ctx, col, x + w / 2, y + 11, 6); circle(ctx, col, x + w / 2, y + 5, 5); circle(ctx, col, x + w / 2 - 4, y + 1, 2); circle(ctx, col, x + w / 2 + 4, y + 1, 2); R(ctx, '#222', x + w / 2 - 2, y + 4, 1, 1); R(ctx, '#222', x + w / 2 + 1, y + 4, 1, 1); };
D.vase = (ctx, x, y, w, h, o, c) => { RR(ctx, o.color || c.color, x + 4, y + 12, w - 8, h - 12, 3); R(ctx, '#3f9447', x + w / 2 - 1, y + 4, 1, 9); circle(ctx, '#ffd23f', x + w / 2 - 3, y + 4, 2.5); circle(ctx, '#f15bb5', x + w / 2 + 3, y + 6, 2.5); circle(ctx, '#fff', x + w / 2, y + 2, 2.5); };
D.succulent = (ctx, x, y, w, h) => {
  pot(ctx, x + w / 2, y + h, 10, 6, '#d0d4da');
  for (const [a, l] of [[-2.6, 6], [-1.57, 7], [-0.5, 6], [-2.1, 5], [-1.0, 5]]) longLeaf(ctx, x + w / 2, y + h - 7, a, l, 3, '#6fbf73', 0);
};

// ----- Gamer y stream -----
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
D.floorLamp = (ctx, x, y, w, h, o, c) => { R(ctx, '#333', x + w / 2 - 1, y + 10, 2, h - 12); R(ctx, '#333', x + 2, y + h - 3, w - 4, 3); ctx.fillStyle = o.color || c.color; ctx.beginPath(); ctx.moveTo(x + 1, y + 11); ctx.lineTo(x + w - 1, y + 11); ctx.lineTo(x + w - 4, y); ctx.lineTo(x + 4, y); ctx.fill(); };
D.miniFridge = (ctx, x, y, w, h, o, c) => { const col = o.color || c.color; RR(ctx, col, x + 1, y + 4, w - 2, h - 4, 2); R(ctx, shade(col, -0.15), x + 1, y + 14, w - 2, 1); R(ctx, '#888', x + w - 6, y + 8, 2, 4); R(ctx, '#888', x + w - 6, y + 17, 2, 6); };
D.guitar = (ctx, x, y, w, h, o, c) => { const col = o.color || c.color; R(ctx, '#3d2b1f', x + w / 2 - 1, y, 2, 16); R(ctx, '#3d2b1f', x + w / 2 - 2, y, 4, 3); circle(ctx, col, x + w / 2, y + 20, 6); circle(ctx, col, x + w / 2, y + 26, 7); circle(ctx, '#2b1d14', x + w / 2, y + 22, 2); };
D.roundRug = (ctx, x, y, w, h, o, c) => { const col = o.color || c.color; ctx.fillStyle = col; ctx.beginPath(); ctx.ellipse(x + w / 2, y + h / 2, w / 2 - 1, h / 2 - 3, 0, 0, Math.PI * 2); ctx.fill(); ctx.strokeStyle = shade(col, -0.18); ctx.lineWidth = 2; ctx.beginPath(); ctx.ellipse(x + w / 2, y + h / 2, w / 2 - 6, h / 2 - 7, 0, 0, Math.PI * 2); ctx.stroke(); };
D.petBed = (ctx, x, y, w, h, o, c) => { const col = o.color || c.color; ctx.fillStyle = shade(col, -0.2); ctx.beginPath(); ctx.ellipse(x + w / 2, y + h / 2 + 1, w / 2, h / 2, 0, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = shade(col, 0.3); ctx.beginPath(); ctx.ellipse(x + w / 2, y + h / 2 + 1, w / 2 - 4, h / 2 - 3, 0, 0, Math.PI * 2); ctx.fill(); };
D.trashCan = (ctx, x, y, w, h, o, c) => { const col = o.color || c.color; R(ctx, col, x + 3, y + 3, w - 6, h - 3); R(ctx, shade(col, 0.2), x + 2, y + 2, w - 4, 2); R(ctx, shade(col, -0.2), x + 6, y + 6, 1, h - 8); R(ctx, shade(col, -0.2), x + 10, y + 6, 1, h - 8); };
D.tallSpeaker = (ctx, x, y, w, h, o, c) => { R(ctx, o.color || c.color, x + 1, y, w - 2, h); circle(ctx, '#555', x + w / 2, y + 8, 4); circle(ctx, '#333', x + w / 2, y + 8, 2); circle(ctx, '#555', x + w / 2, y + 21, 5); circle(ctx, '#333', x + w / 2, y + 21, 2.5); };

// ----- Salas y juegos -----
D.vending = (ctx, x, y, w, h, o, c) => {
  const col = o.color || c.color;
  R(ctx, 'rgba(0,0,0,.15)', x + 2, y + h - 2, w - 2, 4);
  RR(ctx, col, x + 2, y - 12, w - 4, h + 12, 3);
  R(ctx, '#cfe8f5', x + 5, y - 9, 15, 26);
  for (let r = 0; r < 4; r++) for (let k = 0; k < 3; k++) R(ctx, ['#e63946', '#ffd23f', '#06d6a0', '#3a86ff'][(r + k) % 4], x + 6 + k * 5, y - 7 + r * 6, 3, 4);
  R(ctx, '#222', x + 22, y - 6, 4, 8);
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

// ----- GTAHUB premium -----
// Tiempo de animación (lo pone el mapa en cada cuadro; en vistas previas queda quieto)
let ANIM_T = 0;
export function setAnimTime(t) { ANIM_T = t; }

// Logo recortado a un ancho (para pintarlo por tiras en la bandera)
function logoImage() { return brandLogo(); }

// Bandera que ondea: tela por tiras verticales con una onda que viaja; el logo va pintado en la tela
D.wavingFlag = (ctx, x, y, w, h, o) => {
  const { p, s, d } = brandCols(o);
  const px = x + w / 2;
  const top = y - 70;
  // base y asta
  ctx.fillStyle = 'rgba(0,0,0,.2)'; ctx.beginPath(); ctx.ellipse(px + 3, y + h - 6, 11, 4, 0, 0, Math.PI * 2); ctx.fill();
  RR(ctx, '#5b606b', px - 9, y + h - 12, 18, 7, 2);
  RR(ctx, '#8a909c', px - 7, y + h - 14, 14, 4, 2);
  const pole = ctx.createLinearGradient(px - 2, 0, px + 2, 0);
  pole.addColorStop(0, '#e9edf2'); pole.addColorStop(1, '#8e96a3');
  ctx.fillStyle = pole; ctx.fillRect(px - 1.5, top, 3, y + h - 12 - top);
  circle(ctx, '#FFCC00', px, top - 1, 3);
  circle(ctx, '#fff6c2', px - 1, top - 2, 1);
  // tela
  const FW = 46, FH = 30, N = 23, sw = FW / N;
  const t = ANIM_T / 1000;
  const im = logoImage();
  const wave = (k) => Math.sin(k * 0.35 - t * 5) * (k / N) * 4;
  for (let k = 0; k < N; k++) {
    const dy = wave(k);
    const shadeK = Math.cos(k * 0.35 - t * 5) * (k / N);
    const fx = px + 1.5 + k * sw;
    const fy = top + 2 + dy;
    const g = ctx.createLinearGradient(0, fy, 0, fy + FH);
    g.addColorStop(0, p); g.addColorStop(1, shade(p, -0.15));
    ctx.fillStyle = g; ctx.fillRect(fx, fy, sw + 0.6, FH);
    // franja inferior
    ctx.fillStyle = s; ctx.fillRect(fx, fy + FH - 5, sw + 0.6, 3);
    ctx.fillStyle = d; ctx.fillRect(fx, fy + FH - 2, sw + 0.6, 2);
    if (im) {
      const lw = FW - 12, lh = Math.min(FH - 10, lw * im.naturalHeight / im.naturalWidth);
      const lx0 = 6, ly0 = (FH - 5 - lh) / 2;
      const a = k * sw - lx0, b = a + sw;
      if (b > 0 && a < lw) {
        const sx0 = Math.max(0, a), sx1 = Math.min(lw, b);
        const srcX = (sx0 / lw) * im.naturalWidth, srcW = ((sx1 - sx0) / lw) * im.naturalWidth;
        ctx.drawImage(im, srcX, 0, srcW, im.naturalHeight, fx + (sx0 - a), fy + ly0, sx1 - sx0 + 0.4, lh);
      }
    }
    // luz y sombra de los pliegues
    ctx.fillStyle = shadeK > 0 ? `rgba(255,255,255,${shadeK * 0.22})` : `rgba(0,0,0,${-shadeK * 0.28})`;
    ctx.fillRect(fx, fy, sw + 0.6, FH);
  }
  if (!im) { ctx.fillStyle = '#fff'; hexPath(ctx, px + 1.5 + FW / 2, top + 2 + FH / 2 - 2 + wave(N / 2), 6); ctx.fill(); }
};

// Roll-up de pie: lona con degradado, logo grande, líneas de texto y base de aluminio
D.rollupBanner = (ctx, x, y, w, h, o) => {
  const { p, s, d, l } = brandCols(o);
  const bx = x + 3, bw = w - 6, top = y - 46, bot = y + h - 9;
  ctx.fillStyle = 'rgba(0,0,0,.18)'; ctx.beginPath(); ctx.ellipse(x + w / 2 + 3, y + h - 4, bw / 2 + 2, 4, 0, 0, Math.PI * 2); ctx.fill();
  R(ctx, '#7c8391', x + w / 2 - 1, top - 3, 2, 4);
  const g = ctx.createLinearGradient(0, top, 0, bot);
  g.addColorStop(0, d); g.addColorStop(0.55, shade(p, -0.25)); g.addColorStop(1, p);
  RR(ctx, g, bx, top, bw, bot - top, 2);
  // brillo diagonal
  ctx.save(); ctx.beginPath(); ctx.rect(bx, top, bw, bot - top); ctx.clip();
  ctx.fillStyle = 'rgba(255,255,255,.08)'; ctx.beginPath(); ctx.moveTo(bx, top + 10); ctx.lineTo(bx + bw, top); ctx.lineTo(bx + bw, top + 16); ctx.lineTo(bx, top + 30); ctx.closePath(); ctx.fill();
  ctx.restore();
  R(ctx, s, bx, top, bw, 2);
  if (!drawLogo(ctx, x + w / 2, top + 16, bw - 6)) { ctx.fillStyle = l; hexPath(ctx, x + w / 2, top + 16, 8); ctx.fill(); }
  R(ctx, 'rgba(255,255,255,.85)', bx + 5, top + 32, bw - 10, 2);
  R(ctx, 'rgba(255,255,255,.5)', bx + 7, top + 37, bw - 14, 1.5);
  R(ctx, s, bx + 5, bot - 9, bw - 10, 4);
  // base
  RR(ctx, '#b9c0cb', x + 1, bot, w - 2, 5, 2);
  R(ctx, '#8b929e', x + 1, bot + 4, w - 2, 2);
  R(ctx, '#e6eaef', x + 3, bot + 1, w - 6, 1);
};

// Muro de logo retroiluminado (para recepción o detrás de un escenario)
D.brandWall = (ctx, x, y, w, h, o) => {
  const { p, s, d } = brandCols(o);
  const top = y - 26;
  R(ctx, 'rgba(0,0,0,.18)', x + 4, top + 6, w - 4, h + 22);
  RR(ctx, '#17161d', x + 1, top, w - 2, h + 24, 4);
  const g = ctx.createRadialGradient(x + w / 2, top + (h + 24) / 2, 4, x + w / 2, top + (h + 24) / 2, w / 1.6);
  g.addColorStop(0, shade(p, -0.1)); g.addColorStop(1, d);
  RR(ctx, g, x + 4, top + 3, w - 8, h + 18, 3);
  // marco con luz
  ctx.save(); ctx.shadowColor = p; ctx.shadowBlur = 10; ctx.strokeStyle = p; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.roundRect(x + 5.5, top + 4.5, w - 11, h + 15, 3); ctx.stroke(); ctx.restore();
  ctx.save(); ctx.shadowColor = 'rgba(255,255,255,.8)'; ctx.shadowBlur = 14;
  if (!drawLogo(ctx, x + w / 2, top + (h + 24) / 2 - 2, Math.min(w - 26, h + 8))) { ctx.fillStyle = '#fff'; hexPath(ctx, x + w / 2, top + (h + 24) / 2, 10); ctx.fill(); }
  ctx.restore();
  R(ctx, s, x + w / 2 - 18, top + h + 14, 36, 2);
  // focos arriba
  for (const fx of [x + 10, x + w - 14]) { R(ctx, '#2c2b33', fx, top - 4, 4, 5); ctx.fillStyle = 'rgba(255,240,200,.18)'; ctx.beginPath(); ctx.moveTo(fx, top + 1); ctx.lineTo(fx + 4, top + 1); ctx.lineTo(fx + 18, top + 26); ctx.lineTo(fx - 14, top + 26); ctx.closePath(); ctx.fill(); }
};

// Tótem hexagonal con el logo encendido arriba
D.logoTotem = (ctx, x, y, w, h, o) => {
  const { p, s, d } = brandCols(o);
  const cx = x + w / 2, base = y + h - 6, top = y - 30;
  ctx.fillStyle = 'rgba(0,0,0,.2)'; ctx.beginPath(); ctx.ellipse(cx + 3, base + 2, 13, 4.5, 0, 0, Math.PI * 2); ctx.fill();
  // columna
  const g = ctx.createLinearGradient(cx - 10, 0, cx + 10, 0);
  g.addColorStop(0, shade(d, 0.25)); g.addColorStop(0.5, d); g.addColorStop(1, shade(d, -0.3));
  ctx.fillStyle = g; ctx.fillRect(cx - 10, top + 12, 20, base - top - 12);
  R(ctx, p, cx - 10, top + 12, 20, 2);
  R(ctx, s, cx - 10, base - 4, 20, 2);
  R(ctx, 'rgba(255,255,255,.12)', cx - 8, top + 14, 2, base - top - 20);
  // hexágono con brillo que respira (se ve aunque no se anime)
  const pulse = 0.75 + Math.sin(ANIM_T / 600) * 0.25;
  ctx.save(); ctx.shadowColor = p; ctx.shadowBlur = 14 * pulse;
  ctx.fillStyle = '#121216'; hexPath(ctx, cx, top + 2, 14); ctx.fill();
  ctx.strokeStyle = p; ctx.lineWidth = 2; hexPath(ctx, cx, top + 2, 13); ctx.stroke(); ctx.restore();
  if (!drawLogo(ctx, cx, top + 2, 20)) { ctx.fillStyle = s; hexPath(ctx, cx, top + 2, 6); ctx.fill(); }
};

// Photocall: lona con el logo repetido, para fotos en eventos
D.photocall = (ctx, x, y, w, h, o) => {
  const { p, s, d } = brandCols(o);
  const top = y - 40, bot = y + h - 6;
  R(ctx, 'rgba(0,0,0,.15)', x + 5, top + 5, w - 6, bot - top);
  for (const fx of [x + 2, x + w - 5]) { R(ctx, '#3a3d45', fx, top - 2, 3, bot - top + 4); R(ctx, '#23252b', fx - 3, bot + 1, 9, 3); }
  R(ctx, '#f6f6f8', x + 5, top, w - 10, bot - top);
  ctx.save(); ctx.beginPath(); ctx.rect(x + 5, top, w - 10, bot - top); ctx.clip();
  let row = 0;
  for (let yy = top + 7; yy < bot; yy += 14, row++) {
    for (let xx = x + 5 + (row % 2 ? 0 : 16); xx < x + w; xx += 32) {
      if (!drawLogo(ctx, xx + 8, yy, 20)) { ctx.fillStyle = (row + Math.round(xx)) % 2 ? p : d; hexPath(ctx, xx + 8, yy, 4); ctx.fill(); }
    }
  }
  ctx.restore();
  R(ctx, p, x + 5, top, w - 10, 3);
  R(ctx, s, x + 5, bot - 3, w - 10, 3);
};

// Tapete redondo con el logo (debajo de todo)
D.brandRug = (ctx, x, y, w, h, o) => {
  const { p, s, d } = brandCols(o);
  const cx = x + w / 2, cy = y + h / 2, r = Math.min(w, h) / 2 - 2;
  ctx.save();
  ctx.fillStyle = 'rgba(0,0,0,.12)'; ctx.beginPath(); ctx.ellipse(cx + 2, cy + 3, r, r * 0.92, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = d; ctx.beginPath(); ctx.ellipse(cx, cy, r, r * 0.92, 0, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = p; ctx.lineWidth = 3; ctx.beginPath(); ctx.ellipse(cx, cy, r - 4, r * 0.92 - 4, 0, 0, Math.PI * 2); ctx.stroke();
  ctx.setLineDash([3, 4]); ctx.strokeStyle = s; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.ellipse(cx, cy, r - 9, r * 0.92 - 9, 0, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
  if (!drawLogo(ctx, cx, cy, r * 1.25)) { ctx.fillStyle = p; hexPath(ctx, cx, cy, r * 0.35); ctx.fill(); }
  ctx.restore();
};

// Vitrina de trofeos (sala de juegos)
D.trophyCase = (ctx, x, y, w, h, o) => {
  const { p, s, d } = brandCols(o);
  const top = y - 30, bot = y + h - 4;
  R(ctx, 'rgba(0,0,0,.18)', x + 4, top + 4, w - 4, bot - top);
  RR(ctx, '#3b2a20', x + 1, top, w - 2, bot - top, 3);
  R(ctx, '#2a1d16', x + 1, bot - 6, w - 2, 6);
  const glass = ctx.createLinearGradient(x, top, x + w, bot);
  glass.addColorStop(0, '#1d2b3a'); glass.addColorStop(1, '#0f1720');
  ctx.fillStyle = glass; ctx.fillRect(x + 4, top + 3, w - 8, bot - top - 11);
  const shelves = [top + 18, top + 34];
  for (const sy of shelves) R(ctx, '#6b4b36', x + 4, sy, w - 8, 2);
  // trofeos
  const cup = (cx, by, c) => {
    ctx.fillStyle = c;
    ctx.beginPath(); ctx.moveTo(cx - 4, by - 11); ctx.lineTo(cx + 4, by - 11); ctx.quadraticCurveTo(cx + 4, by - 5, cx, by - 4); ctx.quadraticCurveTo(cx - 4, by - 5, cx - 4, by - 11); ctx.fill();
    ctx.fillRect(cx - 1, by - 4, 2, 2); ctx.fillRect(cx - 3, by - 2, 6, 2);
    ctx.fillStyle = 'rgba(255,255,255,.5)'; ctx.fillRect(cx - 2.5, by - 10, 1, 4);
  };
  const n = Math.max(2, Math.floor((w - 8) / 12));
  for (let k = 0; k < n; k++) {
    const cx = x + 4 + (w - 8) * (k + 0.5) / n;
    cup(cx, shelves[0], k % 3 === 0 ? '#FFCC00' : k % 3 === 1 ? '#d9dde3' : '#d08a4a');
    if (k % 2 === 0) cup(cx, shelves[1], '#FFCC00');
    else { ctx.fillStyle = p; hexPath(ctx, cx, shelves[1] - 5, 4); ctx.fill(); }
  }
  if (!drawLogo(ctx, x + w / 2, bot - 3, 12)) R(ctx, s, x + w / 2 - 8, bot - 4, 16, 2);
  // reflejo del vidrio
  ctx.fillStyle = 'rgba(255,255,255,.07)'; ctx.beginPath(); ctx.moveTo(x + 6, top + 3); ctx.lineTo(x + 14, top + 3); ctx.lineTo(x + 6, bot - 12); ctx.closePath(); ctx.fill();
  R(ctx, d, x + 1, top, w - 2, 2);
};

D.carpetRunner = (ctx, x, y, w, h, o, c) => {
  const col = o.color || c.color;
  R(ctx, shade(col, -0.25), x + 2, y, w - 4, h);
  R(ctx, col, x + 4, y, w - 8, h);
  const s = BRAND.secondary || '#FFCC00';
  R(ctx, s, x + 6, y, 1.5, h); R(ctx, s, x + w - 7.5, y, 1.5, h);
};

// ================= Muebles en vista 3/4 (estilo Gather) =================
// Cada mueble muestra su cara de arriba y su frente, con contorno oscuro,
// sombra suave y brillos. Todo en rectángulos enteros para que se vea pixelado.
const OL = '#2a2a35';
const SH = 'rgba(28,22,40,.2)';

// Rectángulo con esquinas redondeadas a pixel
function prr(ctx, c, x, y, w, h, r = 0) {
  x = Math.round(x); y = Math.round(y); w = Math.round(w); h = Math.round(h);
  if (w <= 0 || h <= 0) return;
  ctx.fillStyle = c;
  r = Math.min(r, Math.floor(w / 2), Math.floor(h / 2));
  if (r <= 0) { ctx.fillRect(x, y, w, h); return; }
  ctx.fillRect(x, y + r, w, h - 2 * r);
  for (let k = 0; k < r; k++) {
    const ins = Math.round(r - Math.sqrt(r * r - (r - k) * (r - k)));
    ctx.fillRect(x + ins, y + k, w - 2 * ins, 1);
    ctx.fillRect(x + ins, y + h - 1 - k, w - 2 * ins, 1);
  }
}
// Caja con contorno
function obox(ctx, c, x, y, w, h, r = 0) { prr(ctx, OL, x - 1, y - 1, w + 2, h + 2, r + 1); prr(ctx, c, x, y, w, h, r); }
// Elipse a pixel (filas enteras)
function pell(ctx, c, cx, cy, rx, ry) {
  if (rx <= 0 || ry <= 0) return;
  ctx.fillStyle = c;
  cx = Math.round(cx); cy = Math.round(cy);
  const n = Math.ceil(ry);
  for (let dy = -n; dy < n; dy++) {
    const t = (dy + 0.5) / ry;
    if (Math.abs(t) > 1) continue;
    const hw = Math.round(rx * Math.sqrt(1 - t * t));
    if (hw > 0) ctx.fillRect(cx - hw, cy + dy, hw * 2, 1);
  }
}
function opell(ctx, c, cx, cy, rx, ry) { pell(ctx, OL, cx, cy, rx + 1, ry + 1); pell(ctx, c, cx, cy, rx, ry); }
// Espejo horizontal dentro de la caja [x, x+w]
function mirrorX(ctx, x, w, fn) { ctx.save(); ctx.translate(Math.round(x * 2 + w), 0); ctx.scale(-1, 1); fn(); ctx.restore(); }
const woodish = (hex) => { const n = parseInt(hex.slice(1), 16); const r = n >> 16, g = (n >> 8) & 255, b = n & 255; return r > g && g > b && r - b > 40; };

// Mata de hojas: bolitas con contorno, sombra y brillo (de atrás hacia adelante)
function leafBlobs(ctx, blobs, base) {
  const dark = shade(base, -0.16), light = shade(base, 0.1), hi = shade(base, 0.2), mid = shade(base, -0.07);
  for (const [bx, by, r] of blobs) pell(ctx, OL, bx, by, r + 1, r + 1);
  for (const [bx, by, r] of [...blobs].sort((a, b) => a[1] - b[1])) {
    pell(ctx, dark, bx, by, r, r);
    pell(ctx, base, bx - 1, by - 1, r - 1, r - 1);
    pell(ctx, light, bx - Math.round(r / 3), by - Math.round(r / 3), Math.max(1, Math.round(r / 2.5)), Math.max(1, Math.round(r / 3)));
    // hojitas
    const n = Math.max(3, r * 2);
    for (let k = 0; k < n; k++) {
      const a = hash(bx, by, k) * Math.PI * 2, d = Math.sqrt(hash(by, bx, k)) * (r - 2);
      const px = Math.round(bx - 1 + Math.cos(a) * d), py = Math.round(by - 1 + Math.sin(a) * d);
      const up = py < by - 1 && px < bx + 1;
      R(ctx, up ? hi : mid, px, py, 2, 1);
      R(ctx, up ? light : dark, px + 1, py + 1, 1, 1);
    }
  }
}
function blobsIn(x, y, w, h, n, r0, r1, seed) {
  const out = [];
  for (let k = 0; k < n; k++) {
    const r = Math.round(r0 + hash(k, seed, 3) * (r1 - r0));
    out.push([Math.round(x + r + hash(k, seed, 1) * Math.max(0, w - 2 * r)), Math.round(y + r + hash(k, seed, 2) * Math.max(0, h - 2 * r)), r]);
  }
  return out;
}
// Hoja larga (planta alta, helecho): cuadritos a lo largo de una curva
function longLeaf(ctx, x0, y0, ang, len, wid, col, bend = 0) {
  const pts = [];
  for (let t = 0; t <= len; t++) {
    const a = ang + bend * (t / len);
    const p = pts.length ? pts[pts.length - 1] : { x: x0, y: y0 };
    const s = Math.max(1, Math.round(wid * Math.sin(Math.PI * Math.pow(Math.min(1, t / len), 0.7))));
    pts.push({ x: p.x + Math.cos(a), y: p.y + Math.sin(a), s });
  }
  for (const p of pts) R(ctx, OL, p.x - p.s / 2 - 1, p.y - p.s / 2 - 1, p.s + 2, p.s + 2);
  for (const p of pts) R(ctx, col, p.x - p.s / 2, p.y - p.s / 2, p.s, p.s);
  const mid = shade(col, 0.16);
  for (let k = 2; k < pts.length * 0.8; k++) R(ctx, mid, pts[k].x - 0.5, pts[k].y - 0.5, 1, 1);
}
// Maceta redonda en 3/4
function pot(ctx, cx, by, w, h, col) {
  pell(ctx, SH, cx + 1, by - 1, w / 2 + 3, 3);
  obox(ctx, col, cx - w / 2 + 1, by - h, w - 2, h - 1, 2);
  R(ctx, shade(col, -0.14), cx - w / 2 + 1, by - 4, w - 2, 3);
  R(ctx, shade(col, 0.14), cx - w / 2 + 3, by - h + 4, 2, h - 9);
  obox(ctx, shade(col, 0.06), cx - w / 2, by - h - 1, w, 4, 1);
  R(ctx, '#4a3426', cx - w / 2 + 2, by - h, w - 4, 1);
}

// ---------- Escritorios ----------
// Tablero (cara de arriba) + canto + patas/cajonera debajo
function deskBody(ctx, x, y, w, h, s) {
  const tY = y - 6, tH = 19, eH = 5;
  const lY = tY + tH + eH;
  const lH = y + h - 1 - lY;
  prr(ctx, SH, x + 2, y + h - 4, w - 1, 6, 2);
  R(ctx, 'rgba(20,16,30,.18)', x + 3, lY, w - 6, 4);
  const leg = (lx) => { R(ctx, OL, lx - 1, lY, 5, lH + 1); R(ctx, s.leg, lx, lY, 3, lH); R(ctx, shade(s.leg, 0.18), lx, lY, 1, lH); };
  const drawer = (dx, dw) => {
    obox(ctx, s.drawer, dx, lY, dw, lH, 0);
    R(ctx, shade(s.drawer, -0.2), dx, lY, dw, 2);
    R(ctx, shade(s.drawer, -0.16), dx + 1, lY + 7, dw - 2, 1);
    R(ctx, shade(s.drawer, 0.12), dx + 1, lY + 8, dw - 2, 1);
    R(ctx, s.handle, dx + dw / 2 - 3, lY + 4, 6, 1);
    R(ctx, s.handle, dx + dw / 2 - 3, lY + 10, 6, 1);
  };
  const dw = Math.min(26, Math.round(w * 0.3));
  if (s.drawers === 'left' || s.drawers === 'both') drawer(x + 2, dw); else leg(x + 3);
  if (s.drawers === 'both') drawer(x + w - 2 - dw, dw); else leg(x + w - 6);
  if (s.glass) {
    obox(ctx, s.edge, x, tY + tH, w, eH - 2, 0);
    ctx.save(); ctx.globalAlpha = 0.6; prr(ctx, s.top, x, tY, w, tH, 1); ctx.restore();
    R(ctx, OL, x - 1, tY - 1, w + 2, 1); R(ctx, OL, x - 1, tY, 1, tH); R(ctx, OL, x + w, tY, 1, tH);
    R(ctx, 'rgba(255,255,255,.7)', x + 1, tY, w - 2, 1);
    for (let k = 10; k < w - 12; k += 34) for (let t = 0; t < 8; t++) R(ctx, 'rgba(255,255,255,.35)', x + k + t, tY + 10 - t, 2, 1);
    return;
  }
  obox(ctx, s.edge, x, tY, w, tH + eH, 1);
  prr(ctx, s.top, x, tY, w, tH, 1);
  R(ctx, shade(s.top, 0.1), x + 1, tY, w - 2, 1);
  R(ctx, shade(s.top, -0.07), x, tY + tH - 1, w, 1);
  R(ctx, shade(s.edge, 0.08), x, tY + tH, w, 1);
  R(ctx, shade(s.edge, -0.14), x, tY + tH + eH - 1, w, 1);
  if (s.grain) for (let r = 0; r < 4; r++) for (let k = 0; k < 3; k++) {
    const gx = x + 4 + hash(r, k, x) * (w - 24);
    R(ctx, shade(s.top, -0.07), gx, tY + 3 + r * 4, 8 + hash(k, r, y) * 14, 1);
  }
  if (s.led) {
    ctx.save(); ctx.shadowColor = s.led; ctx.shadowBlur = 6;
    R(ctx, s.led, x + 2, tY + tH + 2, w - 4, 1);
    ctx.restore();
  }
}
D.desk = (ctx, x, y, w, h, o, c) => {
  const col = o.color || c.color;
  const wood = woodish(col);
  deskBody(ctx, x, y, w, h, { top: col, edge: shade(col, -0.2), leg: wood ? shade(col, -0.32) : '#8b93a1', drawer: wood ? shade(col, -0.08) : '#9aa3b0', handle: wood ? '#e7b04a' : '#e9edf2', drawers: 'left', grain: wood });
};
D.standingDesk = (ctx, x, y, w, h, o, c) => {
  const col = o.color || c.color;
  deskBody(ctx, x, y, w, h, { top: col, edge: shade(col, -0.16), leg: '#8b93a1', drawer: '#9aa3b0', handle: '#e9edf2', drawers: 'left' });
};
D.woodDesk = (ctx, x, y, w, h, o, c) => {
  const col = o.color || c.color;
  deskBody(ctx, x, y, w, h, { top: col, edge: shade(col, -0.16), leg: shade(col, -0.25), drawer: shade(col, -0.06), handle: '#f2b33d', drawers: 'both', grain: true });
};
D.gamingDesk = (ctx, x, y, w, h, o, c) => {
  const col = o.color || c.color;
  deskBody(ctx, x, y, w, h, { top: col, edge: shade(col, -0.08), leg: '#15161b', drawer: '#1d1e24', handle: '#FE3377', drawers: 'none', led: '#FE3377' });
  // alfombrilla grande de escritorio gamer
  prr(ctx, shade(col, -0.06), x + 8, y - 2, w - 16, 11, 2);
  R(ctx, '#8B7BFF', x + 8, y + 8, w - 16, 1);
};
D.glassDesk = (ctx, x, y, w, h, o, c) => {
  const col = o.color || c.color;
  deskBody(ctx, x, y, w, h, { top: col, edge: '#c9d3dc', leg: '#b9c2cc', drawer: '#c9d3dc', handle: '#7c8794', drawers: 'none', glass: true });
};
D.cubicle = (ctx, x, y, w, h, o, c) => {
  const col = o.color || c.color;
  const p = '#e47b70';
  obox(ctx, p, x, y - 22, w, 14, 0);
  R(ctx, shade(p, 0.16), x, y - 22, w, 3);
  for (let k = 12; k < w - 6; k += 16) R(ctx, shade(p, -0.08), x + k, y - 18, 1, 9);
  D.standingDesk(ctx, x, y, w, h, { color: col }, c);
  for (const sx of [x - 1, x + w - 3]) { obox(ctx, p, sx, y - 22, 4, h + 4, 0); R(ctx, shade(p, 0.16), sx, y - 22, 4, 2); }
};
D.cubicleWalls = (ctx, x, y, w, h, o, c) => {
  const col = o.color || c.color;
  const top = shade(col, 0.2), face = col, dk = shade(col, -0.22);
  // panel trasero: canto de arriba y cara
  R(ctx, SH, x, y + 2, w, 4);
  obox(ctx, face, x - 2, y - 14, w + 4, 15, 0);
  R(ctx, top, x - 2, y - 14, w + 4, 3);
  R(ctx, dk, x - 2, y - 1, w + 4, 2);
  for (let k = 10; k < w - 4; k += 12) R(ctx, shade(col, -0.07), x + k, y - 10, 1, 8);
  // laterales vistos desde arriba
  for (const sx of [x - 2, x + w - 2]) {
    R(ctx, 'rgba(20,16,30,.14)', sx + 4, y - 6, 3, h - 10);
    obox(ctx, top, sx, y - 14, 4, h - 2, 0);
    R(ctx, dk, sx, y + h - 18, 4, 2);
  }
};
D.reception = (ctx, x, y, w, h, o, c) => {
  const col = o.color || c.color;
  const p = BRAND.primary || '#FE3377';
  prr(ctx, SH, x + 2, y + h - 3, w, 6, 2);
  // frente
  obox(ctx, col, x, y - 2, w, h + 1, 1);
  R(ctx, shade(col, 0.1), x + 2, y, w - 4, 1);
  // cubierta
  obox(ctx, shade(col, 0.3), x - 2, y - 10, w + 4, 8, 1);
  R(ctx, shade(col, 0.45), x - 1, y - 10, w + 2, 1);
  R(ctx, shade(col, 0.18), x - 2, y - 4, w + 4, 2);
  ctx.save(); ctx.shadowColor = p; ctx.shadowBlur = 8;
  R(ctx, p, x + 4, y + h - 6, w - 8, 2);
  ctx.restore();
  if (!drawLogo(ctx, x + w / 2, y + h / 2 - 3, 18)) { ctx.fillStyle = p; hexPath(ctx, x + w / 2, y + h / 2 - 3, 6); ctx.fill(); }
};

// ---------- Pantallas y cosas de escritorio ----------
function screenArt(ctx, x, y, w, h, seed) {
  x = Math.round(x); y = Math.round(y); w = Math.round(w); h = Math.round(h);
  const kind = Math.floor(hash(seed, 7, 3) * 3);
  if (kind === 1) {
    // código
    R(ctx, '#1f2433', x, y, w, h);
    const cs = ['#7fdbca', '#ff79c6', '#f1fa8c', '#82aaff'];
    for (let r = 0; r * 2 + 2 < h; r++) R(ctx, cs[(r + seed) % 4], x + 2 + (r % 3) * 2, y + 2 + r * 2, Math.max(2, Math.round((w - 8) * hash(r, seed))), 1);
    return;
  }
  R(ctx, kind ? '#3aa7a0' : '#3d8fd6', x, y, w, h);
  R(ctx, kind ? '#56c2b8' : '#5fb2ee', x, y, w, Math.ceil(h / 2));
  if (kind === 2) {
    for (let k = 0; k < 4 && 3 + k * 4 < w - 2; k++) { const bh = 2 + Math.round(hash(k, seed) * (h - 5)); R(ctx, '#e9fffb', x + 3 + k * 4, y + h - 1 - bh, 2, bh); }
  } else {
    R(ctx, '#e8f6ff', x + 2, y + 2, Math.max(3, Math.round(w * 0.45)), Math.max(2, Math.round(h * 0.4)));
    R(ctx, '#2c6fb0', x + 2, y + 2, Math.max(3, Math.round(w * 0.45)), 1);
    R(ctx, '#bfe6ff', x + w - 7, y + h - 4, 5, 2);
  }
  R(ctx, 'rgba(255,255,255,.45)', x + w - 4, y + 1, 1, 2);
  R(ctx, 'rgba(255,255,255,.45)', x + w - 3, y + 1, 2, 1);
}
function monitorAt(ctx, x, y, w, h, col, seed) {
  const sh = Math.round(h * 0.66);
  pell(ctx, SH, x + w / 2 + 1, y + h - 1, w / 3, 2);
  obox(ctx, shade(col, -0.05), x + w / 2 - 5, y + h - 3, 10, 2, 0);
  R(ctx, OL, x + w / 2 - 2, y + sh, 4, h - sh - 2);
  R(ctx, shade(col, 0.1), x + w / 2 - 1, y + sh, 2, h - sh - 3);
  obox(ctx, col, x, y, w, sh, 1);
  screenArt(ctx, x + 2, y + 2, w - 4, sh - 4, seed);
  R(ctx, shade(col, 0.2), x + 1, y, w - 2, 1);
}
const seedOf = (o) => Math.round((o.x || 0) * 4 + (o.y || 0) * 13);
D.monitor = (ctx, x, y, w, h, o, c) => monitorAt(ctx, x + 1, y, w - 2, h, o.color || c.color, seedOf(o));
D.dualMonitor = (ctx, x, y, w, h, o, c) => {
  monitorAt(ctx, x + 1, y + 1, w / 2 - 2, h - 1, o.color || c.color, seedOf(o));
  monitorAt(ctx, x + w / 2 + 1, y + 1, w / 2 - 2, h - 1, o.color || c.color, seedOf(o) + 1);
};
D.curvedMonitor = (ctx, x, y, w, h, o, c) => {
  const col = o.color || c.color;
  const sh = Math.round(h * 0.66);
  pell(ctx, SH, x + w / 2 + 1, y + h - 1, w / 4, 2);
  obox(ctx, shade(col, -0.05), x + w / 2 - 7, y + h - 3, 14, 2, 0);
  R(ctx, OL, x + w / 2 - 2, y + sh, 4, h - sh - 2);
  // marco curvo: las puntas bajan
  obox(ctx, col, x + 4, y + 1, w - 8, sh - 1, 0);
  obox(ctx, col, x + 1, y + 3, 4, sh - 3, 1);
  obox(ctx, col, x + w - 5, y + 3, 4, sh - 3, 1);
  screenArt(ctx, x + 3, y + 3, w - 6, sh - 5, seedOf(o) + 2);
  R(ctx, 'rgba(0,0,0,.18)', x + 3, y + 3, 2, sh - 5); R(ctx, 'rgba(0,0,0,.18)', x + w - 5, y + 3, 2, sh - 5);
};
D.imac = (ctx, x, y, w, h, o, c) => {
  const col = o.color || c.color;
  const sh = h - 10;
  pell(ctx, SH, x + w / 2 + 1, y + h - 1, w / 3, 2);
  obox(ctx, shade(col, -0.12), x + w / 2 - 7, y + h - 3, 14, 2, 0);
  R(ctx, OL, x + w / 2 - 3, y + sh, 6, h - sh - 2); R(ctx, shade(col, -0.18), x + w / 2 - 2, y + sh, 4, h - sh - 3);
  obox(ctx, col, x + 1, y, w - 2, sh, 1);
  R(ctx, shade(col, -0.08), x + 1, y + sh - 5, w - 2, 5);
  screenArt(ctx, x + 3, y + 2, w - 6, sh - 8, seedOf(o) + 3);
};
D.laptop = (ctx, x, y, w, h, o, c) => {
  const col = o.color || c.color;
  pell(ctx, SH, x + w / 2 + 1, y + h, w / 2, 2);
  obox(ctx, shade(col, -0.25), x + 2, y, w - 4, h - 6, 1);
  screenArt(ctx, x + 4, y + 2, w - 8, h - 9, seedOf(o) + 4);
  obox(ctx, col, x, y + h - 6, w, 5, 1);
  R(ctx, shade(col, 0.2), x + 1, y + h - 6, w - 2, 1);
  for (let k = 0; k < 4; k++) R(ctx, shade(col, -0.25), x + 3 + k * ((w - 6) / 4), y + h - 4, (w - 6) / 4 - 1, 1);
};
D.keyboard = (ctx, x, y, w, h, o, c) => {
  const col = o.color || c.color;
  R(ctx, SH, x + 1, y + h - 1, w, 2);
  obox(ctx, col, x, y + 1, w, h - 2, 1);
  const key = shade(col, 0.32);
  for (let r = 0; r < 2; r++) for (let k = 0; k < Math.floor((w - 3) / 3); k++) R(ctx, key, x + 2 + k * 3, y + 2 + r * 2, 2, 1);
  R(ctx, shade(col, -0.2), x, y + h - 2, w, 1);
};
D.pcTower = (ctx, x, y, w, h, o, c) => {
  const col = o.color || c.color;
  R(ctx, SH, x + 2, y + h - 2, w, 3);
  obox(ctx, col, x, y, w, h - 1, 1);
  R(ctx, shade(col, 0.18), x, y, w, 4);
  R(ctx, shade(col, 0.3), x + 1, y, w - 2, 1);
  R(ctx, shade(col, 0.1), x + 2, y + 6, w - 4, h - 10);
  R(ctx, '#4ee1a0', x + w - 4, y + 7, 2, 1);
  R(ctx, '#8B7BFF', x + 3, y + 9, w - 6, 1); R(ctx, '#FE3377', x + 3, y + 13, w - 6, 1);
};
D.gamingPC = (ctx, x, y, w, h, o, c) => {
  const col = o.color || c.color;
  R(ctx, SH, x + 2, y + h - 2, w, 3);
  obox(ctx, '#1d1d22', x, y, w, h - 1, 1);
  R(ctx, '#34343e', x, y, w, 4);
  R(ctx, '#2a2f3c', x + 2, y + 6, w - 4, h - 11);
  ctx.save(); ctx.shadowColor = col; ctx.shadowBlur = 6;
  R(ctx, col, x + 2, y + 6, w - 4, 1); R(ctx, col, x + 2, y + h - 6, w - 4, 1);
  pell(ctx, col, x + w / 2, y + 12, 3, 3); pell(ctx, col, x + w / 2, y + 20, 3, 3);
  ctx.restore();
  pell(ctx, '#2a2f3c', x + w / 2, y + 12, 1, 1); pell(ctx, '#2a2f3c', x + w / 2, y + 20, 1, 1);
};

// ---------- Sillas ----------
// Vistas: rot 0 mira arriba (respaldo abajo), 1 derecha, 2 abajo, 3 izquierda
function chairBack(ctx, bx, by, bw, bh, s, view) {
  const main = s.wing || s.back;
  obox(ctx, main, bx, by, bw, bh, view === 'side' ? 2 : 3);
  R(ctx, shade(main, 0.16), bx + 2, by, bw - 4, 1);
  R(ctx, shade(main, -0.16), bx + 1, by + bh - 2, bw - 2, 2);
  if (view === 'side') { R(ctx, shade(main, 0.12), bx + 1, by + 2, 1, bh - 4); if (s.wing) R(ctx, s.back, bx + 2, by + 4, 2, bh - 8); return; }
  if (s.wing) {
    prr(ctx, view === 'rear' ? shade(s.back, -0.04) : s.back, bx + 4, by + 3, bw - 8, bh - 6, 2);
    if (view === 'front') {
      R(ctx, shade(s.back, 0.14), bx + 5, by + 4, bw - 10, 1);
      R(ctx, OL, bx + 5, by + 6, 3, 2); R(ctx, OL, bx + bw - 8, by + 6, 3, 2);
      R(ctx, s.wing, bx + bw / 2 - 2, by + bh - 9, 4, 3);
      for (let j = by + 10; j < by + bh - 10; j += 3) R(ctx, shade(s.back, 0.1), bx + 6, j, bw - 12, 1);
    } else R(ctx, s.wing, bx + bw / 2 - 1, by + 4, 2, bh - 8);
  } else if (s.mesh) {
    const m = shade(s.back, view === 'rear' ? 0.08 : 0.16);
    for (let j = by + 3; j < by + bh - 3; j += 2) for (let i = bx + 3 + ((j - by) % 4 === 1 ? 1 : 0); i < bx + bw - 3; i += 2) R(ctx, m, i, j, 1, 1);
  } else if (s.tufts && view === 'front') {
    for (let j = by + 4; j < by + bh - 3; j += 5) for (let i = bx + 4 + ((j - by) % 10 === 4 ? 0 : 2); i < bx + bw - 3; i += 5) R(ctx, shade(s.back, -0.25), i, j, 1, 1);
  } else if (view === 'rear') { prr(ctx, shade(main, 0.07), bx + 3, by + 3, bw - 6, bh - 7, 2); R(ctx, shade(main, -0.06), bx + bw / 2, by + 4, 1, bh - 9); R(ctx, shade(main, 0.18), bx + 4, by + 3, bw - 8, 1); }
  if (s.trim) { R(ctx, s.trim, bx, by + 2, 1, bh - 4); R(ctx, s.trim, bx + bw - 1, by + 2, 1, bh - 4); R(ctx, s.trim, bx + 2, by - 1, bw - 4, 1); }
}
function seatChair(ctx, x, y, rot, s) {
  rot = ((rot || 0) % 4 + 4) % 4;
  if (rot === 3) { mirrorX(ctx, x, 32, () => seatChair(ctx, x, y, 1, s)); return; }
  x = Math.round(x); y = Math.round(y);
  const cx = x + 16;
  const fr = s.frame || '#3b3f4a';
  const seat = s.seat || s.back;
  // base de 5 ruedas y pistón
  pell(ctx, SH, cx + 1, y + 28, 13, 3);
  R(ctx, OL, cx - 11, y + 25, 22, 4);
  R(ctx, fr, cx - 10, y + 26, 20, 2);
  for (const dx of [-12, -2, 9]) R(ctx, '#15161b', cx + dx, y + 28, 3, 3);
  R(ctx, OL, cx - 2, y + 17, 5, 9); R(ctx, '#8a909c', cx - 1, y + 17, 3, 8);
  const arm = (ax, ay, aw, ah) => { obox(ctx, fr, ax, ay, aw, ah, 1); R(ctx, shade(fr, 0.2), ax, ay, aw, 1); };
  if (rot === 2) {
    const bh = s.tall ? 26 : 18;
    chairBack(ctx, cx - 10, y + 10 - bh, 20, bh, s, 'front');
    if (s.tall && s.wing) obox(ctx, s.wing, cx - 5, y + 10 - bh - 4, 10, 4, 1);
    obox(ctx, shade(seat, -0.2), cx - 10, y + 8, 20, 11, 2);
    prr(ctx, seat, cx - 10, y + 8, 20, 8, 2);
    R(ctx, shade(seat, 0.14), cx - 8, y + 9, 16, 1);
    if (s.wing) R(ctx, s.wing, cx - 10, y + 9, 2, 6), R(ctx, s.wing, cx + 8, y + 9, 2, 6);
    if (s.arms !== false) { arm(cx - 14, y + 4, 4, 9); arm(cx + 10, y + 4, 4, 9); R(ctx, fr, cx - 13, y + 13, 2, 4); R(ctx, fr, cx + 11, y + 13, 2, 4); }
  } else if (rot === 0) {
    obox(ctx, seat, cx - 10, y + 4, 20, 10, 2);
    R(ctx, shade(seat, 0.14), cx - 8, y + 5, 16, 1);
    if (s.arms !== false) { arm(cx - 14, y + 7, 4, 10); arm(cx + 10, y + 7, 4, 10); }
    const bh = s.tall ? 24 : 16;
    chairBack(ctx, cx - 10, y + 26 - bh, 20, bh, s, 'rear');
  } else {
    // mira a la derecha: respaldo a la izquierda
    if (s.arms !== false) arm(cx - 6, y + 6, 14, 3);
    obox(ctx, shade(seat, -0.2), cx - 8, y + 9, 18, 10, 2);
    prr(ctx, seat, cx - 8, y + 9, 18, 7, 2);
    R(ctx, shade(seat, 0.14), cx - 6, y + 10, 14, 1);
    const bh = s.tall ? 30 : 22;
    chairBack(ctx, cx - 13, y + 19 - bh, 6, bh, s, 'side');
    if (s.arms !== false) { arm(cx - 6, y + 16, 14, 3); R(ctx, fr, cx + 3, y + 20, 2, 4); }
  }
}
D.chair = (ctx, x, y, w, h, o, c) => {
  const col = o.color || c.color;
  seatChair(ctx, x, y, o.rot, { back: col, seat: shade(col, 0.06), frame: shade(col, -0.25), mesh: true });
};
D.officeChair = (ctx, x, y, w, h, o, c) => {
  const col = o.color || c.color;
  seatChair(ctx, x, y, o.rot, { back: col, seat: col, frame: '#9aa1ad', tall: true, tufts: true });
};
D.gamingChair = (ctx, x, y, w, h, o, c) => {
  const col = o.color || c.color;
  seatChair(ctx, x, y, o.rot, { back: '#26262e', seat: '#2e2f38', wing: col, frame: '#1d1e24', tall: true });
};
D.confChair = (ctx, x, y, w, h, o, c) => {
  const col = o.color || c.color;
  seatChair(ctx, x, y, o.rot, { back: '#3d4250', seat: '#454b5a', frame: '#2b2f3a', trim: col, mesh: true });
};
D.stool = (ctx, x, y, w, h, o, c) => {
  const col = o.color || c.color;
  pell(ctx, SH, x + 17, y + 28, 10, 3);
  for (const lx of [x + 9, x + 21, x + 15]) { R(ctx, OL, lx - 1, y + 14, 4, 15); R(ctx, shade(col, -0.3), lx, y + 14, 2, 14); }
  R(ctx, shade(col, -0.3), x + 10, y + 22, 12, 1);
  pell(ctx, OL, x + 16, y + 14, 11, 7);
  pell(ctx, shade(col, -0.2), x + 16, y + 14, 10, 6);
  pell(ctx, col, x + 16, y + 12, 10, 5);
  R(ctx, shade(col, 0.2), x + 11, y + 9, 6, 1);
};
D.beanBag = (ctx, x, y, w, h, o, c) => {
  const col = o.color || c.color;
  pell(ctx, SH, x + 17, y + 27, 14, 4);
  pell(ctx, OL, x + 16, y + 17, 15, 12);
  pell(ctx, shade(col, -0.18), x + 16, y + 17, 14, 11);
  pell(ctx, col, x + 16, y + 15, 13, 9);
  pell(ctx, shade(col, -0.1), x + 16, y + 15, 7, 4);
  pell(ctx, shade(col, 0.16), x + 11, y + 10, 4, 2);
};

// ---------- Sofás ----------
function tuftMarks(ctx, c, x, y, w, h) {
  for (let j = y + 3; j < y + h - 2; j += 5) for (let i = x + 4; i < x + w - 3; i += 7) { R(ctx, c, i, j - 1, 1, 3); R(ctx, c, i - 1, j, 3, 1); }
}
function sofaH(ctx, x, y, w, h, col, up, arms = [true, true]) {
  const n = Math.max(1, Math.round((w - 12) / 30));
  const dk = shade(col, -0.14), lt = shade(col, 0.1), tf = shade(col, -0.18), armC = shade(col, -0.04);
  const sx = x + (arms[0] ? 7 : 1), sw = w - (arms[0] ? 7 : 1) - (arms[1] ? 7 : 1);
  const cw = sw / n;
  prr(ctx, SH, x + 2, y + h - 4, w - 2, 6, 2);
  const armAt = (ax, ay, ah) => {
    obox(ctx, armC, ax, ay, 8, ah, 2);
    R(ctx, lt, ax + 1, ay, 6, 2);
    R(ctx, dk, ax, ay + ah - 8, 8, 8);
    R(ctx, shade(col, -0.24), ax, ay + ah - 8, 8, 1);
  };
  const legs = (ly) => { for (const lx of [x + 3, x + w - 6, ...(w > 100 ? [x + Math.round(w / 2) - 1] : [])]) R(ctx, OL, lx, ly, 3, 3); };
  if (!up) {
    legs(y + 26);
    // respaldo con cojines
    obox(ctx, dk, x + 2, y - 10, w - 4, 16, 2);
    R(ctx, shade(col, 0.02), x + 2, y - 10, w - 4, 3);
    for (let k = 0; k < n; k++) {
      const kx = Math.round(sx + k * cw);
      obox(ctx, col, kx + 1, y - 6, Math.round(cw) - 2, 10, 2);
      R(ctx, lt, kx + 2, y - 6, Math.round(cw) - 4, 1);
      tuftMarks(ctx, tf, kx + 1, y - 6, Math.round(cw) - 2, 10);
    }
    // asiento y su frente
    obox(ctx, dk, sx, y + 4, sw, 21, 1);
    prr(ctx, col, sx, y + 4, sw, 13, 1);
    R(ctx, lt, sx + 1, y + 5, sw - 2, 1);
    for (let k = 1; k < n; k++) R(ctx, tf, Math.round(sx + k * cw), y + 4, 1, 21);
    for (let k = 0; k < n; k++) tuftMarks(ctx, tf, Math.round(sx + k * cw), y + 5, Math.round(cw), 10);
    R(ctx, shade(col, -0.24), sx, y + 17, sw, 1);
    R(ctx, shade(col, -0.22), sx, y + 24, sw, 1);
    if (arms[0]) armAt(x, y - 4, 30);
    if (arms[1]) armAt(x + w - 8, y - 4, 30);
  } else {
    legs(y + 26);
    // asiento (lejos) y respaldo visto por detrás (cerca)
    obox(ctx, col, sx, y - 4, sw, 14, 1);
    R(ctx, lt, sx + 1, y - 3, sw - 2, 1);
    for (let k = 1; k < n; k++) R(ctx, tf, Math.round(sx + k * cw), y - 4, 1, 14);
    for (let k = 0; k < n; k++) tuftMarks(ctx, tf, Math.round(sx + k * cw), y - 3, Math.round(cw), 10);
    if (arms[0]) armAt(x, y - 6, 32);
    if (arms[1]) armAt(x + w - 8, y - 6, 32);
    obox(ctx, shade(col, -0.2), x + 2, y + 9, w - 4, 17, 2);
    prr(ctx, col, x + 2, y + 9, w - 4, 5, 2);
    R(ctx, lt, x + 4, y + 9, w - 8, 1);
    for (let k = 1; k < n; k++) R(ctx, shade(col, -0.28), Math.round(sx + k * cw), y + 15, 1, 10);
  }
}
function sofaV(ctx, x, y, w, h, col, arms = [true, true]) {
  // mira a la derecha (respaldo a la izquierda)
  const n = Math.max(1, Math.round((h - 12) / 30));
  const dk = shade(col, -0.14), lt = shade(col, 0.1), tf = shade(col, -0.18), armC = shade(col, -0.04);
  prr(ctx, SH, x + 2, y + h - 4, w, 6, 2);
  R(ctx, OL, x + 2, y + h - 3, 3, 3); R(ctx, OL, x + w - 5, y + h - 3, 3, 3);
  if (arms[0]) { obox(ctx, armC, x + 1, y - 6, w - 3, 9, 2); R(ctx, lt, x + 2, y - 6, w - 5, 2); }
  const sy = y + (arms[0] ? 3 : -4), sh = h - (arms[0] ? 3 : -4) - (arms[1] ? 12 : 4);
  const ch = sh / n;
  obox(ctx, dk, x + 1, sy - 2, 11, sh + 4, 2);
  R(ctx, shade(col, 0.02), x + 2, sy - 2, 3, sh + 4);
  obox(ctx, col, x + 11, sy, w - 14, sh, 1);
  R(ctx, lt, x + 12, sy + 1, w - 16, 1);
  for (let k = 0; k < n; k++) {
    const ky = Math.round(sy + k * ch);
    if (k) R(ctx, tf, x + 11, ky, w - 14, 1);
    tuftMarks(ctx, tf, x + 11, ky + 1, w - 14, Math.round(ch) - 1);
  }
  if (arms[1]) {
    obox(ctx, armC, x + 1, y + h - 12, w - 3, 8, 2);
    R(ctx, lt, x + 2, y + h - 12, w - 5, 2);
    R(ctx, dk, x + 1, y + h - 7, w - 3, 3);
  }
}
function sofaDraw(ctx, x, y, w, h, col, rot) {
  rot = (rot || 0) % 4;
  if (rot === 0 || rot === 2) sofaH(ctx, x, y, w, h, col, rot === 2);
  else if (rot === 1) sofaV(ctx, x, y, w, h, col);
  else mirrorX(ctx, x, w, () => sofaV(ctx, x, y, w, h, col));
}
D.sofa = (ctx, x, y, w, h, o, c) => sofaDraw(ctx, x, y, w, h, o.color || c.color, o.rot);
D.sofaSmall = D.sofa;
D.armchair = (ctx, x, y, w, h, o, c) => sofaDraw(ctx, x, y, w, h, o.color || c.color, o.rot);
// Sofá en L: tramo largo arriba y tramo que baja por la derecha
D.lSofa = (ctx, x, y, w, h, o, c) => {
  const col = o.color || c.color;
  mirrorX(ctx, x + w - T, T, () => sofaV(ctx, x + w - T, y + 18, T, h - 18, col, [false, true]));
  sofaH(ctx, x, y, w, T, col, false, [true, false]);
  // esquina del respaldo
  obox(ctx, shade(col, -0.14), x + w - 12, y - 10, 10, 30, 2);
  R(ctx, shade(col, 0.02), x + w - 12, y - 10, 10, 3);
};

// ---------- Mesas ----------
function tableBox(ctx, x, y, w, h, col, { grain = woodish(col), seams = 0 } = {}) {
  const top = y - 4, th = h - 12;
  prr(ctx, SH, x + 3, y + h - 7, w - 2, 7, 2);
  const leg = (lx) => { R(ctx, OL, lx - 1, y + h - 12, 5, 11); R(ctx, shade(col, -0.35), lx, y + h - 12, 3, 10); };
  leg(x + 4); leg(x + w - 7);
  if (w > 200) leg(x + Math.round(w / 2) - 1);
  obox(ctx, shade(col, -0.2), x, top, w, th + 5, 2);
  prr(ctx, col, x, top, w, th, 2);
  R(ctx, shade(col, 0.12), x + 2, top, w - 4, 1);
  R(ctx, shade(col, -0.08), x, top + th - 1, w, 1);
  R(ctx, shade(col, -0.32), x, top + th + 4, w, 1);
  if (grain) for (let r = 0; r < Math.floor(th / 5); r++) for (let k = 0; k < Math.ceil(w / 40); k++) {
    R(ctx, shade(col, -0.06), x + 4 + hash(r, k, x) * (w - 30), top + 3 + r * 5, 10 + hash(k, r, y) * 16, 1);
  }
  if (seams) for (let sx = x + seams; sx < x + w - 8; sx += seams) { R(ctx, shade(col, -0.22), sx, top, 1, th + 5); R(ctx, shade(col, 0.1), sx + 1, top, 1, th); }
}
D.table = (ctx, x, y, w, h, o, c) => tableBox(ctx, x, y, w, h, o.color || c.color);
D.confTable = (ctx, x, y, w, h, o, c) => tableBox(ctx, x, y, w, h, o.color || c.color, { seams: w > 4 * T ? 3 * T + 16 : 0 });
D.meetingTable = (ctx, x, y, w, h, o, c) => {
  tableBox(ctx, x, y, w, h, o.color || c.color);
  // laptops y libretas sobre la mesa
  for (let k = 0; k < Math.floor(w / T) - 1; k += 2) {
    const lx = x + 18 + k * T;
    obox(ctx, '#5b6370', lx, y + 2, 14, 8, 1); R(ctx, '#5fb2ee', lx + 2, y + 4, 10, 4);
    obox(ctx, '#c9ced6', lx - 1, y + 10, 16, 4, 1);
    obox(ctx, '#ffffff', lx + 6, y + h - 34, 10, 12, 0); R(ctx, '#cfd6e0', lx + 8, y + h - 31, 6, 1); R(ctx, '#cfd6e0', lx + 8, y + h - 28, 6, 1);
  }
};
D.roundTable = (ctx, x, y, w, h, o, c) => {
  const col = o.color || c.color;
  const cx = x + w / 2, rx = w / 2 - 2;
  pell(ctx, SH, cx + 2, y + 25, rx, 6);
  for (const lx of [cx - rx + 8, cx + rx - 10]) { R(ctx, OL, lx - 1, y + 16, 5, 13); R(ctx, shade(col, -0.35), lx, y + 16, 3, 12); }
  pell(ctx, OL, cx, y + 15, rx + 1, 12);
  pell(ctx, shade(col, -0.22), cx, y + 15, rx, 11);
  pell(ctx, col, cx, y + 11, rx, 10);
  pell(ctx, shade(col, 0.08), cx - 2, y + 9, rx - 6, 6);
  R(ctx, shade(col, 0.2), cx - rx / 2, y + 2, rx / 2, 1);
};

// ---------- Plantas ----------
const LEAF = '#5aa84a';
D.plant = (ctx, x, y) => {
  pot(ctx, x + 16, y + 31, 16, 12, '#e9e6df');
  leafBlobs(ctx, blobsIn(x + 3, y - 6, 26, 22, 7, 5, 7, 11), LEAF);
};
D.bush = (ctx, x, y) => {
  pell(ctx, SH, x + 17, y + 28, 14, 4);
  leafBlobs(ctx, blobsIn(x + 1, y + 2, 30, 27, 8, 6, 8, Math.round(x + y)), '#4f9e45');
};
D.flowers = (ctx, x, y) => {
  leafBlobs(ctx, blobsIn(x + 2, y + 8, 28, 22, 6, 5, 7, Math.round(x * 3 + y)), '#5aa84a');
  const fl = [['#ff9d2e', '#ffc95c'], ['#ffd23f', '#fff1a8'], ['#f472a8', '#ffc2da']][Math.floor(hash(x, y, 5) * 3)];
  for (const [fx, fy] of blobsIn(x + 3, y + 1, 26, 22, 6, 4, 4, Math.round(x + y * 5)).map((b) => [b[0], b[1]])) {
    pell(ctx, OL, fx, fy, 5, 5); pell(ctx, shade(fl[0], -0.14), fx, fy, 4, 4); pell(ctx, fl[0], fx - 1, fy - 1, 3, 3);
    R(ctx, fl[1], fx - 2, fy - 2, 2, 1); R(ctx, shade(fl[0], -0.25), fx, fy, 1, 1);
  }
};
D.hedge = (ctx, x, y, w, h) => {
  const base = '#5aa84a';
  R(ctx, SH, x, y + h - 3, w, 4);
  R(ctx, OL, x, y + 14, w, h - 15);
  R(ctx, shade(base, -0.1), x, y + 15, w, h - 17);
  R(ctx, shade(base, -0.2), x, y + h - 5, w, 2);
  for (let k = 0; k < 10; k++) {
    const px = x + 1 + hash(k, x, y) * (w - 4), py = y + 16 + hash(y, k, x) * (h - 22);
    R(ctx, shade(base, 0.06), px, py, 2, 1); R(ctx, shade(base, -0.18), px + 1, py + 1, 1, 1);
  }
  leafBlobs(ctx, [[x + 5, y + 10, 6], [x + 16, y + 7, 7], [x + 27, y + 10, 6], [x + 10, y + 15, 6], [x + 22, y + 15, 6]], base);
};
D.planter = (ctx, x, y, w, h, o, c) => {
  const col = o.color || c.color;
  prr(ctx, SH, x + 2, y + h - 4, w - 2, 6, 2);
  obox(ctx, col, x + 1, y + 10, w - 2, h - 11, 1);
  R(ctx, shade(col, 0.16), x + 1, y + 10, w - 2, 3);
  R(ctx, shade(col, -0.12), x + 1, y + h - 5, w - 2, 4);
  const n = Math.round(w / 9);
  const bl = [];
  for (let k = 0; k < n; k++) bl.push([Math.round(x + 6 + k * ((w - 12) / Math.max(1, n - 1))), Math.round(y + 4 + hash(k, x, 1) * 6), 6 + Math.round(hash(k, y, 2) * 2)]);
  for (let k = 0; k < n - 1; k++) bl.push([Math.round(x + 10 + k * ((w - 12) / Math.max(1, n - 1))), y + 12, 5]);
  leafBlobs(ctx, bl, LEAF);
};
D.tallPlant = (ctx, x, y) => {
  pot(ctx, x + 16, y + 31, 16, 12, '#e9e6df');
  const leaves = [[-2.1, 22, 0.5], [-1.2, 26, -0.25], [-1.75, 28, 0.15], [-0.9, 22, 0.35], [-2.5, 20, 0.45], [-1.45, 30, 0]];
  for (const [a, len, b] of leaves) longLeaf(ctx, x + 16, y + 18, a, len, 5, '#4f9e45', b);
  for (const [a, len, b] of [[-1.9, 16, 0.3], [-1.1, 16, -0.2]]) longLeaf(ctx, x + 16, y + 18, a, len, 4, '#6cbf5a', b);
};
D.floorPlant = (ctx, x, y, w, h) => {
  pot(ctx, x + w / 2, y + h - 1, 14, 11, '#d7d2c8');
  for (const [a, len, b] of [[-2.3, 16, 0.4], [-0.8, 16, -0.4], [-1.6, 20, 0.1], [-1.2, 18, 0.25], [-2, 18, -0.2]]) longLeaf(ctx, x + w / 2, y + h - 12, a, len, 4, '#4f9e45', b);
};
D.fern = (ctx, x, y) => {
  pell(ctx, SH, x + 17, y + 27, 14, 4);
  const fr = [[-3.0, 0.3], [-2.55, 0.25], [-2.1, 0.2], [-1.57, 0], [-1.05, -0.2], [-0.6, -0.25], [-0.15, -0.3], [2.75, -0.2], [0.4, 0.2]];
  fr.forEach(([a, b], k) => longLeaf(ctx, x + 16, y + 20, a, k > 6 ? 11 : 15, 5, k % 2 ? '#4f9e45' : '#5fb04f', b));
  for (let k = 0; k < 10; k++) R(ctx, '#86d06e', x + 6 + hash(k, x, 1) * 20, y + 6 + hash(k, y, 2) * 14, 1, 1);
};
D.bamboo = (ctx, x, y, w, h) => {
  // jardinera alta con bambú
  const stalks = [[6, 44], [11, 52], [16, 40], [21, 50], [26, 46]];
  for (const [sx, sh] of stalks) {
    R(ctx, OL, x + sx - 2, y + 20 - sh, 4, sh);
    R(ctx, '#7cc26a', x + sx - 1, y + 20 - sh, 2, sh);
    for (let j = y + 24 - sh; j < y + 18; j += 8) R(ctx, '#4a8a3e', x + sx - 1, j, 2, 1);
  }
  for (const [sx, sh] of stalks) {
    longLeaf(ctx, x + sx, y + 22 - sh, -2.4, 9, 3, '#5aa84a', 0.3);
    longLeaf(ctx, x + sx, y + 26 - sh, -0.7, 9, 3, '#4f9e45', -0.3);
    longLeaf(ctx, x + sx, y + 36 - sh, sx > 16 ? -0.5 : -2.6, 8, 3, '#6cbf5a', 0);
  }
  prr(ctx, SH, x + 2, y + 27, 30, 5, 2);
  obox(ctx, '#e2e5ea', x + 2, y + 16, 28, 14, 1);
  R(ctx, '#f4f6f8', x + 2, y + 16, 28, 3);
  R(ctx, '#4a3426', x + 3, y + 17, 26, 1);
  R(ctx, '#c4c9d1', x + 2, y + 26, 28, 4);
};
D.plantShelf = (ctx, x, y, w, h) => {
  const wd = '#a0673f';
  prr(ctx, SH, x + 2, y + h - 3, w - 2, 5, 2);
  for (const px of [x + 1, x + w - 4]) { R(ctx, OL, px - 1, y - 23, 5, h + 23); R(ctx, wd, px, y - 22, 3, h + 21); R(ctx, shade(wd, 0.15), px, y - 22, 1, h + 21); }
  for (const sy of [y - 6, y + 10, y + h - 3]) { R(ctx, OL, x, sy - 1, w, 5); R(ctx, wd, x + 1, sy, w - 2, 3); R(ctx, shade(wd, 0.15), x + 1, sy, w - 2, 1); }
  let k = 0;
  for (const sy of [y - 6, y + 10, y + h - 3]) for (let px = x + 10; px < x + w - 6; px += 14, k++) {
    const red = hash(k, x, y) > 0.7;
    pot(ctx, px, sy, 8, 5, '#f3f1ec');
    leafBlobs(ctx, [[px - 3, sy - 8, 3], [px + 3, sy - 9, 3], [px, sy - 12, 4]], red ? '#d93a3a' : LEAF);
  }
};
D.willowTree = (ctx, x, y, w, h) => {
  const cx = x + w / 2;
  pell(ctx, SH, cx + 4, y + h - 8, w / 2 - 4, 8);
  pell(ctx, OL, cx, y + h - 10, 15, 7); pell(ctx, '#e7efe0', cx, y + h - 10, 14, 6);
  R(ctx, OL, cx - 6, y + h - 44, 12, 36);
  R(ctx, '#7a4f33', cx - 5, y + h - 44, 10, 35);
  R(ctx, '#9a6845', cx - 4, y + h - 44, 3, 34);
  R(ctx, '#5c3a26', cx + 2, y + h - 36, 2, 20);
  const base = '#86cc66';
  // mechones que caen, de atrás hacia adelante
  const clumps = [[-34, 0, 22, 34], [-12, -6, 24, 30], [12, -6, 24, 30], [34, 0, 22, 34], [-24, 12, 22, 38], [0, 8, 24, 40], [24, 12, 22, 38]];
  for (const [dx, dy, cw, ch] of clumps) {
    const bx = Math.round(cx + dx - cw / 2), by = y + 6 + dy;
    obox(ctx, shade(base, -0.12), bx, by, cw, ch, 6);
    prr(ctx, base, bx, by, cw, ch - 6, 6);
    prr(ctx, shade(base, 0.1), bx + 3, by + 1, cw - 10, 5, 3);
    for (let i = bx + 2; i < bx + cw - 2; i += 3) {
      R(ctx, shade(base, -0.18), i, by + 8 + ((i - bx) % 2) * 3, 1, ch - 12);
      R(ctx, shade(base, 0.14), i + 1, by + 6, 1, ch - 16);
    }
    // borde de abajo dentado
    for (let i = bx; i < bx + cw; i += 2) R(ctx, OL, i, by + ch - ((i - bx) % 4 ? 1 : 3), 1, 2);
  }
};
D.arcLamp = (ctx, x, y, w, h, o, c) => {
  const col = o.color || c.color;
  // base a la derecha, arco que cuelga a la izquierda
  pell(ctx, SH, x + w - 6, y + h - 2, 7, 2);
  pell(ctx, OL, x + w - 6, y + h - 4, 7, 4); pell(ctx, '#aeb5bf', x + w - 6, y + h - 4, 6, 3);
  ctx.strokeStyle = OL; ctx.lineWidth = 4;
  ctx.beginPath(); ctx.arc(x + w / 2 - 2, y + 4, w / 2 - 4, 0.05, Math.PI + 0.3, true); ctx.stroke();
  ctx.strokeStyle = '#cdd3da'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(x + w / 2 - 2, y + 4, w / 2 - 4, 0.05, Math.PI + 0.3, true); ctx.stroke();
  R(ctx, OL, x + w - 7, y + 4, 4, h - 8); R(ctx, '#cdd3da', x + w - 6, y + 4, 2, h - 8);
  pell(ctx, OL, x + 6, y + 6, 7, 5); pell(ctx, '#e9edf2', x + 6, y + 6, 6, 4); R(ctx, shade(col, 0.2), x + 2, y + 8, 8, 2);
};

// ---------- Juegos ----------
D.arcade = (ctx, x, y, w, h, o, c) => {
  const col = o.color || c.color;
  prr(ctx, SH, x + 2, y + h - 3, w, 5, 2);
  obox(ctx, col, x + 1, y - 26, w - 2, h + 25, 1);
  R(ctx, shade(col, 0.16), x + 1, y - 26, 2, h + 25); R(ctx, shade(col, -0.18), x + w - 3, y - 26, 2, h + 25);
  R(ctx, '#9aa3b0', x + 3, y - 26, w - 6, 4); R(ctx, '#b9c1cc', x + 3, y - 26, w - 6, 1);
  // cartel
  R(ctx, '#2b2f3a', x + 3, y - 22, w - 6, 7);
  R(ctx, '#ff9d2e', x + 5, y - 21, 6, 3); R(ctx, '#ffd23f', x + 12, y - 21, 8, 2); R(ctx, '#8B7BFF', x + 21, y - 21, 6, 4); R(ctx, '#4ee1a0', x + 7, y - 18, 14, 2);
  // pantalla
  R(ctx, '#1b1f2a', x + 4, y - 14, w - 8, 15);
  R(ctx, '#58c9e8', x + 6, y - 12, w - 12, 11);
  R(ctx, '#2bb673', x + 6, y - 4, w - 12, 3);
  R(ctx, '#ff5d8f', x + 10, y - 8, 4, 4); R(ctx, '#ffd23f', x + 18, y - 10, 3, 3); R(ctx, '#fff', x + 7, y - 11, 3, 1);
  // tablero de controles
  R(ctx, '#c9b6ff', x + 3, y + 2, w - 6, 6); R(ctx, '#a48ff0', x + 3, y + 7, w - 6, 2);
  R(ctx, OL, x + 7, y + 2, 2, 3); pell(ctx, '#e63946', x + 8, y + 3, 2, 2);
  for (const [bx, bc] of [[14, '#e63946'], [18, '#3a86ff'], [22, '#ffd23f'], [26, '#2bb673']]) { R(ctx, OL, x + bx - 1, y + 3, 3, 3); R(ctx, bc, x + bx - 1, y + 3, 2, 2); }
  // gabinete y monedero
  R(ctx, '#4a4f5c', x + 4, y + 10, w - 8, h - 12);
  R(ctx, OL, x + 9, y + 15, 14, 8); R(ctx, '#2b2f3a', x + 10, y + 16, 12, 6);
  R(ctx, '#e63946', x + 12, y + 17, 2, 4); R(ctx, '#e63946', x + 18, y + 17, 2, 4);
};
D.foosball = (ctx, x, y, w, h) => {
  const wd = '#7a4a2b';
  prr(ctx, SH, x + 3, y + h - 6, w - 2, 7, 2);
  for (const lx of [x + 4, x + w - 8]) { R(ctx, OL, lx - 1, y + h - 12, 6, 11); R(ctx, '#2b2f3a', lx, y + h - 12, 4, 10); }
  obox(ctx, wd, x + 2, y + 2, w - 4, h - 12, 1);
  R(ctx, shade(wd, 0.14), x + 2, y + 2, w - 4, 2);
  R(ctx, shade(wd, -0.2), x + 2, y + h - 16, w - 4, 6);
  // cancha
  const fx = x + 8, fy = y + 7, fw = w - 16, fh = h - 26;
  R(ctx, '#3f9a4a', fx, fy, fw, fh);
  for (let k = 0; k < fw; k += 8) R(ctx, '#47a853', fx + k, fy, 4, fh);
  R(ctx, '#e9fff0', fx + fw / 2, fy, 1, fh);
  pell(ctx, '#e9fff0', fx + fw / 2, fy + fh / 2, 5, 5); pell(ctx, '#47a853', fx + fw / 2, fy + fh / 2, 4, 4);
  R(ctx, '#e9fff0', fx, fy + fh / 2 - 6, 4, 12); R(ctx, '#e9fff0', fx + fw - 4, fy + fh / 2 - 6, 4, 12);
  // barras con jugadores
  for (let k = 0; k < 8; k++) {
    const bx = Math.round(fx + 6 + k * ((fw - 12) / 7));
    R(ctx, OL, bx - 1, y - 2, 3, h - 10); R(ctx, '#c9ced6', bx, y - 2, 1, h - 10);
    const team = [0, 1, 0, 1, 0, 1, 0, 1][k] ? '#2b4fa8' : '#e63946';
    R(ctx, team === '#e63946' ? '#e63946' : '#2b4fa8', bx - 1, y - 5, 3, 3);
    const n = [1, 2, 3, 4, 4, 3, 2, 1][k];
    for (let p = 0; p < n; p++) { const py = Math.round(fy + (p + 0.5) * (fh / n)) - 2; R(ctx, OL, bx - 2, py - 1, 5, 6); R(ctx, team, bx - 1, py, 3, 4); R(ctx, '#ffdbac', bx - 1, py, 3, 1); }
  }
  pell(ctx, '#fff', fx + fw / 2 + 6, fy + fh / 2 + 3, 1.5, 1.5);
};
D.gong = (ctx, x, y, w, h) => {
  const fr = '#3a3f4b';
  prr(ctx, SH, x + 4, y + h - 6, w - 4, 6, 2);
  R(ctx, OL, x + 7, y + 6, 6, h - 10); R(ctx, fr, x + 8, y + 6, 4, h - 11);
  R(ctx, OL, x + w - 13, y + 6, 6, h - 10); R(ctx, fr, x + w - 12, y + 6, 4, h - 11);
  obox(ctx, fr, x + 2, y + 4, w - 4, 6, 0); R(ctx, '#565d6c', x + 2, y + 4, w - 4, 2);
  obox(ctx, fr, x + 4, y + h - 8, w - 8, 4, 0);
  R(ctx, '#2b2f3a', x + w / 2 - 10, y + 10, 1, 6); R(ctx, '#2b2f3a', x + w / 2 + 9, y + 10, 1, 6);
  const cx = x + w / 2, cy = y + h / 2 + 4;
  opell(ctx, '#c98a2b', cx, cy, 18, 18);
  pell(ctx, '#e8a93a', cx - 1, cy - 1, 16, 16);
  pell(ctx, '#d79630', cx, cy, 10, 10);
  pell(ctx, '#f2c25a', cx - 1, cy - 1, 8, 8);
  pell(ctx, '#ffe39a', cx - 6, cy - 8, 3, 2);
  // mazo
  R(ctx, OL, cx + 1, cy - 4, 3, 14); R(ctx, '#f3e6c8', cx + 2, cy - 4, 1, 13);
  pell(ctx, OL, cx + 3, cy - 6, 3, 3); pell(ctx, '#f3e6c8', cx + 3, cy - 6, 2, 2);
};
D.poolTable = (ctx, x, y, w, h, o, c) => {
  const col = o.color || c.color;
  const wd = '#6b3f22';
  prr(ctx, SH, x + 3, y + h - 6, w - 2, 7, 2);
  for (const lx of [x + 5, x + w - 10, x + w / 2 - 2]) { R(ctx, OL, lx - 1, y + h - 12, 7, 11); R(ctx, shade(wd, -0.15), lx, y + h - 12, 5, 10); }
  obox(ctx, wd, x, y, w, h - 8, 2);
  R(ctx, shade(wd, 0.16), x + 2, y, w - 4, 1);
  R(ctx, shade(wd, -0.18), x, y + h - 15, w, 6);
  R(ctx, OL, x + 6, y + 6, w - 12, h - 26);
  R(ctx, col, x + 7, y + 7, w - 14, h - 28);
  R(ctx, shade(col, -0.12), x + 7, y + 7, w - 14, 2);
  R(ctx, shade(col, 0.08), x + w * 0.25, y + 7, 1, h - 28);
  for (const [px, py] of [[7, 7], [w / 2, 6], [w - 8, 7], [7, h - 22], [w / 2, h - 21], [w - 8, h - 22]]) pell(ctx, '#111', x + px, y + py, 3, 3);
  for (const [k, cc] of [[0, '#fff'], [1, '#ffd23f'], [2, '#e63946'], [3, '#3a86ff'], [4, '#111'], [5, '#ff7b00']]) {
    const bx = k ? x + w * 0.62 + (k % 3) * 5 : x + w * 0.28, by = y + (h - 14) / 2 + (k ? (Math.floor(k / 3) * 5 - 2) : 0);
    pell(ctx, OL, bx, by, 3, 3); pell(ctx, cc, bx, by, 2, 2); R(ctx, 'rgba(255,255,255,.7)', bx - 1, by - 2, 1, 1);
  }
  R(ctx, OL, x + w * 0.1, y + h / 2 - 9, w * 0.17, 3); R(ctx, '#e8c48a', x + w * 0.1 + 1, y + h / 2 - 8, w * 0.17 - 2, 1);
};
D.pingPong = (ctx, x, y, w, h, o, c) => {
  const col = o.color || c.color;
  prr(ctx, SH, x + 3, y + h - 6, w - 2, 7, 2);
  for (const lx of [x + 8, x + w - 12]) { R(ctx, OL, lx - 1, y + h - 13, 5, 12); R(ctx, '#3b3f4a', lx, y + h - 13, 3, 11); }
  obox(ctx, shade(col, -0.25), x + 2, y + 2, w - 4, h - 14, 1);
  prr(ctx, col, x + 2, y + 2, w - 4, h - 19, 1);
  R(ctx, '#fff', x + 3, y + 3, w - 6, 1); R(ctx, '#fff', x + 3, y + h - 19, w - 6, 1);
  R(ctx, '#fff', x + 3, y + 3, 1, h - 21); R(ctx, '#fff', x + w - 4, y + 3, 1, h - 21);
  R(ctx, 'rgba(255,255,255,.7)', x + 3, y + Math.round((h - 17) / 2), w - 6, 1);
  // red
  R(ctx, OL, x + w / 2 - 2, y - 4, 4, h - 14);
  R(ctx, '#f1f3f6', x + w / 2 - 1, y - 4, 2, h - 15);
  for (let j = y - 2; j < y + h - 18; j += 3) R(ctx, '#aeb5bf', x + w / 2 - 1, j, 2, 1);
  pell(ctx, '#fff', x + w * 0.7, y + h / 2 - 8, 2, 2);
  // paletas
  for (const [px, pc] of [[x + 14, '#e63946'], [x + w - 16, '#111']]) { pell(ctx, OL, px, y + h / 2 - 6, 5, 5); pell(ctx, pc, px, y + h / 2 - 6, 4, 4); R(ctx, '#c99c72', px - 1, y + h / 2 - 2, 2, 5); }
};
D.aquarium = (ctx, x, y, w, h) => {
  prr(ctx, SH, x + 3, y + h - 4, w - 2, 5, 2);
  // mueble
  obox(ctx, '#3b3f4a', x + 2, y + 10, w - 4, h - 11, 1);
  R(ctx, '#4a4f5c', x + 2, y + 10, w - 4, 2);
  R(ctx, '#2b2f3a', x + w / 2, y + 13, 1, h - 16);
  R(ctx, '#aeb5bf', x + w / 2 - 4, y + 18, 2, 4); R(ctx, '#aeb5bf', x + w / 2 + 3, y + 18, 2, 4);
  // pecera
  obox(ctx, '#7fd0ee', x + 3, y - 18, w - 6, 28, 0);
  R(ctx, '#9ee0f6', x + 3, y - 18, w - 6, 4);
  R(ctx, '#e7d6a8', x + 3, y + 5, w - 6, 5);
  R(ctx, '#d4c08e', x + 3, y + 9, w - 6, 1);
  for (const [sx, sh] of [[8, 12], [12, 8], [w - 12, 14], [w - 16, 9]]) { R(ctx, '#3f9a4a', x + sx, y + 6 - sh, 2, sh); R(ctx, '#5fb04f', x + sx + 1, y + 6 - sh + 2, 2, 3); }
  for (const [fx, fy, fc] of [[w * 0.35, -8, '#ff8a3d'], [w * 0.6, -2, '#ffd23f'], [w * 0.5, -12, '#f472a8']]) { R(ctx, fc, x + fx, y + fy, 5, 3); R(ctx, fc, x + fx - 2, y + fy - 1, 2, 5); R(ctx, '#111', x + fx + 3, y + fy, 1, 1); }
  for (const [bx, by] of [[w - 22, -6], [w - 21, -11], [w - 23, -15]]) R(ctx, 'rgba(255,255,255,.8)', x + bx, y + by, 2, 2);
  R(ctx, 'rgba(255,255,255,.6)', x + 5, y - 16, 2, 18);
  obox(ctx, '#2b2f3a', x + 2, y - 21, w - 4, 3, 0);
};

// ---------- Muebles de pared y oficina ----------
D.bookshelf = (ctx, x, y, w, h) => {
  const wd = '#5b6270';
  prr(ctx, SH, x + 2, y + h - 3, w - 2, 5, 2);
  obox(ctx, wd, x, y - 28, w, h + 27, 0);
  R(ctx, shade(wd, 0.18), x, y - 28, w, 4);
  R(ctx, '#2f3440', x + 3, y - 23, w - 6, h + 20);
  const cols = ['#e63946', '#3a86ff', '#2bb673', '#ffd23f', '#9b5de5', '#f4a261', '#e9edf2', '#157A6E'];
  const rows = 3, rh = Math.floor((h + 20) / rows);
  for (let r = 0; r < rows; r++) {
    const by = y - 23 + r * rh;
    let bx = x + 4, k = 0;
    while (bx < x + w - 6) {
      const bw = 2 + Math.floor(hash(bx, by, 1) * 3), bh = rh - 4 - Math.floor(hash(bx, by, 2) * 4);
      if (hash(bx, by, 4) > 0.86 && bx + 8 < x + w - 6) { pot(ctx, bx + 4, by + rh - 2, 7, 4, '#f3f1ec'); leafBlobs(ctx, [[bx + 4, by + rh - 9, 3]], LEAF); bx += 10; continue; }
      const cc = cols[Math.floor(hash(bx, k, by) * cols.length)];
      R(ctx, cc, bx, by + rh - 2 - bh, bw, bh);
      R(ctx, shade(cc, 0.2), bx, by + rh - 2 - bh, 1, bh);
      bx += bw + (hash(bx, by, 3) > 0.8 ? 2 : 0); k++;
    }
    R(ctx, wd, x + 3, by + rh - 2, w - 6, 2);
  }
};
D.shelf = (ctx, x, y, w, h) => {
  const wd = '#f3f1ec';
  prr(ctx, SH, x + 2, y + h - 3, w - 2, 5, 2);
  obox(ctx, wd, x, y - 20, w, h + 19, 0);
  R(ctx, '#ffffff', x, y - 20, w, 3);
  const cell = Math.floor((w - 4) / 4);
  for (let r = 0; r < 2; r++) for (let k = 0; k < 4; k++) {
    const cx0 = x + 2 + k * cell, cy0 = y - 16 + r * 23;
    R(ctx, '#d5d9df', cx0 + 1, cy0, cell - 2, 19);
    const it = Math.floor(hash(k, r, x) * 4);
    if (it === 0) { pot(ctx, cx0 + cell / 2, cy0 + 18, 8, 5, '#2b2f3a'); leafBlobs(ctx, [[cx0 + cell / 2, cy0 + 9, 4]], LEAF); }
    else if (it === 1) { R(ctx, '#3a86ff', cx0 + 4, cy0 + 6, 3, 12); R(ctx, '#e63946', cx0 + 7, cy0 + 8, 3, 10); R(ctx, '#ffd23f', cx0 + 10, cy0 + 5, 3, 13); }
    else if (it === 2) { obox(ctx, '#f4a261', cx0 + 5, cy0 + 9, cell - 10, 8, 1); }
    else { pell(ctx, OL, cx0 + cell / 2, cy0 + 13, 5, 5); pell(ctx, '#8ecae6', cx0 + cell / 2, cy0 + 13, 4, 4); }
  }
};
D.cabinet = (ctx, x, y, w, h, o, c) => {
  const col = o.color || c.color;
  prr(ctx, SH, x + 3, y + h - 3, w - 4, 5, 2);
  obox(ctx, col, x + 3, y - 16, w - 6, h + 15, 1);
  R(ctx, shade(col, 0.14), x + 3, y - 16, w - 6, 4);
  for (let k = 0; k < 3; k++) {
    const dy = y - 10 + k * 13;
    R(ctx, shade(col, -0.18), x + 5, dy + 11, w - 10, 1);
    R(ctx, shade(col, 0.08), x + 5, dy, w - 10, 1);
    R(ctx, OL, x + 12, dy + 4, 8, 3); R(ctx, '#e9edf2', x + 13, dy + 5, 6, 1);
  }
};
D.whiteboard = (ctx, x, y, w, h) => {
  prr(ctx, SH, x + 4, y + h - 4, w - 6, 5, 2);
  for (const lx of [x + 6, x + w - 9]) { R(ctx, OL, lx - 1, y - 2, 5, h + 1); R(ctx, '#aeb5bf', lx, y - 2, 3, h); }
  for (const lx of [x + 2, x + w - 13]) obox(ctx, '#8b93a1', lx, y + h - 3, 11, 2, 0);
  obox(ctx, '#c9ced6', x + 2, y - 24, w - 4, 26, 1);
  R(ctx, '#ffffff', x + 4, y - 22, w - 8, 21);
  R(ctx, '#3a86ff', x + 8, y - 18, 10, 6); R(ctx, '#3a86ff', x + 9, y - 17, 8, 4);
  R(ctx, '#ffffff', x + 10, y - 16, 6, 2);
  ctx.strokeStyle = '#3a86ff'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(x + 22, y - 6); ctx.lineTo(x + 30, y - 10); ctx.lineTo(x + 38, y - 8); ctx.lineTo(x + 46, y - 15); ctx.stroke();
  R(ctx, '#ffd23f', x + w - 20, y - 20, 8, 7); R(ctx, '#ff9d2e', x + w - 14, y - 16, 8, 7);
  for (let k = 0; k < 3; k++) R(ctx, '#2b2f3a', x + 22 + k * 10, y - 19, 7, 1);
  R(ctx, '#8b93a1', x + 4, y, w - 8, 2);
  R(ctx, '#e63946', x + 10, y - 1, 6, 1); R(ctx, '#2b2f3a', x + 18, y - 1, 6, 1); R(ctx, '#3a86ff', x + 26, y - 1, 6, 1);
};
D.easel = (ctx, x, y, w, h) => {
  pell(ctx, SH, x + 17, y + h - 2, 11, 3);
  for (const [lx, ex] of [[x + 9, x + 4], [x + 23, x + 28]]) { ctx.strokeStyle = OL; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(lx, y); ctx.lineTo(ex, y + h - 1); ctx.stroke(); ctx.strokeStyle = '#3b3f4a'; ctx.lineWidth = 2; ctx.stroke(); }
  obox(ctx, '#ffffff', x + 5, y - 18, 22, 24, 0);
  R(ctx, '#3b3f4a', x + 4, y - 20, 24, 3);
  R(ctx, '#2bb673', x + 9, y - 4, 3, 6); R(ctx, '#2bb673', x + 13, y - 8, 3, 10); R(ctx, '#2bb673', x + 17, y - 12, 3, 14);
  R(ctx, '#3a86ff', x + 8, y - 14, 10, 1);
  R(ctx, '#3b3f4a', x + 4, y + 6, 24, 2);
};
D.clock = (ctx, x, y) => {
  opell(ctx, '#2b6fb0', x + 16, y + 14, 10, 10);
  pell(ctx, '#f6f8fb', x + 16, y + 14, 8, 8);
  for (const [dx, dy] of [[0, -7], [7, 0], [0, 6], [-7, 0]]) R(ctx, '#2b2f3a', x + 16 + dx, y + 14 + dy, 1, 1);
  R(ctx, '#2b2f3a', x + 16, y + 9, 1, 6); R(ctx, '#2b2f3a', x + 16, y + 14, 4, 1);
  R(ctx, '#e63946', x + 16, y + 14, 1, 1);
};
D.painting = (ctx, x, y, w, h, o, c) => {
  const col = o.color || c.color;
  R(ctx, SH, x + 6, y + h - 6, w - 8, 3);
  obox(ctx, '#b88a3e', x + 4, y + 2, w - 8, h - 8, 0);
  R(ctx, '#e0b86a', x + 4, y + 2, w - 8, 1);
  const ix = x + 7, iy = y + 5, iw = w - 14, ih = h - 14;
  R(ctx, '#9fd4ec', ix, iy, iw, ih);
  R(ctx, '#c7e8f5', ix, iy, iw, 3);
  pell(ctx, '#ffd23f', ix + iw - 8, iy + 5, 3, 3);
  ctx.fillStyle = shade(col, -0.1);
  ctx.beginPath(); ctx.moveTo(ix, iy + ih); ctx.lineTo(ix + iw * 0.35, iy + 6); ctx.lineTo(ix + iw * 0.7, iy + ih); ctx.fill();
  ctx.fillStyle = col;
  ctx.beginPath(); ctx.moveTo(ix + iw * 0.4, iy + ih); ctx.lineTo(ix + iw * 0.68, iy + 9); ctx.lineTo(ix + iw, iy + ih); ctx.fill();
  R(ctx, '#5aa84a', ix, iy + ih - 3, iw, 3);
};
D.window = (ctx, x, y, w, h) => {
  // ventanal con marco oscuro y vidrios celestes
  obox(ctx, '#3d4250', x + 1, y - 2, w - 2, h + 2, 0);
  const n = Math.max(2, Math.round(w / 32)) * 3;
  const pw = (w - 6) / n;
  for (let k = 0; k < n; k++) for (let r = 0; r < 3; r++) {
    const px = Math.round(x + 3 + k * pw), py = y + r * 10;
    R(ctx, r === 1 ? '#a9e2d6' : '#bfeee4', px + 1, py + 1, Math.round(pw) - 2, 8);
    R(ctx, 'rgba(255,255,255,.6)', px + 2, py + 2, 2, 1);
  }
  R(ctx, '#f3f4f6', x, y + h - 2, w, 3);
};
D.globe = (ctx, x, y, w, h) => {
  const cx = x + w / 2;
  pell(ctx, SH, cx + 1, y + h - 1, 6, 2);
  obox(ctx, '#7a4a2b', cx - 5, y + h - 4, 10, 3, 0);
  R(ctx, OL, cx - 1, y + 14, 3, h - 18); R(ctx, '#b88a3e', cx, y + 14, 1, h - 18);
  ctx.strokeStyle = '#b88a3e'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(cx, y + 9, 9, -2.2, 1.4); ctx.stroke();
  opell(ctx, '#3a86ff', cx, y + 9, 7, 7);
  R(ctx, '#2bb673', cx - 5, y + 5, 4, 3); R(ctx, '#2bb673', cx - 3, y + 8, 3, 4); R(ctx, '#2bb673', cx + 1, y + 4, 4, 2); R(ctx, '#2bb673', cx + 2, y + 9, 3, 4);
  R(ctx, 'rgba(255,255,255,.6)', cx - 4, y + 4, 2, 1);
};
D.bikeRack = (ctx, x, y, w, h) => {
  R(ctx, SH, x + 2, y + h - 4, w - 2, 4);
  const cols = ['#3a86ff', '#2bb673', '#e63946'];
  for (let k = 0; k < 3; k++) {
    const bx = x + 2 + k * (w / 3), by = y + 6 + (k % 2) * 4, col = cols[k];
    for (const wx of [bx + 7, bx + 23]) { ctx.strokeStyle = OL; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(wx, by + 12, 6, 0, Math.PI * 2); ctx.stroke(); ctx.strokeStyle = '#555b66'; ctx.lineWidth = 1; ctx.stroke(); }
    ctx.strokeStyle = col; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(bx + 7, by + 12); ctx.lineTo(bx + 13, by + 4); ctx.lineTo(bx + 21, by + 4); ctx.lineTo(bx + 23, by + 12); ctx.moveTo(bx + 13, by + 4); ctx.lineTo(bx + 15, by + 12); ctx.lineTo(bx + 21, by + 4); ctx.stroke();
    R(ctx, OL, bx + 11, by + 1, 5, 2); R(ctx, OL, bx + 20, by + 1, 2, 4);
  }
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
  // los muebles en 3/4 sobresalen hacia arriba (respaldo, gabinete, plantas altas)
  const scale = Math.min((width - pad * 2) / (c.w * T), (height - pad * 2) / (c.h * T + 26), 2);
  ctx.save();
  ctx.translate(Math.round(width / 2 - (c.w * T * scale) / 2), Math.round(height / 2 - (c.h * T * scale) / 2 + 12 * scale));
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
// step: 0 quieto, 1-4 ciclo de caminar. pose: postura de una acción (ver POSES en shared/sprite.js).
export function drawAvatar(ctx, cx, by, avatar = {}, dir = 'down', step = 0, sit = false, blink = false, pose = null) {
  // Parpadeo: la misma ficha con los ojos cerrados (no aplica a personajes dibujados ni lentes de sol)
  if (blink && !avatar?.sprite && avatar?.eyewear !== 'sunglasses' && (dir === 'down' || dir === 'left' || dir === 'right')) avatar = { ...avatar, eyes: 'sleepy' };
  if (sit) {
    // Sentado: más abajo y sin piernas (quedan detrás del asiento)
    const top = Math.round(by - FRAME_H + 4);
    ctx.save();
    ctx.beginPath();
    ctx.rect(cx - FRAME_W, top - 2, FRAME_W * 2, FRAME_H - 8);
    ctx.clip();
    drawSprite(ctx, getSheet(avatar), Math.round(cx - FRAME_W / 2), top, dir, 0, 1, pose);
    ctx.restore();
    return;
  }
  ctx.fillStyle = 'rgba(0,0,0,.2)';
  ctx.beginPath();
  ctx.ellipse(cx, by - 1, 10, 3.5, 0, 0, Math.PI * 2);
  ctx.fill();
  drawSprite(ctx, getSheet(avatar), Math.round(cx - FRAME_W / 2), Math.round(by - FRAME_H + 1), dir, step, 1, pose);
}

// Vista previa: el cuadro quieto en la dirección pedida, escalado a número entero.
export function drawAvatarPreview(canvas, avatar, dir = 'down', step = 0, pose = null) {
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.imageSmoothingEnabled = false;
  const k = Math.max(1, Math.floor(Math.min(canvas.width / FRAME_W, canvas.height / FRAME_H)));
  drawSprite(ctx, getSheet(avatar), Math.round((canvas.width - FRAME_W * k) / 2), Math.round((canvas.height - FRAME_H * k) / 2), dir, step, k, pose);
}

// Solo la cara (para usar como foto de perfil cuando no hay foto)
export function drawAvatarFace(canvas, avatar) {
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.imageSmoothingEnabled = false;
  const sheet = getSheet(avatar);
  if (sheet) ctx.drawImage(sheet, 4, 8, 24, 24, 0, 0, canvas.width, canvas.height);
}

// Gorrito de fiesta (el día de su cumpleaños)
export function drawPartyHat(ctx, cx, by, sit = false) {
  const top = Math.round(by - FRAME_H + (sit ? 4 : 1));
  const x = Math.round(cx), y = top + 9;
  ctx.save();
  ctx.fillStyle = '#FE3377';
  ctx.beginPath(); ctx.moveTo(x - 6, y); ctx.lineTo(x + 6, y); ctx.lineTo(x + 1, y - 13); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#FFCC00';
  ctx.fillRect(x - 4, y - 5, 7, 2);
  ctx.fillRect(x - 2, y - 9, 4, 2);
  ctx.beginPath(); ctx.arc(x + 1, y - 13, 2.4, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}
