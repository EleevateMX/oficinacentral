// Billar (bola 8) para 2 (o contra la computadora). El asiento 0 corre la física.
import { roundRect } from './pong.js';

export const meta = {
  w: 900,
  h: 540,
  help: 'Apunta con el mouse o el dedo · mantén presionado y arrastra hacia atrás para dar fuerza, suelta para tirar · Teclado: ←/→ apuntar (Shift = fino), ↑/↓ fuerza, Espacio tirar · Bola en mano: clic para colocar la blanca · Espacio: revancha',
};

const W = 900, H = 540;
const L = 50, T = 50, RR = 850, B = 450, MX = 450, MY = 250; // borde del paño (línea de bandas)
const R = 11; // radio de bola
const CM = 26, SM = 20, J = 20, CW = 14; // boca de tronera de esquina / media, profundidad de mordaza, ancho visual de banda
const HEAD_X = L + 200, FOOT_X = L + 600;
const MAXV = 1700, MINV = 90; // velocidad del tiro (px/s)
const FRICTION = 90, LIN = 0.35, STOP = 6; // rodadura
const E_BALL = 0.97, E_RAIL = 0.76;
const SUB = 1 / 720; // sub-paso fijo
const PULL = 200; // px de arrastre = fuerza máxima
const PCOL = ['#FE3377', '#3a86ff'];
const BALL_COL = { 1: '#f2b90f', 2: '#1d4fb8', 3: '#d32a2a', 4: '#5a2b8c', 5: '#ef7a12', 6: '#14804a', 7: '#7d1c24', 8: '#121212' };
const GROUP_NAME = { solid: 'lisas', stripe: 'rayadas' };

// Troneras: c = radio de captura, d = radio del agujero dibujado; a = punto de mira para la CPU
const POCKETS = [
  { x: L - 5, y: T - 5, c: 19, d: 22, a: [L + 4, T + 4], side: false },
  { x: MX, y: T - 9, c: 18, d: 19, a: [MX, T + 2], side: true },
  { x: RR + 5, y: T - 5, c: 19, d: 22, a: [RR - 4, T + 4], side: false },
  { x: L - 5, y: B + 5, c: 19, d: 22, a: [L + 4, B - 4], side: false },
  { x: MX, y: B + 9, c: 18, d: 19, a: [MX, B - 2], side: true },
  { x: RR + 5, y: B + 5, c: 19, d: 22, a: [RR - 4, B - 4], side: false },
];

