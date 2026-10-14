import {CONFIG as C,CATCH} from './config.js';
export function shotParameters(a,t){
  const charge=a.chargeStart==null?0:Math.max(0,Math.min(1,(t-a.chargeStart)/C.CHARGE_TIME));
  return {speed:(a.curve?C.CURVE_SPEED:C.SHOT_SPEED)*(1+charge*(C.CHARGE_MULTIPLIER-1))*(t<=a.justUntil+1e-9?CATCH.counterMultiplier:1)*(!a.grounded&&t<=a.wallShotUntil+1e-9?C.WALL_SHOT_MULTIPLIER:1),rate:-(a.curve||0)*C.CURVE_RATE,duration:a.curve?C.CURVE_TIME:0};
}
