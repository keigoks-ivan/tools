import { pathGoalTail } from './motion.mjs?v=20261009k';
// Incremental fallback for routes whose detour leaves the local pathfinding window.
// A search owns at most 50,000 visited cells and yields between small batches.
export function createRouteSearch(start, goal, size, blocked, goalDistance, radius) {
  const sx = Math.round(start.x), sy = Math.round(start.y), initial = sy * size + sx;
  const nodes = new Map([[initial, {cost:0, previous:-1}]]), heap = [], done = new Set();
  const h = (x,y) => Math.max(0, goalDistance({x,y},goal)-radius);
  const push = node => { heap.push(node); let i=heap.length-1; while(i) { const p=(i-1)>>1; if(heap[p].score<=node.score) break; heap[i]=heap[p];i=p; } heap[i]=node; };
  const pop = () => { const first=heap[0],last=heap.pop(); if(heap.length) { let i=0; while(i*2+1<heap.length) { let child=i*2+1;if(child+1<heap.length&&heap[child+1].score<heap[child].score)child++;if(heap[child].score>=last.score)break;heap[i]=heap[child];i=child;}heap[i]=last; }return first; };
  push({id:initial,score:h(sx,sy)});
  const directions=[[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]];
  return {
    finished:false,
    step(limit=400) {
      for(let count=0;heap.length&&done.size<50000&&count<limit;count++) {
        const {id}=pop();if(done.has(id))continue;done.add(id);
        const x=id%size,y=Math.floor(id/size),node=nodes.get(id);
        const tail=pathGoalTail({x,y},goal,size,blocked,radius,goalDistance);
        if(tail) {
          const path=[];let cursor=id;
          while(cursor!==initial) {path.push({x:cursor%size,y:Math.floor(cursor/size)});cursor=nodes.get(cursor).previous;}
          this.finished=true;return [...path.reverse(),...tail];
        }
        for(const [dx,dy] of directions) {
          const nx=x+dx,ny=y+dy,next=ny*size+nx;
          if(nx<0||ny<0||nx>=size||ny>=size||done.has(next)||blocked(nx,ny)||dx&&dy&&(blocked(x+dx,y)||blocked(x,y+dy)))continue;
          const cost=node.cost+(dx&&dy?1.4142:1);
          if(cost>=(nodes.get(next)?.cost??Infinity))continue;
          nodes.set(next,{cost,previous:id});push({id:next,score:cost+h(nx,ny)*1.15});
        }
      }
      if(!heap.length||done.size>=50000) {this.finished=true;return null;}
      return undefined;
    },
  };
}
