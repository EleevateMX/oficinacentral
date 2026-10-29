// 🎁 Amigo secreto: inscribirse con tu lista de deseos, ver a quién le regalas (solo tú),
// mensajes anónimos, la revelación con toda la cadena y los controles del admin.
import React, { useEffect, useMemo, useState } from 'react';
import { Gift, Send, Shuffle, Eye, PartyPopper, Trash2, Plus, X, Settings2, LogOut } from 'lucide-react';
import { office, useOffice } from '../lib/store.js';
import { api } from '../lib/api.js';
import { Modal, Avatar, Empty } from './ui.jsx';
import { confetti } from '../lib/confetti.js';
import { playSound } from '../lib/sounds.js';

const fmt = (ts) => (ts ? new Date(ts).toLocaleString('es-MX', { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }) : null);
// <input type="datetime-local"> ↔ milisegundos
const toLocal = (ts) => { if (!ts) return ''; const d = new Date(ts); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 16); };
const fromLocal = (s) => (s ? new Date(s).getTime() : null);

// Texto con enlaces que se pueden abrir
function Linkify({ text }) {
  if (!text) return <span className="muted">Sin lista de deseos todavía.</span>;
  const parts = text.split(/(https?:\/\/[^\s]+)/g);
  return <>{parts.map((p, i) => (/^https?:\/\//.test(p) ? <a key={i} href={p} target="_blank" rel="noopener noreferrer">{p.length > 48 ? `${p.slice(0, 46)}…` : p}</a> : <React.Fragment key={i}>{p}</React.Fragment>))}</>;
}

function Thread({ title, hint, msgs, onSend, placeholder }) {
  const [text, setText] = useState('');
  const send = async () => { const b = text.trim(); if (!b) return; if (await onSend(b)) setText(''); };
  return (
    <div className="santa-thread">
      <div className="santa-thread-head"><b>{title}</b><span className="muted small">{hint}</span></div>
      <div className="santa-msgs">
        {!msgs.length && <div className="muted small">Aún no hay mensajes.</div>}
        {msgs.map((m) => <div key={m.id} className={`santa-msg ${m.mine ? 'mine' : ''}`}>{m.body}</div>)}
      </div>
      <div className="santa-input">
        <input value={text} maxLength={500} placeholder={placeholder} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && send()} />
        <button className="btn primary" disabled={!text.trim()} onClick={send} aria-label="Enviar"><Send size={15} /></button>
      </div>
    </div>
  );
}

function ExchangeForm({ ex, onSaved, onCancel }) {
  const [f, setF] = useState({ name: ex?.name || `Intercambio de regalos ${new Date().getFullYear()}`, budget: ex?.budget || '', signupUntil: toLocal(ex?.signupUntil), drawAt: toLocal(ex?.drawAt), revealAt: toLocal(ex?.revealAt) });
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const [busy, setBusy] = useState(false);
  const save = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const body = { name: f.name, budget: f.budget, signupUntil: fromLocal(f.signupUntil), drawAt: fromLocal(f.drawAt), revealAt: fromLocal(f.revealAt) };
      onSaved(ex ? await api.patch('/santa', body) : await api.post('/santa', body));
    } catch (err) { office.toast({ title: err.message, kind: 'error' }); }
    setBusy(false);
  };
  return (
    <form className="santa-form" onSubmit={save}>
      <label><span>Nombre</span><input value={f.name} onChange={set('name')} maxLength={60} required /></label>
      <label><span>Presupuesto</span><input value={f.budget} onChange={set('budget')} maxLength={80} placeholder="Ej. $300 MXN o un detalle in-game" /></label>
      <div className="santa-form-row">
        <label><span>Cierre de inscripción</span><input type="datetime-local" value={f.signupUntil} onChange={set('signupUntil')} /></label>
        <label><span>Sorteo automático</span><input type="datetime-local" value={f.drawAt} onChange={set('drawAt')} /></label>
        <label><span>Revelación</span><input type="datetime-local" value={f.revealAt} onChange={set('revealAt')} /></label>
      </div>
      <div className="muted small">Todas las fechas son opcionales: también puedes hacer el sorteo y revelar a mano.</div>
      <div className="row gap8 santa-form-actions">
        {onCancel && <button type="button" className="btn ghost" onClick={onCancel}>Cancelar</button>}
        <button className="btn primary" disabled={busy}><Gift size={15} /> {ex ? 'Guardar cambios' : 'Crear intercambio'}</button>
      </div>
    </form>
  );
}

