// 北野の実景をもとにした、人の尺度の連続した坂道・庭園・洋館街。
// https://kobe-kazamidori.com/history/ https://www.feel-kobe.jp/facilities/0000000042/
// https://kobe-ijinkan.net/uroko/ https://www.kobe-kitano.net/about/
// 道路は local +Z が上り。地形データを変更せず、静的な斜面と床だけを追加する。
import * as THREE from 'three';
import { JAPANESE_FONT } from './urban.js';
import { gardenPlanting } from './kobe-autumn.js';

export const KITANO_LABELS = ['北野異人館街','風見鶏の館','萌黄の館','うろこの家','北野坂','北野天満神社','山本通','北野町広場'];
export const KITANO_BOUNDS = { x0:-56,x1:56,z0:0,z1:280 };
const C = {
  stone:[.54,.55,.50,0,1], paving:[.62,.62,.57,0,1], grass:[1,1,1,0,9],
  brick:[.46,.20,.14,0,7], mortar:[.62,.51,.40,0,6], white:[.84,.83,.73,0,6],
  green:[.58,.69,.43,0,6], shutter:[.15,.26,.19,0,6], roof:[.22,.25,.27,0,3],
  slate:[.45,.48,.47,0,6], wood:[.29,.23,.18,0,5], iron:[.17,.21,.20,0,2],
  glass:[.20,.28,.28,0,4], soil:[.38,.33,.24,0,6], gold:[.65,.43,.13,0,6], red:[.49,.18,.10,0,6],
};
const tint=(c,k)=>c.map((v,i)=>i<3?v*k:v);
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
function normal(a,b,c) { const n=cross(b.map((v,i)=>v-a[i]),c.map((v,i)=>v-a[i])),d=Math.hypot(...n);return n.map(v=>v/(d||1)); }

export function kitanoSignUV(id) {
  if(!Number.isInteger(id)||id<0||id>=KITANO_LABELS.length)throw new RangeError('Invalid Kitano sign');
  const x=id%2*.5,y=1-(Math.floor(id/2)+1)*.25,p=.004;
  return [[x+p,y+p],[x+.5-p,y+p],[x+.5-p,y+.25-p],[x+p,y+.25-p]];
}
let signMaterial;
export function kitanoSignMaterial() {
  if(signMaterial)return signMaterial;
  const m=new THREE.MeshStandardMaterial({roughness:.8,metalness:.02});m.userData.noCast=true;
  if(typeof document!=='undefined') {
    const c=document.createElement('canvas');c.width=512;c.height=256;const ctx=c.getContext('2d');
    const draw=()=>{KITANO_LABELS.forEach((text,i)=>{
      const x=i%2*256,y=Math.floor(i/2)*64;ctx.fillStyle=i===5?'#e4dfce':'#344139';ctx.fillRect(x,y,256,64);
      ctx.strokeStyle=i===5?'#594734':'#c7c5ad';ctx.lineWidth=2;ctx.strokeRect(x+5,y+5,246,54);
      ctx.fillStyle=i===5?'#47372b':'#ece8cf';ctx.textAlign='center';ctx.textBaseline='middle';ctx.font='bold 27px '+JAPANESE_FONT;ctx.fillText(text,x+128,y+32,232);
    });};draw();
    const map=new THREE.CanvasTexture(c);map.name='kitano-fixed-signs';map.colorSpace=THREE.SRGBColorSpace;map.anisotropy=4;m.map=map;
    document.fonts?.load('bold 27px "Noto Sans JP"',KITANO_LABELS.join('')).then(()=>{draw();map.needsUpdate=true;}).catch(()=>{});
  }
  signMaterial=m;return m;
}

