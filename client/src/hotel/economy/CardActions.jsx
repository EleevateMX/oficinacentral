// Botones de la economía en las tarjetas del Hotel: persona (intercambiar, regalar, créditos de admin)
// y furni (canjear moneda, abrir regalo).
import React, { useState } from 'react';
import { Repeat, Gift, Coins, Minus, Plus, PackageOpen } from 'lucide-react';
import { office, useOffice } from '../../lib/store.js';
import { api } from '../../lib/api.js';
import { coinValue, isPresent } from '@shared/hotelEconomy.js';
import { hotel } from '../hotelStore.js';
import { eco, useEco, fmtC } from './ecoStore.js';

export function UserEconomyActions({ userId }) {
  const me = useOffice((s) => s.me);
  const trading = useEco((s) => s.trade);
  const [grant, setGrant] = useState(false);
  if (!me || userId === me.id) return null;
  const gift = () => { eco.set({ shop: { giftTo: userId } }); hotel.set({ panel: 'catalog', selected: null }); };
  return (
    <>
      <button className="ht-btn" disabled={!!trading} onClick={() => { eco.request(userId); hotel.set({ selected: null }); }} title="Intercambiar furnis y créditos"><Repeat size={14} /> Intercambiar</button>
      <button className="ht-btn" onClick={gift} title="Mandarle un furni de regalo"><Gift size={14} /> Regalar</button>
      {me.role === 'admin' && <button className={`ht-btn ${grant ? 'on' : ''}`} onClick={() => setGrant((g) => !g)} title="Dar o quitar créditos HUB"><Coins size={14} /> Créditos</button>}
      {grant && <GrantCredits userId={userId} onDone={() => setGrant(false)} />}
    </>
  );
}

export function GrantCredits({ userId, onDone }) {
  const [n, setN] = useState('100');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const send = async (sign) => {
    const delta = sign * Math.trunc(Number(n) || 0);
    if (!delta) return;
    setBusy(true);
    try {
      const r = await api.post('/hotel/admin/credits', { userId, delta, note });
      office.toast({ title: `${delta > 0 ? '💰 Diste' : 'Quitaste'} ${fmtC(Math.abs(delta))} créditos · ahora tiene ${fmtC(r.credits)}` });
      onDone?.(r.credits);
    } catch (e) { office.toast({ title: e.message, kind: 'error' }); } finally { setBusy(false); }
  };
  return (
    <div className="eco-grant">
      <input className="ht-input" inputMode="numeric" value={n} onChange={(e) => setN(e.target.value.replace(/\D/g, '').slice(0, 7))} aria-label="Cantidad" />
      <input className="ht-input" placeholder="Motivo (opcional)" maxLength={100} value={note} onChange={(e) => setNote(e.target.value)} />
      <button className="ht-btn primary sm" disabled={busy || !Number(n)} onClick={() => send(1)}><Plus size={13} /> Dar</button>
      <button className="ht-btn danger sm" disabled={busy || !Number(n)} onClick={() => send(-1)}><Minus size={13} /> Quitar</button>
    </div>
  );
}

// En la tarjeta de un furni colocado
export function ItemEconomyActions({ item, def }) {
  const me = useOffice((s) => s.me);
  const mine = item.ownerId === me?.id;
  const use = () => hotel.socket?.emit('hotel:use', { itemId: item.id });
  if (coinValue(def)) {
    return mine
      ? <button className="ht-btn primary" onClick={use}><Coins size={14} /> Canjear (+{fmtC(coinValue(def))})</button>
      : <span className="ht-muted">Vale {fmtC(coinValue(def))} créditos</span>;
  }
  if (isPresent(def)) {
    return mine
      ? <button className="ht-btn primary" onClick={() => { use(); hotel.set({ selected: null }); }}><PackageOpen size={14} /> Abrir regalo</button>
      : <span className="ht-muted">Un regalo sin abrir 🎁</span>;
  }
  return null;
}
