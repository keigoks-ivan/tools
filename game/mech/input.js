// 操作輸入：鍵盤＋滑鼠（指標鎖定）＋觸控
// 每幀讀 state，讀完呼叫 endFrame() 清掉「這一幀剛按下／放開」的旗標
export class Input {
  // Fallback is opt-in: the existing Iron Dusk games keep pointer-lock-only aiming.
  constructor(canvas, { mouseFallback = false } = {}) {
    this.canvas = canvas;
    this.keys = new Set();
    this.down = new Set();      // 這一幀剛按下
    this.up = new Set();        // 這一幀剛放開
    this.mdx = 0; this.mdy = 0; // 滑鼠位移（累積到下一幀）
    this.sens = 1;
    this.locked = false;
    this._enabled = false;
    this.mouseFallback = !!mouseFallback;
    this._mouseMode = 'idle';this._fallbackReady = false;this._mouseAnchor = null;this._mouseOnCanvas = false;this._mouseFocused = true;
    this._lockPending = false;this._lockToken = 0;this._lockTimer = null;this._lockAttempt = 0;this._lockUsesPromise = false;
    this.mouseFallbackReason = null;this.onMouseModeChange = null;
    this.touch = { on: false, mx: 0, my: 0, look: null, pad: null };
    this.shiftT = 0;            // Shift 按住多久（分辨點一下＝閃避、按住＝衝刺）
    this.onLockChange = null;

    // Safari 的固定定位觸控區仍可能觸發連點縮放；遊戲操作已由 pointer 事件處理。
    const preventTouchZoom = (e) => { if (this.enabled && e.cancelable) e.preventDefault(); };
    for (const surface of [canvas, document.getElementById('touch')]) {
      if (surface) surface.addEventListener('touchend', preventTouchZoom, { passive: false });
    }

    addEventListener('keydown', (e) => {
      if (!this.enabled) return;
      if(this.mouseFallback&&(!this._mouseFocused||document.hidden))return;
      const k = e.code;
      if (['Tab', 'Space', 'ShiftLeft', 'ShiftRight'].includes(k)) e.preventDefault();
      if (!this.keys.has(k)) this.down.add(k);
      this.keys.add(k);
    });
    addEventListener('keyup', (e) => { const k = e.code; if (this.keys.has(k)) this.up.add(k); this.keys.delete(k); });
    addEventListener('blur', () => { this._mouseFocused = false;this.reset();this._refreshMouseMode(); });
    addEventListener('focus', () => { this._mouseFocused = true;this._mouseAnchor = null;this._refreshMouseMode(); });
    if(this.mouseFallback)document.addEventListener('visibilitychange',()=>{if(document.hidden)this.reset();this._refreshMouseMode();});
    canvas.addEventListener('mousedown', (e) => {
      if (!this.enabled) return;
      if(this.mouseFallback&&(this.touch.on||e.sourceCapabilities?.firesTouchEvents||!this._mouseFocused||document.hidden))return;
      const k = 'M' + e.button;
      if(!this.mouseFallback||!this.keys.has(k))this.down.add(k);this.keys.add(k);
      if(this.mouseMode==='fallback'){
        this._mouseOnCanvas=this._mouseOnCanvas&&this._mouseAnchor?.x===e.clientX&&this._mouseAnchor?.y===e.clientY;
        this._mouseAnchor={x:e.clientX,y:e.clientY};
      }
      if (!this.locked && !this.touch.on) this.lock();
    });
    addEventListener('mouseup', (e) => { const k = 'M' + e.button; if (this.keys.has(k)) this.up.add(k); this.keys.delete(k); });
    addEventListener('contextmenu', (e) => e.preventDefault());
    addEventListener('mousemove', (e) => {
      if (!this.locked) { this._fallbackMouseMove(e);return; }
      if(this.mouseFallback&&(!this.enabled||!this._mouseFocused||document.hidden))return;
      if(this.mouseFallback&&(!Number.isFinite(e.movementX)||!Number.isFinite(e.movementY)))return;
      // 過濾部分瀏覽器剛鎖定時的大跳動
      if (Math.abs(e.movementX) > 400 || Math.abs(e.movementY) > 400) return;
      this.mdx += e.movementX; this.mdy += e.movementY;
    });
    if(this.mouseFallback){
      const leave=()=>{if(!this.locked){this._mouseAnchor=null;this._mouseOnCanvas=false;this._releaseMouseButtons();}};
      canvas.addEventListener('mouseleave',leave);canvas.addEventListener('pointercancel',leave);
      // A new entry starts a new baseline: cursor movement outside the game is never aim.
      canvas.addEventListener('mouseenter',()=>{this._mouseAnchor=null;this._mouseOnCanvas=false;});
      document.addEventListener('pointerlockerror',()=>{
        if(this._lockPending&&!this._lockUsesPromise)this._lockFailed(this._lockToken,this._lockAttempt);
      });
    }
    document.addEventListener('pointerlockchange', () => {
      const wasLocked=this.locked;
      this.locked = document.pointerLockElement === canvas;
      if(this.mouseFallback){
        if(this.locked){this._cancelLockAttempt();this._fallbackReady=false;this.mouseFallbackReason=null;this._mouseAnchor=null;this._mouseOnCanvas=false;this.mdx=this.mdy=0;}
        else if(wasLocked)this.reset();
        this._refreshMouseMode();
        // Acquisition failure is handled by fallback, actual Escape/unlock still pauses.
        if(this.onLockChange&&(this.locked||wasLocked))this.onLockChange(this.locked);
      }else{
        if (!this.locked) this.reset();
        if (this.onLockChange) this.onLockChange(this.locked);
      }
    });
    this.initTouch();
  }

