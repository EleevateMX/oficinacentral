import React, { useEffect, useRef, useState } from 'react';
import { MicOff, Maximize2, Minimize2, X, PictureInPicture2, Volume2, VolumeX, Expand } from 'lucide-react';
import { office, useOffice } from '../lib/store.js';
import { Avatar } from './ui.jsx';

function Video({ stream, muted, mirror }) {
  const ref = useRef(null);
  useEffect(() => {
    if (ref.current && ref.current.srcObject !== stream) ref.current.srcObject = stream;
  }, [stream]);
  return <video ref={ref} autoPlay playsInline muted={muted} className={mirror ? 'mirror' : ''} />;
}

// Detecta si alguien está hablando (nivel de audio)
function useSpeaking(stream, enabled) {
  const [speaking, setSpeaking] = useState(false);
  useEffect(() => {
    if (!enabled || !stream || !stream.getAudioTracks().length) { setSpeaking(false); return; }
    let ctx;
    let raf;
    try {
      ctx = new AudioContext();
      const src = ctx.createMediaStreamSource(stream);
      const an = ctx.createAnalyser();
      an.fftSize = 512;
      src.connect(an);
      const data = new Uint8Array(an.frequencyBinCount);
      let last = 0;
      const tick = (t) => {
        raf = requestAnimationFrame(tick);
        if (t - last < 120) return;
        last = t;
        an.getByteFrequencyData(data);
        const avg = data.reduce((a, b) => a + b, 0) / data.length;
        setSpeaking(avg > 18);
      };
      raf = requestAnimationFrame(tick);
    } catch { /* sin AudioContext */ }
    return () => { cancelAnimationFrame(raf); ctx?.close(); };
  }, [stream, enabled, stream?.getAudioTracks().length]);
  return speaking;
}

function Tile({ user, stream, cam, mic, isMe, screen, big, onExpand }) {
  const speaking = useSpeaking(stream, mic && !screen);
  const showVideo = screen || (cam && stream && stream.getVideoTracks().length > 0);
  return (
    <div className={`tile ${speaking ? 'speaking' : ''} ${screen ? 'screen' : ''} ${big ? 'big' : ''}`}>
      {showVideo ? (
        <Video stream={stream} muted mirror={isMe && !screen} />
      ) : (
        <div className="tile-avatar"><Avatar user={user} size={big ? 96 : 52} showStatus={false} /></div>
      )}
      <div className="tile-name">
        {!mic && !screen && <MicOff size={11} />}
        {screen ? `Pantalla de ${user?.displayName}` : isMe ? `${user?.displayName} (tú)` : user?.displayName}
      </div>
      {screen && onExpand && (
        <button className="tile-expand" onClick={onExpand} title={big ? 'Reducir' : 'Ampliar'}>{big ? <Minimize2 size={14} /> : <Maximize2 size={14} />}</button>
      )}
    </div>
  );
}

// Pantallas compartidas que ves ahora (la tuya primero)
export function useScreens() {
  const peers = useOffice((s) => s.peers);
  const talking = useOffice((s) => s.talkingWith);
  const me = useOffice((s) => s.me);
  const media = useOffice((s) => s.media);
  return [
    ...(media.screen && office.media?.screenStream ? [{ id: me.id, stream: office.media.screenStream, mine: true }] : []),
    ...peers.filter((p) => p.screen && talking.includes(p.id)).map((p) => ({ id: p.id, stream: p.screen })),
  ];
}

