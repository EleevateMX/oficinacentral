// Personajes chibi en pixel-art, generados por código.
//
// Hoja de sprites: 3 columnas × 4 filas de cuadros de 32×48 px (96×192 en total).
//   columnas: 0 = quieto, 1 = paso A, 2 = paso B
//   filas:    0 = abajo, 1 = izquierda, 2 = derecha, 3 = arriba
// Los pies quedan en la fila 46 de cada cuadro. Cualquier hoja con este formato
// (hecha a mano en Aseprite/Piskel o generada aquí) funciona en la oficina.

export const FRAME_W = 32;
export const FRAME_H = 48;
export const SHEET_W = FRAME_W * 3;
export const SHEET_H = FRAME_H * 4;
export const DIRS = ['down', 'left', 'right', 'up'];

export const SPRITE_OPTIONS = {
  skin: ['#ffe0c7', '#f6c9a0', '#e8b07f', '#c98a57', '#9a6038', '#6b3f22'],
  hair: ['#1b1720', '#3b2418', '#6a3b22', '#b5652f', '#e7c06a', '#e9e4dc', '#d8434f', '#7c4ad9', '#3d7be0', '#2fa36b', '#f28fb8'],
  hairStyle: ['short', 'long', 'bob', 'spiky', 'bun', 'curly', 'buzz'],
  top: ['tee', 'hoodie', 'sweater', 'shirt', 'blazer', 'overalls'],
  shirt: ['#FF8A3D', '#157A6E', '#5B3FB8', '#0A2B2C', '#e5484d', '#f08c3a', '#f2c94c', '#2fb67c', '#1f9e9e', '#3d7be0', '#2a3f78', '#8150e0', '#e05ca5', '#f4f4f6', '#2b2d38', '#7d8471'],
  accent: ['#f4f4f6', '#FF8A3D', '#2b2d38', '#e5484d', '#f2c94c', '#3d7be0', '#2fb67c'],
  pants: ['#2b2d42', '#3e4462', '#24477a', '#6b705c', '#7a4a2b', '#151519', '#a9b6cc'],
  shoes: ['#1d1d22', '#f4f4f6', '#e5484d', '#7a4a2b'],
  accessory: ['none', 'glasses', 'sunglasses', 'headphones', 'headset', 'cap', 'beanie'],
};

export const STYLE_NAMES = {
  hairStyle: { short: 'Corto', long: 'Largo', bob: 'Bob', spiky: 'Picudo', bun: 'Chongo', curly: 'Rizado', buzz: 'Rapado' },
  top: { tee: 'Playera', hoodie: 'Sudadera', sweater: 'Suéter', shirt: 'Camisa y corbata', blazer: 'Saco', overalls: 'Overol' },
  accessory: { none: 'Nada', glasses: 'Lentes', sunglasses: 'Lentes de sol', headphones: 'Audífonos', headset: 'Diadema', cap: 'Gorra', beanie: 'Gorro' },
};

// Personajes listos para elegir
export const PRESETS = [
  { id: 'dev', name: 'Dev con audífonos', skin: '#f6c9a0', hair: '#1b1720', hairStyle: 'short', top: 'hoodie', shirt: '#e5484d', accent: '#f4f4f6', pants: '#2b2d42', shoes: '#f4f4f6', accessory: 'headphones' },
  { id: 'disenadora', name: 'Diseñadora', skin: '#e8b07f', hair: '#7c4ad9', hairStyle: 'long', top: 'sweater', shirt: '#f2c94c', accent: '#f4f4f6', pants: '#24477a', shoes: '#1d1d22', accessory: 'glasses' },
  { id: 'gamer', name: 'Gamer', skin: '#c98a57', hair: '#3b2418', hairStyle: 'short', top: 'tee', shirt: '#2b2d38', accent: '#2fb67c', pants: '#3e4462', shoes: '#e5484d', accessory: 'cap' },
  { id: 'admin', name: 'Admin', skin: '#ffe0c7', hair: '#6a3b22', hairStyle: 'short', top: 'shirt', shirt: '#f4f4f6', accent: '#3d7be0', pants: '#2a3f78', shoes: '#7a4a2b', accessory: 'none' },
  { id: 'soporte', name: 'Soporte', skin: '#9a6038', hair: '#1b1720', hairStyle: 'bun', top: 'tee', shirt: '#1f9e9e', accent: '#f4f4f6', pants: '#2b2d42', shoes: '#1d1d22', accessory: 'headset' },
  { id: 'artista', name: 'Artista', skin: '#f6c9a0', hair: '#d8434f', hairStyle: 'bob', top: 'overalls', shirt: '#f4f4f6', accent: '#f08c3a', pants: '#f08c3a', shoes: '#1d1d22', accessory: 'beanie' },
  { id: 'ejecutiva', name: 'Ejecutiva', skin: '#e8b07f', hair: '#3b2418', hairStyle: 'bob', top: 'blazer', shirt: '#2b2d38', accent: '#f4f4f6', pants: '#2b2d38', shoes: '#1d1d22', accessory: 'none' },
  { id: 'rookie', name: 'Rookie', skin: '#ffe0c7', hair: '#e7c06a', hairStyle: 'spiky', top: 'hoodie', shirt: '#2fb67c', accent: '#f4f4f6', pants: '#3e4462', shoes: '#f4f4f6', accessory: 'none' },
  { id: 'creativo', name: 'Creativo', skin: '#6b3f22', hair: '#1b1720', hairStyle: 'curly', top: 'tee', shirt: '#8150e0', accent: '#f2c94c', pants: '#151519', shoes: '#f4f4f6', accessory: 'sunglasses' },
  { id: 'liveops', name: 'LiveOps', skin: '#f6c9a0', hair: '#e9e4dc', hairStyle: 'buzz', top: 'sweater', shirt: '#3d7be0', accent: '#f4f4f6', pants: '#6b705c', shoes: '#7a4a2b', accessory: 'glasses' },
];