  reset() {
    this.keys.clear(); this.down.clear(); this.up.clear();
    this.mdx = this.mdy = this.shiftT = 0;
    this.touch.mx = this.touch.my = 0; this.touch.pad = this.touch.look = null;
    this._mouseAnchor=null;this._mouseOnCanvas=false;
    if(this.mouseFallback)this._cancelLockAttempt();
    const knob = document.querySelector('#tPad i');
    if (knob) knob.style.transform = '';
  }

  get enabled(){return this._enabled;}
  set enabled(value){this._enabled=!!value;if(!this._enabled&&this.mouseFallback&&this.touch)this.reset();this._refreshMouseMode();}
  get mouseMode(){return this._mouseMode;}
  _refreshMouseMode(){
    const mode=this.enabled&&this._mouseFocused&&!document.hidden&&!this.touch?.on?(this.locked?'locked':this._fallbackReady?'fallback':'idle'):'idle';
    if(mode!==this._mouseMode){this._mouseMode=mode;this._mouseAnchor=null;this._mouseOnCanvas=false;this.onMouseModeChange?.(mode);}
  }
  _releaseMouseButtons(){for(const key of ['M0','M1','M2']){if(this.keys.has(key))this.up.add(key);this.keys.delete(key);}}
  _fallbackMouseMove(e){
    if(!this.mouseFallback||!this._fallbackReady||!this.enabled||!this._mouseFocused||document.hidden||this.touch.on||e.sourceCapabilities?.firesTouchEvents){this._mouseAnchor=null;this._mouseOnCanvas=false;return;}
    // HUD/menu/other-window events must not steer the player underneath the UI.
    const r=this.canvas.getBoundingClientRect(),x=e.clientX,y=e.clientY;
    if(e.target!==this.canvas||!Number.isFinite(x)||!Number.isFinite(y)||x<r.left||x>r.left+r.width||y<r.top||y>r.top+r.height){this._mouseAnchor=null;this._mouseOnCanvas=false;return;}
    const last=this._mouseAnchor;this._mouseAnchor={x,y};this._mouseOnCanvas=true;if(!last)return;
    const dx=x-last.x,dy=y-last.y;
    if(Math.abs(dx)>400||Math.abs(dy)>400){this._mouseOnCanvas=false;return;}
    this.mdx+=dx;this.mdy+=dy;
  }
  _fallbackEdgeLook(dt){
    if(!this.mouseFallback||this.mouseMode!=='fallback'||this.locked||!this.enabled||!this._mouseFocused||document.hidden||this.touch.on||!this._mouseOnCanvas||!this._mouseAnchor||!Number.isFinite(dt)||dt<=0)return {x:0,y:0};
    const r=this.canvas.getBoundingClientRect(),anchor=this._mouseAnchor;
    // A small edge band allows full turns in embedded/narrow windows without pointer lock.
    // Smooth penetration controls the rate; stationary cursors in the center never rotate.
    const rate=(at,start,size)=>{
      const band=Math.min(32,size*.18);if(band<=0||at<start||at>start+size)return 0;
      const left=(band-(at-start))/band,right=(band-(start+size-at))/band;
      const amount=Math.max(0,Math.min(1,Math.max(left,right)));
      return (right>left?1:-1)*amount*amount*(3-2*amount);
    };
    return {x:rate(anchor.x,r.left,r.width)*1.85*dt,y:rate(anchor.y,r.top,r.height)*.8*dt};
  }
  _cancelLockAttempt(){
    this._lockPending=false;this._lockToken++;
    if(this._lockTimer!=null){clearTimeout(this._lockTimer);this._lockTimer=null;}
  }
  _activateFallback(reason){
    this._cancelLockAttempt();this._fallbackReady=true;this.mouseFallbackReason=reason;this._mouseAnchor=null;this._refreshMouseMode();
  }
  _lockFailed(token,attempt){
    if(!this._lockPending||token!==this._lockToken||attempt!==this._lockAttempt)return;
    if(attempt===0)this._requestLock(token,1);else this._activateFallback('denied');
  }
  _requestLock(token,attempt){
    this._lockAttempt=attempt;this._lockUsesPromise=false;
    try{
      const request=attempt===0?this.canvas.requestPointerLock({unadjustedMovement:true}):this.canvas.requestPointerLock();
      if(request&&typeof request.catch==='function'){this._lockUsesPromise=true;request.catch(()=>this._lockFailed(token,attempt));}
    }catch{this._lockFailed(token,attempt);}
  }

