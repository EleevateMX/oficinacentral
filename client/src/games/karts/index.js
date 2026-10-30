// 🏎️ Karts de oficina: carreras de mini karts en 3D (three.js), de 1 a 8 personas, por la oficina.
//
// - Cada quien maneja su kart en su computadora (sin retraso) y manda su posición ~25 veces por
//   segundo; el anfitrión (room.host) lleva la carrera: fases, cuenta regresiva, reloj, bots y el
//   orden de llegada, y manda el estado ~20 veces por segundo. Los demás karts se dibujan ~100 ms en
//   el pasado e interpolados (netSync.js) para que se vean fluidos.
// - La física es arcade y está en shared/karts.js (se prueba en Node): derrape con mini turbo,
//   rampas, turbos del piso, choques con barreras y con otros karts.
// - Si el anfitrión se va, el siguiente jugador sigue la carrera con el último estado.
import * as THREE from 'three';
import { office } from '../../lib/store.js';
import { api } from '../../lib/api.js';
import * as K from '@shared/karts.js';
import { buildTrackWorld } from './world.js';
import { kartModel, animateKart, grapaModel, postitModel } from './models.js';
import { Sparks, flame, driftSpark } from './fx.js';
import { Hud } from './hud.js';
import { KartsUI } from './ui.js';
import { KartAudio } from './audio.js';
import { SnapBuffer, gameLoop, stamp } from '../netSync.js';
import { AdaptiveQuality, pixelRatio } from '../quality.js';

export const meta = {
  w: 1280, h: 720, wide: true, persistent: true, maxSeats: K.MAX_RACERS, ownTop: true,
  help: 'W/↑ acelerar · S/↓ frenar · A D girar · Shift/Espacio derrapar · E objeto · R reaparecer · C cámara · Esc pausa',
};

const HZ = 120;
const BOT_NAMES = ['Becario Turbo', 'Lic. Derrape', 'Ing. Café', 'Contadora Veloz', 'Don Post-it', 'La de RH', 'Sr. Impresora', 'Doña Junta', 'El de Sistemas'];
const SKINS = ['#f6c9a0', '#e0ac69', '#c68642', '#8d5524', '#f1d3b3', '#ffdbac'];
const HAIRS = ['#1b1720', '#4a3020', '#8a5a2b', '#d8b36a', '#777777', '#b5462f'];
const SHIRTS = ['#3d7be0', '#2bb673', '#e8edf2', '#9b5de5', '#f4a261', '#e63946', '#141414'];
const STYLES = ['short', 'long', 'curly', 'buzz', 'ponytail', 'afro', 'mohawk', 'bob'];
const CAM_NAMES = ['Cerca', 'Lejos', 'Cofre'];
const store = (k, v) => { try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch { return null; } return null; };
const GAME_KEYS = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'ShiftLeft', 'ShiftRight', 'KeyE', 'ControlLeft', 'ControlRight', 'KeyR', 'KeyC', 'KeyX']);
const r2 = (v) => Math.round(v * 100) / 100, r3 = (v) => Math.round(v * 1000) / 1000;
const wrapAng = (a) => { while (a > Math.PI) a -= Math.PI * 2; while (a < -Math.PI) a += Math.PI * 2; return a; };

// banderas del estado de un kart (para mandarlo en un número)
function flagsOf(k) {
  return (k.drift < 0 ? 1 : 0) | (k.drift > 0 ? 2 : 0) | (k.boostT > 0 ? 4 : 0) | (k.spinT > 0 ? 8 : 0) | (k.air ? 16 : 0) | ((k.tier & 3) << 5) | (k.ghostT > 0 ? 128 : 0);
}
const unflag = (f) => ({ drift: f & 1 ? -1 : f & 2 ? 1 : 0, boost: !!(f & 4), spin: !!(f & 8), air: !!(f & 16), tier: (f >> 5) & 3, ghost: !!(f & 128) });

