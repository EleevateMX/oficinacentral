// Hotel: estado del cliente y eventos del socket (usa el mismo socket de la oficina: office.socket).
// Lo de la interfaz (paneles, sala, inventario) vive en `hotel.state` (React lo lee con useHotel);
// lo que cambia cada cuadro (posiciones, globitos) vive en `hotel.live` y lo lee el motor.
import { useSyncExternalStore } from 'react';
import { office } from '../lib/store.js';
import { api } from '../lib/api.js';
import { WALK_SPEED, ROOM_MODELS } from '@shared/hotel.js';
import { FURNI_BY_ID } from '@shared/hotelCatalog.js';
import { buildRoom, dirOf } from '@shared/hotelRoom.js';
import { playSound } from '../lib/sounds.js';

const FAIL = {
  missing: 'Esa sala ya no existe',
  banned: 'No puedes entrar a esta sala por un rato',
  full: 'La sala está llena',
  closed: 'Esta sala está cerrada: solo entra quien tiene permiso',
  password: 'Contraseña incorrecta',
  nobody: 'No hay nadie dentro que te pueda abrir. Intenta más tarde',
  wait: 'Espera un momento antes de volver a tocar',
  denied: 'No te dejaron pasar 😕',
};
const LEFT = {
  kick: '👢 Te sacaron de la sala',
  ban: '⛔ Te vetaron de la sala por un rato',
  deleted: 'La sala fue borrada',
  elsewhere: 'Entraste a una sala desde otra pestaña',
};

class Hotel {
  state = this.initial();
  listeners = new Set();
  live = { room: null, grid: null, items: new Map(), users: new Map(), bubbles: [], typing: new Map(), lastShift: 0 };
  attached = null;
  password = null;

  initial() {
    return {
      screen: 'nav', // 'nav' | 'room'
      roomId: null, room: null, rights: [], isOwner: false, admin: false,
      inventory: null, panel: null, placing: null, selected: null,
      waiting: null, bells: [], chatLog: [], itemsV: 0, usersV: 0,
      chatMode: 'say', whisperTo: null, entering: null,
    };
  }

  set(patch) {
    this.state = { ...this.state, ...(typeof patch === 'function' ? patch(this.state) : patch) };
    for (const l of this.listeners) l();
  }
  subscribe = (l) => { this.listeners.add(l); return () => this.listeners.delete(l); };

  get me() { return office.state.me?.id; }
  get socket() { return office.socket; }
  canEdit() { const s = this.state; if (s.room?.official) return !!s.admin; return !!(s.isOwner || s.admin || s.rights.includes(this.me)); }

  // ---------- Socket ----------
  attach() {
    const s = this.socket;
    if (!s || this.attached === s) return;
    this.detach();
    this.attached = s;
    const on = (ev, fn) => { s.on(ev, fn); this.handlers.push([ev, fn]); };
    this.handlers = [];
    on('hotel:room', (m) => this.onRoom(m));
    on('hotel:enter:fail', (m) => {
      this.set({ waiting: null, entering: null });
      if (m.reason === 'password') this.set({ entering: { roomId: m.roomId, askPassword: true, error: FAIL.password } });
      else office.toast({ title: FAIL[m.reason] || 'No se pudo entrar' });
    });
    on('hotel:waiting', (m) => this.set({ waiting: m.roomId, entering: null }));
    on('hotel:left', (m) => {
      this.clearRoom();
      if (LEFT[m.reason]) office.toast({ title: LEFT[m.reason] });
      if (m.reason === 'door') this.refreshRooms();
    });
    on('hotel:user:join', (u) => { this.addUser(u); this.bump('usersV'); });
    on('hotel:user:leave', (m) => { this.live.users.delete(m.id); this.bump('usersV'); if (this.state.selected?.userId === m.id) this.set({ selected: null }); });
    on('hotel:path', (m) => this.onPath(m));
    on('hotel:user', (m) => this.onUser(m));
    on('hotel:nopath', () => {});
    on('hotel:chat', (m) => this.onChat(m));
    on('hotel:typing', (m) => { if (m.on) this.live.typing.set(m.id, Date.now()); else this.live.typing.delete(m.id); });
    on('hotel:item', (m) => this.onItem(m));
    on('hotel:inv', (m) => this.onInv(m));
    on('hotel:notice', (m) => office.toast({ title: m.text, kind: m.error ? 'error' : undefined }));
    on('hotel:bell', (m) => {
      playSound('wave', office.state.prefs?.audio?.notifVolume ?? 0.6);
      this.set((st) => ({ bells: [...st.bells.filter((b) => b.userId !== m.userId), m] }));
    });
    on('hotel:bell:done', (m) => this.set((st) => ({ bells: st.bells.filter((b) => b.userId !== m.userId) })));
    on('hotel:room:update', (m) => this.set({ room: m.room, rights: m.rights }));
    // Al reconectar, volver a entrar a la sala donde estaba
    on('connect', () => { if (this.state.roomId) this.socket.emit('hotel:enter', { roomId: this.state.roomId, password: this.password }); });
  }
  detach() {
    if (this.attached) for (const [ev, fn] of this.handlers || []) this.attached.off(ev, fn);
    this.attached = null;
  }

