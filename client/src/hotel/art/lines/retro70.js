// Dibujo de la línea "Retro 70s". Mismo formato que art/floor.js y art/wall.js:
//   floor: { id: (s: Scene, { c, st, t, def }) => void }
//   wall:  { id: (ctx, { c, st, def, now }) => void }
//   period: { id: (st) => ms de animación o 0 }
//   defaultColor: { id: '#hex' }
import { shade, mix, rgba, rng, outlineOf, proj, pathPts, INK } from '../iso.js';

const TAU = Math.PI * 2;
const WALNUT = '#6b4128', CHROME = '#c9ced6', CREAM = '#f3ead6', SHELL = '#f5f2ea';
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
// misma luz que el motor (iso.js)
const lightK = (n) => 0.05 * n[2] - 0.1 * Math.max(0, n[1]) - 0.26 * Math.max(0, n[0]) + 0.04 * Math.max(0, -n[0]) - 0.02 * Math.max(0, -n[1]);
const flower = (ctx, x, y, r, petal, center, n = 6) => {
  for (let k = 0; k < n; k++) { const a = (k / n) * TAU; ctx.fillStyle = petal; ctx.beginPath(); ctx.ellipse(x + Math.cos(a) * r * 0.62, y + Math.sin(a) * r * 0.62, r * 0.48, r * 0.3, a, 0, TAU); ctx.fill(); }
  dotc(ctx, x, y, r * 0.34, center);
};

// Anillo (segmentos de corona circular) dibujado en pantalla con orden propio: para el sofá redondo
function ringFaces(s, cu, cv, rIn, rOut, z0, z1, a0, a1, n, color, extra, seams = 0) {
  const out = [];
  const P = (r, a, z) => [cu + r * Math.cos(a), cv + r * Math.sin(a), z];
  for (let k = 0; k < n; k++) {
    const a = a0 + ((a1 - a0) * k) / n, b = a0 + ((a1 - a0) * (k + 1)) / n, m = (a + b) / 2;
    const cm = Math.cos(m), sm = Math.sin(m);
    out.push({ pts: [P(rOut, a, z0), P(rOut, b, z0), P(rOut, b, z1), P(rOut, a, z1)], n: [cm, sm, 0], color, kind: 'out', k });
    out.push({ pts: [P(rIn, a, z0), P(rIn, b, z0), P(rIn, b, z1), P(rIn, a, z1)], n: [-cm, -sm, 0], color, kind: 'in', k, extra });
    out.push({ pts: [P(rIn, a, z1), P(rOut, a, z1), P(rOut, b, z1), P(rIn, b, z1)], n: [0, 0, 1], color, kind: 'top', k, top: true, seam: seams && k > 0 && k % seams === 0 });
    if (k === 0) out.push({ pts: [P(rIn, a, z0), P(rOut, a, z0), P(rOut, a, z1), P(rIn, a, z1)], n: [Math.sin(a), -Math.cos(a), 0], color, kind: 'cap' });
    if (k === n - 1) out.push({ pts: [P(rIn, b, z0), P(rOut, b, z0), P(rOut, b, z1), P(rIn, b, z1)], n: [-Math.sin(b), Math.cos(b), 0], color, kind: 'cap' });
  }
  return out;
}
function drawFaces(ctx, s, faces) {
  const items = [];
  for (const f of faces) {
    const wn = s.wv(f.n[0], f.n[1], f.n[2]);
    if (wn[0] + wn[1] + wn[2] <= 1e-6) continue;
    const wp = f.pts.map((p) => s.w(p[0], p[1], p[2]));
    let cx = 0, cy = 0;
    for (const q of wp) { cx += q[0]; cy += q[1]; }
    items.push({ f, sp: wp.map((q) => proj(q[0], q[1], q[2])), key: (cx + cy) / wp.length + (f.top ? 0.02 : 0), wn });
  }
  items.sort((a, b) => a.key - b.key);
  for (const it of items) {
    const fill = shade(it.f.color, lightK(it.wn)), sp = it.sp, k = it.f.kind;
    ctx.fillStyle = fill; pathPts(ctx, sp); ctx.fill();
    ctx.strokeStyle = fill; ctx.lineWidth = 0.7; ctx.lineJoin = 'round'; ctx.stroke();
    const ol = mix(shade(it.f.color, -0.62), INK, 0.45);
    const edge = (a, b, c = ol, w = 1) => line(ctx, sp[a][0], sp[a][1], sp[b][0], sp[b][1], c, w);
    if (k === 'out') { edge(0, 1); edge(2, 3, shade(fill, -0.25), 0.7); }
    else if (k === 'top') { edge(0, 3); edge(1, 2); if (it.f.seam) edge(0, 1, shade(fill, -0.3), 0.8); }
    else if (k === 'in') edge(0, 1);
    else if (k === 'cap') { pathPts(ctx, sp); ctx.strokeStyle = ol; ctx.lineWidth = 1; ctx.stroke(); }
    if (it.f.extra) it.f.extra(ctx, sp, fill);
  }
}

