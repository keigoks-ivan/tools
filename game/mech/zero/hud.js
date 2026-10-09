// 介面（2D canvas）：準心、命中標記、彈量、生命／護盾、受擊方向、目標標記、無線電字幕、狙擊鏡、互動提示
import * as THREE from 'three';

const clamp = THREE.MathUtils.clamp;
const CY = '#7ff3ff', AM = '#ffb347', RD = '#ff4a4a';

export class HUD {
  constructor(canvas, camera) {
    this.c = canvas; this.x = canvas.getContext('2d'); this.cam = camera;
    this.hit = 0; this.head = 0; this.kill = 0;
    this.dmg = [];          // 受擊方向 {a, t}
    this.sub = null;        // 字幕 {who, text, t, T}
    this.subQ = [];
    this.banner = null;     // 章節標題
    this.prompt = null;
    this.obj = null;        // 目標 {p: Vector3, text}
    this.foes = [];         // 尋敵提示 {p: 搜索區域／殘敵即時位置, h: 標記高度, search, exact}
    this.pins = [];         // 任務標記：要炸的目標、要撿的東西 {p, h}
    this.notes = [];
    this.resize(); addEventListener('resize', () => this.resize());
  }
  resize() { const d = Math.min(devicePixelRatio, 2); this.c.width = innerWidth * d; this.c.height = innerHeight * d; this.d = d; }
  // now＝戰鬥喊話（發現敵人、狙擊手、重裝兵）：插隊馬上播，不排在一長串劇情對白後面；
  //   被打斷的劇情句還沒看完七成就放回隊伍最前面，喊話播完從頭再播一次
  say(who, text, t = 3.5, now = false) {
    const it = { who, text, t, T: t, now };
    if (!now) { this.subQ.push(it); return; }
    const cur = this.sub;
    if (cur && !cur.now) { if (cur.T - cur.t < cur.T * 0.7) { cur.t = cur.T; this.subQ.unshift(cur); } this.sub = null; }
    let i = 0; while (i < this.subQ.length && this.subQ[i].now) i++;
    this.subQ.splice(i, 0, it);
  }
  title(big, small, t = 4) { this.banner = { big, small, t, T: t }; }
  note(text, color = CY) { this.notes.push({ text, t: 2, color }); if (this.notes.length > 4) this.notes.shift(); }
  hurt(angle) { this.dmg.push({ a: angle, t: 1.2 }); }
  // 命中標記：kind＝hit（白）｜armor（冷藍：重裝兵的裝甲擋掉一部分）｜head（琥珀）｜kill（紅、大）；還亮著時不會被比較輕的蓋掉
  marker(kind) { const R = { hit: 0, armor: 1, head: 2, kill: 3 }; if (this.hit > 0.12 && R[this.mk] > R[kind]) return; this.mk = kind; this.hit = kind === 'kill' ? 0.5 : 0.32; }

