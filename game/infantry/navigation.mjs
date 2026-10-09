// Small grid for real routes around cover. Failed routes never fall back to walking through a wall.
export class Navigation {
  constructor(solid, bounds, ground) {
    this.solid=solid; this.bounds=bounds; this.ground=ground; this.cell=2;
    this.width=Math.floor((bounds.x1-bounds.x0)/this.cell)+1;
    this.height=Math.floor((bounds.z1-bounds.z0)/this.cell)+1;
    this.nodes=Array.from({length:this.width*this.height},(_,i)=>{
      const x=bounds.x0+(i%this.width)*this.cell,z=bounds.z0+Math.floor(i/this.width)*this.cell,y=ground(x,z);
      const blocked=solid.list.some(b=>!b.noMove && !b.ramp && b.y1>y+.48 && b.y0<y+1.7 && x>b.x0-.48 && x<b.x1+.48 && z>b.z0-.48 && z<b.z1+.48);
      return {x,y,z,blocked};
    });
    this.edges=new Map();
  }
  edgeClear(a,b) {
    const key=a<b?`${a}:${b}`:`${b}:${a}`;if(this.edges.has(key))return this.edges.get(key);
    const p=this.nodes[a],q=this.nodes[b],dx=q.x-p.x,dz=q.z-p.z;
    const clear=!this.solid.list.some(box=>{
      if(box.noMove||box.ramp||box.y1<=Math.min(p.y,q.y)+.48||box.y0>=Math.max(p.y,q.y)+1.7)return false;
      let lo=0,hi=1;
      for(const [v,delta,min,max]of [[p.x,dx,box.x0-.38,box.x1+.38],[p.z,dz,box.z0-.38,box.z1+.38]]){
        if(Math.abs(delta)<1e-9){if(v<min||v>max)return false;continue;}
        const t0=(min-v)/delta,t1=(max-v)/delta;lo=Math.max(lo,Math.min(t0,t1));hi=Math.min(hi,Math.max(t0,t1));if(lo>hi)return false;
      }
      return hi>=0&&lo<=1;
    });this.edges.set(key,clear);return clear;
  }
  nearest(p) {
    let best=-1,distance=Infinity;
    for(let i=0;i<this.nodes.length;i++){const n=this.nodes[i];if(n.blocked)continue;const d=(n.x-p.x)**2+(n.z-p.z)**2;if(d<distance){distance=d;best=i;}}
    return best;
  }
  route(from,to) {
    const start=this.nearest(from),end=this.nearest(to);if(start<0||end<0)return [];
    const open=new Set([start]),cost=new Map([[start,0]]),previous=new Map(),closed=new Set();
    const heuristic=i=>Math.hypot(this.nodes[i].x-this.nodes[end].x,this.nodes[i].z-this.nodes[end].z);
    for(let guard=0;open.size&&guard<this.nodes.length;guard++){
      let current=-1,best=Infinity;for(const i of open){const f=cost.get(i)+heuristic(i);if(f<best){best=f;current=i;}}
      if(current===end){const path=[];while(current!==start){path.push(this.nodes[current]);current=previous.get(current);}return path.reverse();}
      open.delete(current);closed.add(current);
      const x=current%this.width,z=Math.floor(current/this.width);
      for(const [dx,dz] of [[1,0],[-1,0],[0,1],[0,-1]]){
        const xx=x+dx,zz=z+dz;if(xx<0||xx>=this.width||zz<0||zz>=this.height)continue;
        const next=zz*this.width+xx,n=this.nodes[next];if(n.blocked||closed.has(next))continue;
        if(Math.abs(n.y-this.nodes[current].y)>1.1)continue;
        if(!this.edgeClear(current,next))continue;
        const g=cost.get(current)+this.cell;if(g<(cost.get(next)??Infinity)){cost.set(next,g);previous.set(next,current);open.add(next);}
      }
    }
    return [];
  }
}
