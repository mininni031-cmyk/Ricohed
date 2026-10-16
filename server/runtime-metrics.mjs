// Aggregate diagnostics only: no rooms, credentials or player input.
export class RuntimeMetrics {
 constructor(){this.ticks=0;this.total=0;this.max=0;this.lag=0;this.steps=0;this.dropped=0;}
 record(ms,lag,steps,dropped){this.ticks++;this.total+=ms;this.max=Math.max(this.max,ms);this.lag=Math.max(this.lag,lag);this.steps+=steps;this.dropped+=dropped;}
 snapshot(){return {ticks:this.ticks,tickMeanMs:+(this.total/Math.max(1,this.ticks)).toFixed(3),tickMaxMs:+this.max.toFixed(3),lagMaxMs:+this.lag.toFixed(3),physicsSteps:this.steps,droppedMs:Math.round(this.dropped*1000)};}
}
