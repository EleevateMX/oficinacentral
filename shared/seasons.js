// Decoración de temporada. El admin elige: 'auto' (según la fecha), una temporada fija o 'none'.
export const SEASONS = {
  halloween: { name: 'Halloween y Día de Muertos', from: [10, 1], to: [11, 5] },
  navidad: { name: 'Navidad', from: [12, 1], to: [1, 6] },
  // El aniversario no tiene fecha fija: la pone el admin (MM-DD) y dura ese día y los 2 anteriores
  aniversario: { name: 'Aniversario de GTAHUB', days: 3 },
};
export const SEASON_SETTINGS = ['auto', 'none', ...Object.keys(SEASONS)];

const MD = /^(\d{2})-(\d{2})$/;
// 'MM-DD' válido (acepta 02-29)
export function validMD(s) {
  const m = MD.exec(String(s || ''));
  if (!m) return false;
  const mo = Number(m[1]), d = Number(m[2]);
  return mo >= 1 && mo <= 12 && d >= 1 && d <= new Date(2024, mo, 0).getDate();
}

// ¿La fecha cae en el aniversario (ese día o los `days - 1` anteriores)?
export function inAnniversary(md, date = new Date(), days = SEASONS.aniversario.days) {
  if (!validMD(md)) return false;
  const [mo, d] = md.split('-').map(Number);
  for (const y of [date.getFullYear(), date.getFullYear() + 1]) {
    const day = new Date(y, mo - 1, d);
    const start = new Date(y, mo - 1, d - (days - 1));
    const today = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    if (today >= start && today <= day) return true;
  }
  return false;
}

// Años que cumple la comunidad en esa fecha (null si no hay año de fundación)
export function anniversaryYears(year, md, date = new Date()) {
  const y = Number(year);
  if (!y || y < 1990 || y > 2200) return null;
  let n = date.getFullYear() - y;
  // Si este año ya pasó la fecha, lo que viene es el aniversario del año siguiente
  if (validMD(md)) {
    const [mo, d] = md.split('-').map(Number);
    if (new Date(date.getFullYear(), mo - 1, d) < new Date(date.getFullYear(), date.getMonth(), date.getDate())) n += 1;
  }
  return n > 0 ? n : null;
}

// Temporada activa para una fecha (mes 1–12). opts.anniversary = 'MM-DD' del aniversario
export function activeSeason(setting = 'auto', date = new Date(), opts = {}) {
  if (setting === 'none') return null;
  if (SEASONS[setting]) return setting;
  if (opts.anniversary && inAnniversary(opts.anniversary, date)) return 'aniversario';
  const md = (date.getMonth() + 1) * 100 + date.getDate();
  for (const [id, s] of Object.entries(SEASONS)) {
    if (!s.from) continue;
    const a = s.from[0] * 100 + s.from[1], b = s.to[0] * 100 + s.to[1];
    if (a <= b ? md >= a && md <= b : md >= a || md <= b) return id;
  }
  return null;
}
