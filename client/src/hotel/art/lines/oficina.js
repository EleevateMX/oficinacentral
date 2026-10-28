// Dibujo de la línea "Oficina". Mismo formato que art/floor.js y art/wall.js:
//   floor: { id: (s: Scene, { c, st, t, def }) => void }
//   wall:  { id: (ctx, { c, st, def, now }) => void }
//   period: { id: (st) => ms de animación o 0 }
//   defaultColor: { id: '#hex' }
import { PINK, YELLOW, shade, mix, rgba, lum, outlineOf } from '../iso.js';
import { hexLogo, rr } from '../glyphs.js';

const TAU = Math.PI * 2;
const METAL = '#b9c0c9', DMETAL = '#4a4f5a', BLUE = '#3a86ff', GREEN = '#2fb67c';
const fr = (ctx, x, y, w, h, c) => { ctx.fillStyle = c; ctx.fillRect(x, y, w, h); };
const dotc = (ctx, x, y, r, c) => { ctx.fillStyle = c; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill(); };
const line = (ctx, x0, y0, x1, y1, c, w = 1) => { ctx.strokeStyle = c; ctx.lineWidth = w; ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke(); };
const glow = (ctx, x, y, r, color, a = 0.35) => {
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, rgba(color, a)); g.addColorStop(0.45, rgba(color, a * 0.45)); g.addColorStop(1, rgba(color, 0));
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
};
const sheen = (ctx, w, h, a = 0.14) => {
  const g = ctx.createLinearGradient(0, 0, w, h);
  g.addColorStop(0, rgba('#ffffff', a)); g.addColorStop(0.5, rgba('#ffffff', 0)); g.addColorStop(1, rgba('#000000', a * 0.4));
  ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
};
const isWood = (c) => c === '#c79a6b';
const grain = (ctx, w, h, c) => {
  for (let i = 1; i < 6; i++) line(ctx, 0, (h * i) / 6, w, (h * i) / 6 + ((i % 2) - 0.5) * 2, rgba(shade(c, -0.45), 0.22), 0.6);
  sheen(ctx, w, h, 0.14);
};
// Cajones con jaladera (frente de archivero / cajonera)
const drawerFront = (n, handle = '#d9dde3', gap = 1.6) => (x, w, h) => {
  const hh = (h - gap * (n + 1)) / n;
  for (let i = 0; i < n; i++) {
    const y0 = gap + i * (hh + gap);
    x.strokeStyle = rgba('#000000', 0.32); x.lineWidth = 0.7; x.strokeRect(1.5, y0, w - 3, hh);
    fr(x, 1.5, y0, w - 3, 0.8, rgba('#ffffff', 0.22));
    fr(x, w / 2 - 4, y0 + Math.min(4, hh * 0.3), 8, 1.6, handle);
    fr(x, w / 2 - 4, y0 + Math.min(4, hh * 0.3) + 1.6, 8, 0.6, rgba('#000000', 0.35));
  }
  sheen(x, w, h, 0.12);
};

