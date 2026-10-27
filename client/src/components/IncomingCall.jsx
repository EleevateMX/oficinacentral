import React from 'react';
import { Navigation, MessageCircle, PhoneOff } from 'lucide-react';
import { office, useOffice } from '../lib/store.js';
import { Avatar } from './ui.jsx';

// Aviso grande cuando alguien te llama: primero "ir con él", luego mensaje o rechazar
export default function IncomingCall() {
  const call = useOffice((s) => s.incomingCall);
  const u = useOffice((s) => (call ? s.users[call.from] : null));
  if (!call || !u) return null;
  const first = u.displayName.split(' ')[0];
  return (
    <div className="incoming-call" role="alertdialog" aria-label={`${u.displayName} te está llamando`}>
      <div className="ic-ring"><Avatar user={u} size={56} ring /></div>
      <div className="ic-text">
        <b>{u.displayName}</b>
        <span>te está llamando…</span>
      </div>
      <div className="ic-actions">
        <button className="btn primary" onClick={() => office.answerCall(true)}><Navigation size={15} /> Ir con {first}</button>
        <button className="btn" onClick={() => { office.answerCall(false); office.openConv(`d:${u.id}`); }}><MessageCircle size={15} /> Mensaje</button>
        <button className="btn ghost" onClick={() => office.answerCall(false)}><PhoneOff size={15} /> Ahora no</button>
      </div>
    </div>
  );
}