  bump(k) { this.set((st) => ({ [k]: st[k] + 1 })); }

  // ---------- Navegador ----------
  async refreshRooms(tab = this.state.navTab || 'official', q = '') {
    try {
      const r = await api.get(`/hotel/rooms?tab=${tab}${q ? `&q=${encodeURIComponent(q)}` : ''}`);
      this.set({ rooms: r.rooms, navTab: tab, myRooms: r.mine, maxRooms: r.maxRooms });
    } catch (e) { office.toast({ title: e.message, kind: 'error' }); }
  }
  enter(roomId, password) {
    this.attach();
    this.password = password ?? null;
    this.set({ entering: { roomId }, waiting: null });
    this.socket?.emit('hotel:enter', { roomId, password });
  }
  // Al subir al Hotel: directo a la sala oficial principal (Oficina Central)
  async enterOfficial() {
    try {
      const r = await api.get('/hotel/rooms?tab=official');
      this.set({ rooms: r.rooms, navTab: 'official', myRooms: r.mine, maxRooms: r.maxRooms });
      const hq = r.rooms.find((x) => x.officialKey === 'hq') || r.rooms[0];
      if (hq && !this.state.roomId && !this.state.entering) this.enter(hq.id);
    } catch { /* se queda en el navegador */ }
  }
  leave() {
    this.socket?.emit('hotel:leave');
    this.clearRoom();
    this.refreshRooms();
  }
  clearRoom() {
    this.live.room = null; this.live.grid = null; this.live.items = new Map(); this.live.users = new Map(); this.live.bubbles = [];
    this.set({ screen: 'nav', roomId: null, room: null, panel: this.state.panel === 'catalog' ? null : null, placing: null, selected: null, bells: [], chatLog: [], waiting: null, entering: null });
  }
  cancelWaiting() {
    this.socket?.emit('hotel:leave');
    this.set({ waiting: null });
  }

  // ---------- Sala ----------
  onRoom(m) {
    const L = this.live;
    L.room = m;
    L.items = new Map(m.items.map((i) => [i.id, i]));
    this.rebuildGrid();
    L.users = new Map();
    L.bubbles = [];
    for (const u of m.users) this.addUser(u);
    this.set({
      screen: 'room', roomId: m.room.id, room: m.room, rights: m.rights, isOwner: m.isOwner, admin: m.admin,
      chatLog: m.chat || [], entering: null, waiting: null, placing: null, selected: null, bells: [],
    });
    this.bump('itemsV');
    if (this.state.inventory == null) this.loadInventory();
    window.dispatchEvent(new CustomEvent('hotel:entered'));
  }
  rebuildGrid() {
    const L = this.live;
    if (!L.room) return;
    L.grid = buildRoom(L.room.room.model, [...L.items.values()].filter((i) => !i.wall));
  }
  addUser(u) {
    const U = {
      id: u.id, name: u.name, avatar: u.avatar, x: u.x, y: u.y, z: u.z, dir: u.dir || 'down', sit: u.sit, lay: u.lay,
      rx: u.x, ry: u.y, rz: u.z, queue: [], seg: null, moving: false,
    };
    this.live.users.set(u.id, U);
    if (u.path?.length) this.onPath({ id: u.id, path: u.path });
  }
  onPath(m) {
    const U = this.live.users.get(m.id);
    if (!U) return;
    U.queue = m.path.map((p) => [...p]);
    U.sit = null; U.lay = null;
    if (!U.seg) this.nextSeg(U, performance.now());
  }
  nextSeg(U, t) {
    const to = U.queue.shift();
    if (!to) { U.seg = null; U.moving = false; return; }
    const from = [U.rx, U.ry, U.rz];
    const d = dirOf(Math.sign(Math.round((to[0] - from[0]) * 100)), Math.sign(Math.round((to[1] - from[1]) * 100)));
    if (d) U.dir = d;
    U.seg = { from, to, t0: t, dur: 1000 / WALK_SPEED };
    U.moving = true;
  }
  // Avanza las animaciones (lo llama el motor cada cuadro)
  tick(t) {
    for (const U of this.live.users.values()) {
      let guard = 0;
      while (U.seg && guard++ < 4) {
        const k = (t - U.seg.t0) / U.seg.dur;
        if (k >= 1) {
          [U.rx, U.ry, U.rz] = U.seg.to;
          const t1 = U.seg.t0 + U.seg.dur;
          if (U.queue.length) this.nextSeg(U, Math.max(t1, t - 50)); else { U.seg = null; U.moving = false; }
        } else {
          const [a, b, c] = U.seg.from, [x, y, z] = U.seg.to;
          U.rx = a + (x - a) * k; U.ry = b + (y - b) * k;
          // Al subir/bajar un escalón, la altura cambia a la mitad del paso
          U.rz = c + (z - c) * Math.min(1, Math.max(0, (k - 0.25) * 2));
          break;
        }
      }
    }
  }
  onUser(m) {
    const U = this.live.users.get(m.id);
    if (!U) return;
    Object.assign(U, { x: m.x, y: m.y, z: m.z, dir: m.dir, sit: m.sit, lay: m.lay });
    if (m.tp || !U.seg) { U.queue = []; U.seg = null; U.moving = false; U.rx = m.x; U.ry = m.y; U.rz = m.z; }
    if (m.tp && m.id === this.me) playSound('power', 0.5);
  }

