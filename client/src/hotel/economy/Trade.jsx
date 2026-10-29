// Intercambio seguro: las dos ofertas lado a lado, tu inventario abajo (clic o arrastrar para ofrecer),
// créditos, "Aceptar" de cada quien y luego "Confirmar". Cualquier cambio quita los "Aceptar".
import React, { useEffect, useMemo, useState } from 'react';
import { Repeat, Check, X, Lock, ShieldCheck, Hourglass, Gem } from 'lucide-react';
import { office } from '../../lib/store.js';
import { FURNI_BY_ID } from '@shared/hotelCatalog.js';
import { useHotel } from '../hotelStore.js';
import { FurniIcon } from '../Panels.jsx';
import { eco, useEco, fmtC } from './ecoStore.js';
import { Coin } from './ui.jsx';

const group = (items) => {
  const m = new Map();
  for (const it of items) {
    const def = FURNI_BY_ID[it.type];
    if (!def) continue;
    const k = `${it.type}|${it.color || ''}`;
    if (!m.has(k)) m.set(k, { key: k, def, color: it.color, items: [] });
    m.get(k).items.push(it);
  }
  return [...m.values()].sort((a, b) => a.def.name.localeCompare(b.def.name));
};

function Offer({ title, offer, accepted, confirmed, phase, mine, onRemove, onDrop }) {
  const [over, setOver] = useState(false);
  const groups = group(offer.items);
  const slots = Math.max(9, Math.ceil((groups.length + 1) / 3) * 3);
  return (
    <div
      className={`eco-offer ${mine ? 'mine' : ''} ${accepted ? 'ok' : ''} ${over ? 'over' : ''}`}
      onDragOver={mine ? (e) => { e.preventDefault(); setOver(true); } : undefined}
      onDragLeave={mine ? () => setOver(false) : undefined}
      onDrop={mine ? (e) => { e.preventDefault(); setOver(false); const id = Number(e.dataTransfer.getData('text/eco-item')); if (id) onDrop(id); } : undefined}
    >
      <div className="eco-offer-head">
        <b>{title}</b>
        <span className={`eco-state ${phase === 'confirm' ? (confirmed ? 'ok' : 'wait') : accepted ? 'ok' : 'wait'}`}>
          {phase === 'confirm' ? (confirmed ? <><ShieldCheck size={12} /> Confirmó</> : <><Hourglass size={12} /> Por confirmar</>) : accepted ? <><Check size={12} /> Aceptó</> : <><Hourglass size={12} /> Armando</>}
        </span>
      </div>
      <div className="eco-slots">
        {Array.from({ length: slots }, (_, i) => {
          const g = groups[i];
          if (!g) return <div key={i} className="eco-slot empty" />;
          return (
            <button key={g.key} className={`eco-slot ${g.def.exclusive ? 'excl' : ''}`} disabled={!mine} title={mine ? `${g.def.name} · clic para quitar` : g.def.name} onClick={() => mine && onRemove(g.items[g.items.length - 1].id)}>
              <FurniIcon type={g.def.id} color={g.color} size={40} />
              {g.items.length > 1 && <span className="ht-count">{g.items.length}</span>}
              {g.def.exclusive && <span className="ht-gem"><Gem size={9} /></span>}
              {g.def.id === 'economia_regalo' && <span className="eco-slot-tag">🎁</span>}
            </button>
          );
        })}
      </div>
      <div className="eco-offer-credits"><Coin size={14} /> <b>{fmtC(offer.credits)}</b> créditos</div>
    </div>
  );
}

export default function TradeWindow() {
  const T = useEco((s) => s.trade);
  const credits = useEco((s) => s.credits);
  const inv = useHotel((s) => s.inventory);
  const [cr, setCr] = useState('');
  useEffect(() => { setCr(T?.mine.credits ? String(T.mine.credits) : ''); }, [T?.id, T?.mine.credits]); // eslint-disable-line react-hooks/exhaustive-deps
  const offered = useMemo(() => new Set(T?.mine.items.map((i) => i.id) || []), [T]);
  const left = useMemo(() => group((inv || []).filter((i) => !offered.has(i.id))), [inv, offered]);
  if (!T) return null;
  const add = (id) => eco.toggleItem(id);
  const setCredits = () => {
    const n = Math.max(0, Math.trunc(Number(cr) || 0));
    if (credits != null && n > credits) return office.toast({ title: `Solo tienes ${fmtC(credits)} créditos` });
    if (n !== T.mine.credits) eco.offer({ credits: n });
  };
  const confirmPhase = T.phase === 'confirm';
  return (
    <div className="eco-trade ht-window" onPointerDown={(e) => e.stopPropagation()} role="dialog" aria-label="Intercambio">
      <div className="ht-win-head"><Repeat size={16} /> Intercambio con {T.other.name}<button className="ht-x" onClick={() => eco.cancel()} aria-label="Cancelar intercambio"><X size={16} /></button></div>
      <div className="ht-win-body">
        <div className="eco-offers">
          <Offer title="Tú ofreces" offer={T.mine} accepted={T.accepted.mine} confirmed={T.confirmed.mine} phase={T.phase} mine onRemove={add} onDrop={(id) => !offered.has(id) && add(id)} />
          <div className="eco-swap"><Repeat size={18} /></div>
          <Offer title={`${T.other.name} ofrece`} offer={T.theirs} accepted={T.accepted.theirs} confirmed={T.confirmed.theirs} phase={T.phase} />
        </div>
        {confirmPhase ? (
          <div className="eco-confirm-note"><Lock size={16} /><span><b>Los dos aceptaron.</b> Revisa bien lo que vas a recibir y confirma. Si alguien cambia algo, hay que volver a aceptar.</span></div>
        ) : (
          <>
            <div className="eco-credit-row">
              <Coin size={16} />
              <input className="ht-input" inputMode="numeric" placeholder="Créditos a ofrecer" value={cr} onChange={(e) => setCr(e.target.value.replace(/\D/g, '').slice(0, 9))} onKeyDown={(e) => e.key === 'Enter' && setCredits()} onBlur={setCredits} />
              <span className="ht-muted">Tienes {fmtC(credits)}</span>
            </div>
            <div className="eco-inv">
              <small className="ht-muted">Tu inventario · clic o arrastra a tu oferta</small>
              <div className="eco-inv-grid">
                {!left.length && <span className="ht-muted">No te quedan furnis para ofrecer</span>}
                {left.map((g) => (
                  <button key={g.key} className="eco-slot" draggable title={g.def.name} onClick={() => add(g.items[0].id)} onDragStart={(e) => { e.dataTransfer.setData('text/eco-item', String(g.items[0].id)); e.dataTransfer.effectAllowed = 'move'; }}>
                    <FurniIcon type={g.def.id} color={g.color} size={36} />
                    {g.items.length > 1 && <span className="ht-count">{g.items.length}</span>}
                  </button>
                ))}
              </div>
            </div>
          </>
        )}
      </div>
      <div className="ht-win-foot">
        <button className="ht-btn ghost" onClick={() => eco.cancel()}>Cancelar</button>
        {confirmPhase
          ? <button className="ht-btn primary" disabled={T.confirmed.mine} onClick={() => eco.confirm()}><ShieldCheck size={14} /> {T.confirmed.mine ? 'Esperando…' : 'Confirmar intercambio'}</button>
          : T.accepted.mine
            ? <button className="ht-btn" onClick={() => eco.accept(false)}><X size={14} /> Quitar aceptar</button>
            : <button className="ht-btn primary" onClick={() => eco.accept(true)}><Check size={14} /> Aceptar</button>}
      </div>
    </div>
  );
}
