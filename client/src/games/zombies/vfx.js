// Efectos del arsenal: estelas de espada, cortes, técnicas (agua, llama, rayo), piso en llamas y
// rayos láser. Todo se crea UNA vez al cargar (pools fijos) y solo se mueve o se apaga con
// `visible` en las mallas (nunca en luces): así index.js los compila de antemano en warmUp() y
// no hay congelones al usarlos.
import * as THREE from 'three';
import { GEO, mat } from './models.js';

const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _u = new THREE.Vector3(), _c = new THREE.Color(), _c2 = new THREE.Color();
const UP = new THREE.Vector3(0, 1, 0);
// temporales para no crear vectores ni colores en cada cuadro
const _fw = new THREE.Vector3(), _sd = new THREE.Vector3(), _t1 = new THREE.Vector3(), _t2 = new THREE.Vector3(), _t3 = new THREE.Vector3(), _t4 = new THREE.Vector3();
const COLS = new Map();
const col = (hex) => { let c = COLS.get(hex); if (!c) { c = new THREE.Color(hex); COLS.set(hex, c); } return c; };
const colr = (hex) => col(hex);

// Material aditivo con color por vértice (negro = invisible): uno solo para todas las cintas
let ribbonMat = null;
function getRibbonMat() {
  return (ribbonMat ||= new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
}

// Cinta: tira de triángulos con dos bordes (l, r) por punto y un color por punto
export class Ribbon {
  constructor(parent, cap = 48) {
    this.cap = cap;
    const g = new THREE.BufferGeometry();
    this.pos = new Float32Array(cap * 6);
    this.col = new Float32Array(cap * 6);
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('color', new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    const idx = [];
    for (let i = 0; i < cap - 1; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    g.setIndex(idx);
    this.mesh = new THREE.Mesh(g, getRibbonMat());
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 6;
    this.mesh.visible = false;
    parent.add(this.mesh);
    this.n = 0;
  }
  begin() { this.n = 0; return this; }
  // l, r: Vector3 (o x,y,z sueltos) · color: THREE.Color ya multiplicado por su brillo
  push(l, r, color) {
    if (this.n >= this.cap) return this;
    const i = this.n * 6;
    this.pos[i] = l.x; this.pos[i + 1] = l.y; this.pos[i + 2] = l.z;
    this.pos[i + 3] = r.x; this.pos[i + 4] = r.y; this.pos[i + 5] = r.z;
    this.col[i] = this.col[i + 3] = color.r; this.col[i + 1] = this.col[i + 4] = color.g; this.col[i + 2] = this.col[i + 5] = color.b;
    this.n++;
    return this;
  }
  end() {
    const g = this.mesh.geometry;
    g.setDrawRange(0, Math.max(0, (this.n - 1) * 6));
    g.attributes.position.needsUpdate = true; g.attributes.color.needsUpdate = true;
    this.mesh.visible = this.n > 1;
  }
  hide() { this.n = 0; this.mesh.visible = false; }
  // para precompilar: deja algo que dibujar
  warm() { this.begin(); for (let k = 0; k < 3; k++) this.push(_v.set(k, 0, 0), _w.set(k, 0.1, 0), _c.setRGB(1, 1, 1)); this.end(); }
}

// ---------- Estela de la espada en primera persona (escena del arma) ----------
// Cada cuadro se toman la punta y la base de la hoja; la cinta une los últimos puntos y se desvanece.
export class SwordTrail {
  constructor(parent) {
    this.rib = new Ribbon(parent, 40);
    this.core = new Ribbon(parent, 40);
    this.pts = [];
    this.color = new THREE.Color('#ffffff');
  }
  sample(tip, base, on, dt, strong = 1) {
    for (const p of this.pts) p.age += dt;
    this.free ||= [];
    while (this.pts.length && this.pts[0].age > 0.16) this.free.push(this.pts.shift());
    const last = this.pts[this.pts.length - 1];
    // solo un punto nuevo si la punta se movió (así la estela cubre el arco aunque vaya lento)
    if (on && (!last || last.t.distanceToSquared(tip) > 0.0001)) {
      const q = this.free.pop() || { t: new THREE.Vector3(), b: new THREE.Vector3() };
      q.t.copy(tip); q.b.copy(base); q.age = 0; q.k = strong;
      this.pts.push(q);
    } else if (on && last) last.age = 0;
    if (this.pts.length > 38) this.free.push(this.pts.shift());
    this.draw();
  }
  draw() {
    const n = this.pts.length;
    if (n < 2) { this.rib.hide(); this.core.hide(); return; }
    this.rib.begin(); this.core.begin();
    for (let i = 0; i < n; i++) {
      const p = this.pts[i];
      const f = Math.max(0, 1 - p.age / 0.16) * (i / (n - 1)) * p.k;
      this.rib.push(p.b, p.t, _c.copy(this.color).multiplyScalar(f * 1.7));
      _v.copy(p.b).lerp(p.t, 0.8);
      this.core.push(_v, p.t, _c2.setRGB(1, 1, 1).multiplyScalar(f * 0.6));
    }
    this.rib.end(); this.core.end();
  }
  clear() { this.free ||= []; this.free.push(...this.pts); this.pts.length = 0; this.rib.hide(); this.core.hide(); }
  warm() { this.rib.warm(); this.core.warm(); }
}

// ---------- Cortes en el mundo (los de los compañeros y los tuyos, en grande) ----------
// Un arco que se dibuja de un lado a otro frente a quien lo lanza.
export class Slashes {
  constructor(scene, n = 5) {
    this.pool = Array.from({ length: n }, () => ({ rib: new Ribbon(scene, 30), on: false }));
    this.i = 0;
  }
  // x, z (m) centro; h altura; a = hacia dónde mira (radianes del plano del mapa); o = { from, to, tilt, r, color, dur }
  add(x, h, z, a, { from = -1, to = 1, tilt = 0, r = 1.6, color = '#ffffff', dur = 0.22, arc = 1.9 } = {}) {
    const s = this.pool[this.i++ % this.pool.length];
    Object.assign(s, { on: true, t: 0, x, h, z, a, from, to, tilt, r, dur, arc });
    (s.color ||= new THREE.Color()).copy(col(color));
  }
  update(dt) {
    for (const s of this.pool) {
      if (!s.on) continue;
      s.t += dt;
      const k = s.t / s.dur;
      if (k > 1.6) { s.on = false; s.rib.hide(); continue; }
      const head = Math.min(1, k), tail = Math.max(0, k - 0.6);
      const fw = _fw.set(Math.cos(s.a), 0, Math.sin(s.a));
      const side = _sd.set(-fw.z, 0, fw.x);
      const vertical = s.from === 0 && s.to === 0;
      s.rib.begin();
      const N = 24;
      for (let i = 0; i <= N; i++) {
        const u = tail + (head - tail) * (i / N);
        const ang = vertical ? (0.5 - u) * s.arc : (s.from + (s.to - s.from) * u) * s.arc * 0.5;
        // punto del arco: en el plano horizontal (o vertical para el corte de arriba abajo), inclinado
        if (vertical) {
          _v.copy(fw).multiplyScalar(Math.cos(ang) * s.r).addScaledVector(UP, Math.sin(ang) * s.r * 0.8);
        } else {
          _v.copy(fw).multiplyScalar(Math.cos(ang) * s.r).addScaledVector(side, -Math.sin(ang) * s.r);
          _v.y += Math.sin(ang) * s.tilt * 0.5 * s.r;
        }
        const p = _w.set(s.x, s.h, s.z).add(_v);
        const inner = _u.set(s.x, s.h, s.z).addScaledVector(_v, 0.62);
        const f = (i / N) * Math.max(0, 1 - Math.max(0, k - 1) / 0.6);
        s.rib.push(inner, p, _c.copy(s.color).multiplyScalar(f));
      }
      s.rib.end();
    }
  }
  warm() { this.pool[0].rib.warm(); }
  reset() { for (const s of this.pool) { s.on = false; s.rib.hide(); } }
}

// ---------- Rayo láser del francotirador ----------
export class Beams {
  constructor(scene, n = 3) { this.pool = Array.from({ length: n }, () => ({ a: new Ribbon(scene, 2), b: new Ribbon(scene, 2), on: false })); this.i = 0; }
  add(from, to, color = '#ff2d55', life = 0.28) {
    const s = this.pool[this.i++ % this.pool.length];
    Object.assign(s, { on: true, t: 0, life });
    (s.from ||= new THREE.Vector3()).copy(from); (s.to ||= new THREE.Vector3()).copy(to);
    (s.color ||= new THREE.Color()).copy(col(color));
  }
  update(dt) {
    for (const s of this.pool) {
      if (!s.on) continue;
      s.t += dt;
      const k = 1 - s.t / s.life;
      if (k <= 0) { s.on = false; s.a.hide(); s.b.hide(); continue; }
      const w = 0.025 + (1 - k) * 0.04;
      const dir = _v.copy(s.to).sub(s.from).normalize();
      const side = _w.crossVectors(dir, UP).normalize().multiplyScalar(w);
      _c.copy(s.color).multiplyScalar(k * 1.2);
      s.a.begin().push(_u.copy(s.from).sub(side), _t1.copy(s.from).add(side), _c).push(_u.copy(s.to).sub(side), _t1.copy(s.to).add(side), _c).end();
      s.b.begin().push(_u.copy(s.from).setY(s.from.y - w), _t1.copy(s.from).setY(s.from.y + w), _c).push(_u.copy(s.to).setY(s.to.y - w), _t1.copy(s.to).setY(s.to.y + w), _c).end();
    }
  }
  warm() { this.pool[0].a.warm(); }
}

// ---------- Técnicas ----------
// path en metros: { ax, az, bx, bz }; h = altura del cuerpo
export class TechFx {
  constructor(scene, particles) {
    this.scene = scene;
    this.particles = particles;
    // Agua: dragón de agua (cuerpo de dos cintas cruzadas + cabeza)
    this.water = Array.from({ length: 2 }, () => ({ h: new Ribbon(scene, 60), v: new Ribbon(scene, 60), core: new Ribbon(scene, 60), head: this.dragonHead(), on: false }));
    // Llama: rueda de fuego que gira mientras embistes
    this.fire = Array.from({ length: 2 }, () => ({ a: new Ribbon(scene, 40), b: new Ribbon(scene, 40), c: new Ribbon(scene, 40), on: false }));
    // Rayo: el relámpago y dos ramas
    this.bolt = Array.from({ length: 2 }, () => ({ main: new Ribbon(scene, 20), core: new Ribbon(scene, 20), br1: new Ribbon(scene, 8), br2: new Ribbon(scene, 8), on: false }));
    this.wi = 0; this.fi = 0; this.bi = 0;
  }
  dragonHead() {
    const g = new THREE.Group();
    const snout = new THREE.Mesh(GEO.cone, mat('#bff4ff', true)); snout.scale.set(0.34, 0.6, 0.26); snout.rotation.x = -Math.PI / 2; g.add(snout);
    const skull = new THREE.Mesh(GEO.ball, mat('#4fd8ff', true)); skull.scale.set(0.42, 0.34, 0.5); skull.position.z = 0.18; g.add(skull);
    for (const s of [-1, 1]) {
      const horn = new THREE.Mesh(GEO.cone, mat('#e8fbff', true)); horn.scale.set(0.06, 0.4, 0.06); horn.position.set(s * 0.12, 0.2, 0.36); horn.rotation.x = 0.9; g.add(horn);
      const eye = new THREE.Mesh(GEO.ball, mat('#ffffff', true)); eye.scale.setScalar(0.07); eye.position.set(s * 0.13, 0.08, 0.06); g.add(eye);
      const fin = new THREE.Mesh(GEO.box, mat('#1f8fff', true)); fin.scale.set(0.02, 0.18, 0.3); fin.position.set(s * 0.2, 0, 0.32); fin.rotation.z = s * 0.6; g.add(fin);
    }
    g.visible = false;
    this.scene.add(g);
    return g;
  }
  play(id, path, h = 1.15) {
    const len = Math.hypot(path.bx - path.ax, path.bz - path.az);
    if (id === 'agua') Object.assign(this.water[this.wi++ % 2], { on: true, t: 0, path, y0: h, len, seed: Math.random() * 6 });
    else if (id === 'llama') Object.assign(this.fire[this.fi++ % 2], { on: true, t: 0, path, y0: h, len, spin: Math.random() * 6 });
    else if (id === 'rayo') { const b = this.bolt[this.bi++ % 2]; Object.assign(b, { on: true, t: 0, path, y0: h, len, jt: 0 }); this.jag(b); }
  }
  update(dt, time) {
    for (const w of this.water) if (w.on) this.updWater(w, dt, time);
    for (const f of this.fire) if (f.on) this.updFire(f, dt, time);
    for (const b of this.bolt) if (b.on) this.updBolt(b, dt);
  }
  // punto del camino (u de 0 a 1) en metros
  at(p, u, out) { return out.set(p.ax + (p.bx - p.ax) * u, 0, p.az + (p.bz - p.az) * u); }

  updWater(w, dt, time) {
    w.t += dt;
    const travel = 0.5, fade = 0.45;
    const head = Math.min(1, w.t / travel);
    const tail = Math.max(0, (w.t - 0.18) / travel) * 1.0;
    const out = Math.max(0, (w.t - travel) / fade);
    if (out >= 1) { w.on = false; w.h.hide(); w.v.hide(); w.core.hide(); w.head.visible = false; return; }
    const p = w.path;
    const fw = _fw.set(p.bx - p.ax, 0, p.bz - p.az).normalize();
    const side = _sd.set(-fw.z, 0, fw.x);
    const N = 56;
    const span = Math.max(0.05, head - Math.min(head - 0.05, tail * 0.6));
    const u0 = head - span;
    const center = (u, o) => {
      const s = u * w.len;
      this.at(p, u, o);
      o.addScaledVector(side, Math.sin(s * 1.5 + w.seed - time * 3) * 0.45);
      o.y = w.y0 + Math.sin(s * 1.1 + w.seed) * 0.3 + Math.sin(s * 2.7 - time * 5) * 0.08;
      return o;
    };
    w.h.begin(); w.v.begin(); w.core.begin();
    const c = _t1, up = _t2;
    for (let i = 0; i <= N; i++) {
      const u = u0 + span * (i / N);
      const k = i / N; // 0 = cola, 1 = cabeza
      center(u, c);
      const thick = (0.12 + 0.42 * Math.sin(Math.min(1, k * 1.15) * Math.PI * 0.92)) * (1 - out * 0.7);
      const bright = (0.25 + 0.75 * k) * (1 - out);
      _c.copy(col('#1f8fff')).lerp(col('#9ff0ff'), k).multiplyScalar(bright);
      w.h.push(_v.copy(c).addScaledVector(side, -thick), _w.copy(c).addScaledVector(side, thick), _c);
      up.set(0, thick * 0.8, 0);
      w.v.push(_v.copy(c).sub(up), _w.copy(c).add(up), _c);
      w.core.push(_v.copy(c).addScaledVector(side, -thick * 0.3), _w.copy(c).addScaledVector(side, thick * 0.3), _c2.setRGB(1, 1, 1).multiplyScalar(bright * 0.6));
    }
    w.h.end(); w.v.end(); w.core.end();
    // cabeza
    center(head, c);
    const ahead = center(Math.min(1, head + 0.02), _t3);
    w.head.visible = out < 0.6;
    w.head.position.copy(c);
    w.head.lookAt(_v.copy(c).sub(ahead).add(c)); // la trompa (−Z local) apunta hacia adelante
    w.head.scale.setScalar(1.25 * (1 - out));
    if (Math.random() < 0.9 && out < 0.5) this.particles?.burst(c.x, c.y, c.z, 3, { colors: ['#bff4ff', '#4fd8ff', '#ffffff'], speed: 1.6, up: 1.5, size: 0.05, life: 0.5, gravity: 6 });
  }

  updFire(f, dt, time) {
    f.t += dt;
    const dash = 0.3, fade = 0.35;
    const out = Math.max(0, (f.t - dash) / fade);
    if (out >= 1) { f.on = false; f.a.hide(); f.b.hide(); f.c.hide(); return; }
    const p = f.path;
    const u = Math.min(1, f.t / dash);
    const fw = _fw.set(p.bx - p.ax, 0, p.bz - p.az).normalize();
    const center = this.at(p, u, _t1); center.y = f.y0;
    center.addScaledVector(fw, 1.7);
    const spin = f.spin + f.t * 26;
    const draw = (rib, R, from, to, col, thick) => {
      rib.begin();
      const N = 36;
      for (let i = 0; i <= N; i++) {
        const k = i / N;
        const ang = spin + from + (to - from) * k;
        // rueda vertical que avanza (en el plano adelante–arriba)
        const dir = _v.copy(fw).multiplyScalar(Math.cos(ang)).addScaledVector(UP, Math.sin(ang));
        const o = _w.copy(center).addScaledVector(dir, R);
        const inn = _u.copy(center).addScaledVector(dir, R - thick * (0.4 + k));
        rib.push(inn, o, _c.copy(colr(col)).multiplyScalar(k * (1 - out)));
      }
      rib.end();
    };
    draw(f.a, 1.0, 0, 4.6, '#ff4a0a', 0.55);
    draw(f.b, 0.78, Math.PI, Math.PI + 4.2, '#ffb02a', 0.34);
    // corte horizontal que gira alrededor
    f.c.begin();
    const side = _sd.set(-fw.z, 0, fw.x);
    const base = this.at(p, u, _t2); base.y = f.y0 - 0.25;
    for (let i = 0; i <= 36; i++) {
      const k = i / 36;
      const ang = -spin * 0.8 + k * 5;
      const dir = _v.copy(fw).multiplyScalar(Math.cos(ang)).addScaledVector(side, Math.sin(ang));
      f.c.push(_u.copy(base).addScaledVector(dir, 0.7), _w.copy(base).addScaledVector(dir, 1.55), _c.copy(col('#ff3b1a')).multiplyScalar(k * 0.8 * (1 - out)));
    }
    f.c.end();
    if (out < 0.5) { const ang = spin + Math.random() * 6; const q = _v.copy(fw).multiplyScalar(Math.cos(ang)).addScaledVector(UP, Math.sin(ang)).multiplyScalar(1.0).add(center); this.particles?.burst(q.x, q.y, q.z, 4, { colors: ['#ff6a1a', '#ffd27a', '#ff3b1a', '#fff2c0'], speed: 1.6, up: 1.5, size: 0.035, life: 0.5, gravity: -2 }); }
  }

  jag(b) {
    const p = b.path;
    const N = 19;
    b.pts = [];
    const fw = new THREE.Vector3(p.bx - p.ax, 0, p.bz - p.az).normalize();
    const side = new THREE.Vector3(-fw.z, 0, fw.x);
    for (let i = 0; i <= N; i++) {
      const u = i / N;
      const c = this.at(p, u, new THREE.Vector3());
      const amp = i === 0 || i === N ? 0 : 0.32;
      c.addScaledVector(side, (Math.random() - 0.5) * 2 * amp);
      c.y = b.y0 + (Math.random() - 0.5) * 2 * amp * 0.8;
      b.pts.push(c);
    }
    const branch = (from) => {
      const s = b.pts[from].clone();
      const out = [s];
      const d = new THREE.Vector3((Math.random() - 0.5) * 2, (Math.random() - 0.2), (Math.random() - 0.5) * 2).normalize().multiplyScalar(0.25);
      for (let k = 1; k < 7; k++) out.push(out[k - 1].clone().add(d).add(new THREE.Vector3((Math.random() - 0.5) * 0.2, (Math.random() - 0.5) * 0.2, (Math.random() - 0.5) * 0.2)));
      return out;
    };
    b.b1 = branch(5); b.b2 = branch(12);
  }
  updBolt(b, dt) {
    b.t += dt; b.jt -= dt;
    const life = 0.6;
    const k = 1 - b.t / life;
    if (k <= 0) { b.on = false; b.main.hide(); b.core.hide(); b.br1.hide(); b.br2.hide(); return; }
    if (b.jt <= 0) { b.jt = 0.045; this.jag(b); }
    const flick = 0.6 + Math.random() * 0.4;
    const strip = (rib, pts, w, col, bright) => {
      rib.begin();
      for (let i = 0; i < pts.length; i++) {
        const a = pts[Math.max(0, i - 1)], c = pts[Math.min(pts.length - 1, i + 1)];
        const dir = _v.copy(c).sub(a).normalize();
        const side = _w.crossVectors(dir, UP).normalize().multiplyScalar(w);
        if (side.lengthSq() < 1e-6) side.set(w, 0, 0);
        rib.push(_u.copy(pts[i]).sub(side), _t4.copy(pts[i]).add(side), _c.copy(colr(col)).multiplyScalar(bright * k * flick));
      }
      rib.end();
    };
    strip(b.main, b.pts, 0.26, '#ffb800', 1.3);
    strip(b.core, b.pts, 0.07, '#ffffff', 1.6);
    strip(b.br1, b.b1, 0.06, '#fff2a0', 0.9);
    strip(b.br2, b.b2, 0.06, '#fff2a0', 0.9);
    if (b.t < 0.12) for (let i = 2; i < b.pts.length; i += 4) { const q = b.pts[i]; this.particles?.burst(q.x, q.y, q.z, 2, { colors: ['#fff2a0', '#ffffff', '#ffd21f'], speed: 3, up: 1.5, size: 0.035, life: 0.35 }); }
  }
  warm() {
    for (const w of this.water) { w.h.warm(); w.head.visible = true; }
    this.fire[0].a.warm(); this.bolt[0].main.warm();
  }
  unwarm() { for (const w of this.water) if (!w.on) { w.h.hide(); w.head.visible = false; } if (!this.fire[0].on) this.fire[0].a.hide(); if (!this.bolt[0].on) this.bolt[0].main.hide(); }
}

// ---------- Piso en llamas (zonas de la técnica de llama) ----------
export class BurnZones {
  constructor(scene, particles, cap = 12) {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const g = c.getContext('2d');
    const gr = g.createRadialGradient(32, 32, 2, 32, 32, 31);
    gr.addColorStop(0, 'rgba(255,230,140,1)'); gr.addColorStop(0.35, 'rgba(255,120,30,.85)'); gr.addColorStop(0.75, 'rgba(200,40,10,.35)'); gr.addColorStop(1, 'rgba(120,10,0,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    const geo = new THREE.PlaneGeometry(1, 1); geo.rotateX(-Math.PI / 2);
    const m = new THREE.MeshBasicMaterial({ map: tex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
    this.pool = Array.from({ length: cap }, () => { const q = new THREE.Mesh(geo, m); q.visible = false; q.renderOrder = 2; q.frustumCulled = false; scene.add(q); return q; });
    this.particles = particles;
    this.acc = 0;
  }
  // list: [{ id, x, z (m), r (m), t (s que le quedan) }]
  update(list, dt, time) {
    this.acc += dt;
    const puff = this.acc > 0.07;
    if (puff) this.acc = 0;
    this.pool.forEach((q, i) => {
      const z = list[i];
      if (!z) { q.visible = false; return; }
      q.visible = true;
      const k = Math.min(1, z.t / 0.6);
      q.position.set(z.x, 0.03 + i * 0.001, z.z);
      q.scale.setScalar(z.r * 2.2 * (0.92 + Math.sin(time * 9 + i) * 0.08) * (0.5 + 0.5 * k));
      if (puff) {
        const a = Math.random() * 6.28, rr = Math.random() * z.r * 0.8;
        this.particles?.burst(z.x + Math.cos(a) * rr, 0.08, z.z + Math.sin(a) * rr, 2, { colors: ['#ff6a1a', '#ffd27a', '#ff3b1a'], speed: 0.4, up: 2.5, size: 0.045, life: 0.7, gravity: -2.5 });
      }
    });
  }
  warm() { this.pool[0].visible = true; this.pool[0].position.set(0, -50, 0); }
  clear() { for (const q of this.pool) q.visible = false; }
}
