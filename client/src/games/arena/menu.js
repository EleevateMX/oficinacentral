// Menús de la Arena HUB (HTML encima del 3D), con el mismo estilo de consola que Zombies: sala con
// los 8 lugares, modo, mapa, clase (equipamiento), equipo, bots de práctica, unirse, récords,
// opciones y controles; pausa; y la pantalla final con el MVP, estadísticas y la XP ganada.
// Hereda de ZMenu (Zombies) todo lo de dibujar, teclado, control, opciones y anuncios.
import '../zombies/menu.css';
import './arena.css';
import { ZMenu } from '../zombies/menu.js';
import { ARMS, TECHNIQUES } from '@shared/arsenal.js';
import {
  MODES, MODE_IDS, TEAM_COLORS, TEAM_NAMES, PRIMARIES, SECONDARIES, MELEES, CLASSES, PVP, pvpDamage, PVP_TECHS, roundsToWin, levelProgress, rankName, MAX_PLAYERS,
} from '@shared/arena.js';
import { ARENA_MAPS, MAP_IDS } from '@shared/arenaMaps.js';
import { api } from '../../lib/api.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const fmt = (n) => Math.round(n || 0).toLocaleString('es-MX');
const kbd = (k) => `<kbd class="zm-kbd">${k}</kbd>`;
const fmtTime = (s) => (s >= 60 ? `${Math.round(s / 60)} min` : `${s} s`);
const DIFFS = [['facil', 'Fácil'], ['normal', 'Normal'], ['dificil', 'Difícil']];
const MODE_ART = { duelo: '⚔', ffa: '✦', equipos: '⚑', royale: '◎' };

export class ArenaMenu extends ZMenu {
  constructor(stage, deps) {
    super(stage, deps);
    this.root.classList.add('am-root');
    this.rtab = 'wins';
  }
  loadRecords() {
    const me = this.d.me;
    return Promise.all([api.get('/games/arena/top'), api.get('/games/arena_kills/top'), api.get(`/arena/profiles?ids=${me}`)])
      .then(([w, k, p]) => { this.records = { wins: w.top || [], kills: k.top || [], me: p.profiles?.[me] || null }; this.dirty(); return this.records; })
      .catch(() => null);
  }
  mount(screen) {
    super.mount(screen);
    const v = this.screenEl.querySelector('.zm-ver');
    if (v) v.textContent = 'HUB · Arena';
    const keys = this.screenEl.querySelector('.zm-keys');
    if (keys && screen === 'main' && !this.d.touch) {
      const tab = [...keys.children].find((c) => c.textContent.includes('Escuadrón'));
      if (tab) tab.innerHTML = `${kbd('Tab')} Sala`;
    }
  }

  // ---------- Encabezado y menú de la izquierda ----------
  headKey() { const m = this.m; return `${m.screen}|${m.mode}|${m.cfg?.mode}|${m.summary?.title}|${m.fresh}`; }
  renderHead() {
    const m = this.m;
    const M = MODES[m.cfg?.mode] || MODES.ffa;
    if (m.screen === 'pause') {
      return `<div class="zm-kicker">${esc(M.name)} · ${esc(ARENA_MAPS[m.cfg?.map]?.name || '')}</div>
        <h1 class="zm-title zm-title-sm am-title">${m.fresh ? 'A JUGAR' : 'PAUSA'}</h1>
        <div class="zm-note warn">${m.fresh ? 'Haz clic en jugar para tomar el control' : 'La partida sigue: nadie te espera'}</div>`;
    }
    if (m.screen === 'over') {
      const S = m.summary || {};
      return `<div class="zm-kicker ${S.won ? '' : 'red'}">${esc(M.name)} · ${esc(ARENA_MAPS[m.cfg?.map]?.name || '')}</div>
        <h1 class="zm-title zm-title-sm am-title ${S.won ? 'win' : S.draw ? '' : 'lose'}">${esc(S.title || 'FIN')}</h1>
        <div class="zm-note">${esc(S.sub || '')}</div>`;
    }
    return `<h1 class="zm-title am-title" aria-label="Arena HUB">ARENA</h1>
      <div class="zm-sub am-sub">hub · pvp</div>
      ${m.mode === 'live' || m.mode === 'watch' ? `<div class="zm-live"><span class="zm-rec"></span>Partida en curso · ${esc(M.name)}</div>` : ''}`;
  }

