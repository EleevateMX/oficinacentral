import React, { useEffect, useRef, useState } from 'react';
import { Music, Volume2, VolumeX, SkipForward, ThumbsUp, Trash2, Play, ListMusic } from 'lucide-react';
import { office, useOffice } from '../lib/store.js';
import { Modal, Avatar } from './ui.jsx';
import { useJukebox, jukeboxState, addSong, voteSong, removeSong, skipSong, setPrefs, unlock, mountHost, startJukebox, serverClock } from '../lib/jukebox.js';
import { skipNeeded, JUKEBOX_MAX_PER_USER, JUKEBOX_MAX_QUEUE } from '@shared/jukebox.js';

const thumb = (id) => `https://i.ytimg.com/vi/${id}/mqdefault.jpg`;
const fmt = (s) => { s = Math.max(0, Math.floor(s)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };

function useTick(ms = 1000) {
  const [, set] = useState(0);
  useEffect(() => { const t = setInterval(() => set((x) => x + 1), ms); return () => clearInterval(t); }, [ms]);
}

// Volumen propio + silencio (no se comparte)
function VolumeControl({ compact = false }) {
  const volume = useJukebox((s) => s.volume);
  const muted = useJukebox((s) => s.muted);
  return (
    <div className={`jb-volume ${compact ? 'compact' : ''}`}>
      <button className="icon-btn" title={muted ? 'Activar sonido' : 'Silenciar'} onClick={() => setPrefs({ muted: !muted })}>
        {muted || volume === 0 ? <VolumeX size={16} /> : <Volume2 size={16} />}
      </button>
      <input type="range" min="0" max="1" step="0.05" value={muted ? 0 : volume} aria-label="Volumen de la rocola"
        onChange={(e) => setPrefs({ volume: Number(e.target.value), muted: false })} style={{ '--v': `${(muted ? 0 : volume) * 100}%` }} />
    </div>
  );
}

export default function JukeboxModal({ objectId }) {
  const me = useOffice((s) => s.me);
  const users = useOffice((s) => s.users);
  const box = useJukebox((s) => s.boxes[objectId]);
  const here = useJukebox((s) => s.here);
  const hereName = useJukebox((s) => s.hereName);
  const listeners = useJukebox((s) => s.listeners);
  const blocked = useJukebox((s) => s.blocked);
  const apiError = useJukebox((s) => s.apiError);
  const duck = useJukebox((s) => s.duck);
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const inputRef = useRef(null);
  useTick(1000);
  useEffect(() => { inputRef.current?.focus(); }, []);
  const close = () => office.set({ modal: null });
  const inZone = here === objectId;
  const isAdmin = me.role === 'admin';
  const cur = box?.current;
  const queue = box?.queue || [];
  const mine = queue.filter((s) => s.addedBy === me.id).length;
  const name = (id) => (id === me.id ? 'ti' : users[id]?.displayName || 'Alguien');

  const submit = async (e) => {
    e.preventDefault();
    if (!url.trim() || busy) return;
    setBusy(true); setErr('');
    const r = await addSong(objectId, url);
    setBusy(false);
    if (r.error) { setErr(r.error); return; }
    setUrl('');
    office.toast({ title: r.started ? '🎵 ¡Sonando en la rocola!' : '🎵 Canción agregada a la fila' });
  };
  const skip = async () => {
    const r = await skipSong(objectId);
    if (r.error) office.toast({ title: r.error, kind: 'error' });
  };

  const elapsed = cur ? (serverClock() - cur.startedAt) / 1000 : 0;
  const pct = cur?.duration ? Math.min(100, (elapsed / cur.duration) * 100) : null;
  const skipVotes = (box?.skipVotes || []).filter((id) => listeners.includes(id)).length;
  const needed = skipNeeded(listeners.length);
  const canForce = cur && (isAdmin || cur.addedBy === me.id);
  const voted = box?.skipVotes?.includes(me.id);

  return (
    <Modal title={<span className="jb-title"><Music size={18} /> Rocola</span>} onClose={close} width={520} className="jb-modal">
      {!inZone && (
        <div className="jb-note">Solo se oye dentro de <b>{hereName || 'su zona'}</b>. Entra para escuchar y votar.</div>
      )}
      <div className={`jb-now ${cur ? 'on' : ''}`}>
        {cur ? (
          <>
            <div className="jb-art" style={{ backgroundImage: `url(${thumb(cur.videoId)})` }}>
              <span className="jb-eq" aria-hidden="true"><i /><i /><i /><i /></span>
            </div>
            <div className="jb-info">
              <div className="jb-kicker">Sonando ahora</div>
              <div className="jb-song" title={cur.title}>{cur.title}</div>
              <div className="jb-by">Puesta por {name(cur.addedBy)}</div>
              <div className="jb-progress">
                <span>{fmt(Math.max(0, elapsed))}</span>
                <div className="jb-bar" key={cur.id}><i style={{ width: pct == null ? '100%' : `${pct}%` }} className={pct == null ? 'unknown' : ''} /></div>
                <span>{cur.duration ? fmt(cur.duration) : '--:--'}</span>
              </div>
            </div>
          </>
        ) : (
          <div className="jb-empty-now">
            <div className="jb-disc" aria-hidden="true" />
            <div>
              <div className="jb-song">La rocola está en silencio</div>
              <div className="jb-by">Pega un enlace de YouTube y pon la primera canción.</div>
            </div>
          </div>
        )}
      </div>

      <div className="jb-controls">
        <VolumeControl />
        {inZone && blocked && cur && <button className="btn primary tiny jb-unlock" onClick={unlock}><Play size={12} /> Toca para escuchar</button>}
        {cur && (inZone || isAdmin) && (
          <button className={`btn tiny ${voted ? 'on' : ''}`} onClick={skip} disabled={!canForce && voted} title={canForce ? 'Saltar esta canción' : 'Se salta si vota la mayoría de quienes la oyen'}>
            <SkipForward size={13} /> {canForce ? 'Saltar' : `Saltar ${skipVotes}/${needed}`}
          </button>
        )}
      </div>
      <label className="jb-duck">
        <input type="checkbox" checked={duck} onChange={(e) => setPrefs({ duck: e.target.checked })} /> Bajar la música cuando platico con alguien
      </label>
      {apiError && <div className="jb-note warn">No se pudo cargar YouTube en este navegador. Revisa tu conexión o bloqueadores.</div>}

      <form className="jb-add" onSubmit={submit}>
        <input ref={inputRef} value={url} onChange={(e) => { setUrl(e.target.value); setErr(''); }} placeholder="Pega un enlace de YouTube…" disabled={!inZone} maxLength={300} />
        <button className="btn primary" disabled={!inZone || busy || !url.trim()}>{busy ? 'Agregando…' : 'Agregar'}</button>
      </form>
      {err && <div className="jb-err">{err}</div>}

      <div className="jb-queue-head">
        <ListMusic size={14} /> <b>Siguientes</b> <span>{queue.length}/{JUKEBOX_MAX_QUEUE}</span>
        <span className="jb-hint">Tú: {mine}/{JUKEBOX_MAX_PER_USER} · se ordena por votos</span>
      </div>
      <div className="jb-queue">
        {!queue.length && <div className="jb-queue-empty">No hay canciones en la fila. ¡Agrega una!</div>}
        {queue.map((s, i) => {
          const votedThis = s.voters.includes(me.id);
          return (
            <div className="jb-item" key={s.id}>
              <span className="jb-pos">{i + 1}</span>
              <img src={thumb(s.videoId)} alt="" loading="lazy" />
              <div className="jb-item-txt">
                <div className="jb-item-title" title={s.title}>{s.title}</div>
                <div className="jb-item-by"><Avatar user={users[s.addedBy]} size={14} showStatus={false} /> {name(s.addedBy)}</div>
              </div>
              <button className={`jb-vote ${votedThis ? 'on' : ''}`} disabled={!inZone} onClick={() => voteSong(objectId, s.id)} title={votedThis ? 'Quitar mi voto' : 'Votar para que suene antes'}>
                <ThumbsUp size={13} /> {s.votes}
              </button>
              {(s.addedBy === me.id || isAdmin) && (
                <button className="icon-btn jb-del" title="Quitar de la fila" onClick={() => removeSong(objectId, s.id)}><Trash2 size={14} /></button>
              )}
            </div>
          );
        })}
      </div>
    </Modal>
  );
}

// Reproductor escondido + aviso "Sonando" en el mapa (siempre montado con el mapa)
export function JukeboxLayer({ hidden = false, below = false }) {
  const hostRef = useRef(null);
  useEffect(() => { mountHost(hostRef.current); return startJukebox(); }, []);
  const here = useJukebox((s) => s.here);
  const cur = useJukebox((s) => (s.here ? s.boxes[s.here]?.current : null));
  const blocked = useJukebox((s) => s.blocked);
  const muted = useJukebox((s) => s.muted);
  const open = () => office.set({ modal: { type: 'jukebox', objectId: jukeboxState().here } });
  return (
    <>
      <div className="jb-host" ref={hostRef} aria-hidden="true" />
      {here && cur && !hidden && (
        <div className={`jb-pill ${blocked ? 'blocked' : ''} ${below ? 'below' : ''}`}>
          <span className="jb-eq small" aria-hidden="true"><i /><i /><i /></span>
          <button className="jb-pill-title" onClick={open} title="Abrir la rocola">
            <b>Sonando</b> {cur.title}
          </button>
          {blocked ? (
            <button className="btn tiny primary" onClick={unlock}><Play size={12} /> Toca para escuchar</button>
          ) : (
            <button className="icon-btn" title={muted ? 'Activar sonido' : 'Silenciar'} onClick={() => setPrefs({ muted: !muted })}>
              {muted ? <VolumeX size={14} /> : <Volume2 size={14} />}
            </button>
          )}
        </div>
      )}
    </>
  );
}
