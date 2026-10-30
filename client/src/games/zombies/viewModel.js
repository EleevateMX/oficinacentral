// Arma en primera persona (brazos con la piel y la manga del avatar, las 10 armas del arsenal,
// destello de la boca y estela de la espada). Lo usan Zombies en la oficina y la Arena HUB.
// No sabe nada del juego: cada cuadro recibe lo que necesita para posar el arma.
import * as THREE from 'three';
import { ARMS, COMBO, HEAVY } from '@shared/arsenal.js';
import { armsModel } from './models.js';
import { viewWeapon } from './arsenalModels.js';
import { flashSprite } from './fx.js';

const _tip = new THREE.Vector3(), _base = new THREE.Vector3(), _dir = new THREE.Vector3(), _hand = new THREE.Vector3(), _edge = new THREE.Vector3(), _x = new THREE.Vector3(), _m4 = new THREE.Matrix4();
const _Z = new THREE.Vector3(0, 0, 1);
const _c3 = new THREE.Color();
const IDLE_DIR = new THREE.Vector3(0.3, 0.88, -0.36).normalize(), IDLE_HAND = new THREE.Vector3(0.2, -0.22, -0.46);
const CHARGE_DIR = new THREE.Vector3(0.8, 0.42, 0.45).normalize(), CHARGE_HAND = new THREE.Vector3(0.24, -0.15, -0.4);
const ease = (k) => 1 - Math.pow(1 - Math.min(1, Math.max(0, k)), 3);
// dirección de la hoja en un corte horizontal (phi: −derecha … +izquierda), inclinado por tilt alrededor de la mirada
function slashDir(phi, tilt, out) {
  const x = -Math.sin(phi), y = 0.12, z = -Math.cos(phi);
  return out.set(x * Math.cos(tilt) - y * Math.sin(tilt), x * Math.sin(tilt) + y * Math.cos(tilt), z).normalize();
}

