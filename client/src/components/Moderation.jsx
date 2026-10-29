// Moderación: bloquear / reportar (cualquiera) y silenciar / sacar / suspender (admins).
// También el panel de admin en Preferencias → Moderación (reportes y sanciones activas).
import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Flag, Ban, MicOff, DoorOpen, ShieldAlert, Check, Undo2 } from 'lucide-react';
import { office, useOffice } from '../lib/store.js';
import { api } from '../lib/api.js';
import { blockUser, reportUser, fmtUntil } from '../lib/moderation.js';
import { Modal, Avatar } from './ui.jsx';

const REASONS = [
  ['spam', 'Spam o flood'],
  ['acoso', 'Acoso o insultos'],
  ['suplantacion', 'Se hace pasar por otra persona'],
  ['contenido', 'Contenido inapropiado'],
  ['trampas', 'Trampas o abuso de fallas'],
  ['otro', 'Otro'],
];
const toastErr = (e) => office.toast({ title: e.message, kind: 'error' });

// ---------- Reportar ----------
export function ReportDialog({ user, messageId = null, preview = '', onClose }) {
  const [reason, setReason] = useState(messageId ? 'acoso' : 'spam');
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const send = async (e) => {
    e.preventDefault();
    setBusy(true);
    try { await reportUser({ userId: user.id, messageId, reason, text }); setDone(true); } catch (err) { toastErr(err); }
    setBusy(false);
  };
  return createPortal(
    <Modal title={done ? '¡Gracias por avisar!' : `Reportar a ${user.displayName}`} onClose={onClose} width={440} className="mod-report">
      {done ? (
        <>
          <div className="feedback-done"><Check size={26} /> Tu reporte llegó a los admins. Lo revisarán pronto; nadie más sabe que lo enviaste.</div>
          <button className="btn primary block" onClick={onClose}>Cerrar</button>
        </>
      ) : (
        <form className="form" onSubmit={send}>
          {preview && <blockquote className="mod-quote">{preview.length > 200 ? `${preview.slice(0, 200)}…` : preview}</blockquote>}
          <div className="mod-reasons">
            {REASONS.map(([id, label]) => (
              <label key={id} className={`mod-reason ${reason === id ? 'on' : ''}`}>
                <input type="radio" name="reason" value={id} checked={reason === id} onChange={() => setReason(id)} /> {label}
              </label>
            ))}
          </div>
          <textarea rows={3} maxLength={1000} placeholder="Cuéntanos qué pasó (opcional)" value={text} onChange={(e) => setText(e.target.value)} />
          <button className="btn primary block" disabled={busy}><Flag size={15} /> Enviar reporte</button>
        </form>
      )}
    </Modal>,
    document.body,
  );
}

// Botón "Reportar" en un mensaje del chat
export function ReportMsgButton({ m }) {
  const me = useOffice((s) => s.me);
  const user = useOffice((s) => s.users[m.userId]);
  const [open, setOpen] = useState(false);
  if (!user || m.userId === me.id || m.kind === 'wave') return null;
  return (
    <>
      <button className="icon-btn" title="Reportar mensaje" aria-label="Reportar mensaje" onClick={() => setOpen(true)}><Flag size={15} /></button>
      {open && <ReportDialog user={user} messageId={m.id} preview={m.body} onClose={() => setOpen(false)} />}
    </>
  );
}

// ---------- Tarjeta de perfil: bloquear, reportar y (admins) sancionar ----------
const MUTES = [[15, '15 min'], [60, '1 hora'], [24 * 60, '1 día']];
const BANS = [[24 * 60, '1 día'], [7 * 24 * 60, '7 días'], [null, 'Permanente']];

