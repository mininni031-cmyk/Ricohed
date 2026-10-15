// Shared by CPU-play and online input. Curve is normalized to [-1,1].
export function applyCurveControls(player,input){
 if(input.consume('curveLeft'))player.curve=-1;
 if(input.consume('curveRight'))player.curve=1;
 if(input.consume('curveStraight'))player.curve=0;
 if(input.consume('curveCycle'))player.curve=player.curve===0?-1:player.curve<0?1:0;
 if(input.consumeCurveValue)player.curve=input.consumeCurveValue(player.curve||0);
}