// ---------- Piso ----------
function retro70_sofa_round(s, { c }) {
  const cu = 1, cv = 1.02, a0 = Math.PI - 0.32, a1 = TAU + 0.32, N = 16;
  s.shadowEllipse(1, 0.98, 0.98, 0.92, 0.22);
  s.custom([0, 0, 0, 2, 2, 1], (ctx) => {
    const button = (g, sp, fill) => {
      const x = (sp[0][0] + sp[1][0] + sp[2][0] + sp[3][0]) / 4, y = (sp[0][1] + sp[1][1] + sp[2][1] + sp[3][1]) / 4;
      dotc(g, x, y, 1.1, shade(fill, -0.4)); dotc(g, x - 0.3, y - 0.4, 0.4, rgba('#ffffff', 0.4));
    };
    drawFaces(ctx, s, ringFaces(s, cu, cv, 0.5, 0.88, 0, 0.1, a0 + 0.05, a1 - 0.05, N, '#3a2a22'));
    drawFaces(ctx, s, ringFaces(s, cu, cv, 0.4, 0.95, 0.1, 0.42, a0, a1, N, c, null, 4));
    drawFaces(ctx, s, ringFaces(s, cu, cv, 0.74, 0.97, 0.42, 0.98, a0, a1, N, shade(c, -0.06), button, 4));
  });
}

