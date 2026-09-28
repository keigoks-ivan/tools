import {guests} from '../js/looks.js';
import {HairSystem} from '../js/hair.js';
import {performance} from 'node:perf_hooks';
import {writeFile} from 'node:fs/promises';
const hair=new HairSystem(),start=performance.now();let ticks=0,maxStretch=0,invalid=0,up=0,maxVelocity=0,maxNodes=0,cuts=0,grows=0,dyes=0,ties=0,lastPhase=-1;
const duration=Number(process.argv[2]||300);
const timer=setInterval(async()=>{
 const time=(performance.now()-start)/1000,phase=Math.floor(time/6)%8;
 const x=195+Math.sin(time*2.4)*130,y=190+(Math.sin(time*1.7)+1)*180;
 if(phase!==lastPhase){if(phase===5||phase===6){hair.reset(guests[Math.floor(time/48)%3]);ties+=hair.tie(phase===5?'double':'single')}if(phase===7)hair.untie();lastPhase=phase;}
 if(phase===0||phase===5||phase===6)hair.comb({x:390-x,y:600-y},{x,y});
 if(phase===1&&ticks%12===0)cuts+=hair.cut({x:25,y:350+Math.sin(time)*160},{x:365,y:350+Math.sin(time)*160});
 if(phase===2)grows+=hair.grow(x,y,.15);
 if(phase===3)dyes+=hair.dye(x,y,[240,100,210],.1);
 if(phase===4&&ticks%120===0)hair.reset();
 hair.step(1/60);
 for(const s of hair.strands){maxNodes=Math.max(maxNodes,s.nodes.length);for(let j=1;j<s.nodes.length;j++){let a=s.nodes[j-1],b=s.nodes[j],d=Math.hypot(b.x-a.x,b.y-a.y);maxStretch=Math.max(maxStretch,d/Math.max(.5,s.rest[j-1]));maxVelocity=Math.max(maxVelocity,Math.hypot(b.x-b.px,b.y-b.py));if(!Number.isFinite(b.x+b.y))invalid++;if(b.y<a.y-.01)up++;}}
 ticks++;
 if(time>=duration){clearInterval(timer);const report={elapsedSeconds:time,ticks,strands:hair.strands.length,maxNodes,maxStretch,maxVelocity,invalid,upwardSegments:up,cuts,ties,growthNodes:grows,dyedNodes:dyes,final:hair.stats()};await writeFile(new URL('./stability-report.json',import.meta.url),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));if(invalid||up||maxNodes>16)process.exitCode=1;}
},1000/60);
