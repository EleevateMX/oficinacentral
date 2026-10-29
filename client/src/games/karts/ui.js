// Pantallas en HTML encima del juego: sala (pista, color, rivales y quién corre), resultados con la
// tabla y récords, menú de pausa y controles táctiles.
import './karts.css';
import { TRACKS, KART_COLORS, fmtTime, buildTrack } from '@shared/karts.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function drawPreview(c, T, color) {
  const g = c.getContext('2d');
  const W = c.width, H = c.height;
  g.clearRect(0, 0, W, H);
  const S = T.samples;
  let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
  for (const p of S) { x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x); z0 = Math.min(z0, p.z); z1 = Math.max(z1, p.z); }
  const sc = Math.min((W - 24) / (x1 - x0), (H - 24) / (z1 - z0));
  const ox = (W - (x1 - x0) * sc) / 2, oz = (H - (z1 - z0) * sc) / 2;
  const P = (p) => [ox + (p.x - x0) * sc, oz + (p.z - z0) * sc];
  g.lineJoin = 'round'; g.lineCap = 'round';
  const path = () => { g.beginPath(); S.forEach((p, i) => { const [x, y] = P(p); i ? g.lineTo(x, y) : g.moveTo(x, y); }); g.closePath(); };
  g.strokeStyle = 'rgba(255,255,255,.9)'; g.lineWidth = 9; path(); g.stroke();
  g.strokeStyle = '#2b2f3a'; g.lineWidth = 5; path(); g.stroke();
  for (let i = 1; i < S.length; i++) if (S[i].y > 0.6) { const a = P(S[i - 1]), b = P(S[i]); g.strokeStyle = color; g.lineWidth = 5; g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); g.stroke(); }
  const [sx, sy] = P(S[0]);
  g.fillStyle = '#fff'; g.fillRect(sx - 5, sy - 5, 10, 10); g.fillStyle = '#141414'; g.fillRect(sx - 5, sy - 5, 5, 5); g.fillRect(sx, sy, 5, 5);
}

export class KartsUI {
  constructor(stage, on) {
    this.on = on;
    this.root = document.createElement('div');
    this.root.className = 'kt-ui';
    stage.appendChild(this.root);
    this.key = '';
    this.root.addEventListener('click', (e) => {
      const b = e.target.closest('[data-act]');
      if (!b || b.disabled) return;
      e.preventDefault();
      const v = b.dataset.v;
      on[b.dataset.act]?.(v == null ? undefined : v);
    });
    // los controles no deben mover el mapa de la oficina
    this.root.addEventListener('keydown', (e) => e.stopPropagation());
    this.touchEl = null;
    this.touchState = { steer: 0, throttle: 0, brake: 0, drift: false, item: false };
  }

  render(view) {
    const key = JSON.stringify(view);
    if (key === this.key) return;
    this.key = key;
    if (!view) { this.root.innerHTML = ''; this.root.dataset.mode = ''; return; }
    // la animación de entrada solo cuando cambia de pantalla (no en cada actualización)
    this.root.classList.toggle('kt-enter', this.root.dataset.mode !== view.mode);
    this.root.dataset.mode = view.mode;
    if (view.mode === 'lobby') this.root.innerHTML = this.lobby(view);
    else if (view.mode === 'results') this.root.innerHTML = this.results(view);
    else if (view.mode === 'menu') this.root.innerHTML = this.menu(view);
    else this.root.innerHTML = '';
    for (const c of this.root.querySelectorAll('canvas[data-track]')) {
      const T = buildTrack(c.dataset.track);
      drawPreview(c, T, T.def.accent);
    }
  }

