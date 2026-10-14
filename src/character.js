// CharacterRenderer + AnimationController for 3D anime characters (CPU and goalkeepers).
// Built from smooth primitives with toon shading + outlines. Faces are painted canvas
// textures mapped to the front of a deformed head sphere, with 5 expression variants.
import * as THREE from 'three';
import { toon, addOutlines, glowMat, skinMat } from './toon.js';
import { FACE_PATCH, makeFaceTextures } from './faces.js';
import { bakeRigid } from './bake.js';

const R = 0.15; // head radius

// Pointed anime chin: narrow + elongate the lower half of the head.
function deformHead(geo, scale = 1) {
  const p = geo.attributes.position, v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const ny = v.y / (R * scale);
    if (ny < 0.15) {
      const k = THREE.MathUtils.smoothstep(-ny, -0.15, 1.0); // 0 at ny=0.15 → 1 at chin
      v.x *= 1 - 0.36 * k;
      v.z *= v.z > 0 ? 1 - 0.08 * k : 1 - 0.3 * k;
      v.y *= 1 + 0.05 * k;
    }
    v.z *= v.z < 0 ? 0.94 : 1.0;
    p.setXYZ(i, v.x, v.y, v.z);
  }
  geo.computeVertexNormals();
  return geo;
}

function capsule(r, len, mat, seg = 10) {
  const m = new THREE.Mesh(new THREE.CapsuleGeometry(r, len, 4, seg), mat);
  return m;
}

/** cone spike between two points (hair strands) */
function spike(from, to, radius, mat) {
  const dir = new THREE.Vector3().subVectors(to, from);
  const h = dir.length();
  const g = new THREE.ConeGeometry(radius, h, 5, 1);
  const m = new THREE.Mesh(g, mat);
  m.position.copy(from).addScaledVector(dir, 0.5);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
  return m;
}
function sph(r, theta, phi) { // point on head sphere (phi measured like SphereGeometry: front = PI/2)
  return new THREE.Vector3(-r * Math.cos(phi) * Math.sin(theta), r * Math.cos(theta), r * Math.sin(phi) * Math.sin(theta));
}

function buildHair(style, hairMat, hiMat) {
  const g = new THREE.Group();
  const F = Math.PI / 2; // front
  // Cap over the top
  const cap = new THREE.Mesh(new THREE.SphereGeometry(R * 1.09, 28, 14, 0, Math.PI * 2, 0, 1.22), hairMat);
  cap.position.y = 0.006; g.add(cap);
  // Back / sides down to the nape
  const back = new THREE.Mesh(new THREE.SphereGeometry(R * 1.07, 24, 14, F + 1.05, Math.PI * 2 - 2.1, 1.0, 1.35), hairMat);
  g.add(back);
  // Angel-ring highlight
  const ring = new THREE.Mesh(new THREE.TorusGeometry(R * 1.02, 0.008, 4, 28, Math.PI * 1.1), hiMat);
  ring.rotation.x = Math.PI / 2 - 0.55; ring.rotation.z = Math.PI * 0.95; ring.position.set(0, R * 0.62, -0.01);
  ring.userData.noOutline = true; g.add(ring);
  // Bangs (front) — tips stop above the brows except the centre lock
  const bangs = [-3, -2, -1, 0, 1, 2, 3];
  for (const i of bangs) {
    const phi = F + i * 0.26;
    const tipT = i === 0 ? 1.43 : (Math.abs(i) % 2 ? 1.27 : 1.33);
    const base = sph(R * 1.1, 0.72, phi);
    const tip = sph(R * 1.085, tipT, phi + (i === 0 ? 0 : -Math.sign(i) * 0.06) + (style === 'swept' ? 0.18 : 0));
    g.add(spike(base, tip, 0.05, hairMat));
  }
  // Side locks
  for (const s of [-1, 1]) {
    const base = sph(R * 1.08, 1.1, F + s * 1.18);
    const tip = sph(R * 1.04, 2.3, F + s * 1.0);
    tip.y -= 0.02;
    g.add(spike(base, tip, 0.045, hairMat));
    const base2 = sph(R * 1.08, 1.2, F + s * 1.45);
    const tip2 = sph(R * 1.0, 2.15, F + s * 1.5);
    g.add(spike(base2, tip2, 0.05, hairMat));
  }
  if (style === 'spiky' || style === 'swept') {
    // Crown spikes for a sharp silhouette
    const n = 7;
    for (let i = 0; i < n; i++) {
      const phi = F + Math.PI + (i - (n - 1) / 2) * 0.42;
      const base = sph(R * 0.95, 0.55 + (i % 2) * 0.12, phi);
      const out = sph(R * 1.65, 1.0 + (i % 2) * 0.25, phi);
      out.y += 0.05;
      g.add(spike(base, out, 0.062, hairMat));
    }
    const top = spike(sph(R * 0.9, 0.2, F + 0.3), sph(R * 1.5, 0.55, F - 0.2).add(new THREE.Vector3(0, 0.04, 0)), 0.06, hairMat);
    g.add(top);
  }
  if (style === 'ponytail') {
    const tie = new THREE.Mesh(new THREE.TorusGeometry(0.03, 0.012, 6, 12), hiMat);
    tie.position.set(0, R * 0.55, -R * 1.0); tie.rotation.x = 0.6; g.add(tie);
    const tieBase = new THREE.Vector3(0, R * 0.55, -R * 1.05);
    for (let i = 0; i < 4; i++) {
      const tip = new THREE.Vector3((i - 1.5) * 0.04, -0.2 - (i % 2) * 0.06, -R * 1.9 - (i % 2) * 0.04);
      g.add(spike(tieBase, tip, 0.06 - i * 0.004, hairMat));
    }
    // crown volume
    for (let i = 0; i < 5; i++) {
      const phi = F + Math.PI + (i - 2) * 0.5;
      g.add(spike(sph(R * 0.9, 0.5, phi), sph(R * 1.32, 1.05, phi), 0.06, hairMat));
    }
  }
  return g;
}

