// Amigo secreto (intercambio de regalos de Navidad).
// El admin crea el intercambio; cada quien se apunta con su lista de deseos; en el sorteo
// a cada participante le toca alguien y SOLO ve a esa persona. Pueden mandarse mensajes
// anónimos. En la fecha de revelación todos ven la cadena completa.
import { db, now, tx } from './db.js';
import { emitAll, emitToUser } from './realtime.js';
import { audit } from './security.js';
import { drawPairs, chains } from '../shared/santa.js';

db.exec(`
CREATE TABLE IF NOT EXISTS santa_exchanges (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  budget TEXT NOT NULL DEFAULT '',
  signup_until INTEGER,
  draw_at INTEGER,
  reveal_at INTEGER,
  exclusions TEXT NOT NULL DEFAULT '[]',
  status TEXT NOT NULL DEFAULT 'open',
  drawn_at INTEGER,
  revealed_at INTEGER,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS santa_members (
  exchange_id INTEGER NOT NULL REFERENCES santa_exchanges(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  wishlist TEXT NOT NULL DEFAULT '',
  giftee_id INTEGER,
  joined_at INTEGER NOT NULL,
  PRIMARY KEY (exchange_id, user_id)
);
CREATE TABLE IF NOT EXISTS santa_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  exchange_id INTEGER NOT NULL REFERENCES santa_exchanges(id) ON DELETE CASCADE,
  santa_id INTEGER NOT NULL,
  giftee_id INTEGER NOT NULL,
  from_santa INTEGER NOT NULL,
  body TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
`);

const MIN_PEOPLE = 3;
const parse = (s, d) => { try { return JSON.parse(s); } catch { return d; } };
const current = () => db.prepare('SELECT * FROM santa_exchanges ORDER BY id DESC LIMIT 1').get();
const members = (exId) => db.prepare('SELECT * FROM santa_members WHERE exchange_id = ? ORDER BY joined_at').all(exId);
const member = (exId, uid) => db.prepare('SELECT * FROM santa_members WHERE exchange_id = ? AND user_id = ?').get(exId, uid);

