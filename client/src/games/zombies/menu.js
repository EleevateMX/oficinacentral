// Menús de Zombies en la oficina (HTML encima del 3D): menú principal y sala del escuadrón,
// pausa, tienda, fin de la partida, opciones, controles, récords y anuncios de horda y jefe.
// No decide nada del juego: index.js le pasa un "modelo" cada cuadro y recibe acciones.
import './menu.css';
import { WEAPONS, SHOP, BOSSES, ZOMBIE_TYPES } from '@shared/zombies.js';
import { itemCost } from './sim.js';
import { iconCanvas } from './icons.js';
import { drawCrosshair } from './hud.js';
import { CROSS_STYLES, CROSS_COLORS, DEFAULTS } from './options.js';
import { drawAvatarFace, drawAvatarPreview } from '../../lib/render.js';
import { api } from '../../lib/api.js';

const SEAT_COLORS = ['#FE3377', '#3a86ff', '#FFCC00', '#2bb673'];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const fmt = (n) => Math.round(n || 0).toLocaleString('es-MX');
const plural = (n, a, b) => `${n} ${n === 1 ? a : b}`;
const SHOP_ICON = { ammo: 'ammo', heal: 'heal', armor: 'armor', cafetera: 'cafetera', clavadora: 'clavadora', upgrade: 'upgrade' };

// Fuente del menú (una sola vez; si no carga, se usa la del sistema)
function ensureFont() {
  if (typeof document === 'undefined' || document.getElementById('zm-font')) return;
  const l = document.createElement('link');
  l.id = 'zm-font'; l.rel = 'stylesheet';
  l.href = 'https://fonts.googleapis.com/css2?family=Oxanium:wght@300;400;600;700&display=swap';
  document.head.appendChild(l);
}

const kbd = (k) => `<kbd class="zm-kbd">${k}</kbd>`;

export class ZMenu {
  // deps: { actions, avatarOf(uid), nameOf(uid), me (uid), touch }
  constructor(stage, deps) {
    ensureFont();
    this.d = deps;
    this.a = deps.actions;
    this.root = document.createElement('div');
    this.root.className = 'zm-root';
    this.screenEl = document.createElement('div');
    this.screenEl.className = 'zm-screen-host';
    this.bannerEl = document.createElement('div');
    this.bannerEl.className = 'zm-banners';
    this.root.append(this.screenEl, this.bannerEl);
    stage.appendChild(this.root);
    this.screen = null;
    this.sel = 0; // elemento elegido del menú de la izquierda
    this.panel = null; // panel abierto a la derecha
    this.focus = 'menu'; // 'menu' | 'panel'
    this.prow = 0; // fila elegida dentro del panel
    this.ctab = deps.touch ? 'touch' : 'kb';
    this.records = null;
    this.m = null;
    this.pad = { up: false, down: false, a: false, b: false };
    this.loadRecords();
    this.onClick = (e) => this.click(e);
    this.onOver = (e) => this.hover(e);
    this.onInput = (e) => this.input(e);
    this.root.addEventListener('click', this.onClick);
    this.root.addEventListener('mouseover', this.onOver);
    this.root.addEventListener('input', this.onInput);
    // que los clics del menú no lleguen al juego (disparar / fijar el mouse)
    this.root.addEventListener('mousedown', (e) => e.stopPropagation());
    this.root.addEventListener('touchstart', (e) => e.stopPropagation(), { passive: true });
    this.root.addEventListener('wheel', (e) => e.stopPropagation(), { passive: true });
  }

  loadRecords() {
    return api.get('/games/zombies/top').then((r) => { this.records = { top: r.top || [], me: r.me || null }; this.dirty(); return this.records; }).catch(() => null);
  }
  setRecords(r) { if (r?.top) { this.records = { top: r.top, me: r.me || null }; this.dirty(); } }
  dirty() { for (const el of this.root.querySelectorAll('[data-region]')) el._key = null; }

  layout(left, top, w, h) {
    Object.assign(this.root.style, { left: `${left}px`, top: `${top}px`, width: `${w}px`, height: `${h}px` });
    const fs = Math.max(10.5, Math.min(16, h / 45, w / 26));
    this.root.style.fontSize = `${fs.toFixed(2)}px`;
    this.root.classList.toggle('zm-narrow', w < 700 || w < h);
  }

  // ---------- Modelo y dibujo ----------
  update(m) {
    this.m = m;
    if (m.screen !== this.screen) this.mount(m.screen);
    this.root.classList.toggle('zm-active', !!m.screen && m.screen !== 'hud');
    if (this.root.dataset.screen !== (m.screen || '')) this.root.dataset.screen = m.screen || '';
    if (!m.screen) return;
    if (m.screen === 'shop') { this.region('shop', () => this.shopKey(), () => this.renderShop()); this.tickShop(); return; }
    const items = this.items();
    this.lastItems = items;
    if (this.sel >= items.length || items[this.sel]?.disabled) this.sel = Math.max(0, items.findIndex((it) => !it.disabled));
    // en la sala con más gente, se abre sola la sala del escuadrón
    if (m.screen === 'main' && m.mode === 'lobby' && m.count > 1 && !this.autoSquad) { this.autoSquad = true; if (!this.panel) this.openPanel('squad', false); }
    this.region('menu', () => JSON.stringify([items.map((i) => [i.id, i.label, i.sub, i.disabled, i.primary, i.gap]), this.sel, this.focus, this.panel]), () => this.renderMenu(items));
    this.region('status', () => this.statusText(), () => `<span class="zm-dot"></span>${esc(this.statusText())}`);
    this.region('party', () => this.partyKey(), () => this.renderParty());
    this.region('panel', () => this.panelKey(), () => this.renderPanel());
    this.region('head', () => this.headKey(), () => this.renderHead());
    this.pollPad();
  }

  region(name, keyFn, renderFn) {
    const el = this.screenEl.querySelector(`[data-region="${name}"]`);
    if (!el) return;
    const k = keyFn();
    if (el._key === k) return;
    el._key = k;
    el.innerHTML = renderFn();
    this.paintCanvases(el);
  }

