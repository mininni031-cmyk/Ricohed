import {applyCurveControls} from './curve-controls.js';
import * as THREE from 'three';
import {updatePanelColliders} from './physics.js';
const errors={full:'この部屋は満員です。別の合言葉を使ってください。',room:'合言葉は4〜48文字で入力してください。',expired:'再接続期限が過ぎたか、サーバーが再起動しました。',ended:'この部屋の試合は終了しています。新しい合言葉を使ってください。',capacity:'サーバーが混み合っています。少し待ってください。',input:'操作データが拒否されました。',json:'通信データを読み取れませんでした。'};
export function validateServerUrl(value){const u=new URL(value);if(!['ws:','wss:'].includes(u.protocol)||u.username||u.password)throw Error('ws:// または wss:// のサーバーURLを入力してください。');if(location.protocol==='https:'&&u.protocol!=='wss:')throw Error('公開サイトでは wss:// のURLを使ってください。');return u.href;}
export class OnlineSession {
  constructor(game,{url,room}){this.g=game;this.url=validateServerUrl(url);this.room=room;this.team=null;this.token=null;this.seq=0;this.acc=0;this.eventId=0;this.latest=null;this.previous=null;this.intentional=false;this.localPaused=false;this.lastPing=0;this.latency=0;this.connected=false;game.guideFrame=-99;}
  status(text){for(const id of ['netStatus','netHud']){const el=document.getElementById(id);if(el)el.textContent=text;}}
  connect(){
    this.connected=false;
    this.status(this.token?'再接続しています…':'接続しています…（初回起動には時間がかかる場合があります）');
    const ws=this.socket=new WebSocket(this.url);
    const timeout=setTimeout(()=>{if(ws.readyState!==WebSocket.OPEN)ws.close();},20000);
    ws.onopen=()=>{clearTimeout(timeout);this.send({type:'join',room:this.room,...(this.token?{token:this.token}:{})});};
    ws.onmessage=e=>{let m;try{m=JSON.parse(e.data);}catch{return;}
      if(m.type==='joined'){this.connected=true;this.team=m.team;this.token=m.token;this.disconnectAt=null;document.getElementById('netReady').hidden=false;document.getElementById('netLeave').hidden=false;document.getElementById('netJoin').disabled=true;this.status('入室しました：TEAM '+m.team.toUpperCase()+'。両者が「準備完了」を押すと開始します。');}
      else if(m.type==='state'){this.previous=this.latest;this.latest=m;this.receivedAt=performance.now();this.processState(m);}
      else if(m.type==='pong')this.latency=Math.max(0,Math.round(performance.now()-m.sent));
      else if(m.type==='error'){this.status(errors[m.code]||'接続に失敗しました。');if(['full','room','expired','ended','capacity','join-first'].includes(m.code)){if(this.token&&this.latest)this.failRecovery(errors[m.code]||'試合が中断されました。');else{this.intentional=true;this.connected=false;ws.close();}document.getElementById('netJoin').disabled=false;}}
    };
    ws.onerror=()=>{if(!this.token)this.status('オンラインに接続できませんでした。少し待ってから入室し直してください。');};
    ws.onclose=e=>{clearTimeout(timeout);this.connected=false;this.clearRematchPending();this.updateRematch();if(e?.reason==='room expired'){this.failRecovery('この部屋の再戦受付は終了しました。退出して新しい合言葉で入室してください。');return;}this.g.input.enabled=false;this.clearControls();if(this.intentional)return;
      if(this.token){this.disconnectAt??=Date.now();if(Date.now()-this.disconnectAt<30000){this.status('通信が切れました。30秒以内の復帰を試みています…');this.retry=setTimeout(()=>this.connect(),1000);return;}}
      if(this.token&&this.latest)this.failRecovery('30秒以内に再接続できなかったため、試合を中断しました。');else this.status('接続できませんでした。退出して再度入室してください。');document.getElementById('netJoin').disabled=false;
    };
  }
  failRecovery(reason){this.intentional=true;this.connected=false;clearTimeout(this.retry);this.clearRematchPending();this.socket?.close();this.g.input.enabled=false;this.clearControls();if(this.latest){this.latest={...this.latest,status:'aborted'};this.processState(this.latest);document.getElementById('resultStats').textContent=reason;}this.status(reason);}
  send(message){if(this.socket?.readyState===WebSocket.OPEN)this.socket.send(JSON.stringify(message));}
  clearRematchPending(){clearTimeout(this.rematchTimer);this.rematchPending=false;}
  updateRematch(m=this.latest){
    if(m?.status!=='ended')return;
    const button=document.getElementById('rematch'),other=this.team==='cyan'?'pink':'cyan';
    let text;
    if(!this.connected||this.socket?.readyState!==WebSocket.OPEN){button.disabled=true;text='再接続を待っています…';}
    else if(this.rematchPending){button.disabled=true;text='再戦の希望を送信しています…';}
    else if(m.rematch?.[this.team]){button.disabled=true;text=m.connected?.[other]?'相手の再戦を待っています…':'相手の再接続を待っています…';}
    else{button.disabled=false;text=this.rematchRetry?'送信を確認できませんでした：再試行':m.rematch?.[other]?'相手が再戦を希望：再戦する':'再戦する';}
    button.textContent=text;
    document.getElementById('resultStats').textContent=text+'（双方の同意で開始・試合終了後60秒以内）';
  }
  rematch(){
    if(this.latest?.status!=='ended')return;
    if(!this.connected||this.socket?.readyState!==WebSocket.OPEN){this.updateRematch();return;}
    this.clearRematchPending();this.rematchPending=true;this.rematchRetry=false;this.updateRematch();
    this.rematchTimer=setTimeout(()=>{this.rematchPending=false;this.rematchRetry=true;this.updateRematch();},4000);
    this.send({type:'rematch'});
  }
  ready(){this.send({type:'ready'});document.getElementById('netReady').disabled=true;this.status('準備完了。相手の準備を待っています…');}
  clearControls(){const i=this.g.input;i.keys.clear();i.stick.x=i.stick.y=0;i.clearPresses();i.lookDX=i.lookDY=0;this.g.player.chargeStart=null;this.sendInput({chargeCancel:true},true);}
  pause(){if(['ended','aborted'].includes(this.latest?.status)){this.localPaused=false;this.g.input.enabled=false;this.g.ui.menu('menuResult');return;}this.localPaused=true;document.getElementById('restart').hidden=true;this.clearControls();this.g.input.enabled=false;this.g.input.exitLock();this.g.ui.menu('menuPause');this.status('操作を停止中です。オンラインの試合時間は進みます。');}
  resume(){if(['ended','aborted'].includes(this.latest?.status)){this.localPaused=false;this.g.input.enabled=false;this.g.ui.menu('menuResult');return;}this.localPaused=false;this.g.ui.menu(null);this.g.input.enabled=this.latest?.status==='active';this.g.input.requestLock();}
  leave(){
    this.intentional=true;clearTimeout(this.retry);this.clearRematchPending();this.send({type:'leave'});this.socket?.close();this.g.online=null;document.getElementById('restart').hidden=false;document.getElementById('rematch').disabled=false;document.getElementById('rematch').textContent='もう一度';this.clearControls();this.g.input.enabled=false;this.g.input.exitLock();this.g.player.team='cyan';this.g.cpuA.team='pink';this.g.resetMatch(false);this.g.state='title';this.g.ui.menu('menuTitle');this.g.ui.showHUD(false);this.g.ui.cache.clear();this.g.showMenuMode('home');
    document.getElementById('netJoin').disabled=false;document.getElementById('netReady').hidden=true;document.getElementById('netReady').disabled=false;document.getElementById('netLeave').hidden=true;document.getElementById('netHud').hidden=true;document.getElementById('netExit').hidden=true;
    document.querySelector('.team.cyan .tsub').textContent='YOU';document.querySelector('.team.pink .tsub').textContent='CPU';document.querySelector('#playerCard .pname span').textContent='TEAM CYAN';this.status('退出しました。新しい合言葉で入室できます。');
  }
  processState(m){
    if(!this.team)return;
    const g=this.g,s=m.snapshot,other=this.team==='cyan'?'pink':'cyan';g.player.team=this.team;g.cpuA.team=other;
    if(this.round!==m.round){this.clearRematchPending();this.rematchRetry=false;this.round=m.round;this.eventId=0;this.previous=null;this.resultShown=false;this.resultStatus=null;this.started=false;this.synced=false;this.localPaused=false;g.player.curve=s.athletes[this.team].curve;g.player.chargeStart=null;g.trail.reset();g.sparks.clear();g.ui.skipAnimations();g.guideFrame=-99;document.getElementById('rematch').disabled=false;}
    if(m.status!=='ended'||m.rematch?.[this.team])this.clearRematchPending();
    if(!this.synced){g.player.yaw=s.athletes[this.team].yaw;g.player.pitch=s.athletes[this.team].pitch;g.player.curve=s.athletes[this.team].curve;this.synced=true;}
    document.querySelector('.team.cyan .tsub').textContent=this.team==='cyan'?'YOU':'相手';document.querySelector('.team.pink .tsub').textContent=this.team==='pink'?'YOU':'相手';document.querySelector('#playerCard .pname span').textContent='TEAM '+this.team.toUpperCase();
    if(m.status==='active'){
      if(!this.started){this.started=true;this.clearControls();g.ui.menu(null);g.ui.showHUD(true);g.audio.startMusic();document.getElementById('netHud').hidden=false;document.getElementById('netExit').hidden=true;}
      g.input.enabled=!this.localPaused;
      if(s.state==='countdown')g.ui.countdown(s.countT<.7?'3':s.countT<1.4?'2':'1');else g.ui.countdown(null);
    }else if(m.status==='reconnecting'){g.input.enabled=false;g.ui.countdown(null);this.clearControls();this.status('相手または通信の復帰待ちです。試合を停止しています。');}
    else if(m.status==='waiting')this.status('TEAM '+this.team.toUpperCase()+'：'+(m.connected[other]?'相手が入室しています。準備完了を押してください。':'相手の入室待ちです。'));
    if((m.status==='ended'||m.status==='aborted')&&(!this.resultShown||this.resultStatus!==m.status)){this.resultShown=true;this.resultStatus=m.status;g.state='ended';this.localPaused=false;g.input.enabled=false;g.input.exitLock();g.audio.stopMusic();g.ui.countdown(null);g.ui.menu('menuResult');
      const mine=s.score[this.team],theirs=s.score[other];document.getElementById('resultTitle').textContent=m.status==='aborted'?'試合中断':mine>theirs?'YOU WIN!':mine<theirs?'YOU LOSE':'DRAW';document.getElementById('resultScore').textContent=`CYAN ${s.score.cyan} — ${s.score.pink} PINK`;document.getElementById('resultStats').textContent=m.status==='aborted'?(m.reason==='opponent-left'?'相手が退出しました。':'再接続期限切れで終了しました。'):'双方が再戦を選ぶと、同じ部屋でもう一度遊べます。';document.getElementById('rematch').hidden=m.status==='aborted';document.getElementById('rematch').textContent='再戦する';this.status(m.status==='aborted'?'試合が中断されました。':'試合が終了しました。');}
    if(m.status==='ended')this.updateRematch(m);
    for(const e of s.events){if(e.id<=this.eventId)continue;this.eventId=e.id;
      if(e.type==='shot'){g.trail.reset();g.setDiscColor(0);if(e.curve)g.trail.color.set(0xffdc63);if(e.team===this.team)g.arms.triggerThrow();else g.cpuChar.play('throw',.14,40);g.audio.play('throw');}
      if(e.type==='bounce'){if(/^[CK]\d/.test(e.surface))g.arena.flashPanel(e.surface);if(e.point)g.sparks.burst(new THREE.Vector3(...e.point),0xffdc63,16,5,.1,.3,3);g.setDiscColor(e.count);g.ui.bounceCount(e.count,Math.min(3,e.count+1),String(e.surface).startsWith('rim:'));g.audio.play('bounce');}
      if(e.type==='catch'){g.trail.reset();if(e.team===this.team)g.ui.catchSuccess(e.rescued,e.just);g.audio.play('catch');}
      if(e.type==='goal'){g.arena.flashGoal(e.team==='cyan'?'pink':'cyan');g.ui.goal(e.team,e.value,e.value-1,false);g.audio.play('goal');g.setBanner(`GOAL +${e.value}`,e.team==='cyan'?'#35e8ff':'#ff4fa3',2);}
      if(e.type==='turnover'){g.trail.reset();g.ui.callout('HOLD TIME!','7秒超過：相手陣地へ','gold',1.5);}
      if(e.type==='save'){const k=g.keepers.find(k=>k.team===e.team);k?.onSave(e.lat);g.ui.block(e.team);g.audio.play('block');}
    }
  }
  sendInput(actions={},forceNeutral=false){
    if(!this.team||!this.connected||this.socket?.readyState!==WebSocket.OPEN)return;
    const g=this.g,p=g.player,ax=forceNeutral?{x:0,y:0}:g.input.axes();
    this.send({type:'input',input:{seq:++this.seq,yaw:((p.yaw+Math.PI)%(Math.PI*2)+Math.PI*2)%(Math.PI*2)-Math.PI,pitch:p.pitch,moveX:ax.x,moveY:ax.y,curve:p.curve||0,...actions}});
  }
  update(dt){
    const g=this.g,p=g.player,i=g.input,s=this.latest?.snapshot;
    const active=this.connected&&this.socket?.readyState===WebSocket.OPEN&&this.latest?.status==='active';
    if(i.enabled){g.applyLook();applyCurveControls(p,i);}
    this.acc+=dt;if(this.acc>=1/30){this.acc%=1/30;const actions={};for(const key of ['jump','dash','catch','shoot','chargeStart','chargeRelease','chargeCancel'])if(i.consume(key))actions[key]=true;this.sendInput(actions,!i.enabled||this.localPaused);}
    if(performance.now()-this.lastPing>2000){this.lastPing=performance.now();this.send({type:'ping',sent:this.lastPing});}
    if(!s)return;
    const other=this.team==='cyan'?'pink':'cyan',alpha=Math.max(0,Math.min(1,(performance.now()-this.receivedAt)/50));
    const interpolate=(target,key,values,prev)=>{target[key].fromArray(values);if(prev&&new THREE.Vector3(...values).distanceTo(new THREE.Vector3(...prev))<2)target[key].fromArray(prev).lerp(new THREE.Vector3(...values),alpha);};
    for(const [team,a] of [[this.team,p],[other,g.cpuA]]){const v=s.athletes[team],old=this.previous?.snapshot?.athletes[team];interpolate(a,'pos',v.pos,old?.pos);a.vel.fromArray(v.vel);for(const k of ['grounded','holding','holdTime','airJumps','wallKicks','catchWindow','catchCd','dashCd','dashTime','justUntil','wallShotUntil','chargeStart'])a[k]=v[k];if(team!==this.team){a.yaw=v.yaw;a.pitch=v.pitch;a.curve=v.curve;}a.up.set(0,1,0);}
    g.cpu.facingDir.set(-Math.sin(g.cpuA.yaw),0,-Math.cos(g.cpuA.yaw));
    const d=g.disc,ds=s.disc,old=this.previous?.snapshot?.disc;d.state=ds.state;d.owner=ds.owner===this.team?'player':ds.owner?'cpu':null;d.lastShooter=ds.lastShooter===this.team?'player':ds.lastShooter?'cpu':null;d.vel.fromArray(ds.vel);d.bounces=ds.bounces;d.saved=ds.saved;d.curveRate=ds.curveRate;d.curveLeft=ds.curveLeft;d.flightId=ds.flightId;
    interpolate(d,'pos',ds.pos,old?.state===ds.state&&old?.flightId===ds.flightId?old.pos:null);d.prevPos.copy(d.pos);
    for(const k of g.keepers){k.z=s.keepers.find(x=>x.team===k.team)?.z||0;k.place();}
    g.score={...s.score};g.timeLeft=s.timeLeft;g.simTime=s.t;g.matchClock=s.clock;g.catchable=s.athletes[this.team].catchable;g.catchInRange=g.catchable;g.state=active?(this.localPaused?'paused':s.state):this.latest.status==='waiting'?'title':['ended','aborted'].includes(this.latest.status)?'ended':'paused';
    document.getElementById('netHud').hidden=active&&!this.localPaused;if(active&&!this.localPaused)this.status('オンライン対戦中');
    updatePanelColliders(g.disc.panels,g.simTime);g.syncRoom();g.syncCamera(dt);g.updateVisuals(dt,active&&!this.localPaused);
  }
}
