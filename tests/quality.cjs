const assert=require('node:assert/strict'),load=require('./load.cjs');
const {readQuality}=load(`export {readQuality} from './src/quality.js';`);
global.localStorage={getItem:()=>null};
for(const q of ['toString','constructor','__proto__','random','']){global.location={search:'?quality='+q};assert.equal(readQuality(false),'balanced',q+' must fall back');assert.equal(readQuality(true),'low');}
for(const q of ['low','balanced','high']){global.location={search:'?quality='+q};assert.equal(readQuality(false),q);}
for(const q of ['toString','constructor','__proto__']){global.location={search:''};global.localStorage={getItem:()=>q};assert.equal(readQuality(false),'balanced');assert.equal(readQuality(true),'low');}
console.log('Quality URL validation and desktop/mobile defaults PASS');
