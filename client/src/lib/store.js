import { setAvatarStyle } from './avatarV2.js';
import { trackRemoteMove } from './motion.js';
import { useSyncExternalStore, useCallback } from 'react';
import { io } from 'socket.io-client';
import { api } from './api.js';
import { MediaManager } from './media.js';
import { initStageClient } from './stage.js';
import { composeFloor, canTalk, talkSpace, areaAt, deskAt, nearestWalkable, PROXIMITY_RADIUS } from '@shared/map.js';
import { playSound } from './sounds.js';
import { applyBrand, setUserTheme, applyColorMode } from './themes.js';
import { FX, pickFx } from './fx.js';
import { CHAIR_TYPES, objSize } from '@shared/catalog.js';
import { EMOTES, PAIR_RANGE, EMOTE_VARIANTS, cleanVariant } from '@shared/emotes.js';
import { DANCES } from './emoteFx.js';
import { bindNotes } from './notes.js';
import { onAchievementNotification, forgetBadges } from './achievements.js';
import { initBadges, onBadgeNotification } from './badges.js';
import { initPetSocket } from './petFx.js';
import { initModeration, hideMessage } from './moderation.js'; // bloqueos, silencio, expulsión y reportes
import { acceptsPeer, closedApart } from './voiceGate.js'; // de quién se aceptan conexiones de voz

export const DEFAULT_PREFS = {
  v: 2,
  colorMode: 'light',
  skipWelcome: true,
  onboarding: { hide: false, seen: false },
  calendar: { weekDays: 7, firstDay: 0 },
  audio: { aiNoise: 'rnnoise', noiseSuppression: true, echoCancellation: true, autoGainControl: true, notifVolume: 0.6, muteOnHidden: false },
  video: { hd: false, hideSelf: false },
  screen: { quality: 'balanced', audio: true, volume: 1, autoOpen: false, clips: true, recordRoom: true },
  meetings: { maxTiles: 9 },
  notifications: { remind5: true, remindStart: true, remindSound: true, chat: 'dms', chatSound: 'dms', desktop: false },
  performance: { mode: 'balanced' },
  ambience: { dayNight: false, music: false, musicVolume: 0.5, steps: true, stepsVolume: 0.5 },
  devices: { micId: '', camId: '', speakerId: '' },
};

function mergePrefs(p = {}) {
  const out = { ...DEFAULT_PREFS, ...p };
  for (const k of Object.keys(DEFAULT_PREFS)) {
    if (typeof DEFAULT_PREFS[k] === 'object') out[k] = { ...DEFAULT_PREFS[k], ...(p[k] || {}) };
  }
  // v2: el mapa se ve claro (sin tinte de noche) y suenan los pasos
  if ((p.v || 0) < 2) { out.ambience = { ...out.ambience, dayNight: false, steps: true }; out.v = 2; }
  return out;
}

class Office {
  constructor() {
    this.listeners = new Set();
    this.state = this.initial();
    this.players = {}; // posiciones en vivo (no dispara renders)
    this.admitted = new Set(); // salas cerradas donde me dejaron pasar
    this.pendingDoor = null; // "Ir a su lado" hacia alguien en sala cerrada
    this.reactions = {}; // id -> { emoji, until }
    this.emotes = {}; // id -> { kind, start, until, target, variant } (bailar, saludar…)
    this.pendingEmote = null;
    this.fx = {}; // id -> efecto de Ctrl+D en curso
    this.floorCache = new Map();
  }

  initial() {
    return {
      ready: false,
      me: null,
      prefs: DEFAULT_PREFS,
      config: { officeName: 'Mi oficina', iceServers: [] },
      users: {},
      floors: [],
      characters: [],
      floor: null, // piso que estoy viendo (compuesto)
      presenceVersion: 0,
      view: 'map',
      conv: 'c:1',
      chat: { channels: [], dms: [] },
      notifications: [],
      events: [],
      eventsVersion: 0,
      media: { mic: false, cam: false, screen: false },
      peers: [],
      stage: null, // pantalla enfocada (id de quien comparte)
      watching: [], // pantallas que estoy viendo (máx. 4), como "Ver transmisión" en Discord
      stageOpen: false,
      stageLayout: 'focus', // 'focus' | 'grid'
      roomChat: [], // mensajes de la sala (no se guardan)
      roomChatOpen: false,
      roomUnread: 0,
      recording: false, // estoy grabando alguna transmisión (lo ve toda la sala)
      talkingWith: [],
      space: null,
      modal: null, // { type: 'prefs', section } | { type: 'profile' } | { type: 'invite' } ...
      profileCard: null,
      toasts: [],
      editMode: null, // null | 'decor' | 'build'
      editor: { tool: 'select', placing: null, selected: null, history: { undo: 0, redo: 0 }, areaTarget: null },
      connected: false,
      sidebarCollapsed: typeof window !== 'undefined' && window.matchMedia?.('(max-width: 680px)').matches,
      mobilePane: 'list', // en celular: lista o conversación abierta
    };
  }

