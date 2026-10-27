// Elementos <video> ocultos para dibujar pantallas compartidas dentro del mapa.
const cache = new Map(); // stream.id -> video

export function videoFor(stream) {
  let v = cache.get(stream.id);
  if (!v) {
    v = document.createElement('video');
    v.muted = true;
    v.playsInline = true;
    v.autoplay = true;
    v.srcObject = stream;
    v.play().catch(() => {});
    cache.set(stream.id, v);
  }
  return v;
}

// Transmisiones en tu sala: [{ id, stream|null }]. Llega stream solo si la estás viendo.
export function activeScreens(state, media) {
  const meId = state.me.id;
  const out = [];
  if (state.media.screen && media?.screenStream) out.push({ id: meId, stream: media.screenStream });
  for (const id of state.talkingWith) {
    const u = state.users[id];
    if (!u?.online || !u.screen) continue;
    const p = state.peers.find((x) => x.id === id);
    out.push({ id, stream: state.watching.includes(id) ? p?.screen || null : null });
  }
  const live = new Set(out.filter((s) => s.stream).map((s) => s.stream.id));
  for (const [sid, v] of cache) if (!live.has(sid)) { v.srcObject = null; cache.delete(sid); }
  return out;
}