  items() {
    const m = this.m;
    const L = [];
    const M = MODES[m.cfg?.mode] || MODES.ffa;
    const cls = CLASSES.find((c) => c.load.every((w, i) => w === m.load?.[i]));
    const clsSub = cls ? cls.name : 'Personalizada';
    if (m.screen === 'pause') {
      L.push({ id: 'resume', label: m.fresh ? 'Jugar' : 'Continuar', primary: true });
      if (!M.royale) L.push({ id: 'p:loadout', label: 'Clase', sub: clsSub });
      L.push({ id: 'p:options', label: 'Opciones' });
      L.push({ id: 'p:controls', label: 'Controles' });
      L.push({ id: 'leave', label: 'Volver a la oficina', gap: true });
      return L;
    }
    if (m.screen === 'over') {
      if (m.isHost) {
        L.push({ id: 'rematch', label: 'Revancha', sub: 'mismo modo y mapa', primary: true });
        L.push({ id: 'lobby', label: 'Volver a la sala', sub: 'cambiar modo o mapa' });
      } else L.push({ id: 'wait', label: 'Esperando al anfitrión…', disabled: true });
      L.push({ id: 'p:records', label: 'Récords' });
      L.push({ id: 'leave', label: 'Volver a la oficina', gap: true });
      return L;
    }
    if (m.mode === 'live') {
      L.push({ id: 'enter', label: 'Entrar a la partida', sub: M.short, primary: true });
    } else if (m.mode === 'watch') {
      L.push({ id: 'enter', label: 'Mirar la partida', sub: `${m.count}/${MAX_PLAYERS}`, primary: true });
      if (m.joinable) L.push({ id: 'sit', label: 'Unirse', sub: 'hay lugar' });
    } else if (m.isHost) {
      L.push({ id: 'start', label: 'Comenzar partida', sub: m.canStart ? (m.solo ? 'práctica' : `${m.count} jugadores`) : m.startWhy, primary: true, disabled: !m.canStart });
    } else {
      L.push({ id: 'ready', label: m.myReady ? '✓ Listo' : 'Estoy listo', sub: 'avísale al anfitrión', primary: !m.myReady });
    }
    if (m.mode === 'lobby') {
      L.push({ id: 'p:mode', label: 'Modo de juego', sub: M.short, gap: true });
      L.push({ id: 'p:map', label: 'Mapa', sub: ARENA_MAPS[m.cfg?.map]?.short || '' });
      if (M.teams) L.push({ id: 'p:team', label: 'Equipo', sub: TEAM_NAMES[m.party[m.mySeat]?.team ?? 0] });
      if (!M.royale) L.push({ id: 'p:loadout', label: 'Clase', sub: clsSub });
      L.push({ id: 'p:bots', label: 'Bots de práctica', sub: m.cfg?.bots ? `${m.cfg.bots} · ${DIFFS.find((d) => d[0] === m.cfg.diff)?.[1]}` : 'ninguno' });
      L.push({ id: 'p:squad', label: 'Sala', sub: `${m.count}/${MAX_PLAYERS}` });
      const others = (m.live || []).length;
      L.push({ id: 'p:join', label: 'Unirse a partida', sub: others ? `${others} en curso` : 'ninguna ahora', disabled: !others });
    } else if (!M.royale && m.mode === 'live') L.push({ id: 'p:loadout', label: 'Clase', sub: clsSub, gap: true });
    L.push({ id: 'p:weapons', label: 'Arsenal', gap: true });
    L.push({ id: 'p:records', label: 'Récords' });
    L.push({ id: 'p:options', label: 'Opciones' });
    L.push({ id: 'p:controls', label: 'Controles' });
    L.push({ id: 'leave', label: 'Volver a la oficina', gap: true });
    return L;
  }

  statusText() {
    const m = this.m;
    const M = MODES[m.cfg?.mode] || MODES.ffa;
    if (m.screen === 'pause') return `${M.name} · la partida sigue`;
    if (m.screen === 'over') return m.isHost ? 'Tú decides: revancha o de vuelta a la sala' : 'El anfitrión decide la revancha';
    if (m.mode === 'watch') return `Estás mirando · ${m.count}/${MAX_PLAYERS} jugando`;
    if (m.mode === 'live') return 'La partida ya empezó · entra cuando quieras';
    const lead = m.isHost ? 'Eres el anfitrión' : `Anfitrión: ${m.party.find((p) => p?.host)?.name || '…'}`;
    return `${lead} · ${M.short} · ${ARENA_MAPS[m.cfg?.map]?.short || ''}`;
  }

