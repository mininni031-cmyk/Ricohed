// UIManager: HUD, motion-graphics layer, menus, debug overlay. Writes to the DOM only when values change.
// Motion graphics are CSS animations driven by classes; every one is
//  - short (<= 1.6 s) and skippable (Enter / Tab / tap on the banner),
//  - slot based: a new banner in the same slot replaces the old one (no stacking),
//  - reduced to a plain fade when body.reduce-motion is set (setting or OS preference).
import { CONFIG, CATCH, WALL_KICK } from './config.js';
import { portraitDataURL } from './faces.js';
import { PALETTES } from './character.js';
import { REASON_JA } from './catch.js';

const $ = (id) => document.getElementById(id);
const TEAMNAME = { cyan: 'TEAM CYAN', pink: 'TEAM PINK' };

export class UIManager {
  constructor(isTouch) {
    this.isTouch = isTouch;
    this.cache = new Map();
    this.calloutTimer = 0; this.chipTimer = 0; this.flash = 0; this.flashColor = '#ffffff';
    this.slots = {}; // slot -> { el, t }
    this.comfort = 0;
    $('portrait').style.backgroundImage = `url(${portraitDataURL(PALETTES.player, '#1b2140', '#4a64c8')})`;
    if (isTouch) { $('touch').classList.remove('hidden'); }
    const motion = $('motion');
    if (motion) motion.addEventListener('pointerdown', (e) => { if (e.target.closest('.mg')) { e.preventDefault(); this.skipAnimations(); } });
  }
  set(id, prop, value) {
    const key = id + '|' + prop;
    if (this.cache.get(key) === value) return;
    this.cache.set(key, value);
    const el = $(id); if (!el) return;
    if (prop === 'text') el.textContent = value;
    else if (prop === 'html') el.innerHTML = value;
    else if (prop === 'class') el.className = value;
    else if (prop.startsWith('--')) el.style.setProperty(prop, value);
    else el.style[prop] = value;
  }
  showHUD(on) { $('hud').classList.toggle('hidden', !on); if (this.isTouch) $('touch').classList.toggle('hidden', !on); if (!on) this.skipAnimations(); }

  menu(which) {
    $('overlay').classList.toggle('hidden', !which);
    for (const m of ['menuTitle', 'menuPause', 'menuResult']) $(m).classList.toggle('hidden', m !== which);
  }

  // ------------------------------------------------------------------ motion layer
  /** Show `html` in slot `slot` (one element per slot), animation class `cls`, for `time` seconds. */
  mg(slot, html, cls, time) {
    const host = $('motion'); if (!host) return null;
    let s = this.slots[slot];
    if (!s) { const el = document.createElement('div'); el.dataset.slot = slot; host.appendChild(el); s = this.slots[slot] = { el, t: 0 }; }
    s.el.className = ''; void s.el.offsetWidth; // restart animation
    s.el.innerHTML = html;
    s.el.className = `mg ${slot} ${cls}`;
    s.el.style.setProperty('--dur', time + 's');
    s.t = time;
    return s.el;
  }
  clearSlot(slot) { const s = this.slots[slot]; if (s) { s.el.className = 'mg off'; s.el.innerHTML = ''; s.t = 0; } }
  skipAnimations() { for (const k in this.slots) this.clearSlot(k); $('callout').classList.remove('show'); this.calloutTimer = 0; }
  active(slot) { const s = this.slots[slot]; return !!(s && s.t > 0); }

