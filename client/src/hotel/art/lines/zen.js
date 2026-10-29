// Dibujo de la línea "Zen". Mismo formato que art/floor.js y art/wall.js:
//   floor: { id: (s: Scene, { c, st, t, def }) => void }
//   wall:  { id: (ctx, { c, st, def, now }) => void }
//   period: { id: (st) => ms de animación o 0 }
//   defaultColor: { id: '#hex' }
import { shade, mix, rgba, rng } from '../iso.js';

const TAU = Math.PI * 2;
const STRAW = '#cfc48c', HERI = '#27382c', LACQUER = '#2a1a17', PAPER = '#f2e9d3', GOLD = '#d8b45c', STONE = '#8f9294', BAMBOO = '#9cbf58', SAKURA = '#f5a3bd', INKC = '#2a2622';

const fr = (ctx, x, y, w, h, c) => { ctx.fillStyle = c; ctx.fillRect(x, y, w, h); };
const dotc = (ctx, x, y, r, c) => { ctx.fillStyle = c; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill(); };
const line = (ctx, x0, y0, x1, y1, c, w = 1) => { ctx.strokeStyle = c; ctx.lineWidth = w; ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke(); };
const sheen = (ctx, w, h, a = 0.14) => {
  const g = ctx.createLinearGradient(0, 0, w, h);
  g.addColorStop(0, rgba('#ffffff', a)); g.addColorStop(0.5, rgba('#ffffff', 0)); g.addColorStop(1, rgba('#000000', a * 0.4));
  ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
};
const glow = (ctx, x, y, r, color, a = 0.35) => {
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, rgba(color, a)); g.addColorStop(0.45, rgba(color, a * 0.45)); g.addColorStop(1, rgba(color, 0));
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
};
const floorGlow = (ctx, s, cu, cv, ru, color, a) => {
  const [x, y] = s.P(cu, cv, 0);
  ctx.save(); ctx.translate(x, y); ctx.scale(1, 0.5); glow(ctx, 0, 0, ru * 45, color, a); ctx.restore();
};
// Flor de cerezo (5 pétalos)
const blossom = (ctx, x, y, r, c = SAKURA) => {
  for (let k = 0; k < 5; k++) { const a = (k / 5) * TAU - Math.PI / 2; dotc(ctx, x + Math.cos(a) * r * 0.7, y + Math.sin(a) * r * 0.7, r * 0.62, c); }
  dotc(ctx, x, y, r * 0.35, '#fff3c4');
};
// Placa delgada entre dos puntos del piso (u, v) → paneles en diagonal (biombo)
function slab(s, u0, v0, u1, v1, z0, z1, th, color, o = {}) {
  const dx = u1 - u0, dy = v1 - v0, L = Math.hypot(dx, dy) || 1;
  const nx = (-dy / L) * th / 2, ny = (dx / L) * th / 2;
  const a = [u0 + nx, v0 + ny], b = [u1 + nx, v1 + ny], c = [u1 - nx, v1 - ny], d = [u0 - nx, v0 - ny];
  const F = (name, pts) => ({ name, pts, color: o.faces?.[name] || color, decal: o.decal?.[name] });
  const Z = (p, z) => [p[0], p[1], z];
  return s.poly([
    F('top', [Z(a, z1), Z(b, z1), Z(c, z1), Z(d, z1)]),
    F('front', [Z(a, z0), Z(b, z0), Z(b, z1), Z(a, z1)]),
    F('back', [Z(d, z0), Z(c, z0), Z(c, z1), Z(d, z1)]),
    F('right', [Z(b, z0), Z(c, z0), Z(c, z1), Z(b, z1)]),
    F('left', [Z(a, z0), Z(d, z0), Z(d, z1), Z(a, z1)]),
  ], color, o);
}

