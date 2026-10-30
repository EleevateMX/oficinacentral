// Fondo 3D del menú principal: la oficina de noche, niebla, luz verde de salida, unos zombis
// que deambulan a lo lejos y tu personaje agachado junto a una lámpara. La cámara se mece despacio.
// Solo es decorado: no toca la simulación (los zombis de aquí no existen para el juego).
import * as THREE from 'three';
import { cellAt, CELL, TILE_M } from '@shared/zombies.js';
import { voxelAvatar, part } from './models.js';

const S = TILE_M;
const open = (L, x, y) => cellAt(L, x, y) === CELL.EMPTY;

// Distancia libre desde (x,y) hacia el ángulo a (en casillas)
function rayFree(L, x, y, a, max = 22) {
  const dx = Math.cos(a), dy = Math.sin(a);
  let d = 0;
  while (d < max && open(L, x + dx * d, y + dy * d)) d += 0.25;
  return d;
}

export class MenuScene {
  // shared (opcional): { rim, exit } luces del juego que el menú usa prestadas mientras se ve (cada
  // luz cuesta en cada pixel de todo el juego: así hay 2 menos). Se devuelven como estaban.
  constructor(scene, level, avatar = {}, shared = null) {
    this.scene = scene;
    this.group = new THREE.Group();
    this.group.visible = false;
    scene.add(this.group);
    const L = level;
    const sx = L.start.x, sy = L.start.y;
    // Hacia dónde mirar: la vista más larga desde el arranque (con un poco de amplitud a los lados)
    let best = 0, bestA = 0;
    for (let i = 0; i < 48; i++) {
      const a = (i / 48) * Math.PI * 2;
      const d = rayFree(L, sx, sy, a) + 0.4 * Math.min(rayFree(L, sx, sy, a - 0.25), rayFree(L, sx, sy, a + 0.25));
      if (d > best) { best = d; bestA = a; }
    }
    this.a = bestA;
    const back = Math.min(1.2, rayFree(L, sx, sy, bestA + Math.PI) - 0.4);
    this.cx = sx - Math.cos(bestA) * Math.max(0, back);
    this.cy = sy - Math.sin(bestA) * Math.max(0, back);
    const far = rayFree(L, this.cx, this.cy, bestA);
    this.far = far;

    // Zombis que deambulan en el fondo
    this.zombies = [];
    const fx = Math.cos(bestA), fy = Math.sin(bestA), px = -fy, py = fx;
    const wanted = [[5.5, -1.6], [7.5, 1.4], [9.5, -0.4], [12, 2.2], [13.5, -2.4], [16, 0.6]];
    let id = 900001;
    for (const [d0, lat] of wanted) {
      const d = Math.min(d0, far - 1.2);
      if (d < 3.5) continue;
      const x = this.cx + fx * d + px * lat, y = this.cy + fy * d + py * lat;
      if (!open(L, x, y)) continue;
      // camina de un lado a otro sobre una línea corta
      const ang = Math.random() * Math.PI * 2;
      let len = 0;
      while (len < 2.4 && open(L, x + Math.cos(ang) * (len + 0.4), y + Math.sin(ang) * (len + 0.4))) len += 0.2;
      this.zombies.push({ id: id++, kind: ['normal', 'normal', 'runner', 'tank', 'spitter', 'normal'][this.zombies.length % 6], x0: x, y0: y, ang, len, ph: Math.random() * 10, sp: 0.18 + Math.random() * 0.15, walk: 0 });
    }

    // Tu personaje, agachado junto a una lámpara (a un lado, en primer plano)
    // a la derecha de la imagen (el menú va a la izquierda), si cabe
    const side = [1, -1].find((k) => open(L, this.cx + fx * 3 + px * 1.35 * k, this.cy + fy * 3 + py * 1.35 * k)) ?? 1;
    const ax = this.cx + fx * 3 + px * 1.35 * side, ay = this.cy + fy * 3 + py * 1.35 * side;
    const me = voxelAvatar(avatar, '', '#FE3377');
    me.traverse((o) => { if (o.isSprite) o.visible = false; });
    const u = me.userData;
    u.hip.position.y = 0.47;
    u.legL.rotation.x = -1.0; // pie al frente
    u.legR.rotation.x = 1.4; // rodilla al piso
    u.armL.rotation.set(-1.15, 0, 0.35); u.armR.rotation.set(-1.25, 0, -0.05);
    u.torso.rotation.x = 0.18;
    me.position.set(ax * S, 0, ay * S);
    // mira hacia la horda, de tres cuartos
    me.rotation.y = Math.PI / 2 - (bestA - side * 0.5);
    this.me = me;
    this.group.add(me);
    // Lámpara de escritorio en el piso, con luz cálida
    const lamp = new THREE.Group();
    lamp.add(part(0.2, 0.04, 0.2, '#2b2f3a', { y: 0.02 }));
    lamp.add(part(0.03, 0.34, 0.03, '#2b2f3a', { y: 0.2 }));
    const shade = part(0.18, 0.12, 0.18, '#ffd27a', { y: 0.4, glow: true, shadow: false });
    lamp.add(shade);
    const lx = ax + px * 0.55 * side + fx * 0.15, ly = ay + py * 0.55 * side + fy * 0.15;
    lamp.position.set(lx * S, 0, ly * S);
    this.group.add(lamp);
    this.warmPos = new THREE.Vector3(lx * S, 0.6, ly * S);
    // Brillo verde de "salida" al fondo
    const gd = Math.max(4, far - 0.8);
    this.exitPos = new THREE.Vector3((this.cx + fx * gd) * S, 2.1, (this.cy + fy * gd) * S);
    // Luz fría muy tenue desde la cámara (para que se lean las siluetas)
    this.MENU = { exit: ['#38ff6a', 9, 14, 1.4], rim: ['#7d8cff', 2.2, 10, 1.5], warm: ['#ffb35c', 7, 6.5, 1.6] };
    this.POS = { exit: this.exitPos, warm: this.warmPos };
    this.own = !shared;
    if (shared) this.share(shared);
    else {
      // las luces quedan siempre en la escena (ver setActive)
      for (const k of ['exit', 'rim', 'warm']) { this[k] = new THREE.PointLight(...this.MENU[k]); scene.add(this[k]); }
    }
    this.exit.position.copy(this.exitPos);
    this.warm.position.copy(this.warmPos);
    this.lights = [this.warm, this.exit, this.rim];
    this.base = [7, 9, 2.2];
    this.setActive(false);
    this.t = 0;
  }

