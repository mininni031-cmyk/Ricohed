// FPS viewmodel arms (AnimationController for the player's arms).
// Rendered in a separate pass after the world with a cleared depth buffer, so the arms can
// never clip into walls, panels or characters. Bones point along -Z (camera forward).
import * as THREE from 'three';
import { toon, addOutlines, glowMat, skinMat } from './toon.js';
import { bakeRigid } from './bake.js';

const L_UP = 0.30, L_FORE = 0.27;

function seg(r, len, mat, seg = 10) {
  // capsule lying along -Z, starting at origin
  const m = new THREE.Mesh(new THREE.CapsuleGeometry(r, len, 4, seg), mat);
  m.rotation.x = Math.PI / 2; m.position.z = -len / 2;
  return m;
}

function buildArm(side, M) {
  const s = side; // -1 left (screen), +1 right
  const shoulder = new THREE.Group();
  // Upper arm: black inner sleeve with white outer plate
  const up = seg(0.05, L_UP - 0.06, M.black); shoulder.add(up);
  const upPlate = new THREE.Mesh(new THREE.CylinderGeometry(0.064, 0.06, 0.16, 12, 1, true, s > 0 ? -0.2 : Math.PI - 1.6, 1.8), M.white);
  upPlate.rotation.x = Math.PI / 2; upPlate.position.z = -0.12; shoulder.add(upPlate);
  const elbow = new THREE.Group(); elbow.position.z = -L_UP; shoulder.add(elbow);
  const elbowPad = new THREE.Mesh(new THREE.SphereGeometry(0.05, 12, 8), M.red); elbowPad.scale.set(1, 0.8, 0.9); elbow.add(elbowPad);
  // Forearm: tapered, white armguard with black segments, cyan light strip, red clasps
  const foreGeo = new THREE.CylinderGeometry(0.037, 0.047, L_FORE, 12);
  const fore = new THREE.Mesh(foreGeo, M.skin); fore.rotation.x = Math.PI / 2; fore.position.z = -L_FORE / 2; elbow.add(fore);
  const guard = new THREE.Mesh(new THREE.CylinderGeometry(0.041, 0.05, 0.2, 12, 1, false), M.white);
  guard.rotation.x = Math.PI / 2; guard.position.z = -0.13; elbow.add(guard);
  for (const z of [-0.06, -0.2]) {
    const ring = new THREE.Mesh(new THREE.CylinderGeometry(z < -0.1 ? 0.048 : 0.055, z < -0.1 ? 0.048 : 0.055, 0.03, 12), M.black);
    ring.rotation.x = Math.PI / 2; ring.position.z = z; elbow.add(ring);
  }
  const strip = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.006, 0.15), M.cyanGlow);
  strip.position.set(s * 0.02, 0.06, -0.13); strip.userData.noOutline = true; elbow.add(strip);
  const clasp = new THREE.Mesh(new THREE.BoxGeometry(0.034, 0.012, 0.026), M.red);
  clasp.position.set(0, 0.05, -0.215); elbow.add(clasp);

  // Wrist + hand (fingerless sports glove)
  const wrist = new THREE.Group(); wrist.position.z = -L_FORE; wrist.scale.setScalar(1.12); elbow.add(wrist);
  const cuff = new THREE.Mesh(new THREE.CylinderGeometry(0.037, 0.04, 0.035, 12), M.red);
  cuff.rotation.x = Math.PI / 2; cuff.position.z = 0.0; wrist.add(cuff);
  const palm = new THREE.Mesh(new THREE.BoxGeometry(0.088, 0.032, 0.095), M.black);
  palm.position.z = -0.055; wrist.add(palm);
  const palmTop = new THREE.Mesh(new THREE.CapsuleGeometry(0.016, 0.07, 3, 8), M.black);
  palmTop.rotation.z = Math.PI / 2; palmTop.position.set(0, 0.006, -0.03); palmTop.scale.set(1, 1, 1.0); wrist.add(palmTop);
  const backPlate = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.012, 0.055), M.gray);
  backPlate.position.set(0, 0.021, -0.06); wrist.add(backPlate);
  if (s > 0) { // glowing triangle emblem on the right glove (reference image)
    const tri = new THREE.Mesh(new THREE.RingGeometry(0.012, 0.02, 3), M.cyanGlow);
    tri.rotation.x = -Math.PI / 2; tri.rotation.z = Math.PI / 2; tri.position.set(0, 0.028, -0.06); tri.userData.noOutline = true; wrist.add(tri);
  }
  const fingers = [];
  const fx = [-0.0315, -0.0108, 0.0108, 0.031];
  // slender anime fingers (index, middle, ring, little), a bit longer than before
  const lens = [[0.04, 0.03, 0.024], [0.044, 0.033, 0.026], [0.042, 0.031, 0.025], [0.033, 0.025, 0.02]];
  for (let i = 0; i < 4; i++) {
    const root = new THREE.Group(); root.position.set(fx[i] * s, 0, -0.1); wrist.add(root);
    let parent = root; const joints = [];
    for (let k = 0; k < 3; k++) {
      const j = new THREE.Group(); if (k > 0) j.position.z = -lens[i][k - 1]; parent.add(j);
      const mat = k < 1 ? M.black : M.skin; // fingerless glove: covers the first phalanx only
      const r = (i === 3 ? 0.0078 : 0.0086) - k * 0.0009;
      j.add(seg(r, Math.max(0.004, lens[i][k] - r * 2), mat, 6));
      joints.push(j); parent = j;
    }
    fingers.push(joints);
  }
  // Thumb (from the inner side of the palm)
  const tRoot = new THREE.Group(); tRoot.position.set(-s * 0.043, -0.006, -0.025); wrist.add(tRoot);
  const thumb = []; let tp = tRoot;
  for (let k = 0; k < 2; k++) {
    const j = new THREE.Group(); if (k > 0) j.position.z = -0.034; tp.add(j);
    j.add(seg(0.0105 - k * 0.001, k === 0 ? 0.016 : 0.012, k === 0 ? M.black : M.skin, 6)); thumb.push(j); tp = j;
  }
  const sock = new THREE.Object3D(); sock.position.set(0, -0.045, -0.085); wrist.add(sock);
  return { shoulder, elbow, wrist, fingers, thumb, tRoot, side: s, socket: sock };
}

