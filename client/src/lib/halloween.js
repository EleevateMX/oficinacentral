// Temporada de Halloween y Día de Muertos: adornos en el mapa y personajes que pasean
// (zombies, perritos, fantasmas, murciélagos). Todo se calcula en el navegador: no se guarda
// nada en la oficina y se quita solo cuando termina la temporada.
import { drawAvatar } from './render.js';
import { drawPet } from './pets.js';
import { CATALOG, objSize } from '@shared/catalog.js';

const T = 32;
const OUTDOOR = new Set(['grass', 'grass2', 'path']);
const hash = (x, y, s = 0) => {
  let h = (x * 374761393 + y * 668265263 + s * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
};

// ---------- Dónde va cada adorno ----------
export function buildHalloween(f) {
  const decor = [];
  const used = new Set();
  // No encimar adornos sobre muebles (aunque se pueda caminar encima, como bancas o tapetes)
  for (const o of f.objects || []) {
    if (CATALOG[o.type]?.under) continue;
    const { w, h } = objSize(o);
    for (let j = Math.floor(o.y); j < Math.ceil(o.y + h); j++) for (let i = Math.floor(o.x); i < Math.ceil(o.x + w); i++) used.add(`${i},${j}`);
  }
  const free = (x, y) => x >= 0 && y >= 0 && x < f.W && y < f.H && f.floor[y]?.[x] && !f.solid[y][x] && !used.has(`${x},${y}`);
  const put = (type, x, y, extra = {}) => { used.add(`${x},${y}`); decor.push({ type, x, y, seed: hash(x, y, 7), ...extra }); };
  const nearDesk = (x, y) => f.desks?.some((d) => x >= d.zone.x - 1 && x < d.zone.x + d.zone.w + 1 && y >= d.zone.y - 1 && y < d.zone.y + d.zone.h + 1);

  for (let y = 1; y < f.H - 1; y++) {
    for (let x = 1; x < f.W - 1; x++) {
      if (!free(x, y)) continue;
      const t = f.floor[y][x];
      const r = hash(x, y, 3);
      if (OUTDOOR.has(t)) {
        if (t !== 'path' && r < 0.018) put('tomb', x, y);
        else if (t !== 'path' && r < 0.03) put('marigold', x, y);
        else if (r < 0.038) put('pumpkin', x, y);
      } else if (f.walls[y - 1]?.[x] && !nearDesk(x, y)) {
        // Pegado a la pared de arriba: calabazas y velas, sin estorbar escritorios
        if (r < 0.06) put('pumpkin', x, y);
        else if (r < 0.085) put('candles', x, y);
      }
    }
  }
  // Telarañas en las esquinas de arriba de cada área y papel picado a lo ancho
  for (const a of f.areas || []) {
    decor.push({ type: 'web', x: a.x, y: a.y, flip: false, seed: hash(a.x, a.y) });
    decor.push({ type: 'web', x: a.x + a.w - 1, y: a.y, flip: true, seed: hash(a.y, a.x) });
    // Papel picado, salvo donde hay un letrero o logo de la marca en la pared de arriba
    const sign = (f.objects || []).some((o) => CATALOG[o.type]?.brand && o.y < a.y + 1.5 && o.y + objSize(o).h > a.y - 1 && o.x + objSize(o).w > a.x && o.x < a.x + a.w);
    if (a.w >= 5 && !sign) decor.push({ type: 'picado', x: a.x + 0.5, y: a.y + 0.15, w: a.w - 1, seed: hash(a.x, a.w) });
  }
  // Ofrenda de Día de Muertos cerca de la entrada
  if (f.spawn) {
    for (const [dx, dy] of [[-4, 1], [4, 1], [-4, -2], [4, -2], [-6, 0], [6, 0]]) {
      const x = f.spawn.x + dx, y = f.spawn.y + dy;
      if (free(x, y) && free(x + 1, y)) { put('ofrenda', x, y); used.add(`${x + 1},${y}`); break; }
    }
  }
  // Lugares para que paseen los personajes
  const outdoor = [], indoor = [];
  for (let y = 0; y < f.H; y++) for (let x = 0; x < f.W; x++) {
    if (!f.floor[y][x] || f.solid[y][x]) continue;
    (OUTDOOR.has(f.floor[y][x]) ? outdoor : indoor).push({ x, y });
  }
  return { decor, outdoor, indoor };
}

// ---------- Personajes que pasean ----------
const ZOMBIES = [
  { name: 'Zombie Godínez', skin: '#8fbf6a', hair: '#2b2b2b', hairStyle: 'spiky', top: 'shirt', shirt: '#9aa3a8', accent: '#6b2a2a', pants: '#3e4462', shoes: '#1d1d22', eyes: 'sleepy', mouth: 'open' },
  { name: 'Zombie Gamer', skin: '#7fae63', hair: '#5a3a22', hairStyle: 'curly', top: 'hoodie', shirt: '#5b3fb8', accent: '#2b2b2b', pants: '#2b2d42', shoes: '#4a4a4a', eyes: 'big', mouth: 'open', hat: 'beanie', hatColor: '#2b2b2b' },
  { name: 'Zombie Ejecutiva', skin: '#93c27a', hair: '#1b1720', hairStyle: 'long', top: 'blazer', shirt: '#3a3d45', accent: '#8a1f1f', pants: '#2b2d38', shoes: '#1d1d22', bottom: 'skirt', eyes: 'sleepy', mouth: 'open' },
];
const DOGS = [
  { pet: 'xolo', name: 'Xolo', color: '#4a4040', collar: '#ff8a1f' },
  { pet: 'chihuahua', name: 'Calaverita', color: '#e8c39a', collar: '#b46bff' },
  { pet: 'labradorNegro', name: 'Diablito', color: '#2b2b2f', collar: '#e5484d', horns: true },
];
const LINES = { zombie: ['Grrr… cerebros', 'Mmmh… café', '¿Ya es viernes?', 'Grrr…'], dog: ['¡Guau!', '¡Wof!', '❤️'] };

export function createNpcs(spots) {
  const npcs = [];
  const pick = (list, i) => list[Math.floor(hash(i, list.length, 11) * list.length) % list.length];
  if (spots.outdoor.length) {
    ZOMBIES.forEach((z, i) => { const s = pick(spots.outdoor, i + 1); npcs.push({ kind: 'zombie', look: z, x: s.x, y: s.y, rx: s.x, ry: s.y, dir: 'down', next: 0, area: 'outdoor', speed: 900 + i * 150 }); });
  }
  const dogSpots = spots.indoor.length ? spots.indoor : spots.outdoor;
  if (dogSpots.length) {
    DOGS.forEach((d, i) => { const s = pick(dogSpots, i + 20); npcs.push({ kind: 'dog', look: d, x: s.x, y: s.y, rx: s.x, ry: s.y, dir: 'down', face: 1, next: 0, area: 'any', speed: 380 }); });
  }
  // Fantasmas: flotan sobre todo (atraviesan paredes)
  for (let i = 0; i < 3; i++) {
    const s = pick(spots.indoor.length ? spots.indoor : spots.outdoor, i + 40);
    if (s) npcs.push({ kind: 'ghost', x: s.x, y: s.y, rx: s.x, ry: s.y, hx: s.x, hy: s.y, seed: i });
  }
  return npcs;
}

const DIRV = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };

