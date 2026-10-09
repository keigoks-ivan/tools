import * as THREE from 'three';
import { HUD } from '../mech/zero/hud.js';

const clamp=THREE.MathUtils.clamp;
const CY='#7ff3ff',AM='#ffb347',RD='#ff4a4a',ARMOR='#9ec3dc';
const NAMES={line:['步槍兵','RIFLEMAN'],flank:['突擊兵','ASSAULT'],support:['火力支援兵','SUPPORT'],sniper:['狙擊手','SNIPER'],heavy:['重裝兵','HEAVY']};
const RANK={hit:0,armor:1,head:2,kill:3};
const label=(e,language)=>(NAMES[e.type]||NAMES.line)[language==='zh'?0:1];
const words=(language,zh,en)=>language==='zh'?zh:en;

export class InfantryHUD extends HUD {
  resetBattle(){this.hit=0;this.mk='hit';this.feedback=null;this.dmg.length=0;this.clearAim=0;}
  hurt(angle,kind='health'){super.hurt(angle);this.dmg[this.dmg.length-1].kind=kind==='shield'?'shield':'health';}
  marker(kind){
    if(!Object.hasOwn(RANK,kind))kind='hit';
    if(this.hit>.12&&RANK[this.mk]>RANK[kind])return;
    super.marker(kind);
    const T=kind==='kill'?.65:kind==='head'?.5:kind==='armor'?.45:.26;
    this.feedback={kind,t:T,T};
  }
  // Use the actual animated head/chest, never the enemy's own "sees player" flag.
  // Combat owns barT; it expires even behind cover. Death age drives the short empty-bar fade.
  _enemyContacts(dt,W,H,G){
    const result=[],origin=G.camera?.position||G.player.eye,R=Math.min(W,H)*.46;
    for(const e of G.enemies){
      if(e.friendly||!e.pos||!(e.hp0>0))continue;
      const barTime=e.dead?Math.max(0,.4-(e.deathAge||0)):e.barT||0;
      const hp=clamp(e.hp/e.hp0,0,1);e.barG=Math.max(hp,(e.barG??1)-dt*.7);
      const head=new THREE.Vector3(),chest=new THREE.Vector3();
      if(e.s?.headPos)e.s.headPos(head);else head.copy(e.pos).y+=1.65;
      if(e.s?.chestPos)e.s.chestPos(chest);else chest.copy(e.pos).y+=1.05;
      const anchor=head.clone();anchor.y+=.34*(e.s?.root?.scale?.y||1);
      const v=anchor.clone().project(this.cam),sx=(v.x*.5+.5)*W,sy=(-v.y*.5+.5)*H;
      const onScreen=v.z>=-1&&v.z<=1&&Math.abs(v.x)<=.98&&Math.abs(v.y)<=.98;
      const inScope=!G.vm.scoped||Math.hypot(sx-W/2,sy-H/2)<R-8;
      const physical=e.s?.root?.visible!==false&&!!G.map.solid?.sees&&(G.map.solid.sees(origin,head)||G.map.solid.sees(origin,chest));
      const cv=chest.clone().project(this.cam),aimed=cv.z>=-1&&cv.z<=1&&Math.hypot(cv.x*W/2,cv.y*H/2)<Math.min(W,H)*.075;
      result.push({e,hp,barTime,sx,sy,distance:G.player.pos.distanceTo(e.pos),visible:onScreen&&inScope&&physical,physical,aimed,head});
    }
    return result;
  }
  _enemyBars(W,H,contacts,language){
    const x=this.x;
    x.save();x.shadowColor='rgba(0,0,0,.9)';x.shadowBlur=4;x.textAlign='center';
    for(const c of contacts){
      const {e,hp,sx,sy,distance}=c;
      if(!c.visible||(e.dead&&c.barTime<=0))continue;
      const bw=clamp(82-distance*.45,48,76),bh=5,armor=!!e.T?.armor,recent=c.barTime>0;
      x.globalAlpha=e.dead?clamp(c.barTime/.4,0,1):recent||c.aimed?1:.8;
      x.fillStyle='rgba(0,0,0,.65)';x.fillRect(sx-bw/2-2,sy-2,bw+4,bh+4);
      x.fillStyle='rgba(255,214,130,.95)';x.fillRect(sx-bw/2,sy,bw*e.barG,bh);
      x.fillStyle=hp>.5?'#eef6f8':RD;x.fillRect(sx-bw/2,sy,bw*hp,bh);
      x.strokeStyle=armor?ARMOR:'rgba(222,239,242,.32)';x.lineWidth=armor?1.5:1;
      x.strokeRect(sx-bw/2-(armor?3:1),sy-(armor?3:1),bw+(armor?6:2),bh+(armor?6:2));
      x.fillStyle=e.dead?RD:armor?ARMOR:'#d4e1e3';x.font='600 10px Rajdhani,"Noto Sans TC",sans-serif';
      x.fillText(e.dead?words(language,'擊倒','DOWN'):label(e,language)+' · '+Math.round(distance)+' m',sx,sy-9);
      if(!e.dead&&(recent||c.aimed)){x.font='600 10px Rajdhani,sans-serif';x.fillStyle='#b5c6ca';x.fillText(Math.ceil(Math.max(0,e.hp))+' / '+Math.ceil(e.hp0),sx,sy+18);}
    }
    x.restore();
  }
  _aim(W,H,G){
    const x=this.x,P=G.player,vm=G.vm,cx=W/2,cy=H/2;
    this.clearAim=vm.cur==='smg'&&vm.ads>.5?Math.min(W,H)*.09:0;
    if(vm.scoped){this._scope(W,H,{...G,scopeRange:0});return;}
    if(P.dead)return;
    const gap=(vm.spreadNow||0)/Math.tan(THREE.MathUtils.degToRad(G.camera.fov/2))*(H/2)+4+(vm.kick?.z||0)*2;
    const alpha=1-(vm.ads||0)*(vm.cur==='smg'?1:.85)-(P.sprintK||0);
    x.save();x.strokeStyle='rgba(230,250,255,.9)';x.lineWidth=1.5;x.shadowBlur=3;
    if(alpha>.05){x.globalAlpha=clamp(alpha,0,1);x.beginPath();for(const [dx,dy]of [[1,0],[-1,0],[0,1],[0,-1]]){x.moveTo(cx+dx*gap,cy+dy*gap);x.lineTo(cx+dx*(gap+8),cy+dy*(gap+8));}x.stroke();x.fillStyle='#e6faff';x.fillRect(cx-1,cy-1,2,2);}
    if(vm.cur==='smg'&&vm.ads>.5&&!vm.busy&&(P.sprintK||0)<.35){x.globalAlpha=clamp((vm.ads-.5)*2,0,1);x.beginPath();x.arc(cx,cy,2.2,0,Math.PI*2);x.fillStyle='rgba(18,13,9,.85)';x.fill();x.beginPath();x.arc(cx,cy,1.2,0,Math.PI*2);x.fillStyle='#ffb568';x.fill();}
    else if(vm.cur==='pistol'&&vm.ads>.5){x.globalAlpha=1;x.fillStyle=CY;x.fillRect(cx-1.5,cy-1.5,3,3);}
    x.restore();
  }
  _combatFeedback(dt,W,H,language){
    const x=this.x,cx=W/2,cy=H/2;
    x.save();
    if(this.hit>0){
      const K=this.mk||'hit',k=clamp(this.hit/(K==='kill'?.5:.32),0,1),pop=1-k;
      const r=(K==='kill'?11:K==='head'?10:8)+pop*6,len=K==='kill'?12:K==='armor'?6:9,lw=K==='kill'?3.5:2.6;
      x.globalAlpha=Math.min(1,k*1.8);x.lineCap='round';x.beginPath();
      for(const [sx,sy]of [[1,1],[-1,1],[1,-1],[-1,-1]]){x.moveTo(cx+sx*r,cy+sy*r);x.lineTo(cx+sx*(r+len),cy+sy*(r+len));}
      x.strokeStyle='rgba(0,0,0,.55)';x.lineWidth=lw+2.5;x.stroke();x.strokeStyle=K==='kill'?RD:K==='head'?AM:K==='armor'?ARMOR:'#fff';x.lineWidth=lw;x.stroke();
      this.hit=Math.max(0,this.hit-dt);
    }
    const f=this.feedback;
    if(f&&f.t>0){
      const text={hit:['命中','HIT'],armor:['裝甲命中','ARMOR HIT'],head:['爆頭命中','HEADSHOT'],kill:['擊殺確認','KILL CONFIRMED']}[f.kind][language==='zh'?0:1];
      x.globalAlpha=clamp(f.t/.18,0,1);x.textAlign='center';x.font='600 11px Rajdhani,"Noto Sans TC",sans-serif';
      const width=x.measureText(text).width+18;x.fillStyle='rgba(5,12,16,.58)';x.fillRect(cx-width/2,cy+35,width,21);
      x.fillStyle=f.kind==='kill'?RD:f.kind==='head'?AM:f.kind==='armor'?ARMOR:'#edf6f8';x.fillText(text,cx,cy+50);f.t=Math.max(0,f.t-dt);
    }
    x.globalAlpha=1;x.lineCap='butt';
    for(let i=this.dmg.length-1;i>=0;i--){const o=this.dmg[i];o.t-=dt;if(o.t<=0){this.dmg.splice(i,1);continue;}const a=o.a-Math.PI/2;x.beginPath();x.arc(cx,cy,Math.min(W,H)*.18,a-.35,a+.35);x.strokeStyle='rgba(0,0,0,.5)';x.lineWidth=8;x.stroke();x.strokeStyle=(o.kind==='shield'?'rgba(127,243,255,':'rgba(255,60,50,')+(clamp(o.t,0,1)*.85)+')';x.lineWidth=5;x.stroke();}
    x.restore();
  }
  _cleanupEnemies(G){const alive=G.enemies.filter(e=>!e.dead&&!e.friendly);return G.cleanup&&alive.length>0&&alive.length<=2&&!(G.mission.pending>0)?alive:[];}
  _cleanupInfo(W,H,G,contacts,language){
    const targets=this._cleanupEnemies(G);if(!targets.length)return;
    const x=this.x,pad=W<650?16:30,compact=W<650,width=compact?Math.min(W-pad*2,300):230;
    let y=compact?(G.mission.mode==='defend'?(H>450?178:145):(H>450?145:122)):79;
    const left=compact?pad:W-pad-width;
    x.save();x.textAlign='left';x.font='600 11px Rajdhani,"Noto Sans TC",sans-serif';
    targets.forEach((e,i)=>{
      const c=contacts.find(c=>c.e===e),dy=e.pos.y-G.player.pos.y,dist=Math.round(G.player.pos.distanceTo(e.pos));
      const floor=Math.abs(dy)>1.5?(dy>0?'▲ +':'▼ ')+Math.round(dy)+' m':words(language,'同一高度','SAME LEVEL');
      const seen=c?.visible,visibility=seen?words(language,'目視確認','IN SIGHT'):words(language,'循定位接近','TRACKED');
      x.fillStyle='rgba(8,18,25,.83)';x.fillRect(left,y,width,compact?36:43);x.fillStyle=RD;x.fillRect(left,y,2,compact?36:43);
      x.fillStyle='#ffc2b7';x.fillText(words(language,'殘敵 ','LAST ')+(i+1)+' · '+label(e,language),left+10,y+13);
      x.font='500 10px Rajdhani,"Noto Sans TC",sans-serif';x.fillStyle='#b9c9cd';x.fillText(dist+' m · '+floor+' · '+visibility,left+10,y+(compact?28:31));
      x.font='600 11px Rajdhani,"Noto Sans TC",sans-serif';y+=compact?40:48;
    });
    x.restore();
    if(!G.vm.scoped)targets.forEach((e,i)=>{const p=e.pos.clone();p.y+=1.65;const dy=e.pos.y-G.player.pos.y;this._pin(W,H,p,G.player.pos.distanceTo(e.pos),RD,9,true,words(language,'殘敵 ','LAST ')+(i+1)+' · '+label(e,language)+(Math.abs(dy)>1.5?' '+(dy>0?'▲ +':'▼ ')+Math.round(dy)+' m':''));});
  }
  _infantryRadar(W,H,G,contacts,language){
    if(W<=300||H<=280)return;
    const x=this.x,P=G.player,pad=W<650?16:30,r=H<450?30:43,xx=pad+r,yy=H<450?H-145:H-185,targets=this._cleanupEnemies(G),tracked=new Set(targets);
    x.save();x.translate(xx,yy);x.fillStyle='rgba(5,15,20,.78)';x.strokeStyle='rgba(127,243,255,.4)';x.lineWidth=1;x.beginPath();x.arc(0,0,r,0,Math.PI*2);x.fill();x.stroke();
    x.strokeStyle='rgba(127,243,255,.15)';x.beginPath();x.arc(0,0,r*.5,0,Math.PI*2);x.moveTo(-r,0);x.lineTo(r,0);x.moveTo(0,-r);x.lineTo(0,r);x.stroke();
    const dot=(p,col,size=2.5)=>{let dx=-(p.x-P.pos.x)*r/65,dz=-(p.z-P.pos.z)*r/65;const len=Math.hypot(dx,dz);if(len>r-size-3){dx*=(r-size-3)/len;dz*=(r-size-3)/len;}x.fillStyle=col;x.beginPath();x.arc(dx,dz,size,0,Math.PI*2);x.fill();return{dx,dz};};
    for(const c of contacts)if(!c.e.dead&&(c.visible||tracked.has(c.e))){const p=dot(c.e.pos,RD,tracked.has(c.e)?4:2.5),dy=c.e.pos.y-P.pos.y;if(tracked.has(c.e)){x.textAlign='center';x.font='600 9px Rajdhani,sans-serif';x.fillStyle='#ffd9d1';x.fillText(String(targets.indexOf(c.e)+1),p.dx,p.dz-7);if(Math.abs(dy)>1.5)x.fillText(dy>0?'▲':'▼',p.dx+8,p.dz);}}
    for(const a of G.allies)if(!a.dead)dot(a.pos,CY);dot(G.mission.target,'#d7b27b',4);
    x.save();x.rotate(-P.yaw);x.fillStyle='#eef6f8';x.beginPath();x.moveTo(0,-5);x.lineTo(4,4);x.lineTo(-4,4);x.closePath();x.fill();x.restore();
    x.textAlign='center';x.font='600 9px Rajdhani,"Noto Sans TC",sans-serif';x.fillStyle=targets.length?'#ffc2b7':'#a9c7cf';x.fillText(targets.length?words(language,'殘敵定位 ','TRACKING ')+targets.length:words(language,'目視接觸','VISUAL CONTACT'),0,-r-9);x.fillStyle='#a1b9c0';x.fillText('65 m · N ↑',0,r+14);x.restore();
  }
  drawBattle(dt,G,language){
    const x=this.x,d=this.d,W=this.c.width/d,H=this.c.height/d,cx=W/2,cy=H/2,P=G.player,vm=G.vm,M=G.mission;
    const word=(zh,en)=>words(language,zh,en),contacts=this._enemyContacts(dt,W,H,G);
    x.setTransform(d,0,0,d,0,0);x.clearRect(0,0,W,H);x.save();x.shadowColor='#000';x.shadowBlur=4;
    this._aim(W,H,G);this._enemyBars(W,H,contacts,language);
    if(G.shieldHurt>0){const g=x.createRadialGradient(cx,cy,H*.27,cx,cy,H*.75);g.addColorStop(0,'rgba(70,190,220,0)');g.addColorStop(1,'rgba(70,190,220,'+(clamp(G.shieldHurt,0,1)*.27)+')');x.fillStyle=g;x.fillRect(0,0,W,H);}
    if(G.hurt>0){const g=x.createRadialGradient(cx,cy,H*.2,cx,cy,H*.7);g.addColorStop(0,'#e6412d00');g.addColorStop(1,'rgba(210,40,25,'+(G.hurt*.35)+')');x.fillStyle=g;x.fillRect(0,0,W,H);}
    this._combatFeedback(dt,W,H,language);
    if(!vm.scoped){const target=M.target,p=new THREE.Vector3(target.x,G.map.ground(target.x,target.z)+1.5,target.z);this._pin(W,H,p,P.pos.distanceTo(p),'#d7b27b',11,true,target.name[language]);}
    this._cleanupInfo(W,H,G,contacts,language);
    const pad=W<650?16:30;
    x.fillStyle='#d7b27b';x.font='600 12px Rajdhani,sans-serif';x.fillText(M.scenario.code+' / '+word(M.mode==='defend'?'守衛戰':'衝鋒戰',M.mode==='defend'?'DEFENSE':'ASSAULT'),pad,34);
    x.fillStyle='#eff1e9';x.font='500 15px "Noto Sans TC",sans-serif';x.fillText(M.target.name[language],pad,59);
    x.font='500 12px "Noto Sans TC",sans-serif';x.fillStyle='#bec9c5';
    const alive=G.enemies.filter(e=>!e.dead).length;
    const phase=M.mode==='defend'?M.phase==='prepare'?word('整備 '+Math.ceil(Math.max(0,M.delay))+' 秒 · '+M.wave+'/4 波完成','PREPARE '+Math.ceil(Math.max(0,M.delay))+'s · '+M.wave+'/4 cleared'):word('第 '+M.wave+'/4 波 · 殘敵 '+alive+' · 增援 '+M.pending,'WAVE '+M.wave+'/4 · '+alive+' hostile · '+M.pending+' incoming'):word('據點 '+(M.objective+1)+'/3 · 敵軍 '+alive+' · 增援 '+M.pending,'SECTOR '+(M.objective+1)+'/3 · '+alive+' hostile · '+M.pending+' incoming');
    x.fillText(phase,pad,82);if(this._cleanupEnemies(G).length){x.fillStyle='#ff9e84';x.fillText(word('殘敵即時定位已開啟','LAST ENEMIES TRACKED'),pad,103);}
    if(M.mode==='defend'){this._bar(pad,114,Math.min(210,W*.35),5,M.integrity/100,'#d7b27b','#ffffff22');x.font='500 10px "Noto Sans TC"';x.fillStyle='#d7b27b';x.fillText(word('防線完整 '+Math.ceil(M.integrity)+'%','LINE INTEGRITY '+Math.ceil(M.integrity)+'%'),pad,135);}
    if(H>450){x.fillStyle=CY;x.font='500 10px "Noto Sans TC"';const squad={follow:word('跟隨','FOLLOW'),hold:word('原地掩護','HOLD'),advance:word('推進','ADVANCE')}[G.squadCommand?.mode||'follow'];x.fillText(word('小隊 '+G.allies.filter(a=>!a.dead).length+'/3 · '+squad+' · F 指令','SQUAD '+G.allies.filter(a=>!a.dead).length+'/3 · '+squad+' · F COMMAND'),pad,M.mode==='defend'?157:124);}
    const by=H-60,bw=Math.min(240,W*.26);x.font='600 11px Rajdhani,sans-serif';x.fillStyle='#9fb4bb';x.fillText('SHIELD',pad,by-26);x.fillText('VITAL',pad,by+2);
    this._bar(pad+48,by-36,bw,7,P.shield/60,G.shieldHurt>0?'#c9fbff':CY,'rgba(127,243,255,.15)');this._bar(pad+48,by-8,bw,11,P.hp/100,P.hp<35?RD:'#e8f3f6','rgba(255,255,255,.12)');
    if(G.shieldHurt>0&&P.shield<=0){x.fillStyle=CY;x.font='600 10px Rajdhani,"Noto Sans TC",sans-serif';x.fillText(word('護盾破裂','SHIELD BROKEN'),pad,by-50);}
    x.textAlign='right';const rx=W-pad,n=vm.ammo[vm.cur],mag=vm.W.mag||30;
    x.fillStyle=n===0?RD:n<=mag*.25?AM:'#eef6f8';x.font='700 42px Rajdhani,sans-serif';x.fillText(String(n),rx-56,H-38);x.font='600 18px Rajdhani,sans-serif';x.fillStyle='#8aa3ab';x.fillText('/ ∞',rx,H-40);
    x.font='600 11px Rajdhani,"Noto Sans TC",sans-serif';x.fillStyle=CY;x.fillText(vm.reloadT>=0?word('換彈中…','RELOADING…'):word(vm.W.name,{rifle:'XLR-7 RIFLE',pistol:'XP-2 PISTOL',smg:'XSM-9 SMG'}[vm.cur]),rx,H-83);
    const width=Math.min(180,W*.3),cell=width/mag;for(let i=0;i<mag;i++){x.fillStyle=i<n?'rgba(127,243,255,.9)':'rgba(127,243,255,.15)';x.fillRect(rx-width+i*cell,H-29,Math.max(1,cell-2),4);}
    if(vm.reloadT>=0)this._bar(rx-width,H-21,width,2,vm.reloadT/(vm.W.reload||1),AM,'rgba(255,179,71,.15)');
    x.fillStyle='#d7b27b';x.fillText(word('G 手榴彈 ×'+G.nades,'G GRENADES ×'+G.nades),rx,H-104);x.textAlign='left';
    this._infantryRadar(W,H,G,contacts,language);
    if(G.prompt){x.textAlign='center';x.font='500 13px "Noto Sans TC"';const width=Math.min(W-30,x.measureText(G.prompt).width+32);x.fillStyle='#0b202bdd';x.fillRect(cx-width/2,cy+63,width,34);x.strokeStyle='rgba(127,243,255,.6)';x.lineWidth=1;x.strokeRect(cx-width/2,cy+63,width,34);x.fillStyle='#f0e5cf';x.fillText(G.prompt,cx,cy+85);if(M.capture>0)this._bar(cx-100,cy+105,200,5,M.capture/M.rules.capture,'#d7b27b','#ffffff33');}
    if(G.noticeT>0){x.textAlign='center';x.font='500 14px "Noto Sans TC"';x.fillStyle='#d7b27b';x.fillText(G.notice,cx,H*.24);}
    x.restore();
  }
}
