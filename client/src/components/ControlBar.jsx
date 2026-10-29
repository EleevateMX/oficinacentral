import React, { useEffect, useRef, useState } from 'react';
import { Mic, MicOff, Video, VideoOff, Smile, MonitorUp, LogOut, Settings, ChevronUp, Hand, PictureInPicture2, Ear } from 'lucide-react';
import { api } from '../lib/api.js';
import { office, useOffice } from '../lib/store.js';
import { Avatar } from './ui.jsx';
import { openPip, pipSupported } from '../lib/pip.js';
import { handButton } from '../lib/stage.js';
import MeMenu from './MeMenu.jsx';

import { EMOTES, SOLO_EMOTES } from '@shared/emotes.js';

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
  const handUp = useOffice((s) => !!s.stage?.queue?.includes(s.me?.id)); // fila del escenario
  const hearing = useOffice((s) => s.talkingWith);
  const [menu, setMenu] = useState(null);
  const ref = useRef(null);
  useClickOutside(ref, () => setMenu(null));
  const meU = users[me.id] || me;

  return (
    <div className={`control-bar ${compact ? 'compact' : ''}`} ref={ref}>
      <div className="cb-group">
        <button className="cb-avatar" onClick={() => setMenu(menu === 'me' ? null : 'me')} title="Tu estado">
          <Avatar user={{ ...meU, online: true }} size={compact ? 30 : 34} />
        </button>
        {menu === 'me' && <MeMenu onClose={() => setMenu(null)} />}
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
        <button className="cb-btn" onClick={() => setMenu(menu === 'emoji' ? null : 'emoji')} title="Reacciones y acciones (bailar B, saludar H, guiño G…)"><Smile size={18} /></button>
        {menu === 'emoji' && (
          <div className="popover up emoji-pop">
            <div className="emoji-pop-label">Reacciones</div>
            {EMOJIS.map((e) => (
              <button key={e} onClick={() => { office.react(e); setMenu(null); }}>{e}</button>
            ))}
            <div className="emoji-pop-label">Acciones</div>
            {SOLO_EMOTES.map((k) => (
              <button key={k} className="emote-btn" title={`${EMOTES[k].label} (${EMOTES[k].key})`} onClick={() => { office.emote(k); setMenu(null); }}>
                <span>{EMOTES[k].emoji}</span><small>{EMOTES[k].label.replace('Dar una ', '')}</small>
              </button>
            ))}
          </div>
        )}
      </div>
      {!compact && (
        <button className={`cb-btn ${handUp ? 'on' : ''}`} onClick={() => handButton(office) || office.react('✋')} title={handUp ? 'Bajar la mano' : 'Levantar la mano'}><Hand size={18} /></button>
      )}
      <button className={`cb-btn ${media.screen ? 'on sharing' : ''}`} onClick={() => office.toggleScreen()} title={media.screen ? 'Dejar de compartir' : 'Compartir pantalla'}>
        <MonitorUp size={18} />
      </button>
      {/* Quién te oye ahora */}
      <div className="cb-group">
        <button className={`cb-btn cb-hear ${hearing.length ? 'on' : ''}`} onClick={() => setMenu(menu === 'hear' ? null : 'hear')} title="Quién te oye ahora">
          <Ear size={18} /><b>{hearing.length}</b>
        </button>
        {menu === 'hear' && (
          <div className="popover up hear-pop">
            <div className="pop-title">Te oyen ahora</div>
            {hearing.length ? hearing.map((id) => users[id] && (
              <button key={id} className="pop-item hear-row" onClick={() => { office.set({ profileCard: id }); setMenu(null); }}>
                <Avatar user={users[id]} size={24} /> <span>{users[id].displayName}</span>
              </button>
            )) : <div className="muted small hear-empty">Nadie te oye ahora. Acércate a alguien o entra a una sala.</div>}
            <div className="muted small hear-note">
              {media.mic ? 'Solo estas personas reciben tu audio, tu cámara y tu pantalla.' : 'Tu micrófono está apagado: ahora no te oyen aunque estén cerca.'}
            </div>
          </div>
        )}
      </div>
      <div className="cb-sep" />
      {!compact && (
        <button className="cb-btn" onClick={() => office.set({ modal: { type: 'prefs', section: 'general' } })} title="Preferencias"><Settings size={18} /></button>
      )}
      {!compact && pipSupported() && (
        <button className="cb-btn" onClick={() => openPip().catch((e) => office.toast({ title: e.message, kind: 'error' }))} title="Mini ventana: deja la oficina flotando encima de tus otros programas"><PictureInPicture2 size={18} /></button>
      )}
      <button className="cb-btn" onClick={() => window.dispatchEvent(new Event('office:logout'))} title="Salir de la oficina"><LogOut size={18} /></button>
    </div>
  );
}