// ---------- Silla de oficina ----------
function oficina_silla(s, { c }) {
  const dk = '#25262d', mesh = shade(c, c === '#2b2d38' ? -0.25 : -0.4);
  s.shadowEllipse(0.5, 0.52, 0.4, 0.4, 0.22);
  // base de 5 patas con rueditas
  s.custom([0.1, 0.1, 0, 0.9, 0.9, 0.12], (ctx) => {
    const [cx, cy] = s.P(0.5, 0.5, 0.09);
    const tips = [];
    for (let k = 0; k < 5; k++) { const a = (k / 5) * TAU + 0.3; tips.push([0.5 + Math.cos(a) * 0.36, 0.5 + Math.sin(a) * 0.36]); }
    tips.sort((p, q) => (p[0] + p[1]) - (q[0] + q[1]));
    for (const [u, v] of tips) {
      const [x, y] = s.P(u, v, 0.05);
      ctx.lineCap = 'round';
      line(ctx, cx, cy, x, y, '#141418', 3.6);
      line(ctx, cx, cy, x, y, '#3a3b44', 2);
      line(ctx, cx, cy - 0.6, x, y - 0.6, rgba('#ffffff', 0.18), 0.6);
      dotc(ctx, x, y + 2.2, 2.2, '#141418'); dotc(ctx, x - 0.5, y + 1.7, 1, '#4a4b55');
    }
    dotc(ctx, cx, cy, 3, '#2b2c33');
  });
  s.cyl('z', 0.5, 0.5, 0.04, 0.035, 0.1, 0.52, METAL, { seg: 10 });
  s.box(0.3, 0.32, 0.5, 0.7, 0.72, 0.55, dk);
  s.box(0.2, 0.26, 0.55, 0.8, 0.86, 0.68, c, {
    decal: { top: (x, w, h) => { x.strokeStyle = rgba('#ffffff', 0.18); x.lineWidth = 0.8; rr(x, 2, 2, w - 4, h - 4, 4); x.stroke(); sheen(x, w, h, 0.16); }, front: (x, w, h) => sheen(x, w, h, 0.1) },
  });
  // soporte y respaldo de malla
  s.box(0.46, 0.15, 0.52, 0.54, 0.22, 0.92, dk);
  const meshF = (x, w, h) => {
    rr(x, 2.2, 2.2, w - 4.4, h - 4.4, 3); x.fillStyle = mesh; x.fill();
    x.save(); x.clip();
    for (let i = -h; i < w; i += 2.6) { line(x, i, 0, i + h, h, rgba('#000000', 0.28), 0.5); line(x, i + h, 0, i, h, rgba('#ffffff', 0.08), 0.5); }
    x.restore();
    fr(x, w * 0.3, h * 0.62, w * 0.4, 1.4, rgba(shade(c, 0.3), 0.6));
    sheen(x, w, h, 0.12);
  };
  s.prism('u', [[0.13, 0.82], [0.22, 0.82], [0.17, 1.32], [0.08, 1.32]], 0.2, 0.8, c, { decal: { e1: meshF, e3: (x, w, h) => sheen(x, w, h, 0.12) } });
  // descansabrazos
  for (const u of [0.15, 0.81]) {
    s.box(u + 0.01, 0.5, 0.6, u + 0.05, 0.55, 0.86, dk);
    s.box(u - 0.01, 0.38, 0.86, u + 0.07, 0.7, 0.9, dk);
  }
}

// ---------- Escritorio ----------
function oficina_escritorio(s, { c }) {
  const leg = c === '#3a3e4c' ? '#24262e' : c === '#f1efe9' ? '#8c929c' : DMETAL;
  const ped = shade(c, -0.08);
  s.shadowRect(0.02, 0.08, 1.98, 0.96, 0.22);
  s.box(0.08, 0.12, 0, 0.14, 0.88, 0.82, leg);
  s.box(0.02, 0.12, 0, 0.2, 0.18, 0.03, leg);
  s.box(0.02, 0.82, 0, 0.2, 0.88, 0.03, leg);
  s.box(0.14, 0.13, 0.34, 1.38, 0.17, 0.82, shade(c, -0.18));
  s.box(1.38, 0.12, 0, 1.92, 0.88, 0.82, ped, { decal: { front: drawerFront(3, c === '#3a3e4c' ? PINK : '#d9dde3'), right: (x, w, h) => sheen(x, w, h, 0.1) } });
  s.box(0.02, 0.06, 0.82, 1.98, 0.94, 0.9, c, {
    decal: {
      top: (x, w, h) => { if (isWood(c)) grain(x, w, h, c); else sheen(x, w, h, 0.18); },
      front: (x, w, h) => fr(x, 0, h - 1.2, w, 1.2, rgba('#000000', 0.18)),
    },
  });
  // portalápices
  s.cyl('z', 0.2, 0.2, 0.06, 0.06, 0.9, 1.04, '#2b2d38', { seg: 12, faces: { top: '#141418' } });
  s.custom([0.14, 0.14, 1.04, 0.26, 0.26, 1.2], (ctx) => {
    const [x, y] = s.P(0.2, 0.2, 1.03);
    line(ctx, x - 1.5, y, x - 3, y - 7, PINK, 1.2); line(ctx, x + 0.5, y, x + 1, y - 8, YELLOW, 1.2); line(ctx, x + 2, y, x + 4, y - 6, BLUE, 1.2);
  });
}

