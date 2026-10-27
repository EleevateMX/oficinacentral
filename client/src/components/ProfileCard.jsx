import React, { useEffect, useRef, useState } from 'react';
import { X, User, Hand, MessageCircle, Navigation, Clock, MoreVertical, Briefcase } from 'lucide-react';
import { office, useOffice } from '../lib/store.js';
import { Avatar, STATUS, AvatarCanvas } from './ui.jsx';
import { fmtTime, sameDay } from '../lib/time.js';
import { api } from '../lib/api.js';

export default function ProfileCard({ userId }) {
  const u = useOffice((s) => s.users[userId]);
  const me = useOffice((s) => s.me);
  const events = useOffice((s) => s.events);
  const floor = useOffice((s) => s.floor);
  const [, tick] = useState(0);
  const [menu, setMenu] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    const id = setInterval(() => tick((x) => x + 1), 30e3);
    const k = (e) => e.key === 'Escape' && office.set({ profileCard: null });
    window.addEventListener('keydown', k);
    return () => { clearInterval(id); window.removeEventListener('keydown', k); };
  }, []);
  if (!u) return null;
  const isMe = u.id === me.id;
  const close = () => office.set({ profileCard: null });
  const today = events.filter((e) => sameDay(e.startsAt, Date.now()) && (e.attendees.includes(u.id) || e.createdBy === u.id)).sort((a, b) => a.startsAt - b.startsAt);
  const deskId = floor && Object.entries(floor.claims).find(([, owner]) => owner === u.id)?.[0];
  const desk = deskId && floor.desks.find((d) => d.id === Number(deskId));

  return (
    <div className="profile-card" ref={ref}>
      <div className="pc-head">
        <Avatar user={isMe ? { ...u, online: true } : u} size={52} ring />
        <div className="pc-id">
          <div className="pc-name">{u.displayName}{u.role === 'admin' && <span className="tag">Admin</span>}</div>
          <div className="pc-sub"><Clock size={12} /> {fmtTime(Date.now(), u.timezone)} hora local</div>
          <div className="pc-sub">
            <span className="dot" style={{ background: u.online ? STATUS[u.status || 'active'].color : 'var(--gray-dot)' }} />
            {u.online ? STATUS[u.status || 'active'].label : 'Desconectado'}
          </div>
        </div>
        <button className="icon-btn" onClick={close} aria-label="Cerrar"><X size={16} /></button>
      </div>
      {u.statusText && <div className="pc-status">{u.statusText}</div>}
      <div className="pc-actions">
        {isMe ? (
          <button className="btn primary flex1" onClick={() => office.set({ modal: { type: 'profile' }, profileCard: null })}><User size={15} /> Editar perfil</button>
        ) : (
          <>
            <button className="btn primary flex1" disabled={!u.online} onClick={() => office.goTo(u.id)}><Navigation size={15} /> Ir a</button>
            <button className="btn icon" title="Saludar" onClick={() => office.wave(u.id).then(() => office.toast({ title: `Saludaste a ${u.displayName} 👋` })).catch((e) => office.toast({ title: e.message, kind: 'error' }))}><Hand size={16} /></button>
            <button className="btn icon" title="Mensaje" onClick={() => { office.openConv(`d:${u.id}`); close(); }}><MessageCircle size={16} /></button>
          </>
        )}
        {(desk || (me.role === 'admin' && !isMe)) && (
          <div className="cb-group">
            <button className="btn icon" onClick={() => setMenu(!menu)} aria-label="Más"><MoreVertical size={16} /></button>
            {menu && (
              <div className="popover down right">
                {desk && <button className="pop-item" onClick={() => { office.goToDesk(desk); close(); }}><Briefcase size={14} /> Ir a su escritorio</button>}
                {desk && (isMe || me.role === 'admin') && (
                  <button className="pop-item" onClick={() => { api.post(`/desks/${desk.id}/release`).catch((e) => office.toast({ title: e.message, kind: 'error' })); setMenu(false); }}>Liberar escritorio</button>
                )}
              </div>
            )}
          </div>
        )}
      </div>
      <div className="pc-section">
        <div className="pc-label">Avatar</div>
        <div className="pc-avatar"><AvatarCanvas avatar={u.avatar} width={60} height={76} /></div>
      </div>
      <div className="pc-section">
        <div className="pc-label">Hoy en el calendario</div>
        {today.length ? today.map((e) => (
          <button key={e.id} className="event-card" onClick={() => office.set({ modal: { type: 'event', event: e } })}>
            <div className="event-title">{e.title}</div>
            <div className="event-time">{fmtTime(e.startsAt)} – {fmtTime(e.endsAt)}</div>
          </button>
        )) : <div className="muted small">Sin reuniones hoy</div>}
      </div>
    </div>
  );
}
