// Only explicit destinations are displayed; combat paths have their own target
// indicator, and failed or hidden entities must not leak onto the battlefield.
export function commandWaypoints(world, unit, limit = 8) {
  if (!unit || unit.team !== 0 || unit.garrison || unit.hp <= 0) return [];
  return [unit.order, ...(unit.queued || [])].flatMap((order,index)=>{
    if (!order || !['move','attackMove','patrol','attackGround','gather','build','repair','deliver','garrison','guard','follow','heal'].includes(order.type)) return [];
    const target=order.target?world.entity(order.target):null;
    if (order.target&&(!target||target.hp<=0||target.garrison||!world.isVisible(target))) return [];
    const x=target?.x??order.x,y=target?.y??order.y;
    if (!Number.isFinite(x)||!Number.isFinite(y)||x<0||y<0||x>=world.map.size||y>=world.map.size) return [];
    return [{x,y,type:order.type,queued:index>0,index}];
  }).slice(0,limit);
}
