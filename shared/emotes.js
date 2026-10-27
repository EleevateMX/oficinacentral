// Acciones del personaje (bailar, saludar, guiño…) y acciones entre dos (chocar los cinco, abrazo).
// dur: cuánto dura la animación en ms. key: atajo de teclado en el mapa.
export const EMOTES = {
  dance: { label: 'Bailar', emoji: '💃', key: 'B', dur: 5000 },
  wave: { label: 'Saludar', emoji: '👋', key: 'H', dur: 2400 },
  wink: { label: 'Guiño', emoji: '😉', key: 'G', dur: 1800 },
  jump: { label: 'Saltar', emoji: '🤸', key: 'J', dur: 1400 },
  spin: { label: 'Dar una vuelta', emoji: '🌀', key: 'V', dur: 1300 },
  clap: { label: 'Aplaudir', emoji: '👏', key: 'C', dur: 2400 },
  laugh: { label: 'Reír', emoji: '😂', key: 'L', dur: 2400 },
  love: { label: 'Corazones', emoji: '😍', key: 'K', dur: 2800 },
  flex: { label: 'Presumir', emoji: '💪', key: 'F', dur: 2000 },
  sleep: { label: 'Dormir', emoji: '😴', key: 'Z', dur: 6000 },
  // Entre dos (hay que estar cerca)
  highfive: { label: 'Chocar los cinco', emoji: '🙌', dur: 1600, pair: true },
  hug: { label: 'Abrazo', emoji: '🤗', dur: 2200, pair: true },
};
export const SOLO_EMOTES = Object.keys(EMOTES).filter((k) => !EMOTES[k].pair);
export const PAIR_EMOTES = Object.keys(EMOTES).filter((k) => EMOTES[k].pair);
export const EMOTE_BY_KEY = Object.fromEntries(SOLO_EMOTES.map((k) => [EMOTES[k].key, k]));
// Distancia máxima (en casillas) para una acción entre dos
export const PAIR_RANGE = 2;
