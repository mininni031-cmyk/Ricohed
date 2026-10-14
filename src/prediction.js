import {DiscPhysics,updatePanelColliders} from './physics.js';
export function predictShot({origin,direction,parameters,goals,gravity,panels,time=0},duration=1.5){
  const d=new DiscPhysics([],goals,gravity);d.panels=panels.map(p=>({...p,center:p.center.clone()}));d.launch(origin,direction,'player',parameters.speed);d.curveRate=parameters.rate;d.curveLeft=parameters.duration;
  const points=[d.pos.clone()],bounces=[0];
  for(let i=0;i<duration*120&&d.state==='FLYING';i++){
    updatePanelColliders(d.panels,time+(i+1)/120);d.stepFlying(1/120,[]);
    if(i%3===2||d.state!=='FLYING'){points.push(d.pos.clone());bounces.push(d.bounces);}
  }
  return {points,bounces};
}
