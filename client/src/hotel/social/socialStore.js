// Hotel (parte social): estado de la consola (amigos, solicitudes, mensajes), avisos de invitación
// y de eventos, y datos sociales de quienes están en la sala (lema, insignias, respetos).
// Es liviano a propósito: se carga con la app (Shell) para que los mensajes e invitaciones
// lleguen aunque estés en la oficina. Lo pesado del Hotel se importa solo cuando hace falta.
import { useSyncExternalStore } from 'react';
import { office } from '../../lib/store.js';
import { api } from '../../lib/api.js';
import { playSound } from '../../lib/sounds.js';

const vol = () => office.state.prefs?.audio?.notifVolume ?? 0.6;
const hotelMod = () => import('../hotelStore.js').then((m) => m.hotel);

// Ganchos para otros módulos del Hotel (p. ej. el intercambio de la parte A: socialHooks.onTrade = (userId) => …)
export const socialHooks = { onTrade: null };

class Social {
  state = { open: false, tab: 'friends', friends: null, requests: [], sent: [], unread: 0, conv: null, inviting: false, loaded: false };
  listeners = new Set();
  people = new Map(); // id -> { motto, badges, respects } de quienes están en tu sala
  fx = []; // efectos de respeto { to, t }
  attached = null;

  set(patch) {
    this.state = { ...this.state, ...(typeof patch === 'function' ? patch(this.state) : patch) };
    for (const l of this.listeners) l();
  }
  subscribe = (l) => { this.listeners.add(l); return () => this.listeners.delete(l); };
  get me() { return office.state.me?.id; }

  // Se engancha al socket de la oficina en cuanto exista (y otra vez si se reconecta con otro)
  boot() {
    if (this.booted) return;
    this.booted = true;
    const check = () => { if (office.socket && office.socket !== this.attached) this.attach(office.socket); };
    office.subscribe(check);
    check();
  }
  attach(s) {
    this.attached = s;
    s.on('connect', () => this.refresh());
    if (s.connected) this.refresh();
    s.on('hotel:social', (m) => this.onSocial(m));
    s.on('hotel:pm', (m) => this.onPm(m));
    s.on('hotel:pm:read', (m) => this.markRead(m.userId));
    s.on('hotel:invite', (m) => this.onInvite(m));
    s.on('hotel:event', (m) => office.toast({ title: `🎉 Evento: ${m.title} en ${m.roomName}`, action: { label: 'Ir', run: () => this.goRoom(m.roomId) }, duration: 9000 }));
    // Datos sociales de la sala
    s.on('hotel:room', (m) => { this.people = new Map(); for (const u of m.users) this.setPerson(u); });
    s.on('hotel:user:join', (u) => this.setPerson(u));
    s.on('hotel:social:user', (u) => { this.setPerson(u); this.set({}); });
    s.on('hotel:respect', (m) => {
      const p = this.people.get(m.to);
      if (p) p.respects = m.respects;
      this.fx.push({ to: m.to, t: performance.now() });
      if (m.to === this.me) { playSound('score', vol()); office.toast({ title: `👍 ${m.name} te dio respeto` }); }
      this.set({});
    });
  }
  setPerson(u) {
    if (!u || u.motto === undefined) return;
    this.people.set(u.id, { motto: u.motto || '', badges: u.badges || [], respects: u.respects || 0 });
  }

  async refresh() {
    try {
      const r = await api.get('/hotel/social');
      this.set({ friends: r.friends, requests: r.requests, sent: r.sent, unread: r.unread, loaded: true });
    } catch { /* sin consola */ }
  }

  // ---------- Eventos del servidor ----------
  onSocial(m) {
    if (m.type === 'request') {
      playSound('message', vol());
      this.set((st) => ({ requests: [m.user, ...st.requests.filter((r) => r.id !== m.user.id)] }));
      office.toast({ title: `🤝 ${m.user.name} quiere ser tu amigo en MeDed Friends`, actions: [
        { label: 'Aceptar', run: () => this.accept(m.user.id) },
        { label: 'Ver', run: () => this.openConsole('requests') },
      ], duration: 9000 });
    } else if (m.type === 'friend') {
      this.set((st) => ({
        friends: [...(st.friends || []).filter((f) => f.id !== m.user.id), m.user],
        requests: st.requests.filter((r) => r.id !== m.user.id), sent: st.sent.filter((id) => id !== m.user.id),
      }));
    } else if (m.type === 'removed') {
      this.set((st) => ({ friends: (st.friends || []).filter((f) => f.id !== m.userId), conv: st.conv?.userId === m.userId ? null : st.conv }));
    }
  }
  onPm(m) {
    const other = m.from === this.me ? m.to : m.from;
    const st = this.state;
    const viewing = st.open && st.conv?.userId === other && document.visibilityState === 'visible';
    if (st.conv?.userId === other && !st.conv.messages.some((x) => x.id === m.id)) this.set({ conv: { ...st.conv, messages: [...st.conv.messages, m] } });
    const mine = m.from === this.me;
    this.set((s) => ({
      friends: (s.friends || []).map((f) => (f.id === other ? { ...f, last: { text: m.text, at: m.at, mine }, unread: !mine && !viewing ? f.unread + 1 : f.unread } : f)),
    }));
    if (!mine) {
      if (viewing) api.post(`/hotel/social/messages/${other}/read`).catch(() => {});
      else {
        playSound('message', vol());
        office.toast({ title: `💬 ${m.name}: ${m.text.length > 70 ? `${m.text.slice(0, 70)}…` : m.text}`, action: { label: 'Responder', run: () => this.openChat(other) }, duration: 7000 });
      }
    }
    this.recount();
  }
  markRead(userId) {
    this.set((s) => ({ friends: (s.friends || []).map((f) => (f.id === userId ? { ...f, unread: 0 } : f)) }));
    this.recount();
  }
  recount() { this.set((s) => ({ unread: (s.friends || []).reduce((n, f) => n + (f.unread || 0), 0) })); }
  onInvite(m) {
    playSound('wave', vol());
    office.toast({ title: `✉️ ${m.name} te invita a ${m.roomName}${m.text ? `: “${m.text}”` : ''}`, action: { label: 'Ir', run: () => this.goRoom(m.roomId) }, duration: 12000 });
  }

