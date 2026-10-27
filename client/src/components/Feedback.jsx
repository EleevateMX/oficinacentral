// Enviar comentario: ideas o fallas, con captura del mapa y datos del navegador.
import React, { useEffect, useState } from 'react';
import { Lightbulb, Bug, MessageCircle, Check } from 'lucide-react';
import { office, useOffice } from '../lib/store.js';
import { Modal, Toggle } from './ui.jsx';

const KINDS = [
  { id: 'bug', label: 'Algo no funciona', icon: Bug },
  { id: 'idea', label: 'Tengo una idea', icon: Lightbulb },
  { id: 'other', label: 'Otro comentario', icon: MessageCircle },
];

function snapshot() {
  const c = document.querySelector('.map-wrap canvas');
  if (!c || office.state.view !== 'map') return null;
  try { return c.toDataURL('image/jpeg', 0.75); } catch { return null; }
}

export default function Feedback() {
  const [kind, setKind] = useState('bug');
  const [text, setText] = useState('');
  const [shot, setShot] = useState(null);
  const [withShot, setWithShot] = useState(true);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const media = useOffice((s) => s.media);
  const close = () => office.set({ modal: null });

  useEffect(() => { setShot(snapshot()); }, []);

  const send = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      let fileId = null;
      if (withShot && shot) {
        const blob = await (await fetch(shot)).blob();
        const r = await fetch('/api/files', { method: 'POST', headers: { 'Content-Type': 'image/jpeg', 'X-File-Name': 'captura.jpg' }, body: blob });
        if (r.ok) fileId = (await r.json()).file.id;
      }
      const res = await fetch('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          kind, text, fileId,
          meta: {
            screen: `${window.innerWidth}×${window.innerHeight} @${window.devicePixelRatio}x`,
            view: office.state.view,
            where: office.spaceLabel?.() || '',
            media: ['mic', 'cam', 'screen'].filter((k) => media[k]).join('+') || 'ninguno',
            url: location.pathname,
          },
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'No se pudo enviar');
      setDone(true);
    } catch (err) {
      office.toast({ title: err.message, kind: 'error' });
    }
    setBusy(false);
  };

  if (done) {
    return (
      <Modal title="¡Gracias!" onClose={close} width={420}>
        <div className="feedback-done"><Check size={28} /> Tu comentario llegó al equipo que administra la oficina.</div>
        <button className="btn primary block" onClick={close}>Cerrar</button>
      </Modal>
    );
  }
  return (
    <Modal title="Enviar comentario" onClose={close} width={520}>
      <form className="form" onSubmit={send}>
        <div className="feedback-kinds">
          {KINDS.map(({ id, label, icon: Icon }) => (
            <button type="button" key={id} className={`feedback-kind ${kind === id ? 'on' : ''}`} onClick={() => setKind(id)}><Icon size={18} /> {label}</button>
          ))}
        </div>
        <textarea rows={5} required maxLength={3000} autoFocus value={text} onChange={(e) => setText(e.target.value)}
          placeholder={kind === 'bug' ? '¿Qué estabas haciendo y qué pasó? Ej. "Compartí pantalla en la Sala Sur y Ana no la veía".' : kind === 'idea' ? '¿Qué te gustaría que hiciera la oficina?' : 'Escribe tu comentario'} />
        {shot && (
          <label className="feedback-shot">
            <img src={shot} alt="Captura del mapa" />
            <span className="flex1">Incluir captura del mapa</span>
            <Toggle checked={withShot} onChange={setWithShot} />
          </label>
        )}
        <div className="muted small">También se envía tu navegador, tamaño de pantalla y dónde estás en la oficina, para poder reproducir el problema.</div>
        <button className="btn primary" disabled={busy || !text.trim()}>{busy ? 'Enviando…' : 'Enviar'}</button>
      </form>
    </Modal>
  );
}

// Lista para administradores (Preferencias → Comentarios)
export function FeedbackAdmin({ api }) {
  const users = useOffice((s) => s.users);
  const [status, setStatus] = useState('nuevo');
  const [data, setData] = useState({ feedback: [], counts: {} });
  const load = () => api.get(`/admin/feedback?status=${status}`).then(setData).catch((e) => office.toast({ title: e.message, kind: 'error' }));
  useEffect(() => { load(); }, [status]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => office.on('feedback', load), [status]); // eslint-disable-line react-hooks/exhaustive-deps
  const set = (f, st) => api.patch(`/admin/feedback/${f.id}`, { status: st }).then(load);
  const label = { bug: '🐞 Falla', idea: '💡 Idea', other: '💬 Otro' };
  return (
    <div className="pref-section">
      <div className="seg">
        {[['nuevo', 'Nuevos'], ['visto', 'Vistos'], ['resuelto', 'Resueltos']].map(([k, l]) => (
          <button key={k} className={status === k ? 'on' : ''} onClick={() => setStatus(k)}>{l} ({data.counts[k] || 0})</button>
        ))}
      </div>
      <div className="feedback-list">
        {!data.feedback.length && <div className="muted pad">Nada por aquí.</div>}
        {data.feedback.map((f) => (
          <div key={f.id} className="feedback-item">
            <div className="row between">
              <b>{label[f.kind]} · {users[f.userId]?.displayName || 'Alguien'}</b>
              <span className="muted small">{new Date(f.createdAt).toLocaleString('es-MX', { dateStyle: 'short', timeStyle: 'short' })}</span>
            </div>
            <div className="feedback-text">{f.text}</div>
            {f.file && <a href={f.file.url} target="_blank" rel="noreferrer"><img className="feedback-thumb" src={f.file.url} alt="Captura" /></a>}
            <div className="muted small">{[f.meta.view, f.meta.where, f.meta.media && `medios: ${f.meta.media}`, f.meta.screen].filter(Boolean).join(' · ')}</div>
            <div className="muted small ellipsis" title={f.meta.ua}>{f.meta.ua}</div>
            <div className="row gap8">
              {f.status !== 'visto' && <button className="btn tiny" onClick={() => set(f, 'visto')}>Marcar como visto</button>}
              {f.status !== 'resuelto' && <button className="btn tiny primary" onClick={() => set(f, 'resuelto')}>Resuelto</button>}
              {f.status !== 'nuevo' && <button className="btn tiny" onClick={() => set(f, 'nuevo')}>Volver a nuevo</button>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
