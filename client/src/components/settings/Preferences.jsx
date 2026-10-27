import React, { useEffect, useRef, useState } from 'react';
import {
  X, Smile, Upload, Download, Settings, Calendar, Mic, Video, Users, Bell, Shield, Zap, KeyRound, UserCog, Mail, Building2, Copy, Check, Ban, RotateCcw, Volume2,
} from 'lucide-react';
import { office, useOffice } from '../../lib/store.js';
import { api } from '../../lib/api.js';
import { listDevices } from '../../lib/media.js';
import { playSound } from '../../lib/sounds.js';
import { Toggle, Select, Row, Radio, Avatar, Empty, AvatarCanvas } from '../ui.jsx';
import { fmtDate } from '../../lib/time.js';

const SECTIONS = [
  { group: 'Preferencias' },
  { id: 'general', label: 'General', icon: Settings },
  { id: 'calendar', label: 'Calendario', icon: Calendar },
  { id: 'audio', label: 'Audio', icon: Mic },
  { id: 'video', label: 'Video', icon: Video },
  { id: 'meetings', label: 'Reuniones', icon: Users },
  { id: 'notifications', label: 'Notificaciones', icon: Bell },
  { id: 'privacy', label: 'Privacidad y actividad', icon: Shield },
  { id: 'performance', label: 'Rendimiento', icon: Zap },
  { id: 'account', label: 'Cuenta', icon: KeyRound },
  { group: 'Oficina' },
  { id: 'members', label: 'Miembros', icon: UserCog },
  { id: 'office', label: 'Pisos y áreas', icon: Building2, admin: true },
  { id: 'characters', label: 'Personajes', icon: Smile, admin: true },
];

export default function Preferences({ section = 'general' }) {
  const me = useOffice((s) => s.me);
  const modal = useOffice((s) => s.modal);
  const [cur, setCur] = useState(section);
  const close = () => office.set({ modal: null });
  useEffect(() => {
    const k = (e) => e.key === 'Escape' && close();
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, []);
  const active = SECTIONS.find((s) => s.id === cur);

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && close()}>
      <div className="prefs" role="dialog" aria-modal="true">
        <nav className="prefs-nav">
          {SECTIONS.filter((s) => !s.admin || me.role === 'admin').map((s) => (s.group ? (
            <div key={s.group} className="prefs-group">{s.group}</div>
          ) : (
            <button key={s.id} className={cur === s.id ? 'on' : ''} onClick={() => setCur(s.id)}>
              <s.icon size={16} /> {s.label}
            </button>
          )))}
        </nav>
        <section className="prefs-main">
          <div className="prefs-head">
            <h2>{active?.label}</h2>
            <button className="icon-btn" onClick={close} aria-label="Cerrar"><X size={18} /></button>
          </div>
          <div className="prefs-body">
            {cur === 'general' && <General />}
            {cur === 'calendar' && <CalendarPrefs />}
            {cur === 'audio' && <AudioPrefs />}
            {cur === 'video' && <VideoPrefs />}
            {cur === 'meetings' && <Meetings />}
            {cur === 'notifications' && <Notifications />}
            {cur === 'privacy' && <Privacy />}
            {cur === 'performance' && <Performance />}
            {cur === 'account' && <Account />}
            {cur === 'members' && <Members initialTab={modal?.tab} />}
            {cur === 'office' && <OfficeAdmin />}
            {cur === 'characters' && <CharactersAdmin />}
          </div>
        </section>
      </div>
    </div>
  );
}

function usePref(group) {
  const value = useOffice((s) => s.prefs[group]);
  const set = (k, v) => office.updatePrefs({ [group]: { ...office.state.prefs[group], [k]: v } });
  return [value, set];
}

function Section({ title, children, beta }) {
  return (
    <div className="pref-section">
      {title && <div className="pref-section-title">{title}{beta && <span className="tag">Beta</span>}</div>}
      {children}
    </div>
  );
}

