// 🧟 Zombies en la oficina: shooter en primera persona, cooperativo de 1 a 4, en 3D (three.js).
//
// - El nivel es el piso real de la oficina, recortado alrededor de la sala de juegos.
// - El anfitrión (room.host) corre la simulación con paso fijo (sim.js) y manda estados ~20 por
//   segundo; los demás los interpolan ~100 ms en el pasado (netSync.js) para que nada tiemble.
// - Cada quien mueve a su personaje en su computadora (sin retraso) y manda posición, disparos y
//   compras; los zombis, el daño y los puntos los decide el anfitrión.
// - Si el anfitrión se va, el siguiente jugador rearma la partida con el último estado y sigue.
import * as THREE from 'three';
import { office } from '../../lib/store.js';
import { api } from '../../lib/api.js';
import { composeFloor } from '@shared/map.js';
import { buildLevel, WEAPONS, TILE_M, EYE_H, SHOP, CELL, BOSSES, cellAt, isBossWave, DROPS, lineOfSight } from '@shared/zombies.js';
import { TECHNIQUES, ENERGY_MAX, BASH, COMBO, HEAVY, COMBO_WINDOW, isSword, spreadAt, arcHits, techPath, swingOf, bitsOwned } from '@shared/arsenal.js';
import { viewWeapon, avatarSword } from './arsenalModels.js';
import { SwordTrail, Slashes, Beams, TechFx, BurnZones } from './vfx.js';
import { speedLines } from './weaponHud.js';
import * as sim from './sim.js';
import { buildWorld } from './world.js';
import { GEO, mat, Horde, bossModel, animateBoss, rememberBossMaterials, voxelAvatar, animateAvatar, weaponModel, armsModel } from './models.js';
import { Particles, Splats, Rings, Tracers, Projectiles, Pickups, flashSprite } from './fx.js';
import { Hud } from './hud.js';
import { ZMenu } from './menu.js';
import { MenuScene } from './menuScene.js';
import { loadOpts, saveOpts } from './options.js';
import { SnapBuffer, gameLoop, stamp } from '../netSync.js';
import { playSound } from '../../lib/sounds.js';
import { ZAudio } from './audio.js';

export const meta = {
  w: 1280, h: 720, wide: true, persistent: true, maxSeats: 4,
  help: '', // los controles están en el menú (Controles)
};

const S = TILE_M;
const SEAT_COLORS = ['#FE3377', '#3a86ff', '#FFCC00', '#2bb673'];
const DROP_NAMES = { ammo: '+ Munición', health: '+30 de vida', points: '+150 puntos', box: '¡Caja misteriosa!' };
const store = (k, v) => { try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch { return null; } return null; };

