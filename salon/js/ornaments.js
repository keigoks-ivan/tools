import {rgb} from './looks.js?v=7';
function ellipse(c,x,y,rx,ry,color,a=0){c.fillStyle=color;c.beginPath();c.ellipse(x,y,rx,ry,a,0,Math.PI*2);c.fill()}
function star(c,n,outer,inner){c.beginPath();for(let i=0;i<n*2;i++){const a=i*Math.PI/n-Math.PI/2,r=i%2?inner:outer;const x=Math.cos(a)*r,y=Math.sin(a)*r;i?c.lineTo(x,y):c.moveTo(x,y)}c.closePath();c.fill()}
export function ornament(c,kind,x,y,size=44,color=0,angle=0){
 c.save();c.translate(x,y);c.rotate(angle);c.scale(size/44,size/44);c.shadowColor='#59354942';c.shadowBlur=3;c.shadowOffsetY=2;
 const g=c.createLinearGradient(-15,-19,15,21);g.addColorStop(0,'#fff3ee');g.addColorStop(.3,rgb(color));g.addColorStop(1,'#ad648d');c.fillStyle=g;c.strokeStyle='#ffffffa8';c.lineWidth=1.5;
 if(kind==='bow'){for(const side of [-1,1]){c.beginPath();c.moveTo(side*2,0);c.bezierCurveTo(side*30,-26,side*29,27,side*2,7);c.fill();c.stroke();c.beginPath();c.moveTo(side*4,3);c.lineTo(side*18,23);c.lineTo(side*8,19);c.lineTo(side*3,24);c.lineTo(0,3);c.fill()}ellipse(c,0,3,6,7,'#f7c8df')}
 if(kind==='flower'){for(let i=0;i<6;i++){const a=i*Math.PI/3;ellipse(c,Math.cos(a)*11,Math.sin(a)*11,10,7,g,a)}ellipse(c,0,0,7,7,'#ffd978');ellipse(c,-2,-3,2,2,'#fff7dd')}
 if(kind==='star'){star(c,5,23,11);c.stroke();ellipse(c,-5,-8,4,2,'#fff9dc',-.7)}
 if(kind==='heart'){c.beginPath();c.moveTo(0,21);c.bezierCurveTo(-36,-1,-15,-29,0,-11);c.bezierCurveTo(15,-29,36,-1,0,21);c.fill();c.stroke();ellipse(c,-9,-8,5,2,'#fff8f3',-.6)}
 if(kind==='butterfly'){for(const side of [-1,1]){ellipse(c,side*11,-7,13,17,g,side*.5);ellipse(c,side*10,12,10,10,g,-side*.5);ellipse(c,side*13,-9,5,8,'#fff0db99',side*.5)}ellipse(c,0,2,3,17,'#9d6480');c.beginPath();c.moveTo(-6,-23);c.quadraticCurveTo(0,-20,0,-10);c.quadraticCurveTo(0,-20,6,-23);c.stroke()}
 if(kind==='moon'){c.fillStyle='#f7cf76';c.beginPath();c.arc(0,0,22,.6,5.3);c.bezierCurveTo(-8,-8,-8,8,18,12);c.fill();c.stroke();c.translate(14,-10);c.fillStyle='#fff5c5';star(c,4,8,3)}
 if(kind==='crown'){c.fillStyle='#f5ce75';c.beginPath();c.moveTo(-22,15);c.lineTo(-26,-14);c.lineTo(-11,-3);c.lineTo(0,-23);c.lineTo(12,-3);c.lineTo(25,-14);c.lineTo(21,15);c.closePath();c.fill();c.stroke();c.fillStyle=rgb(color);star(c,5,7,3);c.fillStyle='#fff1ba';c.fillRect(-20,11,40,5)}
 if(kind==='pearls'){for(let i=0;i<7;i++){const x=(i-3)*7.5,y=-Math.cos((i-3)*.4)*7;const pearl=c.createRadialGradient(x-2,y-2,0,x,y,6);pearl.addColorStop(0,'#ffffff');pearl.addColorStop(.6,'#fff1e5');pearl.addColorStop(1,'#caa5bd');ellipse(c,x,y,5.6,5.6,pearl)}}
 c.restore();
}
export function createDecorate(env,items,changed){let active=null;
 return {onDown(p){active=[...items].reverse().find(a=>Math.hypot(a.x-p.x,a.y-p.y)<30);if(!active&&p.y>=115&&p.y<=570&&p.x>35&&p.x<355){if(items.length>=12)return;active={kind:env.ornament||'bow',x:p.x,y:p.y,color:env.colorIndex,angle:0};items.push(active)}},onMove(p){if(active){active.x=Math.max(20,Math.min(370,p.x));active.y=Math.max(110,Math.min(598,p.y));active.angle=Math.max(-.5,Math.min(.5,(p.x-195)*.002))}},onUp(){if(active){if(active.y>575)items.splice(items.indexOf(active),1);changed();env.react('happy')}active=null},drawOverlay(c){if(active){c.save();c.strokeStyle='#fff9df';c.lineWidth=2;c.setLineDash([4,4]);c.beginPath();c.arc(active.x,active.y,30,0,Math.PI*2);c.stroke();c.restore();c.save();c.fillStyle='#fff3e4df';c.beginPath();c.roundRect(145,572,100,35,15);c.fill();c.strokeStyle='#a66b7c';c.lineWidth=3;c.strokeRect(187,582,16,17);c.beginPath();c.moveTo(183,578);c.lineTo(207,578);c.stroke();c.restore()}}};
}
