// 操作輸入：鍵盤＋滑鼠（指標鎖定）＋觸控
// 每幀讀 state，讀完呼叫 endFrame() 清掉「這一幀剛按下／放開」的旗標
export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.keys = new Set();
    this.down = new Set();      // 這一幀剛按下
    this.up = new Set();        // 這一幀剛放開
    this.mdx = 0; this.mdy = 0; // 滑鼠位移（累積到下一幀）
    this.sens = 1;
    this.locked = false;
    this.enabled = false;
    this.touch = { on: false, mx: 0, my: 0, look: null, pad: null };
    this.shiftT = 0;            // Shift 按住多久（分辨點一下＝閃避、按住＝衝刺）
    this.onLockChange = null;

    addEventListener('keydown', (e) => {
      if (!this.enabled) return;
      const k = e.code;
      if (['Tab', 'Space', 'ShiftLeft', 'ShiftRight'].includes(k)) e.preventDefault();
      if (!this.keys.has(k)) this.down.add(k);
      this.keys.add(k);
    });
    addEventListener('keyup', (e) => { const k = e.code; if (this.keys.has(k)) this.up.add(k); this.keys.delete(k); });
    addEventListener('blur', () => this.reset());
    canvas.addEventListener('mousedown', (e) => {
      if (!this.enabled) return;
      const k = 'M' + e.button;
      this.keys.add(k); this.down.add(k);
      if (!this.locked && !this.touch.on) this.lock();
    });
    addEventListener('mouseup', (e) => { const k = 'M' + e.button; if (this.keys.has(k)) this.up.add(k); this.keys.delete(k); });
    addEventListener('contextmenu', (e) => e.preventDefault());
    addEventListener('mousemove', (e) => {
      if (!this.locked) return;
      // 過濾部分瀏覽器剛鎖定時的大跳動
      if (Math.abs(e.movementX) > 400 || Math.abs(e.movementY) > 400) return;
      this.mdx += e.movementX; this.mdy += e.movementY;
    });
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === canvas;
      if (!this.locked) this.reset();
      if (this.onLockChange) this.onLockChange(this.locked);
    });
    this.initTouch();
  }

  reset() {
    this.keys.clear(); this.down.clear(); this.up.clear();
    this.mdx = this.mdy = this.shiftT = 0;
    this.touch.mx = this.touch.my = 0; this.touch.pad = this.touch.look = null;
    const knob = document.querySelector('#tPad i');
    if (knob) knob.style.transform = '';
  }

  lock() {
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
    const lookX = this.mdx * 0.0022 * this.sens, lookY = this.mdy * 0.0022 * this.sens;
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
    pad.addEventListener('pointerdown', (e) => { T.pad = e.pointerId; pad.setPointerCapture(e.pointerId); move(e); });
    const move = (e) => {
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
    look.addEventListener('pointerdown', (e) => { T.look = e.pointerId; last = [e.clientX, e.clientY]; look.setPointerCapture(e.pointerId); });
    look.addEventListener('pointermove', (e) => {
      if (e.pointerId !== T.look) return;
      this.mdx += (e.clientX - last[0]) * 2.2; this.mdy += (e.clientY - last[1]) * 2.2;
      last = [e.clientX, e.clientY];
    });
    const lend = (e) => { if (e.pointerId === T.look) T.look = null; };
    look.addEventListener('pointerup', lend); look.addEventListener('pointercancel', lend);
    const btn = (id, key) => {
      const b = el(id); if (!b) return;
      b.addEventListener('pointerdown', (e) => { e.stopPropagation(); this.keys.add(key); this.down.add(key); b.setPointerCapture(e.pointerId); });
      const off = () => { if (this.keys.has(key)) this.up.add(key); this.keys.delete(key); };
      b.addEventListener('pointerup', off); b.addEventListener('pointercancel', off);
    };
    btn('tFire', 'Tfire'); btn('tBoost', 'Tboost'); btn('tJump', 'Tjump'); btn('tMsl', 'Tmsl'); btn('tSaber', 'Tsaber'); btn('tCannon', 'Tcannon'); btn('tOd', 'Tod'); btn('tLock', 'Tlock'); btn('tView', 'Tview'); btn('tNade', 'Tnade'); btn('tSupport', 'Tsupport'); btn('tScout', 'Tscout');
  }
}
