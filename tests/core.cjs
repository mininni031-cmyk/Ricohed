// Mutations caught: circular scoring, narrow arena, wrong curve speed/angle, frame/scoring double hit.
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path');
const esbuild = require('esbuild');
const entry = `export {CONFIG,ROOM,PANELS} from './src/config.js'; export {GoalSystem} from './src/goals.js'; export {ArenaGravitySystem} from './src/gravity.js'; export {DiscPhysics,advanceCurve} from './src/physics.js'; export * as THREE from 'three';`;
const code = esbuild.buildSync({stdin:{contents:entry,resolveDir:path.resolve(__dirname,'..')},bundle:true,platform:'node',format:'cjs',write:false}).outputFiles[0].text;
const m = {exports:{}};new Function('module','exports','require',code)(m,m.exports,require);
const R=m.exports,V=(x,y,z)=>new R.THREE.Vector3(x,y,z),c=R.CONFIG;
let count=0; const test=(name,f)=>{try{f();count++;console.log('PASS '+name);}catch(e){console.error('FAIL '+name+': '+e.message);process.exitCode=1;}};
function shoot(z,dy,speed=16,bounces=0){const g=new R.ArenaGravitySystem(()=>{}),goals=new R.GoalSystem(g),d=new R.DiscPhysics([],goals,g);d.panels=[];const mouth=goals.active().pink;d.launch(V(9,mouth.center.y+dy,z),V(1,0,0),'player',speed);d.bounces=bounces;const events=[];for(let i=0;i<300&&d.state==='FLYING'&&!events.some(e=>e.type==='bounce');i++)d.stepFlying(1/120,events);return {d,events};}
test('stage width 28m and ceiling 10m',()=>{assert.equal(R.ROOM.W,14);assert.equal(R.ROOM.CEILING_Y+R.ROOM.L,10);});
test('goal center floor+2.3',()=>{assert.equal(c.GOAL_Y,2.3);});
for(const [z,y] of [[0,0],[3.85,0],[0,1.15],[2.8,.7]])test('ellipse scores '+z+','+y,()=>assert.equal(shoot(z,y).events.find(e=>e.type==='goal')?.value,1));
for(const [z,y] of [[0,1.3],[4.05,0],[3.6,.7]])test('ellipse rejects '+z+','+y,()=>assert.equal(shoot(z,y).events.some(e=>e.type==='goal'),false));
test('ellipse fast rim contact single event',()=>{const e=shoot(4.03,0,90).events;assert.equal(e.some(x=>x.type==='goal'),false);assert.equal(e.filter(x=>x.rim).length,1);});
for(const b of [0,1,2,5])test('points '+b,()=>assert.equal(shoot(0,0,16,b).events.find(e=>e.type==='goal')?.value,Math.min(3,b+1)));
test('curve total 25 degrees symmetric and constant speed',()=>{assert.equal(c.CURVE_SPEED,14);for(const sign of [-1,1]){const v=V(14,0,0);let left=c.CURVE_TIME;for(let i=0;i<240;i++)left=R.advanceCurve(v,V(0,1,0),sign*c.CURVE_RATE,left,1/120);assert.ok(Math.abs(v.length()-14)<1e-8);assert.ok(Math.abs(Math.atan2(-v.z,v.x)-sign*25*Math.PI/180)<1e-8);}});
console.log('Core passed '+count);if(process.exitCode)process.exit(process.exitCode);