// ---------- Piso ----------
function zen_tatami(s) {
  s.box(0.02, 0.02, 0, 0.98, 1.98, 0.04, STRAW, {
    outline: shade(STRAW, -0.55),
    decal: {
      top: (x, w, h) => {
        const g = x.createLinearGradient(0, 0, w, 0);
        g.addColorStop(0, '#d8cf98'); g.addColorStop(0.5, '#c9be82'); g.addColorStop(1, '#d3c98f');
        x.fillStyle = g; x.fillRect(0, 0, w, h);
        for (let y = 1.2; y < h; y += 1.6) line(x, 3, y, w - 3, y, rgba('#7d7240', 0.28), 0.6);
        for (let y = 2; y < h; y += 6.4) line(x, 3, y, w - 3, y, rgba('#ffffff', 0.12), 0.6);
        // ribete de tela en los lados largos
        fr(x, 0, 0, 3.2, h, HERI); fr(x, w - 3.2, 0, 3.2, h, HERI);
        for (let y = 2; y < h; y += 4) { fr(x, 1.2, y, 0.8, 1.6, rgba('#c9b26a', 0.55)); fr(x, w - 2, y, 0.8, 1.6, rgba('#c9b26a', 0.55)); }
        sheen(x, w, h, 0.08);
      },
      front: (x, w, h) => fr(x, 0, 0, w, h, shade(STRAW, -0.12)),
      left: (x, w, h) => fr(x, 0, 0, w, h, HERI), right: (x, w, h) => fr(x, 0, 0, w, h, HERI),
    },
  });
}

function zen_zabuton(s, { c }) {
  const tassel = c === '#d9a441' ? '#9b2f3f' : GOLD;
  s.shadowRect(0.1, 0.12, 0.92, 0.92, 0.2);
  s.box(0.1, 0.1, 0, 0.9, 0.9, 0.1, shade(c, -0.12), { decal: { front: (x, w, h) => fr(x, 0, h * 0.45, w, 0.8, rgba('#000', 0.25)) } });
  s.box(0.13, 0.13, 0.1, 0.87, 0.87, 0.2, c, {
    decal: {
      top: (x, w, h) => {
        const g = x.createRadialGradient(w / 2, h / 2, 1, w / 2, h / 2, w * 0.6);
        g.addColorStop(0, rgba('#ffffff', 0.12)); g.addColorStop(1, rgba('#000000', 0.18));
        x.fillStyle = g; x.fillRect(0, 0, w, h);
        // costura cruzada al centro
        x.strokeStyle = rgba(tassel, 0.95); x.lineWidth = 1.2;
        x.beginPath(); x.moveTo(w / 2 - 2.5, h / 2 - 2.5); x.lineTo(w / 2 + 2.5, h / 2 + 2.5); x.moveTo(w / 2 + 2.5, h / 2 - 2.5); x.lineTo(w / 2 - 2.5, h / 2 + 2.5); x.stroke();
        // patrón de olas tenue
        x.strokeStyle = rgba('#ffffff', 0.16); x.lineWidth = 0.7;
        for (let j = 0; j < 3; j++) for (let i = 0; i < 3; i++) { x.beginPath(); x.arc(w * (0.2 + i * 0.3), h * (0.25 + j * 0.28), 3, Math.PI, TAU); x.stroke(); }
      },
    },
  });
  for (const [u, v] of [[0.12, 0.12], [0.88, 0.12], [0.12, 0.88], [0.88, 0.88]]) s.ball(u, v, 0.16, 0.035, tassel);
}

function zen_table(s, { c }) {
  const leg = shade(c, -0.2);
  s.shadowRect(0.04, 0.08, 1.96, 0.94, 0.2);
  for (const u of [0.1, 1.76]) for (const v of [0.14, 0.72]) s.box(u, v, 0, u + 0.14, v + 0.14, 0.3, leg);
  s.box(0.12, 0.16, 0.24, 1.88, 0.84, 0.32, shade(c, -0.1));
  s.box(0.02, 0.06, 0.32, 1.98, 0.94, 0.42, c, {
    decal: {
      top: (x, w, h) => {
        const r = rng(11);
        x.strokeStyle = rgba(shade(c, 0.4), 0.22); x.lineWidth = 0.6;
        for (let i = 0; i < 7; i++) { const y0 = r() * h; x.beginPath(); x.moveTo(0, y0); x.bezierCurveTo(w * 0.3, y0 + 3, w * 0.6, y0 - 3, w, y0 + r() * 2); x.stroke(); }
        // camino de bambú
        fr(x, w * 0.3, 2, w * 0.4, h - 4, '#c9b779');
        for (let i = 0; i < 9; i++) line(x, w * 0.3, 3 + i * ((h - 6) / 8), w * 0.7, 3 + i * ((h - 6) / 8), rgba('#7a6a38', 0.5), 0.6);
        fr(x, w * 0.3, 2, w * 0.4, 0.8, '#9b2f3f'); fr(x, w * 0.3, h - 2.8, w * 0.4, 0.8, '#9b2f3f');
        sheen(x, w, h, 0.22);
      },
      front: (x, w, h) => { sheen(x, w, h, 0.2); fr(x, 0, h - 1, w, 1, rgba('#000', 0.3)); },
    },
  });
}

