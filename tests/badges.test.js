// Placas (badges): catálogo, otorgar/quitar, elegir (máx. 5, solo propias), fan vs. roles,
// permisos de admin, placas personalizadas, canales de streamer, "en vivo" que vence y Hotel.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { startServer, adminClient, createMember } from './helpers/server.js';
import { STATIC_BADGES, GLYPHS, SHAPES, parseChannel, cleanArt, isGrantable, isFanBadge, BADGE_SIZE } from '../shared/badges.js';
import { ACHIEVEMENTS } from '../shared/achievements.js';
import { renderBadge, GLYPH_ART } from '../client/src/lib/badgeArt.js';

// ---------- Lógica pura ----------
test('placas: ids únicos y catálogo completo', () => {
  const ids = STATIC_BADGES.map((b) => b.id);
  assert.equal(new Set(ids).size, ids.length, 'hay ids repetidos');
  for (const a of ACHIEVEMENTS) assert.ok(ids.includes(a.id), `falta el logro ${a.id}`);
  for (const id of ['role:fundador', 'role:admin', 'role:moderador', 'role:staff', 'role:vip', 'role:beta', 'role:embajador', 'role:artista', 'role:organizador', 'role:campeon', 'role:veterano',
    'stream:kick', 'stream:twitch', 'stream:youtube', 'stream:tiktok', 'stream:streamer', 'event:halloween-2026', 'event:navidad-2026', 'event:aniversario', 'event:primer-dia', 'fan:lol', 'fan:minecraft']) {
    assert.ok(ids.includes(id), `falta ${id}`);
  }
  for (const b of STATIC_BADGES) {
    assert.ok(b.name && b.desc && b.category, b.id);
    assert.ok(SHAPES.includes(b.art.shape), `${b.id}: forma`);
    assert.ok(b.art.text || GLYPHS.includes(b.art.glyph), `${b.id}: glifo`);
  }
  assert.ok(isFanBadge('fan:lol') && !isFanBadge('role:admin'));
  assert.ok(isGrantable('role:vip') && isGrantable('custom:3') && !isGrantable('dance'));
});

test('placas: se dibujan (cada glifo y forma, 40×40 con contorno)', () => {
  for (const g of GLYPHS) assert.ok(GLYPH_ART[g], `falta el dibujo de ${g}`);
  for (const b of STATIC_BADGES) {
    const px = renderBadge(b.art, b.category === 'achievement' ? { tier: 3 } : {});
    assert.equal(px.length, BADGE_SIZE * BADGE_SIZE * 4);
    let solid = 0;
    for (let i = 3; i < px.length; i += 4) if (px[i] === 255) solid++;
    assert.ok(solid > 600, `${b.id} casi vacía`);
  }
  // Las letras también
  assert.ok(renderBadge({ shape: 'square', bg: '#53FC18', text: 'HUB', color: '#101120' }).some((v, i) => i % 4 === 3 && v));
});

test('placas: validación de canales por plataforma', () => {
  assert.deepEqual(parseChannel('kick', 'https://kick.com/Fulano_99'), { handle: 'Fulano_99', url: 'https://kick.com/Fulano_99' });
  assert.equal(parseChannel('kick', 'fulano').url, 'https://kick.com/fulano');
  assert.equal(parseChannel('twitch', 'www.twitch.tv/mi_canal').url, 'https://www.twitch.tv/mi_canal');
  assert.equal(parseChannel('youtube', 'https://youtube.com/@Creador.MX').url, 'https://www.youtube.com/@Creador.MX');
  assert.equal(parseChannel('youtube', 'https://www.youtube.com/channel/UCabcdefghijklmnopqrstuv').url, 'https://www.youtube.com/channel/UCabcdefghijklmnopqrstuv');
  assert.equal(parseChannel('tiktok', '@baila.mx').url, 'https://www.tiktok.com/@baila.mx');
  // Hosts malos
  assert.ok(parseChannel('kick', 'https://evil.com/fulano').error);
  assert.ok(parseChannel('kick', 'https://kick.com.evil.com/fulano').error);
  assert.ok(parseChannel('kick', 'https://twitch.tv/fulano').error);
  assert.ok(parseChannel('twitch', 'javascript:alert(1)').error);
  assert.ok(parseChannel('youtube', 'https://youtube.com/watch?v=xyz').error);
  assert.ok(parseChannel('kick', 'https://user:pw@kick.com/x').error);
  assert.ok(parseChannel('tiktok', 'https://www.tiktok.com/fulano').error, 'TikTok necesita @');
  assert.ok(parseChannel('kick', 'a b').error);
  assert.ok(parseChannel('nada', 'x').error);
});

