// Low-ceiling regression suite (6.8 m roof): player capsule, disc, panels and catch settings.
// Usage: node tests/ceiling-hotfix.cjs [variant 1-5]  (variants shift jump timing / step size)
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const load = require('./load.cjs');
// Real gameplay modules (the same source the browser bundle and the Render server are built from).
const R = load(`export * as THREE from 'three';export {ROOM,CONFIG,CATCH,PANELS} from './src/config.js';export {Athlete,ROOM_FACES} from './src/athlete.js';export {DiscPhysics,buildPanelColliders} from './src/physics.js';export {evalCatch} from './src/catch.js';`);
const V = (x=0,y=0,z=0) => new R.THREE.Vector3(x,y,z);
const FLOOR = -R.ROOM.L;
const ROOF = R.ROOM.CEILING_Y;
const top = a => a.pos.y + R.CONFIG.PLAYER_HEIGHT;
const ceilingOK = a => assert.ok(top(a) <= ROOF + 1e-7, `head ${top(a)} crossed roof ${ROOF}`);
const eye = V(0,FLOOR+1.65,0);
let count=0;
function run(name,fn) { fn(); count++; console.log('PASS '+name); }
const variant = Number(process.argv[2] || 1);
const env = {up:V(0,1,0),halfLine:null,others:[]};
function athlete(team='cyan') { const a=new R.Athlete('test',team);a.reset(V(team==='cyan'?-6.5:6.5,FLOOR,0),V(0,1,0));return a; }
// 1. Repeated single & double jumps never raise the player capsule above the actual roof.
run('1. Jump and double-jump stay under the ceiling',()=>{
 for(const team of ['cyan','pink']){
  const a=athlete(team);assert.equal(a.tryJump(),1);
  let second=false;let hits=0;
  for(let i=0;i<300;i++){
   if(i===18+variant){const j=a.tryJump();second=!!j;}
   const events=a.step(1/120,V(),env);hits+=events.filter(e=>e.type==='ceiling').length;
   ceilingOK(a);
  }
  assert.ok(second,'second jump must be accessible before reaching roof');
  assert.ok(hits>0,'roof impact should be registered');
 }
});
// 2. Velocity spikes, illegal overshoots and blocked roof jumps are corrected.
run('2. Overshoot guard and roof-jump rejection',()=>{
 for(const speed of [25,75,240,700]){
  const a=athlete();a.pos.y=ROOF-R.CONFIG.PLAYER_HEIGHT-0.02;a.grounded=false;a.vel.set(0,speed,0);
  const ev=a.step((variant%2 ? 1/30 : 1/120),V(),env);
  ceilingOK(a);assert.ok(a.vel.y<=0,'upward speed not removed on impact');
  assert.ok(ev.some(e=>e.type==='ceiling'),'ceiling collision event missing');
  assert.equal(a.tryJump(),false,'cannot jump while contacting roof');
 }
});
// 3. Fast upward discs bounce off the same ceiling plane; falling disc also stays inside.
run('3. Disc ceiling collision and downward bounce',()=>{
 const gravity={up(out){return out.set(0,1,0)}};
 const goals={active(){return {cyan:null,pink:null}}};
 for(const speed of [16,64,180]){
  const d=new R.DiscPhysics([],goals,gravity);d.panels=[];
  d.launch(V(0,ROOF-1.2,0),V(0,1,0),'player',speed);
  let bounced=false;
  for(let i=0;i<30;i++){
   const events=[];d.stepFlying(1/120,events);
   assert.ok(d.pos.y<=ROOF-R.CONFIG.DISC_RADIUS+1e-7,'disc penetrated roof');
   if(events.some(e=>e.type==='bounce'&&e.surface==='py'))bounced=true;
   if(bounced)break;
  }
  assert.ok(bounced,'disc never registered roof bounce');assert.ok(d.vel.y<0,'disc must reflect downward');
  d.state='FALLING';d.pos.set(0,ROOF-0.5,0);d.vel.set(0,90,0);d.stepOther(1/60,[]);
  assert.ok(d.pos.y<=ROOF-R.CONFIG.DISC_RADIUS+1e-7,'falling disc penetrated roof');
 }
});
// 4. Layout data drives actual colliders with widened, mirrored panels.
run('4. Panel spacing and collider orientation consistency',()=>{
 const panels=R.buildPanelColliders();assert.equal(panels.length,6);
 assert.equal(new Set(panels.map(p=>p.id)).size,6);
 for(const p of panels){assert.ok(Math.abs(p.center.z)>=8.5-1e-7,`${p.id} too close to centre`);assert.ok(Math.abs(p.center.x)<=R.ROOM.L,'outside wall');const real=p.definition;assert.equal(p.center.y,real.pos[1]);assert.equal(p.center.z,real.pos[2]);assert.equal(p.q.lengthSq()>0,true);}
 const cyan=panels.filter(p=>p.team==='cyan'),pink=panels.filter(p=>p.team==='pink');assert.equal(cyan.length,3);assert.equal(pink.length,3);
 assert.ok(cyan.some(p=>p.center.z>0)&&cyan.some(p=>p.center.z<0));
 assert.ok(pink.some(p=>p.center.z>0)&&pink.some(p=>p.center.z<0));
});
// 5. Catch envelope & handoff assets are consistent with this release.
run('5. Catch, source/bundle config, and cache-busted deployment asset',()=>{
 assert.equal(R.CATCH.range,3.1);assert.equal(R.CATCH.angleDeg,72);assert.equal(R.CATCH.window,.9);assert.equal(R.CATCH.rescue,.38);
 const target=(d,degree)=>{const theta=degree*Math.PI/180;const p=V(d*Math.cos(theta),0,d*Math.sin(theta));return {state:'FLYING',pos:p,prevPos:p.clone(),vel:p.clone().negate()};};
 assert.equal(R.evalCatch(R.CATCH,V(),V(1,0,0),target(3,68),[]).ok,true);
 assert.equal(R.evalCatch(R.CATCH,V(),V(1,0,0),target(3.15,0),[]).ok,false);
 assert.equal(R.evalCatch(R.CATCH,V(),V(1,0,0),target(2,76),[]).ok,false);
 const bundle=fs.readFileSync(path.join(root,'ricochet.js'),'utf8'),source=fs.readFileSync(path.join(root,'src/athlete.js'),'utf8'),config=fs.readFileSync(path.join(root,'src/config.js'),'utf8'),html=fs.readFileSync(path.join(root,'index.html'),'utf8'),arena=fs.readFileSync(path.join(root,'src/arena.js'),'utf8');
 assert.ok(source.includes('touchingRoof()'),'roof contact rule missing in source');
 assert.ok(/CEILING_Y:-4\.2|CEILING_Y:-4\.2/.test(bundle.replace(/\s/g,'')),'browser bundle not rebuilt with the 6.8 m roof');
 assert.ok(config.includes('CEILING_Y: -4.2')&&config.includes('range: 3.10')&&config.includes('angleDeg: 72'));
 assert.ok(arena.includes('const CY = ROOM.CEILING_Y') && arena.includes('m.position.y = CY'));
 const version=JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8')).version;
 assert.ok(html.includes(`ricochet.js?v=${version}`),'index.html must cache-bust ricochet.js with the package version');
 assert.equal(ROOF-FLOOR,6.8);
});
console.log(`RICOCHET low-ceiling suite: ${count}/5 PASS (variant ${variant})`);
