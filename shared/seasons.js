// Decoración de temporada. El admin elige: 'auto' (según la fecha), una temporada fija o 'none'.
export const SEASONS = {
  halloween: { name: 'Halloween y Día de Muertos', from: [10, 1], to: [11, 5] },
};
export const SEASON_SETTINGS = ['auto', 'none', ...Object.keys(SEASONS)];

// Temporada activa para una fecha (mes 1–12)
export function activeSeason(setting = 'auto', date = new Date()) {
  if (setting === 'none') return null;
  if (SEASONS[setting]) return setting;
  const md = (date.getMonth() + 1) * 100 + date.getDate();
  for (const [id, s] of Object.entries(SEASONS)) {
    const a = s.from[0] * 100 + s.from[1], b = s.to[0] * 100 + s.to[1];
    if (a <= b ? md >= a && md <= b : md >= a || md <= b) return id;
  }
  return null;
}
