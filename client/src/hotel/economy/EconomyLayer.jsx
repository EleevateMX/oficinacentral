// Capa de la economía sobre la sala: monedero de la barra de arriba, invitaciones a intercambiar,
// ventana de intercambio, regalo abierto (animación + mensaje) y efectos flotantes (+100 al canjear).
import React, { useEffect, useRef, useState } from 'react';
import { Repeat, Ticket, Sparkles, X, Gift, Coins } from 'lucide-react';
import { office } from '../../lib/store.js';
import { toScreen } from '@shared/hotel.js';
import { FURNI_BY_ID } from '@shared/hotelCatalog.js';
import { coinValue, DAILY_CREDITS } from '@shared/hotelEconomy.js';
import { hotel, useHotel } from '../hotelStore.js';
import { FurniIcon } from '../Panels.jsx';
import { eco, useEco, fmtC, REASON } from './ecoStore.js';
import { Coin, BigPreview } from './ui.jsx';
import TradeWindow from './Trade.jsx';
import './economy.css';

// Botón "Intercambiar" de la tarjeta social (agente B): si existe socialStore, abre el intercambio desde ahí
const social = Object.values(import.meta.glob('../social/socialStore.js', { eager: true }))[0];
if (social?.socialHooks) social.socialHooks.onTrade = (id) => eco.request(id);

export default function EconomyLayer() {
  useEffect(() => { eco.attach(); eco.load(); return () => eco.detach(); }, []);
  return (
    <>
      <Invites />
      <TradeWindow />
      <PresentReveal />
      <RoomFx />
    </>
  );
}

// ---------- Monedero (barra de arriba) ----------
export function WalletBadge() {
  const credits = useEco((s) => s.credits);
  const bump = useEco((s) => s.bump);
  const gain = useEco((s) => s.gain);
  const [open, setOpen] = useState(false);
  const [pop, setPop] = useState(false);
  useEffect(() => { if (!bump) return undefined; setPop(true); const t = setTimeout(() => setPop(false), 700); return () => clearTimeout(t); }, [bump]);
  useEffect(() => { eco.set({ walletOpen: open }); if (open) eco.loadLog(); }, [open]);
  const recent = gain && Date.now() - gain.at < 2500;
  return (
    <div className="eco-wallet-wrap">
      <button className={`eco-wallet ${pop ? 'pop' : ''}`} onClick={() => setOpen((o) => !o)} title="Tus créditos HUB">
        <Coin size={18} /><b>{credits == null ? '…' : fmtC(credits)}</b><span className="ht-hide-sm">créditos</span>
        {recent && <i key={gain.at} className="eco-gain">+{fmtC(gain.delta)}</i>}
      </button>
      {open && <WalletPop onClose={() => setOpen(false)} />}
    </div>
  );
}

