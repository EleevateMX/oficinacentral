import React, { useEffect, useState } from 'react';
import { api } from './lib/api.js';
import { office } from './lib/store.js';
import Login from './components/Login.jsx';
import InviteAccept from './components/InviteAccept.jsx';
import Shell from './components/Shell.jsx';

export default function App() {
  const [session, setSession] = useState(undefined); // undefined = cargando, null = sin sesión
  const invite = window.location.pathname.match(/^\/invite\/([\w-]+)/)?.[1];

  useEffect(() => {
    if (invite) return;
    api.get('/auth/me').then((r) => setSession(r)).catch(() => setSession(null));
  }, [invite]);

  const onLogin = async () => {
    const r = await api.get('/auth/me');
    if (invite) window.history.replaceState(null, '', '/');
    setSession(r);
  };

  const onLogout = async () => {
    await api.post('/auth/logout').catch(() => {});
    office.stop();
    setSession(null);
  };

  if (invite && !session) return <InviteAccept token={invite} onDone={onLogin} />;
  if (session === undefined) return <div className="boot"><img src="/logo.svg" alt="" /></div>;
  if (!session) return <Login onLogin={onLogin} />;
  return <Shell session={session} onLogout={onLogout} />;
}