  subscribe = (fn) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };

  set(patch) {
    this.state = { ...this.state, ...(typeof patch === 'function' ? patch(this.state) : patch) };
    for (const l of this.listeners) l();
  }

  // ---------- Arranque ----------
  async start(me, prefs) {
    this.set({ me, prefs: mergePrefs(prefs) });
    setUserTheme(me.uiTheme || null); // tema propio (si eligió uno)
    applyTheme(this.state.prefs.colorMode);
    const [config, ice, users, floors, chat, notifications] = await Promise.all([
      api.get('/config'), api.get('/ice'), api.get('/users'), api.get('/floors'), api.get('/chat'), api.get('/notifications'),
    ]);
    const byId = Object.fromEntries(users.users.map((u) => [u.id, u]));
    applyBrand(config);
    setAvatarStyle(config.avatarStyle);
    this.set({ config: { ...config, iceServers: ice.iceServers }, users: byId, floors: floors.floors, chat, notifications: notifications.notifications });
    this.loadCharacters();
    this.connect();
    this.timers = [
      setInterval(() => this.updateProximity(), 400),
      setInterval(() => this.checkReminders(), 30e3),
    ];
    this.loadEvents();
    this.onVisibility = () => this.handleVisibility();
    document.addEventListener('visibilitychange', this.onVisibility);
  }

  handleVisibility() {
    const hidden = document.visibilityState === 'hidden';
    this.socket?.emit('visibility', { hidden });
    clearTimeout(this.awayTimer);
    if (hidden) {
      const inRoom = this.state.space && this.state.space.startsWith('area:');
      if (this.state.prefs.audio.muteOnHidden && !inRoom && this.media) {
        this.media.setMic(false);
        this.media.setCam(false);
      }
      // Ausente automático tras 10 minutos sin ver la pestaña
      this.awayTimer = setTimeout(() => {
        const u = this.state.users[this.state.me.id];
        if (u?.status === 'active') { this.autoAway = true; this.setStatus('away'); }
      }, 10 * 60e3);
    } else if (this.autoAway) {
      this.autoAway = false;
      this.setStatus('active');
    }
  }

  stop() {
    this.timers?.forEach(clearInterval);
    if (this.onVisibility) document.removeEventListener('visibilitychange', this.onVisibility);
    clearTimeout(this.awayTimer);
    this.media?.destroy();
    this.socket?.disconnect();
    this.socket = null;
    this.media = null;
    this.players = {};
    this.floorCache.clear();
    this.state = this.initial();
    for (const l of this.listeners) l();
  }

  connect() {
    const s = io({ withCredentials: true });
    this.socket = s;
    initStageClient(this, s); // escenario: fila de manos levantadas
    initPetSocket(this, s); // mascotas interactivas
    initModeration(this, s); // moderación
    s.on('connect', () => {
      this.set({ connected: true });
      s.emit('visibility', { hidden: document.visibilityState === 'hidden' }); // para las notificaciones push
    });
    s.on('disconnect', () => this.set({ connected: false }));
    bindNotes(this, s); // 📝 Tomar notas (resumen de reuniones con IA)
    s.on('force-reload', ({ by, message, in: secs = 8 } = {}) => {
      this.toast({ title: `🔄 ${by || 'Un admin'} publicó una actualización${message ? `: ${message}` : ''}. Se recarga en ${secs} s…`, action: { label: 'Ahora', run: () => this.hardReload() }, duration: secs * 1000 });
      clearTimeout(this.reloadTimer);
      this.reloadTimer = setTimeout(() => this.hardReload(), secs * 1000);
    });
    s.on('connect_error', (e) => {
      if (e.message === 'unauthorized') window.location.reload();
    });
    s.on('hello', async ({ you, players, version }) => {
      // Si el servidor ya tiene una versión nueva, se avisa (se reconectó tras una actualización)
      if (version && this.appVersion && version !== this.appVersion && !this.updateNotified) {
        this.updateNotified = true;
        this.toast({ title: '✨ Hay una versión nueva de la oficina', action: { label: 'Actualizar', run: () => this.hardReload() }, duration: 60e3 });
      }
      if (version) this.appVersion = this.appVersion || version;
      this.lastWatchKey = null;
      this.players = {};
      for (const [id, p] of Object.entries(players)) this.players[id] = { ...p, rx: p.x, ry: p.y };
      if (!this.media) {
        // LiveKit se carga solo si la oficina lo tiene configurado
        const LiveKitManager = this.state.config.livekitUrl ? (await import('./livekit.js')).LiveKitManager : null;
        this.media = LiveKitManager
          ? new LiveKitManager({ myId: you, socket: s, getToken: () => api.get('/livekit/token') })
          : new MediaManager({ socket: s, myId: you, iceServers: this.state.config.iceServers });
        this.media.canAccept = (id) => acceptsPeer(this, id);
        this.applyMediaPrefs();
        this.media.addEventListener('local', (e) => {
          const { viewers, ...state } = e.detail;
          this.set({ media: e.detail });
          s.emit('state', state);
          this.syncStreams();
        });
        this.media.addEventListener('peers', (e) => this.set({ peers: e.detail }));
      } else {
        // reconexión: volver a anunciar estado de medios (y si estoy grabando)
        s.emit('state', { ...this.media.state, recording: this.state.recording });
      }
      this.syncTimezone();
      // Fusionar presencia con la lista de usuarios
      this.set((st) => {
        const users = {};
        for (const [id, u] of Object.entries(st.users)) users[id] = { ...u, online: false, ...(players[id] || {}) };
        return { users };
      });
      const mine = this.players[you];
      await this.showFloor(mine.floorId);
      this.set({ ready: true, presenceVersion: this.state.presenceVersion + 1 });
    });
    s.on('player', (p) => {
      const prev = this.players[p.id];
      if (!p.online) delete this.players[p.id];
      else this.players[p.id] = { ...prev, ...p, rx: prev && prev.floorId === p.floorId ? prev.rx : p.x, ry: prev && prev.floorId === p.floorId ? prev.ry : p.y };
      if (this.state.users[p.id]) {
        const wasLive = this.state.users[p.id].online && this.state.users[p.id].screen;
        this.set((st) => ({ users: { ...st.users, [p.id]: { ...st.users[p.id], ...p } }, presenceVersion: st.presenceVersion + 1 }));
        if (!wasLive && p.screen && p.online && p.id !== this.state.me.id) this.onGoLive(p.id);
      }
      this.syncStreams();
      if (p.id === this.state.me.id && p.online && p.floorId !== this.state.floor?.id) this.showFloor(p.floorId);
    });
    s.on('move', (m) => {
      const p = this.players[m.id];
      if (!p) return;
      const floorChanged = p.floorId !== m.floorId;
      Object.assign(p, { x: m.x, y: m.y, dir: m.dir, floorId: m.floorId });
      if (m.tp || floorChanged) { p.rx = m.x; p.ry = m.y; }
      trackRemoteMove(p, m.tp || floorChanged);
      delete this.emotes[m.id]; // al moverse se corta la acción
      if (floorChanged) this.set((st) => ({ presenceVersion: st.presenceVersion + 1 }));
    });
    s.on('call:answer', ({ from, accept }) => {
      if (accept) this.media?.allowPeer?.(from);
      const who = this.state.users[from]?.displayName || 'La persona';
      this.toast({ title: accept ? `✅ ${who} va en camino` : `${who} no puede ahora`, ...(accept ? {} : { action: { label: 'Mensaje', run: () => this.openConv(`d:${from}`) } }) });
    });
    s.on('room:knock', ({ from, areaId }) => {
      const who = this.state.users[from]?.displayName || 'Alguien';
      playSound('wave', this.state.prefs.audio.notifVolume);
      this.toast({
        title: `🚪 ${who} está tocando la puerta`,
        action: { label: 'Dejar pasar', run: () => { s.emit('room:admit', { areaId, userId: from }); this.toast({ title: `Dejaste pasar a ${who}` }); } },
        actions: [{ label: 'Abrir sala', run: () => this.setRoomClosed(areaId, false) }],
        duration: 20000,
      });
    });
    s.on('room:admitted', ({ areaId, by }) => {
      this.admitted.add(areaId);
      const who = this.state.users[by]?.displayName || 'Alguien';
      this.toast({ title: `🚪 ${who} te dejó pasar` });
      const d = this.pendingDoor;
      if (d?.areaId === areaId) {
        this.pendingDoor = null;
        this.set({ view: 'map' });
        this.pathTarget = d.target;
        this.set((st) => ({ presenceVersion: st.presenceVersion + 1 }));
      }
    });
    s.on('room-state', ({ areaId, closed, by }) => {
      const f = this.state.floor;
      const a = f?.areas.find((x) => x.id === areaId);
      const me = this.myPlayer;
      if (!a || !me || by === this.state.me.id) return;
      if (areaAt(f, me.x, me.y)?.id === areaId) {
        const who = this.state.users[by]?.displayName || 'Alguien';
        this.toast({ title: closed ? `🔒 ${who} cerró la sala: ahora solo se oye dentro` : `🔓 ${who} abrió la sala` });
      }
    });
    s.on('room-state', ({ areaId, closed, by, auto }) => {
      if (!auto || by !== this.state.me.id || !closed) return;
      const a = this.state.floor?.areas.find((x) => x.id === areaId);
      this.toast({ title: `🔒 Entraste a ${a?.name || 'un 1:1'}: la puerta se cerró sola y solo se oye dentro`, action: { label: 'Abrir', run: () => this.setRoomClosed(areaId, false) } });
    });
    s.on('fx', ({ id, kind, from, to }) => {
      if (FX[kind]) this.fx[id] = { kind, from, to, start: performance.now(), dur: FX[kind].dur };
    });
    s.on('emote', ({ id, kind, target, variant }) => this.startEmote(id, kind, target, variant));
    s.on('react', ({ id, emoji }) => {
      this.reactions[id] = { emoji, until: performance.now() + 3500 };
    });
    s.on('user', (u) => {
      const prev = this.state.users[u.id];
      this.set((st) => ({ users: { ...st.users, [u.id]: { ...prev, ...u } } }));
      if (u.id === this.state.me.id) this.set({ me: { ...this.state.me, ...u } });
    });
    s.on('floors', ({ floors }) => {
      this.set({ floors });
      if (!floors.some((f) => f.id === this.state.floor?.id)) this.showFloor(floors[0]?.id);
    });
    s.on('floor', (payload) => {
      if (this.floorCache.has(payload.id) || this.state.floor?.id === payload.id) {
        const f = buildFloor(payload);
        this.floorCache.set(payload.id, f);
        if (this.state.floor?.id === payload.id) {
          for (const id of this.admitted) if (!f.areas.find((a) => a.id === id)?.closed) this.admitted.delete(id);
          this.set({ floor: f });
          this.updateProximity();
        }
      }
    });
    s.on('clip', ({ from }) => {
      const who = this.state.users[from]?.displayName || 'Alguien';
      this.toast({ title: `🎬 ${who} guardó un clip de tu pantalla` });
    });
    s.on('message', (m) => this.onMessage(m));
    s.on('reaction', (r) => this.dispatch('reaction', r));
    s.on('feedback', () => this.dispatch('feedback'));
    s.on('room-msg', (m) => this.onRoomMsg(m));
    s.on('channels', () => this.refreshChat());
    s.on('characters', () => this.loadCharacters());
    s.on('ui-theme', ({ theme }) => { setUserTheme(theme); this.set((st) => ({ me: { ...st.me, uiTheme: theme } })); });
    s.on('office', (c) => {
      applyBrand(c);
      if (c.avatarStyle) setAvatarStyle(c.avatarStyle);
      this.set((st) => ({ config: { ...st.config, ...c } }));
    });
    s.on('events', () => this.loadEvents());
    s.on('notice', (n) => {
      if (n.authorId === this.state.me.id) return;
      const who = this.state.users[n.authorId]?.displayName || 'Alguien';
      this.toast({ title: `📌 ${who}: ${n.text.length > 80 ? `${n.text.slice(0, 80)}…` : n.text}`, action: { label: 'Ver', run: () => this.set({ modal: { type: 'notices' } }) } });
    });
    s.on('notification', (n) => {
      this.set((st) => ({ notifications: [n, ...st.notifications] }));
      const actor = this.state.users[n.actorId];
      if (n.type === 'call') {
        this.ring(n.actorId);
        this.desktopNotify(`📞 ${actor?.displayName || 'Alguien'} te está llamando`);
      } else if (n.type === 'wave') {
        this.toast({ title: `👋 ${actor?.displayName || 'Alguien'} te saludó`, action: { label: 'Ir', run: () => this.goTo(n.actorId) } });
        playSound('wave', this.state.prefs.audio.notifVolume);
        this.desktopNotify(`${actor?.displayName} te saludó 👋`);
      } else if (n.type === 'event') {
        this.toast({ title: `📅 ${actor?.displayName || 'Alguien'} te invitó a "${n.data.title}"` });
      } else if (n.type === 'birthday') {
        this.toast({ title: `🎂 ${actor?.displayName || 'Alguien'}: ${n.data.text || '¡Feliz cumpleaños!'}`, action: { label: 'Ver', run: () => this.set({ modal: { type: 'birthdays' } }) }, duration: 9000 });
        playSound('wave', this.state.prefs.audio.notifVolume);
      } else if (n.type === 'achievement') onAchievementNotification(this, n);
      else if (n.type === 'badge') onBadgeNotification(this, n); // placas
      else if (n.type === 'hotel_gift') this.toast({ title: n.data.text || '🎁 Te regalaron un furni', action: { label: 'Ver', run: () => this.set({ view: 'hotel' }) }, duration: 9000 }); // Hotel
      else if (n.type === 'santa') {
        this.toast({ title: n.data.text || '🎁 Amigo secreto', action: { label: 'Ver', run: () => this.set({ modal: { type: 'santa' } }) }, duration: 9000 });
        playSound('wave', this.state.prefs.audio.notifVolume);
      }
    });
    s.on('achievement', (m) => forgetBadges(m.userId));
    initBadges(this, s); // placas y "en vivo" (lib/badges.js)
  }

  applyMediaPrefs() {
    const { audio, video, devices, screen } = this.state.prefs;
    this.media?.updateSettings({
      aiNoise: audio.aiNoise, noiseSuppression: audio.noiseSuppression, echoCancellation: audio.echoCancellation, autoGainControl: audio.autoGainControl,
      hd: video.hd, micId: devices.micId, camId: devices.camId, speakerId: devices.speakerId,
      screenQuality: screen.quality, screenAudio: screen.audio, screenVolume: screen.volume,
    });
  }

  // ---------- Pisos ----------
  async showFloor(id) {
    if (!id) return;
    let f = this.floorCache.get(id);
    if (!f) {
      const { floor } = await api.get(`/floors/${id}`);
      f = buildFloor(floor);
      this.floorCache.set(id, f);
    }
    this.set({ floor: f });
  }

  get myPlayer() {
    return this.players[this.state.me?.id];
  }

  moveMe(x, y, dir, opts = {}) {
    const p = this.myPlayer;
    if (!p) return;
    const floorId = opts.floorId ?? p.floorId;
    Object.assign(p, { x, y, dir, floorId });
    if (opts.tp) { p.rx = x; p.ry = y; }
    this.socket.emit('move', { x, y, dir, floorId, tp: !!opts.tp });
    delete this.emotes[this.state.me.id];
    // Ibas a chocar los cinco o abrazar a alguien: al llegar a su lado se hace
    const pe = this.pendingEmote;
    if (pe) {
      const q = this.players[pe.target];
      if (!q?.online && q?.online !== undefined) this.pendingEmote = null;
      else if (q && q.floorId === floorId && Math.max(Math.abs(q.x - x), Math.abs(q.y - y)) <= 1) {
        this.pendingEmote = null;
        setTimeout(() => this.emote(pe.kind, pe.target), 150);
      }
    }
  }

  // ---------- Acciones del personaje ----------
  startEmote(id, kind, target, variant) {
    const def = EMOTES[kind];
    if (!def) return;
    const now = performance.now();
    this.emotes[id] = { kind, target, start: now, until: now + def.dur, variant: cleanVariant(variant) };
    if (def.pair && target != null) {
      this.emotes[target] = { kind, target: id, start: now, until: now + def.dur };
      if (target === this.state.me.id) {
        const who = this.state.users[id]?.displayName?.split(' ')[0] || 'Alguien';
        this.toast({ title: kind === 'hug' ? `🤗 ${who} te dio un abrazo` : `🙌 ${who} chocó los cinco contigo`, action: { label: kind === 'hug' ? 'Devolver' : 'Otra vez', run: () => this.emote(kind, id) } });
        playSound('wave', this.state.prefs.audio.notifVolume);
      }
    }
  }

  emote(kind, target) {
    const def = EMOTES[kind];
    const me = this.myPlayer;
    if (!def || !me || !this.socket) return;
    if (def.pair) {
      const q = this.players[target];
      if (!q || !this.state.users[target]?.online) return this.toast({ title: 'Esa persona no está conectada' });
      const far = q.floorId !== me.floorId || Math.max(Math.abs(q.x - me.x), Math.abs(q.y - me.y)) > PAIR_RANGE;
      if (far) {
        // Primero ir a su lado; al llegar se hace la acción
        this.pendingEmote = { kind, target };
        this.goTo(target);
        return;
      }
    }
    // Variante al azar (p. ej. qué baile): viaja con la acción para que todos vean la misma
    const prev = this.emotes[this.state.me.id]?.variant;
    let variant = Math.floor(Math.random() * EMOTE_VARIANTS);
    if (kind === 'dance' && prev != null && variant % DANCES.length === prev % DANCES.length) variant = (variant + 1) % EMOTE_VARIANTS;
    this.socket.emit('emote', { kind, target: def.pair ? target : undefined, variant });
    this.startEmote(this.state.me.id, kind, def.pair ? target : undefined, variant);
  }

  async changeFloor(floorId, target) {
    await this.showFloor(floorId);
    const f = this.state.floor;
    const pos = target || f.spawn;
    const dest = nearestWalkable(f, pos.x, pos.y);
    this.moveMe(dest.x, dest.y, 'down', { tp: true, floorId });
    this.set((st) => ({ presenceVersion: st.presenceVersion + 1 }));
  }

  // Tu hora local se toma de tu dispositivo (Chile, Argentina, Nueva York, Europa…) salvo que la elijas a mano
  syncTimezone() {
    try {
      if (localStorage.getItem('nuvora:tzManual')) return;
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
      if (tz && tz !== this.state.me?.timezone) api.patch('/me', { timezone: tz }).catch(() => {});
    } catch { /* sin almacenamiento */ }
  }

  // ---------- Llamadas ----------
  async callUser(id) {
    const r = await api.post(`/call/${id}`);
    const who = this.state.users[id]?.displayName || 'la persona';
    this.toast({ title: r.online ? `📞 Llamando a ${who}…` : `${who} no está conectado; le llegará el aviso` });
  }

  ring(from) {
    clearInterval(this.ringTimer);
    this.set({ incomingCall: { from, at: Date.now() } });
    let n = 0;
    const tone = () => { playSound('wave', Math.max(0.4, this.state.prefs.audio.notifVolume)); if (++n > 12 || !this.state.incomingCall) clearInterval(this.ringTimer); };
    tone();
    this.ringTimer = setInterval(tone, 2200);
    clearTimeout(this.ringEnd);
    this.ringEnd = setTimeout(() => {
      if (this.state.incomingCall?.from === from) {
        this.set({ incomingCall: null });
        this.toast({ title: `Llamada perdida de ${this.state.users[from]?.displayName || 'alguien'}`, action: { label: 'Ir', run: () => this.goTo(from) } });
      }
    }, 30e3);
  }

  answerCall(accept) {
    const c = this.state.incomingCall;
    if (!c) return;
    clearInterval(this.ringTimer);
    clearTimeout(this.ringEnd);
    this.set({ incomingCall: null });
    api.post(`/call/${c.from}/answer`, { accept }).catch(() => {});
    if (accept) this.media?.allowPeer?.(c.from);
    if (accept) this.goTo(c.from);
  }

  // Volumen de cada persona (se recuerda en este dispositivo)
  peerVolume(id) {
    try { return JSON.parse(localStorage.getItem('nuvora:vol') || '{}')[id] ?? 1; } catch { return 1; }
  }

  setPeerVolume(id, v) {
    try { const m = JSON.parse(localStorage.getItem('nuvora:vol') || '{}'); m[id] = v; localStorage.setItem('nuvora:vol', JSON.stringify(m)); } catch { /* sin almacenamiento */ }
    this.media?.setPeerVolume?.(id, v);
  }

  // ---------- Salas cerradas ----------
  setRoomClosed(areaId, closed) { this.socket?.emit('room:close', { areaId, closed }); }

  knockPrompt(area) {
    const t = performance.now();
    if (this.lastKnockPrompt && t - this.lastKnockPrompt < 4000) return;
    this.lastKnockPrompt = t;
    // Venías con "Ir a su lado": se toca la puerta sola y esperas a que te dejen pasar
    if (this.pendingDoor?.areaId === area.id) {
      this.socket?.emit('room:knock', { areaId: area.id });
      this.toast({ title: `🚪 Tocaste la puerta de ${area.name}. Espera a que te dejen pasar`, duration: 8000 });
      return;
    }
    this.toast({ title: `🔒 ${area.name} está cerrada`, action: { label: 'Tocar la puerta', run: () => { this.socket?.emit('room:knock', { areaId: area.id }); this.toast({ title: 'Tocaste la puerta 🚪' }); } } });
  }

  // Ctrl+D: regresar a tu escritorio (rápido, y a veces con un efecto especial)
  goHome() {
    const f = this.state.floor;
    const me = this.myPlayer;
    if (!f || !me) return;
    const myId = this.state.me.id;
    const deskId = Object.entries(f.claims).find(([, uid]) => uid === myId)?.[0];
    const desk = deskId && f.desks.find((d) => d.id === Number(deskId));
    if (!desk) {
      this.toast({ title: 'Aún no tienes escritorio en este piso. Pasa el mouse sobre uno libre y dale "Reclamar".' });
      return;
    }
    const cur = this.fx[myId];
    if (cur && performance.now() - cur.start < cur.dur) return;
    const z = desk.zone;
    const chair = f.objects.find((o) => CHAIR_TYPES.includes(o.type) && o.deskId == null && o.x >= z.x && o.y >= z.y && o.x < z.x + z.w && o.y < z.y + z.h);
    const { w, h } = objSize(desk.object);
    const want = chair ? { x: chair.x, y: chair.y } : { x: desk.object.x + Math.floor(w / 2), y: desk.object.y + h };
    const to = nearestWalkable(f, want.x, want.y);
    if (to.x === me.x && to.y === me.y) { this.toast({ title: 'Ya estás en tu escritorio 🪑' }); return; }
    const kind = pickFx();
    const from = { x: me.x, y: me.y };
    this.fx[myId] = { kind, from, to, start: performance.now(), dur: FX[kind].dur };
    this.socket.emit('fx', { kind, from, to });
    this.moveMe(to.x, to.y, 'up', { tp: true });
    this.set((st) => ({ presenceVersion: st.presenceVersion + 1 }));
  }

  // Ir hacia una persona (camina si está en el mismo piso)
  async goTo(userId) {
    const target = this.players[userId];
    this.set({ view: 'map', profileCard: null });
    if (!target) return this.toast({ title: 'Esa persona no está conectada' });
    if (target.floorId == null) return this.toast({ title: 'Esa persona está en un piso al que no tienes acceso' });
    const me = this.myPlayer;
    if (target.floorId !== me.floorId) {
      await this.changeFloor(target.floorId, { x: target.x, y: target.y + 1 });
      return;
    }
    this.pathTarget = { x: target.x, y: target.y + 1, near: true };
    // Si está en una sala cerrada te deja en la puerta y la toca por ti
    const f = this.state.floor;
    const room = f && areaAt(f, target.x, target.y);
    const myRoom = f && areaAt(f, me.x, me.y);
    this.pendingDoor = room?.closed && myRoom?.id !== room.id && !this.admitted.has(room.id) ? { areaId: room.id, target: this.pathTarget } : null;
    this.set((st) => ({ presenceVersion: st.presenceVersion + 1 }));
  }

  goToDesk(desk) {
    this.set({ view: 'map' });
    const z = desk.zone;
    this.pathTarget = { x: z.x + Math.floor(z.w / 2), y: z.y + z.h - 1 };
  }

  // ---------- Proximidad ----------
  updateProximity() {
    const f = this.state.floor;
    const me = this.myPlayer;
    if (!f || !me || !this.media) return;
    // En el Hotel no se oye la oficina: se oye a quien está cerca en tu sala del Hotel (client/src/hotel/voice.js).
    // Al volver, la oficina se reconecta sola y cada quien regresa a su volumen.
    if (this.state.view === 'hotel') {
      const v = this.hotelVoice?.() || { ids: [], warm: [], vol: {} };
      this.media.setPeers(v.ids, v.warm);
      this.hotelVols = this.hotelVols || new Set();
      for (const id of v.ids) { this.hotelVols.add(id); this.media.setPeerVolume?.(id, this.peerVolume(id) * (v.vol[id] ?? 1)); }
      const prev = this.state.talkingWith;
      if (prev.length !== v.ids.length || prev.some((x, i) => x !== v.ids[i])) this.set({ talkingWith: v.ids });
      return;
    }
    if (this.hotelVols) { for (const id of this.hotelVols) this.media.setPeerVolume?.(id, this.peerVolume(id)); this.hotelVols = null; }
    const space = talkSpace(f, me.x, me.y);
    const ids = [];
    for (const [id, p] of Object.entries(this.players)) {
      if (Number(id) === this.state.me.id) continue;
      if (canTalk(f, me, p)) ids.push(Number(id));
    }
    ids.sort((a, b) => a - b);
    // Conexión preparada con quien está cerca (hasta 12): al acercarse la voz suena al instante
    const near = [];
    for (const [id, p] of Object.entries(this.players)) {
      const n = Number(id);
      if (n === this.state.me.id || ids.includes(n) || p.floorId !== me.floorId || !this.state.users[n]?.online || closedApart(f, me, p)) continue;
      const d = Math.max(Math.abs(p.x - me.x), Math.abs(p.y - me.y));
      if (d <= PROXIMITY_RADIUS + 7) near.push([d, n]);
    }
    near.sort((a, b) => a[0] - b[0]);
    this.media.setPeers(ids, near.slice(0, 12).map(([, n]) => n));
    this.syncStreams(ids);
    if (this.pendingWatch && ids.includes(this.pendingWatch)) { const w = this.pendingWatch; this.pendingWatch = null; this.watch(w); }
    const prev = this.state.talkingWith;
    if (prev.length !== ids.length || prev.some((v, i) => v !== ids[i]) || space !== this.state.space) {
      this.set({ talkingWith: ids, space });
    }
  }

  // ---------- Chat de la sala ----------
  bubbles = {}; // id -> { text, until } globito sobre el personaje

  onRoomMsg(m) {
    this.bubbles[m.from] = { text: m.text.length > 60 ? `${m.text.slice(0, 58)}…` : m.text, until: performance.now() + 6000 };
    const mine = m.from === this.state.me.id;
    this.set((st) => ({
      roomChat: [...st.roomChat, m].slice(-80),
      roomUnread: st.roomChatOpen || mine ? 0 : st.roomUnread + 1,
    }));
    if (!mine && !this.state.roomChatOpen && this.state.prefs.notifications.chatSound !== 'none') playSound('message', this.state.prefs.audio.notifVolume * 0.6);
  }

  sendRoomMsg(text) {
    const t = String(text || '').trim();
    if (t) this.socket?.emit('room-msg', { text: t });
  }

  // ---------- Transmisiones (pantallas compartidas) ----------
  watch(id) {
    this.set((st) => {
      const watching = st.watching.includes(id) ? st.watching : [...st.watching, id].slice(-4);
      return { watching, stage: id, stageOpen: true };
    });
    this.syncStreams();
  }

  unwatch(id) {
    this.set((st) => {
      const watching = st.watching.filter((x) => x !== id);
      return { watching, stage: st.stage === id ? watching[watching.length - 1] ?? null : st.stage, stageOpen: st.stageOpen && watching.length > 0 };
    });
    this.syncStreams();
  }

  // Ver la transmisión de alguien: si no está en tu sala, caminas hasta allá y se abre al llegar
  watchUser(id) {
    if (this.state.talkingWith.includes(id)) return this.watch(id);
    this.pendingWatch = id;
    this.goTo(id);
  }

  // Alguien de tu sala empezó a transmitir
  onGoLive(id) {
    if (!this.state.talkingWith.includes(id)) return;
    const name = this.state.users[id]?.displayName || 'Alguien';
    if (this.state.prefs.screen.autoOpen && this.state.watching.length < 4) this.watch(id);
    else this.toast({ title: `🔴 ${name} está transmitiendo su pantalla`, action: { label: 'Ver', run: () => this.watch(id) } });
  }

  // Grabaciones: se anuncia a todos para que nadie grabe a escondidas
  setRecording(on) {
    if (this.state.recording === on) return;
    this.set({ recording: on });
    this.socket?.emit('state', { recording: on });
  }

  // Avisa a quien transmite que guardé un clip de su pantalla
  notifyClip(sharer) {
    if (sharer !== this.state.me?.id) this.socket?.emit('clip', { sharer });
  }

  // Mantiene la lista de pantallas que veo y avisa quién ve la mía
  syncStreams(talking = this.state.talkingWith) {
    const st = this.state;
    if (!st.me) return;
    const meId = st.me.id;
    const live = (id) => (id === meId ? st.media.screen : talking.includes(id) && st.users[id]?.online && st.users[id]?.screen);
    const watching = st.watching.filter(live);
    if (watching.length !== st.watching.length) {
      this.set({ watching, stage: watching.includes(st.stage) ? st.stage : watching[watching.length - 1] ?? null, stageOpen: st.stageOpen && watching.length > 0 });
    }
    const remote = watching.filter((id) => id !== meId);
    const key = remote.join(',');
    if (key !== this.lastWatchKey) {
      this.lastWatchKey = key;
      this.socket?.emit('state', { watching: remote });
    }
    // Quién me está viendo (y está en mi sala): solo a ellos se les envía mi pantalla
    const watchers = talking.filter((id) => st.users[id]?.online && (st.users[id]?.watching || []).includes(meId));
    this.media?.setWatchers(watchers);
    this.media?.setWatching(remote);
  }

  spaceLabel() {
    const f = this.state.floor;
    const me = this.myPlayer;
    if (!f || !me) return '';
    const d = deskAt(f, me.x, me.y);
    if (d) {
      const owner = this.state.users[f.claims[d.id]];
      return owner ? `Escritorio de ${owner.displayName}` : 'Escritorio libre';
    }
    return areaAt(f, me.x, me.y)?.name || f.name;
  }

  async toggleMic() {
    try { await this.media.setMic(!this.state.media.mic); } catch (e) { this.mediaError(e); }
  }

  async toggleCam() {
    try { await this.media.setCam(!this.state.media.cam); } catch (e) { this.mediaError(e); }
  }

  async toggleScreen() {
    try { await this.media.setScreen(!this.state.media.screen); } catch (e) { if (e.name !== 'NotAllowedError') this.mediaError(e); }
  }

  mediaError(e) {
    const msg = e?.name === 'NotAllowedError' ? 'Permiso denegado. Revisa los permisos de micrófono/cámara del navegador.'
      : e?.name === 'NotFoundError' ? 'No se encontró el dispositivo.'
        : !window.isSecureContext ? 'El micrófono y la cámara requieren HTTPS (o localhost).'
          : e?.voiceServer ? e.message
          : /engine not connected|not connected within timeout|could not establish/i.test(e?.message || '') ? 'No se pudo conectar con el servidor de voz. Revisa tu conexión e inténtalo de nuevo.'
          : `No se pudo acceder al dispositivo: ${e?.message || e}`;
    this.toast({ title: msg, kind: 'error' });
  }

  setStatus(status) {
    this.socket.emit('state', { status });
  }

  react(emoji) {
    this.socket.emit('react', { emoji });
    this.reactions[this.state.me.id] = { emoji, until: performance.now() + 3500 };
  }

  // ---------- Chat ----------
  async refreshChat() {
    const chat = await api.get('/chat');
    this.set({ chat });
  }

  onMessage(m) {
    if (hideMessage(m)) return; // de alguien que bloqueaste
    const meId = this.state.me.id;
    let conv = m.conv;
    if (m.dm) {
      const [a, b] = m.dm.split(':').map(Number);
      conv = `d:${a === meId ? b : a}`;
    }
    m.convKey = conv;
    this.dispatch('message', m);
    const viewing = this.state.view === 'chat' && this.state.conv === conv && document.visibilityState === 'visible';
    if (m.userId === meId) return;
    if (viewing) {
      api.post('/reads', { conv, lastId: m.id }).catch(() => {});
    } else {
      this.set((st) => {
        const chat = { ...st.chat };
        if (m.dm) {
          const existing = chat.dms.find((d) => d.conv === conv);
          const rest = chat.dms.filter((d) => d.conv !== conv);
          chat.dms = [{ conv, userId: Number(conv.slice(2)), lastId: m.id, unread: (existing?.unread || 0) + 1 }, ...rest];
        } else {
          chat.channels = chat.channels.map((c) => (c.conv === conv ? { ...c, unread: c.unread + 1 } : c));
        }
        return { chat };
      });
    }
    const pref = this.state.prefs.notifications;
    const isDirect = !!m.dm || m.body.includes(`@${this.state.me.username}`);
    const wantNotify = pref.chat === 'all' || (pref.chat === 'dms' && isDirect);
    const wantSound = pref.chatSound === 'all' || (pref.chatSound === 'dms' && isDirect);
    if (m.kind === 'wave') return;
    if (!viewing && wantSound) playSound('message', this.state.prefs.audio.notifVolume);
    if (!viewing && wantNotify) {
      const u = this.state.users[m.userId];
      this.desktopNotify(`${u?.displayName || 'Mensaje'}: ${m.body.slice(0, 120)}`);
    }
  }

  openConv(conv) {
    this.set((st) => ({
      view: 'chat',
      conv,
      mobilePane: 'main',
      chat: {
        channels: st.chat.channels.map((c) => (c.conv === conv ? { ...c, unread: 0 } : c)),
        dms: st.chat.dms.some((d) => d.conv === conv)
          ? st.chat.dms.map((d) => (d.conv === conv ? { ...d, unread: 0 } : d))
          : conv.startsWith('d:') ? [{ conv, userId: Number(conv.slice(2)), unread: 0 }, ...st.chat.dms] : st.chat.dms,
      },
    }));
  }

  async wave(userId) {
    await api.post(`/wave/${userId}`);
    playSound('wave', this.state.prefs.audio.notifVolume);
  }

  async loadCharacters() {
    const { characters } = await api.get('/characters').catch(() => ({ characters: [] }));
    this.set({ characters });
  }

  // ---------- Calendario ----------
  async loadEvents() {
    const from = Date.now() - 60 * 864e5;
    const to = Date.now() + 120 * 864e5;
    const { events } = await api.get(`/events?from=${from}&to=${to}`);
    this.set((st) => ({ events, eventsVersion: st.eventsVersion + 1 }));
  }

  checkReminders() {
    const p = this.state.prefs.notifications;
    const now = Date.now();
    this.reminded ||= new Set();
    for (const e of this.state.events) {
      if (e.attendees.length && !e.attendees.includes(this.state.me.id) && e.createdBy !== this.state.me.id) continue;
      const k5 = `${e.id}:5`, k0 = `${e.id}:0`;
      const until = e.startsAt - now;
      if (p.remind5 && until > 0 && until <= 5 * 60e3 && !this.reminded.has(k5)) {
        this.reminded.add(k5);
        this.toast({ title: `📅 "${e.title}" empieza en 5 minutos` });
        if (p.remindSound) playSound('reminder', this.state.prefs.audio.notifVolume);
      }
      if (p.remindStart && until <= 0 && until > -60e3 && !this.reminded.has(k0)) {
        this.reminded.add(k0);
        this.toast({ title: `📅 "${e.title}" está empezando` });
        if (p.remindSound) playSound('reminder', this.state.prefs.audio.notifVolume);
      }
    }
  }

  // ---------- Preferencias ----------
  // Tema de la interfaz de esta persona (null = el de la oficina): se ve al momento y se guarda en su cuenta
  async setUiTheme(theme) {
    setUserTheme(theme || null);
    this.set((st) => ({ me: { ...st.me, uiTheme: theme || null } }));
    await api.put('/me/theme', { theme: theme || null });
  }

  updatePrefs(patch) {
    const prefs = mergePrefs({ ...this.state.prefs, ...patch });
    this.set({ prefs });
    applyTheme(prefs.colorMode);
    this.applyMediaPrefs();
    clearTimeout(this.prefsTimer);
    this.prefsTimer = setTimeout(() => api.put('/me/prefs', prefs).catch(() => {}), 500);
  }

  // ---------- Utilidades UI ----------
  // Recarga dura: borra la caché de la app y vuelve a cargar todo del servidor
  async hardReload() {
    try {
      if ('caches' in window) for (const k of await caches.keys()) await caches.delete(k);
      const reg = await navigator.serviceWorker?.getRegistration();
      await reg?.update();
    } catch { /* sigue con la recarga */ }
    const u = new URL(window.location.href);
    u.searchParams.set('v', Date.now().toString(36));
    window.location.replace(u.toString());
  }

  toast(t) {
    const id = Math.random().toString(36).slice(2);
    this.set((st) => ({ toasts: [...st.toasts, { id, ...t }] }));
    setTimeout(() => this.set((st) => ({ toasts: st.toasts.filter((x) => x.id !== id) })), t.duration || 5000);
  }

  desktopNotify(body) {
    if (!this.state.prefs.notifications.desktop || document.visibilityState === 'visible') return;
    if (this.pushOn) return; // este dispositivo ya recibe el aviso por push
    if ('Notification' in window && Notification.permission === 'granted') new Notification(this.state.config.officeName, { body, icon: '/logo.svg' });
  }

  // Pequeño bus de eventos para vistas (chat)
  handlers = new Map();
  on(type, fn) {
    if (!this.handlers.has(type)) this.handlers.set(type, new Set());
    this.handlers.get(type).add(fn);
    return () => this.handlers.get(type).delete(fn);
  }
  dispatch(type, payload) {
    this.handlers.get(type)?.forEach((fn) => fn(payload));
  }
}

export function buildFloor(payload) {
  const state = composeFloor({ template: payload.template, areas: payload.areas, objects: payload.objects });
  return { ...state, id: payload.id, name: payload.name, claims: payload.claims || {}, version: Math.random() };
}

export function applyTheme(mode) {
  applyColorMode(mode); // los temas oscuros (Eleevate y los de juegos) se quedan en oscuro
}

export const office = new Office();
// Acceso desde la consola y las pruebas en navegador (solo la sesión propia)
if (typeof window !== 'undefined') window.__office = office;

export function useOffice(selector) {
  const get = useCallback(() => selector(office.state), [selector]);
  return useSyncExternalStore(office.subscribe, get);
}