  mount(screen) {
    this.screen = screen;
    this.sel = 0; this.focus = 'menu'; this.prow = 0; this.panel = null;
    if (screen === 'main') this.autoSquad = false;
    if (!screen || screen === 'hud') { this.screenEl.innerHTML = ''; return; }
    const cls = { main: 'zm-main', pause: 'zm-pause', over: 'zm-over', shop: 'zm-shopscreen' }[screen];
    if (screen === 'shop') {
      this.screenEl.innerHTML = `<div class="zm-screen ${cls}"><div data-region="shop"></div></div>`;
      return;
    }
    const touch = this.d.touch;
    this.screenEl.innerHTML = `
      <div class="zm-screen ${cls}">
        <div class="zm-shade"></div>
        <div class="zm-vline"></div>
        <div class="zm-left">
          <div class="zm-head" data-region="head"></div>
          <nav class="zm-menu" data-region="menu" role="menu"></nav>
          <div class="zm-status" data-region="status"></div>
        </div>
        <aside class="zm-party" data-region="party"></aside>
        <section class="zm-panelwrap" data-region="panel"></section>
        <footer class="zm-keys">
          ${touch ? '<span>Toca una opción para elegirla</span>' : `<span>${kbd('↵')} Seleccionar</span><span>${kbd('Esc')} Atrás</span><span>${kbd('↑')}${kbd('↓')} Moverte</span>${screen === 'main' ? `<span>${kbd('Tab')} Escuadrón</span>` : ''}`}
          <span class="zm-ver">HUB · Zombies en la oficina</span>
        </footer>
      </div>`;
  }

  headKey() { const m = this.m; return `${m.screen}|${m.mode}|${m.wave}|${m.solo}|${m.fresh}|${m.summary?.wave}`; }
  renderHead() {
    const m = this.m;
    if (m.screen === 'pause') {
      return `<div class="zm-kicker">${m.fresh ? '¡Ya empezó!' : 'Zombies en la oficina'}</div>
        <h1 class="zm-title zm-title-sm">${m.fresh ? 'A JUGAR' : 'PAUSA'}</h1>
        <div class="zm-note ${m.solo ? '' : 'warn'}">${m.fresh ? 'Haz clic en jugar para tomar el control' : m.solo ? 'Todo se detuvo. Tómate tu café ☕' : 'La partida sigue para tu equipo'}</div>`;
    }
    if (m.screen === 'over') {
      return `<div class="zm-kicker red">☠ Los zombis tomaron la oficina</div>
        <h1 class="zm-title zm-title-sm">FIN DE LA<br>PARTIDA</h1>
        <div class="zm-note">Llegaron hasta la <b>horda ${m.summary?.wave || m.wave || 1}</b></div>`;
    }
    return `<h1 class="zm-title" aria-label="Zombies en la oficina">ZOMBIES</h1>
      <div class="zm-sub">en la oficina</div>
      ${m.mode === 'live' || m.mode === 'watch' ? `<div class="zm-live"><span class="zm-rec"></span>Partida en curso · Horda ${m.wave || 1}</div>` : ''}`;
  }

  items() {
    const m = this.m;
    const L = [];
    if (m.screen === 'pause') {
      L.push({ id: 'resume', label: m.fresh ? 'Jugar' : 'Continuar', primary: true });
      L.push({ id: 'p:options', label: 'Opciones' });
      L.push({ id: 'p:controls', label: 'Controles' });
      L.push({ id: 'leave', label: 'Volver a la oficina', gap: true });
      return L;
    }
    if (m.screen === 'over') {
      if (m.canRestart) L.push({ id: 'restart', label: 'Revancha', sub: 'mismo escuadrón', primary: true });
      L.push({ id: 'p:records', label: 'Récords' });
      L.push({ id: 'leave', label: 'Volver a la oficina', gap: true });
      return L;
    }
    // menú principal
    if (m.mode === 'live') {
      L.push({ id: 'enter', label: 'Entrar a la partida', sub: `Horda ${m.wave || 1}`, primary: true });
    } else if (m.mode === 'watch') {
      L.push({ id: 'enter', label: 'Mirar la partida', sub: `${m.count}/4`, primary: true });
      if (m.joinable) L.push({ id: 'sit', label: 'Unirse al escuadrón', sub: 'hay lugar' });
    } else {
      L.push({ id: 'solo', label: 'Jugar solo', disabled: !m.solo, sub: m.solo ? '' : 'hay más gente aquí', primary: m.solo });
      const others = (m.live || []).length;
      L.push({ id: 'p:join', label: 'Unirse a partida', sub: others ? `${others} en curso` : 'ninguna ahora', disabled: !others });
      L.push({ id: 'p:squad', label: m.solo ? 'Crear sala' : 'Sala del escuadrón', sub: `${m.count}/4`, primary: !m.solo });
    }
    L.push({ id: 'p:weapons', label: 'Armas', gap: true });
    L.push({ id: 'p:records', label: 'Récords' });
    L.push({ id: 'p:options', label: 'Opciones' });
    L.push({ id: 'p:controls', label: 'Controles' });
    L.push({ id: 'leave', label: 'Volver a la oficina', gap: true });
    return L;
  }

  renderMenu(items) {
    return items.map((it, i) => `
      <button class="zm-item${i === this.sel ? ' sel' : ''}${it.disabled ? ' off' : ''}${it.gap ? ' gap' : ''}${this.panel && it.id === `p:${this.panel}` ? ' open' : ''}${it.primary ? ' prim' : ''}"
        data-item="${i}" role="menuitem" ${it.disabled ? 'aria-disabled="true"' : ''}>
        <span class="zm-arrow">▸</span><span class="zm-label">${esc(it.label)}</span>${it.sub ? `<span class="zm-itsub">${esc(it.sub)}</span>` : ''}
      </button>`).join('');
  }

  statusText() {
    const m = this.m;
    if (m.screen === 'pause') return m.solo ? 'Partida solo · en pausa' : `Escuadrón de ${m.count} · la horda no espera`;
    if (m.screen === 'over') return m.canRestart ? 'Revancha: vuelven a la sala con el mismo escuadrón' : 'Estabas mirando';
    if (m.mode === 'watch') return `Estás mirando · ${m.count}/4 jugando`;
    if (m.mode === 'live') return m.isHost ? 'Llevas la partida · tu escuadrón te espera' : 'Tu escuadrón ya está peleando';
    const lead = m.isHost ? 'Eres líder del escuadrón' : `Líder: ${m.squad.find((p) => p?.host)?.name || '…'}`;
    return `${lead} · Escuadrón: ${m.count >= 4 ? 'lleno' : 'abierto'}`;
  }

