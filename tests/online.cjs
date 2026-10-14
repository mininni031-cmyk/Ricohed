const assert=require('node:assert/strict');
const WebSocket=require('ws');
const delay=ms=>new Promise(r=>setTimeout(r,ms));
async function client(url,room,token){const ws=new WebSocket(url,{origin:'http://localhost:8003'}),messages=[];ws.on('message',m=>messages.push(JSON.parse(m)));await new Promise((r,j)=>{ws.once('open',r);ws.once('error',j);});ws.send(JSON.stringify({type:'join',room,token}));return {ws,messages,send:m=>ws.send(JSON.stringify(m)),wait:async f=>{for(let i=0;i<150;i++){const m=messages.find(f);if(m)return m;await delay(20);}throw Error('message timeout');}};}
(async()=>{
 const {createServer}=await import('../server/index.mjs');const app=createServer({origins:['http://localhost:8003'],reconnectMs:300});await app.listen(0);const url='ws://127.0.0.1:'+app.server.address().port;
 const clients=[];try{
 const a=await client(url,'test-room');clients.push(a);const ja=await a.wait(m=>m.type==='joined');assert.equal(ja.team,'cyan');
 const b=await client(url,'test-room');clients.push(b);const jb=await b.wait(m=>m.type==='joined');assert.equal(jb.team,'pink');
 const c=await client(url,'test-room');clients.push(c);assert.equal((await c.wait(m=>m.type==='error')).code,'full');
 const d=await client(url,'other-room');clients.push(d);assert.equal((await d.wait(m=>m.type==='joined')).team,'cyan');
 a.send({type:'ready'});b.send({type:'ready'});await a.wait(m=>m.type==='state'&&m.snapshot.state==='playing');
 const room=app.rooms.rooms.get('test-room'),old=room.match.athletes.cyan.pos.x;
 a.send({type:'input',input:{seq:1,yaw:-Math.PI/2,pitch:0,moveX:0,moveY:1,curve:0}});await delay(200);assert.ok(room.match.athletes.cyan.pos.x>old);
 a.send({type:'input',input:{seq:2,yaw:0,pitch:0,moveX:2,moveY:0,curve:0}});assert.equal((await a.wait(m=>m.type==='error'&&m.code==='input')).code,'input');assert.equal(room.match.seq.cyan,1);
 a.send({type:'input',input:{seq:1,yaw:0,pitch:0,moveX:0,moveY:0,curve:0,score:999}});await delay(60);assert.equal(room.match.seq.cyan,1);assert.deepEqual(room.match.score,{cyan:0,pink:0});
 a.ws.close();await b.wait(m=>m.type==='state'&&m.status==='reconnecting');
 const r=await client(url,'test-room',ja.token);clients.push(r);assert.equal((await r.wait(m=>m.type==='joined')).team,'cyan');await r.wait(m=>m.type==='state'&&m.status==='active');
 assert.equal(room.match.athletes.cyan.chargeStart,null);assert.equal(room.match.inputs.cyan.moveY,0);
 r.ws.close();await b.wait(m=>m.type==='state'&&m.status==='aborted');
 const invalid=new WebSocket(url,{origin:'https://evil.example'});await new Promise(resolve=>{invalid.on('error',resolve);invalid.on('open',()=>{invalid.close();throw Error('bad Origin accepted');});});
 console.log('Online rooms, ready, authority, validation, stale sequence, reconnect, expiry, Origin PASS');
 }finally{for(const c of clients)c.ws.terminate();await app.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
