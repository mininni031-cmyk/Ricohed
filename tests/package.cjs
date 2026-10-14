const fs=require('node:fs'),assert=require('node:assert/strict'),path=require('node:path');
for(const name of ['index.html','style.css','ricochet.js','online-config.js'])assert.ok(fs.statSync(path.join('dist',name)).size>0);
for(const name of ['src','server','tests','.env','package.json','.git'])assert.equal(fs.existsSync(path.join('dist',name)),false,name+' must not be published');
assert.ok(fs.readFileSync('dist/index.html','utf8').includes('online-config.js'));
for(const file of fs.readdirSync('dist',{recursive:true}))assert.equal(/\.(py|blend)$/i.test(file),false,'authoring source must not be published: '+file);
if(process.env.PUBLIC_WS_URL)assert.ok(fs.readFileSync('dist/online-config.js','utf8').includes(process.env.PUBLIC_WS_URL));
console.log('Static package complete, no server/source/secrets, connection configuration PASS');
