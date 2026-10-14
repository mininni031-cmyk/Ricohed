import {DiscPhysics} from './physics.js';
export function predictShot({origin,direction,parameters,goals,gravity,panels},duration=1.5){
  const d=new DiscPhysics([],goals,gravity);d.panels=panels;d.launch(origin,direction,'player',parameters.speed);d.curveRate=parameters.rate;d.curveLeft=parameters.duration;
  const points=[d.pos.clone()],bounces=[0];
  for(let i=0;i<duration*120&&d.state==='FLYING';i++){
    d.stepFlying(1/120,[]);
    if(i%3===2||d.state!=='FLYING'){points.push(d.pos.clone());bounces.push(d.bounces);}
  }
  return {points,bounces};
}
