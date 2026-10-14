import * as THREE from 'three';
import {CONFIG as C,ROOM} from './config.js';
import hitbox from './keeper-hitbox.json' with {type:'json'};
export class KeeperPhysics {
  constructor(team,phaseOffset=0){
    this.team=team;this.phaseOffset=phaseOffset;this.z=this.prevZ=this.vz=0;this.range=C.KEEPER_RANGE;this.period=C.KEEPER_PERIOD;this.guard=0;
    this.hb={...hitbox,parts:hitbox.parts.map(p=>({...p,a:new THREE.Vector3(...p.a),b:new THREE.Vector3(...p.b)}))};
    this.frame={origin:new THREE.Vector3(),up:new THREE.Vector3(0,1,0),front:new THREE.Vector3(1,0,0),lat:new THREE.Vector3(0,0,1)};
  }
  setHome(mouth){this.mouth=mouth;const f=this.frame;f.up.copy(mouth.up);f.front.copy(mouth.normal).negate();f.lat.crossVectors(f.up,f.front).normalize();f.origin.copy(mouth.normal).multiplyScalar(ROOM.L-C.KEEPER_DEPTH).addScaledVector(mouth.slot,ROOM.L);}
  update(dt,t){this.prevZ=this.z;this.z=Math.sin(t*Math.PI*2/this.period+this.phaseOffset)*this.range;this.vz=dt?(this.z-this.prevZ)/dt:0;this.guard=Math.max(0,this.guard-dt);}
  latOffset(){return this.z*Math.sign(this.frame.lat.z||1);}
  feet(out=new THREE.Vector3()){return out.copy(this.frame.origin).addScaledVector(this.frame.lat,this.latOffset());}
  hitTest(p,r){
    if(this.guard>0||!this.mouth)return null;
    const f=this.frame,d=p.clone().sub(this.feet()),q=new THREE.Vector3(d.dot(f.lat),d.dot(f.up),d.dot(f.front));
    if(q.y>this.hb.reachTop+.4+r||Math.abs(q.z)>1+r)return null;
    for(const part of this.hb.parts){const ab=part.b.clone().sub(part.a),t=THREE.MathUtils.clamp(q.clone().sub(part.a).dot(ab)/(ab.lengthSq()||1),0,1);if(q.distanceTo(part.a.clone().addScaledVector(ab,t))<part.r+r)return {part:part.name,lat:q.x,height:q.y};}
    return null;
  }
}
