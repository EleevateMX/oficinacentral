import { SCREEN_PRESETS } from '../../lib/media.js';
import { FeedbackAdmin } from '../Feedback.jsx';
import React, { useEffect, useRef, useState } from 'react';
import {
  X, Palette, Smile, Upload, Download, Settings, Calendar, Mic, Video, Users, Bell, Shield, Zap, KeyRound, UserCog, Mail, Building2, Copy, Check, Ban, RotateCcw, Volume2, Music, MessageSquareHeart,
} from 'lucide-react';
import { office, useOffice } from '../../lib/store.js';
import { api } from '../../lib/api.js';
import DiscordButton from '../DiscordButton.jsx';
import { listDevices } from '../../lib/media.js';
import { aiNoiseSupported } from '../../lib/noise.js';
import { recordingSupported, clipMime } from '../../lib/recorder.js';
import { playSound } from '../../lib/sounds.js';
import { Toggle, Select, Row, Radio, Avatar, Empty, AvatarCanvas } from '../ui.jsx';
import { fmtDate } from '../../lib/time.js';
import { THEMES } from '../../lib/themes.js';
import { OfficeMark, ByNuvora } from '../brand.jsx';
import { InstallAppSection, PushDeviceRow } from './PushPrefs.jsx';

const SECTIONS = [
  { group: 'Preferencias' },
  { id: 'general', label: 'General', icon: Settings },
  { id: 'calendar', label: 'Calendario', icon: Calendar },
  { id: 'audio', label: 'Audio', icon: Mic },
  { id: 'video', label: 'Pantalla y video', icon: Video },
  { id: 'meetings', label: 'Reuniones', icon: Users },
  { id: 'notifications', label: 'Notificaciones', icon: Bell },
  { id: 'privacy', label: 'Privacidad y actividad', icon: Shield },
  { id: 'ambience', label: 'Ambiente', icon: Music },
  { id: 'performance', label: 'Rendimiento', icon: Zap },
  { id: 'account', label: 'Cuenta', icon: KeyRound },
  { group: 'Oficina' },
  { id: 'brand', label: 'Marca de la oficina', icon: Palette, admin: true },
  { id: 'members', label: 'Miembros', icon: UserCog },
  { id: 'office', label: 'Pisos y áreas', icon: Building2, admin: true },
  { id: 'characters', label: 'Personajes', icon: Smile, admin: true },
  { id: 'security', label: 'Seguridad', icon: Shield, admin: true },
  { id: 'feedback', label: 'Comentarios', icon: MessageSquareHeart, admin: true },
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
            {cur === 'ambience' && <AmbiencePrefs />}
            {cur === 'account' && <Account />}
            {cur === 'members' && <Members initialTab={modal?.tab} />}
            {cur === 'office' && <OfficeAdmin />}
            {cur === 'characters' && <CharactersAdmin />}
            {cur === 'brand' && <BrandAdmin />}
            {cur === 'security' && <SecurityAdmin />}
            {cur === 'feedback' && <FeedbackAdmin api={api} />}
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
      <InstallAppSection />
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
        <Row
          title="Supresión de ruido con IA"
          desc={aiNoiseSupported()
            ? 'Quita teclado, ventilador y ruido de fondo con RNNoise antes de enviar tu voz. Usa un poco de CPU.'
            : 'Tu navegador no lo permite; se usa el filtro normal.'}
        >
          <Toggle checked={a.aiNoise === 'rnnoise' && aiNoiseSupported()} disabled={!aiNoiseSupported()} onChange={after((v) => set('aiNoise', v ? 'rnnoise' : 'off'))} />
        </Row>
        <Row title="Reducir ruido de fondo (navegador)" desc={a.aiNoise === 'rnnoise' && aiNoiseSupported() ? 'No hace falta con la supresión con IA encendida' : 'Filtro básico del navegador para que tu voz se escuche más clara'}>
          <Toggle checked={a.noiseSuppression} disabled={a.aiNoise === 'rnnoise' && aiNoiseSupported()} onChange={after((v) => set('noiseSuppression', v))} />
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

function ScreenPrefs() {
  const [sc, set] = usePref('screen');
  return (
    <Section title="Pantalla compartida">
      <div className="pref-title">Calidad al transmitir tu pantalla</div>
      <div className="radios">
        {Object.entries(SCREEN_PRESETS).map(([k, p]) => (
          <Radio key={k} name="sq" value={k} current={sc.quality} onChange={(v) => set('quality', v)} label={p.label} desc={p.desc} />
        ))}
      </div>
      <Row title="Compartir el audio de la PC" desc="Música, juegos o videos que suenan en tu equipo. En Chrome o Edge marca “Compartir audio” al elegir qué compartir.">
        <Toggle checked={sc.audio} onChange={(v) => set('audio', v)} />
      </Row>
      <Row title="Ver automáticamente las transmisiones" desc="Si está apagado, aparece un aviso con el botón Ver (ahorra internet cuando varias personas transmiten)">
        <Toggle checked={sc.autoOpen} onChange={(v) => set('autoOpen', v)} />
      </Row>
      <Row title="Volumen de las pantallas de otros">
        <input type="range" min="0" max="1" step="0.05" value={sc.volume} onChange={(e) => set('volume', Number(e.target.value))} />
      </Row>
      {recordingSupported() && (
        <>
          <Row title="Clips de 30 segundos" desc={clipMime() ? 'Guarda en memoria los últimos 30 s de las pantallas que ves para el botón Clip. Apágalo si tu equipo va lento.' : 'Tu navegador no permite clips; sí puedes grabar.'}>
            <Toggle checked={sc.clips !== false && !!clipMime()} disabled={!clipMime()} onChange={(v) => set('clips', v)} />
          </Row>
          <Row title="Grabar junta: incluir las voces de la sala" desc="Al grabar una pantalla también se graban tu micrófono y las voces de quienes están contigo. Todos verán el aviso ● REC.">
            <Toggle checked={sc.recordRoom !== false} onChange={(v) => set('recordRoom', v)} />
          </Row>
        </>
      )}
      <div className="muted small">Los cambios de calidad se aplican la próxima vez que compartas.</div>
    </Section>
  );
}

function VideoPrefs() {
  const [v, set] = usePref('video');
  const [dev, setDev] = usePref('devices');
  const devices = useDevices();
  const [preview, setPreview] = useState(false);
  return (
    <>
    <ScreenPrefs />
    <Section title="Cámara">
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
    </>
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
      <Section title="Este dispositivo">
        <PushDeviceRow />
      </Section>
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

function AmbiencePrefs() {
  const [a, set] = usePref('ambience');
  return (
    <Section title="Ambiente de la oficina">
      <Row title="Luz según la hora" desc="Amanecer, atardecer y noche con lámparas encendidas, según tu hora local. Apagada, el mapa siempre se ve claro.">
        <Toggle checked={a.dayNight} onChange={(v) => set('dayNight', v)} />
      </Row>
      <Row title="Música suave" desc="Suena solo en el lounge, la cocina, la zona de descanso, la sala de juegos y el jardín">
        <Toggle checked={a.music} onChange={(v) => set('music', v)} />
      </Row>
      {a.music && (
        <Row title="Volumen de la música">
          <input type="range" min="0.05" max="1" step="0.05" value={a.musicVolume} onChange={(e) => set('musicVolume', Number(e.target.value))} />
        </Row>
      )}
      <Row title="Sonido de pasos" desc="Al caminar por la oficina">
        <Toggle checked={a.steps} onChange={(v) => set('steps', v)} />
      </Row>
      {a.steps && (
        <Row title="Volumen de los pasos">
          <input type="range" min="0.05" max="1" step="0.05" value={a.stepsVolume ?? 0.5} onChange={(e) => set('stepsVolume', Number(e.target.value))} />
        </Row>
      )}
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
      <TwoFactor />
      <DiscordLink />
      <Section title="Sesión">
        <button className="btn danger-text" onClick={() => window.dispatchEvent(new Event('office:logout'))}>Cerrar sesión</button>
      </Section>
    </>
  );
}

// Vincular Discord para entrar con un clic
function DiscordLink() {
  const config = useOffice((s) => s.config);
  const me = useOffice((s) => s.users[s.me.id] || s.me);
  if (!config.discordLogin) return null;
  return (
    <Section title="Discord">
      {me.discordName ? (
        <Row title={`Vinculado con @${me.discordName}`} desc="Puedes entrar con el botón “Entrar con Discord”.">
          <button className="btn danger-text" onClick={() => api.post('/me/discord/unlink').catch((e) => office.toast({ title: e.message, kind: 'error' }))}>Desvincular</button>
        </Row>
      ) : (
        <Row title="Vincular tu cuenta de Discord" desc="Para entrar con un clic, sin escribir tu contraseña.">
          <DiscordButton mode="link" className="btn discord-btn">Vincular Discord</DiscordButton>
        </Row>
      )}
    </Section>
  );
}

// Reporte de turnos (admin): horas por persona y turno
function ShiftReport() {
  const [range, setRange] = useState('week');
  const [data, setData] = useState(null);
  const bounds = () => {
    const d = new Date(); d.setHours(0, 0, 0, 0);
    const day = (d.getDay() + 6) % 7; // lunes = 0
    const monday = new Date(d); monday.setDate(d.getDate() - day);
    if (range === 'week') return [monday.getTime(), Date.now()];
    if (range === 'lastweek') { const a = new Date(monday); a.setDate(a.getDate() - 7); return [a.getTime(), monday.getTime()]; }
    if (range === 'month') return [new Date(d.getFullYear(), d.getMonth(), 1).getTime(), Date.now()];
    return [new Date(d.getFullYear(), d.getMonth() - 1, 1).getTime(), new Date(d.getFullYear(), d.getMonth(), 1).getTime()];
  };
  useEffect(() => {
    const [from, to] = bounds();
    api.get(`/admin/shifts/report?from=${from}&to=${to}`).then(setData).catch((e) => office.toast({ title: e.message, kind: 'error' }));
  }, [range]); // eslint-disable-line react-hooks/exhaustive-deps
  const hrs = (m) => `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')} min`;
  const byPerson = new Map();
  for (const r of data?.rows || []) byPerson.set(r.userId, (byPerson.get(r.userId) || 0) + r.minutes);
  const csv = () => {
    const rows = [['persona', 'turno', 'horas', 'minutos', 'veces', 'dias'], ...data.rows.map((r) => [r.name, r.shift, (r.minutes / 60).toFixed(2), r.minutes, r.sessions, r.days])];
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob(['\ufeff' + rows.map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n')], { type: 'text/csv' }));
    a.download = `turnos-${new Date(data.from).toISOString().slice(0, 10)}.csv`;
    a.click();
  };
  return (
    <Section title="Reporte de turnos">
      <div className="row between gap8 wrap">
        <Select value={range} onChange={setRange} options={[{ value: 'week', label: 'Esta semana' }, { value: 'lastweek', label: 'Semana pasada' }, { value: 'month', label: 'Este mes' }, { value: 'lastmonth', label: 'Mes pasado' }]} />
        <button className="btn" disabled={!data?.rows.length} onClick={csv}><Download size={15} /> CSV</button>
      </div>
      <div className="table mt12">
        <div className="tr th shift-tr"><div>Persona</div><div>Turno</div><div>Tiempo</div><div>Veces · días</div></div>
        {data?.rows.map((r) => (
          <div key={`${r.userId}-${r.shift}`} className="tr shift-tr">
            <div className="ellipsis"><b>{r.name}</b> <span className="muted small">total {hrs(byPerson.get(r.userId))}</span></div>
            <div>{r.shift}</div>
            <div>{hrs(r.minutes)}</div>
            <div className="muted">{r.sessions} · {r.days}</div>
          </div>
        ))}
        {data && !data.rows.length && <div className="muted pad">Nadie estuvo en turno en este periodo.</div>}
      </div>
      <p className="muted small">Cuenta el tiempo marcado "En turno" mientras la persona estuvo conectada.</p>
    </Section>
  );
}

// Verificación en dos pasos con una app (Google Authenticator, Authy, 1Password…)
function TwoFactor() {
  const me = useOffice((s) => s.users[s.me.id] || s.me);
  const config = useOffice((s) => s.config);
  const [setup, setSetup] = useState(null); // { secret, qr }
  const [code, setCode] = useState('');
  const [codes, setCodes] = useState(null);
  const [pw, setPw] = useState('');
  const [msg, setMsg] = useState(null);
  const on = me.twoFactor;

  const start = async () => {
    setMsg(null);
    try {
      const r = await api.post('/me/2fa/setup');
      const QR = (await import('qrcode')).default;
      setSetup({ secret: r.secret, qr: await QR.toDataURL(r.otpauth, { margin: 1, width: 220 }) });
    } catch (e) { setMsg({ error: e.message }); }
  };
  const enable = async (e) => {
    e.preventDefault();
    try {
      const r = await api.post('/me/2fa/enable', { code });
      setCodes(r.recoveryCodes); setSetup(null); setCode(''); setMsg(null);
    } catch (err) { setMsg({ error: err.message }); }
  };
  const disable = async (e) => {
    e.preventDefault();
    try { await api.post('/me/2fa/disable', { password: pw }); setPw(''); setMsg({ ok: 'Verificación en dos pasos desactivada' }); } catch (err) { setMsg({ error: err.message }); }
  };
  const regen = async () => {
    const password = prompt('Escribe tu contraseña para generar códigos nuevos (los anteriores dejarán de servir):');
    if (!password) return;
    try { setCodes((await api.post('/me/2fa/recovery', { password })).recoveryCodes); } catch (err) { setMsg({ error: err.message }); }
  };
  const download = () => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([`Códigos de respaldo de ${config.officeName} (${me.username})\nCada código sirve una sola vez.\n\n${codes.join('\n')}\n`], { type: 'text/plain' }));
    a.download = 'codigos-de-respaldo.txt';
    a.click();
  };

  return (
    <Section title="Verificación en dos pasos">
      <p className="muted small">
        Además de tu contraseña, al entrar se pide un código de 6 dígitos de una app en tu teléfono
        (Google Authenticator, Microsoft Authenticator, Authy o 1Password).
        {config.requireAdmin2fa && me.role === 'admin' && <b> Esta oficina la exige a los administradores.</b>}
      </p>
      {codes ? (
        <div className="recovery">
          <b>Guarda estos códigos de respaldo.</b> Sirven para entrar si pierdes tu teléfono; cada uno se usa una vez y no se volverán a mostrar.
          <div className="recovery-grid">{codes.map((c) => <code key={c}>{c}</code>)}</div>
          <div className="row gap8">
            <button className="btn" onClick={download}><Download size={15} /> Descargar</button>
            <CopyBtn text={codes.join('\n')} label="Copiar" />
            <button className="btn primary" onClick={() => setCodes(null)}>Ya los guardé</button>
          </div>
        </div>
      ) : on ? (
        <>
          <div className="form-ok">✓ Activada</div>
          <div className="row gap8 wrap">
            <button className="btn" onClick={regen}>Generar códigos de respaldo nuevos</button>
          </div>
          <form className="row gap8 wrap" onSubmit={disable}>
            <input type="password" placeholder="Tu contraseña" value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="current-password" required />
            <button className="btn danger-text">Desactivar</button>
          </form>
        </>
      ) : setup ? (
        <form className="twofa-setup" onSubmit={enable}>
          <img src={setup.qr} alt="Código QR para tu app de autenticación" width={180} height={180} />
          <div className="form">
            <div className="small">1. Abre tu app de autenticación y escanea el código.</div>
            <div className="small muted">¿No puedes escanear? Escribe esta clave: <code className="secret">{setup.secret.match(/.{1,4}/g).join(' ')}</code></div>
            <div className="small">2. Escribe el código de 6 dígitos que aparece:</div>
            <input className="code-input" value={code} onChange={(e) => setCode(e.target.value)} inputMode="numeric" autoComplete="one-time-code" maxLength={6} placeholder="000000" autoFocus required />
            <div className="row gap8">
              <button className="btn primary">Activar</button>
              <button className="btn" type="button" onClick={() => setSetup(null)}>Cancelar</button>
            </div>
          </div>
        </form>
      ) : (
        <button className="btn primary" onClick={start}><Shield size={15} /> Activar verificación en dos pasos</button>
      )}
      {msg?.error && <div className="form-error">{msg.error}</div>}
      {msg?.ok && <div className="form-ok">{msg.ok}</div>}
    </Section>
  );
}

function BackupStatus() {
  const [st, setSt] = useState(null);
  useEffect(() => { api.get('/admin/backups/status').then(setSt).catch(() => setSt(null)); }, []);
  if (!st) return null;
  const when = (iso) => (iso ? new Date(iso).toLocaleString('es-MX', { dateStyle: 'medium', timeStyle: 'short' }) : '—');
  const mb = (b) => (b ? `${(b / 1048576).toFixed(1)} MB` : '');
  const off = st.offsite || {};
  return (
    <Section title="Respaldos">
      <Row title="Último respaldo diario" desc={st.lastBackupAt ? `${when(st.lastBackupAt)} · ${mb(st.size)} · ${st.localCount} guardados en el servidor` : 'Aún no se ha hecho ninguno'}>
        <span className={`pill ${st.ok === false ? 'expired' : st.ok ? 'used' : 'pending'}`}>{st.ok === false ? 'Falló' : st.ok ? 'Correcto' : 'Pendiente'}</span>
      </Row>
      <Row title="Copia fuera del servidor" desc={!off.enabled ? 'Desactivada: configura BACKUP_S3_* (Cloudflare R2, S3…) para no depender de un solo disco.' : off.status === 'error' ? `Error: ${off.error}` : `${off.bucket}/${off.prefix} · ${when(off.uploadedAt)}${off.uploads ? ` · ${off.uploads.remote} archivos del chat` : ''}`}>
        <span className={`pill ${!off.enabled ? 'revoked' : off.status === 'ok' ? 'used' : off.status === 'error' ? 'expired' : 'pending'}`}>{!off.enabled ? 'Sin configurar' : off.status === 'ok' ? 'Al día' : off.status === 'error' ? 'Error' : 'Pendiente'}</span>
      </Row>
    </Section>
  );
}

// ---------- Seguridad (admin): exigir 2FA y registro de actividad ----------
function SecurityAdmin() {
  const config = useOffice((s) => s.config);
  const me = useOffice((s) => s.users[s.me.id] || s.me);
  const [entries, setEntries] = useState([]);
  const [q, setQ] = useState('');
  const [more, setMore] = useState(true);
  const load = async (before = null, reset = false) => {
    try {
      const { entries: list } = await api.get(`/admin/audit?limit=100&q=${encodeURIComponent(q)}${before ? `&before=${before}` : ''}`);
      setEntries((prev) => (reset ? list : [...prev, ...list]));
      setMore(list.length === 100);
    } catch (e) { office.toast({ title: e.message, kind: 'error' }); }
  };
  useEffect(() => { const t = setTimeout(() => load(null, true), 250); return () => clearTimeout(t); }, [q]); // eslint-disable-line react-hooks/exhaustive-deps
  const csv = () => {
    const rows = [['fecha', 'quien', 'accion', 'ruta', 'ip'], ...entries.map((e) => [new Date(e.createdAt).toISOString(), e.actorName || '', e.action, e.target || '', e.ip || ''])];
    const body = rows.map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob(['\ufeff' + body], { type: 'text/csv' }));
    a.download = 'registro-de-actividad.csv';
    a.click();
  };
  const toggle = (v) => api.patch('/admin/office', { requireAdmin2fa: v }).catch((e) => office.toast({ title: e.message, kind: 'error' }));
  return (
    <>
      <Section title="Verificación en dos pasos">
        <Row title="Exigirla a los administradores" desc={me.twoFactor ? 'Un admin sin ella no podrá usar las funciones de administración hasta activarla.' : 'Primero actívala para ti en Cuenta.'}>
          <Toggle checked={!!config.requireAdmin2fa} disabled={!me.twoFactor} onChange={toggle} />
        </Row>
      </Section>
      <BackupStatus />
      <Section title="Registro de actividad">
        <p className="muted small">Quién invitó, cambió permisos, borró o configuró algo, y los inicios de sesión de admins y los fallidos.</p>
        <div className="row gap8">
          <input className="search-input flex1" placeholder="Buscar por persona o acción" value={q} onChange={(e) => setQ(e.target.value)} />
          <button className="btn" onClick={csv} disabled={!entries.length}><Download size={15} /> CSV</button>
        </div>
        <div className="audit-list">
          {entries.map((e) => (
            <div key={e.id} className="audit-row">
              <span className="audit-when">{new Date(e.createdAt).toLocaleString('es-MX', { dateStyle: 'short', timeStyle: 'short' })}</span>
              <span className="audit-who">{e.actorName || 'Alguien'}</span>
              <span className="audit-what">{e.action}</span>
              {e.ip && <span className="audit-ip muted">{e.ip}</span>}
            </div>
          ))}
          {!entries.length && <div className="muted pad">Sin actividad registrada.</div>}
          {more && entries.length > 0 && <button className="btn block" onClick={() => load(entries[entries.length - 1].id)}>Ver más</button>}
        </div>
      </Section>
    </>
  );
}

// ---------- Miembros e invitaciones ----------
function CopyBtn({ text, label = 'Copiar enlace' }) {
  const [ok, setOk] = useState(false);
  return (
    <button className="btn tiny" onClick={async () => { await navigator.clipboard.writeText(text).catch(() => {}); setOk(true); setTimeout(() => setOk(false), 1500); }}>
      {ok ? <Check size={13} /> : <Copy size={13} />} {ok ? 'Copiado' : label}
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
                    <div>{u.displayName}{u.id === me.id && ' (tú)'}{u.twoFactor && <span className="tag-2fa" title="Verificación en dos pasos activada">2FA</span>}</div>
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
                        {u.twoFactor && <button className="icon-btn" title="Quitar verificación en dos pasos (si perdió su teléfono)" onClick={() => confirm(`¿Quitar la verificación en dos pasos de ${u.displayName}?`) && api.post(`/admin/users/${u.id}/reset-2fa`).catch((e) => office.toast({ title: e.message, kind: 'error' }))}><Shield size={14} /></button>}
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
      <BulkInvites reload={reload} />
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

// Invitar a muchas personas de una vez (pegar lista o subir CSV)
function parseList(text) {
  return text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).map((line) => {
    const parts = line.split(/[,;\t]/).map((x) => x.trim());
    const email = parts.find((x) => /@/.test(x)) || '';
    const role = parts.some((x) => /^admin$/i.test(x)) ? 'admin' : 'member';
    const name = parts.find((x) => x && x !== email && !/^(admin|miembro|member)$/i.test(x)) || email.split('@')[0];
    return { name, email, role };
  }).filter((r) => r.name && !/^(nombre|name)$/i.test(r.name));
}

function BulkInvites({ reload }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [result, setResult] = useState(null);
  const fileRef = useRef(null);
  const rows = parseList(text);
  const link = (t) => `${window.location.origin}/invite/${t}`;

  const create = async () => {
    try {
      const { invites } = await api.post('/admin/invites/batch', { rows, days: 14 });
      setResult(invites);
      setText('');
      reload();
    } catch (err) {
      office.toast({ title: err.message, kind: 'error' });
    }
  };
  const csv = () => {
    const body = ['nombre,correo,rol,enlace', ...result.map((r) => [r.name, r.email, r.role, link(r.token)].map((v) => `"${String(v).replace(/"/g, '""')}"`).join(','))].join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob(['\ufeff' + body], { type: 'text/csv' }));
    a.download = 'invitaciones.csv';
    a.click();
  };
  const loadFile = async (e) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (f) setText(await f.text());
  };

  if (!open) return <button className="btn block" onClick={() => setOpen(true)}><Users size={15} /> Invitar a varias personas a la vez</button>;
  return (
    <div className="invite-form">
      <div className="pref-title"><Users size={15} /> Invitar en lote</div>
      {result ? (
        <>
          <p className="small">Listo: {result.length} enlaces (expiran en 14 días). Descarga la lista y manda a cada quien el suyo.</p>
          <div className="bulk-list">
            {result.map((r) => (
              <div key={r.token} className="row gap8"><span className="flex1 ellipsis">{r.name}{r.role === 'admin' ? ' · Admin' : ''}</span><CopyBtn text={link(r.token)} /></div>
            ))}
          </div>
          <div className="row gap8">
            <button className="btn primary" onClick={csv}><Download size={15} /> Descargar CSV</button>
            <CopyBtn text={result.map((r) => `${r.name}: ${link(r.token)}`).join('\n')} label="Copiar todo" />
            <button className="btn" onClick={() => { setResult(null); setOpen(false); }}>Cerrar</button>
          </div>
        </>
      ) : (
        <>
          <p className="muted small">Una persona por línea: <code>Nombre, correo, admin</code>. El correo y el rol son opcionales. También puedes subir un CSV exportado de Excel o Google Sheets.</p>
          <textarea rows={6} placeholder={'Kevingare, kevin@gtahub.gg\nWodiw\nYamii, yamii@gtahub.gg, admin'} value={text} onChange={(e) => setText(e.target.value)} />
          <div className="row gap8">
            <button className="btn" type="button" onClick={() => fileRef.current.click()}><Upload size={15} /> Subir CSV</button>
            <input ref={fileRef} type="file" accept=".csv,text/csv,text/plain" hidden onChange={loadFile} />
            <span className="flex1 muted small">{rows.length ? `${rows.length} persona${rows.length > 1 ? 's' : ''}` : ''}</span>
            <button className="btn" onClick={() => setOpen(false)}>Cancelar</button>
            <button className="btn primary" disabled={!rows.length} onClick={create}>Crear {rows.length || ''} enlaces</button>
          </div>
        </>
      )}
    </div>
  );
}

function OfficeAdmin() {
  const floors = useOffice((s) => s.floors);
  return (
    <>
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
    <ReloadAll />
    </>
  );
}

// Actualizar global: todos recargan la app (útil después de publicar una versión nueva)
function ReloadAll() {
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const run = async () => {
    if (!window.confirm('Se recargará la oficina de todas las personas conectadas en unos segundos. ¿Continuar?')) return;
    setBusy(true);
    try {
      const r = await api.post('/admin/reload-all', { message: msg });
      office.toast({ title: `Listo: ${r.online} ${r.online === 1 ? 'persona recibió' : 'personas recibieron'} la actualización.` });
      setMsg('');
    } catch (e) {
      office.toast({ title: e.message, kind: 'error' });
    } finally {
      setBusy(false);
    }
  };
  return (
    <Section title="Actualizar a todos">
      <p className="muted">Recarga la app de todas las personas conectadas (borra la caché), para que vean la versión más reciente al instante. Verán un aviso y la recarga ocurre en 8 segundos.</p>
      <input placeholder="Mensaje opcional: Ya hay mascotas 🐶" value={msg} onChange={(e) => setMsg(e.target.value)} maxLength={140} />
      <div className="row gap8" style={{ marginTop: 8 }}>
        <button className="btn primary" disabled={busy} onClick={run}>Actualizar a todos</button>
      </div>
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
          <input placeholder="Nombre (ej. Pirata del equipo)" value={name} onChange={(e) => setName(e.target.value)} maxLength={40} required />
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

// ---------- Marca de la oficina ----------
function BrandAdmin() {
  const config = useOffice((s) => s.config);
  const [name, setName] = useState(config.officeName || '');
  const fileRef = useRef(null);

  const save = (body) => api.patch('/admin/office', body).catch((e) => office.toast({ title: e.message, kind: 'error' }));
  const upload = async (e) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    try {
      await api.put('/admin/office/logo', { dataUrl: await readAsDataUrl(f) });
    } catch (err) {
      office.toast({ title: err.message, kind: 'error' });
    }
  };

  return (
    <>
      <Section title="Nombre">
        <Row title="Nombre de la oficina" desc="Aparece en el panel, en el inicio de sesión y en las invitaciones">
          <div className="row gap8">
            <input value={name} onChange={(e) => setName(e.target.value)} maxLength={40} />
            <button className="btn" disabled={!name.trim() || name === config.officeName} onClick={() => save({ officeName: name })}>Guardar</button>
          </div>
        </Row>
      </Section>
      <Section title="Tema">
        <div className="theme-grid">
          {THEMES.map((t) => (
            <button key={t.id} className={`theme-card ${config.theme === t.id ? 'on' : ''}`} onClick={() => save({ theme: t.id })} aria-pressed={config.theme === t.id}>
              <div className="theme-swatches">
                {(t.id === 'custom' ? [config.accent || '#157A6E', '#ffffff', '#F3F4EE', '#0A2B2C'] : t.swatches).map((c, i) => <span key={i} style={{ background: c }} />)}
              </div>
              <b>{t.name}</b>
              <span className="muted small">{t.desc}</span>
            </button>
          ))}
        </div>
        {config.theme === 'custom' && (
          <Row title="Color principal" desc="Botones, selección y acentos">
            <input type="color" value={config.accent || '#157A6E'} onChange={(e) => save({ accent: e.target.value })} aria-label="Color principal" />
          </Row>
        )}
      </Section>
      <Section title="Logo">
        <Row title="Logo de la oficina" desc="Cuadrado, idealmente SVG o PNG con fondo transparente. Si no subes uno, se usa el del tema.">
          <div className="row gap8">
            <span className="logo-preview"><OfficeMark config={config} size={36} /></span>
            <button className="btn" onClick={() => fileRef.current.click()}><Upload size={15} /> Subir</button>
            {config.logoUrl && <button className="btn danger-text" onClick={() => api.del('/admin/office/logo')}>Quitar</button>}
            <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" hidden onChange={upload} />
          </div>
        </Row>
        <div className="row gap8 muted small">La firma <ByNuvora /> se mantiene siempre en el inicio de sesión.</div>
      </Section>
      <Section title="Decoración de temporada">
        <Row title="Temporada" desc="Adornos, personajes y ambiente especiales en el mapa (calabazas, zombies, perritos, ofrenda…). En automático se pone sola en su fecha.">
          <select value={config.seasonSetting || 'auto'} onChange={(e) => save({ season: e.target.value })}>
            <option value="auto">Automática (según la fecha)</option>
            <option value="halloween">🎃 Halloween y Día de Muertos</option>
            <option value="none">Sin decoración</option>
          </select>
        </Row>
      </Section>
      <ShiftsAdmin shifts={config.shifts || []} save={save} />
      <ShiftReport />
    </>
  );
}

// Turnos o servidores donde la gente marca "En turno"
function ShiftsAdmin({ shifts, save }) {
  const [v, setV] = useState('');
  const add = (e) => {
    e.preventDefault();
    const name = v.trim();
    if (!name || shifts.includes(name)) return;
    save({ shifts: [...shifts, name] });
    setV('');
  };
  return (
    <Section title="Turnos">
      <Row title="Turnos o servidores" desc="Cada quien marca en cuál está desde su avatar (abajo a la izquierda). Se ve en la lista de personas y en el mapa.">
        <div className="leader-chips">
          {shifts.map((sh) => (
            <span key={sh} className="chip">{sh}<button type="button" aria-label={`Quitar ${sh}`} onClick={() => save({ shifts: shifts.filter((x) => x !== sh) })}>×</button></span>
          ))}
        </div>
      </Row>
      <form className="row gap8" onSubmit={add}>
        <input placeholder="Ej. Andromeda" value={v} onChange={(e) => setV(e.target.value)} maxLength={30} />
        <button className="btn" type="submit" disabled={!v.trim()}>Añadir turno</button>
      </form>
    </Section>
  );
}
