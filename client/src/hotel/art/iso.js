// Motor de dibujo de furnis: proyección isométrica, colores y primitivas 3D sencillas.
// Uso interno de furniArt.js (no depende del DOM; funciona con cualquier contexto 2D).
//
// Espacio de MODELO de un furni (rot 0): u ∈ [0, def.w] (ancho), v ∈ [0, def.l] (fondo), z hacia arriba.
// El FRENTE del furni siempre mira hacia +v. Scene.w() rota el modelo al mundo según item.rot.

export const PINK = '#FE3377';
export const YELLOW = '#FFCC00';
export const DARK = '#141414';
export const INK = '#1b1622';

// ---------- Colores ----------
const rgbCache = new Map();
export function rgb(hex) {
  let v = rgbCache.get(hex);
  if (v) return v;
  let h = String(hex).replace('#', '');
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  const n = parseInt(h.slice(0, 6), 16) || 0;
  v = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  rgbCache.set(hex, v);
  return v;
}
const toHex = (r, g, b) => '#' + ((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1);
const shadeCache = new Map();
// k > 0 aclara hacia blanco, k < 0 oscurece hacia negro
export function shade(hex, k) {
  const key = hex + '|' + k;
  let v = shadeCache.get(key);
  if (v) return v;
  const [r, g, b] = rgb(hex);
  const f = (c) => Math.max(0, Math.min(255, Math.round(k > 0 ? c + (255 - c) * k : c * (1 + k))));
  v = toHex(f(r), f(g), f(b));
  if (shadeCache.size > 6000) shadeCache.clear();
  shadeCache.set(key, v);
  return v;
}
export function mix(a, b, t) {
  const A = rgb(a), B = rgb(b);
  return toHex(...A.map((c, i) => Math.round(c + (B[i] - c) * t)));
}
export function rgba(hex, a) {
  const [r, g, b] = rgb(hex);
  return `rgba(${r},${g},${b},${a})`;
}
export const lum = (hex) => { const [r, g, b] = rgb(hex); return (0.299 * r + 0.587 * g + 0.114 * b) / 255; };
export const outlineOf = (c) => mix(shade(c, -0.62), INK, 0.45);

// ---------- Utilidades ----------
export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export const proj = (x, y, z) => [(x - y) * 32, (x + y) * 16 - z * 32];
export function pathPts(ctx, pts) {
  ctx.beginPath();
  ctx.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
  ctx.closePath();
}
function hull(pts) {
  const p = pts.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (p.length < 3) return p;
  const cr = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lo = [], up = [];
  for (const q of p) { while (lo.length >= 2 && cr(lo[lo.length - 2], lo[lo.length - 1], q) <= 0) lo.pop(); lo.push(q); }
  for (let i = p.length - 1; i >= 0; i--) { const q = p[i]; while (up.length >= 2 && cr(up[up.length - 2], up[up.length - 1], q) <= 0) up.pop(); up.push(q); }
  lo.pop(); up.pop();
  return lo.concat(up);
}
// ¿se enciman dos polígonos convexos? (ejes separadores, con tolerancia de medio píxel)
function overlap(A, B) {
  for (const P of [A, B]) {
    for (let i = 0; i < P.length; i++) {
      const p = P[i], q = P[(i + 1) % P.length];
      const nx = q[1] - p[1], ny = p[0] - q[0], l = Math.hypot(nx, ny) || 1;
      let a0 = Infinity, a1 = -Infinity, b0 = Infinity, b1 = -Infinity;
      for (const v of A) { const d = (v[0] * nx + v[1] * ny) / l; if (d < a0) a0 = d; if (d > a1) a1 = d; }
      for (const v of B) { const d = (v[0] * nx + v[1] * ny) / l; if (d < b0) b0 = d; if (d > b1) b1 = d; }
      if (a1 <= b0 + 0.5 || b1 <= a0 + 0.5) return false;
    }
  }
  return true;
}
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
function newell(pts) {
  let x = 0, y = 0, z = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length];
    x += (a[1] - b[1]) * (a[2] + b[2]);
    y += (a[2] - b[2]) * (a[0] + b[0]);
    z += (a[0] - b[0]) * (a[1] + b[1]);
  }
  return [x, y, z];
}
// Luz desde arriba a la izquierda de la pantalla: arriba claro, cara izquierda (+y) media, derecha (+x) oscura
const lightK = (n) => 0.05 * n[2] - 0.1 * Math.max(0, n[1]) - 0.26 * Math.max(0, n[0]) + 0.04 * Math.max(0, -n[0]) - 0.02 * Math.max(0, -n[1]);

