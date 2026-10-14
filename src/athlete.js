// PlayerPhysics (Athlete): movement for the player and the CPU — same rules for both.
// Pure logic in ROOM coordinates with an arbitrary gravity direction (ArenaGravitySystem.up()).
//   body      : capsule from feet along "up", radius PLAYER_RADIUS, height PLAYER_HEIGHT
//   floor     : any room face whose inward normal is within ~46 deg of "up" (so the floor changes
//               with the gravity shift; while the room turns, a face stops being floor past 46 deg)
//   ground    : instant speed changes along the floor plane; air: 70 % speed with inertia
//   jump      : along "up"; one AIR ACTION per airtime = wall kick (near a wall) or double jump
//   wall      : any room face roughly perpendicular to "up" (|n.up| < 0.5); panels are not walls
//   half line : keeps the body on its team's side (off while the room turns)
// The trick panels never touch bodies.
import {insideGoal} from './goal-geometry.js';
import * as THREE from 'three';
import { CONFIG, WALL_KICK, ROOM, GRAVITY_SHIFT } from './config.js';

const C = CONFIG;
// The six room faces as INWARD normals with their plane offset (inside: n.p >= -h)
export const ROOM_FACES = [
  { id: 'px', n: new THREE.Vector3(-1, 0, 0), h: ROOM.L }, { id: 'nx', n: new THREE.Vector3(1, 0, 0), h: ROOM.L },
  { id: 'py', n: new THREE.Vector3(0, -1, 0), h: ROOM.CEILING_Y }, { id: 'ny', n: new THREE.Vector3(0, 1, 0), h: ROOM.L },
  { id: 'pz', n: new THREE.Vector3(0, 0, -1), h: ROOM.W }, { id: 'nz', n: new THREE.Vector3(0, 0, 1), h: ROOM.W },
];
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _t = new THREE.Vector3(), _w = new THREE.Vector3();

export class Athlete {
  constructor(name, team) {
    this.name = name; this.team = team;
    this.pos = new THREE.Vector3();          // feet, room coordinates
    this.vel = new THREE.Vector3();          // full 3D velocity, room coordinates
    this.up = new THREE.Vector3(0, 1, 0);    // last "up" used (for eye / animation)
    this.grounded = true; this.floorFace = null;
    this.airJumps = 0; this.wallKicks = 0; this.kickLock = 0; this.lastKick = null;
    this.dashTime = 0; this.dashCd = 0; this.dashVec = new THREE.Vector3();
    this.catchWindow = 0; this.catchCd = 0; this.shootCd = 0; this.catchWindowAge = 0; this.catchBuffer = 0;
    this.holding = false; this.holdTime = 0;
    this.airTime = 0; this.sinceTakeoff = 99; this.atHalfLine = false; this.slidOff = false;
  }
  reset(pos, up) {
    this.pos.copy(pos); this.vel.set(0, 0, 0); if (up) this.up.copy(up);
    this.grounded = true; this.floorFace = null; this.airJumps = 0; this.wallKicks = 0; this.kickLock = 0; this.lastKick = null;
    this.dashTime = 0; this.dashCd = 0; this.catchWindow = 0; this.catchCd = 0; this.shootCd = 0; this.catchWindowAge = 0; this.catchBuffer = 0;
    this.holding = false; this.holdTime = 0; this.airTime = 0; this.sinceTakeoff = 99; this.slidOff = false;
  }
  eye(out = new THREE.Vector3()) { return out.copy(this.pos).addScaledVector(this.up, C.EYE_HEIGHT); }
  /** Velocity component along "up" (the old vy). */
  get vy() { return this.vel.dot(this.up); }
  set vy(v) { this.vel.addScaledVector(this.up, v - this.vel.dot(this.up)); }

  canDash() { return this.grounded && !this.holding && this.dashCd <= 0 && this.dashTime <= 0 && this.catchWindow <= 0; }
  tryDash(dir) {
    if (!this.canDash()) return false;
    this.dashVec.copy(dir).addScaledVector(this.up, -dir.dot(this.up));
    if (this.dashVec.lengthSq() < 0.01) return false;
    this.dashVec.normalize(); this.dashTime = C.DASH_TIME; this.dashCd = C.DASH_COOLDOWN;
    return true;
  }