  /** Match-start: team banners slide in from both sides and crash in the centre. */
  matchIntro() {
    this.mg('stage', `<div class="vs"><div class="side c"><b>${TEAMNAME.cyan}</b><i>YOU</i></div><div class="x">VS</div><div class="side p"><b>${TEAMNAME.pink}</b><i>CPU</i></div></div>`, 'intro', 2.3);
  }
  teamBanners() { this.matchIntro(); }
  catchSuccess(rescued, just = false) {
    this.mg('center', `<div class="catchFx"><span class="ringA"></span><span class="ringB"></span><b>${just ? 'JUST CATCH!' : 'CATCH!'}</b>${rescued ? '<i>LATE SAVE</i>' : ''}</div>`, 'catch', 0.45);
  }
  bounceCount(count, value, rim) {
    if (rim) { this.mg('pop', '<b class="rim">RIM!</b>', 'bounce', 0.6); return; }
    const v = Math.min(3, value);
    this.mg('pop', `<b class="v${v}">${count === 1 ? 'RICOCHET' : count === 2 ? 'DOUBLE' : 'x' + count}</b><i>SHOT VALUE x${v}</i>`, 'bounce', 0.45);
  }
  wallKick() { this.mg('side', '<b>WALL KICK</b>', 'kick', 0.6); }
  block(team) {
    const who = team === 'cyan' ? 'CYAN KEEPER' : 'PINK KEEPER';
    this.mg('center', `<div class="blockFx ${team}"><b>BLOCK!</b><i>${who}</i></div>`, 'block', 0.45);
  }
  goal(team, value, bounces, own) {
    const sub = own ? 'OWN GOAL' : value >= 3 ? 'DOUBLE RICOCHET' : value === 2 ? 'RICOCHET' : 'DIRECT';
    this.mg('stage', `<div class="goalFx ${team}"><div class="stripe"></div><b>GOAL</b><i>${TEAMNAME[team]} +${value} ・ ${sub}</i></div>`, 'goal', 0.9);
  }
  shiftWarning(sec) {
    if (sec <= 0) return;
    this.mg('top', `<div class="shiftWarn"><b>ARENA SHIFT IN ${sec}</b><i>部屋が右に90°回転 → 右の壁が新しい床</i></div>`, 'warn', 1.0);
  }
  shiftStart() {
    this.clearSlot('top');
    this.mg('stage', '<div class="shiftFx"><span class="arrow">↻</span><b>GRAVITY SHIFT</b></div>', 'shift', 1.4);
  }
  newFloor() { this.mg('stage', '<div class="floorFx"><b>NEW FLOOR</b><i>ゴールが切り替わった</i></div>', 'floor', 1.1); }
  matchEnd(c, p) {
    const t = c > p ? 'YOU WIN!' : c < p ? 'CPU WINS' : 'DRAW';
    this.mg('stage', `<div class="endFx"><b>${t}</b><i><span class="c">${c}</span> — <span class="p">${p}</span></i></div>`, 'end', 2.0);
  }

  // ------------------------------------------------------------------ legacy helpers
  callout(main, sub = '', color = 'cyan', time = 1.4) {
    $('calloutMain').textContent = main; $('calloutMain').className = color;
    $('calloutSub').textContent = sub;
    $('callout').classList.add('show'); this.calloutTimer = time;
  }
  chip(text, time = 0.6) { $('bounceChip').textContent = text; $('bounceChip').classList.add('show'); this.chipTimer = time; }
  screenFlash(color, power = 0.6) { this.flashColor = color; this.flash = Math.max(this.flash, document.body.classList.contains('reduce-motion') ? power * 0.4 : power); }
  bumpScore(team) { const el = $(team === 'cyan' ? 'scoreCyan' : 'scorePink'); el.classList.remove('pop'); void el.offsetWidth; el.classList.add('pop'); }
  countdown(text) {
    const el = $('countdown');
    if (!text) { el.classList.remove('show'); return; }
    el.textContent = text; el.className = ''; void el.offsetWidth; el.className = 'show';
  }
  shiftComfort(on, progress) { this.comfort = on ? Math.sin(Math.PI * progress) : 0; }
  speedLines(on) { this.set('fx-speed', 'opacity', on ? '1' : '0'); }

  // ------------------------------------------------------------------ debug
  debugVisible(on) { const el = $('debug'); if (el) el.classList.toggle('hidden', !on); }
  debugCatch(g) {
    const el = $('debug'); if (!el) return;
    const p = g.player, ev = g.lastCatchEval, gr = g.gravity, d = g.disc;
    const act = g.goals.active();
    const lines = [
      `CATCH  ${ev ? (ev.ok ? 'OK' : 'NG: ' + (REASON_JA[ev.reason] || ev.reason)) : '-'}`,
      `  dist ${ev && isFinite(ev.dist) ? ev.dist.toFixed(2) : '-'} / ${CATCH.range} m   angle ${ev ? ev.angleDeg.toFixed(0) : '-'} / ${CATCH.angleDeg}°`,
      `  window ${p.catchWindow > 0 ? p.catchWindow.toFixed(2) + 's' : '-'}  cd ${p.catchCd > 0 ? p.catchCd.toFixed(2) + 's' : '-'}  buffer ${p.catchBuffer > 0 ? p.catchBuffer.toFixed(2) : '-'}`,
      `  last press: ${g.lastPressResult ? (REASON_JA[g.lastPressResult] || g.lastPressResult) : '-'}   last miss: ${g.lastWindowMiss ? (REASON_JA[g.lastWindowMiss] || g.lastWindowMiss) : '-'}`,
      `DISC   ${d.state}${d.saved ? ' (saved)' : ''}  speed ${d.vel.length().toFixed(1)}  bounces ${d.bounces || 0}`,
      `GRAV   ${gr.phase}  k=${gr.k}  angle ${(gr.angle * 180 / Math.PI).toFixed(1)}°  next ${gr.nextIn.toFixed(1)}s`,
      `GOALS  cyan ${act.cyan.id}  pink ${act.pink.id}`,
      `PLAYER ${p.grounded ? 'ground(' + p.floorFace + ')' : 'air'}  airJumps ${p.airJumps}  kicks ${p.wallKicks}`,
    ];
    this.set('debug', 'text', lines.join('\n'));
  }

