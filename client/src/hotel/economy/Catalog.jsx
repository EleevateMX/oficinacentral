// Catálogo del Hotel con créditos HUB: páginas por categoría y línea (con su banner), vista previa grande
// con rotación y colores, "comprar N", confirmación, regalos con mensaje y canje de códigos.
import React, { useEffect, useMemo, useState } from 'react';
import { ShoppingBag, Search, RotateCw, Minus, Plus, Gift, Gem, Ticket, Sparkles, Home, X, Check } from 'lucide-react';
import { office, useOffice } from '../../lib/store.js';
import { Avatar } from '../../components/ui.jsx';
import * as HC from '@shared/hotelCatalog.js';
import { MAX_INVENTORY } from '@shared/hotel.js';
import { inShop, quote, MAX_BUY_QTY, PRESENT_WRAPS, PRESENT_TYPE, MAX_GIFT_MSG, DAILY_CREDITS, ONLINE_CREDITS } from '@shared/hotelEconomy.js';
import { hotel, useHotel } from '../hotelStore.js';
import { Window, FurniIcon } from '../Panels.jsx';
import { eco, useEco, fmtC } from './ecoStore.js';
import { Coin, Price, BigPreview } from './ui.jsx';
import './economy.css';

const { HOTEL_CATS, HOTEL_FURNI, FURNI_BY_ID } = HC;
const LINES = HC.HOTEL_LINES || [];
const CAT_DESC = {
  sillas: 'Para sentarse con estilo: sillas, sofás, puffs y sillones.',
  mesas: 'Mesas, barras y escritorios. Encima se pueden apilar cosas.',
  camas: 'Para acostarse un rato (sí, te puedes acostar).',
  luz: 'Lámparas y neones que se prenden y se apagan.',
  deco: 'Lo que le da vida a tu sala.',
  plantas: 'Verde para cualquier rincón.',
  pisos: 'Tapetes y losetas: se camina encima.',
  pared: 'Pósters, ventanas, repisas y letreros para tus paredes.',
  gtahub: 'Rarezas de la marca. Solo admins las compran; se pueden intercambiar.',
  diversion: 'Dados, teletransportadores, rejas y monedas.',
};
const HUES = ['#FE3377', '#ff7a3d', '#FFCC00', '#2fb67c', '#3a86ff', '#8e5cf7', '#e05ca5', '#00b4d8'];
const hueOf = (id) => HUES[[...String(id)].reduce((s, c) => s + c.charCodeAt(0), 0) % HUES.length];
const shown = (f) => inShop(f);