function zen_futon(s, { c }) {
  const mat = '#f3efe6';
  s.shadowRect(0.04, 0.04, 0.96, 1.96, 0.18);
  s.box(0.06, 0.06, 0, 0.94, 1.94, 0.13, mat, { decal: { front: (x, w, h) => fr(x, 0, h / 2, w, 0.8, rgba('#000', 0.12)), left: (x, w, h) => fr(x, 0, h / 2, w, 0.8, rgba('#000', 0.12)), right: (x, w, h) => fr(x, 0, h / 2, w, 0.8, rgba('#000', 0.12)) } });
  // almohada de semillas
  s.cyl('u', 0.27, 0.2, 0.08, 0.08, 0.26, 0.74, '#e7dcc0', { seg: 12, faces: { left: '#d9cba6', right: '#d9cba6' } });
  // cobija con patrón de olas
  const light = mix(c, '#ffffff', 0.55);
  s.box(0.04, 0.6, 0.1, 0.96, 1.96, 0.24, c, {
    decal: {
      top: (x, w, h) => {
        fr(x, 0, 0, w, 4, light); fr(x, 0, 4, w, 0.8, rgba(shade(c, -0.5), 0.35));
        x.strokeStyle = rgba(light, 0.55); x.lineWidth = 0.8;
        for (let j = 0; j < 5; j++) for (let i = 0; i < 4; i++) {
          const cx = (i + (j % 2) * 0.5) * (w / 3.2) + 2, cy = 10 + j * ((h - 12) / 4.5);
          for (const r of [4.5, 3, 1.5]) { x.beginPath(); x.arc(cx, cy, r, Math.PI, TAU); x.stroke(); }
        }
        sheen(x, w, h, 0.12);
      },
      front: (x, w, h) => fr(x, 0, h - 1.5, w, 1.5, shade(c, -0.25)),
    },
  });
}

