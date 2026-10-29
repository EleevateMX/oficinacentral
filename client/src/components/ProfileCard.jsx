import { petDef } from '@shared/pets.js';
import { since } from '../lib/time.js';
import React, { useEffect, useRef, useState } from 'react';
import { X, User, Hand, MessageCircle, Navigation, Clock, MoreVertical, Briefcase, MonitorUp, Phone, DoorClosed, Volume2, MapPin } from 'lucide-react';
import { areaAt } from '@shared/map.js';
import { EMOTES, PAIR_EMOTES } from '@shared/emotes.js';
import { fmtBirthday, isBirthday, daysUntil, whenLabel } from '../lib/birthdays.js';
import { office, useOffice } from '../lib/store.js';
import { Avatar, STATUS, AvatarCanvas } from './ui.jsx';
import { fmtTime, sameDay, tzDiffLabel } from '../lib/time.js';
import { api } from '../lib/api.js';
import { BadgeRow } from './Achievements.jsx';
import { PlacasSection, LiveTag } from './badges/Badge.jsx'; // placas y "en vivo"
import { ModerationActions } from './Moderation.jsx';

export default function ProfileCard({ userId }) {
  const u = useOffice((s) => s.users[userId]);
  const me = useOffice((s) => s.me);
  const events = useOffice((s) => s.events);
  const floor = useOffice((s) => s.floor);
  const [, tick] = useState(0);
  const [menu, setMenu] = useState(false);
  const [vol, setVol] = useState(() => office.peerVolume(userId));
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
  const pl = office.players?.[u.id];
  const room = floor && pl && pl.floorId === floor.id ? areaAt(floor, pl.x, pl.y) : null;

  return (
    <div className="profile-card" ref={ref}>
      <div className="pc-head">
        <Avatar user={isMe ? { ...u, online: true } : u} size={52} ring />
        <div className="pc-id">
          <div className="pc-name">{u.displayName}{u.role === 'admin' && <span className="tag">Admin</span>}</div>
          <div className="pc-sub"><Clock size={12} /> {fmtTime(Date.now(), u.timezone)} {isMe ? 'tu hora local' : 'hora local'}{!isMe && u.timezone && <span className="pc-tzdiff"> · {tzDiffLabel(u.timezone)}</span>}</div>
          <div className="pc-sub">
            <span className="dot" style={{ background: u.online ? STATUS[u.status || 'active'].color : 'var(--gray-dot)' }} />
            {u.online ? STATUS[u.status || 'active'].label : 'Desconectado'}
            <LiveTag userId={u.id} />
          </div>
        </div>
        <button className="icon-btn" onClick={close} aria-label="Cerrar"><X size={16} /></button>
      </div>
      {u.statusText && <div className="pc-status">{u.statusText}</div>}
      {u.online && u.game && (
        <div className="pc-status pc-game">
          {u.game.type === 'karts' ? '🏎️ Corriendo karts' : '🧟 Jugando Zombies en la oficina'}
          {!isMe && <button className="btn primary small" onClick={() => office.set({ modal: { type: 'game', objectId: u.game.objectId, game: u.game.type === 'karts' ? 'karts' : 'zombies', floorId: u.game.floorId }, profileCard: null })}>Unirse</button>}
        </div>
      )}
      {u.birthday && (isBirthday(u) ? (
        <button className="pc-bday today" onClick={() => office.set({ modal: { type: 'birthdays' }, profileCard: null })}>🎂 ¡Hoy es su cumpleaños!{!isMe && <b> Felicitar</b>}</button>
      ) : (
        <div className="pc-bday">🎂 Cumple el {fmtBirthday(u.birthday)} <span className="muted">· {whenLabel(daysUntil(u.birthday))}</span></div>
      ))}
      {u.online && u.shift && <div className="pc-status">🖥️ En turno {u.shift} · {since(u.shiftAt)}</div>}
      {(() => {
        const pd = u.avatar?.pet && u.avatar.pet !== 'none' ? petDef(u.avatar.pet) : null;
        if (!pd && !u.petPhotoUrl) return null;
        return (
          <div className="pc-pet">
            {u.petPhotoUrl && <img src={u.petPhotoUrl} alt="Mascota" />}
            <div>
              <b>🐾 {u.avatar?.petName || 'Su mascota'}</b>
              {pd && <span>{pd.name}</span>}
            </div>
          </div>
        );
      })()}
      <div className="pc-actions">
        {isMe ? (
          <button className="btn primary flex1" onClick={() => office.set({ modal: { type: 'profile' }, profileCard: null })}><User size={15} /> Editar perfil</button>
        ) : (
          <>
            {u.online && u.screen ? (
              <button className="btn primary flex1" onClick={() => { office.watchUser(u.id); close(); }}><MonitorUp size={15} /> Ver transmisión</button>
            ) : (
              <button className="btn primary flex1" disabled={!u.online} onClick={() => office.goTo(u.id)}><Navigation size={15} /> Ir a su lado</button>
            )}
            <button className="btn icon" title="Saludar" onClick={() => office.wave(u.id).then(() => office.toast({ title: `Saludaste a ${u.displayName} 👋` })).catch((e) => office.toast({ title: e.message, kind: 'error' }))}><Hand size={16} /></button>
            <button className="btn icon" title="Llamar" onClick={() => office.callUser(u.id).catch((e) => office.toast({ title: e.message, kind: 'error' }))}><Phone size={16} /></button>
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
      {!isMe && room?.closed && !office.admitted.has(room.id) && (
        <div className="pc-door">🔒 Está en <b>{room.name}</b> (cerrada): «Ir a su lado» te deja en la puerta y quien está dentro decide si te deja pasar.</div>
      )}
      {!isMe && room?.closed && (
        <button className="btn ghost pc-row" onClick={() => { office.socket?.emit('room:knock', { areaId: room.id }); office.toast({ title: `🚪 Tocaste la puerta de ${room.name}` }); }}>
          <DoorClosed size={15} /> Tocar la puerta de {room.name}
        </button>
      )}
      {!isMe && !room?.closed && desk && (
        <button className="btn ghost pc-row" onClick={() => { office.goToDesk(desk); close(); }}><Briefcase size={15} /> Ir al escritorio de {u.displayName.split(' ')[0]}</button>
      )}
      {!isMe && u.online && (
        <div className="pc-emotes">
          {PAIR_EMOTES.map((k) => (
            <button key={k} className="btn ghost tiny" onClick={() => { office.emote(k, u.id); close(); }}>{EMOTES[k].emoji} {EMOTES[k].label}</button>
          ))}
        </div>
      )}
      {!isMe && u.online && (
        <label className="pc-vol">
          <Volume2 size={15} />
          <span>Volumen de {u.displayName.split(' ')[0]}</span>
          <input type="range" min="0" max="1" step="0.05" value={vol} onChange={(e) => { const v = Number(e.target.value); setVol(v); office.setPeerVolume(u.id, v); }} />
          <b>{Math.round(vol * 100)}%</b>
        </label>
      )}
      {!isMe && u.online && (room || desk) && (
        <div className="pc-sub pc-where"><MapPin size={12} /> {room ? `${room.name}${room.closed ? ' · cerrada 🔒' : ''}` : 'En su escritorio'}</div>
      )}
      <PlacasSection userId={u.id} />
      {!isMe && <ModerationActions user={u} />}
      <BadgeRow userId={u.id} />
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
