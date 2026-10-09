import { BUILDINGS, RESOURCE } from './core.mjs?v=20261009l';

export function selectionAfterClick(world,current,incoming,{append=false,toggle=true}={}) {
  const valid=id=>{const e=world.entity(id);return e&&e.hp>0&&!e.garrison;};
  const ids=[...new Set(incoming)].filter(valid),next=new Set(append?[...current].filter(valid):[]);
  if(ids.length) {
    const own=ids.some(id=>world.entity(id).team===0);
    for(const id of next)if((world.entity(id).team===0)!==own)next.delete(id);
    for(const id of ids.filter(id=>(world.entity(id).team===0)===own)) {
      if(append&&toggle&&next.has(id))next.delete(id);else next.add(id);
    }
  }
  return next;
}

export function readControlPreferences(value) {
  try {const parsed=JSON.parse(value);return {leftDragPan:typeof parsed?.leftDragPan==='boolean'?parsed.leftDragPan:false};}
  catch {return {leftDragPan:false};}
}

export function applySelectionStance(world,units,stance) {
  for(const u of units.filter(u=>u.team===0&&u.hp>0&&!u.garrison&&world.isMilitary(u))) {
    u.stance=stance;u.autoTarget=null;u.combatOrigin=null;u.combatReturning=false;
    u.path=[];u.pathGoal=null;u.repath=0;u.autoTimer=0;
    world.routeSearches?.delete(u.id);
  }
}

const LABELS={move:'移動',attackMove:'攻擊移動',attack:'攻擊',convert:'招降',gather:'採集',build:'建造',repair:'修理',deliver:'卸下資源',heal:'治療',trade:'貿易',patrol:'巡邏',guard:'守衛',follow:'跟隨',garrison:'進駐',attackGround:'攻擊地面',rally:'設定集結點'};

