export function segmentClear(start, end, blocked) {
  const dx=end.x-start.x,dy=end.y-start.y,steps=Math.max(1,Math.ceil(Math.max(Math.abs(dx),Math.abs(dy))*4));
  let px=Math.round(start.x),py=Math.round(start.y);
  for(let i=1;i<=steps;i++) {
    const x=Math.round(start.x+dx*i/steps),y=Math.round(start.y+dy*i/steps);
    if(blocked(x,y)||x!==px&&y!==py&&(blocked(x,py)||blocked(px,y)))return false;
    px=x;py=y;
  }
  return true;
}
export function smoothPath(start, path, blocked) {
  if(!path?.length)return path;
  const result=[];let anchor=start,index=0;
  while(index<path.length) {
    let end=index;
    // Bound the work for large armies; each tested segment is at most 16 tiles.
    for(let j=index+1;j<Math.min(path.length,index+16);j++) {
      if(!segmentClear(anchor,path[j],blocked))break;
      end=j;
    }
    const point=path[end];result.push(point);anchor=point;index=end+1;
  }
  return result;
}
export function pathGoalTail(point,goal,size,blocked,radius,goalDistance) {
  if(goalDistance(point,goal)<=radius+.01)return [];
  if(goal.kind==='building'||goal.x<0||goal.y<0||goal.x>=size||goal.y>=size||Math.hypot(point.x-goal.x,point.y-goal.y)>1.5)return null;
  return !blocked(Math.round(goal.x),Math.round(goal.y))&&segmentClear(point,goal,blocked)?[{x:goal.x,y:goal.y}]:null;
}
export function facingDirection(unit) {
  const target=unit.path?.[0],vector=typeof unit.facing==='object'?unit.facing:target?{x:target.x-unit.x,y:target.y-unit.y}:null;
  if(vector&&Math.abs(vector.x)+Math.abs(vector.y)>.00001) {
    const x=vector.x-vector.y,y=vector.x+vector.y;
    return y>=0?(x>=0?0:1):(x<0?2:3);
  }
  return Number.isInteger(unit.facing)?unit.facing:0;
}
export function animationPose(unit) {
  const moving=unit.moving??Boolean(unit.path?.length),working=Boolean(unit.working),duration=working?1.05:.55;
  const phase=moving?(unit.moveDistance||0)/(unit.blueprint.look==='knight'?1.6:.8):working?(unit.workPhase||0)/duration:unit.attackAnimation>0?1-unit.attackAnimation/.55:(unit.moveDistance||0)/(unit.blueprint.look==='knight'?1.6:.8);
  return {moving,working,direction:facingDirection(unit),state:moving?'walk':working||unit.attackAnimation>0?'attack':null,phase:phase%1,frame:Math.min(3,Math.floor((phase%1)*4))};
}