// Poses are authored as IK targets in camera space (RIGHT arm; the left arm mirrors x unless given).
// w: wrist target, pole: elbow hint direction, wr: hand rotation relative to the forearm [pitch, yaw, roll]
const P = (w, wr, curl, spread, pole = [1, -1, 0.2]) => ({ w, wr, curl, spread, pole });
const M2 = (a) => ({ ...a, w: [-a.w[0], a.w[1], a.w[2]], wr: [a.wr[0], -a.wr[1], -a.wr[2]], pole: [-a.pole[0], a.pole[1], a.pole[2]] });
const R_ = {
  idle:   P([0.24, -0.22, -0.5], [0.3, 0.15, -0.35], 0.26, 0.55),
  hold:   P([0.25, -0.21, -0.45], [0.15, -0.25, -1.0], 0.75, 0.0),
  windup: P([0.06, -0.24, -0.36], [0.35, -0.6, -1.0], 0.75, 0.0, [1, -0.6, 0.6]),
  throw:  P([0.2, -0.1, -0.6], [0.0, 0.25, -0.2], 0.12, 0.7),
  follow: P([0.36, -0.16, -0.5], [-0.15, 0.45, 0.2], 0.3, 0.4),
  catch:  P([0.19, -0.07, -0.54], [1.2, 0.15, 0.0], 0.0, 1.0, [1, -1, 0]),
  jump:   P([0.31, -0.13, -0.47], [0.35, 0.0, -0.3], 0.2, 0.7),
  air:    P([0.36, -0.15, -0.42], [0.2, -0.2, -0.6], 0.15, 0.8),
  dash:   P([0.25, -0.38, -0.32], [-0.3, 0.0, -0.3], 0.95, 0.0),
};
const L_ = {
  idle:   M2(P([0.22, -0.21, -0.53], [0.35, 0.1, -0.3], 0.24, 0.6)),
  hold:   M2(P([0.19, -0.16, -0.55], [0.45, 0.1, -0.2], 0.2, 0.45)),
  windup: M2(P([0.27, -0.17, -0.52], [0.4, 0.0, -0.3], 0.25, 0.4)),
  throw:  M2(P([0.25, -0.22, -0.44], [0.1, 0.0, -0.3], 0.45, 0.2)),
  follow: M2(P([0.23, -0.23, -0.43], [0.1, 0.0, -0.3], 0.45, 0.2)),
  catch:  M2(R_.catch), jump: M2(R_.jump), air: M2(R_.air), dash: M2(R_.dash),
};
const POSES = {}; for (const k of Object.keys(R_)) POSES[k] = { L: L_[k], R: R_[k] };
const LIM = { wrX: [-0.8, 1.35], wrY: [-0.9, 0.9] };