  /** Space / JUMP. Ground: jump along up. Air: ONE air action = wall kick near a wall, else double jump. */
  tryJump(goals = null) {
    if (this.grounded) {
      this.vy = C.JUMP_VELOCITY; this.grounded = false; this.floorFace = null; this.airTime = 0; this.airJumps = 1; this.sinceTakeoff = 0;
      return 1;
    }
    if (this.airJumps > 0) {
      const wall = this.nearestKickWall(goals);
      if (wall && this.wallKicks < WALL_KICK.maxUsesPerJump) { this.wallKick(wall); this.airJumps = 0; return 'kick'; }
      this.airJumps = 0; this.vy = C.DOUBLE_JUMP_VELOCITY; return 2;
    }
    return false;
  }

  /** Capsule axis ends (lower, upper). */
  axis(a = _a, b = _b) { a.copy(this.pos).addScaledVector(this.up, C.PLAYER_RADIUS); b.copy(this.pos).addScaledVector(this.up, C.PLAYER_HEIGHT - C.PLAYER_RADIUS); return [a, b]; }

  /** Nearest room face that is a WALL for the current gravity, within reach; not off a goal mouth. */
  nearestKickWall(goals = null) {
    if (this.grounded) return null;
    const [a, b] = this.axis();
    let best = null;
    for (const f of ROOM_FACES) {
      if (Math.abs(f.n.dot(this.up)) >= WALL_KICK.wallCos) continue;      // floor / ceiling: not a wall
      const d = Math.min(f.n.dot(a), f.n.dot(b)) + f.h - C.PLAYER_RADIUS; // body surface -> plane
      if (d > WALL_KICK.distance) continue;
      const mid = _t.copy(a).add(b).multiplyScalar(0.5);
      const point = mid.clone().addScaledVector(f.n, -(f.n.dot(mid) + f.h));
      if (goals) {
        const outward = f.n.clone().negate();
        const clear = C.GOAL_VISUAL_RADIUS + C.GOAL_RING_TUBE + WALL_KICK.goalMouthClear;
        if (goals.mouthsOnFace(outward).some(m => insideGoal(point,m,C.GOAL_RING_TUBE*2+WALL_KICK.goalMouthClear))) continue;
      }
      if (!best || d < best.d) best = { d, normal: f.n.clone(), point, id: f.id };
    }
    return best;
  }

  wallKick(wall) {
    const n = wall.normal, u = this.up;
    const vu = this.vel.dot(u);
    const along = this.vel.clone().addScaledVector(u, -vu); along.addScaledVector(n, -along.dot(n)).multiplyScalar(0.3);
    this.vel.copy(n).multiplyScalar(WALL_KICK.horizontalSpeed).add(along).addScaledVector(u, Math.max(vu, WALL_KICK.verticalBoost));
    this.kickLock = WALL_KICK.airControlLock; this.wallKicks++; this.lastKick = wall; this.dashTime = 0;
  }

