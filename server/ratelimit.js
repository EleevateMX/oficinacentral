// Límites de velocidad: cubeta de fichas (token bucket) por socket y por evento,
// límites por persona para rutas REST y tope de conexiones por persona e IP.
// Objetivo: que nadie pueda tumbar o saturar la oficina mandando eventos sin parar,
// sin estorbar lo normal (caminar, juegos a 30 cuadros por segundo, señalización WebRTC).

const envNum = (k, d) => (Number.isFinite(Number(process.env[k])) && process.env[k] !== '' ? Number(process.env[k]) : d);

export class TokenBucket {
  constructor(capacity, perSec) {
    this.capacity = capacity;
    this.perSec = perSec;
    this.tokens = capacity;
    this.at = Date.now();
  }
  take(cost = 1, t = Date.now()) {
    this.tokens = Math.min(this.capacity, this.tokens + ((t - this.at) / 1000) * this.perSec);
    this.at = t;
    if (this.tokens < cost) return false;
    this.tokens -= cost;
    return true;
  }
}

// ---------- Eventos de Socket.IO ----------
// cost: fichas de la cubeta general del socket (capacidad SOCKET_BURST, se rellena SOCKET_RATE por segundo).
// own: [ráfaga, por segundo] límite propio del evento (para los que se reenvían a toda la oficina).
export const SOCKET_BURST = envNum('SOCKET_BURST', 80);
export const SOCKET_RATE = envNum('SOCKET_RATE', 25);
export const EVENT_RULES = {
  move: { cost: 0.25, own: [30, 20] }, // correr manda ~14 por segundo
  rtc: { cost: 0.1, own: [200, 60] }, // ráfagas de candidatos ICE al conectar
  annot: { cost: 0.2 },
  'game:state': { cost: 0.05, own: [90, 70] },
  'game:input': { cost: 0.05, own: [90, 70] },
  'game:event': { cost: 0.5 },
  'board:stroke': { cost: 0.5, own: [30, 10] },
  'board:clear': { cost: 3, own: [3, 0.2] },
  'board:undo': { cost: 0.5 },
  'board:join': { cost: 2, own: [6, 1] },
  state: { cost: 1, own: [12, 4] },
  react: { cost: 2, own: [4, 1] },
  emote: { cost: 1 },
  fx: { cost: 1 },
  'room-msg': { cost: 2 },
  'room:close': { cost: 3, own: [4, 0.2] },
  'room:knock': { cost: 3 },
  'room:admit': { cost: 1 },
  'annot:join': { cost: 1, own: [10, 1] },
  'notes:segment': { cost: 1 },
  'hotel:walk': { cost: 0.5 },
  'hotel:typing': { cost: 0.5, own: [6, 2] },
  'hotel:chat': { cost: 2 },
  'hotel:look': { cost: 0.5 },
  'hotel:enter': { cost: 2, own: [15, 1] },
  'jukebox:add': { cost: 3 },
  'jukebox:sync': { cost: 2, own: [5, 1] },
  'pet:action': { cost: 1 },
  'pet:mood': { cost: 1 },
  visibility: { cost: 0.2 },
};
const DEFAULT_COST = 1;
// Abuso sostenido: tantos eventos descartados en la ventana → se desconecta el socket
export const ABUSE_DROPS = envNum('SOCKET_ABUSE_DROPS', 300);
const ABUSE_WINDOW_MS = 10e3;

// Instala en un socket recién conectado (antes de registrar sus eventos):
// - cada listener queda envuelto en try/catch: un error en un evento no tumba el proceso
// - socket.use() aplica límites y la compuerta `gate(event, args)` (moderación: silencio/bloqueos)
export function guardSocket(socket, { gate = null, onAbuse = null, rules = EVENT_RULES } = {}) {
  const origOn = socket.on.bind(socket);
  socket.on = (event, fn) => origOn(event, function guarded(...args) {
    try {
      const r = fn.apply(this, args);
      if (r && typeof r.catch === 'function') r.catch((e) => console.error(`[socket] ${event}:`, e?.message || e));
      return r;
    } catch (e) {
      console.error(`[socket] error en "${event}":`, e?.stack || e);
      return undefined;
    }
  });

  const general = new TokenBucket(SOCKET_BURST, SOCKET_RATE);
  const own = new Map();
  let drops = [];
  socket.data.rate = { dropped: 0 };
  socket.use((packet, next) => {
    const [event, ...args] = packet;
    if (typeof event !== 'string' || event.length > 64) return drop(event);
    const rule = rules[event] || { cost: DEFAULT_COST };
    const t = Date.now();
    if (rule.own) {
      let b = own.get(event);
      if (!b) { b = new TokenBucket(rule.own[0], rule.own[1]); own.set(event, b); }
      if (!b.take(1, t)) return drop(event);
    }
    if (!general.take(rule.cost ?? DEFAULT_COST, t)) return drop(event);
    if (gate && gate(event, args, packet) === false) return undefined; // descartado en silencio (no cuenta como abuso)
    next();
    return undefined;
  });

  function drop(event) {
    const t = Date.now();
    socket.data.rate.dropped++;
    drops.push(t);
    if (drops.length > ABUSE_DROPS / 4) drops = drops.filter((x) => t - x < ABUSE_WINDOW_MS);
    if (drops.length >= ABUSE_DROPS) {
      drops = [];
      onAbuse?.(String(event).slice(0, 64));
      socket.disconnect(true);
    }
    return undefined;
  }
}

