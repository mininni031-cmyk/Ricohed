import {QUALITY_PROFILES,readQuality} from './quality.js';
import {placeRestartDisc} from './restart.js';
import {TrajectoryVolume} from './trajectory-volume.js';
import {OnlineSession} from './online.js';
import {shotParameters} from './shot.js';
import {predictShot} from './prediction.js';
import { segmentHitsOBB, updatePanelColliders } from './physics.js';
// Game (MatchState + glue): owns the match state machine, the fixed-step simulation and the
// presentation. Simulation modules (ArenaGravitySystem, PlayerPhysics/Athlete, DiscPhysics,
// CatchSystem, GoalSystem, Goalkeeper, CPUController) are pure logic in ROOM coordinates and never
// touch the DOM. They report through an EventBus; UI, audio, crowd and effects subscribe to it.
import * as THREE from 'three';
import { CONFIG, CPU_PRESETS, TEAM, AIR_SHOT_SPREAD, CATCH, CPU_CATCH, ROOM, GRAVITY_SHIFT } from './config.js';
import { ArenaScene, drawLogoCanvas } from './arena.js';
import { Crowd } from './crowd.js';
import { Goalkeeper } from './keeper.js';
import { DiscPhysics, advanceCurve } from './physics.js';
import { Athlete, ROOM_FACES } from './athlete.js';
import { CPUController } from './cpu.js';
import { AnimeCharacter, PALETTES } from './character.js';
import { ViewArms } from './arms.js';
import { Sparks, Rings, DiscTrail } from './fx.js';
import { AudioManager } from './audio.js';
import { UIManager } from './ui.js';
import { Input } from './input.js';
import { toon, glowMat } from './toon.js';
import { ArenaGravitySystem } from './gravity.js';
import { GoalSystem } from './goals.js';
import { evalCatch, REASON_JA } from './catch.js';
import { EventBus } from './events.js';
import { Rng } from './rng.js';

const C = CONFIG, L = ROOM.L;
const DISC_COLORS = [0x35e8ff, 0xb46bff, 0xffc84a];
const _v1 = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3(), _v4 = new THREE.Vector3(), _v5 = new THREE.Vector3(), _q = new THREE.Quaternion(), _m = new THREE.Matrix4();

export class Game {
  constructor({ test = false, debug = false } = {}) {
    this.test = test; this.debug = debug || C.DEBUG_CATCH;
    this.isTouch = matchMedia('(pointer:coarse)').matches || (navigator.maxTouchPoints > 0 && !matchMedia('(pointer:fine)').matches);
    this.displayQuality=readQuality(this.isTouch);this.qualityProfile=QUALITY_PROFILES[this.displayQuality];this.quality=this.qualityProfile.arena;
    this.state = 'title';
    this.score = { cyan: 0, pink: 0 };
    this.timeLeft = C.MATCH_TIME; this.matchClock = 0; this.simTime = 0;
    this.stats = this.freshStats(); this.restartTeam=null;
    this.banner = null; this.bannerTimer = 0;
    this.hitstop = 0; this.goalTimer = 0; this.countT = 0;
    this.hype = 0.15; this.teamFlash = { cyan: 0, pink: 0 };
    this.fovKick = 0; this.shake = 0; this.dip = 0; this.dipVel = 0; this.kickRoll = 0;
    this.catchable = false; this.catchInRange = false; this.lastCatchEval = null; this.lastOkCatchT = -99;
    this.suction = null;
    this.log = []; this.cpuFrozen = false;
    this.settings = { reduceMotion: matchMedia('(prefers-reduced-motion: reduce)').matches, comfortShift: true };

    this.bus = new EventBus();
    this.rng = new Rng(20261013);
    this.gravity = new ArenaGravitySystem((type, p) => this.bus.emit(type, p));
    this.goals = new GoalSystem(this.gravity);

    this.initRenderer();
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x070b1c);
    this.scene.fog = new THREE.FogExp2(0x0a0f26, 0.008);
    this.camera = new THREE.PerspectiveCamera(this.isTouch ? 78 : 84, innerWidth / innerHeight, 0.05, 300);
    this.camera.rotation.order = 'YXZ';
    this.baseFov = this.camera.fov;

    this.arena = new ArenaScene(this.scene, this.quality);
    this.room = this.arena.room;
    this.crowd = new Crowd(this.scene, this.arena.seats, this.qualityProfile.crowd);
    this.keepers = [new Goalkeeper('cyan', this.room, 0), new Goalkeeper('pink', this.room, Math.PI / 2)];
    this.disc = new DiscPhysics(this.keepers, this.goals, this.gravity);
    this.player = new Athlete('player', 'cyan'); this.player.yaw = -Math.PI / 2; this.player.pitch = 0;
    this.cpuA = new Athlete('cpu', 'pink');
    this.cpu = new CPUController(this.cpuA, this.gravity, this.rng);
    this.cpu.facingDir = new THREE.Vector3(-1, 0, 0);
    this.cpuChar = new AnimeCharacter({ pal: PALETTES.cpu, hair: 0x2b1838, hairHi: 0xff6fb5, hairStyle: 'ponytail', suit: 0x1b1d2a, accent: 0xff4fa3 });
    this.room.add(this.cpuChar.root);
    this.arms = new ViewArms(innerWidth / innerHeight);
    this.buildDisc();
    this.sparks = new Sparks(this.room); this.rings = new Rings(this.room); this.trail = new DiscTrail(this.room);
    this.shotGuide = new THREE.Line(new THREE.BufferGeometry().setFromPoints(Array.from({length:25},()=>new THREE.Vector3())), new THREE.LineDashedMaterial({color:0xffffff, vertexColors:true, dashSize:0.22, gapSize:0.12, transparent:true, opacity:0.85, depthWrite:false}));
    this.shotGuide.visible = false; this.shotGuide.material.visible=false; this.guideVolume=new TrajectoryVolume();this.shotGuide.add(this.guideVolume); this.room.add(this.shotGuide);
    this.sparks.setScale(innerHeight);

