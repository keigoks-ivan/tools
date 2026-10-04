// 日本街景與地標的靜態幾何。呼叫端合併到既有材質桶；不建立燈光或逐格動畫。
// 實景參考：神戶觀光局 https://www.feel-photo.info/c10/ 、https://www.feel-photo.info/a78/
// 元町入口與天棚：https://www.feel-photo.info/神戸元町商店街/ 、https://www.kobe-motomachi.or.jp/photo-gallery/photo.html
import { shopUV, civicUV } from './urban.js';
import { frontageProfile, frontageDetails } from './streetfront.js';
const stone = [.64, .66, .62, 0, 1], steel = [.17, .21, .22, 0, 2];
const vermilion = [.63, .12, .045, 0, 6], ivory = [.78, .79, .72, 0, 6];
const wood = [.28, .21, .15, 0, 5], tile = [.16, .21, .23, 0, 3], glass = [.1, .19, .23, 0, 4];

export function japaneseScenery(out, { tower = null, shrine = null, streets = [], arcade = null, maritime = null, waterfront = null, shops = [], crossings = [] } = {}) {
  const box = (...args) => out.box(...args);
  const face = (a, b, c, d, color) => out.face(a, b, c, d, color);
  function beam(a, b, r, color, sides = 6) {
    const d = b.map((v, i) => v - a[i]), length = Math.hypot(...d);
    if (length < .001) return;
    const n = d.map(v => v / length), ref = Math.abs(n[1]) < .9 ? [0, 1, 0] : [1, 0, 0];
    const u = [n[1] * ref[2] - n[2] * ref[1], n[2] * ref[0] - n[0] * ref[2], n[0] * ref[1] - n[1] * ref[0]];
    const ul = Math.hypot(...u); for (let i = 0; i < 3; i++) u[i] /= ul;
    const v = [n[1] * u[2] - n[2] * u[1], n[2] * u[0] - n[0] * u[2], n[0] * u[1] - n[1] * u[0]];
    const at = (p, t) => p.map((q, i) => q + r * (u[i] * Math.cos(t) + v[i] * Math.sin(t)));
    for (let i = 0; i < sides; i++) {
      const t = i / sides * Math.PI * 2, q = (i + 1) / sides * Math.PI * 2;
      face(at(a, t), at(a, q), at(b, q), at(b, t), color);
    }
  }
  function sign(x, y, z, w, h, id, ry = 0) {
    const at = (u, v) => [x + u * Math.cos(ry), y + v, z - u * Math.sin(ry)];
    out.sign([at(-w / 2, -h / 2), at(w / 2, -h / 2), at(w / 2, h / 2), at(-w / 2, h / 2)], id, w/h);
  }
  const solid = (x0, x1, y0, y1, z0, z1) => out.solid?.({ x0, x1, y0, y1, z0, z1 });

  // 小開間連棟店屋。店招寫入既有圖集；樓高、窗戶、雨庇和屋頂機房都有公尺尺度。
  for(const [x0,x1,z,side=1,ground=0,facade=false] of shops) {
    const count=Math.max(1,Math.floor((x1-x0)/6)),span=(x1-x0)/count;
    const P=(x,y,d)=>[x,ground+y,z+side*d];
    const B=(lo,hi,y0,y1,d0,d1,col)=>box(lo,hi,ground+y0,ground+y1,Math.min(z+side*d0,z+side*d1),Math.max(z+side*d0,z+side*d1),col);
    const pane=(lo,hi,y0,y1,d,col)=>{const pts=[P(lo,y0,d),P(hi,y0,d),P(hi,y1,d),P(lo,y1,d)];if(side<0)pts.reverse();face(...pts,col);};
    // 牆上細框只保留外露三面；不畫嵌在牆內的背面與封頭。下緣與內側預留接觸陰影。
    const tint=(col,k)=>col.map((v,j)=>j<3?v*k:v);
    const trim=(a,b,y0,y1,d0,d1,col,vertical=false)=>{
      pane(a,b,y0,y1,d1,col);
      const faces=vertical?[[P(a,y0,d0),P(a,y0,d1),P(a,y1,d1),P(a,y1,d0)],
        [P(b,y0,d1),P(b,y0,d0),P(b,y1,d0),P(b,y1,d1)]]:
        [[P(a,y1,d1),P(b,y1,d1),P(b,y1,d0),P(a,y1,d0)],
          [P(a,y0,d0),P(b,y0,d0),P(b,y0,d1),P(a,y0,d1)]];
      for(let j=0;j<faces.length;j++){const pts=faces[j];if(side<0)pts.reverse();face(...pts,tint(col,j?.72:.9));}
    };
    for(let i=0;i<count;i++) {
      const lo=x0+i*span+.04,hi=x0+(i+1)*span-.04,c=(lo+hi)/2,h=[9.7,13.1,6.6,10.2,12.6,7.1][i%6];
      const seed=lo*.61+z*.39+i*7.171,profile=frontageProfile(seed);
      const paint=[[.61,.59,.54,0,6],[.65,.65,.61,0,6],[.52,.49,.43,0,6],[.59,.60,.56,0,6],[.48,.52,.51,0,6],[.64,.60,.52,0,6]][i%6];
      const frame=profile.frame,base=[.33,.35,.33,0,6],ledge=[.56,.56,.52,0,6];
      const ww=i%3===0?3.1:2.7,wl=c-ww/2,wr=c+ww/2,recess=facade?.025:-.32;
      const rows=[];for(let y=3.6;y<h-1;y+=3.2)rows.push([y,y+1.8]);
      if(!facade) {
        // 量體正面切出窗洞與店面，玻璃後退；側牆與背面仍合併成少量面。
        const rear=[P(hi,0,-7),P(lo,0,-7),P(lo,h,-7),P(hi,h,-7)];if(side<0)rear.reverse();face(...rear,paint);
        for(const [edge,outside] of [[lo,-1],[hi,1]]) {
          const sidePane=(a,b,y0,y1,inset,col)=>{
            const pts=[P(edge-outside*inset,y0,-a),P(edge-outside*inset,y0,-b),P(edge-outside*inset,y1,-b),P(edge-outside*inset,y1,-a)];
            if(outside*side<0)pts.reverse();face(...pts,col);
          };
          if((i===0&&outside<0)||(i===count-1&&outside>0)) {
            let previous=0;
            for(const [y,top] of rows) {
              sidePane(0,7,previous,y,0,paint);sidePane(0,1.2,y,top,0,paint);sidePane(4,7,y,top,0,paint);
              sidePane(1.2,4,y,top,.22,[.17,.24,.25,0,4]);
              for(const yy of [y,top-.05])sidePane(1.2,4,yy,yy+.05,.14,frame);
              for(const d of [1.2,2.58,3.95])sidePane(d,d+.05,y,top,.14,frame);
              for(const [j,pts]of [[P(edge,y,-1.2),P(edge,y,-4),P(edge-outside*.22,y,-4),P(edge-outside*.22,y,-1.2)],
                [P(edge-outside*.22,top,-1.2),P(edge-outside*.22,top,-4),P(edge,top,-4),P(edge,top,-1.2)],
                [P(edge-outside*.22,y,-1.2),P(edge-outside*.22,top,-1.2),P(edge,top,-1.2),P(edge,y,-1.2)],
                [P(edge,y,-4),P(edge,top,-4),P(edge-outside*.22,top,-4),P(edge-outside*.22,y,-4)]].entries()) {
                if(outside*side<0)pts.reverse();face(...pts,tint(paint,j===1?.55:.76));
              }
              previous=top;
            }
            sidePane(0,7,previous,h,0,paint);
          } else sidePane(0,7,0,h,0,paint);
        }
        const holes=[[lo+.35,hi-.35,.15,2.55]];
        for(const [y,top] of rows)holes.push([wl,wr,y,top]);
        let previous=0;
        for(const [a,b,y0,y1] of holes) {
          pane(lo,hi,previous,y0,0,paint);pane(lo,a,y0,y1,0,paint);pane(b,hi,y0,y1,0,paint);previous=y1;
          for(const [j,pts] of [[P(a,y0,0),P(b,y0,0),P(b,y0,recess),P(a,y0,recess)],
            [P(a,y1,recess),P(b,y1,recess),P(b,y1,0),P(a,y1,0)],
            [P(a,y0,recess),P(a,y1,recess),P(a,y1,0),P(a,y0,0)],
            [P(b,y0,0),P(b,y1,0),P(b,y1,recess),P(b,y0,recess)]].entries()) {if(side<0)pts.reverse();face(...pts,tint(paint,j===1?.55:.76));}
        }
        pane(lo,hi,previous,h,0,paint);
        solid(lo,hi,ground,ground+h,Math.min(z,z-side*7),Math.max(z,z-side*7));
        B(lo-.05,hi+.05,h,h+.16,-7.05,.05,ledge);
        trim(lo-.08,hi+.08,h-.16,h+.42,0,.11,paint);
        trim(lo-.11,hi+.11,h+.42,h+.49,0,.16,ledge);
        B(lo,lo+.15,h+.16,h+.42,-7,0,paint);B(hi-.15,hi,h+.16,h+.42,-7,0,paint);
        B(lo+.15,hi-.15,h+.16,h+.42,-7,-6.85,paint);
        pane(lo,hi,h-.25,h-.16,.008,tint(paint,.64));
        // 深色防水層落在女兒牆後，不把整棟屋頂畫成亮白色盒蓋。
        const roof=[P(lo+.22,h+.165,-.22),P(hi-.22,h+.165,-.22),P(hi-.22,h+.165,-6.78),P(lo+.22,h+.165,-6.78)];
        if(side<0)roof.reverse();face(...roof,[.29,.31,.29,0,6]);
        if(i%3===1)B(c-.7,c+.7,h+.16,h+1.05,-5,-3.5,tint(paint,.88));
      }
      // 石材下層、抹灰上層與細磁磚混排；接縫避開實際窗洞。
      if(!facade&&i%3===2) {
        const mortar=tint(paint,.76);
        for(let y=3.4;y<h;y+=.65) {
          if(rows.some(([a,b])=>y>=a&&y<=b)){pane(lo,wl,y,y+.006,.012,mortar);pane(wr,hi,y,y+.006,.012,mortar);}
          else pane(lo,hi,y,y+.006,.018,mortar);
        }
        for(let x=lo+1.3;x<hi;x+=1.3) {
          if(x<wl||x>wr)pane(x,x+.006,3.4,h,.019,mortar);
          else {let y=3.4;for(const [a,b]of rows){pane(x,x+.006,y,a,.019,mortar);y=b;}pane(x,x+.006,y,h,.019,mortar);}
        }
      }
      // 平らなアルミ引き戸、二枚のガラス、シャッター付きの店舗を交互に配置。
      if(i%4===3) {
        pane(lo+.35,hi-.35,.15,2.55,recess,[.34,.37,.36,0,6]);
        for(let y=.3;y<2.55;y+=.14)pane(lo+.35,hi-.35,y,y+.012,recess+.006,[.25,.29,.28,0,6]);
      } else {
        // 通高展示窗、獨立入口與上方氣窗，框架嵌進洞口；室內底部比窗頂暗。
        pane(lo+.35,c-.55,.15,2.12,recess,tint(profile.glass,.86));pane(c+.55,hi-.35,.15,2.12,recess,profile.glass);
        pane(c-.55,c+.55,.15,2.12,recess,[.11,.17,.18,0,4]);
        pane(lo+.35,hi-.35,2.12,2.55,recess,[.24,.29,.28,0,4]);
        for(const x of [lo+.35,c-.55,c+.50,hi-.40])trim(x,x+.05,.15,2.55,recess,recess+.075,frame,true);
        for(const y of [.15,2.08,2.5])trim(lo+.35,hi-.35,y,y+.05,recess,recess+.075,frame);
        pane(lo+.4,c-.60,.2,.47,recess+.008,[.12,.16,.15,0,6]);pane(c+.6,hi-.4,.2,.47,recess+.008,[.13,.17,.16,0,6]);
        trim(c+.34,c+.37,1,1.4,recess+.075,recess+.16,[.45,.49,.47,0,2],true);
      }
      trim(lo,hi,0,.15,0,.035,base);
      pane(lo,lo+.35,.15,2.55,.003,base);pane(hi-.35,hi,.15,2.55,.003,base);
      frontageDetails((...args)=>B(...args),{center:c,radius:Math.min(1.9,(span-.9)/2),top:2.55,depth:recess,seed,
        face:i%4===3?null:(points,col)=>{const pts=points.map(p=>P(...p));if(side<0)pts.reverse();face(...pts,col);}});
      for(const [y,top] of rows) {
        const k=(i+Math.round(y/3.2))%3;
        pane(wl,wr,y,top,recess,k===0?[.19,.26,.27,0,4]:k===1?[.27,.30,.29,0,4]:[.15,.21,.23,0,4]);
        for(const x of [wl,c-.025,wr-.05])trim(x,x+.05,y,top,recess,recess+.08,frame,true);
        for(const yy of [y,top-.05])trim(wl,wr,yy,yy+.05,recess,recess+.08,frame);
        trim(wl-.10,wr+.10,y-.11,y-.03,0,.16,ledge);
        pane(wl-.1,wr+.1,top+.04,top+.09,.006,tint(paint,.68));
        // 房間簾幕在玻璃內側的深處；每層保留不同開合，沒有外加燈光。
        if(k!==2)pane(wl+.07,wl+.38,y+.07,top-.07,recess+.012,k?[.43,.41,.36,0,6]:[.32,.35,.33,0,6]);
        if(i%3===1) {
          trim(lo+.3,hi-.3,y-.18,y-.1,0,.68,ledge);
          trim(lo+.3,hi-.3,y+.1,y+.78,.60,.68,tint(paint,.83));
          trim(lo+.3,hi-.3,y+.78,y+.83,.59,.70,frame);
        } else {
          trim(wl-.09,wr+.09,top+.10,top+.17,0,.22,ledge);
        }
        // 設備集中在服務側，避免每層每窗都掛同一個空調盒。
        if(i%3===1&&y===3.6) {
          B(hi-1.0,hi-.35,y+.1,y+.55,.05,.35,ledge);
          for(let yy=y+.18;yy<y+.5;yy+=.07)pane(hi-.93,hi-.42,yy,yy+.02,.356,frame);
        }
      }
      trim(lo+.06,hi-.06,3.38,3.48,0,.19,ledge);
      pane(lo+.15,hi-.15,2.68,3.38,.05,[.42,.44,.4,0,6]);
      const id=profile.sign,w=Math.min(span-.4,3.3),pts=[P(c-w/2,2.68,.12),P(c+w/2,2.68,.12),P(c+w/2,3.38,.12),P(c-w/2,3.38,.12)];
      if(side<0)pts.reverse();out.shop?.(pts,id,side<0);
      if(i%4===3) {
        // 突出看板朝街道兩端，使用圖集中真正直排的「食堂」，不是把橫排文字拉長。
        const blade=[P(lo+.2,3.5,.85),P(lo+.2,3.5,.1),P(lo+.2,5.7,.1),P(lo+.2,5.7,.85)];
        out.shop?.(blade,4,false);out.shop?.(blade.slice().reverse(),4,true);
        trim(lo+.16,lo+.24,3.46,3.5,.08,.89,steel);trim(lo+.16,lo+.24,5.7,5.74,.08,.89,steel);
      }
      // 屋外配管與電表，貼牆放置，走道內沒有額外碰撞小物。
      trim(lo+.13,lo+.18,.15,h-.3,.015,.065,frame,true);trim(hi-.28,hi-.12,1.3,1.6,.015,.10,frame);
    }
  }

  // 橫向三燈式號誌、白色停止線、導盲磚與側溝。固定幾何，不使用逐格燈光。
  for(const [x,z,ry=0,width=7,ground=0,marks=true] of crossings) {
    const P=(u,y,v)=>[x+u*Math.cos(ry)+v*Math.sin(ry),ground+y,z-u*Math.sin(ry)+v*Math.cos(ry)];
    const panel=(u0,u1,y,v0,v1,col)=>face(P(u0,y,v1),P(u1,y,v1),P(u1,y,v0),P(u0,y,v0),col);
    if(marks) {
      for(let u=-width/2+.3;u<width/2-.4;u+=.9)panel(u,Math.min(u+.45,width/2-.2),.025,-1.4,1.4,ivory);
      panel(-width/2+.2,width/2-.2,.027,2.7,3.05,ivory);
    }
    for(const side of [-1,1]) {
      const u=side*(width/2+1.1);
      panel(u-.35,u+.35,.035,-1.5,1.5,[.74,.53,.07,0,6]);
      for(let v=-1.4;v<1.5;v+=.22)for(let a=-.2;a<=.2;a+=.2)beam(P(u+a,.042,v),P(u+a,.059,v),.026,[.81,.62,.13,0,6],4);
      panel(u-side*.75,u-side*.4,.023,-2,2,steel);
      for(let v=-1.9;v<2;v+=.24)beam(P(u-side*.75,.028,v),P(u-side*.4,.028,v),.015,stone,4);
    }
    const u=width/2+.8;
    beam(P(u,0,3.5),P(u,5.8,3.5),.065,steel);
    beam(P(u,5.65,3.5),P(u-3.1,5.65,3.5),.055,steel);
    face(P(u-3.16,5.4,3.68),P(u-1.8,5.4,3.68),P(u-1.8,5.9,3.68),P(u-3.16,5.9,3.68),steel);
    // 燈罩與遮陽帽；視線朝來車方向，綠燈偏藍綠。
    for(let i=0;i<3;i++) {
      const a=u-2.9+i*.42;
      beam(P(a,5.65,3.38),P(a,5.65,3.66),.2,steel,10);
      const lens=i===0?[.035,.38,.28,0,6]:i===1?[.28,.23,.09,0,6]:[.32,.055,.045,0,6];
      for(let j=0;j<10;j++) {
        const t=j/10*Math.PI*2,q=(j+1)/10*Math.PI*2,at=t=>P(a+Math.cos(t)*.145,5.65+Math.sin(t)*.145,3.37),c=at(t);
        face(P(a,5.65,3.37),at(q),c,c,lens);
      }
      face(P(a-.2,5.86,3.18),P(a+.2,5.86,3.18),P(a+.2,5.86,3.52),P(a-.2,5.86,3.52),steel);
    }
  }

  if (tower) {
    const [x, z, scale = 1, ground = 0] = tower;
    const P = (u, y, v) => [x + u * scale, ground + y * scale, z + v * scale];
    const radius = y => 14 * Math.sqrt(1 - 3 * (y / 100) + 3 * (y / 100) ** 2);
    const red = [.62, .045, .028, 0, 6];
    // 神戶港塔：兩組各十六根直線鋼管構成鼓形曲面，而非堆疊圓筒。
    for (let i = 0; i < 16; i++) for (const dir of [-1, 1]) {
      const a = i / 16 * Math.PI * 2, t = a + dir * Math.PI * 2 / 3;
      beam(P(Math.cos(a) * 14, 0, Math.sin(a) * 14), P(Math.cos(t) * 14, 100, Math.sin(t) * 14), .22 * scale, red, 8);
    }
    for (let y = 8; y <= 100; y += 8) {
      const r = radius(y);
      for (let i = 0; i < 16; i++) {
        const a = i / 16 * Math.PI * 2, t = (i + 1) / 16 * Math.PI * 2;
        beam(P(Math.cos(a) * r, y, Math.sin(a) * r), P(Math.cos(t) * r, y, Math.sin(t) * r), .10 * scale, red, 4);
      }
    }
    function drum(r, y0, y1, color, segments = 32) {
      for (let i = 0; i < segments; i++) {
        const a = i / segments * Math.PI * 2, t = (i + 1) / segments * Math.PI * 2;
        face(P(Math.cos(a) * r, y0, Math.sin(a) * r), P(Math.cos(a) * r, y1, Math.sin(a) * r), P(Math.cos(t) * r, y1, Math.sin(t) * r), P(Math.cos(t) * r, y0, Math.sin(t) * r), color);
        if (y1 === 11 || y1 === 100) face(P(0, y1, 0), P(Math.cos(t) * r, y1, Math.sin(t) * r), P(Math.cos(a) * r, y1, Math.sin(a) * r), P(Math.cos(a) * r, y1, Math.sin(a) * r), color);
      }
    }
    drum(3.1, 0, 74, ivory, 16);
    drum(12.2, 0, 11, ivory);
    for (const y of [0, 3.2, 6.5, 10.8]) drum(12.7, y, y + .28, stone);
    // 五層觀景台、窗框、樓板邊與屋頂玻璃欄杆。
    for (const y of [74, 79, 84, 89, 94]) {
      drum(12.2, y, y + .4, ivory); drum(11.9, y + .4, y + 4.2, glass); drum(12.2, y + 4.2, y + 4.6, ivory);
      for (let i = 0; i < 20; i++) {
        const a = i / 20 * Math.PI * 2;
        beam(P(Math.cos(a) * 12, y + .4, Math.sin(a) * 12), P(Math.cos(a) * 12, y + 4.2, Math.sin(a) * 12), .065 * scale, ivory, 4);
      }
    }
    drum(12.6, 99, 100, red); drum(11.8, 100, 102, glass); drum(12.1, 102, 102.2, steel);
    for (let i = 0; i < 16; i++) {
      const a = i / 16 * Math.PI * 2;
      beam(P(Math.cos(a) * 14, 100, Math.sin(a) * 14), P(Math.cos(a) * 13.5, 108, Math.sin(a) * 13.5), .16 * scale, red);
      const cx = x + Math.cos(a) * 14 * scale, cz = z + Math.sin(a) * 14 * scale;
      box(cx - .5 * scale, cx + .5 * scale, ground, ground + .6 * scale, cz - .5 * scale, cz + .5 * scale, stone);
    }
    solid(x - 12.7 * scale, x + 12.7 * scale, ground, ground + 11 * scale, z - 12.7 * scale, z + 12.7 * scale);
    sign(x, ground + 6 * scale, z - 12.73 * scale, 7 * scale, 1.8 * scale, 4, Math.PI);
  }

  if (arcade) {
    const [x0, x1, z, width = 8, ground = 0] = arcade;
    const P = (x, t) => [x, ground + 5.1 + Math.sin(t) * 1.5, z - Math.cos(t) * width / 2];
    for (let j = 0; j < 10; j++) {
      const a = j / 10 * Math.PI, c = (j + 1) / 10 * Math.PI;
      const col=j===4||j===5?[.55,.63,.6,0,4]:[.8,.8,.7,0,6];
      face(P(x0, a), P(x0, c), P(x1, c), P(x1, a), col);
      face(P(x0, a), P(x1, a), P(x1, c), P(x0, c), col);
      beam(P(x0, a), P(x1, a), .045, ivory);
    }
    for (let x = x0; x <= x1 + .01; x += (x1 - x0) / 7) {
      for (let j = 0; j < 10; j++) beam(P(x, j / 10 * Math.PI), P(x, (j + 1) / 10 * Math.PI), .065, ivory);
      for (const side of [-1, 1]) { beam([x, ground, z + side * width / 2], [x, ground + 5.1, z + side * width / 2], .09, steel); solid(x - .09, x + .09, ground, ground + 5.1, z + side * width / 2 - .09, z + side * width / 2 + .09); }
      for(const side of [-1,1]) {
        const v=z+side*(width/2-.55);
        beam([x,ground+4.5,z+side*width/2],[x,ground+4.5,v],.035,steel,4);
        beam([x,ground+4.15,v],[x,ground+4.5,v],.12,[.71,.61,.37,0,6],8);
        beam([x,ground+4.52,v],[x,ground+4.61,v],.16,steel,8);
      }
    }
    // 實景的連續側庇、乳白拱頂與入口彩色玻璃，使用合併幾何而非新貼圖或燈光。
    for(const side of [-1,1]) {
      const v=z+side*width/2;
      box(x0,x1,ground+4.8,ground+5.03,Math.min(v,v-side*.7),Math.max(v,v-side*.7),ivory);
      for(let x=x0+.5;x<x1;x+=1.5)beam([x,ground+4.8,v],[x,ground+4.8,v-side*.7],.028,steel,4);
    }
    for(const end of [x0-.055,x1+.055])for(let j=0;j<10;j++) {
      const a=j/10*Math.PI,c=(j+1)/10*Math.PI,lo=P(end,a),hi=P(end,c),upper=p=>[p[0],p[1]+.65,p[2]];
      const col=[[.12,.3,.46,0,6],[.16,.39,.43,0,6],[.36,.46,.47,0,6],[.47,.38,.25,0,6]][j%4];
      face(lo,hi,upper(hi),upper(lo),col);face(lo,upper(lo),upper(hi),hi,col);
      beam(lo,upper(lo),.035,ivory,4);
    }
    sign(x0 - .04, ground + 5.4, z, 3.2, .75, 2, -Math.PI / 2);
    sign(x1 + .04, ground + 5.4, z, 3.2, .75, 2, Math.PI / 2);
  }

  if (maritime) {
    const [x, z, scale = 1, ground = 0] = maritime;
    const P = (u, y, v) => [x + u * scale, ground + y * scale, z + v * scale];
    box(x - 43 * scale, x + 43 * scale, ground, ground + 6 * scale, z - 21 * scale, z + 21 * scale, ivory);
    solid(x - 43 * scale, x + 43 * scale, ground, ground + 6 * scale, z - 21 * scale, z + 21 * scale);
    // 參照神戶海洋博物館實景：兩片下凹的曲面帆、斜向格構與懸挑邊，不能做成三角帳篷。
    const sailPaint=[.86,.89,.88,0,6];
    for (let wing = 0; wing < 2; wing++) {
      const sail = (u,v) => P(wing ? 8+40*u : -48+60*u,
        6.5+(wing ? 16*u*u*(1-v)*(1-v) : 28*(1-u)*(1-u)*v*v)+3*(u-.5)**2+4*(v-.4)**2,
        -23+46*v);
      for (let i = 0; i <= 8; i++) for (let j = 0; j <= 6; j++) {
        const u=i/8,v=j/6,p=sail(u,v);
        if(i<8)beam(p,sail((i+1)/8,v),.16*scale,sailPaint,4);
        if(j<6)beam(p,sail(u,(j+1)/6),.16*scale,sailPaint,4);
        if(i<8&&j<6)beam((i+j)%2?p:sail((i+1)/8,v),(i+j)%2?sail((i+1)/8,(j+1)/6):sail(u,(j+1)/6),.11*scale,sailPaint,4);
        // 下弦桿與腹桿讓格構有厚度，遠看也保留曲面輪廓。
        const lower=q=>[q[0],q[1]-.65*scale,q[2]];
        if(i<8&&j%2===0)beam(lower(p),lower(sail((i+1)/8,v)),.09*scale,sailPaint,4);
        if(i%2===0&&j%2===0)beam(p,lower(p),.08*scale,sailPaint,4);
        if(i<8&&j<6&&i%2===0&&j%2===0)beam(p,lower(sail((i+1)/8,(j+1)/6)),.08*scale,sailPaint,4);
      }
    }
    for (let u = -40; u < 40; u += 5) {
      face(P(u, .8, -21.02), P(u, 5.5, -21.02), P(u + 4.7, 5.5, -21.02), P(u + 4.7, .8, -21.02), glass);
      beam(P(u, .8, -21.06), P(u, 5.5, -21.06), .08 * scale, steel,4);
    }
  }

  if (waterfront) {
    const [x0,x1,z0,z1,ground=0]=waterfront;
    // 鋪面接縫由共用石材材質繪製，不用粗糙混凝土掃描或額外分格幾何。
    box(x0,x1,ground,ground+.08,z0,z1,[.64,.63,.58,0,8]);
    for(let x=x0+5;x<x1-2;x+=16) {
      for(const p of [x-1.2,x+1.2])box(p-.06,p+.06,ground+.08,ground+.48,z1-8,z1-7.6,steel);
      for(let z=z1-8;z<z1-7.4;z+=.12)box(x-1.4,x+1.4,ground+.48,ground+.53,z,z+.09,wood);
      box(x-1.4,x+1.4,ground+.6,ground+1,z1-8.06,z1-8,wood);
      beam([x,ground+.08,z1-2],[x,ground+1.08,z1-2],.055,steel,4);
      if(x+16<x1-2)for(const y of [.55,1.08])beam([x,ground+y,z1-2],[x+16,ground+y,z1-2],.035,steel,4);
    }
  }

  if (shrine) {
    const [x, z, scale = 1, ground = 0] = shrine;
    const P = (u, y, v) => [x + u * scale, ground + y * scale, z + v * scale];
    const B = (a, b, c, d, e, f, col) => box(x + a * scale, x + b * scale, ground + c * scale, ground + d * scale, z + e * scale, z + f * scale, col);
    for (const sx of [-1, 1]) {
      B(sx * 2.7 - .42, sx * 2.7 + .42, 0, .22, -.5, .5, stone);
      beam(P(sx * 2.7, .2, 0), P(sx * 2.45, 4.4, 0), .23 * scale, vermilion, 10);
      B(sx * 2.7 - .28, sx * 2.7 + .28, .2, .55, -.29, .29, tile);
    }
    B(-3.2, 3.2, 3.35, 3.58, -.15, .15, vermilion);
    B(-.12, .12, 3.58, 4.5, -.16, .16, vermilion);
    // 笠木向兩端微微上翹，避免鳥居變成兩根方柱加平板。
    for (let i = 0; i < 8; i++) {
      const a = -3.65 + i * .9125, b = a + .9125, ya = 4.45 + .3 * (a / 3.65) ** 2, yb = 4.45 + .3 * (b / 3.65) ** 2;
      const pts = [P(a, ya, -.28), P(b, yb, -.28), P(b, yb + .2, -.28), P(a, ya + .2, -.28)];
      face(...pts.slice().reverse(), vermilion); face(P(a, ya + .2, -.28), P(b, yb + .2, -.28), P(b, yb + .2, .28), P(a, ya + .2, .28), tile);
      face(P(a, ya, .28), P(b, yb, .28), P(b, yb + .2, .28), P(a, ya + .2, .28), vermilion);
    }
    sign(x, ground + 3.98 * scale, z - .19 * scale, .76 * scale, .6 * scale, 3, Math.PI);
    for (let v = 1; v < 8; v += .8) B(-1.3, 1.3, .005, .025, v, v + .74, stone);
    // 參道兩旁石燈籠：基座、細柱、透空燈室、檐蓋與頂飾。
    for (const sx of [-1, 1]) for (const v of [3.2, 6.5]) {
      const u = sx * 2.2;
      B(u - .44, u + .44, 0, .18, v - .44, v + .44, stone);
      B(u - .19, u + .19, .18, 1.06, v - .19, v + .19, stone);
      B(u - .36, u + .36, 1.06, 1.19, v - .36, v + .36, stone);
      for (const dx of [-.28, .28]) for (const dz of [-.28, .28]) B(u + dx - .06, u + dx + .06, 1.19, 1.63, v + dz - .06, v + dz + .06, stone);
      B(u - .46, u + .46, 1.63, 1.79, v - .46, v + .46, stone);
      B(u - .16, u + .16, 1.79, 1.96, v - .16, v + .16, stone);
    }
    B(-2.8, 2.8, 0, .35, 8.3, 12.3, stone);
    B(-2.5, 2.5, .35, 3.55, 8.6, 12, wood);
    solid(x - 2.8 * scale, x + 2.8 * scale, ground, ground + 3.55 * scale, z + 8.3 * scale, z + 12.3 * scale);
    B(-1.35, 1.35, .45, 3.2, 8.53, 8.58, tile);
    for (let u = -1.28; u <= 1.3; u += .2) B(u, u + .045, .45, 3.2, 8.46, 8.53, wood);
    for (const u of [-2.38, 2.38]) B(u - .14, u + .14, .35, 3.8, 8.4, 8.65, wood);
    B(-3.35, 3.35, 3.38, 3.53, 7.85, 12.75, wood);
    const profile = [[-3.4, 3.65], [-2.7, 3.57], [-1.5, 4.28], [0, 4.8], [1.5, 4.28], [2.7, 3.57], [3.4, 3.65]];
    for (let i = 1; i < profile.length; i++) {
      const [a, ya] = profile[i - 1], [b, yb] = profile[i];
      face(P(a, ya, 7.8), P(a, ya, 12.8), P(b, yb, 12.8), P(b, yb, 7.8), tile);
      // 瓦列與雨滴邊是幾何；遠距離只剩屋簷輪廓。
      for (let v = 7.8; v <= 12.8; v += .42) beam(P(a, ya + .025, v), P(b, yb + .025, v), .025 * scale, tile);
    }
    for (const v of [8.55, 12.02]) for (const side of [-1, 1]) face(P(0, 3.54, v), P(side * 2.7, 3.57, v), P(0, 4.8, v), P(0, 4.8, v), wood);
    beam(P(0, 4.85, 7.7), P(0, 4.85, 12.9), .11 * scale, tile);
    // 階段與賽錢箱，沒有額外互動或光源。
    for (let i = 0; i < 3; i++) B(-1.45, 1.45, 0, .12 * (i + 1), 7.5 + i * .24, 7.75 + i * .24, stone);
    B(-.55, .55, .36, .88, 8, 8.45, wood);
    for (let u = -.48; u < .5; u += .16) B(u, u + .07, .88, .93, 8, 8.45, tile);
  }

  for (let i = 0; i < streets.length; i++) {
    const [x, z, ry = 0, ground = 0, id = 0] = streets[i], P = (u, y, v = 0) => [x + u * Math.cos(ry) + v * Math.sin(ry), ground + y, z - u * Math.sin(ry) + v * Math.cos(ry)];
    beam(P(0, 0), P(0, 8.5), .115, stone, 8);
    beam(P(-1.15, 7.5), P(1.15, 7.5), .055, steel);
    for (const u of [-.9, 0, .9]) for (let y = 7.6; y < 7.93; y += .11) beam(P(u, y), P(u, y + .06), .095, ivory);
    beam(P(.34, 5.1), P(.34, 6.2), .3, ivory, 10);
    beam(P(.34, 6.2), P(.34, 6.35), .34, steel, 10);
    beam(P(.3, 4.2), P(.3, 5.1), .027, steel);
    for (let y = .2; y < 1.4; y += .2) beam(P(0, y), P(0, y + .08), .123, tile, 8);
    sign(...P(0, 2.8, .14), id === 1 || id === 4 ? 1.6 : .85, id === 1 || id === 4 ? 1.1 : .85, id, ry);
    solid(x - .14, x + .14, ground, ground + 8.5, z - .14, z + .14);
    const next = streets[i + 1];
    if (next && Math.hypot(next[0] - x, next[1] - z) < 85) for (const off of [-.8, 0, .8]) for (let j = 0; j < 6; j++) {
      const at = t => [x + (next[0] - x) * t + off * Math.cos(ry), ground + 8 - 1.2 * Math.sin(t * Math.PI), z + (next[1] - z) * t - off * Math.sin(ry)];
      beam(at(j / 6), at((j + 1) / 6), .015, steel, 4);
    }
  }
}

