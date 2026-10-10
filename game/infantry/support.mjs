const bilingual=(zh,en)=>({zh,en});
export const SUPPORTS={
  recon:{name:bilingual('偵察掃描','Recon scan'),brief:bilingual('敵軍位置標示 25 秒；雷達與戰術地圖可見。','Reveal enemy positions on radar and the tactical map for 25 seconds.'),cooldown:40},
  medic:{name:bilingual('戰地醫療','Field medicine'),brief:bilingual('生命 +20、護盾 +15；存活隊友生命 +25。','Restore 20 health and 15 shield; living squadmates recover 25 health.'),cooldown:45},
  grenadier:{name:bilingual('榴彈補給','Grenade package'),brief:bilingual('手榴彈 +2，最多攜帶 3 枚。','Receive two grenades, up to a carrying limit of three.'),cooldown:35},
};
export const supportChoice=id=>Object.hasOwn(SUPPORTS,id)?id:'recon';
const finite=(n,fallback=0)=>Number.isFinite(n)?n:fallback;
const cap=(n,max)=>Math.max(0,Math.min(max,finite(n)));
export class TacticalSupport {
  constructor(id='recon',charges=2){this.id=supportChoice(id);this.charges=Math.floor(cap(charges,3));this.cooldown=0;this.uses=0;}
  update(dt){this.cooldown=Math.max(0,this.cooldown-Math.max(0,finite(dt)));}
  addCharge(){this.charges=Math.min(3,this.charges+1);}
  activate({hp=100,shield=60,nades=3,allies=[],intel=0}={}){
    if(this.charges<=0)return {ok:false,reason:'empty'};
    if(this.cooldown>0)return {ok:false,reason:'cooldown'};
    const living=allies.map(a=>({hp:cap(a.hp,finite(a.hp0,100)),hp0:Math.max(1,finite(a.hp0,100)),dead:!!a.dead}));
    if(this.id==='recon'&&intel>0)return {ok:false,reason:'active'};
    if(this.id==='grenadier'&&nades>=3)return {ok:false,reason:'full'};
    if(this.id==='medic'&&hp>=100&&shield>=60&&living.every(a=>a.dead||a.hp>=a.hp0))return {ok:false,reason:'full'};
    const result={ok:true,hp:cap(hp,100),shield:cap(shield,60),nades:cap(nades,3),allies:living.map(a=>a.hp),intel:0};
    if(this.id==='recon')result.intel=25;
    if(this.id==='medic'){result.hp=cap(hp+20,100);result.shield=cap(shield+15,60);result.allies=living.map(a=>a.dead?a.hp:cap(a.hp+25,a.hp0));}
    if(this.id==='grenadier')result.nades=cap(nades+2,3);
    this.charges--;this.uses++;this.cooldown=SUPPORTS[this.id].cooldown;return result;
  }
}
export function fieldReward(kind,{hp=100,shield=60,nades=3,intel=0}={}){
  return {hp:cap(hp+(kind==='cache'?15:0),100),shield:cap(shield+(kind==='cache'?25:0),60),nades:cap(nades+(kind==='cache'?1:0),3),intel:kind==='intel'?Math.max(intel,30):intel,charge:kind==='relay'?1:0};
}