export function create(canvas, ctx) {
  let destroyed = false;
  const cleanups = [];
  const on = (el, ev, fn, opts) => { el.addEventListener(ev, fn, opts); cleanups.push(() => el.removeEventListener(ev, fn, opts)); };
  const touchDevice = typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches;
  let quality = store('karts.quality') || (touchDevice ? 'baja' : 'alta');

  const stage = canvas.parentElement;
  const hudCanvas = document.createElement('canvas');
  hudCanvas.className = 'kt-hud';
  Object.assign(hudCanvas.style, { position: 'absolute', pointerEvents: 'none', left: '0px', top: '0px', zIndex: 2 });
  stage.appendChild(hudCanvas);
  cleanups.push(() => hudCanvas.remove());
  // la oficina de abajo no se ve mientras juegas: que no se dibuje
  office.mapPaused = true;
  cleanups.push(() => { office.mapPaused = false; });
  // resolución dinámica (calidad alta): empieza con tope de 1.25× (no 1.5× en Mac retina), sube a
  // 1.5× solo si sobra tiempo y baja hasta 0.7× si los cuadros van lentos (sin recompilar nada)
  const PR_STEPS = [[1.5, 1], [1.25, 1], [1, 1], [1, 0.85], [1, 0.7]];
  const aq = new AdaptiveQuality({ levels: PR_STEPS.length, start: 1 });
  let lastFrameAt = 0;
  const hg = hudCanvas.getContext('2d');
  const hud = new Hud();
  const prevTouch = canvas.style.touchAction;
  canvas.style.touchAction = 'none';
  cleanups.push(() => { canvas.style.touchAction = prevTouch; canvas.style.width = ''; canvas.style.height = ''; canvas.style.cursor = ''; });
  canvas.style.cursor = 'default';

  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: !touchDevice, powerPreference: 'high-performance' });
  } catch {
    const g2 = canvas.getContext('2d');
    if (g2) { g2.fillStyle = '#12111a'; g2.fillRect(0, 0, canvas.width, canvas.height); g2.fillStyle = '#fff'; g2.font = '700 28px system-ui'; g2.textAlign = 'center'; g2.fillText('Tu navegador no tiene 3D (WebGL) activado', canvas.width / 2, canvas.height / 2); }
    ctx.status('No se pudo iniciar el 3D en este navegador');
    return { destroy() { for (const c of cleanups) c(); } };
  }
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#14161d');
  const camera = new THREE.PerspectiveCamera(70, 16 / 9, 0.15, 1100);

  // Tamaño: 16:9 dentro del escenario (o toda la pantalla)
  let cssW = 1280, cssH = 720;
  function fit() {
    const full = !!document.fullscreenElement;
    const avW = stage.clientWidth || 960;
    const avH = full ? (stage.clientHeight || window.innerHeight) : Math.max(240, (window.innerHeight || 800) - 150);
    cssW = Math.floor(Math.min(avW, (avH * 16) / 9));
    cssH = Math.floor((cssW * 9) / 16);
    if (full && stage.clientHeight) { cssW = avW; cssH = stage.clientHeight; }
    canvas.style.width = `${cssW}px`;
    canvas.style.height = `${cssH}px`;
    const dpr = window.devicePixelRatio || 1;
    const [cap, scale] = PR_STEPS[aq.level];
    renderer.setPixelRatio(quality === 'alta' ? pixelRatio(dpr, cap, scale) : Math.min(dpr, 1) * 0.6);
    renderer.setSize(cssW, cssH, false);
    const hdpr = Math.min(dpr, 2);
    hudCanvas.width = Math.round(cssW * hdpr); hudCanvas.height = Math.round(cssH * hdpr);
    hudCanvas.style.width = `${cssW}px`; hudCanvas.style.height = `${cssH}px`;
    hudCanvas.style.left = `${canvas.offsetLeft}px`; hudCanvas.style.top = `${canvas.offsetTop}px`;
    camera.aspect = cssW / cssH;
    camera.updateProjectionMatrix();
  }
  const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(fit) : null;
  ro?.observe(stage);
  on(window, 'resize', fit);
  on(document, 'fullscreenchange', () => setTimeout(fit, 30));
  cleanups.push(() => ro?.disconnect());

  // ---------- Estado ----------
  const myId = ctx.me;
  let room = ctx.room || { seats: ctx.players.map((p) => p?.id ?? null), host: ctx.host ? myId : null, watchers: [] };
  let mySeat = ctx.seat;
  let isHost = room.host === myId && mySeat >= 0;
  const savedTrack = store('karts.track');
  const race = { ph: 'lobby', tr: K.TRACK_IDS.includes(savedTrack) ? savedTrack : 'oficina', bots: ['0', '3', '5'].includes(store('karts.bots')) ? Number(store('karts.bots')) : 5, seq: 0, cd: 0, rt: 0, R: [], firstFin: null, cols: {} };
  let myColor = Number(store('karts.color') ?? NaN);
  if (!(myColor >= 0 && myColor < K.KART_COLORS.length)) myColor = Math.max(0, mySeat) % K.KART_COLORS.length;
  let T = null, world = null;
  const me = { k: null, prev: null, inRace: false, roul: 0, finishSent: false, newRecord: false, startHeld: 0, respawnCD: 0, lastPlace: 0 };
  const bots = new Map(); // id → { k, prev, lane, skill, name, avatar, col, roul, useT }
  const remoteIn = new Map(); // asiento → último estado recibido
  const inputBufs = new Map(); // asiento → SnapBuffer
  const buf = new SnapBuffer({ delay: 95 });
  let latest = null;
  let clockOff = null;
  const views = new Map(); // id → modelo y efectos
  const items = new Map(); // id → { kind, s0|s, lat, t0, by, mesh }
  let itemSeq = 0;
  let camMode = Math.max(0, Math.min(2, Number(store('karts.cam')) || 0));
  const keys = new Set();
  let frozen = false, forceStep = false;
  let menu = false, autopilot = false, forced = null, watchId = null, pendingFull = false, weFull = false;
  let banner = null, time = 0, fps = 0, fpsN = 0, fpsT = 0, sendAcc = 0, stateAcc = 0;
  let boards = {}; // pista → [{ userId, score }]
  let place = 0;
  let others = []; // karts de los demás (para los choques), se actualiza en cada cuadro
  const audio = new KartAudio(Math.max(0.2, ctx.volume ?? 0.6));
  let muted = store('karts.muted') === '1';
  audio.setMuted(muted);
  const fx = { sparks: new Sparks(scene, 900), glow: new Sparks(scene, 300, { additive: true }) };
  fx.sparks.scale = fx.glow.scale = quality === 'alta' ? 1 : 0.5;
  const ui = new KartsUI(stage, {
    track: (id) => { if (isHost && race.ph === 'lobby') { race.tr = id; store('karts.track', id); loadTrack(id); } },
    color: (i) => { myColor = Number(i); store('karts.color', String(myColor)); if (isHost) race.cols[mySeat] = myColor; },
    bots: (n) => { if (isHost) { race.bots = Number(n); store('karts.bots', String(n)); } },
    start: () => { goFull(); audio.start(); startRace(); },
    again: () => { goFull(); audio.start(); startRace(); },
    lobby: () => { if (isHost) toLobby(); menu = false; },
    join: () => { goFull(); audio.start(); ctx.sit?.(); },
    leave: () => ctx.close?.(),
    resume: () => { menu = false; },
    respawn: () => { menu = false; doRespawn(); },
    camera: () => cycleCam(),
    quality: () => setQuality(quality === 'alta' ? 'baja' : 'alta'),
    mute: () => { muted = !muted; store('karts.muted', muted ? '1' : '0'); audio.setMuted(muted); },
  });
  const touchState = touchDevice ? ui.enableTouch(true) : null;

  const users = () => office.state.users || {};
  const nameOf = (uid) => users()[uid]?.displayName?.split(' ')[0] || 'Alguien';
  const avatarOf = (uid) => users()[uid]?.avatar || {};
  const colorBody = (i) => K.KART_COLORS[((i % K.KART_COLORS.length) + K.KART_COLORS.length) % K.KART_COLORS.length].body;
  const colOfSeat = (seat) => (seat === mySeat ? myColor : remoteIn.get(seat)?.col ?? race.cols[seat] ?? seat % K.KART_COLORS.length);

  // ---------- Pista ----------
  function loadTrack(id) {
    if (T && T.id === id && world) return;
    T = K.buildTrack(id);
    if (world) { scene.remove(world.group); world.dispose(); }
    for (const it of items.values()) if (it.mesh) scene.remove(it.mesh);
    items.clear();
    world = buildTrackWorld(T, { quality });
    scene.add(world.group);
    scene.fog = new THREE.Fog(world.fog.color, world.fog.near, world.fog.far);
    scene.background = new THREE.Color(world.fog.color);
    hud.setTrack(T);
    camera.far = world.night ? 1100 : 320; camera.updateProjectionMatrix();
    camInit = false;
    loadBoard(id);
  }
  function loadBoard(id) {
    api.get(`/games/${K.scoreKey(id)}/top`).then((r) => { boards[id] = r.top || []; }).catch(() => {});
  }
  for (const id of K.TRACK_IDS) loadBoard(id);

  // ---------- Carrera (anfitrión) ----------
  function startRace() {
    if (!isHost || !T) return;
    const humans = room.seats.map((uid, seat) => (uid ? { uid, seat } : null)).filter(Boolean);
    const nb = Math.max(0, Math.min(race.bots, K.MAX_RACERS - humans.length));
    const usedCols = new Set(humans.map((h) => colOfSeat(h.seat)));
    const R = [];
    let ci = 0;
    for (let i = 0; i < nb; i++) {
      while (usedCols.has(ci % K.KART_COLORS.length) && usedCols.size < K.KART_COLORS.length) ci++;
      const col = ci++ % K.KART_COLORS.length;
      R.push({ id: 10 + i, seat: -1, uid: null, col, ai: true, name: BOT_NAMES[(race.seq * 3 + i) % BOT_NAMES.length] });
    }
    for (const h of humans) R.push({ id: h.seat, seat: h.seat, uid: h.uid, col: colOfSeat(h.seat), ai: false, name: nameOf(h.uid) });
    race.R = R; race.seq++; race.ph = 'count'; race.cd = 3.6; race.rt = -3.6; race.firstFin = null; race.allIn = null;
    setupRace();
    sendStateNow();
  }
  function toLobby() {
    if (!isHost) return;
    race.ph = 'lobby'; race.R = []; race.cd = 0;
    me.inRace = false; bots.clear();
    sendStateNow();
  }
  // Prepara mi kart (y los bots si soy anfitrión) en la parrilla
  function setupRace() {
    loadTrack(race.tr);
    for (const it of items.values()) if (it.mesh) scene.remove(it.mesh);
    items.clear();
    for (const b of world.boxes) b.hidden = 0;
    fx.sparks.clear(); fx.glow.clear();
    const slot = race.R.findIndex((r) => !r.ai && r.seat === mySeat && (r.uid == null || r.uid === myId));
    me.inRace = slot >= 0 && mySeat >= 0;
    me.k = me.inRace ? K.newKart(T, slot, { id: mySeat, color: myColor }) : null;
    me.prev = me.k ? pose(me.k) : null;
    me.roul = 0; me.finishSent = false; me.newRecord = false; me.startHeld = 0; me.lastPlace = 0;
    bots.clear();
    if (isHost) race.R.forEach((r, i) => { if (r.ai) bots.set(r.id, newBot(r, i)); });
    banner = null; menu = false; watchId = null;
    if (me.inRace) pendingFull = true;
  }
  function newBot(r, slot) {
    const k = K.newKart(T, slot, { id: r.id, color: r.col });
    const n = r.id * 7 + race.seq;
    return {
      k, prev: pose(k), lane: ((r.id % 3) - 1) * 2.2, skill: 0.72 + ((n * 13) % 20) / 100, name: r.name, col: r.col, roul: 0, useT: 0,
      avatar: { skin: SKINS[n % SKINS.length], hair: HAIRS[(n * 3) % HAIRS.length], shirt: SHIRTS[(n * 5) % SHIRTS.length], hairStyle: STYLES[(n * 7) % STYLES.length], top: n % 2 ? 'shirt' : 'tee' },
    };
  }
  const pose = (k) => ({ x: k.x, y: k.y, z: k.z, h: k.h });

  // Estado de cada corredor (mismo formato para ordenar, dibujar y mandar)
  function packKart(k) {
    return { x: r2(k.x), y: r2(k.y), z: r2(k.z), h: r3(k.h), sp: r2(k.speed), fl: flagsOf(k), lap: k.lap, cp: k.nextCp, prog: r2(k.progress), fin: k.finished ? r3(k.finishT) : null, best: k.bestLap != null ? r3(k.bestLap) : null, s: r2(k.s), lat: r2(k.lat), it: k.item || null };
  }
  function stateOf(r) {
    if (!r) return null;
    if (!r.ai && r.seat === mySeat && me.k && me.inRace) return packKart(me.k);
    if (r.ai) { const b = bots.get(r.id); return b ? packKart(b.k) : latestK(r.id); }
    if (isHost) { const d = remoteIn.get(r.seat); return d && d.seq === race.seq && d.x != null ? d : null; }
    return latestK(r.id);
  }
  function latestK(id) {
    const row = latest?.K?.find((q) => q[0] === id);
    return row ? unpackRow(row) : null;
  }
  const unpackRow = (q) => ({ id: q[0], x: q[1], y: q[2], z: q[3], h: q[4], sp: q[5], fl: q[6], lap: q[7], cp: q[8], prog: q[9], fin: q[10] < 0 ? null : q[10], best: q[11] < 0 ? null : q[11], st: q[12] || 0 });

  function hostStep(dt) {
    if (race.ph === 'count') {
      race.cd -= dt; race.rt = -race.cd;
      if (race.cd <= 0) { race.ph = 'race'; race.rt = 0; race.cd = 0; }
    } else if (race.ph === 'race') {
      race.rt += dt;
      const humans = race.R.filter((r) => !r.ai);
      let all = true, any = false;
      for (const r of humans) {
        const st = stateOf(r);
        const here = room.seats[r.seat] === r.uid;
        if (st?.fin != null) any = true;
        else if (here) all = false;
      }
      if (any && race.firstFin == null) race.firstFin = race.rt;
      const connected = humans.some((r) => room.seats[r.seat] === r.uid);
      // cuando ya llegaron todas las personas, los bots tienen unos segundos para cruzar la meta
      if (all && race.allIn == null) race.allIn = race.rt;
      const botsDone = [...bots.values()].every((b) => b.k.finished);
      if (!connected || (all && (botsDone || race.rt - race.allIn > 7)) || (race.firstFin != null && race.rt - race.firstFin > 30)) { race.ph = 'done'; sendStateNow(); }
    }
    // bots
    const leader = Math.max(-Infinity, ...race.R.filter((r) => !r.ai).map((r) => stateOf(r)?.prog ?? -Infinity));
    const botKarts = [...bots.values()].map((b) => b.k);
    for (const b of bots.values()) {
      const k = b.k;
      b.prev = pose(k);
      const racing = race.ph === 'race' || (race.ph === 'done' && k.finished);
      let inp = { throttle: 0, steer: 0, drift: false };
      if (racing) inp = K.aiInput(T, k, { lane: b.lane, skill: b.skill, t: race.rt });
      const mul = race.ph === 'race' && Number.isFinite(leader) ? K.aiSpeedMul(leader - k.progress, b.skill) : 0.9;
      K.stepKart(T, k, inp, dt, { others: [...botKarts, ...others, ...(me.k && me.inRace ? [me.k] : [])], speedMul: mul });
      if (race.ph === 'race') K.updateLaps(T, k, race.rt);
      if (k.stuckT > 2.5 || (racing && Math.abs(k.speed) < 1.5 && k.spinT <= 0 && (b.slowT = (b.slowT || 0) + dt) > 4)) { K.respawn(T, k); b.slowT = 0; }
      else if (Math.abs(k.speed) >= 1.5) b.slowT = 0;
      if (race.ph === 'race') { itemsFor(k, b, dt, false); botUseItem(b, dt); }
    }
  }

  // ---------- Objetos ----------
  function itemsFor(k, owner, dt, mine) {
    // cajas
    for (const b of world.boxes) {
      if (b.hidden > 0 || Math.abs(k.y - b.y) > 2.5 || !K.touches(T, k, b.s, b.lat, 1.25)) continue;
      b.hidden = 3;
      ctx.sendEvent({ k: 'box', b: b.id });
      if (!k.item && !owner.roul) { owner.roul = mine ? 1.1 : 0.8; if (mine) { audio.play('box'); } }
      if (mine) burstAt(b.x, b.y + 1, b.z, ['#FFCC00', '#FE3377', '#fff'], 18);
    }
    if (owner.roul > 0) {
      owner.roul -= dt;
      if (mine && Math.floor(owner.roul * 14) !== Math.floor((owner.roul + dt) * 14)) audio.play('roulette');
      if (owner.roul <= 0) { owner.roul = 0; k.item = K.rollItem(placeOf(k.id), race.R.length); if (mine) audio.play('item'); }
    }
    // golpes de grapas y post-its
    for (const [id, it] of items) {
      let s, lat;
      if (it.kind === 'grapa') { const p = K.grapaPos(T, it, race.rt); if (!p.alive) { removeItem(id); continue; } s = p.s; lat = p.lat; if (it.by === k.id && race.rt - it.t0 < 0.4) continue; }
      else { if (race.rt - it.t0 > K.POSTIT_LIFE) { removeItem(id); continue; } s = it.s; lat = it.lat; if (it.by === k.id && race.rt - it.t0 < 1.2) continue; }
      if (k.ghostT > 0 || !K.touches(T, k, s, lat, 1.25)) continue;
      removeItem(id);
      ctx.sendEvent({ k: 'hit', id, who: k.id });
      if (k.boostT > 0 && it.kind === 'postit') continue; // con turbo lo atraviesas
      k.spinT = 1.1; k.drift = 0; k.charge = 0; k.tier = 0;
      const vx = k.vx, vz = k.vz; k.vx = vx * 0.45; k.vz = vz * 0.45;
      if (mine) { audio.play('hit'); banner = { title: it.kind === 'grapa' ? '¡Grapazo!' : '¡Post-it!', sub: whoName(it.by), color: '#ff8a3d', t: 1.6, dur: 1.6 }; shakeT = 0.5; }
      burstAt(k.x, k.y + 0.5, k.z, it.kind === 'grapa' ? ['#dfe5ec', '#ff8a3d', '#fff'] : ['#ffe14d', '#ffd21a', '#fff'], 22);
    }
  }
  const whoName = (id) => { const r = race.R.find((q) => q.id === id); return r ? `de ${r.name}` : ''; };
  function useItem(k, mine) {
    if (!k?.item || race.ph !== 'race' || k.spinT > 0) return;
    const kind = k.item;
    k.item = null;
    if (kind === 'cafe') {
      k.boostT = Math.max(k.boostT, 1.6);
      ctx.sendEvent({ k: 'fx', fx: 'cafe', who: k.id });
      if (mine) audio.play('cafe');
      return;
    }
    const id = `${k.id}-${++itemSeq}-${race.seq}`;
    const it = kind === 'grapa' ? { kind, s0: r2(k.s + 2), lat: r2(k.lat), t0: r3(race.rt), by: k.id } : { kind, s: r2(k.s - 2.4), lat: r2(k.lat), t0: r3(race.rt), by: k.id };
    addItem(id, it);
    ctx.sendEvent({ k: 'item', id, ...it });
    if (mine) audio.play(kind);
  }
  function botUseItem(b, dt) {
    const k = b.k;
    if (!k.item) return;
    b.useT += dt;
    if (k.item === 'cafe') {
      const P = T.samples[k.i];
      if ((Math.abs(P.curv) < 0.02 && b.useT > 1) || b.useT > 6) { useItem(k); b.useT = 0; }
    } else if (k.item === 'grapa') {
      const ahead = allStates().some((s) => s.id !== k.id && s.prog - k.progress > 4 && s.prog - k.progress < 28);
      if ((ahead && b.useT > 0.6) || b.useT > 9) { useItem(k); b.useT = 0; }
    } else {
      const behind = allStates().some((s) => s.id !== k.id && k.progress - s.prog > 2 && k.progress - s.prog < 14);
      if ((behind && b.useT > 0.8) || b.useT > 7) { useItem(k); b.useT = 0; }
    }
  }
  function addItem(id, it) {
    if (items.has(id)) return;
    const mesh = it.kind === 'grapa' ? grapaModel() : postitModel();
    scene.add(mesh);
    items.set(id, { ...it, mesh });
    placeItemMesh(items.get(id));
  }
  function removeItem(id) { const it = items.get(id); if (!it) return; scene.remove(it.mesh); items.delete(id); }
  function placeItemMesh(it) {
    if (!T) return;
    if (it.kind === 'grapa') {
      const p = K.grapaPos(T, it, race.rt);
      const q = K.pointAt(T, p.s, p.lat);
      it.mesh.position.set(q.x, q.y + 0.15, q.z);
      it.mesh.rotation.y = Math.PI / 2 - q.h;
      it.mesh.rotation.z = Math.sin(time * 30) * 0.2;
    } else {
      const q = K.pointAt(T, it.s, it.lat);
      it.mesh.position.set(q.x, q.y + 0.01, q.z);
      it.mesh.rotation.y = Math.PI / 2 - q.h + 0.4;
    }
  }

  // ---------- Red ----------
  ctx.onInput((seat, d) => {
    if (!isHost || !d) return;
    remoteIn.set(seat, d);
    if (d.col != null && d.col >= 0 && d.col < K.KART_COLORS.length) race.cols[seat] = d.col;
    if (d.x != null && d.seq === race.seq) {
      if (!inputBufs.has(seat)) inputBufs.set(seat, new SnapBuffer({ delay: 90 }));
      inputBufs.get(seat).push(d);
    }
  });
  ctx.onState((d) => {
    if (isHost || !d) return;
    if (!buf.push(d)) return;
    latest = d;
    applySnap(d);
  });
  ctx.onEvent((seat, d) => {
    if (!d || !T) return;
    if (d.k === 'box') { const b = world?.boxes.find((x) => x.id === d.b); if (b) b.hidden = 3; }
    else if (d.k === 'item' && typeof d.id === 'string') addItem(d.id, { kind: d.kind === 'grapa' ? 'grapa' : 'postit', s0: Number(d.s0), s: Number(d.s), lat: Number(d.lat) || 0, t0: Number(d.t0) || 0, by: d.by });
    else if (d.k === 'hit') { const it = items.get(d.id); if (it) { const p = it.mesh.position; burstAt(p.x, p.y + 0.4, p.z, ['#fff', '#ff8a3d'], 14); } removeItem(d.id); }
    else if (d.k === 'fx' && d.fx === 'cafe') { const v = views.get(d.who); if (v) v.cafeT = 1.2; }
  });
  ctx.onRoom?.((r) => {
    room = r;
    const ns = r.seats.indexOf(myId);
    const wasSeat = mySeat;
    mySeat = ns;
    const hostNow = r.host === myId && mySeat >= 0;
    if (hostNow && !isHost) takeOver();
    isHost = hostNow;
    if (wasSeat < 0 && mySeat >= 0) { myColor = Number(store('karts.color') ?? NaN); if (!(myColor >= 0 && myColor < K.KART_COLORS.length)) myColor = mySeat % K.KART_COLORS.length; }
    for (const s of [...remoteIn.keys()]) if (!r.seats[s]) { remoteIn.delete(s); inputBufs.delete(s); }
  });
  // Me toca llevar la carrera: sigo con lo último que vi (los bots salen de su última posición)
  function takeOver() {
    if (!latest || !T) return;
    banner = { title: 'Ahora tú llevas la carrera', sub: '', color: '#9fe3ff', t: 2.5, dur: 2.5 };
    race.firstFin = latest.fc ?? null;
    bots.clear();
    race.R.forEach((r, i) => {
      if (!r.ai) return;
      const b = newBot(r, i);
      const st = latestK(r.id);
      if (st) {
        Object.assign(b.k, { x: st.x, y: st.y, z: st.z, h: st.h, lap: st.lap, nextCp: st.cp, finished: st.fin != null, finishT: st.fin, bestLap: st.best });
        const L = K.locateGlobal(T, st.x, st.z, st.y);
        Object.assign(b.k, { i: L.i, s: L.s, lat: L.lat, lapStart: race.rt });
        b.k.vx = Math.cos(st.h) * st.sp; b.k.vz = Math.sin(st.h) * st.sp;
        b.k.progress = st.prog;
      }
      bots.set(r.id, b);
    });
  }
  function applySnap(d) {
    const prevSeq = race.seq, prevPh = race.ph;
    race.tr = K.TRACK_IDS.includes(d.tr) ? d.tr : 'oficina';
    race.bots = d.bots ?? race.bots;
    race.cols = d.cols || {};
    const nowS = performance.now() / 1000;
    const est = d.rt + 0.05;
    if (clockOff == null || Math.abs(nowS + clockOff - est) > 0.3) clockOff = est - nowS;
    else clockOff += (est - nowS - clockOff) * 0.05;
    race.R = (d.R || []).map(([id, seat, col, ai, name]) => ({ id, seat, col, ai: !!ai, name, uid: ai ? null : room.seats[seat] ?? null }));
    race.ph = d.ph;
    race.seq = d.seq;
    if (race.ph === 'lobby' || !T) loadTrack(race.tr);
    if (d.seq !== prevSeq && d.ph !== 'lobby') setupRace();
    if (race.ph === 'lobby' && prevPh !== 'lobby') { me.inRace = false; }
  }
  function sendStateNow() {
    if (!isHost) return;
    const others = room.seats.filter(Boolean).length > 1 || room.watchers?.length;
    if (!others) return;
    ctx.sendState(stamp(packState()));
  }
  function packState() {
    const Kr = [];
    for (const r of race.R) {
      const s = stateOf(r);
      if (!s) continue;
      Kr.push([r.id, s.x, s.y, s.z, s.h, s.sp, s.fl | 0, s.lap | 0, s.cp | 0, s.prog, s.fin == null ? -1 : s.fin, s.best == null ? -1 : s.best, r2(s.st || 0)]);
    }
    return { ph: race.ph, tr: race.tr, bots: race.bots, seq: race.seq, cd: r2(race.cd), rt: r3(race.rt), R: race.R.map((r) => [r.id, r.seat, r.col, r.ai ? 1 : 0, r.name]), K: Kr, cols: race.cols, fc: race.firstFin };
  }
  function netStep(dt) {
    if (mySeat < 0) return;
    if (isHost) {
      stateAcc += dt;
      if (stateAcc >= 0.05) { stateAcc = 0; sendStateNow(); }
    } else {
      sendAcc += dt;
      if (sendAcc >= 0.04) {
        sendAcc = 0;
        const d = { seq: race.seq, col: myColor };
        if (me.inRace && me.k) Object.assign(d, packKart(me.k), { st: r2(lastSteer) });
        ctx.sendInput(stamp(d));
      }
    }
  }

  // ---------- Mi kart ----------
  let lastSteer = 0;
  const isTyping = () => { const el = document.activeElement; return el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable); };
  const pad = { item: false, respawn: false, menu: false, cam: false };
  function readInput() {
    if (forced) return forced;
    const kd = (...c) => c.some((x) => keys.has(x));
    let throttle = (kd('KeyW', 'ArrowUp') ? 1 : 0) - (kd('KeyS', 'ArrowDown') ? 1 : 0);
    let steer = (kd('KeyD', 'ArrowRight') ? 1 : 0) - (kd('KeyA', 'ArrowLeft') ? 1 : 0);
    let drift = kd('ShiftLeft', 'ShiftRight', 'Space');
    if (touchState) {
      throttle += touchState.throttle - touchState.brake;
      steer += touchState.steer;
      drift = drift || touchState.drift;
    }
    const gp = typeof navigator !== 'undefined' && navigator.getGamepads ? [...navigator.getGamepads()].find(Boolean) : null;
    if (gp) {
      const ax = gp.axes[0] || 0;
      if (Math.abs(ax) > 0.15) steer += (ax - Math.sign(ax) * 0.15) / 0.85;
      const b = (i) => gp.buttons[i] ? (typeof gp.buttons[i] === 'object' ? gp.buttons[i].value || (gp.buttons[i].pressed ? 1 : 0) : gp.buttons[i]) : 0;
      throttle += Math.max(b(7), b(0)) - Math.max(b(6), b(1));
      drift = drift || b(5) > 0.5 || b(4) > 0.5 || b(2) > 0.5;
      const edge = (name, v) => { const was = pad[name]; pad[name] = v; return v && !was; };
      if (edge('item', b(3) > 0.5)) useItem(me.k, true);
      if (edge('respawn', b(8) > 0.5)) doRespawn();
      if (edge('menu', b(9) > 0.5) && race.ph !== 'lobby') menu = !menu;
      if (edge('cam', b(12) > 0.5)) cycleCam();
    }
    return { throttle: Math.max(-1, Math.min(1, throttle)), steer: Math.max(-1, Math.min(1, steer)), drift };
  }
  function myStep(dt) {
    const k = me.k;
    if (!k || !me.inRace || !T) return;
    me.prev = pose(k);
    me.respawnCD = Math.max(0, me.respawnCD - dt);
    let inp = readInput();
    if (touchState?.item) { touchState.item = false; useItem(k, true); }
    if (race.ph === 'count' || race.ph === 'lobby') {
      // arranque con turbo: acelerar justo en el último segundo
      if (inp.throttle > 0.5) me.startHeld += dt; else me.startHeld = 0;
      inp = { throttle: 0, steer: 0, drift: false };
    } else if (autopilot || k.finished || menu) {
      inp = autopilot || k.finished ? K.aiInput(T, k, { lane: 0, skill: 0.95, t: race.rt }) : { throttle: 0, steer: 0, drift: false };
    }
    lastSteer = inp.steer;
    const ev = K.stepKart(T, k, inp, dt, { others: isHost ? [...others, ...[...bots.values()].map((b) => b.k)] : others });
    for (const e of ev) kartEvent(e, k, true);
    if (race.ph === 'race') {
      for (const e of K.updateLaps(T, k, race.rt)) {
        if (e.k === 'lap') {
          const final = e.lap === K.LAPS;
          banner = { title: final ? '¡VUELTA FINAL!' : `VUELTA ${e.lap}`, sub: `${K.fmtTime(e.time)}${k.bestLap === e.time ? ' · ¡mejor vuelta!' : ''}`, color: final ? '#FFCC00' : '#fff', t: 2.2, dur: 2.2, big: final };
          audio.play(final ? 'final' : 'lap');
        } else if (e.k === 'finish') finishMine(k);
      }
      itemsFor(k, me, dt, true);
      if (k.stuckT > 2.5) doRespawn();
      if (k.wrongT > 1.2 && Math.floor(k.wrongT * 2) !== Math.floor((k.wrongT - dt) * 2)) audio.play('wrong');
    }
  }
  function finishMine(k) {
    if (me.finishSent) return;
    me.finishSent = true;
    const p = placeOf(k.id);
    banner = { title: p === 1 ? '¡GANASTE!' : '¡META!', sub: `${p}º lugar · ${K.fmtTime(k.finishT)}`, color: p === 1 ? '#FFCC00' : '#fff', t: 3.5, dur: 3.5, big: true };
    audio.play('finish');
    confetti(k);
    if (k.bestLap != null) {
      const ms = Math.round(k.bestLap * 1000);
      const tr = race.tr;
      api.post(`/games/${K.scoreKey(tr)}/score`, { score: ms }).then((r) => {
        boards[tr] = r.top || boards[tr];
        if (r.top?.[0]?.userId === myId && r.top[0].score === ms) me.newRecord = true;
      }).catch(() => {});
    }
  }
  function doRespawn() {
    if (!me.k || !me.inRace || me.respawnCD > 0 || race.ph !== 'race') return;
    K.respawn(T, me.k);
    me.respawnCD = 1.5;
  }
  function kartEvent(e, k, mine) {
    if (!mine) return;
    if (e === 'wall') { audio.play('wall'); shakeT = Math.max(shakeT, 0.25); wallSparks(k); }
    else if (e === 'bump') { audio.play('bump'); shakeT = Math.max(shakeT, 0.2); }
    else if (e === 'boost') audio.play('boost');
    else if (e === 'mini1' || e === 'mini2') audio.play(e);
    else if (e === 'tier1' || e === 'tier2') audio.play('tier');
    else if (e === 'jump') audio.play('jump');
    else if (e === 'land') { audio.play('land'); dust(k, 10); }
    else if (e === 'trick') banner = { title: '¡Salto!', sub: '+ turbo', color: '#3ad1ff', t: 1, dur: 1 };
  }

  // ---------- Paso fijo ----------
  function simStep(dt) {
    if (destroyed || !T || (frozen && !forceStep)) return;
    if (isHost) hostStep(dt);
    else if (clockOff != null) {
      race.rt = performance.now() / 1000 + clockOff;
      race.cd = race.ph === 'count' ? Math.max(0, -race.rt) : 0;
    }
    // arranque con turbo
    if (me.k && race.ph === 'race' && me.startHeld > 0) {
      if (me.startHeld < 1.2) { me.k.boostT = 0.9; audio.play('boost'); }
      me.startHeld = 0;
    }
    myStep(dt);
    netStep(dt);
  }

  // ---------- Controles ----------
  on(window, 'keydown', (e) => {
    if (isTyping()) return;
    const k = e.code;
    if (GAME_KEYS.has(k)) { e.preventDefault(); e.stopPropagation(); }
    keys.add(k);
    audio.start();
    if (pendingFull && race.ph !== 'lobby') { pendingFull = false; goFull(); }
    if (e.repeat) return;
    if (k === 'KeyE' || k === 'ControlLeft' || k === 'ControlRight') useItem(me.k, true);
    else if (k === 'KeyR') doRespawn();
    else if (k === 'KeyC') cycleCam();
    else if (k === 'Escape' && race.ph !== 'lobby' && race.ph !== 'done') menu = !menu;
    else if (k === 'Enter' && isHost && (race.ph === 'lobby' || race.ph === 'done')) { goFull(); startRace(); }
    else if ((k === 'ArrowLeft' || k === 'ArrowRight') && !me.inRace) cycleWatch(k === 'ArrowRight' ? 1 : -1);
  }, true);
  on(window, 'keyup', (e) => { keys.delete(e.code); });
  on(window, 'blur', () => keys.clear());
  on(canvas, 'pointerdown', () => { audio.start(); canvas.focus?.(); if (pendingFull && race.ph !== 'lobby') { pendingFull = false; goFull(); } if (!me.inRace && race.ph !== 'lobby') cycleWatch(1); });
  on(canvas, 'contextmenu', (e) => e.preventDefault());
  function goFull() {
    try {
      if (document.fullscreenElement || !document.fullscreenEnabled) return;
      const el = stage.closest('.game-modal') || stage;
      const r = el.requestFullscreen?.();
      weFull = true;
      r?.catch?.(() => { weFull = false; });
    } catch { /* sin pantalla completa */ }
  }
  function cycleCam() { camMode = (camMode + 1) % 3; store('karts.cam', String(camMode)); }
  function cycleWatch(dir) {
    const ids = race.R.map((r) => r.id);
    if (!ids.length) return;
    const i = ids.indexOf(watchId);
    watchId = ids[(i + dir + ids.length) % ids.length];
  }
  function setQuality(q) {
    quality = q; store('karts.quality', q);
    fx.sparks.scale = fx.glow.scale = q === 'alta' ? 1 : 0.5;
    if (world) { const id = T.id; T = null; scene.remove(world.group); world.dispose(); world = null; loadTrack(id); }
    fit();
  }

  // ---------- Vista ----------
  function allStates() {
    const out = [];
    for (const r of race.R) { const s = stateOf(r); if (s) out.push({ ...s, id: r.id }); }
    return out;
  }
  function order() {
    const list = race.R.map((r) => { const s = stateOf(r); return { id: r.id, r, finished: s?.fin != null, finishT: s?.fin ?? Infinity, progress: s?.prog ?? -1e9, best: s?.best ?? null }; });
    return K.raceOrder(list);
  }
  function placeOf(id) { const o = order(); const i = o.findIndex((q) => q.id === id); return i < 0 ? o.length : i + 1; }

  // Posiciones para dibujar (interpoladas)
  function renderStates(alpha) {
    const out = [];
    const lerpPose = (a, b, t) => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z: a.z + (b.z - a.z) * t, h: a.h + wrapAng(b.h - a.h) * t });
    if (race.ph === 'lobby') {
      // los que están en la sala esperan en la parrilla
      room.seats.forEach((uid, seat) => {
        if (!uid || !T) return;
        const g = T.grid[seat % T.grid.length];
        out.push({ id: seat, x: g.x, y: g.y, z: g.z, h: g.h, sp: 0, fl: 0, st: 0, col: colOfSeat(seat), name: nameOf(uid), avatar: avatarOf(uid), me: seat === mySeat });
      });
      return out;
    }
    let smp = null;
    if (!isHost) smp = buf.sample();
    const ka = smp ? new Map((smp.a.K || []).map((q) => [q[0], q])) : null;
    for (const r of race.R) {
      const base = { id: r.id, col: r.col, name: r.name, me: !r.ai && r.seat === mySeat && me.inRace, ai: r.ai };
      if (base.me && me.k) {
        const p = lerpPose(me.prev || me.k, me.k, alpha);
        out.push({ ...base, ...p, sp: me.k.speed, fl: flagsOf(me.k), st: lastSteer, k: me.k, avatar: avatarOf(myId) });
        continue;
      }
      const avatar = r.ai ? (bots.get(r.id)?.avatar || botLook(r.id)) : avatarOf(r.uid);
      if (isHost) {
        if (r.ai) {
          const b = bots.get(r.id);
          if (!b) continue;
          out.push({ ...base, ...lerpPose(b.prev, b.k, alpha), sp: b.k.speed, fl: flagsOf(b.k), st: 0, avatar });
        } else {
          const sb = inputBufs.get(r.seat), raw = remoteIn.get(r.seat);
          if (!raw || raw.seq !== race.seq || raw.x == null) continue;
          const st = sb?.state({ keys: ['x', 'y', 'z', 'h', 'sp', 'st'], angles: ['h'], jump: 8 }) || raw;
          out.push({ ...base, x: st.x, y: st.y, z: st.z, h: st.h, sp: st.sp, fl: raw.fl, st: st.st || 0, avatar });
        }
      } else if (smp) {
        const b = (smp.b.K || []).find((q) => q[0] === r.id);
        if (!b) continue;
        const a = ka.get(r.id) || b;
        const t = Math.max(0, Math.min(1.3, smp.k));
        const far = Math.hypot(b[1] - a[1], b[3] - a[3]) > 8;
        const P = far ? { x: b[1], y: b[2], z: b[3], h: b[4] } : lerpPose({ x: a[1], y: a[2], z: a[3], h: a[4] }, { x: b[1], y: b[2], z: b[3], h: b[4] }, t);
        out.push({ ...base, ...P, sp: b[5], fl: b[6], st: b[12] || 0, avatar });
      }
    }
    return out;
  }
  const looks = new Map();
  function botLook(id) {
    if (!looks.has(id)) { const n = id * 7 + race.seq; looks.set(id, { skin: SKINS[n % SKINS.length], hair: HAIRS[(n * 3) % HAIRS.length], shirt: SHIRTS[(n * 5) % SHIRTS.length], hairStyle: STYLES[(n * 7) % STYLES.length] }); }
    return looks.get(id);
  }

  function syncViews(list, dt) {
    const seen = new Set();
    for (const s of list) {
      seen.add(s.id);
      const key = `${s.col}|${s.name}|${JSON.stringify(s.avatar || {})}`;
      let v = views.get(s.id);
      if (!v || v.key !== key) {
        if (v) { scene.remove(v.model.group); scene.remove(v.model.shadow); }
        const c = K.KART_COLORS[s.col % K.KART_COLORS.length];
        const model = kartModel({ color: c, avatar: s.avatar, name: s.name, tagColor: c.body, showTag: !s.me || race.ph === 'lobby' });
        const flames = model.exhausts.map((ex) => { const f = flame(); ex.add(f); return f; });
        const sparks = [-1, 1].map((side) => { const sp = driftSpark(); sp.position.set(side * 0.62, 0.12, -0.78); model.group.add(sp); return sp; });
        scene.add(model.group); scene.add(model.shadow);
        v = { key, model, flames, sparks, i: 0, cafeT: 0, visualDrift: 0 };
        views.set(s.id, v);
      }
      const f = unflag(s.fl || 0);
      const m = v.model;
      v.visualDrift += (f.drift * 0.5 - v.visualDrift) * Math.min(1, dt * 8);
      const spin = f.spin ? (time * 14) % (Math.PI * 2) : 0;
      m.group.position.set(s.x, s.y + (f.air ? 0 : 0), s.z);
      m.group.rotation.set(0, Math.PI / 2 - s.h + v.visualDrift + spin, 0);
      // un kart pegado a la cámara (el que viene detrás) no tapa al tuyo
      m.group.visible = !(camPos && !s.me && race.ph !== 'lobby' && race.ph !== 'done' && Math.hypot(s.x - camPos.x, s.z - camPos.z) < 3.2 && s.y < camPos.y);
      if (m.tag) m.tag.visible = (!s.me || race.ph === 'lobby') && !(camPos && race.ph !== 'lobby' && Math.hypot(s.x - camPos.x, s.z - camPos.z) < 7);
      // sombra en el piso de la pista
      if (T) {
        const L = K.locate(T, s.x, s.z, v.i, 30);
        v.i = L.i;
        const gy = K.groundAt(T, L.s, L.lat);
        v.ground = gy;
        m.shadow.position.set(s.x, gy + 0.03, s.z);
        m.shadow.rotation.z = -(Math.PI / 2 - s.h);
        const hgt = Math.max(0, s.y - gy);
        m.shadow.scale.setScalar(Math.max(0.4, 1 - hgt * 0.25));
        m.shadow.material.opacity = 1;
        m.shadow.visible = hgt < 6 && m.group.visible;
      }
      animateKart(m, { speed: s.sp || 0, steer: s.st || 0, drift: f.drift, dt, air: f.air, t: time + s.id, boost: f.boost ? 1 : 0 });
      // flamas del turbo
      v.cafeT = Math.max(0, v.cafeT - dt);
      for (const sp of v.sparks) {
        sp.visible = !!f.drift && !f.air;
        if (sp.visible) {
          sp.material.color.set(f.tier === 2 ? '#ff8a3d' : f.tier === 1 ? '#3ad1ff' : '#fff1b8');
          const sc = (f.tier ? 0.75 : 0.45) * (0.75 + Math.random() * 0.5);
          sp.scale.set(sc, sc, 1);
          sp.material.rotation = Math.random() * 6;
        }
      }
      for (const fl of v.flames) {
        fl.visible = f.boost || v.cafeT > 0;
        if (fl.visible) { const sc = 0.8 + Math.random() * 0.5; fl.scale.set(sc, sc, sc * (1 + (s.sp || 0) / 30)); }
      }
      kartParticles(s, v, f, dt);
    }
    for (const [id, v] of views) if (!seen.has(id)) { scene.remove(v.model.group); scene.remove(v.model.shadow); views.delete(id); }
  }
  const _v = new THREE.Vector3();
  function wheelWorld(v, side) { return v.model.group.localToWorld(_v.set(side * 0.54, 0.06, -0.66)).clone(); }
  function kartParticles(s, v, f, dt) {
    const sp = Math.abs(s.sp || 0);
    const near = !camPos || Math.hypot(s.x - camPos.x, s.z - camPos.z) < 70;
    if (!near) return;
    v.model.group.updateMatrixWorld();
    const floor = v.ground ?? s.y;
    if (f.drift && !f.air) {
      const cols = f.tier === 2 ? ['#ff8a3d', '#FE3377', '#ffd27a'] : f.tier === 1 ? ['#3ad1ff', '#9fe3ff', '#ffffff'] : ['#ffe9a8', '#fff3cc'];
      for (const side of [-1, 1]) {
        const p = wheelWorld(v, side);
        for (let k = 0; k < (f.tier ? 3 : 2); k++) fx.glow.emit(p.x, p.y, p.z, { vx: -Math.cos(s.h) * 2 + side * Math.sin(s.h) * 1.5, vy: 2.5, vz: -Math.sin(s.h) * 2 - side * Math.cos(s.h) * 1.5, spread: 3, color: cols[k % cols.length], size: f.tier ? 0.08 : 0.06, life: 0.32, gravity: 9, floor });
        if (Math.random() < 0.3) fx.sparks.emit(p.x, p.y + 0.05, p.z, { spread: 0.6, vy: 0.6, color: '#b9b2a8', size: 0.22, life: 0.6, gravity: -0.4, floor, drag: 3, grow: 1.6 });
      }
    } else if (sp > 9 && !f.air && Math.random() < 0.12 * (quality === 'alta' ? 1 : 0.5)) {
      const p = wheelWorld(v, Math.random() < 0.5 ? -1 : 1);
      fx.sparks.emit(p.x, p.y + 0.05, p.z, { spread: 0.5, vy: 0.4, color: '#cfc6b8', size: 0.16, life: 0.5, gravity: -0.3, floor, drag: 3, grow: 1.4 });
    }
    if (f.boost || v.cafeT > 0) {
      for (const ex of v.model.exhausts) {
        ex.updateMatrixWorld();
        const p = ex.getWorldPosition(_v);
        fx.glow.emit(p.x, p.y, p.z, { vx: -Math.cos(s.h) * 4, vy: 1, vz: -Math.sin(s.h) * 4, spread: 1.2, color: Math.random() < 0.5 ? '#ff8a3d' : '#ffd27a', size: 0.09, life: 0.25, gravity: -2, floor, drag: 4 });
      }
    }
  }
  function burstAt(x, y, z, colors, n) {
    for (let i = 0; i < n; i++) fx.glow.emit(x, y, z, { vx: 0, vy: 3, vz: 0, spread: 6, color: colors[i % colors.length], size: 0.1, life: 0.6, gravity: 8, floor: y - 1 });
  }
  function wallSparks(k) {
    const P = T.samples[k.i];
    const side = Math.sign(k.lat) || 1;
    const x = k.x + P.nx * side * 0.6, z = k.z + P.nz * side * 0.6;
    for (let i = 0; i < 14; i++) fx.glow.emit(x, k.y + 0.3, z, { vx: -P.nx * side * 2, vy: 3, vz: -P.nz * side * 2, spread: 4, color: i % 2 ? '#ffd27a' : '#fff', size: 0.06, life: 0.35, gravity: 12, floor: k.y });
  }
  function dust(k, n) { for (let i = 0; i < n; i++) fx.sparks.emit(k.x, k.y + 0.1, k.z, { spread: 3, vy: 0.5, color: '#cfc6b8', size: 0.25, life: 0.6, gravity: -0.2, floor: k.y, drag: 3, grow: 1.4 }); }
  function confetti(k) {
    const cols = ['#FE3377', '#FFCC00', '#3ad1ff', '#2bb673', '#8B7BFF', '#fff'];
    for (let i = 0; i < 90; i++) fx.sparks.emit(k.x, k.y + 2.5, k.z, { vx: 0, vy: 5, vz: 0, spread: 9, color: cols[i % cols.length], size: 0.12, life: 2.2, gravity: 5, floor: k.y, drag: 1.2 });
  }

  // ---------- Cámara ----------
  let camInit = false, camPos = null, shakeT = 0;
  const cam = { pos: new THREE.Vector3(), look: new THREE.Vector3(), yaw: 0, fov: 70, orbit: 0 };
  const _want = new THREE.Vector3();
  function updateCamera(dt, target) {
    if (!T || !world) return;
    const B = world.bounds;
    const cx = (B.x0 + B.x1) / 2, cz = (B.z0 + B.z1) / 2;
    let fovT = 62;
    if (race.ph === 'lobby' || !target) {
      // vuelo alrededor de la pista
      cam.orbit += dt * 0.07;
      const rad = Math.max(B.x1 - B.x0, B.z1 - B.z0) * 0.52;
      const hy = T.def.theme === 'torre' ? rad * 0.55 : rad * 0.5;
      cam.pos.set(cx + Math.cos(cam.orbit) * rad, hy, cz + Math.sin(cam.orbit) * rad);
      cam.look.set(cx, 0, cz);
      camera.position.copy(cam.pos);
      camera.lookAt(cam.look);
      fovT = 55;
      camInit = false;
    } else if (race.ph === 'done' && world.podium.visible) {
      cam.orbit += dt * 0.25;
      const P = world.podium.position;
      const fwd = world.podium.rotation.y;
      const a = fwd + Math.sin(cam.orbit) * 0.5;
      cam.pos.set(P.x + Math.sin(a) * 9.5, P.y + 3.6, P.z + Math.cos(a) * 9.5);
      const dx = P.x - cam.pos.x, dz = P.z - cam.pos.z, dl = Math.hypot(dx, dz) || 1;
      cam.look.set(P.x - (dz / dl) * 3.4, P.y + 1.4, P.z + (dx / dl) * 3.4);
      camera.position.copy(cam.pos);
      camera.lookAt(cam.look);
      fovT = 55;
      camInit = false;
    } else {
      const f = unflag(target.fl || 0);
      const sp = Math.abs(target.sp || 0);
      const hood = camMode === 2;
      const dist = hood ? -0.1 : camMode === 1 ? 8.2 : 5.6;
      const hgt = hood ? 1.32 : camMode === 1 ? 3.5 : 2.7;
      const yawT = target.h + (f.drift ? -f.drift * 0.18 : 0);
      if (!camInit) { cam.yaw = target.h; }
      cam.yaw += wrapAng(yawT - cam.yaw) * Math.min(1, dt * (hood ? 14 : 5.5));
      const want = _want.set(target.x - Math.cos(cam.yaw) * dist, target.y + hgt, target.z - Math.sin(cam.yaw) * dist);
      // no meter la cámara bajo la pista
      const L = K.locate(T, want.x, want.z, views.get(target.id)?.i ?? 0, 30);
      const gy = K.groundAt(T, L.s, Math.max(-6, Math.min(6, L.lat)));
      want.y = Math.max(want.y, gy + (hood ? 1.0 : 1.3));
      if (!camInit) { cam.pos.copy(want); camInit = true; }
      const kxz = 1 - Math.exp(-dt * (hood ? 30 : 12)), ky = 1 - Math.exp(-dt * (hood ? 30 : 7));
      cam.pos.x += (want.x - cam.pos.x) * kxz; cam.pos.z += (want.z - cam.pos.z) * kxz; cam.pos.y += (want.y - cam.pos.y) * ky;
      const ahead = hood ? 10 : 4.5;
      cam.look.set(target.x + Math.cos(target.h) * ahead, target.y + (hood ? 1.0 : 0.9), target.z + Math.sin(target.h) * ahead);
      shakeT = Math.max(0, shakeT - dt);
      const sh = shakeT * 0.25;
      camera.position.set(cam.pos.x + (Math.random() - 0.5) * sh, cam.pos.y + (Math.random() - 0.5) * sh, cam.pos.z + (Math.random() - 0.5) * sh);
      camera.lookAt(cam.look);
      fovT = 66 + Math.min(1, sp / 25) * 10 + (f.boost ? 7 : 0);
    }
    cam.fov += (fovT - cam.fov) * Math.min(1, dt * 4);
    if (Math.abs(camera.fov - cam.fov) > 0.01) { camera.fov = cam.fov; camera.updateProjectionMatrix(); }
    camPos = camera.position;
  }

  // ---------- Cuadro ----------
  function frame(dt, alpha) {
    if (destroyed || !T || !world) return;
    time += dt;
    const nowT = performance.now();
    fpsN++;
    if (!fpsT) fpsT = nowT;
    if (nowT - fpsT >= 1000) { fps = Math.round((fpsN * 1000) / (nowT - fpsT)); fpsT = nowT; fpsN = 0; }
    const list = renderStates(alpha);
    // los karts de los demás, para los choques
    others = list.filter((s) => !s.me && !(isHost && s.ai)).map((s) => ({ id: s.id, x: s.x, y: s.y, z: s.z, vx: Math.cos(s.h) * (s.sp || 0), vz: Math.sin(s.h) * (s.sp || 0), static: true, vehicle: 'kart', ghostT: unflag(s.fl || 0).ghost ? 1 : 0 }));
    // podio en los resultados
    const podium = race.ph === 'done';
    world.podium.visible = podium;
    let shown = list;
    if (podium) {
      world.podium.updateMatrixWorld(true);
      const o = order().slice(0, 3);
      const spots = [[0, 1.2, 0], [-2.3, 0.8, 0], [2.3, 0.5, 0]];
      shown = [];
      o.forEach((q, i) => {
        const s = list.find((x) => x.id === q.id) || { id: q.id, col: q.r.col, name: q.r.name, avatar: q.r.ai ? botLook(q.r.id) : avatarOf(q.r.uid) };
        const P = world.podium.localToWorld(new THREE.Vector3(...spots[i]));
        shown.push({ ...s, x: P.x, y: P.y, z: P.z, h: Math.PI / 2 - world.podium.rotation.y, sp: 0, fl: 0, st: 0, me: false });
      });
    }
    syncViews(shown, dt);
    // objetos en la pista
    for (const it of items.values()) placeItemMesh(it);
    // semáforo
    if (race.ph === 'count') {
      const n = race.cd > 3 ? 0 : race.cd > 2 ? 1 : race.cd > 1 ? 2 : 3;
      world.setLights(n);
      if (n !== lastLightN) { if (n > 0) audio.play('beep'); lastLightN = n; }
    } else if (race.ph === 'race') {
      world.setLights(3, true);
      if (lastLightN !== 9) { lastLightN = 9; audio.play('go'); banner = null; }
    } else { world.setLights(0); lastLightN = -1; }
    if (race.ph === 'done' && !doneFx) { doneFx = true; audio.play('finish', 0.6); const P = world.podium.position; for (let i = 0; i < 3; i++) confetti({ x: P.x + (i - 1) * 2, y: P.y + 1, z: P.z }); }
    if (race.ph !== 'done') doneFx = false;
    fx.sparks.update(dt); fx.glow.update(dt);
    world.update(dt, time);
    // a quién sigue la cámara
    let target = list.find((s) => s.me) || null;
    if (!target && race.ph !== 'lobby') {
      if (watchId == null || !list.some((s) => s.id === watchId)) watchId = order()[0]?.id ?? null;
      target = list.find((s) => s.id === watchId) || list[0] || null;
    }
    updateCamera(dt, target);
    renderer.render(scene, camera);
    // calidad alta: resolución dinámica según cuánto tardan los cuadros
    const realMs = lastFrameAt ? nowT - lastFrameAt : 16.7;
    lastFrameAt = nowT;
    if (quality === 'alta' && !document.hidden && aq.sample(realMs, performance.now() - nowT) != null) fit();
    // sonido
    const mk = me.k;
    const active = race.ph !== 'lobby' && !!mk && me.inRace && race.ph !== 'done';
    audio.update(dt, { speed: mk ? Math.abs(mk.speed) / 25 : 0, throttle: mk && race.ph === 'race' ? Math.max(0, readInputCached.throttle) : 0, drift: mk?.drift ? 1 : 0, tier: mk?.tier || 0, air: mk?.air, boost: mk?.boostT > 0, wind: T.def.theme === 'torre' && mk && mk.y > 11 ? 1 : 0, active });
    readInputCached = me.inRace ? readInput() : { throttle: 0 };
    drawHud(dt, list, target);
    drawUI();
  }
  let readInputCached = { throttle: 0 }, lastLightN = -1, doneFx = false;

  function drawHud(dt, list, target) {
    if (banner) { banner.t -= dt; if (banner.t <= 0 || race.ph === 'done' || race.ph === 'lobby') banner = null; }
    const o = order();
    place = me.k ? o.findIndex((q) => q.id === me.k.id) + 1 : 0;
    const k = me.k;
    const racing = (race.ph === 'race' || race.ph === 'count') && !menu;
    const st = {
      time, race: racing && !!k && me.inRace, cd: race.ph === 'count' ? race.cd : race.ph === 'race' && race.rt < 0.7 ? -race.rt : null,
      place, total: race.R.length, lap: k?.lap || 1, raceT: race.rt, lapT: k && k.lapStart != null ? (k.finished ? k.lapTimes[k.lapTimes.length - 1] : race.rt - k.lapStart) : 0, best: k?.bestLap ?? null,
      record: boards[race.tr]?.[0] ? boards[race.tr][0].score / 1000 : null,
      item: k?.item || null, roulette: me.roul > 0, kmh: k ? k.speed * 3.6 : 0, boost: k?.boostT > 0 ? Math.min(1, k.boostT) : 0,
      drift: k?.drift ? { tier: k.tier, charge: k.charge } : null, wrong: k && k.wrongT > 1.2 && !k.finished, banner,
      karts: list.map((s) => ({ x: s.x, z: s.z, color: colorBody(s.col), me: s.me })),
      standings: racing ? o.map((q) => ({ name: q.r.name, color: colorBody(q.r.col), me: me.k && q.id === me.k.id, finished: q.finished, ai: q.r.ai })) : [],
      watching: !me.inRace && (race.ph === 'race' || race.ph === 'count') ? (race.R.find((r) => r.id === watchId)?.name || '') : null,
      hint: !me.inRace && mySeat >= 0 && (race.ph === 'race' || race.ph === 'count') ? 'Entras en la siguiente carrera' : (k && k.finished && race.ph === 'race' ? 'Esperando a que lleguen los demás…' : null),
      touch: !!touchState, fps, showFps: false,
    };
    const dpr = Math.min(window.devicePixelRatio || 1, 2); // igual que el tamaño del lienzo del HUD
    hg.setTransform(dpr, 0, 0, dpr, 0, 0);
    hud.draw(hg, cssW, cssH, st);
    ui.showTouch(!!touchState && me.inRace && race.ph === 'race' && !menu);
    const s = race.ph === 'lobby' ? 'En la sala' : race.ph === 'count' ? 'Preparados…' : race.ph === 'race' ? (me.inRace && k ? `${place}º lugar · vuelta ${Math.min(K.LAPS, k.lap || 1)}/${K.LAPS}` : `👀 ${T.def.name}`) : 'Resultados';
    if (s !== lastStatus) { lastStatus = s; ctx.status(s); }
  }
  let lastStatus = '';

  function drawUI() {
    const seated = room.seats.map((uid, seat) => (uid ? { uid, seat } : null)).filter(Boolean);
    const hostName = nameOf(room.host);
    const rec = (id) => { const t = boards[id]?.[0]; return t ? { name: nameOf(t.userId), ms: t.score } : null; };
    const board = (id) => (boards[id] || []).slice(0, 6).map((q) => ({ name: nameOf(q.userId), ms: q.score, me: q.userId === myId }));
    let v = null;
    if (menu && race.ph !== 'lobby' && race.ph !== 'done') v = { mode: 'menu', multi: seated.length > 1, camera: CAM_NAMES[camMode], quality: quality === 'alta' ? 'Alta' : 'Baja', isHost, muted };
    else if (race.ph === 'lobby') {
      v = {
        mode: 'lobby', track: race.tr, trackName: K.trackDef(race.tr).name, bots: race.bots, color: myColor, isHost, hostName,
        canPlay: mySeat >= 0, canJoin: mySeat < 0 && room.seats.some((x) => !x),
        players: seated.map((p) => ({ name: nameOf(p.uid), color: colorBody(colOfSeat(p.seat)), host: p.uid === room.host, me: p.uid === myId })),
        records: Object.fromEntries(K.TRACK_IDS.map((id) => [id, rec(id)])), board: board(race.tr),
      };
    } else if (race.ph === 'done') {
      const o = order();
      v = {
        mode: 'results', title: me.inRace && place === 1 ? '¡Ganaste la carrera!' : 'Resultados', trackName: K.trackDef(race.tr).name, isHost, hostName, newRecord: me.newRecord,
        rows: o.map((q, i) => ({ place: i + 1, name: q.r.name, color: colorBody(q.r.col), ai: q.r.ai, me: me.k && q.id === me.k.id, dnf: !q.finished, time: q.finished ? q.finishT : null, best: q.best })),
        board: board(race.tr),
      };
    }
    ui.render(v);
  }

  // ---------- Arranque ----------
  loadTrack(race.tr);
  fit();
  const loop = gameLoop({ step: simStep, frame, hz: HZ, maxSteps: 10, budgetMs: 12 }); // con tope: no se espiralea

  // ---------- Pruebas automáticas (inofensivo en producción) ----------
  const debug = {
    state: () => ({
      ready: !!world, phase: race.ph, track: race.tr, seq: race.seq, rt: race.rt, cd: race.cd, host: isHost, seat: mySeat, inRace: me.inRace,
      lap: me.k?.lap ?? 0, place, finished: !!me.k?.finished, racers: race.R.length, bots: bots.size, x: me.k?.x, y: me.k?.y, z: me.k?.z, s: me.k?.s,
      speed: me.k?.speed ?? 0, best: me.k?.bestLap ?? null, fps, ui: ui.root.dataset.mode || '', items: items.size, item: me.k?.item ?? null,
      drift: me.k?.drift ?? 0, tier: me.k?.tier ?? 0, boost: me.k?.boostT ?? 0, cam: camMode, views: views.size, others: others.length, color: myColor, calls: renderer.info.render.calls, tris: renderer.info.render.triangles,
    }),
    start: ({ track, bots: nb } = {}) => { if (track && isHost) { race.tr = track; loadTrack(track); } if (nb != null) race.bots = nb; startRace(); return race.seq; },
    skipCountdown: () => { if (isHost && race.ph === 'count') race.cd = 0.0001; },
    autopilot: (v = true) => { autopilot = v; },
    input: (inp) => { forced = inp || null; },
    advance: (sec) => { const n = Math.round(sec * HZ); forceStep = true; for (let i = 0; i < n; i++) simStep(1 / HZ); forceStep = false; camInit = false; return race.ph; },
    freeze: (v = true) => { frozen = v; },
    give: (id) => { if (me.k) me.k.item = id; },
    useItem: () => useItem(me.k, true),
    respawn: () => doRespawn(),
    camera: (m) => { camMode = m; },
    quality: setQuality,
    watch: (id) => { watchId = id; },
    track: () => T && { id: T.id, length: T.length, N: T.N, checkpoints: T.checkpoints.length },
    toLobby,
    menu: (v = true) => { menu = v; },
  };
  window.__karts = debug;

  return {
    destroy() {
      destroyed = true;
      loop?.stop();
      if (window.__karts === debug) delete window.__karts;
      if (weFull && document.fullscreenElement) document.exitFullscreen?.().catch?.(() => {});
      audio.stop();
      ui.destroy();
      for (const c of cleanups) c();
      world?.dispose();
      fx.sparks.dispose(); fx.glow.dispose();
      scene.traverse((o) => { o.geometry?.dispose?.(); });
      renderer.dispose();
      renderer.forceContextLoss?.();
    },
  };
}
