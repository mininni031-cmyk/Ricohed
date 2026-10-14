// Lightweight effects: pooled spark particles (one Points draw call), pooled shock rings,
// and a ribbon trail for the disc (fixed-size buffer, no per-frame allocation).
import * as THREE from 'three';

function dotTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.25, 'rgba(255,255,255,0.85)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c); return t;
}

export class Sparks {
  constructor(scene, max = 600) {
    this.max = max; this.alive = 0;
    const geo = new THREE.BufferGeometry();
    this.pos = new Float32Array(max * 3); this.col = new Float32Array(max * 3); this.size = new Float32Array(max); this.alpha = new Float32Array(max);
    this.vel = new Float32Array(max * 3); this.life = new Float32Array(max); this.maxLife = new Float32Array(max); this.grav = new Float32Array(max);
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('color', new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('size', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('alpha', new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage));
    this.geo = geo;
    const mat = new THREE.ShaderMaterial({
      uniforms: { uTex: { value: dotTexture() }, uScale: { value: 400 } },
      vertexShader: `attribute float size; attribute float alpha; attribute vec3 color; varying vec3 vC; varying float vA; uniform float uScale;
        void main(){ vC=color; vA=alpha; vec4 mv=modelViewMatrix*vec4(position,1.); gl_PointSize=size*uScale/max(0.5,-mv.z); gl_Position=projectionMatrix*mv; }`,
      fragmentShader: `uniform sampler2D uTex; varying vec3 vC; varying float vA; void main(){ vec4 t=texture2D(uTex,gl_PointCoord); gl_FragColor=vec4(vC*t.rgb, t.a*vA); }`,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    });
    this.mat = mat;
    this.points = new THREE.Points(geo, mat); this.points.frustumCulled = false;
    scene.add(this.points);
    geo.setDrawRange(0, 0);
  }
  setScale(h) { this.mat.uniforms.uScale.value = h * 0.55; }
  burst(p, color, count = 20, speed = 6, size = 0.12, life = 0.5, gravity = 6, normal = null) {
    const c = new THREE.Color(color);
    for (let k = 0; k < count; k++) {
      if (this.alive >= this.max) return;
      const i = this.alive++;
      this.pos.set([p.x, p.y, p.z], i * 3);
      let vx = Math.random() * 2 - 1, vy = Math.random() * 2 - 1, vz = Math.random() * 2 - 1;
      const l = Math.hypot(vx, vy, vz) || 1; vx /= l; vy /= l; vz /= l;
      if (normal) { const d = vx * normal.x + vy * normal.y + vz * normal.z; if (d < 0) { vx -= 2 * d * normal.x; vy -= 2 * d * normal.y; vz -= 2 * d * normal.z; } }
      const sp = speed * (0.35 + Math.random() * 0.65);
      this.vel.set([vx * sp, vy * sp, vz * sp], i * 3);
      this.col.set([c.r, c.g, c.b], i * 3);
      this.size[i] = size * (0.6 + Math.random() * 0.8);
      this.life[i] = this.maxLife[i] = life * (0.6 + Math.random() * 0.6);
      this.grav[i] = gravity; this.alpha[i] = 1;
    }
  }
  update(dt) {
    let i = 0;
    while (i < this.alive) {
      this.life[i] -= dt;
      if (this.life[i] <= 0) {
        // swap-remove with the last particle
        const j = --this.alive;
        if (i !== j) {
          for (const arr of [this.pos, this.vel, this.col]) { arr[i * 3] = arr[j * 3]; arr[i * 3 + 1] = arr[j * 3 + 1]; arr[i * 3 + 2] = arr[j * 3 + 2]; }
          for (const arr of [this.size, this.life, this.maxLife, this.grav, this.alpha]) arr[i] = arr[j];
        }
        continue;
      }
      this.vel[i * 3 + 1] -= this.grav[i] * dt;
      const drag = Math.exp(-2.5 * dt);
      for (let k = 0; k < 3; k++) { this.vel[i * 3 + k] *= drag; this.pos[i * 3 + k] += this.vel[i * 3 + k] * dt; }
      this.alpha[i] = Math.min(1, this.life[i] / this.maxLife[i] * 1.6);
      i++;
    }
    const g = this.geo;
    g.setDrawRange(0, this.alive);
    for (const k of ['position', 'color', 'size', 'alpha']) g.attributes[k].needsUpdate = true;
  }
  clear() { this.alive = 0; this.geo.setDrawRange(0, 0); }
}

export class Rings {
  constructor(scene, n = 10) {
    this.pool = [];
    const geo = new THREE.RingGeometry(0.82, 1.0, 40);
    for (let i = 0; i < n; i++) {
      const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, toneMapped: false }));
      m.visible = false; scene.add(m); this.pool.push({ m, t: 0, life: 0, max: 1 });
    }
  }
  spawn(p, normal, color, maxScale = 1.5, life = 0.35) {
    const r = this.pool.find(r => r.t >= r.life) || this.pool[0];
    r.m.position.copy(p); r.m.visible = true; r.t = 0; r.life = life; r.max = maxScale;
    r.m.material.color.set(color);
    r.m.lookAt(p.x + normal.x, p.y + normal.y, p.z + normal.z);
  }
  update(dt) {
    for (const r of this.pool) {
      if (r.t >= r.life) { r.m.visible = false; continue; }
      r.t += dt; const k = Math.min(1, r.t / r.life);
      r.m.scale.setScalar(0.15 + r.max * (1 - (1 - k) * (1 - k)));
      r.m.material.opacity = (1 - k) * 0.95;
    }
  }
}

