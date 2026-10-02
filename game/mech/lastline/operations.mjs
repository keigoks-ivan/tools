// 任務使用模擬時間；離開操作位置、受到命中或放開按鍵就中斷本次操作。
export class Operation {
  constructor(def) {
    this.def=def; this.kind=def.kind; this.index=0; this.progress=0; this.time=0; this.done=false;
    this.pos=def.kind==='escort'?[...def.route[0]]:null;
  }
  get point() { return this.kind==='escort'?this.pos:this.def.points[this.index]; }
  get fraction() { return this.kind==='escort'?this.index/(this.def.route.length-1):this.progress/(this.point?.seconds||1); }
  step(dt,{player,held=false,hurt=false,threat=false}) {
    if(this.done||!Number.isFinite(dt)||dt<=0)return;
    dt=Math.min(dt,.1);this.time+=dt;
    const p=this.point,near=Math.hypot(player[0]-p[0],player[1]-p[1])<(this.def.radius||(this.kind==='escort'?14:2));
    if(this.kind==='escort') {
      if(!near||threat)return;
      const next=this.def.route[this.index+1],dx=next[0]-this.pos[0],dz=next[1]-this.pos[1],d=Math.hypot(dx,dz),move=dt*(this.def.speed||2.4);
      if(d<=move){this.pos=[...next];this.index++;this.done=this.index===this.def.route.length-1;}
      else {this.pos[0]+=dx/d*move;this.pos[1]+=dz/d*move;}
      return;
    }
    const working=near&&!hurt&&(this.kind==='defend'||held);
    if(!working){if(this.kind!=='defend')this.progress=0;return;}
    this.progress+=dt;
    if(this.progress+1e-6>=p.seconds){this.progress=0;this.index++;this.done=this.index===this.def.points.length;}
  }
  snapshot(){return {kind:this.kind,index:this.index,progress:this.progress,time:this.time,pos:this.pos&&[...this.pos],done:this.done};}
  restore(s){
    const count=this.kind==='escort'?this.def.route.length-1:this.def.points.length;
    if(!s||s.kind!==this.kind||!Number.isInteger(s.index)||s.index<0||s.index>count||!Number.isFinite(s.time)||s.time<0||!Number.isFinite(s.progress)||s.progress<0||s.done!==(s.index===count))return false;
    if(this.kind==='escort') {
      if(!Array.isArray(s.pos)||s.pos.length!==2||!s.pos.every(Number.isFinite))return false;
      const a=this.def.route[s.index],b=this.def.route[Math.min(s.index+1,count)];
      if(s.pos.some((n,i)=>n<Math.min(a[i],b[i])-.01||n>Math.max(a[i],b[i])+.01))return false;
    } else if(s.pos!==null||s.progress>=(this.def.points[s.index]?.seconds||1))return false;
    Object.assign(this,{index:s.index,progress:s.progress,time:s.time,pos:s.pos&&[...s.pos],done:s.done});return true;
  }
}
