// Hotel: navegador de salas (Oficiales / Populares / Eventos / Favoritas / Mis salas / Buscar) y diálogo para crear sala.
import React, { useEffect, useRef, useState } from 'react';
import { ArrowLeft, Plus, Search, Users, Lock, Bell, KeyRound, Flame, Home, X, Building2, BadgeCheck, PartyPopper, Star, Heart, Clock } from 'lucide-react';
import { office, useOffice } from '../lib/store.js';
import { api } from '../lib/api.js';
import { Avatar } from '../components/ui.jsx';
import { ROOM_MODELS, ACCESS } from '@shared/hotel.js';
import { hotel, useHotel } from './hotelStore.js';
import { drawModelPreview } from './engine.js';
import { ROOM_CATEGORIES, countdown, eventActive, cleanTags } from '@shared/hotelSocial.js';
import { ConsoleButton } from './social/Console.jsx';
import { CategoryPill, CategoryTagsFields, toggleFav, useNow } from './social/RoomSocial.jsx';

export const ACCESS_LABEL = { open: 'Abierta', bell: 'Con timbre', password: 'Con contraseña', closed: 'Cerrada' };
export const ACCESS_DESC = {
  open: 'Cualquiera puede entrar',
  bell: 'Tocan el timbre y tú (o quien tenga permisos) les abres',
  password: 'Entra quien sepa la contraseña',
  closed: 'Solo tú y quien tenga permisos',
};
export const AccessIcon = ({ access, size = 14 }) => (access === 'bell' ? <Bell size={size} /> : access === 'password' ? <KeyRound size={size} /> : access === 'closed' ? <Lock size={size} /> : null);

export function ModelPreview({ model, className = '' }) {
  const ref = useRef(null);
  useEffect(() => { if (ref.current) drawModelPreview(ref.current, model); }, [model]);
  return <canvas ref={ref} className={`ht-model-prev ${className}`} />;
}

