// Placas: imagen nítida (escala entera), ranura con tooltip y la sección "Placas" de las tarjetas.
import React, { useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Award, ExternalLink, Radio } from 'lucide-react';
import { office, useOffice } from '../../lib/store.js';
import { badgeUrl } from '../../lib/badgeArt.js';
import { badgeDef, useBadgesVersion, useUserBadges, howEarned, badgeTitle, categoryHow, useLive } from '../../lib/badges.js';
import { MAX_WORN, PLATFORM_BY_ID, CATEGORY_BY_ID } from '@shared/badges.js';
import './badges.css';

// Tamaño en múltiplos enteros de 40 px para que el pixel art se vea limpio
export const snap = (size) => 40 * Math.max(1, Math.round(size / 40));

export function BadgeImg({ id, tier, art, size = 40, locked = false, className = '' }) {
  useBadgesVersion();
  const d = art ? { art, category: 'custom' } : badgeDef(id);
  if (!d) return <span className={`bdg-img missing ${className}`} style={{ width: snap(size), height: snap(size) }} />;
  const achievement = d.category === 'achievement';
  const src = badgeUrl(d.art, achievement ? { tier: locked ? 0 : Math.max(1, tier || 1) } : {});
  const px = snap(size);
  return <img className={`bdg-img ${locked ? 'locked' : ''} ${className}`} src={src} width={px} height={px} alt={d.name || 'Placa'} draggable={false} />;
}

// Ranura con tooltip: nombre, descripción y cómo se ganó. El tooltip va en un portal con
// posición fija para que no lo recorte ninguna tarjeta con scroll.
export function BadgeSlot({ b, size = 40, onClick, selected, dim, children }) {
  const [tip, setTip] = useState(null);
  if (!b) return <span className="bdg-slot empty" style={{ '--bs': `${snap(size)}px` }} />;
  const Tag = onClick ? 'button' : 'span';
  const show = (e) => {
    const r = e.currentTarget.getBoundingClientRect();
    setTip({ x: r.left + r.width / 2, top: r.top, bottom: r.bottom });
  };
  return (
    <Tag type={onClick ? 'button' : undefined} className={`bdg-slot ${selected ? 'on' : ''} ${dim ? 'dim' : ''}`} style={{ '--bs': `${snap(size)}px` }} onClick={onClick}
      onMouseEnter={show} onMouseLeave={() => setTip(null)} onFocus={show} onBlur={() => setTip(null)} tabIndex={onClick ? 0 : -1}>
      <BadgeImg id={b.id} tier={b.tier} size={size} locked={b.locked} />
      {children}
      {tip && createPortal(<BadgeTip b={b} at={tip} />, document.body)}
    </Tag>
  );
}

function BadgeTip({ b, at }) {
  const users = useOffice((s) => s.users);
  const ref = useRef(null);
  const [pos, setPos] = useState({ left: at.x, top: at.top, ready: false });
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const w = el.offsetWidth, h = el.offsetHeight, vw = window.innerWidth;
    const left = Math.max(8, Math.min(vw - w - 8, at.x - w / 2));
    const top = at.top - h - 8 >= 8 ? at.top - h - 8 : at.bottom + 8;
    setPos({ left, top, ready: true });
  }, [at]);
  const d = badgeDef(b.id);
  return (
    <span ref={ref} className={`bdg-tip ${pos.ready ? 'show' : ''}`} role="tooltip" style={{ left: pos.left, top: pos.top }}>
      <span className="bdg-tip-art"><BadgeImg id={b.id} tier={b.tier} size={80} locked={b.locked} /></span>
      <span className="bdg-tip-txt">
        <b>{badgeTitle(b.id, b.tier)}</b>
        <span>{d?.desc}</span>
        <em>{b.locked ? categoryHow(b.id) : howEarned(b, users) || categoryHow(b.id)}</em>
        {d && <small className={`bdg-cat c-${d.category}`}>{CATEGORY_BY_ID[d.category]?.name}</small>}
      </span>
    </span>
  );
}

// Botón "Ver en Kick/Twitch…" cuando alguien está en vivo
export function LiveButton({ userId, className = 'btn' }) {
  const live = useLive(userId);
  if (!live) return null;
  const p = PLATFORM_BY_ID[live.platform];
  return (
    <a className={`${className} bdg-live-btn`} href={live.url} target="_blank" rel="noopener noreferrer" style={{ '--plat': p?.color }}>
      <span className="bdg-live-dot" /> Ver en {p?.name || 'vivo'} <ExternalLink size={13} />
    </a>
  );
}
export function LiveTag({ userId }) {
  const live = useLive(userId);
  if (!live) return null;
  return <span className="bdg-live-tag" title={`En vivo en ${PLATFORM_BY_ID[live.platform]?.name}`}><span className="bdg-live-dot" />LIVE</span>;
}

// Sección "Placas" de la tarjeta de perfil de la oficina
export function PlacasSection({ userId }) {
  const me = useOffice((s) => s.me);
  const data = useUserBadges(userId);
  const isMe = userId === me.id;
  if (!data) return null;
  const owned = new Map(data.owned.map((b) => [b.id, b]));
  const worn = data.worn.map((id) => owned.get(id)).filter(Boolean);
  const channels = (data.channels || []).filter((c) => c.verified);
  if (!worn.length && !isMe && !data.live && !channels.length) return null;
  const open = () => office.set({ modal: { type: 'badges', userId: isMe ? undefined : userId }, profileCard: null });
  return (
    <div className="pc-section bdg-section">
      <div className="pc-label row between">
        <span>Placas</span>
        <button className="link-btn" onClick={open}>{isMe ? 'Mis placas' : `Ver todas (${data.owned.length})`}</button>
      </div>
      <div className="bdg-row">
        {Array.from({ length: MAX_WORN }).map((_, i) => <BadgeSlot key={worn[i]?.id || `e${i}`} b={worn[i]} />)}
      </div>
      {!worn.length && isMe && <div className="muted small">Elige hasta {MAX_WORN} placas para lucirlas.</div>}
      {(data.live || channels.length > 0) && (
        <div className="bdg-channels">
          {data.live && <LiveButton userId={userId} className="btn primary sm" />}
          {channels.filter((c) => c.platform !== data.live?.platform).map((c) => (
            <a key={c.platform} className="bdg-chan" href={c.url} target="_blank" rel="noopener noreferrer" style={{ '--plat': PLATFORM_BY_ID[c.platform]?.color }} title={`${PLATFORM_BY_ID[c.platform]?.name}: ${c.handle}`}>
              <Radio size={12} /> {PLATFORM_BY_ID[c.platform]?.name}
            </a>
          ))}
        </div>
      )}
    </div>
  );
}

// Fila compacta para el Hotel (tarjeta de persona): las placas puestas, con su tooltip
export function HotelBadgeRow({ userId, badges = [], me, onPick }) {
  const data = useUserBadges(userId);
  const owned = new Map((data?.owned || []).map((b) => [b.id, b]));
  const list = data ? data.worn.map((id) => owned.get(id)).filter(Boolean) : badges;
  return (
    <div className="ht-badges-row bdg-hotel-row">
      {Array.from({ length: MAX_WORN }).map((_, i) => <BadgeSlot key={list[i]?.id || `e${i}`} b={list[i]} />)}
      {me && <button className="ht-link small" onClick={onPick}><Award size={12} /> Elegir</button>}
    </div>
  );
}
