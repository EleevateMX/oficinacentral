import React, { useEffect } from 'react';
import { office, useOffice } from '../lib/store.js';
import Rail from './Rail.jsx';
import PeoplePanel from './PeoplePanel.jsx';
import MapView from './MapView.jsx';
import { ChatPanel, ChatView } from './Chat.jsx';
import { CalendarPanel, CalendarView, EventModal } from './Calendar.jsx';
import ActivityPanel from './Activity.jsx';
import MiniWidget from './MiniWidget.jsx';
import ProfileCard from './ProfileCard.jsx';
import EditProfile from './EditProfile.jsx';
import Preferences from './settings/Preferences.jsx';
import Toasts from './Toasts.jsx';
import SearchPalette from './SearchPalette.jsx';

export default function Shell({ session, onLogout }) {
  const ready = useOffice((s) => s.ready);
  const view = useOffice((s) => s.view);
  const modal = useOffice((s) => s.modal);
  const profileCard = useOffice((s) => s.profileCard);
  const collapsed = useOffice((s) => s.sidebarCollapsed);
  const connected = useOffice((s) => s.connected);

  useEffect(() => {
    office.start(session.user, session.prefs).catch((e) => console.error(e));
    const out = () => onLogout();
    window.addEventListener('office:logout', out);
    return () => {
      window.removeEventListener('office:logout', out);
      office.stop();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (!ready) {
    return <div className="boot"><img src="/logo.svg" alt="" /><p>Entrando a la oficina…</p></div>;
  }

  const panel = { map: <PeoplePanel />, chat: <ChatPanel />, calendar: <CalendarPanel />, activity: <ActivityPanel /> }[view];
  const mainChat = view === 'chat' || view === 'activity';

  return (
    <div className="shell">
      <Rail />
      {!(collapsed && view === 'map') && (
        <aside className="sidebar">
          <div className="sidebar-content">{panel}</div>
          {view !== 'map' && <MiniWidget />}
        </aside>
      )}
      <main className="main">
        {!connected && <div className="reconnecting">Reconectando…</div>}
        <MapView active={view === 'map'} />
        {mainChat && <ChatView />}
        {view === 'calendar' && <CalendarView />}
      </main>
      {profileCard && <ProfileCard userId={profileCard} />}
      {modal?.type === 'profile' && <EditProfile />}
      {modal?.type === 'prefs' && <Preferences section={modal.section} />}
      {modal?.type === 'search' && <SearchPalette />}
      {modal?.type === 'event' && <EventModal event={modal.event} />}
      <Toasts />
    </div>
  );
}
