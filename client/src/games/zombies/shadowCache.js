// Sombra del sol "en dos capas": el edificio y los muebles (lo pesado y que no se mueve) se dibujan en
// el mapa de sombras UNA vez y se guardan; en cada cuadro solo se copia esa sombra guardada (una copia
// de la tarjeta de video, muy barata) y encima se dibujan los personajes que se mueven (zombis,
// compañeros, jefe). Se ve igual que rehacer toda la sombra en cada cuadro, pero sin volver a dibujar
// miles de triángulos de muebles dos veces por cuadro.
//
// Los personajes van en la capa DYN_LAYER (además de la normal) y sin castShadow: así no entran en la
// sombra fija y sí en la capa de encima.
import * as THREE from 'three';

export const DYN_LAYER = 1;

export class ShadowCache {
  constructor(renderer, light) {
    this.r = renderer;
    this.light = light;
    this.cache = null;
    this.valid = false;
    this.ok = true; // si la copia de profundidad falla en este navegador, se usa la sombra normal
    this.mat = new THREE.MeshDepthMaterial({ side: THREE.BackSide }); // como la sombra de three (caras de atrás)
    this.stats = { bakes: 0, overlays: 0 };
  }
  setLight(light) { if (light !== this.light) { this.light = light; this.valid = false; } }
  invalidate() { this.valid = false; }

  // Antes de dibujar el cuadro: 'bake' = este cuadro rehace la sombra fija (three la dibuja; luego
  // llamar after()), 'overlay' = ya está la fija y se le dibujaron los personajes encima.
  before(scene) {
    const R = this.r, map = this.light?.shadow?.map;
    if (!this.valid || !map?.depthTexture) { R.shadowMap.needsUpdate = true; return 'bake'; }
    const prevRT = R.getRenderTarget(), cam = this.light.shadow.camera;
    const mask = cam.layers.mask, ov = scene.overrideMaterial, bg = scene.background, fog = scene.fog;
    try {
      R.copyTextureToTexture(this.cache.depthTexture, map.depthTexture);
      cam.layers.set(DYN_LAYER);
      scene.overrideMaterial = this.mat; scene.background = null; scene.fog = null;
      R.shadowMap.needsUpdate = false;
      R.setRenderTarget(map);
      R.render(scene, cam);
      this.stats.overlays++;
    } catch (e) {
      this.ok = false;
      console.warn('Zombies: sin sombra en capas, se usa la normal', e);
    } finally {
      cam.layers.mask = mask; scene.overrideMaterial = ov; scene.background = bg; scene.fog = fog;
      R.setRenderTarget(prevRT);
    }
    return this.ok ? 'overlay' : 'fail';
  }

  // Después de un cuadro 'bake': guarda la sombra fija
  after() {
    const R = this.r, map = this.light?.shadow?.map;
    if (!map?.depthTexture) return;
    const w = map.width, h = map.height, src = map.depthTexture;
    if (!this.cache || this.cache.width !== w || this.cache.height !== h) {
      this.cache?.dispose();
      this.cache = new THREE.WebGLRenderTarget(w, h);
      this.cache.depthTexture = new THREE.DepthTexture(w, h, src.type);
      this.cache.depthTexture.format = src.format;
      R.initRenderTarget(this.cache);
    }
    try {
      R.copyTextureToTexture(src, this.cache.depthTexture);
      this.valid = true;
      this.stats.bakes++;
    } catch (e) {
      this.ok = false;
      console.warn('Zombies: sin sombra en capas, se usa la normal', e);
    }
  }

  dispose() { this.cache?.dispose(); this.mat.dispose(); }
}
