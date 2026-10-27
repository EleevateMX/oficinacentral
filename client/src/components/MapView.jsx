import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Plus, Minus, Map as MapIcon, RotateCw, Trash2, Palette, Armchair, Brush } from 'lucide-react';
import { office, useOffice } from '../lib/store.js';
import { TILE, isWalkable, findPath, deskAt, inRect, PROXIMITY_RADIUS, talkSpace, areaAt } from '@shared/map.js';
import { videoFor, activeScreens } from '../lib/screens.js';
import { daylight, GLOWS, setMusic, footstep, MUSIC_AREAS } from '../lib/ambience.js';
import { CATALOG, COLORS, objSize, seatAt } from '@shared/catalog.js';
import { drawFloorLayer, drawObject, sortObjects, drawAvatar, setRenderBrand } from '../lib/render.js';
import { mapBrand } from '../lib/themes.js';
import * as editor from '../lib/editor.js';
import { api } from '../lib/api.js';
import ControlBar from './ControlBar.jsx';
import VideoStrip from './VideoStrip.jsx';
import { ScreenStage } from './Streams.jsx';
import RoomChat from './RoomChat.jsx';
import Decorator from './Decorator.jsx';
import { Avatar } from './ui.jsx';

const T = TILE;
const STEP_MS = 135;
const INTERACT_LABELS = { board: 'Abrir pizarrón', notices: 'Ver anuncios', screen: 'Ver pantalla' };

// Objeto interactivo más cercano (pizarrón, tablero, pantalla) a menos de 2 casillas
function nearInteractive(f, me) {
  let best = null;
  for (const o of f.objects) {
    const kind = CATALOG[o.type]?.interactive;
    if (!kind) continue;
    const { w, h } = objSize(o);
    const dx = Math.max(o.x - me.x, 0, me.x - (o.x + w - 1));
    const dy = Math.max(o.y - me.y, 0, me.y - (o.y + h - 1));
    const d = Math.max(dx, dy);
    if (d <= 2 && (!best || d < best.d)) best = { o, kind, d };
  }
  return best;
}

