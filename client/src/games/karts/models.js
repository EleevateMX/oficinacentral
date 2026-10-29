// Modelos de los karts (hechos con cajas y cilindros, arte original) y del piloto: la versión de
// cubos del avatar de cada quien (piel, pelo, ropa), sentado y con las manos en el volante.
// Para agregar otro vehículo: escribe su función aquí y regístrala en MODELS con el mismo nombre
// que pusiste en VEHICLES (shared/karts.js).
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { part, nameTag, mat, GEO } from '../zombies/models.js';

// Junta todas las piezas fijas de un grupo en una sola malla con colores por vértice
// (de ~60 llamadas de dibujo por kart a unas pocas).
const bakedMat = new THREE.MeshLambertMaterial({ vertexColors: true });
const _inv = new THREE.Matrix4(), _mm = new THREE.Matrix4();
function bake(root, skip = () => false) {
  root.updateMatrixWorld(true);
  _inv.copy(root.matrixWorld).invert();
  const geos = [], gone = [];
  root.traverse((o) => {
    if (!o.isMesh || o === root || skip(o) || !o.material?.color || o.material.transparent) return;
    let g = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
    for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal') g.deleteAttribute(k);
    g.applyMatrix4(_mm.multiplyMatrices(_inv, o.matrixWorld));
    const n = g.attributes.position.count, col = new Float32Array(n * 3), c = o.material.color;
    for (let i = 0; i < n; i++) { col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b; }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geos.push(g); gone.push(o);
  });
  if (!geos.length) return null;
  for (const o of gone) o.parent.remove(o);
  const mesh = new THREE.Mesh(mergeGeometries(geos), bakedMat);
  geos.forEach((g) => g.dispose());
  root.add(mesh);
  return mesh;
}

const DARK = '#1d1f26', METAL = '#9aa3ad', TIRE = '#16161b', RIM = '#cfd4da';

function wheel(r, w, rimColor = RIM) {
  const g = new THREE.Group();
  const tire = new THREE.Mesh(new THREE.CylinderGeometry(r, r, w, 14), mat(TIRE));
  tire.rotation.z = Math.PI / 2;
  g.add(tire);
  const rim = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.55, r * 0.55, w + 0.02, 8), mat(rimColor));
  rim.rotation.z = Math.PI / 2;
  g.add(rim);
  // rayas para que se note que gira
  for (let k = 0; k < 3; k++) {
    const sp = part(w + 0.03, r * 0.16, r * 1.05, DARK, { shadow: false });
    sp.rotation.x = (k * Math.PI) / 3;
    g.add(sp);
  }
  bake(g);
  return g;
}

// Kart de oficina: chasis bajo, pontones, alerón, motor atrás con dos escapes y número
function kartBody(color) {
  const body = color.body, trim = color.trim;
  const root = new THREE.Group();
  const chassis = new THREE.Group();
  root.add(chassis);
  // piso y pontones (frente = +Z)
  chassis.add(part(0.92, 0.08, 1.7, DARK, { y: 0.16 }));
  chassis.add(part(0.7, 0.16, 0.5, body, { y: 0.27, z: 0.62 })); // nariz
  chassis.add(part(0.95, 0.07, 0.24, body, { y: 0.2, z: 0.98 })); // defensa delantera
  chassis.add(part(0.5, 0.05, 0.05, trim, { y: 0.31, z: 0.86 }));
  for (const s of [-1, 1]) {
    chassis.add(part(0.2, 0.2, 0.9, body, { x: s * 0.5, y: 0.26, z: -0.05 })); // pontón
    chassis.add(part(0.21, 0.04, 0.9, trim, { x: s * 0.5, y: 0.37, z: -0.05 }));
  }
  // asiento
  chassis.add(part(0.46, 0.09, 0.42, '#2b2f3a', { y: 0.25, z: -0.2 }));
  chassis.add(part(0.46, 0.46, 0.09, '#2b2f3a', { y: 0.48, z: -0.44 }));
  // volante y columna
  const column = part(0.05, 0.05, 0.4, METAL, { y: 0.42, z: 0.38 });
  column.rotation.x = -0.6;
  chassis.add(column);
  const wheelS = new THREE.Mesh(new THREE.TorusGeometry(0.13, 0.025, 6, 14), mat(DARK));
  wheelS.position.set(0, 0.56, 0.24); wheelS.rotation.x = -0.75;
  chassis.add(wheelS);
  // motor, escapes y alerón
  chassis.add(part(0.5, 0.26, 0.32, '#3a3f4b', { y: 0.32, z: -0.7 }));
  chassis.add(part(0.3, 0.06, 0.2, METAL, { y: 0.48, z: -0.7 }));
  const exhausts = [];
  for (const s of [-1, 1]) {
    const ex = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.055, 0.28, 8), mat(METAL));
    ex.rotation.x = Math.PI / 2 - 0.35;
    ex.position.set(s * 0.14, 0.36, -0.92);
    chassis.add(ex);
    const tip = new THREE.Object3D();
    tip.position.set(s * 0.14, 0.4, -1.06);
    chassis.add(tip);
    exhausts.push(tip);
  }
  chassis.add(part(0.95, 0.05, 0.22, body, { y: 0.66, z: -0.88 })); // alerón
  for (const s of [-1, 1]) chassis.add(part(0.04, 0.24, 0.12, trim, { x: s * 0.36, y: 0.42, z: -0.86 }));
  chassis.add(part(0.95, 0.08, 0.16, trim, { y: 0.2, z: -1.0 })); // defensa trasera
  // número / placa con el logo
  chassis.add(part(0.3, 0.16, 0.02, '#f4f4f6', { y: 0.33, z: 0.875 }));
  // llantas
  const wheels = [];
  const fl = wheel(0.17, 0.16), fr = wheel(0.17, 0.16), rl = wheel(0.21, 0.24), rr = wheel(0.21, 0.24);
  const front = [], all = [];
  for (const [w, x, z, isFront] of [[fl, -0.52, 0.66, true], [fr, 0.52, 0.66, true], [rl, -0.54, -0.62, false], [rr, 0.54, -0.62, false]]) {
    const pivot = new THREE.Group();
    pivot.position.set(x, isFront ? 0.17 : 0.21, z);
    pivot.add(w);
    root.add(pivot);
    all.push(w);
    if (isFront) front.push(pivot);
    wheels.push({ w, pivot, front: isFront });
  }
  return { root, chassis, wheels: all, front, exhausts };
}

