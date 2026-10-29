// Modelos 3D del arsenal (arte original, todo por código): armas de fuego y espadas en primera
// persona, y la espada que carga el personaje de un compañero.
// - Armas: marco de la cámara, -Z al frente. Devuelven { group, muzzle }.
// - Espadas: el mango en el origen y la hoja hacia +Y; el filo mira a +Z.
//   Devuelven { group, tip, base, edge } (tip/base: puntos para la estela; edge: material del filo
//   que brilla cuando la técnica está lista).
import * as THREE from 'three';
import { GEO, part, weaponModel } from './models.js';
import { ARMS } from '@shared/arsenal.js';

const DARK = '#1d1f26', STEEL = '#c9ced6', GUN = '#2b2f3a', GREY = '#3a3f4b';

function rotX(m, a) { m.rotation.x = a; return m; }

// Armas nuevas (las 3 primeras ya existían en models.js)
const GUNS = {
  // Rifle de tóner: cuerpo largo, cartucho de tóner como cargador y ventanitas de tinta CMY
  toner(g, muzzle) {
    g.add(part(0.08, 0.1, 0.46, GUN, { z: -0.1 }));
    g.add(part(0.084, 0.03, 0.3, GREY, { y: 0.06, z: -0.12 }));
    g.add(rotX(part(0.03, 0.3, 0.03, '#141414', { z: -0.48, geo: GEO.cyl }), Math.PI / 2));
    g.add(rotX(part(0.05, 0.08, 0.05, GREY, { z: -0.36, geo: GEO.cyl6 }), Math.PI / 2));
    g.add(rotX(part(0.06, 0.17, 0.1, '#141414', { y: -0.12, z: -0.12 }), 0.12));
    g.add(rotX(part(0.064, 0.03, 0.104, '#FE3377', { glow: true, y: -0.1, z: -0.12 }), 0.12));
    for (const [i, c] of ['#29d3ff', '#ff3fa4', '#ffe14f'].entries()) g.add(part(0.004, 0.022, 0.03, c, { glow: true, x: 0.042, y: 0.0, z: -0.2 + i * 0.04 }));
    g.add(part(0.06, 0.09, 0.2, GREY, { z: 0.22, y: -0.02 }));
    g.add(part(0.062, 0.1, 0.03, DARK, { z: 0.33, y: -0.02 }));
    g.add(rotX(part(0.05, 0.12, 0.06, DARK, { y: -0.1, z: 0.06 }), 0.25));
    g.add(part(0.025, 0.04, 0.05, '#9aa3ad', { y: 0.09, z: -0.06 }));
    g.add(part(0.01, 0.01, 0.01, '#7CFF4F', { glow: true, y: 0.115, z: -0.06 }));
    muzzle.position.set(0, 0, -0.64);
    g.scale.setScalar(0.92);
  },
  // Láser de presentación: tubo de aluminio largo, mira de cilindro y control remoto como empuñadura
  laser(g, muzzle) {
    g.add(rotX(part(0.06, 0.72, 0.06, STEEL, { z: -0.2, geo: GEO.cyl }), Math.PI / 2));
    g.add(rotX(part(0.064, 0.04, 0.064, '#ff2d55', { glow: true, z: -0.5, geo: GEO.cyl }), Math.PI / 2));
    g.add(part(0.045, 0.045, 0.045, '#ff5577', { glow: true, z: -0.565, geo: GEO.ball }));
    g.add(rotX(part(0.068, 0.26, 0.068, '#141414', { y: 0.078, z: -0.12, geo: GEO.cyl }), Math.PI / 2));
    g.add(rotX(part(0.06, 0.006, 0.06, '#4fd8ff', { glow: true, y: 0.078, z: -0.253, geo: GEO.cyl }), Math.PI / 2));
    g.add(part(0.02, 0.04, 0.03, DARK, { y: 0.04, z: -0.06 }));
    g.add(part(0.02, 0.04, 0.03, DARK, { y: 0.04, z: -0.18 }));
    g.add(rotX(part(0.055, 0.15, 0.09, DARK, { y: -0.1, z: 0.07 }), 0.2));
    g.add(part(0.02, 0.02, 0.012, '#FE3377', { glow: true, x: 0.0, y: -0.04, z: 0.025 }));
    g.add(part(0.02, 0.02, 0.012, '#7CFF4F', { glow: true, x: 0.0, y: -0.07, z: 0.02 }));
    g.add(part(0.05, 0.1, 0.24, GUN, { z: 0.27, y: -0.03 }));
    muzzle.position.set(0, 0, -0.6);
    g.scale.setScalar(0.95);
  },
  // Trituradora de papel: cabezal gris, boca negra con tiras de papel, cesto abajo y asa arriba
  trituradora(g, muzzle) {
    g.add(part(0.2, 0.13, 0.32, '#d9dde2', { z: -0.08 }));
    g.add(part(0.204, 0.014, 0.1, '#FE3377', { glow: true, y: 0.035, z: 0.02 }));
    g.add(part(0.17, 0.035, 0.03, '#0d0e12', { z: -0.24, y: 0.015 }));
    for (let i = 0; i < 6; i++) g.add(part(0.014, 0.07 + (i % 3) * 0.02, 0.004, '#f4f6f8', { x: -0.06 + i * 0.024, y: -0.05 - (i % 3) * 0.01, z: -0.242 }));
    g.add(part(0.16, 0.1, 0.26, '#3a3f4b', { y: -0.11, z: -0.06 }));
    for (let i = 0; i < 4; i++) g.add(part(0.162, 0.008, 0.262, '#24272f', { y: -0.14 + i * 0.022, z: -0.06 }));
    g.add(part(0.03, 0.03, 0.18, DARK, { y: 0.115, z: -0.06 }));
    g.add(part(0.03, 0.05, 0.03, DARK, { y: 0.085, z: -0.14 }));
    g.add(part(0.03, 0.05, 0.03, DARK, { y: 0.085, z: 0.02 }));
    g.add(rotX(part(0.05, 0.13, 0.06, DARK, { y: -0.08, z: 0.13 }), 0.25));
    g.add(part(0.06, 0.06, 0.06, '#7CFF4F', { glow: true, x: 0.07, y: 0.0, z: 0.075, geo: GEO.ball }));
    muzzle.position.set(0, 0.01, -0.26);
    g.scale.setScalar(0.88);
  },
  // Lanzatazas: tubo rosa con la taza asomando por la boca
  lanzatazas(g, muzzle) {
    g.add(rotX(part(0.13, 0.5, 0.13, '#FE3377', { z: -0.12, geo: GEO.cyl }), Math.PI / 2));
    for (const z of [-0.36, -0.12, 0.12]) g.add(rotX(part(0.14, 0.03, 0.14, '#141414', { z, geo: GEO.cyl }), Math.PI / 2));
    g.add(rotX(part(0.1, 0.07, 0.1, '#f4f6f8', { z: -0.355, geo: GEO.cyl }), Math.PI / 2));
    g.add(rotX(part(0.09, 0.012, 0.09, '#5a3a1a', { z: -0.392, geo: GEO.cyl }), Math.PI / 2));
    g.add(rotX(part(0.05, 0.12, 0.06, DARK, { y: -0.11, z: 0.04 }), 0.25));
    g.add(rotX(part(0.045, 0.1, 0.05, DARK, { y: -0.1, z: -0.2 }), -0.1));
    g.add(part(0.03, 0.05, 0.05, GREY, { y: 0.085, z: -0.04 }));
    g.add(part(0.012, 0.012, 0.012, '#FFCC00', { glow: true, y: 0.115, z: -0.04 }));
    muzzle.position.set(0, 0, -0.42);
    g.scale.setScalar(0.92);
  },
};