// ---------- Laptop ----------
function laptopScreen(on, t) {
  return (x, w, h) => {
    fr(x, 0, 0, w, h, '#1b1c22');
    const X = 1.6, Y = 1.4, Wd = w - 3.2, Hd = h - 2.8;
    if (!on) {
      fr(x, X, Y, Wd, Hd, '#0f1014');
      x.fillStyle = rgba('#ffffff', 0.08); x.beginPath(); x.moveTo(X + Wd * 0.55, Y); x.lineTo(X + Wd * 0.75, Y); x.lineTo(X + Wd * 0.4, Y + Hd); x.lineTo(X + Wd * 0.2, Y + Hd); x.fill();
      return;
    }
    const g = x.createLinearGradient(0, Y, 0, Y + Hd); g.addColorStop(0, '#24133f'); g.addColorStop(1, '#5a1d4a');
    x.fillStyle = g; x.fillRect(X, Y, Wd, Hd);
    fr(x, X, Y, Wd, 1.6, PINK);
    fr(x, X + 2, Y + 3.5, Wd * 0.55, Hd - 5.5, rgba('#0e0f16', 0.85));
    const cols = ['#47ff9a', YELLOW, '#7fc8ff', PINK];
    for (let i = 0; i < 3; i++) fr(x, X + 3.5, Y + 5 + i * 2.6, ((i * 5) % 7) + 4, 1, cols[i]);
    if (Math.floor(t / 500) % 2 === 0) fr(x, X + 3.5, Y + 5 + 3 * 2.6, 2, 1.1, '#ffffff');
    hexLogo(x, X + Wd * 0.8, Y + Hd * 0.55, Math.min(Wd, Hd) * 0.2, { inner: false });
  };
}
function oficina_laptop(s, { c, st, t }) {
  const on = st === 1;
  s.shadowRect(0.2, 0.26, 0.8, 0.76, 0.2);
  s.box(0.22, 0.3, 0, 0.78, 0.74, 0.035, c, {
    decal: {
      top: (x, w, h) => {
        const kb = '#2b2d38';
        fr(x, 2, 1.5, w - 4, h * 0.5, shade(c, -0.15));
        for (let i = 0; i < 10; i++) for (let j = 0; j < 3; j++) fr(x, 2.8 + i * ((w - 5.6) / 10), 2.2 + j * (h * 0.5 / 3.2), (w - 5.6) / 10 - 0.6, h * 0.5 / 3.2 - 0.6, on && j === 1 && i === 4 ? PINK : kb);
        rr(x, w * 0.36, h * 0.62, w * 0.28, h * 0.3, 1); x.fillStyle = shade(c, -0.1); x.fill();
        sheen(x, w, h, 0.18);
      },
    },
  });
  s.prism('u', [[0.29, 0.03], [0.32, 0.03], [0.26, 0.44], [0.23, 0.44]], 0.23, 0.77, c, {
    decal: { e1: laptopScreen(on, t), e3: (x, w, h) => { sheen(x, w, h, 0.2); hexLogo(x, w / 2, h / 2, Math.min(w, h) * 0.18, { inner: false, top: '#ffffff', left: rgba('#ffffff', 0.7), right: rgba('#ffffff', 0.45) }); } },
  });
  if (on && s.faceVisible(0, 1, 0)) s.over((ctx) => { const [x, y] = s.P(0.5, 0.4, 0.25); glow(ctx, x, y, 20, '#8e5cf7', 0.16); });
}