function Exclusions({ ex, users, onSaved }) {
  const list = ex.exclusions || [];
  const [a, setA] = useState('');
  const [b, setB] = useState('');
  const people = ex.participants.map((id) => users[id]).filter(Boolean);
  const save = async (next) => {
    try { onSaved(await api.patch('/santa', { exclusions: next })); } catch (e) { office.toast({ title: e.message, kind: 'error' }); }
  };
  const name = (id) => users[id]?.displayName || '¿?';
  return (
    <div className="santa-excl">
      <div className="santa-sub">Exclusiones <span className="muted small">(parejas que no se tocan entre sí, p. ej. pareja o mismo equipo)</span></div>
      {list.map(([x, y]) => (
        <span key={`${x}-${y}`} className="chip on">{name(x)} ⇄ {name(y)} <button className="chip-x" onClick={() => save(list.filter(([p, q]) => !(p === x && q === y)))} aria-label="Quitar"><X size={12} /></button></span>
      ))}
      {people.length >= 2 && (
        <div className="row gap8 santa-excl-add">
          <select value={a} onChange={(e) => setA(e.target.value)}><option value="">Persona</option>{people.map((u) => <option key={u.id} value={u.id}>{u.displayName}</option>)}</select>
          <span>⇄</span>
          <select value={b} onChange={(e) => setB(e.target.value)}><option value="">Persona</option>{people.filter((u) => String(u.id) !== a).map((u) => <option key={u.id} value={u.id}>{u.displayName}</option>)}</select>
          <button className="btn tiny" disabled={!a || !b || a === b} onClick={() => { save([...list, [Number(a), Number(b)]]); setA(''); setB(''); }}><Plus size={13} /> Agregar</button>
        </div>
      )}
    </div>
  );
}

function AdminPanel({ st, users, setSt }) {
  const ex = st.exchange;
  const [editing, setEditing] = useState(false);
  const [peek, setPeek] = useState(null);
  const call = async (fn, ok) => {
    try { const r = await fn(); if (r?.exchange !== undefined) setSt(r); if (ok) office.toast({ title: ok }); return r; } catch (e) { office.toast({ title: e.message, kind: 'error' }); return null; }
  };
  const doPeek = async () => {
    if (!window.confirm('Vas a ver quién le regala a quién. Quedará registrado en la bitácora de seguridad. ¿Continuar?')) return;
    const r = await call(() => api.post('/santa/peek'));
    if (r) setPeek(r.pairs);
  };
  const del = async () => {
    if (!window.confirm(`¿Borrar "${ex.name}"? Se pierden inscripciones, listas y mensajes.`)) return;
    await call(() => api.del('/santa'), 'Intercambio borrado');
    setSt({ exchange: null });
  };
  if (editing) return <div className="santa-admin"><div className="santa-sub"><Settings2 size={14} /> Editar intercambio</div><ExchangeForm ex={ex} onSaved={(r) => { setSt(r); setEditing(false); }} onCancel={() => setEditing(false)} /></div>;
  return (
    <div className="santa-admin">
      <div className="santa-sub"><Settings2 size={14} /> Administrar</div>
      {ex.status === 'open' && <Exclusions ex={ex} users={users} onSaved={setSt} />}
      <div className="row gap8 wrap">
        <button className="btn" onClick={() => setEditing(true)}>Editar datos y fechas</button>
        {ex.status === 'open' && <button className="btn primary" disabled={ex.participants.length < 3} onClick={() => window.confirm(`¿Hacer el sorteo ahora con ${ex.participants.length} participantes? Ya no se podrá entrar ni salir.`) && call(() => api.post('/santa/draw'), '🎁 ¡Sorteo hecho! A cada quien le llegó su amigo secreto')}><Shuffle size={15} /> Hacer sorteo ahora</button>}
        {ex.status === 'drawn' && <button className="btn" onClick={doPeek}><Eye size={15} /> Ver asignaciones</button>}
        {ex.status === 'drawn' && <button className="btn primary" onClick={() => window.confirm('¿Revelar a todos quién le regaló a quién?') && call(() => api.post('/santa/reveal'))}><PartyPopper size={15} /> Revelar ahora</button>}
        <button className="btn danger-text" onClick={del}><Trash2 size={15} /> Borrar</button>
      </div>
      {ex.status === 'open' && ex.participants.length < 3 && <div className="muted small">Se necesitan al menos 3 participantes para el sorteo.</div>}
      {peek && (
        <div className="santa-peek">
          {peek.map((p) => <div key={p.from}>{users[p.from]?.displayName} <b>→</b> {users[p.to]?.displayName}</div>)}
          <button className="btn tiny ghost" onClick={() => setPeek(null)}>Ocultar</button>
        </div>
      )}
    </div>
  );
}

