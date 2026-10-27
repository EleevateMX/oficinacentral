// Transmisiones de pantalla al estilo Discord: ver a elección, mosaico,
// espectadores, volumen por transmisión y dibujar encima.
import React, { useEffect, useRef, useState } from 'react';
import { X, PictureInPicture2, Volume2, VolumeX, Expand, LayoutGrid, Square, Pencil, Eye, MonitorUp, Minimize2, Radio } from 'lucide-react';
import { office, useOffice } from '../lib/store.js';
import { Avatar } from './ui.jsx';

// Quiénes transmiten en tu sala (y tú, si transmites)
export function useLive() {
  const users = useOffice((s) => s.users);
  const talking = useOffice((s) => s.talkingWith);
  const me = useOffice((s) => s.me);
  const media = useOffice((s) => s.media);
  useOffice((s) => s.presenceVersion);
  const list = talking.filter((id) => users[id]?.online && users[id]?.screen);
  return media.screen ? [me.id, ...list] : list;
}

// Stream de una pantalla: la mía (local) o la que llega de otra persona
function useStreamOf(id) {
  const peers = useOffice((s) => s.peers);
  const me = useOffice((s) => s.me);
  useOffice((s) => s.media.screen);
  if (id === me.id) return office.media?.screenStream || null;
  return peers.find((p) => p.id === id)?.screen || null;
}

// Barra "En vivo": tarjetas para ver cada transmisión y tu propio estado
export function LiveBar() {
  const live = useLive();
  const users = useOffice((s) => s.users);
  const me = useOffice((s) => s.me);
  const watching = useOffice((s) => s.watching);
  const stageOpen = useOffice((s) => s.stageOpen);
  const viewers = useOffice((s) => s.media.viewers) || [];
  if (!live.length) return null;
  return (
    <div className="live-bar">
      {live.map((id) => {
        const mine = id === me.id;
        const on = watching.includes(id);
        return (
          <div key={id} className={`live-card ${on ? 'on' : ''}`}>
            <span className="live-dot">EN VIVO</span>
            <Avatar user={users[id]} size={22} showStatus={false} />
            <span className="live-name">{mine ? 'Tú' : users[id]?.displayName}</span>
            {mine ? (
              <>
                <span className="live-viewers" title={viewers.map((v) => users[v]?.displayName).join(', ') || 'Nadie aún'}><Eye size={13} /> {viewers.length}</span>
                <button className="btn tiny" onClick={() => (on ? office.set({ stage: id, stageOpen: true }) : office.watch(id))}>Vista previa</button>
                <button className="btn tiny danger" onClick={() => office.toggleScreen()}>Detener</button>
              </>
            ) : on ? (
              <button className="btn tiny" onClick={() => office.set({ stage: id, stageOpen: true })}>{stageOpen ? 'Viendo' : 'Abrir'}</button>
            ) : (
              <button className="btn tiny primary" onClick={() => office.watch(id)}>Ver</button>
            )}
          </div>
        );
      })}
    </div>
  );
}

