import * as THREE from 'three';
import {Athlete,ROOM_FACES} from './athlete.js';
// Presentation only: never predicts a disc, possession, catches or score.
export class MovementPredictor {
 constructor(team){this.actor=new Athlete('prediction',team);this.history=[];this.offset=new THREE.Vector3();this.view=new THREE.Vector3();this.receivedAt=-Infinity;this.initialized=false;this.maxHistoryMs=250;this.maxEntries=120;}
 clear(){this.history.length=0;this.offset.set(0,0,0);this.initialized=false;this.receivedAt=-Infinity;}
 simulate(dt,input,actions={},other,goals){
  const a=this.actor,yaw=input.yaw||0,forward=new THREE.Vector3(-Math.sin(yaw),0,-Math.cos(yaw)),right=new THREE.Vector3(Math.cos(yaw),0,-Math.sin(yaw));
  const wish=forward.multiplyScalar(input.moveY||0).addScaledVector(right,input.moveX||0);if(wish.lengthSq()>1)wish.normalize();
  let left=dt,first=true;while(left>1e-8){const h=Math.min(1/120,left);if(first&&actions.jump)a.tryJump(goals);if(first&&actions.dash)a.tryDash(wish.lengthSq()>.01?wish:right.set(-Math.sin(yaw),0,-Math.cos(yaw)));a.step(h,wish,{up:new THREE.Vector3(0,1,0),halfLine:{dir:new THREE.Vector3(a.team==='cyan'?-1:1,0,0),on:true},others:other?[{pos:other}]:[]});left-=h;first=false;}
 }
 reconcile(state,{now,reset=false,other,goals}={}){
  const a=this.actor,old=this.initialized?this.sample(0).clone():null;
  const jumped=this.lastAuthoritative&&new THREE.Vector3(...state.pos).distanceTo(this.lastAuthoritative)>2;
  if(reset||jumped||now-this.receivedAt>500)this.history.length=0;
  this.history=this.history.filter(r=>r.seq>(state.ack??-1)&&now-r.at<=this.maxHistoryMs);
  a.pos.fromArray(state.pos);a.vel.fromArray(state.vel);a.up.set(0,1,0);
  for(const k of ['grounded','holding','holdTime','airJumps','wallKicks','catchWindow','catchCd','dashCd','dashTime'])if(state[k]!==undefined)a[k]=state[k];
  const movement=state.movement||{};for(const k of ['airTime','sinceTakeoff','kickLock','slidOff'])a[k]=movement[k]??0;
  a.floorFace=a.grounded?(ROOM_FACES.find(f=>f.id===(movement.floor||'ny'))||null):null;a.dashVec.fromArray(movement.dashVec||[0,0,0]);
  this.lastAuthoritative=a.pos.clone();this.receivedAt=now;
  for(const r of this.history)this.simulate(r.dt,r.input,r.actions,other,goals);
  const distance=old?old.distanceTo(a.pos):Infinity;
  if(!reset&&!jumped&&distance<1.5)this.offset.copy(old).sub(a.pos);else this.offset.set(0,0,0);
  this.initialized=true;
 }
 advance(dt,input,{now,seq,actions={},other,goals}={}){
  if(!this.initialized||now-this.receivedAt>this.maxHistoryMs){this.history.length=0;return;}
  const h=Math.max(0,Math.min(.05,dt));if(!h)return;
  this.simulate(h,input,actions,other,goals);this.history.push({seq,dt:h,at:now,input:{...input},actions:{jump:!!actions.jump,dash:!!actions.dash}});
  this.history=this.history.filter(r=>now-r.at<=this.maxHistoryMs).slice(-this.maxEntries);
 }
 sample(dt){this.offset.multiplyScalar(Math.exp(-18*Math.max(0,dt)));return this.view.copy(this.actor.pos).add(this.offset);}
}
