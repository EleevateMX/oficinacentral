// Hotel: consola (mensajero clásico). Amigos con estado (conectado / en qué sala), solicitudes,
// buscar gente, chat privado con mensajes que esperan a que la otra persona abra la consola,
// "Seguir" a un amigo a su sala e "Invitar" amigos a la tuya.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Users, UserPlus, Search, MessageCircle, ArrowLeft, LogIn, Send, Check, X, Mail, UserMinus, DoorOpen, Contact } from 'lucide-react';
import { office } from '../../lib/store.js';
import { api } from '../../lib/api.js';
import { Avatar } from '../../components/ui.jsx';
import { social, useSocial } from './socialStore.js';
import { useHotel } from '../hotelStore.js';

const ago = (t) => {
  const s = (Date.now() - t) / 1000;
  if (s < 60) return 'ahora';
  if (s < 3600) return `${Math.floor(s / 60)} min`;
  if (s < 86400) return `${Math.floor(s / 3600)} h`;
  return new Date(t).toLocaleDateString('es-MX', { day: 'numeric', month: 'short' });
};
const person = (f) => ({ id: f.id, displayName: f.name, avatar: f.avatar, online: f.online });

export function ConsoleButton({ className = 'ht-tool' }) {
  const unread = useSocial((s) => s.unread + s.requests.length);
  const open = useSocial((s) => s.open);
  return (
    <button className={`${className} ${open ? 'on' : ''} ht-console-btn`} onClick={() => social.toggleConsole()} title="Consola: amigos y mensajes">
      <Contact size={20} /><span>Consola</span>
      {unread > 0 && <i className="ht-badge">{unread > 99 ? '99+' : unread}</i>}
    </button>
  );
}

export default function ConsolePanel() {
  const open = useSocial((s) => s.open);
  const tab = useSocial((s) => s.tab);
  const conv = useSocial((s) => s.conv);
  const inviting = useSocial((s) => s.inviting);
  const requests = useSocial((s) => s.requests);
  const friends = useSocial((s) => s.friends);
  // Mientras está abierta: refrescar quién está conectado y en qué sala
  useEffect(() => {
    if (!open) return undefined;
    const t = setInterval(() => { if (document.visibilityState === 'visible') social.refresh(); }, 10e3);
    return () => clearInterval(t);
  }, [open]);
  if (!open) return null;
  const friend = conv && (friends || []).find((f) => f.id === conv.userId);
  return (
    <div className="ht-window ht-console" onPointerDown={(e) => e.stopPropagation()}>
      <div className="ht-win-head"><Contact size={16} /> Consola<button className="ht-x" onClick={() => social.closeConsole()} aria-label="Cerrar"><X size={16} /></button></div>
      {conv ? <Chat conv={conv} friend={friend} /> : inviting ? <Invite /> : (
        <>
          <div className="ht-con-tabs">
            <button className={tab === 'friends' ? 'on' : ''} onClick={() => social.set({ tab: 'friends' })}><Users size={14} /> Amigos <small>{friends?.length ?? ''}</small></button>
            <button className={tab === 'requests' ? 'on' : ''} onClick={() => social.set({ tab: 'requests' })}><UserPlus size={14} /> Solicitudes {requests.length > 0 && <i className="ht-badge inline">{requests.length}</i>}</button>
            <button className={tab === 'search' ? 'on' : ''} onClick={() => social.set({ tab: 'search' })}><Search size={14} /> Buscar</button>
          </div>
          {tab === 'friends' && <Friends />}
          {tab === 'requests' && <Requests />}
          {tab === 'search' && <People />}
        </>
      )}
    </div>
  );
}

function Friends() {
  const friends = useSocial((s) => s.friends);
  const inRoom = useHotel((s) => s.roomId);
  if (friends == null) return <div className="ht-con-body"><p className="ht-muted">Cargando…</p></div>;
  const on = friends.filter((f) => f.online), off = friends.filter((f) => !f.online);
  return (
    <>
      <div className="ht-con-body">
        {!friends.length && (
          <div className="ht-con-empty">
            <Users size={30} />
            <b>Aún no tienes amigos en el Hotel</b>
            <span>Búscalos por nombre o haz clic en alguien de la sala y elige <i>Agregar amigo</i>.</span>
            <button className="ht-btn primary sm" onClick={() => social.set({ tab: 'search' })}><Search size={14} /> Buscar gente</button>
          </div>
        )}
        {on.length > 0 && <h5 className="ht-con-h">Conectados · {on.length}</h5>}
        {on.map((f) => <FriendRow key={f.id} f={f} />)}
        {off.length > 0 && <h5 className="ht-con-h">Desconectados · {off.length}</h5>}
        {off.map((f) => <FriendRow key={f.id} f={f} />)}
      </div>
      {inRoom && friends.some((f) => f.online) && (
        <div className="ht-con-foot"><button className="ht-btn primary" onClick={() => social.set({ inviting: true })}><Mail size={15} /> Invitar a mi sala</button></div>
      )}
    </>
  );
}