  draw(dt, G) {
    const x = this.x, d = this.d, W = this.c.width / d, H = this.c.height / d;
    x.setTransform(d, 0, 0, d, 0, 0);
    x.clearRect(0, 0, W, H);
    if (!G || !G.playing) { this._subs(dt, W, H); this._banner(dt, W, H); return; }
    const vm = G.vm, P = G.player, cx = W / 2, cy = H / 2;
    if(G.ground?.occupied){G.ground.draw(this,W,H);if(this.obj)this._objective(W,H,G);this._radar(W,H,G);this._subs(dt,W,H);this._banner(dt,W,H);this.hit=Math.max(0,this.hit-dt);return;}
    if (G.scout?.active) { this._scout(W, H, G); this.hit = Math.max(0, this.hit - dt); this._radar(W, H, G); this._subs(dt, W, H); this._banner(dt, W, H); return; }
    this.clearAim = vm.cur === 'smg' && vm.ads > .5 ? Math.min(W,H)*.09 : 0;
    // ---- 狙擊鏡
    if (vm.scoped) this._scope(W, H, G);
    // ---- 準心（依散布張開）
    else if (!P.dead) {
      const W0 = vm.W, spread = vm.spreadNow ?? THREE.MathUtils.lerp(W0.spread * (1 + P.moveK * 0.8 + (P.grounded ? 0 : 1.5)), W0.adsSpread, vm.ads);   // 跟子彈用同一個散布（連射會張開）
      const px = spread / Math.tan(THREE.MathUtils.degToRad(this.cam.fov / 2)) * (H / 2) + 4 + vm.kick.z * 2;
      const a = 1 - vm.ads * (vm.cur === 'smg' ? 1 : 0.85) - P.sprintK;
      if (a > 0.05) {
        x.globalAlpha = clamp(a, 0, 1);
        x.strokeStyle = 'rgba(230,250,255,0.9)'; x.lineWidth = 1.5; x.shadowColor = 'rgba(0,0,0,0.6)'; x.shadowBlur = 3;
        x.beginPath();
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { x.moveTo(cx + dx * px, cy + dy * px); x.lineTo(cx + dx * (px + 8), cy + dy * (px + 8)); }
        x.stroke();
        x.fillStyle = 'rgba(230,250,255,0.9)'; x.fillRect(cx - 1, cy - 1, 2, 2);
        x.shadowBlur = 0; x.globalAlpha = 1;
      }
      // 衝鋒槍的反射瞄點對準實際射線；黑邊在亮天空和暗室內都能辨識。
      if (vm.cur === 'smg' && vm.ads > .5 && !vm.busy && P.sprintK < .35) {
        x.globalAlpha = clamp((vm.ads - .5) * 2, 0, 1);
        x.beginPath(); x.arc(cx,cy,2.2,0,Math.PI*2); x.fillStyle='rgba(18,13,9,.85)'; x.fill();
        x.beginPath(); x.arc(cx,cy,1.2,0,Math.PI*2); x.fillStyle='#ffb568'; x.fill(); x.globalAlpha=1;
      } else if (vm.cur === 'pistol' && vm.ads > .5) { x.fillStyle = 'rgba(127,243,255,0.9)'; x.fillRect(cx - 1.5, cy - 1.5, 3, 3); }
    }
    // ---- 被打到的敵人頭上的血條
    if (G.enemies) this._bars(dt, W, H, G);
    // ---- 命中標記：斜的四短線從準心往外彈開，外圈一層深色描邊（亮的背景也看得清楚）
    if (this.hit > 0) {
      const K = this.mk || 'hit', k = clamp(this.hit / (K === 'kill' ? 0.5 : 0.32), 0, 1), pop = 1 - k;
      const r = (K === 'kill' ? 11 : K === 'head' ? 10 : 8) + pop * 6, len = K === 'kill' ? 12 : K === 'armor' ? 6 : 9, lw = K === 'kill' ? 3.5 : 2.6;
      x.globalAlpha = Math.min(1, k * 1.8); x.lineCap = 'round';
      x.beginPath();
      for (const [sx, sy] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) { x.moveTo(cx + sx * r, cy + sy * r); x.lineTo(cx + sx * (r + len), cy + sy * (r + len)); }
      x.strokeStyle = 'rgba(0,0,0,0.55)'; x.lineWidth = lw + 2.5; x.stroke();
      x.strokeStyle = K === 'kill' ? RD : K === 'head' ? AM : K === 'armor' ? '#9ec3dc' : '#fff'; x.lineWidth = lw; x.stroke();
      x.lineCap = 'butt'; x.globalAlpha = 1;
      this.hit -= dt;
    }
    // ---- 受擊方向（螢幕中央周圍的紅弧）
    for (let i = this.dmg.length - 1; i >= 0; i--) {
      const o = this.dmg[i]; o.t -= dt; if (o.t <= 0) { this.dmg.splice(i, 1); continue; }
      const a = o.a - Math.PI / 2;
      x.strokeStyle = `rgba(255,60,50,${clamp(o.t, 0, 1) * 0.85})`; x.lineWidth = 6;
      x.beginPath(); x.arc(cx, cy, Math.min(W, H) * 0.18, a - 0.35, a + 0.35); x.stroke();
    }
    // ---- 目標標記
    if (this.obj && !vm.scoped) this._objective(W, H, G);
    // ---- 搜索區域（畫面外貼邊用箭頭指方向）
    if (!vm.scoped) for (const f of this.foes) { const p = f.p.clone(); p.y += f.h; this._pin(W, H, p, P.pos.distanceTo(f.p), f.search ? AM : RD, f.exact ? 10 : 7, !!f.exact, f.label || (f.search ? '搜索區域' : '')); }
    if (!vm.scoped && G.field?.waypoint()) { const w = G.field.waypoint(); this._pin(W, H, w.p, P.pos.distanceTo(w.p), '#ceadff', 10, true, w.name); }
    if (!vm.scoped) for (const f of this.pins) { const p = f.p.clone(); p.y += f.h; this._pin(W, H, p, P.pos.distanceTo(f.p), AM, 8, true); }
    // ---- 地上的手榴彈（敵人掉的）：15 m 內、還帶得下才標
    if (!vm.scoped && G.nadeN < 5) for (const L of G.loot) { const dd = P.pos.distanceTo(L.p); if (dd < 15) this._lootTag(W, H, L.p, dd, L.n); }
    // ---- 左下：生命＋護盾
    const bx = 34, by = H - 60, bw = Math.min(260, W * 0.3);
    x.font = '600 12px Rajdhani, sans-serif'; x.fillStyle = '#9fb4bb'; x.textBaseline = 'alphabetic';
    x.fillText('SHIELD', bx, by - 26); x.fillText('VITAL', bx, by + 2);
    this._bar(bx + 52, by - 36, bw, 8, P.shield / 60, CY, 'rgba(127,243,255,0.15)');
    this._bar(bx + 52, by - 8, bw, 12, P.hp / 100, P.hp < 35 ? RD : '#e8f3f6', 'rgba(255,255,255,0.12)');
    // ---- 右下：武器與彈量
    const n = vm.ammo[vm.cur], mag = vm.W.mag;
    const rx = W - 34;
    x.textAlign = 'right';
    x.font = '700 46px Rajdhani, sans-serif'; x.fillStyle = n === 0 ? RD : n <= mag * 0.25 ? AM : '#eef6f8';
    x.fillText(String(n), rx - 70, H - 38);
    x.font = '600 20px Rajdhani, sans-serif'; x.fillStyle = '#8aa3ab'; x.fillText('/ ∞', rx, H - 40);
    x.font = '600 13px Rajdhani, "Noto Sans TC", sans-serif'; x.fillStyle = CY;
    x.fillText(vm.reloadT >= 0 ? 'RELOADING…' : vm.W.name, rx, H - 88);
    // 彈匣格
    for (let i = 0; i < mag; i++) { x.fillStyle = i < n ? 'rgba(127,243,255,0.9)' : 'rgba(127,243,255,0.15)'; const w = Math.min(10, 180 / mag - 2); x.fillRect(rx - (mag - i) * (w + 2), H - 30, w, 5); }
    if (vm.reloadT >= 0) { const k = vm.reloadT / vm.W.reload; x.fillStyle = 'rgba(255,179,71,0.9)'; x.fillRect(rx - 180, H - 22, 180 * k, 2); }
    // 武器切換
    x.font = '600 11px Rajdhani, "Noto Sans TC", sans-serif'; x.fillStyle = '#5d7178';
    x.fillText('[1] 長槍  [2] 手槍  [3] 衝鋒槍 · Q', rx, H - 106);
    // 手榴彈
    x.font = '600 13px Rajdhani, "Noto Sans TC", sans-serif'; x.fillStyle = G.nadeN ? '#b8e07a' : '#5d7178';
    x.fillText(`[G] 手榴彈 ×${G.nadeN}`, rx, H - 124);
    x.textAlign = 'left';
    // ---- 互動提示
    if (this.prompt) {
      x.textAlign = 'center'; x.font = '600 16px Rajdhani, "Noto Sans TC", sans-serif';
      const t = this.prompt; const tw = x.measureText(t).width + 36;
      x.fillStyle = 'rgba(5,12,16,0.65)'; x.fillRect(cx - tw / 2, cy + 60, tw, 30);
      x.strokeStyle = 'rgba(127,243,255,0.6)'; x.strokeRect(cx - tw / 2, cy + 60, tw, 30);
      x.fillStyle = '#e8f3f6'; x.fillText(t, cx, cy + 80); x.textAlign = 'left';
    }
    // ---- 提示訊息（右上）
    let ny = 40;
    for (let i = this.notes.length - 1; i >= 0; i--) {
      const o = this.notes[i]; o.t -= dt; if (o.t <= 0) { this.notes.splice(i, 1); continue; }
      x.globalAlpha = clamp(o.t * 2, 0, 1); x.textAlign = 'right'; x.font = '600 14px Rajdhani, "Noto Sans TC", sans-serif'; x.fillStyle = o.color;
      x.fillText(o.text, W - 34, ny); ny += 20; x.globalAlpha = 1; x.textAlign = 'left';
    }
    // ---- 左上：章節與目標文字
    if (G.objText) {
      x.font = '600 12px Rajdhani, sans-serif'; x.fillStyle = AM; x.fillText(G.chapterTag || '', 34, 40);
      x.font = '500 15px "Noto Sans TC", sans-serif'; x.fillStyle = '#e8f3f6'; x.fillText(G.objText, 34, 62);
      if (G.objSub) { x.font = '500 13px "Noto Sans TC", sans-serif'; x.fillStyle = '#ff9a8a'; x.fillText(G.objSub, 34, 82); }
    }
    if (G.field) { x.font = '500 12px "Noto Sans TC",sans-serif'; x.fillStyle = '#ceadff'; x.fillText('[M] 戰術地圖 · 自由攻略哨站', 34, 104); }
    this._radar(W, H, G);
    G.ground?.draw(this,W,H);
    this._subs(dt, W, H);
    this._banner(dt, W, H);
  }

