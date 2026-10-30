import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Plus, Minus, Map as MapIcon, RotateCw, Trash2, Palette, Armchair, Brush, Lock, Unlock, Users } from 'lucide-react';
import MeetingNotes from './MeetingNotes.jsx';
import { inNotesRoom } from '../lib/notes.js';
import { office, useOffice } from '../lib/store.js';
import { TILE, isWalkable, findPath, deskAt, inRect, PROXIMITY_RADIUS, talkSpace, areaAt, closedRoomAt } from '@shared/map.js';
import { videoFor, activeScreens } from '../lib/screens.js';
import { daylight, GLOWS, setMusic, footstep, MUSIC_AREAS } from '../lib/ambience.js';
import { CATALOG, COLORS, objSize, seatAt } from '@shared/catalog.js';
import { seatPose, STAND_EMOTES } from '../lib/seating.js';
import { stepPlayer, walkStepV2, walkStepClassic, breathing } from '../lib/motion.js';
import { usesV2, avatarStyle } from '../lib/avatarV2.js';
import { drawFloorLayer, drawObject, sortObjects, drawAvatar, setRenderBrand, setRenderAreas, preloadBrandLogo, drawPartyHat, setAnimTime } from '../lib/render.js';
import { todayMD } from '../lib/birthdays.js';
import { emotePose, drawEmoteFx } from '../lib/emoteFx.js';
import { buildSeason, seasonObjects, interactSeason, drawSeasonGround, drawSeasonDecor, drawSeasonWalkers, drawSeasonSky, drawSeasonScreen } from '../lib/seasonal.js';
import { EMOTE_BY_KEY } from '@shared/emotes.js';

// Fecha de hoy ('MM-DD') para el gorrito de cumpleaños; se recalcula cada minuto
let bdayToday = { at: 0, md: '' };
const todayCached = () => { const t = Date.now(); if (t - bdayToday.at > 60e3) bdayToday = { at: t, md: todayMD() }; return bdayToday.md; };
import { mapBrand, officeLogo } from '../lib/themes.js';
import * as editor from '../lib/editor.js';
import { GAME_OF } from '../games/index.js';
import { api } from '../lib/api.js';
import ControlBar from './ControlBar.jsx';
import VideoStrip from './VideoStrip.jsx';
import { ScreenStage } from './Streams.jsx';
import RoomChat from './RoomChat.jsx';
import Minimap from './Minimap.jsx';
import Decorator from './Decorator.jsx';
import { drawPet } from '../lib/pets.js';
import { petStep, drawPetFxUnder, drawPetFxOver, petClick } from '../lib/petFx.js';
import PetPanel from './PetPanel.jsx';
import { pose, drawFxUnder, drawFxOver } from '../lib/fx.js';
import { Avatar } from './ui.jsx';
import { stageAt } from '@shared/stage.js';
import { drawStageSpots } from '../lib/stageFx.js';
import StagePanel from './StagePanel.jsx';
import { JukeboxLayer } from './Jukebox.jsx';
import { jukeboxActive } from '../lib/jukebox.js';
import { SeasonPill } from './SeasonExtras.jsx';
import { drawLiveTag } from '../lib/badges.js'; // placas: etiqueta LIVE

const T = TILE;
const STEP_MS = 135;
const INTERACT_LABELS = { board: 'Abrir pizarrón', notices: 'Ver anuncios', screen: 'Ver pantalla', game: 'Jugar', jukebox: 'Abrir rocola', hotel: 'Subir a MeDed Friends' };
// Objetos con brillo o dibujo fino que se pintan nítidos en cada cuadro (además de los de marca)
const CRISP = new Set(['cubeLogo', 'hexBadge', 'hexNeon', 'hexLamp']);
// Hay un juego abierto (o el mouse está capturado por uno): la oficina ignora mouse y teclado
const gameOpen = () => office.state.modal?.type === 'game' || (typeof document !== 'undefined' && !!document.pointerLockElement);
const GAME_LABELS = { pingPong: 'Jugar ping pong', poolTable: 'Jugar billar', foosball: 'Jugar futbolito', arcade: 'Jugar arcade', zombieArcade: 'Jugar Zombies en la oficina', kartArcade: 'Jugar Karts de oficina', arenaArcade: 'Jugar Arena HUB' };
// Zombies: si ya hay una partida en esa máquina, la pista invita a unirse
const zombieLabel = (o) => { const m = (o.type === 'zombieArcade' || o.type === 'kartArcade' || o.type === 'arenaArcade') && office.state.liveGames?.find((g) => g.objectId === o.id); return m ? `Unirse a ${o.type === 'kartArcade' ? 'Karts' : o.type === 'arenaArcade' ? 'la Arena' : 'Zombies'} (${m.players.length}/${m.max})` : null; };

// Tamaño de un objeto (los de temporada traen el suyo)
const sizeOf = (o) => (o.season ? { w: o.w, h: o.h } : objSize(o));
// Objeto interactivo más cercano (pizarrón, tablero, pantalla) a menos de 2 casillas
function nearInteractive(f, me) {
  let best = null;
  for (const o of [...f.objects, ...seasonObjects(f)]) {
    const kind = o.season ? 'season' : CATALOG[o.type]?.interactive;
    if (!kind) continue;
    const { w, h } = sizeOf(o);
    const dx = Math.max(o.x - me.x, 0, me.x - (o.x + w - 1));
    const dy = Math.max(o.y - me.y, 0, me.y - (o.y + h - 1));
    const d = Math.max(dx, dy), e = dx * dx + dy * dy; // empate: el más derecho enfrente
    if (d <= 2 && (!best || d < best.d || (d === best.d && e < best.e))) best = { o, kind, d, e };
  }
  return best;
}

export function interact(o) {
  if (o.season) return interactSeason(o);
  const kind = CATALOG[o.type]?.interactive;
  if (kind === 'board') office.set({ modal: { type: 'board', objectId: o.id } });
  else if (kind === 'notices') office.set({ modal: { type: 'notices' } });
  else if (kind === 'game') office.set({ modal: { type: 'game', objectId: o.id, game: GAME_OF[o.type], floorId: office.state.floor?.id } });
  else if (kind === 'jukebox') office.set({ modal: { type: 'jukebox', objectId: o.id } });
  else if (kind === 'hotel') office.set({ view: 'hotel', hotelFx: 'elevator' }); // elevador: sube al Hotel
  else if (kind === 'screen') {
    const st = office.state;
    const sc = st.talkingWith.find((id) => st.users[id]?.online && st.users[id]?.screen);
    if (sc) office.watch(sc);
    else if (st.media.screen) office.watch(st.me.id);
    else office.toast({ title: 'Nadie está compartiendo aquí. Usa el botón de compartir pantalla para proyectar la tuya.' });
  }
}
const KEYS = {
  ArrowUp: 'up', KeyW: 'up', ArrowDown: 'down', KeyS: 'down', ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right',
};
const DIRV = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };

// Colores del tema activo (se leen de las variables CSS, con caché corto)
let themeCache = { t: 0, accent: '#157A6E', ink: '#0A2B2C' };
function themeColors() {
  const now = performance.now();
  if (now - themeCache.t > 1000) {
    const cs = getComputedStyle(document.documentElement);
    const read = (n, d) => {
      const v = cs.getPropertyValue(n).trim();
      if (/^#[0-9a-f]{6}$/i.test(v)) return v;
      return d;
    };
    themeCache = { t: now, accent: read('--accent', themeCache.accent), ink: read('--ink', themeCache.ink), onAccent: read('--on-accent', '#ffffff'), brand: document.documentElement.dataset.brand };
  }
  return themeCache;
}
function rgba(hex, a) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

function isTyping() {
  const el = document.activeElement;
  return el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable);
}

