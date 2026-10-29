// Preferencias → Discord (admins): conectar el bot, mapear roles de Discord a lo del HUB
// (placas, admin, tema, VIP, moderador), elegir a qué canal va cada aviso y "Personalizar canal".
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  AlertTriangle, CheckCircle2, ChevronDown, Circle, RefreshCw, Send, Hash, Megaphone, Plus, X, ShieldAlert, Rocket, Pin, Type, ExternalLink, Copy,
} from 'lucide-react';
import { office } from '../../lib/store.js';
import { api } from '../../lib/api.js';
import { Toggle, Modal } from '../ui.jsx';
import { BadgeImg } from '../badges/Badge.jsx';
import './discordAdmin.css';

const toastErr = (e) => office.toast({ title: e.message, kind: 'error' });
const BOOSTER = 'booster';
const EMPTY = { office: '', badges: [], theme: null, vip: false, mod: false };

// PUT con el código de error del servidor (para pedir confirmación o 2FA)
async function putRaw(path, body) {
  const r = await fetch(`/api${path}`, { method: 'PUT', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const data = await r.json().catch(() => ({}));
  return { ok: r.ok, status: r.status, data };
}

export default function DiscordAdmin() {
  const [st, setSt] = useState(null);
  const [guild, setGuild] = useState(null);
  const [gErr, setGErr] = useState(null);
  const [tab, setTab] = useState('roles');
  const load = () => api.get('/admin/discord').then(setSt).catch(toastErr);
  const loadGuild = (fresh) => api.get(`/admin/discord/guild${fresh ? '?fresh=1' : ''}`).then((g) => { setGuild(g); setGErr(null); }).catch((e) => setGErr(e.message));
  useEffect(() => { load(); }, []);
  useEffect(() => { if (st?.enabled && !guild) loadGuild(); }, [st?.enabled]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!st) return <div className="muted pad">Cargando…</div>;

  return (
    <div className="dc-admin">
      <Connection st={st} guild={guild} gErr={gErr} onRefresh={() => { load(); loadGuild(true); }} />
      {st.enabled && (
        <>
          <div className="seg dc-tabs">
            {[['roles', 'Roles'], ['channels', 'Avisos por canal'], ['custom', 'Personalizar canal'], ['options', 'Opciones']].map(([k, l]) => (
              <button key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{l}</button>
            ))}
          </div>
          {!guild && !gErr && <div className="muted pad">Leyendo tu servidor de Discord…</div>}
          {guild && tab === 'roles' && <RoleMapping st={st} guild={guild} onSaved={load} />}
          {guild && tab === 'channels' && <Automations st={st} guild={guild} onSaved={load} />}
          {guild && tab === 'custom' && <Customize guild={guild} onDone={() => loadGuild(true)} />}
          {tab === 'options' && <Options st={st} onSaved={load} />}
        </>
      )}
    </div>
  );
}

// ---------- Conexión y pasos ----------
function Chip({ ok, warn, children }) {
  return <span className={`dc-chip ${ok ? 'ok' : warn ? 'warn' : ''}`}>{ok ? <CheckCircle2 size={13} /> : warn ? <AlertTriangle size={13} /> : <Circle size={13} />}{children}</span>;
}

function Connection({ st, guild, gErr, onRefresh }) {
  const e = st.env;
  const copy = (t) => navigator.clipboard?.writeText(t).then(() => office.toast({ title: 'Copiado' }));
  return (
    <div className="pref-section">
      <div className="dc-hero">
        <div className="dc-hero-icon"><DiscordGlyph /></div>
        <div className="dc-hero-main">
          <div className="dc-hero-title">{guild ? guild.guild.name : st.enabled ? 'Servidor de Discord' : 'Discord sin conectar'}</div>
          <div className="dc-chips">
            <Chip ok={e.token && e.guild}>{e.token && e.guild ? `Bot ${guild?.bot?.username ? `@${guild.bot.username}` : 'configurado'}` : 'Falta el bot'}</Chip>
            <Chip ok={e.oauth}>{e.oauth ? 'Entrar con Discord' : 'Sin "Entrar con Discord"'}</Chip>
            <Chip ok={e.publicKey} warn={!e.publicKey && st.enabled}>{e.publicKey ? 'Botones de moderación' : 'Sin botones (falta DISCORD_PUBLIC_KEY)'}</Chip>
            <Chip ok={e.gateway && st.gateway?.status === 'online'} warn={e.gateway && st.gateway?.status !== 'online'}>
              {e.gateway ? `Tiempo real: ${({ online: 'conectado', connecting: 'conectando', reconnecting: 'reconectando', error: 'error' })[st.gateway?.status] || 'apagado'}` : 'Roles cada 15 min'}
            </Chip>
            <Chip ok={!!e.publicUrl} warn={!e.publicUrl}>{e.publicUrl ? 'Enlaces al HUB' : 'Falta PUBLIC_URL (sin enlaces ni logo)'}</Chip>
          </div>
          {st.gateway?.error && <div className="dc-warn small"><AlertTriangle size={14} /> {st.gateway.error}</div>}
          {gErr && <div className="dc-warn small"><AlertTriangle size={14} /> {gErr}</div>}
        </div>
        {st.enabled && <button className="btn ghost tiny" onClick={onRefresh} title="Volver a leer roles y canales"><RefreshCw size={13} /> Actualizar</button>}
      </div>
      <details className="dc-steps" open={!st.enabled}>
        <summary>Cómo conectarlo (5 minutos)</summary>
        <ol>
          <li>Entra a <b>discord.com/developers/applications</b> y abre la aplicación que ya usas para “Entrar con Discord” (o crea una).</li>
          <li>En <b>Bot</b>: copia el token (va en <code>DISCORD_BOT_TOKEN</code>) y, si quieres roles al instante, activa <b>Server Members Intent</b> y pon <code>DISCORD_GATEWAY=1</code>.</li>
          <li>Invita el bot a tu servidor con permisos de ver canales, enviar mensajes, insertar enlaces, gestionar mensajes (para fijar) y, opcional, gestionar canales (para el tema).
            {st.inviteUrl && <> <a className="link" href={st.inviteUrl} target="_blank" rel="noreferrer">Abrir enlace de invitación <ExternalLink size={12} /></a></>}
          </li>
          <li>Copia el ID del servidor (Discord → Ajustes → Avanzado → Modo desarrollador; clic derecho al servidor → Copiar ID) en <code>DISCORD_GUILD_ID</code>.</li>
          <li>Para los botones del canal de moderación: copia la <b>Public Key</b> (Información general) en <code>DISCORD_PUBLIC_KEY</code> y pon esta URL en <b>Interactions Endpoint URL</b>:
            <span className="dc-code"><code>{st.interactionsUrl}</code><button className="icon-btn" onClick={() => copy(st.interactionsUrl)} aria-label="Copiar"><Copy size={13} /></button></span>
          </li>
          <li>Guarda las variables en Render (Environment) y reinicia. El token nunca se muestra aquí ni sale del servidor.</li>
        </ol>
      </details>
    </div>
  );
}

function DiscordGlyph() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path fill="currentColor" d="M20.3 4.4A19.6 19.6 0 0 0 15.4 3l-.6 1.3a18 18 0 0 0-5.6 0L8.6 3a19.5 19.5 0 0 0-4.9 1.5C.6 9 0 13.6.3 18.1a19.8 19.8 0 0 0 6 3l1.3-2a12.7 12.7 0 0 1-2-1l.5-.4a14 14 0 0 0 11.8 0l.5.4c-.6.4-1.3.7-2 1l1.3 2a19.7 19.7 0 0 0 6-3c.5-5.2-.8-9.7-3.4-13.7ZM8.5 15.3c-1.2 0-2.1-1-2.1-2.3s.9-2.3 2.1-2.3 2.2 1 2.1 2.3c0 1.2-.9 2.3-2.1 2.3Zm7 0c-1.2 0-2.1-1-2.1-2.3s.9-2.3 2.1-2.3 2.2 1 2.1 2.3c0 1.2-.9 2.3-2.1 2.3Z" /></svg>
  );
}