  // ---------- Furnis ----------
  onItem(m) {
    const L = this.live;
    if (m.op === 'remove') {
      L.items.delete(m.id);
      if (this.state.selected?.itemId === m.id) this.set({ selected: null });
    } else {
      const prev = L.items.get(m.item.id);
      L.items.set(m.item.id, m.item);
      // Dado: anunciar el resultado
      if (m.roll && prev) this.live.diceAt = { id: m.item.id, t: performance.now() };
    }
    this.rebuildGrid();
    this.bump('itemsV');
  }
  async loadInventory() {
    try { const r = await api.get('/hotel/inventory'); this.set({ inventory: r.items }); } catch { /* sin inventario */ }
  }
  onInv(m) {
    if (m.refresh) return this.loadInventory();
    this.set((st) => {
      let inv = st.inventory || [];
      if (m.remove) inv = inv.filter((i) => !m.remove.includes(i.id));
      if (m.add) inv = [...inv.filter((i) => !m.add.some((a) => a.id === i.id)), ...m.add.map((i) => ({ ...i, roomId: null }))];
      return { inventory: inv };
    });
  }
  startPlacing(item, { move = false } = {}) {
    const def = FURNI_BY_ID[item.type];
    if (!def) return;
    this.set({ placing: { itemId: item.id, type: item.type, color: item.color, state: item.state, extra: item.extra, rot: item.rot ?? def.rots[0], move }, selected: null, panel: move ? this.state.panel : this.state.panel });
  }
  rotatePlacing() {
    const p = this.state.placing;
    if (!p) return;
    const def = FURNI_BY_ID[p.type];
    if (def.kind === 'wall') return;
    const rots = def.rots;
    this.set({ placing: { ...p, rot: rots[(rots.indexOf(p.rot) + 1) % rots.length] } });
  }
  place(target) {
    const p = this.state.placing;
    if (!p) return;
    const ev = p.move ? 'hotel:move' : 'hotel:place';
    this.socket.emit(ev, { itemId: p.itemId, ...target, rot: target.rot ?? p.rot });
    // Seguir colocando otro igual del inventario (como en el original): solo si hay más del mismo tipo
    if (!p.move) {
      const more = (this.state.inventory || []).find((i) => i.id !== p.itemId && i.type === p.type && i.color === p.color);
      this.set({ placing: more ? { ...p, itemId: more.id, extra: more.extra } : null });
    } else this.set({ placing: null });
  }

  // ---------- Chat ----------
  onChat(m) {
    const L = this.live;
    this.set((st) => ({ chatLog: [...st.chatLog.slice(-99), m] }));
    L.typing.delete(m.from);
    L.pendingBubbles = L.pendingBubbles || [];
    L.pendingBubbles.push(m);
    if (m.mode === 'whisper' && m.from !== this.me) playSound('message', 0.4);
  }
  say(text) {
    const t = String(text || '').trim();
    if (!t) return;
    const st = this.state;
    if (t === ':sit' || t === ':sentar') return this.socket.emit('hotel:sit');
    if (t.startsWith(':shout ') || t.startsWith(':gritar ')) return this.socket.emit('hotel:chat', { text: t.replace(/^:\S+\s/, ''), mode: 'shout' });
    if (st.chatMode === 'whisper' && st.whisperTo && this.live.users.has(st.whisperTo)) return this.socket.emit('hotel:chat', { text: t, mode: 'whisper', to: st.whisperTo });
    this.socket.emit('hotel:chat', { text: t, mode: st.chatMode === 'shout' ? 'shout' : 'say' });
  }
}

export const hotel = new Hotel();
if (typeof window !== 'undefined') window.__hotel = hotel;

export function useHotel(sel) {
  return useSyncExternalStore(hotel.subscribe, () => sel(hotel.state));
}

export const modelName = (m) => ROOM_MODELS[m]?.name || m;
