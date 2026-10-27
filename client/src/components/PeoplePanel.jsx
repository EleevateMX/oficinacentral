import React, { useMemo, useRef, useState, useEffect } from 'react';
import { ChevronDown, PanelLeftClose, Layers, UserPlus } from 'lucide-react';
import { since } from '../lib/time.js';
import { office, useOffice } from '../lib/store.js';
import { Avatar, STATUS, Kbd } from './ui.jsx';

export function PersonRow({ u, sub, onClick }) {
  return (
    <button className="person" onClick={onClick}>
      <Avatar user={u} size={36} />
      <div className="person-text">
        <div className="person-name">{u.displayName}</div>
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