function zen_screen(s) {
  s.shadowRect(0.04, 0.32, 1.96, 0.68, 0.2);
  const N = 4, pw = 2 / N, zz = [0.36, 0.64];
  for (let i = 0; i < N; i++) {
    const u0 = i * pw + 0.02, u1 = (i + 1) * pw - 0.02;
    const v0 = zz[i % 2], v1 = zz[(i + 1) % 2];
    const r = rng(20 + i);
    const painted = (x, w, h) => {
      fr(x, 0, 0, w, h, LACQUER);
      const X = 2, Y = 2, Wd = w - 4, Hd = h - 4;
      const g = x.createLinearGradient(0, Y, 0, Y + Hd);
      g.addColorStop(0, '#ecc970'); g.addColorStop(1, GOLD);
      x.fillStyle = g; x.fillRect(X, Y, Wd, Hd);
      x.fillStyle = rgba('#ffffff', 0.14);
      for (let k = 0; k < 4; k++) x.fillRect(X, Y + (Hd * k) / 4, Wd, Hd / 8);
      x.save(); x.beginPath(); x.rect(X, Y, Wd, Hd); x.clip();
      // rama que cruza los paneles
      const yA = Y + Hd * (0.3 + 0.12 * (i % 2)), yB = Y + Hd * (0.3 + 0.12 * ((i + 1) % 2));
      x.strokeStyle = '#3a241c'; x.lineWidth = 2.2; x.lineCap = 'round';
      x.beginPath(); x.moveTo(X - 2, yA); x.quadraticCurveTo(X + Wd / 2, (yA + yB) / 2 - 5, X + Wd + 2, yB); x.stroke();
      x.lineWidth = 1.1;
      x.beginPath(); x.moveTo(X + Wd * 0.45, (yA + yB) / 2 - 3); x.quadraticCurveTo(X + Wd * 0.6, Y + Hd * 0.55, X + Wd * 0.4, Y + Hd * 0.7); x.stroke();
      for (let k = 0; k < 5; k++) blossom(x, X + r() * Wd, Y + Hd * (0.18 + r() * 0.55), 1.8 + r() * 0.8, k % 3 ? SAKURA : '#ffd0de');
      // pétalos que caen
      for (let k = 0; k < 3; k++) dotc(x, X + r() * Wd, Y + Hd * (0.7 + r() * 0.25), 0.8, SAKURA);
      // pasto en la base
      x.fillStyle = rgba('#6b7a3a', 0.6);
      x.beginPath(); x.moveTo(X, Y + Hd); for (let k = 0; k <= 6; k++) x.lineTo(X + (Wd * k) / 6, Y + Hd - 3 - ((k + i) % 2) * 2.5); x.lineTo(X + Wd, Y + Hd); x.fill();
      x.restore();
      sheen(x, w, h, 0.15);
    };
    const shoji = (x, w, h) => {
      fr(x, 0, 0, w, h, LACQUER);
      fr(x, 2, 2, w - 4, h - 4, PAPER);
      x.strokeStyle = rgba(LACQUER, 0.75); x.lineWidth = 0.8;
      for (let k = 1; k < 2; k++) line(x, 2 + ((w - 4) * k) / 2, 2, 2 + ((w - 4) * k) / 2, h - 2, rgba(LACQUER, 0.7), 0.8);
      for (let k = 1; k < 6; k++) line(x, 2, 2 + ((h - 4) * k) / 6, w - 2, 2 + ((h - 4) * k) / 6, rgba(LACQUER, 0.7), 0.8);
    };
    slab(s, u0, v0, u1, v1, 0.08, 1.66, 0.04, LACQUER, { decal: { front: painted, back: shoji }, outline: '#120a08' });
    if (i === 0 || i === N - 1) {
      const fu = i === 0 ? u0 + 0.03 : u1 - 0.03, fv = i === 0 ? v0 : v1;
      s.box(fu - 0.05, fv - 0.06, 0, fu + 0.05, fv + 0.06, 0.08, LACQUER);
    }
  }
  s.box(0.97, 0.58, 0, 1.03, 0.7, 0.08, LACQUER);
}

