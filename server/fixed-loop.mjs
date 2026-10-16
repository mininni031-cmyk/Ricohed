// Fixed 120Hz physics, with a bounded per-callback catch-up budget.
export class FixedLoop {
 constructor({step=1/120,maxSteps=12}={}){this.step=step;this.maxSteps=maxSteps;this.acc=0;this.droppedSeconds=0;}
 advance(elapsed,simulate){
  if(!Number.isFinite(elapsed)||elapsed<=0)return {steps:0,dropped:0};
  this.acc+=elapsed;const before=this.droppedSeconds;
  if(this.acc>.25){this.droppedSeconds+=this.acc-.25;this.acc=.25;}
  let steps=0;while(this.acc+1e-10>=this.step&&steps<this.maxSteps){simulate(this.step);this.acc-=this.step;steps++;}
  if(this.acc>=this.step){const discarded=Math.floor(this.acc/this.step)*this.step;this.acc-=discarded;this.droppedSeconds+=discarded;}
  this.acc=Math.max(0,this.acc);return {steps,dropped:this.droppedSeconds-before};
 }
}