  // ---------- Escuadrón (arriba a la derecha) ----------
  partyKey() {
    const m = this.m;
    const best = this.bestMap();
    return JSON.stringify([m.screen, m.mode, this.panel, m.squad.map((p) => p && [p.uid, p.name, p.host, p.ready, p.alive, p.down, Math.ceil((p.hp || 0) / 10), best[p.uid]]), m.lobbyT]);
  }
  bestMap() {
    const out = {};
    for (const [i, r] of (this.records?.top || []).entries()) out[r.userId] = [r.score, i + 1];
    if (this.records?.me && !out[this.d.me]) out[this.d.me] = [this.records.me.score, this.records.me.rank];
    return out;
  }
  renderParty() {
    const m = this.m;
    if (m.screen === 'over' || this.curPanel()) return '';
    const best = this.bestMap();
    const n = m.count;
    const inGame = m.screen === 'pause' || m.mode === 'live' || m.mode === 'watch';
    const rows = m.squad.map((p, i) => {
      if (!p) return inGame ? '' : `<div class="zm-prow empty"><div class="zm-face zm-face-empty">+</div><div><div class="zm-pname">Esperando…</div><div class="zm-pmeta">Invitar: que abran esta máquina</div></div></div>`;
      const b = best[p.uid];
      const meta = inGame ? (p.down ? 'Caído · ¡levántalo!' : !p.alive ? 'Fuera hasta el descanso' : `Vida ${Math.max(0, Math.ceil(p.hp))}`) : b ? `Récord ${fmt(b[0])}` : 'Sin récord aún';
      const chips = [
        p.host ? '<span class="zm-chip star" title="Líder">★</span>' : '',
        !inGame && !p.host ? `<span class="zm-chip ${p.ready ? 'ok' : 'wait'}" title="${p.ready ? 'Listo' : 'Aún no'}">${p.ready ? '✓' : '…'}</span>` : '',
        b && b[1] <= 10 ? `<span class="zm-chip rank" title="Lugar en récords">#${b[1]}</span>` : '',
      ].join('');
      return `<div class="zm-prow${p.me ? ' me' : ''}${inGame && !p.alive ? ' dead' : ''}" style="--seat:${SEAT_COLORS[i]}">
        <canvas class="zm-face" width="48" height="48" data-face="${p.uid}"></canvas>
        <div class="zm-pbody"><div class="zm-pname">${esc(p.name)}</div><div class="zm-pmeta">${esc(meta)}</div><div class="zm-chips">${chips}</div></div>
      </div>`;
    }).join('');
    return `<div class="zm-phead"><span>${plural(n, 'jugador', 'jugadores')} (4 máx)</span>${m.lobbyT != null ? `<span class="zm-count">Arranca en ${Math.ceil(m.lobbyT)}</span>` : ''}</div>${rows}`;
  }

  // ---------- Paneles ----------
  openPanel(p, focus = true) {
    this.panel = p; this.focus = focus && p ? 'panel' : 'menu'; this.prow = 0; this.openedAt = performance.now();
    if (p === 'records') this.loadRecords();
    this.dirtyRegion('menu'); this.dirtyRegion('panel'); this.dirtyRegion('party');
  }
  closePanel() { this.panel = null; this.focus = 'menu'; this.dirtyRegion('menu'); this.dirtyRegion('panel'); this.dirtyRegion('party'); }
  curPanel() { return this.panel || (this.screen === 'over' ? 'results' : null); }
  dirtyRegion(n) { const el = this.screenEl.querySelector(`[data-region="${n}"]`); if (el) el._key = null; }

  panelKey() {
    const m = this.m, p = this.curPanel();
    if (!p) return '';
    const base = `${p}|${this.focus}|${this.prow}`;
    if (p === 'squad') return `${base}|${JSON.stringify(m.squad.map((q) => q && [q.uid, q.name, q.host, q.ready]))}|${m.lobbyT == null ? '' : Math.ceil(m.lobbyT)}|${m.allReady}|${m.isHost}|${m.myReady}`;
    if (p === 'join') return `${base}|${JSON.stringify(m.live)}`;
    if (p === 'records') return `${base}|${JSON.stringify(this.records)}`;
    if (p === 'controls') return `${base}|${this.ctab}`;
    if (p === 'results') return `${base}|${JSON.stringify(m.results)}|${JSON.stringify(m.summary)}|${JSON.stringify(this.records?.me)}`;
    return base; // opciones y armas: los valores se actualizan sin volver a dibujar
  }
  renderPanel() {
    const p = this.curPanel();
    if (!p) return '';
    const body = { squad: () => this.pSquad(), join: () => this.pJoin(), weapons: () => this.pWeapons(), records: () => this.pRecords(), options: () => this.pOptions(), controls: () => this.pControls(), results: () => this.pResults() }[p]?.() || '';
    const close = p === 'results' ? '' : `<button class="zm-x" data-act="closePanel" aria-label="Cerrar">✕</button>`;
    const fresh = performance.now() - (this.openedAt || 0) < 250 ? ' zm-enter' : '';
    return `<div class="zm-panel zm-p-${p}${this.focus === 'panel' ? ' focus' : ''}${fresh}">${close}${body}</div>`;
  }

