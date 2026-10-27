// Rocola: estado compartido (del servidor) y el reproductor de YouTube escondido.
// Solo suena si estoy dentro de la zona de la rocola; todos oyen el mismo segundo
// (`ahora del servidor - startedAt`). El volumen y el silencio son de cada quien.
import { useSyncExternalStore } from 'react';
import { office } from './store.js';
import { jukeboxPlaying } from './jukeboxDraw.js';
import { jukeboxAt, jukeboxZone, parseVideoId, cleanTitle } from '@shared/jukebox.js';

const LS = 'jukebox:prefs';
function loadPrefs() {
  try { return { volume: 0.6, muted: false, duck: true, ...JSON.parse(localStorage.getItem(LS) || '{}') }; } catch { return { volume: 0.6, muted: false, duck: true }; }
}

// Estado que ve la interfaz (se reemplaza entero en cada cambio)
let S = {
  boxes: {}, // objectId -> { current, queue, skipVotes }
  here: null, // objectId de la rocola cuya zona estoy pisando
  hereName: '',
  listeners: [], // ids de quienes están en la zona (calculado en el cliente)
  playing: false, // de verdad suena en mi navegador
  blocked: false, // el navegador bloqueó el audio: hace falta un toque
  apiError: false, // no se pudo cargar YouTube
  ...loadPrefs(),
};
const subs = new Set();
function set(patch) {
  S = { ...S, ...patch };
  for (const f of subs) f();
}
const subscribe = (f) => { subs.add(f); return () => subs.delete(f); };
export function useJukebox(sel = (s) => s) {
  return useSyncExternalStore(subscribe, () => sel(S));
}
export const jukeboxState = () => S;

// ¿Estoy oyendo una rocola? (el mapa apaga la música ambiente)
export const jukeboxActive = () => !!(S.here && S.boxes[S.here]?.current);

let offset = 0; // reloj del servidor - reloj local
const serverNow = () => Date.now() + offset;
export const serverClock = serverNow;

function applyBox(m) {
  if (typeof m.now === 'number') offset = m.now - Date.now();
  const boxes = { ...S.boxes };
  if (m.current || m.queue?.length) boxes[m.objectId] = { current: m.current, queue: m.queue || [], skipVotes: m.skipVotes || [] };
  else delete boxes[m.objectId];
  jukeboxPlaying.clear();
  for (const [id, b] of Object.entries(boxes)) if (b.current) jukeboxPlaying.add(Number(id));
  set({ boxes });
}

// ---------- Acciones ----------
const emit = (ev, data) => new Promise((resolve) => {
  const s = office.socket;
  if (!s) return resolve({ error: 'Sin conexión' });
  s.timeout(6000).emit(ev, data, (err, r) => resolve(err ? { error: 'Sin respuesta del servidor' } : (r || {})));
});

// Título con oEmbed (si YouTube no responde se usa uno genérico)
async function fetchTitle(videoId) {
  try {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), 4000);
    const r = await fetch(`https://www.youtube.com/oembed?url=${encodeURIComponent(`https://www.youtube.com/watch?v=${videoId}`)}&format=json`, { signal: ctl.signal });
    clearTimeout(t);
    if (!r.ok) return null;
    const j = await r.json();
    return j?.title ? cleanTitle(j.author_name && !j.title.includes(j.author_name) ? `${j.title} · ${j.author_name}` : j.title) : null;
  } catch { return null; }
}

export async function addSong(objectId, input) {
  const videoId = parseVideoId(input);
  if (!videoId) return { error: 'Pega un enlace de YouTube válido' };
  const title = await fetchTitle(videoId);
  unlock();
  return emit('jukebox:add', { objectId, videoId, title });
}
export const voteSong = (objectId, songId) => office.socket?.emit('jukebox:vote', { objectId, songId });
export const removeSong = (objectId, songId) => office.socket?.emit('jukebox:remove', { objectId, songId });
export const skipSong = (objectId) => emit('jukebox:skip', { objectId });

export function setPrefs(p) {
  set(p);
  try { localStorage.setItem(LS, JSON.stringify({ volume: S.volume, muted: S.muted, duck: S.duck })); } catch { /* sin almacenamiento */ }
  applyVolume(true);
}