export class Trail {
  constructor(scene, n = 28, width = 0.32) {
    this.n = n; this.width = width; this.count = 0; this.alpha = 0.95;
    this.points = Array.from({ length: n }, () => new THREE.Vector3());
    const geo = new THREE.BufferGeometry();
    this.pos = new Float32Array(n * 2 * 3); this.col = new Float32Array(n * 2 * 4);
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('color', new THREE.BufferAttribute(this.col, 4).setUsage(THREE.DynamicDrawUsage));
    const idx = [];
    for (let i = 0; i < n - 1; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    geo.setIndex(idx);
    this.geo = geo;
    this.mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, toneMapped: false }));
    this.mesh.frustumCulled = false; scene.add(this.mesh);
    this.color = new THREE.Color(0x35e8ff);
    this._side = new THREE.Vector3(); this._dir = new THREE.Vector3(); this._view = new THREE.Vector3();
  }
  reset() { this.count = 0; this.geo.setDrawRange(0, 0); }
  push(p) {
    for (let i = this.n - 1; i > 0; i--) this.points[i].copy(this.points[i - 1]);
    this.points[0].copy(p);
    this.count = Math.min(this.n, this.count + 1);
  }
  update(camPos) {
    const n = this.count;
    if (n < 2) { this.geo.setDrawRange(0, 0); return; }
    for (let i = 0; i < n; i++) {
      const p = this.points[i];
      const q = this.points[Math.min(n - 1, i + 1)], o = this.points[Math.max(0, i - 1)];
      this._dir.subVectors(o, q); if (this._dir.lengthSq() < 1e-6) this._dir.set(1, 0, 0);
      this._view.subVectors(camPos, p);
      this._side.crossVectors(this._dir, this._view).normalize();
      const k = 1 - i / (this.n - 1);
      const w = this.width * (0.15 + 0.85 * k);
      this.pos.set([p.x + this._side.x * w, p.y + this._side.y * w, p.z + this._side.z * w], i * 6);
      this.pos.set([p.x - this._side.x * w, p.y - this._side.y * w, p.z - this._side.z * w], i * 6 + 3);
      const a = Math.pow(k, 1.35) * this.alpha;
      const r = this.color.r + (1 - this.color.r) * k * 0.35, g = this.color.g + (1 - this.color.g) * k * 0.35, b = this.color.b + (1 - this.color.b) * k * 0.35;
      this.col.set([r, g, b, a, r, g, b, a], i * 8);
    }
    this.geo.setDrawRange(0, (n - 1) * 6);
    this.geo.attributes.position.needsUpdate = true; this.geo.attributes.color.needsUpdate = true;
  }
}

/** Readable light tail like the key art: a wide coloured glow ribbon + a thin white-hot core. */
export class DiscTrail {
  constructor(scene) {
    this.glow = new Trail(scene, 72, 0.42);
    this.core = new Trail(scene, 60, 0.08);
    this.core.color.set(0xffffff); this.core.alpha = 0.9;
    this.color = this.glow.color;
  }
  reset() { this.glow.reset(); this.core.reset(); }
  push(p) { this.glow.push(p); this.core.push(p); }
  update(cam) { this.glow.update(cam); this.core.update(cam); }
}