export function interact(o) {
  const kind = CATALOG[o.type]?.interactive;
  if (kind === 'board') office.set({ modal: { type: 'board', objectId: o.id } });
  else if (kind === 'notices') office.set({ modal: { type: 'notices' } });
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
    themeCache = { t: now, accent: read('--accent', themeCache.accent), ink: read('--ink', themeCache.ink), brand: document.documentElement.dataset.brand };
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
  const view = useRef({ zoom: 1.5, camX: 0, camY: 0, w: 0, h: 0, dpr: 1 });
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
  // Se oculta con un pequeño retraso para poder llegar al botón
  const hideTipSoon = () => {
    clearTimeout(tipTimer.current);
    tipTimer.current = setTimeout(() => { hoverRef.current = null; setHoverDesk(null); }, 350);
  };
  const [toolbar, setToolbar] = useState(null);
  const [colorOpen, setColorOpen] = useState(false);
  const [zoomPct, setZoomPct] = useState(150);

  const stateRef = useRef({});
  const projRef = useRef([]);
  const ambRef = useRef({});
  stateRef.current = { floor, me, users, editMode, ed, active };

  const config = useOffice((s) => s.config);

  // Capa estática (suelos, muros, objetos)
  useEffect(() => {
    if (!floor) return;
    setRenderBrand(mapBrand(config));
    const c = document.createElement('canvas');
    c.width = floor.W * T;
    c.height = floor.H * T;
    const ctx = c.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    drawFloorLayer(ctx, floor);
    for (const o of sortObjects(floor.objects)) drawObject(ctx, o);
    staticRef.current = c;
  }, [floor, config?.theme, config?.accent, config?.officeName]);

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
      if (!on || isTyping()) return;
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
      const dir = KEYS[e.code];
      if (dir) {
        e.preventDefault();
        const h = input.current.held;
        if (!h.includes(dir)) h.push(dir);
        if (!e.repeat) input.current.tap = dir;
        input.current.path = [];
      }
      if (/^[1-6]$/.test(e.key) && !em) office.react(['👋', '👍', '❤️', '😂', '🎉', '🔥'][Number(e.key) - 1]);
    };
    const up = (e) => {
      const dir = KEYS[e.code];
      if (dir) input.current.held = input.current.held.filter((d) => d !== dir);
    };
    const blur = () => { input.current.held = []; };
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

      // Movimiento por pasos
      if (t - input.current.lastStep >= STEP_MS) {
        let next = null;
        let dir = null;
        const held = input.current.held;
        if (held.length || input.current.tap) {
          dir = held.length ? held[held.length - 1] : input.current.tap;
          input.current.tap = null;
          const [dx, dy] = DIRV[dir];
          next = { x: mine.x + dx, y: mine.y + dy };
        } else if (input.current.path.length) {
          next = input.current.path.shift();
          dir = next.x > mine.x ? 'right' : next.x < mine.x ? 'left' : next.y < mine.y ? 'up' : 'down';
        }
        if (next) {
          input.current.lastStep = t;
          if (isWalkable(f, next.x, next.y)) office.moveMe(next.x, next.y, dir);
          else if (dir !== mine.dir) office.moveMe(mine.x, mine.y, dir);
          else input.current.path = [];
        }
      }

      // Interpolación
      const speed = 1000 / STEP_MS + 1;
      for (const p of Object.values(players)) {
        if (p.rx == null) { p.rx = p.x; p.ry = p.y; }
        const dx = p.x - p.rx;
        const dy = p.y - p.ry;
        const dist = Math.hypot(dx, dy);
        if (dist > 4) { p.rx = p.x; p.ry = p.y; } else if (dist > 0) {
          const s = Math.min(dist, speed * dt);
          p.rx += (dx / dist) * s;
          p.ry += (dy / dist) * s;
        }
        p.moving = dist > 0.02;
        if (p.moving) p.anim = (p.anim || 0) + dt;
      }

      // Ambiente: pasos propios y música en zonas de descanso
      const amb = office.state.prefs.ambience;
      if (amb.steps && mine.moving) footstep(office.state.prefs.audio.notifVolume);
      if (t - (ambRef.current.check || 0) > 1000) {
        ambRef.current.check = t;
        const ar = areaAt(f, mine.x, mine.y);
        setMusic(!!amb.music && !!ar && MUSIC_AREAS.test(ar.name), amb.musicVolume);
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
      if (staticRef.current) ctx.drawImage(staticRef.current, 0, 0);

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
      const list = Object.entries(players).filter(([, p]) => p.floorId === f.id).sort((a, b) => a[1].ry - b[1].ry);
      for (const [id, p] of list) {
        const u = us[id];
        const step = p.moving ? (Math.floor((p.anim || 0) * 8) % 2) + 1 : 0;
        ctx.globalAlpha = p.status === 'away' ? 0.6 : 1;
        const seat = !p.moving && seatAt(f, Math.round(p.rx), Math.round(p.ry));
        drawAvatar(ctx, (p.rx + 0.5) * T, (p.ry + 1) * T - 2, u?.avatar, seat?.dir || p.dir, step, !!seat);
        ctx.globalAlpha = 1;
      }

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

      // Etiquetas (en coordenadas de pantalla para que el texto sea nítido)
      ctx.setTransform(v.dpr, 0, 0, v.dpr, 0, 0);
      ctx.textBaseline = 'middle';
      // Nombres de áreas
      if (v.zoom >= 0.3) {
        ctx.font = '600 12px "Public Sans", system-ui, sans-serif';
        const nowTs = Date.now();
        const evs = office.state.events;
        for (const a of f.areas) {
          const p = worldToScreen(a.x + 0.3, a.y + 0.45);
          const label = a.private ? `🔒 ${a.name}` : `👥 ${a.name}`;
          const w = ctx.measureText(label).width + 14;
          ctx.fillStyle = 'rgba(255,255,255,.72)';
          ctx.beginPath(); ctx.roundRect(p.x, p.y - 10, w, 20, 10); ctx.fill();
          ctx.fillStyle = rgba(themeColors().ink, .82);
          ctx.fillText(label, p.x + 7, p.y + 1);
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
        const { w: ow } = objSize(near.o);
        const hp = worldToScreen(near.o.x + ow / 2, near.o.y - 0.6);
        const txt = INTERACT_LABELS[near.kind];
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
        const name = u.shift ? `🖥️ ${u.displayName}` : u.displayName;
        const w = ctx.measureText(name).width + 24;
        const y = sp.y - 34 * v.zoom / 1.5 + 4;
        const isMe = Number(id) === meU.id;
        ctx.fillStyle = isMe ? rgba(themeColors().accent, .95) : rgba(themeColors().ink, .86);
        ctx.beginPath(); ctx.roundRect(sp.x - w / 2, y - 11, w, 22, 6); ctx.fill();
        ctx.fillStyle = p.status === 'busy' ? (themeColors().brand === 'gtahub' ? '#FFCC00' : '#FF8A3D') : p.status === 'away' ? '#adb5bd' : (themeColors().brand === 'gtahub' ? '#3DDC84' : '#2fd36b');
        ctx.beginPath(); ctx.arc(sp.x - w / 2 + 10, y, 4, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#fff';
        ctx.fillText(name, sp.x - w / 2 + 18, y + 1);
        // Etiquetas EN VIVO (transmite su pantalla) y ● REC (está grabando: lo ve toda la sala)
        const tags = [p.screen && ['EN VIVO', '#e63946', '#fff'], (isMe ? office.state.recording : p.recording) && ['● REC', '#fff', '#e63946']].filter(Boolean);
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

    // Clic en una persona → tarjeta de perfil
    for (const [id, p] of Object.entries(office.players)) {
      if (p.floorId !== floor.id) continue;
      if (w.x >= p.rx && w.x < p.rx + 1 && w.y >= p.ry - 0.2 && w.y < p.ry + 1) {
        // Si transmite y está en tu sala, abre su pantalla
        if (p.screen && office.state.talkingWith.includes(Number(id))) office.watch(Number(id));
        else office.set({ profileCard: Number(id) });
        return;
      }
    }
    // Clic en un objeto interactivo: abrirlo si estás cerca o caminar hasta él
    const io = floor.objects.find((o) => CATALOG[o.type]?.interactive && inRect({ x: o.x, y: o.y - 0.5, ...objSize(o), h: objSize(o).h + 0.5 }, w.x, w.y));
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
      clearTimeout(tipTimer.current);
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
        if (d && o.deskId === d.id && !editor.insideZone({ ...o, x: drag.x, y: drag.y }, d.zone)) {
          office.toast({ title: 'Solo puedes decorar dentro de tu escritorio', kind: 'error' });
          return;
        }
      }
      editor.updateObject(o, { x: drag.x, y: drag.y }).catch(() => {});
    }
  };

  const onWheel = (e) => {
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
      setHoverDesk(null);
    } catch (e) {
      office.toast({ title: e.message, kind: 'error' });
    }
  };

  const hoverOwner = hoverDesk && users[floor?.claims[hoverDesk.desk.id]];
  const isMyDesk = hoverDesk && floor?.claims[hoverDesk.desk.id] === me.id;

  return (
    <div className="map-wrap" ref={wrapRef} style={{ display: active ? 'block' : 'none' }}>
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

      {hoverDesk && !editMode && (
        <div className="desk-tip" style={{ left: hoverDesk.x, top: hoverDesk.y }}
          onMouseEnter={() => clearTimeout(tipTimer.current)} onMouseLeave={hideTipSoon}>
          {hoverOwner ? <Avatar user={hoverOwner} size={28} /> : <span className="desk-tip-ico"><Armchair size={16} /></span>}
          <div className="desk-tip-text">
            <b>{isMyDesk ? 'Tu escritorio' : hoverOwner ? hoverOwner.displayName : 'Escritorio libre'}</b>
            <span>{hoverDesk.area || 'Oficina'}{hoverOwner && !isMyDesk ? ` · ${hoverOwner.online ? 'En línea' : 'Desconectado'}` : ''}</span>
          </div>
          {!hoverOwner && (
            <button className="btn tiny primary" onClick={() => { claim(hoverDesk.desk.id); hoverRef.current = null; }}>Reclamar</button>
          )}
          {isMyDesk && (
            <button className="btn tiny" onClick={() => office.set({ editMode: 'decor' })}><Brush size={12} /> Decorar</button>
          )}
          {hoverOwner && !isMyDesk && hoverOwner.online && (
            <button className="btn tiny" onClick={() => office.goTo(hoverOwner.id)}>Ir</button>
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

      <ControlBar />
    </div>
  );
}

function normRect({ x0, y0, x1, y1 }) {
  return { x: Math.min(x0, x1), y: Math.min(y0, y1), w: Math.abs(x1 - x0) + 1, h: Math.abs(y1 - y0) + 1 };
}