test('placas: receta de placa personalizada', () => {
  assert.ok(cleanArt({ shape: 'blob', glyph: 'star' }).error);
  assert.ok(cleanArt({ shape: 'circle' }).error, 'sin glifo ni letras');
  assert.ok(cleanArt({ shape: 'circle', text: 'ABCD' }).error);
  assert.equal(cleanArt({ shape: 'circle', text: 'hub' }).art.text, 'HUB');
  const a = cleanArt({ shape: 'hex', glyph: 'trophy', bg: 'red', frame: '#e0b15a' }).art;
  assert.equal(a.frame, '#E0B15A');
  assert.equal(a.bg, '#5D7E9F', 'color inválido → por defecto');
});

// ---------- Servidor ----------
let srv, admin;
before(async () => { srv = await startServer(); admin = await adminClient(srv.url); });
after(async () => { await srv?.stop(); });
const dbOpen = () => new DatabaseSync(path.join(srv.dataDir, 'office.db'));

test('placas: otorgar, quitar, aviso en Actividad y bitácora', async () => {
  const ana = await createMember(srv.url, admin, 'AnaB');
  const g = await admin.post('/admin/badges/grant', { userId: ana.user.id, badgeId: 'role:vip', note: 'Por todo' });
  assert.equal(g.status, 200);
  assert.equal((await admin.post('/admin/badges/grant', { userId: ana.user.id, badgeId: 'role:vip' })).status, 409);
  assert.equal((await admin.post('/admin/badges/grant', { userId: ana.user.id, badgeId: 'dance' })).status, 400, 'los logros no se otorgan');
  assert.equal((await admin.post('/admin/badges/grant', { userId: ana.user.id, badgeId: 'role:nope' })).status, 400);
  const mine = (await ana.get(`/badges/user/${ana.user.id}`)).data;
  const vip = mine.owned.find((b) => b.id === 'role:vip');
  assert.equal(vip.source, 'grant');
  assert.equal(vip.note, 'Por todo');
  assert.deepEqual(mine.worn, ['role:vip'], 'se la pone sola si hay lugar');
  const n = (await ana.get('/notifications')).data.notifications.find((x) => x.type === 'badge');
  assert.equal(n.data.id, 'role:vip');
  const audit = (await admin.get('/admin/audit')).data;
  assert.ok(JSON.stringify(audit).includes('Otorgó la placa'));
  // Quitar
  assert.equal((await admin.del(`/admin/badges/grant/${ana.user.id}/${encodeURIComponent('role:vip')}`)).status, 200);
  assert.equal((await admin.del(`/admin/badges/grant/${ana.user.id}/${encodeURIComponent('role:vip')}`)).status, 404);
  const after2 = (await ana.get(`/badges/user/${ana.user.id}`)).data;
  assert.ok(!after2.owned.some((b) => b.id === 'role:vip'));
  assert.deepEqual(after2.worn, []);
});

test('placas: elegir hasta 5 y solo las propias, en orden', async () => {
  const beto = await createMember(srv.url, admin, 'BetoB');
  for (const id of ['role:staff', 'role:beta', 'role:artista', 'event:aniversario', 'role:embajador', 'role:organizador']) {
    assert.equal((await admin.post('/admin/badges/grant', { userId: beto.user.id, badgeId: id })).status, 200);
  }
  assert.equal((await beto.get(`/badges/user/${beto.user.id}`)).data.worn.length, 5, 'solo se pone 5 solas');
  const r = await beto.put('/badges/worn', { ids: ['role:organizador', 'role:vip', 'role:staff', 'role:staff', 'event:aniversario', 'role:beta', 'role:artista', 'role:embajador'] });
  assert.equal(r.status, 200);
  assert.deepEqual(r.data.worn, ['role:organizador', 'role:staff', 'event:aniversario', 'role:beta', 'role:artista']);
  assert.equal((await beto.put('/badges/worn', { ids: 'role:staff' })).status, 400);
});