  // ---------- Acciones ----------
  openConsole(tab) { this.set((st) => ({ open: true, tab: tab || st.tab })); this.refresh(); }
  closeConsole() { this.set({ open: false, conv: null, inviting: false }); }
  toggleConsole() { if (this.state.open) this.closeConsole(); else this.openConsole(); }
  async openChat(userId) {
    if (office.state.view !== 'hotel') office.set({ view: 'hotel' });
    this.set({ open: true, tab: 'friends', inviting: false, conv: { userId, messages: null } });
    try {
      const r = await api.get(`/hotel/social/messages/${userId}`);
      if (this.state.conv?.userId === userId) this.set({ conv: { userId, messages: r.messages } });
      this.markRead(userId);
    } catch (e) { office.toast({ title: e.message, kind: 'error' }); }
  }
  async send(userId, text) {
    try { const r = await api.post('/hotel/social/messages', { to: userId, text }); this.onPm({ ...r.message, name: office.state.me.displayName }); return true; } catch (e) { office.toast({ title: e.message, kind: 'error' }); return false; }
  }
  async request(userId) {
    try {
      const r = await api.post('/hotel/social/requests', { userId });
      if (r.friends) office.toast({ title: '🤝 ¡Ahora son amigos!' });
      else { this.set((st) => ({ sent: [...st.sent, userId] })); office.toast({ title: '📨 Solicitud enviada' }); }
      return true;
    } catch (e) { office.toast({ title: e.message, kind: 'error' }); return false; }
  }
  async accept(userId) {
    try { await api.post(`/hotel/social/requests/${userId}/accept`); this.refresh(); } catch (e) { office.toast({ title: e.message, kind: 'error' }); }
  }
  async decline(userId) {
    try { await api.post(`/hotel/social/requests/${userId}/decline`); this.set((st) => ({ requests: st.requests.filter((r) => r.id !== userId) })); } catch (e) { office.toast({ title: e.message, kind: 'error' }); }
  }
  async unfriend(userId) {
    try { await api.del(`/hotel/social/friends/${userId}`); this.set((st) => ({ friends: (st.friends || []).filter((f) => f.id !== userId), conv: null })); } catch (e) { office.toast({ title: e.message, kind: 'error' }); }
  }
  // Seguir: el servidor dice si se puede; luego se entra normal (contraseña, timbre…)
  follow(userId) {
    const s = office.socket;
    if (!s) return;
    s.emit('hotel:follow', { userId }, async (r) => {
      if (r?.error) return office.toast({ title: r.error });
      const hotel = await hotelMod();
      if (hotel.state.roomId === r.roomId) return office.toast({ title: 'Ya están en la misma sala' });
      this.enterRoom(hotel, r.roomId, r.access, r.roomName);
    });
  }
  invite(userIds, text) {
    return new Promise((resolve) => office.socket?.emit('hotel:invite', { userIds, text }, (r) => {
      if (r?.error) office.toast({ title: r.error });
      else office.toast({ title: r.sent ? `✉️ Invitación enviada a ${r.sent} ${r.sent === 1 ? 'amigo' : 'amigos'}` : 'Tus amigos no están conectados (o ya están aquí)' });
      resolve(!r?.error);
    }));
  }
  respect(userId) {
    return new Promise((resolve) => office.socket?.emit('hotel:respect', { userId }, (r) => {
      if (r?.error) office.toast({ title: r.error });
      resolve(r || {});
    }));
  }
  async goRoom(roomId) {
    const hotel = await hotelMod();
    this.enterRoom(hotel, roomId, null);
  }
  enterRoom(hotel, roomId, access, roomName) {
    if (office.state.view !== 'hotel') office.set({ view: 'hotel' });
    if (access === 'password') {
      if (hotel.state.roomId) hotel.leave();
      hotel.set({ entering: { roomId, askPassword: true, room: { id: roomId, name: roomName || 'Sala' } } });
      return;
    }
    hotel.enter(roomId);
  }
}

export const social = new Social();
if (typeof window !== 'undefined') { window.__social = social; social.boot(); }

export function useSocial(sel) {
  return useSyncExternalStore(social.subscribe, () => sel(social.state));
}
