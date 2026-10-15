const assert=require('node:assert/strict'),load=require('./load.cjs');
const {CONFIG:C,Input,MatchSimulation}=load(`export {CONFIG} from './src/config.js';export {Input} from './src/input.js';export {MatchSimulation} from './src/match-simulation.js';`);
assert.equal(C.CURVE_STEP_DEG,10);
const i=Object.create(Input.prototype);i.curveSteps=-1;i.curveValue=null;assert.equal(i.consumeCurveValue(0),-.2);i.curveSteps=2;assert.equal(i.consumeCurveValue(-.2),.2);
for(const team of ['cyan','pink'])for(const caught of [false,true]){const m=new MatchSimulation();m.state='playing';m.athletes[team].curve=-1;m.inputs[team].curve=-1;m.giveDisc(team,caught);assert.equal(m.athletes[team].curve,0,'every possession starts straight');assert.equal(m.inputs[team].curve,0);m.shoot(team);assert.equal(Math.abs(m.disc.curveRate),0,'immediate shot after pickup/catch is straight');}
console.log('10 degree wheel and possession curve reset PASS');

for(const team of ['cyan','pink']){const m=new MatchSimulation();m.state='playing';const a=m.athletes[team];a.curve=1;m.giveDisc(team,false);m.applyInput(team,{seq:1,yaw:a.yaw,pitch:0,moveX:0,moveY:0,curve:1,curveEpoch:0,shoot:true});m.step(.001);assert.equal(Math.abs(m.disc.curveRate),0,'in-flight old curve must not undo pickup reset');}

for(const team of ['cyan','pink']){const m=new MatchSimulation();m.state='playing';const a=m.athletes[team];m.giveDisc(team,false);m.applyInput(team,{seq:1,yaw:a.yaw,pitch:0,moveX:0,moveY:0,curve:.6,curveEpoch:a.curveEpoch,shoot:true});m.step(.001);assert.ok(Math.abs(Math.abs(m.disc.curveRate)-.6*C.CURVE_RATE)<1e-9,'new possession accepts fresh curve choice');}
console.log('Stale possession input rejected; fresh curve selection accepted PASS');