  // ------------------------------------------------------------------ per frame
  update(dt, g) {
    for (const k in this.slots) { const s = this.slots[k]; if (s.t > 0) { s.t -= dt; if (s.t <= 0) this.clearSlot(k); } }
    if (this.calloutTimer > 0) { this.calloutTimer -= dt; if (this.calloutTimer <= 0) $('callout').classList.remove('show'); }
    if (this.chipTimer > 0) { this.chipTimer -= dt; if (this.chipTimer <= 0) $('bounceChip').classList.remove('show'); }
    this.flash = Math.max(0, this.flash - dt * 2.2);
    this.set('fx-flash', 'opacity', (this.flash * 0.55).toFixed(3));
    this.set('fx-flash', 'background', this.flashColor);
    this.set('fx-comfort', 'opacity', this.comfort.toFixed(2));
    const p = g.player, d = g.disc, gr = g.gravity;
    this.set('scoreCyan', 'text', String(g.score.cyan));
    this.set('scorePink', 'text', String(g.score.pink));
    const t = Math.max(0, Math.ceil(g.timeLeft));
    this.set('clock', 'text', `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`);
    this.set('clock', 'class', t <= 30 ? 'low' : '');
    // gravity chip under the clock
    const gtxt = !gr.enabled ? '1v1 MATCH' : gr.rotating ? 'GRAVITY SHIFTING' : g.timeLeft <= gr.nextIn ? 'FINAL STAGE' : `SHIFT ${Math.ceil(gr.nextIn)}s`;
    this.set('clockSub', 'text', gtxt);
    this.set('clockSub', 'class', gr.rotating ? 'shift' : gr.nextIn <= 5 ? 'soon' : '');
    // disc state
    let ds = 'DISC: CENTER', cls = '';
    if (d.state === 'HELD') { ds = d.owner === 'player' ? 'DISC: YOU' : 'DISC: CPU'; cls = d.owner === 'cpu' ? 'cpu' : ''; }
    else if (d.state === 'FLYING') ds = d.saved ? 'DISC: DEFLECTED' : `DISC: IN FLIGHT · ${d.lastShooter === 'player' ? 'YOUR SHOT' : 'CPU SHOT'}`;
    else if (d.state === 'LOOSE' || d.state === 'FALLING') ds = 'DISC: LOOSE';
    else if (d.state === 'SCORED') ds = 'GOAL';
    if(g.online)ds=ds.replaceAll('CPU','相手'); this.set('discText', 'text', ds); this.set('discState', 'class', cls);
    const holdFrac = p.holding ? Math.min(1, p.holdTime / CONFIG.HOLD_LIMIT) : 0;
    this.set('holdBar', 'width', `${(100 - holdFrac * 100).toFixed(1)}%`);
    this.set('holdBar', 'class', holdFrac > 0.7 ? 'warn' : '');
    this.set('holdLabel', 'text', p.holding ? `HOLD ${(CONFIG.HOLD_LIMIT - p.holdTime).toFixed(1)}s` : 'NO DISC');
    const kickReady = !p.grounded && p.airJumps > 0 && !!p.nearestKickWall(g.goals);
    const wallShot = !p.grounded && g.simTime <= p.wallShotUntil + 1e-9;
    this.set('chipAir', 'text', wallShot ? `WALL SHOT +10% ${Math.max(0, p.wallShotUntil - g.simTime).toFixed(2)}s` : p.grounded ? 'GROUND' : kickReady ? 'WALL KICK OK' : p.airJumps > 0 ? 'AIR ・ 2段目OK' : 'AIR');
    this.set('chipAir', 'class', p.grounded ? '' : kickReady ? 'on kick' : 'on');
    const curveAngle=Math.round(Math.abs(p.curve||0)*CONFIG.CURVE_MAX_DEG);
    this.set('curveGuide', 'text', p.curve ? (p.curve < 0 ? '← 左カーブ ' : '右カーブ → ') + curveAngle+'°' : p.holding ? '直線' : '');
    const slider=$('tCurveSlider');if(slider&&document.activeElement!==slider)slider.value=String(Math.round((p.curve||0)*CONFIG.CURVE_MAX_DEG));
    this.set('tCurveAngle','text',p.curve?(p.curve<0?'左 ':'右 ')+curveAngle+'°':'直線 0°');
    this.set('curveGuide', 'class', p.holding && p.curve ? 'selected' : '');
    this.set('tCurve', 'text', p.curve < 0 ? '← LEFT' : p.curve > 0 ? 'RIGHT →' : 'STRAIGHT');
    this.set('chipShot', 'text', `${p.curve < 0 ? 'CURVE LEFT '+curveAngle+'°' : p.curve > 0 ? 'CURVE RIGHT '+curveAngle+'°' : 'STRAIGHT'}${p.holding && p.chargeStart != null ? ' / CHARGE ' + Math.round(Math.min(1, (g.simTime - p.chargeStart) / CONFIG.CHARGE_TIME) * 100) + '%' : ''}`);
    this.set('chipCatch', 'text', p.holding && g.simTime <= p.justUntil + 1e-9 ? `COUNTER +15% ${Math.max(0, p.justUntil - g.simTime).toFixed(2)}s` : p.catchWindow > 0 ? 'CATCHING' : p.catchCd > 0 ? `CATCH ${p.catchCd.toFixed(1)}s` : 'CATCH READY');
    this.set('chipCatch', 'class', p.catchWindow > 0 ? 'on' : '');
    this.set('actShoot', 'class', 'act ' + (p.holding ? 'ready active' : 'locked'));
    const catchP = p.catchCd > 0 ? (p.catchCd / CATCH.cooldown) * 100 : 0;
    this.setCd('actCatch', catchP, p.catchWindow > 0 ? 'active' : p.holding ? 'locked' : 'ready');
    const dashP = p.dashCd > 0 ? (p.dashCd / CONFIG.DASH_COOLDOWN) * 100 : 0;
    this.setCd('actDash', dashP, p.dashTime > 0 ? 'active' : (p.holding || !p.grounded) ? 'locked' : 'ready');
    this.set('actJump', 'class', 'act ' + (kickReady ? 'ready kick' : p.grounded || p.airJumps > 0 ? 'ready' : 'active'));
    this.set('actJumpLbl', 'text', kickReady ? 'KICK' : p.grounded ? 'JUMP' : p.airJumps > 0 ? '2ND' : 'JUMP');
    if (this.isTouch) {
      this.set('tShoot', 'class', 'tbtn big' + (p.holding ? '' : ' locked'));
      this.setTouchCd('tCatch', catchP, p.holding, g.catchable);
      this.setTouchCd('tDash', dashP, p.holding || !p.grounded);
      this.set('tJump', 'class', 'tbtn' + (kickReady ? ' kick' : p.grounded || p.airJumps > 0 ? '' : ' locked'));
      this.set('tJump', 'text', kickReady ? 'KICK' : 'JUMP');
    }
    const v = d.state === 'FLYING' && !d.saved ? d.value() : 1;
    this.set('valueNum', 'text', 'x' + v);
    this.set('valueHex', 'class', v >= 3 ? 'v3' : v === 2 ? 'v2' : '');
    // crosshair: catchable = the exact test the catch uses (green converging ring)
    this.set('cross', 'class', g.catchable ? 'catchable' : g.catchInRange && !p.holding ? 'inrange' : p.catchWindow > 0 ? 'window' : p.holding ? 'holding' : '');
    this.set('catchPrompt', 'class', g.catchable && p.catchWindow <= 0 ? 'show' : '');
    let st = '';
    if (gr.rotating) st = 'GRAVITY SHIFT — 回転中も操作できる。着地面が変わる';
    else if (p.holding) st = p.grounded ? 'SHOOT — 壁やパネルで反射させると高得点' : 'AIR SHOT — 空中から高いコースを狙え';
    else if (d.state === 'FLYING' && !d.saved && d.lastShooter === 'cpu') st = this.isTouch ? 'CATCH — 照準の輪が緑になったら CATCH ボタン' : 'CATCH — 照準の輪が緑になったら右クリック';
    else if (d.state === 'FLYING') st = 'ディスク飛行中';
    else if (d.state === 'HELD') st = 'DEFEND — CPUのシュートに備えろ';
    else st = this.isTouch ? 'ディスクを回収しよう（DASHで加速）' : 'ディスクを回収しよう（Shiftでダッシュ）';
    if(g.online)st=st.replaceAll('CPU','相手'); this.set('status', 'text', st);
  }
  setCd(id, pct, state) {
    this.set(id, 'class', 'act ' + state);
    const el = document.querySelector(`#${id} .cd`);
    const key = id + '|cd'; const v = pct.toFixed(0) + '%';
    if (this.cache.get(key) !== v) { this.cache.set(key, v); el.style.setProperty('--p', v); }
  }
  setTouchCd(id, pct, locked, hot = false) {
    this.set(id, 'class', 'tbtn' + (locked ? ' locked' : '') + (hot ? ' hot' : ''));
    const el = document.querySelector(`#${id} .cd`);
    const key = id + '|cd'; const v = pct.toFixed(0) + '%';
    if (this.cache.get(key) !== v) { this.cache.set(key, v); el.style.setProperty('--p', v); }
  }
}

