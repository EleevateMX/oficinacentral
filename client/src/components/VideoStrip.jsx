import React, { useEffect, useRef, useState } from 'react';
import { MicOff, Maximize2, Minimize2, X, PictureInPicture2, Volume2, VolumeX, Expand } from 'lucide-react';
import { office, useOffice } from '../lib/store.js';
import { LiveBar } from './Streams.jsx';
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

export default function VideoStrip() {
  const peers = useOffice((s) => s.peers);
  const talking = useOffice((s) => s.talkingWith);
  const users = useOffice((s) => s.users);
  const me = useOffice((s) => s.me);
  const media = useOffice((s) => s.media);
  const hideSelf = useOffice((s) => s.prefs.video.hideSelf);
  const maxTiles = useOffice((s) => s.prefs.meetings.maxTiles);

  if (!talking.length) return null;
  const local = office.media?.localStream;
  const byId = Object.fromEntries(peers.map((p) => [p.id, p]));
  const people = talking.slice(0, maxTiles);

  return (
    <div className="video-strip">
      <LiveBar />
      {!hideSelf && <Tile user={{ ...users[me.id], online: true }} stream={local} cam={media.cam} mic={media.mic} isMe />}
      {people.map((id) => {
        const u = users[id];
        return <Tile key={id} user={u} stream={byId[id]?.stream} cam={u?.cam} mic={u?.mic} />;
      })}
      {talking.length > maxTiles && <div className="tile more">+{talking.length - maxTiles}</div>}
    </div>
  );
}