// ---------- Escena de un furni ----------
export class Scene {
  constructor(W, L, rot) {
    this.W = W; this.L = L; this.rot = rot === 2 || rot === 4 || rot === 6 ? rot : 0;
    this.parts = []; this.pre = []; this.post = []; this.shadows = [];
  }
  // modelo → mundo (relativo al vértice norte de la huella)
  w(u, v, z) {
    switch (this.rot) {
      case 2: return [this.L - v, u, z];
      case 4: return [this.W - u, this.L - v, z];
      case 6: return [v, this.W - u, z];
      default: return [u, v, z];
    }
  }
  wv(a, b, c) {
    switch (this.rot) {
      case 2: return [-b, a, c];
      case 4: return [-a, -b, c];
      case 6: return [b, -a, c];
      default: return [a, b, c];
    }
  }
  P(u, v, z) { const p = this.w(u, v, z); return proj(p[0], p[1], p[2]); }
  // ¿la cara del modelo con esta normal se ve? (ej. faceVisible(0,1,0) = el frente)
  faceVisible(a, b, c) { return dot(this.wv(a, b, c), [1, 1, 1]) > 1e-6; }
  _aabb(pts) {
    const b = [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity];
    for (const p of pts) {
      const q = this.w(p[0], p[1], p[2]);
      for (let i = 0; i < 3; i++) { if (q[i] < b[i]) b[i] = q[i]; if (q[i] > b[i + 3]) b[i + 3] = q[i]; }
    }
    return b;
  }
  _boxPts(b) { return [[b[0], b[1], b[2]], [b[3], b[4], b[5]]]; }
  _add(part) { part.idx = this.parts.length; this.parts.push(part); return part; }