  // ---------- Sala (derecha arriba): los 8 lugares ----------
  partyKey() {
    const m = this.m;
    return JSON.stringify([m.screen, m.mode, this.panel, m.cfg?.mode, m.party.map((p) => p && [p.uid, p.name, p.host, p.ready, p.team, p.level, p.bot, p.alive, p.kills]), m.lobbyT]);
  }
  renderParty() {
    const m = this.m;
    if (m.screen === 'over' || this.curPanel()) return '';
    const M = MODES[m.cfg?.mode] || MODES.ffa;
    const inGame = m.screen === 'pause' || m.mode === 'live' || m.mode === 'watch';
    const rows = m.party.filter(Boolean).map((p) => {
      const meta = inGame ? `${p.kills} bajas · ${p.deaths} muertes` : p.bot ? 'Bot de práctica' : p.level ? `${rankName(p.level)} · Nv ${p.level}` : 'Nuevo en la Arena';
      const col = M.teams ? TEAM_COLORS[p.team] : p.color;
      const chips = [
        p.host ? '<span class="zm-chip star" title="Anfitrión">★</span>' : '',
        !inGame && !p.host && !p.bot ? `<span class="zm-chip ${p.ready ? 'ok' : 'wait'}">${p.ready ? '✓' : '…'}</span>` : '',
        p.level ? `<span class="am-lvl" title="Nivel">${p.level}</span>` : '',
        p.bot ? '<span class="am-bot">BOT</span>' : '',
      ].join('');
      return `<div class="zm-prow${p.me ? ' me' : ''}${inGame && !p.alive && !M.respawn ? ' dead' : ''}" style="--seat:${col}">
        ${p.bot ? `<div class="zm-face am-botface">🤖</div>` : `<canvas class="zm-face" width="48" height="48" data-face="${p.uid}"></canvas>`}
        <div class="zm-pbody"><div class="zm-pname">${esc(p.name)}</div><div class="zm-pmeta">${esc(meta)}</div><div class="zm-chips">${chips}</div></div>
      </div>`;
    }).join('');
    const free = MAX_PLAYERS - m.party.filter(Boolean).length;
    return `<div class="zm-phead"><span>${m.count} ${m.count === 1 ? 'jugador' : 'jugadores'}${m.bots ? ` + ${m.bots} bots` : ''}</span>${m.lobbyT != null ? `<span class="zm-count">Arranca en ${Math.ceil(m.lobbyT)}</span>` : `<span class="am-free">${free} libres</span>`}</div>${rows}`;
  }

  // ---------- Paneles ----------
  panelKey() {
    const m = this.m, p = this.curPanel();
    if (!p) return '';
    const base = `${p}|${this.focus}|${this.prow}|${m.isHost}|${m.mode}`;
    if (p === 'squad') return `${base}|${JSON.stringify(m.party.map((q) => q && [q.uid, q.name, q.host, q.ready, q.team, q.level, q.bot]))}|${m.cfg?.mode}|${m.lobbyT == null ? '' : Math.ceil(m.lobbyT)}|${m.canStart}|${m.myReady}`;
    if (p === 'mode' || p === 'map' || p === 'bots') return `${base}|${JSON.stringify(m.cfg)}|${m.count}`;
    if (p === 'loadout') return `${base}|${m.load?.join(',')}`;
    if (p === 'team') return `${base}|${JSON.stringify(m.party.map((q) => q && [q.uid, q.team, q.name]))}`;
    if (p === 'records') return `${base}|${this.rtab}|${JSON.stringify(this.records)}`;
    if (p === 'results') return `${base}|${JSON.stringify(m.results)}|${JSON.stringify(m.summary)}`;
    return super.panelKey();
  }
  renderPanel() {
    const p = this.curPanel();
    if (!p) return '';
    const fns = {
      squad: () => this.pSquad(), mode: () => this.pMode(), map: () => this.pMap(), loadout: () => this.pLoadout(), team: () => this.pTeam(), bots: () => this.pBots(),
      join: () => this.pJoin(), weapons: () => this.pWeapons(), records: () => this.pRecords(), options: () => this.pOptions(), controls: () => this.pControls(), results: () => this.pResults(),
    };
    const body = fns[p]?.() || '';
    const close = p === 'results' ? '' : '<button class="zm-x" data-act="closePanel" aria-label="Cerrar">✕</button>';
    const fresh = performance.now() - (this.openedAt || 0) < 250 ? ' zm-enter' : '';
    return `<div class="zm-panel zm-p-${p} am-p-${p}${this.focus === 'panel' ? ' focus' : ''}${fresh}">${close}${body}</div>`;
  }
  hostNote() { return this.m.isHost ? '' : `<p class="am-note">Lo elige el anfitrión (${esc(this.m.party.find((q) => q?.host)?.name || '…')}).</p>`; }

