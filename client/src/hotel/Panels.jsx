// Hotel: ventanas de la sala (inventario, tienda, ajustes, historial de chat) y tarjetas de furni / persona.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { X, Package, ShoppingBag, Settings, MessageSquare, RotateCw, Move, Hand, Play, Trash2, Gift, Search, Crown, UserMinus, Ban, MessageCircle, Shield, ShieldOff, Armchair, Gem } from 'lucide-react';
import { office, useOffice } from '../lib/store.js';
import { api } from '../lib/api.js';
import { Avatar } from '../components/ui.jsx';
import * as HC from '@shared/hotelCatalog.js';
import { ACCESS, MAX_INVENTORY } from '@shared/hotel.js';
import { hotel, useHotel } from './hotelStore.js';
import { drawFurniIcon, DEFAULT_FLOOR, DEFAULT_WALL } from './engine.js';
import { ACCESS_LABEL, ACCESS_DESC, AccessIcon } from './Navigator.jsx';

const { HOTEL_CATS, HOTEL_FURNI, FURNI_BY_ID } = HC;
const fmt = (n) => Number(n || 0).toLocaleString('es-MX');

// Ícono que se dibuja solo cuando se ve (la tienda puede tener cientos de furnis)
export function FurniIcon({ type, color, size = 56 }) {
  const ref = useRef(null);
  useEffect(() => {
    const c = ref.current, def = FURNI_BY_ID[type];
    if (!c || !def) return undefined;
    let done = false;
    const draw = () => { if (!done) { done = true; drawFurniIcon(c, def, color, size); } };
    if (!('IntersectionObserver' in window)) { draw(); return undefined; }
    const io = new IntersectionObserver((es) => { if (es.some((e) => e.isIntersecting)) { draw(); io.disconnect(); } }, { rootMargin: '120px' });
    io.observe(c);
    return () => io.disconnect();
  }, [type, color, size]);
  return <canvas ref={ref} className="ht-icon" style={{ width: size, height: size }} />;
}

export function Window({ title, icon: Icon, onClose, children, className = '', foot }) {
  return (
    <div className={`ht-window ht-panel ${className}`} onPointerDown={(e) => e.stopPropagation()}>
      <div className="ht-win-head">{Icon && <Icon size={16} />} {title}<button className="ht-x" onClick={onClose} aria-label="Cerrar"><X size={16} /></button></div>
      <div className="ht-win-body">{children}</div>
      {foot && <div className="ht-win-foot">{foot}</div>}
    </div>
  );
}

// ---------- Inventario ----------
export function InventoryPanel() {
  const inv = useHotel((s) => s.inventory);
  const inRoom = useHotel((s) => s.screen === 'room');
  useHotel((s) => s.rights);
  const [q, setQ] = useState('');
  const groups = useMemo(() => {
    const m = new Map();
    for (const it of inv || []) {
      const def = FURNI_BY_ID[it.type];
      if (!def) continue;
      const k = `${it.type}|${it.color || ''}`;
      if (!m.has(k)) m.set(k, { key: k, def, color: it.color, items: [] });
      m.get(k).items.push(it);
    }
    return [...m.values()].filter((g) => !q || g.def.name.toLowerCase().includes(q.toLowerCase())).sort((a, b) => a.def.name.localeCompare(b.def.name));
  }, [inv, q]);
  const pick = (g) => {
    if (!inRoom) return office.toast({ title: 'Entra a una sala para colocar furnis' });
    if (!hotel.canEdit()) return office.toast({ title: 'Solo puedes decorar tus salas o donde te den permisos' });
    hotel.startPlacing(g.items[0]);
    if (window.matchMedia('(max-width: 680px)').matches) hotel.set({ panel: null });
  };
  return (
    <Window title={`Inventario · ${inv?.length || 0}/${MAX_INVENTORY}`} icon={Package} onClose={() => hotel.set({ panel: null })} className="ht-inv">
      <input className="ht-input" placeholder="Buscar en tu inventario…" value={q} onChange={(e) => setQ(e.target.value)} />
      {inv == null ? <p className="ht-muted">Cargando…</p> : !groups.length ? (
        <div className="ht-empty small">{q ? 'Nada con ese nombre' : <>Tu inventario está vacío. <button className="ht-link" onClick={() => hotel.set({ panel: 'catalog' })}>Ve a la Tienda</button></>}</div>
      ) : (
        <div className="ht-grid">
          {groups.map((g) => (
            <button key={g.key} className="ht-cell" onClick={() => pick(g)} title={`${g.def.name} · clic para colocar`}>
              <FurniIcon type={g.def.id} color={g.color} />
              {g.items.length > 1 && <span className="ht-count">{g.items.length}</span>}
              {g.def.exclusive && <span className="ht-gem"><Gem size={10} /></span>}
              <span className="ht-cell-name">{g.def.name}</span>
            </button>
          ))}
        </div>
      )}
      <p className="ht-hint">Haz clic en un furni y luego en la sala para colocarlo. <b>R</b> lo gira, <b>Esc</b> cancela.</p>
    </Window>
  );
}

