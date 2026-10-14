// Crowd: thousands of lightweight spectators in ONE instanced draw call.
// Each spectator = body + head + arm + penlight merged into one low-poly geometry.
// All motion (bounce, irregular penlight waving, goal/save reactions) runs in the vertex shader.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

function part(geo, id, pivot = [0, 0, 0]) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  const n = g.attributes.position.count;
  g.setAttribute('aPart', new THREE.Float32BufferAttribute(new Float32Array(n).fill(id), 1));
  const pv = new Float32Array(n * 3); for (let i = 0; i < n; i++) pv.set(pivot, i * 3);
  g.setAttribute('aPivot', new THREE.Float32BufferAttribute(pv, 3));
  for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'aPart', 'aPivot'].includes(k)) g.deleteAttribute(k);
  return g;
}

function personGeometry() {
  const body = new THREE.CylinderGeometry(0.17, 0.22, 0.62, 6, 1); body.translate(0, 0.62, 0);
  const shoulders = new THREE.SphereGeometry(0.2, 6, 3, 0, Math.PI * 2, 0, Math.PI / 2); shoulders.scale(1.05, 0.45, 0.8); shoulders.translate(0, 0.92, 0);
  const head = new THREE.IcosahedronGeometry(0.13, 1); head.scale(1, 1.08, 1); head.translate(0, 1.12, 0);
  const hair = new THREE.SphereGeometry(0.14, 6, 4, 0, Math.PI * 2, 0, Math.PI * 0.55); hair.translate(0, 1.15, -0.01);
  const arm = new THREE.BoxGeometry(0.07, 0.42, 0.07); arm.translate(0.0, 0.21, 0); arm.translate(0.2, 0.86, 0);
  const light = new THREE.CylinderGeometry(0.028, 0.028, 0.3, 5); light.translate(0, 0.57, 0); light.translate(0.2, 0.86, 0);
  const pivot = [0.2, 0.86, 0];
  return mergeGeometries([
    part(body, 0), part(shoulders, 0), part(head, 1), part(hair, 4), part(arm, 2, pivot), part(light, 3, pivot),
  ], false);
}

const vert = /* glsl */`
  attribute float aPart; attribute vec3 aPivot;
  attribute float aPhase; attribute float aTeam; attribute vec3 aShirt;
  uniform float uTime; uniform vec2 uHype; uniform vec2 uPop;
  varying vec3 vColor; varying float vPart; varying float vLight;
  #include <fog_pars_vertex>
  mat3 rotZ(float a){ float c=cos(a), s=sin(a); return mat3(c,s,0., -s,c,0., 0.,0.,1.); }
  mat3 rotX(float a){ float c=cos(a), s=sin(a); return mat3(1.,0.,0., 0.,c,s, 0.,-s,c); }
  void main(){
    float hype = mix(uHype.x, uHype.y, aTeam);
    float pop = mix(uPop.x, uPop.y, aTeam);
    float ph = aPhase * 6.2831;
    vec3 p = position;
    // irregular penlight / arm wave: two sines with per-person frequency + raise on hype
    if (aPart > 1.5 && aPart < 3.5) {
      float f1 = 1.4 + fract(aPhase * 7.13) * 1.6;
      float wave = sin(uTime * f1 * (1.0 + hype * 0.8) + ph) * (0.45 + hype * 0.35)
                 + sin(uTime * 0.53 + ph * 3.1) * 0.25;
      float raise = 0.25 + hype * 0.55 + pop * 0.5 + step(0.6, fract(aPhase * 3.7)) * 0.35;
      p = rotZ(wave * 0.6) * rotX(-raise) * (p - aPivot) + aPivot;
    }
    // jump / bounce
    float bounce = abs(sin(uTime * (2.2 + hype * 3.5) + ph)) * (0.02 + hype * 0.32 + pop * 0.18);
    p.y += bounce;
    // slow sway
    p.x += sin(uTime * 0.9 + ph) * 0.02;
    vec4 wp = modelMatrix * instanceMatrix * vec4(p, 1.0);
    vec3 n = normalize(mat3(modelMatrix * instanceMatrix) * normal);
    vec3 teamCol = mix(vec3(0.21, 0.91, 1.0), vec3(1.0, 0.31, 0.64), aTeam);
    float lit = 0.45 + 0.55 * max(0.0, dot(n, normalize(vec3(0.2, 1.0, 0.3))));
    float rim = pow(1.0 - abs(n.y), 2.0) * 0.25;
    vPart = aPart; vLight = 0.0;
    if (aPart < 0.5) vColor = aShirt * lit + teamCol * rim;
    else if (aPart < 1.5) vColor = vec3(0.98, 0.8, 0.68) * (0.35 + 0.4 * lit);
    else if (aPart < 2.5) vColor = aShirt * lit * 0.9;
    else if (aPart < 3.5) { vColor = teamCol * (1.4 + hype * 1.2 + pop); vLight = 1.0; }
    else vColor = vec3(0.08, 0.07, 0.12) + teamCol * 0.05;
    vec4 mvPosition = viewMatrix * wp;
    gl_Position = projectionMatrix * mvPosition;
    #include <fog_vertex>
  }`;
