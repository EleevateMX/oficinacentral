import React, { useEffect, useState } from 'react';
import { Pin, Trash2 } from 'lucide-react';
import { office, useOffice } from '../lib/store.js';
import { api } from '../lib/api.js';
import { Modal, Avatar } from './ui.jsx';
import { fmtRelative } from '../lib/time.js';

const COLORS = { yellow: '#fff3a8', pink: '#ffc9de', blue: '#c9e4ff', green: '#c9f2d4', white: '#ffffff' };

// Tablero de anuncios de toda la oficina
export default function Notices() {
  const me = useOffice((s) => s.me);
  const users = useOffice((s) => s.users);
  const [list, setList] = useState([]);
  const [text, setText] = useState('');
  const [color, setColor] = useState('yellow');
  const close = () => office.set({ modal: null });

  const load = () => api.get('/notices').then((r) => setList(r.notices)).catch(() => {});
  useEffect(() => {
    load();
    const s = office.socket;
    s?.on('notices', load);
    s?.on('notice', load);
    return () => { s?.off('notices', load); s?.off('notice', load); };
  }, []);

  const post = async (e) => {
    e.preventDefault();
    try { await api.post('/notices', { text, color }); setText(''); } catch (err) { office.toast({ title: err.message, kind: 'error' }); }
  };
  const act = (fn) => fn.catch((err) => office.toast({ title: err.message, kind: 'error' }));

  return (
    <Modal title="Tablero de anuncios" onClose={close} width={860} className="notices-modal">
      <form className="notice-form" onSubmit={post}>
        <textarea placeholder="Escribe un anuncio para todo el equipo…" value={text} onChange={(e) => setText(e.target.value)} maxLength={500} rows={2} />
        <div className="row between">
          <div className="row gap4">
            {Object.entries(COLORS).map(([k, c]) => (
              <button type="button" key={k} className={`sw ${color === k ? 'on' : ''}`} style={{ background: c }} onClick={() => setColor(k)} aria-label={`Nota ${k}`} />
            ))}
          </div>
          <button className="btn primary" type="submit" disabled={!text.trim()}>Publicar</button>
        </div>
      </form>
      <div className="notice-grid">
        {list.map((n) => {
          const u = users[n.authorId];
          const mine = n.authorId === me.id || me.role === 'admin';
          return (
            <div key={n.id} className={`notice ${n.pinned ? 'pinned' : ''}`} style={{ background: COLORS[n.color] }}>
              {n.pinned && <Pin size={14} className="notice-pin" />}
              <div className="notice-text">{n.text}</div>
              <div className="notice-foot">
                {u && <Avatar user={u} size={20} showStatus={false} />}
                <span>{u?.displayName || 'Alguien'} · {fmtRelative(n.createdAt)}</span>
                <span className="flex1" />
                {me.role === 'admin' && <button className="icon-btn" title={n.pinned ? 'Desfijar' : 'Fijar arriba'} onClick={() => act(api.patch(`/notices/${n.id}`, { pinned: !n.pinned }))}><Pin size={13} /></button>}
                {mine && <button className="icon-btn" title="Borrar" onClick={() => confirm('¿Borrar este anuncio?') && act(api.del(`/notices/${n.id}`))}><Trash2 size={13} /></button>}
              </div>
            </div>
          );
        })}
        {!list.length && <div className="muted pad">Aún no hay anuncios.</div>}
      </div>
    </Modal>
  );
}
