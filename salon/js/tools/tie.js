import {ornament} from '../ornaments.js?v=17';
export function createTie(env){let drag=null,flash=null,checked='';
 const locate=p=>{const radius=env.tieRadius?.()??32;return env.hair.tieHandles().map(b=>({b,d:Math.hypot(b.x-p.x,b.y-p.y)})).filter(q=>q.d<radius).sort((a,b)=>a.d-b.d)[0]?.b;};
 return {
  onDown(p,{spawn=false,band=null}={}){const handle=band!==null?env.hair.tieHandles().find(b=>b.index===band):spawn?null:locate(p);drag={origin:{...p},point:handle?{x:handle.x,y:handle.y}:{...p},offset:handle?{x:handle.x-p.x,y:handle.y-p.y}:{x:0,y:0},band:handle?.index??null,color:handle?.color??env.colorIndex,spawn,moved:false,target:null};checked='';flash=null;},
  onMove(p){if(!drag)return;if(Math.hypot(p.x-drag.origin.x,p.y-drag.origin.y)>6)drag.moved=true;drag.point={x:p.x+drag.offset.x,y:p.y+drag.offset.y};},
  update(){if(!drag)return;const key=drag.point.x+':'+drag.point.y;if(key===checked)return;checked=key;drag.target=env.hair.freeTarget(drag.point,drag.band);},
  onUp({cancel=false}={}){if(!drag)return;const d=drag;drag=null;if(cancel||d.spawn&&!d.moved)return;
   if(d.band!==null&&(!d.moved||d.point.y>555)){env.hair.releaseTie(d.band);env.react('happy');return;}
   const count=env.hair.tieAt(d.point,d.color,d.band);if(count)env.react('happy');else{flash={point:d.point,until:Date.now()+900};env.tieFeedback?.('把髮圈放在頭髮上；太短的頭髮可以先長長。');}
  },
  drawOverlay(c){const d=drag,failed=flash&&Date.now()<flash.until,point=d?.point||(failed?flash.point:null);if(!point)return;
   const r=env.tieRadius?.()??32,remove=d?.band!==null&&d?.point.y>555,valid=remove||!!d?.target;
   c.save();c.fillStyle='#fff9edcc';c.strokeStyle=valid?'#84b99b':'#db9aab';c.lineWidth=2.5;c.setLineDash([5,5]);c.beginPath();c.arc(point.x,point.y,r,0,Math.PI*2);c.fill();c.stroke();c.setLineDash([]);
   ornament(c,'bow',point.x,point.y,r*1.45,d?.color??env.colorIndex);
   if(!valid){c.strokeStyle='#c77989';c.lineWidth=3;c.beginPath();c.moveTo(point.x+r*.55,point.y-r*.65);c.lineTo(point.x+r*.85,point.y-r*.35);c.moveTo(point.x+r*.85,point.y-r*.65);c.lineTo(point.x+r*.55,point.y-r*.35);c.stroke();}
   if(remove){c.fillStyle='#fff4e3';c.beginPath();c.roundRect(153,563,84,40,14);c.fill();c.strokeStyle='#bd8398';c.lineWidth=3;c.strokeRect(185,578,20,19);c.beginPath();c.moveTo(180,573);c.lineTo(210,573);c.stroke();}
   c.restore();
  }
 };
}
