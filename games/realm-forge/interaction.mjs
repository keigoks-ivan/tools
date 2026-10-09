export const DRAG_THRESHOLD = 5;

export function leftDragMode({mode,enabled,shift=false,ctrl=false,alt=false,targeting=false,hit=null}) {
  return mode==='play'&&enabled&&!shift&&!ctrl&&!alt&&!targeting&&!hit?'panPending':'select';
}

export function crossedDragThreshold(start,end) {
  return Math.hypot(end.x-start.x,end.y-start.y)>DRAG_THRESHOLD;
}
