// Efectos: partículas verdes (caricatura, nada de gore), manchas en el piso, chispas, ondas,
// proyectiles de los zombis, botín y sombras redondas. Todo con pocas llamadas de dibujo y sin
// crear objetos en cada cuadro (las partículas, ondas y trazos se reciclan).
import * as THREE from 'three';
import { GEO, part, mat } from './models.js';
import { TILE_M } from '@shared/zombies.js';

const S = TILE_M;
const _m = new THREE.Matrix4(), _m2 = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _p = new THREE.Vector3(), _s = new THREE.Vector3(), _c = new THREE.Color();
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _d = new THREE.Vector3();
const Z_AXIS = new THREE.Vector3(0, 0, 1);

// Colores ya convertidos (para no leer el texto "#7CFF4F" en cada cuadro)
const COLORS = new Map();
function colorOf(hex) {
  let c = COLORS.get(hex);
  if (!c) { c = new THREE.Color(hex); if (COLORS.size < 500) COLORS.set(hex, c); }
  return c;
}
// n × escala de efectos, sin perder los efectos chicos (redondeo al azar)
function scaled(n, k) { if (k >= 1) return n; const v = n * k; const f = Math.floor(v); return f + (Math.random() < v - f ? 1 : 0); }

export class Particles {
  constructor(scene, cap = 500) {
    this.cap = cap;
    this.scale = 1; // calidad de efectos (1 = todas)
    const g = GEO.box.clone();
    this.mesh = new THREE.InstancedMesh(g, new THREE.MeshBasicMaterial(), cap);
    this.mesh.count = 0; this.mesh.frustumCulled = false;
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.setColorAt(0, _c.set('#fff'));
    scene.add(this.mesh);
    this.p = [];
    this.free = [];
  }
  // x, y, z en metros
  burst(x, y, z, n, { colors = ['#7CFF4F'], speed = 3, up = 2, life = 0.7, size = 0.06, gravity = 9, dir = null, spread = 1 } = {}) {
    n = scaled(n, this.scale);
    for (let i = 0; i < n; i++) {
      let q;
      if (this.p.length >= this.cap) { q = this.p[0]; this.p[0] = this.p[this.p.length - 1]; this.p.pop(); }
      else q = this.free.pop() || {};
      let vx = (Math.random() - 0.5) * 2, vy = Math.random(), vz = (Math.random() - 0.5) * 2;
      if (dir) { vx = dir.x + (Math.random() - 0.5) * spread; vy = dir.y + Math.random() * spread * 0.6; vz = dir.z + (Math.random() - 0.5) * spread; }
      const k = speed * (0.4 + Math.random() * 0.8);
      q.x = x; q.y = y; q.z = z; q.vx = vx * k; q.vy = vy * up + (dir ? vy * k : 0); q.vz = vz * k;
      q.life = life * (0.6 + Math.random() * 0.7); q.max = life; q.c = colorOf(colors[i % colors.length]);
      q.s = size * (0.6 + Math.random() * 0.8); q.g = gravity; q.rot = Math.random() * 6;
      this.p.push(q);
    }
  }
  update(dt) {
    const P = this.p;
    for (let i = P.length - 1; i >= 0; i--) {
      const q = P[i];
      q.life -= dt;
      if (q.life <= 0) { P[i] = P[P.length - 1]; P.pop(); this.free.push(q); continue; }
      q.vy -= q.g * dt;
      q.x += q.vx * dt; q.y += q.vy * dt; q.z += q.vz * dt;
      if (q.y < 0.02) { q.y = 0.02; q.vy *= -0.3; q.vx *= 0.6; q.vz *= 0.6; }
      q.rot += dt * 6;
    }
    const cols = this.mesh.instanceColor.array;
    let n = 0;
    for (const q of P) {
      const k = Math.min(1, q.life / (q.max * 0.4));
      _m.compose(_p.set(q.x, q.y, q.z), _q.setFromEuler(_e.set(q.rot, q.rot * 0.7, 0)), _s.setScalar(q.s * k));
      this.mesh.setMatrixAt(n, _m);
      const c = q.c && q.c.isColor ? q.c : colorOf(q.c || '#ffffff');
      cols[n * 3] = c.r; cols[n * 3 + 1] = c.g; cols[n * 3 + 2] = c.b;
      n++;
    }
    this.mesh.count = n;
    this.mesh.visible = n > 0;
    this.mesh.instanceMatrix.needsUpdate = true;
    this.mesh.instanceColor.needsUpdate = true;
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
    this.mesh.setColorAt(i, colorOf(color));
    this.mesh.count = Math.min(this.cap, this.n);
    this.mesh.instanceMatrix.needsUpdate = true;
    this.mesh.instanceColor.needsUpdate = true;
  }
  clear() { this.n = 0; this.mesh.count = 0; }
}

