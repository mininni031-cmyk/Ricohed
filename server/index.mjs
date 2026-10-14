import http from 'node:http';
import {pathToFileURL} from 'node:url';
import {WebSocketServer} from 'ws';
import {Rooms} from './rooms.mjs';
export function createServer({origins=(process.env.ALLOWED_ORIGINS||'http://localhost:8003,http://127.0.0.1:8003').split(',').map(s=>s.trim()),reconnectMs=30000}={}){
  const rooms=new Rooms({reconnectMs});const server=http.createServer((req,res)=>{res.setHeader('Content-Type','application/json');res.setHeader('Cache-Control','no-store');res.statusCode=req.url==='/health'?200:404;res.end(JSON.stringify(req.url==='/health'?{ok:true,version:'2.9.0'}:{error:'not found'}));});
  const wss=new WebSocketServer({noServer:true,maxPayload:2048,perMessageDeflate:false});
  server.on('upgrade',(req,socket,head)=>{if(!origins.includes(req.headers.origin)||wss.clients.size>=450||!['/','/ws'].includes(req.url?.split('?')[0])){console.warn('upgrade rejected',JSON.stringify({origin:req.headers.origin,url:req.url,clients:wss.clients.size}));socket.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n');return;}wss.handleUpgrade(req,socket,head,ws=>wss.emit('connection',ws,req));});
  wss.on('connection',ws=>{
    ws.alive=true;ws.rateStart=Date.now();ws.rateCount=0;
    const joinTimer=setTimeout(()=>{if(!ws.room)ws.close(1008,'join timeout');},10000);joinTimer.unref();
    ws.on('pong',()=>ws.alive=true);
    ws.on('message',raw=>{
      if(Date.now()-ws.rateStart>1000){ws.rateStart=Date.now();ws.rateCount=0;}if(++ws.rateCount>120){ws.close(1008,'rate limit');return;}
      let msg;try{msg=JSON.parse(raw);}catch{rooms.error(ws,'json');return;}
      if(!msg||typeof msg!=='object'||Array.isArray(msg)){rooms.error(ws,'message');return;}
      rooms.message(ws,msg);
    });
    ws.on('close',()=>{clearTimeout(joinTimer);rooms.disconnect(ws);});ws.on('error',()=>{});
  });
  let previous=performance.now(),acc=0,sendAcc=0;
  const ticker=setInterval(()=>{const now=performance.now();acc+=Math.min(.1,(now-previous)/1000);previous=now;while(acc>=1/120){rooms.advance(1/120);acc-=1/120;sendAcc+=1/120;}if(sendAcc>=.05){sendAcc%=.05;for(const r of rooms.rooms.values())rooms.broadcast(r);}},1000/120);
  const heartbeat=setInterval(()=>{for(const ws of wss.clients){if(!ws.alive){ws.terminate();continue;}ws.alive=false;ws.ping();}},10000);
  return {server,wss,rooms,listen:(port=Number(process.env.PORT)||3001)=>new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,'0.0.0.0',()=>{server.off('error',reject);resolve();});}),close:()=>new Promise(resolve=>{clearInterval(ticker);clearInterval(heartbeat);for(const ws of wss.clients)ws.terminate();wss.close();server.close(()=>resolve());})};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  const app=createServer();await app.listen();console.log(`RICOCHET WebSocket server ready on port ${app.server.address().port}`);console.log('allowed origins:',JSON.stringify((process.env.ALLOWED_ORIGINS||'').split(',').map(s=>s.trim())));
  for(const signal of ['SIGINT','SIGTERM'])process.on(signal,async()=>{await app.close();process.exit(0);});
}