function buildHand(gloveMat, accentMat) {
  const hand = new THREE.Group();
  const palm = new THREE.Mesh(new THREE.CapsuleGeometry(0.04, 0.03, 3, 8), gloveMat);
  palm.scale.set(1.15, 1, 0.65); palm.position.y = -0.045; hand.add(palm);
  const fingers = new THREE.Group(); fingers.position.y = -0.085; hand.add(fingers);
  const fm = new THREE.Mesh(new THREE.CapsuleGeometry(0.036, 0.035, 3, 8), gloveMat);
  fm.scale.set(1.2, 1, 0.55); fm.position.y = -0.03; fingers.add(fm);
  const thumb = new THREE.Mesh(new THREE.CapsuleGeometry(0.016, 0.035, 3, 6), gloveMat);
  thumb.position.set(0.04, -0.045, 0.02); thumb.rotation.z = 0.6; hand.add(thumb);
  const cuff = new THREE.Mesh(new THREE.CylinderGeometry(0.052, 0.05, 0.05, 10), accentMat);
  cuff.position.y = 0.0; hand.add(cuff);
  hand.userData.fingers = fingers; hand.userData.thumb = thumb;
  return hand;
}

// ---------------------------------------------------------------------------
// Poses (radians). sh*: [x(flex: - = forward), y, z(abduction)] el*: elbow flex (negative = bend)
// L = character's left (+x side), R = character's right (-x side). Abduction: L +z, R -z.
const POSES = {
  idle:      { spine: [0.04, 0, 0], head: [0, 0, 0], shL: [0.05, 0, 0.14], elL: -0.3, shR: [0.05, 0, -0.14], elR: -0.3,
               hipL: [0, 0, 0.05], kneeL: 0.08, hipR: [0, 0, -0.05], kneeR: 0.08, open: 0.2 },
  run:       { spine: [0.18, 0, 0], head: [-0.1, 0, 0], shL: [0, 0, 0.18], elL: -1.25, shR: [0, 0, -0.18], elR: -1.25,
               hipL: [0, 0, 0.04], kneeL: 0.3, hipR: [0, 0, -0.04], kneeR: 0.3, open: 0 },
  hold:      { spine: [0.1, 0, 0], head: [0, 0, 0], shL: [-0.2, 0, 0.2], elL: -0.6, shR: [-0.55, 0, -0.32], elR: -1.45,
               hipL: [0, 0, 0.06], kneeL: 0.15, hipR: [0, 0, -0.06], kneeR: 0.15, open: 0 },
  windup:    { spine: [0.12, -0.55, 0], head: [0, 0.45, 0], shL: [-0.9, 0, 0.35], elL: -0.5, shR: [0.5, 0, -1.25], elR: -1.0,
               hipL: [-0.1, 0, 0.1], kneeL: 0.3, hipR: [0.1, 0, -0.08], kneeR: 0.25, open: 0 },
  throw:     { spine: [0.2, 0.45, 0], head: [0, -0.3, 0], shL: [0.2, 0, 0.5], elL: -0.6, shR: [-1.55, 0, -0.35], elR: -0.08,
               hipL: [0.1, 0, 0.08], kneeL: 0.2, hipR: [-0.35, 0, -0.06], kneeR: 0.4, open: 0.9 },
  follow:    { spine: [0.24, 0.65, 0], head: [0, -0.4, 0], shL: [0.3, 0, 0.45], elL: -0.7, shR: [-1.05, 0, 0.55], elR: -0.55,
               hipL: [0.1, 0, 0.08], kneeL: 0.25, hipR: [-0.3, 0, -0.06], kneeR: 0.35, open: 0.7 },
  catch:     { spine: [0.08, 0, 0], head: [-0.12, 0, 0], shL: [-1.35, 0, 0.28], elL: -0.35, shR: [-1.35, 0, -0.28], elR: -0.35,
               hipL: [-0.1, 0, 0.1], kneeL: 0.3, hipR: [-0.1, 0, -0.1], kneeR: 0.3, open: 1 },
  jump:      { spine: [0.05, 0, 0], head: [-0.1, 0, 0], shL: [-0.7, 0, 0.95], elL: -0.5, shR: [-0.7, 0, -0.95], elR: -0.5,
               hipL: [-1.0, 0, 0.1], kneeL: 1.5, hipR: [-0.35, 0, -0.1], kneeR: 0.7, open: 0.6 },
  dash:      { spine: [0.5, 0, 0], head: [-0.4, 0, 0], shL: [0.75, 0, 0.25], elL: -0.45, shR: [0.75, 0, -0.25], elR: -0.45,
               hipL: [-0.8, 0, 0.05], kneeL: 0.9, hipR: [0.5, 0, -0.05], kneeR: 0.6, open: 0 },
  keeper:    { spine: [0.12, 0, 0], head: [-0.1, 0, 0], shL: [-0.15, 0, 2.72], elL: -0.08, shR: [-0.15, 0, -2.72], elR: -0.08, // v2.6: 'Y' stance, hands guard the upper middle
               hipL: [-0.55, 0, 0.42], kneeL: 0.95, hipR: [-0.55, 0, -0.42], kneeR: 0.95, open: 1 },
  saveL:     { spine: [0.1, 0, 0.42], head: [0, 0, 0.2], shL: [-0.3, 0, 2.55], elL: -0.05, shR: [-0.4, 0, -1.5], elR: -0.3,
               hipL: [-0.4, 0, 0.75], kneeL: 0.45, hipR: [-0.7, 0, -0.2], kneeR: 1.25, open: 1 },
  saveR:     { spine: [0.1, 0, -0.42], head: [0, 0, -0.2], shL: [-0.4, 0, 1.5], elL: -0.3, shR: [-0.3, 0, -2.55], elR: -0.05,
               hipL: [-0.7, 0, 0.2], kneeL: 1.25, hipR: [-0.4, 0, -0.75], kneeR: 0.45, open: 1 },
  conceded:  { spine: [0.5, 0, 0], head: [0.45, 0, 0], shL: [0.05, 0, 0.06], elL: -0.15, shR: [0.05, 0, -0.06], elR: -0.15,
               hipL: [-0.2, 0, 0.05], kneeL: 0.45, hipR: [-0.2, 0, -0.05], kneeR: 0.45, open: 0.1 },
  celebrate: { spine: [-0.15, 0, 0], head: [-0.35, 0, 0], shL: [-0.4, 0, 0.7], elL: -1.6, shR: [-0.1, 0, -2.95], elR: -0.15,
               hipL: [0, 0, 0.12], kneeL: 0.1, hipR: [0, 0, -0.12], kneeR: 0.1, open: 0 },
};
const VEC_KEYS = ['spine', 'head', 'shL', 'shR', 'hipL', 'hipR'];
const NUM_KEYS = ['elL', 'elR', 'kneeL', 'kneeR', 'open'];
// Joint limits (anti-twist / anti-hyperextension)
const LIMITS = { elL: [-2.4, 0], elR: [-2.4, 0], kneeL: [0, 2.3], kneeR: [0, 2.3] };

