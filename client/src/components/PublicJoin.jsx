// Enlace público para unirse (/unete/<clave>, /join/<clave>): portada Eleevate con un solo botón
// "Entrar con Discord". Si el admin pide aprobar a cada persona, aquí también se ve la pantalla de espera.
import React, { useEffect, useState } from 'react';
import { api } from '../lib/api.js';
import DiscordButton from './DiscordButton.jsx';
import { DiscordIcon } from './Login.jsx';
import { ELEEVATE_LOGO } from '../lib/themes.js';
import './publicJoin.css';

// Ruta actual: /unete, /unete/<clave>, /join/<clave> o el regreso de Discord (?join=…)
function readRoute() {
  const m = window.location.pathname.match(/^\/(?:unete|join)(?:\/([\w-]{1,40}))?\/?$/i);
  const q = new URLSearchParams(window.location.search);
  const join = q.get('join');
  if (!m && !join) return null;
  const slug = (m?.[1] || q.get('s') || '').toLowerCase();
  const route = { slug, error: join === 'error' ? (q.get('reason') || 'error') : null, pending: join === 'pending' || join === 'rejected' };
  // La dirección queda limpia (sin el motivo del error)
  if (join) window.history.replaceState(null, '', route.pending ? '/unete' : `/unete${slug ? `/${slug}` : ''}`);
  return route;
}
export const joinRoute = readRoute();

const REASONS = {
  off: 'El registro abierto está apagado. Pide una invitación al equipo.',
  slug: 'Este enlace ya no es válido. Pide el enlace nuevo al equipo en Discord.',
  oauth: 'El registro con Discord no está disponible por ahora.',
  paused: 'Los registros están en pausa por un momento. Vuelve a intentarlo más tarde.',
  ipbanned: 'Tu conexión está bloqueada por un administrador.',
  young: 'Tu cuenta de Discord es muy nueva para unirte. Vuelve en unos días.',
  iplimit: 'Ya se crearon varias cuentas desde tu conexión. Espera una hora e inténtalo de nuevo.',
  busy: 'Están entrando muchas personas al mismo tiempo. Espera unos minutos e inténtalo de nuevo.',
  notmember: 'Solo pueden unirse miembros del servidor de Discord de la comunidad. Únete y vuelve a intentarlo.',
  guildcheck: 'No pudimos revisar tu membresía en Discord. Inténtalo en un momento.',
  cancel: 'Se canceló la conexión con Discord.',
  error: 'No se pudo completar el registro. Inténtalo de nuevo.',
};

function Frame({ name, children }) {
  return (
    <div className="pj">
      <div className="pj-ring" aria-hidden="true" />
      <main className="pj-card">
        <img className="pj-logo" src={ELEEVATE_LOGO} alt="" />
        <div className="pj-kicker">Comunidad</div>
        <h1 className="pj-name">{name}</h1>
        {children}
      </main>
      <div className="pj-foot">Oficina virtual · Eleevate</div>
    </div>
  );
}

export default function PublicJoin({ route, config = {} }) {
  const [info, setInfo] = useState(null);
  const [status, setStatus] = useState(route.pending ? 'pending' : null); // pending | rejected | null
  const name = config.officeName || 'HUB';

  useEffect(() => {
    let stop = false, t = null;
    const poll = async () => {
      const r = await api.get('/join/status').catch(() => null);
      if (stop || !r) return;
      if (r.status === 'approved') { window.location.href = '/?discord=welcome'; return; }
      if (r.status === 'pending' || r.status === 'rejected') setStatus(r.status);
      else setStatus(null);
      if (r.status === 'pending') t = setTimeout(poll, 6000);
    };
    poll();
    return () => { stop = true; clearTimeout(t); };
  }, []);

  useEffect(() => {
    api.get(`/join/info?${new URLSearchParams({ slug: route.slug })}`).then(setInfo).catch(() => setInfo({ available: false, reason: 'error' }));
  }, [route.slug]);

  if (status === 'pending') {
    return (
      <Frame name={name}>
        <div className="pj-wait"><span className="pj-dot" /><span className="pj-dot" /><span className="pj-dot" /></div>
        <h2 className="pj-title">Tu solicitud está en revisión</h2>
        <p className="pj-sub">Un administrador la va a revisar pronto. Puedes dejar esta página abierta: entrarás automáticamente en cuanto te aprueben.</p>
        <a className="pj-link" href="/">Ir al inicio de sesión</a>
      </Frame>
    );
  }
  if (status === 'rejected') {
    return (
      <Frame name={name}>
        <h2 className="pj-title">No se aprobó tu solicitud</h2>
        <p className="pj-sub">Si crees que es un error, habla con el equipo en Discord.</p>
      </Frame>
    );
  }
  if (!info) return <Frame name={name}><p className="pj-sub">Cargando…</p></Frame>;

  if (!info.available) {
    return (
      <Frame name={info.officeName || name}>
        <h2 className="pj-title">Registro no disponible</h2>
        <p className="pj-sub">{REASONS[info.reason] || REASONS.error}</p>
        <a className="pj-link" href="/">¿Ya tienes cuenta? Inicia sesión</a>
      </Frame>
    );
  }

  return (
    <Frame name={info.officeName || name}>
      <p className="pj-sub">Entra a la oficina virtual de la comunidad: crea tu personaje, saluda y únete a las salas.</p>
      {route.error && <div className="pj-error" role="alert">{REASONS[route.error] || REASONS.error}</div>}
      <DiscordButton mode="join" slug={info.slug || route.slug} className="pj-discord"><DiscordIcon size={24} /> Entrar con Discord</DiscordButton>
      <ul className="pj-rules">
        <li>Tu cuenta se crea con tu nombre de Discord. Sin contraseñas.</li>
        {info.requireGuild && <li>Solo para miembros del servidor{info.guildName ? <> <b>{info.guildName}</b></> : ' de Discord'}.</li>}
        {info.minAgeDays > 0 && <li>Tu cuenta de Discord debe tener al menos {info.minAgeDays} {info.minAgeDays === 1 ? 'día' : 'días'}.</li>}
        {info.approval && <li>Un administrador aprueba cada cuenta nueva.</li>}
      </ul>
      <a className="pj-link" href="/">¿Ya tienes cuenta? Inicia sesión</a>
    </Frame>
  );
}
