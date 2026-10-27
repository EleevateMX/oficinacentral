// Temporada de Navidad: nieve que cae, pasto nevado, el gran árbol en la recepción (abre el
// Amigo secreto), regalos, muñecos de nieve, bastones, coronas, nochebuenas, series de luces,
// Santa y sus renos paseando afuera y un trineo que cruza el cielo de vez en cuando.
// Todo se calcula en el navegador.
import { drawAvatar } from './render.js';
import { T, OUTDOOR, hash, occupancy, findCenterpiece, bubble, sag } from './seasonKit.js';

const BULBS = ['#ff4d6d', '#FFCC00', '#3DDC84', '#4cc9f0', '#ff9f1c', '#FE3377'];

// ---------- Dónde va cada adorno ----------
export function buildNavidad(f, { efficient = false } = {}) {
  const occ = occupancy(f);
  const decor = [];
  const put = (type, x, y, extra = {}) => { occ.mark(x, y); decor.push({ type, x, y, seed: hash(x, y, 13), ...extra }); };

  // El árbol (2×2 casillas, crece hacia arriba) y sus regalos
  const tree = findCenterpiece(f, occ, 2, 2);
  if (tree) {
    for (const [dx, dy] of [[-1, 1], [2, 1], [0, 2], [1, 2]]) {
      const x = tree.x + dx, y = tree.y + dy;
      if (occ.bare(x, y)) put('gifts', x, y);
    }
  }

  for (let y = 1; y < f.H - 1; y++) {
    for (let x = 1; x < f.W - 1; x++) {
      if (!occ.free(x, y)) continue;
      const t = f.floor[y][x];
      const r = hash(x, y, 5);
      if (OUTDOOR.has(t)) {
        if (t !== 'path' && r < 0.012) put('snowman', x, y);
        else if (t === 'path' && r < 0.05) put('cane', x, y);
        else if (t !== 'path' && r < 0.03) put('pine', x, y);
      } else if (f.walls[y - 1]?.[x] && !occ.nearDesk(x, y)) {
        if (r < 0.05) put('poinsettia', x, y);
        else if (r < 0.075) decor.push({ type: 'wreath', x, y: y - 1, seed: r });
      }
    }
  }
  // Series de luces a lo ancho de cada área (salvo donde hay letrero de la marca)
  for (const a of f.areas || []) {
    for (const [x0, x1] of occ.topSpans(a)) decor.push({ type: 'lights', x: x0, y: a.y + 0.12, w: x1 - x0, seed: hash(Math.round(x0), a.y, 2) });
    // Nochebuenas en las esquinas de arriba
    for (const x of [a.x, a.x + a.w - 1]) if (occ.bare(x, a.y) && !occ.nearDesk(x, a.y) && hash(x, a.y, 9) < 0.7) put('poinsettia', x, a.y);
  }
  // Pasto nevado: casillas de afuera (se pintan solo las que se ven)
  const snow = f.floor.map((row) => row.map((t) => t === 'grass' || t === 'grass2'));

  // Paseantes: Santa y dos renos (afuera). En modo ahorro no hay.
  const outdoor = [];
  for (let y = 0; y < f.H; y++) for (let x = 0; x < f.W; x++) if (f.floor[y][x] && !f.solid[y][x] && OUTDOOR.has(f.floor[y][x])) outdoor.push({ x, y });
  let npcs = null;
  if (!efficient && outdoor.length) {
    // Cerca de la entrada, para que se vean al llegar
    const c = f.spawn || { x: f.W / 2, y: f.H / 2 };
    const near = outdoor.map((p) => ({ ...p, d: Math.hypot(p.x - c.x, p.y - c.y) })).sort((a, b) => a.d - b.d);
    const pick = (i) => near[Math.min(near.length - 1, 6 + i * 9)];
    const s = pick(1);
    npcs = [{ kind: 'santa', look: SANTA, x: s.x, y: s.y, rx: s.x, ry: s.y, dir: 'down', next: 0, area: 'outdoor', speed: 1100, ease: 0.06, lines: ['¡Jo, jo, jo!', '¡Feliz Navidad!', '¿Ya te portaste bien?', '🎁'] }];
    for (let i = 0; i < 2; i++) {
      const p = pick(i + 5);
      npcs.push({ kind: 'reindeer', x: p.x, y: p.y, rx: p.x, ry: p.y, dir: 'down', face: 1, next: 0, area: 'outdoor', speed: 700, ease: 0.1, red: i === 0, lines: ['🦌', '❤️', '¡Brrr!'] });
    }
  }
  const tw = tree && { id: 'season:tree', season: 'navidad', x: tree.x, y: tree.y - 1, w: 2, h: 3, label: 'Amigo secreto 🎁' };
  return { decor, tree, snow, npcs, objects: tw ? [tw] : [], flakes: makeFlakes(efficient ? 45 : 140) };
}