// ---------- Tienda ----------
export function CatalogPanel() {
  const me = useOffice((s) => s.me);
  const admin = me?.role === 'admin';
  const [cat, setCat] = useState(HOTEL_CATS[0].id);
  const [line, setLine] = useState(null);
  const [q, setQ] = useState('');
  const [sel, setSel] = useState(null);
  const [color, setColor] = useState(null);
  const [busy, setBusy] = useState(false);
  const [gift, setGift] = useState(false);
  const lines = HC['HOTEL_LINES'.toString()] || []; // líneas temáticas (shared/hotelLines)
  const items = useMemo(() => {
    const s = q.trim().toLowerCase();
    return HOTEL_FURNI.filter((f) => (s ? f.name.toLowerCase().includes(s) || f.id.includes(s) : line ? f.line === line : f.cat === cat));
  }, [cat, q, line]);
  // Agrupar por línea (si el catálogo las define)
  const grouped = useMemo(() => {
    if (line) return [{ id: line, name: null, list: items }];
    const m = new Map();
    for (const f of items) { const k = f.line || ''; if (!m.has(k)) m.set(k, []); m.get(k).push(f); }
    return [...m.entries()].map(([k, list]) => ({ id: k, name: k ? lines.find((l) => l.id === k)?.name || k : null, list }));
  }, [items, lines, line]);
  const def = sel && FURNI_BY_ID[sel];
  useEffect(() => { setColor(def?.colors?.[0] || null); setGift(false); }, [sel]); // eslint-disable-line react-hooks/exhaustive-deps
  const get = async () => {
    setBusy(true);
    try {
      const r = await api.post('/hotel/buy', { type: def.id, color });
      hotel.onInv({ add: r.items });
      office.toast({ title: `✅ ${def.name}${r.items.length > 1 ? ` (par de ${r.items.length})` : ''} ya está en tu inventario`, action: { label: 'Ver', run: () => hotel.set({ panel: 'inventory' }) } });
    } catch (e) { office.toast({ title: e.message, kind: 'error' }); } finally { setBusy(false); }
  };
  return (
    <Window title="Tienda" icon={ShoppingBag} onClose={() => hotel.set({ panel: null })} className="ht-shop">
      <div className="ht-shop-body">
        <nav className="ht-cats">
          <div className="ht-search-wrap"><Search size={14} /><input className="ht-input" placeholder="Buscar furni…" value={q} onChange={(e) => setQ(e.target.value)} /></div>
          {HOTEL_CATS.map((c) => <button key={c.id} className={`ht-cat ${!q && !line && cat === c.id ? 'on' : ''}`} onClick={() => { setCat(c.id); setLine(null); setQ(''); }}>{c.name}</button>)}
          {lines.length > 0 && <h4 className="ht-line ht-cats-title">Líneas</h4>}
          {lines.map((l) => <button key={l.id} className={`ht-cat ${!q && line === l.id ? 'on' : ''}`} title={l.desc || ''} onClick={() => { setLine(l.id); setQ(''); }}>{l.name}</button>)}
        </nav>
        <div className="ht-shop-main">
          <div className="ht-shop-list">
            {!items.length && <p className="ht-muted">No hay furnis con ese nombre</p>}
            {grouped.map((g) => (
              <section key={g.id || 'all'}>
                {g.name && <h4 className="ht-line">{g.name}</h4>}
                <div className="ht-grid">
                  {g.list.map((f) => (
                    <button key={f.id} className={`ht-cell ${sel === f.id ? 'on' : ''} ${f.exclusive ? 'excl' : ''}`} onClick={() => setSel(f.id)} title={f.name}>
                      <FurniIcon type={f.id} />
                      {f.exclusive && <span className="ht-gem"><Gem size={10} /></span>}
                      <span className="ht-cell-name">{f.name}</span>
                    </button>
                  ))}
                </div>
              </section>
            ))}
          </div>
          {def && (
            <div className="ht-detail">
              <FurniIcon key={`${def.id}-${color}`} type={def.id} color={color} size={88} />
              <div className="ht-detail-info">
                <b>{def.name}</b>
                {def.exclusive ? <span className="ht-excl"><Gem size={12} /> Exclusivo HUB · 💎 {fmt(def.price)} créditos HUB</span> : <span className="ht-free">Gratis</span>}
                {def.interact === 'teleport' && <span className="ht-muted">Viene en par: uno te lleva al otro (aunque esté en otra sala)</span>}
                {def.colors?.length > 1 && (
                  <div className="ht-swatches">{def.colors.map((c) => <button key={c} className={`ht-swatch ${color === c ? 'on' : ''}`} style={{ background: c }} onClick={() => setColor(c)} aria-label={c} />)}</div>
                )}
                <div className="ht-detail-actions">
                  {def.exclusive && !admin
                    ? <button className="ht-btn" disabled title="Solo los admins pueden obtener furnis exclusivos">Solo admins</button>
                    : <button className="ht-btn primary" disabled={busy} onClick={get}>{def.interact === 'teleport' ? 'Obtener par' : 'Obtener'}</button>}
                  {admin && <button className="ht-btn" onClick={() => setGift((g) => !g)}><Gift size={14} /> Regalar</button>}
                </div>
                {gift && <GiftPicker def={def} color={color} onDone={() => setGift(false)} />}
              </div>
            </div>
          )}
        </div>
      </div>
    </Window>
  );
}