  pSquad() {
    const m = this.m;
    const slots = m.squad.map((p, i) => {
      if (!p) return `<div class="zm-slot empty"><div class="zm-slot-art"><span>+</span></div><div class="zm-slot-name">Esperando…</div><div class="zm-slot-tag invite">Invitar</div><div class="zm-slot-hint">Que se acerque a esta máquina y presione X</div></div>`;
      const tag = p.host ? '<div class="zm-slot-tag host">★ Líder</div>' : p.ready ? '<div class="zm-slot-tag ok">✓ Listo</div>' : '<div class="zm-slot-tag wait">Preparándose…</div>';
      return `<div class="zm-slot${p.me ? ' me' : ''}${p.ready || p.host ? ' ready' : ''}" style="--seat:${SEAT_COLORS[i]}"><div class="zm-slot-art"><canvas width="96" height="120" data-body="${p.uid}"></canvas></div><div class="zm-slot-name">${esc(p.name)}</div>${tag}</div>`;
    }).join('');
    const guests = m.squad.filter((p) => p && !p.host);
    const nReady = guests.filter((p) => p.ready).length;
    let state, btn;
    if (m.mode !== 'lobby') { state = `Partida en curso · horda ${m.wave || 1}`; btn = `<button class="zm-btn prim" data-act="enter">Entrar a la partida</button>`; }
    else if (m.isHost) {
      state = m.solo ? 'Estás solo: puedes empezar ya o esperar a tu equipo' : m.lobbyT != null ? `¡Todos listos! Arranca en ${Math.ceil(m.lobbyT)}…` : `${nReady} de ${guests.length} listos · espera a que todos estén listos`;
      btn = `<button class="zm-btn prim" data-act="start" ${m.solo || m.allReady ? '' : 'disabled'}>${m.solo ? 'Comenzar solo' : 'Comenzar'}</button>`;
    } else {
      state = m.lobbyT != null ? `¡Todos listos! Arranca en ${Math.ceil(m.lobbyT)}…` : m.myReady ? 'Esperando al líder…' : 'Avísale al líder cuando estés listo';
      btn = `<button class="zm-btn ${m.myReady ? 'ok' : 'prim'}" data-act="ready">${m.myReady ? '✓ Listo' : 'Estoy listo'}</button>`;
    }
    return `<h2 class="zm-ptitle">Sala del escuadrón</h2>
      <p class="zm-pdesc">Esta máquina es tu sala: quien la abra entra a tu escuadrón (hasta 4).</p>
      <div class="zm-slots">${slots}</div>
      <div class="zm-squad-foot"><span class="zm-squad-state${m.lobbyT != null ? ' go' : ''}">${esc(state)}</span>${btn}</div>`;
  }

  pJoin() {
    const list = this.m.live || [];
    if (!list.length) return `<h2 class="zm-ptitle">Unirse a partida</h2><p class="zm-pdesc">No hay partidas en otras máquinas ahora mismo.</p>`;
    return `<h2 class="zm-ptitle">Unirse a partida</h2><p class="zm-pdesc">Partidas en curso en otras máquinas de la oficina.</p>
      <div class="zm-list">${list.map((g, i) => `
        <div class="zm-lrow${this.focus === 'panel' && this.prow === i ? ' sel' : ''}" data-prow="${i}">
          <div class="zm-faces">${g.players.slice(0, 4).map((u) => `<canvas class="zm-face sm" width="40" height="40" data-face="${u}"></canvas>`).join('')}</div>
          <div class="flex1"><b>Sala de ${esc(g.hostName)}</b><div class="zm-pmeta">${g.players.length}/${g.max} jugando</div></div>
          <button class="zm-btn small ${g.players.length >= g.max ? '' : 'prim'}" data-join="${i}">${g.players.length >= g.max ? 'Mirar' : 'Unirse'}</button>
        </div>`).join('')}</div>`;
  }

  pWeapons() {
    const maxD = Math.max(...WEAPONS.map((w) => w.dmg * w.pellets));
    const maxR = Math.max(...WEAPONS.map((w) => 1 / w.every));
    const maxM = Math.max(...WEAPONS.map((w) => w.mag));
    const desc = ['Fiel y sin fin: nunca se acaban las grapas.', 'Ocho granos por tiro. Brutal de cerca.', 'Automática: mantén el clic y no sueltes.'];
    const stat = (l, k) => `<div class="zm-stat"><span>${l}</span><i><b style="width:${Math.round(Math.max(0.08, k) * 100)}%"></b></i></div>`;
    const cards = WEAPONS.map((w, i) => `
      <div class="zm-wcard">
        <div class="zm-wtop"><span data-icon="${w.id}" data-size="54"></span><div><div class="zm-wname">${esc(w.name)}</div><div class="zm-pmeta">${w.cost ? `En la tienda · 💰 ${fmt(w.cost)}` : 'Con la que empiezas'}</div></div><span class="zm-kbd">${i + 1}</span></div>
        <p class="zm-wdesc">${desc[i]}</p>
        ${stat('Daño', (w.dmg * w.pellets) / maxD)}${stat('Cadencia', 1 / w.every / maxR)}${stat('Cargador', w.mag / maxM)}
      </div>`).join('');
    const shop = SHOP.filter((it) => it.weapon == null).map((it) => `<div class="zm-mini"><span data-icon="${SHOP_ICON[it.id]}" data-size="30"></span><div><b>${esc(it.name)}</b><div class="zm-pmeta">${esc(it.desc)}</div></div><span class="zm-price">💰 ${fmt(it.cost)}</span></div>`).join('');
    const horde = Object.values(ZOMBIE_TYPES).map((z) => `<span class="zm-tag">${esc(z.name)}</span>`).join('') + Object.values(BOSSES).map((b) => `<span class="zm-tag boss">☠ ${esc(b.name)}</span>`).join('');
    return `<h2 class="zm-ptitle">Armas</h2><div class="zm-wgrid">${cards}</div>
      <h3 class="zm-h3">Tienda entre hordas</h3><div class="zm-minis">${shop}</div>
      <h3 class="zm-h3">La horda</h3><div class="zm-tags">${horde}</div>`;
  }

  pRecords() {
    const r = this.records;
    if (!r) return `<h2 class="zm-ptitle">Récords</h2><p class="zm-pdesc">Cargando…</p>`;
    const rows = r.top.slice(0, 10).map((x, i) => `
      <div class="zm-rrow${x.userId === this.d.me ? ' me' : ''}">
        <span class="zm-rank r${i + 1}">${i + 1}</span>
        <canvas class="zm-face sm" width="40" height="40" data-face="${x.userId}"></canvas>
        <span class="flex1">${esc(this.d.nameOf(x.userId))}</span><b>${fmt(x.score)}</b>
      </div>`).join('');
    const mine = r.me ? `Tu mejor: <b>${fmt(r.me.score)}</b> · lugar <b>#${r.me.rank}</b>` : 'Aún no tienes récord. ¡Ve por él!';
    return `<h2 class="zm-ptitle">Récords</h2><p class="zm-pdesc">Las 10 mejores puntuaciones de la oficina.</p>
      <div class="zm-rlist">${rows || '<p class="zm-pdesc">Todavía nadie. ¡Sé el primero!</p>'}</div>
      <div class="zm-mybest">${mine}</div>`;
  }

