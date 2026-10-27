// Aviso diario de cumpleaños a Discord (o Slack) si se configura BIRTHDAY_WEBHOOK_URL.
// Sale una vez al día, a partir de las 9:00 en la zona de la oficina (OFFICE_TIMEZONE, por defecto Ciudad de México).
import { db, getSetting, setSetting } from './db.js';

const URL_ = () => process.env.BIRTHDAY_WEBHOOK_URL || '';
const TZ = () => process.env.OFFICE_TIMEZONE || 'America/Mexico_City';

function localParts(tz, d = new Date()) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23' }).formatToParts(d).map((x) => [x.type, x.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, md: `${p.month}-${p.day}`, hour: Number(p.hour) };
}

export function birthdaysOn(md) {
  return db.prepare('SELECT id, display_name AS name FROM users WHERE birthday = ? AND disabled = 0 ORDER BY display_name COLLATE NOCASE').all(md);
}

export async function announceBirthdays(now = new Date()) {
  const url = URL_();
  if (!url) return false;
  const { date, md, hour } = localParts(TZ(), now);
  if (hour < 9 || getSetting('bday_announced') === date) return false;
  setSetting('bday_announced', date);
  const people = birthdaysOn(md);
  if (!people.length) return false;
  const names = people.map((p) => `**${p.name}**`);
  const who = names.length === 1 ? names[0] : `${names.slice(0, -1).join(', ')} y ${names[names.length - 1]}`;
  const office = process.env.OFFICE_NAME || 'la oficina';
  const link = process.env.PUBLIC_URL ? `\n${process.env.PUBLIC_URL.replace(/\/$/, '')}/?view=birthdays` : '';
  const text = `🎂 ¡Hoy ${people.length === 1 ? 'cumple años' : 'cumplen años'} ${who}! Entra a ${office} y mándale tu felicitación 🎉${link}`;
  const body = /discord(app)?\.com\/api\/webhooks/.test(url) ? { username: 'Cumpleaños', content: text } : { text: text.replace(/\*\*/g, '*') };
  try {
    const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(8000) });
    return r.ok;
  } catch (e) {
    console.error('No se pudo enviar el aviso de cumpleaños:', e.message);
    return false;
  }
}

export function startBirthdayAnnouncer() {
  if (!URL_()) return;
  const tick = () => announceBirthdays().catch(() => {});
  setTimeout(tick, 30e3).unref();
  setInterval(tick, 10 * 60e3).unref();
}
