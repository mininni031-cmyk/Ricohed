export const QUALITY_PROFILES={
  low:{pixelCap:1,crowd:.16,arena:'low',antialias:false,menuFps:8},
  balanced:{pixelCap:1.25,crowd:.25,arena:'low',antialias:true,menuFps:10},
  high:{pixelCap:2,crowd:1,arena:'high',antialias:true,menuFps:10},
};
export function readQuality(isTouch){let saved;try{saved=localStorage.getItem('ricochet-quality');}catch{}const q=new URLSearchParams(location.search).get('quality')||saved;return Object.hasOwn(QUALITY_PROFILES,q)?q:isTouch?'low':'balanced';}
