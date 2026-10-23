const assert=require('node:assert/strict'),load=require('./load.cjs');
const {Game,MatchSimulation,THREE,CATCH,CPU_CATCH}=load(`export {Game} from './src/game.js'; export {MatchSimulation} from './src/match-simulation.js'; export * as THREE from 'three'; export {CATCH,CPU_CATCH} from './src/config.js';`);
// Run real offline catch methods without a renderer. Visual/audio dependencies are inert.
function offline(actor){
 const m=new MatchSimulation(),g=Object.create(Game.prototype);
 Object.assign(g,{player:m.athletes.cyan,cpuA:m.athletes.pink,disc:m.disc,simTime:1,test:true,log:[],gravity:m.gravity,
  cpu:{facingDir:new THREE.Vector3(-1,0,0)},arms:{triggerCatch(){}},audio:{play(){}},input:{resetCurve(){}},
  trail:{reset(){}},sparks:{burst(){}},bus:{emit(){}},stats:{catches:0},cpuChar:{setBase(){},setExpression(){},play(){}},catchFlightId:null,lastOkCatchT:-99});
 g.player.yaw=-Math.PI/2;g.player.pitch=0;
 return {g,a:actor==='player'?g.player:g.cpuA,aim:actor==='player'?new THREE.Vector3(1,0,0):new THREE.Vector3(-1,0,0)};
}
function setup(actor,distance,height=0){const x=offline(actor);x.g.disc.panels=[];const dir=x.aim.clone().multiplyScalar(distance).addScaledVector(x.a.up,height);x.g.disc.launch(x.a.eye().add(dir),x.aim.clone().negate(),actor==='player'?'cpu':'player',16);return x;}
const baseline=process.argv.includes('--baseline');
// Diagnostic comparison only: reproduce the exact catch23e spatial constants in this process.
if(baseline){CATCH.range=CPU_CATCH.range=2.3;CATCH.rescueMaxDist=3;}
for(const actor of ['player','cpu']){
 for(const [distance,height] of [[2.29,0],[1.3,1.7],[1,0]]){
  const {g,a}=setup(actor,distance,height);a.catchWindow=.4;a.catchWindowAge=.1;g.checkCatches();
  console.log(JSON.stringify({case:'offline',actor,distance,height,caught:a.holding,measurement:g.catchMeasurements?.at(-1)}));
  if(!baseline)assert.equal(a.holding,distance===1,actor+' must reject distant/high discs but catch close discs');
 }
}
for(const team of ['cyan','pink']){
 const m=new MatchSimulation({measureCatches:true}),a=m.athletes[team];a.pitch=0;const f=m.forward(a);m.disc.panels=[];
 m.disc.launch(a.eye().addScaledVector(f,2.29),f.clone().negate(),team==='cyan'?'cpu':'player',16);a.catchWindow=.4;a.catchWindowAge=.1;m.checkCatches();
 console.log(JSON.stringify({case:'server',team,caught:a.holding,measurement:m.catchMeasurements?.at(-1)}));
 if(!baseline)assert.equal(a.holding,false,team+' server rejects same distant catch');
}
if(baseline){
 const {g,a}=setup('player',2.99);g.catchFlightId=g.disc.flightId;g.lastOkCatchT=g.simTime-.1;g.firstCatchT=g.lastOkCatchT;
 g.pressCatch(a,'player');console.log(JSON.stringify({case:'offline-late',caught:a.holding,measurement:g.catchMeasurements?.at(-1)}));
}
{
 const {g,a}=setup('player',5);g.pressCatch(a,'player');
 for(let i=0;i<60&&!a.holding;i++){g.simTime+=1/120;a.catchWindow-=1/120;a.catchWindowAge+=1/120;g.disc.stepFlying(1/120,[],()=>g.checkCatches());}
 console.log(JSON.stringify({case:'moving-early-press-5m',caught:a.holding,measurement:g.catchMeasurements.at(-1)}));
 assert.equal(a.holding,true,'0.75s early window remains usable');assert.ok(g.catchMeasurements.at(-1).distance<=CATCH.range+1e-9);
}
if(!baseline){
 for(const distance of [1.1,1.3,2.99]){
  const {g,a}=setup('player',distance);g.catchFlightId=g.disc.flightId;g.lastOkCatchT=g.simTime-.1;g.firstCatchT=g.lastOkCatchT;
  g.pressCatch(a,'player');assert.equal(a.holding,distance===1.1,'offline rescue distance '+distance);
  if(a.holding)assert.equal(g.catchMeasurements.at(-1).route,'rescue');
  for(const team of ['cyan','pink']){
   const m=new MatchSimulation({measureCatches:true}),p=m.athletes[team];p.pitch=0;const f=m.forward(p);m.disc.panels=[];
   m.disc.launch(p.eye().addScaledVector(f,distance),f.clone().negate(),team==='cyan'?'cpu':'player',16);
   m.simTime=1;p.catchFlightId=m.disc.flightId;p.lastOkCatchT=.9;p.firstCatchT=.9;m.pressCatch(team);
   assert.equal(p.holding,distance===1.1,team+' rescue distance '+distance);
   if(p.holding)assert.equal(m.catchMeasurements.at(-1).route,'rescue');
  }
 }
 for(const actor of ['player','cpu']){
  const {g,a}=setup(actor,1.1);a.catchWindow=.5;a.catchWindowAge=0;g.checkCatches();assert.equal(g.catchMeasurements.at(-1).route,'immediate');
  const quiet=setup(actor,1.1);quiet.g.test=false;quiet.a.catchWindow=.5;quiet.g.checkCatches();assert.equal(quiet.g.catchMeasurements,undefined);
 }
 const quiet=new MatchSimulation();assert.equal(quiet.catchMeasurements,undefined);assert.equal(JSON.stringify(quiet.snapshot()).includes('catchMeasurements'),false);
 assert.equal(CATCH.window,.75);assert.equal(CATCH.range,CPU_CATCH.range);assert.equal(CATCH.rescueMaxDist,CATCH.range);
 console.log('Catch distance, both-team rescue, immediate/window routes and diagnostics isolation PASS');
}