    this.audio = new AudioManager();
    this.ui = new UIManager(this.isTouch);
    this.input = new Input(this.renderer.domElement, this.isTouch);
    this.bindUI();
    this.wirePresentation();
    this.resetMatch(false);
    this.arena.updateJumbotron({ cyan: 0, pink: 0, time: '3:00', banner: null, bannerColor: '', paused: false });
    window.addEventListener('resize', () => this.resize());
    this.resize();
    this.frameMs = 16; this.frameN = 0; this.dynScale = 1;
    this.last = performance.now(); this.acc = 0;
    if (!test) requestAnimationFrame((t) => this.frame(t));
  }

  freshStats() { return { shots: 0, goals: 0, points: { 1: 0, 2: 0, 3: 0 }, saves: 0, catches: 0, cpuShots: 0, cpuGoals: 0, bounces: 0, airShots: 0, wallKicks: 0, warps: 0, shifts: 0 }; }

  initRenderer() {
    const r = this.renderer = new THREE.WebGLRenderer({ antialias: this.qualityProfile.antialias, powerPreference: 'high-performance', preserveDrawingBuffer: this.test });
    this.maxPR = Math.min(devicePixelRatio || 1, this.qualityProfile.pixelCap);
    r.setPixelRatio(this.maxPR); r.setSize(innerWidth, innerHeight);
    r.outputColorSpace = THREE.SRGBColorSpace; r.toneMapping = THREE.ACESFilmicToneMapping; r.toneMappingExposure = 1.05;
    document.body.prepend(r.domElement);
  }

  buildDisc() {
    const g = new THREE.Group(), R = C.DISC_RADIUS;
    this.discBody = new THREE.Mesh(new THREE.CylinderGeometry(R, R * 0.92, 0.07, 40), toon(0x14213a, 0x0a1428, 0.4));
    this.discRimMat = new THREE.MeshBasicMaterial({ color: DISC_COLORS[0], toneMapped: false });
    const rim = new THREE.Mesh(new THREE.TorusGeometry(R, 0.04, 10, 48), this.discRimMat); rim.rotation.x = Math.PI / 2;
    const inner = new THREE.Mesh(new THREE.TorusGeometry(R * 0.55, 0.016, 6, 36), this.discRimMat); inner.rotation.x = Math.PI / 2; inner.position.y = 0.036;
    const core = new THREE.Mesh(new THREE.CircleGeometry(R * 0.28, 24), glowMat(0xffffff)); core.rotation.x = -Math.PI / 2; core.position.y = 0.037;
    const core2 = core.clone(); core2.rotation.x = Math.PI / 2; core2.position.y = -0.037;
    this.discHaloMat = new THREE.MeshBasicMaterial({ color: DISC_COLORS[0], transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false });
    const halo = new THREE.Mesh(new THREE.RingGeometry(R * 1.1, R * 1.9, 48), this.discHaloMat); halo.rotation.x = -Math.PI / 2;
    const outl = new THREE.Mesh(new THREE.TorusGeometry(R + 0.02, 0.05, 6, 40), new THREE.MeshBasicMaterial({ color: 0x050812, side: THREE.BackSide })); outl.rotation.x = Math.PI / 2;
    this.discSpin = new THREE.Group(); this.discSpin.add(this.discBody, rim, inner, core, core2, outl);
    g.add(this.discSpin, halo);
    this.discHalo = halo; this.discGroup = g; this.room.add(g);
    this.discLight = new THREE.PointLight(DISC_COLORS[0], 8, 8, 1.6); this.room.add(this.discLight);
    this.discColorIdx = 0;
  }

  // ---------------------------------------------------------------- UI wiring
  bindUI() {
    const $ = (id) => document.getElementById(id);
    $('logo').style.backgroundImage = `url(${drawLogoCanvas(1024, 256, false).userData.canvas.toDataURL()})`;
    $('optQuality').value=this.displayQuality; $('optQuality').onchange=e=>{try{localStorage.setItem('ricochet-quality',e.target.value);}catch{}const u=new URL(location.href);u.searchParams.set('quality',e.target.value);location.href=u.href;};
    $('chooseOnline').onclick=()=>this.showMenuMode('online');$('onlineBack').onclick=()=>{if(this.online)this.online.leave();this.showMenuMode('home');};
    $('optCpu').value = C.CPU;
    $('optCpu').onchange = (e) => { C.CPU = e.target.value; };
    const optRM = $('optReduceMotion'), optCS = $('optComfort'), optDbg = $('optDebug');
    if (optRM) { optRM.checked = this.settings.reduceMotion; optRM.onchange = () => { this.settings.reduceMotion = optRM.checked; document.body.classList.toggle('reduce-motion', optRM.checked); }; document.body.classList.toggle('reduce-motion', this.settings.reduceMotion); }
    if (optCS) { optCS.checked = this.settings.comfortShift; optCS.onchange = () => { this.settings.comfortShift = optCS.checked; }; }
    if (optDbg) { optDbg.checked = this.debug; optDbg.onchange = () => { this.debug = optDbg.checked; this.ui.debugVisible(this.debug); }; }
    this.ui.debugVisible(this.debug);
    const syncAudio = () => {
      for (const id of ['optBgm', 'optBgm2']) { $(id).textContent = this.audio.bgmOn ? 'BGM ON' : 'BGM OFF'; $(id).classList.toggle('off', !this.audio.bgmOn); }
      for (const id of ['optSfx', 'optSfx2']) { $(id).textContent = this.audio.sfxOn ? 'SE ON' : 'SE OFF'; $(id).classList.toggle('off', !this.audio.sfxOn); }
      $('btnBgm').classList.toggle('off', !this.audio.bgmOn); $('btnSfx').classList.toggle('off', !this.audio.sfxOn);
    };
    const togBgm = (e) => { e.stopPropagation(); this.audio.unlock(); this.audio.setBgm(!this.audio.bgmOn); syncAudio(); };
    const togSfx = (e) => { e.stopPropagation(); this.audio.unlock(); this.audio.setSfx(!this.audio.sfxOn); syncAudio(); this.audio.play('ui'); };
    for (const id of ['optBgm', 'optBgm2', 'btnBgm']) $(id).addEventListener('click', togBgm);
    for (const id of ['optSfx', 'optSfx2', 'btnSfx']) $(id).addEventListener('click', togSfx);
    syncAudio();
    const storedUrl=(()=>{try{return localStorage.getItem('ricochet-server');}catch{return null;}})();
    $('netUrl').value=window.RICOCHET_SERVER_URL||storedUrl||(location.protocol==='https:'?'':'ws://localhost:3001/ws');
    $('netJoin').onclick=()=>{if(this.online)this.online.leave();this.showMenuMode('online');try{const room=$('netRoom').value.trim();if(room.length<4||room.length>48)throw Error('合言葉は4〜48文字で入力してください。');if(!$('netUrl').value.trim())throw Error('オンラインは準備中です。CPU戦で遊べます。');this.audio.unlock();this.online=new OnlineSession(this,{url:$('netUrl').value.trim(),room});try{localStorage.setItem('ricochet-server',this.online.url);}catch{}this.online.connect();}catch(e){$('netStatus').textContent=e.message;this.online=null;}};
    $('netReady').onclick=()=>this.online?.ready();$('netLeave').onclick=()=>this.online?.leave();$('netExit').onclick=()=>this.online?.leave();
    $('start').addEventListener('click', () => this.startMatch());
    $('resume').addEventListener('click', () => this.resume());
    $('restart').addEventListener('click', () => this.startMatch());
    $('rematch').addEventListener('click', () => this.online?this.online.rematch():this.startMatch());
    $('pauseToTitle').addEventListener('click',()=>{if(this.online)this.online.leave();this.input.enabled=false;this.input.exitLock();this.audio.stopMusic();this.state='title';this.showMenuMode('home');this.ui.menu('menuTitle');this.ui.showHUD(false);});
    $('toTitle').addEventListener('click', () => { if(this.online)this.online.leave();this.showMenuMode('home'); this.state = 'title'; this.ui.menu('menuTitle'); this.ui.showHUD(false); });
    $('btnPause').addEventListener('click', (e) => { e.stopPropagation(); this.pause(); });
    this.input.onFirstGesture = () => this.audio.unlock();
    this.input.onPauseKey = () => {
      if (performance.now() - (this.lockPauseAt || 0) < 400) return;
      if (this.state === 'playing' || this.state === 'goal' || this.state === 'countdown') this.pause();
      else if (this.state === 'paused') this.resume();
    };
    this.input.onLockChange = (locked) => {
      if (!locked && (this.state === 'playing' || this.state === 'goal' || this.state === 'countdown') && !this.isTouch) { this.lockPauseAt = performance.now(); this.pause(); }
    };
    this.input.onSkip = () => this.ui.skipAnimations();
    document.addEventListener('visibilitychange', () => { if (document.hidden && (this.state === 'playing' || this.state === 'goal' || this.state === 'countdown')) this.pause(); });
    const boot = $('boot'); if (boot) boot.remove();
  }

  /** Presentation subscribes to simulation events (UI / audio / crowd). */
  wirePresentation() {
    const b = this.bus, ui = this.ui, au = this.audio;
    b.on('MATCH_STARTED', () => { ui.matchIntro(); });
    b.on('DISC_THROWN', (e) => { au.play('throw'); });
    b.on('DISC_CAUGHT', (e) => {
      au.play('catch');
      if (e.who === 'player') { ui.catchSuccess(e.rescued, e.just); ui.screenFlash('#bff8ff', 0.2); }
      else ui.chip('CPU CATCH', 0.7);
    });
    b.on('DISC_BOUNCED', (e) => { au.play(e.rim ? 'rim' : 'bounce', { count: e.count }); ui.bounceCount(e.count, this.disc.value(), e.rim); });
    b.on('WALL_KICK_USED', (e) => { au.play('wallkick'); if (e.who === 'player') ui.wallKick(); });
    b.on('GOAL_SAVED', (e) => { au.play('save'); ui.block(e.team); ui.screenFlash(TEAM[e.team].css, 0.3); this.crowd.popFor(e.team, 1); });
    b.on('GOAL_SCORED', (e) => {
      au.play('goal'); if (e.team === 'pink') au.play('concede');
      ui.goal(e.team, e.value, e.bounces, e.own); ui.bumpScore(e.team); ui.screenFlash(TEAM[e.team].css, 0.85);
      this.crowd.cheer(e.team, 1);
    });
    b.on('GRAVITY_SHIFT_COUNT', (e) => { ui.shiftWarning(e.sec); au.play('tick'); });
    b.on('GRAVITY_SHIFT_STARTED', () => { ui.shiftStart(); au.play('shift'); this.stats.shifts++; this.crowd.popFor('cyan', 0.6); this.crowd.popFor('pink', 0.6); });
    b.on('GRAVITY_SHIFT_COMPLETED', () => { this.onShiftCompleted(); ui.newFloor(); au.play('newfloor'); });
    b.on('PLAYER_WARPED', (e) => { if (e.who === 'player') ui.chip('WARP — 自陣へ戻った', 1.0); au.play('pickup'); });
    b.on('MATCH_FINISHED', (e) => { au.play('end'); ui.matchEnd(e.cyan, e.pink); });
    b.keepLog = this.test;
  }

  // ---------------------------------------------------------------- frames / spawns
  up(out = new THREE.Vector3()) { return this.gravity.up(out); }
  spawnPos(team, out = new THREE.Vector3()) { return this.gravity.localFromCanon(_v4.set(team === 'cyan' ? -C.SPAWN_DIST : C.SPAWN_DIST, -L, 0), out); }

  resetMatch(countdown = true) {
    this.score.cyan = 0; this.score.pink = 0;
    this.timeLeft = C.MATCH_TIME; this.matchClock = 0; this.simTime = 0; updatePanelColliders(this.disc.panels,0);
    this.stats = this.freshStats(); this.restartTeam=null;
    this.gravity.reset(); this.gravity.endAt = C.MATCH_TIME; this.goals._k = null;
    this.rehomeKeepers(false);
    this.resetPositions();
    this.sparks.clear(); this.trail.reset();
    for (const k of this.keepers) { k.update(0, 0); k.char.setExpression('normal'); }
    if (countdown) { this.state = 'countdown'; this.countT = 0; }
    this.syncRoom();
  }
  rehomeKeepers(animate) {
    const act = this.goals.active();
    this.arena.showInactiveGoals = this.gravity.enabled; // no rotation -> the 6 unused mouths are not drawn
    for (const k of this.keepers) k.setHome(act[k.team], animate);
    this.arena.setActiveGoals(act);
    this.arena.setHalfLine(this.gravity.teamDir('cyan'), this.gravity.floorDir(), this.gravity.halfLineActive);
  }
  resetPositions(restartTeam = null) {
    this.guideFrame=-99;
    const up = this.up();
    this.player.reset(this.spawnPos('cyan'), up); this.player.yaw = -Math.PI / 2; this.player.pitch = -0.05;
    this.cpuA.reset(this.spawnPos('pink'), up); this.cpu.reset(); this.cpu.facingDir = this.gravity.teamDir('cyan');
    this.disc.reset(); if(restartTeam)placeRestartDisc(this.disc,restartTeam,this.rng); this.trail.reset(); this.input.clearPresses(); this.suction = null;
    this.lastOkCatchT = -99; this.catchFlightId = null; this.firstCatchT = -99;
    this.player.wallShotUntil = -99;
    this.player.chargeStart = null; this.player.curve = 0;
    this.player.justUntil = -99; this.player.catchPressT = -99; this.player.shotBufferedUntil = -99;
    this.cpuChar.setBase('idle'); this.cpuChar.setExpression('normal');
  }
  showMenuMode(mode){
    const online=mode==='online';document.getElementById('menuHome').hidden=online;document.getElementById('onlinePanel').hidden=!online;document.getElementById('menuExtras').hidden=online;this.input.keys.clear();this.input.clearPresses();if(online)document.getElementById('netRoom').focus();
  }
  startMatch() {
    this.showMenuMode('home');document.getElementById('rematch').hidden=false;document.getElementById('rematch').disabled=false;document.getElementById('rematch').textContent='もう一度';document.getElementById('restart').hidden=false;
    if(this.online)this.online.leave();
    this.audio.unlock(); this.audio.play('ui');
    this.ui.menu(null); this.ui.showHUD(true);
    this.resetMatch(true);
    this.input.enabled = true; this.input.clearPresses();
    this.input.requestLock();
    this.audio.startMusic(); this.audio.resume();
    this.ui.teamBanners();
  }
  pause() {
    if(this.online){this.online.pause();return;}
    if (this.state === 'paused' || this.state === 'title' || this.state === 'ended') return;
    this.player.chargeStart = null;
    this.prevState = this.state; this.state = 'paused';
    this.input.enabled = false; this.input.exitLock();
    this.ui.menu('menuPause'); this.audio.pause();
  }
  resume() {
    if(this.online){this.online.resume();return;}
    if (this.state !== 'paused') return;
    this.state = this.prevState || 'playing';
    this.ui.menu(null); this.input.enabled = true; this.input.clearPresses();
    this.input.requestLock(); this.audio.resume();
    this.last = performance.now();
  }
  endMatch() {
    this.state = 'ended'; this.input.enabled = false; this.input.exitLock();
    this.audio.stopMusic();
    const $ = (id) => document.getElementById(id);
    const c = this.score.cyan, p = this.score.pink;
    $('resultTitle').textContent = c > p ? 'YOU WIN!' : c < p ? 'CPU WINS' : 'DRAW';
    $('resultScore').innerHTML = `<span class="c">${c}</span> — <span class="p">${p}</span>`;
    const s = this.stats;
    $('resultStats').innerHTML = `シュート ${s.shots}（空中 ${s.airShots}） / ゴール ${s.goals}（1点×${s.points[1]}・2点×${s.points[2]}・3点×${s.points[3]}）<br>キャッチ ${s.catches} / 反射 ${s.bounces} / ウォールキック ${s.wallKicks} / 重力シフト ${s.shifts}回<br>相手キーパーのセーブ ${s.saves} / CPU シュート ${s.cpuShots} / CPU ゴール ${s.cpuGoals}`;
    this.ui.menu('menuResult');
    this.setBanner(c > p ? 'YOU WIN' : c < p ? 'CPU WINS' : 'DRAW', c >= p ? '#35e8ff' : '#ff4fa3', 99);
    this.bus.emit('MATCH_FINISHED', { cyan: c, pink: p });
  }
  setBanner(text, color, time = 1.5) { this.banner = { text, color }; this.bannerTimer = time; }

  // ---------------------------------------------------------------- main loop
  frame(t) {
    const resting=(!this.online&&['title','paused','ended'].includes(this.state))||!!(this.online&&(!this.online.latest||['waiting','ended','aborted','reconnecting'].includes(this.online.latest.status)||this.online.localPaused));
    if(resting&&this.lastMenuFrame!=null&&t-this.lastMenuFrame<1000/this.qualityProfile.menuFps){this.last=t;requestAnimationFrame(tt=>this.frame(tt));return;}
    if(resting)this.lastMenuFrame=t;
    const dtReal = Math.min(0.1, (t - this.last) / 1000); this.last = t;
    this.tick(dtReal); this.render(); this.adaptResolution(dtReal);
    requestAnimationFrame((tt) => this.frame(tt));
  }
  tick(dtReal) {
    if(this.online){this.audio.update();this.online.update(dtReal);return;}
    let dt = dtReal;
    if (this.hitstop > 0) { this.hitstop -= dtReal; dt *= 0.25; }
    this.audio.update();
    if (this.state === 'paused' || this.state === 'title' || this.state === 'ended') { this.updateVisuals(dtReal, false); return; }
    this.acc += dt;
    const h = C.SIM_STEP; let n = 0;
    while (this.acc >= h && n < 12) { this.step(h); this.acc -= h; n++; }
    if (n === 12) this.acc = 0;
    this.updateVisuals(dt, true);
  }

  /** One fixed simulation step (deterministic for the same inputs and seed). */
  step(h) {
    if(this.online)return;
    if (this.state === 'paused' || this.state === 'title' || this.state === 'ended') return;
    this.simTime += h; updatePanelColliders(this.disc.panels,this.simTime);
    if (this.state === 'countdown') {
      this.countT += h;
      const c = this.countT;
      const label = c < 0.7 ? '3' : c < 1.4 ? '2' : c < 2.1 ? '1' : c < 2.7 ? 'GO!' : null;
      if (label !== this.lastCount) { this.ui.countdown(label); if (label) this.audio.play(label === 'GO!' ? 'start' : 'tick'); this.lastCount = label; }
      this.applyLook();
      if (c >= 2.1) { this.state = 'playing'; this.bus.emit('MATCH_STARTED', {}); }
      this.syncCamera(h);
      return;
    }
    if (this.lastCount && this.state === 'playing' && this.countT >= 2.7) { this.ui.countdown(null); this.lastCount = null; }
    else if (this.lastCount) this.countT += h;

    if (this.state === 'goal') {
      this.goalTimer -= h;
      // a shift in progress finishes during the celebration (never frozen half-way)
      // the match clock keeps running with it, so shifts stay exactly on the 30 s marks of match time
      if (this.gravity.rotating || this.gravity.phase === 'settle') { this.gravity.update(h); this.timeLeft = Math.max(0, this.timeLeft - h); this.matchClock += h; }
      for (const k of this.keepers) k.update(0, this.matchClock);
      this.applyLook(); this.syncRoom(); this.syncCamera(h);
      if (this.goalTimer <= 0 && !this.gravity.rotating) {
        this.resetPositions(this.restartTeam); this.restartTeam=null;
        if (this.timeLeft <= 0) { this.endMatch(); return; }
        this.state = 'playing'; this.ui.callout('READY', '', 'cyan', 0.8);
      }
      return;
    }

    // ---- playing
    this.timeLeft -= h; this.matchClock += h;
    if (this.timeLeft <= 0) { this.timeLeft = 0; this.endMatch(); return; }
    this.gravity.update(h);
    for (const k of this.keepers) k.update(h, this.matchClock);
    this.applyLook();
    this.syncRoom();
    this.stepPlayer(h);
    this.stepCPU(h);
    this.stepDisc(h);
    this.syncCamera(h);
  }

  /** Room attitude for rendering + matrices (used to place the camera). */
  syncRoom() { this.arena.setRoomQuat(this.gravity.roomQuat(_q)); this.room.updateMatrixWorld(true); }

  applyLook() {
    const d = this.input.takeLook(), s = this.input.sensitivity * (this.catchable ? 0.85 : 1);
    this.lookD = d;
    if (this.state === 'paused') return;
    this.player.yaw -= d.x * s;
    this.player.pitch = THREE.MathUtils.clamp(this.player.pitch - d.y * s, -1.4, 1.4);
  }
  /** Camera forward in WORLD space (the horizon stays level; the room turns around you). */
  worldForward(out = new THREE.Vector3()) { const p = this.player; return out.set(-Math.sin(p.yaw) * Math.cos(p.pitch), Math.sin(p.pitch), -Math.cos(p.yaw) * Math.cos(p.pitch)).normalize(); }
  /** Aim direction in ROOM space. */
  forward(out = new THREE.Vector3()) { return this.gravity.toRoomDir(this.worldForward(_v4), out); }
  flatForward(out = new THREE.Vector3()) { const p = this.player; return this.gravity.toRoomDir(_v4.set(-Math.sin(p.yaw), 0, -Math.cos(p.yaw)), out); }
  flatRight(out = new THREE.Vector3()) { const p = this.player; return this.gravity.toRoomDir(_v4.set(Math.cos(p.yaw), 0, -Math.sin(p.yaw)), out); }

  envFor(a, other) {
    return { up: this.up(), halfLine: { dir: this.gravity.teamDir(a.team), on: this.gravity.halfLineActive }, others: [{ pos: other.pos }, ] };
  }

  onWallKick(a, who) {
    const w = a.lastKick;
    this.sparks.burst(w.point, 0xbffcff, 22, 6, 0.09, 0.35, 3, w.normal);
    this.rings.spawn(w.point.clone().addScaledVector(w.normal, 0.03), w.normal, 0x9ff6ff, 1.3, 0.28);
    if (who === 'player') {
      a.wallShotUntil = this.simTime + C.WALL_SHOT_TIME;
      const nW = this.gravity.toWorldDir(w.normal, _v1), right = _v2.set(Math.cos(this.player.yaw), 0, -Math.sin(this.player.yaw));
      this.kickRoll = THREE.MathUtils.clamp(nW.dot(right), -1, 1) * (this.settings.reduceMotion ? 0.03 : 0.07);
      this.arms.triggerLand(0.6); this.fovKick = Math.max(this.fovKick, 5);
      this.stats.wallKicks++;
    }
    if (this.test) this.log.push({ type: 'wallkick', who, wall: w.id, t: this.simTime });
    this.bus.emit('WALL_KICK_USED', { who, wall: w.id });
  }

  stepPlayer(h) {
    const p = this.player, inp = this.input;
    const ax = inp.axes();
    const f = this.flatForward(_v1), r = this.flatRight(_v2);
    const wish = _v3.set(0, 0, 0).addScaledVector(f, ax.y).addScaledVector(r, ax.x);
    if (wish.lengthSq() > 1) wish.normalize();
    if (inp.consume('jump')) {
      const j = p.tryJump(this.goals);
      if (j === 'kick') this.onWallKick(p, 'player');
      else if (j) { this.audio.play('jump', { second: j === 2 }); if (j === 2) { this.arms.triggerLand(0.35); this.sparks.burst(p.pos.clone(), 0x9ff6ff, 14, 3, 0.08, 0.3, 1); this.rings.spawn(p.pos.clone(), this.up(), 0x9ff6ff, 1.4, 0.3); } }
    }
    if (inp.consume('dash')) {
      const dir = wish.lengthSq() > 0.01 ? wish.clone() : f.clone();
      if (p.tryDash(dir)) { this.audio.play('dash'); this.fovKick = Math.max(this.fovKick, 9); }
    }
    if (inp.consume('catch')) this.pressCatch(p, 'player');
    else if (p.catchBuffer > 0) { p.catchBuffer -= h; if (p.catchBuffer > 0 && this.canOpenWindow(p).ok && this.disc.state === 'FLYING') { p.catchBuffer = 0; this.openWindow(p, 'player'); } }
    if (inp.consume('curveLeft')) p.curve = -1;
    if (inp.consume('curveRight')) p.curve = 1;
    if (inp.consume('curveStraight')) p.curve = 0;
    if (inp.consume('curveCycle')) p.curve = p.curve === 0 ? -1 : p.curve === -1 ? 1 : 0;
    if (inp.consume('chargeCancel') || !p.holding) p.chargeStart = null;
    if (inp.consume('chargeStart') && p.holding) p.chargeStart = this.simTime;
    if (inp.consume('chargeRelease') && p.chargeStart != null && p.holding) this.playerShoot();
    if (inp.consume('shoot')) { p.shotBufferedUntil = this.simTime + CATCH.shotBuffer; this.playerShoot(); }
    const evs = p.step(h, wish, this.envFor(p, this.cpuA));
    for (const e of evs) {
      if (e.type === 'land') {
        p.wallShotUntil = -99;
        const s = Math.min(1, e.impact / 14);
        this.dipVel -= Math.min(C.LANDING_DIP, 0.02 + s * 0.05) * 9;
        this.arms.triggerLand(s); if (e.airTime > 0.25) this.audio.play('land', { strength: s });
      }
      if (e.type === 'ceiling') { this.shake = Math.max(this.shake, 0.18); this.audio.play('ceiling'); this.ui.chip('CEILING!', 0.5); }
    }
    if (p.atHalfLine) { this.arena.touchHalfLine('cyan', p.pos); if (!this.halfLineToldT || this.simTime - this.halfLineToldT > 2.5) { this.halfLineToldT = this.simTime; this.ui.chip('HALF LINE — 相手陣地には入れない', 0.9); } }
    if (p.catchWindow > 0) { p.catchWindow -= h; p.catchWindowAge += h; if (p.catchWindow <= 0 && !p.holding) { p.catchCd = CATCH.cooldown; this.lastWindowMiss = this.lastCatchEval ? this.lastCatchEval.reason : 'no-flight'; } }
    if (p.holding && p.holdTime > C.HOLD_LIMIT) { this.dropFrom(p); this.ui.callout('HOLD TIME!', 'ディスクを落とした', 'gold', 1); }
  }

  // ---------------------------------------------------------------- catching (CatchSystem glue)
  canOpenWindow(a) {
    if (a.holding) return { ok: false, reason: 'holding' };
    if (a.dashTime > 0) return { ok: false, reason: 'dashing' };
    if (a.catchCd > 0) return { ok: false, reason: 'cooldown' };
    if (a.catchWindow > 0) return { ok: false, reason: 'window-open' };
    return { ok: true };
  }
  /** Player pressed CATCH: rescue (catchable within the last 0.25 s), window, or buffered press. */
  pressCatch(a, who) {
    this.arms.triggerCatch();
    if (who === 'player') a.catchPressT = this.simTime;
    const can = this.canOpenWindow(a);
    if (!can.ok && can.reason !== 'window-open') {
      if (can.reason === 'cooldown' || can.reason === 'holding') a.catchBuffer = CATCH.rescue; // early press is kept 0.25 s
      if (can.reason === 'cooldown' && a.catchCd > 0.12) this.audio.play('catchMiss');
      this.lastPressResult = can.reason;
      return false;
    }
    // late press: the disc was catchable a moment ago -> still yours
    if (this.disc.state === 'FLYING' && this.catchFlightId === this.disc.flightId && this.simTime - this.lastOkCatchT <= CATCH.rescue && !this.disc.panels.some(p => segmentHitsOBB(a.eye(), this.disc.pos, p))) { this.giveDisc(who, true, true); this.lastPressResult = 'rescued'; return true; }
    if (this.disc.state !== 'FLYING') { a.catchBuffer = CATCH.rescue; this.lastPressResult = 'buffered'; return false; }
    this.openWindow(a, who);
    return true;
  }
  openWindow(a, who) {
    a.catchWindow = who === 'player' ? CATCH.window : CPU_CATCH.window; a.catchWindowAge = 0;
    if (who === 'cpu') { this.cpuChar.play('catch', 0.45, 22); this.cpuChar.setExpression('catch', 0.6); }
    this.lastPressResult = 'window';
  }
  /** THE catch test for athlete `who` right now (crosshair, real catch, debug use this). */
  catchEval(who) {
    const d = this.disc, a = who === 'player' ? this.player : this.cpuA;
    if (who === d.lastShooter && d.shotAge < 0.2) return { ok: false, reason: 'own-shot', dist: Infinity, angleDeg: 0 };
    const eye = a.eye(_v1);
    if (who === 'player') return evalCatch(CATCH, eye, this.forward(_v2), d, d.panels);
    // CPU: hands in front of its body; horizontal angle only
    const toward = _v3.subVectors(d.pos, eye); toward.addScaledVector(a.up, -toward.dot(a.up));
    const aim = this.cpu.facingDir.clone();
    const tilt = _v2.subVectors(d.pos, eye).normalize();
    const res = evalCatch({ ...CPU_CATCH, approachSlack: 1.0 }, eye, aim.clone().addScaledVector(a.up, tilt.dot(a.up)).normalize(), d, d.panels);
    return res;
  }
  /** Called on every disc sub-step while flying. Returns true if the disc was caught. */
  checkCatches() {
    const ev = this.catchEval('player');
    if (ev.ok) this.recordCatchZone();
    this.lastCatchEval = ev;
    if (this.player.catchWindow > 0 && this.player.dashTime <= 0 && !this.player.holding && ev.ok) { this.giveDisc('player', true); return true; }
    const a = this.cpuA;
    if (a.catchWindow > 0 && a.dashTime <= 0 && !a.holding && this.catchEval('cpu').ok) { this.giveDisc('cpu', true); return true; }
    return false;
  }

  recordCatchZone() {
    if (this.catchFlightId !== this.disc.flightId) { this.catchFlightId = this.disc.flightId; this.firstCatchT = this.simTime; }
    this.lastOkCatchT = this.simTime;
  }

  playerShoot() {
    const p = this.player;
    if (!p.holding || p.shootCd > 0) return;
    this.suction = null; p.shotBufferedUntil = -99;
    const eye = p.eye(_v1), fwd = this.forward(_v2), right = this.flatRight(_v3), up = this.up(_v4);
    const origin = eye.clone().addScaledVector(fwd, 0.7).addScaledVector(right, 0.2).addScaledVector(up, -0.15);
    const aim = eye.clone().addScaledVector(fwd, 40);
    const dir = this.applyAirSpread(aim.sub(origin).normalize(), p);
    this.launch('player', origin, dir);
    p.shootCd = 0.35;
    this.arms.triggerThrow();
    this.fovKick = Math.max(this.fovKick, 3); this.shake = Math.max(this.shake, 0.05);
    if (p.curve) this.ui.chip(p.curve < 0 ? '← LEFT CURVE' : 'RIGHT CURVE →', 1.0);
    this.stats.shots++; if (!p.grounded) this.stats.airShots++;
  }
  airSpreadDeg(a) {
    if (a.grounded) return AIR_SHOT_SPREAD.ground;
    if (a === this.player && this.simTime <= a.wallShotUntil + 1e-9) return C.WALL_SHOT_SPREAD;
    const vy = a.vy;
    if (Math.abs(vy) < AIR_SHOT_SPREAD.apexBand) return AIR_SHOT_SPREAD.apex;
    return vy > 0 ? AIR_SHOT_SPREAD.rising : AIR_SHOT_SPREAD.falling;
  }
  applyAirSpread(dir, a) {
    const rnd = this.rngOverride || (() => this.rng.next());
    const max = this.airSpreadDeg(a);
    this.lastSpreadDeg = 0;
    if (max <= 0) return dir;
    const dev = THREE.MathUtils.degToRad(max) * (rnd() + rnd()) / 2;
    const phi = rnd() * Math.PI * 2;
    const u = new THREE.Vector3().crossVectors(a.up, dir); if (u.lengthSq() < 1e-6) u.set(1, 0, 0); u.normalize();
    const v = new THREE.Vector3().crossVectors(dir, u).normalize();
    this.lastSpreadDeg = THREE.MathUtils.radToDeg(dev);
    return dir.clone().multiplyScalar(Math.cos(dev)).addScaledVector(u, Math.sin(dev) * Math.cos(phi)).addScaledVector(v, Math.sin(dev) * Math.sin(phi)).normalize();
  }
  launch(who, origin, dir) {
    const a = who === 'player' ? this.player : this.cpuA;
    a.holding = false; a.holdTime = 0;
    const boosted = who === 'player' && this.simTime <= a.justUntil + 1e-9;
    const charge = who === 'player' && a.chargeStart != null ? THREE.MathUtils.clamp((this.simTime - a.chargeStart) / C.CHARGE_TIME, 0, 1) : 0;
    const wallShot = who === 'player' && !a.grounded && this.simTime <= a.wallShotUntil + 1e-9;
    const speed = who === 'player' ? shotParameters(a,this.simTime).speed : C.SHOT_SPEED;
    a.justUntil = -99; a.wallShotUntil = -99; this.lastOkCatchT = -99;
    this.disc.launch(origin, dir, who, speed);
    if (who === 'player') { this.disc.curveRate = -(a.curve || 0) * C.CURVE_RATE; this.disc.curveLeft = C.CURVE_TIME; a.chargeStart = null; }
    this.trail.reset(); this.setDiscColor(0); if(a.curve) this.trail.color.set(0xffdc63);
    this.bus.emit('DISC_THROWN', { who, speed });
  }
  dropFrom(a) { a.chargeStart = null; a.holding = false; a.holdTime = 0; a.noPickup = 1.0; this.disc.drop(); } // the dropper cannot re-grab for 1 s

  stepCPU(h) {
    const a = this.cpuA;
    this.cpu.record(this.simTime, this.disc, this.player);
    if (this.cpuFrozen) { a.step(h, _v1.set(0, 0, 0), this.envFor(a, this.player)); return; }
    const o = this.cpu.think(h, this.simTime, this.disc, this.player, this.keepers[0], this.goals);
    if (o.jump) a.tryJump(this.goals);
    if (o.dash && a.tryDash(o.wish)) this.cpuChar.play('dash', 0.3, 16);
    if (o.catch && this.canOpenWindow(a).ok && this.disc.state === 'FLYING') this.openWindow(a, 'cpu');
    if (this.cpu.windup > 0 && this.cpuAnim !== 'windup') { this.cpuAnim = 'windup'; this.cpuChar.play('windup', 0.2, 30); this.cpuChar.setExpression('shoot', 0.8); }
    if (o.shoot && a.holding) {
      const origin = a.eye().addScaledVector(this.cpu.facingDir, 0.6).addScaledVector(a.up, -0.2);
      this.launch('cpu', origin, this.applyAirSpread(o.shoot.dir.clone(), a));
      this.cpuChar.play('throw', 0.14, 40); this.cpuAnim = 'throw'; this.cpuThrowT = 0.14;
      this.stats.cpuShots++;
    }
    if (this.cpuThrowT > 0) { this.cpuThrowT -= h; if (this.cpuThrowT <= 0) { this.cpuChar.play('follow', 0.3, 20); this.cpuAnim = null; } }
    a.step(h, o.wish, this.envFor(a, this.player));
    if (a.atHalfLine) this.arena.touchHalfLine('pink', a.pos);
    if (a.catchWindow > 0) { a.catchWindow -= h; a.catchWindowAge += h; if (a.catchWindow <= 0 && !a.holding) a.catchCd = CPU_CATCH.cooldown; }
    if (a.holding && a.holdTime > C.HOLD_LIMIT) this.dropFrom(a);
    // facing (room direction perpendicular to up)
    let target = o.faceTo ? _v1.subVectors(o.faceTo, a.pos) : (o.wish.lengthSq() > 0.01 ? _v1.copy(o.wish) : null);
    const fd = this.cpu.facingDir; fd.addScaledVector(a.up, -fd.dot(a.up));
    if (target) {
      target.addScaledVector(a.up, -target.dot(a.up));
      if (target.lengthSq() > 1e-4) { target.normalize(); fd.lerp(target, Math.min(1, h * 10)); }
    }
    if (fd.lengthSq() < 1e-6) fd.copy(this.gravity.teamDir('cyan')); fd.normalize();
  }

  stepDisc(h) {
    const d = this.disc, events = [];
    // catch suction is simulation time (it gates the next shot), the visuals only read it
    if (this.suction) { this.suction.t += h; if (this.suction.t >= CATCH.suctionTime) this.suction = null; }
    if (d.state === 'HELD') {
      if (d.owner === 'player') {
        const eye = this.player.eye(_v1), fwd = this.forward(_v2), right = this.flatRight(_v3);
        d.pos.copy(eye).addScaledVector(fwd, 0.6).addScaledVector(right, 0.25).addScaledVector(this.player.up, -0.25);
        d.clampInside(d.pos);
        if (!this.player.holding) d.drop();
      } else {
        // logical hand position (simulation never reads the rendered skeleton -> server-safe, deterministic)
        const a = this.cpuA, fd = this.cpu.facingDir, side = _v3.crossVectors(fd, a.up);
        d.pos.copy(a.eye(_v1)).addScaledVector(fd, 0.55).addScaledVector(a.up, -0.45).addScaledVector(side, 0.3); d.clampInside(d.pos);
        if (!this.cpuA.holding) d.drop();
      }
      d.prevPos.copy(d.pos);
    } else if (d.state === 'FLYING') {
      d.stepFlying(h, events, () => this.checkCatches());
    } else {
      d.stepOther(h, events);
      if (d.state === 'NEUTRAL' || d.state === 'LOOSE') this.checkPickups();
    }
    for (const e of events) this.handleDiscEvent(e);
    // crosshair / debug: the same evaluation the catch uses
    const ev = d.state === 'FLYING' ? this.catchEval('player') : { ok: false, reason: 'no-flight', dist: Infinity, angleDeg: 0 };
    if (d.state === 'FLYING' && ev.ok) this.recordCatchZone();
    this.lastCatchEval = ev;
    const can = this.canOpenWindow(this.player);
    this.catchInRange = ev.dist <= CATCH.range && !this.player.holding;
    const rescue = d.state === 'FLYING' && this.catchFlightId === d.flightId && this.simTime - this.lastOkCatchT <= CATCH.rescue && !d.panels.some(p => segmentHitsOBB(this.player.eye(), d.pos, p));
    this.catchable = (ev.ok || rescue) && this.player.dashTime <= 0 && !this.player.holding && (can.ok || this.player.catchWindow > 0);
    this.catchBlock = ev.ok && !can.ok ? can.reason : null;
  }

  checkPickups() {
    const d = this.disc;
    let best = null, bestD = C.PICKUP_RADIUS;
    for (const [who, a] of [['player', this.player], ['cpu', this.cpuA]]) {
      if (a.dashTime > 0 || a.noPickup > 0) continue;
      const rel = _v1.subVectors(d.pos, a.pos), height = rel.dot(a.up);
      if (height > 1.0 || height < -0.5) continue;
      if (d.pos.dot(this.gravity.teamDir(a.team)) < -C.HALF_LINE_PICKUP_REACH) continue; // other half
      rel.addScaledVector(a.up, -height);
      const dist = rel.length();
      if (dist < bestD) { best = who; bestD = dist; }
    }
    if (best) this.giveDisc(best, false);
  }

  giveDisc(who, caught, rescued = false) {
    const a = who === 'player' ? this.player : this.cpuA;
    if (this.test) this.log.push({ type: caught ? 'catch' : 'pickup', who, t: this.simTime, airborne: !a.grounded, rescued, kickLock: a.kickLock > 0, wallKicks: a.wallKicks, shift: this.gravity.phase });
    const just = caught && who === 'player' && this.catchFlightId === this.disc.flightId && Math.abs(a.catchPressT - this.firstCatchT) <= CATCH.justWindow + 1e-9;
    a.justUntil = just ? this.simTime + CATCH.counterWindow : -99;
    if (caught && who === 'player') a.shootCd = 0;
    const from = this.disc.pos.clone();
    this.disc.hold(who);
    a.holding = true; a.holdTime = 0; a.catchWindow = 0; a.catchBuffer = 0; a.catchCd = caught ? 0.15 : a.catchCd;
    this.trail.reset();
    if (caught) {
      this.suction = { t: 0, from, who };   // short visual pull into the hand (success only)
      this.sparks.burst(from, who === 'player' ? 0xbffcff : 0xffb6dc, 26, 5, 0.1, 0.4, 2);
      if (who === 'player') this.stats.catches++;
      else this.cpuChar.setExpression('catch', 0.8);
      this.bus.emit('DISC_CAUGHT', { who, rescued, just, airborne: !a.grounded });
    } else this.audio.play('pickup');
    if (who === 'cpu') this.cpuChar.setBase('hold');
    if (caught && who === 'player' && this.simTime <= a.shotBufferedUntil) this.playerShoot();
  }

  setDiscColor(i) {
    i = Math.min(2, i);
    const c = DISC_COLORS[i];
    this.trail.color.set(c);
    if (i === this.discColorIdx) return;
    this.discColorIdx = i;
    this.discRimMat.color.set(c); this.discHaloMat.color.set(c); this.discLight.color.set(c); this.trail.color.set(c);
    this.arms.setDiscColor(c);
  }

  handleDiscEvent(e) {
    const d = this.disc;
    if (this.test) this.log.push({ type: e.type, t: this.simTime, surface: e.surface, count: e.count, value: e.value, scorer: e.scorer, shooter: e.shooter || d.lastShooter, keeper: e.keeper && e.keeper.team, part: e.part, mouth: e.mouth && e.mouth.id });
    switch (e.type) {
      case 'bounce': {
        const col = DISC_COLORS[Math.min(2, e.count)];
        this.setDiscColor(e.count);
        this.sparks.burst(e.point, col, 22, 7, 0.11, 0.45, 5, e.normal);
        this.rings.spawn(e.point.clone().addScaledVector(e.normal, 0.02), e.normal, col, 1.1, 0.3);
        if (/^[CK]\d/.test(e.surface)) this.arena.flashPanel(e.surface);
        this.stats.bounces += d.lastShooter === 'player' ? 1 : 0;
        this.bus.emit('DISC_BOUNCED', { count: e.count, surface: e.surface, rim: String(e.surface).startsWith('rim:') });
        break;
      }
      case 'thud': this.audio.play('thud'); break;
      case 'save': {
        const k = e.keeper, col = TEAM[k.team].main;
        k.onSave(e.lat);
        this.sparks.burst(e.point, col, 40, 9, 0.14, 0.55, 6);
        this.sparks.burst(e.point, 0xffffff, 16, 6, 0.09, 0.35, 3);
        this.rings.spawn(e.point, k.frame.front, col, 2.2, 0.4);
        this.hitstop = 0.1; this.setBanner('BLOCK!', TEAM[k.team].css, 1.2);
        if (d.lastShooter === 'player') this.stats.saves++;
        this.setDiscColor(0);
        this.bus.emit('GOAL_SAVED', { team: k.team, part: e.part });
        break;
      }
      case 'goal': this.onGoal(e); break;
      case 'timeout': this.ui.chip('DISC DROP', 0.6); break;
      case 'discReset': this.ui.chip('DISC RESET', 0.8); break;
    }
  }

  onGoal(e) {
    const team = e.scorer === 'player' ? 'cyan' : 'pink'; // who gets the points
    const goalTeam = e.team;                                // whose goal was hit
    this.score[team] += e.value;
    const own = e.shooter && ((e.shooter === 'player') !== (e.scorer === 'player'));
    this.arena.flashGoal(goalTeam);
    this.teamFlash[team] = 1.5; this.hype = 1;
    const col = TEAM[team].main, n = e.mouth.normal.clone().negate();
    this.sparks.burst(e.point, col, 90, 14, 0.16, 0.9, 7);
    this.sparks.burst(e.point, 0xffffff, 40, 10, 0.1, 0.6, 5);
    this.sparks.burst(e.point, 0xffd25a, 30, 12, 0.12, 0.8, 8);
    this.rings.spawn(e.point, n, col, 3.5, 0.6); this.rings.spawn(e.point, n, 0xffffff, 2.2, 0.45);
    this.hitstop = 0.14; this.shake = Math.max(this.shake, this.settings.reduceMotion ? 0.04 : 0.12);
    this.setBanner(`GOAL! +${e.value}`, TEAM[team].css, 2.4);
    for (const k of this.keepers) { if (k.team === goalTeam) k.onConcede(); else k.onTeamScored(); }
    if (team === 'pink') { this.cpuChar.play('celebrate', 1.6, 10); this.cpuChar.setExpression('shoot', 1.8); this.stats.cpuGoals++; }
    else { this.cpuChar.play('conceded', 1.6, 8); this.cpuChar.setExpression('conceded', 2.2); this.stats.goals++; this.stats.points[e.value]++; }
    this.player.holding = false; this.cpuA.holding = false;
    this.restartTeam=goalTeam; this.state = 'goal'; this.goalTimer = 2.4;
    this.bus.emit('GOAL_SCORED', { team, goalTeam, value: e.value, bounces: e.bounces, own, mouth: e.mouth.id });
  }

  /** Gravity shift finished: new goal pair, keepers re-home, anyone on the wrong side warps home. */
  onShiftCompleted() {
    this.goals._k = null;
    this.rehomeKeepers(true);
    for (const [who, a] of [['player', this.player], ['cpu', this.cpuA]]) {
      const dir = this.gravity.teamDir(a.team);
      if (a.pos.dot(dir) >= C.HALF_LINE_GAP) continue;
      const from = a.pos.clone();
      const to = this.spawnPos(a.team); to.addScaledVector(new THREE.Vector3(0, 0, 1), THREE.MathUtils.clamp(a.pos.z, -ROOM.W + 1, ROOM.W - 1));
      a.pos.copy(to); a.vel.set(0, 0, 0); a.grounded = false; a.floorFace = null; a.airTime = 0.2;
      this.sparks.burst(from, TEAM[a.team].main, 40, 6, 0.12, 0.5, 2); this.sparks.burst(to, TEAM[a.team].main, 40, 6, 0.12, 0.5, 2);
      this.rings.spawn(to.clone().addScaledVector(this.up(), 0.05), this.up(), TEAM[a.team].main, 2.0, 0.45);
      this.stats.warps++;
      if (this.test) this.log.push({ type: 'warp', who, from: from.toArray(), to: to.toArray(), t: this.simTime });
      this.bus.emit('PLAYER_WARPED', { who });
    }
  }

  // ---------------------------------------------------------------- visuals
  syncCamera(h) {
    const p = this.player;
    this.dipVel += (-this.dip * 180 - this.dipVel * 22) * h;
    this.dip += this.dipVel * h;
    this.dip = THREE.MathUtils.clamp(this.dip, -C.LANDING_DIP, 0.03);
    const eye = p.eye(_v1).addScaledVector(p.up, this.dip);
    this.camera.position.copy(this.room.localToWorld(eye));
    this.kickRoll *= Math.exp(-7 * h);
    this.camera.rotation.set(p.pitch, p.yaw, this.kickRoll);
  }

  updateShotGuide() {
    const p=this.player;
    this.shotGuide.visible=this.state==='playing'&&p.holding;
    if(!this.shotGuide.visible)return;
    if(this.guideFrame && this.simTime>=this.guideFrame && this.simTime-this.guideFrame<1/this.qualityProfile.guideHz)return;
    this.guideFrame=this.simTime;
    const eye=p.eye(),fwd=this.forward(new THREE.Vector3()),up=this.up(new THREE.Vector3());
    const origin=eye.clone().addScaledVector(fwd,.7).addScaledVector(this.flatRight(new THREE.Vector3()),.2).addScaledVector(up,-.15);
    const result=predictShot({origin,direction:eye.clone().addScaledVector(fwd,40).sub(origin).normalize(),parameters:shotParameters(p,this.simTime),goals:this.goals,gravity:this.gravity,panels:this.disc.panels,time:this.simTime});
    const colors=[];
    for(const count of result.bounces){const col=new THREE.Color(count?DISC_COLORS[Math.min(count,2)]:p.curve?0xffdc63:0x9effc3);colors.push(col.r,col.g,col.b);}
    this.shotGuide.geometry.dispose();this.shotGuide.geometry=new THREE.BufferGeometry().setFromPoints(result.points);this.shotGuide.geometry.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));
    this.shotGuide.geometry.setDrawRange(0,result.points.length);this.shotGuide.material.vertexColors=true;this.shotGuide.material.color.set(0xffffff);this.shotGuide.computeLineDistances();this.guideVolume.setPath(result.points,colors);
  }

  updateVisuals(dt, live) {
    const t = this.simTime;
    this.fovKick = Math.max(0, this.fovKick - dt * 30);
    const dashing = this.player.dashTime > 0;
    const shiftFov = this.gravity.rotating && this.settings.comfortShift ? -6 * Math.sin(Math.PI * this.gravity.progress) : 0;
    const targetFov = this.baseFov + this.fovKick + shiftFov;
    this.camera.fov += (targetFov - this.camera.fov) * Math.min(1, dt * 14);
    this.camera.updateProjectionMatrix();
    this.shake = Math.max(0, this.shake - dt);
    this.syncRoom();
    if (!live) this.syncCamera(0);
    if (this.shake > 0 && live && !this.settings.reduceMotion) {
      const s = this.shake * 0.08;
      this.camera.rotation.x += (Math.random() - 0.5) * s; this.camera.rotation.y += (Math.random() - 0.5) * s;
    }
    this.updateShotGuide();
    this.ui.speedLines(dashing && live);
    this.ui.shiftComfort(this.gravity.rotating && this.settings.comfortShift, this.gravity.progress);

    for (const k of this.keepers) k.animate(dt);
    const a = this.cpuA, ch = this.cpuChar.root;
    ch.position.copy(a.pos);
    const fd = this.cpu.facingDir, x = _v1.crossVectors(a.up, fd).normalize();
    if (x.lengthSq() > 0.5) { _m.makeBasis(x, a.up, _v2.crossVectors(x, a.up).normalize()); ch.quaternion.setFromRotationMatrix(_m); }
    if (!a.holding && this.cpuChar.basePose === 'hold') this.cpuChar.setBase('idle');
    const hv = _v3.copy(a.vel).addScaledVector(a.up, -a.vel.dot(a.up));
    this.cpuChar.update(dt, { speed: hv.length(), airborne: !a.grounded });

    // disc (room coordinates)
    const d = this.disc, up = this.up(_v4);
    const heldByPlayer = d.state === 'HELD' && d.owner === 'player';
    const sucking = this.suction && this.suction.who === 'player';
    this.discGroup.visible = !heldByPlayer || !!sucking;
    // display position: the CPU's disc is drawn in its hand socket (the simulation uses a logical hand point)
    const shown = _v5.copy(d.pos);
    if (d.state === 'HELD' && d.owner === 'cpu') { this.cpuChar.discSocket.getWorldPosition(shown); this.room.worldToLocal(shown); }
    if (this.suction) {
      const k = Math.min(1, this.suction.t / CATCH.suctionTime);
      this.discGroup.position.copy(this.suction.from).lerp(shown, k * k);
      this.discGroup.scale.setScalar(1 - 0.5 * k);
    } else { this.discGroup.position.copy(shown); this.discGroup.scale.setScalar(1); }
    this.discSpin.rotation.y += dt * (d.state === 'FLYING' ? 22 : 5);
    // disc plane: perpendicular to "up", tilted along its flight
    const n = _v2.copy(up);
    if (d.state === 'FLYING' && d.vel.lengthSq() > 0.1) { const vd = d.vel.clone().normalize(); n.addScaledVector(vd, -THREE.MathUtils.clamp(vd.dot(up), -0.6, 0.6)).normalize(); }
    this.discGroup.quaternion.setFromUnitVectors(_v3.set(0, 1, 0), n);
    if (d.state === 'NEUTRAL' || d.state === 'LOOSE') this.discGroup.position.addScaledVector(up, Math.sin(t * 3) * 0.06);
    this.discHalo.visible = d.state === 'FLYING' || d.state === 'NEUTRAL' || d.state === 'LOOSE';
    this.discHaloMat.opacity = d.state === 'FLYING' ? 0.4 : 0.25 + Math.sin(t * 5) * 0.1;
    this.discLight.position.copy(d.pos);
    this.discLight.intensity = heldByPlayer && !sucking ? 0 : d.state === 'FLYING' ? 10 : 5;
    if (d.state === 'FLYING') this.trail.push(d.pos); else if (d.state !== 'SCORED') this.trail.reset();
    this.trail.update(this.room.worldToLocal(this.camera.position.clone()));
    this.sparks.update(dt); this.rings.update(dt);

    const p = this.player;
    const ph = _v3.copy(p.vel).addScaledVector(p.up, -p.vel.dot(p.up));
    this.arms.update(dt, {
      speed: Math.min(1, ph.length() / C.MOVE_SPEED), airborne: !p.grounded, vy: p.vy,
      holding: p.holding && !sucking, dashing, lookDX: this.lookD ? this.lookD.x : 0, lookDY: this.lookD ? this.lookD.y : 0,
    });

    this.hype = Math.max(0.15, this.hype - dt * 0.25);
    for (const k of ['cyan', 'pink']) this.teamFlash[k] = Math.max(0, this.teamFlash[k] - dt);
    this.arena.setHalfLine(this.gravity.teamDir('cyan'), this.gravity.floorDir(), this.gravity.halfLineActive && this.state !== 'title');
    this.arena.update(dt, t, this.hype - 0.15 + (this.gravity.rotating ? 0.4 : 0), this.teamFlash);
    this.crowd.update(dt, t, this.state === 'ended' ? 0.5 : this.gravity.rotating ? 0.45 : 0.15);
    this.audio.setCrowd(Math.max(this.crowd.hype.cyan, this.crowd.hype.pink, (this.crowd.pop.cyan + this.crowd.pop.pink) * 0.5));
    if (this.bannerTimer > 0) { this.bannerTimer -= dt; if (this.bannerTimer <= 0) this.banner = null; }
    const tl = Math.max(0, Math.ceil(this.timeLeft));
    const g = this.gravity;
    const shiftTxt = g.rotating ? 'GRAVITY SHIFT' : g.phase === 'warning' ? 'ARENA SHIFT IN ' + Math.ceil(g.nextIn) : `NEXT SHIFT ${Math.ceil(g.nextIn)}s`;
    this.arena.updateJumbotron({ cyan: this.score.cyan, pink: this.score.pink, time: `${Math.floor(tl / 60)}:${String(tl % 60).padStart(2, '0')}`, banner: this.banner && this.banner.text, bannerColor: this.banner ? this.banner.color : '', paused: this.state === 'paused', shift: shiftTxt });
    this.ui.update(dt, this);
    if (this.debug) this.ui.debugCatch(this);
  }

  render() { this.renderer.render(this.scene, this.camera); this.arms.render(this.renderer); }

  resize() {
    const w = innerWidth, h = innerHeight;
    this.camera.aspect = w / h; this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h); this.arms.resize(w / h);
    this.sparks.setScale(h * this.renderer.getPixelRatio());
  }

  adaptResolution(dt) {
    this.frameMs = this.frameMs * 0.95 + dt * 1000 * 0.05;
    if (++this.frameN % 60 !== 0 || this.state !== 'playing') return;
    const target = this.isTouch ? 33 : 17.5;
    let s = this.dynScale;
    if (this.frameMs > target * 1.15 && s > 0.55) s -= 0.1;
    else if (this.frameMs < target * 0.75 && s < 1) s += 0.05;
    if (s !== this.dynScale) {
      this.dynScale = Math.round(s * 100) / 100;
      this.renderer.setPixelRatio(this.maxPR * this.dynScale); this.renderer.setSize(innerWidth, innerHeight);
      this.sparks.setScale(innerHeight * this.renderer.getPixelRatio());
    }
  }

  /** Serializable match state (what a future authoritative server would own and send). */
  snapshot() {
    return { t: this.simTime, clock: this.matchClock, timeLeft: this.timeLeft, state: this.state, score: { ...this.score }, gravity: this.gravity.snapshot(),
      activeGoals: { cyan: this.goals.active().cyan.id, pink: this.goals.active().pink.id }, player: this.player.snapshot(), cpu: this.cpuA.snapshot(), disc: this.disc.snapshot(),
      keepers: this.keepers.map(k => ({ team: k.team, z: k.z, mouth: k.mouth && k.mouth.id })) };
  }
}

export { CPU_PRESETS, REASON_JA };
