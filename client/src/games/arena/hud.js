// HUD de la Arena (canvas 2D encima del 3D): marcador de arriba por modo, minimapa con compañeros
// y la zona, registro de bajas, indicadores de dónde te pegan, vida y chaleco, tablero de armas
// (el mismo de Zombies), "te eliminó…" con la cuenta para reaparecer y el marcador completo (Tab).
import { CELL } from '@shared/zombies.js';
import { ARMS } from '@shared/arsenal.js';
import { MODES, TEAM_COLORS, TEAM_NAMES, roundsToWin } from '@shared/arena.js';
import { drawCrosshair } from '../zombies/hud.js';
import {
  weaponCard, loadoutBar, energyMeter, abilities, dynamicCrosshair, scope, damageNumbers, ammoPrompts, weaponWheel, techScreen, slowMoTint,
  panel, txt, keycap, icon, font, PANEL, LINE, BODY,
} from '../zombies/weaponHud.js';

const PINK = '#FE3377', YEL = '#FFCC00', GREEN = '#7CFF4F', RED = '#ff4a5a', MUTE = '#97a2b5';
const fmtClock = (s) => { s = Math.max(0, Math.ceil(s)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };

export class ArenaHud {
  constructor() { this.buttons = []; this.mini = null; this.miniKey = ''; this.k = 1; }
  button(g, id, label, x, y, w, h, { primary = false } = {}) {
    const hot = this.hover && this.hover.x >= x && this.hover.x <= x + w && this.hover.y >= y && this.hover.y <= y + h;
    panel(g, x, y, w, h, { cut: 8, fill: primary ? (hot ? '#ff5a93' : PINK) : hot ? 'rgba(255,255,255,.22)' : 'rgba(18,21,40,.85)', stroke: primary ? null : LINE });
    txt(g, label, x + w / 2, y + h / 2 + 1, { size: 13, weight: 700, align: 'center', base: 'middle' });
    this.buttons.push({ id, x, y, w, h });
  }
  hit(x, y) { return this.buttons.find((b) => x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h)?.id || null; }

  draw(g, W, H, s) {
    this.buttons = [];
    g.clearRect(0, 0, W, H);
    const k = Math.min(1.25, Math.max(0.7, W / 1100));
    this.k = k;
    g.save();
    g.scale(k, k);
    W /= k; H /= k;
    this.vignette(g, W, H, s);
    techScreen(g, W, H, s);
    slowMoTint(g, W, H, s);
    scope(g, W, H, s);
    if (s.me?.alive && !s.killcam) dynamicCrosshair(g, W, H, s, drawCrosshair);
    this.dmgDirs(g, W, H, s);
    this.miniBottom = 60;
    this.topBar(g, W, H, s);
    if (s.showMinimap !== false) this.minimap(g, W, H, s);
    this.killFeed(g, W, H, s);
    if (s.me && s.me.alive) {
      this.health(g, W, H, s);
      if (s.arms) { abilities(g, W, H, s); energyMeter(g, W, H, s); loadoutBar(g, W, H, s); weaponCard(g, W, H, s); }
      ammoPrompts(g, W, H, s);
    }
    damageNumbers(g, W, H, s);
    this.popups(g, W, H, s);
    this.prompts(g, W, H, s);
    if (s.killcam) this.killcam(g, W, H, s);
    if (s.touch && s.view === 'play') this.touch(g, W, H, s);
    weaponWheel(g, W, H, s);
    if (s.countdown != null) this.countdown(g, W, H, s);
    if (s.scoreboard) this.scoreboard(g, W, H, s);
    g.restore();
    for (const b of this.buttons) { b.x *= k; b.y *= k; b.w *= k; b.h *= k; }
  }

  vignette(g, W, H, s) {
    if (s.hurt > 0) {
      const gr = g.createRadialGradient(W / 2, H / 2, H * 0.32, W / 2, H / 2, H * 0.85);
      gr.addColorStop(0, 'rgba(255,0,40,0)'); gr.addColorStop(1, `rgba(200,0,30,${Math.min(s.killcam ? 0.25 : 0.5, s.hurt)})`);
      g.fillStyle = gr; g.fillRect(0, 0, W, H);
    }
    if (s.lowHp) {
      const a = 0.16 + Math.sin(s.time * 6) * 0.07;
      const gr = g.createRadialGradient(W / 2, H / 2, H * 0.4, W / 2, H / 2, H * 0.9);
      gr.addColorStop(0, 'rgba(255,0,0,0)'); gr.addColorStop(1, `rgba(255,0,0,${a})`);
      g.fillStyle = gr; g.fillRect(0, 0, W, H);
    }
    // fuera de la zona: todo se ve oscuro y morado
    if (s.outside) {
      const a = 0.32 + Math.sin(s.time * 4) * 0.06;
      g.fillStyle = `rgba(30,6,60,${a})`; g.fillRect(0, 0, W, H);
    }
  }

  // Arcos rojos alrededor de la mira que señalan de dónde vino el golpe
  dmgDirs(g, W, H, s) {
    const cx = W / 2, cy = H / 2;
    for (const d of s.dmgDirs || []) {
      const a = Math.min(1, d.t * 1.4);
      g.save();
      g.translate(cx, cy); g.rotate(d.a);
      const r = 128;
      g.lineCap = 'round';
      g.strokeStyle = `rgba(0,0,0,${a * 0.4})`; g.lineWidth = 12;
      g.beginPath(); g.arc(0, 0, r, -Math.PI / 2 - 0.32, -Math.PI / 2 + 0.32); g.stroke();
      g.strokeStyle = `rgba(255,50,70,${a})`; g.lineWidth = 7; g.shadowColor = RED; g.shadowBlur = 12;
      g.beginPath(); g.arc(0, 0, r, -Math.PI / 2 - 0.3, -Math.PI / 2 + 0.3); g.stroke();
      g.fillStyle = `rgba(255,80,90,${a})`;
      g.beginPath(); g.moveTo(0, -r - 16); g.lineTo(-9, -r - 5); g.lineTo(9, -r - 5); g.fill();
      g.restore();
    }
  }

  // ---------- Marcador de arriba (según el modo) ----------
  topBar(g, W, H, s) {
    const M = MODES[s.mode] || MODES.ffa;
    const cx = W / 2, y = 12;
    if (M.teams) {
      const [a, b] = s.teamScore || [0, 0];
      const lim = s.cfg?.limit || 40;
      const mine = s.me?.team ?? 0;
      const w = 156;
      for (const t of [0, 1]) {
        const x = t === 0 ? cx - 74 - w : cx + 74;
        const col = TEAM_COLORS[t];
        panel(g, x, y, w, 46, { cut: 10, fill: 'rgba(10,12,24,.82)', stroke: t === mine ? col : LINE });
        g.fillStyle = col; g.fillRect(t === 0 ? x + w - 4 : x, y + 6, 4, 34);
        txt(g, `${TEAM_NAMES[t].toUpperCase()}${t === mine ? ' · TÚ' : ''}`, t === 0 ? x + 12 : x + w - 12, y + 18, { size: 10, weight: 700, color: col, align: t === 0 ? 'left' : 'right', track: 1.5 });
        txt(g, String(t === 0 ? a : b), t === 0 ? x + w - 14 : x + 14, y + 38, { size: 28, weight: 700, color: '#fff', align: t === 0 ? 'right' : 'left' });
        const kk = Math.min(1, (t === 0 ? a : b) / lim);
        g.fillStyle = 'rgba(255,255,255,.1)'; g.fillRect(x + 12, y + 38, w - 70, 4);
        g.fillStyle = col; g.fillRect(t === 0 ? x + 12 + (w - 70) * (1 - kk) : x + 58, y + 38, (w - 70) * kk, 4);
      }
      this.clock(g, cx, y, s, `A ${lim}`);
    } else if (M.rounds) {
      const need = roundsToWin(s.cfg?.limit || 5);
      const duel = (s.board || []).filter((p) => s.duel?.includes(p.seat));
      duel.forEach((p, i) => {
        const w = 190, x = i === 0 ? cx - 74 - w : cx + 74;
        panel(g, x, y, w, 46, { cut: 10, stroke: p.me ? p.color : LINE });
        g.fillStyle = p.color; g.fillRect(i === 0 ? x + w - 4 : x, y + 6, 4, 34);
        txt(g, p.name.toUpperCase(), i === 0 ? x + 12 : x + w - 12, y + 20, { size: 12, weight: 700, color: '#fff', align: i === 0 ? 'left' : 'right' });
        for (let r = 0; r < need; r++) {
          const on = r < (s.roundWins?.[p.seat] || 0);
          const px = i === 0 ? x + 14 + r * 18 : x + w - 26 - r * 18;
          g.fillStyle = on ? p.color : 'rgba(255,255,255,.12)';
          g.beginPath(); g.moveTo(px + 6, y + 28); g.lineTo(px + 12, y + 34); g.lineTo(px + 6, y + 40); g.lineTo(px, y + 34); g.fill();
        }
      });
      this.clock(g, cx, y, s, `RONDA ${s.round || 1}`);
    } else if (M.royale) {
      const w = 150;
      panel(g, cx - 74 - w, y, w, 46, { cut: 10 });
      txt(g, 'QUEDAN', cx - 74 - w + 12, y + 18, { size: 10, weight: 700, color: MUTE, track: 2 });
      txt(g, String(s.aliveCount ?? 0), cx - 74 - 14, y + 38, { size: 28, weight: 700, color: YEL, align: 'right' });
      txt(g, '◉', cx - 74 - w + 14, y + 38, { size: 16, color: '#fff' });
      const z = s.zone;
      panel(g, cx + 74, y, 230, 46, { cut: 10, stroke: z?.shrinking ? '#b06cff' : LINE });
      txt(g, 'LA ZONA', cx + 86, y + 18, { size: 10, weight: 700, color: '#d4b2ff', track: 2 });
      const msg = !z ? '—' : z.phase >= 5 ? 'Se apagó todo' : z.shrinking ? `Se apaga · ${fmtClock(z.next)}` : `Se cierra en ${fmtClock(z.next)}`;
      txt(g, msg, cx + 86, y + 38, { size: 15, weight: 700, color: z?.shrinking ? '#e3ccff' : '#fff' });
      this.clock(g, cx, y, s, s.me?.alive ? 'SOBREVIVE' : 'FUERA');
    } else {
      // todos contra todos: tú y el primer lugar
      const lim = s.cfg?.limit || 20;
      const list = s.board || [];
      const me = list.find((p) => p.me);
      const lead = list.find((p) => !p.me) && (list[0]?.me ? list[1] : list[0]);
      const box = (x, label, p, col) => {
        const w = 156;
        panel(g, x, y, w, 46, { cut: 10, stroke: p?.me ? col : LINE });
        g.fillStyle = col; g.fillRect(x, y + 6, 4, 34);
        txt(g, label, x + 12, y + 18, { size: 10, weight: 700, color: col, track: 1.5 });
        txt(g, p ? String(p.kills) : '—', x + w - 12, y + 38, { size: 28, weight: 700, align: 'right' });
        txt(g, p ? p.name : '', x + 12, y + 37, { size: 12, weight: 700, color: '#dfe5ee', fam: BODY });
      };
      box(cx - 74 - 156, 'TÚ', me, me?.color || PINK);
      box(cx + 74, list[0]?.me ? '2º LUGAR' : '1er LUGAR', lead, lead?.color || YEL);
      this.clock(g, cx, y, s, `A ${lim}`);
    }
  }
  clock(g, cx, y, s, sub) {
    panel(g, cx - 66, y, 132, 46, { cut: 10, fill: 'rgba(10,12,24,.9)', accent: PINK });
    const t = s.clock != null && (s.cfg?.time || MODES[s.mode]?.rounds) ? fmtClock(s.clock) : '∞';
    const low = s.clock != null && s.clock < 30 && s.cfg?.time;
    txt(g, t, cx, y + 27, { size: 22, weight: 700, align: 'center', color: low ? (Math.sin(s.time * 8) > 0 ? RED : '#fff') : '#fff' });
    txt(g, sub, cx, y + 41, { size: 9, weight: 700, align: 'center', color: MUTE, track: 2 });
  }

  // ---------- Minimapa ----------
  minimap(g, W, H, s) {
    const L = s.level;
    if (!L) return;
    const c = Math.min(4, 170 / L.W, 120 / L.H);
    const mw = L.W * c, mh = L.H * c;
    const x0 = W - mw - 14, y0 = 70;
    const key = `${L.map}:${L.W}x${L.H}:${c}`;
    if (this.miniKey !== key) {
      this.miniKey = key;
      this.mini = document.createElement('canvas');
      this.mini.width = Math.ceil(mw); this.mini.height = Math.ceil(mh);
      const m = this.mini.getContext('2d');
      for (let y = 0; y < L.H; y++) for (let x = 0; x < L.W; x++) {
        const v = L.grid[y * L.W + x];
        m.fillStyle = v === CELL.EMPTY ? 'rgba(255,255,255,.07)' : v === CELL.SOLID ? (L.tall?.[y * L.W + x] ? 'rgba(255,255,255,.34)' : 'rgba(255,255,255,.18)') : v === CELL.GLASS ? 'rgba(160,210,255,.45)' : 'rgba(255,255,255,.55)';
        m.fillRect(x * c, y * c, c, c);
      }
    }
    panel(g, x0 - 7, y0 - 7, mw + 14, mh + 14, { cut: 8, fill: 'rgba(8,10,20,.62)' });
    this.miniBottom = y0 + mh + 8;
    g.drawImage(this.mini, x0, y0);
    const mm = s.mini || {};
    g.save();
    g.beginPath(); g.rect(x0, y0, mw, mh); g.clip();
    // la zona y la que sigue
    if (mm.zone) {
      const z = mm.zone;
      g.fillStyle = 'rgba(60,10,110,.45)';
      g.beginPath(); g.rect(x0, y0, mw, mh); g.arc(x0 + z.x * c, y0 + z.y * c, Math.max(0, z.r * c), 0, Math.PI * 2, true); g.fill('evenodd');
      g.strokeStyle = '#b06cff'; g.lineWidth = 1.5; g.beginPath(); g.arc(x0 + z.x * c, y0 + z.y * c, Math.max(0, z.r * c), 0, Math.PI * 2); g.stroke();
      if (z.to && z.to.r < z.r - 0.1) { g.strokeStyle = 'rgba(255,255,255,.8)'; g.setLineDash([3, 3]); g.beginPath(); g.arc(x0 + z.to.x * c, y0 + z.to.y * c, Math.max(0, z.to.r * c), 0, Math.PI * 2); g.stroke(); g.setLineDash([]); }
    }
    for (const p of mm.pickups || []) {
      g.fillStyle = p.kind === 'health' ? '#ff7ab6' : p.kind === 'armor' ? '#4FD8FF' : p.kind === 'ammo' ? YEL : GREEN;
      g.fillRect(x0 + p.x * c - 1.5, y0 + p.y * c - 1.5, 3, 3);
    }
    // enemigos que dispararon hace poco (punto rojo que se apaga)
    for (const e of mm.enemies || []) {
      g.globalAlpha = Math.min(1, e.t);
      g.fillStyle = RED; g.beginPath(); g.arc(x0 + e.x * c, y0 + e.y * c, 3, 0, Math.PI * 2); g.fill();
    }
    g.globalAlpha = 1;
    const arrow = (p, col, r = 5) => {
      g.save(); g.translate(x0 + p.x * c, y0 + p.y * c); g.rotate(p.a);
      g.fillStyle = col; g.strokeStyle = 'rgba(0,0,0,.6)'; g.lineWidth = 1;
      g.beginPath(); g.moveTo(r + 1, 0); g.lineTo(-r * 0.7, -r * 0.75); g.lineTo(-r * 0.3, 0); g.lineTo(-r * 0.7, r * 0.75); g.closePath(); g.fill(); g.stroke();
      g.restore();
    };
    for (const p of mm.mates || []) arrow(p, p.color, 4.5);
    if (mm.me) {
      // cono de vista
      g.fillStyle = 'rgba(255,255,255,.12)';
      g.beginPath(); g.moveTo(x0 + mm.me.x * c, y0 + mm.me.y * c); g.arc(x0 + mm.me.x * c, y0 + mm.me.y * c, 26, mm.me.a - 0.6, mm.me.a + 0.6); g.fill();
      arrow(mm.me, '#fff', 5.5);
    }
    g.restore();
    txt(g, (s.levelName || '').toUpperCase(), x0, y0 - 12, { size: 9, weight: 700, color: MUTE, track: 2 });
  }

  // ---------- Registro de bajas ----------
  killFeed(g, W, H, s) {
    let y = (this.miniBottom || 60) + 10;
    for (const f of (s.killFeed || []).slice(-6)) {
      g.globalAlpha = Math.max(0, Math.min(1, f.t));
      font(g, 12, 800, BODY);
      const kw = g.measureText(f.killer).width, vw = g.measureText(f.victim).width;
      const w = kw + vw + (f.hd ? 96 : 76);
      const x = W - 14 - w;
      panel(g, x, y, w, 26, { cut: 6, fill: f.me ? 'rgba(80,14,40,.82)' : f.victimMe ? 'rgba(60,8,12,.82)' : PANEL, stroke: f.me ? 'rgba(254,51,119,.7)' : LINE });
      txt(g, f.killer, x + 10, y + 17, { size: 12, weight: 800, color: f.kc, fam: BODY });
      if (f.w >= 0 && ARMS[f.w]) icon(g, ARMS[f.w].id, x + 14 + kw, y + 1, 40, 24);
      else txt(g, f.zone ? '◎' : '✦', x + 28 + kw, y + 18, { size: 13, color: '#d4b2ff' });
      if (f.hd) { g.fillStyle = YEL; g.beginPath(); g.arc(x + kw + 64, y + 13, 6, 0, Math.PI * 2); g.fill(); txt(g, '✕', x + kw + 64, y + 14, { size: 9, color: '#141414', align: 'center', base: 'middle' }); }
      txt(g, f.victim, x + w - 10, y + 17, { size: 12, weight: 800, color: f.vc, align: 'right', fam: BODY });
      y += 30;
    }
    g.globalAlpha = 1;
  }

  // ---------- Vida y chaleco ----------
  health(g, W, H, s) {
    const P = s.me;
    const x = 14, y = H - 86, w = 280, h = 72;
    panel(g, x, y, w, h, { cut: 14, accent: P.hp > 40 ? GREEN : RED });
    txt(g, String(Math.max(0, Math.ceil(P.hp))), x + 18, y + 48, { size: 38, weight: 700, color: P.hp > 40 ? '#fff' : RED, shadow: P.hp > 40 ? 0 : 10 });
    txt(g, 'VIDA', x + 18, y + 64, { size: 9, weight: 700, color: MUTE, track: 2 });
    const bx = x + 96, bw = w - 112;
    const segs = 10, sg = (bw - (segs - 1) * 3) / segs;
    for (let i = 0; i < segs; i++) {
      const f = Math.max(0, Math.min(1, (P.hp / 100) * segs - i));
      g.fillStyle = 'rgba(255,255,255,.1)'; g.fillRect(bx + i * (sg + 3), y + 22, sg, 12);
      if (f > 0) { g.fillStyle = P.hp > 40 ? '#4cd964' : '#ff4d4d'; g.fillRect(bx + i * (sg + 3), y + 22, sg * f, 12); }
    }
    // chaleco
    icon(g, 'armor', bx - 2, y + 40, 20, 20, P.armor > 0 ? 1 : 0.35);
    g.fillStyle = 'rgba(255,255,255,.1)'; g.fillRect(bx + 22, y + 46, bw - 22, 8);
    if (P.armor > 0) { g.fillStyle = '#4FD8FF'; g.shadowColor = '#4FD8FF'; g.shadowBlur = 6; g.fillRect(bx + 22, y + 46, (bw - 22) * Math.min(1, P.armor / 100), 8); g.shadowBlur = 0; }
    txt(g, P.armor > 0 ? `CHALECO ${Math.ceil(P.armor)}` : 'SIN CHALECO', bx + 22, y + 66, { size: 9, weight: 700, color: P.armor > 0 ? '#9fe3ff' : MUTE, track: 1.5 });
    if (P.streak >= 2) txt(g, `RACHA ×${P.streak}`, x + w - 12, y + 16, { size: 10, weight: 700, color: YEL, align: 'right', track: 1.5 });
  }

  popups(g, W, H, s) {
    const list = s.popups || [];
    for (const [i, p] of list.entries()) {
      const a = Math.min(1, p.t * 2);
      g.globalAlpha = a;
      txt(g, p.text, W / 2, H / 2 + 112 + (list.length - 1 - i) * -22 + (1 - p.t) * 6, { size: p.big ? 18 : 14, weight: 700, color: p.color || YEL, align: 'center', shadow: 8, track: 1 });
    }
    g.globalAlpha = 1;
  }

  prompts(g, W, H, s) {
    const lines = [];
    if (s.me?.alive && s.me.prot) lines.push(['🛡 PROTECCIÓN · disparar la quita', '#9fe3ff']);
    if (s.spectating) lines.push([`👀 Mirando a ${s.spectating}${s.waiting ? ' · entras en la siguiente' : ''} · clic para cambiar`, '#fff']);
    if (s.outside) lines.push(['⚠ ESTÁS FUERA DE LA ZONA · ¡regresa a la luz!', '#e3ccff']);
    let y = H - 150;
    for (const [t, c] of lines) {
      font(g, 13, 700);
      const w = g.measureText(t).width + 32;
      panel(g, W / 2 - w / 2, y - 21, w, 30, { cut: 7 });
      txt(g, t, W / 2, y - 1, { size: 13, weight: 700, align: 'center', color: c, track: 0.5 });
      y -= 38;
    }
    if (s.joinable) this.button(g, 'join', 'UNIRSE A LA PARTIDA', W / 2 - 120, H - 70, 240, 44, { primary: true });
  }

  // ---------- Te eliminó… ----------
  killcam(g, W, H, s) {
    const K = s.killcam;
    const a = Math.min(1, K.t * 3);
    g.globalAlpha = a;
    // franjas de cine
    g.fillStyle = 'rgba(0,0,0,.55)'; g.fillRect(0, 0, W, 54); g.fillRect(0, H - 54, W, 54);
    const w = 420, h = 132, x = W / 2 - w / 2, y = H - 54 - h - 26;
    panel(g, x, y, w, h, { cut: 16, fill: 'rgba(14,8,18,.9)', stroke: 'rgba(255,74,90,.6)', accent: RED });
    txt(g, K.self ? 'CAÍSTE' : K.zone ? 'TE ALCANZÓ LA ZONA' : 'TE ELIMINÓ', x + 20, y + 26, { size: 11, weight: 700, color: '#ff9aa6', track: 3 });
    if (K.face) { g.imageSmoothingEnabled = false; g.drawImage(K.face, x + 20, y + 38, 54, 54); g.imageSmoothingEnabled = true; g.strokeStyle = K.color; g.lineWidth = 2; g.strokeRect(x + 20, y + 38, 54, 54); }
    const nx = K.face ? x + 88 : x + 20;
    txt(g, K.name || '—', nx, y + 62, { size: 24, weight: 700, color: K.color || '#fff' });
    const sub = [K.level ? `Nv ${K.level}` : null, K.dist != null ? `${Math.round(K.dist * 1.25)} m` : null, K.hp != null ? `le quedó ${K.hp} de vida` : null].filter(Boolean).join(' · ');
    txt(g, sub, nx, y + 84, { size: 12, weight: 600, color: MUTE, fam: BODY });
    if (K.w >= 0 && ARMS[K.w]) { icon(g, ARMS[K.w].id, x + w - 120, y + 34, 100, 60); txt(g, ARMS[K.w].short.toUpperCase(), x + w - 70, y + 104, { size: 10, weight: 700, color: '#cfd6e2', align: 'center', track: 1.5 }); }
    if (K.hd) { panel(g, nx, y + 94, 118, 22, { cut: 5, fill: 'rgba(255,204,0,.18)', stroke: YEL }); txt(g, '✕ A LA CABEZA', nx + 59, y + 109, { size: 11, weight: 700, color: YEL, align: 'center', track: 1 }); }
    // reaparecer
    if (K.respawn != null) {
      const total = K.respawnMax || 3.2;
      const kk = 1 - Math.max(0, K.respawn) / total;
      g.fillStyle = 'rgba(255,255,255,.12)'; g.fillRect(x + 20, y + h - 10, w - 40, 4);
      g.fillStyle = PINK; g.fillRect(x + 20, y + h - 10, (w - 40) * kk, 4);
      txt(g, K.respawn > 0 ? `Reapareces en ${Math.ceil(K.respawn)}` : 'Reapareciendo…', W / 2, y - 14, { size: 15, weight: 700, align: 'center', color: '#fff', shadow: 6 });
    } else if (K.note) txt(g, K.note, W / 2, y - 14, { size: 15, weight: 700, align: 'center', color: '#fff', shadow: 6 });
    g.globalAlpha = 1;
  }

  countdown(g, W, H, s) {
    const t = s.countdown;
    const n = Math.ceil(t);
    if (t <= -0.8) return;
    const label = n > 0 ? String(n) : '¡A JUGAR!';
    const frac = n > 0 ? t - Math.floor(t) : 1 + t / 0.8;
    g.save();
    g.translate(W / 2, H * 0.36);
    const sc = 0.75 + 0.45 * Math.max(0, frac);
    g.scale(sc, sc);
    g.globalAlpha = Math.max(0, Math.min(1, n > 0 ? 0.35 + frac : frac));
    txt(g, label, 0, 0, { size: n > 0 ? 92 : 64, weight: 700, align: 'center', base: 'middle', color: n > 0 ? '#fff' : YEL, shadow: 24 });
    g.restore();
    if (s.countdownSub) txt(g, s.countdownSub, W / 2, H * 0.36 + 70, { size: 14, weight: 700, align: 'center', color: '#dfe5ee', track: 3 });
  }

  // ---------- Marcador completo (mantén Tab) ----------
  scoreboard(g, W, H, s) {
    const M = MODES[s.mode] || MODES.ffa;
    const list = s.board || [];
    g.fillStyle = 'rgba(4,5,12,.55)'; g.fillRect(0, 0, W, H);
    const w = Math.min(860, W - 40);
    const teams = M.teams ? [0, 1] : [null];
    const rowH = 34;
    const rowsPer = teams.map((t) => list.filter((p) => t == null || p.team === t));
    const h = 92 + rowsPer.reduce((a, r) => a + 34 + r.length * (rowH + 3), 0);
    const x = W / 2 - w / 2, y = Math.max(20, H / 2 - h / 2);
    panel(g, x, y, w, h, { cut: 18, fill: 'rgba(12,14,28,.94)', accent: PINK });
    txt(g, M.name.toUpperCase(), x + 22, y + 32, { size: 18, weight: 700, track: 2 });
    txt(g, `${s.levelName || ''} · ${M.teams ? `A ${s.cfg?.limit}` : M.rounds ? `Al mejor de ${s.cfg?.limit}` : M.royale ? `Quedan ${s.aliveCount}` : `A ${s.cfg?.limit} bajas`}`, x + 22, y + 52, { size: 11, weight: 600, color: MUTE, fam: BODY });
    if (s.clock != null && s.cfg?.time) txt(g, fmtClock(s.clock), x + w - 22, y + 36, { size: 22, weight: 700, align: 'right', color: '#fff' });
    const cols = M.royale ? [['LUGAR', 'place'], ['BAJAS', 'kills'], ['DAÑO', 'dmg'], ['CABEZA', 'hs']] : [['BAJAS', 'kills'], ['MUERTES', 'deaths'], ['ASIST.', 'assists'], ['K/D', 'kd'], ['CABEZA', 'hs'], ['DAÑO', 'dmg']];
    let cy = y + 72;
    teams.forEach((t, ti) => {
      const rows = rowsPer[ti];
      const col = t == null ? PINK : TEAM_COLORS[t];
      g.fillStyle = col; g.fillRect(x + 18, cy + 6, 4, 18);
      txt(g, t == null ? 'JUGADORES' : `EQUIPO ${TEAM_NAMES[t].toUpperCase()}`, x + 30, cy + 20, { size: 11, weight: 700, color: col, track: 2 });
      if (t != null) txt(g, String(s.teamScore?.[t] ?? 0), x + 30 + 150, cy + 21, { size: 16, weight: 700, color: '#fff' });
      const cw = 74;
      cols.forEach(([l], i) => txt(g, l, x + w - 22 - (cols.length - 1 - i) * cw, cy + 20, { size: 9, weight: 700, color: MUTE, align: 'right', track: 1.5 }));
      cy += 30;
      rows.forEach((p, i) => {
        const ry = cy + i * (rowH + 3);
        g.fillStyle = p.me ? 'rgba(254,51,119,.16)' : i % 2 ? 'rgba(255,255,255,.035)' : 'rgba(255,255,255,.06)';
        g.fillRect(x + 18, ry, w - 36, rowH);
        g.fillStyle = p.color; g.fillRect(x + 18, ry, 3, rowH);
        txt(g, String(i + 1), x + 34, ry + 22, { size: 12, weight: 700, color: MUTE, align: 'center' });
        const face = s.faceOf?.(p);
        if (face) { g.imageSmoothingEnabled = false; g.drawImage(face, x + 48, ry + 4, 26, 26); g.imageSmoothingEnabled = true; }
        if (p.level) { panel(g, x + 80, ry + 8, 38, 18, { cut: 4, fill: 'rgba(255,204,0,.14)', stroke: 'rgba(255,204,0,.5)' }); txt(g, `Nv${p.level}`, x + 99, ry + 21, { size: 10, weight: 700, color: YEL, align: 'center' }); }
        txt(g, p.name + (p.bot ? '' : ''), x + 126, ry + 22, { size: 13, weight: 800, color: p.alive || M.respawn ? '#fff' : '#8a93a5', fam: BODY });
        if (p.bot) { font(g, 13, 800, BODY); const nw = g.measureText(p.name).width; panel(g, x + 132 + nw, ry + 9, 34, 16, { cut: 4, fill: 'rgba(156,190,217,.15)', stroke: 'rgba(156,190,217,.4)' }); txt(g, 'BOT', x + 149 + nw, ry + 21, { size: 9, weight: 700, color: '#9CBED9', align: 'center' }); }
        if (p.host && !p.bot) { font(g, 13, 800, BODY); txt(g, '★', x + 132 + g.measureText(p.name).width, ry + 22, { size: 12, color: YEL }); }
        if (!p.alive && !M.respawn && s.phase === 'live') txt(g, '☠', x + w - 22 - cols.length * cw - 4, ry + 22, { size: 13, color: '#ff8090', align: 'right' });
        cols.forEach(([, k], ci) => {
          const v = k === 'kd' ? (p.deaths ? (p.kills / p.deaths).toFixed(2) : p.kills.toFixed(2)) : k === 'place' ? (p.place ? `#${p.place}` : p.alive ? 'vivo' : '—') : String(Math.round(p[k] || 0));
          txt(g, v, x + w - 22 - (cols.length - 1 - ci) * cw, ry + 22, { size: 13, weight: 700, color: ci === 0 ? '#fff' : '#cfd6e2', align: 'right' });
        });
      });
      cy += rows.length * (rowH + 3) + 4;
    });
    if (s.phase !== 'round') txt(g, 'SUELTA TAB PARA VOLVER', W / 2, y + h + 22, { size: 10, weight: 700, color: '#cfd6e2', align: 'center', track: 2 });
  }

  touch(g, W, H, s) {
    const T = s.touch;
    g.globalAlpha = 0.5;
    g.fillStyle = 'rgba(255,255,255,.12)'; g.beginPath(); g.arc(115, H - 135, 75, 0, Math.PI * 2); g.fill();
    g.globalAlpha = 0.8;
    g.fillStyle = 'rgba(255,255,255,.35)'; g.beginPath(); g.arc(115 + (T.sx || 0) * 45, H - 135 + (T.sy || 0) * 45, 28, 0, Math.PI * 2); g.fill();
    g.globalAlpha = 1;
    this.button(g, 'fire', s.arms?.sword ? '⚔' : '🔫', W - 150, H - 210, 110, 110, { primary: true });
    this.button(g, 'ads', '◎', W - 150, H - 310, 60, 60);
    this.button(g, 'reload', 'R', W - 230, H - 150, 60, 60);
    this.button(g, 'swap', '⇄', W - 230, H - 230, 60, 60);
    this.button(g, 'crouch', '▼', W - 300, H - 150, 60, 60);
    if (s.arms?.hasSword) this.button(g, 'tech', 'Q', W - 230, H - 310, 60, 60, { primary: s.arms.techReady });
    this.button(g, 'board', '≡', W - 66, 64, 50, 40);
    this.button(g, 'menu', '☰', W - 66, 112, 50, 40);
  }
}
export { keycap };