export function kitanoScenery(out,{x=0,z=0,ground=0,yaw=0,scale=1,length=280,detail=true,colliders=true}={}) {
  if(![x,z,ground,yaw,scale,length].every(Number.isFinite)||scale<=0||length<140||length>360)throw new RangeError('Invalid Kitano placement');
  if(colliders&&Math.abs(Math.sin(yaw*2))>1e-6)throw new RangeError('Kitano walkable ramps require a cardinal yaw');
  const co=Math.cos(yaw),si=Math.sin(yaw),P=(u,y,v)=>[x+scale*(u*co+v*si),ground+y*scale,z+scale*(-u*si+v*co)];
  const H=v=>v<=70?Math.max(0,v)*.115:v<=84?8.05:8.05+(v-84)*.115;
  const roadX=v=>v<=70?0:v<84?(v-70)*27/14:v<=136?27:v<164?27*(164-v)/28:0;
  let triangles=0;const solids=[],floors=[],landmarks=[],treePoints=[],gardenSites=[],houses=[],lanes=[];
  const tree=(u,y,v,s=.68)=>{const p=P(u,y,v);treePoints.push([p[0],p[2],s*scale,p[1]]);};
  const F=(a,b,c,d,col)=>{out.face(P(...a),P(...b),P(...c),P(...d),col);triangles+=2;};
  const B=(a,b,lo,hi,c,d,col)=>{
    if(b-a<.00001||hi-lo<.00001||d-c<.00001)return;
    F([b,lo,c],[a,lo,c],[a,hi,c],[b,hi,c],col);F([a,lo,d],[b,lo,d],[b,hi,d],[a,hi,d],col);
    F([a,lo,c],[a,lo,d],[a,hi,d],[a,hi,c],tint(col,.82));F([b,lo,d],[b,lo,c],[b,hi,c],[b,hi,d],tint(col,.93));
    F([a,hi,d],[b,hi,d],[b,hi,c],[a,hi,c],col);
    if(detail&&col===C.stone&&hi-lo>1.8&&(b-a>6||d-c>6))for(let yy=lo+.7;yy<hi;yy+=.7){
      const mortar=tint(col,.67);F([b,yy,c-.014],[a,yy,c-.014],[a,yy+.026,c-.014],[b,yy+.026,c-.014],mortar);
      F([a,yy,d+.014],[b,yy,d+.014],[b,yy+.026,d+.014],[a,yy+.026,d+.014],mortar);
      F([a-.014,yy,c],[a-.014,yy,d],[a-.014,yy+.026,d],[a-.014,yy+.026,c],mortar);
      F([b+.014,yy,d],[b+.014,yy,c],[b+.014,yy+.026,c],[b+.014,yy+.026,d],mortar);
    }
  };
  const bounds=(a,b,lo,hi,c,d)=>{
    const pts=[[a,c],[b,c],[a,d],[b,d]].map(([u,v])=>P(u,0,v));
    return {x0:Math.min(...pts.map(p=>p[0])),x1:Math.max(...pts.map(p=>p[0])),y0:ground+lo*scale,y1:ground+hi*scale,z0:Math.min(...pts.map(p=>p[2])),z1:Math.max(...pts.map(p=>p[2]))};
  };
  const solid=(a,b,lo,hi,c,d)=>{const q=bounds(a,b,lo,hi,c,d);solids.push(q);if(colliders)out.solid?.(q);};
  const floor=(a,b,c,d,y0,y1=y0,axis='z')=>{
    const q=bounds(a,b,Math.min(y0,y1),Math.max(y0,y1),c,d);
    if(y0!==y1)q.ramp={axis:axis==='z'?(Math.abs(co)>.5?'z':'x'):(Math.abs(co)>.5?'x':'z'),dir:(axis==='z'?(Math.abs(co)>.5?co:si):(Math.abs(co)>.5?co:-si))*(y1-y0)>0?1:-1};
    else q.y0=q.y1-.08*scale;
    floors.push(q);if(colliders)out.floor?.(q);
  };
  const beam=(a,b,r,col,sides=4)=>{
    const d=b.map((v,i)=>v-a[i]),L=Math.hypot(...d);if(L<.001)return;
    const n=d.map(v=>v/L),u=cross(n,Math.abs(n[1])<.9?[0,1,0]:[1,0,0]),ul=Math.hypot(...u);for(let i=0;i<3;i++)u[i]/=ul;
    const v=cross(n,u),at=(p,t)=>p.map((q,i)=>q+r*(u[i]*Math.cos(t)+v[i]*Math.sin(t)));
    for(let i=0;i<sides;i++){const t=i/sides*Math.PI*2,k=(i+1)/sides*Math.PI*2;F(at(a,t),at(a,k),at(b,k),at(b,t),col);}
  };
  const panel=(a,b,lo,hi,v,col)=>F([b,lo,v],[a,lo,v],[a,hi,v],[b,hi,v],col);
  const sign=(u,y,v,id,w=1.8,base)=>{const h=w/4,pts=[[u+w/2,y-h/2,v],[u-w/2,y-h/2,v],[u-w/2,y+h/2,v],[u+w/2,y+h/2,v]].map(p=>P(...p));out.sign?.(pts,id);triangles+=2;
    if(base!==undefined)for(const s of [-1,1])beam([u+s*w*.36,base,v+.025],[u+s*w*.36,y+h/2,v+.025],.034,C.iron);
  };
  const path=(a,b,c,d,y,col=C.paving)=>{B(a,b,0,y,c,d,C.stone);F([a,y+.001,d],[b,y+.001,d],[b,y+.001,c],[a,y+.001,c],col);floor(a,b,c,d,y);if(y>.2)solid(a,b,0,y-.03,c,d);};
  const link=(a,b,c,d,ya,yb)=>{
    F([a,ya,d],[b,yb,d],[b,yb,c],[a,ya,c],C.paving);
    F([a,0,c],[b,0,c],[b,yb,c],[a,ya,c],C.stone);F([b,0,d],[a,0,d],[a,ya,d],[b,yb,d],C.stone);
    floor(a,b,c,d,ya,yb,'x');if(Math.min(ya,yb)>.1)solid(a,b,0,Math.min(ya,yb)-.03,c,d);
  };
  const rail=(a,b,col=C.iron,spacing=1.05)=>{
    if(!detail){for(const y of [.28,1])F([a[0],a[1]+y-.025,a[2]],[b[0],b[1]+y-.025,b[2]],[b[0],b[1]+y+.025,b[2]],[a[0],a[1]+y+.025,a[2]],col);for(const p of [a,b])beam(p,[p[0],p[1]+1.08,p[2]],.055,col);return;}
    beam([a[0],a[1]+1,a[2]],[b[0],b[1]+1,b[2]],.045,col);
    beam([a[0],a[1]+.28,a[2]],[b[0],b[1]+.28,b[2]],.028,col);
    const n=detail?Math.ceil(Math.hypot(b[0]-a[0],b[2]-a[2])/Math.max(1.4,spacing)):1;
    for(let i=0;i<=n;i++){const p=a.map((v,j)=>v+(b[j]-v)*i/n);if(i===0||i===n)beam(p,[p[0],p[1]+1.08,p[2]],.055,col);
      else {F([p[0]-.018,p[1],p[2]],[p[0]+.018,p[1],p[2]],[p[0]+.018,p[1]+1.04,p[2]],[p[0]-.018,p[1]+1.04,p[2]],col);
        F([p[0],p[1],p[2]-.018],[p[0],p[1],p[2]+.018],[p[0],p[1]+1.04,p[2]+.018],[p[0],p[1]+1.04,p[2]-.018],col);}
    }
  };
  const steps=(cx,w,v0,v1,y0,y1)=>{
    const n=Math.ceil((y1-y0)/.24),run=(v1-v0)/n;
    for(let i=0;i<n;i++){const y=y0+(y1-y0)*(i+1)/n,a=v0+i*run,b=a+run;B(cx-w/2,cx+w/2,0,y,a,b,C.stone);floor(cx-w/2,cx+w/2,a,b,y);solid(cx-w/2,cx+w/2,0,y-.03,a,b);}
    for(const side of [-1,1])rail([cx+side*(w/2+.16),y0,v0],[cx+side*(w/2+.16),y1,v1]);
  };
  const hip=(a,b,c,d,y,rise,col=C.roof)=>{
    const inset=Math.min((b-a)/2,(d-c)/2)*.72,lo=a+inset,hi=b-inset;
    F([a,y,c],[lo,y+rise,(c+d)/2],[hi,y+rise,(c+d)/2],[b,y,c],col);
    F([b,y,d],[hi,y+rise,(c+d)/2],[lo,y+rise,(c+d)/2],[a,y,d],tint(col,.83));
    F([a,y,d],[lo,y+rise,(c+d)/2],[a,y,c],[a,y,c],tint(col,.92));F([b,y,c],[hi,y+rise,(c+d)/2],[b,y,d],[b,y,d],tint(col,.74));
    beam([lo,y+rise+.02,(c+d)/2],[hi,y+rise+.02,(c+d)/2],.09,col);
    B(a-.05,b+.05,y-.23,y+.03,c-.05,d+.05,col);
  };
  const gable=(a,b,c,d,y,rise,col)=>{
    const mid=(a+b)/2;F([a,y,d],[mid,y+rise,d],[mid,y+rise,c],[a,y,c],C.roof);
    F([mid,y+rise,d],[b,y,d],[b,y,c],[mid,y+rise,c],tint(C.roof,.8));
    F([b,y,c],[a,y,c],[mid,y+rise,c],[mid,y+rise,c],col);F([a,y,d],[b,y,d],[mid,y+rise,d],[mid,y+rise,d],col);
    beam([mid,y+rise,c],[mid,y+rise,d],.085,C.roof);B(a-.05,b+.05,y-.2,y+.03,c-.05,d+.05,C.roof);
  };
  const window=(u,y,v,w=1.2,h=1.85,shutters=false,framePaint=C.white)=>{
    const frame=tint(framePaint,.94+.04*Math.sin(u*.61+v*.17+y*.29));
    if(!detail){panel(u-w/2-.07,u+w/2+.07,y-.08,y+h+.08,v-.045,frame);panel(u-w/2,u+w/2,y,y+h,v-.06,C.glass);return;}
    panel(u-w/2,u+w/2,y,y+h,v-.045,C.glass);
    for(const a of [u-w/2-.055,u+w/2])panel(a,a+.055,y-.06,y+h+.06,v-.10,frame);
    for(const yy of [y-.06,y+h,y+h*.56])panel(u-w/2,u+w/2,yy,yy+.055,v-.10,frame);
    panel(u-.027,u+.027,y,y+h,v-.10,frame);
    B(u-w/2-.12,u+w/2+.12,y-.13,y-.07,v-.23,v+.03,tint(frame,.94));
    if(shutters)for(const s of [-1,1]){const a=u+s*(w/2+.3),paint=tint(C.shutter,.95+.065*Math.sin(u*.7+v*.21+s));panel(a-.23,a+.23,y,y+h,v-.09,paint);if(detail)for(let yy=y+.10;yy<y+h;yy+=.36)panel(a-.20,a+.20,yy,yy+.023,v-.10,tint(paint,.72));}
  };
  const sideFacade=(u,c,e,y,h,col,side)=>{
    const panelSide=(a,b,lo,hi,x,paint)=>{const pts=[[x,lo,a],[x,lo,b],[x,hi,b],[x,hi,a]];if(side>0)pts.reverse();F(...pts,paint);};
    const rows=h>6.8?[y+1.15,y+4.5]:[y+.85],count=Math.max(2,Math.floor((e-c)/4)),w=1.15,hh=1.85;let bot=y;
    for(const yy of rows){panelSide(c,e,bot,yy,u,col);let cursor=c;
      for(let i=0;i<count;i++){
        const v=c+(i+.5)*(e-c)/count;panelSide(cursor,v-w/2,yy,yy+hh,u,col);
        panelSide(v-w/2,v+w/2,yy,yy+hh,u+side*.045,C.glass);
        for(const edge of [v-w/2-.055,v+w/2])panelSide(edge,edge+.055,yy-.06,yy+hh+.06,u+side*.095,C.white);
        for(const top of [yy-.06,yy+hh,yy+hh*.56])panelSide(v-w/2,v+w/2,top,top+.055,u+side*.095,C.white);
        panelSide(v-.027,v+.027,yy,yy+hh,u+side*.095,C.white);cursor=v+w/2;
      }
      panelSide(cursor,e,yy,yy+hh,u,col);bot=yy+hh;
    }
    panelSide(c,e,bot,y+h,u,col);
  };
  const house=(cx,cz,w,d,y,h,col,shutters=false,roof='hip')=>{
    // 正面は窓洞を切り抜く。ガラスの前に壁を重ねない。
    const a=cx-w/2,b=cx+w/2,c=cz-d/2,e=cz+d/2,rows=h>6.8?[y+1.15,y+4.5]:[y+.85],ww=1.2,hh=1.85,count=Math.max(3,Math.floor(w/3.7));
    F([a,y,e],[b,y,e],[b,y+h,e],[a,y+h,e],tint(col,.88));
    for(const [u,s]of [[a,-1],[b,1]])if(detail)sideFacade(u,c,e,y,h,tint(col,.92),s);else{const pts=[[u,y,c],[u,y,e],[u,y+h,e],[u,y+h,c]];if(s>0)pts.reverse();F(...pts,tint(col,.92));}
    let bot=y;
    for(const yy of rows){panel(a,b,bot,yy,c,col);let cursor=a;
      for(let i=0;i<count;i++){const u=a+(i+.5)*w/count;panel(cursor,u-ww/2,yy,yy+hh,c,col);if(yy===rows[0]&&i===Math.floor(count/2))panel(u-ww/2,u+ww/2,yy,yy+hh,c,col);else window(u,yy,c,ww,hh,shutters);cursor=u+ww/2;}
      panel(cursor,b,yy,yy+hh,c,col);bot=yy+hh;
    }
    panel(a,b,bot,y+h,c,col);B(a-.13,b+.13,y+3.85,y+4.03,c-.1,e+.1,C.white);
    for(const yy of detail?[y+.05,y+h-.16]:[y+h-.16])B(a-.13,b+.13,yy,yy+.13,c-.13,e+.13,C.white);
    if(detail&&col===C.green)for(let yy=y+.22;yy<y+h;yy+=.26) {if(rows.some(v=>yy>=v&&yy<=v+hh))continue;panel(a,b,yy,yy+.012,c-.012,tint(col,.8));}
    const door=a+(Math.floor(count/2)+.5)*w/count,wood=tint(C.wood,.90+.13*Math.sin(cx*.17+cz*.11));
    panel(door-.68,door+.68,y+.12,y+2.75,c-.08,wood);panel(door-.51,door+.51,y+1.55,y+2.52,c-.095,C.glass);
    for(const u of [door-.77,door+.68])B(u,u+.09,y+.06,y+2.84,c-.18,c+.02,C.white);
    B(door-.77,door+.77,y+2.75,y+2.84,c-.18,c+.02,C.white);beam([door+.45,y+1.2,c-.15],[door+.45,y+1.45,c-.15],.025,C.gold);
    if(detail){
      // 保存された木扉の框、踏み磨かれた石閾、塗装された古い樋と留め金。
      B(door-.79,door+.79,y+.02,y+.12,c-.34,c+.01,tint(C.stone,.92));
      panel(door-.49,door+.49,y+.32,y+1.32,c-.105,tint(wood,.77));panel(door-.41,door+.41,y+.40,y+1.24,c-.115,tint(wood,1.04));
      const side=Math.sin(cx*.3+cz*.14)>0?1:-1,u=side<0?a-.11:b+.11,pipe=tint(C.iron,1.12),pv=c-.16;
      beam([a-.43,y+h-.08,c-.53],[b+.43,y+h-.08,c-.53],.06,pipe);
      beam([u,y+h-.08,c-.53],[u,y+h-.38,pv],.045,pipe);
      beam([u,y+.30,pv],[u,y+h-.38,pv],.045,pipe);beam([u,y+.30,pv],[u,y+.18,c-.38],.045,pipe);
      for(const yy of [y+.9,y+h*.48,y+h-.8]){panel(u-.075,u+.075,yy,yy+.055,pv-.049,C.iron);panel(u-.023,u+.023,yy-.03,yy+.085,pv-.052,tint(pipe,.8));}
    }
    if(roof==='gable')gable(a-.45,b+.45,c-.55,e+.5,y+h,Math.min(3.2,w*.22),col);else hip(a-.45,b+.45,c-.55,e+.5,y+h,Math.min(3.2,d*.28));solid(a,b,y,y+h,c,e);
    B(a,b,Math.max(0,y-1.4),y,c,e,C.stone);houses.push({x:cx,z:cz,w,d,y,h});return {a,b,c,e,y,h};
  };
  const bay=(u,v,y,w=3,depth=1.1,style='canted')=>{
    const inset=style==='box'?0:.5,pts=[[u-w/2,v],[u-w/2+inset,v-depth],[u+w/2-inset,v-depth],[u+w/2,v]];
    for(let i=0;i<3;i++){const a=pts[i],b=pts[i+1];F([b[0],y,b[1]],[a[0],y,a[1]],[a[0],y+7.4,a[1]],[b[0],y+7.4,b[1]],C.green);}
    for(const yy of [y+1.1,y+4.5])window(u,yy,v-depth-.02,w-1,1.9,true);
    for(const yy of [y+.25,y+3.85,y+7.3])B(u-w/2,u+w/2,yy,yy+.14,v-depth-.14,v+.04,C.white);
    if(detail)for(const [x,z]of pts)beam([x,y+.25,z-.035],[x,y+7.3,z-.035],.045,C.white);
    hip(u-w/2-.12,u+w/2+.12,v-depth-.15,v+.10,y+7.45,.35);
  };
  const archedWindow=(u,y,v,w=1.05,h=2.05)=>{
    if(!detail){window(u,y,v,w,h);return;}
    const r=w/2,cy=y+h-r,front=v-.06;panel(u-r,u+r,y,cy,front,C.glass);
    for(let i=0;i<6;i++){const a=i/6*Math.PI,b=(i+1)/6*Math.PI,p=[u+r*Math.cos(a),cy+r*Math.sin(a),front],q=[u+r*Math.cos(b),cy+r*Math.sin(b),front];F([u,cy,front],q,p,p,C.glass);beam(p,q,.035,C.white);}
    for(const s of [-1,1])beam([u+s*r,y,front-.025],[u+s*r,cy,front-.025],.035,C.white);
    panel(u-.027,u+.027,y,y+h,front-.04,C.white);panel(u-r,u+r,y+.85,y+.905,front-.04,C.white);
  };
  const slateScale=(u,y,v,w,h,col)=>{
    const a=[u+w,y+h,v],b=[u+w*.93,y+h*.2,v],c=[u+w*.5,y,v],d=[u,y+h,v],e=[u+w*.07,y+h*.2,v];
    F(a,b,c,d,col);F(d,c,e,e,col);
  };
  const dome=(cx,cz,r,y,h,col)=>{
    const n=detail?12:8,levels=detail?5:3;
    for(let k=0;k<levels;k++){const ta=k/levels*Math.PI/2,tb=(k+1)/levels*Math.PI/2;
      for(let i=0;i<n;i++){const a=i/n*Math.PI*2,b=(i+1)/n*Math.PI*2,at=(t,s)=>[cx+r*Math.cos(t)*Math.cos(s),y+h*Math.sin(s),cz+r*Math.sin(t)*Math.cos(s)];
        F(at(b,ta),at(a,ta),at(a,tb),at(b,tb),tint(col,1-(i%3)*.04));}
    }
  };
  const tower=(cx,cz,r,y,h)=>{
    const n=detail?12:8;
    for(let i=0;i<n;i++){const a=i/n*Math.PI*2,b=(i+1)/n*Math.PI*2,at=(t,yy)=>[cx+r*Math.cos(t),yy,cz+r*Math.sin(t)];F(at(b,y),at(a,y),at(a,y+h),at(b,y+h),tint(C.slate,.87+(i%3)*.07));}
    for(const yy of [y+.15,y+3.8,y+h-.3])for(let i=0;i<n;i++){const a=i/n*Math.PI*2,b=(i+1)/n*Math.PI*2;beam([cx+r*Math.cos(a),yy,cz+r*Math.sin(a)],[cx+r*Math.cos(b),yy,cz+r*Math.sin(b)],.10,C.white);}
    for(const yy of [y+1.05,y+4.65])archedWindow(cx,yy,cz-r-.045,1.05,2.05);
    if(detail)for(let yy=y+.35;yy<y+h-.35;yy+=.38)for(let i=0;i<n;i++){
      const a=(i+(Math.floor(yy/.38)%2)*.5)/n*Math.PI*2,b=a+Math.PI*2/n;
      if(Math.sin((a+b)/2)<-.8&&[y+1.05,y+4.65].some(v=>yy>v&&yy<v+2.05))continue;
      const rr=r+.025,at=(t,h)=>[cx+rr*Math.cos(t),h,cz+rr*Math.sin(t)],mid=(a+b)/2,col=tint(C.slate,i%3===0?1.16:.78);
      F(at(b,yy+.28),at(b-(b-a)*.07,yy+.05),at(mid,yy),at(a,yy+.28),col);F(at(a,yy+.28),at(mid,yy),at(a+(b-a)*.07,yy+.05),at(a+(b-a)*.07,yy+.05),col);
    }
    dome(cx,cz,r+.18,y+h,1.55,C.roof);beam([cx,y+h+1.5,cz],[cx,y+h+2.3,cz],.025,C.iron);
  };
  const garden=(a,b,c,d,y,frontTreeZ)=>{
    path(a,b,c,d,y,C.grass);
    // 庭の擁壁を地表の草斜面につなぎ、街全体を独立した高い箱にしない。
    const side=(a+b)/2<roadX((c+d)/2)?-1:1,inner=side<0?b:a,outer=side<0?a:b,edge=side<0?-55.85:55.85;
    if(Math.abs(edge-outer)>.05){const pts=[[outer,y,c],[outer,y,d],[edge,0,d],[edge,0,c]];if(normal(...pts)[1]<0)pts.reverse();F(...pts,tint(C.grass,.9));floor(Math.min(outer,edge),Math.max(outer,edge),c,d,side<0?0:y,side<0?y:0,'x');}
    for(let v=c;v<d;v+=4){const end=Math.min(d,v+4),rx=roadX(v)+side*4.7,nx=roadX(end)+side*4.7;
      if(side*(inner-rx)<=0||side*(inner-nx)<=0)continue;
      const pts=[[inner,y,v],[inner,y,end],[nx,H(end)+.025,end],[rx,H(v)+.025,v]];if(normal(...pts)[1]<0)pts.reverse();F(...pts,C.grass);
      const mid=roadX((v+end)/2)+side*4.7,ry=H((v+end)/2)+.025;floor(Math.min(inner,mid),Math.max(inner,mid),v,end,side<0?y:ry,side<0?ry:y,'x');
    }
    const middle=(a+b)/2;for(const [lo,hi]of [[a,middle-2.5],[middle+2.5,b]]){const pts=[[lo,H(c-3)+.025,c-3],[hi,H(c-3)+.025,c-3],[hi,y,c],[lo,y,c]];if(normal(...pts)[1]<0)pts.reverse();F(...pts,tint(C.grass,.9));floor(lo,hi,c-3,c,H(c-3)+.025,y);}
    for(const edge of [[a,c,b,c],[a,d,b,d],[a,c,a,d],[b,c,b,d]]){
      const [u,v,s,t]=edge;if(v===c&&t===c){rail([u,y,v],[(u+s)/2-1.3,y,t],C.iron);rail([(u+s)/2+1.3,y,v],[s,y,t],C.iron);}else rail([u,y,v],[s,y,t]);
    }
    path((a+b)/2-1.05,(a+b)/2+1.05,c,d,y+.015);
    for(const [u,v]of [[a+3,c+3],[b-3,d-3]]){
      const treeZ=v===c+3&&frontTreeZ!==undefined?frontTreeZ:v;tree(u,y+(treeZ===v?.13:0),treeZ,detail?.68:.5);
      if(detail)B(u-1.7,u+1.7,y,y+.12,v-1.5,v+1.5,C.stone);path(u-1.6,u+1.6,v-1.4,v+1.4,y+.13,C.soil);
      if(v===c+3){const p=P(u,y+.13,v);gardenSites.push({x:p[0],z:p[2],ry:yaw,ground:p[1],length:2.2*scale,width:.6*scale,height:.65*scale,kind:'mixed'});}
    }
  };

  // 自然な斜面、幅六メートルの北野坂、側溝、石畳の歩道。中央は常に通れる。
  F([-56,0,length],[56,0,length],[56,0,0],[-56,0,0],C.soil);
  for(let v=0;v<length;v+=7){const next=Math.min(length,v+7),a=H(v)+.035,b=H(next)+.035,cx=roadX(v),nx=roadX(next);
    F([cx-4.5,a,v],[nx-4.5,b,next],[nx+4.5,b,next],[cx+4.5,a,v],C.paving);floor(Math.min(cx,nx)-4.5,Math.max(cx,nx)+4.5,v,next,a,b);if(a>.1)solid(Math.min(cx,nx)-4.5,Math.max(cx,nx)+4.5,0,a-.03,v,next);
    // 閉じた擁壁で、道路の斜面を下から見ても空洞にしない。
    for(const side of [-1,1]){const edge=cx+side*4.5,end=nx+side*4.5;
      const pts=[[edge,0,v],[end,0,next],[end,b,next],[edge,a,v]];if(side<0)pts.reverse();F(...pts,C.stone);
      const u=cx+side*3.05,un=nx+side*3.05;F([u-.10,a+.015,v],[un-.10,b+.015,next],[un+.10,b+.015,next],[u+.10,a+.015,v],C.iron);
      if(detail)for(let q=v+.3;q<v+7;q+=.7){const y=H(q)+.05;beam([u-.10,y,q],[u+.10,y,q],.012,C.stone);}
    }
  }
  for(const [cx,cz,w,d,col,rear]of [[-17,20,12,10,C.white],[18,27,12,11,C.green],[-22,44,15,11,C.white],[21,54,14,10,C.white],[-42,58,14,8,C.white,63.5]]){
    const y=H(Math.min(84,cz-d/2))+.3;garden(cx-w/2-3,cx+w/2+3,cz-d/2-4,rear??cz+d/2+3,y);
    house(cx,cz,w,d,y+.18,7.1,col,true);
    const edge=cx<0?cx+w/2+3:cx-w/2-3,road=roadX(cz-d/2-2.5),ry=H(cz-d/2-2.5)+.035;
    // 路面との小さな段差をなだらかな入口で接続。
    link(Math.min(edge,road),Math.max(edge,road),cz-d/2-4,cz-d/2-1,cx<road?y+.025:ry,cx<road?ry:y+.025);
    lanes.push({v:cz-d/2-2.5,road,ry,edge,cx,y:y+.025});
  }
  // 北野町広場は洋館の間に開く。ベンチ・花壇は通路の外側。
  path(-16,16,70,84,H(70)+.04);
  for(const u of [-13,13]){B(u-.85,u+.85,H(70)+.15,H(70)+.22,70,73,C.wood);for(const v of [70.3,72.7])beam([u,H(70),v],[u,H(70)+.7,v],.06,C.iron);}
  sign(-8,H(70)+1.1,72,7,2.2,H(70)+.04);

  // 萌黄の館：二層のベランダと二種類の張り出し窓、白い柱、緑の鎧戸。
  const my=H(73)+.35;garden(-47,-17,64,88,my);const mh=house(-32,77,15,12,my+.2,7.6,C.green,true);
  bay(-29,mh.c,my+.2,3.5,1.15,'box');bay(-36,mh.c,my+.2,2.7,.75);
  for(const y of [my+.4,my+4.08]){
    B(-43.5,-40,y,y+.16,69,83,C.white);for(const v of [69.6,73.7,78.1,82.4])beam([-42.8,y,v],[-42.8,y+3.7,v],.07,C.white,6);
    rail([-42.8,y+.15,69.4],[-42.8,y+.15,82.5],C.white,detail?.42:1.4);
  }
  // 保存された二階のベランダは欄干の上が窓。一階の柱間は開放のまま。
  const ml=my+5.14,mt=my+7.44;
  F([-42.89,ml,69.54],[-42.89,ml,82.46],[-42.89,mt,82.46],[-42.89,mt,69.54],C.glass);
  panel(-42.89,-40,ml,mt,69.54,C.glass);
  F([-42.89,ml,82.46],[-40,ml,82.46],[-40,mt,82.46],[-42.89,mt,82.46],C.glass);
  for(const yy of [ml-.07,my+6.95,mt]){
    B(-42.97,-42.84,yy,yy+.07,69.45,82.55,C.white);
    for(const v of [69.45,82.46])B(-42.97,-39.94,yy,yy+.07,v,v+.09,C.white);
  }
  const mn=detail?12:6;for(let i=0;i<=mn;i++){const v=69.54+(82.46-69.54)*i/mn;B(-42.97,-42.84,ml-.07,mt+.07,v-.03,v+.03,C.white);}
  for(const v of [69.45,82.46])for(const u of [-41.92,-40.97,-40.02])B(u-.035,u+.035,ml-.07,mt+.07,v,v+.09,C.white);
  hip(-43.7,-39.6,68.8,83.2,my+7.85,1.8);sign(-43,my+1.05,64,2,1.9,my);
  link(-17,-4.5,64,67,my+.02,H(65.5)+.035);
  landmarks.push({id:'moegi',label:KITANO_LABELS[2],position:P(-32,my,77),entrance:P(-32,my,64)});

  // 風見鶏の館：赤れんが、半地下の石台、石造ポーチ、木骨の二階と角塔。
  const ky=H(84)+.55;garden(-17,15,85,113,ky,103.5);const kh=house(-2,101,18,13,ky+.3,8.3,C.brick);
  panel(kh.a,kh.b,ky+4.4,ky+8.6,kh.c-.025,C.white);
  for(const u of [-10.3,-6.3,-2.3,1.7,5.7])B(u,u+.16,ky+4.4,ky+8.6,kh.c-.08,kh.c+.06,C.wood);
  for(const u of [-8,-4,0,4])window(u,ky+5.1,kh.c-.13,1.05,1.9,false,C.wood);
  for(const yy of [ky+4.45,ky+6.28,ky+8.42])panel(kh.a,kh.b,yy,yy+.13,kh.c-.12,C.wood);
  // 公式の外観写真では塔の最上階のみ白い充填と木骨、下二層は赤れんが。
  B(3.1,7.4,ky+.3,ky+8.15,93,97.8,C.brick);B(3.1,7.4,ky+8.15,ky+11.6,93,97.8,C.white);
  for(const yy of [ky+8.12,ky+11.46])B(3.04,7.46,yy,yy+.14,92.94,97.86,C.wood);
  for(const u of [3.08,7.26])for(const v of [92.94,97.66])B(u,u+.14,ky+8.15,ky+11.6,v,v+.20,C.wood);
  for(const v of [92.94,97.72])B(5.17,5.31,ky+8.15,ky+11.6,v,v+.14,C.wood);
  for(const yy of [ky+1.2,ky+4.75,ky+8.5])for(const u of [4.2,6.25])window(u,yy,92.94,.7,1.65,false,yy>ky+8?C.wood:C.white);
  const apex=[5.25,ky+16.2,95.4];for(const p of [[[3,ky+11.6,92.9],[7.5,ky+11.6,92.9]],[[7.5,ky+11.6,92.9],[7.5,ky+11.6,97.9]],[[7.5,ky+11.6,97.9],[3,ky+11.6,97.9]],[[3,ky+11.6,97.9],[3,ky+11.6,92.9]]])F(p[0],p[1],apex,apex,C.roof);
  beam(apex,[5.25,ky+17.15,95.4],.024,C.iron);beam([4.62,ky+16.8,95.4],[5.9,ky+16.8,95.4],.024,C.iron);
  // 雄鶏の尾・胴・首。遠景でも塔上に小さな鳥のシルエットを残す。
  panel(5.02,5.46,ky+17.1,ky+17.34,95.4,C.iron);F([5.05,ky+17.12,95.4],[4.63,ky+17.5,95.4],[4.73,ky+17.02,95.4],[4.73,ky+17.02,95.4],C.iron);B(5.36,5.49,ky+17.25,ky+17.58,95.35,95.45,C.iron);
  B(-9,-4.5,ky+.1,ky+.35,91.5,94.7,C.stone);B(-9,-8.4,ky+.35,ky+2.65,91.5,94.7,C.stone);B(-5.1,-4.5,ky+.35,ky+2.65,91.5,94.7,C.stone);
  B(-9,-4.5,ky+2.25,ky+2.65,91.5,94.7,C.stone);panel(-7.65,-5.85,ky+.3,ky+2.2,94.64,C.wood);hip(-9.2,-4.3,91.2,95,ky+2.7,1.5);
  for(const u of [-8.75,-4.75])beam([u,ky,91.5],[u,ky+2.7,91.5],.2,C.stone,6);
  B(-9.1,-8.3,ky+8.6,ky+11,102,103,C.brick);B(-5.1,-4.3,ky+8.6,ky+11,103,104,C.brick);
  sign(-12,ky+1.05,85,1,2.1,ky);steps(-2,2.6,82,85,H(70)+.04,ky);
  landmarks.push({id:'kazamidori',label:KITANO_LABELS[1],position:P(-2,ky,101),entrance:P(-2,ky,85)});

  // うろこの家：低い横棟と丸い張出塔、丸屋根、石片の帯。尖った円錐にしない。
  const uy=12.5;garden(32,55.8,85,114,uy);const uh=house(43,103,19,12,uy+.2,7.9,C.slate,false,'gable');
  archedWindow(43,uh.y+uh.h+.52,uh.c-.57,1.25,1.45);
  for(const u of [uh.a-.45,uh.b+.45])beam([u,uh.y+uh.h,uh.c-.64],[43,uh.y+uh.h+3.2,uh.c-.64],.06,C.roof);
  tower(36.8,96.4,1.6,uy+.25,9);tower(49.5,96.4,1.6,uy+.25,8.5);
  if(detail)for(let yy=uy+.35;yy<uy+8;yy+=.36)for(let u=34;u<52;u+=.8){if([uy+1.35,uy+4.7].some(v=>yy>v&&yy<v+1.85))continue;slateScale(u,yy,96.96,.73,.29,tint(C.slate,(Math.floor(u/.8)+Math.floor(yy/.36))%3===0?1.19:.8));}
  sign(34.4,uy+1.05,85,3,1.8,uy);path(16,44.3,78,81,H(70)+.04);steps(43,2.6,81,85,H(70)+.04,uy);
  landmarks.push({id:'uroko',label:KITANO_LABELS[3],position:P(43,uy,103),entrance:P(43,uy,85)});

  // 風見鶏の東隣の石鳥居。長い石階は庭園から独立し、中央を塞がない。
  const sy=H(70)+.04;path(16,23,76,81,sy);steps(21,3.7,81,119,sy,18.2);
  for(const u of [18.35,23.65])beam([u,sy,80],[u,sy+4.75,80],.24,C.stone,8);
  beam([17.4,sy+4.5,80],[24.6,sy+4.5,80],.22,C.stone,4);beam([17.1,sy+4.88,80],[24.9,sy+4.88,80],.19,C.stone,4);
  beam([18,sy+3.5,80],[24,sy+3.5,80],.17,C.stone,4);sign(21,sy+4.03,79.75,5,2.1);
  for(const [u,v]of [[16.2,82],[25.8,82],[16.2,119],[23.1,119]]){const y=v<100?sy:18.2;B(u-.38,u+.38,y,y+.25,v-.38,v+.38,C.stone);beam([u,y+.25,v],[u,y+1.5,v],.14,C.stone,6);B(u-.35,u+.35,y+1.5,y+2.1,v-.35,v+.35,C.stone);hip(u-.53,u+.53,v-.53,v+.53,y+2.1,.45,C.stone);}
  path(16,23,119,137,18.2);house(19,132,9,8,18.45,4.1,C.wood);hip(13.5,24.5,127,137,22.5,2.6,C.roof);
  for(const u of [16,22])beam([u,18.2,126.5],[u,22.2,126.5],.15,C.wood,6);
  B(18.4,19.6,18.2,18.9,126,126.8,C.wood);sign(16.2,19.3,126.47,5,1.7,18.2);
  landmarks.push({id:'tenman',label:KITANO_LABELS[5],position:P(19,18.2,132),entrance:P(21,18.2,119)});
  for(const [u,y,v]of [[-45,my,86],[-14,ky,111]])tree(u,y,v,detail?.7:.5);
  // 上り坂は上段の洋館・細い横丁・眺望庭園まで連続する。建物寸法を引き伸ばさない。
  const upper=[[-22,151,14,12,7.2,C.white],[44,153,16,12,8.2,C.green],[-34,176,19,13,7.5,C.white],[28,191,14,10,9.1,C.slate],
    [-20,211,12,14,6.9,C.green],[27,230,18,13,7.8,C.white],[-30,252,18,13,8.3,C.white],[21,270,14,11,7.2,C.green]];
  for(const [i,[cx,cz,w,d,h,col]]of upper.entries()){
    if(cz+d/2+3>length)continue;
    const front=cz-d/2-4,y=H(front)+.2,road=roadX(front),edge=cx<road?cx+w/2+3:cx-w/2-3;
    garden(cx-w/2-3,cx+w/2+3,front,cz+d/2+3,y);const hh=house(cx,cz,w,d,y+.18,h,col,i%3!==0,i%3===2?'gable':'hip');
    const ry=H(front+1.25)+.035;link(Math.min(edge,road),Math.max(edge,road),front,front+2.5,cx<road?y+.02:ry,cx<road?ry:y+.02);
    lanes.push({v:front+1.25,road,ry,edge,cx,y:y+.02});
    if(i%3===0){for(const yy of [y+.25,y+3.85]){B(cx-w/2,cx+w/2,yy,yy+.15,hh.c-2.5,hh.c,C.white);rail([cx-w/2,yy,hh.c-2.35],[cx+w/2,yy,hh.c-2.35],C.white);}
      for(const u of [cx-w/2+.4,cx,cx+w/2-.4])beam([u,y+.25,hh.c-2.3],[u,y+7.3,hh.c-2.3],.075,C.white,6);
    }else if(i%3===1)bay(cx,hh.c,y+.18,3.2,.85);
    else{B(hh.a+1,hh.a+1.7,y+h,y+h+2.1,cz,cz+.8,C.brick);hip(cx-2,cx+2,hh.c-2,hh.c+.2,y+2.8,1.1);}
  }
  const viewX=roadX(length);path(viewX-12,viewX+12,length-7,length-.12,H(length-7)+.07);
  for(const side of [-1,1])rail([viewX+side*12,H(length-7)+.07,length-7],[viewX+side*12,H(length-7)+.07,length-.12],C.iron);
  // 鋳鉄街灯・道標と縁にたまった秋葉。発光する電球も追加の光源もない。
  for(const [u,v]of [[-5.2,8],[5.2,34],[-5.2,57],[14,78],[-16,84],[29,84],[roadX(145)+5.3,145],[-5.3,185],[5.3,224],[-5.3,259]]){if(v>length)continue;const y=H(v);beam([u,y,v],[u,y+3.7,v],.055,C.iron,6);B(u-.16,u+.16,y+3.4,y+3.9,v-.16,v+.16,C.white);hip(u-.23,u+.23,v-.23,v+.23,y+3.9,.24,C.iron);}
  sign(5.4,1.3,2,0,2.2,0);sign(-5.3,1.9,5,4,1.6,H(5));sign(-5.3,H(54)+1.2,54,6,1.6,H(54));
  if(detail)for(let i=0;i<120;i++){const v=8+(i*13.17)%(length-15),u=roadX(v)+(i%2?1:-1)*(3.5+(i%5)*.15),y=H(v)+.055,w=.14+(i%4)*.05;
    F([u,y+.015,v-.18],[u+w,y,v],[u,y+.015,v+.18],[u-w,y,v],i%3?C.gold:C.red);
  }
  const planting=detail?gardenPlanting({face:(...args)=>{out.face(...args);triangles+=2;}},{sites:gardenSites}):{plants:0,triangles:0};
  const routes={walk:[[0,.035,0],[0,H(60)+.035,60],[0,sy,70],[0,sy,81],[-2,ky,85]],
    moegi:[[0,.035,0],[0,H(64)+.035,64],[-17,my+.02,65.5],[-32,my+.015,64.5]],
    kazamidori:[[0,.035,0],[0,H(60)+.035,60],[0,sy,81],[-2,ky,85]],
    uroko:[[0,.035,0],[0,H(60)+.035,60],[0,sy,79],[43,sy,79],[43,uy,85]],
    tenman:[[0,.035,0],[0,H(60)+.035,60],[0,sy,78],[21,sy,79],[21,18.2,119],[21,18.2,124]]};
  routes.walk=[[0,.035,0],...[56,70,84,112,136,164,196,224,252,length].filter(v=>v<=length).map(v=>[roadX(v),H(v)+.035,v])];
  for(const [i,l]of lanes.entries())routes['villa_'+(i+1)]=[[0,.035,0],...[70,84,136,164].filter(v=>v<l.v).map(v=>[roadX(v),H(v)+.035,v]),[roadX(l.v),H(l.v)+.035,l.v],[l.road,l.ry,l.v],[l.edge,l.y,l.v],[l.cx,l.y,l.v]];
  for(const k of Object.keys(routes))routes[k]=routes[k].map(p=>P(...p));
  const heightAt=(wx,wz)=>{let top=ground;for(const q of floors)if(wx>=q.x0&&wx<=q.x1&&wz>=q.z0&&wz<=q.z1){const t=q.ramp?(q.ramp.axis==='x'?(wx-q.x0)/(q.x1-q.x0):(wz-q.z0)/(q.z1-q.z0)):1;const y=q.ramp?q.y0+(q.y1-q.y0)*(q.ramp.dir>0?t:1-t):q.y1;top=Math.max(top,y);}return top;};
  return {bounds:bounds(-56,56,0,H(length)+20,0,length),landmarks,routes,treePoints,gardenSites,planting,heightAt,houses,solids,floors,triangles,detail};
}

export function kitanoBuilder(b,options={}) {
  if(!b.B.kitanoSigns)throw new Error('Add mats.kitanoSigns = kitanoSignMaterial() before creating Builder');
  const mat=col=>col[4]===9?'kitanoGarden':col[4]===4?(b.B.portGlass?'portGlass':'glass'):col[4]===1?'concrete':col[4]===2?'metal':col[4]===3?'rust':col[4]===7?'brick':col[4]===6&&b.B.kitanoHeritage?'kitanoHeritage':b.B.landmarkPaint?'landmarkPaint':b.B.painted?'painted':'metal';
  return kitanoScenery({
    face:(a,c,d,e,col)=>b.B[mat(col)].quad(a,c,d,e,normal(a,c,d),[1,1,1,1],null,col.slice(0,3)),
    sign:(pts,id)=>b.B.kitanoSigns.quad(...pts,normal(...pts),[1,1,1,1],kitanoSignUV(id)),
    solid:q=>b.solid.add({...q,mat:'concrete'}),floor:q=>b.solid.add({...q,mat:'concrete'}),
  },options);
}
