// CPUController: decisions for the CPU athlete (TEAM PINK). Thinks in CANONICAL coordinates
// (floor at y=-L, its own goal at +x, the player's goal at -x) so every gravity orientation plays
// the same; outputs are converted back to room coordinates.
// It sees the world through a perception delay (cfg.reaction s) and NEVER predicts future disc
// positions. Aim has random error from the seeded RNG. Tunables: CPU_PRESETS / CPU_CATCH.
import * as THREE from 'three';
import { CONFIG, ROOM, cpuCfg, CPU_CATCH } from './config.js';

const C = CONFIG, L = ROOM.L, W = ROOM.W;
const FLOOR = -L;

export class CPUController {
  constructor(athlete, gravity, rng) {
    this.a = athlete; this.g = gravity; this.rng = rng;
    this.history = [];
    this.plan = null; this.windup = 0; this.pendingShot = null;
    this.catchAttemptCd = 0; this.jumpCd = 0; this.guardT = 0; this.lastSeenState = null;
  }
  rand(a, b) { return this.rng.range(a, b); }
  reset() { this.history.length = 0; this.plan = null; this.windup = 0; this.pendingShot = null; this.catchAttemptCd = 0; this.jumpCd = 0; this.guardT = 0; this.lastSeenState = null; }

  /** Snapshots are stored in ROOM coordinates; converted when used. */
  record(t, disc, player) {
    this.history.push({ t, state: disc.state, owner: disc.owner, pos: disc.pos.clone(), vel: disc.vel.clone(), saved: disc.saved, player: player.pos.clone() });
    while (this.history.length > 2 && t - this.history[1].t > 1.0) this.history.shift();
  }
  perceive(t, delay) {
    const target = t - delay;
    let best = this.history[0];
    for (const h of this.history) { if (h.t <= target) best = h; else break; }
    return best;
  }

