import * as THREE from 'three';
import {CONFIG as C,ROOM,CATCH,AIR_SHOT_SPREAD} from './config.js';
import {Athlete} from './athlete.js';
import {ArenaGravitySystem} from './gravity.js';
import {GoalSystem} from './goals.js';
import {DiscPhysics,segmentHitsOBB,updatePanelColliders} from './physics.js';
import {KeeperPhysics} from './keeper-physics.js';
import {evalCatch} from './catch.js';
import {measureCatch} from './catch-measurement.js';
import {shotParameters} from './shot.js';
import {Rng} from './rng.js';
import {placeRestartDisc,restartPossession} from './restart.js';
const teams=['cyan','pink'],who=t=>t==='cyan'?'player':'cpu',teamOf=w=>w==='player'?'cyan':w==='cpu'?'pink':null;
export class MatchSimulation {
  constructor({seed=20261014,measureCatches=false}={}){
    if(measureCatches)this.catchMeasurements=[];
    this.gravity=new ArenaGravitySystem(()=>{});this.goals=new GoalSystem(this.gravity);this.rng=new Rng(seed);
    this.keepers=teams.map((t,i)=>new KeeperPhysics(t,i*Math.PI/2));for(const k of this.keepers)k.setHome(this.goals.active()[k.team]);
    this.disc=new DiscPhysics(this.keepers,this.goals,this.gravity);this.athletes={cyan:new Athlete('player','cyan'),pink:new Athlete('cpu','pink')};
    this.inputs={};this.queues={cyan:[],pink:[]};this.seq={cyan:-1,pink:-1};this.appliedSeq={cyan:-1,pink:-1};this.lastInputT={cyan:0,pink:0};
    this.score={cyan:0,pink:0};this.timeLeft=C.MATCH_TIME;this.simTime=0;this.matchClock=0;this.state='waiting';this.events=[];this.eventSeq=0;this.resetPositions();
  }
  resetPositions(restartTeam=null){
    for(const team of teams){const a=this.athletes[team];a.reset(new THREE.Vector3(team==='cyan'?-C.SPAWN_DIST:C.SPAWN_DIST,-ROOM.L,0),new THREE.Vector3(0,1,0));a.curveEpoch??=0;a.yaw=team==='cyan'?-Math.PI/2:Math.PI/2;a.pitch=-.05;a.curve=0;a.chargeStart=null;a.justUntil=a.wallShotUntil=a.catchPressT=a.shotBufferedUntil=-99;a.lastOkCatchT=-99;a.catchFlightId=null;a.firstCatchT=-99;this.inputs[team]={yaw:a.yaw,pitch:a.pitch,moveX:0,moveY:0,curve:0};this.queues[team]=[];}
    this.disc.reset();if(restartTeam){const team=restartPossession(this.score,restartTeam);this.giveDisc(team,false);const a=this.athletes[team];this.disc.pos.copy(a.eye()).addScaledVector(this.forward(a),.6).addScaledVector(this.right(a),.25).addScaledVector(a.up,-.25);this.disc.prevPos.copy(this.disc.pos);}
  }
  start(){this.state='countdown';this.countT=0;}
  emit(type,data={}){this.events.push({id:++this.eventSeq,type,...data});if(this.events.length>24)this.events.shift();}
  applyInput(team,input){if(!teams.includes(team)||!Number.isSafeInteger(input.seq)||input.seq<=this.seq[team]||this.queues[team].length>=32)return false;this.seq[team]=input.seq;this.lastInputT[team]=this.simTime;this.queues[team].push({...input});return true;}
  clearInputs(){for(const t of teams){this.queues[t]=[];this.inputs[t].moveX=this.inputs[t].moveY=0;this.athletes[t].chargeStart=null;this.athletes[t].shotBufferedUntil=-99;}}
  forward(a){return new THREE.Vector3(-Math.sin(a.yaw)*Math.cos(a.pitch),Math.sin(a.pitch),-Math.cos(a.yaw)*Math.cos(a.pitch));}
  right(a){return new THREE.Vector3(Math.cos(a.yaw),0,-Math.sin(a.yaw));}
  catchEval(team){const a=this.athletes[team],d=this.disc;if(d.lastShooter===who(team)&&d.shotAge<.2)return {ok:false};return evalCatch(CATCH,a.eye(),this.forward(a),d,d.panels);}
  recordCatchZone(team){const a=this.athletes[team];if(a.catchFlightId!==this.disc.flightId){a.catchFlightId=this.disc.flightId;a.firstCatchT=this.simTime;}a.lastOkCatchT=this.simTime;}
  canCatch(a){return !a.holding&&a.dashTime<=0&&a.catchCd<=0;}
  pressCatch(team){
    const a=this.athletes[team];a.catchPressT=this.simTime;
    if(!this.canCatch(a)){if(a.holding||a.catchCd>0)a.catchBuffer=CATCH.rescue;return;}
    if(this.disc.state==='FLYING'&&a.catchFlightId===this.disc.flightId&&this.simTime-a.lastOkCatchT<=CATCH.rescue&&this.disc.pos.distanceTo(a.eye())<=CATCH.rescueMaxDist&&!this.disc.panels.some(p=>segmentHitsOBB(a.eye(),this.disc.pos,p))){this.giveDisc(team,true,true);return;}
    if(this.disc.state!=='FLYING'){a.catchBuffer=CATCH.rescue;return;}
    a.catchWindow=CATCH.window;a.catchWindowAge=0;
  }
  giveDisc(team,caught,rescued=false){
    const a=this.athletes[team];const just=caught&&a.catchFlightId===this.disc.flightId&&Math.abs(a.catchPressT-a.firstCatchT)<=CATCH.justWindow+1e-9;
    if(caught&&this.catchMeasurements){this.catchMeasurements.push(measureCatch(team,this.simTime,rescued?'rescue':a.catchWindowAge>0?'window':'immediate',a.eye(),this.forward(a),this.disc,this.catchEval(team)));if(this.catchMeasurements.length>128)this.catchMeasurements.shift();}
    for(const t of teams)this.athletes[t].holding=t===team;
    a.curveEpoch=(a.curveEpoch||0)+1;a.curve=0;this.inputs[team].curve=0;for(const pending of this.queues[team])pending.curve=0;
    this.disc.hold(who(team));a.holdTime=0;a.catchWindow=a.catchBuffer=0;a.justUntil=just?this.simTime+CATCH.counterWindow:-99;
    if(caught){a.shootCd=0;a.catchCd=.15;this.emit('catch',{team,just,rescued});}else this.emit('pickup',{team});
    if(caught&&this.simTime<=a.shotBufferedUntil)this.shoot(team);
  }
  spread(dir,a){
    const vy=a.vy,max=a.grounded?0:this.simTime<=a.wallShotUntil+1e-9?C.WALL_SHOT_SPREAD:Math.abs(vy)<AIR_SHOT_SPREAD.apexBand?AIR_SHOT_SPREAD.apex:vy>0?AIR_SHOT_SPREAD.rising:AIR_SHOT_SPREAD.falling;
    if(!max)return dir;const dev=max*Math.PI/180*(this.rng.next()+this.rng.next())/2,phi=this.rng.next()*Math.PI*2;
    const u=new THREE.Vector3().crossVectors(a.up,dir);if(u.lengthSq()<1e-6)u.set(1,0,0);u.normalize();const v=new THREE.Vector3().crossVectors(dir,u).normalize();return dir.clone().multiplyScalar(Math.cos(dev)).addScaledVector(u,Math.sin(dev)*Math.cos(phi)).addScaledVector(v,Math.sin(dev)*Math.sin(phi)).normalize();
  }
  shoot(team){
    const a=this.athletes[team];if(!a.holding||a.shootCd>0)return false;
    const f=this.forward(a),eye=a.eye(),origin=eye.clone().addScaledVector(f,.7).addScaledVector(this.right(a),.2).addScaledVector(a.up,-.15),dir=this.spread(eye.clone().addScaledVector(f,40).sub(origin).normalize(),a),params=shotParameters(a,this.simTime);
    this.disc.launch(origin,dir,who(team),params.speed);this.disc.curveRate=params.rate;this.disc.curveLeft=params.duration;a.holding=false;a.holdTime=0;a.shootCd=.35;a.justUntil=a.wallShotUntil=a.shotBufferedUntil=-99;a.chargeStart=null;
    for(const t of teams)this.athletes[t].lastOkCatchT=-99;
    this.emit('shot',{team,speed:params.speed,curve:a.curve,flightId:this.disc.flightId});return true;
  }
  move(team,dt){
    const a=this.athletes[team],other=this.athletes[team==='cyan'?'pink':'cyan'];let i=this.queues[team].shift();
    if(i){this.appliedSeq[team]=i.seq;this.inputs[team]={...this.inputs[team],yaw:i.yaw??a.yaw,pitch:i.pitch??a.pitch,moveX:i.moveX??0,moveY:i.moveY??0,curve:(i.curveEpoch??0)===a.curveEpoch?(i.curve??a.curve):a.curve};a.yaw=this.inputs[team].yaw;a.pitch=this.inputs[team].pitch;a.curve=this.inputs[team].curve;}
    else i={};
    if(this.simTime-this.lastInputT[team]>.5){this.inputs[team].moveX=this.inputs[team].moveY=0;a.chargeStart=null;}
    const input=this.inputs[team],flat=new THREE.Vector3(-Math.sin(a.yaw),0,-Math.cos(a.yaw)),wish=flat.clone().multiplyScalar(input.moveY).addScaledVector(this.right(a),input.moveX);if(wish.lengthSq()>1)wish.normalize();
    if(i.jump){const j=a.tryJump(this.goals);if(j==='kick'){a.wallShotUntil=this.simTime+C.WALL_SHOT_TIME;this.emit('wallkick',{team});}}
    if(i.dash)a.tryDash(wish.lengthSq()>.01?wish:flat);
    if(i.catch)this.pressCatch(team);else if(a.catchBuffer>0){a.catchBuffer-=dt;if(a.catchBuffer>0&&this.canCatch(a)&&!a.catchWindow&&this.disc.state==='FLYING'){a.catchBuffer=0;a.catchWindow=CATCH.window;a.catchWindowAge=0;}}
    if(i.chargeCancel||!a.holding)a.chargeStart=null;if(i.chargeStart&&a.holding)a.chargeStart=this.simTime;
    if(i.chargeRelease&&a.chargeStart!=null&&a.holding)this.shoot(team);
    if(i.shoot){a.shotBufferedUntil=this.simTime+CATCH.shotBuffer;this.shoot(team);}
    const ev=a.step(dt,wish,{up:new THREE.Vector3(0,1,0),halfLine:{dir:this.gravity.teamDir(team),on:true},others:[{pos:other.pos},]});
    if(ev.some(e=>e.type==='land'))a.wallShotUntil=-99;
    if(a.catchWindow>0){a.catchWindow-=dt;a.catchWindowAge+=dt;if(a.catchWindow<=0&&!a.holding)a.catchCd=CATCH.cooldown;}
    if(a.holding&&a.holdTime>C.HOLD_LIMIT)this.turnover(team);
  }
  turnover(team){
    for(const t of teams){const a=this.athletes[t];a.holding=false;a.holdTime=0;a.chargeStart=null;a.justUntil=a.wallShotUntil=a.shotBufferedUntil=-99;}
    const other=team==='cyan'?'pink':'cyan';this.disc.reset();placeRestartDisc(this.disc,other,this.rng);this.emit('turnover',{team:other});
  }
  checkCatches(){for(const team of teams){const a=this.athletes[team],ev=this.catchEval(team);if(ev.ok)this.recordCatchZone(team);if(ev.ok&&a.catchWindow>0&&a.dashTime<=0&&!a.holding){this.giveDisc(team,true);return true;}}return false;}
  pickups(){let best=null,bestD=C.PICKUP_RADIUS;for(const team of teams){const a=this.athletes[team];if(a.dashTime>0||a.noPickup>0)continue;const rel=this.disc.pos.clone().sub(a.pos),height=rel.dot(a.up);if(height>1||height<-.5||this.disc.pos.dot(this.gravity.teamDir(team))<-C.HALF_LINE_PICKUP_REACH)continue;rel.addScaledVector(a.up,-height);const d=rel.length();if(d<bestD){best=team;bestD=d;}}if(best)this.giveDisc(best,false);}
  step(dt){
    if(this.state==='waiting'||this.state==='ended')return;
    this.simTime+=dt;updatePanelColliders(this.disc.panels,this.simTime);
    if(this.state==='countdown'){this.countT+=dt;if(this.countT>=2.1)this.state='playing';return;}
    if(this.state==='goal'){this.goalTimer-=dt;if(this.goalTimer<=0){this.resetPositions(this.restartTeam);this.restartTeam=null;this.state='playing';}return;}
    this.timeLeft=Math.max(0,this.timeLeft-dt);this.matchClock+=dt;if(!this.timeLeft){this.state='ended';this.clearInputs();this.emit('ended');return;}
    for(const k of this.keepers)k.update(dt,this.matchClock);
    for(const t of teams)this.move(t,dt);
    const d=this.disc,events=[];
    if(d.state==='HELD'){const a=this.athletes[teamOf(d.owner)];d.pos.copy(a.eye()).addScaledVector(this.forward(a),.6).addScaledVector(this.right(a),.25).addScaledVector(a.up,-.25);d.clampInside(d.pos);d.prevPos.copy(d.pos);}
    else if(d.state==='FLYING')d.stepFlying(dt,events,()=>this.checkCatches());
    else {d.stepOther(dt,events);if(d.state==='NEUTRAL'||d.state==='LOOSE')this.pickups();}
    for(const t of teams){if(d.state==='FLYING'&&this.catchEval(t).ok)this.recordCatchZone(t);}
    for(const e of events){
      if(e.type==='goal'){const team=e.scorer==='player'?'cyan':'pink';this.score[team]+=e.value;this.restartTeam=team==='cyan'?'pink':'cyan';this.state='goal';this.goalTimer=2.4;for(const t of teams)this.athletes[t].holding=false;this.emit('goal',{team,value:e.value,point:e.point.toArray()});}
      else if(e.type==='bounce')this.emit('bounce',{count:e.count,surface:e.surface,point:e.point.toArray()});
      else if(e.type==='save')this.emit('save',{team:e.keeper.team,point:e.point.toArray(),lat:e.lat});
    }
  }
  snapshot(){
    const athletes={};for(const team of teams){const a=this.athletes[team];athletes[team]={...a.snapshot(),yaw:a.yaw,pitch:a.pitch,curve:a.curve,curveEpoch:a.curveEpoch,chargeStart:a.chargeStart,justUntil:a.justUntil,wallShotUntil:a.wallShotUntil,holdTime:a.holdTime,catchWindow:a.catchWindow,catchCd:a.catchCd,dashCd:a.dashCd,dashTime:a.dashTime,catchable:!a.holding&&a.dashTime<=0&&this.catchEval(team).ok,ack:this.appliedSeq[team],movement:{airTime:a.airTime,sinceTakeoff:a.sinceTakeoff,kickLock:a.kickLock,slidOff:a.slidOff,floor:a.floorFace?.id||null,dashVec:a.dashVec.toArray()}};}
    return {t:this.simTime,clock:this.matchClock,state:this.state,timeLeft:this.timeLeft,countT:this.countT||0,score:{...this.score},athletes,disc:{...this.disc.snapshot(),owner:teamOf(this.disc.owner),lastShooter:teamOf(this.disc.lastShooter),curveRate:this.disc.curveRate,curveLeft:this.disc.curveLeft,flightId:this.disc.flightId||0},keepers:this.keepers.map(k=>({team:k.team,z:k.z})),events:[...this.events]};
  }
}
