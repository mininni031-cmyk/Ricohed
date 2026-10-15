export const QUALITY_PROFILES={
  low:{pixelCap:.85,crowd:.08,arena:'low',antialias:false,menuFps:8,guideHz:15},
  balanced:{pixelCap:1,crowd:.12,arena:'low',antialias:false,menuFps:10,guideHz:20},
  high:{pixelCap:2,crowd:1,arena:'high',antialias:true,menuFps:10,guideHz:30},
};
export function readQuality(isTouch){let saved;try{saved=localStorage.getItem('ricochet-quality');}catch{}const q=new URLSearchParams(location.search).get('quality')||saved;return Object.hasOwn(QUALITY_PROFILES,q)?q:isTouch?'low':'balanced';}