const SANTA = { name: 'Santa', skin: '#f2c3a0', hair: '#f4f4f6', hairStyle: 'short', top: 'jacket', shirt: '#d62828', accent: '#f4f4f6', pants: '#d62828', shoes: '#141414', facialHair: 'beard', hat: 'beanie', hatColor: '#d62828', eyes: 'normal', mouth: 'smile' };

function makeFlakes(n) {
  return Array.from({ length: n }, (_, i) => ({ x: hash(i, 1, 3), y: hash(i, 2, 3), r: 0.8 + hash(i, 3, 3) * 1.8, sp: 18 + hash(i, 4, 3) * 30, sw: hash(i, 5, 3) * Math.PI * 2 }));
}

// ---------- Dibujo ----------
function tree(ctx, X, Y, t) {
  // X, Y = esquina de arriba de la base (2×2 casillas); la copa sube 1.6 casillas más
  const cx = X + T, by = Y + 2 * T - 4;
  ctx.fillStyle = 'rgba(0,0,0,.25)'; ctx.beginPath(); ctx.ellipse(cx, by + 1, 30, 7, 0, 0, Math.PI * 2); ctx.fill();
  // maceta y tronco
  ctx.fillStyle = '#6b3f22'; ctx.fillRect(cx - 5, by - 14, 10, 10);
  ctx.fillStyle = '#d62828'; ctx.beginPath(); ctx.moveTo(cx - 12, by - 8); ctx.lineTo(cx + 12, by - 8); ctx.lineTo(cx + 9, by + 1); ctx.lineTo(cx - 9, by + 1); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#FFCC00'; ctx.fillRect(cx - 12, by - 8, 24, 2);
  // pisos de ramas
  const tiers = [[by - 12, 30, 30], [by - 34, 25, 28], [by - 54, 19, 26], [by - 72, 13, 22]];
  for (const [ty, hw, hh] of tiers) {
    ctx.fillStyle = '#1f6b3a';
    ctx.beginPath(); ctx.moveTo(cx - hw, ty); ctx.lineTo(cx + hw, ty); ctx.lineTo(cx, ty - hh); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#2d8a4e';
    ctx.beginPath(); ctx.moveTo(cx - hw + 4, ty - 2); ctx.lineTo(cx, ty - 2); ctx.lineTo(cx, ty - hh + 2); ctx.closePath(); ctx.fill();
    // nieve en las puntas
    ctx.fillStyle = 'rgba(255,255,255,.85)';
    for (let i = -hw + 3; i < hw - 2; i += 7) ctx.fillRect(cx + i, ty - 2, 4, 2);
  }
  // guirnalda dorada
  ctx.strokeStyle = '#FFCC00'; ctx.lineWidth = 1.3;
  for (const [ty, hw] of [[by - 22, 24], [by - 44, 19], [by - 62, 13]]) {
    ctx.beginPath(); ctx.moveTo(cx - hw, ty - 4); ctx.quadraticCurveTo(cx, ty + 6, cx + hw, ty - 8); ctx.stroke();
  }
  // esferas y foquitos que parpadean
  const pts = [[-20, -18], [16, -20], [-6, -26], [8, -40], [-14, -42], [2, -52], [-8, -60], [10, -64], [-2, -76], [20, -14], [-24, -14], [0, -30]];
  pts.forEach(([dx, dy], i) => {
    const on = (Math.floor(t / 420) + i) % 3 !== 0;
    const col = BULBS[i % BULBS.length];
    if (on) {
      const g = ctx.createRadialGradient(cx + dx, by + dy, 0.5, cx + dx, by + dy, 7);
      g.addColorStop(0, col + 'aa'); g.addColorStop(1, col + '00');
      ctx.fillStyle = g; ctx.fillRect(cx + dx - 7, by + dy - 7, 14, 14);
    }
    ctx.fillStyle = on ? col : '#5a6b5e';
    ctx.beginPath(); ctx.arc(cx + dx, by + dy, i % 4 === 0 ? 3 : 2, 0, Math.PI * 2); ctx.fill();
    if (i % 4 === 0) { ctx.fillStyle = 'rgba(255,255,255,.7)'; ctx.fillRect(cx + dx - 1.5, by + dy - 1.5, 1.2, 1.2); }
  });
  // estrella con brillo
  const sy = by - 98, pulse = 0.75 + Math.sin(t / 300) * 0.25;
  const g = ctx.createRadialGradient(cx, sy, 1, cx, sy, 22);
  g.addColorStop(0, `rgba(255,220,90,${0.55 * pulse})`); g.addColorStop(1, 'rgba(255,220,90,0)');
  ctx.fillStyle = g; ctx.fillRect(cx - 22, sy - 22, 44, 44);
  ctx.fillStyle = '#FFCC00';
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + i * Math.PI / 5, r = i % 2 ? 3.6 : 8.5;
    ctx.lineTo(cx + Math.cos(a) * r, sy + Math.sin(a) * r);
  }
  ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#fff6c2'; ctx.beginPath(); ctx.arc(cx, sy, 2, 0, Math.PI * 2); ctx.fill();
}