function General() {
  const mode = useOffice((s) => s.prefs.colorMode);
  return (
    <>
      <Section title="Idioma">
        <Row title="Idioma de la interfaz" desc="El idioma en el que ves la oficina">
          <Select value="es" onChange={() => {}} options={[{ value: 'es', label: 'Español (México)' }]} />
        </Row>
      </Section>
      <Section title="Apariencia">
        <Row title="Modo de color" desc="Claro, oscuro o según tu sistema">
          <Select value={mode} onChange={(v) => office.updatePrefs({ colorMode: v })} options={[{ value: 'light', label: 'Claro' }, { value: 'dark', label: 'Oscuro' }, { value: 'system', label: 'Sistema' }]} />
        </Row>
      </Section>
      <Section title="Atajos de teclado">
        <div className="shortcuts">
          <div><kbd>W A S D</kbd> / <kbd>flechas</kbd> Caminar</div>
          <div><kbd>Clic</kbd> en el mapa Caminar hasta ahí</div>
          <div><kbd>1</kbd>–<kbd>6</kbd> Reacciones rápidas</div>
          <div><kbd>Ctrl</kbd>+<kbd>K</kbd> Buscar</div>
          <div><kbd>Ctrl</kbd>+<kbd>F</kbd> Buscar personas</div>
          <div><kbd>R</kbd> Rotar objeto (editor)</div>
        </div>
      </Section>
    </>
  );
}

function CalendarPrefs() {
  const [p, set] = usePref('calendar');
  return (
    <Section>
      <Row title="Vista de la semana" desc="Ver solo días laborales o la semana completa">
        <Select value={String(p.weekDays)} onChange={(v) => set('weekDays', Number(v))} options={[{ value: '7', label: '7 días' }, { value: '5', label: '5 días (lun–vie)' }]} />
      </Row>
      <Row title="Primer día de la semana" desc="Con qué día empieza tu calendario">
        <Select value={String(p.firstDay)} onChange={(v) => set('firstDay', Number(v))} options={[{ value: '0', label: 'Domingo' }, { value: '1', label: 'Lunes' }]} />
      </Row>
    </Section>
  );
}

function useDevices() {
  const [d, setD] = useState({ mics: [], cams: [], speakers: [] });
  useEffect(() => { listDevices().then(setD); }, []);
  return d;
}

const devOpts = (list, def) => [{ value: '', label: def }, ...list.filter((x) => x.deviceId && x.deviceId !== 'default').map((x, i) => ({ value: x.deviceId, label: x.label || `Dispositivo ${i + 1}` }))];

function AudioPrefs() {
  const [a, set] = usePref('audio');
  const [dev, setDev] = usePref('devices');
  const devices = useDevices();
  const after = (fn) => async (...args) => { fn(...args); await office.media?.restartTracks().catch(() => {}); };
  return (
    <>
      <Section>
        <Row title="Micrófono">
          <Select value={dev.micId} onChange={after((v) => setDev('micId', v))} options={devOpts(devices.mics, 'Predeterminado')} />
        </Row>
        {devices.speakers.length > 0 && (
          <Row title="Bocinas / audífonos">
            <Select value={dev.speakerId} onChange={(v) => setDev('speakerId', v)} options={devOpts(devices.speakers, 'Predeterminado')} />
          </Row>
        )}
        <Row title="Reducir ruido de fondo" desc="Suprime el ruido para que tu voz se escuche más clara">
          <Toggle checked={a.noiseSuppression} onChange={after((v) => set('noiseSuppression', v))} />
        </Row>
        <Row title="Ajustar volumen del micrófono automáticamente" desc="Mantiene tu voz a un volumen estable">
          <Toggle checked={a.autoGainControl} onChange={after((v) => set('autoGainControl', v))} />
        </Row>
        <Row title="Reducir eco" desc="Evita que el micrófono capte lo que suena en tus bocinas">
          <Toggle checked={a.echoCancellation} onChange={after((v) => set('echoCancellation', v))} />
        </Row>
        <Row title="Silenciar automáticamente" desc="Apaga micrófono y cámara cuando cambias de pestaña (excepto en salas privadas)">
          <Toggle checked={a.muteOnHidden} onChange={(v) => set('muteOnHidden', v)} />
        </Row>
      </Section>
      <Section title="Sonidos">
        <Row title="Volumen de notificaciones" desc="Mensajes, saludos y recordatorios">
          <div className="row gap8">
            <input type="range" min="0" max="1" step="0.05" value={a.notifVolume} onChange={(e) => set('notifVolume', Number(e.target.value))} />
            <button className="icon-btn" title="Probar" onClick={() => playSound('message', a.notifVolume)}><Volume2 size={16} /></button>
          </div>
        </Row>
      </Section>
    </>
  );
}

