const esbuild=require('esbuild'),path=require('node:path');
module.exports=contents=>{const code=esbuild.buildSync({stdin:{contents,resolveDir:path.resolve(__dirname,'..')},bundle:true,platform:'node',format:'cjs',write:false}).outputFiles[0].text;const m={exports:{}};new Function('module','exports','require',code)(m,m.exports,require);return m.exports;};