  poly(faces, color, o = {}) {
    const all = faces.flatMap((f) => f.pts);
    const wp = all.map((p) => this.w(p[0], p[1], p[2]));
    const c = [0, 0, 0];
    for (const p of wp) { c[0] += p[0]; c[1] += p[1]; c[2] += p[2]; }
    c[0] /= wp.length; c[1] /= wp.length; c[2] /= wp.length;
    return this._add({ kind: 'poly', faces, color, o, c, box: o.sortBox ? this._aabb(this._boxPts(o.sortBox)) : this._aabb(all) });
  }
  box(u0, v0, z0, u1, v1, z1, color, o = {}) {
    const F = (name, pts) => ({ name, pts, color: o.faces?.[name] || color, decal: o.decal?.[name] });
    return this.poly([
      F('top', [[u0, v0, z1], [u1, v0, z1], [u1, v1, z1], [u0, v1, z1]]),
      F('front', [[u0, v1, z0], [u1, v1, z0], [u1, v1, z1], [u0, v1, z1]]),
      F('back', [[u0, v0, z0], [u1, v0, z0], [u1, v0, z1], [u0, v0, z1]]),
      F('right', [[u1, v0, z0], [u1, v1, z0], [u1, v1, z1], [u1, v0, z1]]),
      F('left', [[u0, v0, z0], [u0, v1, z0], [u0, v1, z1], [u0, v0, z1]]),
    ], color, o);
  }
  // Prisma convexo: axis 'u' → perfil [[v, z]...] extruido en u ∈ [a0, a1] (tapas 'left'/'right');
  //                 axis 'v' → perfil [[u, z]...] extruido en v ∈ [a0, a1] (tapas 'back'/'front'). Lados: 'e0', 'e1'…
  prism(axis, prof, a0, a1, color, o = {}) {
    const P3 = axis === 'u' ? (a, p) => [a, p[0], p[1]] : (a, p) => [p[0], a, p[1]];
    const F = (name, pts) => ({ name, pts, color: o.faces?.[name] || color, decal: o.decal?.[name] });
    const n = prof.length;
    const faces = [
      F(axis === 'u' ? 'left' : 'back', prof.map((p) => P3(a0, p))),
      F(axis === 'u' ? 'right' : 'front', prof.map((p) => P3(a1, p))),
    ];
    for (let i = 0; i < n; i++) {
      const p = prof[i], q = prof[(i + 1) % n];
      faces.push(F('e' + i, [P3(a0, p), P3(a0, q), P3(a1, q), P3(a1, p)]));
    }
    return this.poly(faces, color, o);
  }
  // Cilindro / cono truncado. axis 'z': centro (c1=u, c2=v), de z=a0 (radio r0) a z=a1 (radio r1).
  // axis 'u': centro (c1=v, c2=z) a lo largo de u; axis 'v': centro (c1=u, c2=z) a lo largo de v.
  cyl(axis, c1, c2, r0, r1, a0, a1, color, o = {}) {
    const n = o.seg || 18;
    const pt = (a, r, k) => {
      const th = (k / n) * Math.PI * 2, x = c1 + r * Math.cos(th), y = c2 + r * Math.sin(th);
      return axis === 'z' ? [x, y, a] : axis === 'u' ? [a, x, y] : [x, a, y];
    };
    const A = [], B = [];
    for (let k = 0; k < n; k++) { A.push(pt(a0, r0, k)); B.push(pt(a1, r1, k)); }
    const names = axis === 'z' ? ['bottom', 'top'] : axis === 'u' ? ['left', 'right'] : ['back', 'front'];
    const faces = [];
    if (r0 > 0.001) faces.push({ name: names[0], pts: A, color: o.faces?.[names[0]] || color, decal: o.decal?.[names[0]] });
    if (r1 > 0.001) faces.push({ name: names[1], pts: B, color: o.faces?.[names[1]] || color, decal: o.decal?.[names[1]] });
    for (let k = 0; k < n; k++) {
      const k2 = (k + 1) % n;
      faces.push({ name: 'side', smooth: true, pts: [A[k], A[k2], B[k2], B[k]], color: o.faces?.side || color });
    }
    return this.poly(faces, color, o);
  }
  ball(u, v, z, r, color, o = {}) {
    return this._add({ kind: 'ball', p: [u, v, z], r, color, o, box: this._aabb([[u - r, v - r, z - r], [u + r, v + r, z + r]]) });
  }
  // Dibujo libre (en pantalla) con caja de orden en modelo [u0, v0, z0, u1, v1, z1]
  custom(b, fn, o = {}) { return this._add({ kind: 'custom', fn, o, box: this._aabb(this._boxPts(b)) }); }
  shadowRect(u0, v0, u1, v1, a = 0.2) { this.shadows.push({ pts: [[u0, v0], [u1, v0], [u1, v1], [u0, v1]], a }); }
  shadowEllipse(cu, cv, ru, rv = ru, a = 0.2) {
    const pts = [];
    for (let k = 0; k < 24; k++) { const th = (k / 24) * Math.PI * 2; pts.push([cu + ru * Math.cos(th), cv + rv * Math.sin(th)]); }
    this.shadows.push({ pts, a });
  }
  under(fn) { this.pre.push(fn); }
  over(fn) { this.post.push(fn); }