function FriendRow({ f }) {
  const roomId = useHotel((s) => s.roomId);
  const here = f.room && f.room.id === roomId;
  const status = f.room ? (here ? 'Aquí contigo' : `En ${f.room.name}`) : f.online ? 'Conectado' : 'Desconectado';
  return (
    <div className={`ht-friend ${f.online ? 'on' : ''}`}>
      <button className="ht-friend-main" onClick={() => social.openChat(f.id)} title="Abrir chat">
        <span className="ht-friend-av"><Avatar user={person(f)} size={34} showStatus={false} /><i className={`ht-status ${f.room ? 'room' : f.online ? 'on' : ''}`} /></span>
        <span className="ht-friend-txt">
          <b>{f.name}</b>
          {f.unread > 0 && f.last ? <span className="ht-friend-last">{f.last.text}</span> : <span className={`ht-friend-st ${f.room ? 'room' : ''}`}>{f.room && <DoorOpen size={11} />} {status}</span>}
        </span>
        {f.unread > 0 && <i className="ht-badge inline">{f.unread}</i>}
      </button>
      {f.room && !here && <button className="ht-btn sm" onClick={() => social.follow(f.id)} title={`Ir a ${f.room.name}`}><LogIn size={13} /> Seguir</button>}
    </div>
  );
}

function Requests() {
  const requests = useSocial((s) => s.requests);
  return (
    <div className="ht-con-body">
      {!requests.length && <div className="ht-con-empty"><UserPlus size={28} /><b>Sin solicitudes</b><span>Cuando alguien te quiera agregar, aparecerá aquí.</span></div>}
      {requests.map((r) => (
        <div key={r.id} className="ht-friend">
          <div className="ht-friend-main static">
            <Avatar user={person(r)} size={34} showStatus={false} />
            <span className="ht-friend-txt"><b>{r.name}</b><span className="ht-friend-st">{r.motto || 'Quiere ser tu amigo'}</span></span>
          </div>
          <button className="ht-btn primary sm" onClick={() => social.accept(r.id)} title="Aceptar"><Check size={14} /></button>
          <button className="ht-btn sm" onClick={() => social.decline(r.id)} title="Rechazar"><X size={14} /></button>
        </div>
      ))}
    </div>
  );
}

function People() {
  const [q, setQ] = useState('');
  const [list, setList] = useState(null);
  const sent = useSocial((s) => s.sent);
  const friends = useSocial((s) => s.friends);
  useEffect(() => {
    if (!q.trim()) { setList(null); return undefined; }
    const t = setTimeout(async () => { try { setList((await api.get(`/hotel/social/search?q=${encodeURIComponent(q.trim())}`)).users); } catch { setList([]); } }, 220);
    return () => clearTimeout(t);
  }, [q]);
  const isFriend = (id) => (friends || []).some((f) => f.id === id);
  return (
    <div className="ht-con-body">
      <div className="ht-search-wrap"><Search size={14} /><input className="ht-input" autoFocus placeholder="Nombre o usuario…" value={q} onChange={(e) => setQ(e.target.value)} /></div>
      {list == null && <p className="ht-muted small">Escribe para buscar a alguien de GTAHUB.</p>}
      {list?.length === 0 && <p className="ht-muted small">Nadie con ese nombre.</p>}
      {list?.map((u) => (
        <div key={u.id} className="ht-friend">
          <div className="ht-friend-main static">
            <Avatar user={person(u)} size={34} showStatus={false} />
            <span className="ht-friend-txt"><b>{u.name}</b><span className="ht-friend-st">@{u.username}{u.motto ? ` · ${u.motto}` : ''}</span></span>
          </div>
          {isFriend(u.id) || u.friend ? <span className="ht-tagline">Amigos</span>
            : u.received ? <button className="ht-btn primary sm" onClick={() => social.accept(u.id)}><Check size={13} /> Aceptar</button>
              : sent.includes(u.id) || u.sent ? <span className="ht-tagline">Enviada</span>
                : <button className="ht-btn sm" onClick={() => social.request(u.id)}><UserPlus size={13} /> Agregar</button>}
        </div>
      ))}
    </div>
  );
}

