import React, { useEffect, useRef } from 'react';
import { X, ChevronDown } from 'lucide-react';
import { drawAvatarPreview, drawAvatarFace } from '../lib/render.js';
import { onSpritesLoaded } from '../lib/sprites.js';
import { Mascota } from './brand.jsx';

export const STATUS = {
  active: { label: 'Activo', color: 'var(--green)' },
  busy: { label: 'Ocupado', color: 'var(--orange)' },
  away: { label: 'Ausente', color: 'var(--gray-dot)' },
};

const BG = ['#a5d8ff', '#ffc9c9', '#b2f2bb', '#ffec99', '#d0bfff', '#fcc2d7', '#99e9f2', '#ffd8a8'];

export function initials(name = '?') {
  return name.trim().charAt(0).toUpperCase() || '?';
}

export function Avatar({ user, size = 32, showStatus = true, ring = false }) {
  if (!user) return <div className="avatar" style={{ width: size, height: size }} />;
  const bg = BG[user.id % BG.length];
  const status = user.online ? STATUS[user.status || 'active'] : null;
  const dot = Math.max(8, Math.round(size * 0.3));
  return (
    <div className={`avatar ${ring ? 'ring' : ''}`} style={{ width: size, height: size, fontSize: size * 0.42, background: bg }}>
      {user.photoUrl ? <img src={user.photoUrl} alt="" draggable={false} /> : <SpriteFace avatar={user.avatar} size={size} fallback={initials(user.displayName)} />}
      {showStatus && (
        <span
          className={`status-dot ${status ? '' : 'offline'}`}
          style={{ width: dot, height: dot, background: status ? status.color : undefined }}
        />
      )}
    </div>
  );
}

function SpriteFace({ avatar, size, fallback }) {
  if (!avatar) return <span>{fallback}</span>;
  return <AvatarCanvas avatar={avatar} width={size} height={size} zoomFace />;
}

export function AvatarCanvas({ avatar, width = 96, height = 120, dir = 'down', step = 0, zoomFace = false }) {
  const ref = useRef(null);
  const [, bump] = React.useState(0);
  useEffect(() => onSpritesLoaded(() => bump((x) => x + 1)), []);
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    if (zoomFace) drawAvatarFace(c, avatar);
    else drawAvatarPreview(c, avatar, dir, step);
  });
  return <canvas ref={ref} width={zoomFace ? 48 : width * 2} height={zoomFace ? 48 : height * 2} style={{ width, height, imageRendering: 'pixelated' }} />;
}

export function StatusDot({ status, online = true }) {
  return <span className="dot" style={{ background: online ? STATUS[status || 'active'].color : 'var(--gray-dot)' }} />;
}

export function Toggle({ checked, onChange, disabled }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={!!checked}
      disabled={disabled}
      className={`toggle ${checked ? 'on' : ''}`}
      onClick={() => onChange(!checked)}
    >
      <span />
    </button>
  );
}

export function Select({ value, onChange, options, className = '' }) {
  return (
    <div className={`select ${className}`}>
      <select value={value} onChange={(e) => onChange(e.target.value)}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
      <ChevronDown size={14} />
    </div>
  );
}

export function Modal({ title, onClose, children, width = 480, className = '', footer }) {
  useEffect(() => {
    const k = (e) => e.key === 'Escape' && onClose?.();
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onClose]);
  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose?.()}>
      <div className={`modal ${className}`} style={{ width }} role="dialog" aria-modal="true">
        {title !== undefined && (
          <div className="modal-head">
            <h2>{title}</h2>
            <button className="icon-btn" onClick={onClose} aria-label="Cerrar"><X size={18} /></button>
          </div>
        )}
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>
  );
}

export function Row({ title, desc, children }) {
  return (
    <div className="pref-row">
      <div className="pref-text">
        <div className="pref-title">{title}</div>
        {desc && <div className="pref-desc">{desc}</div>}
      </div>
      <div className="pref-control">{children}</div>
    </div>
  );
}

export function Radio({ name, value, current, onChange, label, desc }) {
  return (
    <label className="radio">
      <input type="radio" name={name} checked={current === value} onChange={() => onChange(value)} />
      <span>
        <span className="radio-label">{label}</span>
        {desc && <span className="radio-desc">{desc}</span>}
      </span>
    </label>
  );
}

export function Kbd({ children }) {
  return <kbd className="kbd">{children}</kbd>;
}

export function Empty({ title, children, mascota }) {
  const showMascot = mascota && document.documentElement.dataset.brand !== 'gtahub';
  return (
    <div className="empty">
      {showMascot && <Mascota nombre={mascota.nombre || 'nuvi'} pose={mascota.pose || 'idle'} face={mascota.face || 'smile'} size={mascota.size || 96} />}
      <div className="empty-title">{title}</div>
      {children && <div className="empty-desc">{children}</div>}
    </div>
  );
}
