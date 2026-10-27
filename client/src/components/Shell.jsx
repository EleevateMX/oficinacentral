import Whiteboard from './Whiteboard.jsx';
import GameModal from './GameModal.jsx';
import Birthdays, { checkBirthdays } from './Birthdays.jsx';
import Notices from './Notices.jsx';
import Feedback from './Feedback.jsx';
import Achievements from './Achievements.jsx';
import JukeboxModal from './Jukebox.jsx';
import SecretSanta from './SecretSanta.jsx';
import { AnniversaryPhoto } from './SeasonExtras.jsx';
import React, { useEffect, useState } from 'react';
import { office, useOffice } from '../lib/store.js';
import Rail from './Rail.jsx';
import { returnInfo, discordMessage } from '../App.jsx';
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
import IncomingCall from './IncomingCall.jsx';
import SearchPalette from './SearchPalette.jsx';
import { handleLaunchUrl, syncPush } from '../lib/push.js';
import Onboarding, { Loader } from './Onboarding.jsx';
import AppBanner from './AppBanner.jsx';
import { setupAutoPip } from '../lib/pip.js';

export default function Shell({ session, onLogout }) {
  const ready = useOffice((s) => s.ready);
  const view = useOffice((s) => s.view);
  const modal = useOffice((s) => s.modal);
  const profileCard = useOffice((s) => s.profileCard);
  const collapsed = useOffice((s) => s.sidebarCollapsed);
  const connected = useOffice((s) => s.connected);
  const mobilePane = useOffice((s) => s.mobilePane);
  const mobile = useIsMobile();
  const config = useOffice((s) => s.config);
  const onboarding = useOffice((s) => s.onboarding);
  // La pantalla de carga se queda un momento la primera vez (para que se vea)
  const [minWait, setMinWait] = useState(!session.prefs?.onboarding?.seen);
  useEffect(() => { if (minWait) { const t = setTimeout(() => setMinWait(false), 2200); return () => clearTimeout(t); } return undefined; }, [minWait]);

  useEffect(() => {
    office.start(session.user, session.prefs).then(() => {
      handleLaunchUrl();
      syncPush();
      if (['linked', 'welcome'].includes(returnInfo.discord)) office.toast({ title: discordMessage });
      if (!office.state.prefs.onboarding?.hide) office.set({ onboarding: true });
      setupAutoPip();
      checkBirthdays();
    }).catch((e) => console.error(e));
    const out = () => onLogout();
    window.addEventListener('office:logout', out);
    return () => {
      window.removeEventListener('office:logout', out);
      office.stop();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (!ready || minWait) {
    return <Loader config={config} />;
  }

  const panel = { map: <PeoplePanel />, chat: <ChatPanel />, calendar: <CalendarPanel />, activity: <ActivityPanel /> }[view];
  const mainChat = view === 'chat' || view === 'activity';

  return (
    <div className={`shell ${mobile ? `mobile pane-${view === 'calendar' ? 'main' : view === 'map' ? 'map' : mobilePane}` : ''}`}>
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
      {modal?.type === 'board' && <Whiteboard objectId={modal.objectId} />}
      {modal?.type === 'notices' && <Notices />}
      {modal?.type === 'birthdays' && <Birthdays />}
      {modal?.type === 'game' && <GameModal key={modal.objectId} objectId={modal.objectId} game={modal.game} />}
      {modal?.type === 'feedback' && <Feedback />}
      {modal?.type === 'achievements' && <Achievements userId={modal.userId} tab={modal.tab} />}
      {modal?.type === 'jukebox' && <JukeboxModal objectId={modal.objectId} />}
      {modal?.type === 'santa' && <SecretSanta />}
      {modal?.type === 'anniversaryPhoto' && <AnniversaryPhoto />}
      {onboarding && !modal && <Onboarding />}
      {!modal && <AppBanner mobile={mobile} />}
      <IncomingCall />
      <Toasts />
    </div>
  );
}

// Pantalla de celular (≤ 680 px)
export function useIsMobile() {
  const q = '(max-width: 680px)';
  const [m, setM] = useState(() => window.matchMedia(q).matches);
  useEffect(() => {
    const mq = window.matchMedia(q);
    const on = () => setM(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return m;
}
