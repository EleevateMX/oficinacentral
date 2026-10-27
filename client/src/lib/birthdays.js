// Cumpleaños: se guardan como 'MM-DD' (sin año) y se comparan con la fecha local de quien mira.
export const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

const pad = (n) => String(n).padStart(2, '0');
export const todayMD = (d = new Date()) => `${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const isBirthday = (u, d = new Date()) => !!u?.birthday && u.birthday === todayMD(d);

export function fmtBirthday(md) {
  const [m, d] = (md || '').split('-').map(Number);
  return m && d ? `${d} de ${MONTHS[m - 1]}` : '';
}

// Días que faltan para el próximo cumpleaños (0 = hoy). El 29 de febrero se celebra el 28 en años no bisiestos.
export function daysUntil(md, from = new Date()) {
  const [m, d] = md.split('-').map(Number);
  const start = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  for (const y of [from.getFullYear(), from.getFullYear() + 1]) {
    const leap = (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
    const day = m === 2 && d === 29 && !leap ? 28 : d;
    const t = new Date(y, m - 1, day);
    if (t >= start) return Math.round((t - start) / 86400e3);
  }
  return 365;
}

export function whenLabel(days) {
  if (days === 0) return '¡Hoy!';
  if (days === 1) return 'Mañana';
  if (days < 7) return `En ${days} días`;
  if (days < 14) return 'La próxima semana';
  return `En ${days} días`;
}

// Gente con cumpleaños registrado, ordenada por cuál viene primero
export function upcoming(users, from = new Date()) {
  return Object.values(users)
    .filter((u) => u.birthday && !u.disabled)
    .map((u) => ({ user: u, days: daysUntil(u.birthday, from) }))
    .sort((a, b) => a.days - b.days || a.user.displayName.localeCompare(b.user.displayName));
}

export const WISHES = ['¡Feliz cumpleaños! 🎉', '¡Que te la pases increíble! 🎂', '¡Muchas felicidades! 🥳', '¡Que cumplas muchos más! 🎈', '¡Feliz día! Te mandamos un abrazo 🤗'];