// ---------- Reproductor de YouTube ----------
let api = null; // Promise<YT>
function loadApi() {
  if (api) return api;
  api = new Promise((resolve, reject) => {
    if (window.YT?.Player) return resolve(window.YT);
    const prev = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => { prev?.(); resolve(window.YT); };
    const sc = document.createElement('script');
    sc.src = 'https://www.youtube.com/iframe_api';
    sc.async = true;
    sc.onerror = () => reject(new Error('yt'));
    document.head.appendChild(sc);
    setTimeout(() => reject(new Error('timeout')), 15000);
  });
  api.catch(() => { api = null; set({ apiError: true }); });
  return api;
}

let player = null; // YT.Player
let playerReady = null; // Promise
let host = null; // contenedor escondido
let loaded = null; // { objectId, videoId }
let vol = 0; // volumen actual (0..100) para el desvanecido
let fadeTimer = null;
let playStartedAt = 0; // cuándo pedí reproducir (para detectar bloqueo)
let reportedDuration = null;

export function mountHost(el) { host = el; }

function ensurePlayer(videoId, start) {
  if (playerReady) return playerReady;
  playerReady = loadApi().then((YT) => new Promise((resolve) => {
    // El iframe lo armamos nosotros para darle "referrerpolicy": la oficina manda
    // Referrer-Policy: same-origin y YouTube rechaza los reproductores sin origen.
    const ifr = document.createElement('iframe');
    ifr.id = 'jukebox-yt';
    ifr.title = 'Rocola';
    ifr.allow = 'autoplay; encrypted-media';
    ifr.referrerPolicy = 'strict-origin-when-cross-origin';
    const qs = new URLSearchParams({ enablejsapi: '1', autoplay: '1', controls: '0', disablekb: '1', playsinline: '1', rel: '0', start: String(Math.max(0, Math.floor(start))), origin: location.origin });
    ifr.src = `https://www.youtube.com/embed/${videoId}?${qs}`;
    (host || document.body).appendChild(ifr);
    player = new YT.Player(ifr, {
      events: {
        onReady: () => { player.setVolume(0); vol = 0; resolve(player); },
        onStateChange: onState,
        onError: (e) => {
          if (!loaded) return;
          office.socket?.emit('jukebox:error', { objectId: loaded.objectId, videoId: loaded.videoId, code: e.data });
          if ([100, 101, 150].includes(e.data)) office.toast({ title: '🎵 Esa canción no se puede reproducir aquí, sigue la siguiente', kind: 'error' });
        },
      },
    });
  }));
  playerReady.catch(() => { playerReady = null; });
  return playerReady;
}

function onState(e) {
  const YT = window.YT;
  if (!loaded || !YT) return;
  if (e.data === YT.PlayerState.PLAYING) {
    set({ playing: true, blocked: false });
    const d = player.getDuration?.();
    if (d > 0 && reportedDuration !== loaded.videoId) {
      reportedDuration = loaded.videoId;
      office.socket?.emit('jukebox:duration', { objectId: loaded.objectId, videoId: loaded.videoId, duration: d });
    }
  } else if (e.data === YT.PlayerState.ENDED) {
    set({ playing: false });
    office.socket?.emit('jukebox:ended', { objectId: loaded.objectId, videoId: loaded.videoId });
  } else if (e.data === YT.PlayerState.PAUSED && wanted()) {
    // Pausado sin que nadie lo pidiera: el navegador no dejó reproducir con sonido
    set({ playing: false, blocked: true });
  }
}

const expected = (c) => (serverNow() - c.startedAt) / 1000;
// Lo que debería sonar ahora mismo
function wanted() {
  const b = S.here && S.boxes[S.here];
  return b?.current ? { objectId: S.here, ...b.current } : null;
}

function targetVolume() {
  if (S.muted) return 0;
  let v = S.volume;
  if (S.duck && ducking()) v *= 0.35;
  return Math.round(v * 100);
}
// Alguien con micrófono abierto en mi conversación
function ducking() {
  const st = office.state;
  if (!st.me) return false;
  if (st.media?.mic && st.talkingWith.length) return true;
  return st.talkingWith.some((id) => st.users[id]?.online && st.users[id]?.mic);
}

