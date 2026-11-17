const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
const axis = value => Math.abs(value) > .16 ? Math.sign(value) * ((Math.abs(value) - .16) / .84) ** 1.55 : 0;
const driveKeys = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'Space', 'KeyC', 'ControlLeft', 'ShiftLeft', 'ShiftRight', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown']);

export function createControls(canvas, nodes, {onMode, onEscape}) {
  const keys = new Set(), fingers = new Map();
  let driving = false, yaw = 0, pitch = 0, mode = matchMedia('(pointer: coarse)').matches ? 'touch' : 'mouse';
  let drag = null, mouse = 0, missileCancel = false, seenPad = false, padUsed = false, padId = -1;
  let menuSignal = '', menuNext = 0;
  const pressed = (pad, index) => (pad.buttons[index]?.value || 0) > .35;
  const sayMode = value => { if (value !== mode) { mode = value; onMode(value); } };
  const look = (dx, dy) => {
    yaw = (yaw - dx + Math.PI * 3) % (Math.PI * 2) - Math.PI;
    pitch = clamp(pitch - dy, -1.18, 1.18);
  };
  function cancel() {
    keys.clear(); mouse = 0; drag = null;
    for (const finger of fingers.values()) finger.target.removeAttribute('data-held');
    fingers.clear(); nodes.move.firstElementChild.style.transform = '';
    missileCancel = true;
  }
  function retainMode() {
    if (mode === 'pad') { sayMode(matchMedia('(pointer: coarse)').matches ? 'touch' : 'mouse'); }
  }
  addEventListener('keydown', event => {
    if (event.code === 'Escape' && !event.repeat) onEscape();
    if (!driving || !driveKeys.has(event.code) || event.target.closest?.('button,input,a,summary')) return;
    sayMode('mouse'); keys.add(event.code); event.preventDefault();
  });
  addEventListener('keyup', event => keys.delete(event.code));
  addEventListener('blur', cancel);
  addEventListener('visibilitychange', () => { if (document.hidden) cancel(); });
  addEventListener('gamepaddisconnected', event => {
    if (event.gamepad.index === padId) { seenPad = false; padId = -1; retainMode(); cancel(); }
  });
  canvas.addEventListener('contextmenu', event => event.preventDefault());
  canvas.addEventListener('pointerdown', event => {
    if (!driving || event.pointerType === 'touch' || event.button > 2) return;
    sayMode('mouse'); mouse = event.buttons;
    if (document.pointerLockElement !== canvas) {
      drag = {id: event.pointerId, x: event.clientX, y: event.clientY};
      canvas.setPointerCapture?.(event.pointerId);
      try { canvas.requestPointerLock?.()?.catch(() => {}); } catch {}
    }
    event.preventDefault();
  });
  addEventListener('pointermove', event => {
    if (!driving || event.pointerType === 'touch') return;
    if (document.pointerLockElement === canvas) {
      look(event.movementX * .00255, event.movementY * .00255);
    } else if (drag?.id === event.pointerId) {
      look((event.clientX - drag.x) * .0034, (event.clientY - drag.y) * .0034);
      drag.x = event.clientX; drag.y = event.clientY;
    }
  });
  addEventListener('pointerup', event => {
    if (event.pointerType === 'touch') return;
    mouse = event.buttons;
    if (!mouse && event.pointerId === drag?.id) drag = null;
  });
  addEventListener('pointercancel', event => { if (event.pointerType !== 'touch') cancel(); });
  document.addEventListener('pointerlockchange', () => {
    if (document.pointerLockElement !== canvas && driving) cancel();
  });

  function moveFinger(finger, event) {
    const dx = event.clientX - finger.x, dy = event.clientY - finger.y;
    if (finger.action === 'move') {
      const r = finger.target.getBoundingClientRect(), scale = r.width * .32;
      const mx = (event.clientX - r.left - r.width / 2) / scale, mz = (r.top + r.height / 2 - event.clientY) / scale;
      const mag = Math.max(1, Math.hypot(mx, mz));
      finger.mx = mx / mag; finger.mz = mz / mag;
      finger.target.firstElementChild.style.transform = `translate(${finger.mx * scale}px, ${-finger.mz * scale}px)`;
    } else if (finger.action === 'look' || finger.action === 'fire' || finger.action === 'missile') {
      look(dx * .006, dy * .006);
    }
    finger.x = event.clientX; finger.y = event.clientY;
  }
  function bindFinger(target, action) {
    target.addEventListener('pointerdown', event => {
      if (event.pointerType !== 'touch' || !driving || [...fingers.values()].some(finger => finger.action === action)) return;
      sayMode('touch');
      const finger = {target, action, x: event.clientX, y: event.clientY};
      fingers.set(event.pointerId, finger);
      target.setPointerCapture?.(event.pointerId);
      target.setAttribute('data-held', '');
      moveFinger(finger, event);
      event.preventDefault();
    });
    target.addEventListener('pointermove', event => {
      const finger = fingers.get(event.pointerId);
      if (finger?.target === target) { moveFinger(finger, event); event.preventDefault(); }
    });
    function release(event) {
      const finger = fingers.get(event.pointerId);
      if (finger?.target !== target) return;
      fingers.delete(event.pointerId); target.removeAttribute('data-held');
      if (action === 'move') target.firstElementChild.style.transform = '';
      if (action === 'missile' && event.type !== 'pointerup') missileCancel = true;
    }
    for (const name of ['pointerup', 'pointercancel', 'lostpointercapture']) target.addEventListener(name, release);
  }
  bindFinger(nodes.move, 'move');
  bindFinger(nodes.look, 'look');
  nodes.buttons.forEach(button => bindFinger(button, button.dataset.drive));

  function menu(pad, now) {
    const signal = pressed(pad, 0) ? 'click' : pressed(pad, 1) ? 'back' :
      pressed(pad, 13) || pressed(pad, 15) || pad.axes[1] > .65 || pad.axes[0] > .65 ? 'next' :
      pressed(pad, 12) || pressed(pad, 14) || pad.axes[1] < -.65 || pad.axes[0] < -.65 ? 'prev' : '';
    const changed = signal !== menuSignal;
    menuSignal = signal;
    if (!signal || (!changed && (now < menuNext || signal === 'click' || signal === 'back'))) return;
    menuNext = now + (changed ? 330 : 120);
    const modal = document.getElementById('overlay');
    const currentMenu = modal.hidden ? document : modal;
    const controls = [...currentMenu.querySelectorAll('button,a[href],summary,input')]
      .filter(el => !el.disabled && !el.closest('#hud') && el.getClientRects().length);
    const active = document.activeElement;
    if (signal === 'back') { onEscape(); return; }
    if (signal === 'click' && controls.includes(active)) { active.click(); return; }
    const i = controls.indexOf(active), dir = signal === 'prev' ? -1 : 1;
    const chosen = i < 0 ? controls.find(el => el.classList.contains('primary')) || controls[0] :
      controls[(i + dir + controls.length) % controls.length];
    chosen?.focus();
  }

  return {
    get mode() { return mode; },
    setDriving(value) {
      if (value === driving) return;
      driving = value;
      cancel();
      if (driving && document.activeElement !== document.body) document.activeElement?.blur();
      if (!driving && document.pointerLockElement === canvas) document.exitPointerLock();
    },
    setAim(a, b) { yaw = a; pitch = b; },
    sample(dt, now) {
      const pads = typeof navigator.getGamepads === 'function' ? [...navigator.getGamepads()] : [];
      const pad = pads.find(p => p && p.index === padId) || pads.find(p => p?.connected && p.buttons.length >= 8);
      let padX = 0, padZ = 0;
      if (pad) {
        padId = pad.index; seenPad = true;
        const active = pad.buttons.some(b => b.pressed || b.value > .35) || pad.axes.some(v => Math.abs(v) > .25);
        if (active) { sayMode('pad'); padUsed = true; }
        if (!driving && padUsed) menu(pad, now);
        if (driving && pressed(pad, 9)) {
          if (menuSignal !== 'escape') onEscape();
          menuSignal = 'escape';
        } else if (driving) menuSignal = '';
        if (mode === 'pad') {
          look(axis(pad.axes[2] || 0) * dt * 2.8, axis(pad.axes[3] || 0) * dt * 2.2);
          padX = axis(pad.axes[0] || 0); padZ = -axis(pad.axes[1] || 0);
        }
      } else if (seenPad) { seenPad = false; retainMode(); cancel(); }
      const touch = [...fingers.values()];
      const move = touch.find(finger => finger.action === 'move');
      const down = (key, btn, action) => keys.has(key) || Boolean(pad && mode === 'pad' && pressed(pad, btn)) || touch.some(f => f.action === action);
      const input = {
        mx: (keys.has('KeyD') ? 1 : 0) - (keys.has('KeyA') ? 1 : 0) + (move?.mx || 0) + padX,
        mz: (keys.has('KeyW') ? 1 : 0) - (keys.has('KeyS') ? 1 : 0) + (move?.mz || 0) + padZ,
        yaw, pitch,
        ascend: down('Space', 5, 'ascend'),
        descend: down('KeyC', 4, 'descend') || keys.has('ControlLeft'),
        boost: down('ShiftLeft', 10, 'boost') || keys.has('ShiftRight'),
        fire: down('', 7, 'fire') || Boolean(mouse & 1),
        missile: down('', 6, 'missile') || Boolean(mouse & 2),
        missileCancel,
      };
      if (driving && mode === 'mouse') {
        look(((keys.has('ArrowRight') ? 1 : 0) - (keys.has('ArrowLeft') ? 1 : 0)) * dt * 1.5,
          ((keys.has('ArrowDown') ? 1 : 0) - (keys.has('ArrowUp') ? 1 : 0)) * dt * 1.25);
        input.yaw = yaw; input.pitch = pitch;
      }
      return input;
    },
    acknowledgeInput() { missileCancel = false; },
  };
}
