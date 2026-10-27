// Escenario con micrófono: botón "Levantar la mano" para el público y, para quien está
// en el escenario, la fila de manos levantadas con "Dar la palabra" y "Bajar mano".
import React from 'react';
import { Mic, Hand } from 'lucide-react';
import { office, useOffice } from '../lib/store.js';
import { raiseHand, lowerHand, giveFloor } from '../lib/stage.js';
import { Avatar } from './ui.jsx';

export default function StagePanel() {
  const stage = useOffice((s) => s.stage);
  const users = useOffice((s) => s.users);
  const meId = useOffice((s) => s.me.id);
  if (!stage?.inScope) return null;
  const queue = stage.queue || [];
  const speakers = (stage.speakers || []).filter((id) => users[id]);
  const where = stage.areaName ? `toda el área ${stage.areaName}` : 'todos alrededor';

  if (stage.onStage) {
    return (
      <div className="stage-panel">
        <div className="stage-head">
          <span className="stage-ico"><Mic size={15} /></span>
          <div>
            <b>Estás en el escenario</b>
            <small>Te oye {where}</small>
          </div>
        </div>
        <div className="stage-sub">Manos levantadas ({queue.length})</div>
        {queue.length === 0 && <div className="stage-empty">Nadie ha levantado la mano todavía.</div>}
        <ol className="stage-queue">
          {queue.map((id, i) => {
            const u = users[id];
            return (
              <li key={id}>
                <span className="stage-pos">{i + 1}</span>
                {u && <Avatar user={u} size={24} />}
                <span className="stage-name">{u?.displayName || 'Alguien'}</span>
                <button className="btn tiny primary" onClick={() => giveFloor(office, id)}>Dar la palabra</button>
                <button className="btn tiny ghost" onClick={() => lowerHand(office, id)} title="Bajar su mano">Bajar</button>
              </li>
            );
          })}
        </ol>
      </div>
    );
  }

  const pos = queue.indexOf(meId);
  return (
    <div className="stage-pill">
      <span className="stage-ico"><Mic size={14} /></span>
      <span className="stage-pill-text">
        {speakers.length
          ? <><b>{speakers.slice(0, 2).map((id) => users[id].displayName).join(', ')}{speakers.length > 2 ? ` +${speakers.length - 2}` : ''}</b> en el escenario</>
          : <><b>Escenario</b> · nadie arriba</>}
        {queue.length > 0 && <span className="stage-count"> · ✋ {queue.length}</span>}
      </span>
      {pos >= 0 ? (
        <button className="btn tiny stage-hand on" onClick={() => lowerHand(office)} title="Bajar la mano">
          <Hand size={12} /> Vas #{pos + 1} · Bajar
        </button>
      ) : (
        <button className="btn tiny stage-hand" onClick={() => raiseHand(office)}>
          <Hand size={12} /> Levantar la mano
        </button>
      )}
    </div>
  );
}
