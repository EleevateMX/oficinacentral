// Futbolito (vista desde arriba) para 2 o contra la computadora. El asiento 0 corre la física.
import { roundRect } from './pong.js';

export const meta = { w: 900, h: 560, help: 'W/S o ↑/↓, o mueve el mouse / dedo: mueves todas tus barras · Espacio / clic / toque: patear · Primero en llegar a 5' };

const W = 900, H = 560;
const TOP = 46; // banda del marcador
const FX0 = 62, FX1 = 838, FY0 = TOP + 32, FY1 = H - 30;
const PW = FX1 - FX0, PH = FY1 - FY0;
const CX = (FX0 + FX1) / 2, CY = (FY0 + FY1) / 2;
const GH = 150; // boca de la portería
const GT = CY - GH / 2, GB = CY + GH / 2;
const GD = 30; // fondo de la portería
const R = 9; // pelota
const FHX = 8, FHY = 14; // medio ancho / medio alto de cada muñeco
const WIN = 5;
const COLORS = ['#FE3377', '#3a86ff'];
const DARK = ['#a3164a', '#1d4fa8'];
const LIGHT = ['#ff8fb4', '#9cc3ff'];
const DIR = [1, -1]; // hacia dónde patea cada equipo
const KICK_T = 0.16, KICK_CD = 0.3;
const MAX_V = 980;

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// 8 barras alternadas: portero, defensa, (delantera rival), medio, (medio rival), delantera, (defensa rival), (portero rival)
const RODS = [[0, 1], [0, 2], [1, 3], [0, 5], [1, 5], [0, 3], [1, 2], [1, 1]].map(([team, n], i) => {
  const sp = { 1: 0, 2: 200, 3: 140, 5: 84 }[n];
  const avail = PH / 2 - FHY - 2;
  return { team, n, sp, x: FX0 + PW / 16 + i * (PW / 8), range: n === 1 ? 100 : avail - ((n - 1) / 2) * sp };
});
const figY = (rod, k, u) => CY + (k - (rod.n - 1) / 2) * rod.sp + u * rod.range;