  // Las luces no se esconden: se apagan con intensidad 0. Si cambiara el número de luces,
  // three.js tendría que volver a compilar todos los materiales y el juego se congelaría.
  setActive(on) {
    if (this._on === on) return;
    this._on = on;
    this.group.visible = on;
    if (!this.own) {
      // luces prestadas: con el menú, su color y alcance de menú; sin él, los del juego
      for (const k of ['exit', 'rim', 'warm']) {
        const l = this[k], v = on ? this.MENU[k] : this.saved[k];
        if (!l) continue;
        l.color.set(v[0]); l.distance = v[2]; l.decay = v[3];
        if (on && this.POS[k]) l.position.copy(this.POS[k]);
        if (!on) { l.position.copy(this.saved[k][4]); l.intensity = this.saved[k][1]; }
      }
    }
    if (on || this.own) this.lights.forEach((l, i) => { l.intensity = on ? this.base[i] : 0; });
    else { this.exit.intensity = 0; this.rim.intensity = 0; } // la lámpara prestada vuelve a lo suyo
  }
  // Toma prestadas las luces del juego (otra vez si el mundo se rearmó)
  share({ rim, exit, warm }) {
    const was = this._on;
    if (was && this.saved) this.setActive(false);
    this.rim = rim; this.exit = exit; this.warm = warm;
    const keep = (l) => ['#' + l.color.getHexString(), l.intensity, l.distance, l.decay, l.position.clone()];
    this.saved = { rim: keep(rim), exit: keep(exit), warm: keep(warm) };
    if (this.lights) this.lights = [this.warm, this.exit, this.rim];
    if (was) { this._on = false; this.setActive(true); }
  }
  get active() { return this.group.visible; }

  // Mueve la cámara y devuelve los zombis de adorno (en metros, como los espera Horde.update)
  update(dt, time, camera) {
    this.t += dt;
    const t = this.t;
    const a = this.a + Math.sin(t * 0.09) * 0.16 + Math.sin(t * 0.031) * 0.06;
    const push = Math.sin(t * 0.05) * 0.35;
    const x = this.cx + Math.cos(this.a) * push, y = this.cy + Math.sin(this.a) * push;
    camera.position.set(x * S, 1.35 + Math.sin(t * 0.4) * 0.03, y * S);
    camera.rotation.set(-0.06 + Math.sin(t * 0.13) * 0.02, -a - Math.PI / 2, Math.sin(t * 0.07) * 0.012);
    this.rim.position.copy(camera.position);
    this.warm.intensity = 6.2 + Math.sin(t * 7.3) * 0.25 + (Math.random() < 0.02 ? -2 : 0);
    this.exit.intensity = 8 + Math.sin(t * 1.7) * 1.5;
    // respiración del personaje
    this.me.userData.torso.rotation.x = 0.18 + Math.sin(t * 1.6) * 0.03;
    this.me.userData.head.rotation.y = Math.sin(t * 0.35) * 0.25;
    const out = [];
    for (const z of this.zombies) {
      z.ph += dt * z.sp;
      const k = (Math.sin(z.ph) + 1) / 2; // de 0 a 1 y de regreso
      const dir = Math.cos(z.ph) >= 0 ? 0 : Math.PI;
      z.walk += dt * 2.4;
      const zx = z.x0 + Math.cos(z.ang) * z.len * k, zy = z.y0 + Math.sin(z.ang) * z.len * k;
      out.push({ id: z.id, kind: z.kind, x: zx * S, z: zy * S, a: z.ang + dir, st: 'walk', t: 0, flash: 0, walk: z.walk, h: 1.8 });
    }
    return out;
  }

  dispose() { this.scene.remove(this.group); if (this.own) { this.scene.remove(this.exit); this.scene.remove(this.rim); this.scene.remove(this.warm); } }
}