// La revelación: la cadena completa, apareciendo de uno en uno
function Reveal({ st, users, me }) {
  useEffect(() => { confetti({ count: 160, duration: 4000 }); playSound('wave', 0.5); }, []);
  const mySanta = st.pairs.find((p) => p.to === me.id)?.from;
  let i = 0;
  return (
    <div className="santa-reveal">
      <div className="santa-reveal-title">🎉 ¡Se revelaron los amigos secretos!</div>
      {mySanta && <div className="santa-reveal-mine">Tu amigo secreto era <Avatar user={users[mySanta]} size={26} /> <b>{users[mySanta]?.displayName}</b> 💝</div>}
      {st.chains.map((c, ci) => (
        <div key={ci} className="santa-chain">
          {c.map((id, k) => (
            <React.Fragment key={id}>
              <span className="santa-link" style={{ animationDelay: `${(i++) * 0.18}s` }}><Avatar user={users[id]} size={30} /><span>{users[id]?.displayName?.split(' ')[0] || '¿?'}</span></span>
              <span className="santa-arrow" style={{ animationDelay: `${(i - 0.5) * 0.18}s` }}>🎁→</span>
              {k === c.length - 1 && <span className="santa-link loop" style={{ animationDelay: `${i * 0.18}s` }}><Avatar user={users[c[0]]} size={30} /><span>{users[c[0]]?.displayName?.split(' ')[0]}</span></span>}
            </React.Fragment>
          ))}
        </div>
      ))}
    </div>
  );
}