export function create(canvas, ctx) {
  const g = canvas.getContext('2d');
  const { seat, host, players } = ctx;
  const vsCpu = host && !players[1];
  const nameOf = (i) => players[i]?.name || (i === 1 ? 'La computadora' : 'Jugador');
  let raf = 0;
  let last = performance.now();
  let sendAcc = 0;
  const sounds = [];
  const play = (s) => { ctx.sound(s); if (host) sounds.push(s); };

  let st = fresh();
  function fresh() {
    return { b: { x: CX, y: CY, vx: 0, vy: 0 }, u: [0, 0], k: [-1, -1], s: [0, 0], phase: 'drop', t: 1.4, to: Math.random() < 0.5 ? 0 : 1, winner: -1, scorer: -1 };
  }

  // Mis barras: teclado o mouse/dedo (u va de -1 a 1)
  let myU = 0;
  let myKick = -1; // patada local (para dibujarla sin esperar)
  const keys = { up: false, down: false };
  let pointerY = null;
  const remote = { u: 0 };

  // Solo en el anfitrión
  const hitDone = [false, false];
  const rodV = [0, 0];
  const prevU = [0, 0];
  let anchor = { x: CX, y: CY, t: 0, n: 0 };
  let zone = { x: CX, y: CY, t: 0 }; // atasco largo: la pelota va y viene en una zona chica
  let sndGate = { hit: 0, wall: 0 };
  const cpu = { target: 0, next: 0 };

  const kd = (e) => {
    if (e.code === 'ArrowUp' || e.code === 'KeyW') { keys.up = true; e.preventDefault(); }
    if (e.code === 'ArrowDown' || e.code === 'KeyS') { keys.down = true; e.preventDefault(); }
    if (e.code === 'Space') { e.preventDefault(); if (!e.repeat) action(); }
  };
  const ku = (e) => {
    if (e.code === 'ArrowUp' || e.code === 'KeyW') keys.up = false;
    if (e.code === 'ArrowDown' || e.code === 'KeyS') keys.down = false;
  };
  const toY = (e) => { const r = canvas.getBoundingClientRect(); return ((e.clientY - r.top) / r.height) * H; };
  const pm = (e) => { if (seat >= 0) pointerY = toY(e); };
  const pd = (e) => { pm(e); action(); };
  window.addEventListener('keydown', kd);
  window.addEventListener('keyup', ku);
  canvas.addEventListener('pointermove', pm);
  canvas.addEventListener('pointerdown', pd);

  function action() {
    if (seat < 0) return;
    if (st.phase === 'over') { rematch(); return; }
    if (myKick >= 0 && myKick < KICK_CD) return;
    myKick = 0;
    if (host) startKick(0);
    else ctx.sendInput({ kick: true });
  }

  function rematch() {
    if (host) restart();
    else if (seat === 1) ctx.sendInput({ rematch: true });
  }
  function restart() { st = fresh(); anchor = { x: CX, y: CY, t: 0, n: 0 }; }

  function startKick(team) {
    if (st.k[team] >= 0 && st.k[team] < KICK_CD) return;
    st.k[team] = 0;
    hitDone[team] = false;
  }

  if (host) {
    ctx.onInput((s, d) => {
      if (s !== 1 || !d) return;
      if (Number.isFinite(d.u)) remote.u = clamp(d.u, -1, 1);
      if (d.kick && st.phase !== 'over') startKick(1);
      if (d.rematch && st.phase === 'over') restart();
    });
  } else {
    ctx.onState((d) => {
      if (d.snd) for (const s of d.snd) ctx.sound(s);
      st = d;
      recvAt = performance.now();
    });
  }
  let recvAt = performance.now();

  // ---------- Avisos (todos los asientos) ----------
  let shownPhase = '';
  const parts = [];
  function phaseChanged() {
    if (st.phase === 'goal') {
      ctx.status(`¡Gol de ${nameOf(st.scorer)}! · ${st.s[0]}-${st.s[1]}`);
      const gx = st.scorer === 0 ? FX1 + 6 : FX0 - 6;
      for (let i = 0; i < 70; i++) {
        const a = Math.random() * Math.PI * 2, sp = 80 + Math.random() * 320;
        parts.push({ x: gx, y: CY + (Math.random() - 0.5) * GH, vx: Math.cos(a) * sp - DIR[st.scorer] * 120, vy: Math.sin(a) * sp, life: 1 + Math.random() * 0.8, c: [COLORS[st.scorer], '#fff', '#FFCC00', LIGHT[st.scorer]][i % 4], r: 2 + Math.random() * 3, rot: Math.random() * 6 });
      }
    } else if (st.phase === 'over') {
      if (seat >= 0) ctx.sound(st.winner === seat ? 'win' : 'lose');
      ctx.status(`🏆 ${nameOf(st.winner)} gana ${Math.max(...st.s)}-${Math.min(...st.s)} · ${seat >= 0 ? 'Espacio o toca para revancha' : 'esperando revancha'}`);
    } else if (st.phase === 'drop' && st.s[0] + st.s[1] === 0) {
      ctx.status(seat < 0 ? 'Estás mirando la partida · primero en llegar a 5' : vsCpu ? `Primero en llegar a ${WIN} · juegas contra la computadora (si alguien más abre la mesa, entra como rival)` : `Primero en llegar a ${WIN} · Espacio o clic para patear`);
    }
  }

  function moveMine(dt) {
    const sp = 2.6 * dt;
    if (keys.up) { myU -= sp; pointerY = null; }
    if (keys.down) { myU += sp; pointerY = null; }
    if (pointerY != null) {
      const target = clamp((pointerY - CY) / (PH / 2 - 40), -1, 1);
      myU += clamp(target - myU, -6 * dt, 6 * dt);
    }
    myU = clamp(myU, -1, 1);
    if (myKick >= 0) { myKick += dt; if (myKick > KICK_CD) myKick = -1; }
  }

  // ---------- Computadora ----------
  function cpuMove(dt) {
    const b = st.b;
    cpu.next -= dt;
    if (cpu.next <= 0) {
      cpu.next = 0.1;
      const px = b.x + Math.max(0, b.vx) * 0.12;
      const mine = RODS.filter((r) => r.team === 1);
      let rod = mine.filter((r) => r.x >= px - 8).sort((a, c) => a.x - c.x)[0] || mine[mine.length - 1];
      let ty = b.y;
      if (b.vx > 40) ty = b.y + b.vy * Math.min(0.5, (rod.x - b.x) / b.vx);
      ty = clamp(ty, FY0 + R, FY1 - R) + Math.sin(performance.now() / 370) * 9;
      let best = st.u[1], err = Infinity;
      for (let k = 0; k < rod.n; k++) {
        const base = figY(rod, k, 0);
        const u = clamp((ty - base) / rod.range, -1, 1);
        const e = Math.abs(base + u * rod.range - ty) * 3 + Math.abs(u - st.u[1]) * 20;
        if (e < err) { err = e; best = u; }
      }
      cpu.target = best;
    }
    st.u[1] += clamp(cpu.target - st.u[1], -2.1 * dt, 2.1 * dt);
    if (st.phase !== 'play') return;
    for (const rod of RODS) {
      if (rod.team !== 1) continue;
      const dx = rod.x - b.x;
      if (dx < 4 || dx > 34) continue;
      for (let k = 0; k < rod.n; k++) {
        if (Math.abs(b.y - figY(rod, k, st.u[1])) < 15 && Math.random() < 0.6) { startKick(1); return; }
      }
    }
  }

  // ---------- Física del anfitrión ----------
  function step(dt) {
    st.u[0] = myU;
    if (vsCpu) cpuMove(dt);
    else st.u[1] = remote.u;
    for (const i of [0, 1]) {
      rodV[i] = (st.u[i] - prevU[i]) / Math.max(dt, 1e-3);
      prevU[i] = st.u[i];
      if (st.k[i] >= 0) { st.k[i] += dt; if (st.k[i] > KICK_CD) st.k[i] = -1; }
    }
    sndGate.hit -= dt; sndGate.wall -= dt;

    if (st.phase === 'goal') {
      st.t -= dt;
      if (st.t <= 0) {
        if (st.s[st.scorer] >= WIN) {
          st.phase = 'over';
          st.winner = st.scorer;
          if (players[1]) ctx.sendEvent({ type: 'end', winner: st.winner, score: `${st.s[0]}-${st.s[1]}` });
        } else { st.phase = 'drop'; st.t = 1; st.to = 1 - st.scorer; }
        st.b = { x: CX, y: CY, vx: 0, vy: 0 };
      } else {
        // la pelota sigue rodando dentro de la portería
        const b = st.b;
        b.x += b.vx * dt; b.y += b.vy * dt;
        b.vx *= 0.9; b.vy *= 0.9;
        b.y = clamp(b.y, GT + R, GB - R);
        b.x = clamp(b.x, FX0 - GD + R, FX1 + GD - R);
      }
      return;
    }
    if (st.phase === 'drop') {
      st.t -= dt;
      st.b.x = CX; st.b.y = CY; st.b.vx = 0; st.b.vy = 0;
      if (st.t <= 0) {
        st.phase = 'play';
        const a = (Math.random() * 2 - 1) * 0.7;
        st.b.vx = DIR[1 - st.to] * Math.cos(a) * 190; // hacia el equipo que recibió el gol
        st.b.vy = Math.sin(a) * 190;
        anchor = { x: CX, y: CY, t: 0, n: 0 };
        zone = { x: CX, y: CY, t: 0 };
      }
      return;
    }
    if (st.phase !== 'play') return;

    const N = 4, h = dt / N;
    for (let i = 0; i < N; i++) {
      if (substep(h)) return;
    }
    const b = st.b;
    const f = Math.exp(-0.5 * dt);
    b.vx *= f; b.vy *= f;
    const sp = Math.hypot(b.vx, b.vy);
    if (sp > MAX_V) { b.vx *= MAX_V / sp; b.vy *= MAX_V / sp; }
    if (sp < 6) { b.vx = 0; b.vy = 0; }

    // Va y viene en la misma zona por 9 s: saque al centro
    zone.x += (b.x - zone.x) * Math.min(1, dt * 0.6); zone.y += (b.y - zone.y) * Math.min(1, dt * 0.6);
    if (Math.hypot(b.x - zone.x, b.y - zone.y) > 120) zone.t = 0;
    else if ((zone.t += dt) > 9) { zone.t = 0; st.phase = 'drop'; st.t = 0.8; st.to = Math.random() < 0.5 ? 0 : 1; st.b = { x: CX, y: CY, vx: 0, vy: 0 }; return; }
    // Anti-atasco: si la pelota no sale de un círculo pequeño en 2 s, se empuja; si vuelve a pasar, saque al centro
    if (Math.hypot(b.x - anchor.x, b.y - anchor.y) > 26) { anchor.x = b.x; anchor.y = b.y; anchor.t = 0; if (anchor.n && sp > 150) anchor.n = 0; }
    else {
      anchor.t += dt;
      if (anchor.t > 2) {
        anchor.t = 0;
        anchor.n++;
        if (anchor.n >= 3) {
          st.phase = 'drop'; st.t = 0.8; st.to = Math.random() < 0.5 ? 0 : 1;
          st.b = { x: CX, y: CY, vx: 0, vy: 0 };
        } else {
          const a = Math.atan2(CY - b.y, CX - b.x) + (Math.random() - 0.5) * 1.2;
          b.vx = Math.cos(a) * 280; b.vy = Math.sin(a) * 280;
          play('wall');
        }
      }
    }
  }

  function substep(h) {
    const b = st.b;
    b.x += b.vx * h;
    b.y += b.vy * h;
    // Bandas superior e inferior
    if (b.y < FY0 + R) { b.y = FY0 + R; if (b.vy < 0) { b.vy = -b.vy * 0.85; wallSnd(b.vy); } }
    if (b.y > FY1 - R) { b.y = FY1 - R; if (b.vy > 0) { b.vy = -b.vy * 0.85; wallSnd(b.vy); } }
    // Fondos (menos la boca de la portería)
    for (const side of [0, 1]) {
      const lx = side === 0 ? FX0 : FX1, s = side === 0 ? 1 : -1;
      const inMouth = b.y > GT && b.y < GB;
      if (!inMouth && s * (b.x - lx) < R) {
        if (s * (b.x - lx) > -R) { b.x = lx + s * R; if (s * b.vx < 0) { b.vx = -b.vx * 0.85; wallSnd(b.vx); } }
      }
      // Postes
      for (const py of [GT, GB]) {
        const dx = b.x - lx, dy = b.y - py, d = Math.hypot(dx, dy);
        if (d < R && d > 0) {
          const nx = dx / d, ny = dy / d;
          b.x = lx + nx * R; b.y = py + ny * R;
          const vn = b.vx * nx + b.vy * ny;
          if (vn < 0) { b.vx -= 1.8 * vn * nx; b.vy -= 1.8 * vn * ny; wallSnd(vn); }
        }
      }
      // Dentro de la portería
      if (s * (b.x - lx) < 0 && inMouth) {
        if (b.y < GT + R) { b.y = GT + R; b.vy = Math.abs(b.vy) * 0.7; }
        if (b.y > GB - R) { b.y = GB - R; b.vy = -Math.abs(b.vy) * 0.7; }
      }
    }
    // ¿Gol? (la pelota entra completa)
    if (b.x < FX0 - R || b.x > FX1 + R) {
      const scorer = b.x < FX0 ? 1 : 0;
      st.s[scorer]++;
      st.scorer = scorer;
      st.phase = 'goal';
      st.t = 1.7;
      zone.t = 0;
      play('score');
      return true;
    }
    // Muñecos
    for (const rod of RODS) {
      const tm = rod.team;
      if (Math.abs(b.x - rod.x) > 40) continue;
      const dir = DIR[tm];
      const kt = st.k[tm];
      const vyRod = rodV[tm] * rod.range;
      for (let k = 0; k < rod.n; k++) {
        const fy = figY(rod, k, st.u[tm]);
        // Patada: el pie barre hacia adelante
        if (kt >= 0 && kt < KICK_T * 0.65 && !hitDone[tm]) {
          const swing = 24 * Math.sin(Math.PI * Math.min(1, kt / KICK_T));
          const fwd = dir * (b.x - rod.x);
          if (fwd > -4 && fwd < swing + FHX + R + 4 && Math.abs(b.y - fy) < R + 10) {
            hitDone[tm] = true;
            const speed = Math.max(820, Math.abs(b.vx) * 0.6 + 700);
            b.vx = dir * speed;
            b.vy = b.vy * 0.25 + (b.y - fy) * 16 + vyRod * 0.5;
            b.x = rod.x + dir * Math.max(fwd, FHX + R + 1);
            play('hit');
            continue;
          }
        }
        // Bloqueo pasivo: círculo contra rectángulo
        const qx = clamp(b.x, rod.x - FHX, rod.x + FHX), qy = clamp(b.y, fy - FHY, fy + FHY);
        let dx = b.x - qx, dy = b.y - qy, d = Math.hypot(dx, dy);
        if (d >= R) continue;
        let nx, ny;
        if (d < 1e-6) { nx = b.x >= rod.x ? 1 : -1; ny = 0; d = 0; b.x = rod.x + nx * (FHX + R); }
        else { nx = dx / d; ny = dy / d; b.x += nx * (R - d); b.y += ny * (R - d); }
        const rvx = b.vx, rvy = b.vy - vyRod;
        const vn = rvx * nx + rvy * ny;
        if (vn < 0) {
          b.vx = rvx - 1.55 * vn * nx;
          b.vy = rvy - 1.55 * vn * ny + vyRod;
          if (-vn > 120) hitSnd();
        }
        // pequeño empujón
        b.vx += nx * 35; b.vy += ny * 35 + vyRod * 0.15;
      }
    }
    return false;
  }
  function wallSnd(v) { if (Math.abs(v) > 90 && sndGate.wall <= 0) { sndGate.wall = 0.08; play('wall'); } }
  function hitSnd() { if (sndGate.hit <= 0) { sndGate.hit = 0.08; play('hit'); } }

  // ---------- Dibujo ----------
  // Fondo estático pre-renderizado
  const bg = document.createElement('canvas');
  bg.width = W; bg.height = H;
  drawTable(bg.getContext('2d'));

  function drawTable(c) {
    c.fillStyle = '#0d1b3d';
    c.fillRect(0, 0, W, H);
    // Madera
    const wood = c.createLinearGradient(0, TOP, 0, H);
    wood.addColorStop(0, '#8a5530'); wood.addColorStop(0.5, '#6e3f20'); wood.addColorStop(1, '#5a3218');
    c.fillStyle = wood;
    roundRect(c, 4, TOP + 2, W - 8, H - TOP - 6, 20); c.fill();
    c.save();
    roundRect(c, 4, TOP + 2, W - 8, H - TOP - 6, 20); c.clip();
    c.strokeStyle = 'rgba(30,12,0,.18)';
    c.lineWidth = 1.2;
    for (let i = 0; i < 26; i++) {
      const y = TOP + 6 + i * 20 + (i % 3) * 3;
      c.beginPath();
      c.moveTo(0, y);
      for (let x = 0; x <= W; x += 60) c.quadraticCurveTo(x + 30, y + Math.sin(i * 1.7 + x * 0.02) * 5, x + 60, y);
      c.stroke();
    }
    c.restore();
    c.strokeStyle = 'rgba(255,220,180,.25)';
    c.lineWidth = 2;
    roundRect(c, 5, TOP + 3, W - 10, H - TOP - 8, 19); c.stroke();
    // Porterías
    for (const side of [0, 1]) {
      const x0 = side === 0 ? FX0 - GD : FX1;
      c.fillStyle = '#141414';
      c.fillRect(x0, GT, GD, GH);
      c.strokeStyle = 'rgba(255,255,255,.22)';
      c.lineWidth = 1;
      for (let x = x0 + 5; x < x0 + GD; x += 6) { c.beginPath(); c.moveTo(x, GT); c.lineTo(x, GB); c.stroke(); }
      for (let y = GT + 5; y < GB; y += 6) { c.beginPath(); c.moveTo(x0, y); c.lineTo(x0 + GD, y); c.stroke(); }
      c.fillStyle = COLORS[side];
      c.fillRect(side === 0 ? x0 - 4 : x0 + GD, GT - 4, 4, GH + 8);
    }
    // Labio metálico alrededor de la cancha
    c.fillStyle = '#c3c8d0';
    roundRect(c, FX0 - 6, FY0 - 6, PW + 12, PH + 12, 8); c.fill();
    c.fillStyle = '#7d848f';
    roundRect(c, FX0 - 3, FY0 - 3, PW + 6, PH + 6, 6); c.fill();
    // Césped a franjas
    for (let i = 0; i < 12; i++) {
      c.fillStyle = i % 2 ? '#2f9e44' : '#2a8f3d';
      c.fillRect(FX0 + (i * PW) / 12, FY0, PW / 12 + 1, PH);
    }
    const vig = c.createRadialGradient(CX, CY, 120, CX, CY, PW * 0.62);
    vig.addColorStop(0, 'rgba(255,255,255,0.05)'); vig.addColorStop(1, 'rgba(0,0,0,0.25)');
    c.fillStyle = vig;
    c.fillRect(FX0, FY0, PW, PH);
    // Boca de portería abierta en el labio
    for (const side of [0, 1]) {
      c.fillStyle = '#141414';
      c.fillRect(side === 0 ? FX0 - 7 : FX1, GT, 7, GH);
    }
    // Líneas
    c.strokeStyle = 'rgba(255,255,255,.85)';
    c.lineWidth = 3;
    c.strokeRect(FX0 + 6, FY0 + 6, PW - 12, PH - 12);
    c.beginPath(); c.moveTo(CX, FY0 + 6); c.lineTo(CX, FY1 - 6); c.stroke();
    c.beginPath(); c.arc(CX, CY, 62, 0, Math.PI * 2); c.stroke();
    c.fillStyle = 'rgba(255,255,255,.9)';
    c.beginPath(); c.arc(CX, CY, 4, 0, Math.PI * 2); c.fill();
    for (const side of [0, 1]) {
      const s = side === 0 ? 1 : -1, lx = side === 0 ? FX0 + 6 : FX1 - 6;
      c.strokeRect(Math.min(lx, lx + s * 104), CY - 125, 104, 250);
      c.strokeRect(Math.min(lx, lx + s * 40), CY - 62, 40, 124);
      c.beginPath(); c.arc(lx + s * 76, CY, 3.5, 0, Math.PI * 2); c.fill();
      c.beginPath();
      c.arc(lx + s * 76, CY, 52, side === 0 ? -0.93 : Math.PI - 0.93 + 0, side === 0 ? 0.93 : Math.PI + 0.93);
      c.save(); c.clip(); c.restore();
      c.stroke();
      // esquinas
      for (const cy of [FY0 + 6, FY1 - 6]) {
        c.beginPath();
        const a0 = side === 0 ? (cy < CY ? 0 : -Math.PI / 2) : (cy < CY ? Math.PI / 2 : Math.PI);
        c.arc(lx, cy, 12, a0, a0 + Math.PI / 2);
        c.stroke();
      }
    }
    // Tapamos la parte del arco dentro del área grande
    for (const side of [0, 1]) {
      const s = side === 0 ? 1 : -1, lx = side === 0 ? FX0 + 6 : FX1 - 6;
      const x0 = Math.min(lx, lx + s * 104) + 2, w = 100;
      c.save();
      c.beginPath(); c.rect(x0, CY - 123, w, 246); c.clip();
      for (let i = 0; i < 12; i++) {
        c.fillStyle = i % 2 ? '#2f9e44' : '#2a8f3d';
        c.fillRect(FX0 + (i * PW) / 12, FY0, PW / 12 + 1, PH);
      }
      c.fillStyle = vig; c.fillRect(FX0, FY0, PW, PH);
      c.strokeStyle = 'rgba(255,255,255,.85)';
      c.lineWidth = 3;
      c.strokeRect(Math.min(lx, lx + s * 40), CY - 62, 40, 124);
      c.fillStyle = 'rgba(255,255,255,.9)';
      c.beginPath(); c.arc(lx + s * 76, CY, 3.5, 0, Math.PI * 2); c.fill();
      c.restore();
    }
    // Rampas de esquina
    c.fillStyle = 'rgba(0,0,0,.18)';
    for (const [x, y, sx, sy] of [[FX0, FY0, 1, 1], [FX1, FY0, -1, 1], [FX0, FY1, 1, -1], [FX1, FY1, -1, -1]]) {
      c.beginPath(); c.moveTo(x, y); c.lineTo(x + sx * 22, y); c.lineTo(x, y + sy * 22); c.closePath(); c.fill();
    }
    // Pasabarras (arandelas) en la madera
    for (const rod of RODS) {
      for (const y of [FY0 - 18, FY1 + 15]) {
        c.fillStyle = '#2b2b2b';
        c.beginPath(); c.ellipse(rod.x, y, 9, 6, 0, 0, Math.PI * 2); c.fill();
        c.strokeStyle = '#d8dce2'; c.lineWidth = 2;
        c.beginPath(); c.ellipse(rod.x, y, 9, 6, 0, 0, Math.PI * 2); c.stroke();
      }
    }
  }

  function drawHeader() {
    g.fillStyle = '#0d1b3d';
    g.fillRect(0, 0, W, TOP);
    g.textBaseline = 'middle';
    for (const i of [0, 1]) {
      const left = i === 0;
      const pillW = 300, x = left ? 10 : W - 10 - pillW, y = 7, h = TOP - 14;
      const grd = g.createLinearGradient(x, 0, x + pillW, 0);
      grd.addColorStop(left ? 0 : 1, COLORS[i]); grd.addColorStop(left ? 1 : 0, 'rgba(255,255,255,0.04)');
      g.fillStyle = grd;
      roundRect(g, x, y, pillW, h, h / 2); g.fill();
      let name = nameOf(i);
      if (i === 1 && !players[1]) name = '🤖 Computadora';
      if (name.length > 18) name = name.slice(0, 17) + '…';
      g.font = '700 16px system-ui, sans-serif';
      g.fillStyle = '#fff';
      g.textAlign = left ? 'left' : 'right';
      g.fillText(name + (i === seat ? ' (tú)' : ''), left ? x + 16 : x + pillW - 16, TOP / 2 + 1);
      // marcador
      const sx = left ? W / 2 - 46 : W / 2 + 46;
      g.fillStyle = 'rgba(0,0,0,.35)';
      roundRect(g, sx - 24, 5, 48, TOP - 10, 8); g.fill();
      g.font = '800 26px system-ui, sans-serif';
      g.textAlign = 'center';
      g.fillStyle = i === 0 ? LIGHT[0] : LIGHT[1];
      g.fillText(String(st.s[i]), sx, TOP / 2 + 1);
    }
    g.font = '600 11px system-ui, sans-serif';
    g.fillStyle = 'rgba(255,255,255,.55)';
    g.textAlign = 'center';
    g.fillText('a ' + WIN, W / 2, TOP / 2 + 1);
  }

  function drawRod(rod, u) {
    const x = rod.x;
    g.fillStyle = 'rgba(0,0,0,.22)';
    g.fillRect(x - 2, FY0 - 22, 7, PH + 40);
    const grd = g.createLinearGradient(x - 3.5, 0, x + 3.5, 0);
    grd.addColorStop(0, '#5b626d'); grd.addColorStop(0.45, '#f4f6f8'); grd.addColorStop(1, '#4a505a');
    g.fillStyle = grd;
    g.fillRect(x - 3.5, TOP + 6, 7, H - TOP - 16);
    // topes de goma que se mueven con la barra
    const top = figY(rod, 0, u) - (rod.n === 1 ? 0 : 0);
    const bot = figY(rod, rod.n - 1, u);
    g.fillStyle = '#222';
    const lim = rod.n === 1 ? 22 : 26;
    for (const y of [top - lim, bot + lim]) {
      if (y < FY0 + 2 || y > FY1 - 2) continue;
      roundRect(g, x - 5.5, y - 3, 11, 6, 2); g.fill();
    }
    // mango del lado de cada jugador
    const hy = rod.team === 0 ? H - 8 : TOP + 6;
    const hh = 14;
    g.fillStyle = DARK[rod.team];
    roundRect(g, x - 7, rod.team === 0 ? hy - hh : hy, 14, hh, 5); g.fill();
    g.fillStyle = 'rgba(255,255,255,.25)';
    g.fillRect(x - 4, rod.team === 0 ? hy - hh + 3 : hy + 3, 2, hh - 6);
  }

  function drawFigure(x, y, team, kt) {
    const dir = DIR[team];
    const p = kt >= 0 && kt < KICK_T ? kt / KICK_T : -1;
    const swing = p >= 0 ? 24 * Math.sin(Math.PI * p) : 0;
    const lean = swing * 0.25;
    // sombra
    g.fillStyle = 'rgba(0,0,0,.28)';
    g.beginPath(); g.ellipse(x + 4, y + 5, 11 + swing * 0.3, 15, 0, 0, Math.PI * 2); g.fill();
    // piernas y zapatos
    const fx = x + dir * (5 + swing);
    if (swing > 1) {
      g.strokeStyle = '#e2a87c'; g.lineWidth = 4; g.lineCap = 'round';
      for (const s of [-5, 5]) { g.beginPath(); g.moveTo(x, y + s); g.lineTo(fx, y + s * 0.8); g.stroke(); }
    }
    g.fillStyle = '#151515';
    for (const s of [-5, 5]) { g.beginPath(); g.ellipse(fx, y + s * (swing > 1 ? 0.8 : 1), 5, 3.4, 0, 0, Math.PI * 2); g.fill(); }
    // hombros / camiseta
    const bx = x + dir * lean;
    const grd = g.createLinearGradient(bx - FHX, 0, bx + FHX, 0);
    grd.addColorStop(0, DARK[team]); grd.addColorStop(0.5, COLORS[team]); grd.addColorStop(1, DARK[team]);
    g.fillStyle = grd;
    roundRect(g, bx - FHX, y - FHY, FHX * 2, FHY * 2, 6); g.fill();
    g.strokeStyle = 'rgba(0,0,0,.35)'; g.lineWidth = 1;
    roundRect(g, bx - FHX, y - FHY, FHX * 2, FHY * 2, 6); g.stroke();
    // brazos
    g.fillStyle = '#e2a87c';
    g.beginPath(); g.arc(bx - dir * 1, y - FHY + 1.5, 2.6, 0, Math.PI * 2); g.fill();
    g.beginPath(); g.arc(bx - dir * 1, y + FHY - 1.5, 2.6, 0, Math.PI * 2); g.fill();
    // cabeza (piel adelante, pelo atrás)
    const hx = bx + dir * 1;
    g.fillStyle = '#eab38a';
    g.beginPath(); g.arc(hx, y, 7, 0, Math.PI * 2); g.fill();
    g.fillStyle = team === 0 ? '#3b2416' : '#1d1d1f';
    g.beginPath(); g.arc(hx - dir * 1.3, y, 6.1, Math.PI / 2 * dir + 0, Math.PI / 2 * dir + Math.PI); g.fill();
    g.fillStyle = 'rgba(255,255,255,.35)';
    g.beginPath(); g.arc(hx + dir * 1.8, y - 2, 1.6, 0, Math.PI * 2); g.fill();
  }

  let spin = 0, lastBx = CX, lastBy = CY;
  function ballPos() {
    const b = st.b;
    if (host || st.phase !== 'play') return { x: b.x, y: b.y };
    const dt = Math.min(0.06, (performance.now() - recvAt) / 1000);
    return { x: clamp(b.x + (b.vx || 0) * dt, FX0 - GD, FX1 + GD), y: clamp(b.y + (b.vy || 0) * dt, FY0 + R, FY1 - R) };
  }

  function drawBall(dt) {
    const { x, y } = ballPos();
    spin += Math.hypot(x - lastBx, y - lastBy) / R;
    const ang = Math.atan2(y - lastBy, x - lastBx);
    lastBx = x; lastBy = y;
    let lift = 0;
    if (st.phase === 'drop') lift = Math.max(0, st.t) * 26;
    g.fillStyle = `rgba(0,0,0,${0.32 - Math.min(0.15, lift / 200)})`;
    g.beginPath(); g.ellipse(x + 3 + lift * 0.3, y + 4 + lift * 0.4, R + lift * 0.08, R * 0.75 + lift * 0.05, 0, 0, Math.PI * 2); g.fill();
    const by = y - lift;
    const rr = R * (1 + lift / 150);
    const grd = g.createRadialGradient(x - 3, by - 3, 1, x, by, rr);
    grd.addColorStop(0, '#ffffff'); grd.addColorStop(0.7, '#f1f1f1'); grd.addColorStop(1, '#b9bec6');
    g.fillStyle = grd;
    g.beginPath(); g.arc(x, by, rr, 0, Math.PI * 2); g.fill();
    // manchas que giran con el movimiento
    g.save();
    g.beginPath(); g.arc(x, by, rr, 0, Math.PI * 2); g.clip();
    g.fillStyle = '#222';
    const off = ((spin % (Math.PI * 2)) / (Math.PI * 2)) * rr * 2.4 - rr * 1.2;
    const cs = Math.cos(ang), sn = Math.sin(ang);
    for (const [a, b2] of [[0, 0], [rr * 1.2, rr * 0.7], [-rr * 1.2, -rr * 0.6], [rr * 1.2, -rr * 0.9], [-rr * 1.2, rr * 0.8]]) {
      let px = ((a + off + rr * 2.4 * 2) % (rr * 2.4)) - rr * 1.2;
      const qx = x + px * cs - b2 * sn, qy = by + px * sn + b2 * cs;
      g.beginPath(); g.arc(qx, qy, rr * 0.32, 0, Math.PI * 2); g.fill();
    }
    g.restore();
    g.strokeStyle = 'rgba(0,0,0,.25)'; g.lineWidth = 1;
    g.beginPath(); g.arc(x, by, rr, 0, Math.PI * 2); g.stroke();
  }

  function drawParticles(dt) {
    for (let i = parts.length - 1; i >= 0; i--) {
      const q = parts[i];
      q.life -= dt;
      if (q.life <= 0) { parts.splice(i, 1); continue; }
      q.x += q.vx * dt; q.y += q.vy * dt; q.vx *= 0.97; q.vy = q.vy * 0.97 + 40 * dt; q.rot += dt * 8;
      g.save();
      g.globalAlpha = Math.min(1, q.life * 1.5);
      g.translate(q.x, q.y); g.rotate(q.rot);
      g.fillStyle = q.c;
      g.fillRect(-q.r, -q.r * 0.6, q.r * 2, q.r * 1.2);
      g.restore();
    }
  }

  function banner(text, color, sub, scale) {
    g.save();
    g.translate(CX, CY - 10);
    g.scale(scale, scale);
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = '900 72px system-ui, sans-serif';
    g.lineWidth = 10; g.strokeStyle = 'rgba(0,0,0,.55)'; g.lineJoin = 'round';
    g.strokeText(text, 0, 0);
    g.fillStyle = color;
    g.fillText(text, 0, 0);
    if (sub) {
      g.font = '700 22px system-ui, sans-serif';
      g.lineWidth = 6;
      g.strokeText(sub, 0, 52);
      g.fillStyle = '#fff';
      g.fillText(sub, 0, 52);
    }
    g.restore();
  }

  function draw(dt) {
    g.drawImage(bg, 0, 0);
    drawHeader();
    const us = [0, 1].map((i) => (i === seat ? myU : st.u[i]));
    const ks = [0, 1].map((i) => (i === seat && !host ? myKick : st.k[i]));
    // pelota debajo de las barras
    drawBall(dt);
    for (const rod of RODS) drawRod(rod, us[rod.team]);
    for (const rod of RODS) for (let k = 0; k < rod.n; k++) drawFigure(rod.x, figY(rod, k, us[rod.team]), rod.team, ks[rod.team]);
    drawParticles(dt);

    if (st.phase === 'drop' && st.s[0] + st.s[1] === 0) {
      g.font = '700 22px system-ui, sans-serif';
      g.textAlign = 'center'; g.textBaseline = 'middle';
      g.lineWidth = 5; g.strokeStyle = 'rgba(0,0,0,.5)';
      g.strokeText(`Primero en llegar a ${WIN}`, CX, CY - 92);
      g.fillStyle = '#fff';
      g.fillText(`Primero en llegar a ${WIN}`, CX, CY - 92);
    }
    if (st.phase === 'goal') {
      const age = 1.7 - st.t;
      const sc = Math.min(1, age * 5) * (1 + 0.06 * Math.sin(age * 14));
      banner('¡GOOOL!', COLORS[st.scorer], `${nameOf(st.scorer)} · ${st.s[0]} - ${st.s[1]}`, Math.max(0.01, sc));
    }
    if (st.phase === 'over') {
      g.fillStyle = 'rgba(5,10,25,.62)';
      g.fillRect(0, TOP, W, H - TOP);
      g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillStyle = '#FFCC00';
      g.font = '800 42px system-ui, sans-serif';
      g.fillText(`🏆 ${nameOf(st.winner)} gana`, CX, CY - 22);
      g.fillStyle = '#fff';
      g.font = '600 19px system-ui, sans-serif';
      g.fillText(`${st.s[0]} - ${st.s[1]}${seat >= 0 ? ' · Espacio o toca para revancha' : ''}`, CX, CY + 24);
    }
  }

  function loop(t) {
    const dt = Math.min(0.033, (t - last) / 1000);
    last = t;
    if (seat >= 0) moveMine(dt);
    if (host) {
      step(dt);
      sendAcc += dt;
      if (sendAcc >= 1 / 30) {
        sendAcc = 0;
        const b = st.b;
        ctx.sendState({
          b: { x: Math.round(b.x * 10) / 10, y: Math.round(b.y * 10) / 10, vx: Math.round(b.vx), vy: Math.round(b.vy) },
          u: st.u.map((v) => Math.round(v * 1000) / 1000), k: st.k.map((v) => Math.round(v * 1000) / 1000),
          s: [...st.s], phase: st.phase, t: Math.round(st.t * 100) / 100, to: st.to, winner: st.winner, scorer: st.scorer,
          snd: sounds.splice(0),
        });
      }
    } else if (seat === 1) {
      sendAcc += dt;
      if (sendAcc >= 1 / 30) { sendAcc = 0; ctx.sendInput({ u: Math.round(myU * 1000) / 1000 }); }
    }
    if (st.phase !== shownPhase) { const prev = shownPhase; shownPhase = st.phase; if (prev || st.phase === 'drop') phaseChanged(); }
    draw(dt);
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
    },
  };
}