  _radar(W, H, G) {
    if (!G.contacts || W < 320 || H < 320) return;
    const x=this.x, r=H<550?42:54, cx=34+r, cy=H-154-r, origin=G.scout.active?G.scout.pos:G.player.pos, yaw=G.scout.active?G.scout.yaw:G.player.yaw;
    x.save();x.translate(cx,cy);x.fillStyle='rgba(5,15,20,.78)';x.strokeStyle='rgba(127,243,255,.4)';x.lineWidth=1;
    x.beginPath();x.arc(0,0,r,0,Math.PI*2);x.fill();x.stroke();
    x.strokeStyle='rgba(127,243,255,.15)';x.beginPath();x.arc(0,0,r*.5,0,Math.PI*2);x.moveTo(-r,0);x.lineTo(r,0);x.moveTo(0,-r);x.lineTo(0,r);x.stroke();
    x.save();x.beginPath();x.arc(0,0,r-2,0,Math.PI*2);x.clip();
    const plot=(p,col,hollow=false,size=3)=>{const dx=p.x-origin.x,dz=p.z-origin.z;let px=(-dx*Math.cos(yaw)+dz*Math.sin(yaw))*r/90,py=-(dx*Math.sin(yaw)+dz*Math.cos(yaw))*r/90;const L=Math.hypot(px,py),edge=r-size-3;if(L>edge){px*=edge/L;py*=edge/L;}x.beginPath();x.arc(px,py,size,0,Math.PI*2);x.fillStyle=x.strokeStyle=col;hollow?x.stroke():x.fill();return {px,py};};
    const exactIds=new Set((G.cleanupTargets||[]).map(c=>c.id).filter(id=>id!==undefined));
    for(const area of G.contacts.search||[]){x.globalAlpha=.55;plot(area.p,AM,true,Math.max(6,area.radius*r/90));}
    for(const [id,c] of G.contacts.items){if(exactIds.has(id))continue;x.globalAlpha=c.fresh?1:.8;plot(c.p,c.fresh?RD:AM,!c.fresh);}
    for(const c of G.cleanupTargets||[]){x.globalAlpha=1;const {px,py}=plot(c.p,RD,false,4.5);if(Math.abs(c.altitude)>1.5){x.textAlign='center';x.font='600 10px Rajdhani,sans-serif';x.fillText(c.altitude>0?'▲':'▼',px,py-7);}}
    x.globalAlpha=1;const w=G.field?.waypoint();if(w)plot(w.p,'#ceadff',true,5);if(G.scout.active)plot(G.player.pos,CY);x.restore();
    x.fillStyle=CY;x.beginPath();x.moveTo(0,-5);x.lineTo(4,4);x.lineTo(0,2);x.lineTo(-4,4);x.closePath();x.fill();
    x.shadowColor='rgba(0,0,0,.9)';x.shadowBlur=4;x.textAlign='center';x.font='500 11px "Noto Sans TC",sans-serif';x.fillStyle=CY;x.fillText(G.cleanupTargets?.length?`殘敵定位 ${G.cleanupTargets.length} 名 · 90 m`:`已發現 ${G.contacts.items.size} 名 · 90 m`,0,-r-9);x.fillStyle='#c3b99f';x.fillText('黃點：最後目擊',0,r+15);x.fillText(G.cleanupTargets?.length?'紅點：即時位置 ▲高 ▼低':'黃圈：搜索區域',0,r+30);
    x.textAlign='left';x.fillText(G.scout.destroyed ? `無人機整備 ${Math.ceil(G.scout.cooldown)} 秒` : `[N] 偵察無人機 ${Math.ceil(G.scout.battery/45*100)}%`,-r,r+49);x.restore();
  }
  _scout(W, H, G) {
    const x=this.x,S=G.scout,cx=W/2,cy=H/2;
    x.save();x.shadowColor='rgba(0,0,0,.9)';x.shadowBlur=4;x.strokeStyle=S.hurtT>0?RD:'rgba(127,243,255,.8)';x.lineWidth=1.5;
    for(const [sx,sy] of [[-1,-1],[1,-1],[-1,1],[1,1]]){x.beginPath();x.moveTo(cx+sx*42,cy+sy*25);x.lineTo(cx+sx*42,cy+sy*38);x.lineTo(cx+sx*28,cy+sy*38);x.stroke();}
    x.textAlign='center';x.font='600 16px "Noto Sans TC",sans-serif';x.fillStyle=CY;x.fillText('偵察戰鬥無人機',cx,38);
    x.font='500 12px "Noto Sans TC",sans-serif';x.fillStyle='#edf6f8';x.fillText(`電量 ${Math.ceil(S.battery/45*100)}% · 航程 ${S.pos.distanceTo(G.player.pos).toFixed(0)} / 85 m`,cx,60);
    x.fillText(`耐久 ${Math.ceil(S.hp)} / 45 · 彈藥 ${Math.floor(S.ammo)} / 30`,cx,80);
    x.fillStyle=S.spotted>0?RD:AM;
    if(S.spotted>0||S.exposed>0)x.fillText(S.spotted>0?'敵人已發現・正在反擊':'開火已暴露位置',cx,102);
    if(this.hit>0){x.strokeStyle=this.mk==='kill'?RD:CY;x.beginPath();for(const [sx,sy] of [[-1,-1],[1,-1],[-1,1],[1,1]]){x.moveTo(cx+sx*5,cy+sy*5);x.lineTo(cx+sx*12,cy+sy*12);}x.stroke();}
    x.fillStyle='#edf6f8';x.fillText('左鍵開火 · WASD 飛行 · 空白鍵上升 · C 下降 · N 返回',cx,H-52);x.fillStyle=AM;x.fillText('主角留在原地，遭到攻擊會立即切回',cx,H-30);
    x.textAlign='left';x.fillStyle='#edf6f8';x.fillText(`主角生命 ${Math.ceil(G.player.hp)} · 護盾 ${Math.ceil(G.player.shield)}`,34,40);x.restore();
  }