// ---------- Archivero ----------
function oficina_archivero(s, { c, st }) {
  const open = st === 1, handle = c === '#FE3377' ? '#ffffff' : '#5b616c';
  s.shadowRect(0.16, 0.18, 0.86, 0.9, 0.24);
  s.box(0.18, 0.2, 0, 0.82, 0.86, 0.06, shade(c, -0.4));
  const front = (x, w, h) => {
    const n = 4, gap = 1.4, hh = (h - gap * (n + 1)) / n;
    for (let i = 0; i < n; i++) {
      const y0 = gap + i * (hh + gap);
      if (open && i === 0) { fr(x, 1.5, y0, w - 3, hh, '#1e1f25'); continue; }
      x.strokeStyle = rgba('#000000', 0.3); x.lineWidth = 0.7; x.strokeRect(1.5, y0, w - 3, hh);
      fr(x, w / 2 - 3, y0 + 2.5, 6, 3, '#f6f5f2'); x.strokeStyle = rgba('#000000', 0.25); x.strokeRect(w / 2 - 3, y0 + 2.5, 6, 3);
      fr(x, w / 2 - 4.5, y0 + 7, 9, 1.6, handle);
    }
    sheen(x, w, h, 0.14);
  };
  s.box(0.2, 0.22, 0.06, 0.8, 0.84, 1.42, c, { decal: { front, right: (x, w, h) => sheen(x, w, h, 0.1) } });
  s.box(0.18, 0.2, 1.42, 0.82, 0.86, 1.5, shade(c, 0.06), { decal: { top: (x, w, h) => sheen(x, w, h, 0.2) } });
  if (open) {
    const z0 = 1.42 - 0.31;
    s.box(0.24, 0.84, z0, 0.76, 1.2, z0 + 0.04, shade(c, -0.25));
    s.box(0.22, 0.84, z0, 0.25, 1.2, z0 + 0.27, shade(c, -0.12));
    s.box(0.75, 0.84, z0, 0.78, 1.2, z0 + 0.27, shade(c, -0.12));
    const tabs = [YELLOW, BLUE, PINK, GREEN, '#f6f5f2'];
    tabs.forEach((tc, i) => {
      const v = 0.87 + i * 0.065;
      s.box(0.27, v, z0 + 0.04, 0.73, v + 0.03, z0 + 0.26, '#efe3c4', { lw: 0.7, decal: { front: (x, w, h) => fr(x, (i * 7) % (w - 8) + 1, 0, 7, 2.4, tc) } });
    });
    s.box(0.2, 1.2, z0, 0.8, 1.24, z0 + 0.3, c, { decal: { front: (x, w, h) => { fr(x, w / 2 - 3, 2.5, 6, 3, '#f6f5f2'); fr(x, w / 2 - 4.5, 7, 9, 1.6, handle); sheen(x, w, h, 0.14); } } });
  }
}