function GiftPicker({ def, color, onDone }) {
  const users = useOffice((s) => s.users);
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);
  const list = useMemo(() => Object.values(users).filter((u) => !u.disabled && (!q || u.displayName.toLowerCase().includes(q.toLowerCase()) || u.username?.toLowerCase().includes(q.toLowerCase()))).sort((a, b) => a.displayName.localeCompare(b.displayName)).slice(0, 8), [users, q]);
  const send = async (u) => {
    setBusy(true);
    try {
      await api.post('/hotel/gift', { type: def.id, color, userId: u.id });
      office.toast({ title: `🎁 Le regalaste ${def.name} a ${u.displayName}` });
      if (u.id === office.state.me.id) hotel.loadInventory();
      onDone();
    } catch (e) { office.toast({ title: e.message, kind: 'error' }); } finally { setBusy(false); }
  };
  return (
    <div className="ht-gift">
      <input className="ht-input" autoFocus placeholder="¿A quién se lo regalas?" value={q} onChange={(e) => setQ(e.target.value)} />
      <div className="ht-gift-list">
        {list.map((u) => <button key={u.id} disabled={busy} onClick={() => send(u)}><Avatar user={u} size={22} showStatus={false} /> {u.displayName}</button>)}
      </div>
    </div>
  );
}