// Avanza a los personajes. players: { id: {rx, ry, floorId} } del piso actual
export function stepNpcs(npcs, f, now, players) {
  const ok = (n, x, y) => x >= 0 && y >= 0 && x < f.W && y < f.H && f.floor[y]?.[x] && !f.solid[y][x] && (n.area !== 'outdoor' || OUTDOOR.has(f.floor[y][x]));
  for (const n of npcs) {
    if (n.kind === 'ghost') {
      const t = now / 1000 + n.seed * 10;
      n.rx = n.hx + Math.sin(t * 0.21) * 6 + Math.sin(t * 0.7) * 0.6;
      n.ry = n.hy + Math.cos(t * 0.17) * 3;
      continue;
    }
    // Cerca de una persona: el perrito se queda a su lado moviendo la cola
    let near = null;
    for (const p of players) if (Math.abs(p.rx - n.rx) <= 1.3 && Math.abs(p.ry - n.ry) <= 1.3) { near = p; break; }
    n.near = !!near;
    if (now >= n.next && !(n.kind === 'dog' && near)) {
      n.next = now + n.speed * (0.7 + Math.random() * 0.6);
      // A veces el perrito busca a alguien para que lo acaricien
      let dir = null;
      if (n.kind === 'dog' && Math.random() < 0.5) {
        let best = null, bd = 9;
        for (const p of players) { const d = Math.abs(p.rx - n.x) + Math.abs(p.ry - n.y); if (d < bd) { bd = d; best = p; } }
        if (best) dir = Math.abs(best.rx - n.x) > Math.abs(best.ry - n.y) ? (best.rx > n.x ? 'right' : 'left') : (best.ry > n.y ? 'down' : 'up');
      }
      if (!dir || !ok(n, n.x + DIRV[dir][0], n.y + DIRV[dir][1])) {
        const opts = Object.keys(DIRV).filter((d) => ok(n, n.x + DIRV[d][0], n.y + DIRV[d][1]));
        dir = opts.includes(n.dir) && Math.random() < 0.65 ? n.dir : opts[Math.floor(Math.random() * opts.length)];
      }
      if (dir) {
        n.dir = dir;
        n.x += DIRV[dir][0]; n.y += DIRV[dir][1];
        if (dir === 'left') n.face = -1; if (dir === 'right') n.face = 1;
      }
      const lines = n.lines || LINES[n.kind];
      if (lines && Math.random() < 0.04) n.say = { text: lines[Math.floor(Math.random() * lines.length)], until: now + 2200 };
    }
    const k = n.ease || (n.kind === 'zombie' ? 0.04 : 0.12);
    n.rx += (n.x - n.rx) * k; n.ry += (n.y - n.ry) * k;
    n.moving = Math.abs(n.x - n.rx) + Math.abs(n.y - n.ry) > 0.05;
    if (n.kind === 'dog' && near && !n.say && Math.random() < 0.004) n.say = { text: '❤️', until: now + 1600 };
    if (n.say && n.say.until < now) n.say = null;
  }
}

