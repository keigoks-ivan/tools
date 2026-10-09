import * as THREE from 'three';
import { HUD } from '../mech/zero/hud.js';
export class InfantryHUD extends HUD {
  drawBattle(dt,G,language) {
    const x=this.x,d=this.d,W=this.c.width/d,H=this.c.height/d,cx=W/2,cy=H/2,P=G.player,vm=G.vm,M=G.mission;
    const word=(zh,en)=>language==='zh'?zh:en;
    x.setTransform(d,0,0,d,0,0);x.clearRect(0,0,W,H);x.save();x.shadowColor='#000';x.shadowBlur=4;
    if(vm.scoped)this._scope(W,H,{...G,scopeRange:0});
    else if(!P.dead){
      const gap=5+vm.spreadNow*H/Math.tan(THREE.MathUtils.degToRad(G.camera.fov/2));
      x.strokeStyle='#e6f4ed';x.lineWidth=1.5;x.beginPath();
      for(const [dx,dy]of [[1,0],[-1,0],[0,1],[0,-1]]){x.moveTo(cx+dx*gap,cy+dy*gap);x.lineTo(cx+dx*(gap+7),cy+dy*(gap+7));}x.stroke();
    }
    if(this.hit>0){this.hit-=dt;x.strokeStyle=this.mk==='kill'?'#ff6655':'#d7b27b';x.lineWidth=2.5;x.beginPath();for(const [a,b]of [[1,1],[-1,1],[1,-1],[-1,-1]]){x.moveTo(cx+a*9,cy+b*9);x.lineTo(cx+a*18,cy+b*18);}x.stroke();}
    if(G.hurt>0){const g=x.createRadialGradient(cx,cy,H*.2,cx,cy,H*.7);g.addColorStop(0,'#e6412d00');g.addColorStop(1,`rgba(210,40,25,${G.hurt*.35})`);x.fillStyle=g;x.fillRect(0,0,W,H);}
    if(!vm.scoped){
      const target=M.target,p=new THREE.Vector3(target.x,G.map.ground(target.x,target.z)+1.5,target.z);
      this._pin(W,H,p,P.pos.distanceTo(p),'#d7b27b',11,true,target.name[language]);
      if(G.cleanup)for(const e of G.enemies.filter(e=>!e.dead)){
        const p=e.pos.clone();p.y+=1.9;const dy=e.pos.y-P.pos.y;
        this._pin(W,H,p,P.pos.distanceTo(e.pos),'#ff765e',9,true,word('最後殘敵','Last enemy')+(Math.abs(dy)>1.5?` ${dy>0?'+':''}${Math.round(dy)}m`:''));
      }
    }
    const pad=W<650?16:30;
    x.fillStyle='#d7b27b';x.font='600 12px Rajdhani,sans-serif';x.fillText(`${M.scenario.code} / ${word(M.mode==='defend'?'守衛戰':'衝鋒戰',M.mode==='defend'?'DEFENSE':'ASSAULT')}`,pad,34);
    x.fillStyle='#eff1e9';x.font='500 15px "Noto Sans TC",sans-serif';x.fillText(M.target.name[language],pad,59);
    x.font='500 12px "Noto Sans TC",sans-serif';x.fillStyle='#bec9c5';
    const alive=G.enemies.filter(e=>!e.dead).length;
    const phase=M.mode==='defend'?M.phase==='prepare'?word(`整備 ${Math.ceil(Math.max(0,M.delay))} 秒 · ${M.wave}/4 波完成`,`PREPARE ${Math.ceil(Math.max(0,M.delay))}s · ${M.wave}/4 cleared`):word(`第 ${M.wave}/4 波 · 殘敵 ${alive} · 增援 ${M.pending}`,`WAVE ${M.wave}/4 · ${alive} hostile · ${M.pending} incoming`):word(`據點 ${M.objective+1}/3 · 敵軍 ${alive} · 增援 ${M.pending}`,`SECTOR ${M.objective+1}/3 · ${alive} hostile · ${M.pending} incoming`);
    x.fillText(phase,pad,82);if(G.cleanup){x.fillStyle='#ff9e84';x.fillText(word('殘敵即時定位已開啟','LAST ENEMIES TRACKED'),pad,103);}
    if(M.mode==='defend'){this._bar(pad,114,Math.min(210,W*.35),5,M.integrity/100,'#d7b27b','#ffffff22');x.font='500 10px "Noto Sans TC"';x.fillStyle='#d7b27b';x.fillText(word(`防線完整 ${Math.ceil(M.integrity)}%`,`LINE INTEGRITY ${Math.ceil(M.integrity)}%`),pad,135);}
    if(H>450){x.fillStyle='#8fdde0';x.font='500 10px "Noto Sans TC"';const squad={follow:word('跟隨','FOLLOW'),hold:word('原地掩護','HOLD'),advance:word('推進','ADVANCE')}[G.squadCommand?.mode||'follow'];x.fillText(word(`小隊 ${G.allies.filter(a=>!a.dead).length}/3 · ${squad} · F 指令`,`SQUAD ${G.allies.filter(a=>!a.dead).length}/3 · ${squad} · F COMMAND`),pad,M.mode==='defend'?157:124);}
    const y=H-35,bw=Math.min(190,W*.25);x.font='600 11px Rajdhani,sans-serif';x.fillStyle='#cddbd7';x.fillText(`VITAL ${Math.ceil(P.hp)}`,pad,y-36);this._bar(pad,y-26,bw,7,P.hp/100,P.hp<30?'#ff765e':'#eff1e9','#ffffff20');
    x.fillStyle='#8fdde0';x.fillText(`SHIELD ${Math.ceil(P.shield)}`,pad,y-3);this._bar(pad,y+6,bw,4,P.shield/60,'#8fdde0','#8fdde020');
    x.textAlign='right';x.fillStyle='#e9eee6';x.font='600 38px Rajdhani';x.fillText(`${vm.ammo[vm.cur]}`,W-pad-50,H-35);x.font='500 18px Rajdhani';x.fillStyle='#a6b5b4';x.fillText('/ ∞',W-pad,H-36);
    x.font='500 11px "Noto Sans TC"';x.fillStyle='#8fdde0';x.fillText(vm.reloadT>=0?word('換彈中…','RELOADING…'):word(vm.W.name,{rifle:'XLR-7 RIFLE',pistol:'XP-2 PISTOL',smg:'XSM-9 SMG'}[vm.cur]),W-pad,H-83);
    x.fillStyle='#d7b27b';x.fillText(word(`G 手榴彈 ×${G.nades}`,`G GRENADES ×${G.nades}`),W-pad,H-104);x.textAlign='left';
    // North-up radar uses real positions for the final two; other contacts require line of sight.
    if(W>300&&H>280){const r=H<450?30:43,xx=pad+r,yy=H<450?H-145:H-185;x.save();x.translate(xx,yy);x.fillStyle='#10232be6';x.strokeStyle='#8fdde045';x.beginPath();x.arc(0,0,r,0,Math.PI*2);x.fill();x.stroke();
      const dot=(p,col,size=2.5)=>{let dx=(p.x-P.pos.x)*r/65,dz=-(p.z-P.pos.z)*r/65;const len=Math.hypot(dx,dz);if(len>r-4){dx*=(r-4)/len;dz*=(r-4)/len;}x.fillStyle=col;x.beginPath();x.arc(dx,dz,size,0,Math.PI*2);x.fill();};
      for(const e of G.enemies)if(!e.dead&&(G.cleanup||G.map.solid.sees(P.eye,e.pos.clone().add(new THREE.Vector3(0,1.5,0)))))dot(e.pos,'#ff765e');
      for(const a of G.allies)if(!a.dead)dot(a.pos,'#8fdde0');dot(M.target,'#d7b27b',4);
      x.rotate(P.yaw);x.fillStyle='#eff1e9';x.beginPath();x.moveTo(0,-5);x.lineTo(4,4);x.lineTo(-4,4);x.closePath();x.fill();x.restore();}
    if(G.prompt){x.textAlign='center';x.font='500 13px "Noto Sans TC"';const width=Math.min(W-30,x.measureText(G.prompt).width+32);x.fillStyle='#0b202bdd';x.fillRect(cx-width/2,cy+63,width,34);x.fillStyle='#f0e5cf';x.fillText(G.prompt,cx,cy+85);if(M.capture>0)this._bar(cx-100,cy+105,200,5,M.capture/M.rules.capture,'#d7b27b','#ffffff33');}
    if(G.noticeT>0){x.textAlign='center';x.font='500 14px "Noto Sans TC"';x.fillStyle='#d7b27b';x.fillText(G.notice,cx,H*.24);}
    x.restore();
  }
}