  lock({retry=false}={}) {
    if(this.mouseFallback){
      if(!this.enabled||!this._mouseFocused||document.hidden||this.touch.on||this.locked||this._lockPending)return;
      if(this._fallbackReady&&!retry){this._refreshMouseMode();return;}
      if(typeof this.canvas.requestPointerLock!=='function'){this._activateFallback('unsupported');return;}
      this._fallbackReady=false;this._lockPending=true;const token=++this._lockToken;this._refreshMouseMode();
      // Some embedded browsers neither reject nor emit pointerlockerror. Bound that wait.
      this._lockTimer=setTimeout(()=>{if(this._lockPending&&token===this._lockToken)this._activateFallback('timeout');},800);
      this._requestLock(token,0);return;
    }
    try { const p = this.canvas.requestPointerLock({ unadjustedMovement: true }); if (p && p.catch) p.catch(() => { try { const r = this.canvas.requestPointerLock(); if (r && r.catch) r.catch(() => {}); } catch (e2) {} }); }
    catch (e) { try { this.canvas.requestPointerLock(); } catch (e2) {} }
  }
  unlock() { if (document.pointerLockElement) document.exitPointerLock(); }

  held(k) { return this.keys.has(k); }
  pressed(k) { return this.down.has(k); }
  released(k) { return this.up.has(k); }

  // 一幀的操作狀態
  state(dt) {
    const K = this.keys, T = this.touch;
    let mx = (K.has('KeyD') ? 1 : 0) - (K.has('KeyA') ? 1 : 0);
    let my = (K.has('KeyW') ? 1 : 0) - (K.has('KeyS') ? 1 : 0);
    if (T.on) { mx += T.mx; my += T.my; }
    const L = Math.hypot(mx, my);
    if (L > 1) { mx /= L; my /= L; }
    const shift = K.has('ShiftLeft') || K.has('ShiftRight') || K.has('Tboost');
    const shiftDown = this.down.has('ShiftLeft') || this.down.has('ShiftRight') || this.down.has('Tboost');
    if (shift) this.shiftT += dt; else this.shiftT = 0;
    const edge=this._fallbackEdgeLook(dt);
    const lookX = this.mdx * 0.0022 * this.sens+edge.x, lookY = this.mdy * 0.0022 * this.sens+edge.y;
    this.mdx = 0; this.mdy = 0;
    return {
      mx, my, lookX, lookY,
      fire: K.has('M0') || K.has('Tfire'),
      lockHold: K.has('M2') || K.has('Tmsl'),
      lockRelease: this.up.has('M2') || this.up.has('Tmsl'),
      qb: shiftDown,                                // 點一下 Shift：快速閃避
      boost: shift && this.shiftT > 0.18,           // 按住：衝刺滑行
      jump: this.down.has('Space') || this.down.has('Tjump'),
      hover: K.has('Space') || K.has('Tjump'),
      flight: this.down.has('KeyT') || this.down.has('Tflight'),
      descend: K.has('KeyC') || K.has('ControlLeft') || K.has('ControlRight') || K.has('Tdescend'),
      saber: this.down.has('KeyF') || this.down.has('Tsaber'),
      cannon: this.down.has('KeyE') || this.down.has('Tcannon'),
      hardLock: this.down.has('Tab') || this.down.has('M1') || this.down.has('Tlock'),
      od: this.down.has('KeyQ') || this.down.has('Tod'),
      reload: this.down.has('KeyR'),
      view: this.down.has('KeyV') || this.down.has('Tview'),   // 切換視角：駕駛艙／機體後方
      pause: this.down.has('Escape') || this.down.has('KeyP'),
    };
  }
  endFrame() { this.down.clear(); this.up.clear(); }

