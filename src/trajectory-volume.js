import * as THREE from 'three';
import {RoundedBoxGeometry} from 'three/addons/geometries/RoundedBoxGeometry.js';
/** Rounded-square 3D preview; one instanced draw call for all segments. */
export class TrajectoryVolume extends THREE.InstancedMesh {
  constructor(){super(new RoundedBoxGeometry(.15,.12,1,2,.035),new THREE.MeshLambertMaterial({color:0xffffff,emissive:0x142031,transparent:true,opacity:.52,depthWrite:false,toneMapped:false}),64);this.count=0;this.frustumCulled=false;this.instanceMatrix.setUsage(THREE.DynamicDrawUsage);this._matrix=new THREE.Matrix4();this._rotation=new THREE.Quaternion();this._direction=new THREE.Vector3();this._center=new THREE.Vector3();this._scale=new THREE.Vector3();}
  setPath(points,colors){
    this.count=Math.min(points.length-1,64);
    for(let i=0;i<this.count;i++){
      const length=this._direction.subVectors(points[i+1],points[i]).length();this._direction.normalize();this._center.copy(points[i]).lerp(points[i+1],.5);this._rotation.setFromUnitVectors(new THREE.Vector3(0,0,1),this._direction);this._scale.set(1,1,Math.max(.001,length*.8));this._matrix.compose(this._center,this._rotation,this._scale);this.setMatrixAt(i,this._matrix);this.setColorAt(i,new THREE.Color(colors[i*3],colors[i*3+1],colors[i*3+2]));
    }
    this.instanceMatrix.needsUpdate=true;if(this.instanceColor)this.instanceColor.needsUpdate=true;
  }
}
