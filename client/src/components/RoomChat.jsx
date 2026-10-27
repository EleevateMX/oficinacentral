// Chat de la sala: mensajes rápidos a quienes te oyen ahora (no se guardan).
import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { MessageSquare, X, Send } from 'lucide-react';
import { office, useOffice } from '../lib/store.js';
import { Avatar } from './ui.jsx';
import { fmtTime } from '../lib/time.js';

export default function RoomChat() {
  const open = useOffice((s) => s.roomChatOpen);
  const list = useOffice((s) => s.roomChat);
  const unread = useOffice((s) => s.roomUnread);
  const users = useOffice((s) => s.users);
  const me = useOffice((s) => s.me);
  const talking = useOffice((s) => s.talkingWith);
  const space = useOffice((s) => s.space);
  const [text, setText] = useState('');
  const scroll = useRef(null);
  const input = useRef(null);

  useLayoutEffect(() => { if (scroll.current) scroll.current.scrollTop = scroll.current.scrollHeight; }, [list.length, open]);
  useEffect(() => { if (open) input.current?.focus(); }, [open]);

  // Enter en el mapa abre el chat de la sala
  useEffect(() => {
    const k = (e) => {
      const el = document.activeElement;
      if (e.key !== 'Enter' || office.state.view !== 'map' || office.state.modal || (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable))) return;
      e.preventDefault();
      office.set({ roomChatOpen: true, roomUnread: 0 });
    };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, []);

  const where = space?.startsWith('desk:') ? 'este escritorio' : space?.startsWith('area:') ? 'esta sala' : 'cerca de ti';
  const send = (e) => {
    e.preventDefault();
    office.sendRoomMsg(text);
    setText('');
  };

  if (!open) {
    return (
      <button className="room-chat-btn" onClick={() => office.set({ roomChatOpen: true, roomUnread: 0 })} title="Chat de la sala (Enter)">
        <MessageSquare size={16} /> Sala
        {unread > 0 && <span className="badge inline">{unread}</span>}
      </button>
    );
  }
  return (
    <div className="room-chat">
      <div className="room-chat-head">
        <MessageSquare size={15} />
        <span className="flex1">Chat de {where}</span>
        <button className="icon-btn" onClick={() => office.set({ roomChatOpen: false })} aria-label="Cerrar"><X size={16} /></button>
      </div>
      <div className="room-chat-list" ref={scroll}>
        {!list.length && <div className="muted small pad">Lo que escribas aquí lo ven solo quienes te oyen ahora y no se guarda.</div>}
        {list.map((m) => (
          <div key={m.id} className={`room-msg ${m.from === me.id ? 'mine' : ''}`}>
            <Avatar user={users[m.from]} size={22} showStatus={false} />
            <div>
              <div className="room-msg-meta"><b>{m.from === me.id ? 'Tú' : users[m.from]?.displayName}</b> {fmtTime(m.at)}</div>
              <div className="room-msg-text">{m.text}</div>
            </div>
          </div>
        ))}
      </div>
      <form className="room-chat-input" onSubmit={send}>
        <input ref={input} value={text} onChange={(e) => setText(e.target.value)} maxLength={500}
          placeholder={talking.length ? `Escribe a ${talking.length} persona${talking.length > 1 ? 's' : ''}…` : 'No hay nadie cerca'}
          onKeyDown={(e) => { if (e.key === 'Escape') { office.set({ roomChatOpen: false }); e.currentTarget.blur(); } }} />
        <button className="icon-btn" disabled={!text.trim()} aria-label="Enviar"><Send size={15} /></button>
      </form>
    </div>
  );
}