  // ---- 觸控：左下搖桿走路、右半邊拖曳瞄準、按鈕
  initTouch() {
    const T = this.touch, el = (id) => document.getElementById(id);
    const pad = el('tPad'), look = el('tLook');
    if (!pad || !look) return;
    const coarse = matchMedia('(pointer: coarse)').matches;
    if (!coarse) return;
    T.on = true;
    const knob = pad.querySelector('i');
    pad.addEventListener('pointerdown', (e) => { if(this.mouseFallback&&!this.enabled)return;T.pad = e.pointerId; pad.setPointerCapture(e.pointerId); move(e); });
    const move = (e) => {
      if(this.mouseFallback&&!this.enabled)return;
      if (e.pointerId !== T.pad) return;
      const r = pad.getBoundingClientRect();
      let x = (e.clientX - r.left) / r.width * 2 - 1, y = (e.clientY - r.top) / r.height * 2 - 1;
      const L = Math.hypot(x, y); if (L > 1) { x /= L; y /= L; }
      T.mx = x; T.my = -y;
      knob.style.transform = `translate(${x * 45}px, ${y * 45}px)`;
    };
    pad.addEventListener('pointermove', move);
    const end = (e) => { if (e.pointerId !== T.pad) return; T.pad = null; T.mx = T.my = 0; knob.style.transform = ''; };
    pad.addEventListener('pointerup', end); pad.addEventListener('pointercancel', end);
    let last = null;
    look.addEventListener('pointerdown', (e) => { if(this.mouseFallback&&!this.enabled)return;T.look = e.pointerId; last = [e.clientX, e.clientY]; look.setPointerCapture(e.pointerId); });
    look.addEventListener('pointermove', (e) => {
      if(this.mouseFallback&&!this.enabled)return;
      if (e.pointerId !== T.look) return;
      this.mdx += (e.clientX - last[0]) * 2.2; this.mdy += (e.clientY - last[1]) * 2.2;
      last = [e.clientX, e.clientY];
    });
    const lend = (e) => { if (e.pointerId === T.look) T.look = null; };
    look.addEventListener('pointerup', lend); look.addEventListener('pointercancel', lend);
    const btn = (id, key) => {
      const b = el(id); if (!b) return;
      b.addEventListener('pointerdown', (e) => { if(this.mouseFallback&&!this.enabled)return;e.stopPropagation(); this.keys.add(key); this.down.add(key); b.setPointerCapture(e.pointerId); });
      const off = () => { if (this.keys.has(key)) this.up.add(key); this.keys.delete(key); };
      b.addEventListener('pointerup', off); b.addEventListener('pointercancel', off);
    };
    btn('tFire', 'Tfire'); btn('tBoost', 'Tboost'); btn('tJump', 'Tjump'); btn('tMsl', 'Tmsl'); btn('tSaber', 'Tsaber'); btn('tCannon', 'Tcannon'); btn('tOd', 'Tod'); btn('tLock', 'Tlock'); btn('tView', 'Tview'); btn('tNade', 'Tnade'); btn('tSupport', 'Tsupport'); btn('tScout', 'Tscout'); btn('tFlight','Tflight'); btn('tDescend','Tdescend');
  }
}