function zen_bonsai(s) {
  const pot = '#3e5f7c';
  s.shadowEllipse(0.5, 0.52, 0.34, 0.26, 0.24);
  // mesita de madera
  s.box(0.16, 0.24, 0, 0.84, 0.76, 0.06, '#5a3524');
  for (const [u, v] of [[0.18, 0.26], [0.74, 0.26], [0.18, 0.66], [0.74, 0.66]]) s.box(u, v, 0.06, u + 0.08, v + 0.08, 0.14, '#5a3524');
  s.box(0.14, 0.22, 0.14, 0.86, 0.78, 0.2, '#6e4330', { decal: { top: (x, w, h) => sheen(x, w, h, 0.2) } });
  // maceta esmaltada
  s.box(0.24, 0.32, 0.2, 0.76, 0.68, 0.36, pot, {
    decal: {
      front: (x, w, h) => { fr(x, 0, 0, w, 1.4, shade(pot, 0.35)); sheen(x, w, h, 0.25); },
      top: (x, w, h) => { fr(x, 1.5, 1.5, w - 3, h - 3, '#4a3423'); for (let i = 0; i < 6; i++) dotc(x, 3 + ((i * 7) % (w - 6)), 3 + ((i * 5) % (h - 6)), 1.6, '#5f8a3a'); },
    },
  });
  s.custom([0.2, 0.3, 0.36, 0.8, 0.7, 0.95], (ctx) => {
    const [x, y] = s.P(0.5, 0.5, 0.36);
    const [xr] = s.P(0.8, 0.5, 0.36), [xl] = s.P(0.2, 0.5, 0.36);
    const d = xr >= xl ? 1 : -1;
    // tronco retorcido
    ctx.lineCap = 'round';
    const trunk = () => { ctx.beginPath(); ctx.moveTo(x - d * 2, y - 1); ctx.bezierCurveTo(x - d * 10, y - 8, x + d * 8, y - 12, x + d * 2, y - 19); ctx.quadraticCurveTo(x - d * 3, y - 23, x - d * 6, y - 26); };
    trunk(); ctx.strokeStyle = '#2a1a12'; ctx.lineWidth = 5; ctx.stroke();
    trunk(); ctx.strokeStyle = '#6b4a35'; ctx.lineWidth = 3; ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x + d * 3, y - 14); ctx.quadraticCurveTo(x + d * 10, y - 15, x + d * 14, y - 13);
    ctx.strokeStyle = '#2a1a12'; ctx.lineWidth = 3; ctx.stroke(); ctx.strokeStyle = '#6b4a35'; ctx.lineWidth = 1.5; ctx.stroke();
    // copas en "nubes"
    const pad = (cx, cy, rw, rh) => {
      const parts = [[0, 0, 1], [-0.55, 0.15, 0.7], [0.55, 0.12, 0.72], [-0.2, -0.3, 0.7], [0.28, -0.25, 0.65]];
      for (const [ox, oy, k] of parts) { ctx.fillStyle = '#1f4a2a'; ctx.beginPath(); ctx.ellipse(cx + ox * rw, cy + oy * rh + 0.8, rw * 0.55 * k + 0.9, rh * 0.6 * k + 0.9, 0, 0, TAU); ctx.fill(); }
      for (const [ox, oy, k] of parts) { ctx.fillStyle = '#3f8a45'; ctx.beginPath(); ctx.ellipse(cx + ox * rw, cy + oy * rh, rw * 0.55 * k, rh * 0.6 * k, 0, 0, TAU); ctx.fill(); }
      for (const [ox, oy, k] of parts.slice(3)) { ctx.fillStyle = '#62ad5a'; ctx.beginPath(); ctx.ellipse(cx + ox * rw - 1, cy + oy * rh - 1, rw * 0.3 * k, rh * 0.32 * k, 0, 0, TAU); ctx.fill(); }
    };
    pad(x + d * 15, y - 15, 7, 4);
    pad(x - d * 6, y - 27, 11, 5.5);
    pad(x - d * 9, y - 13, 6, 3.5);
  });
}

function zen_lantern(s, { st }) {
  const on = st === 1, wood = '#3a2418';
  const paper = on ? '#ffe9b0' : PAPER;
  s.shadowRect(0.26, 0.26, 0.76, 0.76, 0.22);
  if (on) s.under((ctx) => floorGlow(ctx, s, 0.5, 0.5, 1.15, '#ffc96b', 0.32));
  for (const [u, v] of [[0.27, 0.27], [0.67, 0.27], [0.27, 0.67], [0.67, 0.67]]) s.box(u, v, 0, u + 0.06, v + 0.06, 0.26, wood);
  const face = (x, w, h) => {
    if (on) { const g = x.createRadialGradient(w / 2, h * 0.55, 1, w / 2, h * 0.55, w); g.addColorStop(0, '#fff8de'); g.addColorStop(1, '#ffcf76'); x.fillStyle = g; x.fillRect(0, 0, w, h); }
    x.strokeStyle = wood; x.lineWidth = 1.6; x.strokeRect(0.8, 0.8, w - 1.6, h - 1.6);
    x.lineWidth = 0.7; for (let k = 1; k < 4; k++) line(x, 0, (h * k) / 4, w, (h * k) / 4, rgba(wood, 0.65), 0.7);
    line(x, w / 2, 0, w / 2, h, rgba(wood, 0.65), 0.7);
  };
  const front = (x, w, h) => {
    face(x, w, h);
    // mon (círculo de tinta roja)
    x.strokeStyle = on ? '#c0392b' : '#a5343a'; x.lineWidth = 1.6;
    x.beginPath(); x.arc(w / 2, h * 0.5, Math.min(w, h) * 0.2, 0.3, TAU - 0.2); x.stroke();
  };
  s.box(0.29, 0.29, 0.26, 0.71, 0.71, 1.16, paper, { flat: on, decal: { front, right: face, left: face, back: face } });
  s.box(0.24, 0.24, 1.16, 0.76, 0.76, 1.22, wood, { decal: { top: (x, w, h) => fr(x, w * 0.2, h * 0.2, w * 0.6, h * 0.6, on ? '#ffe6a3' : '#2a1a10') } });
  s.box(0.46, 0.46, 1.22, 0.54, 0.54, 1.3, wood);
  if (on) s.over((ctx) => { const [x, y] = s.P(0.5, 0.5, 0.75); glow(ctx, x, y, 42, '#ffc96b', 0.3); glow(ctx, x, y, 16, '#fff6dc', 0.35); });
}