function retro70_egg(s, { c }) {
  s.shadowEllipse(0.5, 0.52, 0.36, 0.36, 0.24);
  s.cyl('z', 0.5, 0.5, 0.3, 0.27, 0, 0.05, CHROME, { seg: 22 });
  s.cyl('z', 0.5, 0.5, 0.045, 0.045, 0.05, 0.35, CHROME, { seg: 10 });
  s.custom([0.08, 0.08, 0.35, 0.92, 0.92, 1.5], (ctx) => {
    const [x, y] = s.P(0.5, 0.5, 0.88);
    const [fx, fy] = s.P(0.5, 1, 0.88);
    const dx = fx - x, dy = fy - y;
    const front = s.faceVisible(0, 1, 0);
    const ol = outlineOf('#b9b2a2');
    // cascarón
    const g = ctx.createLinearGradient(x - 26, y - 30, x + 26, y + 26);
    g.addColorStop(0, '#ffffff'); g.addColorStop(0.5, SHELL); g.addColorStop(1, '#cfc8b8');
    const egg = () => { ctx.beginPath(); ctx.moveTo(x, y + 20); ctx.bezierCurveTo(x + 30, y + 18, x + 26, y - 38, x, y - 38); ctx.bezierCurveTo(x - 26, y - 38, x - 30, y + 18, x, y + 20); ctx.closePath(); };
    egg(); ctx.fillStyle = g; ctx.fill(); ctx.strokeStyle = ol; ctx.lineWidth = 1; ctx.stroke();
    if (front) {
      // hueco acolchado mirando al frente
      const ox = x + dx * 0.26, oy = y + dy * 0.26 - 3;
      const tilt = Math.atan2(dy, dx) > Math.PI / 2 ? 0.18 : -0.18;
      ctx.save(); egg(); ctx.clip();
      ctx.fillStyle = shade(c, -0.45); ctx.beginPath(); ctx.ellipse(ox, oy, 17.5, 27, tilt, 0, TAU); ctx.fill();
      const cg = ctx.createLinearGradient(ox - 16, oy - 24, ox + 16, oy + 22);
      cg.addColorStop(0, shade(c, 0.18)); cg.addColorStop(1, shade(c, -0.22));
      ctx.fillStyle = cg; ctx.beginPath(); ctx.ellipse(ox + dx * 0.04, oy + 1, 15.5, 25, tilt, 0, TAU); ctx.fill();
      // costuras del cojín
      ctx.strokeStyle = rgba(shade(c, -0.55), 0.45); ctx.lineWidth = 0.8;
      ctx.beginPath(); ctx.ellipse(ox + dx * 0.04, oy + 9, 13, 6, tilt, Math.PI * 0.05, Math.PI * 0.95); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(ox + dx * 0.04, oy - 20); ctx.lineTo(ox + dx * 0.04, oy + 2); ctx.stroke();
      ctx.fillStyle = rgba('#ffffff', 0.22); ctx.beginPath(); ctx.ellipse(ox - 5, oy - 10, 4, 9, tilt, 0, TAU); ctx.fill();
      // borde del cascarón
      ctx.strokeStyle = rgba('#ffffff', 0.9); ctx.lineWidth = 1.3;
      ctx.beginPath(); ctx.ellipse(ox, oy, 17.5, 27, tilt, 0, TAU); ctx.stroke();
      ctx.strokeStyle = rgba(ol, 0.5); ctx.lineWidth = 0.6; ctx.stroke();
      ctx.restore();
      egg(); ctx.strokeStyle = ol; ctx.lineWidth = 1; ctx.stroke();
    } else {
      ctx.strokeStyle = rgba('#000000', 0.12); ctx.lineWidth = 0.8;
      ctx.beginPath(); ctx.moveTo(x, y - 37); ctx.quadraticCurveTo(x + 4, y - 8, x, y + 19); ctx.stroke();
    }
    ctx.fillStyle = rgba('#ffffff', 0.7); ctx.beginPath(); ctx.ellipse(x - 15, y - 16, 2.2, 8, 0.25, 0, TAU); ctx.fill();
  });
}

function retro70_table(s, { c }) {
  s.shadowEllipse(0.5, 0.5, 0.42, 0.42, 0.22);
  s.cyl('z', 0.5, 0.5, 0.22, 0.17, 0, 0.4, WALNUT, { seg: 20 });
  s.cyl('z', 0.5, 0.5, 0.45, 0.45, 0.4, 0.5, WALNUT, {
    seg: 28,
    decal: {
      top: (x, w, h) => {
        const cx = w / 2, cy = h / 2, R = w * 0.4;
        x.save(); x.beginPath(); x.arc(cx, cy, R, 0, TAU); x.clip();
        fr(x, 0, 0, w, h, CREAM);
        const n = 5, sz = (2 * R) / n;
        for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
          const tx = cx - R + i * sz, ty = cy - R + j * sz;
          fr(x, tx + 0.4, ty + 0.4, sz - 0.8, sz - 0.8, (i + j) % 2 ? c : shade(c, 0.55));
          if ((i + j) % 2 === 0) flower(x, tx + sz / 2, ty + sz / 2, sz * 0.36, c, '#fff4cf', 4);
        }
        x.restore();
        x.strokeStyle = rgba('#000', 0.25); x.lineWidth = 0.8; x.beginPath(); x.arc(cx, cy, R, 0, TAU); x.stroke();
        sheen(x, w, h, 0.2);
      },
    },
  });
}