  _bar(x0, y0, w, h, k, col, bg) {
    const x = this.x;
    x.fillStyle = bg; x.fillRect(x0, y0, w, h);
    x.fillStyle = col; x.fillRect(x0, y0, w * clamp(k, 0, 1), h);
  }

  // 敵人頭上的血條：剛被打到的才顯示（ai.js 的 barT，2.6 秒）；白＝剩下的血（剩一半以下變紅）、淡黃＝這幾發打掉的（慢慢退掉）；
  //   外框冷藍＝重裝兵（有裝甲，打身體只吃六成，打頭才痛）；倒下時血條空掉再消失
  _bars(dt, W, H, G) {
    const x = this.x, v = this._bv || (this._bv = new THREE.Vector3()), R = Math.min(W, H) * 0.46;
    for (const e of G.enemies) {
      if (!(e.barT > 0) || !e.hp0) continue;
      e.barT = e.dead ? Math.min(e.barT, 0.4) - dt : e.barT - dt;
      const f = clamp(e.hp / e.hp0, 0, 1); e.barG = Math.max(f, (e.barG ?? 1) - dt * 0.7);
      if (e.s) e.s.headPos(v).y += 0.34 * e.s.root.scale.y; else v.copy(e.pos).y += 0.6;
      v.project(this.cam); if (v.z > 1) continue;
      const sx = (v.x * 0.5 + 0.5) * W, sy = (-v.y * 0.5 + 0.5) * H, bw = 46, bh = 5;
      if (G.vm.scoped && Math.hypot(sx - W / 2, sy - H / 2) > R) continue;
      x.globalAlpha = clamp(e.barT / 0.4, 0, 1);
      x.fillStyle = 'rgba(0,0,0,0.55)'; x.fillRect(sx - bw / 2 - 1.5, sy - 1.5, bw + 3, bh + 3);
      x.fillStyle = 'rgba(255,214,130,0.95)'; x.fillRect(sx - bw / 2, sy, bw * e.barG, bh);
      x.fillStyle = f > 0.5 ? '#eef6f8' : RD; x.fillRect(sx - bw / 2, sy, bw * f, bh);
      if (e.T && e.T.armor) { x.strokeStyle = '#9ec3dc'; x.lineWidth = 1.5; x.strokeRect(sx - bw / 2 - 3, sy - 3, bw + 6, bh + 6); }
      x.globalAlpha = 1;
    }
  }

