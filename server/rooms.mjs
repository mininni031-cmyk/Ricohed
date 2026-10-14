import {randomBytes} from 'node:crypto';
import {MatchSimulation} from '../src/match-simulation.js';
import {validInput,roomName} from './protocol.mjs';
const teams=['cyan','pink'];
export class Rooms {
  constructor({reconnectMs=30000,maxRooms=200}={}){this.rooms=new Map();this.reconnectMs=reconnectMs;this.maxRooms=maxRooms;}
  send(ws,msg){if(ws?.readyState!==1)return;if(ws.bufferedAmount>262144){ws.close(1013,'slow connection');return;}ws.send(JSON.stringify(msg));}
  error(ws,code){this.send(ws,{type:'error',code});}
  join(ws,message){
    if(ws.room)return this.error(ws,'joined');const name=roomName(message.room);if(!name)return this.error(ws,'room');
    let r=this.rooms.get(name);if(!r){if(message.token)return this.error(ws,'expired');if(this.rooms.size>=this.maxRooms)return this.error(ws,'capacity');r={name,match:new MatchSimulation(),slots:{cyan:null,pink:null},status:'waiting',created:Date.now()};this.rooms.set(name,r);}
    if(r.status==='aborted'||r.status==='ended')return this.error(ws,'ended');
    let team;
    if(message.token){team=teams.find(t=>r.slots[t]?.token===message.token);if(!team||r.slots[team].ws||Date.now()>=r.slots[team].deadline)return this.error(ws,'expired');r.slots[team].ws=ws;r.slots[team].deadline=null;}
    else{team=teams.find(t=>!r.slots[t]);if(!team)return this.error(ws,'full');r.slots[team]={ws,token:randomBytes(24).toString('hex'),ready:false,deadline:null};}
    ws.room=r;ws.team=team;this.send(ws,{type:'joined',team,token:r.slots[team].token,reconnectMs:this.reconnectMs});
    if(r.status==='reconnecting'&&teams.every(t=>r.slots[t]?.ws)){r.status=r.beforeDisconnect;r.match.clearInputs();}
    this.broadcast(r);
  }
  message(ws,message){
    if(message.type==='join')return this.join(ws,message);
    const r=ws.room;if(!r)return this.error(ws,'join-first');if(r.slots[ws.team]?.ws!==ws)return;
    if(message.type==='ready'){if(r.status!=='waiting')return;r.slots[ws.team].ready=true;if(teams.every(t=>r.slots[t]?.ready&&r.slots[t]?.ws)){r.status='active';r.match.start();}this.broadcast(r);}
    else if(message.type==='input'){if(!validInput(message.input))return this.error(ws,'input');if(r.status==='active'&&r.match.state==='playing')r.match.applyInput(ws.team,message.input);}
    else if(message.type==='leave'){this.disconnect(ws,true);ws.close(1000,'left');}
    else if(message.type==='ping')this.send(ws,{type:'pong',sent:message.sent});
    else this.error(ws,'message');
  }
  disconnect(ws,leave=false){
    const r=ws.room,team=ws.team;if(!r||r.slots[team]?.ws!==ws)return;r.slots[team].ws=null;r.slots[team].deadline=Date.now()+this.reconnectMs;r.match.clearInputs();
    if(leave){r.status='aborted';r.finishedAt=Date.now();}
    else if(r.status!=='reconnecting'&&r.status!=='aborted'&&r.status!=='ended'){r.beforeDisconnect=r.status;r.status='reconnecting';}
    this.broadcast(r);
  }
  advance(dt){
    const now=Date.now();for(const [name,r] of this.rooms){
      if(teams.some(t=>r.slots[t]&&!r.slots[t].ws&&r.slots[t].deadline<=now)&&!['ended','aborted'].includes(r.status)){r.status='aborted';r.finishedAt=now;this.broadcast(r);}
      if(r.status==='active'){r.match.step(dt);if(r.match.state==='ended'){r.status='ended';r.finishedAt=now;}}
      if((r.finishedAt&&now-r.finishedAt>60000)||(r.status==='waiting'&&now-r.created>300000)){for(const t of teams)r.slots[t]?.ws?.close(1000,'room expired');this.rooms.delete(name);}
    }
  }
  broadcast(r){const msg={type:'state',status:r.status,ready:Object.fromEntries(teams.map(t=>[t,!!r.slots[t]?.ready])),connected:Object.fromEntries(teams.map(t=>[t,!!r.slots[t]?.ws])),reconnectDeadline:Math.min(...teams.filter(t=>r.slots[t]?.deadline).map(t=>r.slots[t].deadline)),snapshot:r.match.snapshot()};for(const t of teams)this.send(r.slots[t]?.ws,msg);}
}
