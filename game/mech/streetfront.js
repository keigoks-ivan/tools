// 公尺尺度的街層設備，寫入呼叫端既有幾何桶，不建立材質、貼圖或燈。
// emit(lo,hi,y0,y1,d0,d1,color)；d 是由外牆往街道的距離。
export function streetfront(a0, a1, japanese, emit) {
  if (a1 - a0 < 12) return;
  const dark=[.12,.15,.17,0,2], steel=[.57,.6,.59,0,2], wood=[.33,.23,.15,0,1];
  if (japanese) {
    const c=a0+.95, white=[.74,.75,.71,0,1];
    // 自販機的展示窗、三層飲料、按鍵與取物口均有厚度；沒有假的文字貼圖。
    emit(c-.45,c+.45,.08,1.92,.04,.51,white);
    emit(c-.39,c+.2,.62,1.72,.511,.526,dark);
    for(let row=0;row<3;row++) {
      const y=.85+row*.29;
      for(let col=0;col<5;col++) {
        const x=c-.32+col*.105, colors=[[.62,.22,.16,0,1],[.31,.47,.51,0,1],[.68,.64,.46,0,1]];
        emit(x-.032,x+.032,y,y+.13,.527,.558,colors[(row+col)%3]);
        emit(x-.033,x+.033,y+.13,y+.145,.527,.558,steel);
        emit(x-.018,x+.018,y-.045,y-.032,.527,.554,white);
      }
      emit(c-.39,c+.2,y-.065,y-.05,.527,.56,steel);
    }
    emit(c+.27,c+.37,1.32,1.42,.512,.534,dark);
    emit(c+.26,c+.39,1.05,1.09,.512,.54,dark);
    emit(c+.28,c+.35,.86,.94,.512,.54,steel);
    emit(c-.29,c+.28,.25,.45,.512,.53,dark);
    emit(c-.29,c+.28,.25,.28,.53,.59,steel);
    for(const x of [c-.36,c+.36])emit(x-.05,x+.05,0,.1,.08,.47,dark);
  } else {
    const c=a0+1.05;
    // 木條長椅與石腳，靠牆擺放；輪廓與材料有分層。
    for(let i=0;i<4;i++)emit(c-.7,c+.7,.43,.48,.09+i*.12,.18+i*.12,wood);
    for(let i=0;i<3;i++)emit(c-.7,c+.7,.65+i*.14,.73+i*.14,.05,.12,wood);
    for(const x of [c-.5,c+.5]) {
      emit(x-.07,x+.07,0,.44,.13,.48,steel);
      emit(x-.035,x+.035,.43,1.05,.07,.11,dark);
    }
  }
}
