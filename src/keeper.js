import {KeeperPhysics} from './keeper-physics.js';
// GoalkeeperSystem: one keeper per team, standing on the current floor in front of that team's
// ACTIVE goal mouth. Moves side to side (room z) on a fixed rhythm ONLY — its position depends on
// match time alone, never on the player or the disc.
// The save hitbox is MEASURED from the posed 3D model (torso, head, both raised arms, both legs),
// so what you see is what blocks: the gaps above the hands / in the upper corners stay open.
import * as THREE from 'three';
import { CONFIG, ROOM } from './config.js';
import { AnimeCharacter, PALETTES } from './character.js';

const C = CONFIG, L = ROOM.L;
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _p = new THREE.Vector3(), _m = new THREE.Matrix4();

function segDist(p, a, b) { // distance from p to segment ab
  _b.subVectors(b, a); const t = THREE.MathUtils.clamp(_a.subVectors(p, a).dot(_b) / (_b.lengthSq() || 1), 0, 1);
  return _p.copy(a).addScaledVector(_b, t).distanceTo(p);
}

export class Goalkeeper {
  constructor(team, parent, phaseOffset = 0) {
    this.team = team; this.phaseOffset = phaseOffset;
    this.z = 0; this.prevZ = 0; this.vz = 0;
    this.range = C.KEEPER_RANGE; this.period = C.KEEPER_PERIOD;
    this.saveTimer = 0; this.concedeTimer = 0; this.guard = 0; this.appear = 1;
    const opts = team === 'cyan'
      ? { pal: PALETTES.keeperCyan, hair: 0xdfe7f2, hairHi: 0xffffff, hairStyle: 'spiky', suit: 0x161a24, accent: 0x2fe6ff, basePose: 'keeper' }
      : { pal: PALETTES.keeperPink, hair: 0x1d2140, hairHi: 0x6b78c8, hairStyle: 'swept', suit: 0x161a24, accent: 0xff4fa3, basePose: 'keeper' };
    this.char = new AnimeCharacter(opts);
    parent.add(this.char.root);
    this.measureHitbox();
    this.frame = { origin: new THREE.Vector3(), up: new THREE.Vector3(0, 1, 0), front: new THREE.Vector3(1, 0, 0), lat: new THREE.Vector3(0, 0, 1) };
  }

  /** Settle the base pose and record joint positions (character space, scaled). */
  measureHitbox() {
    const ch = this.char, r = ch.root, S = C.KEEPER_SCALE;
    r.position.set(0, 0, 0); r.quaternion.identity(); r.scale.setScalar(S);
    for (let i = 0; i < 90; i++) ch.update(1 / 30, { speed: 0 });
    r.updateMatrixWorld(true);
    _m.copy(r.matrixWorld).invert().premultiply(new THREE.Matrix4().makeScale(S, S, S)); // world -> root space, in scaled (real) metres
    const P = (o, off = null) => { const v = new THREE.Vector3(); if (off) v.copy(off); o.localToWorld(v); return v.applyMatrix4(_m); };
    const J = ch.j;
    const tipL = P(J.handL, new THREE.Vector3(0, -0.09, 0)), tipR = P(J.handR, new THREE.Vector3(0, -0.09, 0));
    this.hb = {
      parts: [
        { name: 'armL', a: P(J.shL), b: tipL, r: 0.075 * S },
        { name: 'armR', a: P(J.shR), b: tipR, r: 0.075 * S },
        { name: 'legL', a: P(J.hipL), b: P(J.footL), r: 0.085 * S },
        { name: 'legR', a: P(J.hipR), b: P(J.footR), r: 0.085 * S },
        { name: 'body', a: P(J.hips), b: P(J.spine, new THREE.Vector3(0, 0.5, 0)), r: 0.19 * S },
        { name: 'head', a: P(J.head), b: P(J.head), r: 0.16 * S },
      ],
    };
    let top = 0, wide = 0; for (const q of this.hb.parts) { top = Math.max(top, q.a.y, q.b.y); wide = Math.max(wide, Math.abs(q.a.x), Math.abs(q.b.x)); }
    this.hb.reachTop = top; this.hb.reachSide = wide;
  }

  /** Move to the active mouth of this team (called at start and when a gravity shift completes). */
  setHome(mouth, animate = false) {
    this.mouth = mouth;
    const f = this.frame;
    f.up.copy(mouth.up);                       // = -floor normal
    f.front.copy(mouth.normal).negate();       // faces the field
    f.lat.crossVectors(f.up, f.front).normalize();
    f.origin.copy(mouth.normal).multiplyScalar(L - C.KEEPER_DEPTH).addScaledVector(mouth.slot, L);
    if (animate) { this.guard = C.KEEPER_REHOME_GUARD; this.appear = 0; }
    this.place();
  }

  /** Deterministic: lateral position depends only on match time. */
  update(dt, matchTime) {
    this.prevZ = this.z;
    const w = (Math.PI * 2) / this.period;
    this.z = Math.sin(matchTime * w + this.phaseOffset) * this.range;
    this.vz = dt > 0 ? (this.z - this.prevZ) / dt : 0;
    this.saveTimer = Math.max(0, this.saveTimer - dt);
    this.concedeTimer = Math.max(0, this.concedeTimer - dt);
    this.guard = Math.max(0, this.guard - dt);
    this.place();
  }
  /** Room-local position of the keeper's feet. */
  feet(out = new THREE.Vector3()) { return out.copy(this.frame.origin).addScaledVector(this.frame.lat, this.latOffset()); }
  latOffset() { return this.z * Math.sign(this.frame.lat.z || 1); } // move along room z
  place() {
    const f = this.frame, r = this.char.root;
    this.feet(r.position);
    _m.makeBasis(f.lat, f.up, f.front); r.quaternion.setFromRotationMatrix(_m);
    r.scale.setScalar(C.KEEPER_SCALE * (0.2 + 0.8 * this.appear));
  }
  animate(dt) { this.appear = Math.min(1, this.appear + dt / 0.3); this.char.update(dt, { speed: Math.abs(this.vz) }); }

  /** Disc (room-local p, radius r) vs the measured body. Returns {part, lat} or null. */
  hitTest(p,r) { return KeeperPhysics.prototype.hitTest.call(this,p,r); }

  onSave(lat) {
    this.saveTimer = 0.5;
    this.char.play(lat > 0 ? 'saveL' : 'saveR', 0.45, 26);
    this.char.setExpression('save', 0.9);
  }
  onConcede() { this.concedeTimer = 1.6; this.char.play('conceded', 1.6, 8); this.char.setExpression('conceded', 2.2); }
  onTeamScored() { this.char.play('celebrate', 1.2, 10); this.char.setExpression('shoot', 1.4); }
}