export default function MapView({ active }) {
  const canvasRef = useRef(null);
  const wrapRef = useRef(null);
  const staticRef = useRef(null);
  const animRef = useRef({ under: [], top: [] });
  const hwRef = useRef(null);
  // En el celular el mapa empieza más lejos para ver más de la oficina
  const view = useRef({ zoom: typeof window !== 'undefined' && window.innerWidth < 720 ? 0.9 : 1.5, camX: 0, camY: 0, w: 0, h: 0, dpr: 1 });
  const input = useRef({ held: [], lastStep: 0, path: [], hover: null, pointer: null, drag: null, areaDrag: null });

  const floor = useOffice((s) => s.floor);
  const me = useOffice((s) => s.me);
  const users = useOffice((s) => s.users);
  const editMode = useOffice((s) => s.editMode);
  const ed = useOffice((s) => s.editor);
  const perf = useOffice((s) => s.prefs.performance.mode);
  const [hoverDesk, setHoverDesk] = useState(null);
  const hoverRef = useRef(null);
  const tipTimer = useRef(null);
  const tipRef = useRef(null);
  const deskIndRef = useRef(null);
  const tipOver = useRef(false);
  const hideTip = () => {
    clearTimeout(tipTimer.current);
    tipTimer.current = null;
    tipOver.current = false;
    hoverRef.current = null;
    setHoverDesk(null);
  };
  const keepTip = () => { clearTimeout(tipTimer.current); tipTimer.current = null; };
  // Se oculta con un pequeño retraso para poder llegar al botón
  const hideTipSoon = () => {
    if (tipTimer.current || !hoverRef.current) return;
    tipTimer.current = setTimeout(hideTip, 300);
  };
  const [toolbar, setToolbar] = useState(null);
  const [colorOpen, setColorOpen] = useState(false);
  const [zoomPct, setZoomPct] = useState(typeof window !== 'undefined' && window.innerWidth < 720 ? 90 : 150);

  const stateRef = useRef({});
  const projRef = useRef([]);
  const ambRef = useRef({});
  stateRef.current = { floor, me, users, editMode, ed, active };

  const config = useOffice((s) => s.config);

  // El logo de la oficina se carga primero y, cuando llega, se vuelve a pintar el mapa
  const [logoReady, setLogoReady] = useState(0);
  useEffect(() => {
    let alive = true;
    preloadBrandLogo(officeLogo(config)).then((ok) => ok && alive && setLogoReady((n) => n + 1));
    return () => { alive = false; };
  }, [config?.logoUrl, config?.theme]);

  // Capa estática (suelos, muros, objetos)
  useEffect(() => {
    if (!floor) return;
    setRenderBrand(mapBrand(config));
    setRenderAreas(floor.areas); // letreros con el nombre de la sala
    const layer = () => {
      const c = document.createElement('canvas');
      c.width = floor.W * T;
      c.height = floor.H * T;
      const ctx = c.getContext('2d');
      ctx.imageSmoothingEnabled = false;
      return { c, ctx };
    };
    // Dos capas fijas: suelo (con lo que va debajo) y muebles. Lo que lleva logo, texto o neón,
    // y lo animado (bandera, tótem), se pinta en cada cuadro a la resolución de la pantalla
    // para que se vea nítido con cualquier zoom; son pocos y solo se pintan los que se ven.
    const base = layer(), top = layer();
    drawFloorLayer(base.ctx, floor);
    const live = { under: [], top: [] };
    for (const o of sortObjects(floor.objects)) {
      const cat = CATALOG[o.type];
      const isLive = cat?.animated || cat?.brand || cat?.crisp || CRISP.has(o.type);
      if (isLive) live[cat.under ? 'under' : 'top'].push(o);
      else drawObject(cat?.under ? base.ctx : top.ctx, o);
    }
    animRef.current = live;
    staticRef.current = { base: base.c, top: top.c };
  }, [floor, config?.theme, config?.accent, config?.officeName, config?.logoUrl, logoReady]);

  // Decoración de temporada: se arma al cambiar de piso o de temporada
  useEffect(() => {
    hwRef.current = buildSeason(config?.season, floor, perf, config);
  }, [floor, config?.season, perf, config?.anniversary?.date, config?.anniversary?.year, config?.officeName]);

  // Tamaño del canvas
  useEffect(() => {
    const ro = new ResizeObserver(() => {
      const el = wrapRef.current;
      const c = canvasRef.current;
      if (!el || !c) return;
      const dpr = perf === 'efficient' ? 1 : Math.min(window.devicePixelRatio || 1, 2);
      const r = el.getBoundingClientRect();
      Object.assign(view.current, { w: r.width, h: r.height, dpr });
      c.width = Math.round(r.width * dpr);
      c.height = Math.round(r.height * dpr);
      c.style.width = `${r.width}px`;
      c.style.height = `${r.height}px`;
    });
    ro.observe(wrapRef.current);
    return () => ro.disconnect();
  }, [perf]);

  const screenToWorld = useCallback((sx, sy) => {
    const v = view.current;
    return { x: (sx - v.w / 2) / v.zoom / T + v.camX / T, y: (sy - v.h / 2) / v.zoom / T + v.camY / T };
  }, []);
  const worldToScreen = useCallback((wx, wy) => {
    const v = view.current;
    return { x: (wx * T - v.camX) * v.zoom + v.w / 2, y: (wy * T - v.camY) * v.zoom + v.h / 2 };
  }, []);

  // Teclado
  useEffect(() => {
    const down = (e) => {
      const { active: on, editMode: em } = stateRef.current;
      if (!on || isTyping() || office.state.modal) return;
      if (e.code === 'KeyX' && !em) {
        const f = stateRef.current.floor;
        const mine = office.players[stateRef.current.me.id];
        const near = f && mine && nearInteractive(f, mine);
        if (near) { e.preventDefault(); interact(near.o); return; }
      }
      if (e.key === 'Escape') {
        if (em) office.set((st) => ({ editor: { ...st.editor, tool: 'select', placing: null, selected: null } }));
        return;
      }
      if (em && (e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        e.shiftKey ? editor.redo() : editor.undo();
        return;
      }
      if (em && (e.key === 'Delete' || e.key === 'Backspace')) {
        const sel = stateRef.current.ed.selected;
        const o = sel && stateRef.current.floor.objects.find((x) => x.id === sel);
        if (o) editor.deleteObject(stateRef.current.floor.id, o).catch(() => {});
        return;
      }
      if (em && e.key.toLowerCase() === 'r') {
        const sel = stateRef.current.ed.selected;
        const o = sel && stateRef.current.floor.objects.find((x) => x.id === sel);
        if (o) editor.updateObject(o, { rot: ((o.rot || 0) + 1) % 4 }).catch(() => {});
        else if (stateRef.current.ed.placing) office.set((st) => ({ editor: { ...st.editor, placing: { ...st.editor.placing, rot: ((st.editor.placing.rot || 0) + 1) % 4 } } }));
        return;
      }
      input.current.run = e.shiftKey;
      // Ctrl+D: regresar a tu escritorio
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 'd' && !em) {
        e.preventDefault();
        input.current.path = [];
        input.current.held = [];
        office.goHome();
        return;
      }
      const dir = KEYS[e.code];
      if (dir) {
        e.preventDefault();
        const h = input.current.held;
        if (!h.includes(dir)) h.push(dir);
        if (!e.repeat) input.current.tap = dir;
        input.current.path = [];
      }
      // Acciones con letra: B bailar, H saludar, G guiño, J saltar…
      if (!em && !e.ctrlKey && !e.metaKey && !e.altKey && !e.repeat && EMOTE_BY_KEY[e.key.toUpperCase()] && !KEYS[e.code]) {
        office.emote(EMOTE_BY_KEY[e.key.toUpperCase()]);
        return;
      }
      if (/^[1-6]$/.test(e.key) && !em) office.react(['👋', '👍', '❤️', '😂', '🎉', '🔥'][Number(e.key) - 1]);
    };
    const up = (e) => {
      input.current.run = e.shiftKey;
      const dir = KEYS[e.code];
      if (dir) input.current.held = input.current.held.filter((d) => d !== dir);
    };
    const blur = () => { input.current.held = []; input.current.run = false; };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', blur);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      window.removeEventListener('blur', blur);
    };
  }, []);

  // Bucle de animación
  useEffect(() => {
    let raf;
    let last = performance.now();
    let lastFrame = 0;
    let centered = false;
    const loop = (t) => {
      raf = requestAnimationFrame(loop);
      const { floor: f, me: meU, users: us, editMode: em, ed: edS, active: on } = stateRef.current;
      const minFrame = perf === 'efficient' ? 33 : 0;
      if (!on || !f || t - lastFrame < minFrame) { last = t; return; }
      lastFrame = t;
      const dt = Math.min(0.1, (t - last) / 1000);
      last = t;
      const players = office.players;
      const mine = players[meU.id];
      if (!mine) return;

      // Caminar con camino (clic o "Ir a")
      if (office.pathTarget) {
        const target = office.pathTarget;
        office.pathTarget = null;
        input.current.path = findPath(f, { x: mine.x, y: mine.y }, target);
        if (target.near && input.current.path.length) input.current.path.pop();
      }

      // Con un juego abierto, la oficina no recibe controles (ni teclas que quedaron presionadas)
      if (gameOpen()) { input.current.held = []; input.current.tap = null; input.current.path = []; input.current.run = false; }
      // Movimiento por pasos
      const running = input.current.run || input.current.path.length > 8;
      const stepMs = (running ? STEP_MS * 0.55 : STEP_MS) * (input.current.diag ? Math.SQRT2 : 1);
      if (t - input.current.lastStep >= stepMs) {
        input.current.diag = false;
        let next = null;
        let dir = null;
        const held = input.current.held;
        if (held.length || input.current.tap) {
          dir = held.length ? held[held.length - 1] : input.current.tap;
          input.current.tap = null;
          const [dx, dy] = DIRV[dir];
          next = { x: mine.x + dx, y: mine.y + dy };
          // Dos flechas a la vez (una horizontal y una vertical): en diagonal, sin cortar esquinas
          const hz = [...held].reverse().find((d) => d === 'left' || d === 'right');
          const vt = [...held].reverse().find((d) => d === 'up' || d === 'down');
          if (hz && vt) {
            const [ddx] = DIRV[hz], [, ddy] = DIRV[vt];
            if (isWalkable(f, mine.x + ddx, mine.y + ddy) && isWalkable(f, mine.x + ddx, mine.y) && isWalkable(f, mine.x, mine.y + ddy)) {
              next = { x: mine.x + ddx, y: mine.y + ddy };
              dir = hz;
              input.current.diag = true;
            }
          }
        } else if (input.current.path.length) {
          next = input.current.path.shift();
          dir = next.x > mine.x ? 'right' : next.x < mine.x ? 'left' : next.y < mine.y ? 'up' : 'down';
        }
        if (next) {
          input.current.lastStep = t;
          const shut = closedRoomAt(f, mine, next);
          if (shut && !office.admitted.has(shut.id)) {
            // Sala cerrada: no se entra; se ofrece tocar la puerta
            input.current.path = [];
            input.current.held = [];
            office.knockPrompt(shut);
          } else if (isWalkable(f, next.x, next.y)) office.moveMe(next.x, next.y, dir);
          else if (dir !== mine.dir) office.moveMe(mine.x, mine.y, dir);
          else input.current.path = [];
        }
      }

      // Interpolación (lib/motion.js): los demás con un pequeño búfer; tú, a la velocidad de tus pasos
      const eight = avatarStyle() === 'v2';
      for (const [pid, p] of Object.entries(players)) {
        const v2 = eight && usesV2(us[pid]?.avatar);
        stepPlayer(p, { now: t, dt, mine: p === mine, stepMs: p === mine ? stepMs : STEP_MS, eight: v2, stride: v2 ? 2 : 2.4 });
      }

      // Ambiente: pasos propios y música en zonas de descanso
      const amb = office.state.prefs.ambience;
      if (amb.steps && mine.moving) footstep(amb.stepsVolume ?? 0.5);
      if (t - (ambRef.current.check || 0) > 1000) {
        ambRef.current.check = t;
        const ar = areaAt(f, mine.x, mine.y);
        setMusic(!!amb.music && !!ar && MUSIC_AREAS.test(ar.name) && !jukeboxActive(), amb.musicVolume);
        ambRef.current.light = amb.dayNight ? daylight() : null;
      }

      // Cámara
      const v = view.current;
      if (office.cameraTarget) {
        const ct = office.cameraTarget;
        office.cameraTarget = null;
        v.camX = ct.x * T;
        v.camY = ct.y * T;
        if (ct.zoom) { v.zoom = ct.zoom; setZoomPct(Math.round(ct.zoom * 100)); }
        centered = true;
      }
      let tx = (mine.rx + 0.5) * T;
      let ty = (mine.ry + 0.5) * T;
      // Durante el efecto de Ctrl+D la cámara sigue al efecto (la nave, el cohete…)
      const myFx = office.fx[meU.id];
      if (myFx) {
        const pr = (t - myFx.start) / myFx.dur;
        if (pr >= 0 && pr < 1) { const c = pose(myFx, pr).cam; if (c) { tx = (c.x + 0.5) * T; ty = (c.y + 0.5) * T; } }
      }
      // Vista general: centrada en el mapa hasta que te muevas
      if (v.overview) {
        if (v.overview.x === mine.x && v.overview.y === mine.y) { tx = (f.W * T) / 2; ty = (f.H * T) / 2; }
        else v.overview = null;
      }
      if (!em || !centered) {
        const k = centered ? Math.min(1, dt * 8) : 1;
        v.camX += (tx - v.camX) * k;
        v.camY += (ty - v.camY) * k;
        centered = true;
      }

      draw(t, f, meU, us, em, edS, mine);
    };

    const draw = (t, f, meU, us, em, edS, mine) => {
      const c = canvasRef.current;
      if (!c) return;
      const ctx = c.getContext('2d');
      const v = view.current;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--map-bg') || '#dfeedd';
      ctx.fillRect(0, 0, c.width, c.height);
      ctx.imageSmoothingEnabled = false;
      const s = v.zoom * v.dpr;
      ctx.setTransform(s, 0, 0, s, Math.round((v.w / 2 - v.camX * v.zoom) * v.dpr), Math.round((v.h / 2 - v.camY * v.zoom) * v.dpr));
      if (staticRef.current) {
        // Solo los objetos "vivos" que se ven en pantalla
        const vx0 = v.camX - v.w / 2 / v.zoom - 160, vx1 = v.camX + v.w / 2 / v.zoom + 64;
        const vy0 = v.camY - v.h / 2 / v.zoom - 160, vy1 = v.camY + v.h / 2 / v.zoom + 96;
        const drawLive = (list) => {
          for (const o of list) {
            const px = o.x * T, py = o.y * T;
            if (px > vx0 && px < vx1 && py > vy0 && py < vy1) drawObject(ctx, o);
          }
        };
        setAnimTime(performance.now());
        ctx.drawImage(staticRef.current.base, 0, 0);
        drawLive(animRef.current.under);
        if (hwRef.current) drawSeasonGround(ctx, hwRef.current, v, f); // nieve en el pasto (debajo de los muebles)
        ctx.drawImage(staticRef.current.top, 0, 0);
        drawLive(animRef.current.top);
        setAnimTime(0);
      }
      // Temporada (Halloween): adornos en el piso
      const hw = hwRef.current;
      const viewRect = { x0: v.camX - v.w / 2 / v.zoom, x1: v.camX + v.w / 2 / v.zoom, y0: v.camY - v.h / 2 / v.zoom, y1: v.camY + v.h / 2 / v.zoom };
      if (hw) drawSeasonDecor(ctx, hw, t, viewRect, f);

      // Proyección en vivo: la pantalla compartida aparece sobre las TV de tu sala
      projRef.current = [];
      const scr = activeScreens(office.state, office.media);
      if (scr.length) {
        const area = areaAt(f, mine.x, mine.y);
        const shown = scr.find((sc) => sc.id === office.state.stage && sc.stream) || scr.find((sc) => sc.stream) || scr[0];
        const vid = shown.stream ? videoFor(shown.stream) : null;
        const tvs = f.objects.filter((o) => (o.type === 'bigScreen' || o.type === 'tv') && (area ? inRect(area, o.x, o.y) : Math.hypot(o.x - mine.x, o.y - mine.y) < 8));
        for (const o of tvs) {
          const { w: ow } = objSize(o);
          const pw = (ow + 1) * T;
          const ph = Math.round(pw * 9 / 16);
          const px = o.x * T - T / 2;
          const py = o.y * T + 6 - ph;
          ctx.save();
          ctx.shadowColor = themeColors().accent; ctx.shadowBlur = 14;
          ctx.fillStyle = '#050506';
          ctx.beginPath(); ctx.roundRect(px - 3, py - 3, pw + 6, ph + 6, 6); ctx.fill();
          ctx.restore();
          if (vid?.videoWidth) {
            const k = Math.min(pw / vid.videoWidth, ph / vid.videoHeight);
            const vw = vid.videoWidth * k, vh = vid.videoHeight * k;
            ctx.drawImage(vid, px + (pw - vw) / 2, py + (ph - vh) / 2, vw, vh);
          } else {
            // Aún no la ves: invitación a verla
            const nm = office.state.users[shown.id]?.displayName || '';
            ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
            ctx.font = '700 9px "Public Sans", sans-serif';
            ctx.fillText(`${nm} está transmitiendo`, px + pw / 2, py + ph / 2 - 6);
            ctx.font = '600 8px "Public Sans", sans-serif'; ctx.fillStyle = themeColors().accent;
            ctx.fillText('Clic para ver ▶', px + pw / 2, py + ph / 2 + 8);
            ctx.textAlign = 'left';
          }
          ctx.fillStyle = '#e63946';
          ctx.beginPath(); ctx.roundRect(px + 4, py + 4, 34, 11, 3); ctx.fill();
          ctx.fillStyle = '#fff'; ctx.font = '700 7px "Public Sans", sans-serif'; ctx.textBaseline = 'middle';
          ctx.fillText('EN VIVO', px + 7, py + 10);
          projRef.current.push({ x: px / T, y: py / T, w: pw / T, h: ph / T, id: shown.id });
        }
      }

      // Espacio de conversación actual
      const space = talkSpace(f, mine.x, mine.y);
      if (space?.startsWith('desk:')) {
        const d = f.desks.find((x) => `desk:${x.id}` === space);
        if (d) { ctx.fillStyle = rgba(themeColors().accent, .12); ctx.fillRect(d.zone.x * T, d.zone.y * T, d.zone.w * T, d.zone.h * T); }
      } else if (!space && office.state.talkingWith.length) {
        ctx.strokeStyle = rgba(themeColors().accent, .45);
        ctx.setLineDash([4, 4]);
        ctx.lineWidth = 1.5;
        ctx.strokeRect((mine.rx - PROXIMITY_RADIUS) * T, (mine.ry - PROXIMITY_RADIUS) * T, (PROXIMITY_RADIUS * 2 + 1) * T, (PROXIMITY_RADIUS * 2 + 1) * T);
        ctx.setLineDash([]);
      }

      // Editor: áreas y escritorios
      if (em === 'build') {
        for (const a of f.areas) {
          const sel = edS.areaTarget === a.id;
          ctx.fillStyle = a.private ? 'rgba(91,63,184,.10)' : 'rgba(46,160,90,.08)';
          ctx.fillRect(a.x * T, a.y * T, a.w * T, a.h * T);
          ctx.strokeStyle = sel ? themeColors().accent : a.private ? 'rgba(91,63,184,.7)' : 'rgba(46,160,90,.6)';
          ctx.lineWidth = sel ? 3 : 1.5;
          ctx.setLineDash(sel ? [] : [6, 4]);
          ctx.strokeRect(a.x * T + 1, a.y * T + 1, a.w * T - 2, a.h * T - 2);
          ctx.setLineDash([]);
        }
      }
      if (em === 'decor') {
        for (const a of editor.decorAreas(f, meU)) {
          ctx.strokeStyle = rgba(themeColors().accent, .8);
          ctx.lineWidth = 2.5;
          ctx.setLineDash([8, 5]);
          ctx.strokeRect(a.x * T + 2, a.y * T + 2, a.w * T - 4, a.h * T - 4);
          ctx.setLineDash([]);
        }
      }
      if (em) {
        for (const d of f.desks) {
          const owner = f.claims[d.id];
          const mineDesk = owner === meU.id;
          if (em === 'decor' && !mineDesk) continue;
          ctx.strokeStyle = mineDesk ? 'rgba(255,255,255,.95)' : 'rgba(255,255,255,.35)';
          ctx.lineWidth = mineDesk ? 3 : 1;
          ctx.strokeRect(d.zone.x * T, d.zone.y * T, d.zone.w * T, d.zone.h * T);
          // Al decorar: dónde se pueden poner cosas (sobre el escritorio)
          if (em === 'decor' && d.decorZone) {
            const z = d.decorZone;
            ctx.fillStyle = 'rgba(255,255,255,.14)';
            ctx.fillRect(z.x * T, z.y * T, z.w * T, z.h * T);
            ctx.setLineDash([5, 4]);
            ctx.lineWidth = 1.5;
            ctx.strokeRect(z.x * T + 2, z.y * T + 2, z.w * T - 4, z.h * T - 4);
            ctx.setLineDash([]);
          }
        }
      }

      // Dibujo del objeto que se está arrastrando o colocando
      const drag = input.current.drag;
      if (drag?.moved) {
        ctx.globalAlpha = 0.75;
        drawObject(ctx, { ...drag.obj, x: drag.x, y: drag.y });
        ctx.globalAlpha = 1;
      }
      const ptr = input.current.pointer;
      if (em && edS.placing && ptr) {
        const w = screenToWorld(ptr.x, ptr.y);
        const pos = editor.snapFor(edS.placing.type, w.x, w.y);
        ctx.globalAlpha = 0.7;
        drawObject(ctx, { ...edS.placing, ...pos });
        ctx.globalAlpha = 1;
        const { w: ow, h: oh } = objSize({ ...edS.placing });
        ctx.strokeStyle = themeColors().accent;
        ctx.lineWidth = 1.5;
        ctx.strokeRect(pos.x * T, pos.y * T, ow * T, oh * T);
      }
      // Selección
      const selObj = edS.selected && f.objects.find((o) => o.id === edS.selected);
      if (em && selObj && !drag?.moved) {
        const { w, h } = objSize(selObj);
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2.5;
        ctx.strokeRect(selObj.x * T - 2, selObj.y * T - 2, w * T + 4, h * T + 4);
        ctx.strokeStyle = themeColors().accent;
        ctx.lineWidth = 1;
        ctx.strokeRect(selObj.x * T - 2, selObj.y * T - 2, w * T + 4, h * T + 4);
      }
      // Hover
      const hov = input.current.hover;
      if (em && hov && hov.id !== edS.selected && !edS.placing) {
        const { w, h } = objSize(hov);
        ctx.strokeStyle = rgba(themeColors().accent, .85);
        ctx.lineWidth = 1.5;
        ctx.strokeRect(hov.x * T - 1, hov.y * T - 1, w * T + 2, h * T + 2);
      }
      // Rectángulo de nueva área
      const ad = input.current.areaDrag;
      if (ad) {
        const r = normRect(ad);
        ctx.fillStyle = rgba(themeColors().accent, .15);
        ctx.fillRect(r.x * T, r.y * T, r.w * T, r.h * T);
        ctx.strokeStyle = themeColors().accent;
        ctx.lineWidth = 2;
        ctx.strokeRect(r.x * T, r.y * T, r.w * T, r.h * T);
      }

      // Avatares
      const players = office.players;
      const list = Object.entries(players).filter(([, p]) => p.floorId === f.id && !p.game).sort((a, b) => a[1].ry - b[1].ry);
      // Zombies y perritos de temporada (no en modo ahorro)
      if (hw?.npcs) drawSeasonWalkers(ctx, hw, t, viewRect, f, list.map(([, p]) => p));
      for (const [id, p] of list) {
        const u = us[id];
        // Efecto de regresar al escritorio (Ctrl+D): el efecto dibuja al personaje
        const fxe = office.fx[id];
        if (fxe) {
          const pr = (t - fxe.start) / fxe.dur;
          if (pr >= 1 || pr < 0) delete office.fx[id];
          else {
            const pz = pose(fxe, pr);
            drawFxUnder(ctx, fxe, pr, t);
            if (!pz.hidden) {
              const ax = (pz.x + 0.5) * T;
              const ay = (pz.y + 1) * T - 2;
              ctx.save();
              ctx.globalAlpha = Math.max(0, Math.min(1, pz.alpha ?? 1));
              if (pz.sink) { ctx.beginPath(); ctx.rect(ax - T, ay - 3 * T, 2 * T, 3 * T); ctx.clip(); }
              drawAvatar(ctx, ax, ay - (pz.lift || 0) + (pz.sink || 0) * 50, u?.avatar, pz.broom ? (pz.flip ? 'left' : 'right') : 'down', 0);
              ctx.restore();
            }
            drawFxOver(ctx, fxe, pr, t, pz);
            continue;
          }
        }
        // Ciclo de caminar de 4 cuadros (contacto, en el aire, contacto, en el aire)
        const step = walkStepClassic(p);
        ctx.globalAlpha = p.status === 'away' ? 0.6 : 1;
        const seat = !p.moving && seatAt(f, Math.round(p.rx), Math.round(p.ry));
        // Mascota: sigue al personaje con un poco de retraso
        const pet = u?.avatar?.pet;
        if (pet && pet !== 'none') {
          const back = { up: [0.7, 0.6], down: [-0.7, -0.3], left: [0.8, 0.2], right: [-0.8, 0.2] }[p.dir] || [0.7, 0.2];
          const pf = petStep(id, p, t); // comer, pelota, caricias, trucos (lib/petFx.js)
          const tx = pf?.tx ?? p.rx + back[0];
          const ty = pf?.ty ?? p.ry + back[1];
          if (p.petX == null || Math.hypot(tx - p.petX, ty - p.petY) > (pf ? 9 : 4)) { p.petX = tx; p.petY = ty; }
          const k = Math.min(1, Math.min(0.1, (t - (p.petT || t)) / 1000) * (pf?.speed || 5));
          p.petT = t;
          const pdx = (tx - p.petX) * k;
          p.petX += pdx; p.petY += (ty - p.petY) * k;
          if (Math.abs(pdx) > 0.003) p.petFace = pdx > 0 ? 1 : -1;
          const petMoving = pf?.moving || Math.hypot(tx - p.petX, ty - p.petY) > 0.08;
          drawPetFxUnder(ctx, id, p, t);
          drawPet(ctx, pet, u.avatar.petColor, (p.petX + 0.5) * T, (p.petY + 1) * T - 3, (petMoving ? null : pf?.face) || p.petFace || 1, t / 1000, petMoving, pf?.fx);
          drawPetFxOver(ctx, id, p, t, p.petFace || 1);
        }
        // Parpadeo cada pocos segundos (cada quien a su ritmo) y saltito al reaccionar
        const blink = !p.moving && (t + Number(id) * 1337) % 4200 < 140;
        const re = office.reactions[id];
        const hopY = re && re.until - performance.now() > 3000 ? -Math.abs(Math.sin((re.until - performance.now()) / 60)) * 4 : 0;
        // Acción en curso (bailar, saludar, guiño…)
        let em = !p.moving && office.emotes[id];
        if (em && em.until < t) { delete office.emotes[id]; em = null; }
        const emOther = em && em.target != null ? office.players[em.target] : null;
        const emPose = em ? emotePose(em, t, p, emOther) : null;
        // Sentado (bailar, saltar, girar o abrazar lo ponen de pie; las demás acciones se hacen sentado)
        const sitting = seat && !(em && STAND_EMOTES.has(em.kind));
        const sp = sitting ? seatPose(seat, Math.round(p.rx), Math.round(p.ry)) : null;
        const sitDX = sp ? sp.dx : 0, sitDY = sp ? sp.dy : 0;
        const ax = (p.rx + 0.5) * T + sitDX + (emPose?.dx || 0), ay = (p.ry + 1) * T - 2 + hopY + sitDY + (emPose?.dy || 0);
        const ext = { view: sitting || emPose?.dir ? null : p.view, walk: emPose?.step ? emPose.step * 2 - 1 : walkStepV2(p), breathe: breathing(t, id), talk: (office.bubbles[id]?.until || 0) - t > 4600 && Math.floor(t / 140) % 2 === 0 };
        drawAvatar(ctx, ax, ay, u?.avatar, (sitting && seat.dir) || emPose?.dir || p.dir, emPose?.step || step, !!sitting, blink || !!emPose?.blink, emPose?.pose || null, ext);
        if (em) drawEmoteFx(ctx, em, t, ax, ay - 46 + (sitting ? 4 : 0), { ...p, id: Number(id) }, emOther && { ...emOther, id: Number(em.target) });
        if (u?.birthday && u.birthday === todayCached()) drawPartyHat(ctx, ax, ay, !!sitting);
        // Lo que del asiento queda entre el personaje y la cámara (respaldo por detrás, brazo cercano…)
        if (sp?.front) {
          ctx.save();
          ctx.beginPath();
          ctx.rect(sp.front.x, sp.front.y, sp.front.w, sp.front.h);
          ctx.clip();
          drawObject(ctx, seat.obj);
          ctx.restore();
        }
        ctx.globalAlpha = 1;
      }

      drawStageSpots(ctx, f, t, T, viewRect); // reflectores del escenario
      // Fantasmas, murciélagos y un tinte morado de temporada
      if (hw) drawSeasonSky(ctx, hw, t, viewRect, f);

      // Luz según la hora: tinte y brillos de lámparas, neón y pantallas
      const light = ambRef.current.light;
      if (light) {
        ctx.fillStyle = light.color;
        ctx.fillRect(0, 0, f.W * T, f.H * T);
        if (light.night > 0) {
          ctx.save();
          ctx.globalCompositeOperation = 'lighter';
          ctx.globalAlpha = light.night * 0.55;
          for (const o of f.objects) {
            if (!(o.type in GLOWS)) continue;
            const { w: ow, h: oh } = objSize(o);
            const cx = (o.x + ow / 2) * T, cy = (o.y + oh / 2) * T;
            const col = GLOWS[o.type] || o.color || CATALOG[o.type].color || themeColors().accent;
            const r = Math.max(ow, oh) * T * 1.1 + 18;
            const g = ctx.createRadialGradient(cx, cy, 2, cx, cy, r);
            g.addColorStop(0, rgba(col, .55)); g.addColorStop(1, rgba(col, 0));
            ctx.fillStyle = g;
            ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
          }
          ctx.restore();
        }
      }

      // Burbuja del escritorio: sigue al escritorio aunque se mueva la cámara y se va
      // en cuanto el mouse ya no está ni sobre el escritorio ni sobre la burbuja
      const hd = hoverRef.current;
      if (hd) {
        const { w: hw } = objSize(hd.object);
        const hp = worldToScreen(hd.object.x + hw / 2, hd.object.y - 0.45);
        if (tipRef.current) { tipRef.current.style.left = `${hp.x}px`; tipRef.current.style.top = `${hp.y}px`; }
        const hptr = input.current.pointer;
        const hw2 = hptr && screenToWorld(hptr.x, hptr.y);
        const still = hw2 && inRect(hd.zone, Math.floor(hw2.x), Math.floor(hw2.y));
        if (em || (!still && !tipOver.current)) hideTipSoon();
        else keepTip();
      }

      // Mi escritorio fuera de la pantalla: una flechita en el borde que apunta hacia él
      const ind = deskIndRef.current;
      if (ind) {
        const myDeskId = Object.entries(f.claims || {}).find(([, uid]) => uid === meU.id)?.[0];
        const md = myDeskId && f.desks.find((d) => d.id === Number(myDeskId));
        let show = false;
        if (md && !em) {
          const { w: dw, h: dh } = objSize(md.object);
          const c = worldToScreen(md.object.x + dw / 2, md.object.y + dh / 2);
          const m = 56;
          if (c.x < 0 || c.y < 0 || c.x > v.w || c.y > v.h) {
            show = true;
            const cx = v.w / 2;
            const cy = v.h / 2;
            const dx = c.x - cx;
            const dy = c.y - cy;
            const k = Math.min((cx - m) / Math.abs(dx || 1e-6), (cy - m) / Math.abs(dy || 1e-6));
            ind.style.left = `${cx + dx * k}px`;
            ind.style.top = `${cy + dy * k}px`;
            ind.style.setProperty('--ang', `${Math.atan2(dy, dx)}rad`);
          }
        }
        ind.style.display = show ? 'flex' : 'none';
      }

      // Etiquetas (en coordenadas de pantalla para que el texto sea nítido)
      ctx.setTransform(v.dpr, 0, 0, v.dpr, 0, 0);
      if (hw) drawSeasonScreen(ctx, hw, t, v); // nieve, fuegos artificiales…
      ctx.textBaseline = 'middle';
      ctx.textAlign = 'left'; // algún dibujo de temporada lo deja centrado
      // Nombres de áreas
      if (v.zoom >= 0.3) {
        ctx.font = '700 12px "Public Sans", system-ui, sans-serif';
        const nowTs = Date.now();
        const evs = office.state.events;
        for (const a of f.areas) {
          const p = worldToScreen(a.x + 0.3, a.y + 0.45);
          const label = a.closed ? `🔒 ${a.name}` : a.name;
          const w = ctx.measureText(label).width + 26;
          ctx.save();
          ctx.shadowColor = 'rgba(0,0,0,.25)'; ctx.shadowBlur = 6; ctx.shadowOffsetY = 1;
          ctx.fillStyle = rgba(themeColors().ink, .82);
          ctx.beginPath(); ctx.roundRect(p.x, p.y - 11, w, 22, 11); ctx.fill();
          ctx.restore();
          ctx.fillStyle = a.color || themeColors().accent;
          ctx.beginPath(); ctx.arc(p.x + 11, p.y, 3.5, 0, Math.PI * 2); ctx.fill();
          ctx.fillStyle = '#fff';
          ctx.fillText(label, p.x + 19, p.y + 1);
          // Salas: Libre / Ocupada · N / Cerrada · N
          if (a.private || a.closed) {
            let n = 0;
            for (const q of Object.values(office.players)) if (q.floorId === f.id && q.x >= a.x && q.y >= a.y && q.x < a.x + a.w && q.y < a.y + a.h) n++;
            const st = a.closed ? `Cerrada · ${n}` : n ? `Ocupada · ${n}` : 'Libre';
            ctx.font = '700 10px "Public Sans", system-ui, sans-serif';
            const sw = ctx.measureText(st).width + 18;
            ctx.fillStyle = 'rgba(255,255,255,.95)';
            ctx.beginPath(); ctx.roundRect(p.x + w + 4, p.y - 9, sw, 18, 9); ctx.fill();
            ctx.fillStyle = a.closed ? '#e63946' : n ? '#f59f00' : '#2fb67c';
            ctx.beginPath(); ctx.arc(p.x + w + 12, p.y, 3, 0, Math.PI * 2); ctx.fill();
            ctx.fillStyle = '#1d1d22';
            ctx.fillText(st, p.x + w + 18, p.y + 0.5);
            ctx.font = '700 12px "Public Sans", system-ui, sans-serif';
          }
          // Reunión apartada en esta sala: ahora o en los próximos 30 minutos
          const ev = evs.find((e) => (e.areaId === a.id) && e.endsAt > nowTs && e.startsAt - nowTs < 30 * 60e3);
          if (ev) {
            const busy = ev.startsAt <= nowTs;
            const hhmm = (t) => new Date(t).toLocaleTimeString('es-MX', { hour: 'numeric', minute: '2-digit' });
            const txt = busy ? `● Ocupada · ${ev.title} · hasta ${hhmm(ev.endsAt)}` : `◷ ${hhmm(ev.startsAt)} · ${ev.title}`;
            const t2 = txt.length > 46 ? `${txt.slice(0, 45)}…` : txt;
            const w2 = ctx.measureText(t2).width + 14;
            ctx.fillStyle = busy ? 'rgba(230,57,70,.92)' : 'rgba(255,204,0,.95)';
            ctx.beginPath(); ctx.roundRect(p.x, p.y + 13, w2, 20, 10); ctx.fill();
            ctx.fillStyle = busy ? '#fff' : '#101010';
            ctx.fillText(t2, p.x + 7, p.y + 24);
          }
        }
      }
      // Pista "X para abrir" junto al objeto interactivo más cercano
      const near = !em && mine ? nearInteractive(f, mine) : null;
      if (near) {
        if (office.pendingInteract === near.o.id) { office.pendingInteract = null; interact(near.o); }
        const { w: ow } = sizeOf(near.o);
        const hp = worldToScreen(near.o.x + ow / 2, near.o.y - 0.6);
        const txt = near.o.label || zombieLabel(near.o) || GAME_LABELS[near.o.type] || INTERACT_LABELS[near.kind];
        ctx.font = '600 12px "Public Sans", system-ui, sans-serif';
        const tw = ctx.measureText(txt).width + 34;
        ctx.fillStyle = 'rgba(16,16,16,.88)';
        ctx.beginPath(); ctx.roundRect(hp.x - tw / 2, hp.y - 22, tw, 22, 11); ctx.fill();
        ctx.fillStyle = '#fff';
        ctx.beginPath(); ctx.roundRect(hp.x - tw / 2 + 6, hp.y - 18, 16, 14, 3); ctx.fill();
        ctx.fillStyle = '#101010'; ctx.font = '700 10px "Public Sans", sans-serif';
        ctx.fillText('X', hp.x - tw / 2 + 10.5, hp.y - 10.5);
        ctx.fillStyle = '#fff'; ctx.font = '600 12px "Public Sans", system-ui, sans-serif';
        ctx.fillText(txt, hp.x - tw / 2 + 27, hp.y - 10.5);
      }
      const now = performance.now();
      ctx.font = '600 12px "Public Sans", system-ui, sans-serif';
      for (const [id, p] of list) {
        const u = us[id];
        if (!u) continue;
        const sp = worldToScreen(p.rx + 0.5, p.ry);
        const name = `${u.birthday && u.birthday === todayCached() ? '🎂 ' : ''}${u.shift ? `🖥️ ${u.displayName}` : u.displayName}`;
        const w = ctx.measureText(name).width + 24;
        const y = sp.y - 34 * v.zoom / 1.5 + 4;
        const isMe = Number(id) === meU.id;
        ctx.fillStyle = isMe ? rgba(themeColors().accent, .95) : rgba(themeColors().ink, .86);
        ctx.beginPath(); ctx.roundRect(sp.x - w / 2, y - 11, w, 22, 6); ctx.fill();
        ctx.fillStyle = p.status === 'busy' ? (themeColors().brand === 'gtahub' ? '#FFCC00' : '#FF8A3D') : p.status === 'away' ? '#adb5bd' : (themeColors().brand === 'gtahub' ? '#3DDC84' : '#2fd36b');
        ctx.beginPath(); ctx.arc(sp.x - w / 2 + 10, y, 4, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = isMe ? themeColors().onAccent : '#fff'; // texto legible sobre el acento del tema
        ctx.fillText(name, sp.x - w / 2 + 18, y + 1);
        drawLiveTag(ctx, id, sp.x + w / 2 + 3, y); // placas: LIVE de streamers (lib/badges.js)
        // Etiquetas EN VIVO (transmite su pantalla) y ● REC (está grabando: lo ve toda la sala)
        const tags = [p.screen && ['EN VIVO', '#e63946', '#fff'], (isMe ? office.state.recording : p.recording) && ['● REC', '#fff', '#e63946'], inNotesRoom(office.state, f, p) && ['📝 NOTAS', '#FFCC00', '#141414'],
          stageAt(f, p.x, p.y) && ['🎤 En el escenario', '#FE3377', '#fff'], office.state.stage?.queue?.includes(Number(id)) && ['✋ Mano levantada', '#FFCC00', '#141414']].filter(Boolean);
        if (tags.length) {
          ctx.font = '800 9px "Public Sans", system-ui, sans-serif';
          const ws = tags.map(([t]) => ctx.measureText(t).width + 10);
          let tx = sp.x - (ws.reduce((a, w) => a + w, 0) + (tags.length - 1) * 4) / 2;
          tags.forEach(([t, bg, fg], i) => {
            ctx.fillStyle = bg;
            ctx.beginPath(); ctx.roundRect(tx, y - 27, ws[i], 14, 4); ctx.fill();
            ctx.fillStyle = fg;
            ctx.fillText(t, tx + 5, y - 19.5);
            tx += ws[i] + 4;
          });
          ctx.font = '600 12px "Public Sans", system-ui, sans-serif';
        }
        // Nombre de la mascota, chiquito debajo de ella
        const petName = u.avatar?.petName;
        if (petName && u.avatar?.pet && u.avatar.pet !== 'none' && p.petX != null && v.zoom >= 0.9) {
          ctx.font = '600 10px "Public Sans", system-ui, sans-serif';
          const pp = worldToScreen(p.petX + 0.5, p.petY + 1.05);
          const pw = ctx.measureText(petName).width + 10;
          ctx.fillStyle = 'rgba(16,16,16,.6)';
          ctx.beginPath(); ctx.roundRect(pp.x - pw / 2, pp.y - 7, pw, 14, 7); ctx.fill();
          ctx.fillStyle = '#fff';
          ctx.fillText(petName, pp.x - pw / 2 + 5, pp.y + 0.5);
          ctx.font = '600 12px "Public Sans", system-ui, sans-serif';
        }
        // Estado personalizado (🍔 Comiendo, 🎧 Concentrado…) arriba del nombre
        if (u.statusText && v.zoom >= 0.55 && !(office.bubbles[id]?.until > now)) {
          ctx.font = '500 11px "Public Sans", system-ui, sans-serif';
          let st = u.statusText;
          while (ctx.measureText(st).width > 150 && st.length > 3) st = `${st.slice(0, -2)}…`;
          const sw = ctx.measureText(st).width + 14;
          const sy = y - (tags.length ? 42 : 26);
          ctx.fillStyle = 'rgba(255,255,255,.94)';
          ctx.beginPath(); ctx.roundRect(sp.x - sw / 2, sy - 9, sw, 18, 9); ctx.fill();
          ctx.fillStyle = '#1d1d22';
          ctx.fillText(st, sp.x - sw / 2 + 7, sy + 1);
          ctx.font = '600 12px "Public Sans", system-ui, sans-serif';
        }
        // Globito con el último mensaje del chat de la sala
        const bub = office.bubbles[id];
        if (bub && bub.until > now) {
          ctx.save();
          ctx.globalAlpha = Math.min(1, (bub.until - now) / 600);
          ctx.font = '500 12px "Public Sans", system-ui, sans-serif';
          const bw = Math.min(220, ctx.measureText(bub.text).width + 16);
          const by = y - (p.screen ? 46 : 32);
          ctx.fillStyle = '#fff';
          ctx.strokeStyle = 'rgba(0,0,0,.15)';
          ctx.beginPath(); ctx.roundRect(sp.x - bw / 2, by - 12, bw, 24, 10); ctx.fill(); ctx.stroke();
          ctx.beginPath(); ctx.moveTo(sp.x - 5, by + 12); ctx.lineTo(sp.x + 5, by + 12); ctx.lineTo(sp.x, by + 18); ctx.closePath(); ctx.fill();
          ctx.fillStyle = '#1d1d22';
          let t = bub.text;
          while (ctx.measureText(t).width > bw - 14 && t.length > 3) t = `${t.slice(0, -2)}…`;
          ctx.fillText(t, sp.x - bw / 2 + 8, by + 1);
          ctx.restore();
          ctx.font = '600 12px "Public Sans", system-ui, sans-serif';
        }
        if (p.mic) {
          ctx.fillStyle = '#2fd36b';
          ctx.beginPath(); ctx.arc(sp.x + w / 2 + 6, y, 3, 0, Math.PI * 2); ctx.fill();
        }
        const r = office.reactions[id];
        if (r && r.until > now) {
          const k = Math.min(1, (r.until - now) / 500);
          ctx.globalAlpha = k;
          ctx.font = '26px system-ui';
          ctx.fillText(r.emoji, sp.x - 14, y - 30 - (1 - (r.until - now) / 3500) * 16);
          ctx.font = '600 12px "Public Sans", system-ui, sans-serif';
          ctx.globalAlpha = 1;
        }
      }
    };

    raf = requestAnimationFrame(loop);
    return () => { cancelAnimationFrame(raf); setMusic(false); };
  }, [perf, screenToWorld, worldToScreen]);

  // Barra flotante del objeto seleccionado
  useEffect(() => {
    if (!editMode || !ed.selected || !floor) { setToolbar(null); setColorOpen(false); return; }
    const o = floor.objects.find((x) => x.id === ed.selected);
    if (!o) { setToolbar(null); return; }
    const tick = () => {
      const { w } = objSize(o);
      const p = worldToScreen(o.x + w / 2, o.y);
      setToolbar({ x: p.x, y: p.y - 18 * view.current.zoom, obj: o });
    };
    tick();
    const id = setInterval(tick, 100);
    return () => clearInterval(id);
  }, [editMode, ed.selected, floor, worldToScreen]);

  // ---------- Puntero ----------
  const tileAt = (e) => {
    const r = canvasRef.current.getBoundingClientRect();
    return screenToWorld(e.clientX - r.left, e.clientY - r.top);
  };

  const editableFilter = (o) => {
    if (stateRef.current.editMode === 'build') return true;
    const role = editor.editRole(floor, o, me);
    if (role === 'leader') return true;
    return !!role && (CATALOG[o.type]?.kind === 'decor' || CATALOG[o.type]?.rotatable);
  };

  // Zoom con dos dedos (celular / tableta)
  const touches = useRef(new Map());
  const pinchStart = (e) => {
    if (e.pointerType !== 'touch') return false;
    touches.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (touches.current.size === 2) {
      const [a, b] = [...touches.current.values()];
      input.current.pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), zoom: view.current.zoom };
      office.pathTarget = null;
      return true;
    }
    return false;
  };
  const pinchMove = (e) => {
    if (!touches.current.has(e.pointerId)) return false;
    touches.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const pz = input.current.pinch;
    if (!pz || touches.current.size < 2) return false;
    const [a, b] = [...touches.current.values()];
    const z = Math.min(3, Math.max(0.25, pz.zoom * (Math.hypot(a.x - b.x, a.y - b.y) / pz.d)));
    view.current.zoom = z;
    setZoomPct(Math.round(z * 100));
    return true;
  };
  const pinchEnd = (e) => {
    touches.current.delete(e.pointerId);
    if (touches.current.size < 2) input.current.pinch = null;
  };

  const onPointerDown = (e) => {
    if (gameOpen()) return;
    if (pinchStart(e)) return;
    if (e.button !== 0 || !floor) return;
    const w = tileAt(e);
    const tx = Math.floor(w.x), ty = Math.floor(w.y);
    if (!editMode) {
      const pj = projRef.current.find((r) => inRect(r, w.x, w.y));
      if (pj) { office.watch(pj.id); return; }
    }

    if (editMode) {
      if (ed.placing) {
        const pos = editor.snapFor(ed.placing.type, w.x, w.y);
        editor.addObject(floor.id, { ...ed.placing, ...pos }).catch(() => {});
        return;
      }
      if (ed.tool === 'area') {
        input.current.areaDrag = { x0: tx, y0: ty, x1: tx, y1: ty };
        canvasRef.current.setPointerCapture(e.pointerId);
        return;
      }
      const o = editor.objectAt(floor, w.x, w.y, editableFilter);
      office.set((st) => ({ editor: { ...st.editor, selected: o?.id || null } }));
      if (o) {
        input.current.drag = { obj: o, ox: w.x - o.x, oy: w.y - o.y, x: o.x, y: o.y, moved: false };
      } else {
        // Arrastrar el fondo desplaza el mapa
        input.current.pan = { sx: e.clientX, sy: e.clientY, camX: view.current.camX, camY: view.current.camY };
      }
      canvasRef.current.setPointerCapture(e.pointerId);
      return;
    }

    // Clic en una mascota (o lanzar la pelota) → lib/petFx.js
    if (petClick(floor.id, w)) return;
    // Clic en una persona → tarjeta de perfil
    for (const [id, p] of Object.entries(office.players)) {
      if (p.floorId !== floor.id || p.game) continue;
      if (w.x >= p.rx && w.x < p.rx + 1 && w.y >= p.ry - 0.2 && w.y < p.ry + 1) {
        // Si transmite y está en tu sala, abre su pantalla
        if (p.screen && office.state.talkingWith.includes(Number(id))) office.watch(Number(id));
        else office.set({ profileCard: Number(id) });
        return;
      }
    }
    // Clic en un objeto interactivo: abrirlo si estás cerca o caminar hasta él
    const io = [...floor.objects, ...seasonObjects(floor)].find((o) => (o.season || CATALOG[o.type]?.interactive) && inRect({ x: o.x, y: o.y - 0.5, ...sizeOf(o), h: sizeOf(o).h + 0.5 }, w.x, w.y));
    if (io) {
      const mine = office.players[me.id];
      const near = mine && nearInteractive(floor, mine);
      if (near?.o.id === io.id) { interact(io); return; }
      office.pendingInteract = io.id;
    } else office.pendingInteract = null;
    // Clic en el mapa → caminar hasta ahí
    office.pathTarget = { x: tx, y: ty };
  };

  const onPointerMove = (e) => {
    if (gameOpen()) return;
    if (pinchMove(e)) return;
    if (!floor) return;
    const r = canvasRef.current.getBoundingClientRect();
    input.current.pointer = { x: e.clientX - r.left, y: e.clientY - r.top };
    const pan = input.current.pan;
    if (pan) {
      view.current.camX = pan.camX - (e.clientX - pan.sx) / view.current.zoom;
      view.current.camY = pan.camY - (e.clientY - pan.sy) / view.current.zoom;
      return;
    }
    const w = tileAt(e);
    if (input.current.areaDrag) {
      Object.assign(input.current.areaDrag, { x1: Math.floor(w.x), y1: Math.floor(w.y) });
      return;
    }
    const drag = input.current.drag;
    if (drag) {
      const pos = editor.snapFor(drag.obj.type, w.x - drag.ox + objSize(drag.obj).w / 2, w.y - drag.oy + objSize(drag.obj).h / 2);
      if (pos.x !== drag.x || pos.y !== drag.y) { drag.moved = true; drag.x = pos.x; drag.y = pos.y; }
      return;
    }
    if (editMode) {
      input.current.hover = ed.placing ? null : editor.objectAt(floor, w.x, w.y, editableFilter);
      canvasRef.current.style.cursor = ed.placing || ed.tool === 'area' ? 'crosshair' : input.current.hover ? 'grab' : 'default';
      return;
    }
    const d = deskAt(floor, Math.floor(w.x), Math.floor(w.y));
    const over = d && inRect({ ...d.zone, y: d.zone.y + 1, h: d.zone.h - 2 }, Math.floor(w.x), Math.floor(w.y)) ? d : null;
    if (over) {
      keepTip();
      if (hoverRef.current?.id !== over.id) {
        // La burbuja va anclada encima del escritorio, no donde está el mouse
        const { w: ow } = objSize(over.object);
        const p = worldToScreen(over.object.x + ow / 2, over.object.y - 0.45);
        hoverRef.current = over;
        setHoverDesk({ desk: over, x: p.x, y: p.y, area: areaAt(floor, over.object.x, over.object.y)?.name || '' });
      }
    } else hideTipSoon();
    canvasRef.current.style.cursor = over ? 'pointer' : 'default';
  };

  const onPointerUp = async (e) => {
    if (e) pinchEnd(e);
    input.current.pan = null;
    const ad = input.current.areaDrag;
    if (ad) {
      input.current.areaDrag = null;
      const rect = normRect(ad);
      if (rect.w >= 2 && rect.h >= 2) office.set((st) => ({ editor: { ...st.editor, newArea: rect } }));
      return;
    }
    const drag = input.current.drag;
    input.current.drag = null;
    if (drag?.moved) {
      const o = drag.obj;
      if (stateRef.current.editMode === 'decor') {
        const d = editor.myDesk(floor, me.id);
        if (d && o.deskId === d.id && !editor.insideZone({ ...o, x: drag.x, y: drag.y }, d.decorZone || d.zone)) {
          office.toast({ title: 'La decoración va sobre tu escritorio', kind: 'error' });
          return;
        }
      }
      editor.updateObject(o, { x: drag.x, y: drag.y }).catch(() => {});
    }
  };

  const onWheel = (e) => {
    if (gameOpen()) return;
    if (!e.ctrlKey && !e.metaKey && !editMode) {
      zoomBy(e.deltaY < 0 ? 1.1 : 1 / 1.1);
      return;
    }
    if (editMode && !e.ctrlKey) {
      // En modo edición la rueda desplaza el mapa
      view.current.camX += e.deltaX / view.current.zoom;
      view.current.camY += e.deltaY / view.current.zoom;
      return;
    }
    zoomBy(e.deltaY < 0 ? 1.1 : 1 / 1.1);
  };

  const zoomBy = (k) => {
    const z = Math.min(3, Math.max(0.25, view.current.zoom * k));
    view.current.zoom = z;
    if (k > 1) view.current.overview = null;
    setZoomPct(Math.round(z * 100));
  };

  const fitMap = () => {
    if (!floor) return;
    const v = view.current;
    const z = Math.max(0.25, Math.min(v.w / (floor.W * T), v.h / (floor.H * T)) * 0.98);
    v.zoom = z;
    const mine = office.players[me.id];
    if (mine) v.overview = { x: mine.x, y: mine.y };
    setZoomPct(Math.round(z * 100));
  };

  const claim = async (deskId) => {
    try {
      await api.post(`/desks/${deskId}/claim`);
      office.toast({ title: 'Ahora este es tu escritorio. ¡Decóralo!' });
      hideTip();
    } catch (e) {
      office.toast({ title: e.message, kind: 'error' });
    }
  };

  const myAway = users[me.id]?.status === 'away';
  const space = useOffice((s) => s.space);
  const roomHere = space?.startsWith('area:') ? floor?.areas.find((a) => `area:${a.id}` === space) : null;
  const hoverOwner = hoverDesk && users[floor?.claims[hoverDesk.desk.id]];
  const isMyDesk = hoverDesk && floor?.claims[hoverDesk.desk.id] === me.id;

  return (
    <div className={`map-wrap ${myAway ? 'is-away' : ''}`} ref={wrapRef} style={{ display: active ? 'block' : 'none' }}>
      {myAway && (
        <div className="away-veil">
          <div className="away-bar">
            <Avatar user={{ ...users[me.id], online: true }} size={38} />
            <div className="away-who">
              <b>{users[me.id]?.displayName}</b>
              <span>Ausente</span>
            </div>
            <button className="btn primary" onClick={() => office.setStatus('active')}>Volver a la oficina</button>
          </div>
        </div>
      )}
      <canvas
        ref={canvasRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={pinchEnd}
        onPointerLeave={() => { input.current.pointer = null; hideTipSoon(); }}
        onWheel={onWheel}
        onContextMenu={(e) => { e.preventDefault(); if (editMode) office.set((st) => ({ editor: { ...st.editor, placing: null, tool: 'select' } })); }}
      />

      <VideoStrip />
      <RoomChat />
      <ScreenStage />
      <PetPanel />
      <SeasonPill />

      {hoverDesk && !editMode && (
        <div className="desk-tip" ref={tipRef} style={{ left: hoverDesk.x, top: hoverDesk.y }}
          onMouseEnter={() => { tipOver.current = true; keepTip(); }} onMouseLeave={() => { tipOver.current = false; hideTipSoon(); }}>
          {hoverOwner ? <Avatar user={hoverOwner} size={28} /> : <span className="desk-tip-ico"><Armchair size={16} /></span>}
          <div className="desk-tip-text">
            <b>{isMyDesk ? 'Tu escritorio' : hoverOwner ? hoverOwner.displayName : 'Escritorio libre'}</b>
            <span>{hoverDesk.area || 'Oficina'}{hoverOwner && !isMyDesk ? ` · ${hoverOwner.online ? 'En línea' : 'Desconectado'}` : ''}</span>
          </div>
          {!hoverOwner && (
            <button className="btn tiny primary" onClick={() => claim(hoverDesk.desk.id)}>Reclamar</button>
          )}
          {isMyDesk && (
            <button className="btn tiny" onClick={() => { hideTip(); office.set({ editMode: 'decor' }); }}><Brush size={12} /> Decorar</button>
          )}
          {hoverOwner && !isMyDesk && hoverOwner.online && (
            <button className="btn tiny" onClick={() => { hideTip(); office.goTo(hoverOwner.id); }}>Ir</button>
          )}
        </div>
      )}

      {toolbar && (
        <div className="obj-toolbar" style={{ left: toolbar.x, top: toolbar.y }}>
          <span className="obj-name">{CATALOG[toolbar.obj.type]?.name}</span>
          {CATALOG[toolbar.obj.type]?.colorable && (
            <div className="color-pick">
              <button className="icon-btn" onClick={() => setColorOpen(!colorOpen)} title="Color">
                <span className="swatch" style={{ background: toolbar.obj.color || CATALOG[toolbar.obj.type].color }} />
              </button>
              {colorOpen && (
                <div className="swatches">
                  {COLORS.map((c) => (
                    <button key={c} style={{ background: c }} onClick={() => { editor.updateObject(toolbar.obj, { color: c }).catch(() => {}); setColorOpen(false); }} />
                  ))}
                </div>
              )}
            </div>
          )}
          {CATALOG[toolbar.obj.type]?.kind === 'furniture' && (
            <button className="icon-btn" title="Rotar (R)" onClick={() => editor.updateObject(toolbar.obj, { rot: ((toolbar.obj.rot || 0) + 1) % 4 }).catch(() => {})}>
              <RotateCw size={16} />
            </button>
          )}
          {(editMode === 'build' || CATALOG[toolbar.obj.type]?.kind === 'decor') && (
            <button className="icon-btn danger" title="Borrar (Supr)" onClick={() => editor.deleteObject(floor.id, toolbar.obj).catch(() => {})}>
              <Trash2 size={16} />
            </button>
          )}
        </div>
      )}

      {editMode && <Decorator />}

      <div className="map-tools">
        {me.role === 'admin' && (
          <button className={`icon-btn ${editMode === 'build' ? 'active' : ''}`} title="Editar oficina" onClick={() => office.set({ editMode: editMode === 'build' ? null : 'build' })}>
            <Armchair size={18} />
          </button>
        )}
        <button className={`icon-btn ${editMode === 'decor' ? 'active' : ''}`} title="Decorar mi lugar o mi departamento" onClick={() => office.set({ editMode: editMode === 'decor' ? null : 'decor' })}>
          <Palette size={18} />
        </button>
        <div className="sep" />
        <button className="icon-btn" title="Acercar" onClick={() => zoomBy(1.2)}><Plus size={18} /></button>
        <div className="zoom-pct">{zoomPct}%</div>
        <button className="icon-btn" title="Alejar" onClick={() => zoomBy(1 / 1.2)}><Minus size={18} /></button>
        <button className="icon-btn" title="Ver todo el mapa" onClick={fitMap}><MapIcon size={18} /></button>
      </div>

      <button ref={deskIndRef} className="desk-ind" style={{ display: 'none' }} onClick={() => office.goHome()} title="Ir a mi escritorio (Ctrl+D)">
        <span className="desk-ind-arrow" aria-hidden="true" />
        <Armchair size={14} /> Mi escritorio
      </button>
      {roomHere && !editMode && (
        <div className={`room-pill ${roomHere.closed ? 'closed' : ''}`}>
          {roomHere.closed ? <Lock size={13} /> : <Users size={13} />}
          <span><b>{roomHere.name}</b> · {roomHere.closed ? 'Cerrada, solo se oye dentro' : 'Solo se oye dentro'}</span>
          <button className="btn tiny" onClick={() => office.setRoomClosed(roomHere.id, !roomHere.closed)}>
            {roomHere.closed ? <><Unlock size={12} /> Abrir</> : <><Lock size={12} /> Cerrar</>}
          </button>
        </div>
      )}
      <MeetingNotes room={roomHere} hidden={!!editMode} />
      {!myAway && !editMode && <StagePanel />}
      <JukeboxLayer hidden={!!editMode} below={!!roomHere} />
      {!myAway && !editMode && <Minimap floor={floor} staticRef={staticRef} view={view} />}
      {!myAway && <ControlBar />}
    </div>
  );
}

function normRect({ x0, y0, x1, y1 }) {
  return { x: Math.min(x0, x1), y: Math.min(y0, y1), w: Math.abs(x1 - x0) + 1, h: Math.abs(y1 - y0) + 1 };
}
