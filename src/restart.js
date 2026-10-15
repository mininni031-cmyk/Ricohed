import {CONFIG,ROOM} from './config.js';

export function restartPossession(score,conceded){return score.cyan===score.pink?conceded:score.cyan<score.pink?'cyan':'pink';}
// A neutral disc in the conceding half, clear of the reset player and side panels.
export function placeRestartDisc(disc,team,rng){
  const sign=team==='cyan'?-1:1;
  let x,z;
  for(let i=0;i<16;i++){
    x=rng.range(2.5,7.5);z=rng.range(-Math.min(4.5,ROOM.W-2),Math.min(4.5,ROOM.W-2));
    if(Math.hypot(x-CONFIG.SPAWN_DIST,z)>1.6)break;
    if(i===15){x=4;z=3;}
  }
  disc.pos.set(sign*x,-ROOM.L+.65,z);disc.prevPos.copy(disc.pos);
  return disc.pos;
}