export function create(canvas, ctx) {
  let destroyed = false;
  const cleanups = [];
  const on = (el, ev, fn, opts) => { el.addEventListener(ev, fn, opts); cleanups.push(() => el.removeEventListener(ev, fn, opts)); };
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
  const hg = hudCanvas.getContext('2d');
  const hud = new Hud();
  const prevTouch = canvas.style.touchAction;
  canvas.style.touchAction = 'none';
  cleanups.push(() => { canvas.style.touchAction = prevTouch; canvas.style.width = ''; canvas.style.height = ''; canvas.style.imageRendering = ''; });

  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
  } catch (e) {
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
  const camera = new THREE.PerspectiveCamera(74, 16 / 9, 0.05, 70);
  camera.rotation.order = 'YXZ';
  const vmScene = new THREE.Scene();
  const vmCam = new THREE.PerspectiveCamera(58, 16 / 9, 0.01, 5);
  vmScene.add(new THREE.HemisphereLight('#ffffff', '#554466', 2.2));
  const vmSun = new THREE.DirectionalLight('#fff2dd', 1.6); vmSun.position.set(1, 2, 1); vmScene.add(vmSun);
  const vmFlashLight = new THREE.PointLight('#ffd27a', 0, 3, 2); vmFlashLight.position.set(0.2, -0.1, -0.7); vmScene.add(vmFlashLight);
  const worldFlash = new THREE.PointLight('#ffcf70', 0, 9, 1.6); scene.add(worldFlash);

  // Tamaño
  let cssW = 1280, cssH = 720;
  // El juego ocupa toda la ventana: el lienzo llena el escenario (cualquier proporción)
  function fit() {
    const head = stage.parentElement?.querySelector('.game-head')?.offsetHeight ?? 44;
    cssW = Math.max(240, Math.floor(stage.clientWidth || window.innerWidth || 960));
    cssH = Math.max(180, Math.floor(stage.clientHeight || (window.innerHeight || 800) - head));
    canvas.style.width = `${cssW}px`;
    canvas.style.height = `${cssH}px`;
    const dpr = window.devicePixelRatio || 1;
    const pr = quality === 'alta' ? Math.min(dpr, 1.5) : Math.min(dpr, 1) * 0.5;
    renderer.setPixelRatio(pr);
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
  let stepT = 0, groanT = 2;
  // Menús en HTML encima del juego
  const ui = new ZMenu(stage, {
    me: ctx.me,
    touch: touchDevice,
    avatarOf: (uid) => office.state.users[uid]?.avatar || {},
    nameOf: (uid) => office.state.users[uid]?.displayName || 'Alguien',
    actions: {
      start: () => startMatch(true),
      ready: () => setReady(!myReadyNow()),
      enter: () => { entered = true; if (mySeat >= 0) resumePlay(true); },
      resume: () => resumePlay(fresh),
      leave: () => ctx.close?.(),
      restart: () => restartGame(),
      sit: () => ctx.sit?.(),
      joinMatch: (g) => office.set({ modal: { type: 'game', objectId: g.objectId, game: 'zombies', floorId: g.floorId } }),
      buy: (id) => buy(id),
      closeShop: () => toggleShop(false),
      shopReady: () => setReady(!ready),
      setOpt: (k, v) => setOpt(k, v),
      sound: (n) => (n === 'boxspin' || n === 'boxwin' ? za.play(n, { vol: volUi() * 0.8 }) : playSound(n, volUi() * 0.12)),
    },
  });
  cleanups.push(() => ui.destroy());
  const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(fit) : null;
  ro?.observe(stage);
  on(window, 'resize', fit);
  cleanups.push(() => ro?.disconnect());

  // ---------- Estado ----------
  const myId = ctx.me;
  let room = ctx.room || { seats: ctx.players.map((p) => p?.id ?? null), host: ctx.host ? myId : null, watchers: [] };
  let mySeat = ctx.seat;
  let isHost = room.host === myId && mySeat >= 0;
  let level = null, floor = null, world = null, horde = null;
  let Sim = null; // solo el anfitrión
  const buf = new SnapBuffer({ delay: 100 });
  let latest = null; // último estado recibido (o empacado)
  let lastPhase = null;
  const pendingEv = [];
  let snapAcc = 0, inputAcc = 0;
  const inputBufs = [0, 1, 2, 3].map(() => new SnapBuffer({ delay: 110 }));
  const remoteIn = [null, null, null, null];
  const pendingShots = [];
  const me = { x: 0, y: 0, a: -Math.PI / 2, p: 0, mv: 0, rv: 0, alive: true };
  const L = newLoadout();
  let menu = true, shopOpen = false, ready = false, watchSeat = 0;
  let summary = null, submitted = false;
  // Sala (antes de empezar): el anfitrión decide cuándo arranca; los demás lo ven en el estado (lb)
  let lobby = true, lobbyT = null, entered = false, fresh = false, lastLobby = true;
  let menuScene = null;
  const popups = [], feed = [];
  let hurt = 0, hurtDir = null, hitT = 0, hitKill = false, hitHead = false, shake = 0, recoil = 0, flashT = 0, swayT = 0, bob = 0, switchAnim = 0;
  let time = 0, fps = 0, fpsAcc = 0, fpsN = 0, frames = 0;
  // arsenal: números de daño, registro de bajas, efecto de técnica, pausa del arma al pegar (solo visual)
  const dmgNums = [], killFeed = [];
  let techFx = null, hitStop = 0, fovKick = 0, dash = null, boomT = 0, techWasReady = false, fxScale = 1;
  const boomPos = new THREE.Vector3();
  const keys = new Set();
  let firing = false;
  const touch = touchDevice ? { sx: 0, sy: 0, stickId: null, lookId: null, lx: 0, ly: 0, fire: false } : null;
  const walkPh = new Map();
  const lastPos = new Map();
  const avatars = new Map(); // seat -> { uid, g, fireT, last }
  let bossObj = null;
  const vm = { root: new THREE.Group(), weapons: [], arms: null, cur: -1, armsKey: '' };
  vmScene.add(vm.root);
  const muzzle = flashSprite(); muzzle.scale.setScalar(0.28); muzzle.visible = false; vmScene.add(muzzle);

  function newLoadout() {
    return {
      owned: WEAPONS.map((_, i) => i === 0), cur: 0, mag: WEAPONS.map((w) => w.mag || 0), res: WEAPONS.map((w) => w.reserve || 0), cd: 0, reloadT: 0, switchT: 0,
      burst: 0, burstT: 0, ads: false, adsK: 0, charge: -1, combo: 0, comboT: 0, swing: null, queued: false, techAnim: null, bashCd: 0, bashT: 0, wheel: null, lastTech: 'agua', freeze: false,
    };
  }
  function resetLoadout() { Object.assign(L, newLoadout()); }

  const seatNames = [];
  const nameOfSeat = (i) => {
    const n = office.state.users[room.seats[i]]?.displayName?.split(' ')[0];
    if (n) seatNames[i] = n;
    return n || seatNames[i] || ctx.players?.[i]?.name || `Jugador ${i + 1}`;
  };
  const avatarOf = (uid) => office.state.users[uid]?.avatar || {};
  const toW = (x, y) => new THREE.Vector3(x * S, 0, y * S);

  const fx = {};
  let loop = null;
  let viewZombies = [], viewPlayers = [], viewShots = [], viewDrops = [], viewBoss = null;
  let lastStatus = '';

  // ---------- Arranque (el piso puede venir de otro lado) ----------
  (async () => {
    floor = office.state.floor;
    const has = (f) => f?.objects?.some((o) => o.id === ctx.objectId);
    if (!has(floor) && ctx.floorId) {
      try {
        const { floor: raw } = await api.get(`/floors/${ctx.floorId}`);
        floor = composeFloor({ template: raw.template, areas: raw.areas, objects: raw.objects });
      } catch { /* se usa el que hay */ }
    }
    if (destroyed || !floor) return;
    const cab = floor.objects.find((o) => o.id === ctx.objectId);
    level = buildLevel(floor, cab ? { x: cab.x, y: cab.y } : floor.spawn);
    const P0 = sim.newPlayer(Math.max(0, mySeat), level);
    me.x = P0.x; me.y = P0.y; me.a = P0.a;
    world = buildWorld(level, floor, { quality });
    scene.add(world.group);
    scene.fog = new THREE.Fog('#14161d', quality === 'alta' ? 9 : 6, quality === 'alta' ? 40 : 28);
    renderer.shadowMap.enabled = quality === 'alta';
    horde = new Horde(scene);
    menuScene = new MenuScene(scene, level, avatarOf(myId));
    camera.fov = opts.fov; camera.updateProjectionMatrix();
    fx.particles = new Particles(scene); fx.splats = new Splats(scene); fx.rings = new Rings(scene); fx.tracers = new Tracers(scene);
    fx.proj = new Projectiles(scene); fx.drops = new Pickups(scene);
    fx.slashes = new Slashes(scene); fx.beams = new Beams(scene); fx.tech = new TechFx(scene, fx.particles); fx.zones = new BurnZones(scene, fx.particles);
    vm.trail = new SwordTrail(vmScene);
    if (isHost) startSim();
    fit();
    loop = gameLoop({ step: hostStep, frame, hz: 60 });
  })();

  function seatsBool() { return [0, 1, 2, 3].map((i) => !!room.seats[i]); }
  function startSim() {
    Sim = sim.createSim(level, { seats: seatsBool() });
    if (Sim.players[mySeat]) Object.assign(Sim.players[mySeat], { x: me.x, y: me.y });
    lastPhase = null;
    lobby = true; lobbyT = null;
  }
  const lobbyNow = () => (isHost ? lobby : latest ? !!latest.lb : true);
  // El anfitrión arranca la partida (solo, "Comenzar" o la cuenta regresiva de la sala)
  function startMatch(byClick = false) {
    if (!isHost || !Sim || !lobby) return;
    lobby = false; lobbyT = null; entered = true;
    for (const p of Sim.players) if (p) p.ready = false;
    ready = false;
    menu = true; fresh = true;
    if (byClick) resumePlay(true);
  }
  function lobbyTick(dt) {
    const guests = Sim.players.filter((p, i) => p && room.seats[i] && i !== mySeat);
    if (guests.length && guests.every((p) => p.ready)) { lobbyT = lobbyT == null ? 6 : lobbyT - dt; if (lobbyT <= 0) startMatch(false); }
    else lobbyT = null;
  }
  function myReadyNow() {
    if (isHost && Sim) return !!Sim.players[mySeat]?.ready;
    const p = latest && sim.unpackPlayers(latest)[mySeat];
    return !!p?.ready;
  }

  // ---------- Red ----------
  ctx.onInput((seat, d) => {
    if (!isHost || !Sim || !d) return;
    const P = Sim.players[seat];
    if (!P) return;
    if ([d.x, d.y, d.a, d.p].every(Number.isFinite)) {
      if (cellAt(level, d.x, d.y) !== CELL.EMPTY && cellAt(level, d.x, d.y) !== CELL.SOLID) return;
      if (P.alive) { P.x = d.x; P.y = d.y; }
      P.a = d.a; P.p = Math.max(-1.4, Math.min(1.4, d.p));
      P.w = Number.isInteger(d.w) && P.owned[d.w] ? d.w : 0; P.mv = d.mv | 0; P.rv = d.rv ? 1 : 0;
      inputBufs[seat].push(d);
    }
  });
  ctx.onState((d) => {
    if (isHost || !d) return;
    if (!buf.push(d)) return;
    latest = d;
    if (d.ev?.length) handleEvents(d.ev);
    const myP = d.P?.[mySeat];
    if (myP) { L.owned = bitsOwned(myP[12]); if (!L.owned[L.cur]) L.cur = 0; }
    const lb = !!d.lb;
    // la sala arrancó: a jugar (hay que hacer clic para tomar el mouse)
    if (lastLobby && !lb && d.ph === 'intro' && mySeat >= 0) { entered = true; menu = true; fresh = true; ready = false; }
    lastLobby = lb;
    phaseWatch(d.ph, d.w);
  });
  ctx.onEvent((seat, d) => {
    if (!d) return;
    if (d.k === 'grant' && d.s === mySeat && !isHost) applyGrant(d);
    if (d.k === 'nope' && d.s === mySeat) { popup(d.why || 'No se pudo', '#ff8080'); if (d.id) ui.nope(d.id); }
    if (!isHost || !Sim) return;
    if (d.k === 'shots' && Array.isArray(d.list)) {
      for (const sh of d.list.slice(0, 30)) {
        if (![sh.x, sh.y, sh.a, sh.p].every(Number.isFinite)) continue;
        const r = sim.fire(Sim, seat, { x: sh.x, y: sh.y, a: sh.a, p: sh.p, w: sh.w | 0, seed: sh.seed | 0, sp: Number(sh.sp) });
        for (const q of r) impactFx(q, seat, false, WEAPONS[sh.w | 0]);
      }
    } else if (d.k === 'melee') {
      sim.melee(Sim, seat, { kind: String(d.kind), step: d.step | 0, w: d.w | 0, x: Number(d.x), y: Number(d.y), a: Number(d.a) });
    } else if (d.k === 'tech') {
      const r = sim.technique(Sim, seat, { w: d.w | 0, x: Number(d.x), y: Number(d.y), a: Number(d.a) });
      if (!r.ok) ctx.sendEvent({ k: 'nope', s: seat, why: r.why });
    } else if (d.k === 'buy') {
      const r = sim.buy(Sim, seat, String(d.id));
      if (!r.ok) ctx.sendEvent({ k: 'nope', s: seat, why: r.why, id: String(d.id).slice(0, 20) });
    } else if (d.k === 'ready') { if (Sim.players[seat]) Sim.players[seat].ready = !!d.on; }
    else if (d.k === 'restart' && Sim.phase === 'over') restartGame();
  });
  ctx.onRoom?.((r) => {
    room = r;
    // al reconectar puede tocar otro asiento
    const ns = r.seats.indexOf(myId);
    if (ns >= 0 && mySeat >= 0 && ns !== mySeat) mySeat = ns;
    const hostNow = r.host === myId && mySeat >= 0;
    if (hostNow && !isHost && level) {
      // migración: sigo yo con lo último que vi
      Sim = latest ? sim.restoreSim(level, latest) : sim.createSim(level, { seats: seatsBool() });
      lobby = latest ? !!latest.lb : true; lobbyT = null;
      isHost = true;
      for (let i = 0; i < 4; i++) if (!r.seats[i] && Sim.players[i]) Sim.players[i] = null;
      feedAdd('Ahora tú llevas la partida', '#9fe3ff');
    }
    isHost = hostNow;
    if (isHost && Sim) {
      for (let i = 0; i < 4; i++) {
        if (r.seats[i] && !Sim.players[i]) sim.addPlayer(Sim, i);
        else if (!r.seats[i] && Sim.players[i]) sim.removePlayer(Sim, i);
      }
    }
    for (const [seat, a] of avatars) if (r.seats[seat] !== a.uid) { scene.remove(a.g); avatars.delete(seat); }
  });

  function phaseWatch(ph, wave) {
    if (ph === lastPhase) return;
    const prev = lastPhase;
    lastPhase = ph;
    if (ph === 'intro' && prev === 'over') { resetLoadout(); summary = null; submitted = false; fx.splats?.clear(); ready = false; }
    if (ph === 'break') { ready = false; }
    if (ph === 'fight') { shopOpen = false; }
    if (ph === 'over' && mySeat >= 0) finish(wave);
  }
  function finish(wave) {
    const P = myState();
    const S0 = { wave, kills: P?.kills || 0, score: P?.earned || 0 };
    summary = S0;
    snd('gameover', volUi());
    if (!submitted && S0.score > 0) {
      submitted = true;
      const prev = ui.records?.me?.score ?? 0;
      Promise.resolve(ctx.submitScore?.(S0.score, 'zombies')).then((r) => {
        if (!r) return;
        ui.setRecords(r);
        if (summary !== S0) return;
        summary = { ...S0, rank: r.me?.rank || null, newRecord: S0.score > prev && r.me?.score === S0.score };
      }).catch(() => {});
    }
    shopOpen = false;
    if (document.pointerLockElement === canvas) document.exitPointerLock?.();
  }
  // Revancha: todos vuelven a la sala con el mismo escuadrón
  function restartGame() {
    if (isHost) { startSim(); resetLoadout(); summary = null; submitted = false; fx.splats?.clear(); ready = false; }
    else ctx.sendEvent({ k: 'restart' });
  }

  // ---------- Simulación del anfitrión ----------
  function hostStep(dt) {
    if (!isHost || !Sim || destroyed) return;
    const seated = room.seats.filter(Boolean).length;
    if (lobby) { lobbyTick(dt); sendSnap(dt); return; } // en la sala no corre nada
    if (menu && seated <= 1 && Sim.phase !== 'over') return; // solo: la pausa detiene todo
    const P = Sim.players[mySeat];
    if (P) { if (P.alive) { P.x = me.x; P.y = me.y; } P.a = me.a; P.p = me.p; P.w = L.cur; P.mv = me.mv; P.rv = me.rv; }
    sim.step(Sim, dt);
    const evs = Sim.ev.splice(0);
    if (evs.length) { handleEvents(evs); pendingEv.push(...evs); }
    for (const g of Sim.grants.splice(0)) { if (g.s === mySeat) applyGrant(g); else ctx.sendEvent({ k: 'grant', ...g }); }
    phaseWatch(Sim.phase, Sim.wave);
    sendSnap(dt);
  }
  function sendSnap(dt) {
    snapAcc += dt;
    if (snapAcc < 0.05) return;
    snapAcc = 0;
    const d = sim.pack(Sim);
    d.ev = pendingEv.splice(0).slice(-80);
    if (lobby) { d.lb = 1; if (lobbyT != null) d.lt = Math.round(lobbyT * 10) / 10; }
    latest = d;
    if (room.seats.filter(Boolean).length > 1 || room.watchers?.length) ctx.sendState(stamp(d));
  }

  function applyGrant(g) {
    if (g.weapon != null && WEAPONS[g.weapon]) {
      L.owned[g.weapon] = true; L.mag[g.weapon] = WEAPONS[g.weapon].mag || 0; L.res[g.weapon] = WEAPONS[g.weapon].reserve || 0;
      if (!g.box) switchTo(g.weapon); // la caja misteriosa cambia de arma al terminar de girar
    }
    const guns = WEAPONS.map((w, i) => (w.kind === 'gun' && L.owned[i] ? i : -1)).filter((i) => i >= 0);
    if (g.ammo === 'full') for (const i of guns) { L.mag[i] = WEAPONS[i].mag; L.res[i] = WEAPONS[i].reserve; }
    if (g.ammo === 'pack') for (const i of guns) if (L.res[i] !== Infinity) L.res[i] = Math.min(WEAPONS[i].reserve, L.res[i] + WEAPONS[i].mag * 2);
  }

  // ---------- Eventos (sonidos y efectos) ----------
  // volumen general × efectos (disparos, golpes, zombis); los avisos solo usan el general
  const volUi = () => Math.max(0.2, ctx.volume ?? 0.6) * (opts.master / 100);
  const vol = () => volUi() * (opts.effects / 100);
  // Sonido en 3D desde (x, y) en casillas (PannerNode: dirección y distancia)
  function spatial(name, x, y, v = 1) {
    if (x == null) { snd(name, vol() * v); return; }
    za.play(name, { x: x * S, z: y * S, vol: vol() * v });
  }
  const snd = (name, v) => za.play(name, { vol: v });
  function popup(text, color, big = false) { popups.push({ text, color, big, t: 1 }); if (popups.length > 5) popups.shift(); }
  function feedAdd(text, color) { feed.push({ text, color, t: 5 }); if (feed.length > 6) feed.shift(); }
  const zombieAt = (id) => (isHost ? Sim?.zombies.find((z) => z.id === id) : null);

  function handleEvents(evs) {
    for (const e of evs) {
      switch (e.k) {
        case 'fire': if (e.s !== mySeat) { const a = avatars.get(e.s); if (a) a.fireT = 0.07; const P = seatPos(e.s); spatial(WEAPONS[e.w]?.sound || 'stapler', P?.x, P?.y, 0.6); } break;
        case 'hit': {
          if (e.s === mySeat && opts.dmgNums && e.d > 0) addDmgNum(e);
          if (e.s === mySeat && !isHost) break; // ya se dibujó al disparar
          fx.particles?.burst(e.x * S, e.h, e.y * S, e.hd ? 10 : 6, { colors: ['#7CFF4F', '#4fbf3a', '#b6ff6a'], speed: 2.5, size: 0.035 });
          if (e.s === mySeat) { hitT = 0.22; hitHead = !!e.hd; hitKill = false; snd('hitmark', vol() * 0.8); }
          break;
        }
        case 'kill': {
          fx.particles?.burst(e.x * S, 1.1, e.y * S, e.boss ? 80 : 20, { colors: ['#7CFF4F', '#4fbf3a', '#2e8b2a', '#d4ff8a'], speed: e.boss ? 6 : 3.2, up: 3, size: e.boss ? 0.09 : 0.05, life: 1 });
          fx.splats?.add(e.x * S, e.y * S, e.boss ? 2.6 : 0.9 + Math.random() * 0.5);
          spatial(e.boss ? 'bossdie' : 'splat', e.x, e.y, e.boss ? 1.2 : 0.8);
          if (e.s === mySeat) { hitT = 0.3; hitKill = true; popup(`+${e.pts}`, '#FFCC00', !!e.boss); }
          if (e.s >= 0) { killFeed.push({ who: nameOfSeat(e.s), color: SEAT_COLORS[e.s], w: e.w ?? -1, victim: e.v || 'normal', boss: !!e.boss, me: e.s === mySeat, t: 5 }); if (killFeed.length > 6) killFeed.shift(); }
          if (e.boss) { ui.banner({ title: '¡Jefe derrotado!', sub: e.s >= 0 ? `Golpe final de ${nameOfSeat(e.s)}` : '', tone: 'gold', dur: 3 }); shake = Math.max(shake, 0.6); }
          break;
        }
        case 'spawn':
          if (e.m) { fx.splats?.add(e.x * S, e.y * S, 1.1, '#3b2a1c'); fx.particles?.burst(e.x * S, 0.05, e.y * S, 14, { colors: ['#6b4a2b', '#4a3420', '#8a6a4a'], speed: 1.4, up: 3, size: 0.07, life: 1.2 }); }
          if (Math.random() < 0.45) spatial('groan', e.x, e.y, 0.7);
          break;
        case 'wave': {
          const boss = e.boss ? BOSSES[e.boss] : null;
          ui.banner(boss ? { kind: 'boss', boss: e.boss, wave: e.n, dur: 3.4 } : { kind: 'wave', wave: e.n, sub: e.n === 1 ? '¡Ahí vienen!' : 'Más rápidos, más hambrientos', dur: 2.4 });
          snd(boss ? 'roar' : 'horn', volUi());
          ready = false;
          break;
        }
        case 'clear': ui.banner({ title: '¡Horda superada!', sub: `+${e.bonus} puntos · descanso y tienda (${touchDevice ? '🛒' : 'B'})`, tone: 'good', dur: 2.8 }); snd('clear', volUi()); break;
        case 'boss': { const b = BOSSES[e.b]; feedAdd(`☠ ${b?.name}: ${b?.title}`, '#ff8080'); snd('roar', vol()); shake = Math.max(shake, 0.5); break; }
        case 'hurt':
          if (e.s === mySeat) {
            hurt = Math.min(1, hurt + 0.35 + e.d / 60); shake = Math.max(shake, 0.25 + e.d / 80);
            if (e.fx || e.fy) hurtDir = Math.atan2(e.fy - me.y, e.fx - me.x) - me.a + Math.PI / 2;
            snd('hurt', vol());
          }
          break;
        case 'down': feedAdd(`${nameOfSeat(e.s)} ${e.rv ? 'cayó · ¡levántalo con E!' : 'quedó fuera'}`, '#ff8080'); if (e.s === mySeat) ui.banner({ title: '¡Caíste!', sub: e.rv ? 'Un compañero puede levantarte' : '', tone: 'bad', dur: 2.4 }); break;
        case 'revive': feedAdd(`${nameOfSeat(e.by)} levantó a ${nameOfSeat(e.s)}`, '#7CFF4F'); if (e.s === mySeat || e.by === mySeat) snd('pick', vol()); break;
        case 'dead': feedAdd(`${nameOfSeat(e.s)} quedó fuera hasta el descanso`, '#ffb3b3'); break;
        case 'swing': if (Math.random() < 0.3) { const z = zombieAt(e.id); spatial('groan', z?.x, z?.y, 0.6); } break;
        case 'spit': { const z = zombieAt(e.id); spatial(e.p === 'paper' ? 'paper' : 'spit', z?.x, z?.y, 0.7); break; }
        case 'pop': {
          const col = e.p === 'acid' ? ['#9CFF4F', '#5fd43a'] : e.p === 'paper' ? ['#ffffff', '#dddddd'] : ['#6b3f22', '#f4f6f8', '#3b2414'];
          fx.particles?.burst(e.x * S, Math.max(0.1, e.h), e.y * S, 12, { colors: col, speed: 2, size: 0.06 });
          if (e.p !== 'paper') fx.splats?.add(e.x * S, e.y * S, e.p === 'coffee' ? 1.4 : 0.7, e.p === 'coffee' ? '#5a3a1a' : '#7CFF4F');
          break;
        }
        case 'slam': fx.rings?.add(e.x * S, e.y * S, { color: '#ff8a3d', max: 4.4 * S, life: 0.5 }); spatial('slam', e.x, e.y, 1.2); if (Math.hypot(e.x - me.x, e.y - me.y) < 8) shake = Math.max(shake, 0.7); break;
        case 'charge': case 'roar': { const z = zombieAt(e.id); spatial('roar', z?.x, z?.y, 0.8); break; }
        case 'thud': spatial('slam', e.x, e.y, 0.7); if (Math.hypot(e.x - me.x, e.y - me.y) < 6) shake = Math.max(shake, 0.4); break;
        case 'summon': feedAdd('¡El Gerente llamó a junta! Llegan refuerzos', '#ff8080'); break;
        case 'jam': feedAdd('¡Atasco de papel! Cúbrete', '#ff8080'); break;
        case 'slash': if (e.s !== mySeat) {
          const P = seatPos(e.s); const av = avatars.get(e.s); if (av) av.slashT = 0.3;
          const W = WEAPONS[e.w];
          if (P && e.kd !== 2) {
            const c = e.kd === 1 ? { from: 1.15, to: -1.25, tilt: -0.1, arc: 3 } : COMBO[e.st] || COMBO[0];
            fx.slashes?.add(P.x * S + Math.cos(P.a) * 0.3, 1.2, P.y * S + Math.sin(P.a) * 0.3, P.a, { from: c.from, to: c.to, tilt: c.tilt, r: (W?.range || 1.6) * S * 0.85, color: W?.color || '#ffffff', dur: 0.16, arc: c.arc ?? 1.9 });
          }
          spatial(e.kd === 2 ? 'bash' : e.kd === 1 ? 'heavyswing' : W?.sound || 'swish', P?.x, P?.y, 0.7);
          if (e.n) spatial('slashhit', P?.x, P?.y, 0.6);
        } break;
        case 'tech': {
          const T = TECHNIQUES[e.id];
          if (!T) break;
          if (e.s !== mySeat) {
            playTechFx(e.id, e.ax, e.ay, e.bx, e.by, false);
            spatial(`tech_${e.id}`, e.ax, e.ay, 1.1);
            feedAdd(`${nameOfSeat(e.s)} · ${T.name}`, T.color);
            const av = avatars.get(e.s); if (av) av.slashT = 0.4;
          } else if (e.n) popup(`${T.style} ×${e.n}`, T.color, true);
          break;
        }
        case 'boom':
          fx.particles?.burst(e.x * S, Math.max(0.2, e.h), e.y * S, 40, { colors: ['#ffd27a', '#ff7a2a', '#ffffff', '#6b3f22', '#f4f6f8'], speed: 5, up: 3, size: 0.07, life: 0.8 });
          fx.rings?.add(e.x * S, e.y * S, { color: '#ffb03b', max: (e.r || 2) * S * 1.1, life: 0.45 });
          fx.splats?.add(e.x * S, e.y * S, 1.6, '#4a2c14');
          spatial('boom', e.x, e.y, 1.2);
          boomT = 0.16; boomPos.set(e.x * S, Math.max(0.5, e.h), e.y * S);
          if (Math.hypot(e.x - me.x, e.y - me.y) < 7) shake = Math.max(shake, 0.4);
          break;
        case 'box': {
          const W = WEAPONS[e.w];
          if (e.s === mySeat) ui.mystery(e.w, !!e.had, () => { if (!e.had && L.owned[e.w]) switchTo(e.w); });
          else if (W) feedAdd(`${nameOfSeat(e.s)} sacó ${W.name} de la caja`, '#d4b2ff');
          break;
        }
        case 'pick': if (e.s === mySeat) { popup(DROP_NAMES[e.d] || '+', e.d === 'health' ? '#ff7ab6' : '#FFCC00'); snd('pick', vol()); } break;
        case 'buy': if (e.s === mySeat) { const it = SHOP.find((x) => x.id === e.id); popup(`✓ ${it?.name || 'Comprado'}`, '#7CFF4F'); snd('buy', volUi()); ui.bought(e.id); } break;
        case 'join': feedAdd(`${nameOfSeat(e.s)} se unió a la partida`, '#9fe3ff'); break;
        case 'left': feedAdd(`${nameOfSeat(e.s)} volvió a la oficina`, '#bbb'); break;
        default: break;
      }
    }
  }
  function impactFx(r, seat, mine, W = null) {
    const p = new THREE.Vector3(r.x * S, r.h, r.y * S);
    if (mine && W?.scope) fx.beams?.add(muzzleWorld(), p, '#ff2d55');
    else if (mine) fx.tracers?.add(muzzleWorld(), p, W?.splash ? 0.16 : 0.06);
    if (r.hit) {
      if (mine && !isHost) {
        fx.particles?.burst(p.x, p.y, p.z, r.head ? 10 : 6, { colors: ['#7CFF4F', '#4fbf3a', '#b6ff6a'], speed: 2.5, size: 0.035 });
        hitT = 0.22; hitHead = r.head; hitKill = false;
      }
    } else {
      fx.particles?.burst(p.x, p.y, p.z, 5, { colors: r.h <= 0.01 ? ['#9a8a7a', '#c9bba3'] : ['#ffe27a', '#fff', '#9aa3ad'], speed: 1.6, up: 1.5, size: 0.035, life: 0.4 });
    }
  }
  function muzzleWorld() {
    const v = WEAPONS[L.cur]?.scope && L.adsK > 0.85 ? new THREE.Vector3(0.02, -0.08, -0.5) : new THREE.Vector3(0.18 * (1 - L.adsK), -0.14 + 0.06 * L.adsK, -0.6);
    v.applyEuler(camera.rotation);
    return v.add(camera.position);
  }

  // ---------- Armas ----------
  const canAct = () => level && mySeat >= 0 && !menu && !shopOpen && entered && !lobbyNow() && myAlive() && latestPhase() !== 'over';
  const ownedList = () => L.owned.map((o, i) => (o ? i : -1)).filter((i) => i >= 0);
  const curSword = () => (isSword(L.cur) ? WEAPONS[L.cur] : null);
  function switchTo(i) {
    if (!L.owned[i] || i === L.cur) return;
    L.cur = i; L.reloadT = 0; L.switchT = 0.35; L.burst = 0; L.swing = null; L.charge = -1; L.queued = false; L.combo = 0; L.techAnim = null;
    switchAnim = 1; L.barT = 2.5;
    vm.trail?.clear();
  }
  function startReload() {
    const W = WEAPONS[L.cur];
    if (W.kind !== 'gun' || L.reloadT > 0 || L.mag[L.cur] >= W.mag || L.res[L.cur] <= 0) return;
    L.reloadT = W.reload; L.burst = 0;
    snd('reload', vol() * 0.8);
  }
  // dispersión del momento: apuntando, caminando o corriendo, y con el retroceso acumulado
  function curSpread() { return spreadAt(WEAPONS[L.cur], { ads: L.adsK > 0.6, moving: me.mv, recoil }); }
  function tryFire() {
    if (!canAct()) return;
    const W = WEAPONS[L.cur];
    if (W.kind !== 'gun') return;
    if (L.reloadT > 0 || L.switchT > 0 || L.cd > 0 || L.burst > 0) return;
    if (L.mag[L.cur] <= 0) { if (L.res[L.cur] > 0) startReload(); else { snd('empty', vol()); L.cd = 0.25; } return; }
    if (W.burst) { L.burst = W.burst; L.burstT = W.burstEvery; L.cd = W.every + W.burst * W.burstEvery; }
    else L.cd = W.every;
    fireOne();
  }
  // un disparo (o un cartucho de la ráfaga)
  function fireOne() {
    const W = WEAPONS[L.cur];
    if (L.burst > 0) L.burst--;
    if (L.mag[L.cur] <= 0 || W.kind !== 'gun') { L.burst = 0; return; }
    L.mag[L.cur]--;
    const sp = curSpread();
    const shot = { x: me.x, y: me.y, a: me.a, p: me.p, w: L.cur, seed: (Math.random() * 2 ** 31) | 0, sp };
    const ads = L.adsK > 0.5;
    recoil = Math.min(1.6, recoil + W.kick * (ads ? 0.55 : 1)); flashT = 0.06;
    shake = Math.max(shake, W.pellets > 1 || W.splash ? 0.28 : W.scope ? 0.22 : 0.06);
    me.p = Math.min(1.35, me.p + W.kick * (W.scope ? 0.03 : 0.006) * (ads ? 0.6 : 1)); // la mira sube un poquito
    me.a += (Math.random() - 0.5) * W.kick * 0.004;
    snd(W.sound, vol() * 0.9);
    let results;
    if (isHost && Sim) results = sim.fire(Sim, mySeat, shot);
    else {
      results = sim.pellets(L.cur, shot.a, shot.p, shot.seed, sp).flatMap((pl) => sim.traceMulti(level, viewZombies, { x: shot.x, y: shot.y, a: pl.a, p: pl.p }, W.pierce || 1));
      pendingShots.push(shot);
    }
    results.forEach((r, i) => { if (i < 4 || r.hit) impactFx(r, mySeat, true, W); });
    if (L.mag[L.cur] === 0 && L.res[L.cur] > 0) setTimeout(() => { if (!destroyed && L.mag[L.cur] === 0 && L.burst <= 0) startReload(); }, 250);
  }

  // ---------- Espadas y golpe rápido ----------
  // clic: corte ligero (combo de 3); mantener y soltar: golpe cargado
  function swordDown() { if (!canAct() || !curSword() || L.switchT > 0) { L.charge = -1; return; } L.charge = 0; }
  function swordUp() {
    if (L.charge < 0) return;
    const heavy = L.charge >= HEAVY.charge;
    L.charge = -1;
    if (!canAct() || !curSword()) return;
    if (L.swing || L.techAnim) { if (!heavy) L.queued = true; return; } // se encadena al terminar
    startSwing(heavy ? 'heavy' : 'light');
  }
  function startSwing(kind) {
    const Wp = curSword();
    if (!Wp) return;
    const step = kind === 'heavy' ? 0 : L.comboT > 0 ? L.combo % 3 : 0;
    const sw = swingOf(Wp, kind, step, myState()?.swLvl || 0);
    L.swing = { kind, step: sw.step, t: 0, dur: sw.dur, hitAt: sw.dur * 0.34, done: false, sw };
    L.combo = kind === 'heavy' ? 0 : sw.step + 1;
    L.comboT = COMBO_WINDOW + sw.dur;
    snd(kind === 'heavy' ? 'heavyswing' : Wp.sound, vol() * 0.9);
  }
  function bash() {
    if (!canAct() || L.bashCd > 0 || L.swing || L.techAnim) return;
    L.bashCd = BASH.every; L.bashT = 0.34; L.burst = 0;
    snd('bash', vol() * 0.9);
    meleeSend('bash', 0, L.cur, { range: BASH.range, arc: BASH.arc, dmg: BASH.dmg });
  }
  // el anfitrión decide los golpes; aquí solo se adelanta el "se sintió" (pausa del arma, chispas, marcador)
  function meleeSend(kind, step, w, sw) {
    const m = { kind, step, w, x: me.x, y: me.y, a: me.a };
    const targets = viewZombies.filter((z) => z.st !== 'dead' && !(z.st === 'rise' && z.t < 0.6));
    const hits = arcHits({ x: me.x, y: me.y, a: me.a }, targets, { range: sw.range, arc: sw.arc, los: (ax, ay, bx, by) => lineOfSight(level, ax, ay, bx, by), max: 5 });
    if (isHost && Sim) sim.melee(Sim, mySeat, m);
    else ctx.sendEvent({ k: 'melee', kind, step, w, x: r3(me.x), y: r3(me.y), a: r3(me.a) });
    const W = WEAPONS[w];
    const col = kind !== 'bash' && W?.color ? W.color : '#ffffff';
    if (kind !== 'bash') {
      const c = kind === 'heavy' ? { from: 1.15, to: -1.25, tilt: -0.1, arc: 3 } : COMBO[step];
      fx.slashes?.add(me.x * S + Math.cos(me.a) * 0.25, EYE_H - 0.35, me.y * S + Math.sin(me.a) * 0.25, me.a, { from: c.from, to: c.to, tilt: c.tilt, r: sw.range * S * 0.85, color: col, dur: sw.dur * 0.45, arc: c.arc ?? sw.arc });
    }
    if (!hits.length) return hits;
    hitStop = kind === 'heavy' ? 0.12 : 0.07; // solo el arma se detiene: la simulación sigue
    shake = Math.max(shake, kind === 'heavy' ? 0.38 : 0.2);
    hitT = 0.22; hitKill = false; hitHead = false;
    snd('slashhit', vol());
    for (const z of hits) fx.particles?.burst(z.x * S, 1.2, z.y * S, kind === 'heavy' ? 16 : 9, { colors: [col, '#ffffff', '#7CFF4F'], speed: 3.4, size: 0.04, dir: { x: Math.cos(me.a), y: 0.35, z: Math.sin(me.a) }, spread: 1.6, life: 0.45 });
    return hits;
  }

  // ---------- Técnicas (Q) ----------
  function useTech() {
    if (!canAct()) return false;
    const Wp = curSword();
    if (!Wp) { popup('Equipa una espada para usar su técnica', '#9fe3ff'); return false; }
    const T = TECHNIQUES[Wp.tech];
    const P = myState();
    if ((P?.tcd || 0) > 0) { popup(`Técnica en espera · ${Math.ceil(P.tcd)} s`, '#9fe3ff'); snd('empty', vol()); return false; }
    if ((P?.energy || 0) < T.cost) { popup('Te falta energía: conecta golpes con la espada', '#9fe3ff'); snd('empty', vol()); return false; }
    const path = techPath(T, me.x, me.y, me.a, sim.techCast(level, T));
    if (isHost && Sim) { const r = sim.technique(Sim, mySeat, { w: L.cur, x: me.x, y: me.y, a: me.a }); if (!r.ok) { popup(r.why, '#9fe3ff'); return false; } }
    else ctx.sendEvent({ k: 'tech', w: L.cur, x: r3(me.x), y: r3(me.y), a: r3(me.a) });
    L.swing = null; L.charge = -1; L.queued = false;
    L.techAnim = { id: T.id, t: 0, dur: 0.6 }; L.lastTech = T.id;
    playTechFx(T.id, path.ax, path.ay, path.bx, path.by, true);
    if (T.kind !== 'wave') dash = { ax: path.ax, ay: path.ay, bx: path.bx, by: path.by, t: T.kind === 'blink' ? -0.12 : 0, dur: T.kind === 'blink' ? 0.1 : 0.26 }; // el rayo cae primero y luego lo sigues
    ui.banner({ kind: 'tech', tech: T.id, dur: 2.3 / Math.max(0.25, fxScale) });
    snd(`tech_${T.id}`, vol() * 1.1);
    techFx = { id: T.id, t: 0.75, max: 0.75, color: T.color, lines: speedLines() };
    fovKick = T.kind === 'blink' ? 16 : T.kind === 'dash' ? 10 : 6;
    shake = Math.max(shake, 0.45);
    return true;
  }
  // efectos de una técnica (mine: la lancé yo, la ola sale un poco delante de la cámara)
  function playTechFx(id, ax, ay, bx, by, mine) {
    const T = TECHNIQUES[id];
    if (!T || !fx.tech) return;
    const a = Math.atan2(by - ay, bx - ax);
    const off = mine && T.kind === 'wave' ? 1.1 : 0;
    const path = { ax: (ax + Math.cos(a) * off) * S, az: (ay + Math.sin(a) * off) * S, bx: bx * S, bz: by * S };
    fx.tech.play(id, path, id === 'agua' ? 1.05 : id === 'rayo' ? 1.1 : 1.0);
    if (id === 'rayo') {
      for (let k = 0.15; k <= 1; k += 0.2) fx.splats?.add((ax + (bx - ax) * k) * S, (ay + (by - ay) * k) * S, 0.5, '#2a2418');
      fx.rings?.add(bx * S, by * S, { color: '#ffe14f', max: 3, life: 0.4 });
    } else if (id === 'llama') fx.rings?.add(bx * S, by * S, { color: '#ff7a2a', max: 3.6, life: 0.5 });
    else fx.rings?.add(bx * S, by * S, { color: '#4fd8ff', max: 2.6, life: 0.6 });
    boomT = 0.18; boomPos.set(bx * S, 1.4, by * S);
  }

  function updateWeapon(dt) {
    const W = WEAPONS[L.cur];
    L.cd = Math.max(0, L.cd - dt);
    L.switchT = Math.max(0, L.switchT - dt);
    L.bashCd = Math.max(0, L.bashCd - dt);
    L.bashT = Math.max(0, (L.bashT || 0) - dt);
    L.comboT = Math.max(0, L.comboT - dt);
    if (!L.comboT && !L.swing) L.combo = 0;
    if (L.reloadT > 0) {
      L.reloadT -= dt;
      if (L.reloadT <= 0) {
        L.reloadT = 0;
        const take = Math.min(W.mag - L.mag[L.cur], L.res[L.cur]);
        L.mag[L.cur] += take;
        if (L.res[L.cur] !== Infinity) L.res[L.cur] -= take;
      }
    }
    if (L.burst > 0) { L.burstT -= dt; if (L.burstT <= 0) { L.burstT = W.burstEvery; fireOne(); } }
    // apuntar (clic derecho): zoom, menos dispersión, el arma al centro
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

  // ---------- Rueda de armas (mantén Tab): la simulación sigue, solo se ve en cámara lenta aquí ----------
  function openWheel() {
    if (!canAct() || L.wheel) return;
    L.wheel = { open: true, sel: L.cur, x: 0, y: 0, t: 0, items: ownedList() };
  }
  function closeWheel(apply = true) {
    const w = L.wheel;
    if (!w) return;
    L.wheel = null;
    if (apply && w.sel != null) switchTo(w.sel);
  }
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

  // ---------- Controles ----------
  const isTyping = () => { const el = document.activeElement; return el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable); };
  on(window, 'keydown', (e) => {
    if (isTyping()) return;
    if (e.code === 'KeyF' && !e.repeat && !e.ctrlKey && !e.metaKey) { e.preventDefault(); ctx.fullscreen?.toggle?.(); return; }
    const scr = uiScreen();
    if (scr && scr !== 'shop' && ui.handleKey(e)) { keys.clear(); firing = false; return; }
    const k = e.code;
    if (['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'ShiftLeft', 'ShiftRight'].includes(k)) e.preventDefault();
    keys.add(k);
    if (e.repeat) return;
    if (shopOpen && /^Digit[1-9]$/.test(k)) { const it = SHOP[Number(k.slice(5)) - 1]; if (it) buy(it.id); return; }
    if (/^Digit[1-9]$/.test(k)) { const i = ownedList()[Number(k.slice(5)) - 1]; if (L.wheel) { if (i != null) L.wheel.sel = i; } else if (i != null) switchTo(i); }
    if (k === 'KeyR') startReload();
    if (k === 'Tab') { e.preventDefault(); openWheel(); }
    if (k === 'KeyQ') useTech();
    if (k === 'KeyV') bash();
    if (k === 'KeyB' && latestPhase() === 'break' && mySeat >= 0) toggleShop();
    if ((k === 'Enter' || k === 'KeyG') && latestPhase() === 'break') setReady(!ready);
    if (k === 'Escape') { if (L.wheel) closeWheel(false); else if (shopOpen) toggleShop(false); else menu = !menu; }
    if (k === 'KeyC') setQuality(quality === 'alta' ? 'baja' : 'alta');
    if (k === 'Space' && mySeat >= 0 && !menu && !shopOpen) { if (curSword()) swordDown(); else firing = firing || { used: false }; }
  });
  on(window, 'keyup', (e) => {
    keys.delete(e.code);
    if (e.code === 'Space') { if (curSword()) swordUp(); else if (!mouseDown) firing = false; }
    if (e.code === 'Tab') closeWheel(true);
  });
  on(window, 'blur', () => { keys.clear(); firing = false; mouseDown = false; L.ads = false; L.charge = -1; closeWheel(false); });
  let mouseDown = false;
  const rectPt = (e) => { const r = hudCanvas.getBoundingClientRect(); const k = hudCanvas.width / (r.width || 1); return { x: (e.clientX - r.left) * k, y: (e.clientY - r.top) * k, cx: e.clientX - r.left, cy: e.clientY - r.top }; };
  on(canvas, 'mousemove', (e) => {
    if (document.pointerLockElement === canvas && L.wheel) wheelAim(e.movementX, e.movementY);
    else if (document.pointerLockElement === canvas) {
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
    if (mySeat < 0) { watchSeat = nextSeat(watchSeat); return; }
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
    else if (!shopOpen && latestPhase() !== 'over') { menu = true; firing = false; mouseDown = false; L.ads = false; L.charge = -1; closeWheel(false); }
  });
  function lockPointer() {
    try { const r = canvas.requestPointerLock?.(); r?.catch?.(() => { menu = false; fresh = false; }); } catch { menu = false; fresh = false; }
    audioUnlock();
  }
  function audioUnlock() { playSound('tick', 0.001); }
  function cycleWeapon(dir) { const n = WEAPONS.length; for (let k = 1; k <= n; k++) { const i = (L.cur + dir * k + n * 2) % n; if (L.owned[i]) { switchTo(i); return; } } }
  // apuntando con zoom, el mouse se mueve más fino
  function adsSens() { const W = WEAPONS[L.cur]; return W.kind === 'gun' ? 1 / (1 + ((W.zoom || 1) - 1) * L.adsK * 0.85) : 1; }
  function nextSeat(cur) { for (let k = 1; k <= 4; k++) { const i = (cur + k) % 4; if (room.seats[i]) return i; } return cur; }
  function toggleShop(v = !shopOpen) {
    shopOpen = v && latestPhase() === 'break';
    if (shopOpen && document.pointerLockElement === canvas) document.exitPointerLock?.();
    if (!shopOpen && !touchDevice) lockPointer();
  }
  function setReady(v) { ready = v; if (isHost && Sim?.players[mySeat]) Sim.players[mySeat].ready = v; else ctx.sendEvent({ k: 'ready', on: v }); }
  function buy(id) {
    if (isHost && Sim) { const r = sim.buy(Sim, mySeat, id); if (!r.ok) popup(r.why, '#ff8080'); }
    else ctx.sendEvent({ k: 'buy', id });
  }
  // Volver a jugar (siempre tras un clic o una tecla): pantalla completa si se puede y capturar el mouse
  // fs: al empezar o entrar a una partida, también pantalla completa (si el navegador deja)
  function resumePlay(fs = false) {
    audioUnlock();
    if (touchDevice) { menu = false; fresh = false; } else { menu = true; lockPointer(); }
    if (fs) ctx.fullscreen?.enter?.();
  }
  function setOpt(k, v) {
    if (k === 'quality') { if (v !== quality) setQuality(v); return; }
    opts[k] = v;
    saveOpts(opts);
    if (k === 'fov') { camera.fov = v; camera.updateProjectionMatrix(); }
  }
  function setQuality(q) {
    quality = q; store('zombies.quality', q);
    if (!level) return;
    scene.remove(world.group); world.dispose();
    world = buildWorld(level, floor, { quality });
    scene.add(world.group);
    renderer.shadowMap.enabled = q === 'alta';
    scene.fog.near = q === 'alta' ? 9 : 6; scene.fog.far = q === 'alta' ? 40 : 28;
    scene.traverse((o) => { if (o.material) [].concat(o.material).forEach((m) => { m.needsUpdate = true; }); });
    warmed = false; // se vuelve a preparar con la calidad nueva
    fit();
  }
  function uiAction(id) {
    audioUnlock();
    if (id === 'resume') resumePlay();
    else if (id === 'leave') ctx.close?.();
    else if (id === 'quality') setQuality(quality === 'alta' ? 'baja' : 'alta');
    else if (id === 'restart') restartGame();
    else if (id === 'closeShop') toggleShop(false);
    else if (id === 'ready') setReady(!ready);
    else if (id === 'join') ctx.sit?.();
    else if (id === 'menu') menu = true;
    else if (id === 'shop') toggleShop();
    else if (id === 'reload') startReload();
    else if (id === 'swap') cycleWeapon(1);
    else if (id === 'tech') useTech();
    else if (id === 'bash') bash();
    else if (id === 'ads') L.ads = !L.ads;
    else if (id.startsWith('buy:')) buy(id.slice(4));
  }
  // Táctil: palanca a la izquierda, arrastrar a la derecha para apuntar, botones
  if (touch) {
    on(canvas, 'touchstart', (e) => {
      e.preventDefault();
      for (const t of e.changedTouches) {
        const p = rectPt(t);
        const id = hud.hit(p.x, p.y);
        if (id === 'fire') { touch.fireId = t.identifier; if (curSword()) { touch.sword = true; swordDown(); } else touch.fire = true; continue; }
        if (id === 'revive') { me.rv = 1; touch.rvId = t.identifier; continue; }
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
        if (t.identifier === touch.rvId) me.rv = 0;
      }
    };
    on(canvas, 'touchend', end); on(canvas, 'touchcancel', end);
  }

  // ---------- Vista: qué se dibuja ----------
  const latestPhase = () => (isHost && Sim ? Sim.phase : latest?.ph || 'intro');
  function myState() {
    if (isHost && Sim) return Sim.players[mySeat];
    const p = latest && sim.unpackPlayers(latest)[mySeat];
    return p || null;
  }
  const myAlive = () => { const P = myState(); return P ? P.alive : true; };
  function seatPos(seat) {
    if (seat === mySeat) return me;
    if (isHost && Sim) return Sim.players[seat];
    return viewPlayers[seat];
  }
  function buildView() {
    if (isHost && Sim) {
      viewZombies = Sim.zombies;
      viewPlayers = Sim.players.map((p, i) => {
        if (!p || i === mySeat) return p;
        const st = inputBufs[i].state({ keys: ['x', 'y', 'a', 'p'], angles: ['a'], jump: 3 });
        return st ? { ...p, x: st.x, y: st.y, a: st.a, p: st.p } : p;
      });
      viewShots = Sim.shots.map((q) => ({ id: q.id, kind: q.kind, x: q.x, y: q.y, h: q.h }));
      viewDrops = Sim.drops;
      const b = Sim.bossId ? Sim.zombies.find((z) => z.id === Sim.bossId) : null;
      viewBoss = b ? { id: b.boss, name: BOSSES[b.boss].name, hp: b.hp, max: b.max } : null;
      return;
    }
    const smp = buf.sample();
    if (!smp) return;
    const { a, b } = smp;
    const k = Math.max(0, Math.min(1.4, smp.k));
    const za = new Map((a.Z || []).map((z) => [z[0], z]));
    viewZombies = (b.Z || []).map((zb) => {
      const z = sim.unpackZombie(zb);
      const zaR = za.get(z.id);
      if (zaR && k < 1.5) {
        const A = sim.unpackZombie(zaR);
        if (Math.hypot(z.x - A.x, z.y - A.y) < 3) { z.x = A.x + (z.x - A.x) * k; z.y = A.y + (z.y - A.y) * k; z.a = lerpAng(A.a, z.a, Math.min(1, k)); }
        if (A.st === z.st) z.t = A.t + (z.t - A.t) * Math.min(1, k);
      }
      return z;
    });
    const pa = sim.unpackPlayers(a), pb = sim.unpackPlayers(b);
    viewPlayers = pb.map((p, i) => {
      if (!p) return null;
      const q = pa[i];
      if (q && Math.hypot(p.x - q.x, p.y - q.y) < 3) return { ...p, x: q.x + (p.x - q.x) * k, y: q.y + (p.y - q.y) * k, a: lerpAng(q.a, p.a, Math.min(1, k)), p: q.p + (p.p - q.p) * Math.min(1, k) };
      return p;
    });
    const ja = new Map((a.J || []).map((j) => [j[0], j]));
    viewShots = (b.J || []).map((j) => {
      const q = ja.get(j[0]);
      const x = j[2] / 100, y = j[3] / 100, h = j[4] / 100;
      if (!q) return { id: j[0], kind: sim.PROJ[j[1]], x, y, h };
      return { id: j[0], kind: sim.PROJ[j[1]], x: q[2] / 100 + (x - q[2] / 100) * k, y: q[3] / 100 + (y - q[3] / 100) * k, h: q[4] / 100 + (h - q[4] / 100) * k };
    });
    viewDrops = (latest?.K || []).map((d) => ({ id: d[0], kind: sim.DROP_KINDS[d[1]], x: d[2] / 100, y: d[3] / 100 }));
    const B = latest?.B;
    viewBoss = B ? { id: BOSSES_ORDER[B[0]], name: BOSSES[BOSSES_ORDER[B[0]]]?.name, hp: B[1], max: B[2] } : null;
  }
  const BOSSES_ORDER = Object.keys(BOSSES);
  function lerpAng(a, b, k) { let d = b - a; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2; return a + d * k; }

  // ---------- Cuadro ----------
  function frame(dt) {
    if (destroyed || !level) return;
    time += dt; frames++;
    const nowT = performance.now();
    fpsN++;
    if (!fpsAcc) fpsAcc = nowT;
    if (nowT - fpsAcc >= 1000) { fps = Math.round((fpsN * 1000) / (nowT - fpsAcc)); fpsAcc = nowT; fpsN = 0; }
    buildView();
    const P = myState();
    me.alive = P ? P.alive : true;
    // ¿qué menú se ve? (al cambiar, el lienzo puede cambiar de tamaño en celular)
    const scr = uiScreen();
    const msOn = scr === 'main';
    const inLobby = lobbyNow();
    menuScene.setActive(msOn);
    // moverme
    if (mySeat >= 0 && level) {
      const still = menu || shopOpen || !!scr;
      const turn = (keys.has('ArrowLeft') ? -1 : 0) + (keys.has('ArrowRight') ? 1 : 0);
      if (!still) me.a += turn * 2.4 * dt;
      const f = still ? 0 : (keys.has('KeyW') || keys.has('ArrowUp') ? 1 : 0) - (keys.has('KeyS') || keys.has('ArrowDown') ? 1 : 0) - (touch?.sy || 0);
      const s = still ? 0 : (keys.has('KeyD') ? 1 : 0) - (keys.has('KeyA') ? 1 : 0) + (touch?.sx || 0);
      if (!touch) me.rv = !still && keys.has('KeyE') ? 1 : 0;
      const Wc = WEAPONS[L.cur];
      const slow = (L.adsK > 0.5 ? 0.6 : 1) * (Wc.slow || 1) * (L.charge > 0.2 ? 0.75 : 1);
      const sprint = (keys.has('ShiftLeft') || keys.has('ShiftRight')) && L.adsK < 0.3;
      if (dash) {
        // embestida de la técnica: la cámara viaja por el camino (ya libre de muros)
        dash.t += dt * fxScale;
        const k = Math.max(0, Math.min(1, dash.t / dash.dur));
        me.x = dash.ax + (dash.bx - dash.ax) * k; me.y = dash.ay + (dash.by - dash.ay) * k; me.mv = 2;
        if (k >= 1) dash = null;
      } else if (me.alive && latestPhase() !== 'over') sim.movePlayer(level, me, { f: f * slow, s: s * slow, sprint }, dt, viewZombies);
      else me.mv = 0;
      if (me.mv) bob += dt * (me.mv === 2 ? 13 : 9);
      updateWeapon(dt);
      // invitado: mandar mi posición y mis disparos
      if (!isHost) {
        inputAcc += dt;
        if (inputAcc >= 1 / 30) { inputAcc = 0; ctx.sendInput(stamp({ x: r3(me.x), y: r3(me.y), a: r3(me.a), p: r3(me.p), w: L.cur, mv: me.mv, rv: me.rv })); }
        else if (dash) { inputAcc = 0; ctx.sendInput(stamp({ x: r3(me.x), y: r3(me.y), a: r3(me.a), p: r3(me.p), w: L.cur, mv: me.mv, rv: me.rv })); }
        if (pendingShots.length) ctx.sendEvent({ k: 'shots', list: pendingShots.splice(0).map((q) => ({ ...q, x: r3(q.x), y: r3(q.y), a: r3(q.a), p: r3(q.p) })) });
      }
    }
    // espectador: la cámara sigue a un jugador
    let eye = me, eyeSeat = mySeat;
    if (mySeat < 0) {
      if (!room.seats[watchSeat]) watchSeat = nextSeat(watchSeat);
      const w = viewPlayers[watchSeat];
      if (w) { eye = w; eyeSeat = watchSeat; }
    }
    // jugadores remotos (sus personajes de cubos)
    for (let i = 0; i < 4; i++) {
      const p = viewPlayers[i];
      const uid = room.seats[i];
      if (i === eyeSeat || !p || !uid) { const a = avatars.get(i); if (a) { scene.remove(a.g); avatars.delete(i); } continue; }
      let a = avatars.get(i);
      if (!a || a.uid !== uid) {
        if (a) scene.remove(a.g);
        a = { uid, g: voxelAvatar(avatarOf(uid), nameOfSeat(i), SEAT_COLORS[i]), fireT: 0, last: null };
        avatars.set(i, a);
        scene.add(a.g);
      }
      const prev = a.last || p;
      const sp = Math.hypot(p.x - prev.x, p.y - prev.y) / Math.max(dt, 1e-3);
      a.last = { x: p.x, y: p.y };
      a.g.position.set(p.x * S, 0, p.y * S);
      a.g.rotation.y = Math.PI / 2 - p.a;
      a.fireT = Math.max(0, a.fireT - dt);
      animateAvatar(a.g, { speed: Math.min(1.5, sp / 3), dt, alive: p.alive || p.down, pitch: p.p || 0, fire: a.fireT > 0 ? 1 : 0 });
      // espada en la mano si la trae (y su corte)
      const U = a.g.userData, sw = isSword(p.w);
      if (sw && a.swordW !== p.w) { if (a.sword) U.armR.remove(a.sword); a.sword = avatarSword(WEAPONS[p.w].color); a.sword.position.set(0, -0.5, 0.05); a.sword.rotation.x = Math.PI / 2; U.armR.add(a.sword); a.swordW = p.w; }
      if (a.sword) a.sword.visible = sw;
      U.gun.visible = !sw;
      a.slashT = Math.max(0, (a.slashT || 0) - dt);
      if (a.slashT > 0) { const k = 1 - a.slashT / 0.3; U.armR.rotation.x = -2.5 + k * 1.6; U.armR.rotation.z = -0.9 + k * 1.8; } else U.armR.rotation.z = 0;
      // en la sala todos están junto a la cámara del menú: no se dibujan
      a.g.visible = !(msOn && inLobby) && (p.alive || p.down);
    }
    // zombis
    const list = [];
    let bossZ = null;
    for (const z of viewZombies) {
      if (z.kind === 'boss') { bossZ = z; continue; }
      const lp = lastPos.get(z.id);
      const d = lp ? Math.hypot(z.x - lp.x, z.y - lp.y) : 0;
      lastPos.set(z.id, { x: z.x, y: z.y });
      const ph = (walkPh.get(z.id) || z.id) + d * 7;
      walkPh.set(z.id, ph);
      list.push({ id: z.id, kind: z.kind, x: z.x * S, z: z.y * S, a: z.a, st: z.st, t: z.t, flash: z.flash > 0 ? 1 : 0, walk: ph, h: z.h });
    }
    if (walkPh.size > 300) { walkPh.clear(); lastPos.clear(); }
    // menú principal: la cámara recorre la oficina de noche y unos zombis deambulan a lo lejos
    if (msOn) { const deco = menuScene.update(dt, time, camera); if (inLobby) list.push(...deco); }
    horde.update(list, time);
    if (bossZ) {
      if (!bossObj || bossObj.zid !== bossZ.id) {
        if (bossObj) scene.remove(bossObj.g);
        const g = bossModel(bossZ.boss);
        rememberBossMaterials(g);
        bossObj = { g, zid: bossZ.id };
        scene.add(g);
        fx.rings.add(bossZ.x * S, bossZ.y * S, { color: '#ff3b3b', max: 5, life: 0.9 });
      }
      bossObj.g.position.set(bossZ.x * S, 0, bossZ.y * S);
      bossObj.g.rotation.y = Math.PI / 2 - bossZ.a;
      animateBoss(bossObj.g, bossZ, time, dt);
    } else if (bossObj) { scene.remove(bossObj.g); bossObj = null; }
    fx.proj.update(viewShots.map((q) => ({ ...q, x: q.x * S, z: q.y * S })), time);
    fx.drops.update(viewDrops.map((d) => ({ ...d, x: d.x * S, z: d.y * S })), time);
    fx.particles.update(dt); fx.tracers.update(dt); fx.rings.update(dt);
    const fdt = dt * fxScale;
    fx.slashes.update(fdt); fx.beams.update(fdt); fx.tech.update(fdt, time);
    fx.zones.update(zoneView(), dt, time);
    const bossWave = isBossWave(isHost && Sim ? Sim.wave : latest?.w || 0) && latestPhase() === 'fight';
    const night = msOn && inLobby;
    world.update(dt, time, bossWave, night);
    if (night !== nightOn) {
      nightOn = night;
      const c = night ? '#05070b' : '#14161d';
      scene.background.set(c); scene.fog.color.set(c);
      scene.fog.near = night ? 3 : quality === 'alta' ? 9 : 6; scene.fog.far = night ? 26 : quality === 'alta' ? 40 : 28;
    }
    // apuntar acerca la cámara (zoom real: se reduce el campo de visión) y las técnicas la abren de golpe
    const Wz = WEAPONS[L.cur];
    const zoom = mySeat >= 0 && Wz.kind === 'gun' ? 1 + ((Wz.zoom || 1) - 1) * L.adsK : 1;
    fovKick = Math.max(0, fovKick - dt * 30 * fxScale);
    const baseFov = msOn ? 62 : opts.fov;
    const fov = Math.round((2 * Math.atan(Math.tan((baseFov * Math.PI) / 360) / zoom) * 180 / Math.PI + (msOn ? 0 : fovKick)) * 100) / 100;
    if (camera.fov !== fov) { camera.fov = fov; camera.updateProjectionMatrix(); }

    // cámara
    hurt = Math.max(0, hurt - dt * 0.9); shake = Math.max(0, shake - dt * 2.2); hitT = Math.max(0, hitT - dt);
    hitStop = Math.max(0, hitStop - dt); boomT = Math.max(0, boomT - dt);
    if (techFx) { techFx.t -= dt * fxScale; if (techFx.t <= 0) techFx = null; }
    if (L.wheel) L.wheel.t += dt;
    L.barT = Math.max(0, (L.barT || 0) - dt);
    for (let i = dmgNums.length - 1; i >= 0; i--) { dmgNums[i].t -= dt * 0.9; if (dmgNums[i].t <= 0) dmgNums.splice(i, 1); }
    for (let i = killFeed.length - 1; i >= 0; i--) { killFeed[i].t -= dt; if (killFeed[i].t <= 0) killFeed.splice(i, 1); }
    // aviso cuando se llena la barra de técnica
    { const Pm = mySeat >= 0 ? myState() : null; const rdy = !!Pm && Pm.alive && Pm.energy >= ENERGY_MAX && !(Pm.tcd > 0) && L.owned.some((o, i) => o && isSword(i)); if (rdy && !techWasReady) { snd('techready', volUi() * 0.8); popup('¡Técnica lista! · Q', TECHNIQUES[curSword()?.tech || L.lastTech]?.color || '#4fd8ff', true); } techWasReady = rdy; }
    recoil = Math.max(0, recoil - dt * 6); flashT = Math.max(0, flashT - dt); switchAnim = Math.max(0, switchAnim - dt * 3.5);
    const eyeAlive = eyeSeat === mySeat ? me.alive : !!eye.alive;
    const by = eyeSeat === mySeat && me.mv ? Math.sin(bob) * 0.035 : 0;
    const sh = shake * 0.08;
    camera.position.set(eye.x * S + (Math.random() - 0.5) * sh, eyeAlive ? EYE_H + by + (Math.random() - 0.5) * sh : 0.45, eye.y * S + (Math.random() - 0.5) * sh);
    camera.rotation.set((eye.p || 0) + recoil * 0.02, -(eye.a || 0) - Math.PI / 2, eyeAlive ? 0 : 0.22);
    if (msOn) menuScene.update(0, time, camera);
    // oído en la cámara, pasos, quejidos sueltos y fondo (zumbido; latido con jefe)
    za.listener(camera.position.x, camera.position.z, msOn ? menuScene.a : eye.a || 0);
    za.update(dt, { on: true, boss: bossWave, vol: volUi() });
    if (!msOn && eyeSeat === mySeat && me.mv && me.alive) { stepT -= dt; if (stepT <= 0) { stepT = me.mv === 2 ? 0.29 : 0.42; snd('step', vol() * 0.55); } } else stepT = 0.05;
    groanT -= dt;
    if (groanT <= 0) {
      groanT = rnd(1.4, 3.6);
      const near = viewZombies.filter((z) => z.st !== 'dead' && z.kind !== 'boss' && Math.hypot(z.x - eye.x, z.y - eye.y) < 16);
      const z = near[(Math.random() * near.length) | 0];
      if (z) spatial('groan', z.x, z.y, 0.8);
      else if (msOn && inLobby) { const d = menuScene.zombies[(Math.random() * menuScene.zombies.length) | 0]; if (d) za.play('groan', { x: d.x0 * S, z: d.y0 * S, vol: volUi() * 0.5 }); }
    }
    if (boomT > 0) { worldFlash.position.copy(boomPos); worldFlash.intensity = 60 * (boomT / 0.18); }
    else { worldFlash.position.copy(camera.position); worldFlash.intensity = flashT > 0 && !msOn ? 25 : 0; }
    // arma en primera persona
    updateViewModel(dt, eyeSeat, eye, eyeAlive);

    renderer.clear();
    renderer.render(scene, camera);
    renderer.clearDepth();
    if (eyeAlive && !msOn && scr !== 'over' && !(menu && mySeat >= 0 && latestPhase() === 'intro')) renderer.render(vmScene, vmCam);
    drawHud(dt, P, eye, eyeSeat, scr);
    ui.update(uiModel(scr));
  }
  let nightOn = false;

  // Qué pantalla de menú toca: sala/menú principal, fin, tienda, pausa o ninguna (jugando)
  function uiScreen() {
    if (!level) return null;
    if (lobbyNow()) return 'main';
    if (latestPhase() === 'over') return 'over';
    if (!entered) return 'main';
    if (mySeat < 0) return null;
    if (shopOpen) return 'shop';
    if (menu) return 'pause';
    return null;
  }
  // Lo que necesitan los menús para dibujarse
  function uiModel(scr) {
    if (!scr) return { screen: null };
    const src = isHost && Sim ? Sim.players : latest ? sim.unpackPlayers(latest) : [];
    const squad = [0, 1, 2, 3].map((i) => {
      const uid = room.seats[i];
      if (!uid) return null;
      const p = src[i];
      return { seat: i, uid, name: nameOfSeat(i), host: room.host === uid, me: uid === myId, ready: !!p?.ready, alive: p ? p.alive : true, down: !!p?.down, hp: p?.hp ?? 100, kills: p?.kills || 0, dealt: p?.dealt || 0, revives: p?.revives || 0, earned: p?.earned || 0 };
    });
    const count = squad.filter(Boolean).length;
    const guests = squad.filter((q) => q && !q.host);
    const inLobby = lobbyNow();
    const users = office.state.users;
    const live = (office.state.liveGames || []).filter((g) => g.objectId !== ctx.objectId)
      .map((g) => ({ objectId: g.objectId, floorId: g.floorId, players: g.players, max: g.max, hostName: users[g.players[0]]?.displayName?.split(' ')[0] || 'alguien' }));
    const P = myState();
    const lt = isHost ? lobbyT : latest?.lt ?? null;
    return {
      screen: scr,
      mode: mySeat < 0 ? 'watch' : inLobby ? 'lobby' : 'live',
      isHost, count, solo: count <= 1, squad, live,
      allReady: guests.length > 0 && guests.every((q) => q.ready),
      myReady: !!squad[mySeat]?.ready,
      lobbyT: inLobby && lt != null ? Math.max(0, lt) : null,
      wave: isHost && Sim ? Sim.wave : latest?.w || 0,
      pt: isHost && Sim ? Sim.pt : latest?.pt || 0,
      fresh, ready, joinable: mySeat < 0 && count < 4 && !!ctx.sit,
      me: P ? { pts: P.pts, owned: P.owned, dmgLvl: P.dmgLvl, swLvl: P.swLvl || 0, enLvl: P.enLvl || 0 } : null,
      opts: { ...opts, quality },
      canRestart: mySeat >= 0,
      results: scr === 'over' ? squad.filter(Boolean) : null,
      summary: scr === 'over' ? { wave: isHost && Sim ? Sim.wave : latest?.w, ...(summary || {}) } : null,
    };
  }
  const r3 = (v) => Math.round(v * 1000) / 1000;
  const rnd = (a, b) => a + Math.random() * (b - a);

  function updateViewModel(dt, eyeSeat, eye, alive) {
    const uid = room.seats[eyeSeat] ?? myId;
    const av = avatarOf(uid);
    const key = `${av.skin}|${av.shirt}`;
    if (vm.armsKey !== key) {
      if (vm.arms) vm.root.remove(vm.arms.group);
      vm.arms = armsModel(av.skin || '#f6c9a0', av.shirt || '#3d7be0');
      vm.root.add(vm.arms.group);
      vm.armsKey = key;
    }
    const mine = eyeSeat === mySeat;
    const wIdx = mine ? L.cur : (viewPlayers[eyeSeat]?.w || 0);
    if (!vm.weapons.length) for (let i = 0; i < WEAPONS.length; i++) { const w = viewWeapon(i); w.group.visible = false; vm.root.add(w.group); vm.weapons.push(w); }
    const Wd = WEAPONS[wIdx] || WEAPONS[0];
    const Wv = vm.weapons[wIdx] || vm.weapons[0];
    // con la mira telescópica puesta no se ve el arma
    const scoped = mine && Wd.scope && L.adsK > 0.85;
    vm.root.visible = !scoped;
    vm.weapons.forEach((w, i) => { w.group.visible = i === wIdx; });
    const vdt = (mine && L.wheel ? 0.3 : 1) * dt; // rueda abierta: la vista local va en cámara lenta
    swayT += vdt;
    const moving = mine ? me.mv : 0;
    const A = vm.arms;
    if (Wv.kind === 'sword') poseSword(Wv, Wd, mine, moving, vdt);
    else poseGun(Wv, Wd, wIdx, mine, moving);
    vm.lastSword = Wv.kind === 'sword';
    if (Wv.kind !== 'sword') vm.trail?.sample(_tip, _base, false, vdt);
    muzzle.visible = flashT > 0 && alive && Wv.kind === 'gun' && !scoped;
    if (muzzle.visible) {
      Wv.muzzle.updateWorldMatrix(true, false);
      muzzle.position.setFromMatrixPosition(Wv.muzzle.matrixWorld);
      muzzle.material.rotation = Math.random() * 6;
      muzzle.scale.setScalar(Wd.pellets > 1 || Wd.splash ? 0.45 : Wd.scope ? 0.38 : 0.26);
    }
    vmFlashLight.intensity = flashT > 0 && Wv.kind === 'gun' ? 6 : 0;
    void A;
    if (!warmed && fx.particles) warmUp();
  }
  const _tip = new THREE.Vector3(), _base = new THREE.Vector3(), _dir = new THREE.Vector3(), _hand = new THREE.Vector3(), _edge = new THREE.Vector3(), _x = new THREE.Vector3(), _m4 = new THREE.Matrix4(), _q4 = new THREE.Quaternion();
  const _Z = new THREE.Vector3(0, 0, 1);
  const IDLE_DIR = new THREE.Vector3(0.3, 0.88, -0.36).normalize(), IDLE_HAND = new THREE.Vector3(0.2, -0.22, -0.46);
  const CHARGE_DIR = new THREE.Vector3(0.8, 0.42, 0.45).normalize(), CHARGE_HAND = new THREE.Vector3(0.24, -0.15, -0.4);
  const ease = (k) => 1 - Math.pow(1 - Math.min(1, Math.max(0, k)), 3);
  // dirección de la hoja en un corte horizontal (phi: −derecha … +izquierda), inclinado por tilt alrededor de la mirada
  function slashDir(phi, tilt, out) {
    const x = -Math.sin(phi), y = 0.12, z = -Math.cos(phi);
    return out.set(x * Math.cos(tilt) - y * Math.sin(tilt), x * Math.sin(tilt) + y * Math.cos(tilt), z).normalize();
  }
  function poseGun(Wv, Wd, wIdx, mine, moving) {
    const reloading = mine && L.reloadT > 0;
    const rk = reloading ? Math.sin(Math.min(1, 1 - L.reloadT / Wd.reload) * Math.PI) : 0;
    const ads = mine ? L.adsK : 0;
    const bx = (moving ? Math.cos(bob * 0.5) * 0.018 : Math.sin(swayT * 1.4) * 0.003) * (1 - ads * 0.8);
    const byy = (moving ? Math.abs(Math.sin(bob * 0.5)) * 0.022 : Math.sin(swayT * 2) * 0.004) * (1 - ads * 0.8);
    const bk = mine && L.bashT > 0 ? Math.sin((1 - L.bashT / 0.34) * Math.PI) : 0; // golpe rápido con el arma
    const kick = recoil * (Wd.scope ? 0.09 : 0.05);
    const px = 0.12 * (1 - ads) - bk * 0.08, py = -0.135 * (1 - ads) + ads * -0.082, pz = -0.42 + ads * 0.07;
    vm.root.position.set(px + bx, py - byy - rk * 0.2 - switchAnim * 0.3 + bk * 0.05, pz + kick - bk * 0.16);
    vm.root.scale.setScalar(0.85);
    vm.root.rotation.set((0.04 + recoil * 0.12) * (1 - ads * 0.6) + rk * 0.7 - bk * 0.4, 0.14 * (1 - ads) + rk * 0.3 + bk * 0.9, -0.04 * (1 - ads) + rk * 0.25 + bk * 0.5);
    // brazos: el derecho al mango; el izquierdo sostiene el frente
    const A = vm.arms;
    A.R.scale.setScalar(1); A.L.scale.setScalar(1);
    A.R.position.set(0.01, -0.075, 0.07); A.R.rotation.set(0.62, -0.12, 0.1);
    A.L.position.set(-0.02, -0.11, -0.2); A.L.rotation.set(0.45, 0.4, -0.2);
    if (wIdx === 0) {
      // grapadora: la palma aprieta arriba atrás (como se usa una grapadora) y la otra mano la sostiene
      A.R.position.set(0.01, -0.035, 0.05); A.R.rotation.set(0.5, -0.15, 0.1);
      A.L.position.set(-0.06, -0.05, -0.05); A.L.rotation.set(0.45, 0.6, -0.35);
    }
    else if (Wd.id === 'cafetera') { A.L.position.set(-0.01, -0.13, -0.3); A.L.rotation.set(0.42, 0.42, -0.2); }
    else if (Wd.id === 'laser' || Wd.id === 'toner') { A.L.position.set(-0.02, -0.1, -0.3); A.L.rotation.set(0.4, 0.42, -0.2); }
    else if (Wd.id === 'trituradora') { A.L.position.set(-0.04, 0.09, -0.06); A.L.rotation.set(-0.4, 0.3, -0.2); }
    else if (Wd.id === 'lanzatazas') { A.L.position.set(-0.02, -0.11, -0.2); A.L.rotation.set(0.35, 0.4, -0.2); }
    A.R.quaternion.setFromEuler(A.R.rotation); A.L.quaternion.setFromEuler(A.L.rotation);
    Wv.group.position.set(0, 0, 0); Wv.group.rotation.set(0, 0, 0);
  }
  function poseSword(Wv, Wd, mine, moving, vdt) {
    const bx = moving ? Math.cos(bob * 0.5) * 0.02 : Math.sin(swayT * 1.4) * 0.004;
    const byy = moving ? Math.abs(Math.sin(bob * 0.5)) * 0.024 : Math.sin(swayT * 2) * 0.005;
    vm.root.position.set(bx, -byy - switchAnim * 0.35, 0);
    vm.root.rotation.set(0, 0, 0);
    vm.root.scale.setScalar(1);
    let trailOn = false, strong = 1;
    _dir.copy(IDLE_DIR); _hand.copy(IDLE_HAND);
    const sw = mine ? L.swing : null, ta = mine ? L.techAnim : null;
    if (ta) {
      // técnica: estocada larga al frente
      const k = ta.t / ta.dur;
      const out = ease(k / 0.3), back = ease((k - 0.7) / 0.3);
      const fdir = _edge.set(0.05, 0.08, -1).normalize();
      _dir.copy(IDLE_DIR).lerp(fdir, out).lerp(IDLE_DIR, back).normalize();
      _hand.copy(IDLE_HAND).lerp(_x.set(0.02, -0.14, -0.6), out).lerp(IDLE_HAND, back);
      trailOn = false; // la técnica ya tiene su propio efecto en el mundo
    } else if (sw) {
      const k = sw.t / sw.dur;
      const heavy = sw.kind === 'heavy';
      const c = heavy ? { from: 1.15, to: -1.25, tilt: -0.1 } : COMBO[sw.step];
      const w0 = heavy ? 0.14 : 0.2, w1 = heavy ? 0.58 : 0.55;
      const vertical = !heavy && c.from === 0 && c.to === 0;
      const pose = (u, outDir, outHand) => {
        if (vertical) {
          const th = 0.1 + u * 2.3; // de arriba hacia abajo
          outDir.set(0.04, Math.cos(th), -Math.sin(th)).normalize();
          outHand.set(0.04, -0.06 - u * 0.24, -0.42 - u * 0.1);
        } else {
          const phi = (c.from + (c.to - c.from) * u) * (heavy ? 1.55 : 1.3);
          slashDir(phi, c.tilt, outDir);
          outHand.set(0.03 - Math.sin(phi) * 0.14, -0.17 + Math.sin(c.tilt) * Math.sin(phi) * 0.06, -0.44 - Math.cos(phi) * 0.06);
        }
      };
      if (k < w0) { pose(0, _edge, _x); const e = ease(k / w0); _dir.lerp(_edge, e).normalize(); _hand.lerp(_x, e); }
      else if (k < w1) { pose(ease((k - w0) / (w1 - w0)), _dir, _hand); trailOn = true; strong = heavy ? 1.5 : 1; }
      else { pose(1, _dir, _hand); const e = ease((k - w1) / (1 - w1)); _dir.lerp(IDLE_DIR, e).normalize(); _hand.lerp(IDLE_HAND, e); trailOn = k < w1 + 0.08; }
    } else if (mine && L.charge > 0.08) {
      const e = ease((L.charge - 0.08) / (HEAVY.charge - 0.08));
      _dir.lerp(CHARGE_DIR, e).normalize(); _hand.lerp(CHARGE_HAND, e);
      if (L.charge >= HEAVY.charge) _hand.x += (Math.random() - 0.5) * 0.006, _hand.y += (Math.random() - 0.5) * 0.006;
    }
    // filo hacia donde se mueve la hoja (suavizado para que no gire de golpe)
    const prev = vm.prevDir || _dir.clone();
    const mv = _edge.copy(_dir).sub(prev);
    vm.prevDir = _dir.clone();
    if (!vm.edgeV) vm.edgeV = new THREE.Vector3(0, 0, -1);
    if (mv.lengthSq() > 1e-6) vm.edgeV.lerp(mv.normalize(), 0.5);
    else vm.edgeV.lerp(_x.set(0, 0, -1), 0.1);
    const z = _edge.copy(vm.edgeV).addScaledVector(_dir, -vm.edgeV.dot(_dir));
    if (z.lengthSq() < 1e-5) z.set(0, 0, -1).addScaledVector(_dir, _dir.z);
    z.normalize();
    _x.crossVectors(_dir, z).normalize();
    z.crossVectors(_x, _dir).normalize();
    _m4.makeBasis(_x, _dir, z);
    Wv.group.quaternion.setFromRotationMatrix(_m4);
    Wv.group.position.copy(_hand);
    Wv.group.scale.setScalar(0.62);
    // brazos: la mano derecha al mango; con el mandoble la izquierda también
    const A = vm.arms;
    A.R.scale.setScalar(0.8); A.L.scale.setScalar(0.8);
    const sh = _x.set(0.3, -0.44, 0.12);
    A.R.position.copy(_hand);
    A.R.quaternion.setFromUnitVectors(_Z, _edge.copy(sh).sub(_hand).normalize());
    if (Wd.twoHand) {
      const hl = _tip.copy(_hand).addScaledVector(_dir, -0.11);
      A.L.position.copy(hl);
      A.L.quaternion.setFromUnitVectors(_Z, _edge.set(-0.22, -0.46, 0.12).sub(hl).normalize());
    } else { A.L.position.set(-0.32, -0.62, 0.1); A.L.quaternion.set(0, 0, 0, 1); }
    // filo brillante cuando la técnica está lista
    const P = mine ? myState() : null;
    const ready = P && P.energy >= ENERGY_MAX && !(P.tcd > 0);
    Wv.edge.color.copy(Wv.color);
    if (ready) Wv.edge.color.lerp(_c3.set('#ffffff'), 0.4 + Math.sin(time * 8) * 0.35);
    // estela
    Wv.group.updateWorldMatrix(true, true);
    Wv.tip.getWorldPosition(_tip); Wv.base.getWorldPosition(_base);
    if (vm.trail) { vm.trail.color.copy(Wv.color); vm.trail.sample(_tip, _base, trailOn, vdt * fxScale, strong); }
  }
  const _c3 = new THREE.Color();

  // Prepara de una vez todo lo que aparece al jugar (destello, trazos, partículas, golpe blanco,
  // proyectiles, botín, las 10 armas, estelas, cortes, técnicas, piso en llamas y un compañero con
  // espada). Si no, la tarjeta de video lo prepara la primera vez que sale y el juego se congela un
  // momento justo al disparar o al lanzar una técnica.
  let warmed = false;
  function warmUp() {
    warmed = true;
    const tmp = [];
    try {
      const at = new THREE.Vector3(camera.position.x, 1, camera.position.z - 2);
      fx.particles.burst(at.x, at.y, at.z, 2, {}); fx.particles.update(0);
      fx.tracers.add(at, at.clone().add(new THREE.Vector3(0, 0, -1)), 1); fx.tracers.update(0);
      fx.rings.add(at.x, at.z);
      fx.proj.update(sim.PROJ.map((kind, i) => ({ id: -1 - i, kind, x: at.x, z: at.z, h: 1 })), 0);
      fx.drops.update(Object.keys(DROPS).map((kind, i) => ({ id: -1 - i, kind, x: at.x, z: at.z })), 0);
      const white = new THREE.Mesh(GEO.box, mat('#ffffff')); white.position.copy(at); scene.add(white); tmp.push(white);
      // un compañero con espada (su etiqueta, su arma y su espada)
      const mate = voxelAvatar({}, 'HUB', SEAT_COLORS[1]); mate.userData.armR.add(avatarSword()); mate.position.copy(at); scene.add(mate); tmp.push(mate);
      fx.slashes.warm(); fx.beams.warm(); fx.tech.warm(); fx.zones.warm(); vm.trail.warm();
      const shown = vm.weapons.map((w) => w.group.visible);
      vm.weapons.forEach((w) => { w.group.visible = true; });
      const rootVis = vm.root.visible;
      vm.root.visible = true;
      muzzle.visible = true;
      renderer.compile(scene, camera);
      renderer.compile(vmScene, vmCam);
      vm.weapons.forEach((w, i) => { w.group.visible = shown[i]; });
      vm.root.visible = rootVis;
    } catch (e) { console.warn('Zombies: no se pudo precalentar', e); }
    for (const o of tmp) scene.remove(o);
    muzzle.visible = false;
    fx.particles.p.length = 0; fx.particles.update(0);
    fx.tracers.list.length = 0; fx.tracers.update(0);
    fx.rings.update(99);
    fx.proj.update([], 0); fx.drops.update([], 0);
    fx.slashes.reset(); fx.beams.update(99); fx.tech.unwarm(); fx.zones.clear(); vm.trail.clear();
  }

  function drawHud(dt, P, eye, eyeSeat, scr) {
    for (let i = popups.length - 1; i >= 0; i--) { popups[i].t -= dt * 0.9; if (popups[i].t <= 0) popups.splice(i, 1); }
    for (let i = feed.length - 1; i >= 0; i--) { feed[i].t -= dt; if (feed[i].t <= 0) feed.splice(i, 1); }
    // menú principal y fin: sin HUD (se oculta el lienzo; así tampoco queda "pegado" bajo el desenfoque)
    const hideHud = scr === 'main' || scr === 'over';
    const vis = hideHud ? 'hidden' : 'visible';
    if (hudCanvas.style.visibility !== vis) hudCanvas.style.visibility = vis;
    if (hideHud) { hud.buttons = []; return; }
    const phase = latestPhase();
    const team = [];
    const src = isHost && Sim ? Sim.players : latest ? sim.unpackPlayers(latest) : [];
    for (let i = 0; i < 4; i++) {
      const p = src[i];
      if (!p || !room.seats[i]) continue;
      const pos = i === mySeat ? me : (viewPlayers[i] || p);
      team.push({ seat: i, name: nameOfSeat(i), color: SEAT_COLORS[i], hp: Math.max(0, Math.ceil(p.hp)), alive: p.alive, down: p.down, downT: p.downT, me: i === mySeat, host: room.host === room.seats[i], x: pos.x, y: pos.y, a: pos.a });
    }
    // ¿hay un compañero caído cerca?
    let revivePrompt = null;
    if (mySeat >= 0 && me.alive) {
      for (const t of team) if (t.down && !t.me && Math.hypot(t.x - me.x, t.y - me.y) < 1.4) { const p = src[t.seat]; revivePrompt = { name: t.name, k: p.revive || 0 }; }
    }
    const watched = mySeat < 0 ? src[eyeSeat] : null;
    const st = {
      view: mySeat >= 0 ? 'play' : 'watch', time, phase, pt: isHost && Sim ? Sim.pt : latest?.pt || 0, wave: isHost && Sim ? Sim.wave : latest?.w || 0,
      left: isHost && Sim ? sim.remaining(Sim) : latest?.left || 0, bossWave: isBossWave(isHost && Sim ? Sim.wave : latest?.w || 0),
      boss: viewBoss, me: mySeat >= 0 ? (P ? { ...P, hp: P.hp } : { hp: 100, armor: 0, alive: true, pts: 500, owned: L.owned, dmgLvl: 0 }) : null,
      watchPts: watched?.pts, loadout: mySeat >= 0 ? L : null, team, level, zombies: viewZombies.filter((z) => z.st !== 'dead'),
      hurt, hurtDir, hitT, hitKill, hitHead, spread: Math.min(1, recoil * 0.5 + (me.mv ? 0.25 : 0)), popups, feed,
      menu: !!scr, shopOpen, ready, cross: { style: opts.cross, color: opts.crossColor }, showMinimap: opts.minimap,
      canRestart: mySeat >= 0, lowHp: P && P.alive && P.hp < 30, prot: P?.prot > 0, revivePrompt, quality, fps, solo: room.seats.filter(Boolean).length <= 1,
      watching: mySeat < 0 ? nameOfSeat(eyeSeat) : null, joinable: mySeat < 0 && room.seats.filter(Boolean).length < 4 && !!ctx.sit,
      touch: touch ? { sx: touch.sx, sy: touch.sy } : null,
      arms: mySeat >= 0 ? armsHud(P) : null, crossGap: crossGap(), killFeed, dmgNums: projectDmg(), techFx, wheel: mySeat >= 0 ? L.wheel : null,
    };
    const dpr = window.devicePixelRatio || 1;
    hg.setTransform(dpr, 0, 0, dpr, 0, 0);
    hud.draw(hg, cssW, cssH, st);
    for (const b of hud.buttons) { b.x *= dpr; b.y *= dpr; b.w *= dpr; b.h *= dpr; }
    // texto bajo el juego
    const s = phase === 'over' ? 'Fin de la partida' : phase === 'break' ? `Descanso · horda ${st.wave + 1} en ${Math.ceil(st.pt)} s` : phase === 'fight' ? `Horda ${st.wave} · quedan ${st.left}` : 'Prepárate…';
    if (s !== lastStatus) { lastStatus = s; ctx.status(`${mySeat < 0 ? '👀 ' : ''}${s}`); }
  }

  // Datos del "dashboard" de armas para el HUD
  function armsHud(P) {
    const W = WEAPONS[L.cur];
    const hasSword = L.owned.some((o, i) => o && isSword(i));
    const energy = P?.energy || 0, tcd = P?.tcd || 0;
    return {
      cur: L.cur, owned: L.owned, mag: L.mag, res: L.res, reloadT: L.reloadT, ads: L.adsK, scope: W.scope ? L.adsK : 0, zoom: W.zoom,
      charge: L.charge >= 0 ? L.charge / HEAVY.charge : 0, combo: L.comboT > 0 ? L.combo : 0, energy, energyMax: ENERGY_MAX, tcd,
      techReady: hasSword && energy >= ENERGY_MAX && !(tcd > 0), hasSword, sword: W.kind === 'sword', bashCd: L.bashCd / BASH.every, lastTech: L.lastTech, bar: L.barT || 0, heavy: L.swing?.kind === 'heavy' || L.charge >= HEAVY.charge,
    };
  }
  // separación de la mira en px del HUD: la dispersión real proyectada en pantalla
  function crossGap() {
    const sp = curSpread();
    const focal = (cssH / 2) / Math.tan((camera.fov * Math.PI) / 360);
    return 3 + (sp * focal) / (hud.k || 1);
  }
  function addDmgNum(e) {
    const W = WEAPONS[e.w];
    const T = W?.kind === 'sword' ? TECHNIQUES[W.tech] : null;
    const color = e.hd ? '#FFCC00' : T && e.d >= 100 ? T.color : T ? '#bff4ff' : e.w === 6 ? '#ffb03b' : '#ffffff';
    dmgNums.push({ x: e.x * S + (Math.random() - 0.5) * 0.3, y: (e.h || 1.2) + 0.35, z: e.y * S + (Math.random() - 0.5) * 0.3, text: String(e.d), color, big: !!e.hd || e.d >= 100, t: 1 });
    if (dmgNums.length > 28) dmgNums.shift();
  }
  const _pv = new THREE.Vector3();
  function projectDmg() {
    const k = hud.k || 1;
    for (const d of dmgNums) {
      _pv.set(d.x, d.y + (1 - d.t) * 0.3, d.z).project(camera);
      if (_pv.z > 1 || _pv.z < -1) { d.sx = null; continue; }
      d.sx = ((_pv.x + 1) / 2) * cssW / k; d.sy = ((1 - _pv.y) / 2) * cssH / k;
    }
    return dmgNums;
  }
  // piso en llamas (de la simulación del anfitrión o del último estado)
  function zoneView() {
    if (isHost && Sim) return Sim.zones.map((q) => ({ x: q.x * S, z: q.y * S, r: q.r * S, t: q.t }));
    return (latest?.Q || []).map((q) => ({ x: (q[1] / 100) * S, z: (q[2] / 100) * S, r: (q[3] / 100) * S, t: q[4] / 10 }));
  }

  // ---------- Pruebas automáticas (inofensivo en producción) ----------
  const debug = {
    state: () => ({ phase: latestPhase(), wave: isHost && Sim ? Sim.wave : latest?.w || 0, left: isHost && Sim ? sim.remaining(Sim) : latest?.left, hp: myState()?.hp, alive: myAlive(), kills: myState()?.kills || 0, score: myState()?.earned || 0, pts: myState()?.pts, zombies: (isHost && Sim ? Sim.zombies : viewZombies).filter((z) => z.st !== 'dead').length, boss: (isHost && Sim ? (Sim.bossId && BOSSES[Sim.zombies.find((z) => z.id === Sim.bossId)?.boss]?.name) : viewBoss?.name) || null, seat: mySeat, host: isHost, players: room.seats.filter(Boolean).length, fps, frames, menu, shopOpen, screen: uiScreen(), lobby: lobbyNow(), ready: !!level, quality, x: me.x, y: me.y, programs: renderer.info.programs?.length || 0, warmed, weapon: WEAPONS[L.cur].id, energy: myState()?.energy || 0 }),
    // jugar ya: arranca la sala (si hace falta) y suelta el menú
    play: () => { if (isHost && lobby) startMatch(false); entered = true; menu = false; fresh = false; },
    start: () => startMatch(false),
    screen: () => uiScreen(),
    lobby: () => lobbyNow(),
    opts: () => ({ ...opts, quality }),
    // adelanta la simulación (las pruebas en navegador sin GPU van a pocos cuadros por segundo)
    advance: (sec) => { for (let i = 0; i < sec * 60; i++) hostStep(1 / 60); return latestPhase(); },
    skipTo: (n) => { if (!isHost || !Sim) return false; Sim.zombies = []; Sim.roster = []; Sim.bossPending = 0; Sim.bossId = 0; sim.startWave(Sim, n); return true; },
    breakNow: () => { if (!isHost || !Sim) return false; Sim.zombies = []; Sim.roster = []; Sim.bossPending = 0; return true; },
    killAll: () => { if (!isHost || !Sim) return 0; let n = 0; for (const z of Sim.zombies) if (z.st !== 'dead' && z.kind !== 'boss') { sim.damageZombie(Sim, z, 1e6, mySeat, 0, false, 1); n++; } return n; },
    hurtBoss: (k = 0.5) => { const b = Sim?.zombies.find((z) => z.id === Sim.bossId); if (b) b.hp = Math.max(1, b.max * k); return !!b; },
    god: (v = true) => { if (Sim) Sim.god = v; },
    points: (n) => { const p = Sim?.players[mySeat]; if (p) { p.pts += n; p.earned += n; } },
    bossHere: (d = 4) => { const b = Sim?.zombies.find((z) => z.id === Sim.bossId); if (!b) return false; for (let k = d; k > 1; k -= 0.5) { const x = me.x + Math.cos(me.a) * k, y = me.y + Math.sin(me.a) * k; if (cellAt(level, x, y) === CELL.EMPTY) { b.x = x; b.y = y; b.st = 'walk'; return k; } } return false; },
    aimBoss: () => { const b = viewZombies.find((z) => z.kind === 'boss'); if (!b) return false; const d = Math.hypot(b.x - me.x, b.y - me.y); me.a = Math.atan2(b.y - me.y, b.x - me.x); me.p = Math.atan2(1.4 - EYE_H, d * S); return d; },
    aim: () => {
      let best = null, bd = 1e9;
      for (const z of viewZombies) { if (z.st === 'dead' || z.st === 'rise') continue; const d = Math.hypot(z.x - me.x, z.y - me.y); if (d < bd) { bd = d; best = z; } }
      if (!best) return false;
      me.a = Math.atan2(best.y - me.y, best.x - me.x);
      me.p = Math.atan2((best.kind === 'boss' ? 1.6 : 1.2) - EYE_H, bd * S);
      return bd;
    },
    face: (x, y) => { me.a = Math.atan2(y - me.y, x - me.x); me.p = 0; },
    look: (p) => { me.p = p; },
    shoot: () => { L.cd = 0; L.switchT = 0; L.burst = 0; L.reloadT = 0; if (WEAPONS[L.cur].kind === 'gun' && L.mag[L.cur] <= 0) L.mag[L.cur] = WEAPONS[L.cur].mag; tryFire(); return WEAPONS[L.cur].id; },
    give: (w) => { if (typeof w === 'string') w = WEAPONS.findIndex((x) => x.id === w); if (isHost && Sim?.players[mySeat]) Sim.players[mySeat].owned[w] = true; applyGrant({ weapon: w }); L.switchT = 0; return w; },
    arms: () => ({ cur: L.cur, id: WEAPONS[L.cur].id, owned: ownedList().map((i) => WEAPONS[i].id), mag: L.mag[L.cur], ads: L.adsK, combo: L.combo, swing: L.swing ? { kind: L.swing.kind, step: L.swing.step } : null, energy: myState()?.energy || 0, tcd: myState()?.tcd || 0, wheel: !!L.wheel }),
    energy: (n = ENERGY_MAX) => { const p = Sim?.players[mySeat]; if (p) { p.energy = n; p.tcd = 0; } return !!p; },
    // corte de espada: kind 'light' | 'heavy'; hit=true lo resuelve ya (sin esperar a que avance la animación)
    swing: (kind = 'light', hit = true) => { if (!curSword()) return false; L.swing = null; startSwing(kind); if (hit) { L.swing.t = L.swing.hitAt; L.swing.done = true; meleeSend(L.swing.kind, L.swing.step, L.cur, L.swing.sw); } return { step: L.swing.step, combo: L.combo }; },
    // congela el arma a media animación (para fotos): k de 0 a 1
    pose: (kind = 'light', step = 0, k = 0.4, slow = 0) => { if (!curSword()) return false; L.comboT = 1; L.combo = step; startSwing(kind); L.swing.step = step; L.swing.t = L.swing.dur * k; L.swing.done = k > 0.34; if (slow) fxScale = slow; else L.freeze = true; return true; },
    unfreeze: () => { L.freeze = false; fxScale = 1; },
    bash: () => { L.bashCd = 0; bash(); },
    tech: () => useTech(),
    fxScale: (v = 1) => { fxScale = v; },
    ads: (v = true) => { L.ads = v; L.adsK = v ? 1 : 0; },
    wheel: (v = true) => { if (v) openWheel(); else closeWheel(true); return !!L.wheel; },
    wheelPick: (i) => { if (L.wheel) L.wheel.sel = i; },
    mystery: (w = 4) => ui.mystery(w, false),
    // un zombi quieto frente a ti (d casillas, desviado ang radianes)
    zombieAt: (d = 1.3, ang = 0, kind = 'normal') => { if (!isHost || !Sim) return null; const x = me.x + Math.cos(me.a + ang) * d, y = me.y + Math.sin(me.a + ang) * d; if (cellAt(level, x, y) !== CELL.EMPTY) return null; const z = sim.spawnZombie(Sim, kind, { mode: 'rise', x, y }); z.st = 'walk'; z.t = 0; z.sp = 0.001; z.cd = 99; return z.id; },
    zombieHp: (id) => { const z = Sim?.zombies.find((q) => q.id === id); return z ? (z.st === 'dead' ? 0 : z.hp) : null; },
    shop: (v = true) => toggleShop(v),
    buy,
    ready: (v = true) => setReady(v),
    teleport: (x, y) => { me.x = x; me.y = y; },
    walk: (f, s, sec) => new Promise((res) => { const t0 = performance.now(); const tick = () => { sim.movePlayer(level, me, { f, s }, 1 / 60, viewZombies); if (performance.now() - t0 < sec * 1000) setTimeout(tick, 16); else res({ x: me.x, y: me.y }); }; tick(); }),
    quality: setQuality,
    die: () => { const p = Sim?.players[mySeat]; if (p) { Sim.god = false; p.prot = 0; p.hp = 1; p.armor = 0; } },
    level: () => level && { W: level.W, H: level.H, portals: level.portals.length, start: level.start },
  };
  window.__zombies = debug;

  return {
    destroy() {
      destroyed = true;
      loop?.stop();
      if (window.__zombies === debug) delete window.__zombies;
      if (document.pointerLockElement === canvas) document.exitPointerLock?.();
      // si me voy a medio juego, guardo mi puntuación
      const P = myState();
      if (!submitted && mySeat >= 0 && P?.earned > 0 && latestPhase() !== 'intro') { submitted = true; ctx.submitScore?.(P.earned, 'zombies'); }
      for (const c of cleanups) c();
      world?.dispose();
      menuScene?.dispose();
      scene.traverse((o) => { o.geometry?.dispose?.(); });
      renderer.dispose();
      renderer.forceContextLoss?.();
    },
  };
}
