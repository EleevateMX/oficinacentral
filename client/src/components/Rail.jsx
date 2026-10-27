import React, { useEffect } from 'react';
import { Search, Map, MessageCircle, Calendar, Bell, Settings, MessageSquareHeart, Cake } from 'lucide-react';
import { isBirthday } from '../lib/birthdays.js';
import { office, useOffice } from '../lib/store.js';
import { Kbd } from './ui.jsx';
import { OfficeMark, Simbolo } from './brand.jsx';
import { officeLogo } from '../lib/themes.js';

export default function Rail() {
  const view = useOffice((s) => s.view);
  const config = useOffice((s) => s.config);
  useOffice((s) => s.prefs.colorMode);
  const dark = document.documentElement.dataset.theme === 'dark';
  const chat = useOffice((s) => s.chat);
  const notifications = useOffice((s) => s.notifications);
  const unreadChat = chat.channels.reduce((a, c) => a + c.unread, 0) + chat.dms.reduce((a, d) => a + d.unread, 0);
  const unreadNotif = notifications.filter((n) => !n.read).length;
  const bdays = useOffice((s) => Object.values(s.users).filter((u) => isBirthday(u)).length);

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
    const name = config.officeName || 'Nuvora';
    const title = name === 'Nuvora' ? 'Nuvora — Oficina virtual' : `${name} — Oficina virtual by Nuvora`;
    document.title = total ? `(${total}) ${title}` : title;
  }, [unreadChat, unreadNotif, config.officeName, config.theme, config.logoUrl]);

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
      <button className={`rail-btn ${bdays ? 'bday-on' : ''}`} onClick={() => office.set({ modal: { type: 'birthdays' } })} title={bdays ? '¡Hoy hay cumpleaños!' : 'Cumpleaños'} aria-label="Cumpleaños">
        <Cake size={20} />
        {bdays > 0 && <span className="badge">🎂</span>}
      </button>
      <div className="rail-spacer" />
      {officeLogo(config) && (
        <a className="rail-btn rail-by" href="https://nuvora.mx" target="_blank" rel="noreferrer noopener" title="Estamos construyendo cosas increíbles" aria-label="Nuvora: estamos construyendo cosas increíbles">
          <Simbolo size={20} variante={dark ? 'negativo' : 'positivo'} />
        </a>
      )}
      <button className="rail-btn" onClick={() => office.set({ modal: { type: 'feedback' } })} title="Enviar comentario (ideas o fallas)" aria-label="Enviar comentario">
        <MessageSquareHeart size={20} />
      </button>
      <button className="rail-btn" onClick={() => office.set({ modal: { type: 'prefs', section: 'general' } })} title="Preferencias" aria-label="Preferencias">
        <Settings size={20} />
      </button>
    </nav>
  );
}
