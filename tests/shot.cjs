const assert=require('node:assert/strict'),load=require('./load.cjs');
const {THREE:T,shotParameters,predictShot,GoalSystem,ArenaGravitySystem,DiscPhysics}=load(`export * as THREE from 'three';export * from './src/shot.js';export * from './src/prediction.js';export * from './src/goals.js';export * from './src/gravity.js';export * from './src/physics.js';`);
let count=0;const ok=(name,f)=>{f();count++;console.log('PASS '+name);};
ok('curve base 14 and charge/counter/wall multiply',()=>{assert.equal(shotParameters({curve:1,grounded:true},0).speed,14);assert.equal(shotParameters({curve:0,grounded:true},0).speed,16);assert.ok(Math.abs(shotParameters({curve:-1,grounded:false,chargeStart:0,justUntil:2,wallShotUntil:2},1.2).speed-24.794)<1e-8);});
for(const curve of [-1,-.5,-.1,0,.1,.5,1])for(const direction of [[1,0,0],[1,.1,2],[.1,0,1]])ok('prediction matches real curve '+curve+' dir '+direction,()=>{
  const gravity=new ArenaGravitySystem(()=>{}),goals=new GoalSystem(gravity),origin=new T.Vector3(0,-9,8),dir=new T.Vector3(...direction).normalize(),parameters=shotParameters({curve,grounded:true},0);
  const result=predictShot({origin,direction:dir,parameters,goals,gravity,panels:[]},1.5);const disc=new DiscPhysics([],goals,gravity);disc.panels=[];disc.launch(origin,dir,'player',parameters.speed);disc.curveRate=parameters.rate;disc.curveLeft=parameters.duration;
  for(let i=0;i<180&&disc.state==='FLYING';i++)disc.stepFlying(1/120,[]);
  assert.ok(disc.pos.distanceTo(result.points.at(-1))<.02);assert.equal(disc.bounces,result.bounces.at(-1));
});
console.log('Shot tests '+count+' passed');