// ---------- Ajustes de la sala ----------
const WALLS = ['#e7dfd3', '#f4f4f6', '#d9d4ec', '#ffd6e4', '#cfe7dd', '#2b2d38', '#141414', '#FE3377', '#FFCC00', '#3a86ff'];
const FLOORS = ['#b59a7a', '#8a6a4f', '#d8c7ae', '#9aa3ad', '#2b2d38', '#3f4652', '#c0392b', '#2fb67c', '#FE3377', '#f2c94c'];

export function SettingsPanel() {
  const room = useHotel((s) => s.room);
  const rights = useHotel((s) => s.rights);
  const isOwner = useHotel((s) => s.isOwner);
  useHotel((s) => s.usersV);
  const users = useOffice((s) => s.users);
  const [name, setName] = useState(room?.name || '');
  const [description, setDescription] = useState(room?.description || '');
  const [access, setAccess] = useState(room?.access || 'open');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);
  if (!room) return null;
  const patch = async (body) => {
    setBusy(true);
    try { const r = await api.patch(`/hotel/rooms/${room.id}`, body); hotel.set({ room: r.room }); return true; } catch (e) { office.toast({ title: e.message, kind: 'error' }); return false; } finally { setBusy(false); }
  };
  const save = async () => { if (await patch({ name, description, access, ...(access === 'password' && password ? { password } : {}) })) office.toast({ title: '✅ Sala guardada' }); };
  const setRight = async (uid, on) => {
    try {
      if (on) await api.post(`/hotel/rooms/${room.id}/rights`, { userId: uid });
      else await api.del(`/hotel/rooms/${room.id}/rights/${uid}`);
    } catch (e) { office.toast({ title: e.message, kind: 'error' }); }
  };
  const del = async () => {
    try { await api.del(`/hotel/rooms/${room.id}`); hotel.set({ panel: null }); office.toast({ title: 'Sala borrada: los furnis regresaron a los inventarios' }); } catch (e) { office.toast({ title: e.message, kind: 'error' }); }
  };
  const here = [...hotel.live.users.values()].filter((u) => u.id !== room.ownerId);
  const nameOf = (id) => users[id]?.displayName || hotel.live.users.get(id)?.name || `#${id}`;
  return (
    <Window title="Ajustes de la sala" icon={Settings} onClose={() => hotel.set({ panel: null })} className="ht-settings">
      <label className="ht-field"><span>Nombre</span><input className="ht-input" maxLength={40} value={name} onChange={(e) => setName(e.target.value)} /></label>
      <label className="ht-field"><span>Descripción</span><input className="ht-input" maxLength={200} value={description} onChange={(e) => setDescription(e.target.value)} /></label>
      <div className="ht-field"><span>¿Quién puede entrar?</span>
        <div className="ht-access">{ACCESS.map((a) => <button type="button" key={a} className={`ht-chip ${access === a ? 'on' : ''}`} onClick={() => setAccess(a)} title={ACCESS_DESC[a]}><AccessIcon access={a} /> {ACCESS_LABEL[a]}</button>)}</div>
      </div>
      {access === 'password' && <label className="ht-field"><span>Contraseña {room.hasPassword && <i>(déjala vacía para no cambiarla)</i>}</span><input className="ht-input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} /></label>}
      <button className="ht-btn primary" disabled={busy || !name.trim()} onClick={save}>Guardar</button>
      <div className="ht-field"><span>Color de pared</span>
        <div className="ht-swatches">{WALLS.map((c) => <button key={c} className={`ht-swatch ${(room.wallColor || DEFAULT_WALL) === c ? 'on' : ''}`} style={{ background: c }} onClick={() => patch({ wallColor: c })} aria-label={c} />)}
          <input type="color" className="ht-color" value={room.wallColor || DEFAULT_WALL} onChange={(e) => patch({ wallColor: e.target.value })} /></div>
      </div>
      <div className="ht-field"><span>Color de piso</span>
        <div className="ht-swatches">{FLOORS.map((c) => <button key={c} className={`ht-swatch ${(room.floorColor || DEFAULT_FLOOR) === c ? 'on' : ''}`} style={{ background: c }} onClick={() => patch({ floorColor: c })} aria-label={c} />)}
          <input type="color" className="ht-color" value={room.floorColor || DEFAULT_FLOOR} onChange={(e) => patch({ floorColor: e.target.value })} /></div>
      </div>
      {!room.official && <div className="ht-field"><span>Permisos para decorar</span>
        {!rights.length && <small className="ht-muted">Nadie más tiene permisos.</small>}
        {rights.map((id) => <div key={id} className="ht-right-row"><Shield size={14} /> {nameOf(id)}<button className="ht-link" onClick={() => setRight(id, false)}>Quitar</button></div>)}
        {here.filter((u) => !rights.includes(u.id)).length > 0 && <small className="ht-muted">En la sala ahora:</small>}
        {here.filter((u) => !rights.includes(u.id)).map((u) => <div key={u.id} className="ht-right-row"><span className="ht-dot" /> {u.name}<button className="ht-link" onClick={() => setRight(u.id, true)}>Dar permisos</button></div>)}
      </div>}
      {room.official && <small className="ht-muted">Sala oficial: solo los admins la decoran y no se puede borrar.</small>}
      {(isOwner || office.state.me.role === 'admin') && !room.official && (
        <div className="ht-danger">
          {!confirmDel ? <button className="ht-btn danger" onClick={() => setConfirmDel(true)}><Trash2 size={14} /> Borrar sala</button> : (
            <><span>¿Seguro? Los furnis regresan a sus dueños.</span><button className="ht-btn danger" onClick={del}>Sí, borrar</button><button className="ht-btn ghost" onClick={() => setConfirmDel(false)}>No</button></>
          )}
        </div>
      )}
    </Window>
  );
}

