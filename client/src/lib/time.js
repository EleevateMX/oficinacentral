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