  pSquad() {
    const m = this.m;
    const M = MODES[m.cfg?.mode] || MODES.ffa;
    const slot = (p, i) => {
      if (!p) return `<div class="zm-slot empty"><div class="zm-slot-art"><span>+</span></div><div class="zm-slot-name">Libre</div><div class="zm-slot-tag invite">Invitar</div></div>`;
      const col = M.teams ? TEAM_COLORS[p.team] : p.color;
      const tag = p.host ? '<div class="zm-slot-tag host">★ Anfitrión</div>' : p.bot ? '<div class="zm-slot-tag am-bottag">Bot</div>' : p.ready ? '<div class="zm-slot-tag ok">✓ Listo</div>' : '<div class="zm-slot-tag wait">Preparándose…</div>';
      return `<div class="zm-slot${p.me ? ' me' : ''}${p.ready || p.host || p.bot ? ' ready' : ''}" style="--seat:${col}">
        <div class="zm-slot-art">${p.bot ? '<span class="am-botbig">🤖</span>' : `<canvas width="96" height="120" data-body="${p.uid}"></canvas>`}${p.level ? `<span class="am-lvl big">${p.level}</span>` : ''}</div>
        <div class="zm-slot-name">${esc(p.name)}</div>${tag}${M.teams ? `<div class="am-teamtag" style="--tc:${col}">${TEAM_NAMES[p.team]}</div>` : ''}</div>`;
    };
    const slots = m.party.map(slot).join('');
    let state, btn;
    if (m.mode !== 'lobby') { state = 'La partida ya empezó'; btn = `<button class="zm-btn prim" data-act="enter">Entrar a la partida</button>`; }
    else if (m.isHost) {
      state = !m.canStart ? m.startWhy : m.lobbyT != null ? `¡Todos listos! Arranca en ${Math.ceil(m.lobbyT)}…` : m.solo ? 'Práctica: juegas contra bots' : m.allReady ? 'Todos listos' : 'Puedes empezar cuando quieras (o espera a que estén listos)';
      btn = `<button class="zm-btn prim" data-act="start" ${m.canStart ? '' : 'disabled'}>Comenzar</button>`;
    } else {
      state = m.lobbyT != null ? `¡Todos listos! Arranca en ${Math.ceil(m.lobbyT)}…` : m.myReady ? 'Esperando al anfitrión…' : 'Avísale al anfitrión cuando estés listo';
      btn = `<button class="zm-btn ${m.myReady ? 'ok' : 'prim'}" data-act="ready">${m.myReady ? '✓ Listo' : 'Estoy listo'}</button>`;
    }
    return `<h2 class="zm-ptitle">Sala de la Arena</h2>
      <p class="zm-pdesc">${esc(M.name)} · ${esc(ARENA_MAPS[m.cfg?.map]?.name || '')}. Quien abra esta máquina entra a la sala (hasta 8).</p>
      <div class="zm-slots am-slots">${slots}</div>
      <div class="zm-squad-foot"><span class="zm-squad-state${m.lobbyT != null ? ' go' : ''}">${esc(state)}</span>${btn}</div>`;
  }

  pMode() {
    const m = this.m;
    const c = m.cfg || {};
    const cards = MODE_IDS.map((id) => {
      const M = MODES[id];
      const on = c.mode === id;
      return `<button class="am-mode${on ? ' on' : ''}" data-cfg="mode" data-val="${id}" ${m.isHost ? '' : 'disabled'}>
        <span class="am-mode-art">${MODE_ART[id]}</span>
        <span class="am-mode-name">${esc(M.name)}</span>
        <span class="am-mode-desc">${esc(M.desc)}</span>
        <span class="am-mode-meta">${M.max === 2 ? '2 jugadores' : `2 a ${M.max} jugadores`}${M.teams ? ' · 2 equipos' : ''}${M.respawn ? ' · reaparecer' : ' · una vida'}</span>
      </button>`;
    }).join('');
    const M = MODES[c.mode] || MODES.ffa;
    const lim = M.limits.length > 1 ? `<div class="am-row"><span>${esc(M.limitLabel)}</span><div class="zm-seg">${M.limits.map((v) => `<button class="${c.limit === v ? 'on' : ''}" data-cfg="limit" data-val="${v}" ${m.isHost ? '' : 'disabled'}>${M.rounds ? `${v} rondas` : v}</button>`).join('')}</div></div>` : '';
    const time = M.times.length > 1 ? `<div class="am-row"><span>Tiempo</span><div class="zm-seg">${M.times.map((v) => `<button class="${c.time === v ? 'on' : ''}" data-cfg="time" data-val="${v}" ${m.isHost ? '' : 'disabled'}>${fmtTime(v)}</button>`).join('')}</div></div>` : '';
    const note = M.rounds ? `Gana quien gane ${roundsToWin(c.limit)} rondas. Cada ronda dura ${M.roundTime} s; si se acaba, gana quien tenga más vida.` : M.royale ? 'Sin reaparecer. La zona se apaga en 5 fases; afuera te quita vida cada vez más rápido.' : '';
    return `<h2 class="zm-ptitle">Modo de juego</h2>${this.hostNote()}<div class="am-modes">${cards}</div>${lim}${time}${note ? `<p class="zm-pdesc small">${esc(note)}</p>` : ''}`;
  }

  pMap() {
    const m = this.m;
    const cards = MAP_IDS.map((id) => {
      const D = ARENA_MAPS[id];
      return `<button class="am-map${m.cfg?.map === id ? ' on' : ''}" data-cfg="map" data-val="${id}" ${m.isHost ? '' : 'disabled'}>
        <canvas class="am-thumb" width="220" height="140" data-thumb="${id}"></canvas>
        <span class="am-map-name">${esc(D.name)}</span><span class="am-map-desc">${esc(D.desc)}</span><span class="am-map-meta">${D.office ? 'Tu piso de verdad' : `${D.size} casillas`}</span>
      </button>`;
    }).join('');
    return `<h2 class="zm-ptitle">Mapa</h2>${this.hostNote()}<div class="am-maps">${cards}</div>`;
  }

