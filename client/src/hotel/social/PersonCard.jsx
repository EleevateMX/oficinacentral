// Hotel: tarjeta de persona (reemplaza a la UserCard básica). Lema (editable si eres tú),
// respetos, hasta 5 insignias (los logros de la oficina), y acciones: agregar amigo, mensaje,
// intercambiar (gancho socialHooks.onTrade), dar respeto, susurrar, permisos, sacar y vetar.
import React, { useEffect, useState } from 'react';
import { GiveHandButton } from '../MechPanels.jsx'; // C: dar lo que traes en la mano
import { UserEconomyActions } from '../economy/CardActions.jsx'; // A: intercambiar, regalar, créditos
import { X, Crown, Shield, ShieldOff, UserMinus, Ban, MessageCircle, Armchair, UserPlus, Check, ThumbsUp, Repeat, Mail, Pencil, Clock } from 'lucide-react';
import { office, useOffice } from '../../lib/store.js';
import { api } from '../../lib/api.js';
import { Avatar } from '../../components/ui.jsx';
import { BadgeImg, HotelBadgeRow, LiveButton, LiveTag } from '../../components/badges/Badge.jsx'; // placas (server/badges.js)
import { MOTTO_MAX, RESPECTS_PER_DAY } from '@shared/hotelSocial.js';
import { hotel, useHotel } from '../hotelStore.js';
import { social, useSocial, socialHooks } from './socialStore.js';

// Una placa (pixel art 40×40, ver client/src/lib/badgeArt.js)
export function BadgeChip({ id, tier, size = 40 }) {
  return <BadgeImg id={id} tier={tier} size={size} />;
}

