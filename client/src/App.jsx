import React, { useEffect, useState } from 'react';
import { api } from './lib/api.js';
import { office } from './lib/store.js';
import { applyBrand, setUserTheme } from './lib/themes.js';
import Login from './components/Login.jsx';
import InviteAccept from './components/InviteAccept.jsx';
import PublicJoin, { joinRoute } from './components/PublicJoin.jsx'; // enlace público /unete (con Discord)
import Shell from './components/Shell.jsx';
import { Boot } from './components/brand.jsx';
import { unsubscribePush } from './lib/push.js';

// Mensajes al volver de Discord (?discord=…) o paso de verificación (?login2fa=…)
const DISCORD_MSG = {
  linked: 'Tu cuenta de Discord quedó vinculada. Ya puedes entrar con ella.',
  welcome: '¡Bienvenido! Tu cuenta se creó con Discord.',
  nolink: 'Ese Discord no está vinculado a ninguna cuenta. Entra con tu usuario y vincúlalo en Preferencias → Cuenta, o pide una invitación.',
  taken: 'Ese Discord ya está vinculado a otra cuenta.',
  invite: 'La invitación no es válida o ya expiró.',
  disabled: 'Tu cuenta está desactivada. Habla con un administrador.',
  cancel: 'Se canceló el inicio con Discord.',
  notmember: 'Solo pueden entrar miembros del servidor de Discord de la comunidad. Únete y vuelve a intentarlo.',
  ipbanned: 'Tu conexión está bloqueada por un administrador. Si crees que es un error, habla con el equipo en Discord.',
  pending: 'Tu cuenta está esperando la aprobación de un administrador. Te avisamos al entrar.',
  error: 'No se pudo completar el inicio con Discord. Inténtalo de nuevo.',
};
const params = new URLSearchParams(window.location.search);
export const returnInfo = { discord: params.get('discord'), login2fa: params.get('login2fa') };
if (returnInfo.discord || returnInfo.login2fa) window.history.replaceState(null, '', '/');
export const discordMessage = DISCORD_MSG[returnInfo.discord] || null;

export default function App() {
  const [session, setSession] = useState(undefined); // undefined = cargando, null = sin sesión
  const [config, setConfig] = useState(null);
  const invite = window.location.pathname.match(/^\/invite\/([\w-]+)/)?.[1];

  useEffect(() => {
    api.get('/config').then((c) => { applyBrand(c); setConfig(c); }).catch(() => setConfig({}));
    if (invite) return;
    api.get('/auth/me').then((r) => { setUserTheme(r.user?.uiTheme || null); setSession(r); }).catch(() => { setUserTheme(null); setSession(null); });
  }, [invite]);

  const onLogin = async () => {
    const r = await api.get('/auth/me');
    setUserTheme(r.user?.uiTheme || null);
    if (invite) window.history.replaceState(null, '', '/');
    setSession(r);
  };

  const onLogout = async () => {
    await unsubscribePush().catch(() => {}); // este dispositivo deja de recibir avisos de esta cuenta
    await api.post('/auth/logout').catch(() => {});
    office.stop();
    setUserTheme(null); // el login vuelve al tema de la oficina
    setSession(null);
  };

  if (!config) return <Boot />;
  if (invite && !session) return <InviteAccept token={invite} config={config} onDone={onLogin} />;
  if (joinRoute && session === null) return <PublicJoin route={joinRoute} config={config} />;
  if (session === undefined) return <Boot />;
  if (!session) return <Login config={config} onLogin={onLogin} />;
  return <Shell session={session} onLogout={onLogout} />;
}
