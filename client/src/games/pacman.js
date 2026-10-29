// "Come-Puntos": laberinto arcade para un jugador. El asiento 0 (host) corre el juego;
// los demás que abren la máquina solo miran (reciben el estado con onState).
export const meta = { w: 448, h: 560, help: 'Flechas o WASD · desliza el dedo en el celular · Espacio: pausa/empezar' };

const TS = 16, COLS = 28, ROWS = 31, TOP = 40, W = COLS * TS, H = TOP + ROWS * TS + 24;
const PINK = '#FE3377', YEL = '#FFCC00', BLUE = '#3a86ff';

// Laberinto propio. # pared · . punto · o pastilla · H casa de fantasmas · - puerta · espacio = pasillo vacío
const MAZE = [
  '############################',
  '#............##............#',
  '#.####.##.##.##.##.##.####.#',
  '#o####.##.##.##.##.##.####o#',
  '#.####.##.##.##.##.##.####.#',
  '#..........................#',
  '#.####.##.########.##.####.#',
  '#.####.##.########.##.####.#',
  '#......##....##....##......#',
  '######.##### ## #####.######',
  '######.##### ## #####.######',
  '######.              .######',
  '######.## ###--### ##.######',
  '######.## #HHHHHH# ##.######',
  '      .   #HHHHHH#   .      ',
  '######.## #HHHHHH# ##.######',
  '######.## ######## ##.######',
  '######.              .######',
  '######.## ######## ##.######',
  '######.## ######## ##.######',
  '#............##............#',
  '#.####.#####.##.#####.####.#',
  '#.####.#####.##.#####.####.#',
  '#......##....  ....##......#',
  '#o####.##.########.##.####o#',
  '#.####.##.########.##.####.#',
  '#..........................#',
  '#.####.#####.##.#####.####.#',
  '#.####.#####.##.#####.####.#',
  '#..........................#',
  '############################',
];

// Lista de puntos (índice estable para sincronizar con espectadores)
const DOTS = [];
const DOT_AT = new Map();
for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
  const ch = MAZE[r][c];
  if (ch === '.' || ch === 'o') { DOT_AT.set(r * COLS + c, DOTS.length); DOTS.push({ r, c, pw: ch === 'o' }); }
}

const DX = [0, -1, 0, 1], DY = [-1, 0, 1, 0]; // arriba, izquierda, abajo, derecha
const OPP = [2, 3, 0, 1];
const tile = (c, r) => (r < 0 || r >= ROWS ? '#' : MAZE[r][((c % COLS) + COLS) % COLS]);
const walkable = (ch) => ch !== '#' && ch !== 'H' && ch !== '-';

// Distancia (en pasos) de cada baldosa a la puerta de la casa: los ojos vuelven por el camino más corto.
const HOME_DIST = (() => {
  const d = new Int16Array(ROWS * COLS).fill(-1);
  const q = [11 * COLS + 13, 11 * COLS + 14];
  for (const k of q) d[k] = 0;
  for (let i = 0; i < q.length; i++) {
    const r = Math.floor(q[i] / COLS), c = q[i] % COLS;
    for (let k = 0; k < 4; k++) {
      const nr = r + DY[k], nc = (c + DX[k] + COLS) % COLS;
      if (nr < 0 || nr >= ROWS || !walkable(MAZE[nr][nc])) continue;
      const j = nr * COLS + nc;
      if (d[j] < 0) { d[j] = d[q[i]] + 1; q.push(j); }
    }
  }
  return d;
})();

const GHOSTS = [
  { name: 'Chispa', color: '#ff2a4f', home: [13.5, 11], corner: [25, -3] }, // persigue directo
  { name: 'Fresa', color: '#ff8fd0', home: [13.5, 14], corner: [2, -3] }, // embosca adelante
  { name: 'Hielo', color: '#33e6ff', home: [11.5, 14], corner: [27, 31] }, // flanquea
  { name: 'Mango', color: '#ffa53a', home: [15.5, 14], corner: [0, 31] }, // tímido
];
const GST = ['house', 'leave', 'out', 'eyes', 'enter'];
const MODES = [7, 20, 7, 20, 5, 20, 5, Infinity]; // dispersión / persecución alternadas
const FRUITS = [
  { name: 'cereza', color: '#ff2a4f', pts: 100 },
  { name: 'fresa', color: '#ff5a7a', pts: 300 },
  { name: 'naranja', color: '#ff9f1c', pts: 500 },
  { name: 'manzana', color: '#7ed957', pts: 700 },
  { name: 'uvas', color: '#b06bff', pts: 1000 },
  { name: 'estrella', color: YEL, pts: 2000 },
];
const fruitOf = (lv) => Math.min(FRUITS.length - 1, lv - 1);

let sessionHi = 0; // récord de la sesión (sobrevive mientras la página siga abierta)