// vmScene: la escena del arma (se dibuja encima del mundo). Devuelve el arma con su update().
export function createViewModel(vmScene) {
  const vm = { root: new THREE.Group(), weapons: [], arms: null, cur: -1, armsKey: '', trail: null, swayT: 0, kind: 'gun' };
  vmScene.add(vm.root);
  const muzzle = flashSprite(); muzzle.scale.setScalar(0.28); muzzle.visible = false; vmScene.add(muzzle);
  vm.muzzle = muzzle;

  // s = { avatar, wIdx, mine, L, moving, bob, switchAnim, recoil, flashT, alive, time, fxScale, techReady }
  // L (lo de tu arma): reloadT, adsK, bashT, swing, techAnim, charge, wheel
  vm.update = (dt, s) => {
    const av = s.avatar || {};
    const key = `${av.skin}|${av.shirt}`;
    if (vm.armsKey !== key) {
      if (vm.arms) vm.root.remove(vm.arms.group);
      vm.arms = armsModel(av.skin || '#f6c9a0', av.shirt || '#3d7be0');
      vm.root.add(vm.arms.group);
      vm.armsKey = key;
    }
    const { mine, L } = s;
    const wIdx = s.wIdx;
    if (!vm.weapons.length) for (let i = 0; i < ARMS.length; i++) { const w = viewWeapon(i); w.group.visible = false; vm.root.add(w.group); vm.weapons.push(w); }
    const Wd = ARMS[wIdx] || ARMS[0];
    const Wv = vm.weapons[wIdx] || vm.weapons[0];
    // con la mira telescópica puesta no se ve el arma
    const scoped = mine && Wd.scope && L.adsK > 0.85;
    vm.root.visible = !scoped;
    vm.weapons.forEach((w, i) => { w.group.visible = i === wIdx; });
    const vdt = (mine && L.wheel ? 0.3 : 1) * dt; // rueda abierta: la vista local va en cámara lenta
    vm.swayT += vdt;
    const moving = s.moving;
    if (Wv.kind === 'sword') poseSword(Wv, Wd, mine, moving, vdt, s);
    else poseGun(Wv, Wd, wIdx, mine, moving, s);
    vm.lastSword = Wv.kind === 'sword';
    vm.kind = Wv.kind;
    if (Wv.kind !== 'sword') vm.trail?.sample(_tip, _base, false, vdt);
    muzzle.visible = s.flashT > 0 && s.alive && Wv.kind === 'gun' && !scoped;
    if (muzzle.visible) {
      Wv.muzzle.updateWorldMatrix(true, false);
      muzzle.position.setFromMatrixPosition(Wv.muzzle.matrixWorld);
      muzzle.material.rotation = Math.random() * 6;
      muzzle.scale.setScalar(Wd.pellets > 1 || Wd.splash ? 0.45 : Wd.scope ? 0.38 : 0.26);
    }
  };

  function poseGun(Wv, Wd, wIdx, mine, moving, s) {
    const { L, bob, recoil, switchAnim } = s;
    const swayT = vm.swayT;
    const reloading = mine && L.reloadT > 0;
    const rk = reloading ? Math.sin(Math.min(1, 1 - L.reloadT / Wd.reload) * Math.PI) : 0;
    const ads = mine ? L.adsK : 0;
    const bx = (moving ? Math.cos(bob * 0.5) * 0.018 : Math.sin(swayT * 1.4) * 0.003) * (1 - ads * 0.8);
    const byy = (moving ? Math.abs(Math.sin(bob * 0.5)) * 0.022 : Math.sin(swayT * 2) * 0.004) * (1 - ads * 0.8);
    const bk = mine && L.bashT > 0 ? Math.sin((1 - L.bashT / 0.34) * Math.PI) : 0; // golpe rápido con el arma
    const kick = recoil * (Wd.scope ? 0.09 : 0.05);
    const px = 0.12 * (1 - ads) - bk * 0.08, py = -0.135 * (1 - ads) + ads * -0.082, pz = -0.42 + ads * 0.07;
    vm.root.position.set(px + bx, py - byy - rk * 0.2 - switchAnim * 0.3 + bk * 0.05, pz + kick - bk * 0.16);
    vm.root.scale.setScalar(0.85);
    vm.root.rotation.set((0.04 + recoil * 0.12) * (1 - ads * 0.6) + rk * 0.7 - bk * 0.4, 0.14 * (1 - ads) + rk * 0.3 + bk * 0.9, -0.04 * (1 - ads) + rk * 0.25 + bk * 0.5);
    // brazos: el derecho al mango; el izquierdo sostiene el frente
    const A = vm.arms;
    A.R.scale.setScalar(1); A.L.scale.setScalar(1);
    A.R.position.set(0.01, -0.075, 0.07); A.R.rotation.set(0.62, -0.12, 0.1);
    A.L.position.set(-0.02, -0.11, -0.2); A.L.rotation.set(0.45, 0.4, -0.2);
    if (wIdx === 0) {
      // grapadora: la palma aprieta arriba atrás (como se usa una grapadora) y la otra mano la sostiene
      A.R.position.set(0.01, -0.035, 0.05); A.R.rotation.set(0.5, -0.15, 0.1);
      A.L.position.set(-0.06, -0.05, -0.05); A.L.rotation.set(0.45, 0.6, -0.35);
    }
    else if (Wd.id === 'cafetera') { A.L.position.set(-0.01, -0.13, -0.3); A.L.rotation.set(0.42, 0.42, -0.2); }
    else if (Wd.id === 'laser' || Wd.id === 'toner') { A.L.position.set(-0.02, -0.1, -0.3); A.L.rotation.set(0.4, 0.42, -0.2); }
    else if (Wd.id === 'trituradora') { A.L.position.set(-0.04, 0.09, -0.06); A.L.rotation.set(-0.4, 0.3, -0.2); }
    else if (Wd.id === 'lanzatazas') { A.L.position.set(-0.02, -0.11, -0.2); A.L.rotation.set(0.35, 0.4, -0.2); }
    A.R.quaternion.setFromEuler(A.R.rotation); A.L.quaternion.setFromEuler(A.L.rotation);
    Wv.group.position.set(0, 0, 0); Wv.group.rotation.set(0, 0, 0);
  }

  function poseSword(Wv, Wd, mine, moving, vdt, s) {
    const { L, bob, switchAnim } = s;
    const swayT = vm.swayT;
    const bx = moving ? Math.cos(bob * 0.5) * 0.02 : Math.sin(swayT * 1.4) * 0.004;
    const byy = moving ? Math.abs(Math.sin(bob * 0.5)) * 0.024 : Math.sin(swayT * 2) * 0.005;
    vm.root.position.set(bx, -byy - switchAnim * 0.35, 0);
    vm.root.rotation.set(0, 0, 0);
    vm.root.scale.setScalar(1);
    let trailOn = false, strong = 1;
    _dir.copy(IDLE_DIR); _hand.copy(IDLE_HAND);
    const sw = mine ? L.swing : null, ta = mine ? L.techAnim : null;
    if (ta) {
      // técnica: estocada larga al frente
      const k = ta.t / ta.dur;
      const out = ease(k / 0.3), back = ease((k - 0.7) / 0.3);
      const fdir = _edge.set(0.05, 0.08, -1).normalize();
      _dir.copy(IDLE_DIR).lerp(fdir, out).lerp(IDLE_DIR, back).normalize();
      _hand.copy(IDLE_HAND).lerp(_x.set(0.02, -0.14, -0.6), out).lerp(IDLE_HAND, back);
      trailOn = false; // la técnica ya tiene su propio efecto en el mundo
    } else if (sw) {
      const k = sw.t / sw.dur;
      const heavy = sw.kind === 'heavy';
      const c = heavy ? { from: 1.15, to: -1.25, tilt: -0.1 } : COMBO[sw.step];
      const w0 = heavy ? 0.14 : 0.2, w1 = heavy ? 0.58 : 0.55;
      const vertical = !heavy && c.from === 0 && c.to === 0;
      const pose = (u, outDir, outHand) => {
        if (vertical) {
          const th = 0.1 + u * 2.3; // de arriba hacia abajo
          outDir.set(0.04, Math.cos(th), -Math.sin(th)).normalize();
          outHand.set(0.04, -0.06 - u * 0.24, -0.42 - u * 0.1);
        } else {
          const phi = (c.from + (c.to - c.from) * u) * (heavy ? 1.55 : 1.3);
          slashDir(phi, c.tilt, outDir);
          outHand.set(0.03 - Math.sin(phi) * 0.14, -0.17 + Math.sin(c.tilt) * Math.sin(phi) * 0.06, -0.44 - Math.cos(phi) * 0.06);
        }
      };
      if (k < w0) { pose(0, _edge, _x); const e = ease(k / w0); _dir.lerp(_edge, e).normalize(); _hand.lerp(_x, e); }
      else if (k < w1) { pose(ease((k - w0) / (w1 - w0)), _dir, _hand); trailOn = true; strong = heavy ? 1.5 : 1; }
      else { pose(1, _dir, _hand); const e = ease((k - w1) / (1 - w1)); _dir.lerp(IDLE_DIR, e).normalize(); _hand.lerp(IDLE_HAND, e); trailOn = k < w1 + 0.08; }
    } else if (mine && L.charge > 0.08) {
      const e = ease((L.charge - 0.08) / (HEAVY.charge - 0.08));
      _dir.lerp(CHARGE_DIR, e).normalize(); _hand.lerp(CHARGE_HAND, e);
      if (L.charge >= HEAVY.charge) _hand.x += (Math.random() - 0.5) * 0.006, _hand.y += (Math.random() - 0.5) * 0.006;
    }
    // filo hacia donde se mueve la hoja (suavizado para que no gire de golpe)
    const prev = vm.prevDir || _dir.clone();
    const mv = _edge.copy(_dir).sub(prev);
    vm.prevDir = _dir.clone();
    if (!vm.edgeV) vm.edgeV = new THREE.Vector3(0, 0, -1);
    if (mv.lengthSq() > 1e-6) vm.edgeV.lerp(mv.normalize(), 0.5);
    else vm.edgeV.lerp(_x.set(0, 0, -1), 0.1);
    const z = _edge.copy(vm.edgeV).addScaledVector(_dir, -vm.edgeV.dot(_dir));
    if (z.lengthSq() < 1e-5) z.set(0, 0, -1).addScaledVector(_dir, _dir.z);
    z.normalize();
    _x.crossVectors(_dir, z).normalize();
    z.crossVectors(_x, _dir).normalize();
    _m4.makeBasis(_x, _dir, z);
    Wv.group.quaternion.setFromRotationMatrix(_m4);
    Wv.group.position.copy(_hand);
    Wv.group.scale.setScalar(0.62);
    // brazos: la mano derecha al mango; con el mandoble la izquierda también
    const A = vm.arms;
    A.R.scale.setScalar(0.8); A.L.scale.setScalar(0.8);
    const sh = _x.set(0.3, -0.44, 0.12);
    A.R.position.copy(_hand);
    A.R.quaternion.setFromUnitVectors(_Z, _edge.copy(sh).sub(_hand).normalize());
    if (Wd.twoHand) {
      const hl = _tip.copy(_hand).addScaledVector(_dir, -0.11);
      A.L.position.copy(hl);
      A.L.quaternion.setFromUnitVectors(_Z, _edge.set(-0.22, -0.46, 0.12).sub(hl).normalize());
    } else { A.L.position.set(-0.32, -0.62, 0.1); A.L.quaternion.set(0, 0, 0, 1); }
    // filo brillante cuando la técnica está lista
    const ready = mine && s.techReady;
    Wv.edge.color.copy(Wv.color);
    if (ready) Wv.edge.color.lerp(_c3.set('#ffffff'), 0.4 + Math.sin(s.time * 8) * 0.35);
    // estela
    Wv.group.updateWorldMatrix(true, true);
    Wv.tip.getWorldPosition(_tip); Wv.base.getWorldPosition(_base);
    if (vm.trail) { vm.trail.color.copy(Wv.color); vm.trail.sample(_tip, _base, trailOn, vdt * s.fxScale, strong); }
  }
  return vm;
}