function zen_fountain(s, { st, t }) {
  const on = st === 1, water = '#6fb5c8';
  s.shadowEllipse(0.56, 0.56, 0.42, 0.38, 0.22);
  // piedras alrededor
  for (const [u, v, r, c] of [[0.14, 0.86, 0.08, '#7d8083'], [0.9, 0.16, 0.07, '#a0a3a5'], [0.26, 0.92, 0.05, '#b2b4b5'], [0.1, 0.18, 0.06, '#8a8d90']]) s.ball(u, v, r, r, c);
  // pileta de piedra
  s.cyl('z', 0.6, 0.55, 0.32, 0.3, 0, 0.26, STONE, {
    seg: 20,
    faces: { top: shade(STONE, 0.1) },
    decal: {
      top: (x, w, h) => {
        const cx = w / 2, cy = h / 2, R = w * 0.36;
        x.fillStyle = shade(water, -0.2); x.beginPath(); x.arc(cx, cy, R, 0, TAU); x.fill();
        x.fillStyle = water; x.beginPath(); x.arc(cx - 0.5, cy - 0.5, R - 1.2, 0, TAU); x.fill();
        x.strokeStyle = rgba('#ffffff', 0.5); x.lineWidth = 0.7;
        if (on) {
          for (let i = 0; i < 2; i++) { const ph = ((t / 900 + i / 2) % 1); x.strokeStyle = rgba('#ffffff', 0.75 * (1 - ph)); x.beginPath(); x.arc(cx - 3.2, cy - 1.6, 1 + ph * R * 0.75, 0, TAU); x.stroke(); }
        } else { x.beginPath(); x.arc(cx, cy, R * 0.6, Math.PI * 1.1, Math.PI * 1.5); x.stroke(); }
        // musgo en el borde
        for (let k = 0; k < 6; k++) { const a = (k / 6) * TAU + 0.4; dotc(x, cx + Math.cos(a) * (R + 2.5), cy + Math.sin(a) * (R + 2.5), 1.3, '#5f8a3a'); }
      },
    },
  });
  // poste de bambú con nudos
  s.cyl('z', 0.18, 0.5, 0.07, 0.07, 0, 0.88, BAMBOO, { seg: 12, faces: { top: '#d7e7a8' } });
  for (const z of [0.3, 0.6]) s.cyl('z', 0.18, 0.5, 0.078, 0.078, z, z + 0.03, shade(BAMBOO, -0.28), { seg: 12, outline: false });
  // caño
  s.prism('u', [[0.47, 0.76], [0.53, 0.76], [0.53, 0.82], [0.47, 0.82]], 0.2, 0.5, shade(BAMBOO, -0.05), { decal: { right: (x, w, h) => { x.fillStyle = '#4a6a22'; x.fillRect(1, 1, w - 2, h - 2); } } });
  // cucharón de bambú apoyado en la orilla
  s.box(0.6, 0.86, 0.26, 0.95, 0.9, 0.29, '#c9b779', { outline: '#6b5a2a' });
  s.cyl('z', 0.64, 0.86, 0.05, 0.05, 0.22, 0.33, '#c9b779', { seg: 10, faces: { top: '#8a7a40' } });
  if (on) s.custom([0.46, 0.47, 0.26, 0.52, 0.53, 0.8], (ctx) => {
    const [x0, y0] = s.P(0.5, 0.5, 0.78), [x1, y1] = s.P(0.52, 0.5, 0.26);
    ctx.strokeStyle = rgba('#d9f3ff', 0.85); ctx.lineWidth = 1.6; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(x0, y0); ctx.quadraticCurveTo(x0 + 1.5, y0 + 3, x1, y1); ctx.stroke();
    const ph = (t / 120) % 4;
    for (let i = 0; i < 3; i++) { const k = ((i + ph / 4) / 3) % 1; dotc(ctx, x0 + (x1 - x0) * k + 0.3, y0 + (y1 - y0) * k, 0.7, '#ffffff'); }
    dotc(ctx, x1 - 2.5, y1 - 1, 0.8, rgba('#ffffff', 0.8)); dotc(ctx, x1 + 2.5, y1 - 1.5, 0.7, rgba('#ffffff', 0.8));
  });
}

