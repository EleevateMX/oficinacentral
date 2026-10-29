// Hotel (agente D): ilustración de la llegada — la torre de MeDed Friends al atardecer.
// Todo procedural en un lienzo chiquito (pixel-art) que se escala sin suavizar: cielo con bandas,
// sol retro, estrellas, tres capas de ciudad con paralaje, la torre con ventanas encendidas,
// letreros de neón rosa/amarillo, el elevador de vidrio subiendo y bajando, calle con reflejos.
const PINK = '#FE3377', YELLOW = '#FFCC00';

function rng(seed) {
  let a = seed >>> 0;
  return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

// Letras de pixel (5 de alto, ancho variable) para los letreros
const GLYPH = {
  M: ['10001', '11011', '10101', '10001', '10001'], D: ['1110', '1001', '1001', '1001', '1110'],
  e: ['0000', '0110', '1111', '1000', '0111'], d: ['0001', '0001', '0111', '1001', '0111'],
  F: ['1111', '1000', '1110', '1000', '1000'], R: ['1110', '1001', '1110', '1010', '1001'], I: ['111', '010', '010', '010', '111'],
  E: ['1111', '1000', '1110', '1000', '1111'], N: ['1001', '1101', '1011', '1001', '1001'], S: ['0111', '1000', '0110', '0001', '1110'],
};
const glyphW = (ch) => (GLYPH[ch] ? GLYPH[ch][0].length : 3);
// Ancho de una palabra horizontal (en px, con k px por punto)
const wordW = (s, k) => [...s].reduce((n, ch) => n + (glyphW(ch) + 1) * k, -k);
function text(g, s, x, y, c, k = 1, vertical = false) {
  g.fillStyle = c;
  let ox = x;
  [...s].forEach((ch, i) => {
    const gl = GLYPH[ch];
    const w = glyphW(ch);
    if (gl) {
      const px = vertical ? x + Math.floor((5 - w) / 2) * k : ox, py = vertical ? y + i * 6 * k : y;
      for (let r = 0; r < 5; r++) for (let q = 0; q < w; q++) if (gl[r][q] === '1') g.fillRect(px + q * k, py + r * k, k, k);
    }
    ox += (w + 1) * k;
  });
}
function neon(g, s, x, y, c, k, vertical, on) {
  g.globalAlpha = on ? 0.35 : 0.12;
  for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) text(g, s, x + dx, y + dy, c, k, vertical);
  g.globalAlpha = on ? 1 : 0.45;
  text(g, s, x, y, c, k, vertical);
  g.globalAlpha = 1;
}

// Ciudad: una capa de edificios (se calcula una vez por tamaño)
function skyline(W, H, seed, base, minH, maxH, wMin, wMax) {
  const r = rng(seed);
  const out = [];
  let x = -40;
  while (x < W + 80) {
    const w = Math.round(wMin + r() * (wMax - wMin));
    const h = Math.round(minH + r() * (maxH - minH));
    out.push({ x, w, h, roof: r(), lit: Array.from({ length: 40 }, () => r()), base });
    x += w + Math.round(r() * 3);
  }
  return out;
}

export class HotelScene {
  constructor() { this.key = ''; this.mouse = 0.5; }

  layout(W, H) {
    const key = `${W}x${H}`;
    if (key === this.key) return;
    this.key = key;
    const r = rng(7);
    this.stars = Array.from({ length: 70 }, () => ({ x: r() * W, y: r() * H * 0.5, p: r() * 6, b: r() }));
    this.far = skyline(W, H, 11, H * 0.78, H * 0.12, H * 0.3, 10, 22);
    this.mid = skyline(W, H, 23, H * 0.84, H * 0.1, H * 0.34, 12, 26);
    this.near = skyline(W, H, 31, H * 0.92, H * 0.06, H * 0.18, 14, 30);
    this.palms = Array.from({ length: 6 }, (_, i) => ({ x: (i + 0.5) * (W / 6) + (r() - 0.5) * 20, h: H * (0.12 + r() * 0.06) }));
    this.cars = Array.from({ length: 5 }, () => ({ s: 0.02 + r() * 0.03, o: r(), lane: r() < 0.5 ? 0 : 1, c: r() < 0.5 ? YELLOW : PINK }));
  }