// ---------- Copiadora ----------
function oficina_copiadora(s, { st, t }) {
  const on = st === 1, body = '#e3e5e8', dk = '#5a606b';
  s.shadowRect(0.04, 0.1, 0.98, 0.92, 0.24);
  s.box(0.06, 0.12, 0, 0.8, 0.88, 0.06, dk);
  s.box(0.06, 0.12, 0.06, 0.8, 0.88, 0.86, body, {
    decal: {
      front: (x, w, h) => {
        for (let i = 0; i < 2; i++) {
          const y0 = h * 0.42 + i * (h * 0.27);
          x.strokeStyle = rgba('#000000', 0.25); x.lineWidth = 0.7; x.strokeRect(1.5, y0, w - 3, h * 0.25);
          fr(x, w / 2 - 5, y0 + 2.5, 10, 1.6, '#8a909b');
        }
        fr(x, 2, h * 0.08, w * 0.35, h * 0.26, '#d4d7dc');
        hexLogo(x, w - 7, h * 0.2, 3, { inner: false });
        sheen(x, w, h, 0.14);
      },
      right: (x, w, h) => sheen(x, w, h, 0.1),
    },
  });
  s.box(0.04, 0.1, 0.86, 0.82, 0.9, 0.96, '#cfd3d8', { decal: { top: (x, w, h) => { fr(x, 2, 2, w - 4, 1, rgba('#ffffff', 0.5)); sheen(x, w, h, 0.18); } } });
  // panel de control
  s.box(0.46, 0.66, 0.96, 0.8, 0.9, 1.02, '#3a3e4c', {
    decal: {
      top: (x, w, h) => {
        fr(x, 2, 2, w * 0.5, h - 4, on ? '#47ff9a' : '#1d2a22');
        if (on) { fr(x, 3, 3, w * 0.3, 1, '#0d3a22'); fr(x, 3, 5, w * 0.2, 1, '#0d3a22'); }
        dotc(x, w * 0.75, h * 0.35, 1.3, on ? '#47ff9a' : '#2a2a2a');
        dotc(x, w * 0.75, h * 0.7, 1.3, PINK);
      },
    },
  });
  // charola de salida con hojas
  s.box(0.8, 0.26, 0.48, 0.98, 0.74, 0.51, '#c4c8ce');
  s.box(0.82, 0.3, 0.51, 0.96, 0.7, 0.55, '#ffffff', { lw: 0.7, decal: { top: (x, w, h) => { line(x, 2, h * 0.3, w - 2, h * 0.3, rgba('#000', 0.2), 0.5); line(x, 2, h * 0.5, w - 2, h * 0.5, rgba('#000', 0.2), 0.5); } } });
  if (on) {
    const k = (t % 1200) / 1200, out = 0.8 + 0.16 * k;
    s.box(0.78, 0.31, 0.57, out, 0.69, 0.585, '#ffffff', { lw: 0.6 });
    if (s.faceVisible(0, 1, 0)) s.over((ctx) => { const [x, y] = s.P(0.43, 0.88, 0.9); glow(ctx, x, y, 18, '#9be7ff', 0.25 + 0.15 * Math.sin(t / 150)); });
  }
}

// ---------- Garrafón ----------
function oficina_garrafon(s, { st, t }) {
  const on = st === 1, body = '#eef0f2';
  s.shadowRect(0.22, 0.22, 0.78, 0.78, 0.24);
  s.box(0.24, 0.24, 0, 0.76, 0.76, 1.0, body, {
    decal: {
      front: (x, w, h) => {
        fr(x, 3, h * 0.12, w - 6, h * 0.34, '#c9ced6');
        fr(x, 3, h * 0.12, w - 6, 1.2, rgba('#000', 0.2));
        fr(x, w * 0.3 - 1.5, h * 0.16, 3, 4, BLUE); fr(x, w * 0.7 - 1.5, h * 0.16, 3, 4, '#e23b3b');
        fr(x, 4, h * 0.42, w - 8, 2, '#9aa0aa');
        for (let i = 5; i < w - 5; i += 2) fr(x, i, h * 0.42, 1, 2, '#6a707a');
        x.strokeStyle = rgba('#000', 0.2); x.lineWidth = 0.7; x.strokeRect(3, h * 0.55, w - 6, h * 0.38);
        fr(x, w - 7, h * 0.7, 1.4, 5, '#9aa0aa');
        sheen(x, w, h, 0.14);
      },
      right: (x, w, h) => sheen(x, w, h, 0.1),
    },
  });
  s.box(0.3, 0.3, 1.0, 0.7, 0.7, 1.03, '#c9ced6');
  s.custom([0.28, 0.28, 1.03, 0.72, 0.72, 1.6], (ctx) => {
    const [cx, yb] = s.P(0.5, 0.5, 1.08), yt = s.P(0.5, 0.5, 1.56)[1];
    const rx = 0.2 * 45, ry = rx * 0.5;
    fr(ctx, cx - 3, yb - 2, 6, 6, rgba('#5fb2ff', 0.7));
    const body = () => { ctx.beginPath(); ctx.ellipse(cx, yb, rx, ry, 0, 0, Math.PI); ctx.lineTo(cx - rx, yt); ctx.ellipse(cx, yt, rx, ry, 0, Math.PI, TAU); ctx.closePath(); };
    body(); ctx.fillStyle = rgba('#a8dcff', 0.55); ctx.fill();
    ctx.save(); body(); ctx.clip();
    const wl = yt + (yb - yt) * 0.18;
    ctx.fillStyle = rgba('#3a9bff', 0.45); ctx.fillRect(cx - rx - 1, wl, rx * 2 + 2, yb - wl + ry + 1);
    ctx.strokeStyle = rgba('#ffffff', 0.55); ctx.lineWidth = 0.7;
    ctx.beginPath(); ctx.ellipse(cx, wl, rx, ry, 0, 0, Math.PI); ctx.stroke();
    for (const k of [0.4, 0.7]) { ctx.strokeStyle = rgba('#1d6fd6', 0.35); ctx.beginPath(); ctx.ellipse(cx, yt + (yb - yt) * k, rx, ry, 0, 0, Math.PI); ctx.stroke(); }
    if (on) {
      for (let i = 0; i < 4; i++) {
        const ph = ((t / 900 + i * 0.27) % 1);
        ctx.strokeStyle = rgba('#ffffff', 0.85 * (1 - ph * 0.6)); ctx.lineWidth = 0.8;
        ctx.beginPath(); ctx.arc(cx - 3 + ((i * 5) % 7), yb - ph * (yb - wl - 2), 1.1 + i * 0.3, 0, TAU); ctx.stroke();
      }
    }
    fr(ctx, cx - rx * 0.6, yt + 2, 1.5, yb - yt - 2, rgba('#ffffff', 0.5));
    ctx.restore();
    body(); ctx.strokeStyle = '#3d6f9a'; ctx.lineWidth = 1; ctx.stroke();
    ctx.beginPath(); ctx.ellipse(cx, yt, rx, ry, 0, 0, TAU); ctx.fillStyle = rgba('#d6efff', 0.7); ctx.fill(); ctx.strokeStyle = rgba('#3d6f9a', 0.8); ctx.lineWidth = 0.7; ctx.stroke();
  });
}

