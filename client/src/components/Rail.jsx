import React, { useEffect } from 'react';
import { Search, Map, MessageCircle, Calendar, Bell, Settings } from 'lucide-react';
import { office, useOffice } from '../lib/store.js';
import { Kbd } from './ui.jsx';
import { OfficeMark, Simbolo } from './brand.jsx';

export default function Rail() {
  const view = useOffice((s) => s.view);
  const config = useOffice((s) => s.config);
  const chat = useOffice((s) => s.chat);
  const notifications = useOffice((s) => s.notifications);
  const unreadChat = chat.channels.reduce((a, c) => a + c.unread, 0) + chat.dms.reduce((a, d) => a + d.unread, 0);
  const unreadNotif = notifications.filter((n) => !n.read).length;

  useEffect(() => {
    const k = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        office.set({ modal: { type: 'search' } });
      }
    };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, []);

  useEffect(() => {
    const total = unreadChat + unreadNotif;
    document.title = total ? `(${total}) Nuvora` : 'Nuvora';
  }, [unreadChat, unreadNotif]);

  const item = (id, Icon, label, badge) => (
    <button className={`rail-btn ${view === id ? 'on' : ''}`} onClick={() => office.set((st) => ({ view: id, sidebarCollapsed: id === 'map' && st.view === 'map' ? !st.sidebarCollapsed : st.sidebarCollapsed }))} title={label} aria-label={label}>
      <Icon size={20} />
      {badge > 0 && <span className="badge">{badge > 99 ? '99+' : badge}</span>}
    </button>
  );

  return (
    <nav className="rail">
      <div className="rail-logo" title={config.officeName}><OfficeMark config={config} size={28} /></div>
      <button className="rail-btn" onClick={() => office.set({ modal: { type: 'search' } })} title="Buscar (Ctrl+K)" aria-label="Buscar">
        <Search size={20} />
      </button>
      <div className="rail-kbd"><Kbd>⌘</Kbd><Kbd>K</Kbd></div>
      <div className="rail-gap" />
      {item('map', Map, 'Mapa')}
      {item('chat', MessageCircle, 'Chat', unreadChat)}
      {item('calendar', Calendar, 'Calendario')}
      {item('activity', Bell, 'Actividad', unreadNotif)}
      <div className="rail-spacer" />
      {(config.logoUrl || config.theme === 'gtahub') && (
        <a className="rail-btn rail-by" href="https://nuvora.mx" target="_blank" rel="noreferrer noopener" title="Hecho con Nuvora" aria-label="Hecho con Nuvora">
          <Simbolo size={20} />
        </a>
      )}
      <button className="rail-btn" onClick={() => office.set({ modal: { type: 'prefs', section: 'general' } })} title="Preferencias" aria-label="Preferencias">
        <Settings size={20} />
      </button>
    </nav>
  );
}
