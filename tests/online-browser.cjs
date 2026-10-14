const assert=require('node:assert/strict'),fs=require('node:fs');const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
(async()=>{
 const {createServer}=await import('../server/index.mjs'),{staticServer}=await import('../server/static.mjs');const staticS=staticServer();await new Promise(r=>staticS.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+staticS.address().port,app=createServer({origins:[base],reconnectMs:3000});await app.listen(0);const wsurl='ws://127.0.0.1:'+app.server.address().port;
 const b=await chromium.launch({headless:true,...(process.env.BROWSER_PATH?{executablePath:process.env.BROWSER_PATH}:{}),args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});const errors=[];let checks=0;
 try{
  const pages=[];for(let i=0;i<2;i++){const p=await b.newPage({viewport:{width:1280,height:720}});p.on('pageerror',e=>errors.push(String(e)));console.log('opening player '+i);await p.goto(base+'/?test=1',{waitUntil:'domcontentloaded',timeout:60000});await p.waitForFunction(()=>window.__RICO);await p.evaluate(()=>{__RICO.game.renderer.setPixelRatio(.5);setInterval(()=>{__RICO.game.tick(.05);},50);});await p.click('#chooseOnline');await p.locator('#connectionSettings summary').click();await p.fill('#netUrl',wsurl);await p.locator('#connectionSettings summary').click();await p.fill('#netRoom','browser-room');await p.click('#netJoin');await p.waitForFunction(()=>__RICO.game.online?.team);pages.push(p);}
  assert.equal(await pages[0].evaluate(()=>__RICO.game.online.team),'cyan');assert.equal(await pages[1].evaluate(()=>__RICO.game.online.team),'pink');checks+=2;
  for(const p of pages)await p.click('#netReady');for(const p of pages)await p.waitForFunction(()=>__RICO.game.online?.latest?.snapshot.state==='playing');checks++;
  for(const p of pages)await p.evaluate(()=>{const g=__RICO.game;g.input.lockFailed=true;g.input.keys.add('KeyW');});await pages[0].waitForTimeout(500);for(const p of pages)await p.evaluate(()=>__RICO.game.input.keys.clear());
  const room=app.rooms.rooms.get('browser-room');assert.ok(room.match.athletes.cyan.pos.x>-6.5);assert.ok(room.match.athletes.pink.pos.x<6.5);checks+=2;
  for(const [i,p] of pages.entries()){
    room.match.athletes[i?'pink':'cyan'].shootCd=0;room.match.giveDisc(i?'pink':'cyan',false);app.rooms.broadcast(room);
    await p.waitForFunction(()=>__RICO.game.player.holding);await p.keyboard.press('KeyE');await p.waitForTimeout(100);await p.evaluate(()=>__RICO.game.input.press('shoot'));await p.waitForTimeout(200);
    assert.ok(room.match.events.some(e=>e.type==='shot'&&e.team===(i?'pink':'cyan')&&e.speed===14&&e.curve===-1));checks++;
  }
  room.match.keepers=[];room.match.disc.keepers=[];room.match.disc.panels=[];room.match.state='playing';const m=room.match.goals.active().pink;room.match.disc.launch(m.center.clone().addScaledVector(m.normal,-1),m.normal,'player',16);room.match.disc.bounces=2;
  for(const p of pages)await p.waitForFunction(()=>__RICO.game.score.cyan===3);checks++;
  await pages[0].evaluate(()=>__RICO.game.online.socket.close());await pages[1].waitForFunction(()=>__RICO.game.online.latest.status==='reconnecting');await pages[0].waitForFunction(()=>__RICO.game.online.latest.status==='active',{},{timeout:15000});checks++;
  room.match.state='playing';room.match.timeLeft=.02;for(const p of pages)await p.waitForFunction(()=>__RICO.game.online.latest.status==='ended');checks++;
  assert.equal(errors.length,0);checks++;await pages[0].evaluate(()=>__RICO.game.render());await pages[0].screenshot({path:'tests/new-online.png'});
  fs.writeFileSync('tests/online-browser-actual.json',JSON.stringify({checks,errors},null,2));console.log('Online browser '+checks+' checks passed; JS errors 0');
 }finally{await b.close();await app.close();await new Promise(r=>staticS.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;});