// Capa para dibujar encima de una pantalla (se borra sola a los pocos segundos)
function AnnotLayer({ sharer, videoRef, enabled, color }) {
  const ref = useRef(null);
  const strokes = useRef([]);
  const cur = useRef(null);

  useEffect(() => {
    const s = office.socket;
    s?.emit('annot:join', sharer);
    const on = (m) => { if (m.sharer === sharer) strokes.current.push({ c: m.c, p: m.p, t: performance.now() }); };
    s?.on('annot', on);
    let raf;
    const draw = () => {
      raf = requestAnimationFrame(draw);
      const c = ref.current;
      const v = videoRef.current;
      if (!c || !v) return;
      const r = c.getBoundingClientRect();
      if (c.width !== Math.round(r.width) || c.height !== Math.round(r.height)) { c.width = Math.round(r.width); c.height = Math.round(r.height); }
      const ctx = c.getContext('2d');
      ctx.clearRect(0, 0, c.width, c.height);
      const box = contentBox(v, c.width, c.height);
      const now = performance.now();
      strokes.current = strokes.current.filter((st) => now - st.t < 4000);
      for (const st of [...strokes.current, ...(cur.current ? [cur.current] : [])]) {
        const age = st === cur.current ? 0 : now - st.t;
        ctx.globalAlpha = age < 2500 ? 1 : 1 - (age - 2500) / 1500;
        ctx.strokeStyle = st.c; ctx.lineWidth = 4; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
        ctx.shadowColor = st.c; ctx.shadowBlur = 6;
        ctx.beginPath();
        st.p.forEach(([x, y], i) => ctx[i ? 'lineTo' : 'moveTo'](box.x + x * box.w, box.y + y * box.h));
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    };
    raf = requestAnimationFrame(draw);
    return () => { cancelAnimationFrame(raf); s?.off('annot', on); s?.emit('annot:leave', sharer); };
  }, [sharer]); // eslint-disable-line react-hooks/exhaustive-deps

  const pos = (e) => {
    const c = ref.current;
    const r = c.getBoundingClientRect();
    const box = contentBox(videoRef.current, r.width, r.height);
    return [Math.max(0, Math.min(1, (e.clientX - r.left - box.x) / box.w)), Math.max(0, Math.min(1, (e.clientY - r.top - box.y) / box.h))];
  };
  const down = (e) => { if (!enabled) return; e.currentTarget.setPointerCapture(e.pointerId); cur.current = { c: color, p: [pos(e)], t: performance.now() }; };
  const move = (e) => { if (cur.current && cur.current.p.length < 300) cur.current.p.push(pos(e)); };
  const up = () => {
    const st = cur.current;
    if (!st) return;
    cur.current = null;
    st.t = performance.now();
    strokes.current.push(st);
    office.socket?.emit('annot', { sharer, c: st.c, p: st.p });
  };
  return <canvas ref={ref} className={`annot ${enabled ? 'drawing' : ''}`} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} />;
}

// Rectángulo donde realmente se ve el video (object-fit: contain)
function contentBox(v, w, h) {
  const vw = v?.videoWidth || 16, vh = v?.videoHeight || 9;
  const k = Math.min(w / vw, h / vh);
  return { x: (w - vw * k) / 2, y: (h - vh * k) / 2, w: vw * k, h: vh * k };
}

const PEN_COLORS = ['#FE3377', '#FFCC00', '#3a86ff', '#2bb673', '#ffffff'];