export default function Catalog() {
  const me = useOffice((s) => s.me);
  const admin = me?.role === 'admin';
  const credits = useEco((s) => s.credits);
  const preset = useEco((s) => s.shop);
  const [page, setPage] = useState(preset?.giftTo ? { kind: 'cat', id: 'deco' } : { kind: 'home' });
  const [q, setQ] = useState('');
  const [sel, setSel] = useState(null);
  const [color, setColor] = useState(null);
  const [rot, setRot] = useState(0);
  const [qty, setQty] = useState(1);
  const [confirm, setConfirm] = useState(null); // { gift: bool }
  const [giftTo, setGiftTo] = useState(preset?.giftTo || null);
  useEffect(() => { if (eco.state.credits == null) eco.load(); }, []);
  useEffect(() => { if (preset?.giftTo) { setGiftTo(preset.giftTo); eco.set({ shop: null }); } }, [preset]);

  const items = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (s) return HOTEL_FURNI.filter((f) => shown(f) && (f.name.toLowerCase().includes(s) || f.id.includes(s)));
    if (page.kind === 'line') return HOTEL_FURNI.filter((f) => shown(f) && f.line === page.id);
    if (page.kind === 'cat') return HOTEL_FURNI.filter((f) => shown(f) && f.cat === page.id);
    return [];
  }, [q, page]);
  const def = sel && FURNI_BY_ID[sel];
  useEffect(() => { if (def) { setColor(def.colors?.[0] || null); setRot(def.rots?.[0] ?? 0); setQty(1); } }, [sel]); // eslint-disable-line react-hooks/exhaustive-deps
  // Al cambiar de página, elegir el primero (como en el catálogo clásico)
  useEffect(() => { if (items.length && !items.some((f) => f.id === sel)) setSel(items[0].id); }, [items]); // eslint-disable-line react-hooks/exhaustive-deps

  const go = (p) => { setPage(p); setQ(''); };
  const head = q.trim() ? { title: `Resultados para “${q.trim()}”`, desc: `${items.length} furni${items.length === 1 ? '' : 's'}`, color: '#3a3a46' }
    : page.kind === 'line' ? { title: LINES.find((l) => l.id === page.id)?.name || page.id, desc: LINES.find((l) => l.id === page.id)?.desc || '', color: hueOf(page.id), line: true }
      : page.kind === 'cat' ? { title: HOTEL_CATS.find((c) => c.id === page.id)?.name, desc: CAT_DESC[page.id] || '', color: hueOf(page.id) }
        : null;
  const rotate = () => { if (!def || def.kind === 'wall') return; const r = def.rots; setRot(r[(r.indexOf(rot) + 1) % r.length]); };
  const qt = def ? quote(def, qty, { admin }) : null;
  const canBuy = def && !qt?.error;
  const short = canBuy && credits != null && qt.total > credits;

  return (
    <Window title="Catálogo" icon={ShoppingBag} onClose={() => hotel.set({ panel: null })} className="ht-shop eco-shop">
      <div className="eco-shop-body">
        <nav className="ht-cats eco-nav">
          <div className="eco-balance" title="Tus créditos HUB"><Coin size={18} /><b>{credits == null ? '…' : fmtC(credits)}</b><span>créditos</span></div>
          <div className="ht-search-wrap"><Search size={14} /><input className="ht-input" placeholder="Buscar furni…" value={q} onChange={(e) => setQ(e.target.value)} /></div>
          <button className={`ht-cat ${!q && page.kind === 'home' ? 'on' : ''}`} onClick={() => go({ kind: 'home' })}><Home size={13} /> Inicio</button>
          <button className={`ht-cat ${!q && page.kind === 'codes' ? 'on' : ''}`} onClick={() => go({ kind: 'codes' })}><Ticket size={13} /> Canjear código</button>
          <h4 className="ht-line ht-cats-title">Categorías</h4>
          {HOTEL_CATS.map((c) => <button key={c.id} className={`ht-cat ${!q && page.kind === 'cat' && page.id === c.id ? 'on' : ''}`} onClick={() => go({ kind: 'cat', id: c.id })}><i className="eco-dot" style={{ background: hueOf(c.id) }} />{c.name}</button>)}
          {LINES.length > 0 && <h4 className="ht-line ht-cats-title">Líneas</h4>}
          {LINES.map((l) => <button key={l.id} className={`ht-cat ${!q && page.kind === 'line' && page.id === l.id ? 'on' : ''}`} title={l.desc || ''} onClick={() => go({ kind: 'line', id: l.id })}><i className="eco-dot" style={{ background: hueOf(l.id) }} />{l.name}</button>)}
        </nav>
        <div className="eco-page">
          {!q.trim() && page.kind === 'home' && <FrontPage go={go} pick={(id, p) => { go(p); setSel(id); }} />}
          {!q.trim() && page.kind === 'codes' && <CodesPage />}
          {head && (
            <>
              <Banner {...head} sample={items.slice(0, 3)} />
              <div className="eco-items">
                {!items.length && <p className="ht-muted">No hay furnis con ese nombre</p>}
                <div className="ht-grid eco-grid">
                  {items.map((f) => (
                    <button key={f.id} className={`ht-cell eco-cell ${sel === f.id ? 'on' : ''} ${f.exclusive ? 'excl' : ''}`} onClick={() => setSel(f.id)} onDoubleClick={() => { setSel(f.id); setConfirm({ gift: false }); }} title={f.name}>
                      <FurniIcon type={f.id} />
                      {f.exclusive && <span className="ht-gem"><Gem size={10} /></span>}
                      <span className="ht-cell-name">{f.name}</span>
                      <Price def={f} admin={admin} className="mini" />
                    </button>
                  ))}
                </div>
              </div>
              {def && (
                <div className="eco-detail">
                  <div className="eco-stage">
                    <BigPreview def={def} color={color} rot={rot} w={190} h={140} />
                    {def.kind === 'floor' && def.rots.length > 1 && <button className="eco-rot" onClick={rotate} title="Girar"><RotateCw size={15} /></button>}
                  </div>
                  <div className="eco-detail-info">
                    <b className="eco-name">{def.name}</b>
                    <div className="eco-tags">
                      <Price def={def} admin={admin} />
                      {def.line && <span className="eco-tag">{LINES.find((l) => l.id === def.line)?.name}</span>}
                      {def.exclusive && <span className="ht-excl small"><Gem size={10} /> Rareza · valor {fmtC(def.price)}</span>}
                    </div>
                    <span className="ht-muted eco-what">{describe(def)}</span>
                    {def.colors?.length > 1 && (
                      <div className="ht-swatches">{def.colors.map((c) => <button key={c} className={`ht-swatch ${color === c ? 'on' : ''}`} style={{ background: c }} onClick={() => setColor(c)} aria-label={`Color ${c}`} />)}</div>
                    )}
                    <div className="eco-buyrow">
                      <div className="eco-qty" aria-label="Cantidad">
                        <button onClick={() => setQty((n) => Math.max(1, n - 1))} disabled={qty <= 1} aria-label="Menos"><Minus size={13} /></button>
                        <input value={qty} inputMode="numeric" onChange={(e) => setQty(Math.max(1, Math.min(MAX_BUY_QTY, Math.trunc(Number(e.target.value.replace(/\D/g, '')) || 1))))} />
                        <button onClick={() => setQty((n) => Math.min(MAX_BUY_QTY, n + 1))} disabled={qty >= MAX_BUY_QTY} aria-label="Más"><Plus size={13} /></button>
                      </div>
                      {def.exclusive && !admin
                        ? <button className="ht-btn" disabled title="Solo los admins pueden comprar furnis exclusivos">Solo admins</button>
                        : <button className="ht-btn primary" onClick={() => setConfirm({ gift: false })}>Comprar{qty > 1 ? ` ${qty}` : ''}{canBuy && qt.total ? <> · <Coin size={12} /> {fmtC(qt.total)}</> : ''}</button>}
                      {canBuy && <button className="ht-btn" onClick={() => setConfirm({ gift: true })} title="Mandarlo como regalo"><Gift size={14} /> Regalar</button>}
                    </div>
                    {short && <span className="eco-short">Te faltan <Coin size={11} /> {fmtC(qt.total - credits)}. Gana créditos con el premio diario y estando en el Hotel.</span>}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
      {confirm && def && <Confirm def={def} color={color} rot={rot} qty={confirm.gift ? 1 : qty} gift={confirm.gift} admin={admin} credits={credits} giftTo={giftTo} setGiftTo={setGiftTo} onClose={() => setConfirm(null)} />}
    </Window>
  );
}

function describe(def) {
  if (def.coin) return `Se canjea por ${fmtC(def.coin)} créditos: colócala y dale doble clic.`;
  if (def.interact === 'teleport') return 'Viene en par: uno te lleva al otro (aunque esté en otra sala).';
  if (def.interact === 'dice') return 'Dale doble clic para tirarlo.';
  if (def.interact === 'gate') return 'Abre y cierra el paso.';
  if (def.interact === 'toggle') return 'Se prende y se apaga con doble clic.';
  if (def.lay) return 'Te puedes acostar.';
  if (def.sit) return 'Te puedes sentar.';
  if (def.walk) return 'Se camina encima.';
  if (def.stack) return 'Puedes poner cosas encima.';
  if (def.kind === 'wall') return 'Va en la pared.';
  return `Ocupa ${def.w}×${def.l} casilla${def.w * def.l > 1 ? 's' : ''}.`;
}

function Banner({ title, desc, color, sample = [], line }) {
  return (
    <div className="eco-banner" style={{ '--c': color }}>
      <div className="eco-banner-text">
        <small>{line ? 'Línea' : 'Catálogo'}</small>
        <h3>{title}</h3>
        {desc && <p>{desc}</p>}
      </div>
      <div className="eco-banner-art">{sample.map((f, i) => <span key={f.id} style={{ '--i': i }}><FurniIcon type={f.id} size={i === 1 ? 64 : 50} /></span>)}</div>
    </div>
  );
}

function FrontPage({ go, pick }) {
  const credits = useEco((s) => s.credits);
  const coins = HOTEL_FURNI.filter((f) => f.coin);
  const picks = ['chair_gamer', 'hub_throne', 'lamp_lava', 'sofa_2', 'arcade', 'neon_sign'].map((id) => FURNI_BY_ID[id]).filter(Boolean);
  return (
    <div className="eco-front">
      <div className="eco-banner hero" style={{ '--c': '#FE3377' }}>
        <div className="eco-banner-text">
          <small>Catálogo MeDed Friends</small>
          <h3>¡Decora a tu manera!</h3>
          <p>Compra con créditos HUB, regala a tu crew e intercambia rarezas.</p>
        </div>
        <div className="eco-hero-coin"><Coin size={64} /><b>{credits == null ? '…' : fmtC(credits)}</b></div>
      </div>
      <div className="eco-earn">
        <div><b><Coin size={13} /> +{DAILY_CREDITS}</b><span>cada día que entras a MeDed Friends</span></div>
        <div><b><Coin size={13} /> +{ONLINE_CREDITS}</b><span>cada 15 minutos dentro de una sala</span></div>
        <div><b><Ticket size={13} /> Códigos</b><span><button className="ht-link" onClick={() => go({ kind: 'codes' })}>Canjea un código</button> de eventos</span></div>
      </div>
      <h4 className="ht-line">Monedas HUB · guárdalas, intercámbialas o canjéalas</h4>
      <div className="eco-feature">
        {coins.map((f) => (
          <button key={f.id} className="eco-feat" onClick={() => pick(f.id, { kind: 'line', id: 'economia' })}>
            <FurniIcon type={f.id} size={52} /><span>{f.name}</span><Price def={f} className="mini" />
          </button>
        ))}
      </div>
      <h4 className="ht-line">Recomendados</h4>
      <div className="eco-feature">
        {picks.map((f) => (
          <button key={f.id} className="eco-feat" onClick={() => pick(f.id, f.line ? { kind: 'line', id: f.line } : { kind: 'cat', id: f.cat })}>
            <FurniIcon type={f.id} size={52} /><span>{f.name}</span><Price def={f} admin={office.state.me?.role === 'admin'} className="mini" />
          </button>
        ))}
      </div>
    </div>
  );
}

function CodesPage() {
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(null);
  const redeem = async (e) => {
    e.preventDefault();
    if (!code.trim()) return;
    setBusy(true);
    try {
      const r = await eco.redeemCode(code);
      setDone(r); setCode('');
    } catch (er) { office.toast({ title: er.message, kind: 'error' }); } finally { setBusy(false); }
  };
  return (
    <div className="eco-front">
      <div className="eco-banner" style={{ '--c': '#8e5cf7' }}>
        <div className="eco-banner-text"><small>Códigos</small><h3>Canjear un código</h3><p>Los admins regalan códigos en eventos: créditos o furnis.</p></div>
        <div className="eco-banner-art"><span style={{ '--i': 1 }}><Ticket size={56} /></span></div>
      </div>
      <form className="eco-code" onSubmit={redeem}>
        <input className="ht-input" placeholder="Ej. HUB-AB12CD34" value={code} maxLength={24} onChange={(e) => setCode(e.target.value.toUpperCase())} autoFocus />
        <button className="ht-btn primary" disabled={busy || !code.trim()}>Canjear</button>
      </form>
      {done && (
        <div className="eco-code-done">
          <Sparkles size={18} />
          <span>¡Listo! {done.credits ? <>Recibiste <b><Coin size={12} /> {fmtC(done.credits)}</b> créditos</> : null}{done.credits && done.items?.length ? ' y ' : ''}{done.items?.length ? <>recibiste <b>{FURNI_BY_ID[done.items[0].type]?.name}</b> en tu inventario</> : null}.</span>
        </div>
      )}
    </div>
  );
}

// Confirmación de compra (o de regalo) con vista previa
function Confirm({ def, color, rot, qty, gift, admin, credits, giftTo, setGiftTo, onClose }) {
  const users = useOffice((s) => s.users);
  const meId = useOffice((s) => s.me?.id);
  const inv = useHotel((s) => s.inventory);
  const [msg, setMsg] = useState('');
  const [wrap, setWrap] = useState(PRESENT_WRAPS[0]);
  const [uq, setUq] = useState('');
  const [busy, setBusy] = useState(false);
  const q = quote(def, qty, { admin });
  const to = giftTo && users[giftTo];
  const list = useMemo(() => Object.values(users).filter((u) => !u.disabled && u.id !== meId && (!uq || u.displayName.toLowerCase().includes(uq.toLowerCase()) || u.username?.toLowerCase().includes(uq.toLowerCase())))
    .sort((a, b) => a.displayName.localeCompare(b.displayName)).slice(0, 6), [users, uq, meId]);
  const after = credits == null || q.error ? null : credits - q.total;
  const full = !gift && inv && inv.length + (q.items || 0) > MAX_INVENTORY;
  const go = async () => {
    setBusy(true);
    try {
      if (gift) {
        await eco.buy({ type: def.id, color, gift: { userId: to.id, message: msg, wrap } });
        office.toast({ title: `🎁 Le mandaste ${def.name} a ${to.displayName}` });
      } else {
        const r = await eco.buy({ type: def.id, color, qty });
        office.toast({ title: `✅ ${r.items.length > 1 ? `${r.items.length}× ` : ''}${def.name} ya ${r.items.length > 1 ? 'están' : 'está'} en tu inventario`, action: { label: 'Ver', run: () => hotel.set({ panel: 'inventory' }) } });
      }
      onClose();
    } catch (e) { office.toast({ title: e.message, kind: 'error' }); } finally { setBusy(false); }
  };
  return (
    <div className="ht-overlay eco-confirm-wrap" onPointerDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="ht-window small eco-confirm">
        <div className="ht-win-head">{gift ? <><Gift size={16} /> Mandar como regalo</> : <><ShoppingBag size={16} /> Confirmar compra</>}<button className="ht-x" onClick={onClose} aria-label="Cerrar"><X size={16} /></button></div>
        <div className="ht-win-body">
          <div className="eco-confirm-top">
            <div className="eco-stage sm">{gift ? <BigPreview key={wrap} def={FURNI_BY_ID[PRESENT_TYPE]} color={wrap} w={120} h={110} /> : <BigPreview def={def} color={color} rot={rot} w={120} h={110} />}</div>
            <div>
              <b className="eco-name">{qty > 1 ? `${qty}× ` : ''}{def.name}</b>
              {gift && <span className="ht-muted">Llega envuelto: lo abre al colocarlo en una sala</span>}
              {q.error ? <span className="ht-error">{q.error}</span> : (
                <div className="eco-sum">
                  <span>Total</span><b><Coin size={13} /> {fmtC(q.total)}</b>
                  {after != null && <><span>Te quedan</span><b className={after < 0 ? 'neg' : ''}>{fmtC(after)}</b></>}
                </div>
              )}
            </div>
          </div>
          {gift && (
            <>
              {to ? (
                <div className="eco-to"><Avatar user={to} size={26} showStatus={false} /> Para <b>{to.displayName}</b><button className="ht-link" onClick={() => setGiftTo(null)}>Cambiar</button></div>
              ) : (
                <div className="ht-gift">
                  <input className="ht-input" autoFocus placeholder="¿A quién se lo regalas?" value={uq} onChange={(e) => setUq(e.target.value)} />
                  <div className="ht-gift-list">{list.map((u) => <button key={u.id} onClick={() => setGiftTo(u.id)}><Avatar user={u} size={22} showStatus={false} /> {u.displayName}</button>)}</div>
                </div>
              )}
              <label className="ht-field"><span>Mensaje (opcional)</span><textarea className="ht-input eco-msg" maxLength={MAX_GIFT_MSG} value={msg} onChange={(e) => setMsg(e.target.value)} placeholder="¡Para tu sala nueva! 🎉" /></label>
              <div className="ht-field"><span>Papel</span><div className="ht-swatches">{PRESENT_WRAPS.map((c) => <button key={c} className={`ht-swatch ${wrap === c ? 'on' : ''}`} style={{ background: c }} onClick={() => setWrap(c)} aria-label={`Papel ${c}`} />)}</div></div>
            </>
          )}
          {after != null && after < 0 && <span className="eco-short">No te alcanza: te faltan <Coin size={11} /> {fmtC(-after)}.</span>}
          {full && <span className="eco-short">Tu inventario está lleno (máximo {MAX_INVENTORY}).</span>}
        </div>
        <div className="ht-win-foot">
          <button className="ht-btn ghost" onClick={onClose}>Cancelar</button>
          <button className="ht-btn primary" disabled={busy || !!q.error || (after != null && after < 0) || full || (gift && !to)} onClick={go}><Check size={14} /> {gift ? 'Mandar regalo' : 'Comprar'}</button>
        </div>
      </div>
    </div>
  );
}

