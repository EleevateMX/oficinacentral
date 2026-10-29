// Efectos: partículas verdes (caricatura, nada de gore), manchas en el piso, chispas, ondas,
// proyectiles de los zombis y botín. Todo con pocas llamadas de dibujo.
import * as THREE from 'three';
import { GEO, part, mat } from './models.js';
import { TILE_M } from '@shared/zombies.js';

const S = TILE_M;
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _p = new THREE.Vector3(), _s = new THREE.Vector3(), _c = new THREE.Color();

export class Particles {
  constructor(scene, cap = 500) {
    this.cap = cap;
    const g = GEO.box.clone();
    this.mesh = new THREE.InstancedMesh(g, new THREE.MeshBasicMaterial(), cap);
    this.mesh.count = 0; this.mesh.frustumCulled = false;
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.setColorAt(0, _c.set('#fff'));
    scene.add(this.mesh);
    this.p = [];
  }
  // x, y, z en metros
  burst(x, y, z, n, { colors = ['#7CFF4F'], speed = 3, up = 2, life = 0.7, size = 0.06, gravity = 9, dir = null, spread = 1 } = {}) {
    for (let i = 0; i < n; i++) {
      if (this.p.length >= this.cap) this.p.shift();
      let vx = (Math.random() - 0.5) * 2, vy = Math.random(), vz = (Math.random() - 0.5) * 2;
      if (dir) { vx = dir.x + (Math.random() - 0.5) * spread; vy = dir.y + Math.random() * spread * 0.6; vz = dir.z + (Math.random() - 0.5) * spread; }
      const k = speed * (0.4 + Math.random() * 0.8);
      this.p.push({ x, y, z, vx: vx * k, vy: vy * up + (dir ? vy * k : 0), vz: vz * k, life: life * (0.6 + Math.random() * 0.7), max: life, c: colors[i % colors.length], s: size * (0.6 + Math.random() * 0.8), g: gravity, rot: Math.random() * 6 });
    }
  }
  update(dt) {
    let n = 0;
    for (let i = this.p.length - 1; i >= 0; i--) {
      const q = this.p[i];
      q.life -= dt;
      if (q.life <= 0) { this.p.splice(i, 1); continue; }
      q.vy -= q.g * dt;
      q.x += q.vx * dt; q.y += q.vy * dt; q.z += q.vz * dt;
      if (q.y < 0.02) { q.y = 0.02; q.vy *= -0.3; q.vx *= 0.6; q.vz *= 0.6; }
      q.rot += dt * 6;
    }
    for (const q of this.p) {
      const k = Math.min(1, q.life / (q.max * 0.4));
      _m.compose(_p.set(q.x, q.y, q.z), _q.setFromEuler(_e.set(q.rot, q.rot * 0.7, 0)), _s.setScalar(q.s * k));
      this.mesh.setMatrixAt(n, _m);
      this.mesh.setColorAt(n, _c.set(q.c));
      n++;
    }
    this.mesh.count = n;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }
}

// Manchas verdes (y hoyos de donde salen los zombis) en el piso
export class Splats {
  constructor(scene, cap = 90) {
    this.cap = cap;
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const g = c.getContext('2d');
    g.fillStyle = '#fff';
    g.beginPath(); g.arc(32, 32, 18, 0, Math.PI * 2); g.fill();
    for (let i = 0; i < 9; i++) { const a = Math.random() * 6.28, r = 14 + Math.random() * 12; g.beginPath(); g.arc(32 + Math.cos(a) * r, 32 + Math.sin(a) * r, 3 + Math.random() * 6, 0, Math.PI * 2); g.fill(); }
    const tex = new THREE.CanvasTexture(c);
    const geo = new THREE.PlaneGeometry(1, 1); geo.rotateX(-Math.PI / 2);
    this.mesh = new THREE.InstancedMesh(geo, new THREE.MeshLambertMaterial({ map: tex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }), cap);
    this.mesh.count = 0; this.mesh.frustumCulled = false; this.mesh.receiveShadow = true;
    this.mesh.setColorAt(0, _c.set('#fff'));
    this.mesh.renderOrder = 1;
    scene.add(this.mesh);
    this.n = 0;
    this.t = [];
  }
  add(x, z, size = 0.6, color = '#4fbf3a') {
    const i = this.n % this.cap;
    this.n++;
    _m.compose(_p.set(x, 0.012 + (i % 7) * 0.0006, z), _q.setFromEuler(_e.set(0, Math.random() * 6.28, 0)), _s.set(size, 1, size * (0.8 + Math.random() * 0.4)));
    this.mesh.setMatrixAt(i, _m);
    this.mesh.setColorAt(i, _c.set(color));
    this.mesh.count = Math.min(this.cap, this.n);
    this.mesh.instanceMatrix.needsUpdate = true;
    this.mesh.instanceColor.needsUpdate = true;
  }
  clear() { this.n = 0; this.mesh.count = 0; }
}

