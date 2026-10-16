const assert=require('node:assert/strict'),load=require('./load.cjs');
const {MovementPredictor,MatchSimulation,CONFIG:C}=load(`export {MovementPredictor} from './src/movement-predictor.js';export {MatchSimulation} from './src/match-simulation.js';export {CONFIG} from './src/config.js';`);
const m=new MatchSimulation(),v=m.snapshot().athletes.cyan,other=m.athletes.pink.pos,p=new MovementPredictor('cyan');p.reconcile(v,{now:0,reset:true,other});const start=p.actor.pos.x;
p.advance(1/60,{moveX:0,moveY:1,yaw:-Math.PI/2},{now:16,seq:1,other});assert.ok(p.actor.pos.x>start,'movement must start before an ack arrives');assert.equal(m.athletes.cyan.pos.x,start,'prediction never mutates server state');
for(let i=2;i<240;i++)p.advance(1/120,{moveX:0,moveY:1,yaw:-Math.PI/2},{now:i,seq:i,other});assert.ok(p.actor.pos.x<=-C.HALF_LINE_GAP);assert.ok(p.history.length<=120);const frozen=p.actor.pos.clone();p.advance(.05,{moveY:1,yaw:-Math.PI/2},{now:1000,seq:999,other});assert.ok(p.actor.pos.distanceTo(frozen)<1e-9,'long stale data freezes prediction');
p.reconcile({...v,ack:999},{now:1100,reset:true,other});assert.equal(p.history.length,0);assert.ok(p.actor.pos.distanceTo(m.athletes.cyan.pos)<1e-9);assert.ok(p.sample(0).distanceTo(m.athletes.cyan.pos)<1e-9);
const received=m.seq.cyan;m.applyInput('cyan',{seq:40,moveY:0});assert.equal(m.snapshot().athletes.cyan.ack,-1,'received input is not yet applied');m.state='playing';m.step(1/120);assert.equal(m.snapshot().athletes.cyan.ack,40,'applied sequence is acknowledged');
console.log('Immediate bounded movement, safe reconciliation and applied acknowledgements PASS');

for(const team of ['cyan','pink']){
 const server=new MatchSimulation(),a=server.athletes[team],snapshot=server.snapshot().athletes[team],predictor=new MovementPredictor(team),enemy=server.athletes[team==='cyan'?'pink':'cyan'].pos;
 predictor.reconcile(snapshot,{now:0,reset:true,other:enemy});
 for(let n=0;n<240;n++)predictor.advance(1/120,{yaw:a.yaw,moveY:1,moveX:1},{now:n,seq:n,other:enemy});
 assert.ok((team==='cyan'?-1:1)*predictor.actor.pos.x>=C.HALF_LINE_GAP-1e-6);assert.ok(Number.isFinite(predictor.actor.pos.y));
 predictor.clear();assert.equal(predictor.history.length,0);assert.equal(predictor.initialized,false);
}
const jumper=new MatchSimulation();jumper.state='playing';const a=jumper.athletes.cyan,j=new MovementPredictor('cyan');j.reconcile(jumper.snapshot().athletes.cyan,{now:0,reset:true});jumper.applyInput('cyan',{seq:1,yaw:a.yaw,pitch:0,moveX:0,moveY:0,curve:0,jump:true});jumper.step(1/120);j.advance(1/120,{yaw:a.yaw},{now:8,seq:1,actions:{jump:true}});j.reconcile(jumper.snapshot().athletes.cyan,{now:9});assert.equal(j.actor.airJumps,a.airJumps,'an acknowledged jump is not replayed');assert.equal(j.history.length,0);
console.log('Both-team boundaries, history clearing and jump acknowledgement PASS');