  _order() {
    const ps = this.parts, n = ps.length;
    if (n < 2) return ps.slice();
    const E = 1e-6;
    // silueta en pantalla (hexágono convexo) de cada caja: solo se ordenan pares que de verdad se enciman
    const R = ps.map((p) => {
      const b = p.box, q = [];
      for (const x of [b[0], b[3]]) for (const y of [b[1], b[4]]) for (const z of [b[2], b[5]]) q.push(proj(x, y, z));
      return hull(q);
    });
    const behind = ps.map(() => []);
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
      if (!overlap(R[i], R[j])) continue;
      const A = ps[i].box, B = ps[j].box;
      let r = 0;
      for (let k = 0; k < 3 && !r; k++) {
        if (A[k + 3] <= B[k] + E) r = -1;
        else if (B[k + 3] <= A[k] + E) r = 1;
      }
      if (r < 0) behind[j].push(i);
      else if (r > 0) behind[i].push(j);
    }
    const done = new Array(n).fill(false), out = [];
    for (let k = 0; k < n; k++) {
      let pick = -1;
      for (let i = 0; i < n && pick < 0; i++) {
        if (!done[i] && behind[i].every((j) => done[j])) pick = i;
      }
      if (pick < 0) { pick = done.indexOf(false); Scene.cycles++; }
      done[pick] = true; out.push(ps[pick]);
    }
    return out;
  }

  // keep(part) → si se dibuja esa pieza (capas para quien está sentado/acostado: ver furniArt.js);
  // las sombras y los dibujos de antes/después van solo con la capa de atrás (back = true)
  draw(ctx, keep = null, back = true) {
    if (back) for (const sh of this.shadows) {
      const pts = sh.pts.map(([u, v]) => { const p = this.w(u, v, 0); return proj(p[0] + 0.07, p[1] - 0.02, 0); });
      ctx.fillStyle = `rgba(16,10,28,${sh.a})`;
      pathPts(ctx, pts); ctx.fill();
    }
    if (back) for (const fn of this.pre) fn(ctx, this);
    for (const p of this._order()) {
      if (keep && !keep(p)) continue;
      if (p.kind === 'poly') this._drawPoly(ctx, p);
      else if (p.kind === 'ball') this._drawBall(ctx, p);
      else p.fn(ctx, this);
    }
    if (back) for (const fn of this.post) fn(ctx, this);
  }

  _drawBall(ctx, p) {
    const [x, y] = this.P(p.p[0], p.p[1], p.p[2]);
    const R = p.r * 34;
    ctx.fillStyle = p.o.flat ? p.color : shade(p.color, -0.12);
    ctx.beginPath(); ctx.arc(x, y, R, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = p.color;
    ctx.beginPath(); ctx.arc(x - R * 0.18, y - R * 0.18, R * 0.72, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = rgba('#ffffff', 0.55);
    ctx.beginPath(); ctx.arc(x - R * 0.38, y - R * 0.4, Math.max(0.6, R * 0.26), 0, Math.PI * 2); ctx.fill();
    if (p.o.outline !== false) {
      ctx.strokeStyle = p.o.outline || outlineOf(p.color); ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(x, y, R, 0, Math.PI * 2); ctx.stroke();
    }
  }

  _drawPoly(ctx, part) {
    const o = part.o, hp = [];
    for (const f of part.faces) {
      const wp = f.pts.map((p) => this.w(p[0], p[1], p[2]));
      let n = newell(wp);
      if (Math.abs(n[0]) + Math.abs(n[1]) + Math.abs(n[2]) < 1e-9) continue;
      n = norm(n);
      const fc = [0, 0, 0];
      for (const q of wp) { fc[0] += q[0]; fc[1] += q[1]; fc[2] += q[2]; }
      fc[0] /= wp.length; fc[1] /= wp.length; fc[2] /= wp.length;
      if (dot(sub(fc, part.c), n) < 0) n = [-n[0], -n[1], -n[2]];
      if (n[0] + n[1] + n[2] <= 1e-6) continue;
      const sp = wp.map((q) => proj(q[0], q[1], q[2]));
      for (const q of sp) hp.push(q);
      const fill = o.flat || f.flat ? f.color : shade(f.color, lightK(n) + (o.k || 0));
      ctx.fillStyle = fill;
      pathPts(ctx, sp); ctx.fill();
      if (f.smooth || o.noEdges) { ctx.strokeStyle = fill; ctx.lineWidth = 0.6; ctx.stroke(); }
      else if (o.edges !== false) { ctx.strokeStyle = shade(fill, -0.2); ctx.lineWidth = 0.7; ctx.stroke(); }
      if (f.decal) this._decal(ctx, f, wp, sp, n);
    }
    if (o.outline !== false && hp.length > 2) {
      ctx.strokeStyle = o.outline || outlineOf(part.color);
      ctx.lineWidth = o.lw || 1; ctx.lineJoin = 'round';
      pathPts(ctx, hull(hp)); ctx.stroke();
    }
  }

  // Mapea un dibujo plano (px, 32 px por unidad; y=0 arriba) sobre la cara
  _decal(ctx, f, wp, sp, n) {
    let t;
    if (Math.abs(n[2]) < 0.85) t = norm(sub([0, 0, 1], [n[0] * n[2], n[1] * n[2], n[2] * n[2]]));
    else t = norm(this.wv(0, -1, 0));
    const s = cross(n, t);
    let s0 = Infinity, s1 = -Infinity, t0 = Infinity, t1 = -Infinity;
    for (const q of wp) {
      const a = dot(q, s), b = dot(q, t);
      if (a < s0) s0 = a; if (a > s1) s1 = a; if (b < t0) t0 = b; if (b > t1) t1 = b;
    }
    const d = dot(wp[0], n);
    const O = [s[0] * s0 + t[0] * t0 + n[0] * d, s[1] * s0 + t[1] * t0 + n[1] * d, s[2] * s0 + t[2] * t0 + n[2] * d];
    const w = (s1 - s0) * 32, h = (t1 - t0) * 32;
    const S = proj(s[0], s[1], s[2]), T = proj(t[0], t[1], t[2]), Op = proj(O[0], O[1], O[2]);
    const at = (u, v, z) => { const q = this.w(u, v, z); return [(dot(q, s) - s0) * 32, h - (dot(q, t) - t0) * 32]; };
    ctx.save();
    pathPts(ctx, sp); ctx.clip();
    ctx.transform(S[0] / 32, S[1] / 32, -T[0] / 32, -T[1] / 32, Op[0] + (T[0] * h) / 32, Op[1] + (T[1] * h) / 32);
    f.decal(ctx, w, h, { at, n, scene: this });
    ctx.restore();
  }
}

// ---------- Contexto falso que solo mide (para furniBounds / wallBounds) ----------
export class BoundsRecorder {
  constructor() {
    this.m = [1, 0, 0, 1, 0, 0]; this.st = []; this.clipB = null; this.pb = null; this.box = null;
    this.lineWidth = 1; this.font = '10px sans-serif'; this.textAlign = 'start'; this.textBaseline = 'alphabetic';
    this.fillStyle = '#000'; this.strokeStyle = '#000'; this.globalAlpha = 1; this.globalCompositeOperation = 'source-over';
    this.lineCap = 'butt'; this.lineJoin = 'miter'; this.shadowBlur = 0; this.shadowColor = 'transparent'; this.imageSmoothingEnabled = true;
  }
  save() { this.st.push([this.m.slice(), this.clipB, this.lineWidth, this.font, this.textAlign, this.textBaseline]); }
  restore() { const s = this.st.pop(); if (s) [this.m, this.clipB, this.lineWidth, this.font, this.textAlign, this.textBaseline] = s; }
  transform(a, b, c, d, e, f) {
    const m = this.m;
    this.m = [m[0] * a + m[2] * b, m[1] * a + m[3] * b, m[0] * c + m[2] * d, m[1] * c + m[3] * d, m[0] * e + m[2] * f + m[4], m[1] * e + m[3] * f + m[5]];
  }
  setTransform(a, b, c, d, e, f) { if (a && typeof a === 'object') this.m = [a.a, a.b, a.c, a.d, a.e, a.f]; else this.m = [a, b, c, d, e, f]; }
  resetTransform() { this.m = [1, 0, 0, 1, 0, 0]; }
  getTransform() { const m = this.m; return { a: m[0], b: m[1], c: m[2], d: m[3], e: m[4], f: m[5] }; }
  translate(x, y) { this.transform(1, 0, 0, 1, x, y); }
  scale(x, y) { this.transform(x, 0, 0, y, 0, 0); }
  rotate(r) { const c = Math.cos(r), s = Math.sin(r); this.transform(c, s, -s, c, 0, 0); }
  _pt(x, y) {
    const m = this.m, X = m[0] * x + m[2] * y + m[4], Y = m[1] * x + m[3] * y + m[5];
    const b = this.pb || (this.pb = [Infinity, Infinity, -Infinity, -Infinity]);
    if (X < b[0]) b[0] = X; if (Y < b[1]) b[1] = Y; if (X > b[2]) b[2] = X; if (Y > b[3]) b[3] = Y;
  }
  beginPath() { this.pb = null; }
  closePath() {}
  moveTo(x, y) { this._pt(x, y); }
  lineTo(x, y) { this._pt(x, y); }
  quadraticCurveTo(a, b, x, y) { this._pt(a, b); this._pt(x, y); }
  bezierCurveTo(a, b, c, d, x, y) { this._pt(a, b); this._pt(c, d); this._pt(x, y); }
  arc(x, y, r) { this._pt(x - r, y - r); this._pt(x + r, y - r); this._pt(x - r, y + r); this._pt(x + r, y + r); }
  arcTo(a, b, c, d) { this._pt(a, b); this._pt(c, d); }
  ellipse(x, y, rx, ry) { const r = Math.max(rx, ry); this.arc(x, y, r); }
  rect(x, y, w, h) { this._pt(x, y); this._pt(x + w, y); this._pt(x, y + h); this._pt(x + w, y + h); }
  roundRect(x, y, w, h) { this.rect(x, y, w, h); }
  _scale() { const m = this.m; return Math.sqrt(Math.abs(m[0] * m[3] - m[1] * m[2])) || 1; }
  _commit(pad) {
    const b = this.pb;
    if (!b) return;
    let r = [b[0] - pad, b[1] - pad, b[2] + pad, b[3] + pad];
    const c = this.clipB;
    if (c) r = [Math.max(r[0], c[0]), Math.max(r[1], c[1]), Math.min(r[2], c[2]), Math.min(r[3], c[3])];
    if (r[0] > r[2] || r[1] > r[3]) return;
    const B = this.box;
    this.box = B ? [Math.min(B[0], r[0]), Math.min(B[1], r[1]), Math.max(B[2], r[2]), Math.max(B[3], r[3])] : r;
  }
  fill() { this._commit(0); }
  stroke() { this._commit((this.lineWidth / 2) * this._scale()); }
  clip() {
    const b = this.pb;
    if (!b) return;
    const c = this.clipB;
    this.clipB = c ? [Math.max(b[0], c[0]), Math.max(b[1], c[1]), Math.min(b[2], c[2]), Math.min(b[3], c[3])] : b.slice();
  }
  fillRect(x, y, w, h) { this.pb = null; this.rect(x, y, w, h); this._commit(0); this.pb = null; }
  strokeRect(x, y, w, h) { this.pb = null; this.rect(x, y, w, h); this.stroke(); this.pb = null; }
  clearRect() {}
  _fs() { const m = /(\d+(?:\.\d+)?)px/.exec(this.font); return m ? Number(m[1]) : 10; }
  measureText(t) { return { width: String(t).length * this._fs() * 0.62 }; }
  fillText(t, x, y) {
    const fs = this._fs(), w = this.measureText(t).width;
    const x0 = this.textAlign === 'center' ? x - w / 2 : this.textAlign === 'right' || this.textAlign === 'end' ? x - w : x;
    const y0 = this.textBaseline === 'middle' ? y - fs / 2 : this.textBaseline === 'top' ? y : y - fs;
    const keep = this.pb; this.pb = null; this.rect(x0, y0, w, fs); this._commit(1); this.pb = keep;
  }
  strokeText(t, x, y) { this.fillText(t, x, y); }
  drawImage() {}
  setLineDash() {}
  getLineDash() { return []; }
  createLinearGradient() { return { addColorStop() {} }; }
  createRadialGradient() { return { addColorStop() {} }; }
  createPattern() { return null; }
  isPointInPath() { return false; }
  result() { return this.box; }
}
Scene.cycles = 0; // pares sin orden posible (solo diagnóstico)
