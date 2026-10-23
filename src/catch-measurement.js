// Opt-in local diagnostics only. Never included in network events or snapshots.
export function measureCatch(actor, time, route, eye, aim, disc, evaluation) {
  const offset = disc.pos.clone().sub(eye);
  return { actor, time, route, distance: offset.length(),
    angleDeg: offset.lengthSq() > 1e-12 ? aim.angleTo(offset) * 180 / Math.PI : 0,
    sweptDistance: evaluation.dist, sweptAngleDeg: evaluation.angleDeg,
    eye: eye.toArray(), disc: disc.pos.toArray() };
}