// Ondas que crecen (golpe del Becario, aparición del jefe)
export class Rings {
  constructor(scene) { this.scene = scene; this.list = []; }
  add(x, z, { color = '#ffcc00', max = 4, life = 0.6 } = {}) {
    const m = new THREE.Mesh(new THREE.RingGeometry(0.85, 1, 40), new THREE.MeshBasicMaterial({ color, transparent: true, side: THREE.DoubleSide, depthWrite: false }));
    m.rotation.x = -Math.PI / 2; m.position.set(x, 0.05, z);
    this.scene.add(m);
    this.list.push({ m, t: 0, life, max });
  }
  update(dt) {
    for (let i = this.list.length - 1; i >= 0; i--) {
      const r = this.list[i];
      r.t += dt;
      const k = r.t / r.life;
      if (k >= 1) { this.scene.remove(r.m); r.m.geometry.dispose(); r.m.material.dispose(); this.list.splice(i, 1); continue; }
      r.m.scale.setScalar(0.2 + k * r.max);
      r.m.material.opacity = 1 - k;
    }
  }
}

// Trazos de las balas (clavos, grapas)
export class Tracers {
  constructor(scene, cap = 40) {
    this.mesh = new THREE.InstancedMesh(GEO.box.clone(), new THREE.MeshBasicMaterial({ color: '#fff3b0', transparent: true, opacity: 0.85 }), cap);
    this.mesh.count = 0; this.mesh.frustumCulled = false;
    scene.add(this.mesh);
    this.cap = cap; this.list = [];
  }
  add(from, to, life = 0.06) { if (this.list.length >= this.cap) this.list.shift(); this.list.push({ a: from.clone(), b: to.clone(), t: 0, life }); }
  update(dt) {
    let n = 0;
    for (let i = this.list.length - 1; i >= 0; i--) { const q = this.list[i]; q.t += dt; if (q.t > q.life) this.list.splice(i, 1); }
    for (const q of this.list) {
      const k = q.t / q.life;
      const a = q.a.clone().lerp(q.b, Math.min(1, k * 1.2)), b = q.a.clone().lerp(q.b, Math.min(1, 0.3 + k * 1.2));
      const len = a.distanceTo(b);
      _p.copy(a).add(b).multiplyScalar(0.5);
      _q.setFromUnitVectors(new THREE.Vector3(0, 0, 1), b.clone().sub(a).normalize());
      _m.compose(_p, _q, _s.set(0.015, 0.015, Math.max(0.01, len)));
      this.mesh.setMatrixAt(n++, _m);
    }
    this.mesh.count = n;
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}

// Proyectiles: café ácido (verde), hojas de papel, tazas de café
export class Projectiles {
  constructor(scene) {
    this.scene = scene;
    this.pool = new Map();
  }
  make(kind) {
    const g = new THREE.Group();
    if (kind === 'acid') { g.add(part(0.22, 0.22, 0.22, '#9CFF4F', { glow: true, geo: GEO.ball, shadow: false })); g.add(part(0.32, 0.32, 0.32, '#5fd43a', { geo: GEO.ball, shadow: false })); g.children[1].material = new THREE.MeshBasicMaterial({ color: '#7CFF4F', transparent: true, opacity: 0.3 }); }
    else if (kind === 'paper') { const p = part(0.32, 0.01, 0.42, '#ffffff', { shadow: false }); g.add(p); g.add(part(0.2, 0.012, 0.03, '#222', { y: 0.001, z: -0.08, shadow: false })); }
    else { g.add(part(0.16, 0.24, 0.16, '#f4f6f8', { geo: GEO.cyl })); g.add(part(0.17, 0.05, 0.17, '#6b3f22', { geo: GEO.cyl, y: 0.13 })); }
    this.scene.add(g);
    return g;
  }
  // list: [{ id, kind, x, z, h }]
  update(list, t) {
    const seen = new Set();
    for (const q of list) {
      seen.add(q.id);
      let g = this.pool.get(q.id);
      if (!g) { g = this.make(q.kind); this.pool.set(q.id, g); }
      g.position.set(q.x, q.h, q.z);
      if (q.kind === 'paper') g.rotation.set(t * 9 + q.id, t * 4, Math.sin(t * 7) * 0.5);
      else if (q.kind === 'coffee') g.rotation.set(t * 8, 0, t * 5);
      else g.scale.setScalar(1 + Math.sin(t * 20 + q.id) * 0.12);
    }
    for (const [id, g] of this.pool) if (!seen.has(id)) { this.scene.remove(g); this.pool.delete(id); }
  }
  clear() { for (const [, g] of this.pool) this.scene.remove(g); this.pool.clear(); }
}

// Botín: caja de grapas, dona y moneda de bono
export class Pickups {
  constructor(scene) { this.scene = scene; this.pool = new Map(); }
  make(kind) {
    const g = new THREE.Group();
    if (kind === 'ammo') { g.add(part(0.34, 0.2, 0.24, '#ffcc00')); g.add(part(0.35, 0.05, 0.25, '#141414', { y: 0.04 })); g.add(part(0.2, 0.08, 0.01, '#d62f3a', { y: 0.0, z: 0.125 })); }
    else if (kind === 'health') { const d = new THREE.Mesh(GEO.torus.clone(), mat('#f4a261')); d.scale.setScalar(0.6); d.rotation.x = Math.PI / 2; g.add(d); const ic = new THREE.Mesh(GEO.torus.clone(), mat('#f15bb5')); ic.scale.set(0.62, 0.62, 0.3); ic.rotation.x = Math.PI / 2; ic.position.y = 0.05; g.add(ic); }
    else if (kind === 'box') {
      // caja misteriosa: morada con signos que brillan
      g.add(part(0.34, 0.3, 0.34, '#3a2460'));
      g.add(part(0.36, 0.05, 0.36, '#5a3a8a', { y: 0.15 }));
      for (const [x, z, ry] of [[0, 0.172, 0], [0.172, 0, Math.PI / 2]]) { const q = part(0.1, 0.16, 0.01, '#7CFF4F', { glow: true, x, z, shadow: false }); q.rotation.y = ry; g.add(q); }
      g.add(part(0.12, 0.12, 0.12, '#FE3377', { glow: true, y: 0.26, geo: GEO.ball, shadow: false }));
    }
    else { g.add(part(0.3, 0.3, 0.05, '#FFCC00', { glow: true, geo: GEO.cyl })); g.children[0].rotation.x = Math.PI / 2; }
    const glow = new THREE.Mesh(new THREE.RingGeometry(0.25, 0.42, 24), new THREE.MeshBasicMaterial({ color: kind === 'health' ? '#ff7ab6' : kind === 'ammo' ? '#ffcc00' : kind === 'box' ? '#b06cff' : '#fff3a0', transparent: true, opacity: 0.5, side: THREE.DoubleSide, depthWrite: false }));
    glow.rotation.x = -Math.PI / 2; glow.position.y = -0.33;
    g.add(glow);
    this.scene.add(g);
    return g;
  }
  update(list, t) {
    const seen = new Set();
    for (const d of list) {
      seen.add(d.id);
      let g = this.pool.get(d.id);
      if (!g) { g = this.make(d.kind); this.pool.set(d.id, g); }
      g.position.set(d.x, 0.36 + Math.sin(t * 3 + d.id) * 0.06, d.z);
      g.rotation.y = t * 2 + d.id;
    }
    for (const [id, g] of this.pool) if (!seen.has(id)) { this.scene.remove(g); this.pool.delete(id); }
  }
  clear() { for (const [, g] of this.pool) this.scene.remove(g); this.pool.clear(); }
}

// Destello de la boca del arma (estrella con brillo)
export function flashSprite() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const gr = g.createRadialGradient(32, 32, 2, 32, 32, 30);
  gr.addColorStop(0, 'rgba(255,255,230,1)'); gr.addColorStop(0.3, 'rgba(255,210,90,.9)'); gr.addColorStop(1, 'rgba(255,140,0,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  g.fillStyle = 'rgba(255,255,220,.9)';
  for (let k = 0; k < 6; k++) { g.save(); g.translate(32, 32); g.rotate(k * Math.PI / 3); g.fillRect(-2, 0, 4, 30); g.restore(); }
  const tex = new THREE.CanvasTexture(c);
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
  return sp;
}

export { S as METERS };
