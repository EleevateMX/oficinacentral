// Los demás jugadores en 3D: su personaje de cubos (el avatar real de cada quien), el arma que
// traen en la mano, agacharse, la animación al caer y la etiqueta con su nombre en el color de su
// equipo. Las etiquetas de los rivales solo se ven cuando los apuntas (como en un shooter de verdad).
import * as THREE from 'three';
import { voxelAvatar, animateAvatar, nameTag, part } from '../zombies/models.js';
import { viewWeapon, avatarSword } from '../zombies/arsenalModels.js';
import { ARMS } from '@shared/arsenal.js';
import { TILE_M } from '@shared/zombies.js';

const S = TILE_M;
const _YZ = new THREE.Vector3(0, 1, 1).normalize();

// Arma en tercera persona (va en la mano derecha del personaje)
export function handWeapon(w) {
  const W = ARMS[w];
  if (!W) return new THREE.Group();
  if (W.kind === 'sword') {
    const s = avatarSword(W.color);
    if (W.twoHand) s.scale.set(1.35, 1.25, 1.35);
    s.position.set(0, -0.5, 0.05); s.rotation.x = Math.PI / 2;
    return s;
  }
  const g = new THREE.Group();
  const vw = viewWeapon(w);
  const v = vw.group;
  const fl = part(0.2, 0.2, 0.06, '#fff3a8', { glow: true, shadow: false });
  fl.visible = false;
  vw.muzzle.add(fl);
  g.userData.flash = fl;
  v.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  // el arma apunta a -Z con +Y arriba; en el brazo "adelante" es -Y y "arriba" es +Z (media vuelta en el eje Y+Z)
  v.quaternion.setFromAxisAngle(_YZ, Math.PI);
  v.position.set(0, -0.5, 0.02);
  v.scale.multiplyScalar(0.95);
  g.add(v);
  return g;
}

export class Avatars {
  constructor(scene) { this.scene = scene; this.map = new Map(); }

  get(seat, uid, look, name, color) {
    let a = this.map.get(seat);
    const key = `${uid}|${name}|${color}`;
    if (a && a.key !== key) { this.scene.remove(a.g); this.map.delete(seat); a = null; }
    if (!a) {
      const g = voxelAvatar(look || {}, name, color);
      g.rotation.order = 'YXZ';
      g.userData.gun.visible = false; // el arma de verdad va aparte
      a = { key, g, w: -1, weapon: null, fireT: 0, slashT: 0, deadT: -1, last: null, tagOn: true, alive: true, crK: 0 };
      this.map.set(seat, a);
      this.scene.add(g);
    }
    return a;
  }
  remove(seat) { const a = this.map.get(seat); if (a) { this.scene.remove(a.g); this.map.delete(seat); } }
  keep(seats) { for (const s of [...this.map.keys()]) if (!seats.has(s)) this.remove(s); }
  fire(seat) { const a = this.map.get(seat); if (a) a.fireT = 0.07; }
  slash(seat) { const a = this.map.get(seat); if (a) a.slashT = 0.3; }

  // p = { x, y, a, p, alive, cr, w, mv }; opts = { dt, showTag, hidden }
  pose(a, p, { dt, showTag = true, hidden = false }) {
    const g = a.g, U = g.userData;
    g.visible = !hidden;
    if (hidden) return;
    // arma en la mano
    if (a.w !== p.w) {
      if (a.weapon) U.armR.remove(a.weapon);
      a.weapon = handWeapon(p.w);
      U.armR.add(a.weapon);
      a.w = p.w;
    }
    const prev = a.last || p;
    const sp = Math.hypot(p.x - prev.x, p.y - prev.y) / Math.max(dt, 1e-3);
    a.last = { x: p.x, y: p.y };
    g.position.set(p.x * S, 0, p.y * S);
    g.rotation.y = Math.PI / 2 - p.a;
    a.fireT = Math.max(0, a.fireT - dt);
    a.slashT = Math.max(0, a.slashT - dt);
    // al caer: se va de espaldas y luego se hunde
    if (!p.alive) {
      if (a.alive) { a.alive = false; a.deadT = 0; }
      a.deadT += dt;
      const k = Math.min(1, a.deadT / 0.45);
      animateAvatar(g, { speed: 0, dt, alive: true, pitch: 0, fire: 0 });
      g.rotation.x = -(1 - Math.pow(1 - k, 3)) * Math.PI / 2 * 0.96;
      g.position.y = -Math.max(0, a.deadT - 2.4) * 0.6;
      U.armL.rotation.x = -2.6; U.armR.rotation.x = -2.4;
      g.visible = a.deadT < 4;
      if (U.flash) U.flash.visible = false;
      this.tag(g, false);
      return;
    }
    if (!a.alive) { a.alive = true; a.deadT = -1; g.rotation.x = 0; g.position.y = 0; }
    g.rotation.x = 0;
    animateAvatar(g, { speed: Math.min(1.5, sp / 3), dt, alive: true, pitch: p.p || 0, fire: a.fireT > 0 ? 1 : 0 });
    // agachado: más abajo y con las piernas dobladas
    a.crK += ((p.cr ? 1 : 0) - a.crK) * Math.min(1, dt * 12);
    if (a.crK > 0.01) {
      U.hip.position.y -= 0.42 * a.crK;
      U.legL.rotation.x = -1.25 * a.crK + U.legL.rotation.x * (1 - a.crK);
      U.legR.rotation.x = -1.05 * a.crK + U.legR.rotation.x * (1 - a.crK);
      U.torso.rotation.x = 0.12 * a.crK;
    }
    const sword = ARMS[p.w]?.kind === 'sword';
    if (sword && a.slashT > 0) { const k = 1 - a.slashT / 0.3; U.armR.rotation.x = -2.5 + k * 1.6; U.armR.rotation.z = -0.9 + k * 1.8; } else U.armR.rotation.z = 0;
    if (U.flash) U.flash.visible = false;
    if (a.weapon?.userData.flash) a.weapon.userData.flash.visible = a.fireT > 0;
    this.tag(g, showTag);
  }
  tag(g, on) {
    const t = g.children.find((c) => c.isSprite);
    if (t) t.visible = on;
  }
  // Etiqueta nueva (por ejemplo, en rojo para quien te eliminó)
  retag(seat, name, color) {
    const a = this.map.get(seat);
    if (!a) return;
    const old = a.g.children.find((c) => c.isSprite);
    if (old) { a.g.remove(old); old.material.map?.dispose(); old.material.dispose(); }
    const t = nameTag(name, color);
    t.position.y = 2.15;
    a.g.add(t);
  }
  clear() { for (const s of [...this.map.keys()]) this.remove(s); }
}
