const assert=require('node:assert/strict'),load=require('./load.cjs');
(async()=>{
 const {CONFIG:C,MatchSimulation,Game}=load(`export {CONFIG} from './src/config.js';export {MatchSimulation} from './src/match-simulation.js';export {Game} from './src/game.js';`);
 const {validInput}=await import('../server/protocol.mjs');
 assert.equal(C.CURVE_RATE*C.CURVE_TIME,50*Math.PI/180);
 const {applyCurveControls}=load(`export {applyCurveControls} from './src/curve-controls.js';`);
 const p={curve:0},i={consume:()=>false,consumeCurveValue:v=>Math.max(-1,Math.min(1,v-.1))};applyCurveControls(p,i);assert.equal(p.curve,-.1);
 for(let n=0;n<20;n++)applyCurveControls(p,i);assert.equal(p.curve,-1);
 const base={seq:1,yaw:0,pitch:0,moveX:0,moveY:0};for(const c of [-1,-.7,0,.4,1])assert.ok(validInput({...base,curve:c}));for(const c of [NaN,Infinity,1.01,-1.01,'0.1',null])assert.ok(!validInput({...base,curve:c}));
 for(const score of [{cyan:1,pink:3},{cyan:4,pink:2},{cyan:2,pink:2}])for(const conceded of ['cyan','pink']){
  const m=new MatchSimulation();m.score={...score};m.restartTeam=conceded;m.state='goal';m.goalTimer=.001;m.step(.01);
  const expected=score.cyan===score.pink?conceded:score.cyan<score.pink?'cyan':'pink';assert.equal(m.disc.state,'HELD');assert.equal(m.disc.owner,expected==='cyan'?'player':'cpu');assert.equal(m.athletes[expected].holding,true);assert.equal(m.athletes[expected].holdTime,0);
 }
 for(const team of ['cyan','pink']){
  const m=new MatchSimulation();m.state='playing';m.giveDisc(team,false);m.athletes[team].holdTime=C.HOLD_LIMIT+.01;m.step(.001);
  assert.equal(m.athletes[team].holding,false);assert.equal(m.disc.owner,null);assert.ok((team==='cyan'?1:-1)*m.disc.pos.x>2);assert.equal(m.disc.state,'NEUTRAL');assert.equal(m.score.cyan+m.score.pink,0);assert.ok(m.timeLeft>0);
 }
 console.log('50 degree variable curves, protocol validation, losing-side possession and 7s turnover PASS');
})().catch(e=>{console.error(e);process.exitCode=1;});