// ---------- Pared ----------
function zen_scroll(ctx) {
  const x = 8, y = -74, w = 16, h = 60;
  // cordón y clavo
  ctx.strokeStyle = '#6b4a2a'; ctx.lineWidth = 0.7;
  ctx.beginPath(); ctx.moveTo(x + 1, y + 1); ctx.lineTo(x + w / 2, y - 7); ctx.lineTo(x + w - 1, y + 1); ctx.stroke();
  dotc(ctx, x + w / 2, y - 7, 1, '#4a4a4a');
  ctx.fillStyle = 'rgba(16,10,28,0.25)'; ctx.fillRect(x + 1.5, y + 2, w, h);
  // montura de tela
  fr(ctx, x, y, w, h, '#33465c');
  fr(ctx, x, y + 6, w, 1, rgba(GOLD, 0.9)); fr(ctx, x, y + h - 9, w, 1, rgba(GOLD, 0.9));
  // papel con tinta
  const px = x + 2, py = y + 8, pw = w - 4, ph = h - 18;
  fr(ctx, px, py, pw, ph, '#f3ecda');
  ctx.save(); ctx.beginPath(); ctx.rect(px, py, pw, ph); ctx.clip();
  dotc(ctx, px + pw * 0.68, py + ph * 0.2, 2.6, '#c0392b');
  ctx.fillStyle = rgba(INKC, 0.28); ctx.beginPath(); ctx.moveTo(px, py + ph * 0.62); ctx.lineTo(px + pw * 0.35, py + ph * 0.38); ctx.lineTo(px + pw * 0.6, py + ph * 0.55); ctx.lineTo(px + pw, py + ph * 0.42); ctx.lineTo(px + pw, py + ph); ctx.lineTo(px, py + ph); ctx.fill();
  ctx.fillStyle = rgba(INKC, 0.6); ctx.beginPath(); ctx.moveTo(px, py + ph * 0.8); ctx.lineTo(px + pw * 0.4, py + ph * 0.58); ctx.lineTo(px + pw * 0.75, py + ph * 0.78); ctx.lineTo(px + pw, py + ph * 0.7); ctx.lineTo(px + pw, py + ph); ctx.lineTo(px, py + ph); ctx.fill();
  ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.moveTo(px + pw * 0.28, py + ph * 0.45); ctx.lineTo(px + pw * 0.35, py + ph * 0.38); ctx.lineTo(px + pw * 0.43, py + ph * 0.44); ctx.fill();
  // pino
  line(ctx, px + pw * 0.2, py + ph, px + pw * 0.22, py + ph * 0.72, INKC, 0.9);
  for (let k = 0; k < 3; k++) { ctx.fillStyle = INKC; ctx.beginPath(); ctx.ellipse(px + pw * 0.22 + (k % 2 ? 2 : -1.5), py + ph * (0.74 + k * 0.07), 2.4, 0.9, 0, 0, TAU); ctx.fill(); }
  ctx.restore();
  // sello
  fr(ctx, px + pw - 3, py + ph - 4.5, 2, 2.4, '#c0392b');
  // varillas
  fr(ctx, x - 1, y - 1, w + 2, 2.4, '#2a1a12');
  fr(ctx, x - 2.5, y + h - 1, w + 5, 2.8, '#2a1a12');
  dotc(ctx, x - 2.5, y + h + 0.4, 1.6, '#e8dcc0'); dotc(ctx, x + w + 2.5, y + h + 0.4, 1.6, '#e8dcc0');
}

export default {
  floor: { zen_tatami, zen_zabuton, zen_table, zen_futon, zen_screen, zen_bonsai, zen_lantern, zen_fountain },
  wall: { zen_scroll },
  period: { zen_fountain: (st) => (st === 1 ? 120 : 0) },
  defaultColor: { zen_tatami: STRAW, zen_screen: GOLD, zen_bonsai: '#3e5f7c', zen_lantern: PAPER, zen_fountain: STONE, zen_scroll: '#33465c' },
};