  optRows() {
    return [
      { k: 'sens', label: 'Sensibilidad del mouse', type: 'range', min: 0.2, max: 3, step: 0.05, fmt: (v) => `${(+v).toFixed(2)}×` },
      { k: 'invertY', label: 'Invertir eje Y', type: 'toggle' },
      { k: 'fov', label: 'Campo de visión', type: 'range', min: 60, max: 100, step: 1, fmt: (v) => `${v}°` },
      { k: 'quality', label: 'Calidad', type: 'seg', opts: [['alta', 'Alta'], ['baja', 'Baja']] },
      { k: 'master', label: 'Volumen general', type: 'range', min: 0, max: 100, step: 5, fmt: (v) => `${v}%` },
      { k: 'effects', label: 'Volumen de efectos', type: 'range', min: 0, max: 100, step: 5, fmt: (v) => `${v}%` },
      { k: 'minimap', label: 'Mostrar minimapa', type: 'toggle' },
      { k: 'cross', label: 'Estilo de mira', type: 'seg', opts: CROSS_STYLES.map((c) => [c.id, c.name]), cross: true },
      { k: 'crossColor', label: 'Color de mira', type: 'color', opts: CROSS_COLORS },
    ];
  }
  pOptions() {
    const o = this.m.opts;
    const rows = this.optRows().map((r, i) => {
      const v = o[r.k];
      let ctl = '';
      if (r.type === 'range') ctl = `<input type="range" min="${r.min}" max="${r.max}" step="${r.step}" value="${v}" data-opt="${r.k}" aria-label="${esc(r.label)}"><output data-out="${r.k}">${r.fmt(v)}</output>`;
      else if (r.type === 'toggle') ctl = `<button class="zm-toggle${v ? ' on' : ''}" role="switch" aria-checked="${!!v}" data-opt="${r.k}" data-val="${v ? '0' : '1'}"><span></span></button>`;
      else if (r.type === 'seg') ctl = `<div class="zm-seg">${r.opts.map(([id, name]) => `<button class="${v === id ? 'on' : ''}" data-opt="${r.k}" data-val="${id}" title="${esc(name)}">${r.cross ? `<canvas width="44" height="44" data-cross="${id}"></canvas>` : esc(name)}</button>`).join('')}</div>`;
      else ctl = `<div class="zm-swatches">${r.opts.map((c) => `<button class="${v === c ? 'on' : ''}" style="--c:${c}" data-opt="${r.k}" data-val="${c}" aria-label="${c}"></button>`).join('')}</div>`;
      return `<div class="zm-orow${this.focus === 'panel' && this.prow === i ? ' sel' : ''}" data-prow="${i}"><label>${esc(r.label)}</label><div class="zm-octl">${ctl}</div></div>`;
    }).join('');
    return `<h2 class="zm-ptitle">Opciones</h2>
      <div class="zm-optgrid"><div class="zm-orows">${rows}</div>
        <div class="zm-crossprev"><canvas width="160" height="160" data-crossprev="1"></canvas><span>Vista previa</span><button class="zm-btn small" data-act="resetOpts">Restablecer</button></div>
      </div>
      <p class="zm-pdesc small">Se guardan en este navegador. ${this.d.touch ? '' : `${kbd('←')}${kbd('→')} cambian el valor.`}</p>`;
  }
  // tras cambiar una opción: actualizar el panel sin volver a dibujarlo
  syncOptions() {
    const el = this.screenEl.querySelector('.zm-p-options');
    if (!el || !this.m) return;
    const o = this.m.opts;
    for (const r of this.optRows()) {
      const v = o[r.k];
      if (r.type === 'range') { const inp = el.querySelector(`input[data-opt="${r.k}"]`); if (inp && document.activeElement !== inp) inp.value = v; const out = el.querySelector(`[data-out="${r.k}"]`); if (out) out.textContent = r.fmt(v); }
      else if (r.type === 'toggle') { const b = el.querySelector(`[data-opt="${r.k}"]`); if (b) { b.classList.toggle('on', !!v); b.setAttribute('aria-checked', String(!!v)); b.dataset.val = v ? '0' : '1'; } }
      else for (const b of el.querySelectorAll(`[data-opt="${r.k}"]`)) b.classList.toggle('on', b.dataset.val === String(v));
    }
    this.paintCanvases(el);
  }

  pControls() {
    const tabs = `<div class="zm-tabs"><button class="${this.ctab === 'kb' ? 'on' : ''}" data-tab="kb">Teclado y mouse</button><button class="${this.ctab === 'touch' ? 'on' : ''}" data-tab="touch">Táctil</button></div>`;
    return `<h2 class="zm-ptitle">Controles</h2>${tabs}${this.ctab === 'kb' ? this.kbDiagram() : this.touchDiagram()}`;
  }
  kbDiagram() {
    // [tecla, ancho, grupo]
    const R = [
      [['Esc', 1, 'menu'], ['', 0.5, 'sp'], ['1', 1, 'gun'], ['2', 1, 'gun'], ['3', 1, 'gun'], ['4', 1, 'shop'], ['5', 1, 'shop'], ['6', 1, 'shop'], ['7', 1]],
      [['Tab', 1.5, 'gun'], ['Q', 1, 'gun'], ['W', 1, 'move'], ['E', 1, 'util'], ['R', 1, 'gun'], ['T', 1], ['Y', 1], ['U', 1]],
      [['Bloq', 1.75], ['A', 1, 'move'], ['S', 1, 'move'], ['D', 1, 'move'], ['F', 1], ['G', 1, 'util'], ['H', 1], ['Enter', 1.75, 'util']],
      [['Shift', 2.25, 'move'], ['Z', 1], ['X', 1], ['C', 1, 'menu'], ['V', 1], ['B', 1, 'shop'], ['N', 1]],
      [['', 1.75, 'sp'], ['Espacio', 5.5, 'gun']],
    ];
    const keys = R.map((row) => `<div class="zm-krow">${row.map(([l, w, g]) => `<span class="zm-key ${g || 'dim'}" style="flex:${w}">${l}</span>`).join('')}</div>`).join('');
    const arrows = `<div class="zm-arrows"><span class="zm-key move">↑</span><div><span class="zm-key turn">←</span><span class="zm-key move">↓</span><span class="zm-key turn">→</span></div></div>`;
    const legend = [
      ['move', 'WASD · ↑↓', 'Moverte'], ['turn', '← →', 'Girar'], ['move', 'Shift', 'Correr'],
      ['gun', 'Clic · Espacio', 'Disparar'], ['gun', '1-3 · Q · Rueda', 'Cambiar arma'], ['gun', 'R', 'Recargar'],
      ['util', 'E (mantén)', 'Levantar compañero'], ['shop', 'B · 1-6', 'Tienda entre hordas'], ['util', 'Enter · G', 'Estoy listo'],
      ['menu', 'C', 'Calidad'], ['menu', 'Esc', 'Pausa'],
    ].map(([g, k, t]) => `<div class="zm-leg"><i class="${g}"></i><b>${k}</b><span>${t}</span></div>`).join('');
    const mouse = `<div class="zm-mouse"><div class="zm-mbody"><span class="zm-mbtn l">Disparar</span><span class="zm-mbtn r"></span><span class="zm-wheel"></span></div>
      <div class="zm-mcap"><b>Mover el mouse</b> apunta<br><b>Rueda</b> cambia de arma</div></div>`;
    return `<div class="zm-kbwrap"><div class="zm-kb">${keys}</div>${arrows}${mouse}</div><div class="zm-legend">${legend}</div>`;
  }
  touchDiagram() {
    return `<div class="zm-phone"><div class="zm-screenart">
        <div class="zm-t-stick"><i></i><span>Moverte</span></div>
        <div class="zm-t-look">Arrastra aquí para apuntar</div>
        <div class="zm-t-btn fire">Disparar</div>
        <div class="zm-t-btn r">R</div><div class="zm-t-btn swap">⇄</div>
        <div class="zm-t-btn shop">🛒</div><div class="zm-t-btn rev">⛑</div><div class="zm-t-btn menu">☰</div>
      </div></div>
      <div class="zm-legend">
        <div class="zm-leg"><i class="move"></i><b>Palanca</b><span>Moverte (lado izquierdo)</span></div>
        <div class="zm-leg"><i class="turn"></i><b>Arrastrar</b><span>Apuntar (lado derecho)</span></div>
        <div class="zm-leg"><i class="gun"></i><b>Botón rosa</b><span>Disparar (mantén)</span></div>
        <div class="zm-leg"><i class="gun"></i><b>R · ⇄</b><span>Recargar · Cambiar arma</span></div>
        <div class="zm-leg"><i class="shop"></i><b>🛒</b><span>Tienda (entre hordas)</span></div>
        <div class="zm-leg"><i class="util"></i><b>⛑</b><span>Levantar compañero</span></div>
        <div class="zm-leg"><i class="menu"></i><b>☰</b><span>Pausa</span></div>
      </div>`;
  }

