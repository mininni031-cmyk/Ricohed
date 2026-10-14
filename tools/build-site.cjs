const fs=require('node:fs'),path=require('node:path');require('./build.cjs');
const root=path.resolve(__dirname,'..'),out=path.join(root,'dist');
// The resolved target is fixed beneath this project's root and contains only generated output.
if(path.dirname(out)!==root||path.basename(out)!=='dist')throw Error('Unsafe output path');
fs.rmSync(out,{recursive:true,force:true});fs.mkdirSync(out,{recursive:true});
for(const name of ['index.html','style.css','ricochet.js','online-config.js'])fs.copyFileSync(path.join(root,name),path.join(out,name));
fs.cpSync(path.join(root,'assets'),path.join(out,'assets'),{recursive:true,filter:src=>fs.statSync(src).isDirectory()||/\.(glb|gltf|bin|png|jpe?g|webp|svg|ogg|mp3|wav|json)$/i.test(src)});
if(process.env.PUBLIC_WS_URL){const u=new URL(process.env.PUBLIC_WS_URL);if(u.protocol!=='wss:')throw Error('PUBLIC_WS_URL must use wss://');fs.writeFileSync(path.join(out,'online-config.js'),'window.RICOCHET_SERVER_URL = '+JSON.stringify(u.href)+';\n');}
console.log('Cloudflare Pages static output: dist/');