export const DEFAULT_SPEC = PRESETS[0];

// ---------- utilidades de color ----------
function hexToRgb(hex) {
  const n = parseInt(String(hex || '#888888').slice(1, 7), 16) || 0;
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function shade([r, g, b], amt) {
  const f = (v) => Math.max(0, Math.min(255, Math.round(amt < 0 ? v * (1 + amt) : v + (255 - v) * amt)));
  return [f(r), f(g), f(b)];
}

// ---------- lienzo de un cuadro ----------
class Frame {
  constructor() {
    this.px = new Array(FRAME_W * FRAME_H).fill(null);
  }
  set(x, y, c) {
    x = Math.round(x); y = Math.round(y);
    if (x >= 0 && y >= 0 && x < FRAME_W && y < FRAME_H) this.px[y * FRAME_W + x] = c;
  }
  get(x, y) {
    return x >= 0 && y >= 0 && x < FRAME_W && y < FRAME_H ? this.px[y * FRAME_W + x] : null;
  }
  rect(x, y, w, h, c) {
    for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) this.set(i, j, c);
  }
  // Rectángulo con esquinas recortadas (radio en píxeles)
  rrect(x, y, w, h, r, c) {
    for (let j = 0; j < h; j++) {
      for (let i = 0; i < w; i++) {
        const dx = i < r ? r - i : i >= w - r ? i - (w - r - 1) : 0;
        const dy = j < r ? r - j : j >= h - r ? j - (h - r - 1) : 0;
        if (dx && dy && dx * dx + dy * dy > r * r + 1) continue;
        this.set(x + i, y + j, c);
      }
    }
  }
  disc(cx, cy, r, c) {
    for (let j = -r; j <= r; j++) for (let i = -r; i <= r; i++) if (i * i + j * j <= r * r + r * 0.6) this.set(cx + i, cy + j, c);
  }
  mirror() {
    const f = new Frame();
    for (let y = 0; y < FRAME_H; y++) for (let x = 0; x < FRAME_W; x++) f.set(FRAME_W - 1 - x, y, this.get(x, y));
    return f;
  }
  // Contorno oscuro estilo pixel-art (usa el color vecino oscurecido)
  outline() {
    const out = this.px.slice();
    for (let y = 0; y < FRAME_H; y++) {
      for (let x = 0; x < FRAME_W; x++) {
        if (this.get(x, y)) continue;
        const n = this.get(x, y + 1) || this.get(x - 1, y) || this.get(x + 1, y) || this.get(x, y - 1);
        if (n) out[y * FRAME_W + x] = shade(n, -0.62);
      }
    }
    this.px = out;
  }
}

