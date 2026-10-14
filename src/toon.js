// Toon (cel) shading helpers: shared gradient map, cached materials, inverted-hull outlines.
import * as THREE from 'three';

let _grad = null;
export function gradientMap() {
  if (_grad) return _grad;
  // 3 hard bands -> clear anime light/shadow boundary
  const data = new Uint8Array([70, 70, 70, 255, 165, 165, 165, 255, 255, 255, 255, 255]);
  _grad = new THREE.DataTexture(data, 3, 1, THREE.RGBAFormat);
  _grad.minFilter = THREE.NearestFilter;
  _grad.magFilter = THREE.NearestFilter;
  _grad.generateMipmaps = false;
  _grad.needsUpdate = true;
  return _grad;
}

let _soft = null;
/** Softer 2-band ramp for skin: keeps faces bright (anime faces carry little shading). */
export function softGradientMap() {
  if (_soft) return _soft;
  const data = new Uint8Array([200, 200, 200, 255, 255, 255, 255, 255]);
  _soft = new THREE.DataTexture(data, 2, 1, THREE.RGBAFormat);
  _soft.minFilter = _soft.magFilter = THREE.NearestFilter; _soft.generateMipmaps = false; _soft.needsUpdate = true;
  return _soft;
}
export function skinMat(color = 0xffdcc8) {
  return toon(color, 0xff9e80, 0.08, { gradientMap: softGradientMap() });
}

const cache = new Map();
/** Shared toon material. Same args -> same material instance (fewer programs/state changes). */
export function toon(color, emissive = 0x000000, emissiveIntensity = 0, opts = {}) {
  const key = `${color}|${emissive}|${emissiveIntensity}|${JSON.stringify(opts)}`;
  if (cache.has(key)) return cache.get(key);
  const m = new THREE.MeshToonMaterial({ color, emissive, emissiveIntensity, gradientMap: gradientMap(), ...opts });
  if (opts.gradientMap) m.gradientMap = opts.gradientMap;
  cache.set(key, m);
  return m;
}

const basicCache = new Map();
export function glowMat(color, opacity = 1, additive = false) {
  const key = `${color}|${opacity}|${additive}`;
  if (basicCache.has(key)) return basicCache.get(key);
  const m = new THREE.MeshBasicMaterial({
    color, transparent: opacity < 1 || additive, opacity,
    blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    depthWrite: !additive && opacity >= 1, toneMapped: false,
  });
  basicCache.set(key, m);
  return m;
}

// Inverted hull outline: pushes vertices along their normal in view space,
// renders back faces only. Thickness stays roughly constant on screen.
const outlineCache = new Map();
export function outlineMaterial(color = 0x0b1020, thickness = 0.012) {
  const key = `${color}|${thickness}`;
  if (outlineCache.has(key)) return outlineCache.get(key);
  const m = new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color(color) }, uThick: { value: thickness } },
    vertexShader: `
      uniform float uThick;
      void main(){
        vec4 mv = modelViewMatrix * vec4(position,1.0);
        vec3 n = normalize(normalMatrix * normal);
        float dist = clamp(-mv.z, 0.5, 30.0);
        mv.xyz += n * uThick * (0.6 + dist * 0.08);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `uniform vec3 uColor; void main(){ gl_FragColor = vec4(uColor,1.0); }`,
    side: THREE.BackSide,
  });
  outlineCache.set(key, m);
  return m;
}

/** Adds an outline hull to every mesh under root (meshes flagged noOutline are skipped). */
export function addOutlines(root, color = 0x0b1020, thickness = 0.012) {
  const meshes = [];
  root.traverse(o => { if (o.isMesh && !o.userData.noOutline && !o.userData.isOutline) meshes.push(o); });
  const om = outlineMaterial(color, thickness);
  for (const m of meshes) {
    const hull = new THREE.Mesh(m.geometry, om);
    hull.userData.isOutline = true;
    hull.renderOrder = -1;
    m.add(hull);
  }
}

/** Canvas helper */
export function canvasTexture(w, h, draw, { srgb = true, repeat = null, aniso = 4 } = {}) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d');
  draw(ctx, w, h);
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = aniso;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat[0], repeat[1]); }
  t.userData.canvas = c;
  t.userData.ctx = ctx;
  return t;
}
