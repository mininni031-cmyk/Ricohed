const assert=require('node:assert/strict'),load=require('./load.cjs');
const {MatchSimulation}=load(`export {MatchSimulation} from './src/match-simulation.js';`);
const g=new MatchSimulation({seed:42});g.start();for(let i=0;i<300;i++)g.step(1/120);
assert.equal(g.state,'playing');
const old=g.athletes.cyan.pos.x;g.applyInput('cyan',{seq:1,yaw:-Math.PI/2,pitch:0,moveX:0,moveY:1,curve:0});for(let i=0;i<120;i++)g.step(1/120);assert.ok(g.athletes.cyan.pos.x>old);assert.ok(g.athletes.cyan.pos.x<=-.4);
assert.equal(g.applyInput('cyan',{seq:1,moveX:1}),false);
for(const team of ['cyan','pink']){const a=g.athletes[team];g.giveDisc(team,false);a.curve=1;g.shoot(team);assert.equal(g.disc.state,'FLYING');assert.ok(Math.abs(g.disc.vel.length()-14)<1e-8);assert.equal(a.holding,false);}
for(const team of ['cyan','pink']){g.resetPositions();g.state='playing';g.keepers=[];g.disc.keepers=[];g.disc.panels=[];const m=g.goals.active()[team==='cyan'?'pink':'cyan'];g.disc.launch(m.center.clone().addScaledVector(m.normal,-2),m.normal,team==='cyan'?'player':'cpu',14);g.disc.bounces=2;const before=g.score[team];for(let i=0;i<30;i++)g.step(1/120);assert.equal(g.score[team],before+3);}
g.state='playing';g.timeLeft=.02;for(let i=0;i<10;i++)g.step(1/120);assert.equal(g.state,'ended');assert.equal(g.timeLeft,0);
console.log('Match simulation movement, input sequence, both shots, both scoring, match end PASS');
for(const team of ['cyan','pink']){
 const m=new MatchSimulation({seed:7});m.state='playing';const a=m.athletes[team],f=m.forward(a);m.disc.launch(a.eye().addScaledVector(f,2.2),f.clone().negate(),team==='cyan'?'cpu':'player');
 m.applyInput(team,{seq:1,yaw:a.yaw,pitch:0,moveX:0,moveY:0,curve:0,catch:true});m.step(1/120);assert.equal(a.holding,true,team+' catch via input');assert.ok(a.justUntil>m.simTime);m.applyInput(team,{seq:2,yaw:a.yaw,pitch:0,moveX:0,moveY:0,curve:0,shoot:true});m.step(1/120);assert.equal(m.disc.state,'FLYING');assert.ok(Math.abs(m.disc.vel.length()-18.4)<1e-8,team+' just counter');
 const immediate=new MatchSimulation({seed:7});immediate.state='playing';const p=immediate.athletes[team],aim=immediate.forward(p);immediate.disc.launch(p.eye().addScaledVector(aim,2.2),aim.clone().negate(),team==='cyan'?'cpu':'player');immediate.applyInput(team,{seq:1,yaw:p.yaw,pitch:0,moveX:0,moveY:0,curve:0,catch:true,shoot:true});immediate.step(1/120);assert.equal(immediate.disc.state,'FLYING');assert.equal(immediate.disc.lastShooter,team==='cyan'?'player':'cpu');assert.ok(Math.abs(immediate.disc.vel.length()-18.4)<1e-8);
}
console.log('Both online teams: actual catch input, just counter and same-step catch/shoot PASS');