function retro70_lava(s, { c, st, t }) {
  const on = st === 1;
  s.shadowEllipse(0.5, 0.5, 0.24, 0.24, 0.24);
  if (on) s.under((ctx) => floorGlow(ctx, s, 0.5, 0.5, 1.1, c, 0.3));
  s.cyl('z', 0.5, 0.5, 0.24, 0.12, 0, 0.42, CHROME, { seg: 22 });
  s.cyl('z', 0.5, 0.5, 0.135, 0.135, 0.42, 0.46, shade(CHROME, -0.25), { seg: 18 });
  s.custom([0.34, 0.34, 0.46, 0.66, 0.66, 1.36], (ctx) => {
    const [cx, yb] = s.P(0.5, 0.5, 0.46), yt = s.P(0.5, 0.5, 1.36)[1];
    const rb = 0.14 * 45, rm = 0.19 * 45, rt = 0.085 * 45;
    const ym = yb - (yb - yt) * 0.32;
    const glass = () => {
      ctx.beginPath(); ctx.moveTo(cx - rb, yb); ctx.quadraticCurveTo(cx - rm - 1.5, ym, cx - rt, yt);
      ctx.lineTo(cx + rt, yt); ctx.quadraticCurveTo(cx + rm + 1.5, ym, cx + rb, yb);
      ctx.ellipse(cx, yb, rb, rb * 0.5, 0, 0, Math.PI); ctx.closePath();
    };
    const liq = on ? mix(c, '#fff4d0', 0.45) : shade(c, -0.6);
    const g = ctx.createLinearGradient(cx - rm, 0, cx + rm, 0);
    g.addColorStop(0, shade(liq, on ? 0.25 : 0)); g.addColorStop(0.5, liq); g.addColorStop(1, shade(liq, -0.3));
    ctx.save(); glass(); ctx.fillStyle = g; ctx.fill(); ctx.clip();
    const blob = on ? c : shade(c, -0.3);
    const H = yb - yt;
    ctx.fillStyle = blob;
    if (on) {
      const ph = t / 1000;
      const bl = [[0, 0.6, 5.2, 0.5], [1.7, 0.42, 3.8, 0.8], [3.1, 0.55, 3.2, 1.2], [4.4, 0.35, 4.4, 0.6], [5.5, 0.5, 2.6, 1]];
      for (const [o, sp, r, wob] of bl) {
        const k = (Math.sin(ph * sp + o) + 1) / 2;
        const yy = yb - 4 - k * (H - 10), xx = cx + Math.sin(ph * wob + o * 2) * 2.6;
        ctx.beginPath(); ctx.ellipse(xx, yy, r, r * (1.1 + 0.25 * Math.sin(ph * 2 + o)), 0, 0, TAU); ctx.fill();
      }
      ctx.beginPath(); ctx.ellipse(cx, yb - 1, rb, 3.5, 0, 0, TAU); ctx.fill();
    } else {
      ctx.beginPath(); ctx.ellipse(cx, yb - 2, rb, 5, 0, 0, TAU); ctx.fill();
      dotc(ctx, cx - 1, yb - 8, 3, blob);
    }
    ctx.fillStyle = rgba('#ffffff', 0.4); ctx.fillRect(cx - rm * 0.55, yt + 4, 1.4, H - 9);
    ctx.restore();
    glass(); ctx.strokeStyle = outlineOf(c); ctx.lineWidth = 1; ctx.stroke();
  });
  s.cyl('z', 0.5, 0.5, 0.095, 0.06, 1.36, 1.58, CHROME, { seg: 16 });
  if (on) s.over((ctx) => { const [x, y] = s.P(0.5, 0.5, 0.9); glow(ctx, x, y, 38, c, 0.3); });
}

