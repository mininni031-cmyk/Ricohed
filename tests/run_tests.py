"""RICOCHET v2.6 automated browser tests (Playwright + Chromium, SwiftShader WebGL).

Usage:  python3 tests/run_tests.py [base_url]   (default http://localhost:8003/)
The game is opened with ?test=1, which exposes window.__RICO and runs the simulation only when
the test steps it (fixed 1/120 s steps: deterministic, independent of the machine's frame rate).
Real DOM input (keyboard / mouse / touch / buttons) is used wherever the wiring matters.
Room coordinates: centre of the room = origin, x,y in [-11, 11], z in [-9, 9]. Before the first
gravity shift the floor is y = -11, the cyan goal is on -x and the pink goal on +x.
"""
import asyncio, json, math, os, sys, time
from playwright.async_api import async_playwright

BASE = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:8003/"
ARGS = ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"]
RESULTS = []
ONLY = os.environ.get("ONLY")  # e.g. ONLY=06,07 to run a subset while debugging

HELPERS = r"""
window.TT = (() => {
  const R = window.__RICO, g = R.game, THREE = R.THREE, C = R.CONFIG, L = R.ROOM.L, W = R.ROOM.W;
  const V = (x, y, z) => new THREE.Vector3(x, y, z);
  const run = (n) => { for (let i = 0; i < n; i++) g.step(1 / 120); };
  const runUntil = (fn, max = 2400) => { for (let i = 0; i < max; i++) { if (fn()) return i; g.step(1 / 120); } return -1; };
  const setK = (k) => { const gr = g.gravity; gr.reset(); gr.k = k; gr.angle = gr.restAngle(k); gr.enabled = false; g.goals._k = null; g.rehomeKeepers(false); g.syncRoom(); };
  const canon = (x, y, z) => g.gravity.localFromCanon(V(x, y, z));
  const clean = (k = 0) => { // quiet field: CPU frozen + parked, disc parked, panels OFF, gravity frozen at orientation k
    if (!g._allPanels) g._allPanels = g.disc.panels; g.disc.panels = [];
    g.state = 'playing'; g.timeLeft = 170; setK(k);
    g.cpuFrozen = true; g.resetPositions();
    g.cpuA.pos.copy(canon(8, -L, 7.5));
    g.disc.reset(); g.disc.state = 'LOOSE'; g.disc.pos.copy(canon(0.6, -L + C.DISC_RADIUS, -8.3)); g.disc.prevPos.copy(g.disc.pos); g.disc.looseTime = -1e9;
    const p = g.player; p.catchCd = 0; p.catchWindow = 0; p.catchBuffer = 0; p.dashCd = 0; p.holding = false;
    g.cpuA.catchCd = 0; g.cpuA.catchWindow = 0; g.cpuA.holding = false;
    g.score.cyan = 0; g.score.pink = 0; g.suction = null; g.lastOkCatchT = -99; g.log.length = 0; g.bus.log.length = 0;
    for (const k of g.keepers) { k.guard = 0; k.appear = 1; k.place(); }
    g.input.clearPresses(); g.input.keys.clear(); g.rngOverride = null;
    run(1); g.log.length = 0; g.bus.log.length = 0;
  };
  const noKeepers = () => { for (const k of g.keepers) k.guard = 1e9; };
  const withPanels = () => { g.disc.panels = g._allPanels; };
  /** point the player's camera at a room-space target */
  const aimAt = (target) => { const p = g.player, e = p.eye(); const dR = target.clone().sub(e).normalize(); const dW = g.gravity.toWorldDir(dR);
    p.yaw = Math.atan2(-dW.x, -dW.z); p.pitch = Math.asin(Math.max(-1, Math.min(1, dW.y))); };
  const key = (code) => { document.dispatchEvent(new KeyboardEvent('keydown', { code })); document.dispatchEvent(new KeyboardEvent('keyup', { code })); };
  const flyUntilDone = (max = 1500) => { let n = 0; while (g.disc.state === 'FLYING' && g.state === 'playing' && n < max) { g.step(1 / 120); n++; } return n; };
  const shootFrom = (origin, target, who = 'player') => { g.disc.launch(origin, target.clone().sub(origin).normalize(), who); };
  const r2 = (v) => Math.round(v * 100) / 100;
  return { g, THREE, C, L, W, V, run, runUntil, setK, canon, clean, noKeepers, withPanels, aimAt, key, flyUntilDone, shootFrom, r2 };
})();
"""

def rec(name, ok, detail=""):
    RESULTS.append({"name": name, "pass": bool(ok), "detail": detail})
    print(("PASS " if ok else "FAIL ") + name + (" — " + str(detail) if detail else ""), flush=True)

async def ev(pg, js):
    return await pg.evaluate("() => { const {g,THREE,C,L,W,V,run,runUntil,setK,canon,clean,noKeepers,withPanels,aimAt,key,flyUntilDone,shootFrom,r2} = window.TT; " + js + " }")

def want(n):
    return not ONLY or n in ONLY.split(",")

