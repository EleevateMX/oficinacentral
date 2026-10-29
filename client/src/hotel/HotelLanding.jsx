// Hotel (agente D): vista de llegada ("Hotel view") con la torre al atardecer y el panel del elevador,
// el viaje en elevador (puertas, contador de pisos, "ding") y el panel de pisos dentro de las salas.
import React, { useEffect, useRef, useState } from 'react';
import { ArrowLeft, Users, Home, Compass, Pencil, Check, X, ChevronUp, ChevronDown, Megaphone, Bell } from 'lucide-react';
import { office, useOffice } from '../lib/store.js';
import { api } from '../lib/api.js';
import { hotel, useHotel } from './hotelStore.js';
import { elevator, useElevator, floorName, floorLabel, getSkip, setSkip } from './elevator.js';
import { HotelScene } from './hotelScene.js';

// Lienzo de la ilustración: pixel-art en baja resolución escalado sin suavizar (~15 cuadros por segundo)
function SceneCanvas() {
  const ref = useRef(null);
  useEffect(() => {
    const cv = ref.current;
    const scene = new HotelScene();
    const buf = document.createElement('canvas');
    let raf = 0, last = 0;
    const onMove = (e) => { const r = cv.getBoundingClientRect(); scene.mouse = Math.max(0, Math.min(1, (e.clientX - r.left) / Math.max(1, r.width))); };
    window.addEventListener('pointermove', onMove);
    const loop = (t) => {
      raf = requestAnimationFrame(loop);
      if (t - last < 66 || document.hidden) return;
      last = t;
      const r = cv.getBoundingClientRect();
      if (!r.width || !r.height) return;
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const W = Math.round(r.width * dpr), H = Math.round(r.height * dpr);
      if (cv.width !== W || cv.height !== H) { cv.width = W; cv.height = H; }
      // Píxel del dibujo ≈ 4 px de pantalla (3 en celulares)
      const px = Math.max(2, Math.round((r.width < 600 ? 3 : 4) * dpr));
      const bw = Math.ceil(W / px), bh = Math.ceil(H / px);
      if (buf.width !== bw || buf.height !== bh) { buf.width = bw; buf.height = bh; }
      const g = buf.getContext('2d');
      scene.draw(g, bw, bh, t);
      const ctx = cv.getContext('2d');
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(buf, 0, 0, bw * px, bh * px);
    };
    raf = requestAnimationFrame(loop);
    return () => { cancelAnimationFrame(raf); window.removeEventListener('pointermove', onMove); };
  }, []);
  return <canvas ref={ref} className="ht-scene" aria-hidden="true" />;
}

// Lista de pisos (se usa en la llegada y en el panel dentro de las salas)
export function ElevatorPanel({ compact = false, onClose }) {
  const floors = useElevator((s) => s.floors);
  const ride = useElevator((s) => s.ride);
  const roomId = useHotel((s) => s.roomId);
  useEffect(() => { elevator.refresh(); const t = setInterval(() => elevator.refresh(), 10e3); return () => clearInterval(t); }, []);
  const cur = elevator.floorOf(roomId);
  const toNav = (tab) => { onClose?.(); elevator.set({ landing: false, panel: false }); if (hotel.state.roomId) hotel.leave(); hotel.refreshRooms(tab); };
  return (
    <div className={`ht-elev ${compact ? 'compact' : ''}`}>
      <div className="ht-elev-head">
        <div className="ht-elev-led"><span>{cur == null ? 'H' : floorLabel(cur)}</span><i>{ride ? (ride.to > ride.from ? <ChevronUp size={14} /> : <ChevronDown size={14} />) : null}</i></div>
        <div className="ht-elev-title"><b>Elevador</b><small>Elige tu piso</small></div>
        {onClose && <button className="ht-elev-x" onClick={onClose} aria-label="Cerrar"><X size={16} /></button>}
      </div>
      <div className="ht-floors">
        {floors == null && <div className="ht-muted" style={{ padding: 12 }}>Cargando pisos…</div>}
        {[...(floors || [])].map((r, i) => ({ r, i })).reverse().map(({ r, i }) => (
          <button key={r.id} className={`ht-floor ${cur === i ? 'here' : ''}`} disabled={!!ride} onClick={() => elevator.rideTo(r)} title={r.description || ''}>
            <span className="ht-floor-num">{floorLabel(i)}</span>
            <span className="ht-floor-name">{floorName(r)}{cur === i && <em>Estás aquí</em>}</span>
            <span className={`ht-floor-count ${r.users ? 'on' : ''}`}><Users size={13} /> {r.users}</span>
          </button>
        ))}
      </div>
      <div className="ht-elev-extra">
        <button className="ht-btn" onClick={() => toNav('mine')}><Home size={15} /> Mis salas</button>
        <button className="ht-btn" onClick={() => toNav('popular')}><Compass size={15} /> Navegador</button>
      </div>
    </div>
  );
}