// One context click gives each selected unit an action it can carry out.
export function applyContextCommand(world,selection,point,{shift=false,attackMove=false,forceGarrison=false,forceMove=false,mode=null,formation='line'}={}) {
  const p={x:Math.round(point.x),y:Math.round(point.y)},n=world.map.size;
  if(p.x<0||p.y<0||p.x>=n||p.y>=n)return {sent:0,errors:['請點地圖內的目標。'],summary:'',attack:false};
  const own=selection.filter(e=>e.team===0&&e.hp>0&&!e.garrison),units=own.filter(e=>e.kind==='unit'),buildings=own.filter(e=>e.kind==='building');
  let target=forceMove?null:point.target;
  if(target&&(target.hp<=0||target.garrison))target=null;
  const errors=[],counts=new Map(),accepted=new Set();
  const record=(id,type)=>{accepted.add(id);counts.set(type,(counts.get(type)||0)+1);};
  const fail=message=>{if(message&&!errors.includes(message))errors.push(message);};
  const send=(list,order)=>{
    for(const u of list) {
      const error=world.command([u.id],order,shift);
      if(error)fail(error);else record(u.id,order.type);
    }
  };
  const move=(list,asAttack=false)=>{
    if(!list.length)return;
    const before=new Map(list.map(u=>[u.id,{order:u.order,queued:u.queued.length}]));
    world.moveFormation(list.map(u=>u.id),p,formation,shift,asAttack);
    for(const u of list) {
      const old=before.get(u.id);
      if(u.order!==old.order||u.queued.length!==old.queued)record(u.id,asAttack?'attackMove':'move');
      else fail(u.queued.length>=40?'指令佇列已滿。':'目的地附近沒有可用空地。');
    }
  };
  const rally=()=>{
    const producers=buildings.filter(b=>b.progress===1&&world.project.units.some(bp=>bp.building===b.type));
    for(const b of producers) {
      b.rally=target&&world.isEnemy(0,target.team)?{type:'attack',target:target.id}:target?.type==='farm'&&target.team===0?{type:'gather',target:target.id}:RESOURCE[world.tile(p.x,p.y)]?{type:'gather',...p,resource:RESOURCE[world.tile(p.x,p.y)]}:{type:'move',...p};
      record(b.id,'rally');
    }
    if(buildings.length&&!producers.length)fail('請選取已完成的生產建築來設定集結點。');
  };
  const result=()=>({sent:accepted.size,errors,summary:[...counts].map(([type,count])=>`${count} ${type==='rally'?'棟建築':'名單位'}${LABELS[type]||type}`).join(' · '),attack:attackMove||Boolean(target&&world.isEnemy(0,target.team)&&counts.has('attack'))});
  if(!own.length){fail('先左鍵選取自己的村民或士兵，再右鍵下指令；按 . 可選取閒置村民。');return result();}
  mode=forceGarrison?'garrison':mode;
  if(mode==='rally'||!units.length){rally();return result();}
  if(forceMove){move(units);rally();return result();}
  if(mode) {
    const eligible=units.filter(u=>mode==='attack-ground'?u.blueprint.attackGround||u.blueprint.splash:mode==='patrol'?world.isMilitary(u):mode==='repair'?u.blueprint.role==='worker':mode==='convert'?u.blueprint.canConvert:mode==='heal'?u.blueprint.role==='healer':mode==='garrison'?u.blueprint.role!=='trader':true);
    if(!eligible.length)fail('所選單位不支援這項指令。');
    else if(mode==='attack-ground'||mode==='patrol')send(eligible,{type:mode==='attack-ground'?'attackGround':mode,...p});
    else if(target)send(eligible,{type:mode,target:target.id});
    else fail('請點選有效目標。');
    if(eligible.length<units.length)fail('部分單位不支援這項指令，已保留原任務。');
    return result();
  }
  if(attackMove) {
    move(units.filter(u=>u.blueprint.role!=='trader'),true);move(units.filter(u=>u.blueprint.role==='trader'));
  } else if(target&&world.isEnemy(0,target.team)) {
    const walking=[];
    for(const u of units) {
      if(u.blueprint.role==='trader') {
        if(target.kind==='building'&&target.type==='market') {const error=world.startTrade(u,target.id,shift);if(error)fail(error);else record(u.id,'trade');}
        else walking.push(u);
      } else if(u.blueprint.role==='healer') {
        if(u.blueprint.canConvert&&target.kind==='unit'&&!target.blueprint.hero)send([u],{type:'convert',target:target.id});
        else walking.push(u);
      } else send([u],{type:'attack',target:target.id});
    }
    move(walking);
    if(walking.length)fail('商隊或僧侶已移到目標附近；這個目標無法由它們攻擊或招降。');
  } else if(target?.team===0&&target.kind==='building'&&units.some(u=>u.blueprint.role==='worker')) {
    const workers=units.filter(u=>u.blueprint.role==='worker'),others=units.filter(u=>u.blueprint.role!=='worker');
    const type=target.progress<1?'build':target.type==='farm'?'gather':target.hp<target.maxHp?'repair':null;
    if(type==='gather') {
      const farmer=workers.find(u=>!world.farmWorker(target,u.id));
      if(farmer){send([farmer],{type:'gather',target:target.id});move(workers.filter(u=>u!==farmer));}
      else {fail('這座農田已有村民耕作，每座農田只供一名村民使用。');move(workers);}
    } else if(type)send(workers,{type,target:target.id});
    else {
      const carriers=workers.filter(u=>u.carried&&BUILDINGS[target.type].dropoff?.includes(u.carrying));
      send(carriers,{type:'deliver',target:target.id});move(workers.filter(u=>!carriers.includes(u)));
    }
    move(others);
  } else if(target?.team===0&&target.kind==='unit'&&units.some(u=>u.blueprint.role==='healer')) {
    send(units.filter(u=>u.blueprint.role==='healer'&&u.id!==target.id),{type:'heal',target:target.id});
    move(units.filter(u=>u.blueprint.role!=='healer'&&u.id!==target.id));
  } else if(RESOURCE[world.tile(p.x,p.y)]&&units.some(u=>u.blueprint.role==='worker')) {
    send(units.filter(u=>u.blueprint.role==='worker'),{type:'gather',...p});move(units.filter(u=>u.blueprint.role!=='worker'));
  } else move(units);
  if(buildings.length)rally();
  return result();
}