function gift(ctx, x, y, w, h, box, ribbon) {
  ctx.fillStyle = 'rgba(0,0,0,.2)'; ctx.fillRect(x + 1, y + h - 1, w, 3);
  ctx.fillStyle = box; ctx.fillRect(x, y, w, h);
  ctx.fillStyle = 'rgba(255,255,255,.18)'; ctx.fillRect(x, y, w, 2);
  ctx.fillStyle = ribbon; ctx.fillRect(x + w / 2 - 1.5, y, 3, h); ctx.fillRect(x, y + h / 2 - 1, w, 2.5);
  ctx.beginPath(); ctx.ellipse(x + w / 2 - 3, y - 1.5, 3, 2, -0.5, 0, Math.PI * 2); ctx.ellipse(x + w / 2 + 3, y - 1.5, 3, 2, 0.5, 0, Math.PI * 2); ctx.fill();
}
function gifts(ctx, X, Y, seed) {
  const pal = [['#d62828', '#FFCC00'], ['#FE3377', '#ffffff'], ['#1f6b3a', '#ff4d6d'], ['#3a86ff', '#FFCC00'], ['#FFCC00', '#d62828']];
  const a = pal[Math.floor(seed * 5) % 5], b = pal[(Math.floor(seed * 5) + 2) % 5], c = pal[(Math.floor(seed * 5) + 4) % 5];
  gift(ctx, X + 3, Y + 15, 14, 13, a[0], a[1]);
  gift(ctx, X + 16, Y + 18, 12, 10, b[0], b[1]);
  gift(ctx, X + 8, Y + 6, 10, 9, c[0], c[1]);
}
function snowman(ctx, X, Y, seed) {
  const cx = X + 16, by = Y + 29;
  ctx.fillStyle = 'rgba(0,0,0,.18)'; ctx.beginPath(); ctx.ellipse(cx + 1, by, 10, 3, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#f4f7fb'; ctx.beginPath(); ctx.arc(cx, by - 8, 9, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(cx, by - 21, 6.5, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#d8e2ee'; ctx.beginPath(); ctx.arc(cx + 3, by - 6, 5, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#141414'; ctx.fillRect(cx - 3, by - 23, 1.6, 1.6); ctx.fillRect(cx + 1.6, by - 23, 1.6, 1.6);
  ctx.fillRect(cx - 0.8, by - 11, 1.6, 1.6); ctx.fillRect(cx - 0.8, by - 7, 1.6, 1.6);
  ctx.fillStyle = '#ff8a1f'; ctx.beginPath(); ctx.moveTo(cx, by - 21); ctx.lineTo(cx + 5, by - 20); ctx.lineTo(cx, by - 19.5); ctx.fill();
  // bufanda y gorro
  ctx.fillStyle = seed > 0.5 ? '#FE3377' : '#d62828'; ctx.fillRect(cx - 6, by - 16, 12, 3); ctx.fillRect(cx + 2, by - 15, 3, 6);
  ctx.fillStyle = '#141414'; ctx.fillRect(cx - 6, by - 28, 12, 2); ctx.fillRect(cx - 4, by - 35, 8, 7);
  ctx.fillStyle = seed > 0.5 ? '#FFCC00' : '#3DDC84'; ctx.fillRect(cx - 4, by - 30, 8, 1.5);
  // brazos de rama
  ctx.strokeStyle = '#6b3f22'; ctx.lineWidth = 1.2;
  ctx.beginPath(); ctx.moveTo(cx - 8, by - 12); ctx.lineTo(cx - 15, by - 17); ctx.moveTo(cx + 8, by - 12); ctx.lineTo(cx + 15, by - 16); ctx.stroke();
}
function cane(ctx, X, Y) {
  const cx = X + 16, by = Y + 28;
  ctx.save();
  ctx.lineWidth = 3.4; ctx.lineCap = 'round';
  ctx.strokeStyle = '#ffffff';
  ctx.beginPath(); ctx.moveTo(cx, by); ctx.lineTo(cx, by - 18); ctx.arc(cx - 4, by - 18, 4, 0, Math.PI, true); ctx.stroke();
  ctx.strokeStyle = '#e63946'; ctx.lineWidth = 3.4; ctx.setLineDash([2.5, 3]);
  ctx.beginPath(); ctx.moveTo(cx, by); ctx.lineTo(cx, by - 18); ctx.arc(cx - 4, by - 18, 4, 0, Math.PI, true); ctx.stroke();
  ctx.restore();
}
function pine(ctx, X, Y, seed) {
  const cx = X + 16, by = Y + 28;
  ctx.fillStyle = 'rgba(0,0,0,.18)'; ctx.beginPath(); ctx.ellipse(cx + 1, by, 9, 3, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#6b3f22'; ctx.fillRect(cx - 2, by - 6, 4, 6);
  for (const [ty, hw, hh] of [[by - 4, 11, 13], [by - 12, 8, 11], [by - 19, 5, 9]]) {
    ctx.fillStyle = '#1c5e35'; ctx.beginPath(); ctx.moveTo(cx - hw, ty); ctx.lineTo(cx + hw, ty); ctx.lineTo(cx, ty - hh); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#f4f7fb'; ctx.beginPath(); ctx.moveTo(cx - hw * 0.4, ty - hh * 0.6); ctx.lineTo(cx + hw * 0.4, ty - hh * 0.6); ctx.lineTo(cx, ty - hh); ctx.closePath(); ctx.fill();
  }
  if (seed > 0.6) { ctx.fillStyle = '#FFCC00'; ctx.fillRect(cx - 1, by - 30, 2, 2); }
}
function poinsettia(ctx, X, Y, seed) {
  const cx = X + 16, by = Y + 28;
  ctx.fillStyle = 'rgba(0,0,0,.2)'; ctx.fillRect(cx - 7, by - 1, 15, 3);
  ctx.fillStyle = '#c8803f'; ctx.beginPath(); ctx.moveTo(cx - 6, by - 8); ctx.lineTo(cx + 6, by - 8); ctx.lineTo(cx + 4.5, by); ctx.lineTo(cx - 4.5, by); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#FFCC00'; ctx.fillRect(cx - 6, by - 8, 12, 1.5);
  ctx.fillStyle = '#1f6b3a';
  for (let i = 0; i < 5; i++) { const a = -Math.PI / 2 + (i - 2) * 0.55; ctx.beginPath(); ctx.ellipse(cx + Math.cos(a) * 7, by - 12 + Math.sin(a) * 5, 4, 2, a, 0, Math.PI * 2); ctx.fill(); }
  ctx.fillStyle = '#d62828';
  for (let i = 0; i < 6; i++) { const a = i * Math.PI / 3 + seed; ctx.beginPath(); ctx.ellipse(cx + Math.cos(a) * 4, by - 16 + Math.sin(a) * 3, 4, 1.8, a, 0, Math.PI * 2); ctx.fill(); }
  ctx.fillStyle = '#FFCC00'; ctx.beginPath(); ctx.arc(cx, by - 16, 1.6, 0, Math.PI * 2); ctx.fill();
}
function wreath(ctx, X, Y, t, seed) {
  const cx = X + 16, cy = Y + 16;
  ctx.strokeStyle = '#1f6b3a'; ctx.lineWidth = 5; ctx.beginPath(); ctx.arc(cx, cy, 7.5, 0, Math.PI * 2); ctx.stroke();
  ctx.strokeStyle = '#2d8a4e'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(cx, cy, 8.5, Math.PI, Math.PI * 1.9); ctx.stroke();
  for (let i = 0; i < 6; i++) {
    const a = i * Math.PI / 3 + seed * 3;
    ctx.fillStyle = (Math.floor(t / 500) + i) % 2 ? '#e63946' : '#FFCC00';
    ctx.beginPath(); ctx.arc(cx + Math.cos(a) * 7.5, cy + Math.sin(a) * 7.5, 1.4, 0, Math.PI * 2); ctx.fill();
  }
  ctx.fillStyle = '#d62828';
  ctx.beginPath(); ctx.moveTo(cx, cy + 7); ctx.lineTo(cx - 5, cy + 3); ctx.lineTo(cx - 5, cy + 10); ctx.closePath(); ctx.fill();
  ctx.beginPath(); ctx.moveTo(cx, cy + 7); ctx.lineTo(cx + 5, cy + 3); ctx.lineTo(cx + 5, cy + 10); ctx.closePath(); ctx.fill();
  ctx.fillRect(cx - 3, cy + 7, 2, 6); ctx.fillRect(cx + 1, cy + 7, 2, 6);
}
function lights(ctx, d, t) {
  const x0 = d.x * T, x1 = (d.x + d.w) * T, yy = d.y * T;
  const segs = Math.max(1, Math.round(d.w / 3));
  ctx.strokeStyle = 'rgba(30,40,30,.7)'; ctx.lineWidth = 0.8;
  for (let s = 0; s < segs; s++) {
    const a = x0 + (x1 - x0) * s / segs, b = x0 + (x1 - x0) * (s + 1) / segs;
    ctx.beginPath(); ctx.moveTo(a, yy); ctx.quadraticCurveTo((a + b) / 2, yy + 12, b, yy); ctx.stroke();
    const n = Math.max(3, Math.floor((b - a) / 11));
    for (let i = 1; i < n; i++) {
      const p = sag(a, b, yy, 6, i / n);
      const k = s * 31 + i;
      const on = (Math.floor(t / 520 + hash(k, 1, d.seed * 99) * 3)) % 3 !== 0;
      const col = BULBS[k % BULBS.length];
      if (on) { ctx.fillStyle = col + '44'; ctx.beginPath(); ctx.arc(p.x, p.y + 3, 4.5, 0, Math.PI * 2); ctx.fill(); }
      ctx.fillStyle = on ? col : 'rgba(120,120,120,.8)';
      ctx.beginPath(); ctx.ellipse(p.x, p.y + 3, 1.6, 2.4, 0, 0, Math.PI * 2); ctx.fill();
    }
  }
}
function reindeer(ctx, n, x, y, t) {
  const f = n.face || 1;
  const bob = n.moving ? Math.abs(Math.sin(t / 110)) * 1.5 : 0;
  ctx.save(); ctx.translate(x, y - bob); ctx.scale(f, 1);
  ctx.fillStyle = 'rgba(0,0,0,.2)'; ctx.beginPath(); ctx.ellipse(0, bob + 1, 10, 3, 0, 0, Math.PI * 2); ctx.fill();
  const leg = n.moving ? Math.sin(t / 90) * 2 : 0;
  ctx.fillStyle = '#5b3a22';
  ctx.fillRect(-7 + leg, -7, 2, 7); ctx.fillRect(5 - leg, -7, 2, 7); ctx.fillRect(-4 - leg, -7, 2, 7); ctx.fillRect(2 + leg, -7, 2, 7);
  ctx.fillStyle = '#8a5a35'; ctx.beginPath(); ctx.ellipse(0, -10, 9, 5, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#f1e2c8'; ctx.beginPath(); ctx.ellipse(-8, -9, 2, 2, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#8a5a35'; ctx.fillRect(5, -19, 4, 9);
  ctx.beginPath(); ctx.ellipse(10, -20, 4.5, 3.5, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = n.red ? '#ff2d2d' : '#3b2418'; ctx.beginPath(); ctx.arc(14.5, -19.5, n.red ? 2 : 1.4, 0, Math.PI * 2); ctx.fill();
  if (n.red) { ctx.fillStyle = 'rgba(255,45,45,.3)'; ctx.beginPath(); ctx.arc(14.5, -19.5, 4.5, 0, Math.PI * 2); ctx.fill(); }
  ctx.fillStyle = '#141414'; ctx.fillRect(10, -22, 1.4, 1.4);
  ctx.strokeStyle = '#c9a26b'; ctx.lineWidth = 1.2;
  ctx.beginPath(); ctx.moveTo(8, -23); ctx.lineTo(6, -29); ctx.lineTo(3, -31); ctx.moveTo(6, -28); ctx.lineTo(8, -31); ctx.moveTo(10, -23); ctx.lineTo(12, -29); ctx.lineTo(15, -30); ctx.stroke();
  ctx.fillStyle = '#d62828'; ctx.fillRect(4, -15, 6, 2);
  ctx.fillStyle = '#FFCC00'; ctx.beginPath(); ctx.arc(7, -12.5, 1.3, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

// Pasto nevado: solo las casillas visibles (se pinta antes de los muebles)
export function drawNavidadGround(ctx, s, view, f) {
  const x0 = Math.max(0, Math.floor(view.x0 / T)), x1 = Math.min(f.W - 1, Math.ceil(view.x1 / T));
  const y0 = Math.max(0, Math.floor(view.y0 / T)), y1 = Math.min(f.H - 1, Math.ceil(view.y1 / T));
  ctx.fillStyle = 'rgba(244,248,255,.62)';
  for (let y = y0; y <= y1; y++) {
    const row = s.snow[y];
    if (!row) continue;
    for (let x = x0; x <= x1; x++) if (row[x]) ctx.fillRect(x * T, y * T, T, T);
  }
  ctx.fillStyle = 'rgba(255,255,255,.75)';
  for (let y = y0; y <= y1; y++) {
    const row = s.snow[y];
    if (!row) continue;
    for (let x = x0; x <= x1; x++) {
      if (!row[x]) continue;
      const r = hash(x, y, 21);
      if (r < 0.45) ctx.fillRect(x * T + r * 40 % 22, y * T + r * 70 % 24, 6 + r * 8, 3);
    }
  }
}

// Adornos del piso (debajo de las personas)
export function drawNavidadDecor(ctx, s, t, view) {
  for (const d of s.decor) {
    const px = d.x * T, py = d.y * T;
    if (d.type !== 'lights' && (px < view.x0 - 64 || px > view.x1 + 64 || py < view.y0 - 64 || py > view.y1 + 64)) continue;
    if (d.type === 'gifts') gifts(ctx, px, py, d.seed);
    else if (d.type === 'snowman') snowman(ctx, px, py, d.seed);
    else if (d.type === 'cane') cane(ctx, px, py);
    else if (d.type === 'pine') pine(ctx, px, py, d.seed);
    else if (d.type === 'poinsettia') poinsettia(ctx, px, py, d.seed);
    else if (d.type === 'wreath') wreath(ctx, px, py, t, d.seed);
    else if (d.type === 'lights') lights(ctx, d, t);
  }
  if (s.tree) tree(ctx, s.tree.x * T, s.tree.y * T, t);
}

// Santa y los renos
export function drawNavidadWalkers(ctx, npcs, t, view) {
  const list = [...npcs].sort((a, b) => a.ry - b.ry);
  for (const n of list) {
    const x = (n.rx + 0.5) * T, y = (n.ry + 1) * T - 2;
    if (x < view.x0 - 64 || x > view.x1 + 64 || y < view.y0 - 64 || y > view.y1 + 96) continue;
    if (n.kind === 'santa') {
      const step = n.moving ? (Math.floor(t / 160) % 4) + 1 : 0;
      drawAvatar(ctx, x, y, n.look, n.dir, step, false, false, n.moving ? null : 'wave1');
      // pompón del gorro y cinturón
      ctx.fillStyle = '#f4f4f6'; ctx.beginPath(); ctx.arc(x + (n.dir === 'left' ? -7 : 7), y - 44, 2.6, 0, Math.PI * 2); ctx.fill();
      if (n.say) bubble(ctx, n.say.text, x, y - 52);
    } else {
      reindeer(ctx, n, x, y - 1, t);
      if (n.say) bubble(ctx, n.say.text, x, y - 36);
    }
  }
}

// Trineo que cruza el cielo y tinte cálido
export function drawNavidadSky(ctx, s, t, view, f) {
  const cycle = 40000, k = (t % cycle) / 9000;
  if (s.npcs && k < 1) {
    const w = view.x1 - view.x0;
    const bx = view.x1 + 60 - k * (w + 260), by = view.y0 + (view.y1 - view.y0) * 0.18 + Math.sin(k * Math.PI * 2) * 14;
    ctx.save();
    ctx.globalAlpha = 0.9;
    ctx.fillStyle = '#2a1d16';
    for (let i = 0; i < 3; i++) {
      const rx = bx + i * 22, ry = by + Math.sin(t / 150 + i) * 2;
      ctx.beginPath(); ctx.ellipse(rx, ry, 7, 3.5, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillRect(rx - 6, ry - 6, 3, 5);
      ctx.fillRect(rx - 5 + Math.sin(t / 80 + i) * 2, ry + 2, 1.5, 4); ctx.fillRect(rx + 4 - Math.sin(t / 80 + i) * 2, ry + 2, 1.5, 4);
      ctx.strokeStyle = '#2a1d16'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(rx - 6, ry - 6); ctx.lineTo(rx - 9, ry - 10); ctx.moveTo(rx - 5, ry - 6); ctx.lineTo(rx - 3, ry - 10); ctx.stroke();
      if (i === 0) { ctx.fillStyle = '#ff2d2d'; ctx.beginPath(); ctx.arc(rx - 8, ry - 3, 1.6, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = '#2a1d16'; }
    }
    ctx.strokeStyle = '#c9a26b'; ctx.lineWidth = 0.8; ctx.beginPath(); ctx.moveTo(bx + 50, by); ctx.lineTo(bx + 70, by + 4); ctx.stroke();
    ctx.fillStyle = '#d62828'; ctx.beginPath(); ctx.roundRect(bx + 68, by - 2, 20, 9, 3); ctx.fill();
    ctx.fillStyle = '#FFCC00'; ctx.fillRect(bx + 66, by + 8, 24, 1.5);
    ctx.fillStyle = '#d62828'; ctx.fillRect(bx + 76, by - 9, 7, 7);
    ctx.fillStyle = '#f4f4f6'; ctx.fillRect(bx + 75, by - 4, 9, 3);
    ctx.fillStyle = '#7a4a2b'; ctx.fillRect(bx + 82, by - 8, 6, 6);
    // estela de brillitos
    for (let i = 0; i < 8; i++) { ctx.fillStyle = `rgba(255,220,120,${0.6 - i * 0.07})`; ctx.fillRect(bx + 92 + i * 9, by + 4 + Math.sin(t / 100 + i) * 3, 2, 2); }
    ctx.restore();
  }
  ctx.fillStyle = 'rgba(255, 170, 90, 0.05)';
  ctx.fillRect(0, 0, f.W * T, f.H * T);
}

// Nieve que cae (en coordenadas de pantalla: barata y pareja con cualquier zoom)
export function drawNavidadScreen(ctx, s, t, v) {
  const W = v.w, H = v.h, sec = t / 1000;
  ctx.fillStyle = 'rgba(255,255,255,.85)';
  for (const p of s.flakes) {
    const y = ((p.y * H + sec * p.sp) % (H + 10)) - 5;
    const x = ((p.x * W + Math.sin(sec * 0.8 + p.sw) * 14 + sec * 6) % (W + 10) + W + 10) % (W + 10) - 5;
    ctx.globalAlpha = 0.5 + p.r / 5;
    ctx.beginPath(); ctx.arc(x, y, p.r, 0, Math.PI * 2); ctx.fill();
  }
  ctx.globalAlpha = 1;
}