  pLoadout() {
    const m = this.m;
    const L = m.load || [];
    const classes = CLASSES.map((c) => `<button class="am-class${c.load.every((w, i) => w === L[i]) ? ' on' : ''}" data-class="${c.id}"><b>${esc(c.name)}</b><span>${c.load.map((w) => esc(ARMS[w].short)).join(' · ')}</span></button>`).join('');
    const maxD = Math.max(...PRIMARIES.concat(SECONDARIES).map((w) => pvpDamage(w, ARMS[w].dmg) * ARMS[w].pellets * (ARMS[w].burst || 1)));
    const stat = (l, k) => `<div class="zm-stat"><span>${l}</span><i><b style="width:${Math.round(Math.max(0.08, Math.min(1, k)) * 100)}%"></b></i></div>`;
    const pick = (slot, list, title) => `<div class="am-slotcol"><h3 class="zm-h3">${title}</h3>${list.map((w) => {
      const W = ARMS[w];
      const on = L[slot] === w;
      const stats = W.kind === 'gun' ? `${stat('Daño', (pvpDamage(w, W.dmg) * W.pellets * (W.burst || 1)) / maxD)}${stat('Cadencia', Math.min(1, 0.09 / W.every))}${stat('Alcance', Math.min(1, W.falloff[1] / 45))}` : `${stat('Daño', pvpDamage(w, W.dmg) / 45)}${stat('Velocidad', 0.8 / W.speed)}${stat('Alcance', W.range / 2.1)}`;
      const T = W.kind === 'sword' ? PVP_TECHS[W.tech] : null;
      return `<button class="am-wpick${on ? ' on' : ''}" data-load="${slot}" data-val="${w}" style="--el:${W.color || 'var(--zm-green)'}">
        <span data-icon="${W.id}" data-size="48"></span><span class="am-wname">${esc(W.name)}<small>${esc(W.mode)}</small></span>${stats}
        ${T ? `<span class="am-wtech" style="--el:${T.color}">${esc(T.style)} · ${Math.round(T.dmg)} de daño · espera ${Math.round(T.cd)} s</span>` : ''}
      </button>`;
    }).join('')}</div>`;
    return `<h2 class="zm-ptitle">Clase</h2><p class="zm-pdesc">Elige tu equipamiento. ${m.mode === 'lobby' ? '' : 'Los cambios se aplican al reaparecer.'}</p>
      <div class="am-classes">${classes}</div>
      <div class="am-load">${pick(0, PRIMARIES, 'Principal')}${pick(1, SECONDARIES, 'Secundaria')}${pick(2, MELEES, 'Espada')}</div>`;
  }

  pTeam() {
    const m = this.m;
    const cols = [0, 1].map((t) => {
      const list = m.party.filter((p) => p && p.team === t);
      const mine = m.party[m.mySeat]?.team === t;
      return `<div class="am-teamcol" style="--tc:${TEAM_COLORS[t]}">
        <div class="am-teamhead"><b>Equipo ${TEAM_NAMES[t]}</b><span>${list.length}</span></div>
        ${list.map((p) => `<div class="am-teamrow${p.me ? ' me' : ''}">${p.bot ? '<span class="am-botface sm">🤖</span>' : `<canvas class="zm-face sm" width="40" height="40" data-face="${p.uid}"></canvas>`}<span>${esc(p.name)}</span></div>`).join('')}
        <button class="zm-btn small ${mine ? 'ok' : 'prim'}" data-team="${t}" ${mine ? 'disabled' : ''}>${mine ? 'Estás aquí' : 'Cambiarme'}</button>
      </div>`;
    }).join('');
    return `<h2 class="zm-ptitle">Equipos</h2><p class="zm-pdesc">Rosa contra Azul. Los equipos quedan parejos (no más de uno de diferencia). En la partida solo oyes la voz de tu equipo.</p>
      <div class="am-teams">${cols}</div>${m.isHost ? '<div class="am-row"><span></span><button class="zm-btn small" data-act="autoTeams">Repartir parejo</button></div>' : ''}`;
  }