function StreamTile({ id, focused, compact }) {
  const users = useOffice((s) => s.users);
  const me = useOffice((s) => s.me);
  const allViewers = useOffice((s) => s.users);
  const stream = useStreamOf(id);
  const videoRef = useRef(null);
  const boxRef = useRef(null);
  const [vol, setVol] = useState(() => office.media?.streamVolumes.get(id) ?? 1);
  const [pen, setPen] = useState(false);
  const [color, setColor] = useState(PEN_COLORS[0]);
  const mine = id === me.id;

  useEffect(() => {
    if (videoRef.current && videoRef.current.srcObject !== stream) videoRef.current.srcObject = stream;
  }, [stream]);

  const viewers = mine ? (office.state.media.viewers || []) : Object.values(allViewers).filter((u) => u.online && (u.watching || []).includes(id)).map((u) => u.id);
  const hasAudio = !!stream?.getAudioTracks().length;
  const changeVol = (v) => { setVol(v); office.media?.setStreamVolume(id, v); };

  return (
    <div className={`stream-tile ${focused ? 'focused' : ''} ${compact ? 'compact' : ''}`} ref={boxRef} onClick={() => compact && office.set({ stage: id })}>
      {stream ? <video ref={videoRef} autoPlay playsInline muted /> : <div className="stream-wait">Conectando con la pantalla de {users[id]?.displayName}…</div>}
      {!compact && <AnnotLayer sharer={id} videoRef={videoRef} enabled={pen} color={color} />}
      <div className="stream-top">
        <span className="live-dot">EN VIVO</span>
        <span className="stream-name">{mine ? 'Tu pantalla' : users[id]?.displayName}</span>
        <span className="live-viewers" title={viewers.map((v) => users[v]?.displayName).join(', ')}><Eye size={13} /> {viewers.length}</span>
      </div>
      {!compact && (
        <div className="stream-tools" onClick={(e) => e.stopPropagation()}>
          {pen && PEN_COLORS.map((c) => <button key={c} className={`pen-sw ${color === c ? 'on' : ''}`} style={{ background: c }} onClick={() => setColor(c)} aria-label={`Color ${c}`} />)}
          <button className={`icon-btn ${pen ? 'active' : ''}`} title="Dibujar encima (lo ven quienes miran esta pantalla)" onClick={() => setPen(!pen)}><Pencil size={16} /></button>
          {!mine && hasAudio && (
            <label className="stage-vol" title="Volumen de esta transmisión">
              <button className="icon-btn" onClick={() => changeVol(vol > 0 ? 0 : 1)}>{vol > 0 ? <Volume2 size={16} /> : <VolumeX size={16} />}</button>
              <input type="range" min="0" max="1" step="0.05" value={vol} onChange={(e) => changeVol(Number(e.target.value))} />
            </label>
          )}
          {document.pictureInPictureEnabled && <button className="icon-btn" title="Ventana flotante" onClick={() => videoRef.current?.requestPictureInPicture?.().catch(() => {})}><PictureInPicture2 size={16} /></button>}
          <button className="icon-btn" title="Pantalla completa" onClick={() => (document.fullscreenElement ? document.exitFullscreen() : boxRef.current?.requestFullscreen?.())}><Expand size={16} /></button>
          <button className="icon-btn" title={mine ? 'Cerrar vista previa' : 'Dejar de ver'} onClick={() => office.unwatch(id)}><X size={17} /></button>
        </div>
      )}
    </div>
  );
}

// Escenario con una o varias pantallas: enfocada + miniaturas, o mosaico
export function ScreenStage() {
  const watching = useOffice((s) => s.watching);
  const open = useOffice((s) => s.stageOpen);
  const stage = useOffice((s) => s.stage);
  const layout = useOffice((s) => s.stageLayout);
  const live = useLive();
  const me = useOffice((s) => s.me);
  const users = useOffice((s) => s.users);

  useEffect(() => {
    const k = (e) => e.key === 'Escape' && !document.fullscreenElement && office.set({ stageOpen: false });
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, []);

  if (!open || !watching.length) return null;
  const focus = watching.includes(stage) ? stage : watching[watching.length - 1];
  const others = watching.filter((id) => id !== focus);
  const notWatched = live.filter((id) => !watching.includes(id) && id !== me.id);
  const grid = layout === 'grid' && watching.length > 1;

  return (
    <div className="screen-stage">
      <div className="stage-bar">
        <Radio size={16} className="live-ico" />
        <span className="stage-title">{watching.length === 1 ? 'Transmisión' : `${watching.length} transmisiones`}</span>
        {notWatched.map((id) => (
          <button key={id} className="btn tiny" onClick={() => office.watch(id)}><MonitorUp size={13} /> Ver a {users[id]?.displayName}</button>
        ))}
        <span className="flex1" />
        {watching.length > 1 && (
          <div className="seg small dark">
            <button className={!grid ? 'on' : ''} onClick={() => office.set({ stageLayout: 'focus' })} title="Una en grande"><Square size={14} /></button>
            <button className={grid ? 'on' : ''} onClick={() => office.set({ stageLayout: 'grid' })} title="Mosaico"><LayoutGrid size={14} /></button>
          </div>
        )}
        <button className="icon-btn" title="Minimizar (siguen en la barra En vivo)" onClick={() => office.set({ stageOpen: false })}><Minimize2 size={17} /></button>
      </div>
      {grid ? (
        <div className={`stage-grid n${watching.length}`}>
          {watching.map((id) => <StreamTile key={id} id={id} />)}
        </div>
      ) : (
        <div className="stage-focus">
          <StreamTile id={focus} focused />
          {others.length > 0 && (
            <div className="stage-side">
              {others.map((id) => <StreamTile key={id} id={id} compact />)}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