// ---------- dibujo de un personaje ----------
function drawFrame(spec, dir, step) {
  const f = new Frame();
  const C = {
    skin: hexToRgb(spec.skin), hair: hexToRgb(spec.hair), top: hexToRgb(spec.shirt), accent: hexToRgb(spec.accent || '#f4f4f6'),
    pants: hexToRgb(spec.pants), shoes: hexToRgb(spec.shoes), eye: [38, 30, 48], white: [255, 255, 255],
  };
  const skinD = shade(C.skin, -0.16);
  const hairL = shade(C.hair, 0.22);
  const hairD = shade(C.hair, -0.22);
  const topD = shade(C.top, -0.2);
  const topL = shade(C.top, 0.15);
  const side = dir === 'left' || dir === 'right';
  const walking = step !== 0;
  const bob = walking ? -1 : 0;
  const style = spec.top || 'tee';
  const acc = spec.accessory || 'none';
  const hs = spec.hairStyle || 'short';

  // Se dibuja siempre "abajo", "izquierda" o "arriba"; "derecha" es el espejo de izquierda.
  const d = dir === 'right' ? 'left' : dir;

  // ----- Cabello largo (detrás del cuerpo)
  if ((hs === 'long') && d !== 'left') f.rect(6, 16 + bob, 20, d === 'up' ? 20 : 17, hairD);
  if (hs === 'long' && d === 'left') f.rect(13, 16 + bob, 11, 18, hairD);

  // ----- Piernas y zapatos
  const legTop = 39;
  if (!side) {
    const lift = (k) => (step === 1 && k === 0) || (step === 2 && k === 1);
    [[11, 0], [17, 1]].forEach(([x, k]) => {
      const up = lift(k) ? 1 : 0;
      const pantsC = style === 'overalls' ? C.pants : C.pants;
      f.rect(x, legTop, 4, 6 - up, pantsC);
      f.rect(x, legTop, 1, 6 - up, shade(pantsC, 0.1));
      f.rect(x - (k === 0 ? 1 : 0), 45 - up, 5, 2, C.shoes);
      f.rect(x - (k === 0 ? 1 : 0), 46 - up, 5, 1, shade(C.shoes, -0.25));
    });
  } else {
    const off = step === 1 ? 2 : step === 2 ? -2 : 0;
    // pierna trasera
    f.rect(15 - off, legTop, 4, 6, shade(C.pants, -0.15));
    f.rect(14 - off, 45, 5, 2, shade(C.shoes, -0.2));
    // pierna delantera
    f.rect(13 + off, legTop, 4, 6, C.pants);
    f.rect(12 + off, 45, 5, 2, C.shoes);
    f.rect(12 + off, 46, 5, 1, shade(C.shoes, -0.25));
  }

  // ----- Torso
  const ty = 30 + bob;
  const tx = side ? 11 : 9;
  const tw = side ? 10 : 14;
  f.rrect(tx, ty, tw, 10, 2, C.top);
  f.rect(tx + tw - 2, ty + 1, 2, 8, topD);
  f.rect(tx + 1, ty + 1, 1, 6, topL);
  if (style === 'hoodie') {
    if (d === 'down') {
      f.rect(14, ty, 4, 2, shade(C.top, -0.12)); // cuello
      f.rect(13, ty + 2, 1, 3, C.accent); f.rect(18, ty + 2, 1, 3, C.accent); // cordones
      f.rect(12, ty + 6, 8, 3, topD); // bolsillo
    }
    if (d === 'up') f.rrect(11, ty - 1, 10, 5, 2, topD); // capucha
    if (d === 'left') f.rrect(15, ty - 1, 6, 5, 2, topD);
  }
  if (style === 'sweater' && d !== 'up') {
    f.rect(tx, ty + 8, tw, 2, topD);
    if (d === 'down') f.rect(13, ty, 6, 1, C.accent);
  }
  if (style === 'shirt' && d === 'down') {
    f.rect(13, ty, 6, 2, C.top);
    f.set(13, ty, topD); f.set(18, ty, topD);
    f.rect(15, ty + 1, 2, 7, C.accent); // corbata
    f.set(15, ty + 1, shade(C.accent, 0.2));
  }
  if (style === 'blazer') {
    if (d === 'down') {
      f.rect(14, ty, 4, 8, C.accent); // camisa
      f.rect(15, ty + 1, 2, 6, C.top);
      f.rect(13, ty, 1, 7, topL); f.rect(18, ty, 1, 7, topL);
    }
    if (d === 'left') f.rect(11, ty + 1, 2, 5, C.accent);
  }
  if (style === 'overalls') {
    // playera debajo (accent) y overol (pants)
    f.rrect(tx, ty, tw, 10, 2, C.top);
    if (d !== 'up') {
      const bx = side ? 12 : 11;
      const bw = side ? 8 : 10;
      f.rect(bx, ty + 3, bw, 7, C.pants);
      f.rect(bx + 1, ty, 1, 3, C.pants); f.rect(bx + bw - 2, ty, 1, 3, C.pants);
      f.rect(bx + 2, ty + 5, bw - 4, 2, shade(C.pants, -0.15));
      f.set(bx + 1, ty + 3, C.accent); f.set(bx + bw - 2, ty + 3, C.accent);
    } else {
      f.rect(11, ty + 3, 10, 7, C.pants);
      f.rect(12, ty, 2, 3, C.pants); f.rect(18, ty, 2, 3, C.pants);
    }
  }
  if (style === 'tee' && d === 'down') {
    f.rect(14, ty, 4, 1, skinD);
    f.rect(13, ty + 3, 6, 3, C.accent); // estampado
    f.rect(14, ty + 4, 4, 1, shade(C.accent, -0.2));
  }

  // ----- Brazos
  const swing = step === 1 ? 1 : step === 2 ? -1 : 0;
  if (!side) {
    const sleeve = style === 'tee' || style === 'overalls' ? C.top : C.top;
    f.rect(7, ty + 1 + swing, 2, 6, sleeve);
    f.rect(23, ty + 1 - swing, 2, 6, shade(sleeve, -0.15));
    f.rect(7, ty + 7 + swing, 2, 2, C.skin);
    f.rect(23, ty + 7 - swing, 2, 2, skinD);
  } else {
    const ax = 15 + swing * 2;
    f.rect(ax, ty + 1, 3, 6, shade(C.top, -0.08));
    f.rect(ax, ty + 7, 3, 2, C.skin);
  }

  // ----- Cabeza
  const hy = 13 + bob;
  f.rrect(7, hy, 18, 17, 4, C.skin);
  f.rect(8, hy + 15, 16, 1, skinD); // sombra de barbilla
  if (d === 'left') f.rect(19, hy + 8, 2, 3, skinD); // oreja

  // ----- Cara
  if (d === 'down') {
    for (const ex of [11, 19]) {
      f.rect(ex, hy + 8, 2, 3, C.eye);
      f.set(ex, hy + 8, C.white);
    }
    f.rect(9, hy + 11, 2, 1, shade(C.skin, -0.06).map((v, i) => (i === 0 ? Math.min(255, v + 20) : v)));
    f.rect(21, hy + 11, 2, 1, shade(C.skin, -0.06).map((v, i) => (i === 0 ? Math.min(255, v + 20) : v)));
    f.rect(15, hy + 13, 2, 1, shade(C.skin, -0.3));
  } else if (d === 'left') {
    f.rect(9, hy + 8, 2, 3, C.eye);
    f.set(9, hy + 8, C.white);
    f.rect(8, hy + 13, 2, 1, shade(C.skin, -0.3));
  }

  // ----- Cabello
  if (hs !== 'buzz') {
    if (d === 'up') {
      f.rrect(6, hy - 1, 20, hs === 'long' ? 18 : 16, 5, C.hair);
      f.rect(9, hy + 1, 3, 6, hairL);
    } else if (d === 'down') {
      f.rrect(6, hy - 1, 20, 8, 5, C.hair);
      f.rect(6, hy + 3, 3, hs === 'long' || hs === 'bob' ? 12 : 6, C.hair);
      f.rect(23, hy + 3, 3, hs === 'long' || hs === 'bob' ? 12 : 6, C.hair);
      // fleco irregular
      for (let i = 9; i < 23; i++) if ((i * 7) % 5 < 2) f.set(i, hy + 7, C.hair);
      f.rect(10, hy + 1, 4, 2, hairL);
    } else {
      f.rrect(7, hy - 1, 19, 8, 5, C.hair);
      f.rect(15, hy + 3, 11, hs === 'long' || hs === 'bob' ? 12 : 7, C.hair);
      f.rect(7, hy + 6, 3, 1, C.hair);
      f.rect(11, hy + 1, 5, 2, hairL);
      f.rect(19, hy + 8, 2, 3, d === 'left' && (hs === 'long' || hs === 'bob') ? C.hair : skinD);
    }
    if (hs === 'spiky') {
      for (const sx of [8, 12, 16, 20]) {
        f.rect(sx + (d === 'left' ? 1 : 0), hy - 3, 3, 2, C.hair);
        f.set(sx + 1 + (d === 'left' ? 1 : 0), hy - 4, C.hair);
      }
    }
    if (hs === 'bun') {
      const bx = d === 'left' ? 19 : 16;
      f.disc(bx, hy - 3, 3, C.hair);
      f.set(bx - 1, hy - 4, hairL);
    }
    if (hs === 'curly') {
      for (let i = 0; i < 6; i++) f.disc(8 + i * 3, hy, 2, i % 2 ? C.hair : hairD);
      if (d !== 'up') { f.disc(7, hy + 5, 2, C.hair); f.disc(24, hy + 5, 2, C.hair); }
    }
  } else {
    f.rrect(7, hy - 1, 18, d === 'up' ? 10 : 5, 4, C.hair);
    if (d === 'left') f.rect(16, hy + 1, 9, 5, C.hair);
  }

  // ----- Accesorios
  if ((acc === 'glasses' || acc === 'sunglasses') && d !== 'up') {
    const lens = acc === 'sunglasses' ? [24, 24, 30] : shade(C.skin, 0.25);
    const frame = acc === 'sunglasses' ? [20, 20, 26] : [40, 34, 46];
    if (d === 'down') {
      for (const ex of [10, 18]) {
        f.rect(ex, hy + 7, 4, 4, frame);
        f.rect(ex + 1, hy + 8, 2, 2, lens);
        if (acc === 'glasses') f.set(ex + 1, hy + 8, C.eye);
      }
      f.rect(14, hy + 8, 4, 1, frame);
    } else {
      f.rect(7, hy + 7, 5, 4, frame);
      f.rect(8, hy + 8, 3, 2, lens);
      if (acc === 'glasses') f.set(9, hy + 8, C.eye);
      f.rect(12, hy + 8, 7, 1, frame);
    }
  }
  if (acc === 'headphones' || acc === 'headset') {
    const cup = acc === 'headphones' ? [47, 182, 124] : [52, 52, 62];
    const band = shade(cup, -0.35);
    if (d !== 'left') {
      f.rect(8, hy - 2, 16, 1, band);
      f.rect(7, hy - 1, 1, 6, band); f.rect(24, hy - 1, 1, 6, band);
      f.rrect(4, hy + 5, 4, 7, 1, cup); f.rrect(24, hy + 5, 4, 7, 1, cup);
      if (acc === 'headset' && d === 'down') { f.rect(8, hy + 12, 5, 1, [40, 40, 48]); f.rect(12, hy + 12, 2, 2, [229, 72, 77]); }
    } else {
      f.rect(12, hy - 2, 9, 1, band);
      f.rect(19, hy - 1, 1, 7, band);
      f.rrect(17, hy + 6, 5, 7, 1, cup);
      if (acc === 'headset') { f.rect(10, hy + 13, 8, 1, [40, 40, 48]); f.rect(9, hy + 12, 2, 2, [229, 72, 77]); }
    }
  }
  if (acc === 'cap') {
    const cap = C.accent;
    f.rrect(6, hy - 3, 20, 7, 4, cap);
    f.rect(9, hy - 2, 4, 1, shade(cap, 0.25));
    if (d === 'down') f.rect(8, hy + 3, 16, 2, shade(cap, -0.22));
    if (d === 'left') f.rect(2, hy + 3, 8, 2, shade(cap, -0.22));
  }
  if (acc === 'beanie') {
    const b = C.accent;
    f.rrect(6, hy - 4, 20, 9, 5, b);
    f.rect(6, hy + 2, 20, 3, shade(b, -0.2));
    for (let i = 8; i < 25; i += 2) f.set(i, hy + 3, shade(b, -0.35));
    f.disc(16, hy - 5, 2, C.white);
  }

  f.outline();
  return dir === 'right' ? f.mirror() : f;
}

