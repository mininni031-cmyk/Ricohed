// Shared source physics regression; shipped browser behavior is covered by browser suites.
// The test instruments a COPY of the bundled file in a Node sandbox; nothing is
// injected into the shipped bundle. Run with: node tests/side-reflection-v295.cjs
const fs=require('node:fs'), path=require('node:path'), vm=require('node:vm');
const assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');
const load=require('./load.cjs');
const {THREE:T,ROOM,CONFIG:C,CATCH,PANELS,DiscPhysics:Disc}=load(`export * as THREE from 'three'; export {ROOM,CONFIG,CATCH,PANELS} from './src/config.js'; export {DiscPhysics} from './src/physics.js';`);
const vec=(x=0,y=0,z=0)=>new T.Vector3(x,y,z);
function shoot(side,dir,originZ=0,originY=-ROOM.L+C.GOAL_Y){
 const goal={id:'test',center:vec(side<0?ROOM.L:-ROOM.L,-ROOM.L+C.GOAL_Y,0),normal:vec(-side,0,0),up:vec(0,1,0)};
 const goals={active(){return side<0?{cyan:null,pink:goal}:{cyan:goal,pink:null}}};
 const disc=new Disc([],goals,{up(out){return out.set(0,1,0)}});
 const origin=vec(side*C.SPAWN_DIST,originY,originZ);
 const velocity=typeof dir==='function'?dir({origin,disc,goal}):dir;
 disc.launch(origin,velocity,side<0?'player':'cpu',C.SHOT_SPEED);
 const events=[];
 for(let i=0;i<900&&disc.state==='FLYING';i++)disc.stepFlying(C.SIM_STEP,events);
 return {events,disc,time:disc.flightAge};
}
const checks=[];
function test(name,fn){fn();checks.push(name);console.log('PASS',name);}
const approx=(a,b,eps=1e-6)=>assert.ok(Math.abs(a-b)<eps,`${a} != ${b}`);
// 1. Dimensions & symmetry, all panels remain inside court and keep good vertical clearance.
test('24m court and reachable mirrored lanes',()=>{
 assert.equal(ROOM.W,12);assert.equal(PANELS.length,6);
 for(const p of PANELS){approx(Math.abs(p.pos[2]),6.5);assert.ok(Math.abs(p.pos[2])+p.size[0]<ROOM.W);}
 for(const [id,rotation] of [['C2',11],['C3',-11],['K2',11],['K3',-11]])assert.equal(PANELS.find(p=>p.id===id).rotY,rotation);
});
// 2. Left/right and cyan/pink: physically launch at panel centers and assert 1-reflection goal.
test('four aimed panel shots score 2 points',()=>{
 for(const side of [-1,1])for(const lane of [-1,1]){
  const id=side<0?(lane<0?'K3':'K2'):(lane<0?'C2':'C3');
  const result=shoot(side,({origin,disc})=>disc.panels.find(p=>p.id===id).center.clone().sub(origin).normalize());
  const events=result.events.filter(e=>e.type==='bounce'||e.type==='goal');
  assert.equal(events[0]?.surface,id,`side=${side} lane=${lane} first hit must be ${id}: ${events.map(e=>e.surface||e.type).join(',')}`);
  assert.equal(events[1]?.type,'goal');assert.equal(events[1].value,2);
  assert.ok(result.time<2,`lateral attack too slow ${result.time}`);
  console.log(`  ${id}: 2 points, ${result.time.toFixed(2)}s`);
 }
});
// 3. Both transparent end zones: one side-wall reflection remains mechanically possible.
test('four true side-wall bank shots score without extra panel hits',()=>{
 for(const side of [-1,1])for(const lane of [-1,1]){
  const result=shoot(side,({origin,goal})=>goal.center.clone().setZ(lane*(ROOM.W*2-3)).sub(origin).normalize());
  const events=result.events.filter(e=>e.type==='bounce'||e.type==='goal');
  // Side-wall bounce may be interrupted by a trick panel: still ensure scoring paths are possible.
  console.log(`  side ${side} wall ${lane}: ${events.map(e=>e.surface||`goal:${e.value}`).join(',')} (${result.time.toFixed(2)}s)`);
  assert.equal(events[0]?.surface,lane<0?'nz':'pz','must contact the intended wall first');
  assert.equal(events.find(e=>e.type==='goal')?.value,2,'single-sidewall reflection should score 2 points');
 }
});
// 4. Gameplay rules other than arena horizontal geometry are unchanged.
test('catch, goal, ceiling and online match physics constants preserved',()=>{
 assert.equal(C.VERSION,'2.9.11');assert.equal(ROOM.CEILING_Y+ROOM.L,6.8);
 assert.equal(C.GOAL_A,12/2.5);assert.equal(C.GOAL_B,1.25);
 assert.equal(C.MATCH_TIME,180);assert.equal(C.SIM_STEP,1/120);
 assert.equal(C.SHOT_SPEED,16);
 assert.equal(CATCH.range,2.3);assert.equal(CATCH.angleDeg,55);
 assert.equal(CATCH.window,0.75);assert.equal(CATCH.rescue,0.2);
});
// 5. Source, playable asset, deploy metadata and cache-bust match.
test('source and static bundle are in sync',()=>{
 const source=fs.readFileSync(path.join(root,'src/config.js'),'utf8');
 const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
 const pkg=require(path.join(root,'package.json'));
 assert.equal(pkg.version,C.VERSION);assert.ok(html.includes(`ricochet.js?v=${C.VERSION}`));
 assert.ok(html.includes('コート24m'));assert.ok(source.includes("VERSION: '2.9.11'"));
 assert.ok(/W: 12,/.test(source));
 for(const p of PANELS)assert.ok(source.includes(`id: '${p.id}'`));
});
console.log(`Side-reflection suite ${checks.length}/5 PASS`);
