// Run: node games/realm-forge/benchmark.mjs
// This measures simulation CPU cost, not browser rendering FPS.
import {World,defaultProject,generateMap} from './core.mjs';
for(const count of [200,600,1000])for(const mode of ['movement','combat']) {
  const p=defaultProject();p.map=generateMap(128);p.map.tiles.fill('grass');Object.assign(p.rules,{ai:'off',fog:false,population:2000});const w=new World(p),ids=[];
  for(let i=0;i<count;i++) {
    const u=w.spawn(i%3?'knight':'archer',mode==='movement'?0:i%2,{x:35+i%20,y:25+Math.floor(i/20)});
    if(mode==='movement')u.stance='passive';ids.push(u.id);
  }
  const commandStart=performance.now();if(mode==='movement')w.moveFormation(ids,{x:90,y:100},'spread');const commandMs=performance.now()-commandStart;
  const samples=[];for(let i=0;i<300;i++){const start=performance.now();w.tick(.05);samples.push(performance.now()-start);}samples.sort((a,b)=>a-b);
  console.log(JSON.stringify({units:count,mode,commandMs:+commandMs.toFixed(2),medianMs:+samples[150].toFixed(2),p95Ms:+samples[285].toFixed(2),maxMs:+samples.at(-1).toFixed(2),remaining:w.units.length}));
}