  // 目標標記：實心菱形（會輕輕閃）＋剩下幾公尺；跑到畫面外或背後時，貼在畫面邊緣、用箭頭指出方向
  // 地上撿得到的手榴彈：綠色小字，只在畫面內才畫
  _lootTag(W, H, p0, dist, n) {
    const v = p0.clone(); v.y += 0.3; v.project(this.cam);
    if (v.z > 1 || Math.abs(v.x) > 0.95 || Math.abs(v.y) > 0.95) return;
    const x = this.x, sx = (v.x * 0.5 + 0.5) * W, sy = (-v.y * 0.5 + 0.5) * H;
    x.save(); x.globalAlpha = clamp(1.4 - dist / 15, 0.35, 1); x.textAlign = 'center';
    x.shadowColor = 'rgba(0,0,0,0.7)'; x.shadowBlur = 4;
    x.fillStyle = '#b8e07a'; x.beginPath(); x.arc(sx, sy, 3.5, 0, Math.PI * 2); x.fill();
    x.font = '600 12px Rajdhani, "Noto Sans TC", sans-serif'; x.fillText(`手榴彈 ×${n}`, sx, sy - 9);
    x.restore();
  }
  _objective(W, H, G) { this._pin(W, H, this.obj.p, this.obj.left ?? G.player.pos.distanceTo(this.obj.p), AM, 12, true); }
  // 畫一個菱形標記（目標用琥珀色大的、敵人用紅色小的）；pulse＝會不會一閃一閃
  _pin(W, H, p0, dist, col, r0, pulseOn, label = '') {
    const x = this.x, p = p0.clone();
    const v = p.clone().project(this.cam);
    const behind = v.z > 1;
    let sx = (v.x * 0.5 + 0.5) * W, sy = (-v.y * 0.5 + 0.5) * H;
    if (!behind && Math.hypot(sx-W/2,sy-H/2) < this.clearAim) return;
    if (behind) { sx = W - sx; sy = H - sy; }
    const m = 56, cx = W / 2, cy = H / 2;
    const off = behind || sx < m || sx > W - m || sy < m || sy > H - m;
    if (off) {
      // 從畫面中心往目標方向，貼到邊框上
      let dx = sx - cx, dy = sy - cy; if (behind && Math.abs(dy) < 1) dy = 1;
      const k = Math.min((W / 2 - m) / Math.max(1e-3, Math.abs(dx)), (H / 2 - m) / Math.max(1e-3, Math.abs(dy)));
      sx = cx + dx * k; sy = cy + dy * k;
    }
    const pulse = pulseOn ? 0.5 + 0.5 * Math.sin(performance.now() * 0.006) : 0.5;
    x.save(); x.translate(sx, sy);
    x.shadowColor = 'rgba(0,0,0,0.6)'; x.shadowBlur = 6;
    if (off) {
      const a = Math.atan2(sy - cy, sx - cx);
      const k = r0 / 12;
      x.save(); x.rotate(a); x.fillStyle = col; x.globalAlpha = 0.85 + 0.15 * pulse;
      x.beginPath(); x.moveTo(30 * k, 0); x.lineTo(14 * k, -13 * k); x.lineTo(14 * k, 13 * k); x.closePath(); x.fill(); x.restore();
    }
    const r = r0 + pulse * 2;
    x.globalAlpha = 0.86; x.fillStyle = col; x.strokeStyle = '#1b1206'; x.lineWidth = 2;
    x.beginPath(); x.moveTo(0, -r); x.lineTo(r, 0); x.lineTo(0, r); x.lineTo(-r, 0); x.closePath(); x.fill(); x.globalAlpha = 0.95; x.stroke();
    x.fillStyle = '#1b1206'; x.beginPath(); x.arc(0, 0, r0 * 0.27, 0, Math.PI * 2); x.fill();
    x.shadowBlur = 4; x.font = `700 ${r0 > 10 ? 15 : 12}px Rajdhani, sans-serif`; x.fillStyle = col; x.textAlign = 'center';
    x.fillText(`${dist.toFixed(0)} m`, 0, r + (r0 > 10 ? 18 : 14));
    if (label) { x.font = '500 11px "Noto Sans TC",sans-serif'; x.fillText(label, 0, r + 29); }
    x.restore(); x.globalAlpha = 1;
  }