const frag = /* glsl */`
  varying vec3 vColor; varying float vPart; varying float vLight;
  #include <fog_pars_fragment>
  void main(){
    gl_FragColor = vec4(vColor, 1.0);
    #include <fog_fragment>
    if (vLight > 0.5) gl_FragColor.rgb = max(gl_FragColor.rgb, vColor * 0.7);
  }`;

export class Crowd {
  constructor(scene, seats, density = 1) {
    const geo = personGeometry();
    const list = density >= 1 ? seats : seats.filter(() => Math.random() < density);
    const n = list.length;
    this.count = n;
    const phase = new Float32Array(n), team = new Float32Array(n), shirt = new Float32Array(n * 3);
    const shirtsC = [[0.12, 0.2, 0.36], [0.16, 0.3, 0.5], [0.1, 0.14, 0.26], [0.85, 0.9, 0.96], [0.08, 0.35, 0.45]];
    const shirtsP = [[0.34, 0.12, 0.3], [0.5, 0.16, 0.36], [0.2, 0.1, 0.24], [0.9, 0.86, 0.92], [0.42, 0.1, 0.25]];
    this.mat = new THREE.ShaderMaterial({
      vertexShader: vert, fragmentShader: frag, fog: true,
      uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { uTime: { value: 0 }, uHype: { value: new THREE.Vector2() }, uPop: { value: new THREE.Vector2() } }]),
    });
    const mesh = new THREE.InstancedMesh(geo, this.mat, n);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3();
    for (let i = 0; i < n; i++) {
      const st = list[i];
      const sc = 0.92 + Math.random() * 0.18;
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), st.yaw + (Math.random() - 0.5) * 0.3);
      s.set(sc, sc, sc);
      m.compose(new THREE.Vector3(st.x, st.y, st.z), q, s);
      mesh.setMatrixAt(i, m);
      phase[i] = Math.random(); team[i] = st.team === 'pink' ? 1 : 0;
      const pal = st.team === 'pink' ? shirtsP : shirtsC; const c = pal[(Math.random() * pal.length) | 0];
      shirt.set(c, i * 3);
    }
    geo.setAttribute('aPhase', new THREE.InstancedBufferAttribute(phase, 1));
    geo.setAttribute('aTeam', new THREE.InstancedBufferAttribute(team, 1));
    geo.setAttribute('aShirt', new THREE.InstancedBufferAttribute(shirt, 3));
    mesh.frustumCulled = false;
    scene.add(mesh);
    this.mesh = mesh;
    this.hype = { cyan: 0.15, pink: 0.15 }; this.pop = { cyan: 0, pink: 0 };
  }
  /** Big cheer for a team (goal) — the other side deflates. */
  cheer(team, amount = 1) { this.hype[team] = Math.max(this.hype[team], amount); const o = team === 'cyan' ? 'pink' : 'cyan'; this.hype[o] = Math.min(this.hype[o], 0.02); }
  /** Short pop (keeper save, nice shot). */
  popFor(team, amount = 1) { this.pop[team] = Math.max(this.pop[team], amount); }
  update(dt, t, base = 0.15) {
    for (const k of ['cyan', 'pink']) {
      this.hype[k] += (base - this.hype[k]) * Math.min(1, dt * 0.45);
      this.pop[k] = Math.max(0, this.pop[k] - dt * 1.6);
    }
    const u = this.mat.uniforms;
    u.uTime.value = t; u.uHype.value.set(this.hype.cyan, this.hype.pink); u.uPop.value.set(this.pop.cyan, this.pop.pink);
  }
}