// Material propio del filo (para que brille sin cambiar el de otras piezas)
function edgeMat(color) { return new THREE.MeshBasicMaterial({ color }); }

const SWORDS = {
  // Katana de oficina: hoja delgada, guarda de disco compacto y mango con cordón de gafete
  katana(g, edge) {
    g.add(part(0.034, 0.21, 0.034, '#141a30', { y: -0.075 }));
    for (let i = 0; i < 5; i++) { const w = part(0.038, 0.018, 0.038, '#2a7fd4', { y: -0.16 + i * 0.04 }); w.rotation.y = Math.PI / 4; g.add(w); }
    g.add(part(0.04, 0.03, 0.04, STEEL, { y: -0.19 }));
    g.add(part(0.12, 0.012, 0.12, '#d9dde2', { y: 0.04, geo: GEO.cyl }));
    g.add(part(0.124, 0.004, 0.124, '#9fd8ff', { glow: true, y: 0.047, geo: GEO.cyl }));
    g.add(part(0.026, 0.014, 0.026, '#333844', { y: 0.05, geo: GEO.cyl }));
    g.add(part(0.014, 0.8, 0.034, '#e8eef5', { y: 0.46 }));
    g.add(part(0.016, 0.8, 0.012, '#9aa3ad', { y: 0.46, z: -0.018 }));
    const e = new THREE.Mesh(GEO.box.clone().scale(0.007, 0.76, 0.01), edge); e.position.set(0, 0.45, 0.019); g.add(e);
    const tip = part(0.014, 0.07, 0.034, '#e8eef5', { y: 0.875, z: -0.008 }); tip.rotation.x = 0.45; g.add(tip);
    return { tip: 0.9, base: 0.14, scale: 1 };
  },
  // Regla afilada: hoja ancha de regla metálica con marcas, se ensancha hacia la punta (como un sable chino)
  regla(g, edge) {
    g.add(part(0.036, 0.17, 0.036, '#3a2a1a', { y: -0.06 }));
    g.add(part(0.05, 0.05, 0.05, '#FFCC00', { y: -0.17, geo: GEO.ball }));
    g.add(part(0.11, 0.028, 0.055, '#FFCC00', { y: 0.035 }));
    g.add(part(0.012, 0.42, 0.06, '#c9ced6', { y: 0.27 }));
    g.add(part(0.012, 0.32, 0.085, '#d9dde2', { y: 0.63, z: 0.012 }));
    const tip = part(0.012, 0.12, 0.07, '#d9dde2', { y: 0.81, z: -0.004 }); tip.rotation.x = -0.55; g.add(tip);
    for (let i = 0; i < 16; i++) g.add(part(0.014, 0.004, i % 4 === 0 ? 0.03 : 0.016, '#141414', { y: 0.1 + i * 0.045, z: -0.02 }));
    const e = new THREE.Mesh(GEO.box.clone().scale(0.008, 0.72, 0.01), edge); e.position.set(0, 0.44, 0.052); g.add(e);
    return { tip: 0.86, base: 0.12, scale: 1 };
  },
  // Espada de cartón corrugado: mandoble ancho de caja, con cinta canela y mango de cinta gris
  carton(g, edge) {
    g.add(part(0.045, 0.38, 0.045, '#7a7f88', { y: -0.13 }));
    for (let i = 0; i < 4; i++) g.add(part(0.05, 0.012, 0.05, '#5c6068', { y: -0.27 + i * 0.09 }));
    g.add(part(0.3, 0.05, 0.07, '#a8763e', { y: 0.06 }));
    g.add(part(0.032, 1.05, 0.18, '#b98a52', { y: 0.62 }));
    for (let i = 0; i < 5; i++) g.add(part(0.034, 1.0, 0.008, '#8a6234', { y: 0.6, z: -0.07 + i * 0.035 }));
    g.add(part(0.036, 0.07, 0.185, '#e8d9a8', { y: 0.32 }));
    g.add(part(0.036, 0.05, 0.185, '#e8d9a8', { y: 0.86 }));
    const tip = part(0.032, 0.13, 0.13, '#b98a52', { y: 1.15 }); tip.rotation.x = Math.PI / 4; g.add(tip);
    const e = new THREE.Mesh(GEO.box.clone().scale(0.01, 1.0, 0.012), edge); e.position.set(0, 0.62, 0.092); g.add(e);
    return { tip: 1.18, base: 0.2, scale: 0.92 };
  },
};

