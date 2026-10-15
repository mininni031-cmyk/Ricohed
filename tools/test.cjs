const {spawnSync}=require('node:child_process'),fs=require('node:fs');
if(process.platform==='win32'&&!process.env.BROWSER_PATH){const edge='C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';if(fs.existsSync(edge))process.env.BROWSER_PATH=edge;}
const files=['menu-budget.cjs','rematch-v297.cjs','restart-v297.cjs','goal-ratio.cjs','side-reflection-v295.cjs','v292.cjs','side-lanes.cjs','ended-recovery.cjs','quality.cjs','core.cjs','shot.cjs','match.cjs','online.cjs','run_v29.cjs','online-browser.cjs','mobile.cjs','review-regressions.cjs','long-match.cjs','ui-lightwide.cjs'];
for(const file of files){console.log('\nTEST '+file);const r=spawnSync(process.execPath,['tests/'+file],{stdio:'inherit',env:process.env});if(r.status!==0)process.exit(r.status||1);}
console.log('\nALL CURRENT TEST SUITES PASS');