// Aviso del staff: título, texto y botón que lleva a una sala (editable por admins)
function Promo() {
  const promo = useElevator((s) => s.promo);
  const floors = useElevator((s) => s.floors);
  const admin = useOffice((s) => s.me?.role === 'admin');
  const [edit, setEdit] = useState(null);
  if (!promo) return null;
  const target = (floors || []).find((r) => (promo.roomId ? r.id === promo.roomId : r.officialKey === promo.roomKey));
  const save = async () => {
    try {
      const sel = (floors || []).find((r) => String(r.id) === String(edit.room));
      const r = await api.put('/hotel/promo', { title: edit.title, text: edit.text, button: edit.button, roomKey: sel?.officialKey || null, roomId: sel && !sel.officialKey ? sel.id : null });
      elevator.set({ promo: r.promo });
      setEdit(null);
      office.toast({ title: 'Aviso guardado' });
    } catch (e) { office.toast({ title: e.message, kind: 'error' }); }
  };
  if (edit) {
    return (
      <div className="ht-promo editing">
        <input className="ht-input" maxLength={60} value={edit.title} onChange={(e) => setEdit({ ...edit, title: e.target.value })} placeholder="Título" />
        <textarea className="ht-input" maxLength={220} rows={3} value={edit.text} onChange={(e) => setEdit({ ...edit, text: e.target.value })} placeholder="Texto del aviso" />
        <div className="ht-promo-row">
          <input className="ht-input" maxLength={30} value={edit.button} onChange={(e) => setEdit({ ...edit, button: e.target.value })} placeholder="Texto del botón" />
          <select className="ht-input" value={edit.room} onChange={(e) => setEdit({ ...edit, room: e.target.value })}>
            <option value="">Sin botón</option>
            {(floors || []).map((r) => <option key={r.id} value={r.id}>{floorName(r)}</option>)}
          </select>
        </div>
        <div className="ht-promo-row end">
          <button className="ht-btn sm" onClick={() => setEdit(null)}><X size={14} /> Cancelar</button>
          <button className="ht-btn sm primary" onClick={save}><Check size={14} /> Guardar</button>
        </div>
      </div>
    );
  }
  return (
    <div className="ht-promo">
      <div className="ht-promo-tag"><Megaphone size={13} /> Novedades</div>
      <h3>{promo.title}</h3>
      {promo.text && <p>{promo.text}</p>}
      <div className="ht-promo-row">
        {target && promo.button && <button className="ht-btn primary sm" onClick={() => elevator.rideTo(target)}>{promo.button}</button>}
        {admin && <button className="ht-btn sm ghost" onClick={() => setEdit({ title: promo.title, text: promo.text, button: promo.button, room: target ? String(target.id) : '' })}><Pencil size={13} /> Editar</button>}
      </div>
    </div>
  );
}

export function HotelLanding({ onExit }) {
  const [skip, setSkipState] = useState(getSkip());
  const online = useElevator((s) => (s.floors || []).reduce((n, r) => n + (r.users || 0), 0));
  return (
    <div className="ht-landing">
      <SceneCanvas />
      <div className="ht-landing-shade" />
      <div className="ht-landing-top">
        <button className="ht-btn dark" onClick={onExit}><ArrowLeft size={16} /> <span className="ht-hide-sm">Volver a la oficina</span></button>
        <div className="ht-landing-brand"><b>Hotel</b> <span>GTAHUB</span></div>
      </div>
      <div className="ht-landing-body">
        <div className="ht-landing-left">
          <div className="ht-landing-hello">
            <h2>¡Hola, {office.state.me?.displayName?.split(' ')[0] || 'bienvenido'}!</h2>
            <p><span className="ht-dot" /> {online} {online === 1 ? 'persona' : 'personas'} en las salas oficiales</p>
          </div>
          <Promo />
        </div>
        <div className="ht-landing-right">
          <ElevatorPanel />
          <label className="ht-skip">
            <input type="checkbox" checked={skip} onChange={(e) => { setSkip(e.target.checked); setSkipState(e.target.checked); }} />
            Entrar directo a la Oficina Central la próxima vez
          </label>
        </div>
      </div>
    </div>
  );
}

// Viaje en elevador: puertas que se cierran, contador de pisos, "ding" y se abren
export function ElevatorRide() {
  const ride = useElevator((s) => s.ride);
  if (!ride) return null;
  const up = ride.to >= ride.from;
  return (
    <div className={`ht-ride ${ride.phase}`} key={ride.id}>
      <div className="ht-ride-doors"><span /><span /></div>
      <div className="ht-ride-panel">
        <div className="ht-ride-led">
          <i className={ride.phase === 'moving' && ride.from !== ride.to ? 'go' : ''}>{up ? <ChevronUp size={22} /> : <ChevronDown size={22} />}</i>
          <b key={ride.floor}>{ride.arrive ? 'H' : floorLabel(ride.floor)}</b>
        </div>
        <div className="ht-ride-label">{ride.phase === 'opening' ? <><Bell size={14} className="ht-ring" /> {ride.label}</> : ride.arrive ? 'Llegando al Hotel…' : `${up ? 'Subiendo' : 'Bajando'} a ${ride.label}…`}</div>
      </div>
    </div>
  );
}

// Panel de pisos flotante (botón "Elevador" dentro de una sala)
export function ElevatorPopover() {
  const open = useElevator((s) => s.panel);
  if (!open) return null;
  return (
    <div className="ht-elev-pop" onPointerDown={(e) => { if (e.target === e.currentTarget) elevator.set({ panel: false }); }}>
      <ElevatorPanel compact onClose={() => elevator.set({ panel: false })} />
    </div>
  );
}
