// DiscPhysics: flight, reflections (6 room faces / fixed trick panels / goal rims), keeper saves,
// goal detection on the ACTIVE mouths, and falling / resting along the CURRENT gravity.
// Pure logic in room coordinates (no rendering, no DOM) so a server could run it.
import {insideGoal,goalRimContact} from './goal-geometry.js';
import * as THREE from 'three';
import { CONFIG, PANELS, ROOM, GRAVITY_SHIFT } from './config.js';
import { ROOM_FACES } from './athlete.js';

const C = CONFIG;
const _v = new THREE.Vector3(), _l = new THREE.Vector3(), _cl = new THREE.Vector3(), _n = new THREE.Vector3(), _prev = new THREE.Vector3(), _p = new THREE.Vector3();
const D2R = Math.PI / 180;

/** Fixed panel colliders (room coordinates). Mesh and collider come from the same data. */
export function buildPanelColliders() {
  return PANELS.map(p => {
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler((p.tiltX || 0) * D2R, (p.rotY || 0) * D2R, (p.rotZ || 0) * D2R, 'YXZ'));
    return { id: p.id, team: p.team, definition: p, center: new THREE.Vector3(...p.pos), q, qi: q.clone().invert(), half: new THREE.Vector3(p.size[0] / 2, p.size[1] / 2, p.size[2] / 2) };
  });
}

export function panelPosition(p, time, out) {
  out.set(...p.pos);
  if(p.motion) out.z += p.motion.sign * p.motion.amplitude * Math.sin(time * Math.PI * 2 / p.motion.period);
  return out;
}
export function updatePanelColliders(panels, time) {
  for(const p of panels) if(p.definition) panelPosition(p.definition,time,p.center);
}

/** Segment (a->b) vs oriented box. True if it passes through the box (blocks catches through panels). */
export function segmentHitsOBB(a, b, box) {
  const o = _l.subVectors(a, box.center).applyQuaternion(box.qi);
  const d = _cl.subVectors(b, box.center).applyQuaternion(box.qi).sub(o);
  let t0 = 0, t1 = 1;
  for (const ax of ['x', 'y', 'z']) {
    const h = box.half[ax];
    if (Math.abs(d[ax]) < 1e-9) { if (o[ax] < -h || o[ax] > h) return false; continue; }
    let ta = (-h - o[ax]) / d[ax], tb = (h - o[ax]) / d[ax];
    if (ta > tb) [ta, tb] = [tb, ta];
    t0 = Math.max(t0, ta); t1 = Math.min(t1, tb);
    if (t0 > t1) return false;
  }
  return true;
}

/** Sphere vs oriented box. Returns {normal, point} and pushes `pos` out, or null. */
export function sphereOBB(pos, r, box) {
  _l.subVectors(pos, box.center).applyQuaternion(box.qi);
  _cl.set(THREE.MathUtils.clamp(_l.x, -box.half.x, box.half.x), THREE.MathUtils.clamp(_l.y, -box.half.y, box.half.y), THREE.MathUtils.clamp(_l.z, -box.half.z, box.half.z));
  _n.subVectors(_l, _cl);
  const d = _n.length();
  if (d >= r) return null;
  if (d > 1e-6) { _n.divideScalar(d); _l.copy(_cl).addScaledVector(_n, r + 1e-3); }
  else {
    const px = box.half.x - Math.abs(_l.x), py = box.half.y - Math.abs(_l.y), pz = box.half.z - Math.abs(_l.z);
    _n.set(0, 0, 0);
    if (px <= py && px <= pz) { _n.x = Math.sign(_l.x) || 1; _l.x = _n.x * (box.half.x + r + 1e-3); }
    else if (py <= pz) { _n.y = Math.sign(_l.y) || 1; _l.y = _n.y * (box.half.y + r + 1e-3); }
    else { _n.z = Math.sign(_l.z) || 1; _l.z = _n.z * (box.half.z + r + 1e-3); }
  }
  const point = _cl.clone().applyQuaternion(box.q).add(box.center);
  pos.copy(_l.applyQuaternion(box.q).add(box.center));
  return { normal: _n.clone().applyQuaternion(box.q).normalize(), point };
}

/** Shared by live physics and the pre-bounce direction guide. */
export function advanceCurve(velocity, up, rate, left, dt) {
  const bend = Math.max(0, Math.min(dt, left));
  if (bend > 0) velocity.applyAxisAngle(up, rate * bend);
  return Math.max(0, left - bend);
}

export class DiscPhysics {
  /** keepers: Goalkeeper[]; goals: GoalSystem; gravity: ArenaGravitySystem */
  constructor(keepers, goals, gravity) {
    this.keepers = keepers; this.goals = goals; this.gravity = gravity;
    this.panels = buildPanelColliders();
    this.pos = new THREE.Vector3(); this.vel = new THREE.Vector3();
    this.state = 'NEUTRAL'; this.owner = null; this.bounces = 0; this.lastShooter = null;
    this.shotAge = 0; this.flightAge = 0; this.looseTime = 0;
    this.saved = false; this.savedBy = null;
    this.lastHit = new Map(); this.time = 0;
    this.prevPos = new THREE.Vector3();  // position before the last sub-step (swept catch test)
    this.reset();
  }