function applyVolume(now = false) {
  if (!player?.setVolume) return;
  const target = wanted() && loaded ? targetVolume() : 0;
  if (now) { vol = target; player.setVolume(vol); return; }
  if (fadeTimer) return;
  fadeTimer = setInterval(() => {
    const t = wanted() && loaded ? targetVolume() : 0;
    if (Math.abs(vol - t) <= 4) vol = t; else vol += Math.sign(t - vol) * 4;
    player.setVolume?.(vol);
    if (vol === t) {
      clearInterval(fadeTimer); fadeTimer = null;
      if (t === 0 && !wanted() && loaded) { player.stopVideo?.(); loaded = null; set({ playing: false, blocked: false }); }
    }
  }, 60);
}

// Un toque del usuario: reproducir con sonido (lo pide el navegador)
export function unlock() {
  if (player?.playVideo && loaded) { player.playVideo(); set({ blocked: false }); playStartedAt = Date.now(); }
}

async function sync() {
  const w = wanted();
  if (!w) {
    if (loaded) applyVolume(); // se desvanece y luego se detiene
    return;
  }
  const at = expected(w);
  if (at < 0) return; // todavía no empieza (margen para que carguen todos)
  if (!loaded || loaded.videoId !== w.videoId || loaded.objectId !== w.objectId) {
    const first = !player;
    loaded = { objectId: w.objectId, videoId: w.videoId };
    playStartedAt = Date.now();
    try {
      const p = await ensurePlayer(w.videoId, at);
      if (!first) p.loadVideoById({ videoId: w.videoId, startSeconds: expected(w) });
      else if (Math.abs((p.getCurrentTime?.() || 0) - expected(w)) > 0.4) p.seekTo(expected(w), true);
      p.playVideo();
    } catch { loaded = null; return; }
    applyVolume();
    return;
  }
  if (!player?.getPlayerState) return;
  const YT = window.YT;
  const st = player.getPlayerState();
  // Sigue sin arrancar después de un rato: bloqueado por el navegador
  if (!S.playing && !S.blocked && Date.now() - playStartedAt > 4000 && st !== YT.PlayerState.PLAYING && st !== YT.PlayerState.BUFFERING) set({ blocked: true });
  if (st === YT.PlayerState.PLAYING) {
    const drift = player.getCurrentTime() - at;
    const dur = player.getDuration?.() || 0;
    if (Math.abs(drift) > 2 && (!dur || at < dur)) player.seekTo(at, true);
  }
  applyVolume();
}

// ---------- Ciclo: zona donde estoy, socket y reproductor ----------
let sockRef = null;
let loop = null;
const onStateMsg = (m) => applyBox(m);
function onConnect() {
  sockRef?.timeout(6000).emit('jukebox:sync', {}, (err, r) => {
    if (err || !r) return;
    if (typeof r.now === 'number') offset = r.now - Date.now();
    for (const id of Object.keys(S.boxes)) if (!r.all.some((b) => b.objectId === Number(id))) applyBox({ objectId: Number(id), queue: [] });
    for (const b of r.all) applyBox(b);
  });
}

function step() {
  const s = office.socket;
  if (s !== sockRef) {
    sockRef?.off('jukebox:state', onStateMsg);
    sockRef?.off('connect', onConnect);
    sockRef = s;
    if (s) { s.on('jukebox:state', onStateMsg); s.on('connect', onConnect); if (s.connected) onConnect(); }
  }
  const st = office.state;
  const f = st.floor;
  const me = st.me && office.players[st.me.id];
  const o = f && me && me.floorId === f.id ? jukeboxAt(f, me.x, me.y) : null;
  const here = o?.id ?? null;
  let listeners = S.listeners;
  if (o) {
    const ids = Object.entries(office.players).filter(([, p]) => p.floorId === f.id && p.online !== false && jukeboxAt(f, p.x, p.y)?.id === here).map(([id]) => Number(id));
    if (ids.join() !== S.listeners.join()) listeners = ids;
  } else if (S.listeners.length) listeners = [];
  if (here !== S.here || listeners !== S.listeners) {
    const name = o ? jukeboxZone(f, o).name : '';
    set({ here, hereName: name, listeners });
  }
  sync();
}

export function startJukebox() {
  if (loop) return () => {};
  loop = setInterval(step, 500);
  step();
  return () => { clearInterval(loop); loop = null; };
}
