// Bubbles follow hair material rather than screen coordinates, including after a resize.
export class FoamSystem{
 constructor(hair){this.hair=hair;this.bubbles=[];}
 point(b){const s=this.hair.strands.find(s=>s.id===b.strand);if(!s)return null;const t=b.u*(s.nodes.length-1),i=Math.min(s.nodes.length-2,Math.floor(t)),a=s.nodes[i],c=s.nodes[i+1],f=t-i;return {x:a.x+(c.x-a.x)*f+b.dx,y:a.y+(c.y-a.y)*f+b.dy};}
 lather(p){const candidates=[];for(const s of this.hair.strands)for(let i=1;i<s.nodes.length;i++){const n=s.nodes[i],d=Math.hypot(n.x-p.x,n.y-p.y);if(d<38)candidates.push({strand:s.id,u:i/(s.nodes.length-1),d})}candidates.sort((a,b)=>a.d-b.d);for(const q of candidates.slice(0,5))this.bubbles.push({strand:q.strand,u:q.u,dx:(Math.random()-.5)*16,dy:(Math.random()-.5)*12,size:4+Math.random()*6});this.bubbles=this.bubbles.slice(-180);return Math.min(candidates.length,5);}
 rinse(p){const before=this.bubbles.length;this.bubbles=this.bubbles.filter(b=>{const q=this.point(b);return q&&Math.hypot(q.x-p.x,q.y-p.y)>52});return before-this.bubbles.length;}
 snapshot(){return structuredClone(this.bubbles)}
 restore(saved){this.bubbles=(Array.isArray(saved)?saved:[]).filter(b=>b&&this.hair.strands.some(s=>s.id===b.strand)&&Number.isFinite(b.u)&&b.u>=0&&b.u<=1&&Number.isFinite(b.dx)&&Math.abs(b.dx)<=16&&Number.isFinite(b.dy)&&Math.abs(b.dy)<=16&&Number.isFinite(b.size)&&b.size>=3&&b.size<=12).slice(-180).map(b=>({...b}));}
 draw(c,now){c.save();c.lineWidth=.9;for(const [i,b] of this.bubbles.entries()){const p=this.point(b);if(!p)continue;const r=b.size*(1+.04*Math.sin(now*.003+i));c.fillStyle='#fffaf3e8';c.strokeStyle='#bddbe6';c.beginPath();c.arc(p.x,p.y,r,0,Math.PI*2);c.fill();c.stroke();c.strokeStyle='#ffffff';c.lineWidth=1.5;c.beginPath();c.arc(p.x-r*.1,p.y-r*.1,r*.65,Math.PI,Math.PI*1.5);c.stroke();}c.restore();}
}