function retro70_rug(s, { c }) {
  const clear = 'rgba(0,0,0,0)';
  s.box(0.02, 0.02, 0, 1.98, 1.98, 0.03, clear, {
    flat: true, outline: false, edges: false,
    decal: {
      top: (x, w, h) => {
        const cx = w / 2, cy = h / 2, R = w * 0.48, n = 8;
        const petals = () => {
          x.beginPath();
          for (let k = 0; k < n; k++) { const a = (k / n) * TAU; x.moveTo(cx + Math.cos(a) * R * 0.98, cy + Math.sin(a) * R * 0.98); x.ellipse(cx + Math.cos(a) * R * 0.6, cy + Math.sin(a) * R * 0.6, R * 0.4, R * 0.27, a, 0, TAU); }
        };
        // sombra y borde
        petals(); x.fillStyle = shade(c, -0.45); x.fill();
        x.save(); x.translate(-0.8, -0.8); petals(); x.fillStyle = c; x.fill(); x.restore();
        // pelo largo
        x.save(); petals(); x.clip();
        const r = rng(70);
        for (let i = 0; i < 520; i++) {
          const px = r() * w, py = r() * h, a = r() * TAU;
          x.strokeStyle = r() < 0.5 ? rgba(shade(c, 0.35), 0.55) : rgba(shade(c, -0.3), 0.5); x.lineWidth = 0.7;
          x.beginPath(); x.moveTo(px, py); x.lineTo(px + Math.cos(a) * 2.2, py + Math.sin(a) * 2.2); x.stroke();
        }
        x.restore();
        // centro
        const cc = c === '#d9a62b' ? '#b8452f' : '#f3c23a';
        dotc(x, cx, cy, R * 0.3, shade(cc, -0.35)); dotc(x, cx - 0.6, cy - 0.6, R * 0.28, cc);
        const r2 = rng(71);
        for (let i = 0; i < 90; i++) { const a = r2() * TAU, d = Math.sqrt(r2()) * R * 0.27; dotc(x, cx + Math.cos(a) * d, cy + Math.sin(a) * d, 0.6, rgba(r2() < 0.5 ? '#ffffff' : '#000000', 0.18)); }
      },
    },
  });
}

function retro70_record(s, { st, t }) {
  const on = st === 1, grill = '#d9a62b';
  s.shadowRect(0.02, 0.12, 1.98, 0.96, 0.24);
  // patas cónicas
  for (const u of [0.14, 1.8]) for (const v of [0.22, 0.78]) s.cyl('z', u + 0.03, v + 0.03, 0.025, 0.04, 0, 0.14, '#3a2418', { seg: 8 });
  const front = (x, w, h) => {
    const sp = (x0) => {
      fr(x, x0, 3, w * 0.3, h - 6, shade(WALNUT, -0.35));
      fr(x, x0 + 1, 4, w * 0.3 - 2, h - 8, grill);
      x.fillStyle = rgba('#7a4a10', 0.35);
      for (let i = 0; i < w * 0.3 - 2; i += 2) x.fillRect(x0 + 1 + i, 4, 0.8, h - 8);
      for (let j = 0; j < h - 8; j += 2) x.fillRect(x0 + 1, 4 + j, w * 0.3 - 2, 0.5);
    };
    sp(4); sp(w * 0.7 - 4);
    // tablero
    fr(x, w * 0.36, 4, w * 0.28, h - 8, '#2a1a12');
    fr(x, w * 0.38, 6, w * 0.24, 4, on ? '#ffb347' : '#5a4a3a');
    for (let i = 0; i < 3; i++) dotc(x, w * (0.42 + i * 0.08), h * 0.66, 2, CHROME);
    for (let i = 0; i < 3; i++) dotc(x, w * (0.42 + i * 0.08), h * 0.66, 0.8, '#555');
    dotc(x, w * 0.62, h - 6, 0.9, on ? '#ff5a3c' : '#4a3a3a');
    sheen(x, w, h, 0.12);
  };
  const grain = (x, w, h) => { x.strokeStyle = rgba('#3a2010', 0.25); x.lineWidth = 0.6; for (let i = 1; i < 4; i++) { x.beginPath(); x.moveTo(0, (h * i) / 4); x.bezierCurveTo(w * 0.3, (h * i) / 4 + 1.5, w * 0.6, (h * i) / 4 - 1.5, w, (h * i) / 4); x.stroke(); } sheen(x, w, h, 0.15); };
  s.box(0.04, 0.16, 0.14, 1.96, 0.9, 0.82, WALNUT, { decal: { front, left: grain, right: grain, back: grain } });
  s.box(0.02, 0.14, 0.82, 1.98, 0.92, 0.88, shade(WALNUT, 0.08), {
    decal: {
      top: (x, w, h) => {
        grain(x, w, h);
        // tornamesa
        const cx = w * 0.3, cy = h / 2, R = h * 0.4;
        fr(x, cx - R - 3, 2, R * 2 + 6, h - 4, '#2a1a12');
        dotc(x, cx, cy, R + 1, '#9aa0aa');
        dotc(x, cx, cy, R, '#141418');
        x.strokeStyle = rgba('#ffffff', 0.09); x.lineWidth = 0.5;
        for (let r = 4; r < R; r += 1.6) { x.beginPath(); x.arc(cx, cy, r, 0, TAU); x.stroke(); }
        const a = on ? (t / 100) * 0.9 : 0.6;
        x.fillStyle = rgba('#ffffff', 0.16); x.beginPath(); x.moveTo(cx, cy); x.arc(cx, cy, R, a, a + 0.5); x.closePath(); x.fill();
        x.fillStyle = rgba('#ffffff', 0.16); x.beginPath(); x.moveTo(cx, cy); x.arc(cx, cy, R, a + Math.PI, a + Math.PI + 0.5); x.closePath(); x.fill();
        dotc(x, cx, cy, R * 0.32, '#e8772e');
        x.fillStyle = '#d9a62b'; x.beginPath(); x.moveTo(cx, cy); x.arc(cx, cy, R * 0.32, a, a + Math.PI); x.closePath(); x.fill();
        dotc(x, cx, cy, 0.9, '#e6e6e6');
        // brazo
        const ax = cx + R + 1, ay = cy - R + 1;
        dotc(x, ax, ay, 2, '#b9c0c9');
        x.strokeStyle = '#d6dbe2'; x.lineWidth = 1.2; x.beginPath(); x.moveTo(ax, ay); x.lineTo(cx + (on ? R * 0.55 : R + 2), cy + (on ? -R * 0.1 : R * 0.5)); x.stroke();
        // discos a un lado
        const rx = w * 0.72;
        for (let i = 0; i < 3; i++) fr(x, rx + i * 1.4, 4, 1.2, h - 8, ['#e8772e', '#c23bd4', '#2fb67c'][i]);
        fr(x, rx + 6, 4, h - 8, h - 8, '#d9a62b'); flower(x, rx + 6 + (h - 8) / 2, h / 2, (h - 8) * 0.32, '#b8452f', '#fff4cf', 6);
      },
    },
  });
  if (on) s.over((ctx) => {
    const [x, y] = s.P(0.6, 0.5, 1.0);
    for (let i = 0; i < 3; i++) {
      const ph = ((t / 1200 + i / 3) % 1);
      ctx.fillStyle = rgba(['#e8772e', '#d9a62b', '#c23bd4'][i], 1 - ph);
      const nx = x + 6 + i * 6 + Math.sin(ph * 6 + i) * 3, ny = y - 6 - ph * 20;
      ctx.beginPath(); ctx.ellipse(nx, ny, 1.9, 1.4, -0.4, 0, TAU); ctx.fill();
      ctx.fillRect(nx + 1.2, ny - 5, 0.8, 5);
    }
  });
}