  pBots() {
    const m = this.m;
    const c = m.cfg || {};
    const max = MAX_PLAYERS - m.count;
    const M = MODES[c.mode] || MODES.ffa;
    const opts = Array.from({ length: Math.min(max, M.max - m.count) + 1 }, (_, i) => Math.max(0, i)).filter((n) => n >= 0);
    return `<h2 class="zm-ptitle">Bots de práctica</h2><p class="zm-pdesc">Rellenan los lugares libres: apuntan, se mueven, recogen cosas y disparan. Ceden su lugar cuando entra alguien.</p>${this.hostNote()}
      <div class="am-row"><span>Cuántos</span><div class="zm-seg">${opts.map((n) => `<button class="${(c.bots || 0) === n ? 'on' : ''}" data-cfg="bots" data-val="${n}" ${m.isHost ? '' : 'disabled'}>${n === 0 ? 'Ninguno' : n}</button>`).join('')}</div></div>
      <div class="am-row"><span>Dificultad</span><div class="zm-seg">${DIFFS.map(([id, name]) => `<button class="${c.diff === id ? 'on' : ''}" data-cfg="diff" data-val="${id}" ${m.isHost ? '' : 'disabled'}>${name}</button>`).join('')}</div></div>
      <p class="zm-pdesc small">Contra bots ganas la mitad de XP y no cuenta para las tablas de récords.</p>`;
  }

  pWeapons() {
    const guns = PRIMARIES.concat(SECONDARIES);
    const row = (w) => {
      const W = ARMS[w];
      const T = W.kind === 'sword' ? PVP_TECHS[W.tech] : null;
      const dmg = W.kind === 'gun' ? `${Math.round(pvpDamage(w, W.dmg))}${W.pellets > 1 ? `×${W.pellets}` : ''}${W.burst ? ` ×${W.burst}` : ''}` : `${Math.round(pvpDamage(w, W.dmg))}`;
      const ttk = W.kind === 'gun' ? Math.max(1, Math.ceil(100 / (pvpDamage(w, W.dmg) * W.pellets))) : Math.ceil(100 / pvpDamage(w, W.dmg));
      return `<div class="am-arow" style="--el:${W.color || 'var(--zm-green)'}"><span data-icon="${W.id}" data-size="40"></span><b>${esc(W.name)}</b><span>${esc(W.mode)}</span><span>Daño ${dmg}</span><span>${ttk} ${W.kind === 'gun' ? 'tiros' : 'golpes'}</span><span>${T ? `${esc(T.style)} ${Math.round(T.dmg)}` : W.head ? `Cabeza ×${W.head}` : ''}</span></div>`;
    };
    return `<h2 class="zm-ptitle">Arsenal de la Arena</h2><p class="zm-pdesc">Las mismas armas de Zombies, ajustadas para pelear contra personas: 100 de vida, el chaleco absorbe la mitad del daño y la cabeza duele más.</p>
      <div class="am-arsenal">${guns.map(row).join('')}${MELEES.map(row).join('')}</div>
      <p class="zm-pdesc small">Técnicas de espada: ${Math.round(PVP.tech.dmg * 100)}% del daño de Zombies y ${PVP.tech.cd}× de espera. Golpe rápido (${kbd('V')}) con cualquier arma.</p>`;
  }

  pRecords() {
    const r = this.records;
    const tabs = `<div class="zm-tabs"><button class="${this.rtab === 'wins' ? 'on' : ''}" data-rtab="wins">Victorias</button><button class="${this.rtab === 'kills' ? 'on' : ''}" data-rtab="kills">Bajas</button></div>`;
    if (!r) return `<h2 class="zm-ptitle">Récords</h2>${tabs}<p class="zm-pdesc">Cargando…</p>`;
    const list = (this.rtab === 'wins' ? r.wins : r.kills) || [];
    const rows = list.slice(0, 10).map((x, i) => `
      <div class="zm-rrow${x.userId === this.d.me ? ' me' : ''}"><span class="zm-rank r${i + 1}">${i + 1}</span>
        <canvas class="zm-face sm" width="40" height="40" data-face="${x.userId}"></canvas>
        <span class="flex1">${esc(this.d.nameOf(x.userId))}</span><b>${fmt(x.score)}</b></div>`).join('');
    const me = r.me;
    const prog = me ? levelProgress(me.xp) : null;
    const mine = me ? `<div class="am-myprof"><span class="am-lvl big">${me.level}</span><div class="flex1"><b>${esc(rankName(me.level))}</b> · ${fmt(me.xp)} XP<div class="am-xpbar"><i style="width:${Math.round((prog?.k || 0) * 100)}%"></i></div><small>${fmt(me.wins)} victorias · ${fmt(me.kills)} bajas · ${fmt(me.matches)} partidas</small></div></div>` : '';
    return `<h2 class="zm-ptitle">Récords</h2>${tabs}<p class="zm-pdesc">${this.rtab === 'wins' ? 'Partidas ganadas contra personas.' : 'Bajas a otras personas (los bots no cuentan).'}</p>
      <div class="zm-rlist">${rows || '<p class="zm-pdesc">Todavía nadie. ¡Sé el primero!</p>'}</div>${mine}`;
  }

