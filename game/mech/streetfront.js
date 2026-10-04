// 公尺尺度的街層設備，寫入呼叫端既有幾何桶，不建立材質、貼圖或燈。
// emit(lo,hi,y0,y1,d0,d1,color)；d 是由外牆往街道的距離。
export function frontageProfile(seed=0,japanese=true) {
  let h=Math.round(seed*1000)>>>0;h=Math.imul(h^(h>>>16),0x45d9f3b);h=Math.imul(h^(h>>>16),0x45d9f3b);h=(h^(h>>>16))>>>0;
  const type=japanese?h%4:h%2?3:0,alternate=(h>>>5)&1;
  const signs=[[0,1],[4,6],[2,5],[3,7]],frames=[[.16,.20,.20,0,2],[.31,.23,.15,0,5],[.26,.31,.28,0,2],[.18,.22,.24,0,2]];
  const accents=[[.28,.35,.30,0,6],[.26,.30,.25,0,5],[.32,.42,.32,0,5],[.32,.36,.38,0,6]];
  return {type,sign:signs[type][alternate],frame:frames[type].slice(),accent:accents[type].slice(),
    glass:[[.19,.25,.26,0,4],[.18,.23,.21,0,4],[.21,.26,.24,0,4],[.17,.23,.25,0,4]][type],
    awningDepth:[.62,.56,.76,.42][type],doorOffset:alternate?.30:-.30};
}

// points=[沿牆位置,高度,離牆距離]；呼叫端轉到世界座標並寫入既有桶。
// 不畫玻璃或改窗洞；每種店面只補其特有的薄雨庇、木格或百葉。
export function frontageDetails(emit,{center,radius=1.35,bottom=.12,top=2.8,depth=-.32,seed=0,japanese=true,face=null}={}) {
  const p=frontageProfile(seed,japanese),dark=[.14,.17,.17,0,2],metal=[.43,.48,.46,0,2];
  const lo=center-radius,hi=center+radius;
  if(p.type===0) {
    emit(lo-.10,hi+.10,top+.10,top+.17,.035,p.awningDepth,p.accent);
    for(const x of [lo+.08,hi-.12])emit(x,x+.04,top-.16,top+.10,.04,.11,metal);
  } else if(p.type===1) {
    for(const side of [-1,1])for(let k=0;k<4;k++) {
      const x=center+side*(radius+.16+k*.105);emit(x-.02,x+.02,bottom+.18,top-.12,.012,.08,p.frame);
    }
    emit(lo-.52,hi+.52,top-.06,top+.06,.01,.18,p.frame);
    if(face)for(let k=0;k<3;k++) {
      const x=lo+k*(2*radius/3),w=2*radius/3-.035;
      face([[x,top-.50,.20],[x+w,top-.50,.20],[x+w,top-.06,.20],[x,top-.06,.20]],p.accent);
    }
  } else if(p.type===2) {
    emit(lo-.12,hi+.12,top+.08,top+.14,.035,p.awningDepth,p.accent);
    if(face)for(let k=0;k<3;k++) {
      const x=lo-.12+k*(2*radius+.24)/3,w=(2*radius+.24)/3;
      const col=k%2?[.67,.64,.53,0,5]:p.accent;
      face([[x,top-.06,p.awningDepth],[x+w,top-.06,p.awningDepth],[x+w,top+.08,p.awningDepth],[x,top+.08,p.awningDepth]],col);
    }
    emit(hi+.20,hi+.58,.12,.51,.06,.40,[.34,.30,.24,0,5]);
    emit(hi+.18,hi+.60,.51,.55,.04,.43,[.47,.40,.30,0,5]);
  } else {
    emit(lo-.08,hi+.08,top+.04,top+.15,.025,p.awningDepth,p.accent);
    for(const x of [lo-.07,hi+.02])emit(x,x+.05,bottom,top,.012,.065,dark);
    if(face)for(let y=bottom+.26;y<top-.15;y+=.27) {
      face([[lo+.07,y,depth+.011],[lo+.39,y,depth+.011],[lo+.39,y+.022,depth+.011],[lo+.07,y+.022,depth+.011]],metal);
    }
  }
  return p;
}

export function streetfront(a0, a1, japanese, emit, {seed=a0*.61+a1*.39,arcade=false}={}) {
  if (a1 - a0 < 12) return;
  const dark=[.12,.15,.17,0,2], steel=[.57,.6,.59,0,2], wood=[.33,.23,.15,0,5];
  const profile=frontageProfile(seed,japanese);
  if (japanese&&!arcade&&profile.type===0) {
    const c=a0+.95, white=[.74,.75,.71,0,1];
    // 自販機的展示窗、三層飲料、按鍵與取物口均有厚度；沒有假的文字貼圖。
    emit(c-.45,c+.45,.08,1.92,.04,.51,white);
    emit(c-.39,c+.2,.62,1.72,.511,.526,dark);
    for(let row=0;row<2;row++) {
      const y=.91+row*.38;
      for(let col=0;col<3;col++) {
        const x=c-.29+col*.17, colors=[[.62,.22,.16,0,1],[.31,.47,.51,0,1],[.68,.64,.46,0,1]];
        emit(x-.032,x+.032,y,y+.13,.527,.558,colors[(row+col)%3]);
        emit(x-.033,x+.033,y+.13,y+.145,.527,.558,steel);
      }
      emit(c-.39,c+.2,y-.065,y-.05,.527,.56,steel);
    }
    emit(c+.27,c+.37,1.32,1.42,.512,.534,dark);
    emit(c+.26,c+.39,1.05,1.09,.512,.54,dark);
    emit(c+.28,c+.35,.86,.94,.512,.54,steel);
    emit(c-.29,c+.28,.25,.45,.512,.53,dark);
    emit(c-.29,c+.28,.25,.28,.53,.59,steel);
    for(const x of [c-.36,c+.36])emit(x-.05,x+.05,0,.1,.08,.47,dark);
  } else if(arcade||!japanese||profile.type===1) {
    const c=a0+1.05;
    // 木條長椅與石腳，靠牆擺放；輪廓與材料有分層。
    for(let i=0;i<4;i++)emit(c-.7,c+.7,.43,.48,.09+i*.12,.18+i*.12,wood);
    for(let i=0;i<3;i++)emit(c-.7,c+.7,.65+i*.14,.73+i*.14,.05,.12,wood);
    for(const x of [c-.5,c+.5]) {
      emit(x-.07,x+.07,0,.44,.13,.48,steel);
      emit(x-.035,x+.035,.43,1.05,.07,.11,dark);
    }
  } else if(profile.type===2) {
    // 稀疏的店外展示箱留在牆角，沒有把整條商店街變成貨攤。
    const c=a0+.80;
    emit(c-.38,c+.38,.05,.37,.03,.48,[.36,.31,.24,0,5]);
    emit(c-.42,c+.42,.37,.42,.015,.51,wood);
    for(const x of [c-.34,c+.27])emit(x,x+.07,.05,.37,.02,.50,dark);
    emit(c-.32,c+.32,.42,.51,.10,.42,[.39,.47,.31,0,6]);
  } else {
    // 表箱、低位服務管道和收邊，與住宅立面合在一起；不在門前堆雜物。
    emit(a0+.45,a0+.70,.85,1.2,.018,.105,steel);
    emit(a0+.56,a0+.585,.16,.85,.02,.07,dark);
    emit(a0+.42,a0+.73,1.2,1.235,.01,.14,dark);
  }
}