export default function Navigator({ onExit }) {
  const rooms = useHotel((s) => s.rooms);
  const tab = useHotel((s) => s.navTab || 'official');
  const myRooms = useHotel((s) => s.myRooms || 0);
  const maxRooms = useHotel((s) => s.maxRooms || 5);
  const entering = useHotel((s) => s.entering);
  const waiting = useHotel((s) => s.waiting);
  const users = useOffice((s) => s.users);
  const cat = useHotel((s) => s.navCat || '');
  const now = useNow();
  const [q, setQ] = useState('');
  const [creating, setCreating] = useState(false);
  const [pw, setPw] = useState('');

  useEffect(() => { hotel.refreshRooms(tab); const t = setInterval(() => hotel.refreshRooms(hotel.state.navTab || 'official', hotel.state.navQ || ''), 15e3); return () => clearInterval(t); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (tab !== 'all') return undefined;
    const t = setTimeout(() => { hotel.set({ navQ: q }); hotel.refreshRooms('all', q); }, 250);
    return () => clearTimeout(t);
  }, [q, tab]);

  const open = (r) => {
    if (r.access === 'password' && !r.isOwner && office.state.me.role !== 'admin') { setPw(''); hotel.set({ entering: { roomId: r.id, askPassword: true, room: r } }); return; }
    hotel.enter(r.id);
  };
  const askRoom = entering?.askPassword && ((rooms || []).find((r) => r.id === entering.roomId) || entering.room);
  const setCat = (c) => { hotel.set({ navCat: c }); hotel.refreshRooms(tab, tab === 'all' ? q : '', c); };
  const fav = async (e, r) => {
    e.stopPropagation();
    const x = await toggleFav(r);
    if (x) hotel.set((st) => ({ rooms: tab === 'favorites' && !x.fav ? st.rooms.filter((y) => y.id !== r.id) : st.rooms.map((y) => (y.id === r.id ? { ...y, ...x } : y)) }));
  };

  return (
    <div className="ht-nav">
      <header className="ht-nav-head">
        <button className="ht-btn ghost" onClick={onExit}><ArrowLeft size={16} /> Volver a la oficina</button>
        <div className="ht-nav-title">
          <div className="ht-logo"><Building2 size={26} /></div>
          <div>
            <h1>Hotel <span>GTAHUB</span></h1>
            <p>Tu cuarto, tus furnis, tu gente. Decora, invita y platica.</p>
          </div>
        </div>
        <div className="ht-nav-actions">
          <ConsoleButton className="ht-btn ht-nav-console" />
          <button className="ht-btn primary" onClick={() => setCreating(true)} disabled={myRooms >= maxRooms} title={myRooms >= maxRooms ? `Máximo ${maxRooms} salas` : ''}><Plus size={16} /> Crear sala</button>
        </div>
      </header>
      <div className="ht-tabs">
        {[['official', BadgeCheck, 'Oficiales'], ['popular', Flame, 'Populares'], ['events', PartyPopper, 'Eventos'], ['favorites', Star, 'Favoritas'], ['mine', Home, 'Mis salas'], ['all', Search, 'Buscar']].map(([id, Icon, label]) => (
          <button key={id} className={`ht-tab ${tab === id ? 'on' : ''}`} onClick={() => hotel.refreshRooms(id, id === 'all' ? q : '')}><Icon size={15} /> {label}</button>
        ))}
        {tab === 'all' && <input className="ht-input ht-search" autoFocus placeholder="Nombre, owner:usuario o #etiqueta" value={q} onChange={(e) => setQ(e.target.value)} />}
        {tab === 'mine' && <span className="ht-tabs-note">{myRooms} de {maxRooms} salas</span>}
      </div>
      {(tab === 'popular' || tab === 'all') && (
        <div className="ht-cat-row">
          <button className={`ht-chip ${!cat ? 'on' : ''}`} onClick={() => setCat('')}>Todas</button>
          {ROOM_CATEGORIES.map((c) => <button key={c.id} className={`ht-chip ${cat === c.id ? 'on' : ''}`} onClick={() => setCat(cat === c.id ? '' : c.id)}>{c.emoji} {c.name}</button>)}
        </div>
      )}
      <div className="ht-rooms">
        {rooms == null && <div className="ht-empty">Cargando salas…</div>}
        {rooms?.length === 0 && (
          <div className="ht-empty">
            {tab === 'mine' ? <>Aún no tienes sala. <button className="ht-link" onClick={() => setCreating(true)}>¡Crea la tuya!</button></> : tab === 'all' ? 'No hay salas con esa búsqueda' : tab === 'events' ? <>No hay eventos ahora. Si tienes sala, ábrela y toca <b>ⓘ → Promocionar evento</b>.</> : tab === 'favorites' ? <>Aún no tienes favoritas. Toca la <Star size={13} /> de una sala para guardarla.</> : cat ? 'No hay salas en esa categoría' : <>Todavía no hay salas en el Hotel. <button className="ht-link" onClick={() => setCreating(true)}>Estrena la primera</button></>}
          </div>
        )}
        {rooms?.map((r) => {
          const owner = users[r.ownerId] || { id: r.ownerId, displayName: r.ownerName, avatar: r.ownerAvatar };
          const full = r.users >= r.capacity;
          const ev = eventActive(r.event, now) ? r.event : null;
          return (
            <button key={r.id} className={`ht-room-card ${r.official ? 'official' : ''} ${ev ? 'has-event' : ''}`} onClick={() => open(r)} disabled={entering?.roomId === r.id && !entering.askPassword}>
              <div className="ht-room-thumb" style={{ '--floor': r.floorColor || '#b59a7a' }}>
                <ModelPreview model={r.model} />
                <span className={`ht-pill ${r.users ? 'live' : ''} ${full ? 'full' : ''}`}><Users size={12} /> {r.users}/{r.capacity}</span>
                {r.access !== 'open' && <span className="ht-lock" title={ACCESS_LABEL[r.access]}><AccessIcon access={r.access} /></span>}
                {r.official && <span className="ht-official-badge" title="Sala oficial de GTAHUB"><BadgeCheck size={12} /> GTAHUB</span>}
                <span role="button" tabIndex={0} className={`ht-card-star ${r.fav ? 'on' : ''}`} title={r.fav ? 'Quitar de favoritas' : 'Guardar en favoritas'} onClick={(e) => fav(e, r)} onKeyDown={(e) => { if (e.key === 'Enter') fav(e, r); }}><Star size={14} fill={r.fav ? 'currentColor' : 'none'} /></span>
                {ev && <span className="ht-ev-ribbon"><PartyPopper size={12} /> EVENTO</span>}
              </div>
              <div className="ht-room-info">
                <b>{r.name}</b>
                {ev ? <span className="ht-room-ev"><b>{ev.title}</b><span><Clock size={11} /> {countdown(ev.endsAt - now)}</span></span> : r.description && <span className="ht-room-desc">{r.description}</span>}
                <span className="ht-room-meta">
                  <CategoryPill id={r.category} small />
                  {(r.tags || []).map((t) => <span key={t} className="ht-tag sm">#{t}</span>)}
                  <span className={`ht-likes ${r.liked ? 'on' : ''}`} title={`${r.likes || 0} likes`}><Heart size={12} fill={r.liked ? 'currentColor' : 'none'} /> {r.likes || 0}</span>
                </span>
                {r.official
                  ? <span className="ht-room-owner ht-official-owner"><BadgeCheck size={15} /> Sala oficial</span>
                  : <span className="ht-room-owner"><Avatar user={owner} size={18} showStatus={false} /> {r.isOwner ? 'Tuya' : owner.displayName}</span>}
              </div>
            </button>
          );
        })}
      </div>
      {creating && <CreateRoom onClose={() => setCreating(false)} />}
      {askRoom && (
        <div className="ht-overlay" onClick={() => hotel.set({ entering: null })}>
          <form className="ht-window small" onClick={(e) => e.stopPropagation()} onSubmit={(e) => { e.preventDefault(); hotel.enter(askRoom.id, pw); }}>
            <div className="ht-win-head"><KeyRound size={16} /> {askRoom.name}<button type="button" className="ht-x" onClick={() => hotel.set({ entering: null })}><X size={16} /></button></div>
            <div className="ht-win-body">
              <p>Esta sala tiene contraseña.</p>
              <input className="ht-input" type="password" autoFocus placeholder="Contraseña" value={pw} onChange={(e) => setPw(e.target.value)} />
              {entering.error && <p className="ht-error">{entering.error}</p>}
            </div>
            <div className="ht-win-foot"><button className="ht-btn primary" disabled={!pw}>Entrar</button></div>
          </form>
        </div>
      )}
      {waiting && (
        <div className="ht-overlay">
          <div className="ht-window small ht-waiting">
            <div className="ht-bell-anim"><Bell size={34} /></div>
            <b>Tocaste el timbre</b>
            <p>Espera a que alguien de la sala te abra…</p>
            <button className="ht-btn" onClick={() => hotel.cancelWaiting()}>Cancelar</button>
          </div>
        </div>
      )}
    </div>
  );
}

function CreateRoom({ onClose }) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [model, setModel] = useState('b');
  const [access, setAccess] = useState('open');
  const [password, setPassword] = useState('');
  const [category, setCategory] = useState('otros');
  const [tags, setTags] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const submit = async (e) => {
    e.preventDefault();
    setBusy(true); setError('');
    try {
      const r = await api.post('/hotel/rooms', { name, description, model, access, password: access === 'password' ? password : undefined, category, tags: cleanTags(tags) });
      onClose();
      hotel.refreshRooms('mine');
      hotel.enter(r.room.id);
    } catch (err) { setError(err.message); } finally { setBusy(false); }
  };
  return (
    <div className="ht-overlay" onClick={onClose}>
      <form className="ht-window ht-create" onClick={(e) => e.stopPropagation()} onSubmit={submit}>
        <div className="ht-win-head"><Plus size={16} /> Crear sala<button type="button" className="ht-x" onClick={onClose}><X size={16} /></button></div>
        <div className="ht-win-body">
          <label className="ht-field"><span>Nombre</span><input className="ht-input" autoFocus maxLength={40} value={name} onChange={(e) => setName(e.target.value)} placeholder="El cuarto de…" /></label>
          <label className="ht-field"><span>Descripción <i>(opcional)</i></span><input className="ht-input" maxLength={200} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="¿De qué va tu sala?" /></label>
          <div className="ht-field"><span>Modelo</span>
            <div className="ht-models">
              {Object.entries(ROOM_MODELS).filter(([, m]) => !m.official).map(([id, m]) => (
                <button type="button" key={id} className={`ht-model ${model === id ? 'on' : ''}`} onClick={() => setModel(id)}>
                  <ModelPreview model={id} />
                  <b>{m.name}</b><span>{m.size}</span>
                </button>
              ))}
            </div>
          </div>
          <div className="ht-field"><span>¿Quién puede entrar?</span>
            <div className="ht-access">
              {ACCESS.map((a) => (
                <button type="button" key={a} className={`ht-chip ${access === a ? 'on' : ''}`} onClick={() => setAccess(a)} title={ACCESS_DESC[a]}><AccessIcon access={a} /> {ACCESS_LABEL[a]}</button>
              ))}
            </div>
            <small className="ht-muted">{ACCESS_DESC[access]}</small>
          </div>
          {access === 'password' && <label className="ht-field"><span>Contraseña</span><input className="ht-input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Mínimo 3 caracteres" /></label>}
          <CategoryTagsFields category={category} setCategory={setCategory} tags={tags} setTags={setTags} />
          {error && <p className="ht-error">{error}</p>}
        </div>
        <div className="ht-win-foot">
          <button type="button" className="ht-btn ghost" onClick={onClose}>Cancelar</button>
          <button className="ht-btn primary" disabled={busy || !name.trim()}>{busy ? 'Creando…' : 'Crear y entrar'}</button>
        </div>
      </form>
    </div>
  );
}
