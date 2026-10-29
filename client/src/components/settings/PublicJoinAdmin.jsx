// Preferencias → Registro abierto (admins): enlace público /unete/<clave> para unirse con Discord,
// con QR, contadores, regenerar enlace, frenos (pausa, antigüedad, topes, solo miembros) y aprobación.
import React, { useEffect, useState } from 'react';
import { AlertTriangle, Copy, Link2, PauseCircle, RefreshCw, Check, X } from 'lucide-react';
import { office } from '../../lib/store.js';
import { api } from '../../lib/api.js';
import { Toggle, Row } from '../ui.jsx';
import { fmtDate } from '../../lib/time.js';
import '../publicJoin.css';

export const JoinIcon = Link2;
const toastErr = (e) => office.toast({ title: e.message, kind: 'error' });
const copy = (t) => navigator.clipboard?.writeText(t).then(() => office.toast({ title: 'Enlace copiado' })).catch(() => {});

export default function PublicJoinAdmin() {
  const [st, setSt] = useState(null);
  const [qr, setQr] = useState(null);
  const load = () => api.get('/admin/public-join').then(setSt).catch(toastErr);
  useEffect(() => { load(); const t = setInterval(load, 20000); return () => clearInterval(t); }, []);
  const link = st?.urls.link;
  useEffect(() => {
    if (!link || !st?.config.enabled) return;
    let alive = true;
    import('qrcode').then((m) => m.default.toDataURL(link, { margin: 1, width: 240, color: { dark: '#222640', light: '#ffffff' } })).then((d) => alive && setQr(d)).catch(() => setQr(null));
    return () => { alive = false; };
  }, [link, st?.config.enabled]);
  if (!st) return <div className="muted pad">Cargando…</div>;

  const c = st.config;
  const put = (patch) => api.put('/admin/public-join', patch).then(setSt).catch(toastErr);
  const rotate = () => {
    if (!confirm('¿Regenerar el enlace? El enlace actual dejará de funcionar para todos.')) return;
    api.post('/admin/public-join/rotate').then((r) => { setSt(r); office.toast({ title: '🔁 Enlace nuevo listo' }); }).catch(toastErr);
  };
  const decide = (id, ok) => api.post(`/admin/public-join/${id}/${ok ? 'approve' : 'reject'}`).then(setSt).catch(toastErr);

  return (
    <>
      {!st.oauth && (
        <div className="pref-section">
          <div className="dc-danger" style={{ background: 'rgba(224,177,90,.1)', borderColor: 'rgba(224,177,90,.45)' }}>
            <AlertTriangle size={18} style={{ color: '#b7791f' }} />
            <div>
              <b>Falta configurar “Entrar con Discord”.</b> Sin eso la página del enlace dice que el registro no está disponible.
              <ol style={{ margin: '8px 0 0', paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 4 }}>
                <li>En <b>discord.com/developers/applications</b> abre tu aplicación → <b>OAuth2</b>.</li>
                <li>En <b>Redirects</b> agrega: <code>{st.urls.redirectUri}</code></li>
                <li>En Render → <b>Environment</b> pon <code>DISCORD_CLIENT_ID</code> y <code>DISCORD_CLIENT_SECRET</code> (y <code>PUBLIC_URL</code> con tu dirección) y reinicia.</li>
              </ol>
            </div>
          </div>
        </div>
      )}

      <div className="pref-section">
        <Row title="Registro abierto con Discord" desc="Comparte un enlace para que cualquiera se una con su Discord. Entran como miembros, nunca como admin. Las invitaciones siguen funcionando igual.">
          <Toggle checked={c.enabled} onChange={(v) => put({ enabled: v })} />
        </Row>
      </div>

      {c.enabled && (
        <>
          <div className="pref-section">
            <div className="pref-section-title">Enlace para compartir</div>
            {c.paused && <div className="pja-paused"><PauseCircle size={16} /> Los registros están en pausa: el enlace abre, pero nadie nuevo puede crear cuenta.</div>}
            <div className="pja-link">
              <div className="pja-link-main">
                <div className="pja-url"><code>{st.urls.link}</code><button className="icon-btn" onClick={() => copy(st.urls.link)} aria-label="Copiar enlace"><Copy size={15} /></button></div>
                {c.allowBare && <div className="pja-url"><code>{st.urls.bare}</code><button className="icon-btn" onClick={() => copy(st.urls.bare)} aria-label="Copiar enlace corto"><Copy size={15} /></button></div>}
                <div className="pja-actions">
                  <button className="btn primary tiny" onClick={() => copy(st.urls.link)}><Copy size={13} /> Copiar enlace</button>
                  <button className="btn ghost tiny" onClick={rotate}><RefreshCw size={13} /> Regenerar enlace</button>
                </div>
                <p className="muted small" style={{ margin: 0 }}>Si el enlace se filtra, regenéralo: el anterior deja de servir al instante.</p>
              </div>
              {qr && <img className="pja-qr" src={qr} alt="Código QR del enlace" />}
            </div>
            <div className="pja-stats">
              <div className="pja-stat"><b>{st.counts.today}</b><span>Se unieron hoy</span></div>
              <div className="pja-stat"><b>{st.counts.hour}</b><span>Última hora (tope {c.globalHour})</span></div>
              <div className="pja-stat"><b>{st.counts.pending}</b><span>En espera</span></div>
              <div className="pja-stat"><b>{st.counts.total}</b><span>Total por enlace</span></div>
            </div>
            <Row title="Clave del enlace" desc="Puedes ponerle un nombre bonito (por ejemplo “hub”). Cambiarla invalida el enlace anterior.">
              <SlugEdit value={c.slug} onSave={(slug) => put({ slug })} />
            </Row>
            <Row title="Permitir /unete sin clave" desc="Cualquiera que escriba la dirección corta podrá unirse. Más cómodo, pero no se puede regenerar.">
              <Toggle checked={c.allowBare} onChange={(v) => put({ allowBare: v })} />
            </Row>
          </div>

          <div className="pref-section">
            <div className="pref-section-title">Protección contra raids</div>
            <Row title="Pausar registros" desc="Freno de emergencia: nadie nuevo puede crear cuenta. Quien ya tiene cuenta sigue entrando.">
              <Toggle checked={c.paused} onChange={(v) => put({ paused: v })} />
            </Row>
            <Row title="Solo miembros de mi servidor de Discord" desc={st.bot ? 'Revisa con el bot que la persona esté en tu servidor antes de crear su cuenta.' : 'Necesita el bot de Discord (Preferencias → Discord).'}>
              <Toggle checked={c.requireGuild} disabled={!st.bot} onChange={(v) => put({ requireGuild: v })} />
            </Row>
            <Row title="Aprobar nuevos miembros" desc="Las cuentas nuevas esperan a que un admin las apruebe aquí abajo.">
              <Toggle checked={c.approval} onChange={(v) => put({ approval: v })} />
            </Row>
            <Row title="Antigüedad mínima de la cuenta de Discord" desc="Frena cuentas recién creadas para trolear. 0 = sin mínimo.">
              <NumEdit value={c.minAgeDays} min={0} max={365} suffix="días" onSave={(v) => put({ minAgeDays: v })} />
            </Row>
            <Row title="Cuentas nuevas por conexión (IP)" desc="Máximo por hora desde la misma IP. Las IP bloqueadas nunca pueden unirse.">
              <NumEdit value={c.perIpHour} min={1} max={50} suffix="/ hora" onSave={(v) => put({ perIpHour: v })} />
            </Row>
            <Row title="Cuentas nuevas en total" desc="Tope global por hora para frenar un raid.">
              <NumEdit value={c.globalHour} min={1} max={1000} suffix="/ hora" onSave={(v) => put({ globalHour: v })} />
            </Row>
          </div>
        </>
      )}

      {(c.approval || st.pending.length > 0) && (
        <div className="pref-section">
          <div className="pref-section-title">Solicitudes en espera</div>
          {st.pending.length === 0 && <div className="muted small">No hay nadie esperando.</div>}
          <div className="pja-pending">
            {st.pending.map((p) => (
              <div key={p.userId} className="pja-person">
                <div>
                  <b>{p.name}</b>
                  <small>Discord: {p.discordName || '—'} · cuenta de Discord desde {p.discordCreatedAt ? fmtDate(p.discordCreatedAt) : '—'} · pidió {fmtDate(p.createdAt)}</small>
                </div>
                <button className="btn primary tiny" onClick={() => decide(p.userId, true)}><Check size={13} /> Aprobar</button>
                <button className="btn ghost tiny" onClick={() => decide(p.userId, false)}><X size={13} /> Rechazar</button>
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );
}

function NumEdit({ value, min, max, suffix, onSave }) {
  const [v, setV] = useState(String(value));
  useEffect(() => setV(String(value)), [value]);
  const commit = () => { const n = Number(v); if (Number.isFinite(n) && n !== value) onSave(Math.min(max, Math.max(min, Math.round(n)))); else setV(String(value)); };
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
      <input className="pja-num" type="number" min={min} max={max} value={v} onChange={(e) => setV(e.target.value)} onBlur={commit} onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()} />
      <span className="muted small">{suffix}</span>
    </span>
  );
}

function SlugEdit({ value, onSave }) {
  const [v, setV] = useState(value);
  useEffect(() => setV(value), [value]);
  const dirty = v.trim().toLowerCase() !== value;
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
      <input className="pja-slug" value={v} maxLength={32} onChange={(e) => setV(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))} aria-label="Clave del enlace" />
      {dirty && <button className="btn primary tiny" onClick={() => onSave(v.trim())}>Guardar</button>}
    </span>
  );
}
