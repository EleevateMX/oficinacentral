import React, { useMemo, useState } from 'react';
import { Search, Hash, Map, Calendar, Settings, MapPin } from 'lucide-react';
import { office, useOffice } from '../lib/store.js';
import { Avatar } from './ui.jsx';

export default function SearchPalette() {
  const users = useOffice((s) => s.users);
  const chat = useOffice((s) => s.chat);
  const floor = useOffice((s) => s.floor);
  const [q, setQ] = useState('');
  const [idx, setIdx] = useState(0);
  const close = () => office.set({ modal: null });

  const items = useMemo(() => {
    const s = q.trim().toLowerCase();
    const list = [
      ...Object.values(users).filter((u) => !u.disabled).map((u) => ({ key: `u${u.id}`, icon: <Avatar user={u} size={22} />, label: u.displayName, sub: u.online ? 'Ir a esta persona' : 'Enviar mensaje', run: () => (u.online && u.id !== office.state.me.id ? office.goTo(u.id) : office.set({ profileCard: u.id })) })),
      ...chat.channels.map((c) => ({ key: c.conv, icon: <Hash size={18} />, label: `#${c.name}`, sub: 'Canal', run: () => office.openConv(c.conv) })),
      ...(floor?.areas || []).map((a) => ({ key: `a${a.id}`, icon: <MapPin size={18} />, label: a.name, sub: 'Ir a esta área', run: () => { office.set({ view: 'map' }); office.pathTarget = { x: a.x + Math.floor(a.w / 2), y: a.y + Math.floor(a.h / 2) }; } })),
      { key: 'map', icon: <Map size={18} />, label: 'Mapa', sub: 'Vista', run: () => office.set({ view: 'map' }) },
      { key: 'cal', icon: <Calendar size={18} />, label: 'Calendario', sub: 'Vista', run: () => office.set({ view: 'calendar' }) },
      { key: 'prefs', icon: <Settings size={18} />, label: 'Preferencias', sub: 'Ajustes', run: () => office.set({ modal: { type: 'prefs', section: 'general' } }) },
    ];
    return (s ? list.filter((i) => i.label.toLowerCase().includes(s)) : list).slice(0, 12);
  }, [q, users, chat, floor]);

  const run = (i) => {
    if (!i) return;
    office.set({ modal: null });
    i.run();
  };

  return (
    <div className="modal-backdrop top" onMouseDown={(e) => e.target === e.currentTarget && close()}>
      <div className="palette">
        <div className="palette-input">
          <Search size={18} />
          <input
            autoFocus
            placeholder="Buscar personas, canales, áreas…"
            value={q}
            onChange={(e) => { setQ(e.target.value); setIdx(0); }}
            onKeyDown={(e) => {
              if (e.key === 'Escape') close();
              if (e.key === 'ArrowDown') { e.preventDefault(); setIdx(Math.min(items.length - 1, idx + 1)); }
              if (e.key === 'ArrowUp') { e.preventDefault(); setIdx(Math.max(0, idx - 1)); }
              if (e.key === 'Enter') run(items[idx]);
            }}
          />
        </div>
        <div className="palette-list">
          {items.map((i, n) => (
            <button key={i.key} className={n === idx ? 'on' : ''} onMouseEnter={() => setIdx(n)} onClick={() => run(i)}>
              {i.icon} <span className="flex1">{i.label}</span> <span className="muted small">{i.sub}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