async def desktop(p):
    b = await p.chromium.launch(args=ARGS)
    ctx = await b.new_context(viewport={"width": 960, "height": 540})
    pg = await ctx.new_page()
    errors, external = [], []
    pg.on("pageerror", lambda e: errors.append(str(e)))
    pg.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
    pg.on("request", lambda r: external.append(r.url) if not r.url.startswith(BASE.rstrip('/')) and not r.url.startswith("data:") and not r.url.startswith("blob:") else None)
    t0 = time.time()
    await pg.goto(BASE + "index.html?test=1")
    await pg.wait_for_function("window.__RICO !== undefined", timeout=120000)
    await pg.evaluate(HELPERS)
    boot = round(time.time() - t0, 2)
    rev = await pg.evaluate("__RICO.THREE.REVISION")
    ver = await pg.evaluate("__RICO.CONFIG.VERSION")
    rec("01 Boot without errors, Three.js bundled locally", not errors and rev == "180" and not external and ver == "2.6.1",
        f"boot {boot}s, version {ver}, THREE r{rev}, external requests: {len(external)}, errors: {errors[:3]}")

    # ---- start button (real click) + match-start motion graphic
    vis = await pg.is_visible("#overlay")
    await pg.click("#start")
    st1 = await ev(pg, "return g.state")
    await ev(pg, "run(330)")
    st2 = await ev(pg, "return g.state")
    hud = await pg.is_visible("#hud")
    intro = await ev(pg, "return {started: g.bus.log.some(e=>e.type==='MATCH_STARTED'), el: !!document.querySelector('#motion .mg.intro'), text: (document.querySelector('#motion .mg.intro')||{}).textContent||''}")
    rec("02 Start button starts the match (countdown -> MATCH_STARTED -> team banners)", vis and st1 == "countdown" and st2 == "playing" and hud and not await pg.is_visible("#overlay") and intro["started"] and intro["el"] and "TEAM CYAN" in intro["text"],
        f"overlay before={vis}, after click={st1}, after countdown={st2}, hud={hud}, intro={intro}")

    # ---- pause / resume
    await pg.keyboard.press("Escape")
    s_p = await ev(pg, "return g.state"); ov = await pg.is_visible("#menuPause")
    tl1 = await ev(pg, "run(120); return g.timeLeft"); tl2 = await ev(pg, "run(120); return g.timeLeft")
    gc1 = await ev(pg, "return g.gravity.clock")
    await pg.click("#resume")
    s_r = await ev(pg, "return g.state")
    rec("03 Pause / resume (Esc, resume button); clock and gravity clock frozen while paused", s_p == "paused" and ov and s_r == "playing" and tl1 == tl2,
        f"Esc->{s_p} (menu {ov}), clock frozen={tl1 == tl2}, gravity clock {gc1:.2f}, resume->{s_r}")
    await ev(pg, "document.exitPointerLock && document.exitPointerLock()")
    await pg.wait_for_timeout(200)
    await ev(pg, "g.input.requestLock = () => {}; g.input.onLockChange = null; if (g.state==='paused') g.resume(); g.input.lockFailed = true; g.input.everLocked=false; if (g.state==='paused') { g.state='playing'; g.ui.menu(null); g.input.enabled=true; }")

    # ---- movement with real keys
    await ev(pg, "clean(); g.player.pos.x=-10; g.input.takeLook(); g.player.yaw=-Math.PI/2; g.player.pitch=0")
    await pg.keyboard.down("KeyW"); m = await ev(pg, "const x0=g.player.pos.x; run(120); return g.player.pos.x-x0"); await pg.keyboard.up("KeyW")
    await pg.keyboard.down("KeyD"); s = await ev(pg, "const z0=g.player.pos.z; run(60); return g.player.pos.z-z0"); await pg.keyboard.up("KeyD")
    look = await ev(pg, """const y0=g.player.yaw, p0=g.player.pitch;
        document.dispatchEvent(new MouseEvent('mousemove',{movementX:100, movementY:-50})); run(1); return {dy:g.player.yaw-y0, dp:g.player.pitch-p0}""")
    rec("04 Movement (WASD) and mouse look", abs(m - 7.0) < 0.2 and abs(s - 3.5) < 0.2 and abs(look["dy"]) > 0.1 and look["dp"] > 0.05,
        f"W 1s: {m:.2f} m (7.0 expected), D 0.5s: {s:.2f} m (3.5), look dyaw {look['dy']:.3f} dpitch {look['dp']:.3f}")

    # ---- disc speed 16 m/s (real shoot click)
    sp = await ev(pg, """clean(); g.giveDisc('player', false); g.suction=null; g.player.pos.copy(canon(-6,-L,0)); aimAt(canon(11,-9,0)); run(1);
        g.input.press('shoot'); run(1); return {state:g.disc.state, speed:g.disc.vel.length(), cfg:C.SHOT_SPEED}""")
    rec("05 Disc speed 16 m/s", sp["state"] == "FLYING" and abs(sp["speed"] - 16) < 0.01 and sp["cfg"] == 16, json.dumps(sp))

    # ---- catch parameters (the exact test the game uses)
    cp = await ev(pg, """clean(); const p=g.player; p.pos.copy(canon(-6,-L,0)); g.player.yaw=-Math.PI/2; g.player.pitch=0; run(1);
        const R=__RICO.CATCH, d=g.disc, e=p.eye(); const fwd=g.forward();
        const at=(dist,angDeg,vsign=-1)=>{ const a=angDeg*Math.PI/180; const off=V(Math.cos(a)*dist,0,Math.sin(a)*dist); d.state='FLYING'; d.lastShooter='cpu'; d.shotAge=1;
          d.pos.copy(e).add(off); d.prevPos.copy(d.pos); d.vel.copy(off).normalize().multiplyScalar(16*vsign); const r=g.catchEval('player'); return r.ok?'ok':r.reason; };
        const out={cfg:R, d29:at(2.9,0), d31:at(3.1,0), a65:at(2.5,65), a75:at(2.5,75), away:at(2.5,10,1), behind:at(1.5,180)};
        clean(); return out""")
    rec("06 Catch rules: 3.0 m, 70 deg, approaching only, window 0.8 s, early grace 0.25 s, cooldown 0.5 s",
        cp["d29"] == "ok" and cp["d31"] == "distance" and cp["a65"] == "ok" and cp["a75"] == "angle" and cp["away"] == "moving-away" and cp["behind"] == "angle"
        and cp["cfg"]["range"] == 3.0 and cp["cfg"]["angleDeg"] == 70 and cp["cfg"]["window"] == 0.8 and cp["cfg"]["rescue"] == 0.25 and cp["cfg"]["cooldown"] == 0.5,
        json.dumps(cp))

    # ---- real catch with the F key, ground
    gc = await ev(pg, """clean(); const p=g.player; p.pos.copy(canon(-6,-L,1)); run(2);
        const e=p.eye(); aimAt(canon(6,-8.5,0)); shootFrom(canon(6,-8.5,0), e.clone().add(V(0,0.3,0.8)), 'cpu');
        const n=runUntil(()=>g.disc.pos.distanceTo(p.eye())<5.5, 300); key('KeyF'); runUntil(()=>g.disc.state!=='FLYING', 300);
        return {n, holding:p.holding, log:g.log.filter(l=>l.type==='catch'), ev:g.bus.log.filter(e=>e.type==='DISC_CAUGHT'), suction:!!g.suction, mg:!!document.querySelector('#motion .mg.catch')}""")
    rec("07 Ground catch with the real key (window opens on press, DISC_CAUGHT, suction + CATCH! graphic)", gc["holding"] and len(gc["ev"]) == 1 and gc["suction"] and gc["mg"],
        json.dumps(gc))

    # ---- swept test: both ends of the sub-step out of reach, the path passes 2 m away
    sw = await ev(pg, """clean(); const p=g.player; p.pos.copy(canon(-6,-L,0)); g.player.yaw=-Math.PI/2; g.player.pitch=0; run(1);
        const d=g.disc, e=p.eye(); d.state='FLYING'; d.lastShooter='cpu'; d.shotAge=1; d.prevPos.copy(e).add(V(2,0,3.6)); d.pos.copy(e).add(V(2,0,-3.6)); d.vel.set(0,0,-16);
        const r=g.catchEval('player'); const endA=d.prevPos.distanceTo(e), endB=d.pos.distanceTo(e);
        // physics side: a 16 m/s disc moves 13 cm per 1/120 s step; sub-steps are <= 8 cm and every sub-step runs the test
        clean(); return {ok:r.ok, reason:r.reason, dist:r.dist, endA, endB}""")
    rec("08 Swept catch test (segment of the last sub-step, not only the current position)", sw["ok"] and sw["endA"] > 3 and sw["endB"] > 3 and abs(sw["dist"] - 2) < 1e-6, json.dumps(sw))

    # ---- early press (0.2 s before the throw) is kept; 0.35 s before is not
    eb = await ev(pg, """const res={};
      for (const lead of [0.2, 0.35]) { clean(); const p=g.player; p.pos.copy(canon(-6,-L,0)); run(1); const e=p.eye(); aimAt(canon(4,-8.5,0));
        g.giveDisc('cpu', false); g.suction=null; run(1); key('KeyF'); run(Math.round(lead*120));
        g.cpuA.holding=false; shootFrom(canon(4,-8.5,0), e.clone().add(V(0,0,0.5)), 'cpu'); runUntil(()=>g.disc.state!=='FLYING', 300);
        res['lead'+lead]={caught:p.holding, press:g.lastPressResult}; }
      return res""")
    rec("09 Early catch input: 0.2 s before the disc is catchable -> caught; 0.35 s -> not (grace 0.25 s)", eb["lead0.2"]["caught"] and not eb["lead0.35"]["caught"], json.dumps(eb))

    # ---- late rescue: press within 0.25 s after the disc stopped being catchable
    lr = await ev(pg, """const res={};
      for (const late of [0.15, 0.4]) { clean(); const p=g.player; p.pos.copy(canon(-6,-L,0)); g.player.yaw=-Math.PI/2; g.player.pitch=0; run(1); const e=p.eye();
        shootFrom(e.clone().add(V(9,0,2.2)), e.clone().add(V(-9,0,2.2)), 'cpu');
        let was=false; const n=runUntil(()=>{ if (g.catchable) was=true; return was && !g.catchable; }, 400); run(Math.round(late*120)); key('KeyF'); run(1);
        res['late'+late]={wasCatchable:was, caught:p.holding, rescued:(g.bus.log.find(e=>e.type==='DISC_CAUGHT')||{}).rescued||false}; }
      return res""")
    rec("10 Late rescue: 0.15 s after the disc left the catch zone -> caught (rescued); 0.4 s -> not", lr["late0.15"]["caught"] and lr["late0.15"]["rescued"] and not lr["late0.4"]["caught"] and lr["late0.15"]["wasCatchable"], json.dumps(lr))

    # ---- window 0.8 s and cooldown 0.5 s after a miss; no catching during the cooldown
    cd = await ev(pg, """clean(); const p=g.player; p.pos.copy(canon(-6,-L,0)); run(1);
        shootFrom(canon(8,-5,8), canon(8,-5,-8), 'cpu'); key('KeyF'); run(1); const w0=p.catchWindow;
        const nW=runUntil(()=>p.catchWindow<=0, 400); const cd0=p.catchCd; key('KeyF'); run(1); const blocked=g.lastPressResult; const wDuring=p.catchWindow;
        const nC=runUntil(()=>p.catchCd<=0, 400);
        return {window0:r2(w0), windowSteps:nW, cooldown:r2(cd0), pressDuringCd:blocked, windowDuringCd:wDuring, cooldownSteps:nC}""")
    rec("11 Catch window 0.8 s, cooldown 0.5 s after a miss, presses during the cooldown do not open a window",
        abs(cd["windowSteps"] / 120 + 1 / 120 - 0.8) < 0.02 and cd["cooldown"] == 0.5 and cd["pressDuringCd"] == "cooldown" and cd["windowDuringCd"] <= 0 and abs(cd["cooldownSteps"] / 120 - 0.5) < 0.03, json.dumps(cd))

    # ---- no catching through panels / from behind; CPU uses its own parameters
    oc = await ev(pg, """clean(); const p=g.player, d=g.disc; p.pos.copy(canon(-6,-L,0)); g.player.yaw=-Math.PI/2; g.player.pitch=0; run(1);
        const e=p.eye(), aim=g.forward(); const P={id:'T', center:e.clone().addScaledVector(aim,1.2), q:new THREE.Quaternion().setFromUnitVectors(V(0,0,1),aim), half:V(1,1,0.08)}; P.qi=P.q.clone().invert(); d.panels=[P];
        const through=e.clone().addScaledVector(aim,2.5); d.state='FLYING'; d.lastShooter='cpu'; d.shotAge=1; d.pos.copy(through); d.prevPos.copy(through); d.vel.copy(aim).multiplyScalar(-16);
        const blocked=__RICO.segHit(e, through, P); const r=g.catchEval('player'); d.panels=[]; const rFree=g.catchEval('player');
        // CPU: same geometry 2.8 m in front: player rules (3.0 m) say ok, CPU rules (2.6 m) say no
        clean(); const a=g.cpuA; a.pos.copy(canon(6,-L,0)); g.cpu.facingDir.copy(g.gravity.teamDir('cyan')); const ce=a.eye();
        d.state='FLYING'; d.lastShooter='player'; d.shotAge=1; d.pos.copy(ce).addScaledVector(g.cpu.facingDir,2.8); d.prevPos.copy(d.pos); d.vel.copy(g.cpu.facingDir).multiplyScalar(-16);
        const rc=g.catchEval('cpu'); const cpuCfg=__RICO.CPU_CATCH; clean();
        return {panelBetween:blocked, reason:r.reason, withoutPanel:rFree.reason, cpu:rc.reason, cpuCfg}""")
    rec("12 No catch through a panel; CPU has its own catch parameters (2.6 m / 60 deg / 0.5 s / 0.8 s)",
        oc["panelBetween"] and oc["reason"] == "occluded" and oc["withoutPanel"] == "ok" and oc["cpu"] == "distance" and oc["cpuCfg"]["range"] == 2.6, json.dumps(oc))

    # ---- air catch with the same rules
    ac = await ev(pg, """clean(); const p=g.player; p.pos.copy(canon(-6,-L,0)); g.player.yaw=-Math.PI/2; g.player.pitch=0; run(1); p.tryJump(g.goals); runUntil(()=>p.vy<0.6, 200);
        const e=p.eye(); shootFrom(e.clone().add(V(7,0.3,0.4)), e, 'cpu'); key('KeyF'); runUntil(()=>g.disc.state!=='FLYING', 200);
        const l=g.log.find(l=>l.type==='catch'); return {caught:p.holding, airborne:l?l.airborne:null, height:r2(p.pos.y+L)}""")
    rec("13 Air catch uses the same rules", ac["caught"] and ac["airborne"], json.dumps(ac))

    # ---- debug overlay with the failure reason
    dbg = await ev(pg, """g.debug=true; g.ui.debugVisible(true); clean(); const p=g.player; p.pos.copy(canon(-6,-L,0)); run(1);
        shootFrom(canon(8,-5,8), canon(8,-5,-8), 'cpu'); run(5); g.ui.debugCatch(g); const t=document.getElementById('debug').textContent;
        const visible=!document.getElementById('debug').classList.contains('hidden'); g.debug=false; g.ui.debugVisible(false); clean(); return {visible, t}""")
    rec("14 Debug display shows why a catch fails", dbg["visible"] and "距離が遠い" in dbg["t"] and "GRAV" in dbg["t"], dbg["t"].replace("\n", " | ")[:300])

    # ---- double jump + wall kick, one air action per airtime
    wk = await ev(pg, """const out={}; clean(); const p=g.player; p.pos.copy(canon(-6,-L,0)); run(1);
        out.j1=p.tryJump(g.goals); run(30); out.j2=p.tryJump(g.goals); run(10); out.j3=p.tryJump(g.goals); runUntil(()=>p.grounded,600);
        clean(); p.pos.copy(canon(-4,-L,W-0.45)); run(1); p.tryJump(g.goals); run(25); const v0=p.vel.clone(); const r=p.tryJump(g.goals); if(r==='kick') g.onWallKick(p,'player');
        out.kick=r; out.kickVz=r2(p.vel.z); out.kickVup=r2(p.vel.dot(p.up)); run(10); out.after=p.tryJump(g.goals);
        // after a gravity shift (k=1): kick off the old floor, which is now a wall; gravity is -x
        clean(1); p.pos.copy(canon(-5,-L,5)); run(1); p.pos.copy(canon(-L+0.9,-L+4,5)); p.vel.set(0,0,0); p.grounded=false; p.airJumps=1; p.wallKicks=0; run(1);
        const up=p.up.clone(); const r1=p.tryJump(g.goals); const nWall=g.gravity.localFromCanon(V(1,0,0));
        out.k1={kick:r1, up:up.toArray().map(r2), away:r2(p.vel.dot(nWall)), alongUp:r2(p.vel.dot(up))};
        clean(); return out""")
    rec("15 Double jump; wall kick near a wall; one air action per airtime; wall kick follows the current gravity",
        wk["j1"] == 1 and wk["j2"] == 2 and not wk["j3"] and wk["kick"] == "kick" and wk["kickVz"] <= -8 and wk["kickVup"] >= 2.5 and not wk["after"]
        and wk["k1"]["kick"] == "kick" and wk["k1"]["away"] >= 8 and wk["k1"]["alongUp"] >= 2.5 and abs(wk["k1"]["up"][0] + 1) < 1e-6, json.dumps(wk))

    # ---- gravity shift timeline (pure logic, fresh system)
    gt = await ev(pg, """const G=g.gravity.constructor; const evs=[]; const s=new G((t,p)=>evs.push({t:r2(s.clock),type:t,...p})); s.enabled=true; // the system is kept (off in matches since v2.6.1)
        let maxUpErr=0, prevA=0, mono=true, angleAt={}; for (let i=0;i<120*95;i++){ s.update(1/120); const u=s.up(); maxUpErr=Math.max(maxUpErr,Math.abs(u.length()-1));
          if (s.angle>prevA+1e-9) mono=false; prevA=s.angle; for (const t of [30,33,36,37,60,66,90,96]) if (Math.abs(s.clock-t)<1/240) angleAt[t]=r2(s.angle*180/Math.PI); }
        return {evs:evs.filter(e=>e.type!=='GRAVITY_SHIFT_COUNT').slice(0,9), counts:evs.filter(e=>e.type==='GRAVITY_SHIFT_COUNT').slice(0,2), maxUpErr, mono, angleAt, k:s.k}""")
    st_ = [e for e in gt["evs"] if e["type"] == "GRAVITY_SHIFT_STARTED"]; co = [e for e in gt["evs"] if e["type"] == "GRAVITY_SHIFT_COMPLETED"]; wa = [e for e in gt["evs"] if e["type"] == "GRAVITY_SHIFT_WARNING"]
    rec("16 Gravity shift every 30 s: 2 s warning, 90 deg in 6 s, 1 s settle, constant gravity strength",
        abs(wa[0]["t"] - 28) < 0.02 and abs(st_[0]["t"] - 30) < 0.02 and abs(co[0]["t"] - 36) < 0.02 and abs(st_[1]["t"] - 60) < 0.02 and gt["angleAt"]["36"] == -90 and gt["angleAt"]["66"] == -180
        and abs(gt["angleAt"]["33"] + 45) < 0.6 and gt["maxUpErr"] < 1e-9 and gt["mono"] and gt["k"] == 2 and [c["sec"] for c in gt["counts"]] == [2, 1],
        json.dumps(gt)[:600])

    # ---- the wall becomes the floor; jumping follows the new gravity; the disc falls to the new floor
    nf = await ev(pg, """clean(); const p=g.player; const gr=g.gravity; gr.enabled=true; gr.clock=29.9; noKeepers();
        g.disc.reset(); g.disc.pos.z=6; g.disc.prevPos.copy(g.disc.pos); run(120*8); const up=g.up();
        const out={k:gr.k, phase:gr.phase, up:up.toArray().map(r2), grounded:p.grounded, face:p.floorFace&&p.floorFace.id, feetHeight:r2(p.pos.dot(up)+L), discState:g.disc.state, discHeight:r2(g.disc.pos.dot(up)+L)};
        p.tryJump(g.goals); run(1); out.jumpAlongUp=r2(p.vel.dot(up)); out.jumpSide=r2(p.vel.clone().addScaledVector(up,-p.vel.dot(up)).length());
        runUntil(()=>p.grounded,600); out.landedFace=p.floorFace&&p.floorFace.id; gr.enabled=false; clean(); return out""")
    rec("17 After a shift the old right wall is the floor (player, disc), jump goes along the new up",
        nf["k"] == 1 and nf["face"] == "px" and nf["grounded"] and abs(nf["feetHeight"]) < 0.01 and nf["up"] == [-1, 0, 0] and nf["discState"] in ("NEUTRAL", "LOOSE") and nf["discHeight"] < 0.5
        and abs(nf["jumpAlongUp"] - 11) < 0.3 and nf["jumpSide"] < 0.5 and nf["landedFace"] == "px", json.dumps(nf))

    # ---- control during the rotation and camera behaviour
    cr = await ev(pg, """const trial=(hold)=>{ clean(); const p=g.player, gr=g.gravity; gr.enabled=true; gr.clock=29.99; noKeepers(); p.yaw=-Math.PI/2; p.pitch=0;
          if (hold) g.input.keys.add('KeyD'); let maxJump=0, nan=false, outside=0, prevQ=null, groundedFrames=0;
          for (let i=0;i<120*7;i++){ run(1); g.syncCamera(1/120); const q=g.camera.quaternion.clone(); if(prevQ) maxJump=Math.max(maxJump, q.angleTo(prevQ)*180/Math.PI); prevQ=q;
            const c=g.room.worldToLocal(g.camera.position.clone()); if (![c.x,c.y,c.z].every(Number.isFinite)) nan=true;
            if (Math.abs(c.x)>L+0.05||Math.abs(c.y)>L+0.05||Math.abs(c.z)>W+0.05) outside++; if (p.grounded) groundedFrames++; }
          g.input.keys.delete('KeyD'); const pos=p.pos.clone(); gr.enabled=false; return {pos, maxJump, nan, outside, groundedFrames}; };
        const a=trial(false), b=trial(true); clean();
        return {moved:r2(a.pos.distanceTo(b.pos)), dz:r2(b.pos.z-a.pos.z), camMaxDegPerStep:r2(Math.max(a.maxJump,b.maxJump)), nan:a.nan||b.nan, camOutside:a.outside+b.outside, groundedFramesDuringTurn:a.groundedFrames}""")
    rec("18 Player can steer during the rotation; camera stays smooth (no snaps), finite and inside the room",
        cr["moved"] > 1 and not cr["nan"] and cr["camOutside"] == 0 and cr["camMaxDegPerStep"] < 1.5, json.dumps(cr))

    # ---- panels: what you see is what the disc hits
    pv = await ev(pg, """clean(); withPanels(); const cols=g.disc.panels, res=[];
        for (const a of g.arena.anim.panels){ const c=cols.find(q=>q.id===a.id); const grp=a.group; grp.updateMatrix();
          const dp=grp.position.distanceTo(c.center), dq=grp.quaternion.angleTo(c.q)*180/Math.PI; const geo=grp.children[0].geometry; geo.computeBoundingBox(); const s=geo.boundingBox.getSize(V(0,0,0));
          res.push({id:a.id, dp:+dp.toFixed(4), dq:+dq.toFixed(3), size:s.toArray().map(r2), half2:c.half.clone().multiplyScalar(2).toArray().map(r2)}); }
        // shoot at the centre of C2 along its normal from 4 m: bounce at the panel surface
        const P=cols.find(q=>q.id==='C2'); const n=V(0,0,1).applyQuaternion(P.q); if (n.y<0) n.negate(); const o=P.center.clone().addScaledVector(n,4);
        shootFrom(o, P.center, 'player'); let hitAt=null; for(let i=0;i<200 && !hitAt;i++){ run(1); const b=g.log.find(l=>l.type==='bounce'); if(b) hitAt={surface:b.surface, dist:r2(g.disc.pos.distanceTo(P.center))}; }
        clean(); return {panels:res, hitAt, expect:r2(P.half.z+C.DISC_RADIUS)}""")
    pv_ok = all(r["dp"] < 1e-3 and r["dq"] < 0.01 and r["size"] == r["half2"] for r in pv["panels"]) and pv["hitAt"] and pv["hitAt"]["surface"] == "C2" and abs(pv["hitAt"]["dist"] - pv["expect"]) < 0.25
    rec("19 Panel visuals = panel collision (position, angle, size, bounce point); fixed, asymmetric", pv_ok and len(pv["panels"]) == 6, json.dumps(pv)[:700])

    # ---- 4-face goals: active pair left/right of the floor, 2 m above it; inactive mouths never score
    fg = await ev(pg, """const out=[];
      for (let k=0;k<4;k++){ clean(k); noKeepers(); const act=g.goals.active(), up=g.up();
        const wl=g.gravity.toWorldDir(act.cyan.normal), wr=g.gravity.toWorldDir(act.pink.normal);
        const h=(m)=>r2(m.center.dot(up)+L);
        // score into the active pink mouth (player shot)
        const o=canon(-2,-L+2,0.5); shootFrom(o, act.pink.center.clone().add(V(0,0,0.3)), 'player'); flyUntilDone(); const goal=g.log.find(l=>l.type==='goal');
        // shoot into an inactive mouth on the same face (next to the ceiling)
        clean(k); noKeepers(); const other=g.goals.mouths.find(m=>m.faceKey===act.pink.faceKey && m!==act.pink);
        shootFrom(canon(-2,L-2,0.5), other.center.clone().add(V(0,0,0.3)), 'player'); flyUntilDone(400); const g2=g.log.find(l=>l.type==='goal');
        const kp=g.keepers.map(kk=>({team:kk.team, mouth:kk.mouth.id, feet:r2(kk.feet().dot(up)+L)}));
        out.push({k, cyan:act.cyan.id, pink:act.pink.id, cyanWorldX:r2(wl.x), pinkWorldX:r2(wr.x), hCyan:h(act.cyan), hPink:h(act.pink), goal:goal?{mouth:goal.mouth, value:goal.value}:null, inactive:other.id, inactiveGoal:!!g2, keepers:kp}); }
      clean(); return out""")
    fg_ok = all(r["cyanWorldX"] == -1 and r["pinkWorldX"] == 1 and r["hCyan"] == 2.0 and r["hPink"] == 2.0 and r["goal"] and r["goal"]["mouth"] == r["pink"] and not r["inactiveGoal"]
                and all(k["feet"] == 0 or abs(k["feet"] - 1.6) < 3 for k in r["keepers"]) and [k["mouth"] for k in r["keepers"]] == [r["cyan"], r["pink"]] for r in fg) and len({r["pink"] for r in fg}) == 4
    rec("20 Four goal faces: active pair = world-left (CYAN) / world-right (PINK) of the current floor, 2.0 m up; inactive mouths never score; keepers move with them",
        fg_ok, json.dumps(fg)[:900])

    # ---- the old pair stays active during the rotation, switches at completion
    gr_ = await ev(pg, """clean(); noKeepers(); const gr=g.gravity; gr.enabled=true; gr.clock=31.0; run(1); const old=g.goals.active().pink.id; const ph=gr.phase;
        const m=g.goals.active().pink; const tgt=m.center.clone(); shootFrom(tgt.clone().addScaledVector(m.normal,-5), tgt, 'player'); flyUntilDone(); const goal=g.log.find(l=>l.type==='goal');
        runUntil(()=>g.state==='playing' && !gr.rotating, 1200); const now=g.goals.active().pink.id; gr.enabled=false;
        const r={phase:ph, activeDuring:old, goalDuring:goal?goal.mouth:null, activeAfter:now, k:gr.k}; clean(); return r""")
    rec("21 During the rotation the previous goals stay active; the new pair takes over when it completes",
        gr_["phase"] == "rotating" and gr_["goalDuring"] == gr_["activeDuring"] == "+x|-y" and gr_["activeAfter"] == "+y|+x" and gr_["k"] == 1, json.dumps(gr_))

    # ---- keepers
    kp = await ev(pg, """clean(); const k=g.keepers[1], f=k.frame; const o=k.feet().clone(); let maxOff=0, minZ=9, maxZ=-9;
        for (let i=0;i<120*4;i++){ g.matchClock+=1/120; k.update(1/120,g.matchClock); const d=k.feet().clone().sub(o); maxOff=Math.max(maxOff, Math.abs(d.dot(f.up)), Math.abs(d.dot(f.front))); minZ=Math.min(minZ,k.z); maxZ=Math.max(maxZ,k.z); }
        // not tracking: same clock, different disc positions -> same keeper position
        const t=g.matchClock; g.disc.pos.set(9,-9,6); k.update(0,t); const z1=k.z; g.disc.pos.set(9,-9,-6); k.update(0,t); const z2=k.z;
        // hitbox vs visuals: joints of the rendered model must be inside the hitbox, 0.4 m outside must not
        k.update(0,t); k.place && k.place(); k.char.root.updateMatrixWorld(true); const J=k.char.j; const room=g.room; const pts={};
        for (const nm of ['handL','handR','head','footL','footR','spine']){ const w=J[nm].getWorldPosition(V(0,0,0)); const p=room.worldToLocal(w); const hit=k.hitTest(p,0); const out=p.clone().addScaledVector(f.front,-0.45).addScaledVector(f.up, nm.startsWith('foot')?0:0); pts[nm]={hit:hit?hit.part:null, outside:!!k.hitTest(p.clone().addScaledVector(f.front,0.45),0) || !!k.hitTest(p.clone().addScaledVector(f.front,-0.45),0)}; }
        // how much of the goal does the keeper cover (disc radius), centred keeper; upper half vs lower half
        const m=k.mouth; let up=0,lo=0,nu=0,nl=0; k.z=0; const save=k.update; k.update(0,(Math.PI*0)/1); const zs=k.z;
        for (let a=-1.4;a<=1.4;a+=0.1) for (let b=-1.4;b<=1.4;b+=0.1){ if (a*a+b*b>1.45*1.45) continue; const p=m.center.clone().addScaledVector(f.lat,a).addScaledVector(f.up,b).addScaledVector(m.normal,-(C.KEEPER_DEPTH-0.0));
          const hit=!!k.hitTest(p,C.DISC_RADIUS); if (b>0){nu++; if(hit) up++;} else {nl++; if(hit) lo++;} }
        return {lateralOnlyMaxOffAxis:+maxOff.toFixed(5), zRange:[r2(minZ),r2(maxZ)], notTracking:z1===z2, joints:pts, coverUpper:r2(up/nu), coverLower:r2(lo/nl), keeperZ:r2(zs), reachTop:r2(k.hb.reachTop), scale:C.KEEPER_SCALE}""")
    joints_ok = all(v["hit"] for k_, v in kp["joints"].items() if k_ != "spine")
    rec("22 Keepers: left/right only, ignore the disc, 3D hitbox matches the model, cover part of the goal incl. the upper half (air shots)",
        kp["lateralOnlyMaxOffAxis"] < 1e-6 and kp["notTracking"] and joints_ok and 0.05 < kp["coverUpper"] < 0.7 and kp["coverLower"] < 0.8, json.dumps(kp))

    # ---- 1 / 2 / 3 points
    pts = await ev(pg, """const res={}; const a=W-C.DISC_RADIUS;
      for (const [name, zf] of [['direct', z=>z], ['one', z=>2*a-z], ['two', z=>4*a+z]]) { clean(); noKeepers(); const m=g.goals.active().pink; const o=canon(0.5,-L+2.0,-0.4);
        const t=m.center.clone(); t.z=zf(0.2); shootFrom(o, t, 'player'); flyUntilDone(); const goal=g.log.find(l=>l.type==='goal');
        res[name]={value:goal?goal.value:0, bounces:g.log.filter(l=>l.type==='bounce').map(l=>l.surface), score:g.score.cyan}; }
      clean(); return res""")
    rec("23 Scoring: direct 1 point, one ricochet 2 points, two ricochets 3 points", pts["direct"]["value"] == 1 and pts["one"]["value"] == 2 and pts["two"]["value"] == 3, json.dumps(pts))

    # ---- half line + warp after a shift
    hl = await ev(pg, """clean(); const p=g.player; p.yaw=-Math.PI/2; p.pitch=0; g.input.keys.add('KeyW'); run(120*3); g.input.keys.delete('KeyW'); const x=r2(p.pos.x);
        clean(); const gr=g.gravity; gr.enabled=true; gr.clock=33; run(1); p.pos.set(5,4,2); p.vel.set(0,0,0); runUntil(()=>gr.k===1, 900); run(2);
        const w=g.log.find(l=>l.type==='warp' && l.who==='player'); const side=r2(p.pos.dot(g.gravity.teamDir('cyan'))); gr.enabled=false; clean(); return {maxX:x, gap:C.HALF_LINE_GAP, warped:!!w, ownSide:side}""")
    rec("24 Half line blocks the player; anyone on the wrong side when a shift ends warps to their own half", hl["maxX"] <= -hl["gap"] + 1e-6 and hl["warped"] and hl["ownSide"] > 1, json.dumps(hl))

    # ---- motion graphics: every event shows its graphic once, can be skipped, reduced motion
    mg = await ev(pg, """clean(); const B=g.bus, Q=(s)=>document.querySelectorAll('#motion '+s+':not(.off)').length; const out={};
        B.emit('DISC_CAUGHT',{who:'player',rescued:false}); out.catch=Q('.mg.catch');
        B.emit('DISC_BOUNCED',{count:1,surface:'nz',rim:false}); out.bounce=Q('.mg.bounce');
        B.emit('WALL_KICK_USED',{who:'player',wall:'nz'}); out.kick=Q('.mg.kick');
        B.emit('GOAL_SAVED',{team:'pink',part:'armL'}); out.block=Q('.mg.block');
        B.emit('GRAVITY_SHIFT_COUNT',{sec:2}); out.warnText=(document.querySelector('#motion .mg.warn')||{}).textContent;
        B.emit('GRAVITY_SHIFT_STARTED',{k:0}); out.shift=(document.querySelector('#motion .mg.shift')||{}).textContent;
        B.emit('GOAL_SCORED',{team:'cyan',goalTeam:'pink',value:2,bounces:1,own:false,mouth:'+x|-y'}); B.emit('GOAL_SCORED',{team:'cyan',goalTeam:'pink',value:2,bounces:1,own:false,mouth:'+x|-y'});
        out.goals=Q('.mg.goal'); out.shiftAfterGoal=Q('.mg.shift'); out.stageSlots=document.querySelectorAll('#motion [data-slot=stage]').length;
        g.ui.newFloor(); out.newFloor=(document.querySelector('#motion .mg.floor')||{}).textContent;
        g.ui.matchEnd(3,2); out.end=(document.querySelector('#motion .mg.end')||{}).textContent;
        g.score.cyan=0; g.score.pink=0; g.state='playing'; return out""")
    await pg.keyboard.press("Enter")
    skipped = await ev(pg, "return document.querySelectorAll('#motion .mg:not(.off)').length")
    await ev(pg, "const o=document.getElementById('optReduceMotion'); o.checked=true; o.onchange()")
    rm = await ev(pg, """const rmClass=document.body.classList.contains('reduce-motion'); g.ui.goal('cyan',1,0,false); const el=document.querySelector('#motion .goalFx b'); const an=getComputedStyle(el).animationName;
        g.ui.skipAnimations(); document.getElementById('optReduceMotion').checked=false; document.getElementById('optReduceMotion').onchange(); return {rmClass, anim:an, plain:getComputedStyle(document.querySelector('#motion [data-slot=stage]')).animationName}""")
    rec("25 Motion UI: catch / bounce / wall kick / block / goal / shift warning / GRAVITY SHIFT / NEW FLOOR / match end; one per slot; Enter skips; reduced motion",
        mg["catch"] == 1 and mg["bounce"] == 1 and mg["kick"] == 1 and mg["block"] == 1 and "ARENA SHIFT IN 2" in (mg["warnText"] or "") and "GRAVITY SHIFT" in (mg["shift"] or "")
        and mg["goals"] == 1 and mg["stageSlots"] == 1 and "NEW FLOOR" in (mg["newFloor"] or "") and "YOU WIN" in (mg["end"] or "") and skipped == 0 and rm["rmClass"] and rm["anim"] == "fadeOut",
        json.dumps({**mg, "afterEnter": skipped, **rm}, ensure_ascii=False))

    # ---- crosshair shows "catchable" exactly when the catch test passes
    ch = await ev(pg, """clean(); const p=g.player; p.pos.copy(canon(-6,-L,0)); g.player.yaw=-Math.PI/2; g.player.pitch=0; run(1); const e=p.eye();
        shootFrom(e.clone().add(V(8,0,0.3)), e, 'cpu'); let agree=0, tot=0, seenOn=false; for (let i=0;i<60 && g.disc.state==='FLYING';i++){ run(1); g.ui.update(1/120,g);
          const on=document.getElementById('cross').classList.contains('catchable'); if (on) seenOn=true; tot++; if (on===(g.catchEval('player').ok && g.canOpenWindow(p).ok)) agree++; }
        clean(); return {agree, tot, seenOn}""")
    rec("26 Crosshair 'catchable' state = the real catch test", ch["seenOn"] and ch["agree"] == ch["tot"], json.dumps(ch))

    # ---- full 3-minute match vs CPU with a simple bot for the player
    fm = await ev(pg, """clean(); g.resetMatch(false); g.state='playing'; g.cpuFrozen=false; g.disc.panels=g._allPanels; const shiftOn=g.gravity.enabled; g.log.length=0; g.bus.log.length=0;
        const p=g.player; let steps=0, nan=0, outside=0, maxOver=-99, worst=null, discOutside=0, minCpuGap=99, shootT=0, phases={};
        while (g.state!=='ended' && steps<120*300){
          // bot: catch when catchable, carry and shoot at the active pink goal, otherwise chase the disc in its own half
          const d=g.disc; const act=g.goals.active();
          if (d.state==='FLYING' && d.lastShooter==='cpu') { aimAt(d.pos); if (g.catchable) g.input.press('catch'); }
          else if (p.holding) { shootT+=1/120; aimAt(act.pink.center.clone().add(V(0,0,(steps%3-1)*0.8))); if (shootT>0.6){ g.input.press('shoot'); shootT=0; } }
          else if (d.state==='LOOSE'||d.state==='NEUTRAL'||d.state==='FALLING'){ const t=d.pos.clone(); aimAt(t); g.input.keys.add('KeyW'); }
          if (!(d.state==='LOOSE'||d.state==='NEUTRAL'||d.state==='FALLING') || p.holding) g.input.keys.delete('KeyW');
          g.step(1/120); steps++; phases[g.gravity.phase]=(phases[g.gravity.phase]||0)+1;
          for (const a of [p,g.cpuA]){ if (![a.pos.x,a.pos.y,a.pos.z].every(Number.isFinite)) nan++; const R0=C.PLAYER_RADIUS, c1=a.pos.clone().addScaledVector(a.up,R0), c2=a.pos.clone().addScaledVector(a.up,C.PLAYER_HEIGHT-R0); let ov=-9; for (const c of [c1,c2]) ov=Math.max(ov, Math.abs(c.x)+R0-L, Math.abs(c.y)+R0-L, Math.abs(c.z)+R0-W); maxOver=Math.max(maxOver,ov); if (ov>0.05) { outside++; if (!worst || ov>worst.ov) worst={ov:r2(ov), who:a===p?'player':'cpu', phase:g.gravity.phase, t:r2(steps/120)}; } }
          if (Math.abs(d.pos.x)>L||Math.abs(d.pos.y)>L||Math.abs(d.pos.z)>W) discOutside++;
          if (g.state==='playing' && g.gravity.halfLineActive && !g.gravity.rotating) minCpuGap=Math.min(minCpuGap, g.cpuA.pos.dot(g.gravity.teamDir('pink')));
        }
        g.input.keys.clear(); const s=g.stats; const hiddenMouths=g.arena.anim.mouths.filter(m=>!m.group.visible).length; const evs={}; for (const e of g.bus.log) evs[e.type]=(evs[e.type]||0)+1;
        const r={state:g.state, seconds:r2(steps/120), score:{...g.score}, shifts:s.shifts, k:g.gravity.k, playerShots:s.shots, catches:s.catches, cpuShots:s.cpuShots, cpuGoals:s.cpuGoals, goals:s.goals, wallKicks:s.wallKicks, warps:s.warps, nan, outside, capsuleMaxPenetration:r2(maxOver), worst, discOutside, cpuHalfGap:r2(minCpuGap), events:evs, shiftOn, hiddenMouths, result:document.getElementById('menuResult').classList.contains('hidden')?'hidden':'shown'};
        g.gravity.enabled=false; return r""")
    rec("27 Full 3-minute match vs CPU (v2.6.1: no rotation, unused goal mouths hidden; both sides shoot/catch/score, result screen)",
        fm["state"] == "ended" and fm["shifts"] == 0 and not fm["shiftOn"] and fm["hiddenMouths"] == 6 and fm["nan"] == 0 and fm["outside"] == 0 and fm["discOutside"] == 0 and fm["cpuShots"] > 3 and fm["playerShots"] > 3 and fm["result"] == "shown" and fm["cpuHalfGap"] >= 0.39,
        json.dumps(fm))

    # ---- render budget + JS errors
    await ev(pg, "g.state='playing'; g.ui.menu(null); clean()")
    rs = await ev(pg, "g.updateVisuals(1/60,true); g.render(); const i=g.renderer.info.render; return {calls:i.calls, triangles:i.triangles}")
    rec("28 Render budget (draw calls / triangles of the last pass)", rs["calls"] < 400, json.dumps(rs))
    await pg.screenshot(path="/tmp/claude-0/test_desktop_end.png", timeout=170000)
    rec("29 No JavaScript errors during the whole desktop session", not errors, str(errors[:5]))
    await b.close()

