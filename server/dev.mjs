import {staticServer} from './static.mjs';
const s=staticServer();s.listen(Number(process.env.STATIC_PORT)||8003,'0.0.0.0',()=>console.log('Game: http://localhost:'+(s.address().port)));