  /** Returns { wish (room), jump, dash, catch, shoot:{dir (room)}|null, faceTo (room)|null } */
  think(dt, t, disc, player, keeperCyan, goals) {
    const cfg = cpuCfg(), a = this.a, g = this.g;
    const out = { wish: new THREE.Vector3(), jump: false, dash: false, catch: false, shoot: null, faceTo: null };
    this.catchAttemptCd = Math.max(0, this.catchAttemptCd - dt);
    this.jumpCd = Math.max(0, this.jumpCd - dt);
    if (this.lastSeenState === 'HELD_PLAYER') this.guardT = 0.6; else this.guardT = Math.max(0, this.guardT - dt);
    const delay = cfg.reaction * (this.guardT > 0 ? 0.5 : 1);
    const raw = this.perceive(t, delay);
    if (!raw) return out;
    this.lastSeenState = raw.state === 'HELD' && raw.owner === 'player' ? 'HELD_PLAYER' : raw.state;
    const cv = (v) => g.canonFromLocal(v);
    const seen = { state: raw.state, owner: raw.owner, pos: cv(raw.pos), vel: cv(raw.vel), player: cv(raw.player) };
    const me = cv(a.pos);
    const wishC = new THREE.Vector3();
    const moveTo = (x, z, speedScale = 1, stopDist = 0.35) => {
      const dx = x - me.x, dz = z - me.z, d = Math.hypot(dx, dz);
      if (d > stopDist) wishC.set(dx / d, 0, dz / d).multiplyScalar(Math.min(1, d / 1.2) * speedScale * (cfg.moveSpeed / C.MOVE_SPEED));
      return d;
    };
    const finish = (faceC) => { out.wish.copy(g.localFromCanon(wishC)); if (faceC) out.faceTo = g.localFromCanon(faceC); return out; };

    if (a.holding) {
      // ---- ATTACK (own half: canonical x > 0)
      if (!this.plan) {
        const r = this.rng.next();
        this.plan = { spot: new THREE.Vector3(this.rand(2.2, 7.5), 0, this.rand(-5.5, 5.5)), kind: r < 0.5 ? 'direct' : r < 0.5 + 0.5 * (1 - cfg.jumpChance) ? 'bank' : 'jump', wait: this.rand(cfg.holdMin, cfg.holdMax) };
      }
      this.plan.wait -= dt;
      moveTo(this.plan.spot.x, this.plan.spot.z, 0.85);
      const ready = this.plan.wait <= 0 || a.holdTime > C.HOLD_LIMIT - 1.2;
      if (ready && this.windup <= 0 && !this.pendingShot) {
        if (this.plan.kind === 'jump' && a.grounded && !this.plan.jumped) { out.jump = true; this.plan.jumped = true; }
        const airborneOk = this.plan.kind !== 'jump' || (!a.grounded && a.vy < 2.5);
        if (airborneOk) { this.pendingShot = this.aim(keeperCyan, goals); this.windup = 0.18; }
      }
      if (this.windup > 0) {
        this.windup -= dt;
        if (this.windup <= 0 && this.pendingShot) { out.shoot = this.pendingShot; this.pendingShot = null; this.plan = null; }
      }
      return finish(new THREE.Vector3(-L, FLOOR + C.GOAL_Y, 0));
    }
    this.plan = null; this.pendingShot = null; this.windup = 0;

    const reachable = seen.pos.x > -C.HALF_LINE_PICKUP_REACH;
    let face = null;
    if ((seen.state === 'LOOSE' || seen.state === 'NEUTRAL' || seen.state === 'FALLING') && !reachable) {
      moveTo(4.5, THREE.MathUtils.clamp(seen.pos.z * 0.5, -5, 5), 0.8); face = seen.pos;
    } else if (seen.state === 'LOOSE' || seen.state === 'NEUTRAL' || seen.state === 'FALLING') {
      const d = moveTo(Math.max(C.HALF_LINE_GAP, seen.pos.x), seen.pos.z, 1, 0.2);
      if (d > 5 && a.canDash() && this.rng.next() < dt * 1.5) out.dash = true;
      face = seen.pos;
    } else if (seen.state === 'HELD' && seen.owner === 'player') {
      const p = seen.player;
      moveTo(THREE.MathUtils.clamp(p.x + (L - p.x) * 0.5, 3.5, L - 2.5), THREE.MathUtils.clamp(p.z * 0.55, -5, 5), 0.95);
      face = p;
    } else if (seen.state === 'FLYING') {
      const eye = cv(a.eye());
      const toMe = new THREE.Vector3().subVectors(eye, seen.pos);
      const dist = toMe.length();
      const approaching = seen.vel.dot(toMe) > 0;
      face = seen.pos;
      const speed = seen.vel.length();
      const lateral = speed > 0.1 ? new THREE.Vector3().crossVectors(toMe, seen.vel).length() / speed : dist;
      if (approaching || dist < 4) {
        moveTo(Math.max(C.HALF_LINE_GAP, seen.pos.x + Math.sign(me.x - seen.pos.x) * 1.5), seen.pos.z, 1);
        const height = seen.pos.y - FLOOR;
        if (height > 3 && dist < 6 + speed * delay && a.grounded && this.jumpCd <= 0) { if (this.rng.next() < cfg.jumpChance + 0.25) out.jump = true; this.jumpCd = 1.5; }
        const reach = CPU_CATCH.range + speed * delay;
        if (approaching && dist < reach && lateral < CPU_CATCH.range && this.catchAttemptCd <= 0 && a.catchCd <= 0 && a.catchWindow <= 0) {
          this.catchAttemptCd = 0.9;
          if (this.rng.next() < cfg.catchSkill) out.catch = true;
        }
      } else moveTo(5.5, THREE.MathUtils.clamp(seen.pos.z * 0.4, -4, 4), 0.7);
    } else moveTo(5, 0, 0.6);
    return finish(face);
  }

  /** Shot at the cyan goal; reads the keeper's CURRENT lateral position (it is visible). Returns {dir (room)}. */
  aim(keeper) {
    const cfg = cpuCfg(), a = this.a, g = this.g;
    const origin = g.canonFromLocal(a.eye()).add(new THREE.Vector3(-0.6, -0.15, 0));
    const kz = keeper ? keeper.z : 0;
    const side = Math.abs(kz) < 0.3 ? (this.rng.next() < 0.5 ? -1 : 1) : -Math.sign(kz);
    const tz = side * this.rand(0.5, 1.0), ty = FLOOR + C.GOAL_Y + this.rand(-0.5, 0.9);
    const target = new THREE.Vector3(-L - 0.5, ty, tz);
    if (this.plan && this.plan.kind === 'bank') {
      const wall = (origin.z >= 0 ? 1 : -1) * (W - C.DISC_RADIUS);
      target.z = 2 * wall - tz;
    }
    const dir = target.sub(origin).normalize();
    const err = THREE.MathUtils.degToRad(cfg.aimError);
    dir.applyAxisAngle(new THREE.Vector3(0, 1, 0), this.rand(-err, err));
    dir.y += this.rand(-err, err) * 0.7;
    return { dir: g.localFromCanon(dir.normalize()) };
  }
}
