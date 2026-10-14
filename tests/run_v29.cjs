const fs=require('fs'),http=require('http'),path=require('path');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root=path.resolve(__dirname,'..');
const server=http.createServer((req,res)=>{let f=path.join(root,decodeURIComponent(req.url.split('?')[0]));if(f.endsWith(path.sep))f+='index.html';fs.readFile(f,(e,d)=>{res.statusCode=e?404:200;res.setHeader('Content-Type',f.endsWith('.js')?'text/javascript':f.endsWith('.css')?'text/css':f.endsWith('.html')?'text/html':'application/octet-stream');res.end(e?'missing':d);});});
(async()=>{await new Promise(r=>server.listen(8027,'127.0.0.1',r));const b=await chromium.launch({headless:true,...(process.env.BROWSER_PATH ? {executablePath:process.env.BROWSER_PATH} : {}),args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']}); const p=await b.newPage({viewport:{width:1280,height:720}});let errors=[];p.on('pageerror',e=>errors.push(String(e)));await p.goto('http://127.0.0.1:8027/?test=1');await p.waitForFunction(()=>window.__RICO);const tests=fs.readFileSync(path.join(root,'tests/run_tests.py'),'utf8');await p.evaluate(tests.split('HELPERS = r"""')[1].split('"""')[0]);
const results=await p.evaluate(()=>{const {g,V,clean,run,aimAt}=TT,R=__RICO, rows=[];const check=(n,v)=>rows.push({name:n,pass:!!v});
const setup=()=>{clean();g.player.pos.set(-6.5,-11,0);g.player.pitch=0;g.player.yaw=-Math.PI/2;g.input.enabled=true;const e=g.player.eye();g.disc.launch(e.clone().add(V(2.2,0,0)),V(-1,0,0),'cpu');g.recordCatchZone();};
check('stage dimensions and wall kick',R.ROOM.W===14&&Math.abs(R.ROOM.CEILING_Y+R.ROOM.L-6.8)<1e-8&&R.WALL_KICK.horizontalSpeed===12);
for(const dt of [-.151,-.15,0,.15,.151]){setup();g.player.catchPressT=g.simTime+dt;g.giveDisc('player',true);check('just boundary '+dt,(g.player.justUntil>g.simTime)===(Math.abs(dt)<=.15));}
for(const dt of [0,.6,.601]){setup();g.player.catchPressT=g.simTime;g.giveDisc('player',true);g.simTime+=dt;g.playerShoot();check('counter speed '+dt,Math.abs(g.disc.vel.length()-(dt<=.6?18.4:16))<1e-8);check('immediate throw state '+dt,g.disc.state==='FLYING'&&g.suction===null);}
setup();g.player.shotBufferedUntil=g.simTime+.15;g.player.catchPressT=g.simTime;g.giveDisc('player',true);check('same-step shoot buffer',g.disc.state==='FLYING'&&Math.abs(g.disc.vel.length()-18.4)<1e-8);
setup();g.player.catchPressT=g.simTime-.3;g.giveDisc('player',true);g.playerShoot();check('normal catch no bonus',Math.abs(g.disc.vel.length()-16)<1e-8);
setup();g.pressCatch(g.player,'player');check('actual catch button',g.player.holding);g.ui.update(0,g);check('counter HUD',document.getElementById('chipCatch').textContent.includes('COUNTER +15%'));
setup();g.player.dashTime=.1;g.stepDisc(0);check('dash display blocked',!g.catchable);
setup();g.disc.panels=[{center:g.player.eye().add(V(1.4,0,0)),half:V(.1,2,2),qi:new R.THREE.Quaternion()}];g.lastOkCatchT=-99;check('occlusion rejects catch',g.catchEval('player').reason==='occluded');
setup();const old=g.disc.flightId;g.disc.launch(g.player.eye().add(V(6,0,0)),V(1,0,0),'cpu');g.pressCatch(g.player,'player');check('old flight cannot late rescue',!g.player.holding&&g.disc.flightId!==old);
setup();g.disc.pos.copy(g.player.eye().add(V(0.6,0,2.65)));g.disc.prevPos.copy(g.disc.pos);g.disc.vel.set(1,0,0);check('peripheral catch rejected',!g.catchEval('player').ok);
setup();g.disc.launch(g.player.eye().add(V(4,0,0)),V(-1,0,0),'cpu');g.pressCatch(g.player,'player');run(20);check('early normal catch window',g.player.holding);

setup();g.lastOkCatchT=-99;g.disc.launch(g.player.eye().add(V(2.5,0,0)),V(-1,0,0),'cpu');TT.key('KeyF');g.input.press('shoot');run(3);check('real input catch and buffered counter',g.disc.lastShooter==='player'&&Math.abs(g.disc.vel.length()-18.4)<1e-8);
for(const [name,fold,value] of [['direct',z=>z,1],['one',z=>2*(R.ROOM.W-R.CONFIG.DISC_RADIUS)-z,2],['two',z=>4*(R.ROOM.W-R.CONFIG.DISC_RADIUS)+z,3]]){clean();TT.noKeepers();const m=g.goals.active().pink;const o=TT.canon(.5,-R.ROOM.L+R.CONFIG.GOAL_Y,-.4),t=m.center.clone();t.x-=R.CONFIG.DISC_RADIUS;t.z=fold(0);g.disc.launch(o,t.sub(o).normalize(),'player');TT.flyUntilDone();check('scoring '+name,g.score.cyan===value);}
setup();g.player.catchWindow=.8;g.disc.pos.copy(g.player.eye().add(V(-2,0,2)));g.disc.prevPos.copy(g.disc.pos);g.lastOkCatchT=g.simTime-.1;g.pressCatch(g.player,'player');check('late rescue during active window',g.player.holding);
setup();g.lastOkCatchT=g.simTime-(R.CATCH.rescue+.001);g.disc.pos.copy(g.player.eye().add(V(-2,0,2)));g.disc.prevPos.copy(g.disc.pos);g.pressCatch(g.player,'player');check('expired rescue rejected',!g.player.holding);
clean();g.cpuFrozen=false;run(1200);
check('CPU match simulation',g.timeLeft<170&&Number.isFinite(g.disc.pos.x));g.ui.update(0,g);g.render(0);
setup();g.giveDisc('player',false);TT.key('KeyZ');run(1);check('curve left selection',g.player.curve===-1);g.playerShoot();const z0=g.disc.pos.z;run(12);check('curve bends left',g.disc.pos.z<z0-.01);
setup();g.giveDisc('player',false);TT.key('KeyC');document.dispatchEvent(new KeyboardEvent('keydown',{code:'KeyQ'}));run(150);document.dispatchEvent(new KeyboardEvent('keyup',{code:'KeyQ'}));run(1);check('full charge release fires',g.disc.state==='FLYING'&&Math.abs(g.disc.vel.length()-22.4)<1e-7);
setup();g.giveDisc('player',false);g.playerShoot();check('default shot unchanged',Math.abs(g.disc.vel.length()-16)<1e-7);

setup();g.giveDisc('player',false);TT.key('KeyX');run(1);g.playerShoot();const zr=g.disc.pos.z;run(12);check('curve bends right',g.disc.pos.z>zr+.01);
setup();g.giveDisc('player',false);g.player.chargeStart=g.simTime-.6;g.ui.update(0,g);check('charge HUD 50%',document.getElementById('chipShot').textContent.includes('50%'));g.playerShoot();check('half charge 19.2',Math.abs(g.disc.vel.length()-19.2)<1e-7);
setup();g.giveDisc('player',false);g.player.chargeStart=g.simTime;g.pause();check('pause cancels charge',g.player.chargeStart===null);g.state='playing';
setup();g.giveDisc('player',false);g.player.chargeStart=g.simTime-2;g.launch('cpu',g.cpuA.eye(),V(-1,0,0));check('CPU stays normal',Math.abs(g.disc.vel.length()-16)<1e-7);

setup();g.giveDisc('player',false);g.player.grounded=false;g.player.wallShotUntil=g.simTime+.8;check('wall shot accuracy',g.airSpreadDeg(g.player)<=.35);g.playerShoot();check('wall shot speed',Math.abs(g.disc.vel.length()-17.6)<1e-7);

for(const dt of [.8,.801]){setup();g.giveDisc('player',false);g.player.grounded=false;g.player.wallShotUntil=g.simTime+.8;g.simTime+=dt;g.playerShoot();check('wall boost boundary '+dt,Math.abs(g.disc.vel.length()-(dt<=.8?17.6:16))<1e-7);}
setup();g.giveDisc('player',false);g.player.pos.set(-4,-8,__RICO.ROOM.W-.45);g.player.grounded=false;g.player.airJumps=1;const kick=g.player.tryJump(g.goals);if(kick==='kick')g.onWallKick(g.player,'player');g.ui.update(0,g);check('real wallkick activates boost',kick==='kick'&&g.player.wallShotUntil>g.simTime&&Math.abs(g.player.vel.z+12)<1e-8);check('wall shot HUD',document.getElementById('chipAir').textContent.includes('WALL SHOT +10%'));g.playerShoot();check('wall bonus consumed',g.player.wallShotUntil<g.simTime);
setup();g.giveDisc('player',false);g.player.grounded=false;g.player.wallShotUntil=g.simTime+.8;g.player.justUntil=g.simTime+.6;g.playerShoot();check('wall plus just stack',Math.abs(g.disc.vel.length()-20.24)<1e-7);
setup();g.player.grounded=false;g.player.pos.y=-__RICO.ROOM.L+.01;g.player.vel.set(0,-2,0);g.player.wallShotUntil=g.simTime+.8;run(10);check('landing cancels wall bonus',g.player.grounded&&g.player.wallShotUntil<g.simTime);

check('goal opening width8 height2.5',R.CONFIG.GOAL_A===4&&R.CONFIG.GOAL_B===1.25&&R.CONFIG.GOAL_Y===2.3);
check('clearer curve angle',Math.abs(R.CONFIG.CURVE_RATE*R.CONFIG.CURVE_TIME-25*Math.PI/180)<1e-9);
setup();g.giveDisc('player',false);g.player.curve=-1;g.updateVisuals(0,true);check('visible curved direction guide',!!g.shotGuide?.visible);
setup();g.giveDisc('player',false);g.player.curve=0;g.guideFrame=-99;g.updateShotGuide();check('straight prediction visible',g.shotGuide.visible&&g.shotGuide.geometry.drawRange.count>10);check('trajectory legend',document.getElementById('trajectoryLegend').textContent.includes('立体ガイド'));

setup();g.player.curve=0;for(const expected of [-1,1,0]){TT.key('KeyE');run(1);check('E cycles to '+expected,g.player.curve===expected);check('E never catches '+expected,!g.player.holding&&g.player.catchWindow<=0);}g.giveDisc('player',false);g.ui.update(0,g);check('short shot label in HUD',document.getElementById('curveGuide').textContent==='直線');
setup();const e=g.player.eye();g.disc.pos.copy(e.clone().add(V(2.9,0,0)));g.disc.prevPos.copy(g.disc.pos);check('2.9m now inside',g.catchEval('player').ok);g.disc.pos.copy(e.clone().add(V(2.2,0,0)));g.disc.prevPos.copy(g.disc.pos);check('2.2m stays catchable',g.catchEval('player').ok);
const placeAt=a=>{g.disc.pos.copy(e.clone().add(V(Math.cos(a*Math.PI/180)*2,0,Math.sin(a*Math.PI/180)*2)));g.disc.prevPos.copy(g.disc.pos);};placeAt(76);check('76deg outside',!g.catchEval('player').ok);placeAt(68);check('68deg stays catchable',g.catchEval('player').ok);
check('tighter catch window, unchanged counter timing',R.CATCH.window===.9&&R.CATCH.justWindow===.15&&R.CATCH.counterWindow===.6);
return rows;});
console.log(JSON.stringify({results,errors},null,2));fs.writeFileSync(path.join(root,'tests/v29-results.json'),JSON.stringify({results,errors},null,2));await p.goto('http://127.0.0.1:8027/?test=1');await p.waitForFunction(()=>window.__RICO); const hb=await p.evaluate(()=>{const h=__RICO.game.keepers[0].hb;return {reachTop:h.reachTop,reachSide:h.reachSide,parts:h.parts.map(p=>({name:p.name,a:p.a.toArray(),b:p.b.toArray(),r:p.r}))};});fs.writeFileSync(path.join(root,'src/keeper-hitbox.json'),JSON.stringify(hb,null,2));await p.click('#start');await p.evaluate(()=>{const g=__RICO.game;for(let i=0;i<330;i++)g.step(1/120);g.giveDisc('player',false);g.player.curve=-1;g.ui.update(0,g);g.updateVisuals(0,true);g.render();});await p.screenshot({path:path.join(root,'tests/preview.png')});fs.writeFileSync(path.join(root,'tests/v29-results.json'),JSON.stringify({results,errors},null,2));await b.close();server.close();if(errors.length||results.some(x=>!x.pass))process.exitCode=1;})().catch(e=>{console.error(e);server.close();process.exit(1)});