function CamPreview({ camId, hd }) {
  const ref = useRef(null);
  const [err, setErr] = useState('');
  useEffect(() => {
    let stream;
    let alive = true;
    navigator.mediaDevices?.getUserMedia({ video: { width: hd ? 1280 : 640, height: hd ? 720 : 360, ...(camId ? { deviceId: { exact: camId } } : {}) } })
      .then((s) => { if (!alive) { s.getTracks().forEach((t) => t.stop()); return; } stream = s; if (ref.current) ref.current.srcObject = s; })
      .catch((e) => setErr(e.name === 'NotAllowedError' ? 'Permiso de cámara denegado' : 'No hay cámara disponible'));
    return () => { alive = false; stream?.getTracks().forEach((t) => t.stop()); };
  }, [camId, hd]);
  return <div className="cam-preview">{err ? <span className="muted">{err}</span> : <video ref={ref} autoPlay playsInline muted className="mirror" />}</div>;
}

function VideoPrefs() {
  const [v, set] = usePref('video');
  const [dev, setDev] = usePref('devices');
  const devices = useDevices();
  const [preview, setPreview] = useState(false);
  return (
    <Section>
      <Row title="Cámara">
        <Select value={dev.camId} onChange={(val) => { setDev('camId', val); office.media?.restartTracks(); }} options={devOpts(devices.cams, 'Predeterminada')} />
      </Row>
      <Row title="Usar video HD" desc="Mejor calidad cuando esté disponible. Puede afectar el rendimiento.">
        <Toggle checked={v.hd} onChange={(val) => { set('hd', val); office.media?.restartTracks(); }} />
      </Row>
      <Row title="Ocultar mi propio video" desc="No te ves en pantalla, pero los demás sí te ven">
        <Toggle checked={v.hideSelf} onChange={(val) => set('hideSelf', val)} />
      </Row>
      <div className="pref-row">
        {preview ? <CamPreview camId={dev.camId} hd={v.hd} /> : <button className="btn" onClick={() => setPreview(true)}>Probar cámara</button>}
      </div>
    </Section>
  );
}

function Meetings() {
  const [m, set] = usePref('meetings');
  const [v, setV] = usePref('video');
  return (
    <Section title="Vista de reunión">
      <Row title="Máximo de personas en pantalla" desc="Más personas puede afectar el rendimiento">
        <Select value={String(m.maxTiles)} onChange={(val) => set('maxTiles', Number(val))} options={[4, 6, 9, 12, 16].map((n) => ({ value: String(n), label: `${n} personas` }))} />
      </Row>
      <Row title="Ocultar mi propio video" desc="Sigues visible para los demás">
        <Toggle checked={v.hideSelf} onChange={(val) => setV('hideSelf', val)} />
      </Row>
    </Section>
  );
}