  pResults() {
    const m = this.m;
    const s = m.summary || {};
    const rows = (m.results || []).map((p) => `
      <div class="zm-res${p.me ? ' me' : ''}" style="--seat:${SEAT_COLORS[p.seat]}">
        <div class="zm-res-who"><canvas class="zm-face sm" width="40" height="40" data-face="${p.uid}"></canvas><span>${esc(p.name)}${p.host ? ' <i class="zm-star">★</i>' : ''}</span></div>
        <span>${fmt(p.kills)}</span><span>${fmt(p.dealt)}</span><span>${fmt(p.revives)}</span><b>${fmt(p.earned)}</b>
      </div>`).join('');
    const badges = [];
    if (s.newRecord) badges.push('<span class="zm-badge gold">★ ¡Nuevo récord!</span>');
    if (s.rank) badges.push(`<span class="zm-badge">Lugar #${s.rank} en récords</span>`);
    return `<div class="zm-bigstats">
        <div><small>Horda alcanzada</small><b class="green">${s.wave || m.wave || 1}</b></div>
        <div><small>Tu puntuación</small><b class="yel">${fmt(s.score)}</b></div>
        <div><small>Zombis del equipo</small><b>${fmt((m.results || []).reduce((a, p) => a + p.kills, 0))}</b></div>
      </div>
      ${badges.length ? `<div class="zm-badges">${badges.join('')}</div>` : ''}
      <div class="zm-restable"><div class="zm-res head"><span>Jugador</span><span>Zombis</span><span>Daño</span><span>Levantadas</span><span>Puntos</span></div>${rows}</div>`;
  }

  // ---------- Tienda ----------
  shopKey() {
    const m = this.m, P = m.me || {};
    return JSON.stringify([P.pts, P.owned, P.dmgLvl, m.ready, this.boughtId, this.d.touch]);
  }
  renderShop() {
    const m = this.m, P = m.me || {};
    const cards = SHOP.map((it, i) => {
      const cost = itemCost(P, it);
      const owned = it.weapon != null && P.owned?.[it.weapon];
      const maxed = it.id === 'upgrade' && P.dmgLvl >= 3;
      const can = !owned && !maxed && P.pts >= cost;
      const st = owned ? 'owned' : maxed ? 'maxed' : can ? 'can' : 'poor';
      const price = owned ? 'Ya la tienes' : maxed ? 'Al máximo' : `💰 ${fmt(cost)}`;
      const lvl = it.id === 'upgrade' ? `<div class="zm-lvl">${[0, 1, 2].map((k) => `<i class="${k < (P.dmgLvl || 0) ? 'on' : ''}"></i>`).join('')}</div>` : '';
      return `<button class="zm-card ${st}${this.boughtId === it.id ? ' bought' : ''}" data-buy="${it.id}" ${can ? '' : 'aria-disabled="true"'}>
        <span class="zm-cardkey">${i + 1}</span>
        <span class="zm-cardicon" data-icon="${SHOP_ICON[it.id]}" data-size="58"></span>
        <span class="zm-cardname">${esc(it.name)}</span>
        <span class="zm-carddesc">${esc(it.desc)}</span>${lvl}
        <span class="zm-cardprice">${price}</span>
        ${st === 'poor' ? `<span class="zm-cardneed">Te faltan ${fmt(cost - (P.pts || 0))}</span>` : ''}
        <span class="zm-stamp">✓ Comprado</span>
      </button>`;
    }).join('');
    return `<div class="zm-shop">
      <div class="zm-shophead"><div><div class="zm-kicker">Entre hordas</div><h2 class="zm-ptitle">Tienda de la oficina</h2></div>
        <div class="zm-shopinfo"><span class="zm-timer" data-shoptimer></span><span class="zm-pts">💰 <b>${fmt(P.pts)}</b></span></div></div>
      <div class="zm-cards">${cards}</div>
      <div class="zm-shopfoot"><span class="zm-pdesc small">${this.d.touch ? 'Toca una tarjeta para comprar' : `${kbd('1')}–${kbd('6')} comprar · ${kbd('B')} cerrar · ${kbd('Enter')} listo`}</span>
        <span class="flex1"></span>
        <button class="zm-btn" data-act="closeShop">Cerrar</button>
        <button class="zm-btn ${m.ready ? 'ok' : 'prim'}" data-act="shopReady">${m.ready ? '✓ Listo' : 'Estoy listo'}</button></div>
    </div>`;
  }
  tickShop() {
    const t = this.screenEl.querySelector('[data-shoptimer]');
    if (t) { const s = `Horda ${(this.m.wave || 0) + 1} en ${Math.max(0, Math.ceil(this.m.pt || 0))} s`; if (t.textContent !== s) t.textContent = s; }
  }
  // animación de compra
  bought(id) {
    this.boughtId = id;
    clearTimeout(this.boughtT);
    this.boughtT = setTimeout(() => { this.boughtId = null; }, 900);
    const el = this.screenEl.querySelector(`[data-buy="${id}"]`);
    if (el) { el.classList.remove('bought'); void el.offsetWidth; el.classList.add('bought'); }
  }
  nope(id) {
    const el = this.screenEl.querySelector(`[data-buy="${id}"]`);
    if (el) { el.classList.remove('shake'); void el.offsetWidth; el.classList.add('shake'); }
  }