async def mobile(p):
    b = await p.chromium.launch(args=ARGS)
    ctx = await b.new_context(viewport={"width": 844, "height": 390}, is_mobile=True, has_touch=True, device_scale_factor=2)
    pg = await ctx.new_page()
    errors = []
    pg.on("pageerror", lambda e: errors.append(str(e)))
    await pg.goto(BASE + "index.html?test=1")
    await pg.wait_for_function("window.__RICO !== undefined", timeout=120000)
    await pg.evaluate(HELPERS)
    touch = await ev(pg, "return g.isTouch")
    await pg.tap("#start")
    await ev(pg, "run(330)")
    st = await ev(pg, "return g.state")
    vis = await pg.is_visible("#tShoot") and await pg.is_visible("#stick")
    sb = await (await pg.query_selector("#stick")).bounding_box()
    cx, cy = sb["x"] + sb["width"] / 2, sb["y"] + sb["height"] / 2
    mv = await pg.evaluate("""([cx,cy]) => { const {g,run,clean}=window.TT; clean(); g.player.yaw=-Math.PI/2; const s=document.getElementById('stick'); const x0=g.player.pos.x;
        const mk=(type,x,y)=>new PointerEvent(type,{pointerId:7,pointerType:'touch',clientX:x,clientY:y,bubbles:true,isPrimary:true});
        s.dispatchEvent(mk('pointerdown',cx,cy)); s.dispatchEvent(mk('pointermove',cx,cy-60)); run(60); const dx=g.player.pos.x-x0; s.dispatchEvent(mk('pointerup',cx,cy-60)); run(1);
        return {dx} }""", [cx, cy])
    await pg.tap("#tJump")
    jp = await ev(pg, "run(2); const air=!g.player.grounded; runUntil(()=>g.player.grounded); return air")
    # catch button: CPU shot at the player, tap CATCH
    await ev(pg, "clean(); const p=g.player; p.pos.copy(canon(-6,-L,0)); g.player.yaw=-Math.PI/2; g.player.pitch=0; run(1); const e=p.eye(); shootFrom(e.clone().add(V(9,0,0.4)), e, 'cpu'); runUntil(()=>g.catchable, 200); g.ui.update(0.01,g)")
    hot = await pg.evaluate("document.getElementById('tCatch').classList.contains('hot')")
    await pg.tap("#tCatch")
    ct = await ev(pg, "runUntil(()=>g.disc.state!=='FLYING', 200); return g.player.holding")
    await ev(pg, "g.suction=null")
    await pg.tap("#tShoot")
    sh = await ev(pg, "run(1); return g.disc.state")
    lk = await pg.evaluate("""() => { const {g,run}=window.TT; const c=g.renderer.domElement; const y0=g.player.yaw;
        const mk=(type,x,y)=>new PointerEvent(type,{pointerId:9,pointerType:'touch',clientX:x,clientY:y,bubbles:true});
        c.dispatchEvent(mk('pointerdown',600,200)); c.dispatchEvent(mk('pointermove',660,200)); run(1); c.dispatchEvent(mk('pointerup',660,200)); return g.player.yaw-y0 }""")
    ov = await pg.evaluate("""() => { const r=id=>document.getElementById(id).getBoundingClientRect(); const hit=(a,b)=>!(a.right<b.left||a.left>b.right||a.bottom<b.top||a.top>b.bottom);
        const btns=['tShoot','tCatch','tDash','tJump','stick'].map(r); const score=r('scorebar'), cross=r('cross');
        return {scoreOverlap:btns.some(b=>hit(b,score)), crossOverlap:btns.some(b=>hit(b,cross))} }""")
    # tap on a motion graphic skips it
    await ev(pg, "g.ui.goal('cyan',1,0,false)")
    await pg.tap("#motion .mg.goal b")
    tapskip = await ev(pg, "return document.querySelectorAll('#motion .mg:not(.off)').length")
    await pg.tap("#btnPause")
    mp = await ev(pg, "return g.state")
    await pg.tap("#resume")
    mr = await ev(pg, "return g.state")
    await ev(pg, "clean(); g.ui.skipAnimations(); g.updateVisuals(1/60,true); g.render(); g.ui.update(0.01,g)")
    await pg.screenshot(path="/tmp/claude-0/test_mobile.png", timeout=170000)
    rec("30 Mobile landscape: touch UI, joystick, jump, CATCH button (glows when catchable), shoot, look, tap-to-skip, pause",
        touch and st == "playing" and vis and mv["dx"] > 3 and jp and hot and ct and sh == "FLYING" and abs(lk) > 0.1 and not ov["scoreOverlap"] and not ov["crossOverlap"] and tapskip == 0 and mp == "paused" and mr == "playing" and not errors,
        f"isTouch={touch}, state={st}, buttons={vis}, stick dx={mv['dx']:.2f} m, jump={jp}, catch glow={hot}, catch={ct}, shoot->{sh}, look={lk:.3f}, overlaps={ov}, tap skip left={tapskip}, II->{mp}, resume->{mr}, errors={errors[:3]}")
    await b.close()

async def filetest(p):
    """Opening index.html straight from disk (file://) must work too (no server, no network)."""
    b = await p.chromium.launch(args=ARGS)
    pg = await b.new_page(viewport={"width": 800, "height": 450})
    errors = []
    pg.on("pageerror", lambda e: errors.append(str(e)))
    path = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "index.html"))
    await pg.goto("file://" + path + "?test=1")
    await pg.wait_for_function("window.__RICO !== undefined", timeout=120000)
    await pg.click("#start")
    st = await pg.evaluate("() => { const g=__RICO.game; for (let i=0;i<330;i++) g.step(1/120); return g.state }")
    rec("31 Runs from file:// (offline, no server)", st == "playing" and not errors, f"state={st}, errors={errors[:3]}")
    await b.close()

async def main():
    async with async_playwright() as p:
        if not os.environ.get('MOBILE_ONLY'): await desktop(p)
        await mobile(p)
        await filetest(p)
    passed = sum(r["pass"] for r in RESULTS)
    print(f"\n{passed}/{len(RESULTS)} passed")
    with open("tests/results.json", "w") as f: json.dump(RESULTS, f, indent=1, ensure_ascii=False)

asyncio.run(main())