function Notifications() {
  const [n, set] = usePref('notifications');
  const askDesktop = async (v) => {
    if (v && 'Notification' in window && Notification.permission !== 'granted') {
      const r = await Notification.requestPermission();
      if (r !== 'granted') return office.toast({ title: 'El navegador bloqueó las notificaciones', kind: 'error' });
    }
    set('desktop', v);
  };
  return (
    <>
      <Section title="Eventos del calendario">
        <Row title="Recordatorio 5 minutos antes"><Toggle checked={n.remind5} onChange={(v) => set('remind5', v)} /></Row>
        <Row title="Recordatorio al empezar"><Toggle checked={n.remindStart} onChange={(v) => set('remindStart', v)} /></Row>
        <Row title="Sonido en los recordatorios"><Toggle checked={n.remindSound} onChange={(v) => set('remindSound', v)} /></Row>
      </Section>
      <Section title="Chat">
        <div className="pref-title">Notificarme de…</div>
        <div className="radios">
          <Radio name="chat" value="all" current={n.chat} onChange={(v) => set('chat', v)} label="Todos los mensajes nuevos" />
          <Radio name="chat" value="dms" current={n.chat} onChange={(v) => set('chat', v)} label="Mensajes directos y @menciones" />
          <Radio name="chat" value="none" current={n.chat} onChange={(v) => set('chat', v)} label="Nada" />
        </div>
        <div className="pref-title">Reproducir sonido para…</div>
        <div className="radios">
          <Radio name="snd" value="all" current={n.chatSound} onChange={(v) => set('chatSound', v)} label="Todos los mensajes nuevos" />
          <Radio name="snd" value="dms" current={n.chatSound} onChange={(v) => set('chatSound', v)} label="Mensajes directos y @menciones" />
          <Radio name="snd" value="never" current={n.chatSound} onChange={(v) => set('chatSound', v)} label="Nunca" />
        </div>
        <Row title="Notificaciones de escritorio" desc="Avisos del sistema cuando la pestaña no está visible">
          <Toggle checked={n.desktop} onChange={askDesktop} />
        </Row>
      </Section>
    </>
  );
}

function Privacy() {
  const me = useOffice((s) => s.users[s.me.id]);
  const [text, setText] = useState(me?.statusText || '');
  const save = () => api.patch('/me', { statusText: text }).then(() => office.toast({ title: 'Estado actualizado' })).catch((e) => office.toast({ title: e.message, kind: 'error' }));
  return (
    <Section>
      <Row title="Estado personalizado" desc="Se muestra junto a tu nombre en la lista de personas (por ejemplo: 🎧 En foco, 🍔 Comiendo)">
        <div className="row gap8">
          <input value={text} onChange={(e) => setText(e.target.value)} maxLength={80} placeholder="¿Qué estás haciendo?" />
          <button className="btn" onClick={save}>Guardar</button>
        </div>
      </Row>
      <p className="muted small">
        Por privacidad, el navegador no permite saber qué aplicación tienes abierta, así que solo se comparte el estado que tú escribas.
        Tu ubicación en el mapa solo es visible para miembros de la oficina.
      </p>
    </Section>
  );
}

function Performance() {
  const [p, set] = usePref('performance');
  return (
    <Section title="Modo de rendimiento">
      <div className="radios">
        <Radio name="perf" value="quality" current={p.mode} onChange={(v) => set('mode', v)} label="Calidad" desc="Máximo detalle y animaciones suaves para equipos potentes" />
        <Radio name="perf" value="balanced" current={p.mode} onChange={(v) => set('mode', v)} label="Equilibrado" desc="Buena mezcla de calidad y rendimiento para la mayoría de equipos" />
        <Radio name="perf" value="efficient" current={p.mode} onChange={(v) => set('mode', v)} label="Eficiente" desc="Menos consumo de batería, ideal para equipos modestos" />
      </div>
    </Section>
  );
}

function Account() {
  const [form, setForm] = useState({ current: '', password: '', confirm: '' });
  const [msg, setMsg] = useState(null);
  const submit = async (e) => {
    e.preventDefault();
    if (form.password !== form.confirm) return setMsg({ error: 'Las contraseñas no coinciden' });
    try {
      await api.post('/me/password', { current: form.current, password: form.password });
      setMsg({ ok: 'Contraseña actualizada. Se cerraron tus otras sesiones.' });
      setForm({ current: '', password: '', confirm: '' });
    } catch (err) {
      setMsg({ error: err.message });
    }
  };
  return (
    <>
      <Section title="Cambiar contraseña">
        <form className="form narrow" onSubmit={submit}>
          <input type="password" placeholder="Contraseña actual" value={form.current} onChange={(e) => setForm({ ...form, current: e.target.value })} autoComplete="current-password" required />
          <input type="password" placeholder="Nueva contraseña (mín. 8)" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} autoComplete="new-password" minLength={8} required />
          <input type="password" placeholder="Confirmar nueva contraseña" value={form.confirm} onChange={(e) => setForm({ ...form, confirm: e.target.value })} autoComplete="new-password" required />
          {msg?.error && <div className="form-error">{msg.error}</div>}
          {msg?.ok && <div className="form-ok">{msg.ok}</div>}
          <button className="btn primary">Actualizar contraseña</button>
        </form>
      </Section>
      <Section title="Sesión">
        <button className="btn danger-text" onClick={() => window.dispatchEvent(new Event('office:logout'))}>Cerrar sesión</button>
      </Section>
    </>
  );
}

