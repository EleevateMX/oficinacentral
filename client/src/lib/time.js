const LOCALE = 'es-MX';

export const fmtTime = (ts, tz) => new Intl.DateTimeFormat(LOCALE, { hour: 'numeric', minute: '2-digit', timeZone: tz }).format(ts);
export const fmtDayLong = (ts) => new Intl.DateTimeFormat(LOCALE, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }).format(ts);
export const fmtMonthYear = (ts) => new Intl.DateTimeFormat(LOCALE, { month: 'long', year: 'numeric' }).format(ts);
export const fmtWeekday = (ts) => new Intl.DateTimeFormat(LOCALE, { weekday: 'short' }).format(ts);
export const fmtDate = (ts) => new Intl.DateTimeFormat(LOCALE, { day: '2-digit', month: '2-digit', year: 'numeric' }).format(ts);

export function fmtRelative(ts) {
  const rtf = new Intl.RelativeTimeFormat(LOCALE, { numeric: 'auto' });
  const diff = (ts - Date.now()) / 1000;
  const abs = Math.abs(diff);
  if (abs < 60) return 'justo ahora';
  if (abs < 3600) return rtf.format(Math.round(diff / 60), 'minute');
  if (abs < 86400) return rtf.format(Math.round(diff / 3600), 'hour');
  return rtf.format(Math.round(diff / 86400), 'day');
}

export const sameDay = (a, b) => new Date(a).toDateString() === new Date(b).toDateString();

export function startOfDay(ts) {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

export function startOfWeek(ts, firstDay = 0) {
  const d = new Date(startOfDay(ts));
  const diff = (d.getDay() - firstDay + 7) % 7;
  d.setDate(d.getDate() - diff);
  return d.getTime();
}

export const addDays = (ts, n) => {
  const d = new Date(ts);
  d.setDate(d.getDate() + n);
  return d.getTime();
};

export function timezones() {
  try { return Intl.supportedValuesOf('timeZone'); } catch { return ['America/Mexico_City', 'UTC']; }
}

export function tzOffsetLabel(tz) {
  try {
    const parts = new Intl.DateTimeFormat('en-US', { timeZone: tz, timeZoneName: 'longOffset' }).formatToParts(Date.now());
    const off = parts.find((p) => p.type === 'timeZoneName')?.value.replace('GMT', 'UTC') || 'UTC';
    return `(${off === 'UTC' ? 'UTC+00:00' : off}) ${tz}`;
  } catch {
    return tz;
  }
}

// Duración desde un momento: "25 min", "3 h 10 min"
export function since(ts) {
  if (!ts) return '';
  const m = Math.max(0, Math.floor((Date.now() - ts) / 60000));
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  return m % 60 ? `${h} h ${m % 60} min` : `${h} h`;
}

// Minutos de diferencia de una zona respecto a UTC (ej. Santiago = -180)
export function tzOffsetMin(tz, ts = Date.now()) {
  try {
    const v = new Intl.DateTimeFormat('en-US', { timeZone: tz, timeZoneName: 'longOffset' }).formatToParts(ts).find((p) => p.type === 'timeZoneName')?.value || 'GMT';
    const m = v.match(/GMT([+-])(\d{1,2}):?(\d{2})?/);
    return m ? (m[1] === '-' ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3] || 0)) : 0;
  } catch {
    return 0;
  }
}

export const myTimezone = () => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone; } catch { return null; } };

// "3 h más que tú", "1 h 30 min menos que tú", "misma hora que tú"
export function tzDiffLabel(tz) {
  const mine = myTimezone();
  if (!tz || !mine) return '';
  const d = tzOffsetMin(tz) - tzOffsetMin(mine);
  if (!d) return 'misma hora que tú';
  const a = Math.abs(d);
  const txt = a % 60 ? `${Math.floor(a / 60)} h ${a % 60} min` : `${a / 60} h`;
  return `${txt} ${d > 0 ? 'más' : 'menos'} que tú`;
}