// ---------- Mampara ----------
function oficina_mampara(s, { c }) {
  const fabric = (notes) => (x, w, h) => {
    for (let i = 0; i < w; i += 2) for (let j = (i / 2) % 2; j < h; j += 2) fr(x, i, j, 0.7, 0.7, rgba(shade(c, -0.5), 0.18));
    if (notes) {
      fr(x, w * 0.12, h * 0.18, 9, 9, YELLOW); fr(x, w * 0.12, h * 0.18, 9, 1.5, shade(YELLOW, -0.15));
      fr(x, w * 0.22, h * 0.34, 9, 9, PINK);
      fr(x, w * 0.42, h * 0.14, 14, 18, '#f6f5f2');
      for (let i = 0; i < 5; i++) fr(x, w * 0.42 + 2, h * 0.14 + 3 + i * 3, 10 - (i % 2) * 3, 0.8, '#9aa0aa');
      fr(x, w * 0.66, h * 0.2, 15, 12, '#141414'); hexLogo(x, w * 0.66 + 7.5, h * 0.2 + 6, 3.6, {});
      fr(x, w * 0.7, h * 0.48, 9, 9, '#7fd3ff');
      for (const [a, b] of [[0.12, 0.18], [0.22, 0.34], [0.42, 0.14], [0.66, 0.2], [0.7, 0.48]]) dotc(x, w * a + 4.5, h * b + 1, 0.9, '#e23b3b');
    }
    sheen(x, w, h, 0.1);
  };
  s.shadowRect(0, 0.36, 2, 0.64, 0.22);
  for (const u of [0.02, 1.86]) s.box(u, 0.3, 0, u + 0.12, 0.7, 0.04, DMETAL);
  s.box(0.06, 0.45, 0.04, 1.94, 0.55, 1.22, c, { decal: { front: fabric(true), back: fabric(false) } });
  s.box(0, 0.43, 0, 0.06, 0.57, 1.28, METAL);
  s.box(1.94, 0.43, 0, 2, 0.57, 1.28, METAL);
  s.box(0.06, 0.43, 1.22, 1.94, 0.57, 1.28, METAL, { decal: { top: (x, w, h) => sheen(x, w, h, 0.2) } });
}

