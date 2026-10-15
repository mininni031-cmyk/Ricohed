const actions=['jump','dash','catch','shoot','chargeStart','chargeRelease','chargeCancel'];
export function validInput(i){
  if(!i||typeof i!=='object'||Array.isArray(i)||!Number.isSafeInteger(i.seq)||i.seq<0)return false;
  if(!['yaw','pitch','moveX','moveY'].every(k=>Number.isFinite(i[k])))return false;
  if(Math.abs(i.yaw)>Math.PI*4||Math.abs(i.pitch)>1.4||Math.abs(i.moveX)>1||Math.abs(i.moveY)>1||(!Number.isFinite(i.curve)||Math.abs(i.curve)>1))return false;
  return actions.every(k=>i[k]===undefined||typeof i[k]==='boolean')&&Object.keys(i).every(k=>['seq','yaw','pitch','moveX','moveY','curve',...actions].includes(k));
}
export function roomName(value){return typeof value==='string'&&value.trim().length>=4&&value.trim().length<=48&&!/[\x00-\x1f\x7f]/.test(value)?value.trim().normalize('NFC'):null;}
