// Dibujo del mapa en canvas, estilo pixel-art, sin imágenes externas.
import { TILE } from '@shared/map.js';
import { CATALOG, objSize } from '@shared/catalog.js';

const T = TILE;

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
  if (below) {
    R(ctx, '#46515d', x, y, T, T);
    R(ctx, '#3d4752', x, y, T, 2);
  } else {
    R(ctx, '#66727f', x, y, T, T);
    R(ctx, '#7c8894', x, y, T, 3);
    R(ctx, '#56616d', x, y + T - 4, T, 4);
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
  for (let j = 0; j < f.H; j++) for (let i = 0; i < f.W; i++) if (f.walls[j][i] === true) drawWall(ctx, f, i, j);
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
D.chair = (ctx, x, y, w, h, o, c) => {
  const col = o.color || c.color;
  const r = o.rot || 0;
  RR(ctx, 'rgba(0,0,0,.12)', x + 7, y + 22, 18, 6, 3);
  RR(ctx, col, x + 7, y + 8, 18, 16, 4);
  RR(ctx, shade(col, 0.12), x + 9, y + 10, 14, 10, 3);
  const back = shade(col, -0.15);
  if (r === 0) RR(ctx, back, x + 6, y + 20, 20, 8, 3);
  if (r === 2) RR(ctx, back, x + 6, y + 3, 20, 8, 3);
  if (r === 1) RR(ctx, back, x + 4, y + 6, 7, 20, 3);
  if (r === 3) RR(ctx, back, x + 21, y + 6, 7, 20, 3);
};
D.gamingChair = (ctx, x, y, w, h, o, c) => {
  D.chair(ctx, x, y, w, h, o, c);
  const col = o.color || c.color;
  const r = o.rot || 0;
  if (r === 0) R(ctx, '#222', x + 12, y + 22, 8, 4);
  if (r === 2) R(ctx, '#222', x + 12, y + 5, 8, 4);
  R(ctx, shade(col, 0.25), x + 14, y + 12, 4, 6);
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
  (D[type] || fallback)(ctx, 0, 0, c.w * T, c.h * T, { type, color: color || null, rot: type.includes('hair') ? 2 : 0 }, c);
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
export const AVATAR_OPTIONS = {
  skin: ['#ffdbac', '#f1c27d', '#e0ac69', '#c68642', '#8d5524', '#5c3a21'],
  hair: ['#111111', '#2c1b10', '#5a3825', '#a0522d', '#e6c07b', '#d9d9d9', '#e63946', '#7b3fbf', '#3a86ff', '#2bb673'],
  hairStyle: ['short', 'long', 'spiky', 'bun', 'curly', 'bald'],
  shirt: ['#e63946', '#f4a261', '#ffd23f', '#2a9d8f', '#2bb673', '#3a86ff', '#1d3557', '#8338ec', '#ff006e', '#ffffff', '#2b2d42', '#6b705c'],
  pants: ['#2b2d42', '#3d405b', '#1d3557', '#6b705c', '#7a4a2b', '#111111', '#a3b1c6'],
  shoes: ['#222222', '#ffffff', '#e63946', '#7a4a2b'],
  accessory: ['none', 'glasses', 'headphones', 'cap', 'beanie', 'sunglasses'],
};

export const HAIR_STYLE_NAMES = { short: 'Corto', long: 'Largo', spiky: 'Picudo', bun: 'Chongo', curly: 'Rizado', bald: 'Rapado' };
export const ACCESSORY_NAMES = { none: 'Nada', glasses: 'Lentes', headphones: 'Audífonos', cap: 'Gorra', beanie: 'Gorro', sunglasses: 'Lentes de sol' };

// cx = centro, by = base (pies). Tamaño ~ 22x30 px.
export function drawAvatar(ctx, cx, by, av = {}, dir = 'down', step = 0) {
  const skin = av.skin || '#f1c27d';
  const hair = av.hair || '#2c1b10';
  const shirt = av.shirt || '#3a86ff';
  const pants = av.pants || '#2b2d42';
  const shoes = av.shoes || '#222222';
  const style = av.hairStyle || 'short';
  const acc = av.accessory || 'none';
  const x = Math.round(cx - 11);
  const y = Math.round(by - 31);
  const bob = step ? 1 : 0;

  ctx.fillStyle = 'rgba(0,0,0,.18)';
  ctx.beginPath(); ctx.ellipse(cx, by - 1, 10, 3, 0, 0, Math.PI * 2); ctx.fill();

  // Piernas
  const l = step === 1 ? -2 : step === 2 ? 2 : 0;
  R(ctx, pants, x + 6, y + 23, 4, 6 + Math.max(0, l));
  R(ctx, pants, x + 12, y + 23, 4, 6 + Math.max(0, -l));
  R(ctx, shoes, x + 5, y + 28 + Math.max(0, l), 5, 2);
  R(ctx, shoes, x + 12, y + 28 + Math.max(0, -l), 5, 2);

  // Torso y brazos
  const ty = y + 14 - bob;
  R(ctx, shirt, x + 4, ty, 14, 10);
  R(ctx, shade(shirt, -0.15), x + 4, ty + 8, 14, 2);
  if (dir === 'left' || dir === 'right') {
    R(ctx, shade(shirt, -0.1), x + 9, ty + 1, 4, 7);
    R(ctx, skin, x + 9, ty + 8, 4, 2);
  } else {
    R(ctx, shirt, x + 1, ty + 1, 3, 7); R(ctx, shirt, x + 18, ty + 1, 3, 7);
    R(ctx, skin, x + 1, ty + 8, 3, 2); R(ctx, skin, x + 18, ty + 8, 3, 2);
  }

  // Cabeza
  const hy = y + 1 - bob;
  RR(ctx, skin, x + 3, hy + 1, 16, 13, 4);

  // Cabello (detrás)
  if (style === 'long') R(ctx, hair, x + 2, hy + 4, 18, dir === 'up' ? 14 : 12);
  if (style === 'bun') circle(ctx, hair, x + 11, hy - 1, 4);

  // Cara
  if (dir !== 'up') {
    const eo = dir === 'left' ? -3 : dir === 'right' ? 3 : 0;
    if (dir === 'down') { R(ctx, '#222', x + 7 + eo, hy + 7, 2, 3); R(ctx, '#222', x + 13 + eo, hy + 7, 2, 3); }
    else R(ctx, '#222', x + 10 + eo + (dir === 'right' ? 2 : 0), hy + 7, 2, 3);
    if (dir === 'down') R(ctx, shade(skin, -0.15), x + 10, hy + 11, 2, 1);
  }

  // Cabello (encima)
  if (style !== 'bald') {
    if (dir === 'up') RR(ctx, hair, x + 3, hy, 16, 12, 4);
    else {
      RR(ctx, hair, x + 2, hy, 18, 6, 4);
      if (style === 'spiky') for (let k = 0; k < 4; k++) R(ctx, hair, x + 3 + k * 4, hy - 3 + (k % 2), 3, 4);
      if (style === 'curly') for (let k = 0; k < 5; k++) circle(ctx, hair, x + 4 + k * 3.5, hy + 1, 3);
      if (dir !== 'right') R(ctx, hair, x + 2, hy + 3, 3, style === 'long' ? 12 : 5);
      if (dir !== 'left') R(ctx, hair, x + 17, hy + 3, 3, style === 'long' ? 12 : 5);
    }
  }

  // Accesorios
  if (dir !== 'up' && (acc === 'glasses' || acc === 'sunglasses')) {
    const eo = dir === 'left' ? -3 : dir === 'right' ? 3 : 0;
    const col = acc === 'sunglasses' ? '#111' : 'rgba(255,255,255,.35)';
    if (dir === 'down') {
      R(ctx, col, x + 6 + eo, hy + 6, 4, 4); R(ctx, col, x + 12 + eo, hy + 6, 4, 4);
      ctx.strokeStyle = '#111'; ctx.lineWidth = 1;
      ctx.strokeRect(x + 6.5 + eo, hy + 6.5, 3, 3); ctx.strokeRect(x + 12.5 + eo, hy + 6.5, 3, 3);
      R(ctx, '#111', x + 9 + eo, hy + 7, 3, 1);
    } else R(ctx, col === '#111' ? '#111' : '#333', x + 9 + eo + (dir === 'right' ? 1 : 0), hy + 6, 5, 4);
  }
  if (acc === 'headphones') {
    ctx.strokeStyle = '#1f9d55'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(x + 11, hy + 6, 9, Math.PI * 1.05, Math.PI * 1.95); ctx.stroke();
    R(ctx, '#2bb673', x + 0, hy + 5, 4, 7); R(ctx, '#2bb673', x + 18, hy + 5, 4, 7);
  }
  if (acc === 'cap') {
    RR(ctx, '#e63946', x + 2, hy - 2, 18, 6, 3);
    if (dir === 'down') R(ctx, '#c1121f', x + 4, hy + 3, 14, 2);
    if (dir === 'left') R(ctx, '#c1121f', x - 2, hy + 2, 8, 2);
    if (dir === 'right') R(ctx, '#c1121f', x + 16, hy + 2, 8, 2);
  }
  if (acc === 'beanie') { RR(ctx, '#3a86ff', x + 2, hy - 3, 18, 8, 4); R(ctx, '#1d4ed8', x + 2, hy + 3, 18, 2); circle(ctx, '#fff', x + 11, hy - 3, 2); }
}

export function drawAvatarPreview(canvas, avatar, dir = 'down') {
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.imageSmoothingEnabled = false;
  const s = Math.floor(Math.min(canvas.width / 26, canvas.height / 36));
  ctx.save();
  ctx.scale(s, s);
  drawAvatar(ctx, canvas.width / s / 2, canvas.height / s / 2 + 16, avatar, dir, 0);
  ctx.restore();
}