  kbDiagram() {
    const R = [
      [['Esc', 1, 'menu'], ['', 0.5, 'sp'], ['1', 1, 'gun'], ['2', 1, 'gun'], ['3', 1, 'gun'], ['4', 1, 'dim'], ['5', 1, 'dim'], ['6', 1, 'dim'], ['7', 1, 'dim']],
      [['Tab', 1.5, 'util'], ['Q', 1, 'tech'], ['W', 1, 'move'], ['E', 1], ['R', 1, 'gun'], ['T', 1], ['Y', 1], ['U', 1]],
      [['Bloq', 1.75], ['A', 1, 'move'], ['S', 1, 'move'], ['D', 1, 'move'], ['F', 1, 'menu'], ['G', 1], ['H', 1], ['Enter', 1.75, 'util']],
      [['Shift', 2.25, 'move'], ['Z', 1], ['X', 1, 'gun'], ['C', 1, 'move'], ['V', 1, 'tech'], ['B', 1], ['N', 1]],
      [['Ctrl', 1.75, 'move'], ['Espacio', 5.5, 'gun']],
    ];
    const keys = R.map((row) => `<div class="zm-krow">${row.map(([l, w, g]) => `<span class="zm-key ${g || 'dim'}" style="flex:${w}">${l}</span>`).join('')}</div>`).join('');
    const arrows = `<div class="zm-arrows"><span class="zm-key move">↑</span><div><span class="zm-key turn">←</span><span class="zm-key move">↓</span><span class="zm-key turn">→</span></div></div>`;
    const legend = [
      ['move', 'WASD · ↑↓', 'Moverte'], ['move', 'Shift', 'Correr'], ['move', 'C · Ctrl', 'Agacharte'],
      ['gun', 'Clic · Espacio', 'Disparar / cortar'], ['gun', 'Clic derecho', 'Apuntar (mira)'], ['gun', '1-3 · Rueda', 'Cambiar arma'],
      ['gun', 'X (mantén)', 'Rueda de armas'], ['gun', 'R', 'Recargar'], ['tech', 'V', 'Golpe rápido'], ['tech', 'Q', 'Técnica de la espada'],
      ['util', 'Tab (mantén)', 'Marcador'], ['util', 'Enter', 'Estoy listo'], ['menu', 'F', 'Pantalla completa'], ['menu', 'Esc', 'Pausa'],
    ].map(([g, k, t]) => `<div class="zm-leg"><i class="${g}"></i><b>${k}</b><span>${t}</span></div>`).join('');
    const mouse = `<div class="zm-mouse"><div class="zm-mbody"><span class="zm-mbtn l">Disparar</span><span class="zm-mbtn r">Apuntar</span><span class="zm-wheel"></span></div>
      <div class="zm-mcap"><b>Mover el mouse</b> apunta<br><b>Rueda</b> cambia de arma</div></div>`;
    return `<div class="zm-kbwrap"><div class="zm-kb">${keys}</div>${arrows}${mouse}</div><div class="zm-legend">${legend}</div>`;
  }

  // ---------- Fin de la partida ----------
  pResults() {
    const m = this.m;
    const S = m.summary || {};
    const M = MODES[m.cfg?.mode] || MODES.ffa;
    const mvp = S.mvp;
    const mvpCard = mvp ? `<div class="am-mvp" style="--seat:${mvp.color}">
        <div class="am-mvp-art">${mvp.bot ? '<span class="am-botbig">🤖</span>' : `<canvas width="96" height="120" data-body="${mvp.uid}"></canvas>`}</div>
        <div class="am-mvp-body"><div class="zm-kicker">★ MVP de la partida</div><div class="am-mvp-name">${esc(mvp.name)}</div>
        <div class="am-mvp-stats"><span><b>${mvp.kills}</b> bajas</span><span><b>${mvp.deaths}</b> muertes</span><span><b>${mvp.assists}</b> asist.</span><span><b>${fmt(mvp.dmg)}</b> daño</span></div></div></div>` : '';
    const my = S.mine || {};
    const acc = my.shots ? Math.round((my.hits / my.shots) * 100) : 0;
    const big = `<div class="zm-bigstats am-big">
        <div><small>Bajas</small><b class="green">${my.kills ?? 0}</b></div>
        <div><small>K/D</small><b>${my.deaths ? (my.kills / my.deaths).toFixed(2) : (my.kills ?? 0).toFixed(1)}</b></div>
        <div><small>Precisión</small><b>${acc}%</b></div>
        <div><small>A la cabeza</small><b class="yel">${my.hs ?? 0}</b></div>
      </div>`;
    const xp = S.xp ? `<div class="am-xp${S.xp.levelUp ? ' up' : ''}"><span class="am-lvl big">${S.xp.profile.level}</span><div class="flex1"><b>+${fmt(S.xp.xp)} XP</b>${S.xp.practice ? ' <small>(práctica: la mitad)</small>' : ''}${S.xp.levelUp ? ` · <b class="am-up">¡Subiste a nivel ${S.xp.levelUp}!</b>` : ''}
        <div class="am-xpbar"><i style="width:${Math.round(levelProgress(S.xp.profile.xp).k * 100)}%"></i></div><small>${esc(rankName(S.xp.profile.level))} · ${fmt(S.xp.profile.xp)} XP en total</small></div></div>` : '';
    const teams = M.teams ? [0, 1] : [null];
    const head = M.royale ? '<span>Jugador</span><span>Lugar</span><span>Bajas</span><span>Daño</span><span>Cabeza</span>' : '<span>Jugador</span><span>Bajas</span><span>Muertes</span><span>Asist.</span><span>Daño</span>';
    const rows = teams.map((t) => {
      const list = (m.results || []).filter((p) => t == null || p.team === t);
      const title = t == null ? '' : `<div class="am-rteam" style="--tc:${TEAM_COLORS[t]}">Equipo ${TEAM_NAMES[t]} · <b>${m.teamScore?.[t] ?? 0}</b>${S.team === t ? ' · ganó' : ''}</div>`;
      return title + list.map((p) => `
        <div class="zm-res${p.me ? ' me' : ''}" style="--seat:${M.teams ? TEAM_COLORS[p.team] : p.color}">
          <div class="zm-res-who">${p.bot ? '<span class="am-botface sm">🤖</span>' : `<canvas class="zm-face sm" width="40" height="40" data-face="${p.uid}"></canvas>`}<span>${esc(p.name)}${p.mvp ? ' <i class="zm-star">★</i>' : ''}</span></div>
          ${M.royale ? `<span>${p.place ? `#${p.place}` : '—'}</span><span>${p.kills}</span><span>${fmt(p.dmg)}</span><b>${p.hs}</b>` : `<span>${p.kills}</span><span>${p.deaths}</span><span>${p.assists}</span><b>${fmt(p.dmg)}</b>`}
        </div>`).join('');
    }).join('');
    return `<div class="am-over">${mvpCard}${big}${xp}<div class="zm-restable am-restable"><div class="zm-res head">${head}</div>${rows}</div></div>`;
  }