export function ModerationActions({ user }) {
  const me = useOffice((s) => s.me);
  const blocked = useOffice((s) => s.blocked || []);
  const isMod = useOffice((s) => s.moderator); // "Moderador de HUB" (rol de Discord mapeado)
  const [report, setReport] = useState(false);
  const [panel, setPanel] = useState(null); // null | 'mute' | 'vmute' | 'ban'
  const [reason, setReason] = useState('');
  const [withIp, setWithIp] = useState(false);
  const [ipInfo, setIpInfo] = useState(null);
  const isAdmin = me.role === 'admin';
  useEffect(() => {
    if (panel !== 'ban' || !isAdmin || !user) return;
    api.get(`/admin/ips/${user.id}`).then(setIpInfo).catch(() => setIpInfo(null));
  }, [panel, user?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!user || user.id === me.id) return null;
  const isBlocked = blocked.includes(user.id);
  const canMod = (isAdmin || isMod) && user.role !== 'admin';
  const first = user.displayName.split(' ')[0];
  const toggleBlock = () => blockUser(office, user.id, !isBlocked)
    .then(() => office.toast({ title: isBlocked ? `Desbloqueaste a ${first}` : `🚫 Bloqueaste a ${first}: ya no verás sus mensajes ni te podrá llamar.` }))
    .catch(toastErr);
  const act = (action, extra = {}) => api.post(`/mod/${user.id}`, { action, reason, ...extra }).then((r) => {
    const until = r.until;
    const msg = {
      mute: `🔇 ${first} quedó silenciado ${fmtUntil(until)}`, unmute: `🔊 ${first} ya puede hablar`, kick: `🚪 Sacaste a ${first} de la oficina`,
      vmute: `🎙️ ${first} quedó sin voz ${fmtUntil(until)} (el chat sigue)`, unvmute: `🎙️ ${first} ya puede usar el micrófono`,
      move: `↩️ Sacaste a ${first} de la sala o llamada`,
      ban: `⛔ ${first} quedó suspendido ${fmtUntil(until)}`, ipban: `⛔ ${first} quedó suspendido ${fmtUntil(until)} y su IP bloqueada`, unban: `Levantaste la suspensión de ${first}`,
    }[action];
    office.toast({ title: msg });
    setPanel(null);
  }).catch(toastErr);
  const durations = panel === 'ban' ? (isAdmin ? BANS : BANS.filter(([m]) => m != null)) : MUTES;

  return (
    <div className="mod-actions">
      <div className="mod-row">
        {user.role !== 'admin' && (
          <button className={`btn ghost tiny ${isBlocked ? 'on' : ''}`} onClick={toggleBlock}><Ban size={13} /> {isBlocked ? 'Desbloquear' : 'Bloquear'}</button>
        )}
        <button className="btn ghost tiny" onClick={() => setReport(true)}><Flag size={13} /> Reportar</button>
        {canMod && (
          <>
            <button className={`btn ghost tiny ${panel === 'mute' ? 'on' : ''}`} onClick={() => setPanel(panel === 'mute' ? null : 'mute')}><MicOff size={13} /> Silenciar</button>
            <button className={`btn ghost tiny ${panel === 'vmute' ? 'on' : ''}`} onClick={() => setPanel(panel === 'vmute' ? null : 'vmute')} title="Solo el micrófono: puede seguir escribiendo"><MicOff size={13} /> Silenciar en voz</button>
            <button className="btn ghost tiny" onClick={() => act('move')} title="Lo saca de la sala del Hotel o lo regresa a la entrada del piso"><Undo2 size={13} /> Sacar de la sala/voz</button>
            <button className="btn ghost tiny" onClick={() => act('kick')} title="Lo desconecta y no puede volver en 5 minutos"><DoorOpen size={13} /> Sacar</button>
            <button className={`btn ghost tiny danger ${panel === 'ban' ? 'on' : ''}`} onClick={() => setPanel(panel === 'ban' ? null : 'ban')}><ShieldAlert size={13} /> Suspender</button>
          </>
        )}
      </div>
      {panel && (
        <div className="mod-panel">
          <input className="search-input" maxLength={200} placeholder="Motivo (lo verá la persona)" value={reason} onChange={(e) => setReason(e.target.value)} />
          {panel === 'ban' && isAdmin && (
            <label className="mod-ip">
              <input type="checkbox" checked={withIp} onChange={(e) => setWithIp(e.target.checked)} /> Banear también su IP
              {ipInfo && <span className="muted small"> · {ipInfo.ips.length ? `${ipInfo.ips[0].masked || 'IP oculta'}${ipInfo.shared ? ` · la comparte con ${ipInfo.shared} ${ipInfo.shared === 1 ? 'persona' : 'personas'}` : ''}` : 'sin IP reciente'}</span>}
            </label>
          )}
          <div className="mod-row">
            {durations.map(([min, label]) => (
              <button key={label} className={`btn tiny ${panel === 'ban' ? 'danger' : 'primary'}`} onClick={() => act(panel === 'ban' && withIp ? 'ipban' : panel, { minutes: min })}>{label}</button>
            ))}
            {panel === 'mute' && <button className="btn tiny ghost" onClick={() => act('unmute')}><Undo2 size={13} /> Quitar silencio</button>}
            {panel === 'vmute' && <button className="btn tiny ghost" onClick={() => act('unvmute')}><Undo2 size={13} /> Devolver la voz</button>}
          </div>
        </div>
      )}
      {report && <ReportDialog user={user} onClose={() => setReport(false)} />}
    </div>
  );
}

// ---------- Preferencias → Moderación (admins) ----------
const STATUS_LABEL = { nuevo: 'Nuevos', revisado: 'Revisados', descartado: 'Descartados' };
const KIND_LABEL = { mute: '🔇 Silenciado', vmute: '🎙️ Sin voz', ban: '⛔ Suspendido' };
const LIFT = { mute: 'unmute', vmute: 'unvmute', ban: 'unban' };

export function ModerationAdmin() {
  const users = useOffice((s) => s.users);
  const [tab, setTab] = useState('nuevo');
  const [data, setData] = useState({ reports: [], counts: {} });
  const [sanctions, setSanctions] = useState({ sanctions: [], kicked: [] });
  const [ipBans, setIpBans] = useState([]);
  const load = () => {
    api.get(`/admin/reports?status=${tab}`).then(setData).catch(toastErr);
    api.get('/admin/moderation').then(setSanctions).catch(toastErr);
    api.get('/admin/ipbans').then((r) => setIpBans(r.bans)).catch(() => {});
  };
  useEffect(load, [tab]); // eslint-disable-line react-hooks/exhaustive-deps
  const name = (id) => users[id]?.displayName || `#${id}`;
  const mark = (id, status) => api.patch(`/admin/reports/${id}`, { status }).then(load).catch(toastErr);
  const lift = (s) => api.post(`/mod/${s.userId}`, { action: LIFT[s.kind] || 'unban' }).then(load).catch(toastErr);
  const liftIp = (b) => api.del(`/admin/ipbans/${b.id}`).then(load).catch(toastErr);
  const openUser = (id) => office.set({ profileCard: id, modal: null });

  return (
    <>
      <div className="pref-section">
        <div className="pref-section-title">Reportes</div>
        <p className="muted small">Lo que la comunidad reporta desde la tarjeta de una persona o desde un mensaje. Cada acción queda en el registro de actividad (Seguridad).</p>
        <div className="seg">
          {Object.entries(STATUS_LABEL).map(([k, label]) => (
            <button key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{label} ({data.counts?.[k] || 0})</button>
          ))}
        </div>
        <div className="mod-list">
          {data.reports.map((r) => (
            <div key={r.id} className="mod-item">
              <Avatar user={users[r.targetId]} size={32} showStatus={false} />
              <div className="mod-item-main">
                <div><button className="link" onClick={() => openUser(r.targetId)}><b>{name(r.targetId)}</b></button> · <span className="tag">{r.reasonLabel}</span></div>
                <div className="muted small">Lo reportó {name(r.reporterId)} · {new Date(r.createdAt).toLocaleString('es-MX', { dateStyle: 'short', timeStyle: 'short' })}</div>
                {r.snapshot?.body && <blockquote className="mod-quote">{r.snapshot.body}</blockquote>}
                {r.text && <div className="small">{r.text}</div>}
              </div>
              <div className="mod-item-actions">
                {r.status !== 'revisado' && <button className="btn tiny primary" onClick={() => mark(r.id, 'revisado')}>Revisado</button>}
                {r.status !== 'descartado' && <button className="btn tiny ghost" onClick={() => mark(r.id, 'descartado')}>Descartar</button>}
              </div>
            </div>
          ))}
          {!data.reports.length && <div className="muted pad">Sin reportes {STATUS_LABEL[tab].toLowerCase()}.</div>}
        </div>
      </div>
      <div className="pref-section">
        <div className="pref-section-title">Sanciones activas</div>
        <p className="muted small">Para silenciar, sacar o suspender a alguien, abre su tarjeta (clic en su nombre o personaje).</p>
        <div className="mod-list">
          {sanctions.sanctions.map((s) => (
            <div key={s.id} className="mod-item">
              <Avatar user={users[s.userId]} size={32} showStatus={false} />
              <div className="mod-item-main">
                <div><b>{name(s.userId)}</b> · {KIND_LABEL[s.kind] || '⛔ Suspendido'} {fmtUntil(s.until)}</div>
                {s.reason && <div className="muted small">Motivo: {s.reason}</div>}
              </div>
              <div className="mod-item-actions"><button className="btn tiny ghost" onClick={() => lift(s)}>{s.kind === 'ban' ? 'Levantar' : 'Quitar silencio'}</button></div>
            </div>
          ))}
          {sanctions.kicked.map((k) => (
            <div key={`k${k.userId}`} className="mod-item">
              <Avatar user={users[k.userId]} size={32} showStatus={false} />
              <div className="mod-item-main"><b>{name(k.userId)}</b> · 🚪 Fuera de la oficina {fmtUntil(k.until)}</div>
            </div>
          ))}
          {!sanctions.sanctions.length && !sanctions.kicked.length && <div className="muted pad">Nadie tiene sanciones activas.</div>}
        </div>
      </div>
      <div className="pref-section">
        <div className="pref-section-title">IPs bloqueadas</div>
        <p className="muted small">Se guardan cifradas (hash): nunca se ve la IP completa, solo los primeros números. Para bloquear, suspende a alguien desde su tarjeta con “Banear también su IP”.</p>
        <div className="mod-list">
          {ipBans.map((b) => (
            <div key={b.id} className="mod-item">
              <Avatar user={users[b.userId]} size={32} showStatus={false} />
              <div className="mod-item-main">
                <div><b>{b.masked || `IP ${b.hash}`}</b> · 🌐 Bloqueada {fmtUntil(b.until)}{b.userId ? <> · de {name(b.userId)}</> : null}</div>
                <div className="muted small">{b.users.length > 1 ? `La usan ${b.users.length} cuentas: ${b.users.map(name).join(', ')}` : 'Una sola cuenta'}{b.note ? ` · ${b.note}` : ''}</div>
              </div>
              <div className="mod-item-actions"><button className="btn tiny ghost" onClick={() => liftIp(b)}>Levantar</button></div>
            </div>
          ))}
          {!ipBans.length && <div className="muted pad">No hay IPs bloqueadas.</div>}
        </div>
      </div>
    </>
  );
}