  draw(g, W, H, t) {
    this.layout(W, H);
    const horizon = Math.round(H * 0.8);
    // ---- cielo en bandas (atardecer) ----
    const bands = ['#130b2a', '#1d0f38', '#2b1446', '#40195a', '#5e1f63', '#86275f', '#b2365f', '#d84f5f', '#f2715c', '#ff9a5e', '#ffbf6b'];
    const bh = horizon / bands.length;
    bands.forEach((c, i) => {
      g.fillStyle = c; g.fillRect(0, Math.floor(i * bh), W, Math.ceil(bh) + 1);
      // tramado de 1 px entre bandas
      if (i < bands.length - 1) { g.fillStyle = bands[i + 1]; for (let x = (i % 2); x < W; x += 2) g.fillRect(x, Math.floor((i + 1) * bh) - 1, 1, 1); }
    });
    // ---- estrellas ----
    for (const s of this.stars) {
      const tw = 0.5 + 0.5 * Math.sin(t / 700 + s.p);
      if (s.y > horizon * 0.55) continue;
      g.fillStyle = `rgba(255,240,250,${(0.25 + 0.75 * tw * s.b).toFixed(2)})`;
      g.fillRect(Math.round(s.x), Math.round(s.y), 1, 1);
    }
    // ---- sol retro ----
    const sx = Math.round(W * 0.3 + (this.mouse - 0.5) * -4), sy = Math.round(horizon - H * 0.3), sr = Math.round(Math.min(W, H) * 0.14);
    for (let y = -sr; y <= sr; y++) {
      if (sy + y > horizon) break;
      const w = Math.round(Math.sqrt(sr * sr - y * y));
      const k = (y + sr) / (2 * sr);
      if (y > 0 && (y + Math.floor(t / 180)) % Math.max(3, 8 - Math.floor(y / 4)) < 1 + y / 9) continue; // franjas
      g.fillStyle = k < 0.45 ? '#ffe680' : k < 0.7 ? '#ffb85c' : '#ff7a6b';
      g.fillRect(sx - w, sy + y, w * 2, 1);
    }
    const par = (k) => Math.round((this.mouse - 0.5) * -14 * k - (t / 1000) * 0.6 * k) % W;
    // ---- ciudad lejana ----
    this.city(g, this.far, W, par(0.25), '#3c1f58', '#5a2a6e', 0.08, t);
    this.city(g, this.mid, W, par(0.55), '#2a1540', '#3a1d55', 0.22, t);

    // ---- la torre ----
    this.tower(g, W, H, horizon, t);

    // ---- ciudad cercana y palmeras ----
    this.city(g, this.near, W, par(1), '#170d26', '#1f1233', 0.15, t);
    const pp = par(1.3);
    for (const p of this.palms) this.palm(g, ((p.x + pp) % (W + 40) + W + 40) % (W + 40) - 20, H * 0.93, p.h, t);

    // ---- calle con reflejos ----
    const ry = Math.round(H * 0.92);
    g.fillStyle = '#100a1a'; g.fillRect(0, ry, W, H - ry);
    g.fillStyle = '#2a1b38'; g.fillRect(0, ry, W, 1);
    for (let x = (Math.floor(t / 60) % 12); x < W; x += 12) { g.fillStyle = 'rgba(255,204,0,.35)'; g.fillRect(x, ry + Math.round((H - ry) * 0.55), 5, 1); }
    // reflejo rosa de la torre
    const tx = Math.round(W * 0.6);
    for (let y = ry + 2; y < H; y += 2) { g.fillStyle = `rgba(254,51,119,${(0.28 - (y - ry) / (H - ry) * 0.2).toFixed(2)})`; g.fillRect(tx - 6 + ((y + Math.floor(t / 120)) % 3), y, 12, 1); }
    // coches
    for (const c of this.cars) {
      const x = ((((t / 1000) * c.s * W * 4 + c.o * W) % (W + 20)) + W + 20) % (W + 20) - 10;
      const y = ry + 3 + c.lane * Math.max(2, Math.round((H - ry) * 0.35));
      g.fillStyle = c.c; g.fillRect(Math.round(c.lane ? W - x : x), y, 3, 1);
      g.globalAlpha = 0.35; g.fillRect(Math.round(c.lane ? W - x + 3 : x - 6), y, 6, 1); g.globalAlpha = 1;
    }
  }

  city(g, list, W, off, col, edge, litP, t) {
    for (const b of list) {
      let x = b.x + off;
      x = ((x % (W + 120)) + W + 120) % (W + 120) - 60;
      const y = Math.round(b.base - b.h);
      g.fillStyle = col; g.fillRect(Math.round(x), y, b.w, Math.ceil(b.base - y) + 40);
      g.fillStyle = edge; g.fillRect(Math.round(x), y, 1, Math.ceil(b.base - y));
      if (b.roof > 0.7) { g.fillStyle = col; g.fillRect(Math.round(x + b.w / 2 - 1), y - 4, 2, 4); g.fillStyle = (Math.floor(t / 600) + b.w) % 2 ? '#ff4a6e' : '#5a1530'; g.fillRect(Math.round(x + b.w / 2 - 1), y - 5, 2, 1); }
      // ventanitas
      let k = 0;
      for (let wy = y + 3; wy < b.base - 2; wy += 3) for (let wx = 2; wx < b.w - 2; wx += 3) {
        const v = b.lit[k++ % b.lit.length];
        if (v < litP || (v < litP * 1.4 && (Math.floor(t / 3000) + k) % 5 === 0)) { g.fillStyle = v < litP * 0.5 ? '#ffd27a' : '#ff9ec0'; g.fillRect(Math.round(x + wx), wy, 1, 1); }
      }
    }
  }

