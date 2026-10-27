// Botón de Discord. En el celular abre la app de Discord si está instalada
// (Android: intent con respaldo al navegador; iPhone: enlace universal de discord.com).
// Si estás en la app instalada de la oficina, espera a que regreses de Discord y entra sola.
import React, { useEffect, useRef, useState } from 'react';
import { api } from '../lib/api.js';
import { isIOS, isStandalone } from '../lib/push.js';

const isAndroid = () => /android/i.test(navigator.userAgent);
const isMobile = () => isIOS() || isAndroid();

function androidIntent(url) {
  const u = new URL(url);
  return `intent://${u.host}${u.pathname}${u.search}#Intent;scheme=https;package=com.discord;S.browser_fallback_url=${encodeURIComponent(url)};end`;
}

export default function DiscordButton({ mode, invite, className = 'btn block discord-btn', children }) {
  const fallback = `/api/auth/discord?${new URLSearchParams({ mode, ...(invite ? { invite } : {}) })}`;
  const mobile = isMobile();
  const [start, setStart] = useState(null); // { url, hid, code }
  const [waiting, setWaiting] = useState(false);
  const [msg, setMsg] = useState('');
  const timer = useRef(null);

  // En el celular se pide la URL de Discord de antemano: así el toque abre la app directamente
  useEffect(() => {
    if (!mobile) return undefined;
    let alive = true;
    const load = () => api.post('/auth/discord/start', { mode, invite, handoff: isStandalone() })
      .then((r) => alive && setStart(r)).catch(() => alive && setStart(null));
    load();
    const t = setInterval(load, 8 * 60e3);
    return () => { alive = false; clearInterval(t); };
  }, [mode, invite, mobile]);

  // La app instalada espera el regreso de Discord
  useEffect(() => {
    if (!waiting || !start?.hid) return undefined;
    let stop = false;
    const poll = async () => {
      if (stop) return;
      try {
        const r = await fetch(`/api/auth/discord/handoff/${encodeURIComponent(start.hid)}`, { credentials: 'same-origin', cache: 'no-store' });
        const d = await r.json();
        if (d.status === 'done') { window.location.href = `/?${d.query}`; return; }
        if (d.status === 'expired') { setWaiting(false); setMsg('Se acabó el tiempo. Vuelve a intentarlo.'); return; }
      } catch { /* sin red: se reintenta */ }
      timer.current = setTimeout(poll, 1500);
    };
    poll();
    const vis = () => { if (document.visibilityState === 'visible') { clearTimeout(timer.current); poll(); } };
    document.addEventListener('visibilitychange', vis);
    return () => { stop = true; clearTimeout(timer.current); document.removeEventListener('visibilitychange', vis); };
  }, [waiting, start]);

  const href = mobile && start?.url ? (isAndroid() ? androidIntent(start.url) : start.url) : fallback;
  const onClick = () => { setMsg(''); if (mobile && start?.hid) setWaiting(true); };

  return (
    <>
      <a className={className} href={href} onClick={onClick}>{children}</a>
      {waiting && (
        <div className="discord-wait">
          <span>Autoriza en Discord y regresa aquí.</span>
          <span>Si te lo pide, confirma este código: <b>{start.code}</b></span>
        </div>
      )}
      {msg && <div className="auth-error">{msg}</div>}
    </>
  );
}