export function create(canvas, ctx) {
  const g = canvas.getContext('2d');
  const { host } = ctx;
  const watcher = !host;
  let raf = 0, last = performance.now(), sendAcc = 0, fullAcc = 99, eatCool = 0, anim = 0, clock = 0;
  const sounds = [];
  const play = (s) => { ctx.sound(s); if (host) sounds.push(s); };

  const wallsA = prerenderWalls(false), wallsB = prerenderWalls(true);

  // ---------- Estado ----------
  let st = newGame();
  st.phase = 'title';
  let gotState = false;

  function newGame() {
    const s = { phase: 'ready', pt: 0, paused: false, score: 0, lives: 3, level: 1, dots: new Uint8Array(DOTS.length).fill(1), left: DOTS.length, eaten: 0, submitted: false, popups: [], fruit: null, dirty: true };
    resetActors(s);
    return s;
  }
  function resetActors(s) {
    s.pl = { x: 13.5, y: 23, dir: 1, want: -1, moving: true };
    s.gh = GHOSTS.map((d, i) => ({ x: d.home[0], y: d.home[1], dir: i === 0 ? 1 : i === 2 ? 0 : 2, st: i === 0 ? 'out' : 'house', fr: false }));
    s.mode = 0; s.modeT = MODES[0]; s.frT = 0; s.combo = 0; s.fz = 0; s.lifeT = 0; s.fruit = null;
  }
  function refillLevel(s) {
    s.dots.fill(1); s.left = DOTS.length; s.eaten = 0; s.dirty = true;
    resetActors(s);
  }

  // ---------- Controles ----------
  const KEYS = { ArrowUp: 0, KeyW: 0, ArrowLeft: 1, KeyA: 1, ArrowDown: 2, KeyS: 2, ArrowRight: 3, KeyD: 3 };
  function steer(d) {
    if (!host) return;
    if (st.phase === 'title' || st.phase === 'over') { start(); }
    st.pl.want = d;
  }
  function start() {
    if (!host) return;
    if (st.phase === 'title' || st.phase === 'over') {
      st = newGame(); st.phase = 'ready'; st.pt = 0;
      play('power');
    }
  }
  function spacePressed() {
    if (!host) return;
    if (st.phase === 'title' || st.phase === 'over') start();
    else if (st.phase === 'play' || st.phase === 'ready') st.paused = !st.paused;
  }
  const kd = (e) => {
    if (!host) return;
    const t = e.target;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
    if (e.code in KEYS) { e.preventDefault(); steer(KEYS[e.code]); }
    else if (e.code === 'Space') { e.preventDefault(); if (!e.repeat) spacePressed(); }
  };
  window.addEventListener('keydown', kd);

  // Deslizar el dedo
  let sw = null;
  const prevTouch = canvas.style.touchAction;
  if (host) canvas.style.touchAction = 'none';
  const pd = (e) => { if (!host) return; sw = { x: e.clientX, y: e.clientY, t: performance.now(), moved: false }; };
  const pm = (e) => {
    if (!sw) return;
    const dx = e.clientX - sw.x, dy = e.clientY - sw.y;
    if (Math.hypot(dx, dy) < 18) return;
    steer(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 3 : 1) : (dy > 0 ? 2 : 0));
    sw.x = e.clientX; sw.y = e.clientY; sw.moved = true;
  };
  const pu = () => {
    if (sw && !sw.moved && performance.now() - sw.t < 400 && (st.phase === 'title' || st.phase === 'over')) start();
    sw = null;
  };
  canvas.addEventListener('pointerdown', pd);
  canvas.addEventListener('pointermove', pm);
  window.addEventListener('pointerup', pu);
  window.addEventListener('pointercancel', pu);

  // ---------- Movimiento en la cuadrícula ----------
  const atCenter = (e) => Number.isInteger(e.x) && Number.isInteger(e.y);
  function advance(e, dist, decide, can) {
    let guard = 0;
    while (dist > 1e-6 && guard++ < 12) {
      if (atCenter(e)) {
        decide(e);
        if (e.dir < 0 || !can(e, e.dir)) { e.moving = false; return; }
      }
      e.moving = true;
      const horiz = e.dir === 1 || e.dir === 3;
      const s = DX[e.dir] + DY[e.dir];
      const a = horiz ? e.x : e.y;
      const next = s > 0 ? Math.floor(a + 1e-9) + 1 : Math.ceil(a - 1e-9) - 1;
      const rem = Math.abs(next - a);
      if (dist >= rem - 1e-9) {
        if (horiz) e.x = next; else e.y = next;
        dist -= rem;
        if (e.x < 0) e.x += COLS; else if (e.x > COLS - 1) e.x -= COLS;
      } else {
        if (horiz) e.x += s * dist; else e.y += s * dist;
        dist = 0;
      }
    }
  }
  const plCan = (e, d) => walkable(tile(Math.round(e.x) + DX[d], Math.round(e.y) + DY[d]));
  const ghCan = (e, d) => walkable(tile(Math.round(e.x) + DX[d], Math.round(e.y) + DY[d]));
  function plDecide(e) {
    if (e.want >= 0 && plCan(e, e.want)) e.dir = e.want;
  }

  function ghostTarget(i, gh) {
    const p = st.pl, px = Math.round(p.x), py = Math.round(p.y), pd = p.dir < 0 ? 1 : p.dir;
    if (gh.st === 'eyes') return [13, 11];
    const scatter = st.mode % 2 === 0;
    if (scatter && !(i === 0 && st.left < 24)) return GHOSTS[i].corner;
    if (i === 0) return [px, py];
    if (i === 1) return [px + DX[pd] * 4, py + DY[pd] * 4];
    if (i === 2) {
      const ax = px + DX[pd] * 2, ay = py + DY[pd] * 2, r = st.gh[0];
      return [ax * 2 - Math.round(r.x), ay * 2 - Math.round(r.y)];
    }
    const d = Math.hypot(gh.x - p.x, gh.y - p.y);
    return d > 8 ? [px, py] : GHOSTS[3].corner;
  }
  function ghDecide(i) {
    return (e) => {
      if (e.st === 'eyes' && e.y === 11 && Math.abs(e.x - 13.5) <= 0.5) { e.st = 'enter'; return; }
      if (e.st === 'eyes') {
        let best = -1, bd = Infinity;
        for (let d = 0; d < 4; d++) {
          if (!ghCan(e, d)) continue;
          const nr = Math.round(e.y) + DY[d], nc = ((Math.round(e.x) + DX[d]) % COLS + COLS) % COLS;
          const v = HOME_DIST[nr * COLS + nc];
          if (v >= 0 && v < bd) { bd = v; best = d; }
        }
        if (best >= 0) { e.dir = best; return; }
      }
      const opts = [];
      for (let d = 0; d < 4; d++) if (d !== OPP[e.dir] && ghCan(e, d)) opts.push(d);
      if (!opts.length) { e.dir = OPP[e.dir]; return; }
      if (e.fr && e.st === 'out') { e.dir = opts[(Math.random() * opts.length) | 0]; return; }
      const [tx, ty] = ghostTarget(i, e);
      let best = opts[0], bd = Infinity;
      for (const d of opts) {
        const nx = Math.round(e.x) + DX[d], ny = Math.round(e.y) + DY[d];
        const dd = (nx - tx) ** 2 + (ny - ty) ** 2;
        if (dd < bd) { bd = dd; best = d; }
      }
      e.dir = best;
    };
  }
  const deciders = GHOSTS.map((_, i) => ghDecide(i));

  // movimiento guiado (salir/entrar de la casa)
  function moveTo(e, tx, ty, dist) {
    const dx = tx - e.x, dy = ty - e.y;
    if (Math.abs(dx) > 1e-6) { const m = Math.min(Math.abs(dx), dist); e.x += Math.sign(dx) * m; e.dir = dx < 0 ? 1 : 3; return dist - m; }
    if (Math.abs(dy) > 1e-6) { const m = Math.min(Math.abs(dy), dist); e.y += Math.sign(dy) * m; e.dir = dy < 0 ? 0 : 2; return dist - m; }
    return dist;
  }

  function levelSpeed() { return Math.min(1.3, 1 + (st.level - 1) * 0.06); }

  function stepGhost(i, e, dt) {
    const lv = levelSpeed();
    if (e.st === 'house') {
      const hy = GHOSTS[i].home[1];
      e.y += (e.dir === 0 ? -1 : 1) * 2.2 * dt;
      if (e.y < hy - 0.35) { e.y = hy - 0.35; e.dir = 2; }
      if (e.y > hy + 0.35) { e.y = hy + 0.35; e.dir = 0; }
      const rel = [0, 1, 4.5, 8][i] / (1 + (st.level - 1) * 0.2);
      if (st.lifeT >= rel) e.st = 'leave';
      return;
    }
    if (e.st === 'leave') {
      let d = 4 * dt;
      if (Math.abs(e.x - 13.5) > 1e-6) d = moveTo(e, 13.5, 14, d);
      else d = moveTo(e, 13.5, 11, d);
      if (Math.abs(e.x - 13.5) < 1e-6 && Math.abs(e.y - 11) < 1e-6) { e.x = 13.5; e.y = 11; e.st = 'out'; e.dir = Math.random() < 0.5 ? 1 : 3; }
      return;
    }
    if (e.st === 'enter') {
      const hx = i === 0 ? 13.5 : GHOSTS[i].home[0];
      let d = 10 * dt;
      if (e.y < 14 - 1e-6) d = moveTo(e, 13.5, 14, d);
      else d = moveTo(e, hx, 14, d);
      if (Math.abs(e.y - 14) < 1e-6 && Math.abs(e.x - hx) < 1e-6) { e.y = 14; e.x = hx; e.st = 'leave'; e.fr = false; }
      return;
    }
    let sp;
    if (e.st === 'eyes') sp = 15;
    else if (e.fr) sp = 4.2;
    else if (Math.round(e.y) === 14 && (e.x < 5 || e.x > 22)) sp = 3.8;
    else sp = 6.9 * lv + (i === 0 && st.left < 24 ? 0.7 : 0);
    advance(e, sp * dt, deciders[i], ghCan);
  }

  function eatDot(idx) {
    st.dots[idx] = 0; st.left--; st.eaten++; st.dirty = true;
    if (DOTS[idx].pw) {
      st.score += 50;
      st.frT = Math.max(1.6, 7 - (st.level - 1) * 0.8);
      st.combo = 0;
      for (const e of st.gh) if (e.st !== 'eyes' && e.st !== 'enter') { e.fr = true; if (e.st === 'out') e.dir = OPP[e.dir]; }
      play('power');
    } else {
      st.score += 10;
      if (eatCool <= 0) { play('eat'); eatCool = 0.14; }
    }
    if (st.eaten === 70 || st.eaten === 170) st.fruit = { k: fruitOf(st.level), t: 9.5 };
  }

  function step(dt) {
    eatCool -= dt;
    for (const p of st.popups) p.t -= dt;
    st.popups = st.popups.filter((p) => p.t > 0);
    if (st.paused) return;
    st.pt += dt;
    if (st.phase === 'ready') { if (st.pt > 2) { st.phase = 'play'; st.pt = 0; } return; }
    if (st.phase === 'dying') {
      if (st.pt > 1.8) {
        st.lives--;
        if (st.lives <= 0) { gameOver(); return; }
        resetActors(st); st.phase = 'ready'; st.pt = 0.4;
      }
      return;
    }
    if (st.phase === 'clear') {
      if (st.pt > 2.4) { st.level++; refillLevel(st); st.phase = 'ready'; st.pt = 0.5; }
      return;
    }
    if (st.phase !== 'play') return;
    if (st.fz > 0) { st.fz -= dt; return; }

    st.lifeT += dt;
    // Temporizador de modos (se detiene durante el susto)
    if (st.frT > 0) {
      st.frT -= dt;
      if (st.frT <= 0) { st.frT = 0; for (const e of st.gh) e.fr = false; }
    } else if (st.mode < MODES.length - 1) {
      st.modeT -= dt;
      if (st.modeT <= 0) { st.mode++; st.modeT = MODES[st.mode]; for (const e of st.gh) if (e.st === 'out' && !e.fr) e.dir = OPP[e.dir]; }
    }
    if (st.fruit) { st.fruit.t -= dt; if (st.fruit.t <= 0) st.fruit = null; }

    // Jugador
    const p = st.pl;
    if (p.want >= 0 && p.want === OPP[p.dir] && !atCenter(p)) p.dir = p.want;
    advance(p, 7.4 * levelSpeed() * dt, plDecide, plCan);
    const pc = ((Math.round(p.x) % COLS) + COLS) % COLS, pr = Math.round(p.y);
    const di = DOT_AT.get(pr * COLS + pc);
    if (di != null && st.dots[di]) eatDot(di);
    if (st.fruit && pr === 17 && Math.abs(p.x - 13.5) < 0.8) {
      const f = FRUITS[st.fruit.k];
      st.score += f.pts; st.popups.push({ x: 13.5, y: 17, txt: String(f.pts), t: 1.4, c: '#ff8fd0' });
      st.fruit = null; play('score');
    }
    if (st.left === 0) { st.phase = 'clear'; st.pt = 0; play('win'); return; }

    // Fantasmas + choques
    st.gh.forEach((e, i) => stepGhost(i, e, dt));
    for (const e of st.gh) {
      if (e.st !== 'out') continue;
      let dx = Math.abs(e.x - p.x); dx = Math.min(dx, COLS - dx);
      if (dx < 0.65 && Math.abs(e.y - p.y) < 0.65) {
        if (e.fr) {
          const pts = 200 * 2 ** st.combo; st.combo = Math.min(3, st.combo + 1);
          st.score += pts; e.st = 'eyes'; e.fr = false; st.fz = 0.55;
          e.x = Math.round(e.x); e.y = Math.round(e.y); if (e.x > COLS - 1) e.x -= COLS;
          st.popups.push({ x: p.x, y: p.y, txt: String(pts), t: 1.1, c: '#33e6ff' });
          play('score');
        } else {
          st.phase = 'dying'; st.pt = 0; play('die'); return;
        }
      }
    }
  }

  function gameOver() {
    st.phase = 'over'; st.pt = 0; st.lives = 0;
    sessionHi = Math.max(sessionHi, st.score);
    if (!st.submitted) {
      st.submitted = true;
      try { Promise.resolve(ctx.submitScore(st.score)).catch(() => {}); } catch { /* sin conexión */ }
    }
    play('lose');
  }

  // ---------- Sincronización ----------
  const HEX = '0123456789abcdef';
  function encodeDots(d) {
    let s = '';
    for (let i = 0; i < d.length; i += 4) s += HEX[(d[i] | 0) | ((d[i + 1] | 0) << 1) | ((d[i + 2] | 0) << 2) | ((d[i + 3] | 0) << 3)];
    return s;
  }
  function decodeDots(s, d) {
    for (let i = 0; i < d.length; i++) d[i] = (HEX.indexOf(s[i >> 2]) >> (i & 3)) & 1;
  }
  const q = (v) => Math.round(v * 100);
  function pack(full) {
    const o = {
      ph: st.phase, pt: Math.round(st.pt * 100), pa: st.paused ? 1 : 0, s: st.score, hi: Math.max(sessionHi, st.score), l: st.lives, lv: st.level,
      p: [q(st.pl.x), q(st.pl.y), st.pl.dir, st.pl.moving ? 1 : 0],
      g: st.gh.flatMap((e) => [q(e.x), q(e.y), e.dir, GST.indexOf(e.st), e.fr ? 1 : 0]),
      f: Math.round(st.frT * 10), fz: st.fz > 0 ? 1 : 0, fr: st.fruit ? st.fruit.k : -1,
      po: st.popups.map((p) => [q(p.x), q(p.y), p.txt, p.c]),
      snd: sounds.splice(0),
    };
    if (full || st.dirty) { o.d = encodeDots(st.dots); st.dirty = false; }
    return o;
  }
  function unpack(d) {
    gotState = true;
    if (d.snd) for (const s of d.snd) ctx.sound(s);
    st.phase = d.ph; st.pt = d.pt / 100; st.paused = !!d.pa; st.score = d.s; st.lives = d.l; st.level = d.lv;
    sessionHi = Math.max(sessionHi, d.hi || 0);
    st.pl.x = d.p[0] / 100; st.pl.y = d.p[1] / 100; st.pl.dir = d.p[2]; st.pl.moving = !!d.p[3];
    for (let i = 0; i < 4; i++) {
      const e = st.gh[i], b = i * 5;
      e.x = d.g[b] / 100; e.y = d.g[b + 1] / 100; e.dir = d.g[b + 2]; e.st = GST[d.g[b + 3]]; e.fr = !!d.g[b + 4];
    }
    st.frT = d.f / 10; st.fz = d.fz ? 1 : 0;
    st.fruit = d.fr >= 0 ? { k: d.fr, t: 1 } : null;
    st.popups = (d.po || []).map((p) => ({ x: p[0] / 100, y: p[1] / 100, txt: p[2], c: p[3], t: 1 }));
    if (d.d) { decodeDots(d.d, st.dots); st.left = st.dots.reduce((a, b) => a + b, 0); }
  }
  if (watcher) ctx.onState(unpack);

  // ---------- Dibujo ----------
  const px = (x) => x * TS + TS / 2;
  const py = (y) => TOP + y * TS + TS / 2;

  function prerenderWalls(flash) {
    const c = document.createElement('canvas');
    c.width = W; c.height = ROWS * TS;
    const w = c.getContext('2d');
    const isWall = (r, cc) => r < 0 || r >= ROWS || cc < 0 || cc >= COLS || MAZE[r][cc] === '#';
    const isOpen = (r, cc) => !isWall(r, cc);
    const bnd = (r, cc) => {
      if (!isWall(r, cc) || r < 0 || r >= ROWS || cc < 0 || cc >= COLS) return false;
      for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) if (isOpen(r + a, cc + b)) return true;
      return false;
    };
    // Dos baldosas de borde vecinas se unen si comparten un pasillo junto a ambas.
    const link = (r, cc, d) => {
      const r2 = r + DY[d], c2 = cc + DX[d];
      if (!bnd(r2, c2)) return false;
      if (d === 1 || d === 3) return isOpen(r - 1, cc) || isOpen(r - 1, c2) || isOpen(r + 1, cc) || isOpen(r + 1, c2);
      return isOpen(r, cc - 1) || isOpen(r2, cc - 1) || isOpen(r, cc + 1) || isOpen(r2, cc + 1);
    };
    const path = new Path2D();
    for (let r = 0; r < ROWS; r++) for (let cc = 0; cc < COLS; cc++) {
      if (!bnd(r, cc)) continue;
      const cx = cc * TS + TS / 2, cy = r * TS + TS / 2;
      const ds = [0, 1, 2, 3].filter((d) => link(r, cc, d));
      if (ds.length === 2 && (ds[0] + ds[1]) % 2 === 1) {
        // esquina: curva suave
        const [a, b] = ds;
        path.moveTo(cx + DX[a] * TS / 2, cy + DY[a] * TS / 2);
        path.quadraticCurveTo(cx, cy, cx + DX[b] * TS / 2, cy + DY[b] * TS / 2);
      } else if (ds.length === 0) {
        path.moveTo(cx - 1, cy); path.lineTo(cx + 1, cy);
      } else {
        for (const d of ds) { path.moveTo(cx, cy); path.lineTo(cx + DX[d] * TS / 2, cy + DY[d] * TS / 2); }
      }
    }
    w.lineCap = 'round'; w.lineJoin = 'round';
    w.shadowColor = flash ? '#fff' : PINK; w.shadowBlur = 10;
    w.strokeStyle = flash ? '#ffffff' : PINK; w.lineWidth = 7; w.stroke(path);
    w.shadowBlur = 0;
    w.strokeStyle = '#05060d'; w.lineWidth = 3; w.stroke(path);
    w.strokeStyle = flash ? 'rgba(255,255,255,.6)' : 'rgba(58,134,255,.85)'; w.lineWidth = 1; w.stroke(path);
    // puerta de la casa
    w.fillStyle = flash ? '#fff' : '#ffd1e1';
    w.fillRect(13 * TS - 1, 12 * TS + TS / 2 - 1.5, TS * 2 + 2, 3);
    return c;
  }

  function drawPlayer(x, y, dir, mouth, scale = 1) {
    const ang = [-Math.PI / 2, Math.PI, Math.PI / 2, 0][dir < 0 ? 1 : dir];
    const R = 7.6 * scale;
    for (const ox of [0, -COLS, COLS]) {
      const cx = px(x + ox), cy = py(y);
      if (cx < -20 || cx > W + 20) continue;
      g.fillStyle = YEL;
      g.shadowColor = YEL; g.shadowBlur = 8;
      g.beginPath();
      g.moveTo(cx, cy);
      g.arc(cx, cy, R, ang + mouth, ang + Math.PI * 2 - mouth);
      g.closePath(); g.fill();
      g.shadowBlur = 0;
      // brillo
      g.fillStyle = 'rgba(255,255,255,.35)';
      g.beginPath(); g.arc(cx - R * 0.3, cy - R * 0.45, R * 0.18, 0, Math.PI * 2); g.fill();
    }
  }

  function drawGhost(i, e, t) {
    const flashing = e.fr && st.frT < 2 && Math.floor(st.frT * 5) % 2 === 0;
    for (const ox of [0, -COLS, COLS]) {
      const cx = px(e.x + ox), cy = py(e.y);
      if (cx < -20 || cx > W + 20) continue;
      const R = 7.5;
      if (e.st !== 'eyes' && e.st !== 'enter') {
        const col = e.fr ? (flashing ? '#f4f4ff' : '#2337ff') : GHOSTS[i].color;
        g.fillStyle = col;
        g.shadowColor = col; g.shadowBlur = 6;
        g.beginPath();
        g.arc(cx, cy - 1, R, Math.PI, 0);
        const bot = cy + R - 0.5, wob = Math.floor(t * 8 + i) % 2;
        g.lineTo(cx + R, bot);
        const n = 4;
        for (let k = 0; k < n; k++) {
          const x1 = cx + R - (2 * R * (k + 0.5)) / n, x2 = cx + R - (2 * R * (k + 1)) / n;
          g.quadraticCurveTo(x1, bot - (wob ? 3.5 : -0.5) + (k % 2 ? 0 : 0), x2, bot);
        }
        g.closePath(); g.fill();
        g.shadowBlur = 0;
      }
      if (e.fr && e.st !== 'eyes' && e.st !== 'enter') {
        g.fillStyle = flashing ? '#ff2a4f' : '#ffd1a8';
        g.fillRect(cx - 3.5, cy - 3, 2.2, 2.2); g.fillRect(cx + 1.3, cy - 3, 2.2, 2.2);
        g.strokeStyle = g.fillStyle; g.lineWidth = 1;
        g.beginPath();
        for (let k = 0; k <= 6; k++) g.lineTo(cx - 4.5 + k * 1.5, cy + 2.5 + (k % 2 ? -1.2 : 0.6));
        g.stroke();
        continue;
      }
      const d = e.dir < 0 ? 2 : e.dir;
      for (const s of [-1, 1]) {
        g.fillStyle = '#fff';
        g.beginPath(); g.ellipse(cx + s * 3.1, cy - 2, 2.5, 3.1, 0, 0, Math.PI * 2); g.fill();
        g.fillStyle = '#1238c9';
        g.beginPath(); g.arc(cx + s * 3.1 + DX[d] * 1.3, cy - 2 + DY[d] * 1.6, 1.35, 0, Math.PI * 2); g.fill();
      }
    }
  }

  function drawFruit(k, cx, cy, s = 1) {
    const f = FRUITS[k];
    g.save(); g.translate(cx, cy); g.scale(s, s);
    if (f.name === 'cereza') {
      g.strokeStyle = '#7ed957'; g.lineWidth = 1.4;
      g.beginPath(); g.moveTo(-3, 2); g.quadraticCurveTo(0, -6, 4, -6); g.moveTo(3, 3); g.quadraticCurveTo(3, -3, 4, -6); g.stroke();
      g.fillStyle = f.color;
      g.beginPath(); g.arc(-3, 3, 3.2, 0, Math.PI * 2); g.arc(3, 4, 3.2, 0, Math.PI * 2); g.fill();
    } else if (f.name === 'estrella') {
      g.fillStyle = f.color; g.beginPath();
      for (let k2 = 0; k2 < 10; k2++) { const a = -Math.PI / 2 + (k2 * Math.PI) / 5, r = k2 % 2 ? 2.8 : 6.5; g.lineTo(Math.cos(a) * r, Math.sin(a) * r); }
      g.closePath(); g.fill();
    } else if (f.name === 'uvas') {
      g.fillStyle = f.color;
      for (const [a, b] of [[-3, -2], [0, -2], [3, -2], [-1.5, 1], [1.5, 1], [0, 4]]) { g.beginPath(); g.arc(a, b, 2, 0, Math.PI * 2); g.fill(); }
    } else {
      g.fillStyle = f.color;
      g.beginPath(); g.arc(0, 1, 5.5, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#7ed957'; g.beginPath(); g.ellipse(2, -5, 2.5, 1.2, -0.5, 0, Math.PI * 2); g.fill();
      if (f.name === 'fresa') { g.fillStyle = '#ffe9a8'; for (const [a, b] of [[-2, 0], [2, 1], [0, 3], [-1, -2]]) g.fillRect(a, b, 1, 1); }
    }
    g.fillStyle = 'rgba(255,255,255,.4)'; g.beginPath(); g.arc(-1.5, -0.5, 1, 0, Math.PI * 2); g.fill();
    g.restore();
  }

  function text(t, x, y, size, color, align = 'center', weight = 800) {
    g.font = `${weight} ${size}px system-ui, sans-serif`;
    g.textAlign = align; g.textBaseline = 'middle'; g.fillStyle = color;
    g.fillText(t, x, y);
  }

  function draw(t) {
    g.fillStyle = '#05060d';
    g.fillRect(0, 0, W, H);
    // Encabezado
    text('PUNTOS', 14, 12, 10, PINK, 'left');
    text(String(st.score), 14, 28, 18, '#fff', 'left');
    text('RÉCORD', W / 2, 12, 10, PINK);
    text(String(Math.max(sessionHi, st.score)), W / 2, 28, 18, YEL);
    text('NIVEL', W - 14, 12, 10, PINK, 'right');
    text(String(st.level), W - 14, 28, 18, '#fff', 'right');

    // Laberinto
    const flash = st.phase === 'clear' && st.pt > 0.6 && Math.floor(st.pt * 5) % 2 === 0;
    g.drawImage(flash ? wallsB : wallsA, 0, TOP);

    // Puntos
    const pulse = 0.75 + 0.25 * Math.sin(t * 8);
    for (let i = 0; i < DOTS.length; i++) {
      if (!st.dots[i]) continue;
      const d = DOTS[i], cx = px(d.c), cy = py(d.r);
      if (d.pw) {
        if (st.phase === 'play' && Math.floor(t * 4) % 2 && !st.paused) continue;
        g.fillStyle = YEL; g.shadowColor = YEL; g.shadowBlur = 10;
        g.beginPath(); g.arc(cx, cy, 5 * pulse + 0.6, 0, Math.PI * 2); g.fill(); g.shadowBlur = 0;
      } else {
        g.fillStyle = '#ffd1e1';
        g.fillRect(cx - 1.5, cy - 1.5, 3, 3);
      }
    }
    // Fruta
    if (st.fruit) drawFruit(st.fruit.k, px(13.5), py(17), 1.2);

    g.save();
    g.beginPath(); g.rect(0, TOP, W, ROWS * TS); g.clip();
    const p = st.pl;
    const showGhosts = st.phase !== 'title' && st.phase !== 'over' && st.phase !== 'clear' && !(st.phase === 'dying' && st.pt > 0.5);
    if (showGhosts) st.gh.forEach((e, i) => drawGhost(i, e, t));
    if (st.phase === 'dying') {
      const k = Math.max(0, Math.min(1, (st.pt - 0.5) / 1));
      if (k < 1) {
        const m = 0.05 + k * (Math.PI - 0.05);
        g.fillStyle = YEL; g.shadowColor = YEL; g.shadowBlur = 8;
        g.beginPath(); g.moveTo(px(p.x), py(p.y));
        g.arc(px(p.x), py(p.y), 7.6, -Math.PI / 2 + m, -Math.PI / 2 + Math.PI * 2 - m);
        g.closePath(); g.fill(); g.shadowBlur = 0;
      } else if (st.pt < 1.7) {
        const r = 4 + (st.pt - 1.5) * 50;
        g.strokeStyle = YEL; g.lineWidth = 2;
        for (let a = 0; a < 8; a++) {
          const an = (a * Math.PI) / 4;
          g.beginPath(); g.moveTo(px(p.x) + Math.cos(an) * r * 0.5, py(p.y) + Math.sin(an) * r * 0.5);
          g.lineTo(px(p.x) + Math.cos(an) * r, py(p.y) + Math.sin(an) * r); g.stroke();
        }
      }
    } else if (st.phase !== 'title' && st.phase !== 'over' && !(st.fz > 0)) {
      const mouth = st.phase === 'ready' ? 0.35 : 0.04 + 0.62 * Math.abs(Math.sin(anim));
      drawPlayer(p.x, p.y, p.dir, mouth);
    }
    g.restore();
    // Puntos flotantes
    for (const pp of st.popups) text(pp.txt, px(pp.x), py(pp.y) - (1.1 - pp.t) * 10, 12, pp.c || '#33e6ff');

    // Pie: vidas y frutas
    const fy = TOP + ROWS * TS + 12;
    for (let i = 0; i < Math.max(0, st.lives - 1); i++) drawPlayerAt(18 + i * 22, fy);
    for (let lv = Math.max(1, st.level - 6); lv <= st.level; lv++) drawFruit(fruitOf(lv), W - 16 - (st.level - lv) * 20, fy, 0.95);

    // Avisos
    if (st.phase === 'ready') text('¡LISTO!', px(13.5), py(17), 15, YEL);
    if (st.paused) {
      g.fillStyle = 'rgba(5,6,13,.6)'; g.fillRect(0, TOP, W, ROWS * TS);
      text('PAUSA', W / 2, H / 2 - 10, 30, YEL);
      if (host) text('Espacio para seguir', W / 2, H / 2 + 22, 14, '#fff', 'center', 600);
    }
    if (st.phase === 'title' || st.phase === 'over') {
      g.fillStyle = 'rgba(5,6,13,.72)'; g.fillRect(0, TOP, W, ROWS * TS);
      const cy = H / 2 - 40;
      g.fillStyle = 'rgba(254,51,119,.12)'; g.strokeStyle = PINK; g.lineWidth = 2;
      rr(44, cy - 70, W - 88, 200, 16); g.fill(); g.stroke();
      if (st.phase === 'title') {
        g.shadowColor = PINK; g.shadowBlur = 14;
        text('COME-PUNTOS', W / 2, cy - 34, 34, YEL);
        g.shadowBlur = 0;
        text('HUB ARCADE', W / 2, cy - 6, 12, PINK, 'center', 700);
        drawPlayer((W / 2 - 60 - TS / 2) / TS, (cy + 30 - TOP - TS / 2) / TS, 3, 0.1 + 0.6 * Math.abs(Math.sin(t * 6)), 1.4);
        GHOSTS.forEach((_, i) => drawGhost(i, { x: (W / 2 - 22 + i * 26 - TS / 2) / TS, y: (cy + 30 - TOP - TS / 2) / TS, dir: 1, st: 'out', fr: false }, t));
        if (!watcher) text(Math.floor(t * 2) % 2 ? 'Espacio, una flecha o toca para empezar' : '', W / 2, cy + 74, 13, '#fff', 'center', 600);
        else text(gotState ? 'Esperando a que empiece…' : 'Conectando…', W / 2, cy + 74, 13, '#fff', 'center', 600);
        text('Come los puntos · las pastillas asustan a los fantasmas', W / 2, cy + 102, 11, 'rgba(255,255,255,.6)', 'center', 500);
      } else {
        text('FIN DEL JUEGO', W / 2, cy - 34, 32, PINK);
        text(`Puntos: ${st.score}`, W / 2, cy + 6, 20, '#fff');
        const best = st.score >= sessionHi && st.score > 0;
        text(best ? '★ ¡Nuevo récord de la sesión! ★' : `Récord: ${sessionHi}`, W / 2, cy + 36, 13, YEL, 'center', 700);
        text(`Llegaste al nivel ${st.level}`, W / 2, cy + 58, 12, 'rgba(255,255,255,.7)', 'center', 500);
        if (!watcher) text(Math.floor(t * 2) % 2 ? 'Espacio para jugar otra vez' : '', W / 2, cy + 98, 14, YEL, 'center', 700);
        else text('Esperando revancha…', W / 2, cy + 98, 13, '#fff', 'center', 600);
      }
    }
    if (watcher && st.phase !== 'title') text(`👀 Mirando a ${ctx.players?.[0]?.name || 'el jugador'}`, W / 2, H - 12, 11, 'rgba(255,255,255,.65)', 'center', 600);
  }
  function drawPlayerAt(cx, cy) {
    g.fillStyle = YEL; g.beginPath(); g.moveTo(cx, cy); g.arc(cx, cy, 6.5, Math.PI + 0.5, Math.PI * 3 - 0.5); g.closePath(); g.fill();
  }
  function rr(x, y, w, h, r) {
    g.beginPath(); g.moveTo(x + r, y);
    g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
  }

  // ---------- Estado bajo el canvas ----------
  let lastStatus = '';
  function updateStatus() {
    let s;
    const info = `Puntos ${st.score} · Vidas ${Math.max(0, st.lives)} · Nivel ${st.level}`;
    if (watcher) s = `Estás mirando a ${ctx.players?.[0]?.name || 'otra persona'} · ${info}`;
    else if (st.phase === 'title') s = 'Come-Puntos · Espacio, flecha o toca para empezar';
    else if (st.phase === 'over') s = `Fin del juego · ${st.score} puntos · Espacio para jugar otra vez`;
    else s = info + (st.paused ? ' · En pausa' : '');
    if (s !== lastStatus) { lastStatus = s; ctx.status(s); }
  }

  function loop(now) {
    const dt = Math.min(0.033, (now - last) / 1000);
    last = now;
    clock += dt;
    if (host) {
      step(dt);
      sendAcc += dt; fullAcc += dt;
      if (sendAcc >= 1 / 25) {
        sendAcc = 0;
        const full = fullAcc >= 1;
        if (full) fullAcc = 0;
        ctx.sendState(pack(full));
      }
    }
    if (st.pl.moving && st.phase === 'play' && !st.paused && !(st.fz > 0)) anim += dt * 16;
    updateStatus();
    draw(clock);
    raf = requestAnimationFrame(loop);
  }
  raf = requestAnimationFrame(loop);

  // Para pruebas automáticas
  const api = {
    destroy() {
      cancelAnimationFrame(raf);
      window.removeEventListener('keydown', kd);
      canvas.removeEventListener('pointerdown', pd);
      canvas.removeEventListener('pointermove', pm);
      window.removeEventListener('pointerup', pu);
      window.removeEventListener('pointercancel', pu);
      canvas.style.touchAction = prevTouch;
    },
  };
  return api;
}