function WalletPop({ onClose }) {
  const log = useEco((s) => s.log);
  const credits = useEco((s) => s.credits);
  const every = useEco((s) => s.onlineEveryMs);
  const per = useEco((s) => s.onlineCredits);
  const inv = useHotel((s) => s.inventory);
  const coins = (inv || []).filter((i) => coinValue(FURNI_BY_ID[i.type]));
  const coinTotal = coins.reduce((s, i) => s + coinValue(FURNI_BY_ID[i.type]), 0);
  const [code, setCode] = useState('');
  const ref = useRef(null);
  useEffect(() => {
    const f = (e) => { if (ref.current && !ref.current.contains(e.target) && !e.target.closest?.('.eco-wallet')) onClose(); };
    window.addEventListener('pointerdown', f);
    return () => window.removeEventListener('pointerdown', f);
  }, [onClose]);
  const redeemAll = async () => {
    try { const r = await eco.redeemCoins(); office.toast({ title: `🪙 Canjeaste ${r.removed.length} moneda${r.removed.length > 1 ? 's' : ''}: +${fmtC(r.amount)} créditos` }); } catch (e) { office.toast({ title: e.message, kind: 'error' }); }
  };
  const redeemCode = async (e) => {
    e.preventDefault();
    try { const r = await eco.redeemCode(code); setCode(''); office.toast({ title: `🎟️ ¡Código canjeado!${r.credits ? ` +${fmtC(r.credits)} créditos` : ''}${r.items?.length ? ` · ${FURNI_BY_ID[r.items[0].type]?.name}` : ''}` }); } catch (er) { office.toast({ title: er.message, kind: 'error' }); }
  };
  const time = (t) => new Date(t).toLocaleString('es-MX', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  return (
    <div className="eco-pop" ref={ref} onPointerDown={(e) => e.stopPropagation()}>
      <div className="eco-pop-head">
        <Coin size={34} />
        <div><small>Créditos HUB</small><b>{fmtC(credits)}</b></div>
        <button className="ht-x" onClick={onClose} aria-label="Cerrar"><X size={14} /></button>
      </div>
      <div className="eco-pop-tips">
        <span>☀️ <b>+{DAILY_CREDITS}</b> diario al entrar</span>
        <span>⏱️ <b>+{per}</b> cada {Math.round(every / 60e3) || 1} min en una sala</span>
      </div>
      {coins.length > 0 && (
        <button className="ht-btn primary sm eco-pop-coins" onClick={redeemAll}><Coins size={14} /> Canjear {coins.length} moneda{coins.length > 1 ? 's' : ''} del inventario (+{fmtC(coinTotal)})</button>
      )}
      <form className="eco-pop-code" onSubmit={redeemCode}>
        <Ticket size={15} />
        <input className="ht-input" placeholder="Código de canje" value={code} maxLength={24} onChange={(e) => setCode(e.target.value.toUpperCase())} />
        <button className="ht-btn sm" disabled={!code.trim()}>Canjear</button>
      </form>
      <small className="ht-muted">Movimientos</small>
      <div className="eco-log">
        {!log.length && <span className="ht-muted">Aún no hay movimientos.</span>}
        {log.map((m) => (
          <div key={m.id} className="eco-log-row">
            <span className={`eco-delta ${m.delta > 0 ? 'in' : 'out'}`}>{m.delta > 0 ? '+' : '−'}{fmtC(Math.abs(m.delta))}</span>
            <span className="eco-log-what"><b>{REASON[m.reason] || m.reason}</b>{m.note && m.note !== REASON[m.reason] ? <i>{m.note}</i> : null}</span>
            <span className="eco-log-time">{time(m.at)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------- Invitaciones ----------
function Invites() {
  const invites = useEco((s) => s.invites);
  useEffect(() => {
    if (!invites.length) return undefined;
    const t = setInterval(() => eco.set((st) => ({ invites: st.invites.filter((x) => Date.now() - x.at < 55e3) })), 3000);
    return () => clearInterval(t);
  }, [invites.length]);
  if (!invites.length) return null;
  return (
    <div className="ht-bells eco-invites">
      {invites.map((m) => (
        <div key={m.from} className="ht-bell">
          <Repeat size={16} className="ht-ring" /> <span><b>{m.name}</b> quiere intercambiar contigo</span>
          <button className="ht-btn primary sm" onClick={() => eco.answer(m.from, true)}>Intercambiar</button>
          <button className="ht-btn sm" onClick={() => eco.answer(m.from, false)}>No</button>
        </div>
      ))}
    </div>
  );
}

// ---------- Regalo abierto ----------
function PresentReveal() {
  const r = useEco((s) => s.reveal);
  const [stage, setStage] = useState(0);
  useEffect(() => {
    if (!r) return undefined;
    setStage(0);
    const t1 = setTimeout(() => setStage(1), 650), t2 = setTimeout(() => setStage(2), 1100);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [r]);
  if (!r) return null;
  const def = FURNI_BY_ID[r.type];
  const close = () => eco.set({ reveal: null });
  return (
    <div className="ht-overlay eco-reveal-wrap" onPointerDown={(e) => { e.stopPropagation(); if (e.target === e.currentTarget) close(); }}>
      <div className={`eco-reveal st${stage}`}>
        <div className="eco-reveal-rays" />
        <div className="eco-reveal-box"><BigPreview def={FURNI_BY_ID.economia_regalo} color={r.wrap} w={180} h={150} /></div>
        <div className="eco-reveal-wait">Abriendo tu regalo…</div>
        <div className="eco-reveal-item">{def && <BigPreview def={def} color={r.color} rot={def.rots[0]} w={200} h={160} />}</div>
        {Array.from({ length: 14 }, (_, i) => <i key={i} className="eco-confetti" style={{ '--i': i }} />)}
        <div className="eco-reveal-text">
          <small><Gift size={12} /> Regalo de {r.fromName}</small>
          <b>{def?.name || 'Un furni'}</b>
          {r.message && <p>“{r.message}”</p>}
          <span className="ht-muted">{r.placedId ? 'Quedó justo donde estaba la caja.' : 'Lo guardamos en tu inventario.'}</span>
          <button className="ht-btn primary" onClick={close}><Sparkles size={14} /> ¡Gracias!</button>
        </div>
      </div>
    </div>
  );
}

// ---------- Efectos flotantes sobre la sala ----------
function RoomFx() {
  const fx = useEco((s) => s.fx);
  const [, tick] = useState(0);
  useEffect(() => {
    if (!fx.length) return undefined;
    let raf = 0;
    const loop = () => { tick((n) => n + 1); raf = requestAnimationFrame(loop); };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [fx.length]);
  const eng = hotel.engine;
  if (!fx.length || !eng) return null;
  return (
    <div className="eco-fx-layer">
      {fx.map((f) => {
        const s = toScreen((f.x ?? 0) + 0.5, (f.y ?? 0) + 0.5, (f.z ?? 0) + 0.6);
        const left = eng.cam.x + s.sx * eng.cam.zoom, top = eng.cam.y + s.sy * eng.cam.zoom;
        return f.kind === 'coin'
          ? <div key={f.id} className="eco-fx coin" style={{ left, top }}><Coin size={18} /> {f.text}</div>
          : <div key={f.id} className="eco-fx burst" style={{ left, top, '--c': f.color || '#FE3377' }}>{Array.from({ length: 10 }, (_, i) => <i key={i} style={{ '--i': i }} />)}</div>;
      })}
    </div>
  );
}
