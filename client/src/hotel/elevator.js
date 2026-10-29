// Hotel (agente D): elevador entre pisos (salas oficiales) y la vista de llegada.
// Estado chiquito aparte del de hotelStore para no estorbar: pisos, viaje en curso, panel abierto.
import { useSyncExternalStore } from 'react';
import { api } from '../lib/api.js';
import { office } from '../lib/store.js';
import { playSound } from '../lib/sounds.js';
import { hotel } from './hotelStore.js';
import { FLAGSHIP_KEY } from '@shared/hotelOfficialRooms.js';

const SKIP_KEY = 'hotel:skipLanding';
export const getSkip = () => { try { return localStorage.getItem(SKIP_KEY) === '1'; } catch { return false; } };
export const setSkip = (on) => { try { if (on) localStorage.setItem(SKIP_KEY, '1'); else localStorage.removeItem(SKIP_KEY); } catch { /* sin almacenamiento */ } };

// Nombre en el panel (la principal es el lobby)
export const floorName = (r) => (r?.officialKey === FLAGSHIP_KEY ? `Lobby · ${r.name || 'Charla General'}` : r?.name || 'Sala');
export const floorLabel = (i) => (i <= 0 ? 'PB' : String(i));

const vol = () => (office.state.prefs?.audio?.notifVolume ?? 0.6) * 0.7;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

class Elevator {
  state = { floors: null, ride: null, panel: false, landing: false, promo: null };
  listeners = new Set();
  set(p) { this.state = { ...this.state, ...p }; for (const l of this.listeners) l(); }
  subscribe = (l) => { this.listeners.add(l); return () => this.listeners.delete(l); };

  async refresh() {
    try {
      const [r, p] = await Promise.all([api.get('/hotel/rooms?tab=official'), this.state.promo ? null : api.get('/hotel/promo').catch(() => null)]);
      this.set({ floors: r.rooms, ...(p ? { promo: p.promo } : {}) });
    } catch { /* sin pisos */ }
  }
  floorOf(roomId) {
    const i = (this.state.floors || []).findIndex((f) => f.id === roomId);
    return i < 0 ? null : i;
  }

  // Viaje: se cierran las puertas, sube/baja contando pisos, "ding" y se abren en la sala
  async rideTo(room) {
    if (!room || this.state.ride) return;
    if (hotel.state.roomId === room.id) { this.set({ panel: false }); return; }
    const floors = this.state.floors || [];
    const to = Math.max(0, floors.findIndex((f) => f.id === room.id));
    const from = this.floorOf(hotel.state.roomId) ?? 0;
    const ride = { id: Date.now(), from, to, floor: from, label: floorName(room), phase: 'closing' };
    this.set({ ride, panel: false });
    playSound('join', vol() * 0.6);
    await wait(650);
    let entered = false;
    const onIn = () => { entered = true; };
    window.addEventListener('hotel:entered', onIn, { once: true });
    hotel.enter(room.id);
    this.set({ landing: false, ride: { ...ride, phase: 'moving' } });
    // Contar los pisos (mínimo un "salto" aunque sea el mismo número)
    const dir = Math.sign(to - from);
    let f = from;
    const steps = Math.max(1, Math.abs(to - from));
    for (let i = 0; i < steps; i++) {
      await wait(Math.max(220, 900 / steps));
      if (dir) f += dir;
      this.set({ ride: { ...this.state.ride, floor: f } });
      playSound('eat', vol());
    }
    const t0 = Date.now();
    while (!entered && Date.now() - t0 < 4000) await wait(80);
    window.removeEventListener('hotel:entered', onIn);
    if (!entered && hotel.state.screen !== 'room') this.set({ landing: true });
    this.open(ride.id);
  }
  // Al llegar desde la oficina: las puertas ya cerradas se abren
  async arrive(label = 'MeDed Friends') {
    const ride = { id: Date.now(), from: 0, to: 0, floor: 0, label, phase: 'moving', arrive: true };
    this.set({ ride });
    await wait(900);
    this.open(ride.id);
  }
  async open(id) {
    if (this.state.ride?.id !== id) return;
    playSound('message', vol());
    this.set({ ride: { ...this.state.ride, phase: 'opening' } });
    await wait(700);
    if (this.state.ride?.id === id) this.set({ ride: null });
  }
}

export const elevator = new Elevator();
if (typeof window !== 'undefined') window.__elevator = elevator;
export function useElevator(sel) {
  return useSyncExternalStore(elevator.subscribe, () => sel(elevator.state));
}