// ---------- Miembros e invitaciones ----------
function CopyBtn({ text }) {
  const [ok, setOk] = useState(false);
  return (
    <button className="btn tiny" onClick={async () => { await navigator.clipboard.writeText(text).catch(() => {}); setOk(true); setTimeout(() => setOk(false), 1500); }}>
      {ok ? <Check size={13} /> : <Copy size={13} />} {ok ? 'Copiado' : 'Copiar enlace'}
    </button>
  );
}

function Members({ initialTab }) {
  const me = useOffice((s) => s.me);
  const users = useOffice((s) => s.users);
  const isAdmin = me.role === 'admin';
  const [tab, setTab] = useState(isAdmin && initialTab === 'invites' ? 'invites' : 'list');
  const [invites, setInvites] = useState([]);
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState('all');
  const [sort, setSort] = useState({ key: 'name', dir: 1 });

  const loadInvites = () => isAdmin && api.get('/admin/invites').then((r) => setInvites(r.invites)).catch(() => {});
  useEffect(() => { loadInvites(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const pending = invites.filter((i) => i.status === 'pending');
  const list = Object.values(users)
    .filter((u) => (filter === 'all' ? !u.disabled : filter === 'admin' ? u.role === 'admin' && !u.disabled : filter === 'disabled' ? u.disabled : u.role === 'member' && !u.disabled))
    .filter((u) => !q || `${u.displayName} ${u.email} ${u.username}`.toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => {
      const v = sort.key === 'name' ? a.displayName.localeCompare(b.displayName, 'es') : sort.key === 'role' ? a.role.localeCompare(b.role) : (b.lastActive || 0) - (a.lastActive || 0);
      return v * sort.dir;
    });

  const patchUser = (u, body) => api.patch(`/admin/users/${u.id}`, body).catch((e) => office.toast({ title: e.message, kind: 'error' }));
  const resetPw = async (u) => {
    if (!confirm(`¿Generar una contraseña nueva para ${u.displayName}? Se cerrarán sus sesiones.`)) return;
    try {
      const { password } = await api.post(`/admin/users/${u.id}/reset-password`);
      prompt(`Nueva contraseña de ${u.displayName} (cópiala y compártela de forma segura):`, password);
    } catch (e) {
      office.toast({ title: e.message, kind: 'error' });
    }
  };
  const th = (key, label) => (
    <button className="th-btn" onClick={() => setSort({ key, dir: sort.key === key ? -sort.dir : 1 })}>{label} {sort.key === key ? (sort.dir > 0 ? '▲' : '▼') : ''}</button>
  );

  return (
    <>
      <div className="seg">
        <button className={tab === 'list' ? 'on' : ''} onClick={() => setTab('list')}>Miembros ({Object.values(users).filter((u) => !u.disabled).length})</button>
        {isAdmin && <button className={tab === 'invites' ? 'on' : ''} onClick={() => setTab('invites')}>Invitaciones ({pending.length})</button>}
      </div>

      {tab === 'list' ? (
        <>
          <div className="row between gap8 mt12">
            <Select value={filter} onChange={setFilter} options={[{ value: 'all', label: 'Ver todos' }, { value: 'admin', label: 'Administradores' }, { value: 'member', label: 'Miembros' }, ...(isAdmin ? [{ value: 'disabled', label: 'Desactivados' }] : [])]} />
            <input className="search-input" placeholder="Buscar" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <div className="table">
            <div className="tr th">
              <div>{th('name', 'Nombre')}</div>
              <div>{th('role', 'Rol')}</div>
              <div>{th('last', 'Última actividad')}</div>
              {isAdmin && <div />}
            </div>
            {list.map((u) => (
              <div key={u.id} className="tr">
                <div className="row gap8 ellipsis">
                  <Avatar user={u} size={34} />
                  <div className="ellipsis">
                    <div>{u.displayName}{u.id === me.id && ' (tú)'}</div>
                    <div className="muted small ellipsis">{u.email || `@${u.username}`}</div>
                  </div>
                </div>
                <div>
                  {isAdmin && u.id !== me.id ? (
                    <Select className="small" value={u.role} onChange={(v) => patchUser(u, { role: v })} options={[{ value: 'member', label: 'Miembro' }, { value: 'admin', label: 'Admin' }]} />
                  ) : <span className={`role ${u.role}`}>{u.role === 'admin' ? 'Admin' : 'Miembro'}</span>}
                </div>
                <div className="small">{u.online ? 'Ahora' : u.lastActive ? fmtDate(u.lastActive) : '—'}</div>
                {isAdmin && (
                  <div className="row gap4">
                    {u.id !== me.id && (
                      <>
                        <button className="icon-btn" title="Restablecer contraseña" onClick={() => resetPw(u)}><RotateCcw size={14} /></button>
                        <button className="icon-btn danger" title={u.disabled ? 'Reactivar' : 'Desactivar acceso'} onClick={() => (u.disabled || confirm(`¿Quitar el acceso a ${u.displayName}?`)) && patchUser(u, { disabled: !u.disabled })}>
                          {u.disabled ? <Check size={14} /> : <Ban size={14} />}
                        </button>
                      </>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </>
      ) : (
        <Invites invites={invites} reload={loadInvites} />
      )}
    </>
  );
}

function Invites({ invites, reload }) {
  const [form, setForm] = useState({ email: '', role: 'member', days: 7, note: '' });
  const [created, setCreated] = useState(null);
  const link = (t) => `${window.location.origin}/invite/${t}`;
  const create = async (e) => {
    e.preventDefault();
    try {
      const { invite } = await api.post('/admin/invites', form);
      setCreated(invite);
      setForm({ email: '', role: 'member', days: 7, note: '' });
      reload();
    } catch (err) {
      office.toast({ title: err.message, kind: 'error' });
    }
  };
  const revoke = async (t) => {
    await api.del(`/admin/invites/${t}`).catch(() => {});
    reload();
  };
  const STATUS_LABEL = { pending: 'Pendiente', used: 'Usada', expired: 'Expirada', revoked: 'Revocada' };

  return (
    <>
      <form className="invite-form" onSubmit={create}>
        <div className="pref-title"><Mail size={15} /> Nueva invitación</div>
        <p className="muted small">Solo quien tenga el enlace podrá crear una cuenta. Cada enlace sirve una sola vez.</p>
        <div className="row gap8 wrap">
          <input type="email" placeholder="Correo (opcional)" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="flex1" />
          <Select value={form.role} onChange={(v) => setForm({ ...form, role: v })} options={[{ value: 'member', label: 'Miembro' }, { value: 'admin', label: 'Admin' }]} />
          <Select value={String(form.days)} onChange={(v) => setForm({ ...form, days: Number(v) })} options={[1, 3, 7, 14, 30].map((d) => ({ value: String(d), label: `Expira en ${d} día${d > 1 ? 's' : ''}` }))} />
        </div>
        <input placeholder="Nota interna (ej. nombre de la persona)" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} maxLength={120} />
        <button className="btn primary">Crear enlace de invitación</button>
      </form>
      {created && (
        <div className="invite-created">
          <div className="small">Comparte este enlace con la persona invitada:</div>
          <div className="row gap8"><code className="flex1 ellipsis">{link(created.token)}</code><CopyBtn text={link(created.token)} /></div>
        </div>
      )}
      <div className="table">
        {!invites.length && <Empty title="Aún no hay invitaciones" />}
        {invites.map((i) => (
          <div key={i.token} className="tr inv">
            <div className="ellipsis">
              <div>{i.email || i.note || 'Invitación sin correo'}</div>
              <div className="muted small">{i.role === 'admin' ? 'Admin' : 'Miembro'} · creada {fmtDate(i.createdAt)} · expira {fmtDate(i.expiresAt)}</div>
            </div>
            <span className={`pill ${i.status}`}>{STATUS_LABEL[i.status]}</span>
            <div className="row gap4">
              {i.status === 'pending' && <CopyBtn text={link(i.token)} />}
              {i.status === 'pending' && <button className="icon-btn danger" title="Revocar" onClick={() => revoke(i.token)}><Ban size={14} /></button>}
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

function OfficeAdmin() {
  const floors = useOffice((s) => s.floors);
  return (
    <Section>
      <p>
        La oficina crece con el equipo: puedes <b>crear departamentos</b> (áreas) dibujándolos en el mapa,
        <b> mover cualquier mueble</b>, agregar escritorios y <b>crear pisos nuevos</b>.
      </p>
      <ul className="bullets">
        <li><b>Áreas privadas</b> (salas, departamentos cerrados): todos los que estén dentro hablan entre sí.</li>
        <li><b>Escritorios</b>: cada persona reclama uno, lo decora, y quien llegue a su escritorio habla con ella.</li>
        <li><b>Pasillos y zonas abiertas</b>: hablas con quien esté a 3 casillas o menos.</li>
      </ul>
      <p className="muted">Pisos actuales: {floors.map((f) => f.name).join(', ')}</p>
      <button className="btn primary" onClick={() => office.set({ modal: null, view: 'map', editMode: 'build' })}>Abrir editor de oficina</button>
    </Section>
  );
}

// ---------- Personajes (hojas de sprites) ----------
function readAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}

function CharactersAdmin() {
  const characters = useOffice((s) => s.characters);
  const [name, setName] = useState('');
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef(null);

  const upload = async (e) => {
    e.preventDefault();
    if (!file) return;
    setBusy(true);
    try {
      await api.post('/characters', { name, dataUrl: await readAsDataUrl(file) });
      setName('');
      setFile(null);
      fileRef.current.value = '';
      office.toast({ title: 'Personaje agregado. Ya aparece en el editor de avatar.' });
    } catch (err) {
      office.toast({ title: err.message, kind: 'error' });
    }
    setBusy(false);
  };

  const remove = async (c) => {
    if (!confirm(`¿Borrar "${c.name}"? Quien lo use volverá a su avatar personalizado.`)) return;
    await api.del(`/characters/${c.id}`).catch((err) => office.toast({ title: err.message, kind: 'error' }));
  };

  return (
    <>
      <Section title="Formato">
        <p className="muted">
          Cada personaje es una imagen PNG de <b>96×192 px</b> con fondo transparente: <b>3 columnas</b> (quieto, paso A, paso B)
          × <b>4 filas</b> (abajo, izquierda, derecha, arriba). Cada cuadro mide 32×48 px y los pies van en la fila 46.
          Puedes dibujarlos en Aseprite, Piskel o LibreSprite usando la plantilla.
        </p>
        <div className="row gap8 wrap">
          <a className="btn" href="/characters/plantilla.png" download><Download size={15} /> Plantilla (96×192)</a>
          <a className="btn" href="/characters/plantilla-4x.png" download><Download size={15} /> Plantilla ampliada (4×)</a>
        </div>
      </Section>
      <Section title="Subir personaje">
        <form className="form narrow" onSubmit={upload}>
          <input placeholder="Nombre (ej. Mascota GTAHUB)" value={name} onChange={(e) => setName(e.target.value)} maxLength={40} required />
          <input ref={fileRef} type="file" accept="image/png" onChange={(e) => setFile(e.target.files?.[0] || null)} required />
          <button className="btn primary" disabled={busy || !file}><Upload size={15} /> {busy ? 'Subiendo…' : 'Subir'}</button>
        </form>
      </Section>
      <Section title={`Personajes subidos (${characters.length})`}>
        {!characters.length && <Empty title="Aún no hay personajes subidos">Los 10 personajes prediseñados siempre están disponibles.</Empty>}
        <div className="char-admin">
          {characters.map((c) => (
            <div key={c.id} className="char-card">
              <AvatarCanvas avatar={{ sprite: c.id }} width={48} height={72} />
              <span>{c.name}</span>
              <button className="icon-btn danger" title="Borrar" onClick={() => remove(c)}><Ban size={14} /></button>
            </div>
          ))}
        </div>
      </Section>
    </>
  );
}