// Arma o espada en primera persona por índice del arsenal
export function viewWeapon(i) {
  const W = ARMS[i];
  if (!W) return weaponModel(0);
  if (i <= 2) return { ...weaponModel(i), kind: 'gun', id: W.id };
  if (W.kind === 'gun') {
    const g = new THREE.Group();
    const muzzle = new THREE.Object3D();
    GUNS[W.id](g, muzzle);
    g.add(muzzle);
    g.traverse((o) => { if (o.isMesh) o.castShadow = false; });
    return { group: g, muzzle, kind: 'gun', id: W.id };
  }
  return { ...swordModel(W.id), kind: 'sword', id: W.id };
}

export function swordModel(id) {
  const outer = new THREE.Group();
  const g = new THREE.Group();
  outer.add(g);
  const W = ARMS.find((w) => w.id === id) || ARMS.find((w) => w.kind === 'sword');
  const edge = edgeMat(W.color);
  const info = SWORDS[W.id](g, edge);
  g.scale.setScalar(info.scale);
  const tip = new THREE.Object3D(); tip.position.set(0, info.tip, 0); g.add(tip);
  const base = new THREE.Object3D(); base.position.set(0, info.base, 0); g.add(base);
  g.traverse((o) => { if (o.isMesh) o.castShadow = false; });
  return { group: outer, tip, base, edge, color: new THREE.Color(W.color) };
}

// Espada pequeña para el personaje de cubos del compañero (va en su mano derecha)
export function avatarSword(color = '#4fd8ff') {
  const g = new THREE.Group();
  g.add(part(0.05, 0.16, 0.05, '#20232c', { y: 0 }));
  g.add(part(0.16, 0.03, 0.06, '#9aa3ad', { y: 0.09 }));
  g.add(part(0.03, 0.8, 0.08, '#dfe5ec', { y: 0.5 }));
  g.add(part(0.012, 0.76, 0.02, color, { glow: true, y: 0.5, z: 0.045, shadow: false }));
  return g;
}