function clonePose(p) {
  const o = {};
  for (const k of VEC_KEYS) o[k] = p[k].slice();
  for (const k of NUM_KEYS) o[k] = p[k];
  return o;
}

export class AnimeCharacter {
  /**
   * @param {object} o  { pal (face palette), hair, hairHi, hairStyle, suit, accent, accentEmissive, white, glove }
   */
  constructor(o) {
    this.root = new THREE.Group();
    this.expr = 'normal';
    this.exprTimer = 0;
    this.poseName = o.basePose || 'idle';
    this.basePose = o.basePose || 'idle';
    this.overridePose = null; this.overrideTimer = 0; this.overrideSpeed = 14;
    this.cur = clonePose(POSES[this.poseName]);
    this.runPhase = Math.random() * 6;
    this.speed = 0; this.airborne = false;

    const skin = skinMat(0xffdcc8);
    const suit = toon(o.suit);
    const white = toon(o.white ?? 0xe9eef6);
    const accent = toon(o.accent, o.accent, o.accentEmissive ?? 0.55);
    const glove = toon(o.glove ?? 0x161a24);
    const hairMat = toon(o.hair, o.hair, 0.08);
    const hiMat = toon(o.hairHi, o.hairHi, 0.35);
    this.accentMat = accent;

    const J = this.j = {};
    J.hips = new THREE.Group(); J.hips.position.y = 0.95; this.root.add(J.hips);
    // pelvis / shorts
    const pelvis = capsule(0.13, 0.08, suit); pelvis.rotation.z = Math.PI / 2; pelvis.scale.set(1, 1.05, 0.85); pelvis.position.y = -0.02; J.hips.add(pelvis);
    const belt = new THREE.Mesh(new THREE.CylinderGeometry(0.155, 0.15, 0.05, 14), accent); belt.scale.z = 0.78; belt.position.y = 0.06; belt.userData.noOutline = true; J.hips.add(belt);

    J.spine = new THREE.Group(); J.spine.position.y = 0.06; J.hips.add(J.spine);
    const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.135, 0.4, 14, 1), suit);
    torso.scale.z = 0.72; torso.position.y = 0.24; J.spine.add(torso);
    const chest = new THREE.Mesh(new THREE.SphereGeometry(0.17, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), suit);
    chest.scale.set(1, 0.45, 0.72); chest.position.y = 0.44; J.spine.add(chest);
    // white jacket panels + team stripe
    const panel = new THREE.Mesh(new THREE.CylinderGeometry(0.172, 0.138, 0.3, 14, 1, true, -0.9, 1.8), white);
    panel.scale.z = 0.74; panel.position.y = 0.26; J.spine.add(panel);
    const stripe = new THREE.Mesh(new THREE.CylinderGeometry(0.175, 0.16, 0.035, 14, 1, true), accent);
    stripe.scale.z = 0.75; stripe.position.y = 0.33; stripe.userData.noOutline = true; J.spine.add(stripe);
    const emblem = new THREE.Mesh(new THREE.CircleGeometry(0.035, 3), glowMat(o.accent));
    emblem.position.set(0.07, 0.36, 0.128); emblem.rotation.z = Math.PI / 2; emblem.userData.noOutline = true; J.spine.add(emblem);
    const collar = new THREE.Mesh(new THREE.TorusGeometry(0.075, 0.025, 6, 14), white);
    collar.rotation.x = Math.PI / 2; collar.position.y = 0.5; J.spine.add(collar);
    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.055, 0.1, 8), skin); neck.position.y = 0.54; J.spine.add(neck);

    // Head
    J.head = new THREE.Group(); J.head.position.y = 0.57 + R * 0.92; J.spine.add(J.head);
    const head = new THREE.Mesh(deformHead(new THREE.SphereGeometry(R, 32, 24)), skin);
    J.head.add(head);
    for (const s of [-1, 1]) {
      const ear = new THREE.Mesh(new THREE.SphereGeometry(0.03, 8, 6), skin); ear.scale.set(0.5, 1, 0.8);
      ear.position.set(s * R * 0.97, -0.01, -0.005); J.head.add(ear);
    }
    const { a, t0, t1 } = FACE_PATCH;
    this.faceTex = makeFaceTextures(o.pal);
    this.faceMat = new THREE.MeshBasicMaterial({ map: this.faceTex.normal, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    const faceGeo = new THREE.SphereGeometry(R * 1.006, 40, 26, Math.PI / 2 - a, 2 * a, t0, t1 - t0);
    // Scale R so deform keys off the same normalized height as the head
    deformHead(faceGeo, 1.006);
    const face = new THREE.Mesh(faceGeo, this.faceMat); face.userData.noOutline = true; face.renderOrder = 2;
    J.head.add(face);
    J.head.add(buildHair(o.hairStyle || 'spiky', hairMat, hiMat));

    // Arms
    for (const [side, key] of [[1, 'L'], [-1, 'R']]) {
      const sh = new THREE.Group(); sh.position.set(side * 0.2, 0.46, 0); J.spine.add(sh);
      const pad = new THREE.Mesh(new THREE.SphereGeometry(0.058, 12, 8), white); pad.scale.set(1.05, 0.85, 1); sh.add(pad);
      const upper = capsule(0.052, 0.2, suit); upper.position.y = -0.14; sh.add(upper);
      const band = new THREE.Mesh(new THREE.CylinderGeometry(0.058, 0.058, 0.035, 10), accent); band.position.y = -0.12; band.userData.noOutline = true; sh.add(band);
      const el = new THREE.Group(); el.position.y = -0.29; sh.add(el);
      const fore = capsule(0.046, 0.17, suit); fore.position.y = -0.12; el.add(fore);
      const guard = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.1, 0.04), accent); guard.position.set(0, -0.13, 0.04); guard.userData.noOutline = true; el.add(guard);
      const hand = buildHand(glove, accent); hand.position.y = -0.27; el.add(hand);
      J['sh' + key] = sh; J['el' + key] = el; J['hand' + key] = hand;
    }
    // Legs
    for (const [side, key] of [[1, 'L'], [-1, 'R']]) {
      const hip = new THREE.Group(); hip.position.set(side * 0.095, -0.03, 0); J.hips.add(hip);
      const thigh = capsule(0.072, 0.28, suit); thigh.position.y = -0.21; hip.add(thigh);
      const knee = new THREE.Group(); knee.position.y = -0.44; hip.add(knee);
      const pad = new THREE.Mesh(new THREE.SphereGeometry(0.06, 10, 8), accent); pad.scale.set(1, 1, 0.8); pad.position.set(0, 0, 0.04); pad.userData.noOutline = true; knee.add(pad);
      const shin = capsule(0.06, 0.28, suit); shin.position.y = -0.2; knee.add(shin);
      const shoe = new THREE.Mesh(new THREE.CapsuleGeometry(0.055, 0.14, 3, 8), glove);
      shoe.rotation.x = Math.PI / 2; shoe.scale.set(1.05, 1, 0.75); shoe.position.set(0, -0.44, 0.045); shoe.userData.keep = true; knee.add(shoe);
      const sole = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.02, 0.25), accent); sole.position.set(0, -0.475, 0.045); sole.userData.noOutline = true; knee.add(sole);
      J['hip' + key] = hip; J['knee' + key] = knee; J['foot' + key] = shoe;
    }
    // Hand attach point for a held disc
    this.discSocket = new THREE.Object3D(); this.discSocket.position.set(0, -0.12, 0.05); J.handR.add(this.discSocket);

    bakeRigid(this.root);
    addOutlines(this.root, 0x0a0d1a, 0.006);
    this.root.traverse(o2 => { if (o2.isMesh) o2.frustumCulled = true; });
    this._tmp = new THREE.Vector3();
  }

  setExpression(name, hold = 0) {
    if (!this.faceTex[name]) name = 'normal';
    this.expr = name; this.exprTimer = hold;
    this.faceMat.map = this.faceTex[name];
  }
  setBase(name) { this.basePose = name; }
  /** One-shot pose that overrides the base for `time` seconds. */
  play(name, time = 0.4, speed = 16) { this.overridePose = name; this.overrideTimer = time; this.overrideSpeed = speed; }

  update(dt, { speed = 0, airborne = false } = {}) {
    this.speed = speed; this.airborne = airborne;
    if (this.exprTimer > 0) { this.exprTimer -= dt; if (this.exprTimer <= 0) this.setExpression('normal'); }
    // Blink every 2.5–5.5 s while the eyes are relaxed (normal expression only)
    this.blinkT = (this.blinkT ?? 1 + Math.random() * 3) - dt;
    if (this.expr === 'normal') {
      if (this.blinkT <= 0) { this.faceMat.map = this.faceTex.blink; if (this.blinkT < -0.12) { this.faceMat.map = this.faceTex.normal; this.blinkT = 2.5 + Math.random() * 3; } }
    } else if (this.blinkT <= 0) this.blinkT = 1 + Math.random() * 2;
    let target, k = 12;
    if (this.overrideTimer > 0) {
      this.overrideTimer -= dt; target = POSES[this.overridePose]; k = this.overrideSpeed;
      if (this.overrideTimer <= 0) this.overridePose = null;
    } else if (airborne) target = POSES.jump;
    else if (speed > 0.8 && (this.basePose === 'idle' || this.basePose === 'hold')) target = POSES[this.basePose === 'hold' ? 'hold' : 'run'];
    else target = POSES[this.basePose];
    const f = 1 - Math.exp(-k * dt);
    const c = this.cur;
    for (const key of VEC_KEYS) for (let i = 0; i < 3; i++) c[key][i] += (target[key][i] - c[key][i]) * f;
    for (const key of NUM_KEYS) c[key] += (target[key] - c[key]) * f;

    // Procedural run cycle layered on top
    const J = this.j;
    let swing = 0;
    if (!airborne && speed > 0.8 && !this.overridePose) {
      this.runPhase += dt * (6 + speed * 1.1);
      swing = Math.min(1, speed / 6);
    }
    const s = Math.sin(this.runPhase) * swing, s2 = Math.cos(this.runPhase) * swing;
    const keeperShuffle = this.basePose === 'keeper' && !this.overridePose ? Math.sin(this.runPhase * 1.0) * Math.min(1, speed / 2) : 0;
    if (this.basePose === 'keeper') this.runPhase += dt * speed * 3.2;

    J.spine.rotation.set(c.spine[0], c.spine[1] + s * 0.12, c.spine[2]);
    J.head.rotation.set(c.head[0], c.head[1] - s * 0.1, c.head[2]);
    const isHoldRun = this.basePose === 'hold';
    J.shL.rotation.set(c.shL[0] + s * 0.75, c.shL[1], c.shL[2]);
    J.shR.rotation.set(c.shR[0] - (isHoldRun ? 0 : s * 0.75), c.shR[1], c.shR[2]);
    J.elL.rotation.x = THREE.MathUtils.clamp(c.elL, ...LIMITS.elL);
    J.elR.rotation.x = THREE.MathUtils.clamp(c.elR, ...LIMITS.elR);
    J.hipL.rotation.set(c.hipL[0] - s * 0.85, c.hipL[1], c.hipL[2] + keeperShuffle * 0.12);
    J.hipR.rotation.set(c.hipR[0] + s * 0.85, c.hipR[1], c.hipR[2] + keeperShuffle * 0.12);
    J.kneeL.rotation.x = THREE.MathUtils.clamp(c.kneeL + Math.max(0, s2) * 1.1 * swing, ...LIMITS.kneeL);
    J.kneeR.rotation.x = THREE.MathUtils.clamp(c.kneeR + Math.max(0, -s2) * 1.1 * swing, ...LIMITS.kneeR);
    for (const key of ['L', 'R']) {
      const fingers = J['hand' + key].userData.fingers;
      fingers.rotation.x = (1 - c.open) * -1.3;
    }
    // Ground snap: lowest foot touches y=0 (unless airborne, then legs just tuck)
    J.hips.position.y = 0.95;
    this.root.updateMatrixWorld(true);
    if (!airborne) {
      const yl = J.footL.getWorldPosition(this._tmp).y;
      const yr = J.footR.getWorldPosition(this._tmp).y;
      const rootY = this.root.getWorldPosition(this._tmp).y;
      const minFoot = Math.min(yl, yr) - rootY;
      J.hips.position.y += 0.055 - minFoot;
      this.root.updateMatrixWorld(true);
    }
  }
}

export const PALETTES = {
  keeperCyan: { skin: '#ffe0cf', iris: '#2fd8ff', irisDark: '#0b3f8a', irisLight: '#b8fbff', lash: '#141629', brow: '#9aa6b8', mouthLine: '#6b2a36', mouthIn: '#8a2238' },
  keeperPink: { skin: '#ffe0cf', iris: '#ff5fae', irisDark: '#6a1050', irisLight: '#ffd0ea', lash: '#141629', brow: '#1d2140', mouthLine: '#6b2a36', mouthIn: '#8a2238' },
  cpu:        { skin: '#ffe3d4', iris: '#ff4f9a', irisDark: '#57104a', irisLight: '#ffc6e6', lash: '#15112a', brow: '#3a1f4a', mouthLine: '#6b2a36', mouthIn: '#8a2238' },
  player:     { skin: '#ffe0cf', iris: '#3fe6ff', irisDark: '#0d3a7a', irisLight: '#c4fbff', lash: '#121426', brow: '#151a33', mouthLine: '#6b2a36', mouthIn: '#8a2238' },
};

export { POSES };