// ---------- Historial del chat ----------
export function ChatLogPanel() {
  const log = useHotel((s) => s.chatLog);
  const ref = useRef(null);
  useEffect(() => { ref.current?.scrollTo(0, 1e6); }, [log.length]);
  const time = (t) => new Date(t).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });
  return (
    <Window title="Historial del chat" icon={MessageSquare} onClose={() => hotel.set({ panel: null })} className="ht-log">
      <div className="ht-log-list" ref={ref}>
        {!log.length && <p className="ht-muted">Aún no hay mensajes en esta sala.</p>}
        {log.map((m) => (
          <div key={m.id} className={`ht-log-line ${m.mode}`}>
            <span className="ht-log-time">{time(m.at)}</span>
            <b>{m.name}{m.mode === 'whisper' ? ` → ${hotel.live.users.get(m.to)?.name || 'ti'}` : ''}:</b> {m.text}
          </div>
        ))}
      </div>
    </Window>
  );
}

// ---------- Tarjeta de furni ----------
export function ItemCard({ item }) {
  const users = useOffice((s) => s.users);
  useHotel((s) => s.rights);
  useHotel((s) => s.itemsV);
  const def = FURNI_BY_ID[item.type];
  if (!def) return null;
  const live = hotel.live.items.get(item.id) || item;
  const can = hotel.canEdit();
  const owner = users[live.ownerId];
  const s = hotel.socket;
  const useLabel = def.interact === 'dice' ? 'Tirar' : def.interact === 'teleport' ? 'Entrar' : def.interact === 'gate' ? (live.state ? 'Cerrar' : 'Abrir') : live.state ? 'Apagar' : 'Encender';
  return (
    <div className="ht-card" onPointerDown={(e) => e.stopPropagation()}>
      <button className="ht-x" onClick={() => hotel.set({ selected: null })} aria-label="Cerrar"><X size={14} /></button>
      <div className="ht-card-top">
        <FurniIcon type={def.id} color={live.color} size={64} />
        <div><b>{def.name}</b>{def.exclusive && <span className="ht-excl small"><Gem size={10} /> Exclusivo HUB</span>}<span className="ht-muted">De {owner?.displayName || 'alguien'}</span>
          {def.interact === 'dice' && live.state > 0 && <span className="ht-muted">Salió {live.state} 🎲</span>}</div>
      </div>
      <div className="ht-card-actions">
        {def.interact && (def.interact === 'dice' || def.interact === 'teleport' || can || (hotel.state.room?.official && def.interact === 'toggle')) && <button className="ht-btn primary" onClick={() => s.emit('hotel:use', { itemId: item.id })}><Play size={14} /> {useLabel}</button>}
        {can && !live.wall && def.rots.length > 1 && <button className="ht-btn" onClick={() => s.emit('hotel:rotate', { itemId: item.id })}><RotateCw size={14} /> Rotar</button>}
        {can && <button className="ht-btn" onClick={() => hotel.startPlacing(live, { move: true })}><Move size={14} /> Mover</button>}
        {can && <button className="ht-btn" onClick={() => { s.emit('hotel:pickup', { itemId: item.id }); hotel.set({ selected: null }); }}><Hand size={14} /> Recoger</button>}
      </div>
    </div>
  );
}