const MODELS = { kart: kartBody };

// Piloto sentado: versión de cubos del avatar
function driverModel(av = {}) {
  const skin = av.skin || '#f6c9a0', hair = av.hair || '#1b1720', shirt = av.shirt || '#3d7be0', pants = av.pants || '#2b2d42', accent = av.accent || '#f4f4f6';
  const g = new THREE.Group();
  // piernas hacia adelante
  for (const s of [-1, 1]) {
    g.add(part(0.16, 0.14, 0.56, pants, { x: s * 0.11, y: 0.36, z: 0.1 }));
    g.add(part(0.17, 0.14, 0.12, '#1d1d22', { x: s * 0.11, y: 0.38, z: 0.42 }));
  }
  const torso = new THREE.Group();
  torso.position.set(0, 0.32, -0.24);
  g.add(torso);
  torso.add(part(0.44, 0.52, 0.26, shirt, { y: 0.3 }));
  if (av.top === 'shirt' || av.top === 'suit' || av.top === 'uniform') torso.add(part(0.07, 0.3, 0.02, accent, { y: 0.36, z: 0.14 }));
  else torso.add(part(0.28, 0.05, 0.02, accent, { y: 0.52, z: 0.14 }));
  const head = new THREE.Group();
  head.position.y = 0.56;
  torso.add(head);
  head.add(part(0.4, 0.4, 0.38, skin, { y: 0.2 }));
  const long = ['long', 'ponytail', 'pigtails', 'bob'].includes(av.hairStyle);
  if (av.hairStyle !== 'buzz') head.add(part(0.43, 0.13, 0.42, hair, { y: 0.42 }));
  head.add(part(0.43, long ? 0.42 : 0.2, 0.1, hair, { y: long ? 0.2 : 0.29, z: -0.17 }));
  if (av.hairStyle === 'afro' || av.hairStyle === 'curly') head.add(part(0.52, 0.26, 0.5, hair, { y: 0.47 }));
  if (av.hairStyle === 'mohawk') head.add(part(0.1, 0.17, 0.38, hair, { y: 0.54 }));
  if (av.hat === 'cap') { head.add(part(0.44, 0.12, 0.44, av.hatColor || '#101010', { y: 0.45 })); head.add(part(0.38, 0.03, 0.2, av.hatColor || '#101010', { y: 0.41, z: 0.27 })); }
  if (av.hat === 'beanie') head.add(part(0.44, 0.15, 0.44, av.hatColor || '#101010', { y: 0.48 }));
  for (const s of [-1, 1]) head.add(part(0.07, 0.07, 0.02, av.eyewear === 'sunglasses' ? '#101010' : '#261e30', { x: s * 0.1, y: 0.23, z: 0.195 }));
  if (av.eyewear === 'glasses' || av.eyewear === 'round') head.add(part(0.32, 0.02, 0.02, '#101010', { y: 0.25, z: 0.2 }));
  if (av.facialHair && av.facialHair !== 'none') head.add(part(0.28, av.facialHair === 'beard' ? 0.13 : 0.05, 0.02, hair, { y: av.facialHair === 'beard' ? 0.06 : 0.12, z: 0.195 }));
  // brazos al volante
  const arms = [];
  for (const s of [-1, 1]) {
    const a = new THREE.Group();
    a.position.set(s * 0.27, 0.48, 0);
    a.add(part(0.13, 0.38, 0.14, shirt, { pivotTop: true }));
    a.add(part(0.12, 0.12, 0.12, skin, { y: -0.42 }));
    a.rotation.set(-1.15, 0, s * -0.32);
    torso.add(a);
    arms.push(a);
  }
  return { g, head, torso, arms };
}

