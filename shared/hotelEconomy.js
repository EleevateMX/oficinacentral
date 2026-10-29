// Economía del Hotel (contrato compartido servidor ↔ cliente): créditos HUB, precios de la tienda,
// monedas canjeables, regalos y la máquina de estados del intercambio seguro.
// Todo lo que cuesta o da créditos se decide en el servidor (server/hotelEconomy.js); aquí solo hay reglas puras.

export const START_CREDITS = 500; // regalo de bienvenida
export const DAILY_CREDITS = 50; // una vez por día de oficina (OFFICE_TIMEZONE)
export const ONLINE_CREDITS = 10; // por cada 15 minutos dentro del Hotel
export const ONLINE_EVERY_MS = 15 * 60e3;
export const MAX_BUY_QTY = 20; // "comprar N"
export const MAX_TRADE_ITEMS = 20; // por lado
export const MAX_CREDITS = 1e9;
export const MAX_GIFT_MSG = 140;
export const PRESENT_TYPE = 'economia_regalo';
export const PRESENT_WRAPS = ['#FE3377', '#FFCC00', '#3a86ff', '#2fb67c', '#141414'];

// Precio por categoría para los furnis base que no traen `price`
export const DEFAULT_PRICE = { sillas: 8, mesas: 10, camas: 15, luz: 8, deco: 10, plantas: 5, pisos: 4, pared: 6, diversion: 12, gtahub: 500 };
const BIG = { teleport: 30, gate: 10, dice: 6 }; // por mecánica (el teletransportador viene en par)

export function priceOf(def) {
  if (!def) return 0;
  if (Number.isInteger(def.price) && def.price >= 0) return def.price;
  if (BIG[def.interact] != null) return BIG[def.interact];
  const base = DEFAULT_PRICE[def.cat] ?? 10;
  // Lo grande cuesta un poco más (1 crédito por casilla extra)
  return base + Math.max(0, (def.w || 1) * (def.l || 1) - 1);
}
// ¿Se vende en la tienda? (la caja de regalo solo existe envolviendo otro furni)
export const inShop = (def) => !!def && !def.noShop;
// Monedas: furnis que se canjean por créditos (valor = def.coin)
export const coinValue = (def) => (def && Number.isInteger(def.coin) && def.coin > 0 ? def.coin : 0);
export const isPresent = (def) => def?.interact === 'present';
// Interacciones que maneja la economía (no son "encender/apagar")
export const ECO_INTERACT = new Set(['coin', 'present']);

// Costo de una compra: los exclusivos solo los compran admins y a ellos no les cuestan
// (su `price` es el valor de referencia para intercambios).
export function quote(def, qty, { admin = false } = {}) {
  if (!def) return { error: 'Ese furni no existe' };
  if (!inShop(def)) return { error: 'Ese furni no se vende en la tienda' };
  if (def.exclusive && !admin) return { error: 'Este furni es exclusivo HUB: solo los admins pueden comprarlo' };
  const n = qty == null ? 1 : Math.trunc(Number(qty));
  if (!Number.isFinite(n) || n < 1 || n > MAX_BUY_QTY) return { error: `Puedes comprar de 1 a ${MAX_BUY_QTY} a la vez` };
  const unit = def.exclusive && admin ? 0 : priceOf(def);
  return { qty: n, unit, total: unit * n, items: n * (def.interact === 'teleport' ? 2 : 1) };
}

// ---------- Recompensas (reloj inyectable para pruebas) ----------
const dayFmt = new Map();
export function officeDay(t, tz = 'America/Mexico_City') {
  if (!dayFmt.has(tz)) dayFmt.set(tz, new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }));
  return dayFmt.get(tz).format(new Date(t));
}
// ¿Toca el premio diario? (lastDay = último día de oficina en que se cobró)
export const dailyDue = (lastDay, t, tz) => lastDay !== officeDay(t, tz);

// Tiempo dentro del Hotel: acumula lo que pasó desde la última revisión (máx. `cap` por revisión,
// para que una pausa del servidor no regale horas) y paga cada `every`.
// state = { last: ms | null, acc: ms } → { state, pay: número de pagos }
export function accrueOnline(state, t, { every = ONLINE_EVERY_MS, cap = 5 * 60e3 } = {}) {
  const s = { last: state?.last ?? null, acc: state?.acc || 0 };
  if (s.last != null && t > s.last) s.acc += Math.min(t - s.last, cap);
  s.last = t;
  let pay = 0;
  while (s.acc >= every) { s.acc -= every; pay++; }
  return { state: s, pay };
}

// ---------- Intercambio seguro (máquina de estados) ----------
// Fases: 'offer' (cada quien arma su oferta y pone "Aceptar") → 'confirm' (los dos aceptaron: falta "Confirmar")
// → 'done'. Cualquier cambio en una oferta quita los dos "Aceptar" y regresa a 'offer'.
export function newTrade(a, b) {
  return {
    a, b, phase: 'offer', v: 0,
    offers: { [a]: { items: [], credits: 0 }, [b]: { items: [], credits: 0 } },
    accepted: { [a]: false, [b]: false }, confirmed: { [a]: false, [b]: false },
  };
}
const side = (T, uid) => (uid === T.a || uid === T.b ? uid : null);
const reset = (T) => { T.accepted[T.a] = T.accepted[T.b] = false; T.confirmed[T.a] = T.confirmed[T.b] = false; T.phase = 'offer'; T.v++; };

export function tradeSetOffer(T, uid, { items, credits } = {}) {
  if (!side(T, uid) || T.phase === 'done') return { error: 'No estás en este intercambio' };
  const o = T.offers[uid];
  const next = { items: items ? [...new Set(items.map(Number))].filter((n) => Number.isInteger(n) && n > 0) : o.items, credits: credits != null ? Math.trunc(Number(credits)) : o.credits };
  if (next.items.length > MAX_TRADE_ITEMS) return { error: `Máximo ${MAX_TRADE_ITEMS} furnis por lado` };
  if (!Number.isFinite(next.credits) || next.credits < 0 || next.credits > MAX_CREDITS) return { error: 'Cantidad de créditos inválida' };
  const same = next.credits === o.credits && next.items.length === o.items.length && next.items.every((x, i) => x === o.items[i]);
  if (same) return { ok: true, changed: false };
  T.offers[uid] = next;
  reset(T);
  return { ok: true, changed: true };
}
export function tradeAccept(T, uid, on = true) {
  if (!side(T, uid)) return { error: 'No estás en este intercambio' };
  if (T.phase !== 'offer') return { error: 'Ya aceptaron los dos: ahora falta confirmar' };
  const empty = !T.offers[T.a].items.length && !T.offers[T.b].items.length && !T.offers[T.a].credits && !T.offers[T.b].credits;
  if (on && empty) return { error: 'Pongan algo en el intercambio primero' };
  T.accepted[uid] = !!on;
  if (T.accepted[T.a] && T.accepted[T.b]) T.phase = 'confirm';
  return { ok: true, phase: T.phase };
}
export function tradeConfirm(T, uid) {
  if (!side(T, uid)) return { error: 'No estás en este intercambio' };
  if (T.phase !== 'confirm') return { error: 'Primero tienen que aceptar los dos' };
  T.confirmed[uid] = true;
  if (T.confirmed[T.a] && T.confirmed[T.b]) T.phase = 'done';
  return { ok: true, phase: T.phase };
}

// Códigos de canje: letras, números y guiones (sin distinguir mayúsculas)
export const normCode = (s) => String(s ?? '').trim().toUpperCase().replace(/\s+/g, '');
export const validCode = (s) => /^[A-Z0-9-]{4,24}$/.test(s);
