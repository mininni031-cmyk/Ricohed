import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
export function staticServer(){return http.createServer((req,res)=>{
  let name;try{name=decodeURIComponent(new URL(req.url,'http://local').pathname);}catch{res.writeHead(400);res.end();return;}
  const f=path.resolve(root,'.'+(name==='/'?'/index.html':name));
  const rel=path.relative(root,f);const allowed=['index.html','style.css','ricochet.js','online-config.js'];
  if(rel.startsWith('..')||path.isAbsolute(rel)||(!allowed.includes(rel)&&!rel.startsWith('assets'+path.sep))){res.writeHead(404);res.end();return;}
  fs.readFile(f,(e,data)=>{res.writeHead(e?404:200,{'Content-Type':f.endsWith('.js')?'text/javascript':f.endsWith('.html')?'text/html':f.endsWith('.css')?'text/css':'application/octet-stream'});res.end(e?'not found':data);});
});}