  /** Neutral spot: centre of the current floor. */
  neutralSpot(out = new THREE.Vector3()) {
    const up = this.gravity.up(_v);
    return out.copy(up).multiplyScalar(-ROOM.L + 0.65);
  }
  reset() {
    this.state = 'NEUTRAL'; this.owner = null; this.bounces = 0; this.vel.set(0, 0, 0);
    this.neutralSpot(this.pos); this.prevPos.copy(this.pos);
    this.saved = false; this.savedBy = null; this.looseTime = 0; this.flightAge = 0; this.lastShooter = null;
    this.lastHit.clear();
  }
  hold(who) { this.state = 'HELD'; this.owner = who; this.bounces = 0; this.saved = false; this.vel.set(0, 0, 0); }
  launch(origin, dir, shooter, speed = C.SHOT_SPEED) {
    this.curveRate = 0; this.curveLeft = 0;
    this.flightId = (this.flightId || 0) + 1;
    this.state = 'FLYING'; this.owner = null; this.lastShooter = shooter;
    this.pos.copy(origin); this.prevPos.copy(origin); this.vel.copy(dir).normalize().multiplyScalar(speed);
    this.bounces = 0; this.shotAge = 0; this.flightAge = 0; this.saved = false; this.savedBy = null;
    this.lastHit.clear();
    for (const p of this.panels) sphereOBB(this.pos, C.DISC_RADIUS, p);
    this.clampInside(this.pos);
  }
  drop() { this.state = 'FALLING'; this.owner = null; this.vel.set(0, 0, 0); }
  value() { return Math.min(C.MAX_POINTS, this.bounces + 1); }
  clampInside(v, r = C.DISC_RADIUS + 0.01) {
    v.x = THREE.MathUtils.clamp(v.x, -ROOM.L + r, ROOM.L - r); v.y = THREE.MathUtils.clamp(v.y, -ROOM.L + r, ROOM.CEILING_Y - r); v.z = THREE.MathUtils.clamp(v.z, -ROOM.W + r, ROOM.W - r);
    return v;
  }

  _bounce(surface, normal, point, events, damp = C.BOUNCE_DAMP) {
    if (this.vel.dot(normal) >= 0) return false; // already separating: never double count
    const last = this.lastHit.get(surface);
    this.vel.reflect(normal).multiplyScalar(damp);
    if (!this.saved && !(last !== undefined && this.time - last < C.SAME_SURFACE_GUARD)) {
      this.bounces = Math.min(5, this.bounces + 1);
      events.push({ type: 'bounce', surface, normal: normal.clone(), point: point.clone(), count: this.bounces });
    } else if (this.saved) events.push({ type: 'thud', surface, normal: normal.clone(), point: point.clone() });
    this.lastHit.set(surface, this.time);
    return true;
  }