// Bandas: polilíneas (mordaza, nariz de banda, mordaza). Las bolas chocan contra cada segmento.
const CUSHIONS = [
  [[L + CM - 14, T - J], [L + CM, T], [MX - SM, T], [MX - SM + 4, T - J]],
  [[MX + SM - 4, T - J], [MX + SM, T], [RR - CM, T], [RR - CM + 14, T - J]],
  [[L + CM - 14, B + J], [L + CM, B], [MX - SM, B], [MX - SM + 4, B + J]],
  [[MX + SM - 4, B + J], [MX + SM, B], [RR - CM, B], [RR - CM + 14, B + J]],
  [[L - J, T + CM - 14], [L, T + CM], [L, B - CM], [L - J, B - CM + 14]],
  [[RR + J, T + CM - 14], [RR, T + CM], [RR, B - CM], [RR + J, B - CM + 14]],
];
const SEGS = [];
for (const p of CUSHIONS) for (let i = 0; i < p.length - 1; i++) SEGS.push([p[i][0], p[i][1], p[i + 1][0], p[i + 1][1]]);

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const angDiff = (a, b) => { let d = (b - a) % (Math.PI * 2); if (d > Math.PI) d -= Math.PI * 2; if (d < -Math.PI) d += Math.PI * 2; return d; };
const groupOf = (n) => (n > 0 && n < 8 ? 'solid' : n > 8 ? 'stripe' : null);
const inGroup = (n, grp) => groupOf(n) === grp;
const shuffle = (a) => { for (let i = a.length - 1; i > 0; i--) { const j = (Math.random() * (i + 1)) | 0; [a[i], a[j]] = [a[j], a[i]]; } return a; };
const segDist = (px, py, ax, ay, bx, by) => {
  const dx = bx - ax, dy = by - ay;
  const t = clamp(((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy || 1), 0, 1);
  return Math.hypot(px - ax - dx * t, py - ay - dy * t);
};

export function create(canvas, ctx) {
  const g = canvas.getContext('2d');
  const { seat, host, players } = ctx;
  const vsCpu = host && !players[1];
  const nameOf = (i) => players[i]?.name || (i === 1 ? 'La computadora' : 'Jugador');
  const prevTouch = canvas.style.touchAction;
  canvas.style.touchAction = 'none';

  let raf = 0, last = performance.now(), sendAcc = 0, aimAcc = 0, acc = 0;
  const sounds = [];
  const play = (s) => { ctx.sound(s); if (host) sounds.push(s); };
  let lastHitSnd = 0, lastWallSnd = 0;

  // ---------- Estado ----------
  let balls = []; // host: física real · invitado: posiciones suavizadas para dibujar
  let S = fresh(0);
  let shot = null; // seguimiento del tiro en curso (solo host)
  let msgAt = performance.now();
  let lastStatus = null;

  function fresh(breaker) {
    balls = [];
    for (let n = 0; n < 16; n++) balls.push({ n, x: 0, y: 0, vx: 0, vy: 0, p: 0, tx: 0, ty: 0, sink: 0 });
    balls[0].x = HEAD_X; balls[0].y = MY;
    // Triángulo: la 8 al centro, una lisa y una rayada en las esquinas de atrás
    const DY = 2 * R + 0.8, DX = DY * Math.sqrt(3) / 2;
    const slots = [];
    for (let i = 0; i < 5; i++) for (let j = 0; j <= i; j++) slots.push([FOOT_X + i * DX, MY + (j - i / 2) * DY]);
    const sol = shuffle([1, 2, 3, 4, 5, 6, 7]), str = shuffle([9, 10, 11, 12, 13, 14, 15]);
    const order = new Array(15);
    order[4] = 8;
    if (Math.random() < 0.5) { order[10] = sol.pop(); order[14] = str.pop(); } else { order[10] = str.pop(); order[14] = sol.pop(); }
    const rest = shuffle(sol.concat(str));
    for (let i = 0; i < 15; i++) if (order[i] == null) order[i] = rest.pop();
    order.forEach((n, i) => { balls[n].x = slots[i][0] + Math.random() * 0.3; balls[n].y = slots[i][1] + (Math.random() - 0.5) * 0.3; });
    for (const b of balls) { b.tx = b.x; b.ty = b.y; }
    return { turn: breaker, breaker, brk: true, groups: [null, null], phase: 'aim', aim: 0, pow: 0, msg: '', msgId: 0, winner: -1, hand: null, think: false, score: '0-0' };
  }

  const cue = () => balls[0];
  const remaining = (grp) => balls.filter((b) => b.n && !b.p && inGroup(b.n, grp)).length;
  const pottedOf = (grp) => (grp ? 7 - remaining(grp) : 0);
  function setMsg(m) { S.msg = m; S.msgId++; msgAt = performance.now(); }

  function placeValid(x, y, kitchen) {
    if (x < L + R || x > RR - R || y < T + R || y > B - R) return false;
    if (kitchen && x > HEAD_X) return false;
    return balls.every((b) => b.n === 0 || b.p || Math.hypot(b.x - x, b.y - y) >= 2 * R + 0.5);
  }
  function freeSpot(x, y, kitchen) {
    for (let k = 0; k < 200; k++) {
      const yy = y + (k % 2 ? 1 : -1) * Math.ceil(k / 2) * 3;
      if (placeValid(x, yy, kitchen)) return [x, yy];
      const xx = x - Math.ceil(k / 2) * 3;
      if (placeValid(xx, y, kitchen)) return [xx, y];
    }
    return [x, y];
  }

  // ---------- Física (host) ----------
  function moving() { return balls.some((b) => !b.p && (b.vx || b.vy)); }

  function potBall(b, i) {
    b.p = i + 1; b.vx = 0; b.vy = 0; b.sink = performance.now();
    if (shot) shot.pots.push(b.n);
    play('pocket');
  }

  function physStep(h) {
    const live = balls.filter((b) => !b.p);
    for (const b of live) {
      if (!b.vx && !b.vy) continue;
      const sp = Math.hypot(b.vx, b.vy);
      const dec = (FRICTION + LIN * sp) * h;
      if (sp - dec < STOP) { b.vx = 0; b.vy = 0; continue; }
      const k = (sp - dec) / sp;
      b.vx *= k; b.vy *= k;
      b.x += b.vx * h; b.y += b.vy * h;
    }
    // Bola contra bola (masas iguales)
    for (let i = 0; i < live.length; i++) {
      const a = live[i];
      for (let j = i + 1; j < live.length; j++) {
        const c = live[j];
        const dx = c.x - a.x, dy = c.y - a.y;
        const d2 = dx * dx + dy * dy;
        if (d2 >= 4 * R * R || d2 === 0) continue;
        const d = Math.sqrt(d2), nx = dx / d, ny = dy / d;
        const ov = (2 * R - d) / 2;
        a.x -= nx * ov; a.y -= ny * ov; c.x += nx * ov; c.y += ny * ov;
        const rel = (a.vx - c.vx) * nx + (a.vy - c.vy) * ny;
        if (rel <= 0) continue;
        const imp = (rel * (1 + E_BALL)) / 2;
        a.vx -= imp * nx; a.vy -= imp * ny; c.vx += imp * nx; c.vy += imp * ny;
        if (shot && shot.first < 0) { if (a.n === 0) shot.first = c.n; else if (c.n === 0) shot.first = a.n; }
        const now = performance.now();
        if (rel > 30 && now - lastHitSnd > 70) { lastHitSnd = now; play('hit'); }
      }
    }
    // Bandas y mordazas
    for (const b of live) {
      for (const s of SEGS) {
        const [ax, ay, bx, by] = s;
        const dx = bx - ax, dy = by - ay;
        const t = clamp(((b.x - ax) * dx + (b.y - ay) * dy) / (dx * dx + dy * dy), 0, 1);
        const qx = ax + dx * t, qy = ay + dy * t;
        const ex = b.x - qx, ey = b.y - qy;
        const d2 = ex * ex + ey * ey;
        if (d2 >= R * R || d2 === 0) continue;
        const d = Math.sqrt(d2), nx = ex / d, ny = ey / d;
        b.x = qx + nx * R; b.y = qy + ny * R;
        const vn = b.vx * nx + b.vy * ny;
        if (vn < 0) {
          b.vx -= (1 + E_RAIL) * vn * nx; b.vy -= (1 + E_RAIL) * vn * ny;
          b.vx *= 0.985; b.vy *= 0.985;
          const now = performance.now();
          if (-vn > 70 && now - lastWallSnd > 90) { lastWallSnd = now; play('wall'); }
        }
      }
    }
    // Troneras
    for (const b of live) {
      if (b.p) continue;
      let hit = -1;
      for (let i = 0; i < POCKETS.length; i++) {
        const p = POCKETS[i];
        if (Math.hypot(b.x - p.x, b.y - p.y) < p.c) { hit = i; break; }
      }
      // Pasó la línea de bandas: solo puede ser por una boca → adentro de la más cercana
      if (hit < 0 && (b.x < L - 6 || b.x > RR + 6 || b.y < T - 6 || b.y > B + 6)) {
        let best = 1e9;
        POCKETS.forEach((p, i) => { const d = Math.hypot(b.x - p.x, b.y - p.y); if (d < best) { best = d; hit = i; } });
      }
      if (hit >= 0) potBall(b, hit);
    }
  }

  function applyShot(angle, power) {
    if (S.phase !== 'aim' || S.hand || balls[0].p) return;
    if (!Number.isFinite(angle) || !Number.isFinite(power)) return;
    power = clamp(power, 0.02, 1);
    const v = (MINV + (MAXV - MINV) * power) * (S.brk ? 1.6 : 1); // el saque pega más fuerte
    const c = cue();
    c.vx = Math.cos(angle) * v; c.vy = Math.sin(angle) * v;
    const grp = S.groups[S.turn];
    shot = { first: -1, pots: [], clearedBefore: !!grp && remaining(grp) === 0 };
    S.phase = 'roll'; S.aim = angle; S.pow = 0; S.think = false;
    play('hit');
  }

  function placeCue(x, y) {
    if (!S.hand || S.phase !== 'aim' || !placeValid(x, y, S.hand === 'kitchen')) return false;
    const c = cue();
    c.x = x; c.y = y; c.p = 0; c.vx = c.vy = 0; c.sink = 0;
    S.hand = null;
    return true;
  }

  function resolve() {
    const s = S.turn, o = 1 - s;
    const pots = shot ? shot.pots : [];
    const first = shot ? shot.first : -1;
    const scratch = pots.includes(0);
    const pot8 = pots.includes(8);
    const obj = pots.filter((n) => n !== 0 && n !== 8);
    let grp = S.groups[s];
    let foul = '';
    if (scratch) foul = pot8 ? 'Falta: blanca a la buchaca' : 'Falta: bola blanca a la buchaca';
    else if (first < 0) foul = 'Falta: la blanca no tocó ninguna bola';
    else if (!S.brk) {
      if (grp) {
        const legal = shot.clearedBefore ? first === 8 : inGroup(first, grp);
        if (!legal) foul = shot.clearedBefore ? 'Falta: debías tocar primero la 8' : first === 8 ? 'Falta: tocaste primero la 8' : 'Falta: tocaste primero una bola rival';
      } else if (first === 8) foul = 'Falta: tocaste primero la 8';
    }

    // La bola 8
    if (pot8) {
      if (S.brk) {
        const b8 = balls[8];
        b8.p = 0; b8.sink = 0; b8.vx = b8.vy = 0;
        b8.x = -100; // fuera mientras buscamos lugar
        const [x, y] = (() => { for (let x = FOOT_X; x < RR - R; x += 2) if (placeValid(x, MY, false)) return [x, MY]; return freeSpot(FOOT_X, MY, false); })();
        b8.x = x; b8.y = y;
        setMsg('La 8 entró en el saque: se vuelve a colocar');
      } else {
        const win = shot.clearedBefore && !foul;
        finish(win ? s : o, win ? `${nameOf(s)} metió la 8` : scratch ? 'Blanca a la buchaca con la 8' : foul ? 'Falta al tirar la 8' : 'La 8 entró antes de tiempo');
        return;
      }
    }

    const wasBreak = S.brk;
    S.brk = false;
    let assigned = '';
    if (!foul && !wasBreak && !grp && obj.length) {
      grp = groupOf(obj[0]);
      S.groups[s] = grp;
      S.groups[o] = grp === 'solid' ? 'stripe' : 'solid';
      assigned = `${nameOf(s)} tiene las ${GROUP_NAME[grp]}`;
    }
    const keep = !foul && (grp ? obj.some((n) => inGroup(n, grp)) : obj.length > 0);

    if (scratch) {
      const c = cue();
      c.p = 0; c.sink = 0; c.vx = c.vy = 0; c.x = -100;
      const [x, y] = freeSpot(HEAD_X, MY, true);
      c.x = x; c.y = y;
    }
    if (foul) {
      S.turn = o;
      S.hand = scratch ? 'kitchen' : 'any';
      setMsg(foul);
    } else if (keep) {
      if (assigned) setMsg(assigned);
      else if (!pot8) setMsg(`¡Buena! ${nameOf(s)} sigue tirando`);
    } else {
      S.turn = o;
      if (assigned) setMsg(assigned); else if (!pot8) setMsg('');
    }
    S.phase = 'aim';
    S.score = `${pottedOf(S.groups[0])}-${pottedOf(S.groups[1])}`;
    shot = null;
    cpu.plan = null;
  }

  function finish(winner, why) {
    S.phase = 'over';
    S.winner = winner;
    S.hand = null;
    S.score = `${pottedOf(S.groups[0])}-${pottedOf(S.groups[1])}`;
    setMsg(why);
    shot = null;
    announce();
    if (players[1]) ctx.sendEvent({ type: 'end', winner, score: S.score });
  }

  function announce() {
    const w = S.winner;
    if (seat >= 0) ctx.sound(w === seat ? 'win' : 'lose');
  }

  // ---------- Computadora ----------
  const cpu = { plan: null, t: 0, aim: 0 };
  function clearPath(ax, ay, bx, by, skip, rad) {
    for (const b of balls) {
      if (b.p || skip.includes(b.n)) continue;
      if (segDist(b.x, b.y, ax, ay, bx, by) < rad) return false;
    }
    return true;
  }
  function makePlan() {
    const c = cue();
    if (S.brk) return { angle: Math.atan2(MY - c.y, FOOT_X - c.x) + (Math.random() - 0.5) * 0.02, power: 0.95 + Math.random() * 0.05 };
    const grp = S.groups[1];
    let targets = balls.filter((b) => b.n && !b.p && (grp ? inGroup(b.n, grp) : b.n !== 8));
    if (!targets.length) targets = [balls[8]];
    let best = null;
    for (const t of targets) {
      for (const p of POCKETS) {
        const [px, py] = p.a;
        let ux = px - t.x, uy = py - t.y;
        const d2 = Math.hypot(ux, uy);
        if (d2 < 1) continue;
        ux /= d2; uy /= d2;
        if (p.side && Math.abs(uy) < 0.55) continue; // a la media solo de frente
        const gx = t.x - ux * 2 * R, gy = t.y - uy * 2 * R;
        if (gx < L + R - 2 || gx > RR - R + 2 || gy < T + R - 2 || gy > B - R + 2) continue;
        let vx = gx - c.x, vy = gy - c.y;
        const d1 = Math.hypot(vx, vy);
        if (d1 < 1) continue;
        vx /= d1; vy /= d1;
        const cos = vx * ux + vy * uy;
        if (cos < 0.3) continue;
        if (!clearPath(c.x, c.y, gx, gy, [0, t.n], 2 * R - 0.5)) continue;
        if (!clearPath(t.x, t.y, px, py, [0, t.n], 2 * R - 1)) continue;
        const score = cos * 2.2 - (d1 + d2) / 1400 - (p.side ? 0.15 : 0);
        if (!best || score > best.score) best = { score, angle: Math.atan2(vy, vx), power: clamp(0.22 + (d1 + d2 / cos) / 1250, 0.28, 0.92) };
      }
    }
    if (best) return { angle: best.angle + (Math.random() - 0.5) * 0.035, power: best.power };
    // Sin tiro claro: pegarle a la bola propia más cercana
    targets.sort((a, b) => Math.hypot(a.x - c.x, a.y - c.y) - Math.hypot(b.x - c.x, b.y - c.y));
    const t = targets[0];
    return { angle: Math.atan2(t.y - c.y, t.x - c.x) + (Math.random() - 0.5) * 0.05, power: 0.5 };
  }
  function cpuTick(dt) {
    if (!cpu.plan) {
      if (S.hand) {
        const c = cue();
        if (S.hand === 'kitchen' || !placeValid(c.x, c.y, false)) { const [x, y] = freeSpot(HEAD_X, MY, S.hand === 'kitchen'); placeCue(x, y); } else S.hand = null;
        S.hand = null;
      }
      cpu.plan = makePlan();
      cpu.t = 1.1 + Math.random() * 0.8;
      cpu.total = cpu.t;
      cpu.aim = S.aim;
      S.think = true;
    }
    cpu.t -= dt;
    cpu.aim += angDiff(cpu.aim, cpu.plan.angle) * Math.min(1, dt * 4);
    S.aim = cpu.aim;
    S.pow = cpu.t < 0.45 ? cpu.plan.power * (1 - cpu.t / 0.45) : 0;
    if (cpu.t <= 0) { const p = cpu.plan; cpu.plan = null; applyShot(p.angle, p.power); }
  }

  // ---------- Controles locales ----------
  let myAim = 0, kbPow = 0.55, drag = null, dragPow = 0, pointer = null, placeAt = null, waiting = 0, pendingPlace = null;
  const keys = { l: false, r: false, u: false, d: false, shift: false };
  const remote = { aim: 0, pow: 0 };
  const myTurn = () => seat >= 0 && S.phase === 'aim' && S.turn === seat && !waiting;

  const toXY = (e) => { const r = canvas.getBoundingClientRect(); return { x: ((e.clientX - r.left) / r.width) * W, y: ((e.clientY - r.top) / r.height) * H }; };
  const aimAt = (p) => { const c = cue(); if (Math.hypot(p.x - c.x, p.y - c.y) > 3) myAim = Math.atan2(p.y - c.y, p.x - c.x); };

  function shootLocal(angle, power) {
    if (host) applyShot(angle, power);
    else { ctx.sendInput({ shot: { angle, power } }); waiting = 1.5; }
  }
  function placeLocal(x, y) {
    if (!placeValid(x, y, S.hand === 'kitchen')) return;
    if (host) placeCue(x, y);
    else { ctx.sendInput({ place: { x, y } }); pendingPlace = { x, y }; waiting = 1.5; }
    placeAt = null;
  }

  const pm = (e) => {
    pointer = toXY(e);
    if (!myTurn() || S.hand) return;
    if (drag) {
      const dx = drag.x - pointer.x, dy = drag.y - pointer.y;
      dragPow = clamp((dx * Math.cos(myAim) + dy * Math.sin(myAim)) / PULL, 0, 1);
    } else aimAt(pointer);
  };
  const pd = (e) => {
    pointer = toXY(e);
    if (S.phase === 'over') { rematch(); return; }
    if (!myTurn()) return;
    if (S.hand) { placeLocal(pointer.x, pointer.y); return; }
    aimAt(pointer);
    drag = { x: pointer.x, y: pointer.y };
    dragPow = 0;
    try { canvas.setPointerCapture(e.pointerId); } catch { /* sin captura */ }
  };
  const pu = () => {
    if (!drag) return;
    drag = null;
    if (myTurn() && !S.hand && dragPow > 0.03) shootLocal(myAim, dragPow);
    dragPow = 0;
  };
  const pc = () => { drag = null; dragPow = 0; };
  const pl = () => { if (!drag) pointer = null; };
  const KEYMAP = { ArrowLeft: 'l', ArrowRight: 'r', ArrowUp: 'u', ArrowDown: 'd' };
  const kd = (e) => {
    keys.shift = e.shiftKey;
    if (KEYMAP[e.code]) { keys[KEYMAP[e.code]] = true; e.preventDefault(); }
    if (e.code === 'Space') {
      e.preventDefault();
      if (e.repeat) return;
      if (S.phase === 'over') rematch();
      else if (myTurn()) {
        if (S.hand) { const p = placeAt || cue(); placeLocal(p.x, p.y); } else if (!drag) shootLocal(myAim, kbPow);
      }
    }
  };
  const ku = (e) => { keys.shift = e.shiftKey; if (KEYMAP[e.code]) keys[KEYMAP[e.code]] = false; };
  window.addEventListener('keydown', kd);
  window.addEventListener('keyup', ku);
  canvas.addEventListener('pointermove', pm);
  canvas.addEventListener('pointerdown', pd);
  canvas.addEventListener('pointerup', pu);
  canvas.addEventListener('pointercancel', pc);
  canvas.addEventListener('pointerleave', pl);

  function rematch() {
    if (S.phase !== 'over' || seat < 0) return;
    if (host) restart(); else ctx.sendInput({ rematch: true });
  }
  function restart() { S = fresh(1 - S.breaker); shot = null; cpu.plan = null; msgAt = performance.now(); }

  function controls(dt) {
    if (!myTurn()) { drag = null; dragPow = 0; return; }
    if (S.hand) {
      if (!placeAt) placeAt = { x: cue().x, y: cue().y };
      if (pointer && !keys.l && !keys.r && !keys.u && !keys.d) placeAt = { x: pointer.x, y: pointer.y };
      const sp = 220 * dt;
      if (keys.l) placeAt.x -= sp; if (keys.r) placeAt.x += sp; if (keys.u) placeAt.y -= sp; if (keys.d) placeAt.y += sp;
      placeAt.x = clamp(placeAt.x, L + R, S.hand === 'kitchen' ? HEAD_X : RR - R);
      placeAt.y = clamp(placeAt.y, T + R, B - R);
      if (keys.l || keys.r || keys.u || keys.d) pointer = null;
      return;
    }
    placeAt = null;
    const rot = (keys.shift ? 0.18 : 1.3) * dt;
    if (keys.l) myAim -= rot;
    if (keys.r) myAim += rot;
    if (keys.u) kbPow = clamp(kbPow + dt * 0.6, 0.05, 1);
    if (keys.d) kbPow = clamp(kbPow - dt * 0.6, 0.05, 1);
  }

  // ---------- Red ----------
  if (host) {
    ctx.onInput((s, d) => {
      if (s !== 1 || !d) return;
      if (d.rematch && S.phase === 'over') { restart(); return; }
      if (S.turn !== 1 || S.phase !== 'aim' || vsCpu) return;
      if (Number.isFinite(d.aim)) remote.aim = d.aim;
      if (Number.isFinite(d.pow)) remote.pow = clamp(d.pow, 0, 1);
      if (d.place && Number.isFinite(d.place.x) && Number.isFinite(d.place.y)) placeCue(d.place.x, d.place.y);
      if (d.shot && !S.hand) applyShot(Number(d.shot.angle), Number(d.shot.power));
    });
  } else {
    ctx.onState((d) => {
      if (!d || !Array.isArray(d.b)) return;
      if (d.snd) for (const s of d.snd) ctx.sound(s);
      const was = S.phase, prevMsg = S.msgId, prevTurn = S.turn;
      const now = performance.now();
      d.b.forEach(([x, y, p], i) => {
        const b = balls[i];
        if (!b) return;
        if (p && !b.p) b.sink = now;
        if (!p && b.p) { b.x = x; b.y = y; b.sink = 0; }
        b.p = p; b.tx = x; b.ty = y;
        if (Math.hypot(b.x - x, b.y - y) > 60) { b.x = x; b.y = y; }
      });
      S = d;
      if (d.msgId !== prevMsg) msgAt = now;
      if (waiting && (d.phase !== 'aim' || d.turn !== seat || (pendingPlace && !d.hand))) { waiting = 0; pendingPlace = null; }
      if (d.turn !== prevTurn) { drag = null; dragPow = 0; }
      if (was !== 'over' && d.phase === 'over') announce();
    });
  }

  function pack() {
    return {
      b: balls.map((b) => [Math.round(b.x * 10) / 10, Math.round(b.y * 10) / 10, b.p]),
      turn: S.turn, breaker: S.breaker, brk: S.brk, groups: [...S.groups], phase: S.phase, aim: Math.round(S.aim * 1000) / 1000,
      pow: Math.round(S.pow * 100) / 100, msg: S.msg, msgId: S.msgId, winner: S.winner, hand: S.hand, think: S.think, score: S.score,
      snd: sounds.splice(0),
    };
  }

  // ---------- Estado en texto ----------
  function statusText() {
    if (S.phase === 'over') return `🏆 ${nameOf(S.winner)} gana${S.msg ? ` (${S.msg})` : ''} · ${seat >= 0 ? 'Espacio o toca para revancha' : 'esperando revancha'}`;
    const grp = S.groups[S.turn];
    let t = `Turno de ${nameOf(S.turn)}${grp ? ` (${GROUP_NAME[grp]})` : S.brk ? ' · saque' : ' · mesa abierta'}`;
    if (S.msg) t = `${S.msg} · ${t}`;
    const mine = seat >= 0 && S.phase === 'aim' && S.turn === seat;
    if (S.hand) t += mine ? ' · bola en mano: haz clic para colocar la blanca' : ' · bola en mano';
    else if (mine) t += ' · arrastra hacia atrás y suelta';
    if (seat < 0) t = `👀 ${t}`;
    return t;
  }

  // ---------- Dibujo ----------
  const table = buildTable();

  function drawBall(x, y, n, scale = 1, alpha = 1) {
    const r = R * scale;
    g.save();
    g.globalAlpha = alpha;
    if (n === 0) {
      g.fillStyle = '#f7f4ea';
      g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
    } else if (n > 8) {
      g.fillStyle = '#f7f4ea';
      g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
      g.save();
      g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.clip();
      g.fillStyle = BALL_COL[n - 8];
      g.fillRect(x - r, y - r * 0.56, r * 2, r * 1.12);
      g.restore();
    } else {
      g.fillStyle = BALL_COL[n];
      g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
    }
    if (n > 0 && scale > 0.5) {
      g.fillStyle = '#fbf8f0';
      g.beginPath(); g.arc(x, y, r * 0.5, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#151515';
      g.font = `700 ${n > 9 ? 7.5 * scale : 8.5 * scale}px system-ui, sans-serif`;
      g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(String(n), x, y + 0.6 * scale);
    }
    // Volumen: brillo arriba-izquierda y sombra en el borde
    const sh = g.createRadialGradient(x - r * 0.38, y - r * 0.42, r * 0.05, x, y, r * 1.05);
    sh.addColorStop(0, 'rgba(255,255,255,.75)');
    sh.addColorStop(0.18, 'rgba(255,255,255,.18)');
    sh.addColorStop(0.55, 'rgba(255,255,255,0)');
    sh.addColorStop(1, 'rgba(0,0,0,.42)');
    g.fillStyle = sh;
    g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
    g.restore();
  }

  function drawCue(cx, cy, a, pull) {
    const s = R + 4 + pull * 70, len = 380;
    g.save();
    g.translate(cx, cy); g.rotate(a);
    g.shadowColor = 'rgba(0,0,0,.45)'; g.shadowBlur = 8; g.shadowOffsetX = 5; g.shadowOffsetY = 8;
    const gr = g.createLinearGradient(-s, 0, -s - len, 0);
    gr.addColorStop(0, '#f3e3bf');
    gr.addColorStop(0.55, '#d8b47a');
    gr.addColorStop(0.6, '#2a170b');
    gr.addColorStop(0.66, '#7a1e2a');
    gr.addColorStop(0.7, '#2a170b');
    gr.addColorStop(0.86, '#1d1d1d');
    gr.addColorStop(1, '#0d0d0d');
    g.fillStyle = gr;
    g.beginPath(); g.moveTo(-s, -2.6); g.lineTo(-s - len, -5.6); g.arcTo(-s - len - 4, 0, -s - len, 5.6, 5); g.lineTo(-s, 2.6); g.closePath(); g.fill();
    g.shadowColor = 'transparent';
    g.fillStyle = '#f8f8f4'; g.fillRect(-s - 10, -2.7, 8, 5.4); // casquillo
    g.fillStyle = '#3f74b8'; g.fillRect(-s - 2.5, -2.5, 2.5, 5); // punta con tiza
    g.strokeStyle = 'rgba(255,255,255,.35)'; g.lineWidth = 1;
    g.beginPath(); g.moveTo(-s - 10, -1.4); g.lineTo(-s - len * 0.58, -2.8); g.stroke();
    g.restore();
  }

  // Primer contacto de la línea de mira: bola o banda
  function castAim(cx, cy, a) {
    const dx = Math.cos(a), dy = Math.sin(a);
    let best = Infinity, hit = null;
    for (const b of balls) {
      if (b.n === 0 || b.p) continue;
      const fx = b.x - cx, fy = b.y - cy;
      const t = fx * dx + fy * dy;
      if (t <= 0) continue;
      const d2 = fx * fx + fy * fy - t * t;
      if (d2 > 4 * R * R) continue;
      const th = t - Math.sqrt(4 * R * R - d2);
      if (th < best) { best = th; hit = b; }
    }
    let tw = Infinity, wn = 'x';
    if (dx > 1e-6) tw = (RR - R - cx) / dx; else if (dx < -1e-6) tw = (L + R - cx) / dx;
    if (dy > 1e-6) { const ty = (B - R - cy) / dy; if (ty < tw) { tw = ty; wn = 'y'; } } else if (dy < -1e-6) { const ty = (T + R - cy) / dy; if (ty < tw) { tw = ty; wn = 'y'; } }
    if (tw < best) return { t: Math.max(0, tw), wall: wn, dx, dy };
    return { t: Math.max(0, best), ball: hit, dx, dy };
  }

  function drawGuide(cx, cy, a, mine) {
    const h = castAim(cx, cy, a);
    const ex = cx + h.dx * h.t, ey = cy + h.dy * h.t;
    g.save();
    g.lineCap = 'round';
    g.strokeStyle = mine ? 'rgba(255,255,255,.7)' : 'rgba(255,255,255,.4)';
    g.lineWidth = 1.6;
    g.setLineDash([2, 7]);
    g.beginPath(); g.moveTo(cx + h.dx * R, cy + h.dy * R); g.lineTo(ex, ey); g.stroke();
    g.setLineDash([]);
    // Bola fantasma
    g.strokeStyle = mine ? 'rgba(255,255,255,.75)' : 'rgba(255,255,255,.45)';
    g.lineWidth = 1.4;
    g.beginPath(); g.arc(ex, ey, R, 0, Math.PI * 2); g.stroke();
    g.fillStyle = 'rgba(255,255,255,.08)'; g.fill();
    if (h.ball) {
      // Dirección de la bola objetivo y desvío de la blanca
      let nx = h.ball.x - ex, ny = h.ball.y - ey;
      const nl = Math.hypot(nx, ny) || 1; nx /= nl; ny /= nl;
      const cut = h.dx * nx + h.dy * ny;
      g.strokeStyle = 'rgba(255,230,120,.75)'; g.lineWidth = 2;
      g.beginPath(); g.moveTo(h.ball.x + nx * R, h.ball.y + ny * R); g.lineTo(h.ball.x + nx * (R + 18 + 60 * cut), h.ball.y + ny * (R + 18 + 60 * cut)); g.stroke();
      let tx = h.dx - cut * nx, ty = h.dy - cut * ny;
      const tl = Math.hypot(tx, ty);
      if (tl > 0.05) {
        tx /= tl; ty /= tl;
        g.strokeStyle = 'rgba(255,255,255,.35)'; g.lineWidth = 1.4;
        g.beginPath(); g.moveTo(ex, ey); g.lineTo(ex + tx * 40 * tl, ey + ty * 40 * tl); g.stroke();
      }
    } else {
      const rx = h.wall === 'x' ? -h.dx : h.dx, ry = h.wall === 'y' ? -h.dy : h.dy;
      g.strokeStyle = 'rgba(255,255,255,.3)'; g.lineWidth = 1.4; g.setLineDash([2, 7]);
      g.beginPath(); g.moveTo(ex, ey); g.lineTo(ex + rx * 70, ey + ry * 70); g.stroke();
    }
    g.restore();
  }

  function drawHud(pow, shooter) {
    const y0 = 494;
    g.fillStyle = '#12151c';
    g.fillRect(0, y0, W, H - y0);
    for (const i of [0, 1]) {
      const x = i === 0 ? 12 : 560, w = 328, y = y0 + 4, h = 40;
      const active = S.phase !== 'over' && S.turn === i;
      g.fillStyle = active ? 'rgba(255,255,255,.08)' : 'rgba(255,255,255,.03)';
      roundRect(g, x, y, w, h, 9); g.fill();
      if (active) { g.strokeStyle = PCOL[i]; g.lineWidth = 2; roundRect(g, x + 1, y + 1, w - 2, h - 2, 8); g.stroke(); }
      g.fillStyle = PCOL[i];
      g.beginPath(); g.arc(x + 15, y + 13, 5, 0, Math.PI * 2); g.fill();
      g.font = '700 13px system-ui, sans-serif'; g.textAlign = 'left'; g.textBaseline = 'middle';
      g.fillStyle = '#fff';
      const nm = i === 1 && !players[1] ? '🤖 Computadora' : nameOf(i);
      g.fillText(nm.length > 18 ? nm.slice(0, 17) + '…' : nm, x + 26, y + 13);
      const grp = S.groups[i];
      g.font = '500 11px system-ui, sans-serif';
      g.fillStyle = 'rgba(255,255,255,.55)';
      g.textAlign = 'right';
      g.fillText(grp ? (grp === 'solid' ? 'Lisas' : 'Rayadas') : 'Mesa abierta', x + w - 10, y + 13);
      if (active && S.think) { g.fillStyle = '#FFCC00'; g.fillText('pensando…', x + w - 80, y + 13); }
      // Bolas del grupo (las metidas se ven apagadas)
      if (grp) {
        const ns = grp === 'solid' ? [1, 2, 3, 4, 5, 6, 7] : [9, 10, 11, 12, 13, 14, 15];
        ns.forEach((n, k) => drawBall(x + 20 + k * 17, y + 30, n, 0.66, balls[n].p ? 0.22 : 1));
        const done = remaining(grp) === 0;
        drawBall(x + 20 + 7 * 17 + 6, y + 30, 8, 0.66, done ? 1 : 0.22);
      } else {
        g.textAlign = 'left'; g.fillStyle = 'rgba(255,255,255,.35)';
        g.fillText(S.brk ? (S.turn === i ? 'Saca' : '') : 'Mete una bola para elegir grupo', x + 12, y + 30);
      }
    }
    // Barra de fuerza
    const bx = 360, bw = 180, by = y0 + 23;
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = '600 11px system-ui, sans-serif';
    g.fillStyle = 'rgba(255,255,255,.6)';
    g.fillText(shooter ? `Fuerza ${Math.round(pow * 100)}%` : S.phase === 'roll' ? 'Rodando…' : 'Fuerza', W / 2, y0 + 12);
    g.fillStyle = 'rgba(255,255,255,.08)';
    roundRect(g, bx, by, bw, 12, 6); g.fill();
    if (pow > 0) {
      const pg = g.createLinearGradient(bx, 0, bx + bw, 0);
      pg.addColorStop(0, '#2ecc71'); pg.addColorStop(0.55, '#f1c40f'); pg.addColorStop(1, '#e74c3c');
      g.save(); roundRect(g, bx, by, bw, 12, 6); g.clip();
      g.fillStyle = pg; g.fillRect(bx, by, bw * pow, 12);
      g.restore();
    }
    g.strokeStyle = 'rgba(255,255,255,.18)'; g.lineWidth = 1;
    roundRect(g, bx + 0.5, by + 0.5, bw - 1, 11, 5.5); g.stroke();
  }

  function draw() {
    const now = performance.now();
    g.drawImage(table, 0, 0);
    const c = cue();
    const placing = S.phase === 'aim' && S.hand && myTurn();
    if (S.phase === 'aim' && S.hand === 'kitchen') {
      g.fillStyle = 'rgba(255,255,255,.05)';
      g.fillRect(L, T, HEAD_X - L, B - T);
      g.strokeStyle = 'rgba(255,255,255,.25)'; g.setLineDash([4, 6]); g.lineWidth = 1.5;
      g.beginPath(); g.moveTo(HEAD_X, T); g.lineTo(HEAD_X, B); g.stroke(); g.setLineDash([]);
    }
    // Sombras
    g.fillStyle = 'rgba(0,0,0,.38)';
    for (const b of balls) {
      if (b.p || (b.n === 0 && (placing || pendingPlace))) continue;
      g.beginPath(); g.ellipse(b.x + 3, b.y + 4, R * 1.02, R * 0.9, 0, 0, Math.PI * 2); g.fill();
    }
    // Bolas (las que caen se encogen hacia la tronera)
    for (const b of balls) {
      if (b.p) {
        const k = (now - b.sink) / 260;
        if (b.sink && k < 1) {
          const p = POCKETS[b.p - 1];
          drawBall(b.x + (p.x - b.x) * k, b.y + (p.y - b.y) * k, b.n, 1 - k * 0.6, 1 - k);
        }
        continue;
      }
      if (b.n === 0 && (placing || pendingPlace)) continue;
      drawBall(b.x, b.y, b.n);
    }
    // Bola en mano
    if (placing) {
      const p = placeAt || c;
      const ok = placeValid(p.x, p.y, S.hand === 'kitchen');
      drawBall(p.x, p.y, 0, 1, ok ? 0.9 : 0.45);
      g.strokeStyle = ok ? 'rgba(120,255,160,.9)' : 'rgba(255,90,90,.9)'; g.lineWidth = 2;
      g.beginPath(); g.arc(p.x, p.y, R + 4, 0, Math.PI * 2); g.stroke();
    } else if (pendingPlace) drawBall(pendingPlace.x, pendingPlace.y, 0, 1, 0.9);
    // Taco y línea de mira
    let pow = 0, shooter = false;
    if (S.phase === 'aim' && !S.hand && !pendingPlace && !c.p) {
      const mine = myTurn();
      const a = mine ? myAim : S.aim;
      const pull = mine ? (drag ? dragPow : 0) : S.pow;
      pow = mine ? (drag ? dragPow : kbPow) : S.pow;
      shooter = true;
      drawGuide(c.x, c.y, a, mine);
      drawCue(c.x, c.y, a, pull);
    }
    // Aviso temporal sobre el paño
    const age = (now - msgAt) / 1000;
    if (S.msg && S.phase !== 'over' && age < 3.2) {
      g.save();
      g.globalAlpha = clamp(3.2 - age, 0, 1) * clamp(age * 5, 0, 1);
      g.font = '700 15px system-ui, sans-serif';
      const tw = g.measureText(S.msg).width + 28;
      g.fillStyle = 'rgba(10,14,20,.78)';
      roundRect(g, MX - tw / 2, T + 14, tw, 30, 15); g.fill();
      g.fillStyle = S.msg.startsWith('Falta') ? '#ff8a8a' : '#fff';
      g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(S.msg, MX, T + 29.5);
      g.restore();
    }
    drawHud(pow, shooter);
    if (S.phase === 'over') {
      g.fillStyle = 'rgba(0,0,0,.58)';
      g.fillRect(0, 0, W, H);
      g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillStyle = '#FFCC00';
      g.font = '800 40px system-ui, sans-serif';
      g.fillText(`🏆 ${nameOf(S.winner)} gana`, W / 2, H / 2 - 30);
      g.fillStyle = '#fff';
      g.font = '600 17px system-ui, sans-serif';
      if (S.msg) g.fillText(S.msg, W / 2, H / 2 + 12);
      g.fillStyle = 'rgba(255,255,255,.75)';
      g.font = '500 15px system-ui, sans-serif';
      g.fillText(seat >= 0 ? 'Espacio o toca para revancha' : 'Esperando revancha…', W / 2, H / 2 + 42);
    }
  }

  // ---------- Bucle ----------
  function loop(t) {
    const dt = Math.min(0.05, Math.max(0, (t - last) / 1000));
    last = t;
    if (waiting) waiting = Math.max(0, waiting - dt);
    if (!waiting) pendingPlace = null;
    if (seat >= 0) controls(dt);
    if (host) {
      if (S.phase === 'roll') {
        acc += dt;
        while (acc >= SUB) { physStep(SUB); acc -= SUB; }
        if (!moving()) { acc = 0; resolve(); }
      } else acc = 0;
      if (S.phase === 'aim') {
        if (S.turn === 0) { S.aim = myAim; S.pow = drag ? dragPow : 0; }
        else if (vsCpu) cpuTick(dt);
        else { S.aim = remote.aim; S.pow = remote.pow; }
      }
      sendAcc += dt;
      if (sendAcc >= (S.phase === 'roll' || S.phase === 'aim' ? 1 / 30 : 1 / 10)) { sendAcc = 0; ctx.sendState(pack()); }
    } else {
      for (const b of balls) { b.x += (b.tx - b.x) * 0.6; b.y += (b.ty - b.y) * 0.6; }
      if (seat === 1 && myTurn() && !S.hand) {
        aimAcc += dt;
        if (aimAcc >= 1 / 15) { aimAcc = 0; ctx.sendInput({ aim: Math.round(myAim * 1000) / 1000, pow: Math.round((drag ? dragPow : 0) * 100) / 100 }); }
      }
    }
    const st = statusText();
    if (st !== lastStatus) { lastStatus = st; ctx.status(st); }
    draw();
    raf = requestAnimationFrame(loop);
  }
  raf = requestAnimationFrame(loop);

  return {
    destroy() {
      cancelAnimationFrame(raf);
      window.removeEventListener('keydown', kd);
      window.removeEventListener('keyup', ku);
      canvas.removeEventListener('pointermove', pm);
      canvas.removeEventListener('pointerdown', pd);
      canvas.removeEventListener('pointerup', pu);
      canvas.removeEventListener('pointercancel', pc);
      canvas.removeEventListener('pointerleave', pl);
      canvas.style.touchAction = prevTouch;
    },
  };
}

// Mesa estática (se dibuja una sola vez)
function buildTable() {
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const t = c.getContext('2d');
  t.fillStyle = '#12151c';
  t.fillRect(0, 0, W, H);
  // Madera
  t.save();
  t.shadowColor = 'rgba(0,0,0,.6)'; t.shadowBlur = 16; t.shadowOffsetY = 5;
  roundRect(t, 8, 8, W - 16, 484, 26); t.fillStyle = '#4a2a14'; t.fill();
  t.restore();
  const wg = t.createLinearGradient(0, 8, 0, 492);
  wg.addColorStop(0, '#83512a'); wg.addColorStop(0.08, '#6a3d1d'); wg.addColorStop(0.5, '#5a3318'); wg.addColorStop(0.92, '#4a2911'); wg.addColorStop(1, '#3a200d');
  roundRect(t, 8, 8, W - 16, 484, 26); t.fillStyle = wg; t.fill();
  // Veta
  t.save();
  roundRect(t, 8, 8, W - 16, 484, 26); t.clip();
  let seed = 7;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  for (let i = 0; i < 160; i++) {
    t.strokeStyle = `rgba(${rnd() < 0.5 ? '30,12,2' : '160,100,55'},${0.05 + rnd() * 0.08})`;
    t.lineWidth = 0.6 + rnd() * 1.2;
    const horiz = i % 2 === 0;
    t.beginPath();
    if (horiz) { const y = 8 + rnd() * 484; t.moveTo(0, y); t.bezierCurveTo(W * 0.3, y + rnd() * 4 - 2, W * 0.7, y + rnd() * 4 - 2, W, y + rnd() * 3 - 1.5); }
    else { const x = 8 + rnd() * (W - 16); t.moveTo(x, 0); t.bezierCurveTo(x + rnd() * 4 - 2, 160, x + rnd() * 4 - 2, 340, x + rnd() * 3 - 1.5, 500); }
    t.stroke();
  }
  t.restore();
  t.strokeStyle = 'rgba(255,220,170,.18)'; t.lineWidth = 1.5;
  roundRect(t, 10.5, 10.5, W - 21, 479, 24); t.stroke();
  t.strokeStyle = 'rgba(0,0,0,.45)'; t.lineWidth = 2;
  t.strokeRect(L - CW - 1, T - CW - 1, RR - L + 2 * CW + 2, B - T + 2 * CW + 2);
  // Base de bandas (garganta de las troneras)
  t.fillStyle = '#123e2a';
  t.fillRect(L - CW, T - CW, RR - L + 2 * CW, B - T + 2 * CW);
  // Paño
  const fg = t.createRadialGradient(MX, MY, 40, MX, MY, 520);
  fg.addColorStop(0, '#2f9364'); fg.addColorStop(0.6, '#26794f'); fg.addColorStop(1, '#1c5e3d');
  t.fillStyle = fg;
  t.fillRect(L, T, RR - L, B - T);
  // Textura del paño
  for (let i = 0; i < 4000; i++) {
    t.fillStyle = rnd() < 0.5 ? 'rgba(255,255,255,.035)' : 'rgba(0,0,0,.05)';
    t.fillRect(L + rnd() * (RR - L), T + rnd() * (B - T), 1, 1);
  }
  t.font = '900 64px system-ui, sans-serif';
  t.textAlign = 'center'; t.textBaseline = 'middle';
  t.fillStyle = 'rgba(255,255,255,.045)';
  t.fillText('HUB', MX, MY);
  // Marcas: línea de cabecera y puntos
  t.strokeStyle = 'rgba(255,255,255,.13)'; t.lineWidth = 1;
  t.beginPath(); t.moveTo(HEAD_X, T + 2); t.lineTo(HEAD_X, B - 2); t.stroke();
  t.fillStyle = 'rgba(255,255,255,.35)';
  for (const x of [HEAD_X, FOOT_X]) { t.beginPath(); t.arc(x, MY, 2.2, 0, Math.PI * 2); t.fill(); }
  // Sombra interior junto a las bandas
  const edge = (x0, y0, x1, y1, w, h) => { const gr = t.createLinearGradient(x0, y0, x1, y1); gr.addColorStop(0, 'rgba(0,0,0,.32)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); t.fillStyle = gr; t.fillRect(Math.min(x0, x1), Math.min(y0, y1), w, h); };
  t.save(); t.beginPath(); t.rect(L, T, RR - L, B - T); t.clip();
  edge(0, T, 0, T + 10, W, 10); edge(0, B, 0, B - 10, W, 10); edge(L, 0, L + 10, 0, 10, H); edge(RR, 0, RR - 10, 0, 10, H);
  t.restore();
  // Troneras
  for (const p of POCKETS) {
    const lg = t.createRadialGradient(p.x, p.y, p.d * 0.6, p.x, p.y, p.d + 6);
    lg.addColorStop(0, '#2a2a2a'); lg.addColorStop(1, '#0c0c0c');
    t.fillStyle = lg;
    t.beginPath(); t.arc(p.x, p.y, p.d + 6, 0, Math.PI * 2); t.fill();
    t.strokeStyle = 'rgba(255,255,255,.12)'; t.lineWidth = 1;
    t.beginPath(); t.arc(p.x, p.y, p.d + 5.5, 0, Math.PI * 2); t.stroke();
    const hg = t.createRadialGradient(p.x, p.y, 2, p.x, p.y, p.d);
    hg.addColorStop(0, '#000'); hg.addColorStop(0.8, '#050505'); hg.addColorStop(1, '#1a1a1a');
    t.fillStyle = hg;
    t.beginPath(); t.arc(p.x, p.y, p.d, 0, Math.PI * 2); t.fill();
  }
  // Bandas (gomas) con mordazas
  for (const poly of CUSHIONS) {
    const [j0, a, b, j1] = poly;
    const f = CW / J;
    const p0 = [a[0] + (j0[0] - a[0]) * f, a[1] + (j0[1] - a[1]) * f];
    const p1 = [b[0] + (j1[0] - b[0]) * f, b[1] + (j1[1] - b[1]) * f];
    const horiz = a[1] === b[1];
    const cg = horiz ? t.createLinearGradient(0, a[1], 0, p0[1]) : t.createLinearGradient(a[0], 0, p0[0], 0);
    cg.addColorStop(0, '#2b8659'); cg.addColorStop(0.35, '#22714a'); cg.addColorStop(1, '#174f34');
    t.fillStyle = cg;
    t.beginPath(); t.moveTo(p0[0], p0[1]); t.lineTo(a[0], a[1]); t.lineTo(b[0], b[1]); t.lineTo(p1[0], p1[1]); t.closePath(); t.fill();
    t.strokeStyle = 'rgba(255,255,255,.16)'; t.lineWidth = 1;
    t.beginPath(); t.moveTo(a[0], a[1]); t.lineTo(b[0], b[1]); t.stroke();
  }
  // Diamantes
  const diamond = (x, y, vert) => {
    t.save(); t.translate(x, y); if (vert) t.rotate(Math.PI / 2);
    t.fillStyle = '#efe6d0';
    t.beginPath(); t.moveTo(-5, 0); t.lineTo(0, -2.6); t.lineTo(5, 0); t.lineTo(0, 2.6); t.closePath(); t.fill();
    t.strokeStyle = 'rgba(0,0,0,.35)'; t.lineWidth = 0.6; t.stroke();
    t.restore();
  };
  for (let k = 1; k < 8; k++) { if (k === 4) continue; const x = L + ((RR - L) * k) / 8; diamond(x, 22, false); diamond(x, 478, false); }
  for (let k = 1; k < 4; k++) { const y = T + ((B - T) * k) / 4; diamond(22, y, true); diamond(W - 22, y, true); }
  return c;
}