  lobby(v) {
    const tracks = TRACKS.map((t) => {
      const rec = v.records?.[t.id];
      return `<button class="kt-track ${v.track === t.id ? 'on' : ''}" data-act="track" data-v="${t.id}" ${v.isHost ? '' : 'disabled'} style="--tc:${t.accent}">
        <canvas data-track="${t.id}" width="220" height="120"></canvas>
        <span class="kt-track-name">${esc(t.name)}</span>
        <span class="kt-track-diff">${'●'.repeat(t.difficulty)}${'○'.repeat(3 - t.difficulty)} ${esc(t.diffLabel)}</span>
        <span class="kt-track-desc">${esc(t.desc)}</span>
        <span class="kt-track-rec">${rec ? `🏆 ${esc(rec.name)} · ${fmtTime(rec.ms / 1000)}` : 'Sin récord todavía'}</span>
      </button>`;
    }).join('');
    const colors = KART_COLORS.map((c, i) => `<button class="kt-color ${v.color === i ? 'on' : ''}" data-act="color" data-v="${i}" title="${esc(c.name)}" style="--kc:${c.body}" ${v.canPlay ? '' : 'disabled'}></button>`).join('');
    const bots = [0, 3, 5].map((n) => `<button class="kt-pill ${v.bots === n ? 'on' : ''}" data-act="bots" data-v="${n}" ${v.isHost ? '' : 'disabled'}>${n === 0 ? 'Sin bots' : `${n} bots`}</button>`).join('');
    const players = v.players.map((p) => `<li><span class="kt-dot" style="background:${p.color}"></span>${esc(p.name)}${p.host ? ' <em>anfitrión</em>' : ''}${p.me ? ' <em>tú</em>' : ''}</li>`).join('');
    const board = (v.board || []).map((r, i) => `<li class="${r.me ? 'me' : ''}"><span>${['🥇', '🥈', '🥉'][i] || `${i + 1}.`}</span><span class="flex1">${esc(r.name)}</span><b>${fmtTime(r.ms / 1000)}</b></li>`).join('') || '<li class="muted">Nadie ha corrido esta pista. ¡Pon el primer récord!</li>';
    return `<div class="kt-panel kt-lobby">
      <div class="kt-head">
        <div class="kt-logo">🏎️</div>
        <div><h2>Karts de oficina</h2><p>Carreras de mini karts por la oficina · 3 vueltas · de 1 a 8 personas</p></div>
      </div>
      <div class="kt-sec">Pista ${v.isHost ? '' : `<small>la escoge ${esc(v.hostName)}</small>`}</div>
      <div class="kt-tracks">${tracks}</div>
      <div class="kt-row">
        <div class="kt-col">
          <div class="kt-sec">Tu kart</div>
          <div class="kt-colors">${colors}</div>
          <div class="kt-sec">Rivales de la computadora</div>
          <div class="kt-pills">${bots}</div>
          <div class="kt-sec">En la sala (${v.players.length}/8)</div>
          <ul class="kt-players">${players}</ul>
        </div>
        <div class="kt-col">
          <div class="kt-sec">Mejores vueltas · ${esc(v.trackName)}</div>
          <ol class="kt-board">${board}</ol>
          <div class="kt-keys"><b>W/↑</b> acelerar · <b>S/↓</b> frenar · <b>A D</b> girar · <b>Shift/Espacio</b> derrapar · <b>E</b> objeto · <b>R</b> reaparecer · <b>C</b> cámara</div>
        </div>
      </div>
      <div class="kt-actions">
        <button class="kt-btn ghost" data-act="leave">Volver a la oficina</button>
        ${v.canJoin ? '<button class="kt-btn" data-act="join">Unirme a la carrera</button>' : ''}
        ${v.isHost ? '<button class="kt-btn primary big" data-act="start">¡Arrancar! 🏁</button>' : v.canPlay ? `<span class="kt-wait">Esperando a que ${esc(v.hostName)} arranque…</span>` : ''}
      </div>
    </div>`;
  }