// ---------- Planta de oficina (lengua de suegra) ----------
function oficina_planta(s) {
  s.shadowRect(0.28, 0.28, 0.72, 0.72, 0.24);
  s.box(0.3, 0.3, 0, 0.7, 0.7, 0.42, '#f1efe9', { decal: { front: (x, w, h) => { fr(x, 0, h - 3, w, 3, '#d8d4cc'); sheen(x, w, h, 0.16); }, right: (x, w, h) => fr(x, 0, h - 3, w, 3, '#c9c4bb'), top: (x, w, h) => { fr(x, 2, 2, w - 4, h - 4, '#4a3020'); dotc(x, w * 0.4, h * 0.5, 0.9, '#6b4a30'); } } });
  s.custom([0.3, 0.3, 0.42, 0.7, 0.7, 1.5], (ctx) => {
    const [x, y] = s.P(0.5, 0.5, 0.4);
    const L = [[-7, 26, -0.18], [7, 28, 0.2], [-3, 36, -0.06], [3, 33, 0.1], [0, 40, 0.02], [-9, 18, -0.35], [9, 20, 0.36]];
    L.sort((a, b) => b[1] - a[1]);
    for (const [dx, hgt, lean] of L) {
      const bx = x + dx * 0.5, tx = x + dx + lean * hgt * 0.6, ty = y - hgt, wd = 3.6;
      ctx.beginPath(); ctx.moveTo(bx - wd, y); ctx.quadraticCurveTo(bx - wd - 1, y - hgt * 0.5, tx, ty); ctx.quadraticCurveTo(bx + wd + 1, y - hgt * 0.5, bx + wd, y); ctx.closePath();
      ctx.fillStyle = '#c8d65a'; ctx.fill(); ctx.strokeStyle = '#2c4a1e'; ctx.lineWidth = 0.8; ctx.stroke();
      ctx.beginPath(); ctx.moveTo(bx - wd + 1.2, y); ctx.quadraticCurveTo(bx - wd + 0.4, y - hgt * 0.5, tx, ty + 2); ctx.quadraticCurveTo(bx + wd - 0.4, y - hgt * 0.5, bx + wd - 1.2, y); ctx.closePath();
      ctx.fillStyle = '#2f7a3c'; ctx.fill();
      for (let k = 0.2; k < 0.85; k += 0.16) line(ctx, bx - 1.6, y - hgt * k, bx + 1.6, y - hgt * k - 1, rgba('#9fd18a', 0.5), 0.7);
    }
  });
}

