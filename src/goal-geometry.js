import * as THREE from 'three';
import { CONFIG as C } from './config.js';

export function goalCoordinates(point, mouth) {
  const delta = point.clone().sub(mouth.center);
  const lateral = new THREE.Vector3().crossVectors(mouth.up, mouth.normal).normalize();
  return {u: delta.dot(lateral), v: delta.dot(mouth.up)};
}
export function insideGoal(point, mouth, margin = 0) {
  const {u,v} = goalCoordinates(point,mouth);
  return (u/(C.GOAL_A+margin))**2 + (v/(C.GOAL_B+margin))**2 <= 1 + 1e-10;
}
/** Closest point on the same polygonal ellipse used by TubeGeometry. */
export function goalRimContact(point, radius, mouth) {
  const {u,v}=goalCoordinates(point,mouth), a=C.GOAL_A,b=C.GOAL_B;
  let best=Infinity, nearest=null;
  for(let i=0;i<96;i++){
    const t=i*Math.PI*2/96,s=(i+1)*Math.PI*2/96;
    const from=ellipsePoint(a,b,t,C.GOAL_RING_TUBE),to=ellipsePoint(a,b,s,C.GOAL_RING_TUBE);
    const x=from.x,y=from.y,dx=to.x-x,dy=to.y-y;
    const f=THREE.MathUtils.clamp(((u-x)*dx+(v-y)*dy)/(dx*dx+dy*dy),0,1);
    const px=x+f*dx,py=y+f*dy,d=(u-px)**2+(v-py)**2;
    if(d<best){best=d;nearest={u:px,v:py};}
  }
  if(best>(C.GOAL_RING_TUBE+radius)**2)return null;
  const lat=new THREE.Vector3().crossVectors(mouth.up,mouth.normal).normalize();
  const radial=lat.clone().multiplyScalar(u-nearest.u).addScaledVector(mouth.up,v-nearest.v).normalize();
  return {normal:mouth.normal.clone().negate().addScaledVector(radial,.35).normalize(),point:mouth.center.clone().addScaledVector(lat,nearest.u).addScaledVector(mouth.up,nearest.v)};
}
export class EllipsePath extends THREE.Curve {
  constructor(a,b,offset=0){super();this.a=a;this.b=b;this.offset=offset;}
  getPoint(t,target=new THREE.Vector3()){return target.copy(ellipsePoint(this.a,this.b,t*Math.PI*2,this.offset));}
}
function ellipsePoint(a,b,t,offset){const x=Math.cos(t),y=Math.sin(t),normal=new THREE.Vector3(x/a,y/b,0).normalize();return new THREE.Vector3(a*x,b*y,0).addScaledVector(normal,offset);}
export function ellipseRingGeometry(a,b,tube,offset=0){return new THREE.TubeGeometry(new EllipsePath(a,b,offset),96,tube,12,true);}