function lerpPose(a, b, t) {
  const o = {};
  for (const k of ['w', 'wr', 'pole']) o[k] = a[k].map((v, i) => v + (b[k][i] - v) * t);
  o.curl = a.curl + (b.curl - a.curl) * t; o.spread = a.spread + (b.spread - a.spread) * t;
  return o;
}
function copyPose(p) { return { w: p.w.slice(), wr: p.wr.slice(), pole: p.pole.slice(), curl: p.curl, spread: p.spread }; }
const ease = t => t * t * (3 - 2 * t);

// Two-bone IK helpers (bones point along -Z)
const _m = new THREE.Matrix4(), _q1 = new THREE.Quaternion(), _q2 = new THREE.Quaternion();
const _S = new THREE.Vector3(), _W = new THREE.Vector3(), _E = new THREE.Vector3(), _d = new THREE.Vector3(), _p = new THREE.Vector3(), _up = new THREE.Vector3(0, 1, 0);
function solveIK(arm, S, W, pole) {
  const a = L_UP, b = L_FORE;
  _d.subVectors(W, S); let dist = _d.length();
  const maxR = a + b - 0.005, minR = 0.12;
  dist = THREE.MathUtils.clamp(dist, minR, maxR);
  _d.normalize();
  W.copy(S).addScaledVector(_d, dist);
  // elbow angle from law of cosines
  const cosA = THREE.MathUtils.clamp((a * a + dist * dist - b * b) / (2 * a * dist), -1, 1);
  const sinA = Math.sqrt(1 - cosA * cosA);
  _p.copy(pole).normalize(); _p.addScaledVector(_d, -_p.dot(_d)).normalize(); // pole perpendicular to S->W
  _E.copy(S).addScaledVector(_d, a * cosA).addScaledVector(_p, a * sinA);
  // shoulder: -Z toward elbow, Y roughly opposite the pole so the bend plane is stable
  _m.lookAt(S, _E, _up); _q1.setFromRotationMatrix(_m);
  arm.shoulder.position.copy(S); arm.shoulder.quaternion.copy(_q1);
  _m.lookAt(_E, W, _up); _q2.setFromRotationMatrix(_m);
  arm.elbow.quaternion.copy(_q1).invert().multiply(_q2);
}