  // ---------- Anuncios (horda, jefe, avisos) ----------
  banner(b) {
    if (!b) return;
    const el = document.createElement('div');
    const dur = b.dur || 2.6;
    if (b.kind === 'boss') {
      const B = BOSSES[b.boss] || {};
      el.className = 'zm-bn zm-bn-boss';
      el.innerHTML = `<div class="zm-bn-band"><div class="zm-bn-k">⚠ Jefe · Horda ${b.wave}</div><div class="zm-bn-name">${esc(B.name || 'Jefe')}</div><div class="zm-bn-quote">«${esc(B.title || '')}»</div></div>`;
    } else if (b.kind === 'wave') {
      el.className = 'zm-bn zm-bn-wave';
      el.innerHTML = `<div class="zm-bn-k">Horda</div><div class="zm-bn-n">${b.wave}</div><div class="zm-bn-sub">${esc(b.sub || '')}</div>`;
    } else {
      el.className = `zm-bn zm-bn-info ${b.tone || ''}`;
      el.innerHTML = `<div class="zm-bn-t">${esc(b.title)}</div>${b.sub ? `<div class="zm-bn-sub">${esc(b.sub)}</div>` : ''}`;
    }
    el.style.animationDuration = `${dur}s`;
    // uno a la vez: el nuevo reemplaza al anterior
    for (const old of this.bannerEl.children) old.remove();
    this.bannerEl.appendChild(el);
    el.addEventListener('animationend', (e) => { if (e.target === el) el.remove(); });
    setTimeout(() => { if (!el.getAnimations?.().some((x) => x.playState === 'paused')) el.remove(); }, dur * 1000 + 400); // por si no hubo animación
  }

  // ---------- Dibujos dentro del HTML ----------
  paintCanvases(el) {
    for (const c of el.querySelectorAll('canvas[data-face]')) { try { drawAvatarFace(c, this.d.avatarOf(Number(c.dataset.face))); } catch { /* sin avatar */ } }
    for (const c of el.querySelectorAll('canvas[data-body]')) { try { drawAvatarPreview(c, this.d.avatarOf(Number(c.dataset.body)), 'down'); } catch { /* sin avatar */ } }
    for (const s of el.querySelectorAll('[data-icon]')) { if (!s.firstChild) s.appendChild(iconCanvas(s.dataset.icon, Number(s.dataset.size) || 48)); }
    const o = this.m?.opts || DEFAULTS;
    for (const c of el.querySelectorAll('canvas[data-cross]')) { const g = c.getContext('2d'); g.clearRect(0, 0, c.width, c.height); drawCrosshair(g, c.width / 2, c.height / 2, { style: c.dataset.cross, color: '#ffffff', gap: 4, scale: 0.8 }); }
    for (const c of el.querySelectorAll('canvas[data-crossprev]')) {
      const g = c.getContext('2d');
      const gr = g.createLinearGradient(0, 0, 0, c.height); gr.addColorStop(0, '#2a3040'); gr.addColorStop(1, '#141722');
      g.fillStyle = gr; g.fillRect(0, 0, c.width, c.height);
      g.fillStyle = '#3d4456'; g.fillRect(0, c.height * 0.62, c.width, c.height * 0.38);
      drawCrosshair(g, c.width / 2, c.height / 2, { style: o.cross, color: o.crossColor, gap: 7, scale: 1.4 });
    }
  }

  // ---------- Ratón y teclado ----------
  hover(e) {
    const it = e.target.closest?.('[data-item]');
    if (it && this.focus === 'menu') {
      const i = Number(it.dataset.item);
      if (i !== this.sel && !this.lastItems?.[i]?.disabled) { this.sel = i; this.markSel(); }
    }
  }
  markSel() { for (const b of this.screenEl.querySelectorAll('[data-item]')) b.classList.toggle('sel', Number(b.dataset.item) === this.sel); }

  click(e) {
    const t = e.target;
    const item = t.closest('[data-item]');
    if (item) { const i = Number(item.dataset.item); if (this.lastItems?.[i]?.disabled) return; this.sel = i; this.focus = 'menu'; this.activate(); return; }
    const act = t.closest('[data-act]');
    if (act && !act.disabled) { this.doAct(act.dataset.act); return; }
    const buy = t.closest('[data-buy]');
    if (buy) { this.a.buy(buy.dataset.buy); return; }
    const join = t.closest('[data-join]');
    if (join) { const g = this.m.live?.[Number(join.dataset.join)]; if (g) this.a.joinMatch(g); return; }
    const tab = t.closest('[data-tab]');
    if (tab) { this.ctab = tab.dataset.tab; this.dirtyRegion('panel'); return; }
    const opt = t.closest('button[data-opt]');
    if (opt) { this.setOpt(opt.dataset.opt, opt.dataset.val); }
  }
  input(e) {
    const t = e.target;
    if (t.matches?.('input[type=range][data-opt]')) this.setOpt(t.dataset.opt, t.value);
  }
  setOpt(k, raw) {
    const row = this.optRows().find((r) => r.k === k);
    if (!row) return;
    let v = raw;
    if (row.type === 'range') v = Number(raw);
    if (row.type === 'toggle') v = raw === '1' || raw === true;
    this.a.setOpt(k, v);
    this.m.opts = { ...this.m.opts, [k]: v };
    this.syncOptions();
  }
  doAct(a) {
    this.a.sound?.('tick');
    if (a === 'closePanel') this.closePanel();
    else if (a === 'resetOpts') { for (const [k, v] of Object.entries(DEFAULTS)) this.a.setOpt(k, v); this.a.setOpt('quality', 'alta'); this.m.opts = { ...DEFAULTS, quality: 'alta' }; this.syncOptions(); }
    else if (a === 'start') this.a.start();
    else if (a === 'ready') this.a.ready();
    else if (a === 'enter') this.a.enter();
    else if (a === 'closeShop') this.a.closeShop();
    else if (a === 'shopReady') this.a.shopReady();
  }

