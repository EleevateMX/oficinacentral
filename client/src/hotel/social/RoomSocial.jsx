// Hotel: lo social de la sala. Barra con like (corazón), favorita (estrella) e info; tarjeta de info
// con categoría, etiquetas y "Promocionar evento" (1–3 h); banner del evento con cuenta regresiva;
// y el bloque de categoría/etiquetas para los ajustes.
import React, { useEffect, useState } from 'react';
import { Heart, Star, Info, X, PartyPopper, Clock, Tag, Megaphone } from 'lucide-react';
import { office } from '../../lib/store.js';
import { api } from '../../lib/api.js';
import { ROOM_CATEGORIES, CATEGORY_BY_ID, MAX_TAGS, EVENT_HOURS, EVENT_TITLE_MAX, EVENT_DESC_MAX, countdown, eventActive, cleanTags } from '@shared/hotelSocial.js';
import { hotel, useHotel } from '../hotelStore.js';

// Reloj que re-renderiza cada segundo (cuentas regresivas)
export function useNow(ms = 1000) {
  const [t, setT] = useState(Date.now());
  useEffect(() => { const i = setInterval(() => setT(Date.now()), ms); return () => clearInterval(i); }, [ms]);
  return t;
}

export async function toggleLike(room) {
  try {
    const r = room.liked ? await api.del(`/hotel/social/rooms/${room.id}/like`) : await api.post(`/hotel/social/rooms/${room.id}/like`);
    return { likes: r.likes, liked: r.liked };
  } catch (e) { office.toast({ title: e.message, kind: 'error' }); return null; }
}
export async function toggleFav(room) {
  try {
    const r = room.fav ? await api.del(`/hotel/social/rooms/${room.id}/fav`) : await api.post(`/hotel/social/rooms/${room.id}/fav`);
    if (r.fav) office.toast({ title: '⭐ Guardada en Favoritas' });
    return { fav: r.fav };
  } catch (e) { office.toast({ title: e.message, kind: 'error' }); return null; }
}

export function CategoryPill({ id, small = false }) {
  const c = CATEGORY_BY_ID[id];
  if (!c || id === 'otros') return null;
  return <span className={`ht-cat-pill ${small ? 'sm' : ''}`}>{c.emoji} {c.name}</span>;
}

// Barra junto al nombre de la sala
export function RoomSocialBar() {
  const room = useHotel((s) => s.room);
  const [info, setInfo] = useState(false);
  if (!room) return null;
  const mine = room.isOwner && !room.official;
  const like = async () => { const r = await toggleLike(room); if (r) hotel.set({ room: { ...hotel.state.room, ...r } }); };
  const fav = async () => { const r = await toggleFav(room); if (r) hotel.set({ room: { ...hotel.state.room, ...r } }); };
  return (
    <>
      <div className="ht-room-social">
        <button className={`ht-heart ${room.liked ? 'on' : ''}`} onClick={like} disabled={mine} title={mine ? 'Likes de tu sala' : room.liked ? 'Quitar like' : 'Me gusta esta sala'}><Heart size={15} fill={room.liked ? 'currentColor' : 'none'} /> {room.likes || 0}</button>
        <button className={`ht-star ${room.fav ? 'on' : ''}`} onClick={fav} title={room.fav ? 'Quitar de favoritas' : 'Guardar en favoritas'}><Star size={15} fill={room.fav ? 'currentColor' : 'none'} /></button>
        <button className={`ht-star ${info ? 'on' : ''}`} onClick={() => setInfo((v) => !v)} title="Info de la sala"><Info size={15} /></button>
      </div>
      {info && <RoomInfoCard room={room} onClose={() => setInfo(false)} />}
    </>
  );
}

