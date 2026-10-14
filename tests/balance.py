"""RICOCHET v2.6 balance check (same bot model as the v2.5.2 check, so the numbers compare).

Scenarios x N tries with keepers and the (fixed) panels ON, gravity frozen at the first
orientation unless the scenario says otherwise, CPU parked. A "human-like" bot plays each try:
  - shooting: reads the keeper (shoots toward the side it is leaving), aim error ~N(0, 0.8 deg),
    random shooting spot in its own half, random time in the air for air shots
  - catching: tracks the disc with a fixed per-try aim error ~N(0, 6 deg) and presses CATCH when
    the disc is 2.5..8 m away (random reaction), i.e. sometimes early, sometimes late.
    The incoming shot is aimed at the bot's eye +-1.0 m sideways / +-0.5 m vertically (like the CPU).
This is a simulation, not a human playtest.  Usage: python3 tests/balance.py [N] [base_url]
"""
import asyncio, json, sys
from playwright.async_api import async_playwright

N = int(sys.argv[1]) if len(sys.argv) > 1 else 20
BASE = sys.argv[2] if len(sys.argv) > 2 else "http://localhost:8003/"

JS = r"""
(async (N, only=null) => {
  const R = window.__RICO, g = R.game, THREE = R.THREE, C = R.CONFIG, L = R.ROOM.L, W = R.ROOM.W, V = (x,y,z)=>new THREE.Vector3(x,y,z);
  let seed = 12345; const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  const gauss = () => { let u = 0, v = 0; while (!u) u = rnd(); while (!v) v = rnd(); return Math.sqrt(-2*Math.log(u))*Math.cos(2*Math.PI*v); };
  g.rngOverride = rnd;
  const D2R = Math.PI/180, p = g.player, gr = g.gravity;
  const step = (n=1) => { for (let i=0;i<n;i++) g.step(1/120); };
  const setK = (k) => { gr.reset(); gr.k = k; gr.angle = gr.restAngle(k); gr.enabled = false; g.goals._k = null; g.rehomeKeepers(false); g.syncRoom(); for (const kk of g.keepers) { kk.guard = 0; kk.appear = 1; } };
  const reset = (shiftClock = null) => { g.state='playing'; g.cpuFrozen=true; setK(0); g.resetPositions(); g.cpuA.pos.set(8,-L,8.4); g.timeLeft=170; g.log.length=0; g.score.cyan=0; g.score.pink=0;
    g.matchClock = rnd()*60; for (const k of g.keepers) k.update(0, g.matchClock); p.catchCd=0; p.dashCd=0; p.catchWindow=0; p.catchBuffer=0; g.suction=null; g.lastOkCatchT=-99;
    if (shiftClock !== null) { gr.enabled = true; gr.clock = shiftClock; } };
  const toWorldAim = (dirRoom, errDeg) => { const dW = gr.toWorldDir(dirRoom); p.yaw = Math.atan2(-dW.x,-dW.z) + gauss()*errDeg*D2R; p.pitch = Math.asin(Math.max(-1,Math.min(1,dW.y))) + gauss()*errDeg*D2R; };
  const aimAt = (target, errDeg=0.8) => toWorldAim(target.clone().sub(p.eye()).normalize(), errDeg);
  const R_ = W - C.DISC_RADIUS;
  const goalC = () => g.goals.active().pink.center;   // (11, -9, 0) before the first shift
  // human read of the keeper: shoot when it is off-centre, toward the side it is leaving
  const target = (kind) => { const k=g.keepers[1]; const side = k.z>0 ? -1 : 1; const tz = side*(0.55+rnd()*0.45), ty = goalC().y + (rnd()-0.35)*1.1, tx = L + 0.5;
    if (kind==='one') { const wall = (p.pos.z>=0?1:-1)*R_; return V(tx, ty, 2*wall - tz); }
    if (kind==='two') { const w1=(p.pos.z>=0?1:-1)*R_; const once=2*w1 - tz; return V(tx, ty, 2*(-w1) - once); }
    return V(tx, ty, tz); };
  const waitKeeper = () => { let n=0; while (Math.abs(g.keepers[1].z) < 0.45*C.KEEPER_RANGE && n<240) { step(); n++; } };
  const resolve = () => { let n=0; while (g.state==='playing' && g.disc.state==='FLYING' && n<900) { step(); n++; }
    const goal=g.log.find(l=>l.type==='goal'); const save=g.log.some(l=>l.type==='save');
    return { goal: !!goal && goal.scorer==='player', value: goal?goal.value:0, saved: save, bounces: g.log.filter(l=>l.type==='bounce').length }; };
  const shoot = (kind, air, kick) => { reset();
    if (kick) p.pos.set(-2-rnd()*7, -L, (rnd()<0.5?-1:1)*(W-0.45)); else p.pos.set(-1.5-rnd()*7.5, -L, (rnd()-0.5)*10);
    g.giveDisc('player', false); g.suction=null; waitKeeper();
    if (air || kick) { p.tryJump(g.goals); step(1); }
    if (kick) { step(20 + Math.floor(rnd()*20)); const r=p.tryJump(g.goals); if (r!=='kick') return {skip:true}; g.onWallKick(p,'player'); step(10 + Math.floor(rnd()*30)); }
    else if (air) step(15 + Math.floor(rnd()*110));
    const phase = p.grounded ? 'ground' : Math.abs(p.vy)<2 ? 'apex' : p.vy>0 ? 'rising' : 'falling';
    aimAt(target(kind)); g.input.press('shoot'); step(1); const r = resolve(); r.phase=phase; r.spread=g.lastSpreadDeg; return r; };
  const catchTry = (air, shift) => { reset(shift ? 30.5 + rnd()*4 : null); p.pos.set(-5-rnd()*5, -L, (rnd()-0.5)*8);
    if (shift) step(1);
    const errY=gauss()*6*D2R, errP=gauss()*6*D2R; const pressAt = 2.5 + rnd()*5.5;
    let pressed=false, n=0, everInRange=false, everOk=false, okOutsideWindow=false, minDist=99, reasons={};
    if (air) { p.tryJump(g.goals); }
    const fly = air ? 18 + Math.floor(rnd()*30) : 0;
    for (; n<fly; n++) step();
    const e = p.eye(); const up = g.up();
    const origin = g.gravity.localFromCanon(V(3+rnd()*7, -L+1.2+rnd()*1.5, (rnd()-0.5)*8));
    const side = V(0,0,1), aimPt = e.clone().addScaledVector(up, (rnd()-0.5)*1.0).addScaledVector(side, (rnd()-0.5)*2.0);
    g.disc.launch(origin, aimPt.sub(origin).normalize(), 'cpu');
    for (n=0; n<240 && g.disc.state==='FLYING'; n++) {
      const eye=p.eye(); const d=g.disc.pos.clone().sub(eye); const dir=d.clone().normalize(); const dW=gr.toWorldDir(dir);
      p.yaw = Math.atan2(-dW.x,-dW.z)+errY; p.pitch = Math.asin(Math.max(-1,Math.min(1,dW.y)))+errP;
      if (!pressed && d.length() < pressAt) { g.input.press('catch'); pressed=true; }
      const t = g.catchEval('player'); if (t.dist <= R.CATCH.range) everInRange=true; if (t.ok) { everOk=true; if (p.catchWindow<=0 && !p.holding) okOutsideWindow=true; }
      reasons[t.reason]=(reasons[t.reason]||0)+1; minDist=Math.min(minDist,t.dist);
      step();
    }
    const ok = p.holding; const airborne = g.log.some(l=>l.type==='catch' && l.airborne);
    const why = ok ? 'caught' : !everInRange ? 'never in reach' : !everOk ? 'in reach, aim/angle off' : okOutsideWindow ? 'timing (window closed)' : 'other';
    gr.enabled = false;
    return { caught: ok, airborne, pressed, why, minDist };
  };
  const out = {};
  const runShots = (name, kind, air, kick) => { const rs=[]; let guard=0; while (rs.length<N && guard<N*4) { guard++; const r=shoot(kind,air,kick); if(!r.skip) rs.push(r); }
    out[name] = { n: rs.length, success: rs.filter(r=>r.goal).length, saved: rs.filter(r=>r.saved).length,
      values: rs.filter(r=>r.goal).map(r=>r.value), phases: rs.reduce((a,r)=>(a[r.phase]=(a[r.phase]||0)+1,a),{}),
      meanSpread: +(rs.reduce((a,r)=>a+(r.spread||0),0)/rs.length).toFixed(2) }; };
  const want = (n) => !only || only.includes(n);
  if (want('ground_direct')) runShots('ground_direct', 'direct', false, false);
  if (want('air_direct')) runShots('air_direct', 'direct', true, false);
  if (want('ricochet_1')) runShots('ricochet_1', 'one', false, false);
  if (want('ricochet_2')) runShots('ricochet_2', 'two', false, false);
  if (want('after_wallkick')) runShots('after_wallkick', 'direct', false, true);
  for (const [name, air, shift] of [['catch_ground', false, false], ['catch_air', true, false], ['catch_during_shift', false, true]]) { if (!want(name)) continue;
    const rs=[]; for (let i=0;i<N;i++) rs.push(catchTry(air, shift));
    out[name] = { n: N, success: rs.filter(r=>r.caught).length, airborneCatches: rs.filter(r=>r.airborne).length,
      failures: rs.filter(r=>!r.caught).reduce((a,r)=>(a[r.why]=(a[r.why]||0)+1,a),{}) };
  }
  g.rngOverride = null;
  return out;
})
"""

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(args=["--use-angle=swiftshader", "--enable-unsafe-swiftshader"])
        pg = await b.new_page(viewport={"width": 640, "height": 360})
        await pg.goto(BASE + "index.html?test=1")
        await pg.wait_for_function("window.__RICO !== undefined", timeout=120000)
        await pg.click("#start")
        await pg.evaluate("() => { const g=__RICO.game; g.input.requestLock=()=>{}; for (let i=0;i<330;i++) g.step(1/120); }")
        res = await pg.evaluate(JS + f"({N})")
        print(json.dumps(res, ensure_ascii=False, indent=1))
        with open("tests/balance.json", "w") as f: json.dump(res, f, ensure_ascii=False, indent=1)
        await b.close()

asyncio.run(main())
