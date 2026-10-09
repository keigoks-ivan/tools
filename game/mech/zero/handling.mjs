// Visual handling only. No camera rotation, accuracy, damage or weapon cadence changes.
export const HANDLING_PROFILES=Object.freeze({
  classic:Object.freeze({adsIn:.2,adsOut:.16,swapOut:.24,swapDuration:.58,swapDrop:.35,swapTilt:.9,sprintIn:8,sprintOut:8}),
  responsive:Object.freeze({adsIn:.14,adsOut:.12,swapOut:.16,swapDuration:.4,swapDrop:.26,swapTilt:.65,sprintIn:14,sprintOut:18,
    yawLimit:.06,pitchLimit:.045,turnGain:.018,turnResponse:30,turnReturn:24,adsTurnScale:.025,recoilResponse:27,recoilBackLimit:.055,recoilPitchLimit:.075}),
});
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const FIRE={rifle:{back:.036,pitch:.043,roll:.003},pistol:{back:.025,pitch:.032,roll:.004},smg:{back:.017,pitch:.022,roll:.003}};

// Closed-form critically damped spring: stable and almost identical at 30/60/120 FPS.
function spring(axis,target,response,dt){
  const offset=axis.x-target,c=axis.v+response*offset,e=Math.exp(-response*dt);
  axis.x=target+(offset+c*dt)*e;axis.v=(axis.v-response*c*dt)*e;
}
export class ResponsiveHandling {
  constructor(){this.reset();}
  reset(){
    this.yaw={x:0,v:0};this.pitch={x:0,v:0};this.back={x:0,v:0};this.lift={x:0,v:0};this.roll={x:0,v:0};this.moveWeight=0;this.shotSide=1;
  }
  fired(kind){
    const p=HANDLING_PROFILES.responsive,k=FIRE[kind]||FIRE.smg;
    this.back.x=Math.min(p.recoilBackLimit,this.back.x+k.back);this.back.v=0;
    this.lift.x=Math.min(p.recoilPitchLimit,this.lift.x+k.pitch);this.lift.v=0;
    this.shotSide*=-1;this.roll.x=this.shotSide*k.roll;this.roll.v=0;
  }
  update(dt,{x=0,y=0,move=0,grounded=true}={}){
    dt=clamp(Number.isFinite(dt)?dt:0,0,.1);if(!dt)return;
    const p=HANDLING_PROFILES.responsive;
    const yaw=clamp(-(Number.isFinite(x)?x:0)/dt*p.turnGain,-p.yawLimit,p.yawLimit),pitch=clamp((Number.isFinite(y)?y:0)/dt*p.turnGain,-p.pitchLimit,p.pitchLimit);
    spring(this.yaw,yaw,x?p.turnResponse:p.turnReturn,dt);spring(this.pitch,pitch,y?p.turnResponse:p.turnReturn,dt);
    spring(this.back,0,p.recoilResponse,dt);spring(this.lift,0,p.recoilResponse,dt);spring(this.roll,0,p.recoilResponse,dt);
    const target=grounded?clamp(Number.isFinite(move)?move:0,0,1):0;
    this.moveWeight+=(target-this.moveWeight)*(1-Math.exp(-dt*(target>this.moveWeight?18:13)));
  }
  pose(ads=0,busy=false){
    const p=HANDLING_PROFILES.responsive,u=clamp(ads,0,1),ease=u*u*(3-2*u),turn=1-ease*(1-p.adsTurnScale),reload=busy?.35:1;
    return {yaw:this.yaw.x*turn*reload,pitch:this.pitch.x*turn*reload,side:this.yaw.x*.16*turn*reload,vertical:this.pitch.x*.12*turn*reload,
      back:this.back.x*(1-ease*.65),lift:this.lift.x*(1-ease*.92),roll:this.roll.x*(1-ease*.9),move:this.moveWeight};
  }
}
