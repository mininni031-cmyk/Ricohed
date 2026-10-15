const assert=require('node:assert/strict'),load=require('./load.cjs');
const {Game}=load(`export {Game} from './src/game.js';`);
global.requestAnimationFrame=()=>{};
for(const status of ['waiting','ended','aborted','reconnecting']){
 let rendered=0;
 const fake={online:{latest:{status}},state:'ended',lastMenuFrame:0,qualityProfile:{menuFps:10},last:0,tick(){},render(){rendered++;},adaptResolution(){},frame(){}};
 Game.prototype.frame.call(fake,20);
 assert.equal(rendered,0,status+' must use the menu frame budget');
}
console.log('Online result/wait/recovery screens use menu frame budget PASS');
