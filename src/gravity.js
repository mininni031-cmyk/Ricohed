// ArenaGravitySystem — ONE source of truth for the room's attitude, the gravity vector and the
// reference frames (pure logic: no DOM, no rendering). Everything else asks this system:
//   roomAngle  : rotation of the room about +z (rad). Each shift adds -90 deg ("turns right"
//                = clockwise in the reference view looking along -z).
//   up()       : unit "up" in ROOM coordinates = room^-1 * worldUp. Gravity = -up * g, constant g.
//   k          : number of completed shifts (mod 4 gives the orientation).
//   canon/local: canonical frame = room coordinates rotated by the REST angle of k
//                (floor at y=-L, cyan goal at -x, pink goal at +x).
import * as THREE from 'three';
import { GRAVITY_SHIFT as GS, ROOM } from './config.js';

const HALF_PI = Math.PI / 2;
const smoother = (t) => t * t * t * (t * (t * 6 - 15) + 10); // smootherstep: zero velocity & accel at both ends

export class ArenaGravitySystem {
  constructor(emit = () => {}) {
    this.emit = emit;
    this.reset();
  }
  reset() {
    this.k = 0;                 // completed shifts
    this.clock = 0;             // shift clock (match time while playing / goal)
    this.phase = 'stable';      // stable | warning | rotating | settle
    this.phaseT = 0;
    this.angle = 0;
    this.enabled = GS.enabled;
    this._lastWarnSec = null;
    this.endAt = Infinity;      // match length: no warning for a shift that would start at / after the final whistle
  }
  restAngle(k = this.k) { return -HALF_PI * k; }
  get orientation() { return ((this.k % 4) + 4) % 4; }
  get rotating() { return this.phase === 'rotating'; }
  /** Fraction 0..1 of the turn in progress (0 when not turning). */
  get progress() { return this.phase === 'rotating' ? Math.min(1, this.phaseT / GS.duration) : 0; }
  /** Time until the next shift starts (s), for the HUD. */
  get nextIn() {
    const n = Math.floor(this.clock / GS.interval) + 1;
    return n * GS.interval - this.clock;
  }

  /** Advance with the match clock. Deterministic: same clock -> same state. */
  update(dt) {
    if (!this.enabled) return;
    this.clock += dt;
    const ci = GS.interval, c = this.clock;
    const cycleStart = Math.floor(c / ci) * ci;   // start time of the current/last shift
    const sinceStart = c - cycleStart;
    const untilNext = cycleStart + ci - c;
    let phase = 'stable';
    if (cycleStart > 0 && sinceStart < GS.duration) phase = 'rotating';
    else if (cycleStart > 0 && sinceStart < GS.duration + GS.settle) phase = 'settle';
    else if (untilNext <= GS.warning && cycleStart + ci < this.endAt) phase = 'warning';

    if (phase !== this.phase) {
      const prev = this.phase;
      if (phase === 'rotating') { this.emit('GRAVITY_SHIFT_STARTED', { k: this.k }); }
      if (prev === 'rotating' && phase !== 'rotating') { this.k += 1; this.emit('GRAVITY_SHIFT_COMPLETED', { k: this.k }); }
      if (phase === 'warning') this.emit('GRAVITY_SHIFT_WARNING', { in: untilNext });
      this.phase = phase; this.phaseT = 0;
    }
    if (phase === 'warning') {
      const sec = Math.ceil(untilNext);
      if (sec !== this._lastWarnSec) { this._lastWarnSec = sec; this.emit('GRAVITY_SHIFT_COUNT', { sec }); }
    } else this._lastWarnSec = null;
    this.phaseT = phase === 'rotating' ? sinceStart : this.phaseT + dt;
    this.angle = this.restAngle() - (phase === 'rotating' ? HALF_PI * smoother(Math.min(1, sinceStart / GS.duration)) : 0);
  }

  /** Room rotation (room -> world orientation). */
  roomQuat(out = new THREE.Quaternion()) { return out.setFromAxisAngle(_z, this.angle); }
  /** Unit up vector in room coordinates. Constant length -> constant gravity strength. */
  up(out = new THREE.Vector3()) { return out.set(Math.sin(this.angle), Math.cos(this.angle), 0); } // = rotZ(worldUp, -angle)
  /** World direction -> room direction / room -> world. */
  toRoomDir(v, out = new THREE.Vector3()) { return rotZ(out.copy(v), -this.angle); }
  toWorldDir(v, out = new THREE.Vector3()) { return rotZ(out.copy(v), this.angle); }
  /** Canonical (rest frame of k) <-> room coordinates. Positions and directions (origin = room centre). */
  localFromCanon(v, out = new THREE.Vector3()) { return rotZ(out.copy(v), -this.restAngle()); }
  canonFromLocal(v, out = new THREE.Vector3()) { return rotZ(out.copy(v), this.restAngle()); }
  /** Room-local direction toward the team's goal face (canonical -x for cyan, +x for pink). */
  teamDir(team, out = new THREE.Vector3()) { return this.localFromCanon(_t.set(team === 'cyan' ? -1 : 1, 0, 0), out); }
  /** Room-local outward normal of the current (rest) floor face. */
  floorDir(out = new THREE.Vector3()) { return this.localFromCanon(_t.set(0, -1, 0), out); }
  /** Half line active? (off while turning; the turn ends with a warp of anyone on the wrong side) */
  get halfLineActive() { return this.phase !== 'rotating'; }

  snapshot() { return { k: this.k, clock: this.clock, phase: this.phase, phaseT: this.phaseT, angle: this.angle }; }
}

const _z = new THREE.Vector3(0, 0, 1), _t = new THREE.Vector3();
function rotZ(v, a) { const c = Math.cos(a), s = Math.sin(a); const x = v.x * c - v.y * s, y = v.x * s + v.y * c; v.x = x; v.y = y; return v; }
export { rotZ };
export const ROOM_L = ROOM.L, ROOM_W = ROOM.W;
