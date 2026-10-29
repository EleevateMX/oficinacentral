// Ping pong para 2 (o contra la computadora). El asiento 0 corre la física con paso fijo;
// el invitado y los espectadores dibujan ~100 ms en el pasado interpolando (netSync.js).
import { SnapBuffer, gameLoop, crispCanvas, stamp, Shake, Particles, drawCountdown } from './netSync.js';

export const meta = { w: 800, h: 450, help: 'W/S o ↑/↓, o mueve el mouse / dedo · Espacio: revancha' };

const W = 800, H = 450;
const PAD_H = 84, PAD_W = 12, PAD_X = 34;
const BALL_R = 8;
const WIN = 7;
const COLORS = ['#FE3377', '#3a86ff'];

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

export function create(canvas, ctx) {
  const cc = crispCanvas(canvas, W, H);
  const g = cc.g;
  const { seat, host, players } = ctx;
  const vsCpu = host && !players[1];
  let sendAcc = 0;
  const sounds = [];
  const buf = new SnapBuffer({ delay: 100 });
  const shake = new Shake();
  const parts = new Particles(220);
  // efectos que se ven en todas las pantallas (los decide el anfitrión y viajan con los sonidos)
  const juice = (s, b) => {
    if (s === 'hit') parts.burst(b.x, b.y, 10, { colors: ['#fff', '#ffcf6b'], speed: [80, 240], life: [0.2, 0.45] });
    if (s === 'wall') parts.burst(b.x, b.y, 5, { colors: ['#cfe0ff'], speed: [40, 140], life: [0.15, 0.3] });
    if (s === 'score') { shake.kick(10, 0.4); parts.burst(b.x < W / 2 ? 30 : W - 30, b.y, 40, { colors: ['#FFCC00', '#FE3377', '#fff', '#3a86ff'], speed: [120, 420], life: [0.5, 1.1], gravity: 300 }); }
  };
  const play = (s) => { ctx.sound(s); if (host) { sounds.push(s); juice(s, st.b); } };

  // Estado (lo tiene el anfitrión; los demás reciben copias)
  let st = fresh();
  function fresh() {
    // el primer saque tiene cuenta regresiva
    return { b: { x: W / 2, y: H / 2, vx: 0, vy: 0 }, p: [H / 2, H / 2], s: [0, 0], phase: 'serve', t: 3.2, to: Math.random() < 0.5 ? 0 : 1, winner: -1, hits: 0 };
  }

  // Mi paleta: teclado o mouse/dedo
  let myY = H / 2;
  const keys = { up: false, down: false };
  let pointerY = null;
  const remote = { y: H / 2 }; // paleta del invitado (en el anfitrión)

  const kd = (e) => {
    if (e.code === 'ArrowUp' || e.code === 'KeyW') { keys.up = true; e.preventDefault(); }
    if (e.code === 'ArrowDown' || e.code === 'KeyS') { keys.down = true; e.preventDefault(); }
    if (e.code === 'Space') { e.preventDefault(); rematch(); }
  };
  const ku = (e) => {
    if (e.code === 'ArrowUp' || e.code === 'KeyW') keys.up = false;
    if (e.code === 'ArrowDown' || e.code === 'KeyS') keys.down = false;
  };
  const toY = (e) => { const r = canvas.getBoundingClientRect(); return ((e.clientY - r.top) / r.height) * H; };
  const pm = (e) => { if (seat >= 0) pointerY = toY(e); };
  const pd = (e) => { pm(e); if (st.phase === 'over') rematch(); };
  window.addEventListener('keydown', kd);
  window.addEventListener('keyup', ku);
  canvas.addEventListener('pointermove', pm);
  canvas.addEventListener('pointerdown', pd);

  function rematch() {
    if (st.phase !== 'over') return;
    if (host) { st = fresh(); ctx.status(''); } else if (seat === 1) ctx.sendInput({ rematch: true });
  }

  if (host) {
    ctx.onInput((s, d) => {
      if (s !== 1) return;
      if (Number.isFinite(d?.y)) remote.y = clamp(d.y, PAD_H / 2, H - PAD_H / 2);
      if (d?.rematch && st.phase === 'over') { st = fresh(); ctx.status(''); }
    });
  } else {
    let lastSeen = null;
    ctx.onState((d) => {
      if (!buf.push(d)) return;
      if (d.snd) for (const s of d.snd) { ctx.sound(s); juice(s, d.b); }
      const was = lastSeen?.phase;
      lastSeen = d;
      if (was !== 'over' && d.phase === 'over') { st = d; announce(); }
    });
  }

  function announce() {
    const w = st.winner;
    const name = players[w]?.name || 'La computadora';
    if (seat >= 0) ctx.sound(w === seat ? 'win' : 'lose');
    ctx.status(`${name} ganó ${st.s[0]}-${st.s[1]} · ${seat >= 0 ? 'Espacio o toca para revancha' : 'esperando revancha'}`);
  }

  function moveMine(dt) {
    const sp = 520 * dt;
    if (keys.up) { myY -= sp; pointerY = null; }
    if (keys.down) { myY += sp; pointerY = null; }
    if (pointerY != null) myY += clamp(pointerY - myY, -900 * dt, 900 * dt);
    myY = clamp(myY, PAD_H / 2, H - PAD_H / 2);
  }

  // Física del anfitrión
  function step(dt) {
    st.p[0] = myY;
    if (vsCpu) {
      // La computadora sigue la pelota con algo de retraso y error
      const target = st.b.vx > 0 ? st.b.y + Math.sin(performance.now() / 400) * 22 : H / 2;
      st.p[1] += clamp(target - st.p[1], -330 * dt, 330 * dt);
      st.p[1] = clamp(st.p[1], PAD_H / 2, H - PAD_H / 2);
    } else st.p[1] = remote.y;

    if (st.phase === 'serve') {
      st.t -= dt;
      st.b.x = W / 2; st.b.y = H / 2;
      if (st.t <= 0) {
        st.phase = 'play';
        const dir = st.to === 0 ? -1 : 1;
        st.b.vx = dir * 330;
        st.b.vy = (Math.random() * 2 - 1) * 160;
        st.hits = 0;
      }
      return;
    }
    if (st.phase !== 'play') return;
    const b = st.b;
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    if (b.y < BALL_R) { b.y = BALL_R; b.vy = Math.abs(b.vy); play('wall'); }
    if (b.y > H - BALL_R) { b.y = H - BALL_R; b.vy = -Math.abs(b.vy); play('wall'); }
    // Paletas
    for (const i of [0, 1]) {
      const px = i === 0 ? PAD_X : W - PAD_X;
      const towards = i === 0 ? b.vx < 0 : b.vx > 0;
      if (!towards) continue;
      const near = i === 0 ? b.x - BALL_R <= px + PAD_W / 2 && b.x > px - PAD_W : b.x + BALL_R >= px - PAD_W / 2 && b.x < px + PAD_W;
      if (near && Math.abs(b.y - st.p[i]) <= PAD_H / 2 + BALL_R) {
        const off = (b.y - st.p[i]) / (PAD_H / 2); // -1..1: donde pegó da el ángulo
        const speed = Math.min(780, Math.hypot(b.vx, b.vy) * 1.06 + 8);
        const ang = off * 0.95;
        b.vx = (i === 0 ? 1 : -1) * Math.cos(ang) * speed;
        b.vy = Math.sin(ang) * speed;
        b.x = i === 0 ? px + PAD_W / 2 + BALL_R : px - PAD_W / 2 - BALL_R;
        st.hits++;
        play('hit');
      }
    }
    // Punto
    if (b.x < -20 || b.x > W + 20) {
      const scorer = b.x < 0 ? 1 : 0;
      st.s[scorer]++;
      play('score');
      if (st.s[scorer] >= WIN) {
        st.phase = 'over';
        st.winner = scorer;
        announce();
        if (players[1]) ctx.sendEvent({ type: 'end', winner: scorer, score: `${st.s[0]}-${st.s[1]}` });
      } else {
        st.phase = 'serve'; st.t = 1; st.to = 1 - scorer; // saca hacia quien perdió el punto
      }
    }
  }

  // ---------- Dibujo ----------
  function draw() {
    // Mesa
    g.fillStyle = '#0d1b3d';
    g.fillRect(0, 0, W, H);
    const m = 18;
    g.fillStyle = '#1d4fa8';
    roundRect(g, m, m, W - m * 2, H - m * 2, 10); g.fill();
    g.strokeStyle = 'rgba(255,255,255,.9)';
    g.lineWidth = 4;
    roundRect(g, m + 4, m + 4, W - m * 2 - 8, H - m * 2 - 8, 8); g.stroke();
    g.lineWidth = 2;
    g.beginPath(); g.moveTo(m + 4, H / 2); g.lineTo(W - m - 4, H / 2); g.stroke();
    // Red
    g.fillStyle = 'rgba(255,255,255,.25)';
    g.fillRect(W / 2 - 3, m - 6, 6, H - m * 2 + 12);
    g.fillStyle = '#fff';
    g.fillRect(W / 2 - 1, m - 6, 2, H - m * 2 + 12);
    // Marcador
    g.font = '700 64px system-ui, sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'top';
    g.fillStyle = 'rgba(255,255,255,.16)';
    g.fillText(st.s[0], W / 2 - 80, 34);
    g.fillText(st.s[1], W / 2 + 80, 34);
    // Paletas (la mía se dibuja donde la tengo, sin esperar al anfitrión)
    for (const i of [0, 1]) {
      const y = i === seat ? myY : st.p[i];
      const x = i === 0 ? PAD_X : W - PAD_X;
      g.fillStyle = 'rgba(0,0,0,.25)';
      roundRect(g, x - PAD_W / 2 + 3, y - PAD_H / 2 + 4, PAD_W, PAD_H, 6); g.fill();
      g.fillStyle = COLORS[i];
      roundRect(g, x - PAD_W / 2, y - PAD_H / 2, PAD_W, PAD_H, 6); g.fill();
      g.fillStyle = 'rgba(255,255,255,.35)';
      roundRect(g, x - PAD_W / 2 + 2, y - PAD_H / 2 + 4, 3, PAD_H - 8, 2); g.fill();
    }
    // Nombres
    g.font = '600 15px system-ui, sans-serif';
    g.textBaseline = 'bottom';
    g.fillStyle = COLORS[0];
    g.textAlign = 'left';
    g.fillText(players[0]?.name || '', 26, H - 22);
    g.fillStyle = COLORS[1];
    g.textAlign = 'right';
    g.fillText(players[1]?.name || '🤖 CPU', W - 26, H - 22);
    // Pelota con sombra y un pequeño "rebote"
    const b = st.b;
    const hop = st.phase === 'play' ? Math.abs(Math.sin((b.x / W) * Math.PI * 2)) * 6 : 0;
    g.fillStyle = 'rgba(0,0,0,.3)';
    g.beginPath(); g.ellipse(b.x + 3, b.y + 5, BALL_R, BALL_R * 0.7, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#fff';
    g.beginPath(); g.arc(b.x, b.y - hop, BALL_R, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#ff9f1c';
    g.beginPath(); g.arc(b.x - 2, b.y - hop - 2, BALL_R * 0.35, 0, Math.PI * 2); g.fill();
    // Avisos
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    if (st.phase === 'serve') {
      g.font = '700 22px system-ui, sans-serif';
      g.fillStyle = '#fff';
      g.fillText(st.s[0] + st.s[1] === 0 ? `Primero en llegar a ${WIN}` : '¡Saque!', W / 2, H / 2 - 40);
      if (st.s[0] + st.s[1] === 0) drawCountdown(g, W / 2, H / 2 + 40, st.t, { size: 72 });
    }
    if (st.phase === 'over') {
      g.fillStyle = 'rgba(0,0,0,.55)';
      g.fillRect(0, 0, W, H);
      g.fillStyle = '#FFCC00';
      g.font = '800 40px system-ui, sans-serif';
      g.fillText(`🏆 ${players[st.winner]?.name || 'La computadora'} gana`, W / 2, H / 2 - 18);
      g.fillStyle = '#fff';
      g.font = '600 18px system-ui, sans-serif';
      g.fillText(`${st.s[0]} - ${st.s[1]}${seat >= 0 ? ' · Espacio o toca para revancha' : ''}`, W / 2, H / 2 + 26);
    }
  }

  // Física con paso fijo (igual en monitores de 60, 120 o 144 Hz); el dibujo va aparte
  function hostStep(dt) {
    if (seat >= 0) moveMine(dt);
    step(dt);
    sendAcc += dt;
    if (sendAcc >= 1 / 30) {
      sendAcc = 0;
      ctx.sendState(stamp({ ...st, b: { ...st.b }, p: [...st.p], s: [...st.s], snd: sounds.splice(0) }));
    }
  }
  function frame(dt) {
    if (!host) {
      if (seat >= 0) moveMine(dt);
      // estado interpolado (pelota y paletas suaves aunque los mensajes lleguen a saltos)
      const v = buf.state({ keys: ['b', 'p', 't'], jump: 160 });
      if (v) st = v;
      if (seat === 1) {
        sendAcc += dt;
        if (sendAcc >= 1 / 30) { sendAcc = 0; ctx.sendInput({ y: Math.round(myY) }); }
      }
    }
    cc.begin();
    const [sx, sy] = shake.offset(dt);
    g.save();
    g.translate(sx, sy);
    draw();
    parts.draw(g, dt);
    g.restore();
  }
  const loop = gameLoop({ step: host ? hostStep : null, frame, hz: 120 });
  ctx.status(seat < 0 ? 'Estás mirando la partida' : vsCpu ? 'Juegas contra la computadora. Si alguien más abre la mesa, entra como rival.' : '');

  return {
    destroy() {
      loop.stop();
      cc.destroy();
      window.removeEventListener('keydown', kd);
      window.removeEventListener('keyup', ku);
      canvas.removeEventListener('pointermove', pm);
      canvas.removeEventListener('pointerdown', pd);
    },
  };
}

export function roundRect(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}
