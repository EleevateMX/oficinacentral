import React, { useEffect, useMemo, useRef, useState } from 'react';
import { X, Trophy, Users, LogOut } from 'lucide-react';
import { office, useOffice } from '../lib/store.js';
import { playSound } from '../lib/sounds.js';
import { api } from '../lib/api.js';
import { GAMES } from '../games/index.js';

const SEAT_COLORS = ['#FE3377', '#3a86ff', '#FFCC00', '#2bb673'];
const POINT_GAMES = ['arcade', 'zombies'];

// Ventana de juego: se sienta a quien llega (2 asientos; el arcade, 1) y los demás miran
export default function GameModal({ objectId, game, floorId }) {
  const def = GAMES[game];
  const me = useOffice((s) => s.me);
  const users = useOffice((s) => s.users);
  const vol = useOffice((s) => s.prefs.audio.notifVolume);
  const [room, setRoom] = useState(null);
  const [mod, setMod] = useState(null);
  const [status, setStatus] = useState('');
  const [top, setTop] = useState(null);
  const [banner, setBanner] = useState(null);
  const canvasRef = useRef(null);
  const handlers = useRef({ input: [], state: [], event: [], room: [] });
  const roomRef = useRef(null);
  const close = () => office.set({ modal: null });

  useEffect(() => { def.load().then(setMod); }, [def]);

  // Entrar y salir de la mesa
  useEffect(() => {
    const s = office.socket;
    if (!s) return undefined;
    const onRoom = (r) => { if (r.objectId !== objectId) return; roomRef.current = r; setRoom(r); for (const f of handlers.current.room) f(r); };
    const onInput = (m) => { if (m.objectId === objectId) for (const f of handlers.current.input) f(m.seat, m.data); };
    const onState = (m) => { if (m.objectId === objectId) for (const f of handlers.current.state) f(m.data); };
    const onEvent = (m) => { if (m.objectId === objectId) for (const f of handlers.current.event) f(m.seat, m.data); };
    const onWin = (m) => {
      if (m.objectId !== objectId) return;
      const w = office.state.users[m.winner]?.displayName || 'Alguien';
      const l = office.state.users[m.loser]?.displayName || 'alguien';
      setBanner(`🏆 ${w} le ganó a ${l}${m.score ? ` ${m.score}` : ''}`);
      setTimeout(() => setBanner(null), 6000);
    };
    s.on('game:room', onRoom);
    s.on('game:input', onInput);
    s.on('game:state', onState);
    s.on('game:event', onEvent);
    s.on('game:win', onWin);
    s.emit('game:join', objectId);
    // Si se cayó la conexión y volvió, se vuelve a entrar a la mesa
    const rejoin = () => s.emit('game:join', objectId);
    s.on('connect', rejoin);
    return () => {
      s.off('connect', rejoin);
      s.emit('game:leave', objectId);
      s.off('game:room', onRoom);
      s.off('game:input', onInput);
      s.off('game:state', onState);
      s.off('game:event', onEvent);
      s.off('game:win', onWin);
    };
  }, [objectId]);

  const seats = room?.seats || [null, null];
  const seat = seats.indexOf(me.id);
  // Juegos "persistentes" (Zombies): no se reinician cuando alguien entra o sale; se enteran por onRoom
  const persistent = !!mod?.meta?.persistent;
  const rosterKey = persistent ? `p:${seat >= 0}` : `${seats.join('|')}|${seat}`;
  const players = useMemo(() => seats.map((id, i) => (id ? { id, name: users[id]?.displayName?.split(' ')[0] || '…', color: SEAT_COLORS[i] } : null)), [rosterKey, seats.join('|')]); // eslint-disable-line react-hooks/exhaustive-deps

  // Arranca (o reinicia) el juego cada vez que cambian los jugadores
  useEffect(() => {
    if (!mod || !room || !canvasRef.current) return undefined;
    handlers.current = { input: [], state: [], event: [], room: [] };
    const s = office.socket;
    const ctx = {
      seat,
      host: persistent ? room.host === me.id : seat === 0,
      players,
      me: me.id,
      objectId,
      floorId,
      room,
      volume: Math.max(0.25, vol),
      onRoom: (f) => handlers.current.room.push(f),
      close,
      sit: () => s.emit('game:sit', objectId),
      sendInput: (data) => s.emit('game:input', { objectId, data }),
      sendState: (data) => s.emit('game:state', { objectId, data }),
      sendEvent: (data) => s.emit('game:event', { objectId, data }),
      onInput: (f) => handlers.current.input.push(f),
      onState: (f) => handlers.current.state.push(f),
      onEvent: (f) => handlers.current.event.push(f),
      sound: (name) => playSound(name, Math.max(0.25, vol)),
      status: setStatus,
      submitScore: (n) => api.post(`/games/${POINT_GAMES.includes(game) ? game : 'arcade'}/score`, { score: n }).then((r) => { setTop(r.top); return r; }).catch(() => {}),
    };
    setStatus('');
    const inst = mod.create(canvasRef.current, ctx);
    return () => inst?.destroy?.();
  }, [mod, rosterKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const loadTop = () => (top ? setTop(null) : api.get(`/games/${game}/top`).then((r) => setTop(r.top)).catch(() => {}));
  const meta = mod?.meta || { w: 800, h: 450, help: '' };
  const watchers = room?.watchers || [];
  const vs = game === 'arcade'
    ? (players[0] ? `Juega ${players[0].name}` : '')
    : game === 'zombies'
      ? `Equipo (${players.filter(Boolean).length}/${seats.length}): ${players.filter(Boolean).map((p) => p.name).join(', ')}`
      : `${players[0]?.name || '…'} vs ${players[1]?.name || 'la computadora 🤖'}`;

  return (
    <div className="modal-backdrop game-backdrop" onMouseDown={(e) => e.target === e.currentTarget && !persistent && close()}>
      <div className={`game-modal${mod?.meta?.wide ? ' game-wide' : ''}`} role="dialog" aria-modal="true" aria-label={def.name}>
        <div className="game-head">
          <b>{def.emoji} {def.name}</b>
          <span className="game-vs">{vs}</span>
          {seat < 0 && room && <span className="game-tag">Estás mirando</span>}
          <span className="flex1" />
          {watchers.length > 0 && <span className="game-watch" title={watchers.map((id) => users[id]?.displayName).join(', ')}><Users size={14} /> {watchers.length}</span>}
          <button className="icon-btn" onClick={loadTop} title="Mejores jugadores"><Trophy size={17} /></button>
          {persistent && <button className="btn small game-back" onClick={close}><LogOut size={14} /> Volver a la oficina</button>}
          <button className="icon-btn" onClick={close} aria-label="Cerrar"><X size={18} /></button>
        </div>
        <div className="game-stage">
          <canvas key={persistent ? rosterKey : 'c'} ref={canvasRef} width={meta.w} height={meta.h} style={{ aspectRatio: `${meta.w} / ${meta.h}` }} tabIndex={0} />
          {!mod && <div className="game-loading">Cargando…</div>}
          {banner && <div className="game-banner">{banner}</div>}
          {top && (
            <div className="game-top">
              <div className="game-top-head"><Trophy size={15} /> {POINT_GAMES.includes(game) ? 'Mejores puntuaciones' : 'Más partidas ganadas'}<button className="icon-btn" onClick={() => setTop(null)}><X size={14} /></button></div>
              {top.length ? top.map((r, i) => (
                <div key={r.userId} className={`game-top-row ${r.userId === me.id ? 'me' : ''}`}>
                  <span>{['🥇', '🥈', '🥉'][i] || `${i + 1}.`}</span>
                  <span className="flex1">{users[r.userId]?.displayName || 'Alguien'}</span>
                  <b>{r.score}</b>
                </div>
              )) : <div className="muted small">Todavía nadie. ¡Sé el primero!</div>}
            </div>
          )}
        </div>
        <div className="game-foot">
          <span className="game-status">{status}</span>
          <span className="game-help">{meta.help}</span>
        </div>
      </div>
    </div>
  );
}
