// Avisos de errores y caídas a un webhook (Discord, Slack o compatible).
// Se configura con ALERT_WEBHOOK_URL. Sin él, solo se escribe en el log.
import os from 'node:os';

const URL_ = () => process.env.ALERT_WEBHOOK_URL || '';
const NAME = () => process.env.OFFICE_NAME || 'Nuvora';
const recent = new Map(); // clave -> último envío
let sentThisHour = [];

const LEVELS = {
  error: { color: 0xe63946, icon: '🔴' },
  warn: { color: 0xffcc00, icon: '🟡' },
  info: { color: 0x2bb673, icon: '🟢' },
};

// Envía un aviso. Los repetidos (misma clave) se agrupan: uno cada 10 minutos.
export async function alert(title, detail = '', { level = 'error', key = title } = {}) {
  const line = `[aviso:${level}] ${title}${detail ? ` — ${String(detail).split('\n')[0]}` : ''}`;
  (level === 'error' ? console.error : console.log)(line);
  const url = URL_();
  if (!url) return false;
  const now = Date.now();
  if (now - (recent.get(key) || 0) < 10 * 60e3) return false;
  sentThisHour = sentThisHour.filter((t) => now - t < 3600e3);
  if (sentThisHour.length >= 30) return false;
  recent.set(key, now);
  sentThisHour.push(now);
  const lv = LEVELS[level] || LEVELS.error;
  const text = String(detail).slice(0, 1800);
  const body = /discord(app)?\.com\/api\/webhooks/.test(url)
    ? { username: `${NAME()} · Avisos`, embeds: [{ title: `${lv.icon} ${title}`.slice(0, 250), description: text ? `\`\`\`\n${text}\n\`\`\`` : undefined, color: lv.color, footer: { text: os.hostname() }, timestamp: new Date().toISOString() }] }
    : { text: `${lv.icon} *${NAME()}* — ${title}${text ? `\n\`\`\`${text}\`\`\`` : ''}` };
  try {
    const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(8000) });
    return r.ok;
  } catch (e) {
    console.error('No se pudo enviar el aviso:', e.message);
    return false;
  }
}

// Errores que tumbarían el proceso: avisar y salir (Docker/Railway lo reinician)
export function watchProcess() {
  process.on('uncaughtException', async (err) => {
    console.error(err);
    await alert('El servidor se cayó por un error inesperado', err?.stack || String(err), { key: `uncaught:${err?.message}` });
    process.exit(1);
  });
  process.on('unhandledRejection', (err) => {
    console.error(err);
    alert('Error sin manejar en el servidor', err?.stack || String(err), { key: `rejection:${err?.message}` });
  });
}