  activate() {
    const it = this.lastItems?.[this.sel];
    if (!it || it.disabled) return;
    this.a.sound?.('tick');
    if (it.id.startsWith('p:')) {
      const p = it.id.slice(2);
      // en la sala abierta, Enter hace lo principal (listo / comenzar)
      if (p === 'squad' && this.panel === 'squad' && this.m.mode === 'lobby') { if (this.m.isHost) { if (this.m.solo || this.m.allReady) this.a.start(); } else this.a.ready(); return; }
      if (this.panel === p && p !== 'squad') { this.closePanel(); return; }
      this.openPanel(p, ['options', 'join', 'controls'].includes(p));
      return;
    }
    if (it.id === 'solo') this.a.start();
    else if (it.id === 'enter') this.a.enter();
    else if (it.id === 'sit') this.a.sit();
    else if (it.id === 'resume') this.a.resume();
    else if (it.id === 'restart') this.a.restart();
    else if (it.id === 'leave') this.a.leave();
  }

  move(dir) {
    const items = this.lastItems || [];
    if (!items.length) return;
    let i = this.sel;
    for (let k = 0; k < items.length; k++) { i = (i + dir + items.length) % items.length; if (!items[i].disabled) break; }
    if (i !== this.sel) { this.sel = i; this.markSel(); this.a.sound?.('tick'); }
  }

  panelRows() {
    if (this.panel === 'options') return this.optRows().length;
    if (this.panel === 'join') return (this.m.live || []).length;
    return 0;
  }
  panelKeyNav(k) {
    const n = this.panelRows();
    if (k === 'up' || k === 'down') { if (n) { this.prow = (this.prow + (k === 'up' ? -1 : 1) + n) % n; this.dirtyRegion('panel'); } return; }
    if (this.panel === 'controls' && (k === 'left' || k === 'right')) { this.ctab = this.ctab === 'kb' ? 'touch' : 'kb'; this.dirtyRegion('panel'); return; }
    if (this.panel === 'options' && (k === 'left' || k === 'right' || k === 'enter')) {
      const r = this.optRows()[this.prow];
      const o = this.m.opts, d = k === 'left' ? -1 : 1;
      if (r.type === 'range') this.setOpt(r.k, Math.round(Math.min(r.max, Math.max(r.min, o[r.k] + d * r.step)) * 100) / 100);
      else if (r.type === 'toggle') this.setOpt(r.k, o[r.k] ? '0' : '1');
      else {
        const vals = r.type === 'color' ? r.opts : r.opts.map((x) => x[0]);
        const i = vals.indexOf(o[r.k]);
        this.setOpt(r.k, vals[(i + d + vals.length) % vals.length]);
      }
      this.a.sound?.('tick');
      return;
    }
    if (this.panel === 'join' && k === 'enter') { const g = this.m.live?.[this.prow]; if (g) this.a.joinMatch(g); }
    if (this.panel === 'squad' && k === 'enter') this.activate();
  }

  // true si el menú se quedó con la tecla
  handleKey(e) {
    const s = this.screen;
    if (!s || s === 'shop' || s === 'hud') return false;
    if (e.target?.tagName === 'INPUT' && e.target.type === 'range' && (e.code === 'ArrowLeft' || e.code === 'ArrowRight')) { e.stopPropagation(); return true; }
    const map = { ArrowUp: 'up', KeyW: 'up', ArrowDown: 'down', KeyS: 'down', ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right', Enter: 'enter', Space: 'enter', NumpadEnter: 'enter', Escape: 'back', Backspace: 'back', Tab: 'tab' };
    const k = map[e.code];
    if (!k) return true; // en los menús no se juega
    e.preventDefault();
    if (e.repeat && (k === 'enter' || k === 'back' || k === 'tab')) return true;
    this.key(k);
    return true;
  }
  key(k) {
    if (k === 'tab') { if (this.screen === 'main') { if (this.panel === 'squad') this.closePanel(); else this.openPanel('squad', true); } return; }
    if (this.focus === 'panel' && this.panel) {
      if (k === 'back') { this.closePanel(); return; }
      if (k === 'left' && this.panel !== 'options' && this.panel !== 'controls') { this.focus = 'menu'; this.dirtyRegion('panel'); this.dirtyRegion('menu'); return; }
      this.panelKeyNav(k);
      return;
    }
    if (k === 'up') this.move(-1);
    else if (k === 'down') this.move(1);
    else if (k === 'enter' || k === 'right') { if (k === 'right' && this.panel) { this.focus = 'panel'; this.dirtyRegion('panel'); this.dirtyRegion('menu'); } else if (k === 'enter') this.activate(); }
    else if (k === 'back') {
      if (this.panel && this.screen !== 'over') this.closePanel();
      else if (this.screen === 'pause') this.a.resume();
    }
  }

  // Control (gamepad): cruceta / palanca, A elegir, B atrás
  pollPad() {
    const pads = typeof navigator !== 'undefined' && navigator.getGamepads ? navigator.getGamepads() : [];
    const p = pads && [...pads].find(Boolean);
    if (!p) return;
    const up = p.buttons[12]?.pressed || p.axes[1] < -0.6, down = p.buttons[13]?.pressed || p.axes[1] > 0.6;
    const A = p.buttons[0]?.pressed, B = p.buttons[1]?.pressed;
    if (up && !this.pad.up) this.key('up');
    if (down && !this.pad.down) this.key('down');
    if (A && !this.pad.a) this.key('enter');
    if (B && !this.pad.b) this.key('back');
    this.pad = { up, down, a: A, b: B };
  }

  destroy() {
    clearTimeout(this.boughtT);
    this.root.remove();
  }
}