test('placas: las de fan se piden solas, las de rol no; no-admins no otorgan ni crean', async () => {
  const caro = await createMember(srv.url, admin, 'CaroB');
  const c = await caro.post('/badges/claim', { id: 'fan:minecraft' });
  assert.equal(c.status, 200);
  assert.ok(c.data.owned.some((b) => b.id === 'fan:minecraft' && b.source === 'claim'));
  assert.ok(c.data.worn.includes('fan:minecraft'));
  assert.equal((await caro.post('/badges/claim', { id: 'role:admin' })).status, 403);
  assert.equal((await caro.post('/badges/claim', { id: 'stream:kick' })).status, 403);
  assert.equal((await caro.del(`/badges/claim/${encodeURIComponent('fan:minecraft')}`)).status, 200);
  assert.ok(!(await caro.get(`/badges/user/${caro.user.id}`)).data.owned.some((b) => b.id === 'fan:minecraft'));
  // No es admin
  assert.equal((await caro.post('/admin/badges/grant', { userId: caro.user.id, badgeId: 'role:admin' })).status, 403);
  assert.equal((await caro.post('/admin/badges/custom', { name: 'Hack', art: { shape: 'circle', glyph: 'star' } })).status, 403);
  assert.equal((await caro.get('/admin/badges/channels')).status, 403);
  assert.ok(!(await caro.get(`/badges/user/${caro.user.id}`)).data.owned.some((b) => b.id === 'role:admin'));
});

test('placas: personalizadas (crear, otorgar, editar, borrar)', async () => {
  const dani = await createMember(srv.url, admin, 'DaniB');
  assert.equal((await admin.post('/admin/badges/custom', { name: 'X', art: { shape: 'circle', glyph: 'star' } })).status, 400);
  assert.equal((await admin.post('/admin/badges/custom', { name: 'Héroe', art: { shape: 'circle', glyph: 'nope' } })).status, 400);
  const c = await admin.post('/admin/badges/custom', { name: 'Héroe del server', desc: 'Salvó el día', art: { shape: 'shield', text: 'hub', bg: '#E0B15A' } });
  assert.equal(c.status, 200);
  const id = c.data.badge.id;
  assert.match(id, /^custom:\d+$/);
  assert.ok((await dani.get('/badges/catalog')).data.custom.some((b) => b.id === id && b.art.text === 'HUB'));
  assert.equal((await admin.post('/admin/badges/grant', { userId: dani.user.id, badgeId: id })).status, 200);
  assert.equal((await admin.patch(`/admin/badges/custom/${id.split(':')[1]}`, { name: 'Héroe HUB' })).data.badge.name, 'Héroe HUB');
  assert.equal((await admin.del(`/admin/badges/custom/${id.split(':')[1]}`)).status, 200);
  const d = (await dani.get(`/badges/user/${dani.user.id}`)).data;
  assert.ok(!d.owned.some((b) => b.id === id));
  assert.ok(!d.worn.includes(id));
});