// ---------- Conexiones por persona e IP ----------
export const MAX_SOCKETS_PER_USER = envNum('MAX_SOCKETS_PER_USER', 8);
export const MAX_SOCKETS_PER_IP = envNum('MAX_SOCKETS_PER_IP', 100);
const HANDSHAKES_PER_IP = envNum('HANDSHAKES_PER_IP_PER_MIN', 120);

const ipSockets = new Map(); // ip -> count
const handshakes = new Map(); // ip -> TokenBucket

// IP real: detrás del proxy de Render/Cloudflare (TRUST_PROXY=1) es la última que agregó el proxy
export function clientIp(headers = {}, remote = '') {
  if (process.env.TRUST_PROXY === '1') {
    const cf = headers['cf-connecting-ip'];
    if (cf && process.env.TRUST_CF === '1') return String(cf).trim();
    const xff = String(headers['x-forwarded-for'] || '').split(',').map((s) => s.trim()).filter(Boolean);
    if (xff.length) return xff[xff.length - 1];
  }
  return String(remote || '').replace(/^::ffff:/, '');
}

export function socketIp(socket) {
  return clientIp(socket.handshake.headers, socket.handshake.address);
}

// ¿Puede abrir otro socket? (se llama en io.use antes de aceptar)
export function admitSocket(ip, userSockets) {
  const t = Date.now();
  let b = handshakes.get(ip);
  if (!b) { b = new TokenBucket(HANDSHAKES_PER_IP, HANDSHAKES_PER_IP / 60); handshakes.set(ip, b); }
  if (!b.take(1, t)) return 'too-many-connections';
  if ((ipSockets.get(ip) || 0) >= MAX_SOCKETS_PER_IP) return 'too-many-connections';
  if (userSockets >= MAX_SOCKETS_PER_USER) return 'too-many-tabs';
  return null;
}
export function trackSocketIp(socket, ip) {
  ipSockets.set(ip, (ipSockets.get(ip) || 0) + 1);
  socket.on('disconnect', () => {
    const n = (ipSockets.get(ip) || 1) - 1;
    if (n <= 0) ipSockets.delete(ip); else ipSockets.set(ip, n);
  });
}

// ---------- REST ----------
// Cubeta por sesión (o por IP sin sesión). GET cuesta poco (fotos, listas); escribir cuesta más.
const REST_BURST = envNum('REST_BURST', 240);
const REST_RATE = envNum('REST_RATE', 6);
const restBuckets = new Map();
export function restRateLimit(req, res, next) {
  const sid = /(?:^|;\s*)oc_sid=([^;]+)/.exec(req.headers.cookie || '')?.[1];
  const key = sid ? `s:${sid.slice(0, 64)}` : `ip:${req.ip}`;
  let b = restBuckets.get(key);
  if (!b) { b = new TokenBucket(REST_BURST, REST_RATE); restBuckets.set(key, b); }
  const cost = req.method === 'GET' || req.method === 'HEAD' ? 0.25 : 1;
  if (!b.take(cost)) {
    res.setHeader('Retry-After', '5');
    return res.status(429).json({ error: 'Vas muy rápido. Espera unos segundos.' });
  }
  return next();
}

// Límite por persona para una ruta concreta: n peticiones cada ms (después de requireAuth)
export function perUser(name, n, ms, message = 'Vas muy rápido. Espera un momento.') {
  const hits = new Map();
  return (req, res, next) => {
    const key = req.user?.id ?? req.ip;
    const t = Date.now();
    const list = (hits.get(key) || []).filter((x) => t - x < ms);
    if (list.length >= n) {
      hits.set(key, list);
      return res.status(429).json({ error: message, code: `rate:${name}` });
    }
    list.push(t);
    hits.set(key, list);
    return next();
  };
}

// Límite simple reutilizable (por llave) fuera de Express
export function windowLimiter(n, ms) {
  const hits = new Map();
  const fn = (key, t = Date.now()) => {
    const list = (hits.get(key) || []).filter((x) => t - x < ms);
    if (list.length >= n) { hits.set(key, list); return false; }
    list.push(t);
    hits.set(key, list);
    return true;
  };
  fn.hits = hits;
  return fn;
}

// Limpieza periódica de cubetas viejas (para que la memoria no crezca sin fin)
setInterval(() => {
  const t = Date.now();
  for (const [k, b] of restBuckets) if (t - b.at > 10 * 60e3) restBuckets.delete(k);
  for (const [k, b] of handshakes) if (t - b.at > 10 * 60e3) handshakes.delete(k);
}, 5 * 60e3).unref();
