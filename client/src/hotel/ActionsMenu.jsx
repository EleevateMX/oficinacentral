// Hotel: menú "Acciones" junto al chat (como el menú del personaje del hotel clásico) y el botón del micro.
// Todo está disponible para todos: bailes 1–4, saludar, beso, reír, saltar, sentarse, cartel, efectos,
// dormir y objeto en la mano. Cada cosa también sale con su comando del chat (se muestra como pista).
import React, { useEffect, useRef, useState } from 'react';
import { Sparkles, ChevronLeft, ChevronRight, Mic, MicOff } from 'lucide-react';
import { office, useOffice } from '../lib/store.js';
import { hotel } from './hotelStore.js';
import { ACT_LIST } from './actions.js';
import { EFFECTS } from './avatarFx.js';
import { startVoiceMeters, stopVoiceMeters } from './voice.js';

const HANDS = [
  ['refresco', 'Refresco', '🥤'], ['cafe', 'Café', '☕'], ['agua', 'Agua', '💧'],
  ['helado', 'Helado', '🍦'], ['palomitas', 'Palomitas', '🍿'], ['rosa', 'Rosa', '🌹'],
];

export function ActionsButton() {
  const [open, setOpen] = useState(false);
  const [view, setView] = useState('main');
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const out = (e) => { if (!ref.current?.contains(e.target)) setOpen(false); };
    const esc = (e) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('pointerdown', out);
    window.addEventListener('keydown', esc);
    return () => { window.removeEventListener('pointerdown', out); window.removeEventListener('keydown', esc); };
  }, [open]);
  const me = hotel.live.users.get(hotel.me);
  const done = () => { setOpen(false); setView('main'); };
  const act = (a, n) => { hotel.act(a, n); done(); };
  const cmd = (t) => { hotel.command(t); done(); };
  const Item = ({ emoji, label, hint, onClick, sub, on }) => (
    <button type="button" className={`ht-act-item ${on ? 'on' : ''}`} onClick={onClick} title={hint}>
      <span className="ht-act-emoji">{emoji}</span><span className="ht-act-label">{label}</span>
      {sub ? <ChevronRight size={14} className="ht-act-more" /> : hint && <kbd>{hint}</kbd>}
    </button>
  );
  const back = (title) => (
    <div className="ht-act-head"><button type="button" onClick={() => setView('main')} aria-label="Atrás"><ChevronLeft size={16} /></button><b>{title}</b></div>
  );
  return (
    <div className="ht-act-wrap" ref={ref}>
      <button type="button" className={`ht-mode ht-act-btn ${open ? 'on' : ''}`} onClick={() => { setOpen(!open); setView('main'); }} title="Acciones: bailar, saludar, cartel, efectos…" aria-expanded={open}>
        <Sparkles size={16} />
      </button>
      {open && (
        <div className="ht-act-menu" role="menu">
          {view === 'main' && (
            <>
              <div className="ht-act-title">Acciones <span>todo gratis</span></div>
              <div className="ht-act-list">
                <Item emoji="💃" label="Bailar" sub onClick={() => setView('dance')} on={me?.act === 'dance'} />
                {ACT_LIST.actions.map((a) => <Item key={a.id} emoji={a.emoji} label={a.label} hint={a.cmd} onClick={() => act(a.id)} />)}
                <Item emoji={me?.sit?.floor ? '🧍' : '🪑'} label={me?.sit?.floor ? 'Pararse' : 'Sentarse'} hint=":sentarse" onClick={() => cmd(':sentarse')} />
                <Item emoji="🪧" label="Cartel" sub onClick={() => setView('sign')} />
                <Item emoji="✨" label="Efectos" sub onClick={() => setView('fx')} on={!!me?.effect} />
                <Item emoji="😴" label="Dormir" hint=":dormir" onClick={() => cmd(':dormir')} on={me?.act === 'sleep'} />
                <Item emoji="🥤" label="Mano" sub onClick={() => setView('hand')} on={!!me?.hand} />
              </div>
            </>
          )}
          {view === 'dance' && (
            <>
              {back('Bailar')}
              <div className="ht-act-list">
                {ACT_LIST.dances.map((d) => <Item key={d.n} emoji={d.emoji} label={`${d.label} · ${d.name}`} hint={`:bailar ${d.n}`} onClick={() => act('dance', d.n)} on={me?.act === 'dance' && me?.dance === d.n} />)}
                <Item emoji="✋" label="Dejar de bailar" hint=":parar" onClick={() => act('stop')} />
              </div>
            </>
          )}
          {view === 'sign' && (
            <>
              {back('Cartel')}
              <div className="ht-act-signs">
                {Array.from({ length: 11 }, (_, n) => <button type="button" key={n} onClick={() => cmd(`:cartel ${n}`)}>{n}</button>)}
              </div>
              <p className="ht-act-tip">Lo levantas 5 segundos · <kbd>:cartel N</kbd></p>
            </>
          )}
          {view === 'fx' && (
            <>
              {back('Efectos')}
              <div className="ht-act-list">
                {Object.entries(EFFECTS).map(([id, e]) => <Item key={id} emoji={e.emoji} label={e.label} hint={`:efecto ${id}`} onClick={() => cmd(`:efecto ${me?.effect === id ? '' : id}`.trim())} on={me?.effect === id} />)}
                {me?.effect && <Item emoji="🚫" label="Quitar efecto" hint=":efecto" onClick={() => cmd(':efecto')} />}
              </div>
            </>
          )}
          {view === 'hand' && (
            <>
              {back('Algo en la mano')}
              <div className="ht-act-list">
                {HANDS.map(([id, label, emoji]) => <Item key={id} emoji={emoji} label={label} hint={`:mano ${id}`} onClick={() => cmd(`:mano ${id}`)} on={me?.hand === id} />)}
                {me?.hand && <Item emoji="🫳" label="Soltar" hint=":mano" onClick={() => cmd(':mano')} />}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

// Micro del Hotel (la barra de la oficina no se ve aquí): mismo micrófono que la oficina
export function HotelMic() {
  const mic = useOffice((s) => s.media.mic);
  const talking = useOffice((s) => s.talkingWith.length);
  useEffect(() => { startVoiceMeters(); return () => stopVoiceMeters(); }, []);
  return (
    <button type="button" className={`ht-mode ht-mic ${mic ? 'on' : 'off'}`} onClick={() => office.toggleMic()}
      title={mic ? `Micrófono prendido · te oyen ${talking ? `${talking} cerca` : 'quienes estén cerca'} (6 casillas)` : 'Prender micrófono: te oye quien esté cerca en la sala'}>
      {mic ? <Mic size={16} /> : <MicOff size={16} />}
      {mic && talking > 0 && <i className="ht-mic-n">{talking}</i>}
    </button>
  );
}
