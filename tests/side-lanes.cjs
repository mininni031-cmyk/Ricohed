// Side-panel 1-bounce scoring from centre lane, both teams and both sides.
const assert=require('node:assert/strict'), load=require('./load.cjs');
const {THREE:T,DiscPhysics,GoalSystem,ArenaGravitySystem,CONFIG,ROOM}=load(`export * as THREE from 'three';export * from './src/physics.js';export * from './src/goals.js';export * from './src/gravity.js';export {CONFIG,ROOM} from './src/config.js';`);
for(const side of [-1,1])for(const lane of [-1,1]){
 const gravity=new ArenaGravitySystem(()=>{}), goals=new GoalSystem(gravity);
 const disc=new DiscPhysics([],goals,gravity), id=side<0?(lane<0?'K3':'K2'):(lane<0?'C2':'C3');
 const origin=new T.Vector3(side*CONFIG.SPAWN_DIST,-ROOM.L+CONFIG.GOAL_Y,0);
 const target=disc.panels.find(p=>p.id===id);assert.ok(target,`${id} panel exists`);
 const direction=target.center.clone().sub(origin).normalize();
 disc.launch(origin,direction,side<0?'player':'cpu',CONFIG.SHOT_SPEED);
 const events=[];
 for(let i=0;i<720&&disc.state==='FLYING';i++)disc.stepFlying(1/120,events);
 const strikes=events.filter(e=>e.type==='bounce'||e.type==='goal');
 assert.equal(strikes[0]?.surface,id,`first strike from team ${side} ${lane} must be panel ${id}`);
 assert.equal(strikes[1]?.type,'goal',`one panel then goal ${id}`);
 assert.equal(strikes[1].value,2,`2 point ricochet ${id}`);
 assert.ok(disc.flightAge<2,`short attack ${id}`);
}
console.log('Four fast lateral panel lanes create aimed one-bounce 2-point goals PASS');