// Kart completo con piloto y nombre. color: { body, trim }
export function kartModel({ vehicle = 'kart', color, avatar, name = '', tagColor = '#FE3377', showTag = true } = {}) {
  const build = MODELS[vehicle] || MODELS.kart;
  const k = build(color || { body: '#FE3377', trim: '#141414' });
  const d = driverModel(avatar);
  k.chassis.add(d.g);
  // el chasis y el piloto en una sola malla (las llantas y los escapes van aparte)
  bake(k.chassis);
  d.head = null; d.torso = null;
  let tag = null;
  if (showTag && name) {
    tag = nameTag(name, tagColor);
    tag.position.y = 1.85;
    tag.scale.set(1.5, 0.375, 1);
    k.root.add(tag);
  }
  // sombra suave
  const shadow = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 2.4), shadowMat());
  shadow.rotation.x = -Math.PI / 2;
  shadow.renderOrder = 1;
  k.root.userData = { ...k, driver: d, tag, shadow, spin: 0 };
  return { group: k.root, shadow, ...k.root.userData };
}

let _shadowMat = null;
function shadowMat() {
  if (_shadowMat) return _shadowMat;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const gr = g.createRadialGradient(32, 32, 4, 32, 32, 31);
  gr.addColorStop(0, 'rgba(0,0,0,.55)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  _shadowMat = new THREE.MeshBasicMaterial({ map: t, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
  return _shadowMat;
}

// Anima un kart: llantas, dirección, inclinación, rebote y el piloto
export function animateKart(m, { speed = 0, steer = 0, drift = 0, dt = 0, air = false, spin = 0, t = 0, boost = 0 }) {
  for (const w of m.wheels) w.rotation.x += (speed * dt) / 0.19;
  for (const f of m.front) f.rotation.y = -steer * 0.45 + drift * 0.25;
  const roll = -steer * Math.min(1, Math.abs(speed) / 14) * 0.06 + drift * 0.09;
  m.chassis.rotation.z += (roll - m.chassis.rotation.z) * Math.min(1, dt * 10);
  const pitch = air ? -0.08 : boost > 0 ? -0.04 : 0;
  m.chassis.rotation.x += (pitch - m.chassis.rotation.x) * Math.min(1, dt * 8);
  m.chassis.position.y = air ? 0 : Math.sin(t * 38) * 0.008 * Math.min(1, Math.abs(speed) / 8);
  if (m.driver?.head) {
    m.driver.head.rotation.y = steer * 0.25 + drift * 0.15;
    m.driver.torso.rotation.z = -steer * 0.08;
  }
  m.group.userData.spin = spin;
}

// ---------- Objetos ----------
// Caja de objeto: cubo de colores con "?" (como una nota adhesiva gigante)
export function itemBoxTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const gr = g.createLinearGradient(0, 0, 128, 128);
  gr.addColorStop(0, '#FFCC00'); gr.addColorStop(1, '#FE3377');
  g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
  g.fillStyle = 'rgba(255,255,255,.3)'; g.fillRect(0, 0, 128, 10);
  g.strokeStyle = 'rgba(20,20,20,.65)'; g.lineWidth = 8; g.strokeRect(4, 4, 120, 120);
  g.fillStyle = '#fff'; g.font = '900 86px system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.lineWidth = 10; g.strokeStyle = '#141414'; g.strokeText('?', 64, 70); g.fillText('?', 64, 70);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// Grapa disparada: una "U" plateada grande
export function grapaModel() {
  const g = new THREE.Group();
  const M = mat('#dfe5ec');
  const top = new THREE.Mesh(GEO.box, M); top.scale.set(0.7, 0.08, 0.12); top.position.y = 0.5; g.add(top);
  for (const s of [-1, 1]) { const l = new THREE.Mesh(GEO.box, M); l.scale.set(0.08, 0.42, 0.12); l.position.set(s * 0.31, 0.29, 0); g.add(l); }
  const glow = part(0.9, 0.04, 0.2, '#ff8a3d', { glow: true, y: 0.08, shadow: false });
  g.add(glow);
  return g;
}

// Post-it en el piso, un poco levantado de una esquina
export function postitModel() {
  const g = new THREE.Group();
  const p = part(1.1, 0.03, 1.1, '#ffe14d', { y: 0.03 });
  g.add(p);
  const curl = part(0.4, 0.03, 0.4, '#ffd21a', { y: 0.12, x: 0.42, z: 0.42 });
  curl.rotation.set(0.5, 0, -0.5);
  g.add(curl);
  g.add(part(0.8, 0.01, 0.06, '#c9a400', { y: 0.05, z: -0.2 }));
  g.add(part(0.6, 0.01, 0.06, '#c9a400', { y: 0.05, z: 0.05 }));
  return g;
}

// Taza de café (para el ícono del objeto en 3D sobre el kart cuando se usa)
export function cupModel() {
  const g = new THREE.Group();
  g.add(part(0.22, 0.26, 0.22, '#f4f4f6', { y: 0.13 }));
  g.add(part(0.23, 0.06, 0.23, '#FE3377', { y: 0.15 }));
  g.add(part(0.18, 0.02, 0.18, '#6b3f22', { y: 0.27 }));
  return g;
}
