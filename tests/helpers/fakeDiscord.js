// Discord falso para pruebas: API REST v10 mínima (servidor, roles, canales, miembros, mensajes,
// tema y fijar), OAuth (token y perfil) y límites de velocidad simulados (429 con retry_after).
import http from 'node:http';

export const IDS = {
  guild: '100000000000000001',
  bot: '900000000000000009',
  owner: '800000000000000008',
  botRole: '200000000000000002',
  adminRole: '200000000000000003',
  vipRole: '200000000000000004',
  modRole: '200000000000000005',
  staffRole: '200000000000000006',
  general: '300000000000000001',
  mods: '300000000000000002',
  anuncios: '300000000000000003',
  live: '300000000000000004',
  events: '300000000000000005',
  welcome: '300000000000000006',
};
const VIEW = 1n << 10n, SEND = 1n << 11n, MANAGE_MSG = 1n << 13n, EMBED = 1n << 14n, HISTORY = 1n << 16n, MANAGE_CH = 1n << 4n;

export async function startFakeDiscord({ port = 0 } = {}) {
  const state = {
    requests: [], // { method, path, body, auth }
    messages: [], // { channelId, body, id }
    patches: [],
    pins: [],
    members: {}, // discordId -> { roles, premium_since }
    profile: { id: '700000000000000001', username: 'kevin_gh', global_name: 'Kevin' },
    rateLimitNext: 0, // las próximas N peticiones de mensajes responden 429
    failNext: 0, // las próximas N responden 500
    seq: 1,
  };
  const roles = [
    { id: IDS.guild, name: '@everyone', permissions: String(VIEW | HISTORY), position: 0, managed: false, color: 0 },
    { id: IDS.botRole, name: 'HUB Bot', permissions: String(VIEW | SEND | EMBED | MANAGE_MSG | HISTORY | MANAGE_CH), position: 5, managed: true, color: 0 },
    { id: IDS.adminRole, name: 'Admins', permissions: '8', position: 4, managed: false, color: 0xE2524A },
    { id: IDS.vipRole, name: 'VIP', permissions: '0', position: 3, managed: false, color: 0xB04BD6 },
    { id: IDS.modRole, name: 'Moderadores', permissions: '0', position: 2, managed: false, color: 0x3F6FB0 },
    { id: IDS.staffRole, name: 'Staff', permissions: '0', position: 1, managed: false, color: 0x9CBED9 },
  ];
  const channels = [
    { id: IDS.general, type: 0, name: 'general', position: 0, permission_overwrites: [] },
    { id: IDS.mods, type: 0, name: 'moderacion', position: 1, permission_overwrites: [{ id: IDS.guild, type: 0, allow: '0', deny: String(VIEW) }, { id: IDS.botRole, type: 0, allow: String(VIEW), deny: '0' }] },
    // En #anuncios el bot no puede cambiar el tema ni fijar
    { id: IDS.anuncios, type: 5, name: 'anuncios', position: 2, permission_overwrites: [{ id: IDS.botRole, type: 0, allow: '0', deny: String(MANAGE_CH | MANAGE_MSG) }] },
    { id: IDS.live, type: 0, name: 'en-vivo', position: 3, permission_overwrites: [] },
    { id: IDS.events, type: 0, name: 'eventos', position: 4, permission_overwrites: [] },
    { id: IDS.welcome, type: 0, name: 'bienvenidas', position: 5, permission_overwrites: [] },
    // En #reglas el bot no puede escribir
    { id: '300000000000000007', type: 0, name: 'reglas', position: 6, permission_overwrites: [{ id: IDS.botRole, type: 0, allow: '0', deny: String(SEND | EMBED) }] },
    { id: '300000000000000099', type: 2, name: 'Voz', position: 6, permission_overwrites: [] },
  ];

  const server = http.createServer((req, res) => {
    let raw = '';
    req.on('data', (d) => { raw += d; });
    req.on('end', () => {
      const send = (status, obj, headers = {}) => {
        res.writeHead(status, { 'Content-Type': 'application/json', ...headers });
        res.end(obj === undefined ? '' : JSON.stringify(obj));
      };
      let body = null;
      try { body = raw ? JSON.parse(raw) : null; } catch { body = raw; }
      const url = new URL(req.url, 'http://x');
      const p = url.pathname;
      state.requests.push({ method: req.method, path: p, body, auth: req.headers.authorization || '' });
      // OAuth (sin versión)
      if (p === '/api/oauth2/token') return send(200, { access_token: 'tok' });
      if (p === '/api/users/@me') return send(200, state.profile);
      if (p.startsWith('/webhooks/')) return send(204);
      if (!p.startsWith('/api/v10/')) return send(404, { message: 'Not found' });
      if (req.headers.authorization !== 'Bot test-bot-token') return send(401, { message: '401: Unauthorized', code: 0 });
      const r = p.slice('/api/v10'.length);
      if (state.failNext > 0) { state.failNext--; return send(500, { message: 'Internal' }); }
      let m;
      if (r === '/users/@me') return send(200, { id: IDS.bot, username: 'HUB Bot', bot: true });
      if (r === `/guilds/${IDS.guild}`) return send(200, { id: IDS.guild, name: 'MeDed Friends', owner_id: IDS.owner, icon: null });
      if (r === `/guilds/${IDS.guild}/roles`) return send(200, roles);
      if (r === `/guilds/${IDS.guild}/channels`) return send(200, channels);
      if ((m = /^\/guilds\/\d+\/members\/(\d+)$/.exec(r))) {
        if (m[1] === IDS.bot) return send(200, { user: { id: IDS.bot }, roles: [IDS.botRole] });
        const mem = state.members[m[1]];
        return mem ? send(200, { user: { id: m[1] }, roles: mem.roles || [], premium_since: mem.premium_since || null }) : send(404, { message: 'Unknown Member', code: 10007 });
      }
      if ((m = /^\/channels\/(\d+)\/messages$/.exec(r)) && req.method === 'POST') {
        if (state.rateLimitNext > 0) {
          state.rateLimitNext--;
          return send(429, { message: 'You are being rate limited.', retry_after: 0.05, global: false }, { 'X-RateLimit-Remaining': '0', 'X-RateLimit-Reset-After': '0.05' });
        }
        const msg = { id: String(500000000000000000n + BigInt(state.seq++)), channelId: m[1], body };
        state.messages.push(msg);
        return send(200, { id: msg.id, channel_id: m[1], ...body }, { 'X-RateLimit-Remaining': '4', 'X-RateLimit-Reset-After': '1' });
      }
      if ((m = /^\/channels\/(\d+)$/.exec(r)) && req.method === 'PATCH') { state.patches.push({ channelId: m[1], body }); return send(200, { id: m[1], ...body }); }
      if ((m = /^\/channels\/(\d+)\/pins\/(\d+)$/.exec(r)) && req.method === 'PUT') { state.pins.push({ channelId: m[1], messageId: m[2] }); return send(204); }
      return send(404, { message: 'Unknown', code: 0 });
    });
  });
  await new Promise((r) => server.listen(port, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  return { state, base, apiBase: `${base}/api`, close: () => new Promise((r) => server.close(r)) };
}

// Espera a que se cumpla algo (los envíos a Discord van por una cola)
export async function waitFor(fn, ms = 4000) {
  const end = Date.now() + ms;
  for (;;) {
    const v = fn();
    if (v) return v;
    if (Date.now() > end) return null;
    await new Promise((r) => setTimeout(r, 30));
  }
}
