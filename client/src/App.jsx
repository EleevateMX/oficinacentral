import React, { useEffect, useState } from 'react';
import { api } from './lib/api.js';
import { office } from './lib/store.js';
import { applyBrand } from './lib/themes.js';
import Login from './components/Login.jsx';
import InviteAccept from './components/InviteAccept.jsx';
import Shell from './components/Shell.jsx';
import { Boot } from './components/brand.jsx';
import { unsubscribePush } from './lib/push.js';

export default function App() {
  const [session, setSession] = useState(undefined); // undefined = cargando, null = sin sesión
  const [config, setConfig] = useState(null);
  const invite = window.location.pathname.match(/^\/invite\/([\w-]+)/)?.[1];

  useEffect(() => {
    api.get('/config').then((c) => { applyBrand(c); setConfig(c); }).catch(() => setConfig({}));
    if (invite) return;
    api.get('/auth/me').then((r) => setSession(r)).catch(() => setSession(null));
  }, [invite]);

  const onLogin = async () => {
    const r = await api.get('/auth/me');
    if (invite) window.history.replaceState(null, '', '/');
    setSession(r);
  };

  const onLogout = async () => {
    await unsubscribePush().catch(() => {}); // este dispositivo deja de recibir avisos de esta cuenta
    await api.post('/auth/logout').catch(() => {});
    office.stop();
    setSession(null);
  };

  if (!config) return <Boot />;
  if (invite && !session) return <InviteAccept token={invite} config={config} onDone={onLogin} />;
  if (session === undefined) return <Boot />;
  if (!session) return <Login config={config} onLogin={onLogin} />;
  return <Shell session={session} onLogout={onLogout} />;
}