// Escenario: la pantalla compartida en grande, con pantalla completa, PiP y volumen
export function ScreenStage() {
  const stage = useOffice((s) => s.stage);
  const users = useOffice((s) => s.users);
  const screenPrefs = useOffice((s) => s.prefs.screen);
  const autoOpen = screenPrefs.autoOpen;
  const screens = useScreens();
  const ref = useRef(null);
  const boxRef = useRef(null);
  const seen = useRef(new Set());

  // Abrir solo cuando alguien empieza a compartir cerca de ti
  useEffect(() => {
    for (const sc of screens) {
      const key = `${sc.id}:${sc.stream.id}`;
      if (!seen.current.has(key)) {
        seen.current.add(key);
        if (autoOpen && !sc.mine && office.state.stage == null) office.set({ stage: sc.id });
      }
    }
    if (stage != null && !screens.some((sc) => sc.id === stage)) office.set({ stage: null });
  }, [screens.map((sc) => `${sc.id}:${sc.stream.id}`).join(','), stage]); // eslint-disable-line react-hooks/exhaustive-deps

  const cur = screens.find((sc) => sc.id === stage);
  useEffect(() => {
    if (ref.current && cur && ref.current.srcObject !== cur.stream) ref.current.srcObject = cur.stream;
  }, [cur?.stream]);
  useEffect(() => {
    const k = (e) => e.key === 'Escape' && !document.fullscreenElement && office.set({ stage: null });
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, []);
  if (!cur) return null;

  const hasAudio = cur.stream.getAudioTracks().length > 0;
  const setVol = (v) => office.updatePrefs({ screen: { ...screenPrefs, volume: v } });
  return (
    <div className="screen-stage" ref={boxRef}>
      <video ref={ref} autoPlay playsInline muted onDoubleClick={() => boxRef.current?.requestFullscreen?.()} />
      <div className="stage-bar">
        <span className="stage-title">{cur.mine ? 'Tu pantalla (así la ven los demás)' : `Pantalla de ${users[cur.id]?.displayName || ''}`}</span>
        {screens.length > 1 && (
          <div className="stage-switch">
            {screens.map((sc) => (
              <button key={sc.id} className={sc.id === stage ? 'on' : ''} onClick={() => office.set({ stage: sc.id })}>{sc.mine ? 'Tú' : users[sc.id]?.displayName}</button>
            ))}
          </div>
        )}
        {!cur.mine && hasAudio && (
          <label className="stage-vol" title="Volumen de la pantalla">
            {screenPrefs.volume > 0 ? <Volume2 size={16} /> : <VolumeX size={16} />}
            <input type="range" min="0" max="1" step="0.05" value={screenPrefs.volume} onChange={(e) => setVol(Number(e.target.value))} />
          </label>
        )}
        {document.pictureInPictureEnabled && (
          <button className="icon-btn" title="Ventana flotante" onClick={() => ref.current?.requestPictureInPicture?.().catch(() => {})}><PictureInPicture2 size={17} /></button>
        )}
        <button className="icon-btn" title="Pantalla completa" onClick={() => (document.fullscreenElement ? document.exitFullscreen() : boxRef.current?.requestFullscreen?.())}><Expand size={17} /></button>
        <button className="icon-btn" title="Cerrar (Esc)" onClick={() => office.set({ stage: null })}><X size={18} /></button>
      </div>
    </div>
  );
}

export default function VideoStrip() {
  const peers = useOffice((s) => s.peers);
  const talking = useOffice((s) => s.talkingWith);
  const users = useOffice((s) => s.users);
  const me = useOffice((s) => s.me);
  const media = useOffice((s) => s.media);
  const hideSelf = useOffice((s) => s.prefs.video.hideSelf);
  const maxTiles = useOffice((s) => s.prefs.meetings.maxTiles);
  const stage = useOffice((s) => s.stage);
  const screensAll = useScreens();

  if (!talking.length) return null;
  const local = office.media?.localStream;
  const byId = Object.fromEntries(peers.map((p) => [p.id, p]));
  const people = talking.slice(0, maxTiles);
  const screens = screensAll.filter((sc) => sc.id !== stage);

  return (
    <div className="video-strip">
      {screens.map((s) => (
        <Tile key={`s${s.id}`} user={users[s.id]} stream={s.stream} screen onExpand={() => office.set({ stage: s.id })} />
      ))}
      {!hideSelf && <Tile user={{ ...users[me.id], online: true }} stream={local} cam={media.cam} mic={media.mic} isMe />}
      {people.map((id) => {
        const u = users[id];
        return <Tile key={id} user={u} stream={byId[id]?.stream} cam={u?.cam} mic={u?.mic} />;
      })}
      {talking.length > maxTiles && <div className="tile more">+{talking.length - maxTiles}</div>}
    </div>
  );
}