export default function PersonCard({ userId }) {
  const users = useOffice((s) => s.users);
  const rights = useHotel((s) => s.rights);
  const isOwner = useHotel((s) => s.isOwner);
  const admin = useHotel((s) => s.admin);
  const room = useHotel((s) => s.room);
  useHotel((s) => s.usersV);
  useSocial((s) => s.friends);
  const sent = useSocial((s) => s.sent);
  const requests = useSocial((s) => s.requests);
  const [prof, setProf] = useState(null);
  const [editing, setEditing] = useState(false);
  const [motto, setMotto] = useState('');
  const [, bump] = useState(0);
  const U = hotel.live.users.get(userId);
  const me = userId === hotel.me;

  const load = () => api.get(`/hotel/social/profile/${userId}`).then(setProf).catch(() => {});
  useEffect(() => { load(); }, [userId]); // eslint-disable-line react-hooks/exhaustive-deps
  // Se actualiza en vivo (respetos, lema)
  useEffect(() => social.subscribe(() => bump((x) => x + 1)), []);

  if (!U || !room) return null;
  const live = social.people.get(userId);
  const u = users[userId] || { id: userId, displayName: U.name, avatar: U.avatar };
  const s = hotel.socket;
  const can = hotel.canEdit();
  const target = userId === room.ownerId ? 'owner' : users[userId]?.role === 'admin' ? 'admin' : null;
  const friend = prof?.friend || (social.state.friends || []).some((f) => f.id === userId);
  const pending = sent.includes(userId) || prof?.sent;
  const theyAsked = requests.some((r) => r.id === userId) || prof?.received;
  const mottoNow = live?.motto ?? prof?.motto ?? '';
  const respects = live?.respects ?? prof?.respects ?? 0;
  const badges = prof?.badges || [];
  const left = prof?.respectsLeft;

  const setRight = async (on) => {
    try { if (on) await api.post(`/hotel/rooms/${room.id}/rights`, { userId }); else await api.del(`/hotel/rooms/${room.id}/rights/${userId}`); } catch (e) { office.toast({ title: e.message, kind: 'error' }); }
  };
  const saveMotto = async (e) => {
    e?.preventDefault();
    try { await api.patch('/hotel/social/profile', { motto }); setEditing(false); load(); } catch (err) { office.toast({ title: err.message, kind: 'error' }); }
  };
  const respect = async () => {
    const r = await social.respect(userId);
    if (r.ok) setProf((p) => p && { ...p, respectsLeft: r.left, respects: r.respects });
    else if (r.left === 0) setProf((p) => p && { ...p, respectsLeft: 0 });
  };
  const close = () => hotel.set({ selected: null });

  return (
    <div className="ht-card ht-person" onPointerDown={(e) => e.stopPropagation()}>
      <button className="ht-x" onClick={close} aria-label="Cerrar"><X size={14} /></button>
      <div className="ht-card-top">
        <Avatar user={u} size={48} showStatus={false} />
        <div>
          <b>{u.displayName} <LiveTag userId={userId} /></b>
          <span className="ht-muted">{target === 'owner' ? <><Crown size={11} /> Dueño de la sala</> : rights.includes(userId) ? <><Shield size={11} /> Con permisos</> : friend ? <><Check size={11} /> Tu amigo</> : 'En el Hotel'}</span>
          <span className="ht-respects" title="Respetos recibidos"><ThumbsUp size={12} /> {respects} {respects === 1 ? 'respeto' : 'respetos'}</span>
        </div>
      </div>
      {editing ? (
        <form className="ht-motto-edit" onSubmit={saveMotto}>
          <input className="ht-input" autoFocus maxLength={MOTTO_MAX} value={motto} onChange={(e) => setMotto(e.target.value)} placeholder="Tu lema…" onKeyDown={(e) => { e.stopPropagation(); if (e.key === 'Escape') setEditing(false); }} />
          <button className="ht-btn primary sm">Guardar</button>
        </form>
      ) : (
        <button className={`ht-motto ${me ? 'mine' : ''} ${mottoNow ? '' : 'empty'}`} disabled={!me} onClick={() => { setMotto(mottoNow); setEditing(true); }} title={me ? 'Editar tu lema' : ''}>
          “{mottoNow || (me ? 'Escribe tu lema…' : 'Sin lema')}”{me && <Pencil size={11} />}
        </button>
      )}
      {(badges.length > 0 || me) && <HotelBadgeRow userId={userId} badges={badges} me={me} onPick={() => office.set({ modal: { type: 'badges' } })} />}
      <div className="ht-card-actions">
        {me ? (
          <button className="ht-btn" onClick={() => s.emit('hotel:sit')}><Armchair size={14} /> {U.sit ? 'Pararse' : 'Sentarse'}</button>
        ) : (
          <>
            {friend
              ? <button className="ht-btn primary" onClick={() => { social.openChat(userId); close(); }}><Mail size={14} /> Mensaje</button>
              : theyAsked ? <button className="ht-btn primary" onClick={async () => { await social.accept(userId); load(); }}><Check size={14} /> Aceptar amistad</button>
                : pending ? <button className="ht-btn" disabled><Clock size={14} /> Solicitud enviada</button>
                  : <button className="ht-btn primary" onClick={async () => { if (await social.request(userId)) load(); }}><UserPlus size={14} /> Agregar amigo</button>}
            <button className="ht-btn ht-respect-btn" onClick={respect} disabled={left === 0} title={left === 0 ? 'Ya diste tus respetos de hoy' : `Te quedan ${left ?? RESPECTS_PER_DAY} hoy`}><ThumbsUp size={14} /> Respeto{left != null ? ` · ${left}` : ''}</button>
            <button className="ht-btn" onClick={() => { hotel.set({ chatMode: 'whisper', whisperTo: userId, selected: null }); window.dispatchEvent(new Event('hotel:focus-chat')); }}><MessageCircle size={14} /> Susurrar</button>
            <UserEconomyActions userId={userId} />
            <GiveHandButton userId={userId} />
            <button className="ht-btn" onClick={() => office.set({ profileCard: userId })}>Perfil</button>
            <LiveButton userId={userId} className="ht-btn" />
            {(isOwner || admin) && !room.official && target !== 'owner' && (rights.includes(userId)
              ? <button className="ht-btn" onClick={() => setRight(false)}><ShieldOff size={14} /> Quitar permisos</button>
              : <button className="ht-btn" onClick={() => setRight(true)}><Shield size={14} /> Dar permisos</button>)}
            {can && !target && <button className="ht-btn" onClick={() => { s.emit('hotel:kick', { userId }); close(); }}><UserMinus size={14} /> Sacar</button>}
            {(isOwner || admin) && !target && <button className="ht-btn danger" onClick={() => { s.emit('hotel:kick', { userId, ban: true }); close(); }}><Ban size={14} /> Vetar</button>}
          </>
        )}
      </div>
    </div>
  );
}
