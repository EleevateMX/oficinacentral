import { useSyncExternalStore, useCallback } from 'react';
import { io } from 'socket.io-client';
import { api } from './api.js';
import { MediaManager } from './media.js';
import { composeFloor, canTalk, talkSpace, areaAt, deskAt, nearestWalkable } from '@shared/map.js';
import { playSound } from './sounds.js';
import { applyBrand } from './themes.js';

export const DEFAULT_PREFS = {
  colorMode: 'light',
  skipWelcome: true,
  calendar: { weekDays: 7, firstDay: 0 },
  audio: { noiseSuppression: true, echoCancellation: true, autoGainControl: true, notifVolume: 0.6, muteOnHidden: false },
  video: { hd: false, hideSelf: false },
  screen: { quality: 'balanced', audio: true, volume: 1, autoOpen: false },
  meetings: { maxTiles: 9 },
  notifications: { remind5: true, remindStart: true, remindSound: true, chat: 'dms', chatSound: 'dms', desktop: false },
  performance: { mode: 'balanced' },
  ambience: { dayNight: true, music: false, musicVolume: 0.5, steps: false },
  devices: { micId: '', camId: '', speakerId: '' },
};

function mergePrefs(p = {}) {
  const out = { ...DEFAULT_PREFS, ...p };
  for (const k of Object.keys(DEFAULT_PREFS)) {
    if (typeof DEFAULT_PREFS[k] === 'object') out[k] = { ...DEFAULT_PREFS[k], ...(p[k] || {}) };
  }
  return out;
}

class Office {
  constructor() {
    this.listeners = new Set();
    this.state = this.initial();
    this.players = {}; // posiciones en vivo (no dispara renders)
    this.reactions = {}; // id -> { emoji, until }
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
    applyTheme(this.state.prefs.colorMode);
    const [config, ice, users, floors, chat, notifications] = await Promise.all([
      api.get('/config'), api.get('/ice'), api.get('/users'), api.get('/floors'), api.get('/chat'), api.get('/notifications'),
    ]);
    const byId = Object.fromEntries(users.users.map((u) => [u.id, u]));
    applyBrand(config);
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
    s.on('connect', () => {
      this.set({ connected: true });
      s.emit('visibility', { hidden: document.visibilityState === 'hidden' }); // para las notificaciones push
    });
    s.on('disconnect', () => this.set({ connected: false }));
    s.on('connect_error', (e) => {
      if (e.message === 'unauthorized') window.location.reload();
    });
    s.on('hello', async ({ you, players }) => {
      this.lastWatchKey = null;
      this.players = {};
      for (const [id, p] of Object.entries(players)) this.players[id] = { ...p, rx: p.x, ry: p.y };
      if (!this.media) {
        // LiveKit se carga solo si la oficina lo tiene configurado
        const LiveKitManager = this.state.config.livekitUrl ? (await import('./livekit.js')).LiveKitManager : null;
        this.media = LiveKitManager
          ? new LiveKitManager({ myId: you, getToken: () => api.get('/livekit/token') })
          : new MediaManager({ socket: s, myId: you, iceServers: this.state.config.iceServers });
        this.applyMediaPrefs();
        this.media.addEventListener('local', (e) => {
          const { viewers, ...state } = e.detail;
          this.set({ media: e.detail });
          s.emit('state', state);
          this.syncStreams();
        });
        this.media.addEventListener('peers', (e) => this.set({ peers: e.detail }));
      } else {
        // reconexión: volver a anunciar estado de medios
        s.emit('state', this.media.state);
      }
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
      if (floorChanged) this.set((st) => ({ presenceVersion: st.presenceVersion + 1 }));
    });
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
        if (this.state.floor?.id === payload.id) this.set({ floor: f });
      }
    });
    s.on('message', (m) => this.onMessage(m));
    s.on('channels', () => this.refreshChat());
    s.on('characters', () => this.loadCharacters());
    s.on('office', (c) => {
      applyBrand(c);
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
      if (n.type === 'wave') {
        this.toast({ title: `👋 ${actor?.displayName || 'Alguien'} te saludó`, action: { label: 'Ir', run: () => this.goTo(n.actorId) } });
        playSound('wave', this.state.prefs.audio.notifVolume);
        this.desktopNotify(`${actor?.displayName} te saludó 👋`);
      } else if (n.type === 'event') {
        this.toast({ title: `📅 ${actor?.displayName || 'Alguien'} te invitó a "${n.data.title}"` });
      }
    });
  }

  applyMediaPrefs() {
    const { audio, video, devices, screen } = this.state.prefs;
    this.media?.updateSettings({
      noiseSuppression: audio.noiseSuppression, echoCancellation: audio.echoCancellation, autoGainControl: audio.autoGainControl,
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
  }

  async changeFloor(floorId, target) {
    await this.showFloor(floorId);
    const f = this.state.floor;
    const pos = target || f.spawn;
    const dest = nearestWalkable(f, pos.x, pos.y);
    this.moveMe(dest.x, dest.y, 'down', { tp: true, floorId });
    this.set((st) => ({ presenceVersion: st.presenceVersion + 1 }));
  }

  // Ir hacia una persona (camina si está en el mismo piso)
  async goTo(userId) {
    const target = this.players[userId];
    this.set({ view: 'map', profileCard: null });
    if (!target) return this.toast({ title: 'Esa persona no está conectada' });
    const me = this.myPlayer;
    if (target.floorId !== me.floorId) {
      await this.changeFloor(target.floorId, { x: target.x, y: target.y + 1 });
      return;
    }
    this.pathTarget = { x: target.x, y: target.y + 1, near: true };
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
    const space = talkSpace(f, me.x, me.y);
    const ids = [];
    for (const [id, p] of Object.entries(this.players)) {
      if (Number(id) === this.state.me.id) continue;
      if (canTalk(f, me, p)) ids.push(Number(id));
    }
    ids.sort((a, b) => a - b);
    this.media.setPeers(ids);
    this.syncStreams(ids);
    if (this.pendingWatch && ids.includes(this.pendingWatch)) { const w = this.pendingWatch; this.pendingWatch = null; this.watch(w); }
    const prev = this.state.talkingWith;
    if (prev.length !== ids.length || prev.some((v, i) => v !== ids[i]) || space !== this.state.space) {
      this.set({ talkingWith: ids, space });
    }
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
  updatePrefs(patch) {
    const prefs = mergePrefs({ ...this.state.prefs, ...patch });
    this.set({ prefs });
    applyTheme(prefs.colorMode);
    this.applyMediaPrefs();
    clearTimeout(this.prefsTimer);
    this.prefsTimer = setTimeout(() => api.put('/me/prefs', prefs).catch(() => {}), 500);
  }

  // ---------- Utilidades UI ----------
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
  const dark = mode === 'dark' || (mode === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
}

export const office = new Office();

export function useOffice(selector) {
  const get = useCallback(() => selector(office.state), [selector]);
  return useSyncExternalStore(office.subscribe, get);
}
