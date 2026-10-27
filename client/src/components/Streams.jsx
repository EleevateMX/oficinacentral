// Transmisiones de pantalla al estilo Discord: ver a elección, mosaico,
// espectadores, volumen por transmisión y dibujar encima.
import React, { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { X, PictureInPicture2, Volume2, VolumeX, Expand, LayoutGrid, Square, Pencil, Eye, MonitorUp, Minimize2, Radio, Clapperboard, Circle } from 'lucide-react';
import { office, useOffice } from '../lib/store.js';
import { ClipRecorder, StreamRecorder, clipMime, recordingSupported, fileName, downloadBlob, CLIP_SECONDS } from '../lib/recorder.js';
import { Avatar } from './ui.jsx';

// ---------- Clips y grabaciones ----------
// Búfer de los últimos 30 s por cada pantalla que ves y grabaciones en curso.
// Viven fuera de React para no perderse al minimizar el escenario.
const clipBufs = new Map(); // id -> ClipRecorder
const recordings = new Map(); // id -> { rec: StreamRecorder, room: boolean }
const recListeners = new Set();
let recVersion = 0;
const bumpRec = () => {
  recVersion++;
  recListeners.forEach((f) => f());
  office.setRecording(recordings.size > 0);
};
const useRecVersion = () => useSyncExternalStore((cb) => { recListeners.add(cb); return () => recListeners.delete(cb); }, () => recVersion);

function screenOf(id) {
  if (id === office.state.me?.id) return office.media?.screenStream || null;
  return office.state.peers.find((p) => p.id === id)?.screen || null;
}

function voiceOf(id) {
  const s = id === office.state.me?.id ? office.media?.localStream : office.state.peers.find((p) => p.id === id)?.stream;
  return s?.getAudioTracks() || [];
}

const liveVideo = (id) => screenOf(id)?.getVideoTracks().find((t) => t.readyState === 'live') || null;
// Clip: lo que se ve y se oye de esa pantalla, más la voz de quien transmite
const clipAudio = (id) => [...(screenOf(id)?.getAudioTracks() || []), ...voiceOf(id)];
// Junta: además, las voces de toda la sala (incluida la mía)
const roomAudio = (id) => {
  const ids = new Set([id, office.state.me?.id, ...office.state.talkingWith]);
  return [...new Set([...(screenOf(id)?.getAudioTracks() || []), ...[...ids].flatMap(voiceOf)])];
};
const nameOf = (id) => office.state.users[id]?.displayName || 'pantalla';

export const canClip = () => !!clipMime();

// Arranca/para los búferes según las pantallas que veo; termina grabaciones de pantallas que ya no están
export function syncCaptures(ids = office.state.watching) {
  const enabled = office.state.prefs.screen.clips !== false && canClip();
  for (const [id, c] of clipBufs) {
    const vt = liveVideo(id);
    if (!enabled || !ids.includes(id) || !vt || vt !== c.videoTrack || !c.active) { c.stop(); clipBufs.delete(id); }
  }
  if (enabled) {
    for (const id of ids) {
      if (clipBufs.has(id)) continue;
      const vt = liveVideo(id);
      if (!vt) continue;
      try { clipBufs.set(id, new ClipRecorder(vt, () => clipAudio(id))); } catch (e) { console.warn('clip', e); }
    }
  }
  for (const [id, r] of recordings) {
    const vt = liveVideo(id);
    if (!ids.includes(id) || !vt || vt !== r.rec.videoTrack) stopRecording(id);
  }
}

export async function saveClip(id) {
  const c = clipBufs.get(id);
  if (!c) return office.toast({ title: 'Los clips no están disponibles en este navegador', kind: 'error' });
  const secs = Math.round(c.bufferedSeconds);
  const blob = await c.save(CLIP_SECONDS).catch(() => null);
  if (!blob) return office.toast({ title: 'Todavía no hay video para el clip, espera unos segundos' });
  downloadBlob(blob, fileName('clip', nameOf(id)));
  office.notifyClip(id);
  office.toast({ title: `🎬 Clip guardado (${secs < CLIP_SECONDS ? `${Math.max(1, secs)} s` : `últimos ${CLIP_SECONDS} s`})` });
}

export function startRecording(id) {
  const vt = liveVideo(id);
  if (!vt || recordings.has(id) || !recordingSupported()) return;
  const room = office.state.prefs.screen.recordRoom !== false;
  try {
    const rec = new StreamRecorder(vt, () => (room ? roomAudio(id) : clipAudio(id)));
    recordings.set(id, { rec, room });
  } catch (e) {
    office.toast({ title: `No se pudo grabar: ${e?.message || e}`, kind: 'error' });
  }
  bumpRec();
}

export async function stopRecording(id) {
  const r = recordings.get(id);
  if (!r) return;
  recordings.delete(id);
  bumpRec();
  const blob = await r.rec.stop();
  if (!blob) return;
  downloadBlob(blob, fileName(r.room ? 'junta' : 'grabacion', nameOf(id), new Date(r.rec.startedAt), r.rec.ext));
  office.toast({ title: '⏺ Grabación guardada en tus descargas' });
}

// Quiénes de tu sala (y tú) están grabando
export function useRecorders() {
  const users = useOffice((s) => s.users);
  const talking = useOffice((s) => s.talkingWith);
  const me = useOffice((s) => s.me);
  const mine = useOffice((s) => s.recording);
  useOffice((s) => s.presenceVersion);
  const list = talking.filter((id) => users[id]?.online && users[id]?.recording);
  return mine ? [me.id, ...list] : list;
}

function recordersText(ids, users, meId) {
  const names = ids.map((id) => (id === meId ? 'Tú' : users[id]?.displayName || 'Alguien'));
  if (!names.length) return '';
  if (names.length === 1) return names[0] === 'Tú' ? 'Estás grabando' : `${names[0]} está grabando`;
  return `${names.slice(0, -1).join(', ')} y ${names[names.length - 1]} están grabando`;
}

const fmtTime = (ms) => { const s = Math.floor(ms / 1000); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };

function RecButtons({ id }) {
  useRecVersion();
  const [, tick] = useState(0);
  const r = recordings.get(id);
  useEffect(() => {
    if (!r) return undefined;
    const t = setInterval(() => tick((x) => x + 1), 1000);
    return () => clearInterval(t);
  }, [r]);
  const clips = useOffice((s) => s.prefs.screen.clips) !== false && canClip();
  const room = useOffice((s) => s.prefs.screen.recordRoom) !== false;
  if (!recordingSupported()) return null;
  return (
    <>
      {clips && (
        <button className="btn tiny rec-btn" title={`Guardar los últimos ${CLIP_SECONDS} segundos`} onClick={() => saveClip(id)}>
          <Clapperboard size={14} /> Clip
        </button>
      )}
      {r ? (
        <button className="btn tiny rec-btn recording" title="Detener y descargar" onClick={() => stopRecording(id)}>
          <Square size={12} fill="currentColor" /> {fmtTime(Date.now() - r.rec.startedAt)}
        </button>
      ) : (
        <button className="btn tiny rec-btn" title={room ? 'Grabar junta: esta pantalla y las voces de la sala' : 'Grabar esta pantalla'} onClick={() => startRecording(id)}>
          <Circle size={12} fill="currentColor" className="rec-ico" /> Grabar
        </button>
      )}
    </>
  );
}

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
  const recorders = useRecorders();
  if (!live.length) return null;
  return (
    <div className="live-bar">
      {recorders.length > 0 && <span className="rec-badge" title={recordersText(recorders, users, me.id)}>● REC {recorders.map((id) => (id === me.id ? 'Tú' : users[id]?.displayName)).join(', ')}</span>}
      {live.map((id) => {
        const mine = id === me.id;
        const on = watching.includes(id);
        return (
          <div key={id} className={`live-card ${on ? 'on' : ''}`}>
            <span className="live-dot">EN VIVO</span>
            <Avatar user={users[id]} size={22} showStatus={false} />
            <span className="live-name">{mine ? 'Tú' : users[id]?.displayName}</span>
            {(mine ? office.state.recording : users[id]?.recording) && <span className="rec-badge small">● REC</span>}
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
          {stream && <RecButtons id={id} />}
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
  const peers = useOffice((s) => s.peers);
  const myScreen = useOffice((s) => s.media.screen);
  const clipsPref = useOffice((s) => s.prefs.screen.clips);
  const recorders = useRecorders();

  // Búferes de clip y grabaciones siguen a las pantallas que veo (aunque el escenario esté minimizado)
  useEffect(() => { syncCaptures(watching); }, [watching, peers, myScreen, clipsPref]);
  useEffect(() => () => syncCaptures([]), []);

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
      {recorders.length > 0 && (
        <div className="rec-banner" role="status"><span className="rec-dot" /> {recordersText(recorders, users, me.id)}</div>
      )}
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
