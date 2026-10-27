// Tarjetita de la mascota: nombre, ánimo y acciones (alimentar, pelota, trucos, acariciar).
import React, { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { petDef } from '@shared/pets.js';
import { office, useOffice } from '../lib/store.js';
import { drawPet } from '../lib/pets.js';
import { petAction, fetchMood, moods, startAim, stopAim, aim, TRICK_NAMES, petNameOf, acts, petStep } from '../lib/petFx.js';
import { since } from '../lib/time.js';

const moodLabel = (h) => (h >= 90 ? '😍 ¡Feliz de la vida!' : h >= 70 ? '😄 Muy feliz' : h >= 45 ? '🙂 Tranqui' : h >= 25 ? '🥺 Quiere jugar' : '💤 Te extraña');

function PetPortrait({ kind, color, owner }) {
  const ref = useRef(null);
  useEffect(() => {
    const c = ref.current;
    const ctx = c.getContext('2d');
    let raf = 0;
    const loop = (t) => {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, c.width, c.height);
      ctx.imageSmoothingEnabled = false;
      ctx.setTransform(3, 0, 0, 3, 0, 0);
      // Repite la animación de la acción en curso (saltos, caricias…) sin moverse
      const pf = ['pet', 'happy', 'trick'].includes(acts[owner]?.kind) ? petStep(owner, { rx: 0, ry: 0, petX: 0, petY: 0 }, t) : null;
      drawPet(ctx, kind, color, 20, 26, pf?.face || 1, t / 1000, false, pf?.fx);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [kind, color, owner]);
  return <canvas ref={ref} width={120} height={90} className="petp-portrait" />;
}

export default function PetPanel() {
  const owner = useOffice((s) => s.petPanel);
  const me = useOffice((s) => s.me);
  const u = useOffice((s) => (owner ? s.users[owner] : null));
  const [info, setInfo] = useState(null);
  const [tricks, setTricks] = useState(false);
  const [, tick] = useState(0);

  useEffect(() => {
    if (!owner) return undefined;
    setInfo(null);
    setTricks(false);
    fetchMood(owner).then((r) => r && setInfo(r));
    const off = office.on('pet:action', (m) => { if (m.owner === owner) fetchMood(owner).then((r) => r && setInfo(r)); });
    const k = (e) => {
      if (e.key !== 'Escape') return;
      if (aim.on) stopAim(); else office.set({ petPanel: null });
    };
    const iv = setInterval(() => tick((x) => x + 1), 1000); // cercanía para acariciar
    window.addEventListener('keydown', k);
    return () => { off(); clearInterval(iv); window.removeEventListener('keydown', k); stopAim(); };
  }, [owner]);

  const pet = u?.avatar?.pet;
  const d = pet && pet !== 'none' ? petDef(pet) : null;
  useEffect(() => { if (owner && (!d || !u?.online)) office.set({ petPanel: null }); }, [owner, d, u?.online]);
  if (!owner || !d || !u) return null;

  const isMine = owner === me.id;
  const name = petNameOf(u);
  const mp = office.players[me.id];
  const op = office.players[owner];
  const near = isMine || (mp && op && mp.floorId === op.floorId && Math.max(Math.abs(mp.x - op.x), Math.abs(mp.y - op.y)) <= 2);
  const h = moods[owner] ?? info?.happiness ?? 70;
  const close = () => office.set({ petPanel: null });
  const throwBall = () => {
    startAim(owner);
    office.toast({ title: `🎾 Haz clic en el mapa para lanzarle la pelota a ${name} (Esc cancela)` });
  };

  return (
    <div className="petp" role="dialog" aria-label={`Mascota ${name}`}>
      <button className="icon-btn petp-x" onClick={close} title="Cerrar"><X size={16} /></button>
      <div className="petp-head">
        <PetPortrait kind={d.id} color={u.avatar.petColor} owner={owner} />
        <div className="petp-id">
          <b>{name}</b>
          <span>{d.name}{isMine ? '' : ` · de ${u.displayName?.split(' ')[0]}`}</span>
          <div className="petp-mood" title={`Felicidad: ${h}/100`}>
            <div className="petp-bar"><i style={{ width: `${h}%` }} /></div>
            <small>{moodLabel(h)}</small>
          </div>
        </div>
      </div>
      {isMine && info?.lastFed && <div className="petp-note">{Date.now() - info.lastFed < 60e3 ? '😋 Acaba de comer' : `🍖 Comió hace ${since(info.lastFed)}`}</div>}
      <div className="petp-actions">
        {isMine && <button className="btn" onClick={() => petAction('feed', owner)}>🍖 Alimentar</button>}
        <button className="btn" disabled={!near} onClick={throwBall}>🎾 Lanzar pelota</button>
        {isMine && <button className={`btn ${tricks ? 'on' : ''}`} onClick={() => setTricks(!tricks)}>✨ Truco</button>}
        <button className="btn" disabled={!near} onClick={() => petAction('pet', owner)}>❤️ Acariciar</button>
      </div>
      {isMine && tricks && (
        <div className="petp-tricks">
          {Object.entries(TRICK_NAMES).map(([k, label]) => <button key={k} className="chip-btn" onClick={() => petAction('trick', owner, { trick: k })}>{label}</button>)}
        </div>
      )}
      {!near && <div className="petp-note">Acércate a {name} para acariciar o jugar</div>}
    </div>
  );
}
