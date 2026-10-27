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

// Pantallas activas que ve esta persona: [{ id, stream }]
export function activeScreens(state, media) {
  const out = [];
  if (state.media.screen && media?.screenStream) out.push({ id: state.me.id, stream: media.screenStream });
  for (const p of state.peers) if (p.screen && state.talkingWith.includes(p.id)) out.push({ id: p.id, stream: p.screen });
  // Limpia videos de pantallas que ya terminaron
  const live = new Set(out.map((s) => s.stream.id));
  for (const [id, v] of cache) if (!live.has(id)) { v.srcObject = null; cache.delete(id); }
  return out;
}