// ---------- Tarjeta de persona ----------
export function UserCard({ userId }) {
  const users = useOffice((s) => s.users);
  const rights = useHotel((s) => s.rights);
  const isOwner = useHotel((s) => s.isOwner);
  const admin = useHotel((s) => s.admin);
  const room = useHotel((s) => s.room);
  useHotel((s) => s.usersV);
  const U = hotel.live.users.get(userId);
  if (!U || !room) return null;
  const me = userId === hotel.me;
  const u = users[userId] || { id: userId, displayName: U.name, avatar: U.avatar };
  const s = hotel.socket;
  const can = hotel.canEdit();
  const target = userId === room.ownerId ? 'owner' : users[userId]?.role === 'admin' ? 'admin' : null;
  const setRight = async (on) => {
    try { if (on) await api.post(`/hotel/rooms/${room.id}/rights`, { userId }); else await api.del(`/hotel/rooms/${room.id}/rights/${userId}`); } catch (e) { office.toast({ title: e.message, kind: 'error' }); }
  };
  return (
    <div className="ht-card" onPointerDown={(e) => e.stopPropagation()}>
      <button className="ht-x" onClick={() => hotel.set({ selected: null })} aria-label="Cerrar"><X size={14} /></button>
      <div className="ht-card-top">
        <Avatar user={u} size={48} showStatus={false} />
        <div><b>{u.displayName}</b>
          <span className="ht-muted">{target === 'owner' ? <><Crown size={11} /> Dueño de la sala</> : rights.includes(userId) ? <><Shield size={11} /> Con permisos</> : u.statusText || 'En el Hotel'}</span></div>
      </div>
      <div className="ht-card-actions">
        {me ? (
          <button className="ht-btn" onClick={() => s.emit('hotel:sit')}><Armchair size={14} /> {U.sit ? 'Pararse' : 'Sentarse'}</button>
        ) : (
          <>
            <button className="ht-btn primary" onClick={() => { hotel.set({ chatMode: 'whisper', whisperTo: userId, selected: null }); window.dispatchEvent(new Event('hotel:focus-chat')); }}><MessageCircle size={14} /> Susurrar</button>
            <button className="ht-btn" onClick={() => office.set({ profileCard: userId })}>Perfil</button>
            {(isOwner || admin) && !room.official && target !== 'owner' && (rights.includes(userId)
              ? <button className="ht-btn" onClick={() => setRight(false)}><ShieldOff size={14} /> Quitar permisos</button>
              : <button className="ht-btn" onClick={() => setRight(true)}><Shield size={14} /> Dar permisos</button>)}
            {can && !target && <button className="ht-btn" onClick={() => { s.emit('hotel:kick', { userId }); hotel.set({ selected: null }); }}><UserMinus size={14} /> Sacar</button>}
            {(isOwner || admin) && !target && <button className="ht-btn danger" onClick={() => { s.emit('hotel:kick', { userId, ban: true }); hotel.set({ selected: null }); }}><Ban size={14} /> Vetar</button>}
          </>
        )}
      </div>
    </div>
  );
}