// Ondas que crecen (golpe del Becario, aparición del jefe). Se reciclan (antes: geometría y material
// nuevos por onda).
const RING_GEO = new THREE.RingGeometry(0.85, 1, 40);
export class Rings {
  constructor(scene, cap = 10) {
    this.scene = scene;
    this.list = [];
    this.pool = Array.from({ length: cap }, () => {
      const m = new THREE.Mesh(RING_GEO, new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, side: THREE.DoubleSide, depthWrite: false }));
      m.rotation.x = -Math.PI / 2; m.visible = false; m.matrixAutoUpdate = true;
      scene.add(m);
      return { m, t: 0, life: 1, max: 1, on: false };
    });
    this.i = 0;
  }
  add(x, z, { color = '#ffcc00', max = 4, life = 0.6 } = {}) {
    const r = this.pool.find((q) => !q.on) || this.pool[this.i++ % this.pool.length];
    r.on = true; r.t = 0; r.life = life; r.max = max;
    r.m.material.color.copy(colorOf(color));
    r.m.position.set(x, 0.05, z);
    r.m.scale.setScalar(0.2);
    r.m.material.opacity = 1;
    r.m.visible = true;
    if (!this.list.includes(r)) this.list.push(r);
  }
  update(dt) {
    for (let i = this.list.length - 1; i >= 0; i--) {
      const r = this.list[i];
      r.t += dt;
      const k = r.t / r.life;
      if (k >= 1) { r.on = false; r.m.visible = false; this.list[i] = this.list[this.list.length - 1]; this.list.pop(); continue; }
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
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    scene.add(this.mesh);
    this.cap = cap; this.list = []; this.free = [];
  }
  add(from, to, life = 0.06) {
    let q;
    if (this.list.length >= this.cap) q = this.list.shift();
    else q = this.free.pop() || { a: new THREE.Vector3(), b: new THREE.Vector3() };
    q.a.copy(from); q.b.copy(to); q.t = 0; q.life = life;
    this.list.push(q);
  }
  update(dt) {
    let n = 0;
    for (let i = this.list.length - 1; i >= 0; i--) { const q = this.list[i]; q.t += dt; if (q.t > q.life) { this.list.splice(i, 1); this.free.push(q); } }
    for (const q of this.list) {
      const k = q.t / q.life;
      _a.copy(q.a).lerp(q.b, Math.min(1, k * 1.2)); _b.copy(q.a).lerp(q.b, Math.min(1, 0.3 + k * 1.2));
      const len = _a.distanceTo(_b);
      _p.copy(_a).add(_b).multiplyScalar(0.5);
      _d.copy(_b).sub(_a);
      if (len > 1e-6) _q.setFromUnitVectors(Z_AXIS, _d.multiplyScalar(1 / len)); else _q.identity();
      _m.compose(_p, _q, _s.set(0.015, 0.015, Math.max(0.01, len)));
      this.mesh.setMatrixAt(n++, _m);
    }
    this.mesh.count = n;
    this.mesh.visible = n > 0;
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}

// Proyectiles: café ácido (verde), hojas de papel, tazas de café. Una InstancedMesh por pieza
// (antes: dos mallas por proyectil; la Impresora lanza 16 hojas a la vez).
const PROJ_PARTS = {
  acid: [
    { geo: 'ball', size: [0.22, 0.22, 0.22], off: [0, 0, 0], color: '#9CFF4F', glow: true },
    { geo: 'ball', size: [0.32, 0.32, 0.32], off: [0, 0, 0], color: '#7CFF4F', glass: 0.3 },
  ],
  paper: [
    { geo: 'box', size: [0.32, 0.01, 0.42], off: [0, 0, 0], color: '#ffffff' },
    { geo: 'box', size: [0.2, 0.012, 0.03], off: [0, 0.001, -0.08], color: '#222222' },
  ],
  coffee: [
    { geo: 'cyl', size: [0.16, 0.24, 0.16], off: [0, 0, 0], color: '#f4f6f8' },
    { geo: 'cyl', size: [0.17, 0.05, 0.17], off: [0, 0.13, 0], color: '#6b3f22' },
  ],
};
export class Projectiles {
  constructor(scene, cap = 40) {
    this.scene = scene;
    this.cap = cap;
    this.parts = {};
    for (const [kind, defs] of Object.entries(PROJ_PARTS)) {
      this.parts[kind] = defs.map((d) => {
        const material = d.glass ? new THREE.MeshBasicMaterial({ color: d.color, transparent: true, opacity: d.glass }) : mat(d.color, !!d.glow);
        const mesh = new THREE.InstancedMesh(GEO[d.geo], material, cap);
        mesh.count = 0; mesh.frustumCulled = false; mesh.visible = false;
        mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        scene.add(mesh);
        return { mesh, local: new THREE.Matrix4().compose(new THREE.Vector3(...d.off), new THREE.Quaternion(), new THREE.Vector3(...d.size)) };
      });
    }
    this.pool = new Map(); // compatibilidad: id → nada (ya no hay grupos)
  }
  // list: [{ id, kind, x, z, h }] (m)
  update(list, t) {
    const counts = { acid: 0, paper: 0, coffee: 0 };
    for (const q of list) {
      const parts = this.parts[q.kind] || this.parts.coffee;
      const k = this.parts[q.kind] ? q.kind : 'coffee';
      const i = counts[k];
      if (i >= this.cap) continue;
      let sc = 1;
      if (k === 'paper') _e.set(t * 9 + q.id, t * 4, Math.sin(t * 7) * 0.5);
      else if (k === 'coffee') _e.set(t * 8, 0, t * 5);
      else { _e.set(0, 0, 0); sc = 1 + Math.sin(t * 20 + q.id) * 0.12; }
      _m.compose(_p.set(q.x, q.h, q.z), _q.setFromEuler(_e), _s.setScalar(sc));
      for (const P of parts) { _m2.multiplyMatrices(_m, P.local); P.mesh.setMatrixAt(i, _m2); }
      counts[k] = i + 1;
    }
    for (const [kind, parts] of Object.entries(this.parts)) {
      for (const P of parts) { P.mesh.count = counts[kind]; P.mesh.visible = counts[kind] > 0; P.mesh.instanceMatrix.needsUpdate = true; }
    }
  }
  clear() { this.update([], 0); }
}

// Botín: caja de grapas, dona y moneda de bono
export class Pickups {
  constructor(scene) { this.scene = scene; this.pool = new Map(); this.seen = new Set(); }
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
    // chiquitos: sin sombra (así tampoco se quedan "pegados" en la sombra fija)
    g.traverse((o) => { if (o.isMesh) o.castShadow = false; });
    this.scene.add(g);
    return g;
  }
  update(list, t) {
    const seen = this.seen;
    seen.clear();
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

// Sombras redondas bajo zombis, compañeros y jefe: se usan cuando la sombra del sol es fija
// (calidad media o auto en compus lentas) o no hay sombras (baja). Una sola llamada de dibujo.
export class Blobs {
  constructor(scene, cap = 96) {
    this.cap = cap;
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const g = c.getContext('2d');
    const gr = g.createRadialGradient(32, 32, 4, 32, 32, 31);
    gr.addColorStop(0, 'rgba(0,0,0,1)'); gr.addColorStop(0.55, 'rgba(0,0,0,.65)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
    const tex = new THREE.CanvasTexture(c);
    const geo = new THREE.PlaneGeometry(1, 1); geo.rotateX(-Math.PI / 2);
    this.mesh = new THREE.InstancedMesh(geo, new THREE.MeshBasicMaterial({ map: tex, color: '#000000', transparent: true, opacity: 0.42, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3 }), cap);
    this.mesh.count = 0; this.mesh.frustumCulled = false; this.mesh.renderOrder = 1;
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    scene.add(this.mesh);
    this.n = 0;
    this.on = true;
  }
  begin() { this.n = 0; }
  // x, z (m), r = radio (m)
  add(x, z, r) {
    if (!this.on || this.n >= this.cap) return;
    _m.makeScale(r * 2, 1, r * 2); _m.setPosition(x, 0.018, z);
    this.mesh.setMatrixAt(this.n++, _m);
  }
  end() { this.mesh.count = this.n; this.mesh.visible = this.on && this.n > 0; this.mesh.instanceMatrix.needsUpdate = true; }
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