  /**
   * One fixed step. wish: room-space direction (any length 0..1; the part along up is ignored).
   * env: { up, halfLine: {dir, on} | null, others: [{pos, r}] }
   */
  step(dt, wish, env) {
    const ev = [];
    const u = this.up.copy(env.up);
    for (const k of ['dashCd', 'catchCd', 'shootCd', 'noPickup']) this[k] = Math.max(0, (this[k] || 0) - dt);
    if (this.holding) this.holdTime += dt;
    this.sinceTakeoff += dt;
    if (this.kickLock > 0) this.kickLock = Math.max(0, this.kickLock - dt);
    // floor still a floor? (room turning)
    if (this.grounded && this.floorFace && this.floorFace.n.dot(u) < GRAVITY_SHIFT.floorCos) { this.grounded = false; this.floorFace = null; this.airTime = 0; this.slidOff = true; }

    if (this.dashTime > 0 && this.grounded) {
      this.dashTime -= dt;
      this.vel.copy(this.dashVec).multiplyScalar(C.DASH_SPEED);
    } else if (this.grounded) {
      const n = this.floorFace ? this.floorFace.n : u;
      _w.copy(wish).addScaledVector(n, -wish.dot(n));
      this.vel.copy(_w).multiplyScalar(C.MOVE_SPEED);
      this.dashTime = 0;
    } else {
      this.airTime += dt;
      this.vel.addScaledVector(u, -C.GRAVITY * dt * (this.vel.dot(u) < 0 ? C.FALL_MULT : 1));
      const sp = C.MOVE_SPEED * C.AIR_SPEED_RATIO;
      const vu = this.vel.dot(u);
      _t.copy(this.vel).addScaledVector(u, -vu);
      _w.copy(wish).addScaledVector(u, -wish.dot(u)).multiplyScalar(sp).sub(_t);
      const maxDv = C.AIR_ACCEL * dt * (this.kickLock > 0 ? WALL_KICK.lockedControl : 1);
      const l = _w.length(); if (l > maxDv) _w.multiplyScalar(maxDv / l);
      this.vel.add(_w);
      this.dashTime = 0;
    }
    this.pos.addScaledVector(this.vel, dt);

    // ---- collide the body capsule with the 6 room faces
    let newFloor = null;
    const wasGrounded = this.grounded;
    for (const f of ROOM_FACES) {
      const [a, b] = this.axis();
      const pen = C.PLAYER_RADIUS - (Math.min(f.n.dot(a), f.n.dot(b)) + f.h);
      const ndu = f.n.dot(u);
      if (pen > -0.02 && ndu >= GRAVITY_SHIFT.floorCos && this.vel.dot(f.n) <= 0.5) newFloor = f;
      if (pen <= 0) continue;
      this.pos.addScaledVector(f.n, pen);
      const vn = this.vel.dot(f.n);
      if (vn < 0) {
        if (ndu <= -GRAVITY_SHIFT.floorCos && this.vel.dot(u) > 0) ev.push({ type: 'ceiling', speed: this.vel.dot(u) });
        this.vel.addScaledVector(f.n, -vn);
      }
    }
    if (newFloor) {
      if (!wasGrounded) {
        const impact = -Math.min(0, this.vel.dot(u));
        ev.push({ type: 'land', impact, airTime: this.airTime });
        // only a real airtime re-arms the air action (no reset from brief contacts while the room turns)
        if (this.airTime >= C.MIN_AIR_FOR_RESET || this.slidOff) { this.airJumps = 0; this.wallKicks = 0; }
        this.kickLock = 0; this.slidOff = false;
      }
      this.grounded = true; this.floorFace = newFloor;
      const vn = this.vel.dot(newFloor.n); if (vn < 0) this.vel.addScaledVector(newFloor.n, -vn);
    } else if (wasGrounded) {
      this.grounded = false; this.floorFace = null; this.airTime = 0;
    }

    // ---- half line (team side)
    this.atHalfLine = false;
    const hl = env.halfLine;
    const clampHalf = () => {
      if (!hl || !hl.on) return;
      const s = this.pos.dot(hl.dir);
      if (s < C.HALF_LINE_GAP) { this.pos.addScaledVector(hl.dir, C.HALF_LINE_GAP - s); this.atHalfLine = true; const vd = this.vel.dot(hl.dir); if (vd < 0) this.vel.addScaledVector(hl.dir, -vd); }
    };
    clampHalf();
    // ---- separation from other bodies (in the plane perpendicular to up)
    for (const o of env.others || []) {
      _t.subVectors(this.pos, o.pos); const vu = _t.dot(u);
      if (Math.abs(vu) > 1.7) continue;
      _t.addScaledVector(u, -vu);
      const d = _t.length(), r = C.PLAYER_RADIUS + (o.r || 0.45);
      if (d < r && d > 1e-4) this.pos.addScaledVector(_t, (r - d) / d);
    }
    clampHalf();
    // final push-out: separation / half line must never leave the body inside a room face
    for (const f of ROOM_FACES) {
      const [a, b] = this.axis();
      const pen = C.PLAYER_RADIUS - (Math.min(f.n.dot(a), f.n.dot(b)) + f.h);
      if (pen > 0) { this.pos.addScaledVector(f.n, pen); const vn = this.vel.dot(f.n); if (vn < 0) this.vel.addScaledVector(f.n, -vn); }
    }
    return ev;
  }

  snapshot() { return { pos: this.pos.toArray(), vel: this.vel.toArray(), grounded: this.grounded, airJumps: this.airJumps, wallKicks: this.wallKicks, holding: this.holding }; }
}