function Chat({ conv, friend }) {
  const [text, setText] = useState('');
  const ref = useRef(null);
  const me = office.state.me?.id;
  const roomId = useHotel((s) => s.roomId);
  useEffect(() => { ref.current?.scrollTo(0, 1e6); }, [conv.messages?.length]);
  const name = friend?.name || 'Amigo';
  const send = async (e) => {
    e.preventDefault();
    const t = text.trim();
    if (!t) return;
    setText('');
    if (!(await social.send(conv.userId, t))) setText(t);
  };
  const groups = useMemo(() => {
    const out = [];
    for (const m of conv.messages || []) {
      const last = out[out.length - 1];
      if (last && last.from === m.from && m.at - last.at < 5 * 60e3) { last.items.push(m); last.at = m.at; } else out.push({ from: m.from, at: m.at, items: [m] });
    }
    return out;
  }, [conv.messages]);
  return (
    <>
      <div className="ht-chat-head">
        <button className="ht-x-back" onClick={() => social.set({ conv: null })} aria-label="Volver"><ArrowLeft size={16} /></button>
        {friend && <Avatar user={person(friend)} size={30} showStatus={false} />}
        <div className="ht-chat-who"><b>{name}</b><span>{friend?.room ? `En ${friend.room.name}` : friend?.online ? 'Conectado' : 'Desconectado · le llegará al entrar'}</span></div>
        {friend?.room && friend.room.id !== roomId && <button className="ht-btn sm" onClick={() => social.follow(friend.id)}><LogIn size={13} /> Seguir</button>}
        {friend && <button className="ht-icon-btn" title="Quitar de amigos" onClick={() => { if (window.confirm(`¿Quitar a ${name} de tus amigos?`)) social.unfriend(friend.id); }}><UserMinus size={15} /></button>}
      </div>
      <div className="ht-chat-list" ref={ref}>
        {conv.messages == null && <p className="ht-muted small">Cargando…</p>}
        {conv.messages?.length === 0 && <div className="ht-con-empty"><MessageCircle size={26} /><span>Salúdale a {name} 👋</span></div>}
        {groups.map((g, i) => (
          <div key={i} className={`ht-msg-group ${g.from === me ? 'mine' : ''}`}>
            {g.items.map((m) => <div key={m.id} className="ht-msg">{m.text}</div>)}
            <span className="ht-msg-time">{ago(g.at)}</span>
          </div>
        ))}
      </div>
      {friend ? (
        <form className="ht-chat-form" onSubmit={send}>
          <input className="ht-input" autoFocus maxLength={300} placeholder={`Mensaje para ${name}…`} value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.stopPropagation()} />
          <button className="ht-send" disabled={!text.trim()} aria-label="Enviar"><Send size={16} /></button>
        </form>
      ) : <p className="ht-muted small ht-chat-note">Ya no son amigos: no puedes escribirle.</p>}
    </>
  );
}

function Invite() {
  const friends = useSocial((s) => s.friends) || [];
  const roomId = useHotel((s) => s.roomId);
  const room = useHotel((s) => s.room);
  const list = friends.filter((f) => f.online && f.room?.id !== roomId);
  const [sel, setSel] = useState(() => new Set());
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const toggle = (id) => setSel((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const go = async () => {
    setBusy(true);
    if (await social.invite([...sel], text.trim())) social.set({ inviting: false });
    setBusy(false);
  };
  return (
    <>
      <div className="ht-chat-head">
        <button className="ht-x-back" onClick={() => social.set({ inviting: false })} aria-label="Volver"><ArrowLeft size={16} /></button>
        <div className="ht-chat-who"><b>Invitar a {room?.name || 'tu sala'}</b><span>Les llega un aviso con “Ir”</span></div>
      </div>
      <div className="ht-con-body">
        {!list.length && <p className="ht-muted small">No hay amigos conectados fuera de esta sala.</p>}
        {list.length > 1 && <button className="ht-link small" onClick={() => setSel(sel.size === list.length ? new Set() : new Set(list.map((f) => f.id)))}>{sel.size === list.length ? 'Quitar todos' : 'Elegir a todos'}</button>}
        {list.map((f) => (
          <label key={f.id} className={`ht-friend pick ${sel.has(f.id) ? 'sel' : ''}`}>
            <input type="checkbox" checked={sel.has(f.id)} onChange={() => toggle(f.id)} />
            <Avatar user={person(f)} size={30} showStatus={false} />
            <span className="ht-friend-txt"><b>{f.name}</b><span className="ht-friend-st">{f.room ? `En ${f.room.name}` : 'Conectado'}</span></span>
          </label>
        ))}
      </div>
      <div className="ht-con-foot col">
        <input className="ht-input" maxLength={120} placeholder="Mensaje (opcional): ¡Vente, ya empezó!" value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.stopPropagation()} />
        <button className="ht-btn primary" disabled={!sel.size || busy} onClick={go}><Mail size={15} /> Invitar{sel.size ? ` (${sel.size})` : ''}</button>
      </div>
    </>
  );
}
