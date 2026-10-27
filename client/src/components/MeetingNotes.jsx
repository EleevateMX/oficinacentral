// "📝 Tomar notas": botón dentro de una sala (con 2+ personas), aviso visible para todos
// mientras está activo y la tarjeta del resumen en el chat.
import React, { useEffect, useState } from 'react';
import { areaAt } from '@shared/map.js';
import { office, useOffice } from '../lib/store.js';
import { notesEnabled, notesIn, speechSupported, setTranscribing, startNotes, stopNotes } from '../lib/notes.js';

// Cuántas personas hay en la sala (se revisa cada segundo: moverse no re-renderiza)
function usePeopleIn(floor, areaId) {
  const [n, setN] = useState(0);
  useOffice((s) => s.presenceVersion);
  useEffect(() => {
    if (!floor || areaId == null) { setN(0); return undefined; }
    const count = () => {
      let c = 0;
      for (const p of Object.values(office.players)) if (p.floorId === floor.id && areaAt(floor, p.x, p.y)?.id === areaId) c++;
      setN(c);
    };
    count();
    const t = setInterval(count, 1000);
    return () => clearInterval(t);
  }, [floor, areaId]);
  return n;
}

export default function MeetingNotes({ room, hidden }) {
  const config = useOffice((s) => s.config);
  const floor = useOffice((s) => s.floor);
  const users = useOffice((s) => s.users);
  const me = useOffice((s) => s.me);
  const mic = useOffice((s) => s.media.mic);
  const session = useOffice((s) => notesIn(s, room?.id));
  const people = usePeopleIn(floor, room?.id);
  const enabled = notesEnabled(config);
  const active = !!(session && room && enabled);

  // Transcribir solo mi micrófono, y solo mientras las notas están activas aquí
  useEffect(() => {
    setTranscribing(active && !!mic, (text) => office.socket?.emit('notes:segment', { text, at: Date.now() }));
  }, [active, mic]);
  useEffect(() => () => setTranscribing(false), []);

  if (!room || hidden || !enabled) return null;
  if (!active) {
    if (people < 2) return null;
    return (
      <button className="notes-start" onClick={() => startNotes(office, room.id)} title="Transcribe lo que se dice en la sala y, al terminar, deja un resumen con acuerdos y pendientes en el chat. Todos verán el aviso.">
        📝 Tomar notas
      </button>
    );
  }
  const by = session.by === me.id ? 'Tú lo activaste' : `Lo activó ${users[session.by]?.displayName || 'alguien'}`;
  return (
    <div className="notes-pill" role="status">
      <span className="notes-dot" aria-hidden="true" />
      <span className="notes-text">
        <b>📝 Tomando notas con IA</b>
        <small>{by}</small>
        {!speechSupported() ? <small className="notes-warn">Tu navegador no transcribe; usa Chrome o Edge</small>
          : !mic ? <small className="notes-warn">Micro apagado: no se anota lo que dices</small> : null}
      </span>
      <button className="btn tiny" onClick={() => stopNotes(office, room.id)}>Apagar</button>
    </div>
  );
}

// Tarjeta del resumen en el chat: título, encabezados de sección y viñetas
const SECTIONS = /^(Resumen|Acuerdos|Pendientes|Temas abiertos)\s*:?$/i;

export function NotesCard({ text }) {
  const lines = String(text || '').split('\n');
  const [head, meta, ...rest] = lines;
  const footer = rest.length && rest[rest.length - 1].startsWith('— Generado con IA') ? rest.pop() : null;
  let titleDone = false;
  return (
    <div className="notes-card">
      <div className="notes-card-head">{head}</div>
      {meta && <div className="notes-card-meta">{meta}</div>}
      <div className="notes-card-body">
        {rest.map((l, i) => {
          const t = l.trim();
          if (!t) return null;
          if (SECTIONS.test(t)) return <div key={i} className="notes-card-sec">{t.replace(/:$/, '')}</div>;
          if (/^[•\-—*]\s?/.test(t)) return <div key={i} className="notes-card-li">{t.replace(/^[•\-—*]\s?/, '')}</div>;
          if (!titleDone) { titleDone = true; return <div key={i} className="notes-card-title">{t.replace(/^#+\s*/, '')}</div>; }
          return <div key={i} className="notes-card-p">{t}</div>;
        })}
      </div>
      {footer && <div className="notes-card-foot">{footer.replace(/^—\s*/, '')}</div>}
    </div>
  );
}