// ---------- Dibujo ----------
function pumpkin(ctx, x, y, t, seed) {
  const cx = x + 16, by = y + 28;
  ctx.fillStyle = 'rgba(0,0,0,.22)'; ctx.beginPath(); ctx.ellipse(cx + 1, by + 1, 10, 3, 0, 0, Math.PI * 2); ctx.fill();
  for (const [dx, w, c] of [[-5, 6, '#d9661c'], [5, 6, '#d9661c'], [0, 7, '#f28a2e']]) { ctx.fillStyle = c; ctx.beginPath(); ctx.ellipse(cx + dx, by - 7, w, 7.5, 0, 0, Math.PI * 2); ctx.fill(); }
  ctx.fillStyle = '#3f7a2c'; ctx.fillRect(cx - 1, by - 17, 3, 4);
  const flick = 0.75 + Math.sin(t / 90 + seed * 20) * 0.15 + Math.sin(t / 37 + seed * 9) * 0.1;
  ctx.fillStyle = `rgba(255, 214, 90, ${flick})`;
  ctx.beginPath(); ctx.moveTo(cx - 5, by - 10); ctx.lineTo(cx - 2, by - 10); ctx.lineTo(cx - 3.5, by - 13); ctx.fill();
  ctx.beginPath(); ctx.moveTo(cx + 2, by - 10); ctx.lineTo(cx + 5, by - 10); ctx.lineTo(cx + 3.5, by - 13); ctx.fill();
  ctx.fillRect(cx - 5, by - 6, 10, 2); ctx.fillRect(cx - 3, by - 4, 2, 1); ctx.fillRect(cx + 1, by - 4, 2, 1);
  // brillo en el piso
  const g = ctx.createRadialGradient(cx, by - 6, 2, cx, by - 6, 20);
  g.addColorStop(0, `rgba(255,170,60,${0.18 * flick})`); g.addColorStop(1, 'rgba(255,170,60,0)');
  ctx.fillStyle = g; ctx.fillRect(cx - 20, by - 26, 40, 40);
}
function tomb(ctx, x, y, seed) {
  const cx = x + 16, by = y + 28;
  ctx.fillStyle = 'rgba(0,0,0,.2)'; ctx.fillRect(cx - 9, by - 1, 20, 4);
  ctx.fillStyle = '#5b6470'; ctx.beginPath(); ctx.roundRect(cx - 9, by - 22, 18, 22, [8, 8, 1, 1]); ctx.fill();
  ctx.fillStyle = '#7b8592'; ctx.beginPath(); ctx.roundRect(cx - 8, by - 21, 15, 20, [7, 7, 1, 1]); ctx.fill();
  ctx.fillStyle = '#4a525d'; ctx.font = '700 6px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.fillText(seed > 0.5 ? 'RIP' : 'Bug', cx - 0.5, by - 11);
  ctx.fillRect(cx - 5, by - 7, 9, 1);
  ctx.fillStyle = '#3f7a2c'; ctx.fillRect(cx - 11, by - 2, 4, 2); ctx.fillRect(cx + 7, by - 3, 3, 3);
}
function marigold(ctx, x, y, seed) {
  for (let i = 0; i < 4; i++) {
    const fx = x + 7 + hash(i, 1, seed * 99) * 18, fy = y + 14 + hash(i, 2, seed * 99) * 12;
    ctx.fillStyle = '#3f7a2c'; ctx.fillRect(fx, fy, 1.5, 6);
    ctx.fillStyle = i % 2 ? '#ff8a1f' : '#ffb21f'; ctx.beginPath(); ctx.arc(fx + 0.7, fy, 3.2, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#e05f0a'; ctx.beginPath(); ctx.arc(fx + 0.7, fy, 1.2, 0, Math.PI * 2); ctx.fill();
  }
}
function candles(ctx, x, y, t, seed) {
  for (let i = 0; i < 3; i++) {
    const cx = x + 8 + i * 7, h = 6 + i % 2 * 4, by = y + 28;
    ctx.fillStyle = '#f3ead6'; ctx.fillRect(cx - 1.5, by - h, 3, h);
    const fl = Math.sin(t / 70 + i + seed * 30);
    ctx.fillStyle = '#ffd25a'; ctx.beginPath(); ctx.ellipse(cx, by - h - 3 + fl * 0.3, 1.6, 2.8 + fl * 0.4, 0, 0, Math.PI * 2); ctx.fill();
    const g = ctx.createRadialGradient(cx, by - h - 3, 1, cx, by - h - 3, 10);
    g.addColorStop(0, 'rgba(255,200,90,.25)'); g.addColorStop(1, 'rgba(255,200,90,0)');
    ctx.fillStyle = g; ctx.fillRect(cx - 10, by - h - 13, 20, 20);
  }
}
function web(ctx, x, y, flip) {
  ctx.save();
  ctx.translate(flip ? x + T : x, y);
  if (flip) ctx.scale(-1, 1);
  ctx.strokeStyle = 'rgba(235,235,245,.55)'; ctx.lineWidth = 0.7;
  const R = 26;
  for (let a = 0; a <= 4; a++) { const ang = (a / 4) * Math.PI / 2; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(Math.cos(ang) * R, Math.sin(ang) * R); ctx.stroke(); }
  for (let r = 7; r <= R; r += 6.5) {
    ctx.beginPath();
    for (let a = 0; a <= 4; a++) { const ang = (a / 4) * Math.PI / 2; const px = Math.cos(ang) * r, py = Math.sin(ang) * r; a ? ctx.quadraticCurveTo(Math.cos(ang - 0.2) * r * 0.85, Math.sin(ang - 0.2) * r * 0.85, px, py) : ctx.moveTo(px, py); }
    ctx.stroke();
  }
  ctx.fillStyle = '#1b1424'; ctx.beginPath(); ctx.arc(15, 15, 2.4, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}
function picado(ctx, x, y, w, t) {
  const cols = ['#FE3377', '#ff8a1f', '#b46bff', '#3DDC84', '#3a86ff', '#FFCC00'];
  const x0 = x * T, x1 = (x + w) * T, yy = y * T;
  ctx.strokeStyle = 'rgba(60,40,30,.6)'; ctx.lineWidth = 0.8;
  ctx.beginPath(); ctx.moveTo(x0, yy); ctx.quadraticCurveTo((x0 + x1) / 2, yy + 8, x1, yy); ctx.stroke();
  const n = Math.max(2, Math.floor((x1 - x0) / 15));
  for (let i = 0; i < n; i++) {
    const k = (i + 0.5) / n, px = x0 + (x1 - x0) * k, py = yy + 8 * 4 * k * (1 - k) * 0.5;
    const sway = Math.sin(t / 600 + i) * 0.08;
    ctx.save(); ctx.translate(px, py); ctx.rotate(sway);
    ctx.fillStyle = cols[i % cols.length]; ctx.fillRect(-5, 0, 10, 11);
    ctx.fillStyle = 'rgba(255,255,255,.55)'; ctx.fillRect(-2, 3, 1.5, 1.5); ctx.fillRect(1, 3, 1.5, 1.5); ctx.fillRect(-1.5, 6.5, 3.5, 1);
    for (let z = -5; z < 5; z += 2.5) { ctx.beginPath(); ctx.moveTo(z, 11); ctx.lineTo(z + 1.25, 13); ctx.lineTo(z + 2.5, 11); ctx.fillStyle = cols[i % cols.length]; ctx.fill(); }
    ctx.restore();
  }
}
function ofrenda(ctx, x, y, t) {
  const X = x * T, Y = y * T;
  ctx.fillStyle = 'rgba(0,0,0,.2)'; ctx.fillRect(X + 2, Y + 26, 62, 6);
  // escalones
  for (const [i, c] of [[0, '#7a3b8f'], [1, '#e05ca5'], [2, '#ff8a1f']]) { ctx.fillStyle = c; ctx.fillRect(X + 4 + i * 8, Y + 26 - (i + 1) * 9, 56 - i * 16, 9); ctx.fillStyle = 'rgba(255,255,255,.25)'; ctx.fillRect(X + 4 + i * 8, Y + 26 - (i + 1) * 9, 56 - i * 16, 1.5); }
  // calaverita
  const sx = X + 32, sy = Y - 6;
  ctx.fillStyle = '#f6f1e6'; ctx.beginPath(); ctx.arc(sx, sy, 6, 0, Math.PI * 2); ctx.fill(); ctx.fillRect(sx - 4, sy + 3, 8, 4);
  ctx.fillStyle = '#1b1424'; ctx.beginPath(); ctx.arc(sx - 2.3, sy, 1.6, 0, Math.PI * 2); ctx.arc(sx + 2.3, sy, 1.6, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#FE3377'; ctx.fillRect(sx - 1, sy - 5, 2, 2);
  // pan de muerto
  ctx.fillStyle = '#c8803f'; ctx.beginPath(); ctx.ellipse(X + 18, Y + 6, 5, 3.2, 0, Math.PI, 0); ctx.fill();
  ctx.fillStyle = '#e6b06a'; ctx.fillRect(X + 15, Y + 4, 6, 1);
  // flores y velas
  marigold(ctx, X + 40, Y - 12, 0.3);
  marigold(ctx, X - 2, Y - 4, 0.7);
  candles(ctx, X + 6, Y - 12, t, 0.2);
  candles(ctx, X + 38, Y - 4, t, 0.9);
}
function ghost(ctx, n, t) {
  const x = (n.rx + 0.5) * T, y = (n.ry + 0.5) * T + Math.sin(t / 400 + n.seed) * 4;
  ctx.save();
  ctx.globalAlpha *= 0.72;
  ctx.fillStyle = '#f2f4ff';
  ctx.beginPath();
  ctx.arc(x, y - 6, 9, Math.PI, 0);
  ctx.lineTo(x + 9, y + 8);
  for (let i = 0; i < 4; i++) ctx.quadraticCurveTo(x + 9 - i * 4.5 - 2.25, y + 12 + Math.sin(t / 150 + i) * 2, x + 9 - (i + 1) * 4.5, y + 8);
  ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#1b1424';
  ctx.beginPath(); ctx.ellipse(x - 3, y - 6, 1.6, 2.4, 0, 0, Math.PI * 2); ctx.ellipse(x + 3, y - 6, 1.6, 2.4, 0, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.ellipse(x, y - 1, 1.6, 2, 0, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}
function bubble(ctx, text, x, y) {
  ctx.save();
  ctx.font = '600 7px system-ui, sans-serif';
  const w = ctx.measureText(text).width + 8;
  ctx.fillStyle = 'rgba(20,16,30,.85)'; ctx.beginPath(); ctx.roundRect(x - w / 2, y - 10, w, 11, 5); ctx.fill();
  ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(text, x, y - 4.3);
  ctx.restore();
}

// Adornos del piso (debajo de las personas)
export function drawHalloweenDecor(ctx, hw, t, view) {
  for (const d of hw.decor) {
    const px = d.x * T, py = d.y * T;
    if (px < view.x0 - 64 || px > view.x1 + 64 || py < view.y0 - 64 || py > view.y1 + 64) continue;
    if (d.type === 'pumpkin') pumpkin(ctx, px, py, t, d.seed);
    else if (d.type === 'tomb') tomb(ctx, px, py, d.seed);
    else if (d.type === 'marigold') marigold(ctx, px, py, d.seed);
    else if (d.type === 'candles') candles(ctx, px, py, t, d.seed);
    else if (d.type === 'web') web(ctx, px, py, d.flip);
    else if (d.type === 'picado') picado(ctx, d.x, d.y, d.w, t);
    else if (d.type === 'ofrenda') ofrenda(ctx, d.x, d.y, t);
  }
}

// Zombies y perritos (a la altura de las personas)
export function drawHalloweenWalkers(ctx, npcs, t, view) {
  const list = npcs.filter((n) => n.kind !== 'ghost').sort((a, b) => a.ry - b.ry);
  for (const n of list) {
    const x = (n.rx + 0.5) * T, y = (n.ry + 1) * T - 2;
    if (x < view.x0 - 64 || x > view.x1 + 64 || y < view.y0 - 64 || y > view.y1 + 96) continue;
    if (n.kind === 'zombie') {
      const step = n.moving ? (Math.floor(t / 200) % 4) + 1 : 0;
      const sway = Math.sin(t / 300 + n.speed) * 1.5;
      drawAvatar(ctx, x + sway, y, n.look, n.dir, step, false, false, 'armsOut');
      if (n.say) bubble(ctx, n.say.text, x, y - 50);
    } else if (n.kind === 'dog') {
      drawPet(ctx, n.look.pet, n.look.color, x, y - 1, n.face || 1, t / 1000, n.moving || n.near);
      // collar de temporada y cuernitos
      ctx.fillStyle = n.look.collar; ctx.fillRect(x - 3, y - 13, 6, 2);
      if (n.look.horns) { ctx.fillStyle = '#e5484d'; ctx.fillRect(x - 4 + (n.face || 1) * 4, y - 22, 2, 3); ctx.fillRect(x + (n.face || 1) * 4, y - 22, 2, 3); }
      if (n.say) bubble(ctx, n.say.text, x, y - 24);
    }
  }
}

// Fantasmas y murciélagos (encima de todo)
export function drawHalloweenSky(ctx, npcs, t, view) {
  for (const n of npcs) if (n.kind === 'ghost') ghost(ctx, n, t);
  // Bandada de murciélagos que cruza la pantalla cada ~25 s
  const cycle = 25000, k = (t % cycle) / 6000;
  if (k < 1) {
    const w = view.x1 - view.x0;
    const bx = view.x0 - 40 + k * (w + 80), by = view.y0 + (view.y1 - view.y0) * 0.25;
    for (let i = 0; i < 6; i++) {
      const x = bx - i * 14 + Math.sin(t / 200 + i) * 6, y = by + Math.sin(t / 250 + i * 1.7) * 14 + (i % 3) * 8;
      const flap = Math.sin(t / 45 + i) * 0.8;
      ctx.fillStyle = '#1b1424';
      ctx.beginPath(); ctx.ellipse(x, y, 2.4, 3, 0, 0, Math.PI * 2); ctx.fill();
      for (const d of [-1, 1]) { ctx.beginPath(); ctx.moveTo(x + d * 2, y - 1); ctx.quadraticCurveTo(x + d * 6, y - 5 * flap - 2, x + d * 10, y - 2 * flap); ctx.quadraticCurveTo(x + d * 6, y + 1, x + d * 2, y + 2); ctx.fill(); }
    }
  }
}