test('placas: canales, verificación y "en vivo" que se apaga a las 6 h', async () => {
  const eli = await createMember(srv.url, admin, 'EliB');
  assert.equal((await eli.put('/badges/channels/kick', { value: 'https://evil.com/eli' })).status, 400);
  assert.equal((await eli.put('/badges/channels/myspace', { value: 'eli' })).status, 400);
  assert.equal((await eli.post('/badges/live', { platform: 'kick' })).status, 400, 'sin canal no hay en vivo');
  const ch = await eli.put('/badges/channels/kick', { value: 'kick.com/eli_live' });
  assert.equal(ch.status, 200);
  assert.deepEqual(ch.data.channels[0], { platform: 'kick', handle: 'eli_live', url: 'https://kick.com/eli_live', verified: false, verifiedAt: null });
  // Otros no ven los canales sin verificar
  assert.equal((await admin.get(`/badges/user/${eli.user.id}`)).data.channels.length, 1);
  const other = await createMember(srv.url, admin, 'OtroB');
  assert.equal((await other.get(`/badges/user/${eli.user.id}`)).data.channels.length, 0);
  // Verificar → placa de Kick
  assert.equal((await other.post(`/admin/badges/channels/${eli.user.id}/kick/verify`, {})).status, 403);
  assert.equal((await admin.post(`/admin/badges/channels/${eli.user.id}/kick/verify`, {})).status, 200);
  let mine = (await eli.get(`/badges/user/${eli.user.id}`)).data;
  assert.ok(mine.owned.some((b) => b.id === 'stream:kick' && b.source === 'verify'));
  assert.equal((await other.get(`/badges/user/${eli.user.id}`)).data.channels[0].verified, true);
  // En vivo
  const l = await eli.post('/badges/live', { platform: 'kick', announce: 'office' });
  assert.equal(l.status, 200);
  assert.equal(l.data.live.url, 'https://kick.com/eli_live');
  assert.ok(Math.abs(l.data.live.expiresAt - l.data.live.startedAt - 6 * 36e5) < 1000);
  assert.ok((await other.get('/badges/live')).data.live.some((x) => x.userId === eli.user.id));
  // Se vence: movemos la hora en la base
  const db = dbOpen();
  db.prepare('UPDATE streamer_live SET expires_at = ? WHERE user_id = ?').run(Date.now() - 1000, eli.user.id);
  db.close();
  assert.ok(!(await other.get('/badges/live')).data.live.some((x) => x.userId === eli.user.id));
  assert.equal((await other.get(`/badges/user/${eli.user.id}`)).data.live, null);
  // Terminar a mano
  await eli.post('/badges/live', { platform: 'kick' });
  assert.equal((await eli.del('/badges/live')).status, 200);
  assert.equal((await eli.get(`/badges/user/${eli.user.id}`)).data.live, null);
  // Cambiar el canal quita la verificación y su placa
  await eli.put('/badges/channels/kick', { value: 'otro_canal' });
  mine = (await eli.get(`/badges/user/${eli.user.id}`)).data;
  assert.equal(mine.channels[0].verified, false);
  assert.ok(!mine.owned.some((b) => b.id === 'stream:kick'));
});

test('placas: la tarjeta del Hotel usa las placas elegidas (y migra las de antes)', async () => {
  const fer = await createMember(srv.url, admin, 'FerB');
  const db = dbOpen();
  // Antes: logro ganado y elegido en el Hotel (hotel_social_profiles.badges)
  db.prepare('INSERT INTO achievements (user_id, badge, tier, earned_at) VALUES (?, ?, ?, ?)').run(fer.user.id, 'dance', 3, Date.now());
  db.prepare("INSERT INTO hotel_social_profiles (user_id, badges) VALUES (?, '[\"dance\"]')").run(fer.user.id);
  db.close();
  let prof = (await admin.get(`/hotel/social/profile/${fer.user.id}`)).data;
  assert.deepEqual(prof.badges, [{ id: 'dance', tier: 3 }], 'migró la selección vieja');
  assert.deepEqual((await fer.get(`/badges/user/${fer.user.id}`)).data.worn, ['dance']);
  // Ahora con placas nuevas
  await admin.post('/admin/badges/grant', { userId: fer.user.id, badgeId: 'role:fundador' });
  await fer.post('/badges/claim', { id: 'fan:lol' });
  await fer.put('/badges/worn', { ids: ['fan:lol', 'role:fundador', 'dance'] });
  prof = (await admin.get(`/hotel/social/profile/${fer.user.id}`)).data;
  assert.deepEqual(prof.badges, [{ id: 'fan:lol', tier: 0 }, { id: 'role:fundador', tier: 0 }, { id: 'dance', tier: 3 }]);
  // Y desde el Hotel también se puede elegir (mismo sistema)
  const p = await fer.patch('/hotel/social/profile', { badges: ['role:fundador', 'role:vip'] });
  assert.deepEqual(p.data.badges, ['role:fundador']);
  assert.deepEqual((await fer.get(`/badges/user/${fer.user.id}`)).data.worn, ['role:fundador']);
});