  results(v) {
    const rows = v.rows.map((r) => `<tr class="${r.me ? 'me' : ''}"><td class="pos">${r.place}º</td><td><span class="kt-dot" style="background:${r.color}"></span>${esc(r.name)}${r.ai ? ' <em>bot</em>' : ''}</td><td>${r.dnf ? 'No terminó' : fmtTime(r.time)}</td><td>${fmtTime(r.best)}</td></tr>`).join('');
    const board = (v.board || []).slice(0, 5).map((r, i) => `<li class="${r.me ? 'me' : ''}"><span>${['🥇', '🥈', '🥉'][i] || `${i + 1}.`}</span><span class="flex1">${esc(r.name)}</span><b>${fmtTime(r.ms / 1000)}</b></li>`).join('') || '<li class="muted">Sin récords</li>';
    return `<div class="kt-panel kt-results">
      <div class="kt-head"><div class="kt-logo">🏁</div><div><h2>${esc(v.title)}</h2><p>${esc(v.trackName)}${v.newRecord ? ' · <b class="kt-new">¡Nuevo récord de vuelta!</b>' : ''}</p></div></div>
      <table class="kt-table"><thead><tr><th></th><th>Piloto</th><th>Tiempo</th><th>Mejor vuelta</th></tr></thead><tbody>${rows}</tbody></table>
      <div class="kt-sec">Récords de la pista</div>
      <ol class="kt-board">${board}</ol>
      <div class="kt-actions">
        <button class="kt-btn ghost" data-act="leave">Volver a la oficina</button>
        ${v.isHost ? '<button class="kt-btn" data-act="lobby">Cambiar pista</button><button class="kt-btn primary" data-act="again">Otra carrera</button>' : `<span class="kt-wait">Esperando a que ${esc(v.hostName)} siga…</span>`}
      </div>
    </div>`;
  }

  menu(v) {
    return `<div class="kt-panel kt-menu">
      <h2>Pausa</h2>
      <p class="muted">${v.multi ? 'La carrera sigue corriendo para los demás.' : 'La carrera sigue: ¡no te tardes!'}</p>
      <button class="kt-btn primary" data-act="resume">Seguir corriendo</button>
      <button class="kt-btn" data-act="respawn">Reaparecer en la pista (R)</button>
      <button class="kt-btn" data-act="camera">Cámara: ${esc(v.camera)} (C)</button>
      <button class="kt-btn" data-act="quality">Calidad: ${esc(v.quality)}</button>
      <button class="kt-btn" data-act="mute">${v.muted ? 'Activar sonido' : 'Silenciar'}</button>
      ${v.isHost ? '<button class="kt-btn" data-act="lobby">Terminar y volver a la sala</button>' : ''}
      <button class="kt-btn ghost" data-act="leave">Volver a la oficina</button>
    </div>`;
  }

  // Controles táctiles: girar a la izquierda / derecha, y acelerar, frenar, derrapar y objeto
  enableTouch(on) {
    if (!on || this.touchEl) return this.touchState;
    const el = document.createElement('div');
    el.className = 'kt-touch';
    el.innerHTML = `<div class="kt-tl"><button data-t="left">◀</button><button data-t="right">▶</button></div>
      <div class="kt-tr"><button data-t="item" class="sm">Objeto</button><button data-t="drift" class="sm">Derrape</button><button data-t="brake">Freno</button><button data-t="gas" class="gas">Acelerar</button></div>`;
    const held = new Map();
    const apply = () => {
      const s = this.touchState;
      const vals = [...held.values()];
      s.steer = (vals.includes('right') ? 1 : 0) - (vals.includes('left') ? 1 : 0);
      s.throttle = vals.includes('gas') ? 1 : 0;
      s.brake = vals.includes('brake') ? 1 : 0;
      s.drift = vals.includes('drift');
    };
    el.addEventListener('pointerdown', (e) => {
      const b = e.target.closest('[data-t]');
      if (!b) return;
      e.preventDefault();
      b.setPointerCapture?.(e.pointerId);
      if (b.dataset.t === 'item') { this.touchState.item = true; return; }
      held.set(e.pointerId, b.dataset.t); b.classList.add('on'); apply();
    });
    const up = (e) => { const t = held.get(e.pointerId); if (t) { held.delete(e.pointerId); el.querySelector(`[data-t="${t}"]`)?.classList.remove('on'); apply(); } };
    el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up);
    el.addEventListener('contextmenu', (e) => e.preventDefault());
    this.root.parentElement.appendChild(el);
    this.touchEl = el;
    return this.touchState;
  }
  showTouch(v) { if (this.touchEl) this.touchEl.style.display = v ? '' : 'none'; }

  destroy() { this.root.remove(); this.touchEl?.remove(); }
}