export class ViewArms {
  constructor(aspect) {
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(68, aspect, 0.01, 5);
    this.scene.add(new THREE.HemisphereLight(0xcfeeff, 0x2a1a40, 1.05));
    const key = new THREE.DirectionalLight(0xfff4ea, 1.35); key.position.set(0.4, 1, 0.6); this.scene.add(key);
    const rimC = new THREE.DirectionalLight(0x35e8ff, 1.0); rimC.position.set(-1, 0.3, -0.5); this.scene.add(rimC);
    const rimP = new THREE.DirectionalLight(0xff4fa3, 0.8); rimP.position.set(1, 0.2, -0.6); this.scene.add(rimP);

    const M = {
      white: toon(0xeef2f8), black: toon(0x1a1d26), gray: toon(0x3a4150),
      red: toon(0xe0283c, 0x9a0a1c, 0.25), skin: skinMat(0xffd6bf),
      cyanGlow: glowMat(0x4ff4ff),
    };
    this.root = new THREE.Group(); this.scene.add(this.root);
    this.arms = { L: buildArm(-1, M), R: buildArm(1, M) };
    this.base = { L: new THREE.Vector3(-0.27, -0.44, -0.02), R: new THREE.Vector3(0.27, -0.44, -0.02) };
    for (const k of ['L', 'R']) { this.root.add(this.arms[k].shoulder); this.arms[k].shoulder.position.copy(this.base[k]); }
    bakeRigid(this.root);
    addOutlines(this.root, 0x07080f, 0.0022);

    // Disc held in the right hand
    this.heldDisc = new THREE.Group();
    const d = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.022, 28), toon(0x1b2a3a));
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.11, 0.012, 8, 32), glowMat(0x5ff6ff));
    rim.rotation.x = Math.PI / 2; rim.userData.keep = true;
    const core = new THREE.Mesh(new THREE.CircleGeometry(0.05, 24), glowMat(0x9ffbff)); core.rotation.x = -Math.PI / 2; core.position.y = 0.012;
    this.heldDisc.add(d, rim, core); this.heldDisc.rotation.set(0.25, 0, 0.95); this.heldDisc.scale.setScalar(0.68); this.heldDisc.position.set(-0.03, -0.01, 0.0);
    this.arms.R.socket.add(this.heldDisc);
    this.heldDisc.visible = false;
    this.heldDiscRim = rim;

    this.cur = { L: copyPose(POSES.idle.L), R: copyPose(POSES.idle.R) };
    this.t = 0; this.walk = 0; this.throwT = -1; this.catchT = -1; this.landT = -1;
    this.sway = new THREE.Vector2(); this.state = 'idle';
  }

  resize(aspect) { this.camera.aspect = aspect; this.camera.updateProjectionMatrix(); }
  triggerThrow() { this.throwT = 0; }
  triggerCatch() { this.catchT = 0; }
  triggerLand(strength = 1) { this.landT = 0; this.landStrength = Math.min(1, strength); }
  setDiscColor(c) { this.heldDiscRim.material = glowMat(c); }

  /** s: { speed(0..1), airborne, vy, holding, dashing, lookDX, lookDY } */
  update(dt, s) {
    this.t += dt;
    let state;
    if (this.throwT >= 0) { this.throwT += dt; if (this.throwT > 0.42) this.throwT = -1; }
    if (this.catchT >= 0) { this.catchT += dt; if (this.catchT > 0.45) this.catchT = -1; }
    if (this.throwT >= 0) state = 'throw';
    else if (this.catchT >= 0) state = 'catch';
    else if (s.dashing) state = 'dash';
    else if (s.airborne) state = s.vy > 3 ? 'jump' : 'air';
    else if (s.holding) state = 'hold';
    else state = 'idle';
    this.state = state === 'idle' && s.speed > 0.1 ? 'walk' : state;

    for (const k of ['L', 'R']) {
      let target;
      if (state === 'throw') {
        // shoulder leads, elbow/wrist follow with small lags -> chained swing
        target = this.throwPose(k, this.throwT);
      } else target = POSES[state][k];
      const rate = state === 'throw' ? 40 : state === 'catch' ? 22 : state === 'dash' ? 16 : 11;
      const f = 1 - Math.exp(-rate * dt);
      const c = this.cur[k];
      for (const key of ['w', 'wr', 'pole']) for (let i = 0; i < 3; i++) c[key][i] += (target[key][i] - c[key][i]) * f;
      c.curl += (target.curl - c.curl) * f; c.spread += (target.spread - c.spread) * f;
    }
    this.heldDisc.visible = !!s.holding && state !== 'throw';

    // Walk bob / breathing / look sway / landing dip
    const moving = s.speed > 0.1 && !s.airborne;
    this.walk += dt * (moving ? 9.5 + s.speed * 3 : 0);
    const bob = moving ? Math.sin(this.walk * 2) * 0.012 * s.speed : Math.sin(this.t * 1.6) * 0.004;
    const swayX = moving ? Math.cos(this.walk) * 0.012 * s.speed : 0;
    this.sway.x += ((-s.lookDX || 0) * 0.0009 - this.sway.x) * Math.min(1, dt * 10);
    this.sway.y += ((s.lookDY || 0) * 0.0009 - this.sway.y) * Math.min(1, dt * 10);
    this.sway.x = THREE.MathUtils.clamp(this.sway.x, -0.03, 0.03); this.sway.y = THREE.MathUtils.clamp(this.sway.y, -0.03, 0.03);
    let land = 0;
    if (this.landT >= 0) { this.landT += dt; const t = this.landT / 0.28; land = t < 1 ? Math.sin(t * Math.PI) * 0.035 * this.landStrength : 0; if (t >= 1) this.landT = -1; }
    const dashShake = s.dashing ? Math.sin(this.t * 50) * 0.004 : 0;

    for (const k of ['L', 'R']) {
      const a = this.arms[k], c = this.cur[k], m = a.side;
      const phase = k === 'L' ? 0 : Math.PI;
      const oy = bob + (moving ? Math.sin(this.walk + phase) * 0.006 * s.speed : 0) - land + this.sway.y + dashShake;
      const ox = swayX + this.sway.x;
      _S.copy(this.base[k]); _S.x += ox * 0.5; _S.y += oy * 0.6;
      _W.set(c.w[0] + ox, c.w[1] + oy, c.w[2]);
      solveIK(a, _S, _W, new THREE.Vector3(c.pole[0], c.pole[1], c.pole[2]));
      a.wrist.rotation.set(THREE.MathUtils.clamp(c.wr[0], ...LIM.wrX), THREE.MathUtils.clamp(c.wr[1], ...LIM.wrY), c.wr[2], 'YXZ');
      for (let i = 0; i < 4; i++) {
        const f = a.fingers[i];
        const spread = (i - 1.5) * 0.16 * c.spread * m;
        f[0].rotation.set(-c.curl * 1.1, -spread, 0);
        f[1].rotation.x = -c.curl * 1.35;
        f[2].rotation.x = -c.curl * 0.9;
      }
      a.tRoot.rotation.set(-0.2 - c.curl * 0.4, m * (0.5 + c.spread * 0.4), 0);
      a.thumb[1].rotation.x = -c.curl * 0.7;
    }
    this.root.position.set(0, 0, 0);
  }

  throwPose(k, t) {
    const P0 = POSES.hold[k], P1 = POSES.windup[k], P2 = POSES.throw[k], P3 = POSES.follow[k];
    const seq = (tt) => {
      if (tt < 0.05) return lerpPose(P0, P1, ease(tt / 0.05));
      if (tt < 0.13) return lerpPose(P1, P2, ease((tt - 0.05) / 0.08));
      if (tt < 0.3) return lerpPose(P2, P3, ease((tt - 0.13) / 0.17));
      return lerpPose(P3, POSES.idle[k], ease(Math.min(1, (tt - 0.3) / 0.12)));
    };
    const sh = seq(t), el = seq(Math.max(0, t - 0.015)), wr = seq(Math.max(0, t - 0.03));
    return { w: sh.w.map((v, i) => v * 0.7 + el.w[i] * 0.3), pole: el.pole, wr: wr.wr, curl: wr.curl, spread: wr.spread };
  }

  render(renderer) {
    renderer.autoClear = false;
    renderer.clearDepth();
    renderer.render(this.scene, this.camera);
    renderer.autoClear = true;
  }
}