// Devuelve los píxeles RGBA de la hoja completa (96×192)
export function renderSheet(spec) {
  const out = new Uint8ClampedArray(SHEET_W * SHEET_H * 4);
  DIRS.forEach((dir, row) => {
    for (let col = 0; col < 3; col++) {
      const fr = drawFrame(spec, dir, col);
      for (let y = 0; y < FRAME_H; y++) {
        for (let x = 0; x < FRAME_W; x++) {
          const c = fr.get(x, y);
          if (!c) continue;
          const i = ((row * FRAME_H + y) * SHEET_W + col * FRAME_W + x) * 4;
          out[i] = c[0]; out[i + 1] = c[1]; out[i + 2] = c[2]; out[i + 3] = 255;
        }
      }
    }
  });
  return out;
}

// Normaliza un avatar guardado (incluye avatares del formato anterior)
export function normalizeSpec(av = {}) {
  const base = PRESETS.find((p) => p.id === av.preset) || DEFAULT_SPEC;
  const out = { ...base, ...av };
  if (out.hairStyle === 'bald') out.hairStyle = 'buzz';
  if (!SPRITE_OPTIONS.hairStyle.includes(out.hairStyle)) out.hairStyle = 'short';
  if (!SPRITE_OPTIONS.top.includes(out.top)) out.top = 'tee';
  if (out.accessory === 'cap' && !av.accent) out.accent = '#e5484d';
  if (!SPRITE_OPTIONS.accessory.includes(out.accessory)) out.accessory = 'none';
  return out;
}
