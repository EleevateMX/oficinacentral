import React, { useEffect, useRef, useState } from 'react';
import { Mic, MicOff, Video, VideoOff, Smile, MonitorUp, LogOut, Settings, ChevronUp, Hand, MonitorCheck } from 'lucide-react';
import { api } from '../lib/api.js';
import { since } from '../lib/time.js';
import { office, useOffice } from '../lib/store.js';
import { Avatar, STATUS } from './ui.jsx';

const QUICK_STATUS = ['🎧 Concentrado', '📞 En llamada', '🍔 Comiendo', '☕ En pausa', '🚗 En camino', '🏠 Desde casa', '🤒 Enfermo', '🎮 Jugando'];
const setStatusText = (statusText) => api.patch('/me', { statusText }).catch((e) => office.toast({ title: e.message, kind: 'error' }));
const EMOJIS = ['👋', '👍', '❤️', '😂', '🎉', '🔥', '👏', '🤔', '☕', '✅'];

function useClickOutside(ref, onOut) {
  useEffect(() => {
    const h = (e) => ref.current && !ref.current.contains(e.target) && onOut();
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [ref, onOut]);
}

export default function ControlBar({ compact = false }) {
  const me = useOffice((s) => s.me);
  const users = useOffice((s) => s.users);
  const media = useOffice((s) => s.media);
  const [menu, setMenu] = useState(null);
  const ref = useRef(null);
  useClickOutside(ref, () => setMenu(null));
  const meU = users[me.id] || me;
  const shifts = useOffice((s) => s.config.shifts) || [];
  const setShift = (shift) => api.put('/me/shift', { shift }).catch((e) => office.toast({ title: e.message, kind: 'error' }));

  return (
    <div className={`control-bar ${compact ? 'compact' : ''}`} ref={ref}>
      <div className="cb-group">
        <button className="cb-avatar" onClick={() => setMenu(menu === 'me' ? null : 'me')} title="Tu estado">
          <Avatar user={{ ...meU, online: true }} size={compact ? 30 : 34} />
        </button>
        {menu === 'me' && (
          <div className="popover up left">
            <div className="pop-title">{meU.displayName}</div>
            {Object.entries(STATUS).map(([k, s]) => (
              <button key={k} className={`pop-item ${meU.status === k ? 'on' : ''}`} onClick={() => { office.setStatus(k); setMenu(null); }}>
                <span className="dot" style={{ background: s.color }} /> {s.label}
              </button>
            ))}
            <div className="pop-sep" />
            <div className="pop-label">Estado personalizado</div>
            <div className="shift-chips">
              {QUICK_STATUS.map((st) => (
                <button key={st} className={`chip-btn ${meU.statusText === st ? 'on' : ''}`} onClick={() => setStatusText(meU.statusText === st ? '' : st)}>{st}</button>
              ))}
            </div>
            <input className="status-input" placeholder="Escribe tu estado y presiona Enter" defaultValue={QUICK_STATUS.includes(meU.statusText) ? '' : meU.statusText || ''} maxLength={80}
              onKeyDown={(e) => { if (e.key === 'Enter') { setStatusText(e.currentTarget.value.trim()); setMenu(null); } }} />
            {meU.statusText && <button className="pop-item" onClick={() => setStatusText('')}>Quitar estado</button>}
            {shifts.length > 0 && (
              <>
                <div className="pop-sep" />
                <div className="pop-label"><MonitorCheck size={13} /> {meU.shift ? `En turno · ${meU.shift} · ${since(meU.shiftAt)}` : 'Turno'}</div>
                <div className="shift-chips">
                  {shifts.map((sh) => (
                    <button key={sh} className={`chip-btn ${meU.shift === sh ? 'on' : ''}`} onClick={() => setShift(meU.shift === sh ? null : sh)}>{sh}</button>
                  ))}
                </div>
                {meU.shift && <button className="pop-item" onClick={() => { setShift(null); setMenu(null); }}>Salir de turno</button>}
              </>
            )}
            <div className="pop-sep" />
            <button className="pop-item" onClick={() => { office.set({ profileCard: me.id }); setMenu(null); }}>Ver mi perfil</button>
            <button className="pop-item" onClick={() => { office.set({ modal: { type: 'profile' } }); setMenu(null); }}>Editar perfil</button>
          </div>
        )}
      </div>
      <div className="cb-sep" />
      <button className={`cb-btn ${media.mic ? 'on' : 'off'}`} onClick={() => office.toggleMic()} title={media.mic ? 'Silenciar micrófono' : 'Activar micrófono'}>
        {media.mic ? <Mic size={18} /> : <MicOff size={18} />}
      </button>
      {!compact && (
        <button className="cb-caret" onClick={() => office.set({ modal: { type: 'prefs', section: 'audio' } })} title="Ajustes de audio"><ChevronUp size={12} /></button>
      )}
      <button className={`cb-btn ${media.cam ? 'on' : 'off'}`} onClick={() => office.toggleCam()} title={media.cam ? 'Apagar cámara' : 'Encender cámara'}>
        {media.cam ? <Video size={18} /> : <VideoOff size={18} />}
      </button>
      {!compact && (
        <button className="cb-caret" onClick={() => office.set({ modal: { type: 'prefs', section: 'video' } })} title="Ajustes de video"><ChevronUp size={12} /></button>
      )}
      <div className="cb-group">
        <button className="cb-btn" onClick={() => setMenu(menu === 'emoji' ? null : 'emoji')} title="Reaccionar (teclas 1–6)"><Smile size={18} /></button>
        {menu === 'emoji' && (
          <div className="popover up emoji-pop">
            {EMOJIS.map((e) => (
              <button key={e} onClick={() => { office.react(e); setMenu(null); }}>{e}</button>
            ))}
          </div>
        )}
      </div>
      {!compact && (
        <button className="cb-btn" onClick={() => office.react('✋')} title="Levantar la mano"><Hand size={18} /></button>
      )}
      <button className={`cb-btn ${media.screen ? 'on sharing' : ''}`} onClick={() => office.toggleScreen()} title={media.screen ? 'Dejar de compartir' : 'Compartir pantalla'}>
        <MonitorUp size={18} />
      </button>
      <div className="cb-sep" />
      {!compact && (
        <button className="cb-btn" onClick={() => office.set({ modal: { type: 'prefs', section: 'general' } })} title="Preferencias"><Settings size={18} /></button>
      )}
      <button className="cb-btn" onClick={() => window.dispatchEvent(new Event('office:logout'))} title="Salir de la oficina"><LogOut size={18} /></button>
    </div>
  );
}