// ---------- Roles ----------
function RoleMapping({ st, guild, onSaved }) {
  const [map, setMap] = useState(() => ({ ...st.config.roleMap }));
  const [dirty, setDirty] = useState(false);
  const [confirm, setConfirm] = useState(null); // { code }
  const [busy, setBusy] = useState(false);
  const roles = [{ id: BOOSTER, name: 'Server Booster', booster: true }, ...guild.roles];
  const set = (rid, patch) => { setMap((m) => ({ ...m, [rid]: { ...EMPTY, ...m[rid], ...patch } })); setDirty(true); };
  const newAdmins = roles.filter((r) => map[r.id]?.office === 'admin' && st.config.roleMap?.[r.id]?.office !== 'admin');
  const has2fa = !!office.state.me?.twoFactor;
  const badgeById = useMemo(() => Object.fromEntries(st.badges.map((b) => [b.id, b])), [st.badges]);

  const save = async (extra = {}) => {
    setBusy(true);
    const r = await putRaw('/admin/discord/roles', { roleMap: map, ...extra });
    setBusy(false);
    if (r.ok) { setDirty(false); setConfirm(null); office.toast({ title: '✅ Mapeo de roles guardado' }); onSaved(); return; }
    if (r.data.code === 'confirm-admin') return setConfirm({ code: '' });
    office.toast({ title: r.data.error || 'No se pudo guardar', kind: 'error' });
  };
  const sync = () => api.post('/admin/discord/sync').then((r) => office.toast({ title: `🔄 Sincronizado: ${r.sync.users} personas, ${r.sync.changes} cambios` })).then(onSaved).catch(toastErr);

  return (
    <div className="pref-section">
      <p className="muted small">Cada rol de tu servidor puede dar cosas en el HUB. Lo que da Discord se marca como “de Discord”: si le quitan el rol, solo se quita eso (lo que diste a mano se queda). Los pisos de admin siguen siendo solo para admins.</p>
      {newAdmins.length > 0 && (
        <div className="dc-danger"><ShieldAlert size={18} /><div><b>Cuidado: {newAdmins.map((r) => r.name).join(', ')} dará acceso total de administrador.</b> Quien tenga ese rol en Discord podrá cambiar todo el HUB, banear y ver el registro. Al guardar te pediremos confirmar con tu código de verificación en dos pasos. El primer admin nunca pierde su acceso por Discord.</div></div>
      )}
      <div className="dc-table-wrap">
        <table className="dc-table">
          <thead><tr><th>Rol de Discord</th><th>Rol en el HUB</th><th>Placas</th><th>Tema</th><th title="VIP del Hotel; Moderador: puede moderar a miembros desde Discord y el HUB (no a admins)">Extras</th></tr></thead>
          <tbody>
            {roles.map((r) => {
              const m = { ...EMPTY, ...map[r.id] };
              const used = !!(m.office || m.badges.length || m.theme || m.vip || m.mod);
              return (
                <tr key={r.id} className={used ? 'used' : ''}>
                  <td>
                    <div className="dc-role">
                      {r.booster ? <Rocket size={14} className="dc-boost" /> : <span className="dc-dot" style={{ background: r.color || 'var(--text-3)' }} />}
                      <span>{r.name}</span>
                    </div>
                  </td>
                  <td>
                    <select className={`dc-select ${m.office === 'admin' ? 'danger' : ''}`} value={m.office} onChange={(e) => set(r.id, { office: e.target.value })} aria-label={`Rol en el HUB para ${r.name}`}>
                      <option value="">—</option>
                      <option value="member">Miembro</option>
                      {!r.booster && <option value="admin">⚠ Admin</option>}
                    </select>
                  </td>
                  <td><BadgePicker value={m.badges} options={st.badges} byId={badgeById} onChange={(badges) => set(r.id, { badges })} /></td>
                  <td>
                    <select className="dc-select" value={m.theme || ''} onChange={(e) => set(r.id, { theme: e.target.value || null })} aria-label={`Tema para ${r.name}`}>
                      <option value="">—</option>
                      {st.themes.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                    </select>
                  </td>
                  <td className="dc-extras">
                    <label title="VIP del Hotel MeDed Friends"><Toggle checked={m.vip} onChange={(v) => set(r.id, { vip: v })} /> VIP</label>
                    <label title="Moderador de HUB: puede silenciar, sacar y suspender a miembros (no a admins). No cambia configuración."><Toggle checked={m.mod} onChange={(v) => set(r.id, { mod: v })} /> Moderador</label>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="dc-actions">
        <span className="muted small">{st.linked} {st.linked === 1 ? 'persona vinculada' : 'personas vinculadas'} · {st.sync?.at ? `última sincronización ${new Date(st.sync.at).toLocaleTimeString('es-MX', { timeStyle: 'short' })}` : 'aún sin sincronizar'}</span>
        <button className="btn ghost" onClick={sync}><RefreshCw size={14} /> Sincronizar ahora</button>
        <button className="btn primary" disabled={!dirty || busy} onClick={() => save()}>Guardar mapeo</button>
      </div>
      {confirm && (
        <Modal title="Dar admin por un rol de Discord" onClose={() => setConfirm(null)} width={440}
          footer={<><button className="btn ghost" onClick={() => setConfirm(null)}>Cancelar</button>{has2fa && <button className="btn danger" disabled={confirm.code.length < 6 || busy} onClick={() => save({ confirmAdmin: true, code: confirm.code })}>Sí, dar admin</button>}</>}>
          <div className="dc-danger"><ShieldAlert size={18} /><div>Quien tenga <b>{newAdmins.map((r) => r.name).join(', ')}</b> en Discord será administrador del HUB. Asegúrate de que solo gente de confianza pueda recibir ese rol.</div></div>
          {has2fa ? (
            <label className="dc-label">Código de tu app de verificación
              <input className="search-input dc-code-input" inputMode="numeric" autoFocus maxLength={8} value={confirm.code} onChange={(e) => setConfirm({ code: e.target.value.replace(/\D/g, '') })} placeholder="123456" />
            </label>
          ) : (
            <div className="dc-warn"><AlertTriangle size={14} /> Por seguridad, primero activa tu verificación en dos pasos en Preferencias → Cuenta. Después podrás dar admin por un rol de Discord.</div>
          )}
        </Modal>
      )}
    </div>
  );
}

function BadgePicker({ value, options, byId, onChange }) {
  const [open, setOpen] = useState(null); // posición del menú (portal: la tabla tiene scroll)
  const btn = useRef(null);
  const toggle = () => {
    if (open) return setOpen(null);
    const r = btn.current.getBoundingClientRect();
    const below = window.innerHeight - r.bottom > 320;
    setOpen({ left: Math.max(8, Math.min(r.left, window.innerWidth - 310)), ...(below ? { top: r.bottom + 4 } : { bottom: window.innerHeight - r.top + 4 }) });
  };
  const groups = [['role', 'Roles'], ['streamer', 'Streamers'], ['event', 'Eventos'], ['custom', 'Especiales']];
  return (
    <div className="dc-badges">
      {value.map((id) => (
        <span key={id} className="dc-badge" title={byId[id]?.name || id}>
          <BadgeImg id={id} art={byId[id]?.category === 'custom' ? byId[id].art : undefined} size={40} className="dc-badge-img" />
          <span className="dc-badge-name">{byId[id]?.name || id}</span>
          <button onClick={() => onChange(value.filter((x) => x !== id))} aria-label="Quitar"><X size={11} /></button>
        </span>
      ))}
      <div className="dc-pop-wrap">
        <button ref={btn} className="dc-add" onClick={toggle} aria-label="Agregar placa"><Plus size={13} /></button>
        {open && createPortal(
          <>
            <div className="dc-pop-backdrop" onClick={() => setOpen(null)} />
            <div className="dc-pop" style={open}>
              {groups.map(([cat, label]) => {
                const list = options.filter((b) => b.category === cat && !value.includes(b.id));
                if (!list.length) return null;
                return (
                  <div key={cat}>
                    <div className="dc-pop-title">{label}</div>
                    <div className="dc-pop-grid">
                      {list.map((b) => (
                        <button key={b.id} title={b.name} onClick={() => { onChange([...value, b.id]); setOpen(null); }}>
                          <BadgeImg id={b.id} art={cat === 'custom' ? b.art : undefined} size={40} />
                          <span>{b.name}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </>, document.body,
        )}
      </div>
    </div>
  );
}

// ---------- Avisos por canal ----------
function ChannelPicker({ value, channels, onChange, need = 'missing', warn = true }) {
  const ch = channels.find((c) => c.id === value);
  return (
    <div className="dc-picker">
      <div className="select dc-select-wrap">
        <select value={value || ''} onChange={(e) => onChange(e.target.value || null)} aria-label="Canal">
          <option value="">Elige un canal…</option>
          {channels.map((c) => <option key={c.id} value={c.id}>{c[need].length ? '⚠ ' : ''}#{c.name}{c.parent ? ` · ${c.parent}` : ''}</option>)}
        </select>
        <ChevronDown size={14} />
      </div>
      {warn && ch && ch[need].length > 0 && <MissingPerms missing={ch[need]} channel={ch.name} />}
    </div>
  );
}
function MissingPerms({ missing, channel }) {
  return <div className="dc-warn small" role="alert"><AlertTriangle size={13} /><span>Al bot le faltan permisos en #{channel}: <b>{missing.map((m) => m.name).join(', ')}</b>. Dáselos en Discord (Editar canal → Permisos).</span></div>;
}

function Automations({ st, guild, onSaved }) {
  const [autos, setAutos] = useState(() => ({ ...st.config.automations }));
  const [dirty, setDirty] = useState(false);
  const set = (id, patch) => { setAutos((a) => ({ ...a, [id]: { ...a[id], ...patch } })); setDirty(true); };
  const save = () => api.put('/admin/discord/automations', { automations: autos }).then(() => { setDirty(false); office.toast({ title: '✅ Avisos guardados' }); onSaved(); }).catch(toastErr);
  const test = (ch) => api.post('/admin/discord/test', { channelId: ch }).then(() => office.toast({ title: '📨 Mensaje de prueba enviado' })).catch(toastErr);
  return (
    <div className="pref-section">
      <p className="muted small">Elige qué avisa el bot y en qué canal. Todo sale como mensaje con el estilo del HUB y <b>sin menciones</b> (nadie puede hacer @everyone desde aquí).</p>
      <div className="dc-autos">
        {st.automations.map((a) => {
          const v = autos[a.id] || { on: false, channel: null };
          return (
            <div key={a.id} className={`dc-auto ${v.on ? 'on' : ''}`}>
              <div className="dc-auto-head">
                <Toggle checked={v.on} onChange={(on) => set(a.id, { on })} disabled={!v.channel} />
                <div className="dc-auto-text">
                  <div className="dc-auto-name">{a.id === 'modlog' ? <ShieldAlert size={14} /> : <Megaphone size={14} />} {a.name}{!a.def && <span className="tag">Opcional</span>}</div>
                  <div className="muted small">{a.desc}</div>
                </div>
              </div>
              <div className="dc-auto-ch">
                <ChannelPicker value={v.channel} channels={guild.channels} onChange={(channel) => set(a.id, { channel, on: channel ? v.on || (a.def && !v.channel && !guild.channels.find((c) => c.id === channel)?.missing.length) : false })} />
                <button className="btn ghost tiny" disabled={!v.channel} onClick={() => test(v.channel)} title="Mandar un mensaje de prueba"><Send size={12} /> Probar</button>
              </div>
              {a.id === 'modlog' && !st.env.publicKey && <div className="muted small">Sin <code>DISCORD_PUBLIC_KEY</code> los reportes llegan sin botones. Sin bot ni canal, se usa <code>MOD_WEBHOOK_URL</code>.</div>}
              {a.id === 'birthdays' && st.env.birthdayWebhook && <div className="muted small">El webhook de cumpleaños sigue de respaldo si el bot falla.</div>}
            </div>
          );
        })}
      </div>
      <div className="dc-actions"><button className="btn primary" disabled={!dirty} onClick={save}>Guardar avisos</button></div>
    </div>
  );
}

// ---------- Personalizar canal ----------
const DEFAULT_RULES = '1. Respeto ante todo: nada de insultos, acoso ni discriminación.\n2. Nada de spam ni publicidad sin permiso.\n3. Contenido apto para todos en los canales públicos.\n4. Si ves algo raro, repórtalo desde la tarjeta de la persona en el HUB.';
function Customize({ guild, onDone }) {
  const [ch, setCh] = useState(null);
  const [setTopic, setSetTopic] = useState(true);
  const [topic, setTopicText] = useState('Bienvenidos al HUB · Oficina virtual y Hotel MeDed Friends');
  const [post, setPost] = useState(true);
  const [pin, setPin] = useState(true);
  const [rules, setRules] = useState(DEFAULT_RULES);
  const [busy, setBusy] = useState(false);
  const c = guild.channels.find((x) => x.id === ch);
  const missing = c ? [...(setTopic ? c.missingTopic : []), ...(post ? c.missing : []), ...(post && pin ? c.missingPin : [])].filter((p, i, a) => a.findIndex((x) => x.id === p.id) === i) : [];
  const apply = () => {
    setBusy(true);
    api.post('/admin/discord/customize', { channelId: ch, topic: setTopic ? topic : null, post, pin: post && pin, rules })
      .then((r) => { office.toast({ title: `✨ Listo: ${r.steps.map((s) => ({ topic: 'tema', post: 'mensaje', pin: 'fijado' })[s]).join(', ')}` }); onDone(); })
      .catch(toastErr).finally(() => setBusy(false));
  };
  return (
    <div className="pref-section">
      <p className="muted small">El bot puede dejar listo un canal: ponerle tema y publicar (y fijar) un mensaje de bienvenida con las reglas, los enlaces al HUB y a MeDed Friends, y cómo vincular Discord. No crea ni borra canales ni roles.</p>
      <div className="dc-custom">
        <div className="dc-custom-form">
          <label className="dc-label">Canal<ChannelPicker value={ch} channels={guild.channels} onChange={setCh} warn={false} /></label>
          {c && missing.length > 0 && <MissingPerms missing={missing} channel={c.name} />}
          {c && !missing.length && <div className="dc-ok small"><CheckCircle2 size={13} /> El bot tiene los permisos para esto en #{c.name}.</div>}
          <div className="dc-check"><Toggle checked={setTopic} onChange={setSetTopic} /><Type size={14} /> Cambiar el tema del canal</div>
          {setTopic && <input className="search-input dc-wide" maxLength={1024} value={topic} onChange={(e) => setTopicText(e.target.value)} />}
          <div className="dc-check"><Toggle checked={post} onChange={setPost} /><Hash size={14} /> Publicar mensaje de bienvenida</div>
          {post && <textarea className="dc-textarea" rows={5} maxLength={3000} value={rules} onChange={(e) => setRules(e.target.value)} aria-label="Reglas" />}
          {post && <div className="dc-check"><Toggle checked={pin} onChange={setPin} /><Pin size={14} /> Fijarlo en el canal</div>}
          <div className="dc-actions"><button className="btn primary" disabled={!ch || busy || missing.length > 0 || (!setTopic && !post)} onClick={apply}>Aplicar al canal</button></div>
        </div>
        <div className="dc-preview" aria-label="Vista previa">
          <div className="dc-preview-bar" />
          <div className="dc-preview-body">
            <div className="dc-preview-title">Bienvenidos al HUB</div>
            <div className="dc-preview-text">{rules}</div>
            <div className="dc-preview-field"><b>🏢 HUB</b><span>La oficina virtual de la comunidad.</span></div>
            <div className="dc-preview-field"><b>🏨 MeDed Friends</b><span>El Hotel del HUB.</span></div>
            <div className="dc-preview-field"><b>🔗 Vincula tu Discord</b><span>Preferencias → Cuenta → “Vincular Discord”.</span></div>
            <div className="dc-preview-foot">HUB · Eleevate</div>
          </div>
          <img className="dc-preview-logo" src="/themes/eleevate/logo.png" alt="" />
        </div>
      </div>
    </div>
  );
}

// ---------- Opciones ----------
function Options({ st, onSaved }) {
  const set = (requireMember) => api.put('/admin/discord/options', { requireMember }).then(onSaved).catch(toastErr);
  return (
    <>
      <div className="pref-section">
        <div className="pref-row">
          <div className="pref-text">
            <div className="pref-title">Solo miembros del Discord pueden entrar</div>
            <div className="pref-desc">Al entrar o registrarse con Discord, se revisa que la persona esté en tu servidor. Si Discord no responde, se deja pasar.</div>
          </div>
          <div className="pref-control"><Toggle checked={!!st.config.requireMember} onChange={set} /></div>
        </div>
      </div>
      <div className="pref-section">
        <div className="pref-section-title">Últimos envíos</div>
        <div className="dc-log">
          {st.log.map((l, i) => (
            <div key={i} className={`dc-log-row ${l.ok ? '' : 'bad'}`}>
              {l.ok ? <CheckCircle2 size={13} /> : <AlertTriangle size={13} />}
              <span>{new Date(l.at).toLocaleTimeString('es-MX', { timeStyle: 'short' })}</span>
              <span className="tag">{l.kind}</span>
              <span className="muted">{l.error || 'Entregado'}</span>
            </div>
          ))}
          {!st.log.length && <div className="muted small">Todavía no se ha mandado nada.</div>}
        </div>
        <div className="muted small">Peticiones a Discord: {st.stats.requests} · reintentos: {st.stats.retries} · límites respetados: {st.stats.rateLimited}</div>
      </div>
    </>
  );
}