// ---------- Pizarrón (pared) ----------
function oficina_pizarron(ctx) {
  const x = 3, y = -62, w = 58, h = 42;
  ctx.fillStyle = 'rgba(16,10,28,0.28)'; ctx.fillRect(x + 1.5, y + 2, w, h);
  fr(ctx, x, y, w, h, '#c3c8cf'); fr(ctx, x, y, w, 1, '#e6e9ed'); fr(ctx, x, y + h - 1, w, 1, '#8c929c');
  fr(ctx, x + 2, y + 2, w - 4, h - 4, '#fbfcfd');
  ctx.save(); ctx.beginPath(); ctx.rect(x + 2, y + 2, w - 4, h - 4); ctx.clip();
  const g = ctx.createLinearGradient(x, y, x + w, y + h); g.addColorStop(0, rgba('#ffffff', 0)); g.addColorStop(0.5, rgba('#dfe6ee', 0.5)); g.addColorStop(1, rgba('#ffffff', 0));
  ctx.fillStyle = g; ctx.fillRect(x, y, w, h);
  // título garabateado
  ctx.lineCap = 'round';
  line(ctx, x + 5, y + 6, x + 20, y + 6, '#2b2d38', 1.2); line(ctx, x + 22, y + 6, x + 28, y + 6, '#2b2d38', 1.2);
  // gráfica de barras
  line(ctx, x + 6, y + 10, x + 6, y + 34, '#2b2d38', 0.8); line(ctx, x + 6, y + 34, x + 34, y + 34, '#2b2d38', 0.8);
  [[9, 8, BLUE], [15, 13, YELLOW], [21, 17, BLUE], [27, 22, PINK]].forEach(([bx, bh, bc]) => { fr(ctx, x + bx, y + 34 - bh, 4, bh, bc); fr(ctx, x + bx, y + 34 - bh, 1, bh, rgba('#ffffff', 0.35)); });
  ctx.strokeStyle = GREEN; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(x + 9, y + 24); ctx.lineTo(x + 16, y + 20); ctx.lineTo(x + 22, y + 21); ctx.lineTo(x + 30, y + 11); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(x + 26.5, y + 11); ctx.lineTo(x + 30, y + 11); ctx.lineTo(x + 30, y + 14.5); ctx.stroke();
  // lista con palomitas
  for (let i = 0; i < 3; i++) {
    const ly = y + 12 + i * 6;
    ctx.strokeStyle = i < 2 ? GREEN : '#e23b3b'; ctx.lineWidth = 1; ctx.beginPath();
    if (i < 2) { ctx.moveTo(x + 38, ly); ctx.lineTo(x + 39.5, ly + 1.5); ctx.lineTo(x + 42, ly - 1.5); } else { ctx.moveTo(x + 38, ly - 1.5); ctx.lineTo(x + 41, ly + 1.5); ctx.moveTo(x + 41, ly - 1.5); ctx.lineTo(x + 38, ly + 1.5); }
    ctx.stroke();
    line(ctx, x + 44, ly, x + 52 - i * 2, ly, '#5a606b', 0.9);
  }
  ctx.restore();
  // notas adhesivas e imanes
  const note = (nx, ny, c, a) => { ctx.save(); ctx.translate(nx, ny); ctx.rotate(a); fr(ctx, -4, -4, 8, 8, c); fr(ctx, -4, -4, 8, 1.4, shade(c, -0.15)); line(ctx, -2.5, 0, 2.5, 0, rgba('#000', 0.3), 0.6); line(ctx, -2.5, 2, 1.5, 2, rgba('#000', 0.3), 0.6); ctx.restore(); };
  note(x + 47, y + 32, YELLOW, 0.08); note(x + 54, y + 30, PINK, -0.1);
  dotc(ctx, x + 47, y + 28.6, 1, '#e23b3b'); dotc(ctx, x + 54, y + 26.6, 1, BLUE);
  // charola y plumones
  fr(ctx, x + 8, y + h, w - 16, 2.4, '#9aa0aa'); fr(ctx, x + 8, y + h + 2.4, w - 16, 0.8, '#5b616c');
  [[14, PINK], [21, BLUE], [28, '#2b2d38']].forEach(([mx, mc]) => { fr(ctx, x + mx, y + h - 1.6, 6, 1.8, '#f6f5f2'); fr(ctx, x + mx + 4.6, y + h - 1.6, 1.6, 1.8, mc); });
  fr(ctx, x + 38, y + h - 2.6, 9, 2.8, '#2b2d38'); fr(ctx, x + 38, y + h - 2.6, 9, 0.8, '#5b616c');
  ctx.strokeStyle = rgba('#3a3f4a', 0.6); ctx.lineWidth = 0.6; ctx.strokeRect(x, y, w, h);
}

export default {
  floor: { oficina_silla, oficina_escritorio, oficina_laptop, oficina_archivero, oficina_copiadora, oficina_garrafon, oficina_mampara, oficina_planta },
  wall: { oficina_pizarron },
  period: { oficina_laptop: (st) => (st === 1 ? 500 : 0), oficina_copiadora: (st) => (st === 1 ? 100 : 0), oficina_garrafon: (st) => (st === 1 ? 90 : 0) },
  defaultColor: { oficina_laptop: '#c9ced6', oficina_copiadora: '#e3e5e8', oficina_garrafon: '#eef0f2', oficina_planta: '#f1efe9', oficina_pizarron: '#fbfcfd' },
};