  tower(g, W, H, horizon, t) {
    const tw = Math.max(46, Math.round(W * 0.17)), x0 = Math.round(W * 0.6 - tw / 2 + (this.mouse - 0.5) * -6);
    const base = Math.round(H * 0.93), top = Math.round(H * 0.14);
    // cuerpo con escalonado arriba
    g.fillStyle = '#22142f'; g.fillRect(x0, top + 14, tw, base - top - 14);
    g.fillStyle = '#2c1a3d'; g.fillRect(x0 + 4, top + 6, tw - 8, 10);
    g.fillStyle = '#331f46'; g.fillRect(x0 + 10, top, tw - 20, 8);
    g.fillStyle = '#3d2654'; g.fillRect(x0, top + 14, 2, base - top - 14); // luz de la orilla
    g.fillStyle = '#170d22'; g.fillRect(x0 + tw - 3, top + 14, 3, base - top - 14);
    // antena con luz
    g.fillStyle = '#331f46'; g.fillRect(x0 + tw / 2 - 1, top - 12, 2, 12);
    g.fillStyle = Math.floor(t / 500) % 2 ? '#ff3b5f' : '#561226'; g.fillRect(x0 + tw / 2 - 1, top - 13, 2, 2);
    // ventanas
    const r = rng(99);
    for (let y = top + 20, row = 0; y < base - 16; y += 4, row++) {
      for (let x = x0 + 5, col = 0; x < x0 + tw - 14; x += 4, col++) {
        const v = r();
        const on = v < 0.62 || (v < 0.75 && (Math.floor(t / 2200) + row * 3 + col) % 7 === 0);
        g.fillStyle = !on ? '#1a1026' : v < 0.12 ? '#ff8ab4' : v < 0.3 ? '#ffe3a0' : '#ffc96b';
        g.fillRect(x, y, 2, 2);
      }
    }
    // elevador de vidrio (al costado derecho)
    const ex = x0 + tw - 11;
    g.fillStyle = 'rgba(140,200,255,.18)'; g.fillRect(ex, top + 18, 6, base - top - 34);
    g.fillStyle = 'rgba(160,220,255,.35)'; g.fillRect(ex, top + 18, 1, base - top - 34);
    const span = base - top - 46;
    const cy = Math.round(top + 20 + span * (0.5 + 0.5 * Math.sin(t / 2600)));
    g.fillStyle = YELLOW; g.fillRect(ex + 1, cy, 4, 6);
    g.fillStyle = '#fff6c8'; g.fillRect(ex + 2, cy + 1, 2, 2);
    g.globalAlpha = 0.25; g.fillStyle = YELLOW; g.fillRect(ex - 1, cy - 1, 8, 8); g.globalAlpha = 1;
    // letreros de neón
    const k = tw >= 70 ? 2 : 1;
    const word = 'MeDed';
    const ww = wordW(word, k);
    const flick = !(Math.floor(t / 90) % 47 === 0);
    neon(g, word, Math.round(x0 + tw / 2 - ww / 2), top - 2 - 5 * k - 3, YELLOW, k, false, flick);
    neon(g, 'FRIENDS', x0 - 5 * k - 4, top + 26, PINK, k, true, true);
    // marco de neón en la corona
    g.fillStyle = PINK; g.globalAlpha = 0.9;
    g.fillRect(x0 + 10, top, tw - 20, 1); g.fillRect(x0 + 4, top + 6, tw - 8, 1); g.fillRect(x0, top + 14, tw, 1);
    g.globalAlpha = 1;
    // entrada con marquesina
    const dw = Math.round(tw * 0.4), dx = Math.round(x0 + tw / 2 - dw / 2);
    g.fillStyle = '#ffd98a'; g.fillRect(dx, base - 9, dw, 9);
    g.fillStyle = '#e8b65a'; g.fillRect(dx + Math.round(dw / 2), base - 9, 1, 9);
    g.fillStyle = PINK; g.fillRect(dx - 4, base - 12, dw + 8, 3);
    g.fillStyle = YELLOW; for (let x = dx - 4; x < dx + dw + 4; x += 3) g.fillRect(x + (Math.floor(t / 250) % 3), base - 12, 1, 1);
    g.globalAlpha = 0.18; g.fillStyle = '#ffd98a'; g.fillRect(dx - 8, base - 2, dw + 16, 4); g.globalAlpha = 1;
  }

  palm(g, x, base, h, t) {
    x = Math.round(x);
    const sway = Math.round(Math.sin(t / 1300 + x) * 1);
    g.fillStyle = '#0d0716';
    for (let y = 0; y < h; y++) g.fillRect(x + Math.round(Math.sin(y / h * 1.6) * 3) + (y > h * 0.7 ? sway : 0), Math.round(base - y), 2, 1);
    const tx = x + Math.round(Math.sin(1.6) * 3) + sway, ty = Math.round(base - h);
    for (const [dx, dy, len] of [[-1, 0.4, 9], [1, 0.4, 9], [-1, -0.2, 7], [1, -0.2, 7], [0.3, -1, 5], [-0.4, 1, 6]]) {
      for (let i = 0; i < len; i++) g.fillRect(Math.round(tx + dx * i), Math.round(ty + dy * i + (i * i) / 14), 2, 1);
    }
  }
}
