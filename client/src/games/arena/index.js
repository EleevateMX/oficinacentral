// 🎯 Arena HUB: shooter en primera persona jugador contra jugador (de 1 a 8, con bots para practicar).
// Duelo 1v1, Todos contra todos, Por equipos y Último en pie, en arenas con temática de oficina.
//
// - El anfitrión (room.host) corre la simulación con paso fijo de 60 Hz (sim.js) y manda estados ~20
//   por segundo; los demás los interpolan ~100 ms en el pasado (netSync.js).
// - Cada quien mueve a su personaje en su computadora (sin retraso) y manda su posición y sus
//   disparos con la hora del anfitrión que estaba viendo: el anfitrión rebobina a los blancos a ese
//   momento (compensación de retraso) y valida cadencia, balas, dispersión y velocidad.
// - Si el anfitrión se va, el siguiente jugador rearma la partida con el último estado y sigue.
// - Reutiliza de Zombies: el mundo 3D, los modelos, el arsenal, el arma en primera persona, los
//   efectos, el HUD de armas, el menú, el audio y las opciones.
import * as THREE from 'three';
import { office } from '../../lib/store.js';
import { api } from '../../lib/api.js';
import { composeFloor } from '@shared/map.js';
import { TILE_M, CELL, cellAt } from '@shared/zombies.js';
import { ARMS, ENERGY_MAX, BASH, COMBO, HEAVY, COMBO_WINDOW, isSword, spreadAt, arcHits, techPath, swingOf, angDiff, pelletDirs } from '@shared/arsenal.js';
import {
  MODES, BODY, stanceOf, TEAM_COLORS, SEAT_COLORS, MAX_PLAYERS, cleanLoadout, STREAKS, MULTI, RESPAWN_T, canSwitchTeam, traceShot, arenaLos, PVP_TECHS, syncClock,
} from '@shared/arena.js';
import { ARENA_MAPS, MAP_IDS, arenaLevel, arenaFloor, officeArenaLevel } from '@shared/arenaMaps.js';
import * as sim from './sim.js';
import { buildWorld } from '../zombies/world.js';
import { voxelAvatar, GEO, mat } from '../zombies/models.js';
import { avatarSword } from '../zombies/arsenalModels.js';
import { createViewModel } from '../zombies/viewModel.js';
import { SwordTrail, Slashes, Beams, TechFx, BurnZones } from '../zombies/vfx.js';
import { speedLines } from '../zombies/weaponHud.js';
import { Particles, Splats, Rings, Tracers } from '../zombies/fx.js';
import { loadOpts, saveOpts } from '../zombies/options.js';
import { ZAudio } from '../zombies/audio.js';
import { SnapBuffer, gameLoop, stamp } from '../netSync.js';
import { playSound } from '../../lib/sounds.js';
import { drawAvatarFace } from '../../lib/render.js';
import { skyline, ZoneFx, Loot, neonBoard } from './props.js';
import { Avatars, handWeapon } from './players.js';
import { ArenaHud } from './hud.js';
import { ArenaMenu } from './menu.js';

export const meta = { w: 1280, h: 720, wide: true, persistent: true, maxSeats: MAX_PLAYERS, help: '' };

const S = TILE_M;
const store = (k, v) => { try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch { return null; } return null; };
const r3 = (v) => Math.round(v * 1000) / 1000;
const lerpAng = (a, b, k) => a + angDiff(a, b) * k;
const now = () => performance.now();
const KILLCAM_T = 2.6;