function RoomInfoCard({ room, onClose }) {
  const admin = useHotel((s) => s.admin);
  const canPromote = room.official ? admin : room.isOwner || admin;
  const [promo, setPromo] = useState(false);
  const now = useNow();
  const ev = eventActive(room.event, now) ? room.event : null;
  const end = async () => {
    try { await api.del(`/hotel/social/rooms/${room.id}/event`); office.toast({ title: 'Evento terminado' }); } catch (e) { office.toast({ title: e.message, kind: 'error' }); }
  };
  return (
    <div className="ht-window ht-roominfo" onPointerDown={(e) => e.stopPropagation()}>
      <div className="ht-win-head"><Info size={16} /> {room.name}<button className="ht-x" onClick={onClose} aria-label="Cerrar"><X size={16} /></button></div>
      <div className="ht-win-body">
        {room.description ? <p className="ht-roominfo-desc">{room.description}</p> : <p className="ht-muted small">Sin descripción.</p>}
        <div className="ht-roominfo-meta">
          <CategoryPill id={room.category} />
          {(room.tags || []).map((t) => <span key={t} className="ht-tag">#{t}</span>)}
          <span className="ht-cat-pill ghost"><Heart size={12} /> {room.likes || 0} {room.likes === 1 ? 'like' : 'likes'}</span>
        </div>
        {ev && (
          <div className="ht-ev-box">
            <PartyPopper size={18} />
            <div><b>{ev.title}</b>{ev.description && <span>{ev.description}</span>}<small><Clock size={11} /> Termina en {countdown(ev.endsAt - now)}</small></div>
          </div>
        )}
        {canPromote && !promo && (
          <div className="ht-roominfo-actions">
            <button className="ht-btn primary sm" onClick={() => setPromo(true)}><Megaphone size={14} /> {ev ? 'Cambiar evento' : 'Promocionar evento'}</button>
            {ev && <button className="ht-btn sm" onClick={end}>Terminar evento</button>}
          </div>
        )}
        {promo && <EventForm room={room} ev={ev} onDone={() => setPromo(false)} />}
      </div>
    </div>
  );
}

function EventForm({ room, ev, onDone }) {
  const [title, setTitle] = useState(ev?.title || '');
  const [description, setDescription] = useState(ev?.description || '');
  const [hours, setHours] = useState(1);
  const [busy, setBusy] = useState(false);
  const go = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      await api.post(`/hotel/social/rooms/${room.id}/event`, { title, description, hours });
      office.toast({ title: '🎉 ¡Tu sala ya aparece en Eventos!' });
      onDone();
    } catch (err) { office.toast({ title: err.message, kind: 'error' }); } finally { setBusy(false); }
  };
  const stop = (e) => e.stopPropagation();
  return (
    <form className="ht-ev-form" onSubmit={go}>
      <label className="ht-field"><span>Título del evento</span><input className="ht-input" autoFocus maxLength={EVENT_TITLE_MAX} value={title} onChange={(e) => setTitle(e.target.value)} onKeyDown={stop} placeholder="Noche de karaoke 🎤" /></label>
      <label className="ht-field"><span>Descripción <i>(opcional)</i></span><input className="ht-input" maxLength={EVENT_DESC_MAX} value={description} onChange={(e) => setDescription(e.target.value)} onKeyDown={stop} placeholder="¿Qué va a pasar?" /></label>
      <div className="ht-field"><span>Duración</span>
        <div className="ht-access">{EVENT_HOURS.map((h) => <button type="button" key={h} className={`ht-chip ${hours === h ? 'on' : ''}`} onClick={() => setHours(h)}>{h} {h === 1 ? 'hora' : 'horas'}</button>)}</div>
      </div>
      <div className="ht-roominfo-actions">
        <button type="button" className="ht-btn ghost sm" onClick={onDone}>Cancelar</button>
        <button className="ht-btn primary sm" disabled={busy || !title.trim()}><PartyPopper size={14} /> Promocionar</button>
      </div>
    </form>
  );
}

// Banner arriba al centro cuando la sala tiene evento
export function EventBanner() {
  const room = useHotel((s) => s.room);
  const now = useNow();
  const [hidden, setHidden] = useState(null);
  const ev = room?.event;
  if (!eventActive(ev, now) || hidden === ev.startsAt) return null;
  return (
    <div className="ht-ev-banner" onPointerDown={(e) => e.stopPropagation()}>
      <span className="ht-ev-icon"><PartyPopper size={18} /></span>
      <div className="ht-ev-txt"><b>{ev.title}</b>{ev.description && <span>{ev.description}</span>}</div>
      <span className="ht-ev-time"><Clock size={12} /> {countdown(ev.endsAt - now)}</span>
      <button className="ht-ev-x" onClick={() => setHidden(ev.startsAt)} aria-label="Ocultar"><X size={13} /></button>
    </div>
  );
}

// Para crear sala y para los ajustes
export function CategoryTagsFields({ category, setCategory, tags, setTags }) {
  return (
    <>
      <div className="ht-field"><span>Categoría</span>
        <div className="ht-access">{ROOM_CATEGORIES.map((c) => <button type="button" key={c.id} className={`ht-chip ${category === c.id ? 'on' : ''}`} onClick={() => setCategory(c.id)}>{c.emoji} {c.name}</button>)}</div>
      </div>
      <label className="ht-field"><span><Tag size={11} /> Etiquetas <i>(hasta {MAX_TAGS}, separadas por coma)</i></span>
        <input className="ht-input" maxLength={40} value={tags} onChange={(e) => setTags(e.target.value)} placeholder="karaoke, roleplay" onKeyDown={(e) => e.stopPropagation()} />
        {cleanTags(tags).length > 0 && <div className="ht-roominfo-meta">{cleanTags(tags).map((t) => <i key={t} className="ht-tag">#{t}</i>)}</div>}
      </label>
    </>
  );
}

export function RoomSocialSettings() {
  const room = useHotel((s) => s.room);
  const [category, setCategory] = useState(room?.category || 'otros');
  const [tags, setTags] = useState((room?.tags || []).join(', '));
  const [busy, setBusy] = useState(false);
  if (!room) return null;
  const dirty = category !== (room.category || 'otros') || cleanTags(tags).join(',') !== (room.tags || []).join(',');
  const save = async () => {
    setBusy(true);
    try { const r = await api.patch(`/hotel/rooms/${room.id}`, { category, tags: cleanTags(tags) }); hotel.set({ room: r.room }); setTags(r.room.tags.join(', ')); office.toast({ title: '✅ Categoría y etiquetas guardadas' }); } catch (e) { office.toast({ title: e.message, kind: 'error' }); } finally { setBusy(false); }
  };
  return (
    <div className="ht-social-settings">
      <CategoryTagsFields category={category} setCategory={setCategory} tags={tags} setTags={setTags} />
      {dirty && <button className="ht-btn primary sm" disabled={busy} onClick={save}>Guardar categoría y etiquetas</button>}
    </div>
  );
}
