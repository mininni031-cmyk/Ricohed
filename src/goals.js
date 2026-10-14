// GoalSystem — the 4 goal faces (pure logic).
// Each of the 4 faces that can become a floor (+x, -x, +y, -y) carries TWO goal mouths, one next to
// each neighbouring face, so that a mouth always sits GOAL_Y (2.0 m) above whichever face is the floor.
// Active goals = the two mouths on the faces left/right of the current floor, next to that floor.
// While the room turns the previous pair stays active; the new pair takes over when the turn ends.
import * as THREE from 'three';
import { CONFIG, ROOM } from './config.js';

const C = CONFIG, L = ROOM.L;
const FACES = { '+x': [1, 0, 0], '-x': [-1, 0, 0], '+y': [0, 1, 0], '-y': [0, -1, 0] };
const key = (v) => (v.x > 0.5 ? '+x' : v.x < -0.5 ? '-x' : v.y > 0.5 ? '+y' : '-y');

export class GoalSystem {
  constructor(gravity) {
    this.g = gravity;
    this.mouths = [];
    for (const [fk, fn] of Object.entries(FACES)) for (const [sk, sn] of Object.entries(FACES)) {
      const n = new THREE.Vector3(...fn), s = new THREE.Vector3(...sn);
      if (Math.abs(n.dot(s)) > 0.5) continue; // slot must be a neighbouring (perpendicular) face
      const center = n.clone().multiplyScalar(L).addScaledVector(s, L - C.GOAL_Y);
      this.mouths.push({ id: `${fk}|${sk}`, faceKey: fk, slotKey: sk, normal: n, slot: s, up: s.clone().negate(), center });
    }
    this._active = null; this._k = null;
  }
  /** {cyan, pink}: the active mouths (team = whose goal it is). */
  active() {
    if (this._k === this.g.k) return this._active;
    const F = key(this.g.floorDir()), cf = key(this.g.teamDir('cyan')), pf = key(this.g.teamDir('pink'));
    this._active = { cyan: this.mouths.find(m => m.faceKey === cf && m.slotKey === F), pink: this.mouths.find(m => m.faceKey === pf && m.slotKey === F) };
    this._k = this.g.k;
    return this._active;
  }
  teamOf(mouth) { const a = this.active(); return a.cyan === mouth ? 'cyan' : a.pink === mouth ? 'pink' : null; }
  isActive(mouth) { return this.teamOf(mouth) !== null; }
  /** Mouths on a given face (outward normal), active or not — used to keep wall kicks off goal openings. */
  mouthsOnFace(n) { return this.mouths.filter(m => m.normal.dot(n) > 0.99); }
}
export { FACES };
