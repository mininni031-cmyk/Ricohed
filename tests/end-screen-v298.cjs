const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const elements=new Map(),el=id=>{if(!elements.has(id))elements.set(id,{});return elements.get(id);};
const noop=()=>{};let menu,unlock,requested=0;
const context={URL,location:{protocol:'https:'},document:{getElementById:el,querySelector:el},performance:{now:()=>1000},WebSocket:{OPEN:1},setTimeout,clearTimeout};vm.createContext(context);
vm.runInContext(fs.readFileSync('src/online.js','utf8').replace(/^import .*;\r?\n/gm,'').replace(/export /g,'')+'\nglobalThis.Session=OnlineSession;',context);
const game={state:'playing',input:{keys:new Set(),stick:{},clearPresses:noop,exitLock(){unlock=()=>game.onLockChange(false);},requestLock(){requested++;}},player:{},cpuA:{},trail:{reset:noop},sparks:{clear:noop},audio:{stopMusic:noop,startMusic:noop},ui:{menu:id=>menu=id,showHUD:noop,countdown:noop,skipAnimations:noop}};
const session=new context.Session(game,{url:'wss://example.com/ws',room:'test'});game.pause=()=>session.pause();
const callback=fs.readFileSync('src/game.js','utf8').match(/this\.input\.onLockChange = (\(locked\) => \{[\s\S]*?\n    \});/)[1];game.onLockChange=new Function('return '+callback).call(game);
session.team='cyan';session.round=1;session.synced=true;session.connected=true;session.socket={readyState:1,send:noop};
const state={status:'ended',round:1,rematch:{cyan:false,pink:false},connected:{cyan:true,pink:true},snapshot:{state:'ended',athletes:{cyan:{},pink:{}},score:{cyan:3,pink:1},events:[]}};
for(const status of ['ended','aborted']){
 game.state='playing';session.resultShown=false;session.latest={...state,status};session.processState(session.latest);
 assert.equal(menu,'menuResult');unlock();assert.equal(menu,'menuResult','delayed unlock must preserve results');
 assert.equal(game.state,'ended');session.pause();assert.equal(menu,'menuResult','stale pause must preserve results');session.resume();assert.equal(menu,'menuResult','stale resume must preserve results');assert.equal(game.input.enabled,false);assert.equal(requested,0);
}
session.latest={...state,status:'active',snapshot:{...state.snapshot,state:'playing'}};game.state='playing';session.pause();assert.equal(menu,'menuPause');session.resume();assert.equal(menu,null);assert.equal(game.input.enabled,true);assert.equal(requested,1);
session.latest={...session.latest,round:2};session.processState(session.latest);assert.equal(menu,null);assert.equal(session.localPaused,false);assert.equal(game.input.enabled,true);
console.log('End-screen delayed pointer unlock, stale controls, active resume and next round PASS');