function cleanTs(v) {
  if (v === null || v === '' || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? Math.round(n) : NaN;
}
function cleanWishlist(v) {
  return String(v ?? '').replace(/\r/g, '').trim().slice(0, 2000);
}
function cleanExclusions(v, ids = null) {
  if (!Array.isArray(v)) return [];
  const out = [], seen = new Set();
  for (const p of v.slice(0, 200)) {
    if (!Array.isArray(p)) continue;
    const a = Number(p[0]), b = Number(p[1]);
    if (!a || !b || a === b || (ids && (!ids.includes(a) || !ids.includes(b)))) continue;
    const k = a < b ? `${a}:${b}` : `${b}:${a}`;
    if (seen.has(k)) continue;
    seen.add(k); out.push([a, b]);
  }
  return out;
}

let notifyFn = () => {};

// Sorteo: guarda a quién le toca a cada quien y avisa (en privado) a cada participante
export function runDraw(ex, actorId = null) {
  const list = members(ex.id);
  if (list.length < MIN_PEOPLE) return { error: `Se necesitan al menos ${MIN_PEOPLE} participantes para el sorteo` };
  const pairs = drawPairs(list.map((m) => m.user_id), parse(ex.exclusions, []));
  if (!pairs) return { error: 'No se puede hacer el sorteo con esas exclusiones. Quita alguna e inténtalo otra vez.' };
  tx(() => {
    for (const [a, b] of Object.entries(pairs)) db.prepare('UPDATE santa_members SET giftee_id = ? WHERE exchange_id = ? AND user_id = ?').run(b, ex.id, Number(a));
    db.prepare("UPDATE santa_exchanges SET status = 'drawn', drawn_at = ? WHERE id = ?").run(now(), ex.id);
  });
  // El nombre no va en el aviso (se vería en pantalla o en el celular): se ve al abrir el Amigo secreto
  for (const a of Object.keys(pairs)) {
    notifyFn(Number(a), 'santa', actorId, { kind: 'drawn', exchange: ex.name, text: `🎁 Ya salió el sorteo de "${ex.name}". Entra a ver a quién le regalas 🤫` });
  }
  emitAll('santa', { id: ex.id, status: 'drawn' });
  return { ok: true };
}

function runReveal(ex) {
  db.prepare("UPDATE santa_exchanges SET status = 'revealed', revealed_at = ? WHERE id = ?").run(now(), ex.id);
  for (const m of members(ex.id)) notifyFn(m.user_id, 'santa', null, { kind: 'reveal', exchange: ex.name, text: `🎉 ¡Se revelaron los amigos secretos de "${ex.name}"! Entra a ver quién te regaló.` });
  emitAll('santa', { id: ex.id, status: 'revealed' });
}

// Revisa fechas: sorteo y revelación automáticos
export function santaTick(t = now()) {
  const ex = current();
  if (!ex) return;
  if (ex.status === 'open' && ex.draw_at && t >= ex.draw_at) {
    const r = runDraw(ex);
    if (r.error) {
      // No se pudo: se quita la fecha para no reintentar a cada rato y se avisa a quien lo creó
      db.prepare('UPDATE santa_exchanges SET draw_at = NULL WHERE id = ?').run(ex.id);
      if (ex.created_by) notifyFn(ex.created_by, 'santa', null, { kind: 'drawFail', exchange: ex.name, text: `⚠️ No se pudo hacer el sorteo de "${ex.name}": ${r.error}` });
      emitAll('santa', { id: ex.id });
    }
  } else if (ex.status === 'drawn' && ex.reveal_at && t >= ex.reveal_at) runReveal(ex);
}

function stateFor(user) {
  santaTick();
  const ex = current();
  if (!ex) return { exchange: null };
  const list = members(ex.id);
  const mine = list.find((m) => m.user_id === user.id);
  const t = now();
  const isAdmin = user.role === 'admin';
  const open = ex.status === 'open';
  const out = {
    exchange: {
      id: ex.id, name: ex.name, budget: ex.budget, signupUntil: ex.signup_until, drawAt: ex.draw_at, revealAt: ex.reveal_at,
      status: ex.status, drawnAt: ex.drawn_at, revealedAt: ex.revealed_at, createdAt: ex.created_at,
      participants: list.map((m) => m.user_id),
      ...(isAdmin ? { exclusions: parse(ex.exclusions, []) } : {}),
    },
    me: mine ? { joined: true, wishlist: mine.wishlist } : { joined: false, wishlist: '' },
    canJoin: open && !mine && (!ex.signup_until || t < ex.signup_until),
    canEdit: open && !!mine,
  };
  if (mine && ex.status !== 'open' && mine.giftee_id) {
    const g = list.find((m) => m.user_id === mine.giftee_id);
    out.giftee = { userId: mine.giftee_id, wishlist: g?.wishlist || '' };
    const msgs = db.prepare('SELECT * FROM santa_messages WHERE exchange_id = ? AND (santa_id = ? OR giftee_id = ?) ORDER BY id').all(ex.id, user.id, user.id);
    // Como santa (a mi amigo secreto) y como regalado (de mi santa anónimo)
    out.toGiftee = msgs.filter((m) => m.santa_id === user.id).map((m) => ({ id: m.id, mine: !!m.from_santa, body: m.body, at: m.created_at }));
    out.fromSanta = msgs.filter((m) => m.giftee_id === user.id).map((m) => ({ id: m.id, mine: !m.from_santa, body: m.body, at: m.created_at }));
  }
  if (ex.status === 'revealed') {
    const pairs = Object.fromEntries(list.filter((m) => m.giftee_id).map((m) => [m.user_id, m.giftee_id]));
    out.chains = chains(pairs);
    out.pairs = Object.entries(pairs).map(([from, to]) => ({ from: Number(from), to }));
  }
  return out;
}

export function registerSantaRoutes(api, { fail, notify, requireAdmin, wrap }) {
  notifyFn = notify;
  const tick = setInterval(() => { try { santaTick(); } catch (e) { console.error('[santa]', e.message); } }, 30_000);
  tick.unref?.();

  const changed = (ex) => emitAll('santa', { id: ex.id });

  api.get('/santa', (req, res) => res.json(stateFor(req.user)));

  // ----- Participantes -----
  api.post('/santa/join', wrap((req, res) => {
    const ex = current();
    if (!ex) return fail(res, 404, 'No hay intercambio de regalos activo');
    if (ex.status !== 'open') return fail(res, 400, 'El sorteo ya se hizo');
    if (ex.signup_until && now() >= ex.signup_until) return fail(res, 400, 'Ya cerró la inscripción');
    if (member(ex.id, req.user.id)) return fail(res, 409, 'Ya estás participando');
    db.prepare('INSERT INTO santa_members (exchange_id, user_id, wishlist, joined_at) VALUES (?, ?, ?, ?)').run(ex.id, req.user.id, cleanWishlist(req.body?.wishlist), now());
    changed(ex);
    res.json(stateFor(req.user));
  }));

  api.patch('/santa/wishlist', wrap((req, res) => {
    const ex = current();
    if (!ex || !member(ex.id, req.user.id)) return fail(res, 404, 'No estás participando');
    if (ex.status !== 'open') return fail(res, 400, 'Tu lista ya no se puede cambiar: el sorteo ya se hizo');
    db.prepare('UPDATE santa_members SET wishlist = ? WHERE exchange_id = ? AND user_id = ?').run(cleanWishlist(req.body?.wishlist), ex.id, req.user.id);
    res.json(stateFor(req.user));
  }));

  api.post('/santa/leave', wrap((req, res) => {
    const ex = current();
    if (!ex || !member(ex.id, req.user.id)) return fail(res, 404, 'No estás participando');
    if (ex.status !== 'open') return fail(res, 400, 'Ya no puedes salirte: el sorteo ya se hizo');
    db.prepare('DELETE FROM santa_members WHERE exchange_id = ? AND user_id = ?').run(ex.id, req.user.id);
    changed(ex);
    res.json(stateFor(req.user));
  }));

  // Mensajes anónimos: a tu amigo secreto (to: 'giftee') o de vuelta a tu santa (to: 'santa')
  api.post('/santa/messages', wrap((req, res) => {
    const ex = current();
    const me = ex && member(ex.id, req.user.id);
    if (!me || ex.status === 'open') return fail(res, 400, 'Los mensajes se abren después del sorteo');
    const body = String(req.body?.body || '').trim().slice(0, 500);
    if (!body) return fail(res, 400, 'Escribe un mensaje');
    const to = req.body?.to === 'santa' ? 'santa' : 'giftee';
    let santa, giftee;
    if (to === 'giftee') { santa = req.user.id; giftee = me.giftee_id; }
    else {
      giftee = req.user.id;
      santa = db.prepare('SELECT user_id FROM santa_members WHERE exchange_id = ? AND giftee_id = ?').get(ex.id, req.user.id)?.user_id;
    }
    if (!santa || !giftee) return fail(res, 400, 'No hay a quién mandarle el mensaje');
    const recent = db.prepare('SELECT COUNT(*) AS n FROM santa_messages WHERE exchange_id = ? AND created_at > ? AND ((from_santa = 1 AND santa_id = ?) OR (from_santa = 0 AND giftee_id = ?))').get(ex.id, now() - 60_000, req.user.id, req.user.id).n;
    if (recent >= 10) return fail(res, 429, 'Vas muy rápido. Espera un momento.');
    db.prepare('INSERT INTO santa_messages (exchange_id, santa_id, giftee_id, from_santa, body, created_at) VALUES (?, ?, ?, ?, ?, ?)').run(ex.id, santa, giftee, to === 'giftee' ? 1 : 0, body, now());
    const target = to === 'giftee' ? giftee : santa;
    notifyFn(target, 'santa', null, {
      kind: 'message', from: to === 'giftee' ? 'santa' : 'giftee', exchange: ex.name,
      text: to === 'giftee' ? `🎅 Tu amigo secreto te escribió: ${body.slice(0, 120)}` : `🎁 Tu amigo secreto (a quien le regalas) te respondió: ${body.slice(0, 120)}`,
    });
    emitToUser(target, 'santa', { id: ex.id, message: true });
    res.json(stateFor(req.user));
  }));

  // ----- Administración -----
  api.post('/santa', requireAdmin, wrap((req, res) => {
    const ex = current();
    if (ex && ex.status !== 'revealed') return fail(res, 409, 'Ya hay un intercambio en curso. Termínalo o bórralo primero.');
    const b = req.body || {};
    const name = String(b.name || '').trim().slice(0, 60) || 'Intercambio de regalos';
    const ts = { signup: cleanTs(b.signupUntil), draw: cleanTs(b.drawAt), reveal: cleanTs(b.revealAt) };
    if (Object.values(ts).some(Number.isNaN)) return fail(res, 400, 'Fecha inválida');
    db.prepare('INSERT INTO santa_exchanges (name, budget, signup_until, draw_at, reveal_at, exclusions, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
      .run(name, String(b.budget || '').trim().slice(0, 80), ts.signup, ts.draw, ts.reveal, JSON.stringify(cleanExclusions(b.exclusions)), req.user.id, now());
    audit({ actor: req.user.id, action: `Creó el intercambio de regalos "${name}"`, ip: req.ip });
    changed(current());
    res.json(stateFor(req.user));
  }));

  api.patch('/santa', requireAdmin, wrap((req, res) => {
    const ex = current();
    if (!ex) return fail(res, 404, 'No hay intercambio');
    const b = req.body || {};
    const set = {};
    if (b.name !== undefined) set.name = String(b.name).trim().slice(0, 60) || ex.name;
    if (b.budget !== undefined) set.budget = String(b.budget).trim().slice(0, 80);
    for (const [k, col] of [['signupUntil', 'signup_until'], ['drawAt', 'draw_at'], ['revealAt', 'reveal_at']]) {
      if (b[k] === undefined) continue;
      const v = cleanTs(b[k]);
      if (Number.isNaN(v)) return fail(res, 400, 'Fecha inválida');
      set[col] = v;
    }
    if (b.exclusions !== undefined) {
      if (ex.status !== 'open') return fail(res, 400, 'El sorteo ya se hizo');
      set.exclusions = JSON.stringify(cleanExclusions(b.exclusions));
    }
    const cols = Object.keys(set);
    if (cols.length) db.prepare(`UPDATE santa_exchanges SET ${cols.map((c) => `${c} = ?`).join(', ')} WHERE id = ?`).run(...cols.map((c) => set[c]), ex.id);
    changed(ex);
    res.json(stateFor(req.user));
  }));

  api.delete('/santa', requireAdmin, wrap((req, res) => {
    const ex = current();
    if (!ex) return fail(res, 404, 'No hay intercambio');
    db.prepare('DELETE FROM santa_exchanges WHERE id = ?').run(ex.id);
    audit({ actor: req.user.id, action: `Borró el intercambio de regalos "${ex.name}"`, ip: req.ip });
    emitAll('santa', { id: ex.id, deleted: true });
    res.json({ ok: true });
  }));

  api.post('/santa/draw', requireAdmin, wrap((req, res) => {
    const ex = current();
    if (!ex) return fail(res, 404, 'No hay intercambio');
    if (ex.status !== 'open') return fail(res, 400, 'El sorteo ya se hizo');
    const r = runDraw(ex, req.user.id);
    if (r.error) return fail(res, 400, r.error);
    audit({ actor: req.user.id, action: `Hizo el sorteo del amigo secreto "${ex.name}"`, ip: req.ip });
    res.json(stateFor(req.user));
  }));

  api.post('/santa/reveal', requireAdmin, wrap((req, res) => {
    const ex = current();
    if (!ex || ex.status !== 'drawn') return fail(res, 400, 'Primero haz el sorteo');
    runReveal(ex);
    audit({ actor: req.user.id, action: `Reveló el amigo secreto "${ex.name}"`, ip: req.ip });
    res.json(stateFor(req.user));
  }));

  // Ver las asignaciones antes de revelar: solo si el admin lo pide, y queda registrado
  api.post('/santa/peek', requireAdmin, wrap((req, res) => {
    const ex = current();
    if (!ex || ex.status === 'open') return fail(res, 400, 'Todavía no hay sorteo');
    audit({ actor: req.user.id, action: `Vio las asignaciones del amigo secreto "${ex.name}"`, ip: req.ip });
    res.json({ pairs: members(ex.id).filter((m) => m.giftee_id).map((m) => ({ from: m.user_id, to: m.giftee_id })) });
  }));
}