  /** Advance a flying disc by h seconds using sub-steps of <= 8 cm. Returns events. */
  stepFlying(h, events = [], onSubstep = null) {
    const r = C.DISC_RADIUS;
    const up = this.gravity.up(new THREE.Vector3());
    const n = Math.max(1, Math.ceil(this.vel.length() * h / 0.08));
    const dt = h / n;
    const act = this.goals.active();
    for (let s = 0; s < n && this.state === 'FLYING'; s++) {
      this.time += dt; this.shotAge += dt; this.flightAge += dt;
      _prev.copy(this.pos); this.prevPos.copy(this.pos);
      if (this.saved) this.vel.addScaledVector(up, -C.GRAVITY * dt);
      if (!this.saved && this.curveLeft > 0) { this.curveLeft = advanceCurve(this.vel, up, this.curveRate, this.curveLeft, dt); }
      this.pos.addScaledVector(this.vel, dt);

      // Keepers first (they stand in front of the mouths)
      if (!this.saved) for (const k of this.keepers) {
        const hit = k.hitTest(this.pos, r);
        if (!hit) continue;
        const m = k.mouth, out = m.normal; // toward the goal wall
        // push back out of the body, toward the field
        this.pos.addScaledVector(out, -0.25);
        const speed = Math.max(6, this.vel.length() * C.KEEPER_SAVE_SPEED_KEEP);
        _v.copy(out).multiplyScalar(-1).addScaledVector(k.frame.up, 0.45).addScaledVector(k.frame.lat, THREE.MathUtils.clamp(hit.lat * 0.9, -0.9, 0.9)).normalize();
        this.vel.copy(_v).multiplyScalar(speed);
        this.saved = true; this.savedBy = k.team;
        events.push({ type: 'save', keeper: k, point: this.pos.clone(), part: hit.part, lat: hit.lat, height: hit.height });
        break;
      }

      // Active goal mouths: crossing the face plane inside / on the rim
      for (const team of ['cyan', 'pink']) {
        const m = act[team]; if (!m) continue;
        // the disc enters the mouth when its leading edge reaches the face plane (centre at L - r);
        // without the opening the room face would bounce it at exactly that point
        const nOut = m.normal, d0 = _prev.dot(nOut), d1 = this.pos.dot(nOut), plane = ROOM.L - r;
        if (!(d0 < plane && d1 >= plane)) continue;
        const t = (plane - d0) / (d1 - d0 || 1e-6);
        const cross = _p.copy(_prev).lerp(this.pos, t);
        const inside = insideGoal(cross, m);
        const rim = goalRimContact(cross,r,m);
        if (inside && !this.saved) {
          const scorer = team === 'pink' ? 'player' : 'cpu'; // into the pink goal = cyan (player) scores
          events.push({ type: 'goal', team, mouth: m, scorer, value: this.value(), bounces: this.bounces, shooter: this.lastShooter, point: cross.clone() });
          this.state = 'SCORED'; this.vel.multiplyScalar(0.15);
          break;
        } else if (rim || inside) {
          this.pos.copy(cross).addScaledVector(nOut, -0.02);
          if (inside) this._bounce('net:' + m.id, _n.copy(nOut).negate(), this.pos, events, 0.5);
          else {
            const radial = cross.clone().sub(m.center).normalize();
            const nn = _n.copy(nOut).negate().addScaledVector(radial, 0.35).normalize();
            this._bounce('rim:' + m.id, nn, cross, events);
            if (events.length && events[events.length - 1].type === 'bounce') events[events.length - 1].rim = true;
          }
        }
      }
      if (this.state !== 'FLYING') break;

      // Room faces (floor, walls, ceiling — whichever they are right now)
      for (const f of ROOM_FACES) {
        const pen = r - (f.n.dot(this.pos) + f.h);
        if (pen <= 0) continue;
        this.pos.addScaledVector(f.n, pen);
        if (this.saved && f.n.dot(up) >= GRAVITY_SHIFT.floorCos) {
          // deflected disc settling on the floor
          const vn = this.vel.dot(f.n);
          if (vn < 0) { this.vel.addScaledVector(f.n, -vn * 1.4); this.vel.multiplyScalar(0.72); events.push({ type: 'thud', surface: f.id, point: this.pos.clone(), normal: f.n.clone() }); }
          if (Math.abs(this.vel.dot(f.n)) < 1.2 && this.vel.length() < 2.0) { this.state = 'LOOSE'; this.looseTime = 0; this.vel.set(0, 0, 0); events.push({ type: 'settled' }); break; }
        } else this._bounce(f.id, f.n, this.pos, events);
      }
      if (this.state !== 'FLYING') break;
      // Trick panels (fixed in the room)
      for (const p of this.panels) { const hit = sphereOBB(this.pos, r, p); if (hit) this._bounce(p.id, hit.normal, hit.point, events); }
      if (onSubstep && onSubstep(dt)) break;
    }
    if (this.state === 'FLYING' && !this.saved && this.flightAge >= C.FLIGHT_LIFE) { this.drop(); events.push({ type: 'timeout' }); }
    if (this.state === 'FLYING' && this.saved && this.flightAge >= 3.0) { this.drop(); events.push({ type: 'timeout' }); }
    return events;
  }

  /** FALLING: falls along gravity onto whichever face is the floor. LOOSE: rests; slides off if its face stops being floor. */
  stepOther(dt, events = []) {
    const up = this.gravity.up(new THREE.Vector3()), r = C.DISC_RADIUS;
    if (this.state === 'FALLING') {
      this.vel.addScaledVector(up, -C.GRAVITY * dt);
      this.pos.addScaledVector(this.vel, dt);
      for (const f of ROOM_FACES) {
        const pen = r - (f.n.dot(this.pos) + f.h);
        if (pen <= 0) continue;
        this.pos.addScaledVector(f.n, pen);
        const vn = this.vel.dot(f.n); if (vn < 0) this.vel.addScaledVector(f.n, -vn);
        if (f.n.dot(up) >= GRAVITY_SHIFT.floorCos) { this.state = 'LOOSE'; this.looseTime = 0; this.vel.set(0, 0, 0); this.restFace = f; }
      }
    } else if (this.state === 'LOOSE' || this.state === 'NEUTRAL') {
      if (this.state === 'LOOSE') {
        this.looseTime += dt;
        if (this.looseTime >= C.LOOSE_RESET) { this.reset(); events.push({ type: 'discReset' }); return events; }
      }
      // still supported by a floor face?
      let supported = false;
      for (const f of ROOM_FACES) if (f.n.dot(up) >= GRAVITY_SHIFT.floorCos && (f.n.dot(this.pos) + f.h) < 0.7) supported = true;
      if (!supported) { this.state = 'FALLING'; this.vel.set(0, 0, 0); }
    }
    return events;
  }

  snapshot() { return { state: this.state, owner: this.owner, pos: this.pos.toArray(), vel: this.vel.toArray(), bounces: this.bounces, lastShooter: this.lastShooter, saved: this.saved }; }
}
