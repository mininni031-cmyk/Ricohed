require('esbuild').buildSync({entryPoints:['src/main.js'],bundle:true,minify:true,format:'iife',outfile:'ricochet.js'});
