// Economía del Hotel (cliente): créditos HUB, intercambio en curso, invitaciones y efectos (regalos, monedas).
// El servidor decide todo; aquí solo se guarda lo último que mandó y se piden cosas.
import { useSyncExternalStore } from 'react';
import { office } from '../../lib/store.js';
import { api } from '../../lib/api.js';
import { playSound } from '../../lib/sounds.js';
import { FURNI_BY_ID } from '@shared/hotelCatalog.js';
import { hotel } from '../hotelStore.js';

export const fmtC = (n) => Number(n || 0).toLocaleString('es-MX');
export const REASON = {
  start: 'Regalo de bienvenida', daily: 'Premio diario', online: 'Tiempo en el Hotel', buy: 'Compra', gift: 'Regalo enviado',
  trade: 'Intercambio', coin: 'Canje de monedas', voucher: 'Código canjeado', admin: 'Ajuste de admin',
};
const TOAST = { daily: '☀️ Premio diario', online: '⏱️ Por estar en el Hotel', coin: '🪙 Canjeaste monedas', voucher: '🎟️ Código canjeado', admin: '💰 Un admin te dio créditos' };

class Eco {
  state = { credits: null, log: [], daily: 0, onlineEveryMs: 15 * 60e3, onlineCredits: 10, trade: null, invites: [], reveal: null, fx: [], bump: 0, shop: null };
  listeners = new Set();
  attached = null;
  set(p) { this.state = { ...this.state, ...(typeof p === 'function' ? p(this.state) : p) }; for (const l of this.listeners) l(); }
  subscribe = (l) => { this.listeners.add(l); return () => this.listeners.delete(l); };

  attach() {
    const s = office.socket;
    if (!s || this.attached === s) return;
    this.detach();
    this.attached = s;
    this.handlers = [];
    const on = (ev, fn) => { s.on(ev, fn); this.handlers.push([ev, fn]); };
    on('hotel:wallet', (m) => this.onWallet(m));
    on('hotel:trade', (m) => this.set({ trade: m }));
    on('hotel:trade:invite', (m) => {
      playSound('wave', office.state.prefs?.audio?.notifVolume ?? 0.6);
      this.set((st) => ({ invites: [...st.invites.filter((x) => x.from !== m.from), { ...m, at: Date.now() }] }));
    });
    on('hotel:trade:end', (m) => this.onTradeEnd(m));
    on('hotel:present:open', (m) => this.onPresent(m));
    on('hotel:coin', (m) => this.addFx({ kind: 'coin', x: m.x, y: m.y, z: m.z, text: `+${fmtC(m.amount)}` }));
  }
  detach() {
    if (this.attached) for (const [ev, fn] of this.handlers || []) this.attached.off(ev, fn);
    this.attached = null;
  }
  async load() {
    try {
      const r = await api.get('/hotel/wallet');
      this.set({ credits: r.credits, log: r.log, onlineEveryMs: r.onlineEveryMs, onlineCredits: r.onlineCredits, trade: r.trade || this.state.trade });
      if (r.daily) this.flash(r.daily, 'daily');
    } catch { /* sin monedero */ }
  }
  onWallet(m) {
    const prev = this.state.credits;
    this.set({ credits: m.credits });
    if (m.delta && m.delta > 0) this.flash(m.delta, m.reason);
    else if (prev != null && m.credits !== prev) this.set((st) => ({ bump: st.bump + 1 }));
    // El historial se recarga solo si el monedero está abierto (lo pide WalletBadge)
    if (this.state.walletOpen) this.loadLog();
  }
  flash(delta, reason) {
    this.set((st) => ({ bump: st.bump + 1, gain: { delta, reason, at: Date.now() } }));
    if (TOAST[reason]) office.toast({ title: `${TOAST[reason]}: +${fmtC(delta)} créditos HUB` });
    playSound('score', 0.45);
  }
  async loadLog() { try { const r = await api.get('/hotel/wallet'); this.set({ credits: r.credits, log: r.log }); } catch { /* luego */ } }

  // ---------- Intercambio ----------
  request(userId) { this.attach(); office.socket?.emit('hotel:trade:request', { userId }); }
  answer(from, accept) {
    office.socket?.emit('hotel:trade:answer', { from, accept });
    this.set((st) => ({ invites: st.invites.filter((x) => x.from !== from) }));
  }
  offer(patch) { office.socket?.emit('hotel:trade:offer', patch); }
  toggleItem(id) {
    const T = this.state.trade;
    if (!T) return;
    const ids = T.mine.items.map((i) => i.id);
    const next = ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id];
    if (next.length > 20) return office.toast({ title: 'Máximo 20 furnis por lado' });
    this.offer({ items: next });
  }
  accept(on = true) { office.socket?.emit('hotel:trade:accept', { on }); }
  confirm() { office.socket?.emit('hotel:trade:confirm', { v: this.state.trade?.v }); }
  cancel() { office.socket?.emit('hotel:trade:cancel'); }
  onTradeEnd(m) {
    const T = this.state.trade;
    this.set({ trade: null });
    const who = T?.other?.name || 'la otra persona';
    if (m.ok) {
      const r = m.received;
      const parts = [];
      if (r?.items?.length) parts.push(`${r.items.length} furni${r.items.length > 1 ? 's' : ''}`);
      if (r?.credits) parts.push(`${fmtC(r.credits)} créditos`);
      office.toast({ title: `🤝 ¡Intercambio listo con ${who}!${parts.length ? ` Recibiste ${parts.join(' y ')}` : ''}`, action: { label: 'Inventario', run: () => hotel.set({ panel: 'inventory' }) } });
      playSound('score', 0.5);
    } else if (m.reason === 'cancel' && m.by !== office.state.me?.id) office.toast({ title: `${who} canceló el intercambio` });
    else if (m.reason === 'left') office.toast({ title: 'El intercambio se canceló: alguien salió de la sala' });
  }

  // ---------- Efectos en la sala ----------
  addFx(f) {
    const id = Math.random().toString(36).slice(2);
    this.set((st) => ({ fx: [...st.fx.slice(-10), { ...f, id, t0: performance.now() }] }));
    setTimeout(() => this.set((st) => ({ fx: st.fx.filter((x) => x.id !== id) })), 2400);
  }
  onPresent(m) {
    this.addFx({ kind: 'present', x: m.x, y: m.y, z: m.z, color: m.wrap });
    if (m.mine) { this.set({ reveal: m }); playSound('power', 0.5); }
  }

  // ---------- Compras ----------
  async buy(body) {
    const r = await api.post('/hotel/buy', body);
    if (r.items?.length) hotel.onInv({ add: r.items });
    if (r.credits != null) this.set({ credits: r.credits });
    return r;
  }
  async redeemCoins(itemIds) {
    const r = await api.post('/hotel/coins/redeem', itemIds ? { itemIds } : {});
    this.set({ credits: r.credits });
    return r;
  }
  async redeemCode(code) {
    const r = await api.post('/hotel/vouchers/redeem', { code });
    if (r.items?.length) hotel.onInv({ add: r.items });
    this.set({ credits: r.balance });
    return r;
  }
}

export const eco = new Eco();
if (typeof window !== 'undefined') window.__eco = eco;
export function useEco(sel) { return useSyncExternalStore(eco.subscribe, () => sel(eco.state)); }
export const furniName = (type) => FURNI_BY_ID[type]?.name || type;
