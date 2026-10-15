const assert=require('node:assert/strict');
(async()=>{const {CONFIG:C,ROOM}=await import('../src/config.js');
assert.ok(Math.abs((2*C.GOAL_A)/(2*ROOM.W)-1/2.5)<1e-12,'goal width must equal court width / 2.5');
assert.equal(C.GOAL_B,1.25);assert.equal(C.GOAL_Y,2.3);
const {GoalSystem}=await import('../src/goals.js'),{ArenaGravitySystem}=await import('../src/gravity.js');
const goals=new GoalSystem(new ArenaGravitySystem(()=>{})).active();
assert.ok(goals.cyan&&goals.pink);assert.ok(C.KEEPER_RANGE<C.GOAL_A);
console.log('Both-team goal ratio 1/2.5, unchanged height and keeper clearance PASS');
})().catch(e=>{console.error(e);process.exitCode=1;});