export function create(canvas, ctx) {
  let destroyed = false;
  const cleanups = [];
  const on = (el, ev, fn, o) => { el.addEventListener(ev, fn, o); cleanups.push(() => el.removeEventListener(ev, fn, o)); };
  const touchDevice = typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches;
  let quality = store('zombies.quality') || (touchDevice ? 'baja' : 'alta');
  const opts = loadOpts();

  // HUD encima del 3D
  const stage = canvas.parentElement;
  const hudCanvas = document.createElement('canvas');
  hudCanvas.className = 'zb-hud';
  Object.assign(hudCanvas.style, { position: 'absolute', pointerEvents: 'none', left: '0px', top: '0px' });
  stage.appendChild(hudCanvas);
  cleanups.push(() => hudCanvas.remove());
  // la oficina de abajo no se ve mientras juegas: que no se dibuje
  office.mapPaused = true;
  cleanups.push(() => { office.mapPaused = false; });
  const hg = hudCanvas.getContext('2d');
  const hud = new ArenaHud();
  const prevTouch = canvas.style.touchAction;
  canvas.style.touchAction = 'none';
  cleanups.push(() => { canvas.style.touchAction = prevTouch; canvas.style.width = ''; canvas.style.height = ''; canvas.style.imageRendering = ''; });

  let renderer;
  try { renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' }); } catch {
    const g2 = canvas.getContext('2d');
    if (g2) { g2.fillStyle = '#12111a'; g2.fillRect(0, 0, canvas.width, canvas.height); g2.fillStyle = '#fff'; g2.font = '700 28px system-ui'; g2.textAlign = 'center'; g2.fillText('Tu navegador no tiene 3D (WebGL) activado', canvas.width / 2, canvas.height / 2); }
    ctx.status('No se pudo iniciar el 3D en este navegador');
    return { destroy() { for (const c of cleanups) c(); } };
  }
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.autoClear = false;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#14161d');
  scene.fog = new THREE.Fog('#14161d', 14, 60);
  const camera = new THREE.PerspectiveCamera(74, 16 / 9, 0.05, 220);
  camera.rotation.order = 'YXZ';
  const vmScene = new THREE.Scene();
  const vmCam = new THREE.PerspectiveCamera(58, 16 / 9, 0.01, 5);
  vmScene.add(new THREE.HemisphereLight('#ffffff', '#554466', 2.2));
  const vmSun = new THREE.DirectionalLight('#fff2dd', 1.6); vmSun.position.set(1, 2, 1); vmScene.add(vmSun);
  const vmFlashLight = new THREE.PointLight('#ffd27a', 0, 3, 2); vmFlashLight.position.set(0.2, -0.1, -0.7); vmScene.add(vmFlashLight);
  const worldFlash = new THREE.PointLight('#ffcf70', 0, 9, 1.6); scene.add(worldFlash);

  let cssW = 1280, cssH = 720;
  function fit() {
    const head = stage.parentElement?.querySelector('.game-head')?.offsetHeight ?? 44;
    cssW = Math.max(240, Math.floor(stage.clientWidth || window.innerWidth || 960));
    cssH = Math.max(180, Math.floor(stage.clientHeight || (window.innerHeight || 800) - head));
    canvas.style.width = `${cssW}px`; canvas.style.height = `${cssH}px`;
    const dpr = window.devicePixelRatio || 1;
    renderer.setPixelRatio(quality === 'alta' ? Math.min(dpr, 1.5) : Math.min(dpr, 1) * 0.5);
    renderer.setSize(cssW, cssH, false);
    canvas.style.imageRendering = quality === 'alta' ? '' : 'pixelated';
    hudCanvas.width = Math.round(cssW * dpr); hudCanvas.height = Math.round(cssH * dpr);
    hudCanvas.style.width = `${cssW}px`; hudCanvas.style.height = `${cssH}px`;
    hudCanvas.style.left = `${canvas.offsetLeft}px`; hudCanvas.style.top = `${canvas.offsetTop}px`;
    ui.layout(canvas.offsetLeft, canvas.offsetTop, cssW, cssH);
    camera.aspect = vmCam.aspect = cssW / cssH;
    camera.updateProjectionMatrix(); vmCam.updateProjectionMatrix();
  }
  const za = new ZAudio();
  cleanups.push(() => za.dispose());

  // ---------- Estado ----------
  const myId = ctx.me;
  let room = ctx.room || { seats: (ctx.players || []).map((p) => p?.id ?? null), host: ctx.host ? myId : null, watchers: [] };
  let mySeat = ctx.seat;
  let isHost = room.host === myId && mySeat >= 0;
  let Sim = null; // solo el anfitrión
  const buf = new SnapBuffer({ delay: 100 });
  let latest = null;
  const pendingEv = [];
  let snapAcc = 0, inputAcc = 0, shotAcc = 0;
  const inputBufs = Array.from({ length: MAX_PLAYERS }, () => new SnapBuffer({ delay: 110 }));
  const pendingShots = [];
  const me = { x: 0, y: 0, a: 0, p: 0, mv: 0, cr: 0, crK: 0, alive: false, sp: -1, seat: mySeat };
  let myLoad = cleanLoadout((store('arena.load') || '').split(',').map(Number));
  const L = newArms();
  let menu = true, entered = false, fresh = false, ready = false, watchSeat = -1;
  let lobbyT = null;
  let level = null, curMap = null, world = null, sky = null, officeFloor = null, focus = null, ceil = null;
  const levels = {};
  const extras = [];
  let lights = [];
  const fx = {};
  let loop = null;
  let viewPlayers = [];
  let lastPhase = null, lastMid = -1, postedMid = -1;
  let summary = null;
  const popups = [], killFeed = [], dmgNums = [], dmgDirs = [], pings = new Map();
  let hurt = 0, hitT = 0, hitKill = false, hitHead = false, shake = 0, recoil = 0, flashT = 0, bob = 0, switchAnim = 0, time = 0, fps = 0, fpsAcc = 0, fpsN = 0, frames = 0;
  let techFx = null, hitStop = 0, fovKick = 0, dash = null, boomT = 0, techWasReady = false, fxScale = 1, stepT = 0;
  const boomPos = new THREE.Vector3();
  let killcam = null, scoreboard = false, lastStatus = '', teamsKey = '', killsOnHumans = 0;
  let warmed = false, lobbyStage = null;
  const keys = new Set();
  let firing = false, mouseDown = false;
  const touch = touchDevice ? { sx: 0, sy: 0, stickId: null, lookId: null, lx: 0, ly: 0, fire: false } : null;
  const vm = createViewModel(vmScene);
  const muzzle = vm.muzzle;
  const avatars = new Avatars(scene);
  const lineup = new Avatars(scene); // la sala: el equipo formado frente a la cámara
  const faces = new Map();
  const profiles = {}; // uid -> { level, xp… } del servidor
  let profT = 0;

  function newArms() {
    return { owned: ARMS.map((_, i) => myLoad.includes(i)), cur: myLoad[0], mag: ARMS.map((w) => w.mag || 0), res: ARMS.map((w) => w.reserve || 0), cd: 0, reloadT: 0, switchT: 0, burst: 0, burstT: 0, ads: false, adsK: 0, charge: -1, combo: 0, comboT: 0, swing: null, queued: false, techAnim: null, bashCd: 0, bashT: 0, wheel: null, lastTech: ARMS[myLoad[2]]?.tech || 'agua', freeze: false, barT: 0 };
  }
  function resetArms(owned) {
    Object.assign(L, newArms());
    if (owned) L.owned = owned.slice();
    if (!L.owned[L.cur]) L.cur = L.owned.findIndex(Boolean);
  }

  const users = () => office.state.users;
  const avatarOf = (uid) => users()[uid]?.avatar || {};
  const isBotSeat = (i) => !!pl(i)?.bot;
  const nameOfSeat = (i) => {
    const P = pl(i);
    if (P?.bot) return `${botName(i)}`;
    const uid = room.seats[i];
    return users()[uid]?.displayName?.split(' ')[0] || `Jugador ${i + 1}`;
  };
  const botName = (i) => (isHost && Sim ? Sim.players[i]?.name : latest?.N?.[i]) || sim.BOT_NAMES[i % sim.BOT_NAMES.length];
  const modeId = () => cfgNow().mode;
  const M = () => MODES[modeId()] || MODES.ffa;
  const colorOf = (i) => { const P = pl(i); return M().teams && P ? TEAM_COLORS[P.team] : SEAT_COLORS[i % SEAT_COLORS.length]; };
  function faceOf(uidOrBot) {
    if (uidOrBot == null) return null;
    let c = faces.get(uidOrBot);
    if (!c) {
      c = document.createElement('canvas'); c.width = c.height = 48;
      try { if (typeof uidOrBot === 'number') drawAvatarFace(c, avatarOf(uidOrBot)); else { const g = c.getContext('2d'); g.fillStyle = '#1d2033'; g.fillRect(0, 0, 48, 48); g.font = '30px system-ui'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('🤖', 24, 26); } } catch { /* sin avatar */ }
      faces.set(uidOrBot, c);
    }
    return c;
  }

  // ---------- Estado compartido (anfitrión: la simulación; los demás: el último estado) ----------
  function pl(i) {
    if (isHost && Sim) return Sim.players[i];
    if (!latest?.P?.[i]) return null;
    return latestPs()[i];
  }
  let lpCache = [], lpFor = null;
  function latestPs() { if (lpFor !== latest) { lpFor = latest; lpCache = latest ? sim.unpackPlayers(latest) : []; } return lpCache; }
  const phaseNow = () => (isHost && Sim ? Sim.phase : latest?.ph || 'lobby');
  const cfgNow = () => (isHost && Sim ? Sim.cfg : latest?.cfg || { mode: 'ffa', map: 'bodega', limit: 20, time: 480, bots: 0, diff: 'normal' });
  const myState = () => (mySeat >= 0 ? pl(mySeat) : null);
  const clockNow = () => (isHost && Sim ? Sim.clock : latest?.clk ?? 0);
  const ptNow = () => (isHost && Sim ? Sim.pt : latest?.pt ?? 0);
  const teamScoreNow = () => (isHost && Sim ? Sim.teamScore : latest?.ts || [0, 0]);
  const roundWinsNow = () => (isHost && Sim ? Sim.roundWins : latest?.rw || []);
  const duelNow = () => (isHost && Sim ? Sim.duel : latest?.du || []);
  const zoneNow = () => (isHost && Sim ? Sim.zone : sim.unpackZone(latest?.z));
  const resultNow = () => (isHost && Sim ? Sim.result : latest?.res || null);
  const midNow = () => (isHost && Sim ? Sim.mid : latest?.mid || 0);
  const pickupsNow = () => (isHost && Sim ? Sim.pickups.filter((k) => k.on) : (latest?.K || []).map((k) => ({ id: k[0], kind: sim.PICK_KINDS[k[1]], x: k[2] / 100, y: k[3] / 100, w: k[4] })));

  // ---------- Menús ----------
  const ui = new ArenaMenu(stage, {
    me: myId, touch: touchDevice,
    avatarOf: (uid) => avatarOf(uid),
    nameOf: (uid) => users()[uid]?.displayName || 'Alguien',
    thumb: (c, id) => drawThumb(c, id),
    actions: {
      start: () => hostStart(true),
      ready: () => setReady(!myReadyNow()),
      enter: () => { entered = true; if (mySeat >= 0) resumePlay(true); else menu = false; },
      resume: () => resumePlay(fresh),
      leave: () => ctx.close?.(),
      sit: () => ctx.sit?.(),
      joinMatch: (g) => office.set({ modal: { type: 'game', objectId: g.objectId, game: 'arena', floorId: g.floorId } }),
      setCfg: (k, v) => setCfg(k, v),
      setLoad: (slot, w) => { const l = myLoad.slice(); l[slot] = w; setLoadout(l); },
      setLoadout: (l) => setLoadout(l),
      team: (t) => requestTeam(t),
      autoTeams: () => { if (isHost && Sim) { for (const p of Sim.players) if (p) p.wantTeam = null; sim.assignTeams(Sim); } },
      lobby: () => backToLobby(),
      rematch: () => { backToLobby(); hostStart(true); },
      setOpt: (k, v) => setOpt(k, v),
      sound: (n) => playSound(n, volUi() * 0.12),
    },
  });
  cleanups.push(() => ui.destroy());
  const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(fit) : null;
  ro?.observe(stage);
  on(window, 'resize', fit);
  cleanups.push(() => ro?.disconnect());

  // ---------- Arranque: el piso de la oficina (para "La Oficina") y el primer mapa ----------
  (async () => {
    await Promise.resolve(); // que termine de armarse create() antes de usar nada
    officeFloor = office.state.floor;
    const has = (f) => f?.objects?.some((o) => o.id === ctx.objectId);
    if (!has(officeFloor) && ctx.floorId) {
      try { const { floor: raw } = await api.get(`/floors/${ctx.floorId}`); officeFloor = composeFloor({ template: raw.template, areas: raw.areas, objects: raw.objects }); } catch { /* el que hay */ }
    }
    if (destroyed) return;
    const cab = officeFloor?.objects?.find((o) => o.id === ctx.objectId);
    focus = cab ? { x: cab.x, y: cab.y } : officeFloor?.spawn;
    fx.particles = new Particles(scene); fx.splats = new Splats(scene, 60); fx.rings = new Rings(scene); fx.tracers = new Tracers(scene);
    fx.slashes = new Slashes(scene); fx.beams = new Beams(scene); fx.tech = new TechFx(scene, fx.particles); fx.zones = new BurnZones(scene, fx.particles);
    fx.zone = new ZoneFx(scene); fx.loot = new Loot(scene);
    vm.trail = new SwordTrail(vmScene);
    renderer.shadowMap.enabled = quality === 'alta';
    camera.fov = opts.fov; camera.updateProjectionMatrix();
    useMap(isHost ? cfgNow().map : latest?.cfg?.map || 'bodega');
    if (isHost) startSim();
    fit();
    loop = gameLoop({ step: hostStep, frame, hz: 60, maxSteps: 5, budgetMs: 12 }); // con tope: no se espiralea
  })();

  function levelFor(id) {
    if (levels[id]) return levels[id];
    let Lv = null;
    if (id === 'oficina') { if (officeFloor) Lv = officeArenaLevel(officeFloor, focus); }
    else Lv = arenaLevel(id);
    if (!Lv) Lv = arenaLevel('bodega');
    levels[id] = Lv;
    return Lv;
  }
  // Construye el 3D del mapa (solo cuando cambia)
  function useMap(id) {
    if (!MAP_IDS.includes(id)) id = 'bodega';
    if (curMap === id && world) return;
    curMap = id;
    level = levelFor(id);
    if (world) { scene.remove(world.group); world.dispose(); }
    if (sky) { scene.remove(sky.group); sky.dispose(); sky = null; }
    for (const e of extras.splice(0)) { scene.remove(e); e.userData.dispose?.(); }
    const floor = id === 'oficina' ? officeFloor : arenaFloor(id);
    const signs = level.signs;
    if (level.sky) level.signs = [];
    world = buildWorld(level, floor, { quality });
    level.signs = signs;
    scene.add(world.group);
    ceil = null; lights = [];
    world.group.traverse((o) => {
      if (o.isMesh && o.material?.emissiveMap) ceil = o;
      if (o.isLight) lights.push(o);
    });
    if (level.sky) {
      if (ceil) ceil.visible = false;
      sky = skyline(level);
      scene.add(sky.group);
      scene.background.set('#090a18'); scene.fog.color.set('#151530'); scene.fog.near = 30; scene.fog.far = 140;
      // letrero de neón sobre la caseta
      const cx = level.W / 2, cy = level.H / 2;
      for (const k of [-1, 1]) { const b = neonBoard('HUB', '#FE3377', 4.2); b.position.set(cx * S, 3.4, (cy + k * 4.6) * S); b.rotation.y = k > 0 ? 0 : Math.PI; scene.add(b); extras.push(b); }
    } else {
      scene.background.set('#14161d'); scene.fog.color.set('#14161d'); scene.fog.near = quality === 'alta' ? 12 : 8; scene.fog.far = quality === 'alta' ? 52 : 34;
    }
    fx.loot?.clear(); fx.splats?.clear?.();
    avatars.clear(); lineup.clear();
    if (isHost && Sim && Sim.phase === 'lobby') { Sim.level = level; Sim.fields.clear(); }
    hud.miniKey = '';
    warmed = false;
    lobbyStage = null;
  }

  // ---------- Simulación (anfitrión) ----------
  function startSim() {
    Sim = sim.createSim(level, { cfg: { map: curMap, bots: 3 } }); // solo: ya con bots para practicar
    for (let i = 0; i < MAX_PLAYERS; i++) if (room.seats[i]) sim.addPlayer(Sim, i, { load: room.seats[i] === myId ? myLoad : null });
    refillBots();
    lastPhase = null;
  }
  const humansSeated = () => room.seats.filter(Boolean).length;
  function refillBots() {
    if (!Sim) return;
    for (let i = 0; i < MAX_PLAYERS; i++) if (room.seats[i] && (!Sim.players[i] || Sim.players[i].bot)) sim.addPlayer(Sim, i, { load: room.seats[i] === myId ? myLoad : null });
    for (let i = 0; i < MAX_PLAYERS; i++) if (!room.seats[i] && Sim.players[i] && !Sim.players[i].bot) sim.removePlayer(Sim, i);
    const max = Math.min(MAX_PLAYERS, Math.max(MODES[Sim.cfg.mode].max, humansSeated()));
    // en la sala y en los modos con reaparecer se rellena; en un duelo o Último en pie, solo antes de empezar
    if (Sim.phase === 'lobby' || MODES[Sim.cfg.mode].respawn) sim.fillBots(Sim, Math.min(max, humansSeated() + Sim.cfg.bots));
  }
  function setCfg(k, v) {
    if (!isHost || !Sim || Sim.phase !== 'lobby') return;
    const c = { ...Sim.cfg, [k]: ['limit', 'time', 'bots'].includes(k) ? Number(v) : v };
    if (k === 'mode') { const Mo = MODES[v]; if (Mo) { c.limit = Mo.limits[0]; c.time = Mo.times[0]; if (Mo.max === 2) c.bots = Math.min(c.bots, Math.max(0, 2 - humansSeated())); } }
    sim.setConfig(Sim, c);
    refillBots();
    if (k === 'map') useMap(Sim.cfg.map);
  }
  function canStartNow() {
    const c = cfgNow();
    const n = humansSeated() + (isHost && Sim ? sim.bots(Sim).length : 0);
    if (n < 2) return { ok: false, why: 'Agrega bots o espera a alguien' };
    return { ok: true };
  }
  function hostStart(byClick = false) {
    if (!isHost || !Sim || Sim.phase !== 'lobby') return;
    if (!canStartNow().ok) { popup('Necesitas al menos un rival (agrega bots)', '#ff8080'); return; }
    refillBots();
    sim.startMatch(Sim);
    lobbyT = null;
    entered = true; menu = true; fresh = true; ready = false;
    if (byClick) resumePlay(true);
  }
  function backToLobby() {
    if (!isHost || !Sim) return;
    Sim.phase = 'lobby'; Sim.result = null; Sim.pickups = []; Sim.zone = null; Sim.zplan = null;
    for (const p of Sim.players) if (p) { p.alive = false; p.ready = false; p.spec = false; }
    refillBots();
  }
  function lobbyTick(dt) {
    const guests = Sim.players.filter((p, i) => p && !p.bot && room.seats[i] && i !== mySeat);
    if (guests.length && guests.every((p) => p.ready) && canStartNow().ok) { lobbyT = lobbyT == null ? 6 : lobbyT - dt; if (lobbyT <= 0) hostStart(false); }
    else lobbyT = null;
  }
  function hostStep(dt) {
    if (!isHost || !Sim || destroyed || !level) return;
    if (Sim.phase === 'lobby') lobbyTick(dt);
    const P = Sim.players[mySeat];
    if (P && !P.bot) {
      if (P.alive && P.sp === me.sp && (Sim.phase === 'live')) { P.x = me.x; P.y = me.y; }
      P.a = me.a; P.p = me.p; P.cr = me.cr; P.mv = me.mv;
      if (L.owned[L.cur] && P.owned[L.cur]) P.w = L.cur;
    }
    sim.step(Sim, dt, now());
    const evs = Sim.ev.splice(0);
    if (evs.length) { handleEvents(evs); pendingEv.push(...evs); }
    for (const g of Sim.grants.splice(0)) { if (g.s === mySeat) applyGrant(g); else ctx.sendEvent({ k: 'grant', ...g }); }
    sendSnap(dt);
    syncTeamsVoice();
  }
  function sendSnap(dt) {
    snapAcc += dt;
    if (snapAcc < 0.05) return;
    snapAcc = 0;
    const d = sim.pack(Sim);
    d.ev = pendingEv.splice(0).slice(-80);
    if (lobbyT != null) d.lt = Math.round(lobbyT * 10) / 10;
    latest = d;
    if (humansSeated() > 1 || room.watchers?.length) ctx.sendState(stamp(d));
  }
  // Voz por equipo: en "Por equipos", durante la partida, solo se oye a tu equipo
  function syncTeamsVoice() {
    const live = Sim.phase !== 'lobby' && Sim.phase !== 'over' && MODES[Sim.cfg.mode].teams;
    const teams = {};
    for (let i = 0; i < MAX_PLAYERS; i++) { const uid = room.seats[i]; if (uid) teams[uid] = live && Sim.players[i] ? Sim.players[i].team : null; }
    const k = JSON.stringify(teams);
    if (k === teamsKey) return;
    teamsKey = k;
    office.socket?.emit('arena:teams', { objectId: ctx.objectId, teams });
  }

  // ---------- Red ----------
  ctx.onInput((seat, d) => {
    if (!isHost || !Sim || !d) return;
    const P = Sim.players[seat];
    if (!P || P.bot || room.seats[seat] == null) return;
    const r = sim.applyInput(Sim, seat, d);
    if (r.fix && now() - (P.fixT || 0) > 250) { P.fixT = now(); ctx.sendEvent(r.fix); }
    if (r.ok) inputBufs[seat].push(d);
  });
  ctx.onState((d) => {
    if (isHost || !d) return;
    if (!buf.push(d)) return;
    latest = d;
    if (d.ev?.length) handleEvents(d.ev);
    if (d.cfg?.map && d.cfg.map !== curMap && level) useMap(d.cfg.map);
  });
  ctx.onEvent((seat, d) => {
    if (!d) return;
    if (d.k === 'grant' && d.s === mySeat && !isHost) applyGrant(d);
    if (d.k === 'pos' && d.s === mySeat && !isHost) { if ((d.sp | 0) === me.sp) { me.x = d.x; me.y = d.y; } }
    if (d.k === 'nope' && d.s === mySeat) popup(d.why || 'No se pudo', '#ff8080');
    if (!isHost || !Sim) return;
    const P = Sim.players[seat];
    if (!P || P.bot) return;
    const t = now();
    if (d.k === 'shots' && Array.isArray(d.list)) {
      const list = d.list.slice(0, 24);
      for (const sh of list) if (Number.isFinite(sh.ct)) syncClock(P, sh.ct, t);
      for (const sh of list) {
        if (![sh.x, sh.y, sh.a, sh.p].every(Number.isFinite)) continue;
        const res = sim.fire(Sim, seat, { x: sh.x, y: sh.y, a: sh.a, p: sh.p, w: sh.w | 0, seed: sh.seed | 0, sp: Number(sh.sp), rt: Number(sh.rt), ct: Number(sh.ct) }, t);
        for (const q of res) impactFx(q, seat, false, ARMS[sh.w | 0]);
      }
    } else if (d.k === 'melee') sim.melee(Sim, seat, { kind: String(d.kind), step: d.step | 0, w: d.w | 0, x: Number(d.x), y: Number(d.y), a: Number(d.a), rt: Number(d.rt) }, t);
    else if (d.k === 'tech') { const r = sim.technique(Sim, seat, { w: d.w | 0, x: Number(d.x), y: Number(d.y), a: Number(d.a) }); if (!r.ok) ctx.sendEvent({ k: 'nope', s: seat, why: r.why }); }
    else if (d.k === 'ready') { P.ready = !!d.on; }
    else if (d.k === 'load') sim.setLoad(Sim, seat, d.load);
    else if (d.k === 'team') sim.setTeam(Sim, seat, Number(d.t));
  });
  ctx.onRoom?.((r) => {
    room = r;
    const ns = r.seats.indexOf(myId);
    if (ns >= 0 && mySeat >= 0 && ns !== mySeat) mySeat = ns;
    const hostNow = r.host === myId && mySeat >= 0;
    if (hostNow && !isHost && level) {
      // migración: sigo yo con lo último que vi
      Sim = latest ? sim.restoreSim(level, latest) : null;
      if (!Sim) startSim();
      isHost = true;
      feedText('Ahora tú llevas la partida', '#9fe3ff');
    }
    isHost = hostNow;
    if (isHost && Sim) refillBots();
  });

  // ---------- Eventos (sonidos, efectos, registro de bajas) ----------
  const volUi = () => Math.max(0.2, ctx.volume ?? 0.6) * (opts.master / 100);
  const vol = () => volUi() * (opts.effects / 100);
  const snd = (name, v) => za.play(name, { vol: v });
  function spatial(name, x, y, v = 1) { if (x == null) { snd(name, vol() * v); return; } za.play(name, { x: x * S, z: y * S, vol: vol() * v }); }
  function popup(text, color, big = false) { popups.push({ text, color, big, t: 1 }); if (popups.length > 4) popups.shift(); }
  function feedText(text, color) { killFeed.push({ killer: text, kc: color, victim: '', vc: '#fff', w: -2, t: 4 }); }
  const posOf = (s) => (s === mySeat ? me : viewPlayers[s] || pl(s));
  function medal(title, icon = '★', tone = '', sub = '') { ui.banner({ kind: 'medal', title, icon, tone, sub, dur: 2.2 }); }

  function handleEvents(evs) {
    for (const e of evs) {
      switch (e.k) {
        case 'fire': if (e.s !== mySeat) { avatars.fire(e.s); const P = posOf(e.s); spatial(ARMS[e.w]?.sound || 'stapler', P?.x, P?.y, 0.75); const isEnemy = enemySeat(e.s); if (isEnemy && P) pings.set(e.s, { x: P.x, y: P.y, t: 1.4 }); } break;
        case 'hit': {
          if (e.s === mySeat && e.v !== mySeat) {
            hitT = 0.22; hitHead = !!e.hd; hitKill = false;
            snd('hitmark', vol() * 0.85);
            if (opts.dmgNums && e.d > 0) dmgNums.push({ x: e.x * S, y: (e.h || 1.2) + 0.3, z: e.y * S, text: String(e.d), color: e.hd ? '#FFCC00' : e.ar ? '#4FD8FF' : '#ffffff', big: !!e.hd, t: 1 });
            if (dmgNums.length > 24) dmgNums.shift();
          }
          if (e.v === mySeat) {
            hurt = Math.min(1, hurt + 0.3 + e.d / 70); shake = Math.max(shake, 0.18 + e.d / 120);
            if (e.fx || e.fy) dmgDirs.push({ wx: e.fx, wy: e.fy, t: 1.2 });
            if (dmgDirs.length > 5) dmgDirs.shift();
            snd('hurt', vol() * 0.9);
          }
          // chispas de "papel picado" (nada de sangre)
          fx.particles?.burst(e.x * S, e.h || 1.2, e.y * S, e.hd ? 12 : 6, { colors: e.ar ? ['#4FD8FF', '#ffffff', '#bff4ff'] : ['#ffffff', '#FE3377', '#FFCC00'], speed: 2.4, size: 0.035, life: 0.5 });
          break;
        }
        case 'kill': onKill(e); break;
        case 'spawn':
          if (e.s === mySeat) { me.x = e.x; me.y = e.y; me.a = e.a; me.p = 0; me.cr = 0; me.sp = e.sp; me.alive = true; killcam = null; resetArms(pl(mySeat)?.owned); }
          fx.rings?.add(e.x * S, e.y * S, { color: colorOf(e.s), max: 1.6, life: 0.5 });
          break;
        case 'start': popup(MODES[e.m]?.name || '', '#fff', true); snd('horn', volUi() * 0.8); summary = null; killFeed.length = 0; break;
        case 'roundStart': ui.banner({ title: `Ronda ${e.n}`, sub: '¡Prepárate!', tone: 'gold', dur: 2.2 }); break;
        case 'go': snd('go', volUi()); break;
        case 'round': {
          const mine = e.w === mySeat;
          ui.banner({ title: e.w < 0 ? 'Ronda empatada' : mine ? '¡Ganaste la ronda!' : mySeat >= 0 && duelNow().includes(mySeat) ? 'Perdiste la ronda' : `Ronda para ${nameOfSeat(e.w)}`, tone: e.w < 0 ? '' : mine ? 'good' : 'bad', dur: 2.6 });
          snd(mine ? 'win' : e.w < 0 ? 'tick' : 'lose', volUi());
          break;
        }
        case 'over': break;
        case 'zone': ui.banner({ title: 'La zona se está apagando', sub: `Fase ${e.n} · busca la luz`, tone: 'bad', dur: 2.6 }); snd('horn', volUi() * 0.5); break;
        case 'slash': if (e.s !== mySeat) {
          avatars.slash(e.s);
          const P = posOf(e.s); const W = ARMS[e.w];
          if (P && e.kd !== 2) { const c = e.kd === 1 ? { from: 1.15, to: -1.25, tilt: -0.1, arc: 3 } : COMBO[e.st] || COMBO[0]; fx.slashes?.add(P.x * S + Math.cos(P.a) * 0.3, 1.2, P.y * S + Math.sin(P.a) * 0.3, P.a, { from: c.from, to: c.to, tilt: c.tilt, r: (W?.range || 1.6) * S * 0.85, color: W?.color || '#ffffff', dur: 0.16, arc: c.arc ?? 1.9 }); }
          spatial(e.kd === 2 ? 'bash' : e.kd === 1 ? 'heavyswing' : W?.sound || 'swish', P?.x, P?.y, 0.7);
        } break;
        case 'tech': {
          const T = PVP_TECHS[e.id];
          if (!T) break;
          if (e.s !== mySeat) { playTechFx(e.id, e.ax, e.ay, e.bx, e.by, false); spatial(`tech_${e.id}`, e.ax, e.ay, 1.1); avatars.slash(e.s); }
          else if (e.n) popup(`${T.style} ×${e.n}`, T.color, true);
          break;
        }
        case 'boom':
          fx.particles?.burst(e.x * S, Math.max(0.2, e.h), e.y * S, 36, { colors: ['#ffd27a', '#ff7a2a', '#ffffff', '#6b3f22', '#f4f6f8'], speed: 5, up: 3, size: 0.07, life: 0.8 });
          fx.rings?.add(e.x * S, e.y * S, { color: '#ffb03b', max: (e.r || 2) * S * 1.1, life: 0.45 });
          fx.splats?.add(e.x * S, e.y * S, 1.4, '#3a2a1c');
          spatial('boom', e.x, e.y, 1.2);
          boomT = 0.16; boomPos.set(e.x * S, Math.max(0.5, e.h), e.y * S);
          if (Math.hypot(e.x - me.x, e.y - me.y) < 7) shake = Math.max(shake, 0.4);
          break;
        case 'pick': if (e.s === mySeat) { popup(e.d === 'health' ? '+40 de vida' : e.d === 'armor' ? '+50 de chaleco' : e.d === 'ammo' ? '+ Munición' : `¡${ARMS[e.w]?.name || 'Arma'}!`, e.d === 'health' ? '#ff7ab6' : e.d === 'armor' ? '#4FD8FF' : '#FFCC00'); snd('pick', vol()); } break;
        case 'join': feedText(`${nameOfSeat(e.s)} entró a la Arena`, '#9fe3ff'); break;
        case 'left': feedText(`${nameOfSeat(e.s)} volvió a la oficina`, '#bbb'); break;
        default: break;
      }
    }
  }
  function enemySeat(s) {
    if (s === mySeat || s < 0) return false;
    const a = pl(s), b = myState();
    if (!a || !b) return true;
    return !M().teams || a.team !== b.team;
  }
  function onKill(e) {
    const killer = e.s >= 0 && e.s !== e.v ? e.s : -1;
    const kc = killer >= 0 ? colorOf(killer) : '#d4b2ff';
    killFeed.push({ killer: killer >= 0 ? nameOfSeat(killer) : e.s === -1 ? 'La zona' : nameOfSeat(e.v), kc, victim: nameOfSeat(e.v), vc: colorOf(e.v), w: killer >= 0 ? e.w : -1, hd: !!e.hd, me: killer === mySeat, victimMe: e.v === mySeat, zone: e.s === -1, t: 5 });
    if (killFeed.length > 7) killFeed.shift();
    if (e.v !== mySeat) fx.particles?.burst(e.x * S, 1.1, e.y * S, 26, { colors: [colorOf(e.v), '#ffffff', '#FFCC00'], speed: 3.4, up: 3, size: 0.05, life: 0.9 });
    spatial('splat', e.x, e.y, 0.5);
    if (killer === mySeat && !pl(e.v)?.bot) killsOnHumans++; // para las tablas solo cuentan las personas
    if (killer === mySeat) {
      hitT = 0.32; hitKill = true; hitHead = !!e.hd;
      snd('score', volUi() * 0.9);
      // medallas: la que más presume gana
      if (e.mu >= 2 && MULTI[Math.min(4, e.mu)]) medal(MULTI[Math.min(4, e.mu)], `×${e.mu}`, 'pink');
      else if (STREAKS[e.st]) medal(STREAKS[e.st], String(e.st), '', `${e.st} bajas seguidas`);
      else if (e.fb) medal('¡Primera sangre!', '1', 'red');
      else if (e.rv) medal('¡Venganza!', '↺', 'red', `${nameOfSeat(e.v)} ya no se ríe`);
      else if (e.hd) medal('Tiro a la cabeza', '✕');
      popup(`+1 · ${nameOfSeat(e.v)}`, '#FFCC00', true);
    }
    if (e.v === mySeat) {
      const K = killer >= 0 ? posOf(killer) : null;
      killcam = { t: 0, killer, w: e.w, hd: !!e.hd, at: { x: e.x, y: e.y }, dist: K ? Math.hypot(K.x - e.x, K.y - e.y) : null, zone: e.s === -1, self: e.s === mySeat || e.s === -2 };
      me.alive = false;
      firing = false; L.ads = false; L.charge = -1; closeWheel(false);
      snd('lose', volUi() * 0.6);
    }
  }
  function impactFx(r, seat, mine, W = null) {
    const p = new THREE.Vector3(r.x * S, r.h, r.y * S);
    if (mine && W?.scope) fx.beams?.add(muzzleWorld(), p, '#ff2d55');
    else if (mine) fx.tracers?.add(muzzleWorld(), p, W?.splash ? 0.16 : 0.06);
    if (!r.hit) fx.particles?.burst(p.x, p.y, p.z, 5, { colors: r.h <= 0.01 ? ['#9a8a7a', '#c9bba3'] : ['#ffe27a', '#fff', '#9aa3ad'], speed: 1.6, up: 1.5, size: 0.035, life: 0.4 });
  }
  function muzzleWorld() {
    const v = ARMS[L.cur]?.scope && L.adsK > 0.85 ? new THREE.Vector3(0.02, -0.08, -0.5) : new THREE.Vector3(0.18 * (1 - L.adsK), -0.14 + 0.06 * L.adsK, -0.6);
    v.applyEuler(camera.rotation);
    return v.add(camera.position);
  }
  function applyGrant(g) {
    if (g.weapon != null && ARMS[g.weapon]) {
      L.owned[g.weapon] = true; L.mag[g.weapon] = ARMS[g.weapon].mag || 0; L.res[g.weapon] = ARMS[g.weapon].reserve || 0;
      if (!isSword(g.weapon) && isSword(L.cur)) switchTo(g.weapon);
    }
    const guns = ARMS.map((w, i) => (w.kind === 'gun' && L.owned[i] ? i : -1)).filter((i) => i >= 0);
    if (g.ammo === 'pack') for (const i of guns) if (L.res[i] !== Infinity) L.res[i] = Math.min(ARMS[i].reserve * 2, L.res[i] + ARMS[i].mag * 2);
  }

  // ---------- Armas (lo de tu computadora; el daño lo decide el anfitrión) ----------
  const live = () => phaseNow() === 'live';
  const canAct = () => level && mySeat >= 0 && !menu && entered && me.alive && live() && !scoreboard;
  const ownedList = () => L.owned.map((o, i) => (o ? i : -1)).filter((i) => i >= 0);
  const curSword = () => (isSword(L.cur) ? ARMS[L.cur] : null);
  function switchTo(i) {
    if (!L.owned[i] || i === L.cur) return;
    L.cur = i; L.reloadT = 0; L.switchT = 0.32; L.burst = 0; L.swing = null; L.charge = -1; L.queued = false; L.combo = 0; L.techAnim = null;
    switchAnim = 1; L.barT = 2.5;
    vm.trail?.clear();
  }
  function startReload() {
    const W = ARMS[L.cur];
    if (W.kind !== 'gun' || L.reloadT > 0 || L.mag[L.cur] >= W.mag || L.res[L.cur] <= 0) return;
    L.reloadT = W.reload; L.burst = 0;
    snd('reload', vol() * 0.8);
  }
  function curSpread() { const s = spreadAt(ARMS[L.cur], { ads: L.adsK > 0.6, moving: me.mv, recoil }); return me.cr ? s * 0.75 : s; }
  function tryFire() {
    if (!canAct()) return;
    const W = ARMS[L.cur];
    if (W.kind !== 'gun' || L.reloadT > 0 || L.switchT > 0 || L.cd > 0 || L.burst > 0) return;
    if (L.mag[L.cur] <= 0) { if (L.res[L.cur] > 0) startReload(); else { snd('empty', vol()); L.cd = 0.25; } return; }
    if (W.burst) { L.burst = W.burst; L.burstT = W.burstEvery; L.cd = W.every + W.burst * W.burstEvery; } else L.cd = W.every;
    fireOne();
  }
  function fireOne() {
    const W = ARMS[L.cur];
    if (L.burst > 0) L.burst--;
    if (L.mag[L.cur] <= 0 || W.kind !== 'gun' || !canAct()) { L.burst = 0; return; }
    L.mag[L.cur]--;
    const sp = curSpread();
    const t = now();
    const rt = isHost ? t - 100 : buf.renderTime(t);
    const shot = { x: me.x, y: me.y, a: me.a, p: me.p, w: L.cur, seed: (Math.random() * 2 ** 31) | 0, sp, rt: Math.round(rt), ct: Math.round(t) };
    const ads = L.adsK > 0.5;
    recoil = Math.min(1.6, recoil + W.kick * (ads ? 0.55 : 1) * (me.cr ? 0.75 : 1)); flashT = 0.06;
    shake = Math.max(shake, W.pellets > 1 || W.splash ? 0.26 : W.scope ? 0.2 : 0.05);
    me.p = Math.min(1.35, me.p + W.kick * (W.scope ? 0.03 : 0.006) * (ads ? 0.6 : 1));
    me.a += (Math.random() - 0.5) * W.kick * 0.004;
    snd(W.sound, vol() * 0.9);
    let results;
    if (isHost && Sim) results = sim.fire(Sim, mySeat, { ...shot, hv: 1 }, t);
    else {
      // se dibuja ya; el anfitrión decide si pegó
      const tg = viewPlayers.map((q, i) => (q && q.alive && enemySeat(i) ? { seat: i, x: q.x, y: q.y, cr: q.cr } : null)).filter(Boolean);
      const eye = stanceOf(me.cr).eye;
      results = pelletDirs(W, shot.a, shot.p, shot.seed, sp).map((pl) => { const r = traceShot(level, tg, { x: shot.x, y: shot.y, a: pl.a, p: pl.p, h: eye }); return { x: r.x, y: r.y, h: r.h, hit: !!r.hit, head: r.head }; });
      if (results.some((r) => r.hit)) { hitT = 0.16; hitHead = results.some((r) => r.head); hitKill = false; }
      pendingShots.push(shot);
    }
    results.forEach((r, i) => { if (i < 4 || r.hit) impactFx(r, mySeat, true, W); });
    if (L.mag[L.cur] === 0 && L.res[L.cur] > 0) setTimeout(() => { if (!destroyed && L.mag[L.cur] === 0 && L.burst <= 0) startReload(); }, 250);
  }
  function swordDown() { if (!canAct() || !curSword() || L.switchT > 0) { L.charge = -1; return; } L.charge = 0; }
  function swordUp() {
    if (L.charge < 0) return;
    const heavy = L.charge >= HEAVY.charge;
    L.charge = -1;
    if (!canAct() || !curSword()) return;
    if (L.swing || L.techAnim) { if (!heavy) L.queued = true; return; }
    startSwing(heavy ? 'heavy' : 'light');
  }
  function startSwing(kind) {
    const Wp = curSword();
    if (!Wp) return;
    const step = kind === 'heavy' ? 0 : L.comboT > 0 ? L.combo % 3 : 0;
    const sw = swingOf(Wp, kind, step, 0);
    L.swing = { kind, step: sw.step, t: 0, dur: sw.dur, hitAt: sw.dur * 0.34, done: false, sw };
    L.combo = kind === 'heavy' ? 0 : sw.step + 1;
    L.comboT = COMBO_WINDOW + sw.dur;
    snd(kind === 'heavy' ? 'heavyswing' : Wp.sound, vol() * 0.9);
  }
  function bash() {
    if (!canAct() || L.bashCd > 0 || L.swing || L.techAnim) return;
    L.bashCd = BASH.every; L.bashT = 0.34; L.burst = 0;
    snd('bash', vol() * 0.9);
    meleeSend('bash', 0, L.cur, { range: BASH.range, arc: BASH.arc });
  }
  function meleeSend(kind, step, w, sw) {
    const t = now();
    const m = { kind, step, w, x: me.x, y: me.y, a: me.a, rt: Math.round(isHost ? t - 100 : buf.renderTime(t)) };
    const targets = viewPlayers.map((q, i) => (q && q.alive && enemySeat(i) ? { x: q.x, y: q.y, r: BODY.r } : null)).filter(Boolean);
    const hits = arcHits({ x: me.x, y: me.y, a: me.a }, targets, { range: sw.range, arc: sw.arc, los: (ax, ay, bx, by) => arenaLos(level, ax, ay, bx, by), max: 3 });
    if (isHost && Sim) sim.melee(Sim, mySeat, { ...m, hv: 1 }, t);
    else ctx.sendEvent({ k: 'melee', ...m, x: r3(me.x), y: r3(me.y), a: r3(me.a) });
    const W = ARMS[w];
    const col = kind !== 'bash' && W?.color ? W.color : '#ffffff';
    if (kind !== 'bash') {
      const c = kind === 'heavy' ? { from: 1.15, to: -1.25, tilt: -0.1, arc: 3 } : COMBO[step];
      fx.slashes?.add(me.x * S + Math.cos(me.a) * 0.25, eyeH() - 0.35, me.y * S + Math.sin(me.a) * 0.25, me.a, { from: c.from, to: c.to, tilt: c.tilt, r: sw.range * S * 0.85, color: col, dur: sw.dur * 0.45, arc: c.arc ?? sw.arc });
    }
    if (!hits.length) return;
    hitStop = kind === 'heavy' ? 0.12 : 0.07;
    shake = Math.max(shake, kind === 'heavy' ? 0.38 : 0.2);
    snd('slashhit', vol());
    for (const z of hits) fx.particles?.burst(z.x * S, 1.2, z.y * S, kind === 'heavy' ? 14 : 8, { colors: [col, '#ffffff'], speed: 3.4, size: 0.04, dir: { x: Math.cos(me.a), y: 0.35, z: Math.sin(me.a) }, spread: 1.6, life: 0.45 });
  }
  function useTech() {
    if (!canAct()) return false;
    const Wp = curSword();
    if (!Wp) { popup('Equipa tu espada para usar su técnica', '#9fe3ff'); return false; }
    const T = PVP_TECHS[Wp.tech];
    const P = myState();
    if ((P?.tcd || 0) > 0) { popup(`Técnica en espera · ${Math.ceil(P.tcd)} s`, '#9fe3ff'); snd('empty', vol()); return false; }
    if ((P?.energy || 0) < T.cost) { popup('Te falta energía: conecta golpes con la espada', '#9fe3ff'); snd('empty', vol()); return false; }
    const path = techPath(T, me.x, me.y, me.a, sim.techCast(level, T));
    if (isHost && Sim) { const r = sim.technique(Sim, mySeat, { w: L.cur, x: me.x, y: me.y, a: me.a }); if (!r.ok) { popup(r.why, '#9fe3ff'); return false; } }
    else ctx.sendEvent({ k: 'tech', w: L.cur, x: r3(me.x), y: r3(me.y), a: r3(me.a) });
    L.swing = null; L.charge = -1; L.queued = false;
    L.techAnim = { id: T.id, t: 0, dur: 0.6 }; L.lastTech = T.id;
    playTechFx(T.id, path.ax, path.ay, path.bx, path.by, true);
    if (T.kind !== 'wave') dash = { ax: path.ax, ay: path.ay, bx: path.bx, by: path.by, t: T.kind === 'blink' ? -0.12 : 0, dur: T.kind === 'blink' ? 0.1 : 0.26 };
    ui.banner({ kind: 'tech', tech: T.id, dur: 2.1 });
    snd(`tech_${T.id}`, vol() * 1.1);
    techFx = { id: T.id, t: 0.7, max: 0.7, color: T.color, lines: speedLines() };
    fovKick = T.kind === 'blink' ? 14 : T.kind === 'dash' ? 9 : 5;
    shake = Math.max(shake, 0.4);
    return true;
  }
  function playTechFx(id, ax, ay, bx, by, mine) {
    const T = PVP_TECHS[id];
    if (!T || !fx.tech) return;
    const a = Math.atan2(by - ay, bx - ax);
    const off = mine && T.kind === 'wave' ? 1.1 : 0;
    fx.tech.play(id, { ax: (ax + Math.cos(a) * off) * S, az: (ay + Math.sin(a) * off) * S, bx: bx * S, bz: by * S }, id === 'agua' ? 1.05 : id === 'rayo' ? 1.1 : 1.0);
    fx.rings?.add(bx * S, by * S, { color: T.color, max: 3, life: 0.5 });
    boomT = 0.18; boomPos.set(bx * S, 1.4, by * S);
  }
  function updateWeapon(dt) {
    const W = ARMS[L.cur];
    L.cd = Math.max(0, L.cd - dt); L.switchT = Math.max(0, L.switchT - dt); L.bashCd = Math.max(0, L.bashCd - dt); L.bashT = Math.max(0, (L.bashT || 0) - dt); L.comboT = Math.max(0, L.comboT - dt);
    if (!L.comboT && !L.swing) L.combo = 0;
    if (L.reloadT > 0) { L.reloadT -= dt; if (L.reloadT <= 0) { L.reloadT = 0; const take = Math.min(W.mag - L.mag[L.cur], L.res[L.cur]); L.mag[L.cur] += take; if (L.res[L.cur] !== Infinity) L.res[L.cur] -= take; } }
    if (L.burst > 0) { L.burstT -= dt; if (L.burstT <= 0) { L.burstT = W.burstEvery; fireOne(); } }
    const sprinting = keys.has('ShiftLeft') || keys.has('ShiftRight');
    const wantAds = L.ads && W.kind === 'gun' && canAct() && L.reloadT <= 0 && !(sprinting && me.mv);
    L.adsK = approach(L.adsK, wantAds ? 1 : 0, dt * (W.scope ? 4.5 : 7));
    if (W.kind === 'sword') {
      if (L.charge >= 0) { const b = L.charge; L.charge += dt; if (b < HEAVY.charge && L.charge >= HEAVY.charge) snd('charge', vol() * 0.6); }
      if (L.swing) {
        if (hitStop <= 0 && !L.freeze) L.swing.t += dt * fxScale;
        if (!L.swing.done && L.swing.t >= L.swing.hitAt) { L.swing.done = true; meleeSend(L.swing.kind, L.swing.step, L.cur, L.swing.sw); }
        if (L.swing.t >= L.swing.dur && !L.freeze) { L.swing = null; if (L.queued) { L.queued = false; startSwing('light'); } }
      }
      if (L.techAnim && !L.freeze) { L.techAnim.t += dt * fxScale; if (L.techAnim.t >= L.techAnim.dur) { L.techAnim = null; if (L.queued) { L.queued = false; startSwing('light'); } } }
    } else { L.charge = -1; L.swing = null; L.techAnim = null; }
    if (W.kind === 'gun' && (firing || touch?.fire)) { if (W.auto || !firing.used) { tryFire(); if (firing) firing = { used: true }; } }
  }
  const approach = (v, t, d) => (v < t ? Math.min(t, v + d) : Math.max(t, v - d));
  function openWheel() { if (!canAct() || L.wheel) return; L.wheel = { open: true, sel: L.cur, x: 0, y: 0, t: 0, items: ownedList() }; }
  function closeWheel(apply = true) { const w = L.wheel; if (!w) return; L.wheel = null; if (apply && w.sel != null) switchTo(w.sel); }
  function wheelAim(dx, dy) {
    const w = L.wheel;
    w.x += dx; w.y += dy;
    const len = Math.hypot(w.x, w.y);
    if (len > 120) { w.x *= 120 / len; w.y *= 120 / len; }
    if (len < 22) return;
    const n = Math.max(3, w.items.length);
    const idx = ((Math.round((Math.atan2(w.y, w.x) + Math.PI / 2) / (Math.PI * 2 / n)) % n) + n) % n;
    if (w.items[idx] != null && w.items[idx] !== w.sel) { w.sel = w.items[idx]; snd('boxspin', volUi() * 0.5); }
  }
  function cycleWeapon(dir) { const n = ARMS.length; for (let k = 1; k <= n; k++) { const i = (L.cur + dir * k + n * 2) % n; if (L.owned[i]) { switchTo(i); return; } } }
  function adsSens() { const W = ARMS[L.cur]; return W.kind === 'gun' ? 1 / (1 + ((W.zoom || 1) - 1) * L.adsK * 0.85) : 1; }
  const eyeH = () => BODY.stand.eye + (BODY.crouch.eye - BODY.stand.eye) * me.crK;

  // ---------- Sala: clase, equipo, listo ----------
  function setLoadout(l) {
    myLoad = cleanLoadout(l);
    store('arena.load', myLoad.join(','));
    if (isHost && Sim) sim.setLoad(Sim, mySeat, myLoad); else ctx.sendEvent({ k: 'load', load: myLoad });
    if (phaseNow() === 'lobby') resetArms();
  }
  function requestTeam(t) {
    if (isHost && Sim) { if (!sim.setTeam(Sim, mySeat, t)) popup('Los equipos quedarían disparejos', '#ff8080'); }
    else {
      const teams = {};
      latestPs().forEach((p, i) => { if (p) teams[i] = p.team; });
      if (!canSwitchTeam(teams, mySeat, t)) popup('Los equipos quedarían disparejos', '#ff8080');
      else ctx.sendEvent({ k: 'team', t });
    }
  }
  function myReadyNow() { return !!myState()?.ready; }
  function setReady(v) { ready = v; if (isHost && Sim?.players[mySeat]) Sim.players[mySeat].ready = v; else ctx.sendEvent({ k: 'ready', on: v }); }

  // ---------- Controles ----------
  const isTyping = () => { const el = document.activeElement; return el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable); };
  on(window, 'keydown', (e) => {
    if (isTyping()) return;
    if (e.code === 'KeyF' && !e.repeat && !e.ctrlKey && !e.metaKey) { e.preventDefault(); ctx.fullscreen?.toggle?.(); return; }
    const scr = uiScreen();
    if (scr && ui.handleKey(e)) { keys.clear(); firing = false; return; }
    const k = e.code;
    if (['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'ShiftLeft', 'ShiftRight', 'Tab'].includes(k)) e.preventDefault();
    keys.add(k);
    if (e.repeat) return;
    if (/^Digit[1-9]$/.test(k)) { const i = ownedList()[Number(k.slice(5)) - 1]; if (L.wheel) { if (i != null) L.wheel.sel = i; } else if (i != null) switchTo(i); }
    if (k === 'KeyR') startReload();
    if (k === 'Tab') scoreboard = true;
    if (k === 'KeyX') openWheel();
    if (k === 'KeyQ') useTech();
    if (k === 'KeyV') bash();
    if (k === 'KeyC') me.cr = me.cr ? 0 : 1;
    if (k === 'Escape') { if (L.wheel) closeWheel(false); else menu = !menu; }
    if (k === 'Space' && mySeat >= 0 && !menu) { if (curSword()) swordDown(); else firing = firing || { used: false }; }
  });
  on(window, 'keyup', (e) => {
    keys.delete(e.code);
    if (e.code === 'Space') { if (curSword()) swordUp(); else if (!mouseDown) firing = false; }
    if (e.code === 'KeyX') closeWheel(true);
    if (e.code === 'Tab') scoreboard = false;
  });
  on(window, 'blur', () => { keys.clear(); firing = false; mouseDown = false; L.ads = false; L.charge = -1; scoreboard = false; closeWheel(false); });
  const rectPt = (e) => { const r = hudCanvas.getBoundingClientRect(); const k = hudCanvas.width / (r.width || 1); return { x: (e.clientX - r.left) * k, y: (e.clientY - r.top) * k, cx: e.clientX - r.left, cy: e.clientY - r.top }; };
  on(canvas, 'mousemove', (e) => {
    if (document.pointerLockElement === canvas && L.wheel) wheelAim(e.movementX, e.movementY);
    else if (document.pointerLockElement === canvas && !killcam) {
      const sens = 0.0022 * opts.sens * adsSens();
      me.a += e.movementX * sens;
      me.p = Math.max(-1.35, Math.min(1.35, me.p - e.movementY * sens * (opts.invertY ? -1 : 1)));
    }
    const p = rectPt(e); const k = (window.devicePixelRatio || 1) * (hud.k || 1); hud.hover = { x: p.x / k, y: p.y / k };
  });
  on(canvas, 'mousedown', (e) => {
    if (e.button === 2) { if (document.pointerLockElement === canvas || touchDevice) L.ads = true; return; }
    if (e.button !== 0) return;
    const p = rectPt(e);
    const id = hud.hit(p.x, p.y);
    if (id) { uiAction(id); return; }
    if (mySeat < 0 || spectating()) { watchSeat = nextWatch(watchSeat); if (menu && !touchDevice && mySeat >= 0) lockPointer(); return; }
    if (menu && !touchDevice) { lockPointer(); return; }
    if (document.pointerLockElement === canvas || touchDevice) { mouseDown = true; if (curSword()) swordDown(); else firing = { used: false }; }
  });
  on(window, 'mouseup', (e) => {
    if (e.button === 2) L.ads = false;
    if (e.button === 0) { mouseDown = false; firing = false; if (curSword()) swordUp(); }
  });
  on(canvas, 'wheel', (e) => { e.preventDefault(); if (!menu && !L.wheel) cycleWeapon(e.deltaY > 0 ? 1 : -1); }, { passive: false });
  on(canvas, 'contextmenu', (e) => e.preventDefault());
  on(document, 'pointerlockchange', () => {
    const locked = document.pointerLockElement === canvas;
    if (locked) { menu = false; fresh = false; }
    else if (phaseNow() !== 'over') { menu = true; firing = false; mouseDown = false; L.ads = false; L.charge = -1; scoreboard = false; closeWheel(false); }
  });
  function lockPointer() {
    try { const r = canvas.requestPointerLock?.(); r?.catch?.(() => { menu = false; fresh = false; }); } catch { menu = false; fresh = false; }
    playSound('tick', 0.001);
  }
  function resumePlay(fs = false) {
    playSound('tick', 0.001);
    if (touchDevice) { menu = false; fresh = false; } else { menu = true; lockPointer(); }
    if (fs) ctx.fullscreen?.enter?.();
  }
  function setOpt(k, v) {
    if (k === 'quality') { if (v !== quality) setQuality(v); return; }
    opts[k] = v; saveOpts(opts);
    if (k === 'fov') { camera.fov = v; camera.updateProjectionMatrix(); }
  }
  function setQuality(q) {
    quality = q; store('zombies.quality', q);
    if (!level) return;
    const id = curMap; curMap = null;
    renderer.shadowMap.enabled = q === 'alta';
    useMap(id);
    scene.traverse((o) => { if (o.material) [].concat(o.material).forEach((m) => { m.needsUpdate = true; }); });
    fit();
  }
  function uiAction(id) {
    if (id === 'join') ctx.sit?.();
    else if (id === 'menu') menu = true;
    else if (id === 'board') scoreboard = !scoreboard;
    else if (id === 'reload') startReload();
    else if (id === 'swap') cycleWeapon(1);
    else if (id === 'tech') useTech();
    else if (id === 'ads') L.ads = !L.ads;
    else if (id === 'crouch') me.cr = me.cr ? 0 : 1;
  }
  if (touch) {
    on(canvas, 'touchstart', (e) => {
      e.preventDefault();
      for (const t of e.changedTouches) {
        const p = rectPt(t);
        const id = hud.hit(p.x, p.y);
        if (id === 'fire') { touch.fireId = t.identifier; if (curSword()) { touch.sword = true; swordDown(); } else touch.fire = true; continue; }
        if (id) { uiAction(id); continue; }
        if (p.cx < cssW * 0.4 && touch.stickId == null) { touch.stickId = t.identifier; touch.ox = p.cx; touch.oy = p.cy; }
        else if (touch.lookId == null) { touch.lookId = t.identifier; touch.lx = p.cx; touch.ly = p.cy; }
      }
    }, { passive: false });
    on(canvas, 'touchmove', (e) => {
      e.preventDefault();
      for (const t of e.changedTouches) {
        const p = rectPt(t);
        if (t.identifier === touch.stickId) { touch.sx = Math.max(-1, Math.min(1, (p.cx - touch.ox) / 50)); touch.sy = Math.max(-1, Math.min(1, (p.cy - touch.oy) / 50)); }
        if (t.identifier === touch.lookId) { me.a += (p.cx - touch.lx) * 0.006 * opts.sens; me.p = Math.max(-1.3, Math.min(1.3, me.p - (p.cy - touch.ly) * 0.006 * opts.sens * (opts.invertY ? -1 : 1))); touch.lx = p.cx; touch.ly = p.cy; }
      }
    }, { passive: false });
    const end = (e) => {
      for (const t of e.changedTouches) {
        if (t.identifier === touch.stickId) { touch.stickId = null; touch.sx = 0; touch.sy = 0; }
        if (t.identifier === touch.lookId) touch.lookId = null;
        if (t.identifier === touch.fireId) { touch.fire = false; if (touch.sword) { touch.sword = false; swordUp(); } }
      }
    };
    on(canvas, 'touchend', end); on(canvas, 'touchcancel', end);
  }

  // ---------- Vista ----------
  function buildView() {
    if (isHost && Sim) {
      viewPlayers = Sim.players.map((p, i) => {
        if (!p || i === mySeat || p.bot) return p;
        const st = inputBufs[i].state({ keys: ['x', 'y', 'a', 'p'], angles: ['a'], jump: 3 });
        return st && p.alive ? { ...p, x: st.x, y: st.y, a: st.a, p: st.p } : p;
      });
      return;
    }
    const smp = buf.sample();
    if (!smp) { viewPlayers = []; return; }
    const k = Math.max(0, Math.min(1.4, smp.k));
    const pa = sim.unpackPlayers(smp.a), pb = sim.unpackPlayers(smp.b);
    viewPlayers = pb.map((p, i) => {
      if (!p) return null;
      const q = pa[i];
      if (q && q.sp === p.sp && Math.hypot(p.x - q.x, p.y - q.y) < 3) return { ...p, x: q.x + (p.x - q.x) * k, y: q.y + (p.y - q.y) * k, a: lerpAng(q.a, p.a, Math.min(1, k)), p: q.p + (p.p - q.p) * Math.min(1, k) };
      return p;
    });
  }
  const spectating = () => { const P = myState(); if (mySeat < 0) return true; if (!P) return false; return P.spec || (!P.alive && !M().respawn && phaseNow() !== 'lobby' && phaseNow() !== 'over' && !killcam); };
  function nextWatch(cur) {
    for (let k = 1; k <= MAX_PLAYERS; k++) { const i = (((cur < 0 ? 0 : cur) + k) % MAX_PLAYERS); const p = viewPlayers[i]; if (p && p.alive && i !== mySeat) return i; }
    return -1;
  }

  // ---------- Cuadro ----------
  function frame(dt) {
    if (destroyed || !level) return;
    time += dt; frames++;
    const t0 = now();
    fpsN++; if (!fpsAcc) fpsAcc = t0;
    if (t0 - fpsAcc >= 1000) { fps = Math.round((fpsN * 1000) / (t0 - fpsAcc)); fpsAcc = t0; fpsN = 0; }
    if (cfgNow().map !== curMap) useMap(cfgNow().map);
    buildView();
    const phase = phaseNow();
    const P = myState();
    watchPhase(phase);
    // reaparecí (por si se perdió el evento)
    if (P && P.alive && P.sp !== me.sp && phase !== 'lobby') { me.x = P.x; me.y = P.y; me.a = P.a; me.p = 0; me.sp = P.sp; me.alive = true; killcam = null; resetArms(P.owned); }
    if (P && !P.alive && me.alive && P.sp === me.sp) me.alive = false;
    if (P && !isHost) { const o = P.owned; for (let i = 0; i < ARMS.length; i++) if (o[i] && !L.owned[i]) { L.owned[i] = true; } }
    const scr = uiScreen();
    const inLobby = phase === 'lobby';
    // moverme
    if (mySeat >= 0) {
      const still = menu || !!scr || phase === 'intro' || phase === 'round' || !me.alive;
      const f = still ? 0 : (keys.has('KeyW') || keys.has('ArrowUp') ? 1 : 0) - (keys.has('KeyS') || keys.has('ArrowDown') ? 1 : 0) - (touch?.sy || 0);
      const s = still ? 0 : (keys.has('KeyD') ? 1 : 0) - (keys.has('KeyA') ? 1 : 0) + (touch?.sx || 0);
      const turn = (keys.has('ArrowLeft') ? -1 : 0) + (keys.has('ArrowRight') ? 1 : 0);
      if (!still) me.a += turn * 2.4 * dt;
      const sprint = (keys.has('ShiftLeft') || keys.has('ShiftRight')) && L.adsK < 0.3 && !me.cr;
      me.crK += ((me.cr ? 1 : 0) - me.crK) * Math.min(1, dt * 10);
      if (dash) {
        dash.t += dt * fxScale;
        const k = Math.max(0, Math.min(1, dash.t / dash.dur));
        me.x = dash.ax + (dash.bx - dash.ax) * k; me.y = dash.ay + (dash.by - dash.ay) * k; me.mv = 2;
        if (k >= 1) dash = null;
      } else if (me.alive && phase === 'live') {
        const self = { ...me, w: L.cur };
        sim.movePlayer(level, self, { f, s, sprint, cr: me.cr, ads: L.adsK > 0.5 }, dt, viewPlayers.filter((q, i) => q && i !== mySeat));
        me.x = self.x; me.y = self.y; me.mv = self.mv;
      } else me.mv = 0;
      if (me.mv) bob += dt * (me.mv === 2 ? 13 : 9);
      if (me.alive) updateWeapon(dt);
      // invitado: mandar mi posición y mis disparos
      if (!isHost) {
        inputAcc += dt; shotAcc += dt;
        if (inputAcc >= 1 / 30 || dash) { inputAcc = 0; ctx.sendInput(stamp({ x: r3(me.x), y: r3(me.y), a: r3(me.a), p: r3(me.p), w: L.cur, mv: me.mv, cr: me.cr, sp: me.sp })); }
        if (pendingShots.length && shotAcc >= 1 / 30) { shotAcc = 0; ctx.sendEvent({ k: 'shots', list: pendingShots.splice(0).map((q) => ({ ...q, x: r3(q.x), y: r3(q.y), a: r3(q.a), p: r3(q.p) })) }); }
      }
    }
    // ¿a quién sigue la cámara?
    let eye = me, eyeSeat = mySeat, eyeMode = 'me';
    if (killcam) { killcam.t += dt; eyeMode = 'killcam'; if (killcam.t > KILLCAM_T && (spectating() || M().respawn === false)) killcam = null; }
    if (!killcam && spectating() && phase !== 'lobby') {
      if (watchSeat < 0 || !viewPlayers[watchSeat]?.alive) watchSeat = nextWatch(watchSeat);
      const w = viewPlayers[watchSeat];
      if (w) { eye = w; eyeSeat = watchSeat; eyeMode = 'watch'; }
    }
    // los demás jugadores
    const seen = new Set();
    for (let i = 0; i < MAX_PLAYERS; i++) {
      const p = viewPlayers[i];
      // mi cuerpo solo se ve en la cámara de la baja; al que miro, desde sus ojos, tampoco
      if (!p || (i === mySeat && eyeMode !== 'killcam') || (eyeMode === 'watch' && i === eyeSeat) || p.spec || inLobby) continue;
      const uid = room.seats[i];
      const a = avatars.get(i, p.bot ? `bot${i}` : uid, p.bot ? botLook(i) : avatarOf(uid), nameOfSeat(i), colorOf(i));
      seen.add(i);
      const enemy = enemySeat(i);
      const showTag = p.alive && (!enemy || aimedAt(p) || (killcam && killcam.killer === i));
      avatars.pose(a, p, { dt, showTag });
    }
    avatars.keep(seen);
    // la sala: todos formados frente a la cámara
    if (inLobby) poseLineup(dt); else lineup.clear();
    // recogibles, zona, efectos
    fx.loot.update(inLobby ? [] : pickupsNow().map((k) => ({ ...k, x: k.x * S, z: k.y * S })), time);
    const z = phase !== 'lobby' && M().royale ? zoneNow() : null;
    fx.zone.update(z, time);
    fx.particles.update(dt); fx.tracers.update(dt); fx.rings.update(dt);
    const fdt = dt * fxScale;
    fx.slashes.update(fdt); fx.beams.update(fdt); fx.tech.update(fdt, time);
    fx.zones.update(burnView(), dt, time);
    world.update(dt, time, false, false);
    // Último en pie: la oficina se va apagando (solo se baja la intensidad de las luces)
    const dim = z ? 0.55 + 0.45 * Math.min(1, z.r / (Math.hypot(level.W, level.H) / 2)) : 1;
    if (dim < 1) { for (const l of lights) l.intensity *= dim; if (ceil) ceil.material.emissiveIntensity *= dim; }
    // cámara
    const Wz = ARMS[L.cur];
    const zoom = eyeMode === 'me' && Wz.kind === 'gun' ? 1 + ((Wz.zoom || 1) - 1) * L.adsK : 1;
    fovKick = Math.max(0, fovKick - dt * 30 * fxScale);
    const baseFov = inLobby || scr === 'main' ? 55 : opts.fov;
    const fov = Math.round((2 * Math.atan(Math.tan((baseFov * Math.PI) / 360) / zoom) * 180 / Math.PI + fovKick) * 100) / 100;
    if (camera.fov !== fov) { camera.fov = fov; camera.updateProjectionMatrix(); }
    hurt = Math.max(0, hurt - dt * 0.9); shake = Math.max(0, shake - dt * 2.2); hitT = Math.max(0, hitT - dt); hitStop = Math.max(0, hitStop - dt); boomT = Math.max(0, boomT - dt);
    if (techFx) { techFx.t -= dt * fxScale; if (techFx.t <= 0) techFx = null; }
    if (L.wheel) L.wheel.t += dt;
    L.barT = Math.max(0, (L.barT || 0) - dt);
    for (const list of [dmgNums, popups]) for (let i = list.length - 1; i >= 0; i--) { list[i].t -= dt * 0.9; if (list[i].t <= 0) list.splice(i, 1); }
    for (let i = killFeed.length - 1; i >= 0; i--) { killFeed[i].t -= dt; if (killFeed[i].t <= 0) killFeed.splice(i, 1); }
    for (let i = dmgDirs.length - 1; i >= 0; i--) { dmgDirs[i].t -= dt; if (dmgDirs[i].t <= 0) dmgDirs.splice(i, 1); }
    for (const [k, v] of pings) { v.t -= dt; if (v.t <= 0) pings.delete(k); }
    { const Pm = myState(); const rdy = !!Pm && me.alive && Pm.energy >= ENERGY_MAX && !(Pm.tcd > 0) && L.owned.some((o, i) => o && isSword(i)); if (rdy && !techWasReady && live()) { snd('techready', volUi() * 0.8); popup('¡Técnica lista! · Q', PVP_TECHS[curSword()?.tech || L.lastTech]?.color || '#4fd8ff', true); } techWasReady = rdy; }
    recoil = Math.max(0, recoil - dt * 6); flashT = Math.max(0, flashT - dt); switchAnim = Math.max(0, switchAnim - dt * 3.5);
    placeCamera(dt, eye, eyeSeat, eyeMode, inLobby || scr === 'main');
    za.listener(camera.position.x, camera.position.z, eye.a || 0);
    za.update(dt, { on: false, vol: volUi() });
    if (eyeMode === 'me' && me.mv && me.alive && !inLobby) { stepT -= dt; if (stepT <= 0) { stepT = me.mv === 2 ? 0.29 : me.cr ? 0.6 : 0.42; snd('step', vol() * (me.cr ? 0.25 : 0.5)); } } else stepT = 0.05;
    if (boomT > 0) { worldFlash.position.copy(boomPos); worldFlash.intensity = 60 * (boomT / 0.18); }
    else { worldFlash.position.copy(camera.position); worldFlash.intensity = flashT > 0 && eyeMode === 'me' ? 22 : 0; }
    // arma en primera persona
    const showVm = !inLobby && scr !== 'main' && scr !== 'over' && (eyeMode === 'me' ? me.alive : eyeMode === 'watch' && eye.alive);
    const mineVm = eyeMode === 'me';
    const Pv = mineVm ? myState() : null;
    vm.update(dt, {
      avatar: eyeMode === 'watch' ? (pl(eyeSeat)?.bot ? botLook(eyeSeat) : avatarOf(room.seats[eyeSeat])) : avatarOf(myId), wIdx: mineVm ? L.cur : (eye.w ?? 0), mine: mineVm, L, moving: mineVm ? me.mv : eye.mv || 0,
      bob, switchAnim, recoil, flashT, alive: showVm, time, fxScale, techReady: !!(Pv && Pv.energy >= ENERGY_MAX && !(Pv.tcd > 0)),
    });
    vmFlashLight.intensity = flashT > 0 && vm.kind === 'gun' ? 6 : 0;
    if (!warmed && fx.particles) warmUp();
    renderer.clear();
    renderer.render(scene, camera);
    renderer.clearDepth();
    if (showVm && !(menu && fresh)) renderer.render(vmScene, vmCam);
    drawHud(dt, scr, eye, eyeSeat, eyeMode, z);
    ui.update(uiModel(scr));
    status(phase);
    profT -= dt;
    if (profT <= 0) { profT = 10; loadProfiles(); }
  }
  // Cámara: primera persona, la baja (mira a quien te eliminó), mirando a otro, o la sala
  const _look = new THREE.Vector3();
  function placeCamera(dt, eye, eyeSeat, eyeMode, menuCam) {
    if (menuCam) {
      const st = lobbyStage || (lobbyStage = makeLobbyStage());
      const sway = Math.sin(time * 0.35) * 0.35;
      camera.position.set(st.cam.x * S + Math.cos(st.a + Math.PI / 2) * sway, 1.55, st.cam.y * S + Math.sin(st.a + Math.PI / 2) * sway);
      _look.set(st.look.x * S, 1.15, st.look.y * S);
      camera.lookAt(_look);
      return;
    }
    if (eyeMode === 'killcam') {
      const K = killcam;
      const kp = K.killer >= 0 ? viewPlayers[K.killer] : null;
      const at = K.at;
      // después de un instante: detrás del hombro de quien te eliminó, viendo hacia donde caíste
      if (kp && K.t > 0.75) {
        const a = Math.atan2(at.y - kp.y, at.x - kp.x);
        const px = -Math.sin(a), py = Math.cos(a);
        let back = 2.3;
        while (back > 0.4 && (cellAt(level, kp.x - Math.cos(a) * back + px * 0.6, kp.y - Math.sin(a) * back + py * 0.6) !== CELL.EMPTY)) back -= 0.3;
        const k2 = Math.min(1, (K.t - 0.75) / 0.5);
        camera.position.set((kp.x - Math.cos(a) * back * k2 + px * 0.6 * k2) * S, 1.5 + 0.5 * k2, (kp.y - Math.sin(a) * back * k2 + py * 0.6 * k2) * S);
        _look.set((kp.x + Math.cos(a) * 6) * S, 1.1, (kp.y + Math.sin(a) * 6) * S);
        camera.lookAt(_look);
        return;
      }
      const k = Math.min(1, K.t / 0.7);
      const tx = kp ? kp.x : at.x + Math.cos(me.a) * 3, ty = kp ? kp.y : at.y + Math.sin(me.a) * 3;
      const a = Math.atan2(ty - at.y, tx - at.x);
      // se levanta del cuerpo y mira hacia quien disparó
      let cx = at.x - Math.cos(a) * 1.6 * k, cy = at.y - Math.sin(a) * 1.6 * k;
      if (cellAt(level, cx, cy) !== CELL.EMPTY) { cx = at.x; cy = at.y; }
      camera.position.set(cx * S, 0.4 + k * 2.1, cy * S);
      _look.set(tx * S, 1.2, ty * S);
      camera.lookAt(_look);
      return;
    }
    const sh = shake * 0.07;
    const alive = eyeMode === 'me' ? me.alive : !!eye.alive;
    const eh = eyeMode === 'me' ? eyeH() : stanceOf(eye.cr).eye;
    const by = eyeMode === 'me' && me.mv ? Math.sin(bob) * 0.03 : 0;
    camera.position.set(eye.x * S + (Math.random() - 0.5) * sh, alive ? eh + by + (Math.random() - 0.5) * sh : 0.45, eye.y * S + (Math.random() - 0.5) * sh);
    camera.rotation.set((eye.p || 0) + recoil * 0.02, -(eye.a || 0) - Math.PI / 2, alive ? 0 : 0.22);
  }
  // Dónde se forma el equipo en la sala (un lugar con vista larga)
  function makeLobbyStage() {
    let best = null;
    for (const s of level.spawns) {
      for (let i = 0; i < 16; i++) {
        const a = (i / 16) * Math.PI * 2;
        let d = 0;
        while (d < 9 && cellAt(level, s.x + Math.cos(a) * d, s.y + Math.sin(a) * d) === CELL.EMPTY) d += 0.25;
        // y espacio a los lados para formar a todos
        const px = -Math.sin(a), py = Math.cos(a);
        let side = 0;
        while (side < 4.5 && cellAt(level, s.x + px * side, s.y + py * side) === CELL.EMPTY && cellAt(level, s.x - px * side, s.y - py * side) === CELL.EMPTY) side += 0.25;
        const v = Math.min(d, 7) + side * 0.8;
        if (!best || v > best.v) best = { v, s, a, d, side };
      }
    }
    const { s, a, d } = best;
    const back = Math.min(d - 0.6, 5.2);
    return { look: { x: s.x, y: s.y }, cam: { x: s.x + Math.cos(a) * back, y: s.y + Math.sin(a) * back }, a, side: best.side };
  }
  function botLook(i) {
    const skins = ['#f6c9a0', '#d9a066', '#8d5524', '#f1c27d', '#c68642'];
    return { skin: skins[i % skins.length], hair: ['#1b1720', '#4a3020', '#777777'][i % 3], shirt: ['#3a4a6b', '#5a5f6b', '#2b2f3a', '#6b3f22'][i % 4], pants: '#20232c', hat: i % 2 ? 'cap' : 'beanie', hatColor: '#7a8089', eyewear: 'sunglasses' };
  }
  function poseLineup(dt) {
    const st = lobbyStage || (lobbyStage = makeLobbyStage());
    const list = [];
    for (let i = 0; i < MAX_PLAYERS; i++) { const p = pl(i); if (p) list.push([i, p]); }
    // yo al centro
    list.sort((a, b) => (a[0] === mySeat ? -1 : b[0] === mySeat ? 1 : a[0] - b[0]));
    const order = [0, 1, -1, 2, -2, 3, -3, 4];
    const seen = new Set();
    const px = -Math.sin(st.a), py = Math.cos(st.a);
    const gap = Math.min(1.05, (st.side * 2) / Math.max(1, list.length));
    list.forEach(([i, p], k) => {
      const off = order[k] * gap;
      const back = Math.abs(order[k]) * 0.22;
      const x = st.look.x + px * off - Math.cos(st.a) * back, y = st.look.y + py * off - Math.sin(st.a) * back;
      const uid = room.seats[i];
      const a = lineup.get(i, p.bot ? `bot${i}` : uid, p.bot ? botLook(i) : avatarOf(uid), nameOfSeat(i), colorOf(i));
      seen.add(i);
      lineup.pose(a, { x, y, a: st.a + Math.sin(time * 0.6 + i) * 0.08, p: -0.15, alive: true, cr: 0, w: i === mySeat ? myLoad[0] : (p.load?.[0] >= 0 ? p.load[0] : p.w), mv: 0 }, { dt, showTag: true });
    });
    lineup.keep(seen);
  }
  // ¿Lo tengo en la mira? (para mostrar el nombre de un rival)
  function aimedAt(p) {
    const d = Math.hypot(p.x - me.x, p.y - me.y);
    if (d > 32) return false;
    const off = Math.abs(angDiff(me.a, Math.atan2(p.y - me.y, p.x - me.x)));
    return off < Math.max(0.05, 0.5 / Math.max(1, d)) && arenaLos(level, me.x, me.y, p.x, p.y);
  }
  function burnView() {
    if (isHost && Sim) return Sim.zones.map((q) => ({ x: q.x * S, z: q.y * S, r: q.r * S, t: q.t }));
    return (latest?.Q || []).map((q) => ({ x: (q[1] / 100) * S, z: (q[2] / 100) * S, r: (q[3] / 100) * S, t: q[4] / 10 }));
  }

  // Cambios de fase: fin de la partida (resumen y XP), regreso a la sala
  function watchPhase(ph) {
    if (ph === lastPhase) return;
    const prev = lastPhase;
    lastPhase = ph;
    if (ph === 'intro' && (prev === 'lobby' || prev === 'over' || prev == null)) {
      if (mySeat >= 0 && prev != null) { entered = true; menu = true; fresh = true; }
      ready = false; summary = null; killcam = null; fx.splats?.clear?.(); killFeed.length = 0;
      resetArms(myState()?.owned);
    }
    if (ph === 'over') { killcam = null; finish(prev === 'live' || prev === 'round' || prev === 'intro'); }
    if (ph === 'lobby') { summary = null; killcam = null; resetArms(); avatars.clear(); }
  }
  function finish(played = true) {
    const res = resultNow() || {};
    const ps = latestPsAll();
    const meP = ps[mySeat];
    const Mo = M();
    const won = !!meP && (res.team != null ? meP.team === res.team : res.seat === mySeat);
    const draw = res.seat == null && res.team == null;
    let title = won ? 'VICTORIA' : draw ? 'EMPATE' : 'DERROTA';
    let sub = '';
    if (Mo.teams) { const ts = teamScoreNow(); sub = `Rosa ${ts[0]} – ${ts[1]} Azul`; }
    else if (Mo.royale) { title = won ? '¡ÚLTIMO EN PIE!' : title; sub = won ? 'Nadie quedó para contarlo' : meP?.place ? `Quedaste en el lugar #${meP.place}` : res.seat != null ? `Ganó ${nameOfSeat(res.seat)}` : ''; }
    else if (Mo.rounds) { const rw = roundWinsNow(); sub = duelNow().map((s) => `${nameOfSeat(s)} ${rw[s] || 0}`).join(' – '); }
    else sub = res.seat != null ? `Ganó ${nameOfSeat(res.seat)} con ${ps[res.seat]?.kills || 0} bajas` : 'Nadie se llevó la partida';
    if (mySeat < 0) title = 'FIN DE LA PARTIDA';
    const mvp = res.mvp != null && ps[res.mvp] ? boardRow(res.mvp, ps[res.mvp]) : null;
    summary = { won, draw, title, sub, mvp, team: res.team, mine: meP ? { kills: meP.kills, deaths: meP.deaths, hs: meP.hs, shots: meP.shots, hits: meP.hits, dmg: meP.dmg } : null, xp: null };
    snd(won ? 'win' : 'lose', volUi());
    if (document.pointerLockElement === canvas) document.exitPointerLock?.();
    menu = true;
    // resultado al servidor (XP, nivel y tablas), una vez por partida
    const mid = midNow();
    if (played && mySeat >= 0 && meP && postedMid !== mid) {
      postedMid = mid;
      const humans = ps.filter((p) => p && !p.bot && !p.spec).length;
      const pk = killsOnHumans;
      const S0 = summary;
      api.post('/arena/result', { objectId: ctx.objectId, kills: meP.kills, pk, deaths: meP.deaths, hs: meP.hs, won, humans, mode: modeId() })
        .then((r) => { if (summary === S0 && r?.ok) { summary = { ...S0, xp: r }; profiles[myId] = r.profile; ui.loadRecords(); if (r.levelUp) medal(`¡Nivel ${r.levelUp}!`, String(r.levelUp), '', 'Subiste de rango'); } })
        .catch(() => {});
    }
    killsOnHumans = 0;
  }
  const latestPsAll = () => (isHost && Sim ? Sim.players : latestPs());

  function boardRow(i, p) {
    const uid = room.seats[i];
    return {
      seat: i, uid: p.bot ? null : uid, name: nameOfSeat(i), color: colorOf(i), team: p.team, kills: p.kills, deaths: p.deaths, assists: p.assists, hs: p.hs, dmg: p.dmg,
      bot: !!p.bot, me: i === mySeat, alive: p.alive, place: p.place, host: !p.bot && room.host === uid, level: p.bot ? null : profiles[uid]?.level || null, ready: !!p.ready, spec: p.spec,
    };
  }
  function board() {
    const ps = latestPsAll();
    const rows = [];
    for (let i = 0; i < MAX_PLAYERS; i++) if (ps[i] && !ps[i].spec) rows.push(boardRow(i, ps[i]));
    if (M().royale) rows.sort((a, b) => (b.alive - a.alive) || ((a.place || 99) - (b.place || 99)) || b.kills - a.kills);
    else rows.sort((a, b) => b.kills - a.kills || a.deaths - b.deaths || b.dmg - a.dmg);
    return rows;
  }
  function loadProfiles() {
    const ids = room.seats.filter(Boolean);
    if (!ids.length) return;
    api.get(`/arena/profiles?ids=${ids.join(',')}`).then((r) => { Object.assign(profiles, r.profiles || {}); ui.dirtyRegion?.('party'); }).catch(() => {});
  }

  // Qué pantalla de menú toca
  function uiScreen() {
    if (!level) return null;
    const ph = phaseNow();
    if (ph === 'lobby') return 'main';
    if (ph === 'over') return 'over';
    if (!entered) return 'main';
    if (mySeat < 0) return menu ? 'main' : null;
    if (menu) return 'pause';
    return null;
  }
  function uiModel(scr) {
    if (!scr) return { screen: null };
    const ps = latestPsAll();
    const party = Array.from({ length: MAX_PLAYERS }, (_, i) => (ps[i] ? boardRow(i, ps[i]) : null));
    const count = humansSeated();
    const guests = party.filter((q) => q && !q.host && !q.bot);
    const live = (office.state.liveGames || []).filter((g) => g.objectId !== ctx.objectId && g.game === 'arena')
      .map((g) => ({ objectId: g.objectId, floorId: g.floorId, players: g.players, max: g.max, hostName: users()[g.players[0]]?.displayName?.split(' ')[0] || 'alguien' }));
    const cs = canStartNow();
    const ph = phaseNow();
    return {
      screen: scr, mode: mySeat < 0 ? 'watch' : ph === 'lobby' ? 'lobby' : 'live', isHost, me: myId, mySeat,
      cfg: cfgNow(), party, count, bots: party.filter((q) => q?.bot).length, solo: count <= 1, squad: party,
      allReady: guests.length > 0 && guests.every((q) => q.ready), myReady: !!party[mySeat]?.ready, canStart: cs.ok, startWhy: cs.why || '',
      load: myLoad, live, joinable: mySeat < 0 && count < MAX_PLAYERS && !!ctx.sit, fresh,
      lobbyT: ph === 'lobby' ? (isHost ? lobbyT : latest?.lt ?? null) : null,
      opts: { ...opts, quality }, canRestart: mySeat >= 0, teamScore: teamScoreNow(),
      results: scr === 'over' ? board().map((r) => ({ ...r, mvp: r.seat === resultNow()?.mvp })) : null,
      summary: scr === 'over' ? summary : null,
    };
  }
  function status(ph) {
    const Mo = M();
    const s = ph === 'lobby' ? `Sala · ${Mo.name}` : ph === 'over' ? 'Fin de la partida' : ph === 'intro' ? 'Prepárate…' : `${Mo.name} · ${ARENA_MAPS[curMap]?.name || ''}`;
    if (s !== lastStatus) { lastStatus = s; ctx.status(`${mySeat < 0 ? '👀 ' : ''}${s}`); }
  }

  // ---------- HUD ----------
  const _pv = new THREE.Vector3();
  function drawHud(dt, scr, eye, eyeSeat, eyeMode, zone) {
    const hide = scr === 'main' || scr === 'over';
    const vis = hide ? 'hidden' : 'visible';
    if (hudCanvas.style.visibility !== vis) hudCanvas.style.visibility = vis;
    if (hide) { hud.buttons = []; return; }
    const ph = phaseNow();
    const P = myState();
    const k = hud.k || 1;
    for (const d of dmgNums) { _pv.set(d.x, d.y + (1 - d.t) * 0.3, d.z).project(camera); if (_pv.z > 1 || _pv.z < -1) { d.sx = null; continue; } d.sx = ((_pv.x + 1) / 2) * cssW / k; d.sy = ((1 - _pv.y) / 2) * cssH / k; }
    const mates = [], enemies = [];
    for (let i = 0; i < MAX_PLAYERS; i++) {
      const p = viewPlayers[i];
      if (!p || i === mySeat || !p.alive || p.spec) continue;
      if (enemySeat(i)) continue;
      mates.push({ x: p.x, y: p.y, a: p.a, color: colorOf(i) });
    }
    for (const [s, v] of pings) if (viewPlayers[s]?.alive) enemies.push({ x: v.x, y: v.y, t: v.t });
    const dirs = dmgDirs.map((d) => ({ a: Math.atan2(d.wy - me.y, d.wx - me.x) - me.a + Math.PI / 2, t: d.t }));
    const rows = board();
    let kc = null;
    if (killcam) {
      const kp = killcam.killer >= 0 ? pl(killcam.killer) : null;
      const respawnT = M().respawn && P ? P.respawnT : null;
      kc = {
        t: killcam.t, name: killcam.killer >= 0 ? nameOfSeat(killcam.killer) : killcam.zone ? 'La zona' : 'Tú mismo', color: killcam.killer >= 0 ? colorOf(killcam.killer) : '#d4b2ff', w: killcam.w, hd: killcam.hd, dist: killcam.dist,
        face: killcam.killer >= 0 ? faceOf(kp?.bot ? `bot${killcam.killer}` : room.seats[killcam.killer]) : null, hp: kp?.alive ? Math.max(0, Math.ceil(kp.hp)) : null, level: kp && !kp.bot ? profiles[room.seats[killcam.killer]]?.level : null,
        respawn: respawnT != null && M().respawn ? respawnT : null, respawnMax: RESPAWN_T, zone: killcam.zone, self: killcam.self,
        note: !M().respawn ? (M().royale ? `Quedaste en el lugar #${P?.place || '?'}` : 'Esperas la siguiente ronda') : null,
      };
    }
    const watching = eyeMode === 'watch' ? nameOfSeat(eyeSeat) : null;
    const outside = zone && me.alive && Math.hypot(me.x - zone.x, me.y - zone.y) > zone.r;
    const st = {
      time, view: mySeat >= 0 ? 'play' : 'watch', phase: ph, mode: modeId(), cfg: cfgNow(), clock: clockNow(), teamScore: teamScoreNow(), roundWins: roundWinsNow(), duel: duelNow(), round: isHost && Sim ? Sim.round : latest?.rn,
      me: P && eyeMode === 'me' ? { hp: P.hp, armor: P.armor, alive: me.alive && P.alive, prot: P.prot > 0, streak: P.streak, team: P.team } : P ? { alive: false, team: P.team } : null,
      arms: eyeMode === 'me' && P?.alive ? armsHud(P) : null, crossGap: crossGap(), cross: { style: opts.cross, color: opts.crossColor }, hitT, hitKill, hitHead,
      hurt, dmgDirs: dirs, lowHp: P && P.alive && P.hp < 30, outside, board: rows, faceOf: (r) => faceOf(r.bot ? `bot${r.seat}` : r.uid), level, levelName: ARENA_MAPS[curMap]?.name,
      mini: { me: eyeMode !== 'killcam' ? { x: eye.x, y: eye.y, a: eye.a } : null, mates, enemies, pickups: pickupsNow(), zone }, showMinimap: opts.minimap,
      killFeed, popups, dmgNums, techFx, wheel: L.wheel, scoreboard: scoreboard || (ph === 'round'), killcam: kc, zone, aliveCount: rows.filter((r) => r.alive).length,
      countdown: ph === 'intro' ? ptNow() : null, countdownSub: ph === 'intro' ? (M().rounds ? `RONDA ${isHost && Sim ? Sim.round : latest?.rn || 1}` : M().name.toUpperCase()) : null,
      spectating: watching, waiting: P?.spec, joinable: mySeat < 0 && humansSeated() < MAX_PLAYERS && !!ctx.sit, touch: touch ? { sx: touch.sx, sy: touch.sy } : null, menu: !!scr,
    };
    const dpr = window.devicePixelRatio || 1;
    hg.setTransform(dpr, 0, 0, dpr, 0, 0);
    hud.draw(hg, cssW, cssH, st);
    for (const b of hud.buttons) { b.x *= dpr; b.y *= dpr; b.w *= dpr; b.h *= dpr; }
  }
  function armsHud(P) {
    const W = ARMS[L.cur];
    const hasSword = L.owned.some((o, i) => o && isSword(i));
    const energy = P?.energy || 0, tcd = P?.tcd || 0;
    return {
      cur: L.cur, owned: L.owned, mag: L.mag, res: L.res, reloadT: L.reloadT, ads: L.adsK, scope: W.scope ? L.adsK : 0, zoom: W.zoom,
      charge: L.charge >= 0 ? L.charge / HEAVY.charge : 0, combo: L.comboT > 0 ? L.combo : 0, energy, energyMax: ENERGY_MAX, tcd,
      techReady: hasSword && energy >= ENERGY_MAX && !(tcd > 0), hasSword, sword: W.kind === 'sword', bashCd: L.bashCd / BASH.every, lastTech: L.lastTech, bar: L.barT || 0, heavy: L.swing?.kind === 'heavy' || L.charge >= HEAVY.charge,
    };
  }
  function crossGap() {
    const sp = curSpread();
    const focal = (cssH / 2) / Math.tan((camera.fov * Math.PI) / 360);
    return 3 + (sp * focal) / (hud.k || 1);
  }
  // Vista previa de un mapa (para el menú)
  function drawThumb(c, id) {
    const g = c.getContext('2d');
    g.fillStyle = '#0b0d18'; g.fillRect(0, 0, c.width, c.height);
    const Lv = id === 'oficina' && !officeFloor ? null : levelFor(id);
    if (!Lv) { g.fillStyle = '#97a2b5'; g.font = '700 14px system-ui'; g.textAlign = 'center'; g.fillText('La Oficina', c.width / 2, c.height / 2); return; }
    const k = Math.min((c.width - 12) / Lv.W, (c.height - 12) / Lv.H);
    const ox = (c.width - Lv.W * k) / 2, oy = (c.height - Lv.H * k) / 2;
    for (let y = 0; y < Lv.H; y++) for (let x = 0; x < Lv.W; x++) {
      const v = Lv.grid[y * Lv.W + x];
      g.fillStyle = v === CELL.EMPTY ? '#1d2236' : v === CELL.SOLID ? (Lv.tall[y * Lv.W + x] ? '#5a6488' : '#38405e') : v === CELL.GLASS ? '#4f7fb8' : '#b9c2d8';
      g.fillRect(ox + x * k, oy + y * k, Math.ceil(k), Math.ceil(k));
    }
    for (const s of Lv.spawns) { if (s.team == null) continue; g.fillStyle = TEAM_COLORS[s.team]; g.fillRect(ox + s.x * k - 2, oy + s.y * k - 2, 4, 4); }
    for (const p of Lv.pickups) { g.fillStyle = p.kind === 'health' ? '#ff7ab6' : p.kind === 'armor' ? '#4FD8FF' : '#FFCC00'; g.beginPath(); g.arc(ox + p.x * k, oy + p.y * k, 2.2, 0, Math.PI * 2); g.fill(); }
  }

  // ---------- Precalentado: todo lo que aparece al jugar se compila de una vez ----------
  function warmUp() {
    warmed = true;
    const tmp = [];
    try {
      const at = new THREE.Vector3(camera.position.x, 1, camera.position.z - 2);
      fx.particles.burst(at.x, at.y, at.z, 2, {}); fx.particles.update(0);
      fx.tracers.add(at, at.clone().add(new THREE.Vector3(0, 0, -1)), 1); fx.tracers.update(0);
      fx.rings.add(at.x, at.z);
      fx.splats.add(at.x, at.z, 0.5);
      fx.loot.update(['health', 'armor', 'ammo'].map((kind, i) => ({ id: -1 - i, kind, w: -1, x: at.x, z: at.z })).concat(ARMS.map((w, i) => ({ id: -10 - i, kind: 'gun', w: i, x: at.x, z: at.z }))), 0);
      // un jugador con cada arma en la mano (y su etiqueta)
      for (let i = 0; i < ARMS.length; i++) {
        const g = voxelAvatar({}, 'HUB', SEAT_COLORS[i % 8]);
        g.userData.armR.add(handWeapon(i));
        g.position.copy(at); scene.add(g); tmp.push(g);
      }
      const red = voxelAvatar({}, 'HUB', '#ff3b4f'); red.position.copy(at); scene.add(red); tmp.push(red);
      const white = new THREE.Mesh(GEO.box, mat('#ffffff')); white.position.copy(at); scene.add(white); tmp.push(white);
      const sw = avatarSword(); sw.position.copy(at); scene.add(sw); tmp.push(sw);
      fx.slashes.warm(); fx.beams.warm(); fx.tech.warm(); fx.zones.warm(); fx.zone.warm(); vm.trail.warm();
      const shown = vm.weapons.map((w) => w.group.visible);
      vm.weapons.forEach((w) => { w.group.visible = true; });
      const rootVis = vm.root.visible;
      vm.root.visible = true;
      muzzle.visible = true;
      renderer.compile(scene, camera);
      renderer.compile(vmScene, vmCam);
      vm.weapons.forEach((w, i) => { w.group.visible = shown[i]; });
      vm.root.visible = rootVis;
    } catch (e) { console.warn('Arena: no se pudo precalentar', e); }
    for (const o of tmp) scene.remove(o);
    muzzle.visible = false;
    fx.particles.p.length = 0; fx.particles.update(0);
    fx.tracers.list.length = 0; fx.tracers.update(0);
    fx.rings.update(99); fx.splats.clear?.();
    fx.loot.update([], 0);
    fx.slashes.reset(); fx.beams.update(99); fx.tech.unwarm(); fx.zones.clear(); fx.zone.update(null, 0); vm.trail.clear();
  }

  // ---------- Pruebas automáticas (inofensivo en producción) ----------
  const nearestEnemy = () => {
    let best = null, bd = 1e9;
    viewPlayers.forEach((q, i) => { if (!q || !q.alive || !enemySeat(i)) return; const d = Math.hypot(q.x - me.x, q.y - me.y); if (d < bd) { bd = d; best = { q, i, d }; } });
    return best;
  };
  const debug = {
    state: () => {
      const P = myState();
      return { phase: phaseNow(), mode: modeId(), map: curMap, seat: mySeat, host: isHost, players: humansSeated(), bots: (latestPsAll() || []).filter((p) => p?.bot).length, alive: !!P?.alive, kills: P?.kills || 0, deaths: P?.deaths || 0, hp: P?.hp, x: me.x, y: me.y, screen: uiScreen(), menu, ready: !!level, warmed, programs: renderer.info.programs?.length || 0, fps, frames, weapon: ARMS[L.cur]?.id, killcam: !!killcam, scoreboard, spectating: spectating(), summary: summary ? { title: summary.title, won: summary.won, xp: summary.xp?.xp ?? null, mvp: summary.mvp?.name || null } : null, teamScore: teamScoreNow(), result: resultNow(), mid: midNow(), clock: clockNow() };
    },
    cfg: (c) => { for (const [k, v] of Object.entries(c)) setCfg(k, v); return cfgNow(); },
    start: () => hostStart(false),
    play: () => { entered = true; menu = false; fresh = false; },
    advance: (sec) => { for (let i = 0; i < sec * 60; i++) hostStep(1 / 60); return phaseNow(); },
    skipIntro: () => { if (Sim && Sim.phase === 'intro') { Sim.pt = 0; hostStep(1 / 60); } return phaseNow(); },
    aim: () => { const n = nearestEnemy(); if (!n) return false; me.a = Math.atan2(n.q.y - me.y, n.q.x - me.x); me.p = Math.atan2(1.25 - eyeH(), n.d * S); return n.d; },
    bringEnemy: (d = 4) => { const n = nearestEnemy(); if (!n || !Sim) return false; for (let k = d; k > 1; k -= 0.5) { const x = me.x + Math.cos(me.a) * k, y = me.y + Math.sin(me.a) * k; if (cellAt(level, x, y) === CELL.EMPTY && arenaLos(level, me.x, me.y, x, y)) { const P = Sim.players[n.i]; P.x = x; P.y = y; P.prot = 0; if (P.ai) P.ai.goal = { x, y }; Sim.hist[n.i].clear(); return k; } } return false; },
    freezeBots: (v = true) => { if (Sim) for (const p of Sim.players) if (p?.bot) p.botFrozen = v; },
    shoot: () => { L.cd = 0; L.switchT = 0; L.burst = 0; L.reloadT = 0; if (ARMS[L.cur].kind === 'gun' && L.mag[L.cur] <= 0) L.mag[L.cur] = ARMS[L.cur].mag; if (Sim?.players[mySeat]) Sim.players[mySeat].gate.tok = {}; tryFire(); return ARMS[L.cur].id; },
    weapon: (id) => { const i = ARMS.findIndex((w) => w.id === id); if (i >= 0 && L.owned[i]) switchTo(i); L.switchT = 0; return ARMS[L.cur].id; },
    god: (v = true) => { const P = Sim?.players[mySeat]; if (P) P.god = v; },
    prot: () => { if (Sim?.players[mySeat]) Sim.players[mySeat].prot = 0; },
    hurtMe: (d = 200, by = -1) => { const P = Sim?.players[mySeat]; if (!P) return false; P.prot = 0; const k = by >= 0 ? by : Sim.players.findIndex((p) => p && p !== P); sim.damagePlayer(Sim, P, d, k, Sim.players[k]?.w ?? 0, false, Sim.players[k]); return !P.alive; },
    scoreboard: (v = true) => { scoreboard = v; },
    teleport: (x, y) => { me.x = x; me.y = y; },
    face: (x, y) => { me.a = Math.atan2(y - me.y, x - me.x); me.p = 0; },
    look: (a, p = 0) => { me.a = a; me.p = p; },
    lobby: () => backToLobby(),
    ready: (v = true) => setReady(v),
    load: (ids) => setLoadout(ids.map((id) => ARMS.findIndex((w) => w.id === id))),
    team: (t) => requestTeam(t),
    level: () => level && { W: level.W, H: level.H, spawns: level.spawns.length, map: curMap },
    quality: setQuality,
    me: () => ({ x: me.x, y: me.y, a: me.a, p: me.p, sp: me.sp, alive: me.alive }),
    endNow: () => { if (!Sim) return false; const t = MODES[Sim.cfg.mode].teams; sim.endMatch(Sim, { seat: t ? null : mySeat, team: t ? Sim.players[mySeat]?.team ?? 0 : null, reason: 'limit' }); return true; },
    shotAt: (x, y) => { me.a = Math.atan2(y - me.y, x - me.x); me.p = Math.atan2(1.25 - eyeH(), Math.hypot(x - me.x, y - me.y) * S); return debug.shoot(); },
    ads: (v = true) => { L.ads = v; L.adsK = v ? 1 : 0; },
    // anfitrión: pone a otro jugador frente a ti (como si caminara ahí) y le avisa a su computadora
    pull: (seat, d = 5) => {
      const P = Sim?.players[seat];
      if (!P) return false;
      for (let k = d; k > 1; k -= 0.5) {
        const x = me.x + Math.cos(me.a) * k, y = me.y + Math.sin(me.a) * k;
        if (cellAt(level, x, y) !== CELL.EMPTY || !arenaLos(level, me.x, me.y, x, y)) continue;
        P.x = x; P.y = y; P.prot = 0; Sim.hist[seat].clear();
        ctx.sendEvent({ k: 'pos', s: seat, x: Math.round(x * 100) / 100, y: Math.round(y * 100) / 100, sp: P.sp });
        return k;
      }
      return false;
    },
    zone: (sec) => { if (Sim) { Sim.zt = sec; } return Sim?.zone ? { r: Sim.zone.r, phase: Sim.zone.phase } : null; },
    slash: (kind = 'light') => { if (!curSword()) return false; L.swing = null; startSwing(kind); L.swing.t = L.swing.hitAt; L.swing.done = true; meleeSend(L.swing.kind, L.swing.step, L.cur, L.swing.sw); return true; },
    give: (id) => { const i = ARMS.findIndex((w) => w.id === id); const P = Sim?.players[mySeat]; if (i < 0 || !P) return false; P.owned[i] = true; P.mag[i] = ARMS[i].mag || 0; P.res[i] = ARMS[i].reserve || 0; applyGrant({ weapon: i }); switchTo(i); L.switchT = 0; return true; },
    others: () => viewPlayers.map((q, i) => (q ? { seat: i, x: q.x, y: q.y, alive: q.alive, hp: q.hp, bot: q.bot, team: q.team } : null)),
  };
  window.__arena = debug;

  return {
    destroy() {
      destroyed = true;
      loop?.stop();
      if (window.__arena === debug) delete window.__arena;
      if (document.pointerLockElement === canvas) document.exitPointerLock?.();
      if (isHost) office.socket?.emit('arena:teams', { objectId: ctx.objectId, teams: Object.fromEntries(room.seats.filter(Boolean).map((u) => [u, null])) });
      for (const c of cleanups) c();
      world?.dispose(); sky?.dispose(); fx.zone?.dispose();
      for (const e of extras) e.userData.dispose?.();
      scene.traverse((o) => { o.geometry?.dispose?.(); });
      renderer.dispose();
      renderer.forceContextLoss?.();
    },
  };
}