// ---------- Pared ----------
function retro70_poster(ctx) {
  const x = 3, y = -56, w = 26, h = 44;
  ctx.fillStyle = 'rgba(16,10,28,0.28)'; ctx.fillRect(x + 1.5, y + 2, w, h);
  fr(ctx, x, y, w, h, '#f3e2bf');
  ctx.save(); ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
  // arcoíris setentero
  const cols = ['#6b3a1f', '#b8452f', '#e8772e', '#d9a62b', '#f3e2bf'];
  cols.forEach((cc, i) => { ctx.fillStyle = cc; ctx.beginPath(); ctx.arc(x + w / 2, y + h * 0.62, w * 0.62 - i * 3.2, Math.PI, TAU); ctx.lineTo(x + w, y + h); ctx.lineTo(x, y + h); ctx.fill(); });
  fr(ctx, x, y + h * 0.62, w, h * 0.38, '#7a8f3a');
  // símbolo de paz
  const px = x + w / 2, py = y + h * 0.36, pr = 5.5;
  ctx.strokeStyle = '#fff6df'; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.arc(px, py, pr, 0, TAU); ctx.moveTo(px, py - pr); ctx.lineTo(px, py + pr);
  ctx.moveTo(px, py); ctx.lineTo(px - pr * 0.7, py + pr * 0.7); ctx.moveTo(px, py); ctx.lineTo(px + pr * 0.7, py + pr * 0.7); ctx.stroke();
  // flores
  flower(ctx, x + 6, y + h - 8, 4.5, '#fff6df', '#d9a62b');
  flower(ctx, x + w - 7, y + h - 6, 3.6, '#c23bd4', '#fff6df');
  flower(ctx, x + w / 2 + 1, y + h - 4, 2.8, '#e8772e', '#fff6df');
  ctx.restore();
  ctx.strokeStyle = '#6b3a1f'; ctx.lineWidth = 0.8; ctx.strokeRect(x + 0.4, y + 0.4, w - 0.8, h - 0.8);
  // cinta
  ctx.fillStyle = rgba('#f3ead2', 0.85);
  ctx.save(); ctx.translate(x + w / 2, y + 0.5); ctx.fillRect(-4, -1.5, 8, 3); ctx.restore();
}