  _scope(W, H, G) {
    const x = this.x, cx = W / 2, cy = H / 2, R = Math.min(W, H) * 0.46;
    // 鏡外全黑、鏡緣暗角
    x.fillStyle = '#000';
    x.beginPath(); x.rect(0, 0, W, H); x.arc(cx, cy, R, 0, Math.PI * 2, true); x.fill();
    const g = x.createRadialGradient(cx, cy, R * 0.75, cx, cy, R);
    g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,0.85)');
    x.fillStyle = g; x.beginPath(); x.arc(cx, cy, R, 0, Math.PI * 2); x.fill();
    // 十字＋刻度
    x.strokeStyle = 'rgba(10,14,16,0.95)'; x.lineWidth = 2;
    x.beginPath(); x.moveTo(cx - R, cy); x.lineTo(cx - 14, cy); x.moveTo(cx + 14, cy); x.lineTo(cx + R, cy); x.moveTo(cx, cy + 14); x.lineTo(cx, cy + R); x.moveTo(cx, cy - R); x.lineTo(cx, cy - 14); x.stroke();
    x.lineWidth = 5; x.beginPath(); x.moveTo(cx - R, cy); x.lineTo(cx - R * 0.55, cy); x.moveTo(cx + R * 0.55, cy); x.lineTo(cx + R, cy); x.moveTo(cx, cy + R * 0.55); x.lineTo(cx, cy + R); x.stroke();
    x.lineWidth = 1.5;
    for (let i = 1; i <= 5; i++) { const o = i * R * 0.08; x.beginPath(); x.moveTo(cx - 5, cy + o); x.lineTo(cx + 5, cy + o); x.moveTo(cx + o, cy - 4); x.lineTo(cx + o, cy + 4); x.moveTo(cx - o, cy - 4); x.lineTo(cx - o, cy + 4); x.stroke(); }
    // 中心紅點
    x.fillStyle = 'rgba(255,60,40,0.95)'; x.beginPath(); x.arc(cx, cy, 2.2, 0, 7); x.fill();
    // 測距、屏息條
    x.font = '600 13px Rajdhani, sans-serif'; x.fillStyle = 'rgba(255,179,71,0.9)'; x.textAlign = 'left';
    x.fillText(`RNG ${G.scopeRange ? G.scopeRange.toFixed(1) : '---'} m`, cx + R * 0.2, cy + R * 0.25);
    x.fillText(`x${(70 / G.vm.W.fov).toFixed(1)}`, cx + R * 0.2, cy + R * 0.25 + 18);
    const b = G.vm.breath;
    x.fillStyle = 'rgba(127,243,255,0.2)'; x.fillRect(cx - 60, cy + R * 0.72, 120, 4);
    x.fillStyle = G.vm.holding ? CY : 'rgba(127,243,255,0.6)'; x.fillRect(cx - 60, cy + R * 0.72, 120 * b, 4);
    x.textAlign = 'center'; x.fillStyle = 'rgba(200,230,240,0.6)'; x.font = '500 11px "Noto Sans TC", sans-serif';
    x.fillText(G.vm.holding ? '屏息中' : 'SHIFT 屏息', cx, cy + R * 0.72 + 18);
    x.textAlign = 'left';
  }

  _subs(dt, W, H) {
    const x = this.x;
    if (!this.sub && this.subQ.length) this.sub = this.subQ.shift();
    const s = this.sub; if (!s) return;
    s.t -= dt; if (s.t <= 0) { this.sub = null; return; }
    const a = clamp(Math.min(s.t, s.T - s.t) * 4, 0, 1);
    x.globalAlpha = a; x.textAlign = 'center';
    x.font = '500 17px "Noto Sans TC", sans-serif';
    const line = s.text, who = s.who;
    const tw = x.measureText(line).width;
    const L = this.lift || 0;   // 第 6 章（機體 HUD 在下面）往上移
    x.fillStyle = 'rgba(0,0,0,0.45)'; x.fillRect(W / 2 - tw / 2 - 16, H - 150 - L, tw + 32, 50);
    x.font = '600 12px Rajdhani, "Noto Sans TC", sans-serif'; x.fillStyle = who.startsWith('獵犬') || who.startsWith('黑犬') ? RD : AM; x.fillText(who, W / 2, H - 132 - L);
    x.font = '500 17px "Noto Sans TC", sans-serif'; x.fillStyle = '#eef6f8'; x.fillText(line, W / 2, H - 110 - L);
    x.globalAlpha = 1; x.textAlign = 'left';
  }

  _banner(dt, W, H) {
    const b = this.banner; if (!b) return;
    b.t -= dt; if (b.t <= 0) { this.banner = null; return; }
    const a = clamp(Math.min(b.t, b.T - b.t) * 2, 0, 1), x = this.x;
    x.globalAlpha = a; x.textAlign = 'center';
    x.font = '700 38px Rajdhani, "Noto Sans TC", sans-serif'; x.fillStyle = '#eef6f8'; x.shadowColor = 'rgba(127,243,255,0.5)'; x.shadowBlur = 18;
    x.fillText(b.big, W / 2, H * 0.3);
    x.shadowBlur = 0;
    x.font = '500 16px "Noto Sans TC", sans-serif'; x.fillStyle = AM; x.fillText(b.small, W / 2, H * 0.3 + 32);
    x.globalAlpha = 1; x.textAlign = 'left';
  }
}
