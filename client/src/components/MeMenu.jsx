// Menú "Mi perfil" (al tocar tu avatar en la barra de abajo): tarjeta con tu personaje,
// estado, estado personalizado, turno y accesos rápidos.
import React, { useState } from 'react';
import { Pencil, UserRound, Shirt, PawPrint, Medal, Award, Sparkles, Settings, MonitorCheck, X, Gamepad2 } from 'lucide-react';
import { api } from '../lib/api.js';
import { since } from '../lib/time.js';
import { office, useOffice } from '../lib/store.js';
import { Avatar, STATUS } from './ui.jsx';
import { LiveTag } from './badges/Badge.jsx';
import './MeMenu.css';

export const QUICK_STATUS = ['🎧 Concentrado', '📞 En llamada', '🍔 Comiendo', '☕ En pausa', '🚗 En camino', '🏠 Desde casa', '🤒 Enfermo', '🎮 Jugando'];
const fail = (e) => office.toast({ title: e.message, kind: 'error' });
const setStatusText = (statusText) => api.patch('/me', { statusText }).catch(fail);

export default function MeMenu({ onClose }) {
  const me = useOffice((s) => s.me);
  const users = useOffice((s) => s.users);
  const shifts = useOffice((s) => s.config.shifts) || [];
  const meU = users[me.id] || me;
  const custom = QUICK_STATUS.includes(meU.statusText) ? '' : meU.statusText || '';
  const [draft, setDraft] = useState(custom);
  const hasPet = meU?.avatar?.pet && meU.avatar.pet !== 'none';
  const go = (patch) => { office.set(patch); onClose(); };
  const setShift = (shift) => api.put('/me/shift', { shift }).catch(fail);
  const st = STATUS[meU.status] || STATUS.active;

  const links = [
    { icon: Shirt, label: 'Mi personaje', run: () => go({ modal: { type: 'profile', step: 'avatar' } }) },
    { icon: PawPrint, label: 'Mi mascota', run: () => go({ modal: { type: 'profile', step: 'avatar', tab: 'pet' } }) },
    { icon: Award, label: 'Mis placas', run: () => go({ modal: { type: 'badges' } }) },
    { icon: Medal, label: 'Mis logros', run: () => go({ modal: { type: 'achievements' } }) },
    hasPet && { icon: Gamepad2, label: 'Jugar con mascota', run: () => go({ petPanel: me.id }) },
    { icon: Settings, label: 'Preferencias', run: () => go({ modal: { type: 'prefs' } }) },
    { icon: Sparkles, label: 'Primeros pasos', run: () => go({ onboarding: true }) },
  ].filter(Boolean);

  return (
    <div className="popover up left me-menu" role="dialog" aria-label="Mi perfil">
      <div className="mm-hero">
        <button className="mm-close" onClick={onClose} title="Cerrar"><X size={14} /></button>
        <div className="mm-avatar">
          <Avatar user={{ ...meU, online: true }} size={64} />
        </div>
        <div className="mm-id">
          <div className="mm-name">{meU.displayName} <LiveTag userId={me.id} /></div>
          {meU.username && <div className="mm-user">@{meU.username}</div>}
          <div className="mm-now">
            <span className="dot" style={{ background: st.color }} /> {st.label}
            {meU.statusText && <span className="mm-now-text">· {meU.statusText}</span>}
          </div>
        </div>
        <div className="mm-hero-actions">
          <button className="btn primary sm" onClick={() => go({ modal: { type: 'profile' } })}><Pencil size={13} /> Editar perfil</button>
          <button className="btn sm" onClick={() => go({ profileCard: me.id })}><UserRound size={13} /> Ver mi perfil</button>
        </div>
      </div>

      <div className="mm-body">
        <div className="mm-label">Estado</div>
        <div className="mm-seg">
          {Object.entries(STATUS).map(([k, s]) => (
            <button key={k} className={meU.status === k ? 'on' : ''} onClick={() => office.setStatus(k)}>
              <span className="dot" style={{ background: s.color }} /> {s.label}
            </button>
          ))}
        </div>

        <div className="mm-label">Estado personalizado</div>
        <div className="mm-chips">
          {QUICK_STATUS.map((q) => (
            <button key={q} className={`mm-chip ${meU.statusText === q ? 'on' : ''}`} onClick={() => setStatusText(meU.statusText === q ? '' : q)}>{q}</button>
          ))}
        </div>
        <div className="mm-input">
          <input placeholder="Escribe tu estado y presiona Enter" value={draft} maxLength={80}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { setStatusText(draft.trim()); onClose(); } }} />
          {meU.statusText && <button className="link-btn" onClick={() => { setStatusText(''); setDraft(''); }}>Quitar</button>}
        </div>

        {shifts.length > 0 && (
          <>
            <div className="mm-label"><MonitorCheck size={12} /> {meU.shift ? `En turno · ${meU.shift} · ${since(meU.shiftAt)}` : 'Turno'}</div>
            <div className="mm-chips">
              {shifts.map((sh) => (
                <button key={sh} className={`mm-chip ${meU.shift === sh ? 'on' : ''}`} onClick={() => setShift(meU.shift === sh ? null : sh)}>{sh}</button>
              ))}
              {meU.shift && <button className="mm-chip danger" onClick={() => setShift(null)}>Salir de turno</button>}
            </div>
          </>
        )}

        <div className="mm-grid">
          {links.map(({ icon: Icon, label, run }) => (
            <button key={label} className="mm-tile" onClick={run}>
              <Icon size={18} /><span>{label}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
