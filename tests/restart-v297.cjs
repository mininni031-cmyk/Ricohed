const assert=require('node:assert/strict');
(async()=>{
 const {MatchSimulation}=await import('../src/match-simulation.js');
 const {ROOM,CONFIG:C}=await import('../src/config.js');
 const {QUALITY_PROFILES}=await import('../src/quality.js');
 const {placeRestartDisc}=await import('../src/restart.js'),{Rng}=await import('../src/rng.js');
 const random=new Rng(297),positions=new Set();
 for(let i=0;i<80;i++){const m=new MatchSimulation(),team=i%2?'cyan':'pink';placeRestartDisc(m.disc,team,random);const p=m.disc.pos;assert.ok((team==='cyan'?-1:1)*p.x>=2.5);assert.ok(Math.hypot(Math.abs(p.x)-C.SPAWN_DIST,p.z)>1.6);positions.add(p.toArray().join(','));}
 assert.equal(positions.size,80,'successive restarts must vary');
 for(const scorer of ['cyan','pink']){
  const m=new MatchSimulation();m.state='playing';m.disc.keepers=[];m.disc.panels=[];
  const target=m.goals.active()[scorer==='cyan'?'pink':'cyan'];
  m.disc.launch(target.center.clone().addScaledVector(target.normal,-1),target.normal,scorer==='cyan'?'player':'cpu',16);
  for(let i=0;i<60&&m.state!=='goal';i++)m.step(1/120);
  assert.equal(m.state,'goal');
  while(m.state==='goal')m.step(1/120);
  const conceded=scorer==='cyan'?'pink':'cyan',p=m.disc.pos;
  assert.ok((conceded==='cyan'?-1:1)*p.x>2,'restart must be in conceding half');
  assert.ok(Math.abs(p.z)<ROOM.W-1);
  assert.equal(m.disc.state,'HELD');assert.equal(m.disc.owner,conceded==='cyan'?'player':'cpu');
 }
 const m=new MatchSimulation();m.state='playing';const k=m.keepers.find(k=>k.team==='cyan');
 m.athletes.cyan.pos.copy(k.feet());const before=m.athletes.cyan.pos.clone();m.step(1/120);
 assert.ok(Math.hypot(m.athletes.cyan.pos.x-before.x,m.athletes.cyan.pos.z-before.z)<.01,'keeper must not push athlete');
 assert.equal(m.disc.keepers.length,2,'keeper still defends disc');
 assert.ok(QUALITY_PROFILES.balanced.pixelCap<=1);assert.equal(QUALITY_PROFILES.balanced.antialias,false);
 assert.ok(QUALITY_PROFILES.balanced.crowd<=.12);
 console.log('Conceding-side restart, keeper pass-through and lightweight profile PASS');
})().catch(e=>{console.error(e);process.exitCode=1;});