function retro70_macrame(ctx) {
  const x0 = 6, x1 = 26, top = -66, cord = '#efe3c8', dk = '#c9b892';
  // colgador
  ctx.strokeStyle = dk; ctx.lineWidth = 0.7;
  ctx.beginPath(); ctx.moveTo(x0 - 1, top); ctx.lineTo(16, top - 7); ctx.lineTo(x1 + 1, top); ctx.stroke();
  dotc(ctx, 16, top - 7, 0.9, '#5a5a5a');
  ctx.fillStyle = 'rgba(16,10,28,0.2)'; ctx.beginPath(); ctx.moveTo(x0 + 1.5, top + 2); ctx.lineTo(x1 + 1.5, top + 2); ctx.lineTo(18, top + 44); ctx.closePath(); ctx.fill();
  // cuerdas
  const n = 8;
  for (let i = 0; i < n; i++) {
    const cx = x0 + 1 + (i * (x1 - x0 - 2)) / (n - 1);
    const endY = top + 30 + (1 - Math.abs(i - (n - 1) / 2) / ((n - 1) / 2)) * 14;
    ctx.strokeStyle = shade(cord, -0.25); ctx.lineWidth = 1.6; ctx.beginPath(); ctx.moveTo(cx, top); ctx.lineTo(cx, endY); ctx.stroke();
    ctx.strokeStyle = cord; ctx.lineWidth = 1; ctx.stroke();
    // flecos
    ctx.strokeStyle = rgba(cord, 0.85); ctx.lineWidth = 0.6;
    for (const d of [-0.7, 0, 0.7]) { ctx.beginPath(); ctx.moveTo(cx, endY); ctx.lineTo(cx + d, endY + 6); ctx.stroke(); }
  }
  // nudos en diamante
  const knot = (kx, ky) => { dotc(ctx, kx, ky, 1.9, shade(cord, -0.3)); dotc(ctx, kx - 0.3, ky - 0.3, 1.4, cord); };
  for (let r = 0; r < 4; r++) {
    const cnt = r < 2 ? 4 - r : r - 0 - 0;
    const ky = top + 6 + r * 6;
    const span = (x1 - x0 - 4) * (1 - Math.abs(r - 1.5) / 3);
    for (let i = 0; i < Math.max(1, cnt); i++) knot(16 - span / 2 + (cnt > 1 ? (i * span) / (cnt - 1) : span / 2), ky);
  }
  knot(16, top + 30);
  // cuentas de madera
  for (const [bx, by] of [[11, top + 21], [21, top + 21], [16, top + 35]]) { dotc(ctx, bx, by, 1.6, '#8a5a3b'); dotc(ctx, bx - 0.4, by - 0.4, 0.6, rgba('#ffffff', 0.4)); }
  // varilla
  fr(ctx, x0 - 3, top - 1.5, x1 - x0 + 6, 3, '#8a5a3b'); fr(ctx, x0 - 3, top - 1.5, x1 - x0 + 6, 1, '#b07a52');
}

export default {
  floor: { retro70_sofa_round, retro70_egg, retro70_table, retro70_lava, retro70_rug, retro70_record },
  wall: { retro70_poster, retro70_macrame },
  period: { retro70_lava: (st) => (st === 1 ? 80 : 0), retro70_record: (st) => (st === 1 ? 100 : 0) },
  defaultColor: { retro70_record: WALNUT, retro70_poster: '#e8772e', retro70_macrame: '#efe3c8' },
};