  // ---------- Anuncios (rachas, medallas, rondas) ----------
  banner(b) {
    if (b?.kind === 'medal') {
      const el = document.createElement('div');
      el.className = `zm-bn am-medal ${b.tone || ''}`;
      el.innerHTML = `<div class="am-medal-ico">${esc(b.icon || '★')}</div><div class="am-medal-t">${esc(b.title)}</div>${b.sub ? `<div class="am-medal-sub">${esc(b.sub)}</div>` : ''}`;
      el.style.animationDuration = `${b.dur || 2}s`;
      for (const old of this.bannerEl.querySelectorAll('.am-medal')) old.remove();
      this.bannerEl.appendChild(el);
      el.addEventListener('animationend', (e) => { if (e.target === el) el.remove(); });
      setTimeout(() => el.remove(), (b.dur || 2) * 1000 + 400);
      return;
    }
    super.banner(b);
  }

  // ---------- Dibujos ----------
  paintCanvases(el) {
    super.paintCanvases(el);
    for (const c of el.querySelectorAll('canvas[data-thumb]')) { try { this.d.thumb?.(c, c.dataset.thumb); } catch { /* sin vista previa */ } }
  }

  // ---------- Clics ----------
  click(e) {
    const t = e.target;
    const cfg = t.closest('[data-cfg]');
    if (cfg && !cfg.disabled) { this.a.sound?.('tick'); this.a.setCfg(cfg.dataset.cfg, cfg.dataset.val); return; }
    const ld = t.closest('[data-load]');
    if (ld) { this.a.sound?.('tick'); this.a.setLoad(Number(ld.dataset.load), Number(ld.dataset.val)); return; }
    const cl = t.closest('[data-class]');
    if (cl) { this.a.sound?.('tick'); const c = CLASSES.find((x) => x.id === cl.dataset.class); if (c) this.a.setLoadout(c.load); return; }
    const tm = t.closest('[data-team]');
    if (tm && !tm.disabled) { this.a.sound?.('tick'); this.a.team(Number(tm.dataset.team)); return; }
    const rt = t.closest('[data-rtab]');
    if (rt) { this.rtab = rt.dataset.rtab; this.dirtyRegion('panel'); return; }
    super.click(e);
  }
  doAct(a) {
    if (a === 'autoTeams') { this.a.sound?.('tick'); this.a.autoTeams(); return; }
    if (a === 'lobby' || a === 'rematch') { this.a.sound?.('tick'); this.a[a](); return; }
    super.doAct(a);
  }
  activate() {
    const it = this.lastItems?.[this.sel];
    if (!it || it.disabled) return;
    if (['start', 'ready', 'lobby', 'rematch'].includes(it.id)) { this.a.sound?.('tick'); this.a[it.id](); return; }
    if (it.id === 'p:squad' && this.panel === 'squad' && this.m.mode === 'lobby') { this.a.sound?.('tick'); if (this.m.isHost) { if (this.m.canStart) this.a.start(); } else this.a.ready(); return; }
    super.activate();
  }
}