export default function SecretSanta() {
  const me = useOffice((s) => s.me);
  const users = useOffice((s) => s.users);
  const [st, setSt] = useState(null);
  const [wish, setWish] = useState('');
  const [creating, setCreating] = useState(false);
  const isAdmin = me.role === 'admin';
  const load = () => api.get('/santa').then((r) => { setSt(r); setWish(r.me?.wishlist || ''); }).catch((e) => office.toast({ title: e.message, kind: 'error' }));
  useEffect(() => {
    load();
    const s = office.socket;
    s?.on('santa', load);
    return () => s?.off('santa', load);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const close = () => office.set({ modal: null });
  const act = async (fn, ok) => {
    try { const r = await fn(); setSt(r); setWish(r.me?.wishlist || ''); if (ok) office.toast({ title: ok }); return true; } catch (e) { office.toast({ title: e.message, kind: 'error' }); return false; }
  };
  const ex = st?.exchange;
  const giftee = st?.giftee && users[st.giftee.userId];
  const people = useMemo(() => (ex?.participants || []).map((id) => users[id]).filter(Boolean), [ex, users]);

  let body;
  if (!st) body = <div className="muted santa-loading">Cargando…</div>;
  else if (!ex || creating) {
    body = isAdmin ? (
      <div className="santa-card">
        <div className="santa-sub"><Gift size={14} /> Nuevo intercambio de regalos</div>
        <ExchangeForm onSaved={(r) => { setSt(r); setCreating(false); }} onCancel={creating ? () => setCreating(false) : null} />
      </div>
    ) : <Empty mascota={{ nombre: 'nuvi', pose: 'wave' }} title="Todavía no hay intercambio">Cuando el equipo abra el Amigo secreto podrás inscribirte aquí con tu lista de deseos. 🎄</Empty>;
  } else {
    body = (
      <>
        <div className="santa-hero">
          <div className="santa-hero-text">
            <div className="santa-name">{ex.name}</div>
            <div className="santa-facts">
              {ex.budget && <span>💸 {ex.budget}</span>}
              {ex.status === 'open' && ex.signupUntil && <span>📝 Inscripción hasta {fmt(ex.signupUntil)}</span>}
              {ex.status === 'open' && ex.drawAt && <span>🎲 Sorteo {fmt(ex.drawAt)}</span>}
              {ex.status !== 'revealed' && ex.revealAt && <span>🎉 Revelación {fmt(ex.revealAt)}</span>}
            </div>
          </div>
          <div className="santa-people" title={people.map((u) => u.displayName).join(', ')}>
            {people.slice(0, 7).map((u) => <Avatar key={u.id} user={u} size={28} showStatus={false} />)}
            <span className="santa-count">{people.length} {people.length === 1 ? 'participa' : 'participan'}</span>
          </div>
        </div>

        {ex.status === 'revealed' && st.chains && <Reveal st={st} users={users} me={me} />}

        {ex.status === 'open' && (
          <div className="santa-card">
            {st.me.joined ? (
              <>
                <div className="santa-sub">✅ Ya estás participando. Tu lista de deseos:</div>
                <textarea rows={4} value={wish} maxLength={2000} onChange={(e) => setWish(e.target.value)} placeholder="Lo que te gustaría recibir. Puedes pegar enlaces." />
                <div className="row gap8">
                  <button className="btn primary" disabled={wish === st.me.wishlist} onClick={() => act(() => api.patch('/santa/wishlist', { wishlist: wish }), 'Lista guardada')}>Guardar lista</button>
                  <span className="flex1" />
                  <button className="btn ghost danger-text" onClick={() => window.confirm('¿Salirte del intercambio?') && act(() => api.post('/santa/leave'), 'Te saliste del intercambio')}><LogOut size={15} /> Salirme</button>
                </div>
                <div className="muted small">Puedes cambiarla hasta el sorteo. Nadie sabrá quién te toca hasta entonces 🤫</div>
              </>
            ) : st.canJoin ? (
              <>
                <div className="santa-sub">🎄 ¿Te apuntas? Escribe tu lista de deseos</div>
                <textarea rows={4} value={wish} maxLength={2000} onChange={(e) => setWish(e.target.value)} placeholder="Ej. una sudadera de HUB, stickers, un libro… (puedes pegar enlaces)" />
                <button className="btn primary big-santa" onClick={() => act(() => api.post('/santa/join', { wishlist: wish }), '🎁 ¡Ya estás en el Amigo secreto!').then((ok) => ok && confetti({ count: 70, duration: 2200 }))}><Gift size={16} /> Participar</button>
              </>
            ) : <div className="muted">La inscripción ya cerró. ¡Suerte para el próximo! 🎄</div>}
          </div>
        )}

        {ex.status !== 'open' && st.giftee && (
          <div className="santa-card giftee">
            <div className="santa-sub">{ex.status === 'revealed' ? '🎁 Le regalaste a…' : '🤫 Tu amigo secreto es…'}</div>
            <div className="santa-giftee">
              <Avatar user={giftee || { displayName: '?' }} size={52} ring />
              <div>
                <div className="santa-giftee-name">{giftee?.displayName || 'Alguien'}</div>
                <div className="muted small">{ex.status === 'revealed' ? '¡Ya todos lo saben! 🎉' : 'Solo tú lo sabes. ¡Que no se te escape!'}</div>
              </div>
            </div>
            <div className="santa-wish"><div className="santa-wish-label">Su lista de deseos</div><div className="santa-wish-text"><Linkify text={st.giftee.wishlist} /></div></div>
          </div>
        )}
        {ex.status !== 'open' && st.me.joined && (
          <div className="santa-threads">
            <Thread title={`🎅 Mensaje anónimo a tu amigo secreto`} hint="No sabrá que eres tú" msgs={st.toGiftee || []} placeholder="Una pista, una pregunta…"
              onSend={(b) => act(() => api.post('/santa/messages', { to: 'giftee', body: b }), 'Mensaje enviado 🤫')} />
            <Thread title="🎁 Tu santa secreto" hint="Responde sin saber quién es" msgs={st.fromSanta || []} placeholder="Respóndele a tu santa…"
              onSend={(b) => act(() => api.post('/santa/messages', { to: 'santa', body: b }), 'Respuesta enviada')} />
          </div>
        )}
        {ex.status === 'drawn' && !st.me.joined && <div className="santa-card muted">El sorteo ya se hizo. Esta vez no participaste, pero podrás ver la revelación. 🎉</div>}

        {isAdmin && <AdminPanel st={st} users={users} setSt={(r) => { setSt(r); setWish(r.me?.wishlist || ''); }} />}
        {isAdmin && ex.status === 'revealed' && <button className="btn" onClick={() => setCreating(true)}><Plus size={15} /> Nuevo intercambio</button>}
      </>
    );
  }
  return (
    <Modal title="🎁 Amigo secreto" onClose={close} width={640} className="santa-modal">
      {body}
    </Modal>
  );
}
