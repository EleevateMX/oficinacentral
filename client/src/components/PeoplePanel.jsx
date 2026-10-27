import React, { useMemo, useRef, useState, useEffect } from 'react';
import { isBirthday } from '../lib/birthdays.js';
import { ChevronDown, PanelLeftClose, Layers, UserPlus, Lock } from 'lucide-react';
import { since } from '../lib/time.js';
import { office, useOffice } from '../lib/store.js';
import { Avatar, STATUS, Kbd } from './ui.jsx';

export function PersonRow({ u, sub, onClick }) {
  return (
    <button className="person" onClick={onClick}>
      <Avatar user={u} size={36} />
      <div className="person-text">
        <div className="person-name">{u.displayName}{isBirthday(u) && <span title="¡Hoy es su cumpleaños!"> 🎂</span>}</div>
        <div className="person-sub">{sub}</div>
      </div>
    </button>
  );
}

export default function PeoplePanel() {
  const users = useOffice((s) => s.users);
  const floors = useOffice((s) => s.floors);
  const floor = useOffice((s) => s.floor);
  const me = useOffice((s) => s.me);
  const config = useOffice((s) => s.config);
  useOffice((s) => s.presenceVersion);
  const [q, setQ] = useState('');
  const [open, setOpen] = useState({ shift: true, online: true, offline: true });
  const [floorMenu, setFloorMenu] = useState(false);
  const searchRef = useRef(null);

  useEffect(() => {
    const k = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'f' && office.state.view === 'map') {
        e.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, []);

  const { onShift, online, offline } = useMemo(() => {
    const s = q.trim().toLowerCase();
    const list = Object.values(users).filter((u) => !u.disabled && (!s || u.displayName.toLowerCase().includes(s) || u.username.toLowerCase().includes(s)));
    const byName = (a, b) => a.displayName.localeCompare(b.displayName, 'es');
    return {
      onShift: list.filter((u) => u.online && u.shift).sort(byName),
      online: list.filter((u) => u.online && !u.shift).sort(byName),
      offline: list.filter((u) => !u.online).sort(byName),
    };
  }, [users, q]);

  const sub = (u) => {
    if (u.online && u.screen) return `🔴 En vivo${u.shift ? ` · ${u.shift}` : ''}`;
    if (u.shift) return `🖥️ En turno ${u.shift} · ${since(u.shiftAt)}`;
    const status = STATUS[u.status || 'active'].label;
    const where = u.floorId && floors.length > 1 && u.floorId !== floor?.id ? ` · ${floors.find((f) => f.id === u.floorId)?.name || ''}` : '';
    return u.statusText ? `${u.statusText}${where}` : `${status}${where}`;
  };

  return (
    <div className="panel">
      <div className="panel-head">
        <h2>{config.officeName}</h2>
        <button className="icon-btn" title="Ocultar panel" onClick={() => office.set({ sidebarCollapsed: true })}><PanelLeftClose size={18} /></button>
      </div>
      <div className="floor-pick">
        <button className="link-btn" onClick={() => setFloorMenu(!floorMenu)}><Layers size={14} /> {floor?.name} <ChevronDown size={14} /></button>
        {floorMenu && (
          <div className="popover down left">
            {floors.map((f) => (
              <button key={f.id} className={`pop-item ${f.id === floor?.id ? 'on' : ''}`} onClick={() => { setFloorMenu(false); if (f.id !== floor?.id) office.changeFloor(f.id); }}>
                {f.name}
              </button>
            ))}
          </div>
        )}
      </div>
      <div className="search">
        <input ref={searchRef} placeholder="Buscar personas" value={q} onChange={(e) => setQ(e.target.value)} />
        <span className="search-kbd"><Kbd>⌘</Kbd><Kbd>F</Kbd></span>
      </div>
      <div className="panel-scroll">
        <Meetings floor={floor} users={users} />
        {onShift.length > 0 && (
          <>
            <button className="group-head" onClick={() => setOpen({ ...open, shift: !open.shift })}>
              En turno ({onShift.length}) <ChevronDown size={14} className={open.shift ? '' : 'rot'} />
            </button>
            {open.shift && onShift.map((u) => (
              <PersonRow key={u.id} u={u} sub={sub(u)} onClick={() => office.set({ profileCard: u.id })} />
            ))}
          </>
        )}
        <button className="group-head" onClick={() => setOpen({ ...open, online: !open.online })}>
          En línea ({online.length}) <ChevronDown size={14} className={open.online ? '' : 'rot'} />
        </button>
        {open.online && online.map((u) => (
          <PersonRow key={u.id} u={u} sub={sub(u)} onClick={() => office.set({ profileCard: u.id })} />
        ))}
        <button className="group-head" onClick={() => setOpen({ ...open, offline: !open.offline })}>
          Desconectados ({offline.length}) <ChevronDown size={14} className={open.offline ? '' : 'rot'} />
        </button>
        {open.offline && offline.map((u) => (
          <PersonRow key={u.id} u={u} sub={u.statusText || ''} onClick={() => office.set({ profileCard: u.id })} />
        ))}
      </div>
      {me.role === 'admin' && (
        <button className="btn block invite-btn" onClick={() => office.set({ modal: { type: 'prefs', section: 'members', tab: 'invites' } })}>
          <UserPlus size={16} /> Invitar personas
        </button>
      )}
    </div>
  );
}

// Reuniones en curso: salas con gente dentro (como en la lista de Gather)
function Meetings({ floor, users }) {
  const [, tick] = useState(0);
  useEffect(() => { const t = setInterval(() => tick((n) => n + 1), 2000); return () => clearInterval(t); }, []);
  if (!floor) return null;
  const rooms = floor.areas
    .filter((a) => a.private || a.closed)
    .map((a) => ({
      a,
      ids: Object.entries(office.players)
        .filter(([, q]) => q.floorId === floor.id && q.x >= a.x && q.y >= a.y && q.x < a.x + a.w && q.y < a.y + a.h)
        .map(([id]) => Number(id)),
    }))
    .filter((r) => r.ids.length);
  if (!rooms.length) return null;
  const names = (ids) => {
    const n = ids.map((id) => users[id]?.displayName || '…');
    return n.length > 2 ? `${n.slice(0, 2).join(', ')} y ${n.length - 2} más` : n.join(' y ');
  };
  return (
    <>
      <div className="group-head static">Reuniones ({rooms.length})</div>
      {rooms.map(({ a, ids }) => (
        <button key={a.id} className="meet-card" onClick={() => { office.set({ view: 'map' }); office.pathTarget = { x: a.x + Math.floor(a.w / 2), y: a.y + Math.floor(a.h / 2), near: false }; }}
          title={a.closed ? 'Sala cerrada: puedes tocar la puerta' : 'Ir a la sala'}>
          <div className="meet-room">{a.closed && <Lock size={11} />} {a.name}</div>
          <div className="meet-names">{names(ids)}</div>
          <div className="meet-avatars">{ids.slice(0, 6).map((id) => <Avatar key={id} user={users[id] || {}} size={24} showStatus={false} />)}</div>
        </button>
      ))}
    </>
  );
}
