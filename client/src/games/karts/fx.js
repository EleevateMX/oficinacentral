// Efectos: polvo, chispas del derrape (amarillas → azules → naranjas), flamas del turbo, chispas de
// los choques y confeti en la meta. Todo con InstancedMesh (pocas llamadas de dibujo).
import * as THREE from 'three';

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _p = new THREE.Vector3(), _s = new THREE.Vector3(), _c = new THREE.Color();

export class Sparks {
  constructor(scene, cap = 700, { additive = false } = {}) {
    this.cap = cap;
    const mat = new THREE.MeshBasicMaterial({ transparent: additive, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending, depthWrite: !additive });
    this.mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), mat, cap);
    this.mesh.count = 0; this.mesh.frustumCulled = false;
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.setColorAt(0, _c.set('#fff'));
    scene.add(this.mesh);
    this.p = [];
    this.scale = 1;
  }
  // floor: altura del piso donde caen
  emit(x, y, z, { vx = 0, vy = 0, vz = 0, spread = 1, color = '#fff', size = 0.08, life = 0.4, gravity = 6, floor = 0, drag = 2, grow = 0 } = {}) {
    if (this.p.length >= this.cap) this.p.shift();
    this.p.push({ x, y, z, vx: vx + (Math.random() - 0.5) * spread, vy: vy + Math.random() * spread * 0.6, vz: vz + (Math.random() - 0.5) * spread, life: life * (0.6 + Math.random() * 0.6), max: life, c: color, s: size * (0.7 + Math.random() * 0.6), g: gravity, floor, drag, grow, rot: Math.random() * 6 });
  }
  burst(x, y, z, n, o = {}) { for (let i = 0; i < n * this.scale; i++) this.emit(x, y, z, o); }
  update(dt) {
    let n = 0;
    for (let i = this.p.length - 1; i >= 0; i--) {
      const q = this.p[i];
      q.life -= dt;
      if (q.life <= 0) { this.p.splice(i, 1); continue; }
      const k = Math.exp(-q.drag * dt);
      q.vx *= k; q.vz *= k; q.vy = q.vy * k - q.g * dt;
      q.x += q.vx * dt; q.y += q.vy * dt; q.z += q.vz * dt;
      if (q.y < q.floor + 0.02) { q.y = q.floor + 0.02; q.vy *= -0.35; q.vx *= 0.7; q.vz *= 0.7; }
      q.rot += dt * 8;
    }
    for (const q of this.p) {
      const f = q.life / q.max;
      const sc = q.s * (q.grow ? 1 + (1 - f) * q.grow : Math.min(1, f * 2.2));
      _m.compose(_p.set(q.x, q.y, q.z), _q.setFromEuler(_e.set(q.rot, q.rot * 0.7, 0)), _s.setScalar(sc));
      this.mesh.setMatrixAt(n, _m);
      this.mesh.setColorAt(n, _c.set(q.c));
      n++;
    }
    this.mesh.count = n;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }
  clear() { this.p.length = 0; this.mesh.count = 0; }
  dispose() { this.mesh.geometry.dispose(); this.mesh.material.dispose(); }
}

// Flama del escape (dos conos brillantes que crecen con el turbo)
export function flame() {
  const g = new THREE.Group();
  const outer = new THREE.Mesh(new THREE.ConeGeometry(0.11, 0.55, 8), new THREE.MeshBasicMaterial({ color: '#ff8a3d', transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false }));
  const inner = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.35, 8), new THREE.MeshBasicMaterial({ color: '#fff3a8', transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false }));
  outer.rotation.x = inner.rotation.x = -Math.PI / 2;
  outer.position.z = -0.27; inner.position.z = -0.18;
  g.add(outer, inner);
  g.userData = { outer, inner };
  g.visible = false;
  return g;
}

// Chispas del derrape pegadas a las llantas de atrás (estrella brillante que cambia de color)
let starTex = null;
export function driftSpark() {
  if (!starTex) {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const g = c.getContext('2d');
    const gr = g.createRadialGradient(32, 32, 0, 32, 32, 30);
    gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.25, 'rgba(255,255,255,.85)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
    g.fillStyle = '#fff';
    for (let k = 0; k < 4; k++) { g.save(); g.translate(32, 32); g.rotate((k * Math.PI) / 4); g.fillRect(-1.5, -30, 3, 60); g.restore(); }
    starTex = new THREE.CanvasTexture(c);
  }
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: starTex, color: '#3ad1ff', transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
  sp.visible = false;
  return sp;
}
