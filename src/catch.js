// CatchSystem (pure logic). ONE function decides "catchable", used by the crosshair, the real
// catch, the CPU and the debug overlay. The test runs on the disc's PATH since the last sub-step
// (closest point of the segment prev->now to the eye), so a fast disc cannot slip between frames.
import * as THREE from 'three';
import { segmentHitsOBB } from './physics.js';

const _d = new THREE.Vector3(), _c = new THREE.Vector3(), _q = new THREE.Vector3();

/** Closest point to p on segment a-b. */
export function closestOnSegment(p, a, b, out = new THREE.Vector3()) {
  _d.subVectors(b, a); const L2 = _d.lengthSq();
  const t = L2 > 1e-12 ? THREE.MathUtils.clamp(_c.subVectors(p, a).dot(_d) / L2, 0, 1) : 0;
  return out.copy(a).addScaledVector(_d, t);
}

/**
 * params: { range, angleDeg, approachSlack }
 * eye, aim: room-space eye position and unit aim direction
 * disc: { state, pos, prevPos, vel }   panels: colliders
 * Returns { ok, reason, dist, angleDeg, point }
 *   reason: 'ok' | 'no-flight' | 'distance' | 'angle' | 'moving-away' | 'occluded'
 */
export function evalCatch(params, eye, aim, disc, panels) {
  const res = { ok: false, reason: 'no-flight', dist: Infinity, angleDeg: 180, point: null };
  if (disc.state !== 'FLYING') return res;
  const P = closestOnSegment(eye, disc.prevPos || disc.pos, disc.pos, new THREE.Vector3());
  _q.subVectors(P, eye);
  res.dist = _q.length(); res.point = P;
  res.angleDeg = res.dist > 1e-6 ? THREE.MathUtils.radToDeg(aim.angleTo(_q)) : 0;
  if (res.dist > params.range) { res.reason = 'distance'; return res; }
  if (res.angleDeg > params.angleDeg) { res.reason = 'angle'; return res; }
  // moving away = velocity points away from the eye by more than ~3 deg. A disc whose closest
  // point of the swept segment lies inside it is passing perpendicular (dot = 0) -> still catchable.
  if (disc.vel.dot(_q) > 0.05 * disc.vel.length() * res.dist && res.dist > (params.approachSlack ?? 1)) { res.reason = 'moving-away'; return res; }
  for (const p of panels) if (segmentHitsOBB(eye, P, p)) { res.reason = 'occluded'; return res; }
  res.ok = true; res.reason = 'ok';
  return res;
}

export const REASON_JA = {
  ok: 'キャッチ可能', 'no-flight': '飛行中のディスクなし', distance: '距離が遠い', angle: '角度がずれている',
  'moving-away': '離れていくディスク', occluded: 'パネルの陰', cooldown: 'クールダウン中', 'window-closed': '受付時間切れ',
  holding: 'ディスク所持中', dashing: 'ダッシュ中', 'own-shot': '自分のシュート直後',
};