export function japaneseBuilder(b, sites) {
  const mat = col => col[4] === 8 ? (b.B.portGround ? 'portGround' : 'concrete') : col[4] === 4 ? (b.B.portGlass ? 'portGlass' : 'glass') : col[4] === 1 ? 'concrete' : (col[4] === 5 || col[4] === 6) && b.B.landmarkPaint ? 'landmarkPaint' : col[4] === 6 && b.B.painted ? 'painted' : col[4] === 2 || col[4] === 6 ? 'metal' : 'rust';
  japaneseScenery({
    box: (a,c,d,e,f,g,col) => b.deco(mat(col),a,c,d,e,f,g,{tint:col.slice(0,3),shade:()=>1}),
    face: (a,c,d,e,col) => b.B[mat(col)].quad(a,c,d,e,faceNormal(a,c,d),[1,1,1,1],null,col.slice(0,3)),
    sign: (points,id,aspect) => b.B.civic.quad(...points,faceNormal(...points),[1,1,1,1],civicUV(id,id===2&&aspect>2)),
    shop: (points,id,reverse) => {const distance=(a,b)=>Math.hypot(...a.map((v,i)=>v-b[i])),uv=shopUV(id,distance(points[0],points[1])/distance(points[1],points[2])>2);if(reverse){uv.reverse();const sum=uv[0][0]+uv[1][0];for(const p of uv)p[0]=sum-p[0];}b.B.sign.quad(...points,faceNormal(...points),[1,1,1,1],uv);},
    solid: bounds => b.solid.add({...bounds,mat:'concrete'}),
  },sites);
}


function faceNormal(a,b,c) {
  const u=b.map((v,i)=>v-a[i]),v=c.map((n,i)=>n-a[i]);
  const n=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]],length=Math.hypot(...n);
  return n.map(x=>x/(length||1));
}
