const radians = Math.PI / 180;
const clamp = value => Math.max(-1, Math.min(1, value));
const angleDifference = (a, b) => ((a - b + 540) % 360) - 180;

// Project world-up into the screen plane using the DeviceOrientation ZXY matrix.
// Measuring an angle from a calibrated baseline works on either landscape side.
export function orientationRoll(beta, gamma) {
  if (!Number.isFinite(beta) || !Number.isFinite(gamma)) return null;
  const upX = -Math.cos(beta * radians) * Math.sin(gamma * radians);
  const upY = Math.sin(beta * radians);
  if (Math.hypot(upX, upY) < .2) return null;
  return -Math.atan2(upX, upY) / radians;
}

export function createTiltSteering({
  target = globalThis, orientationEvent = globalThis.DeviceOrientationEvent,
  screenTarget = globalThis.screen?.orientation, isSecure = globalThis.isSecureContext,
  now = () => performance.now(), onStatus = () => {}, timeoutMs = 2500,
  setTimer = setTimeout, clearTimer = clearTimeout,
} = {}) {
  let enabled = false, pending = false, status = 'off', session = 0, listening = false;
  let neutral = null, roll = null, lastAt = -Infinity, filtered = 0, timer, finish;
  function report(next) { if (status !== next) { status = next; onStatus(next); } }
  function settle(result) {
    if (timer !== undefined) clearTimer(timer); timer = undefined;
    const done = finish; finish = null; done?.(result);
  }
  function clearReading() { neutral = roll = null; lastAt = -Infinity; filtered = 0; }
  function changeOrientation() { clearReading(); if (enabled) report('calibrating'); }
  function receive(event) {
    if (!enabled && !pending) return;
    if (!Number.isFinite(event.beta) || !Number.isFinite(event.gamma)) return;
    lastAt = now(); roll = orientationRoll(event.beta, event.gamma);
    if (neutral === null && roll !== null) neutral = roll;
    enabled = true; pending = false;
    report(roll === null ? 'flat' : 'ready'); settle(true);
  }
  function subscribe() {
    if (listening) return; listening = true;
    target.addEventListener('deviceorientation', receive);
    target.addEventListener('orientationchange', changeOrientation);
    screenTarget?.addEventListener?.('change', changeOrientation);
  }
  function unsubscribe() {
    if (!listening) return; listening = false;
    target.removeEventListener('deviceorientation', receive);
    target.removeEventListener('orientationchange', changeOrientation);
    screenTarget?.removeEventListener?.('change', changeOrientation);
  }
  function stop(reason = 'off') {
    session++; enabled = pending = false; unsubscribe(); clearReading(); settle(false); report(reason);
  }
  return {
    get enabled() { return enabled; }, get pending() { return pending; }, get status() { return status; },
    async enable() {
      if (enabled) return true;
      if (pending) return false;
      if (!isSecure || !orientationEvent) { stop('unavailable'); return false; }
      const attempt = ++session; pending = true; clearReading(); report('requesting');
      try {
        // This call must run directly inside the user's click, before any await.
        const permission = typeof orientationEvent.requestPermission === 'function'
          ? orientationEvent.requestPermission() : 'granted';
        if (await permission !== 'granted') { if (attempt === session) stop('denied'); return false; }
      } catch { if (attempt === session) stop('denied'); return false; }
      if (attempt !== session) return false;
      report('waiting');
      return new Promise(resolve => {
        finish = resolve; subscribe();
        timer = setTimer(() => { if (attempt === session) stop('unavailable'); }, timeoutMs);
      });
    },
    disable() { stop(); },
    recalibrate() {
      filtered = 0;
      neutral = now() - lastAt <= 1500 ? roll : null;
      if (enabled) report(neutral === null ? (roll === null ? 'flat' : 'calibrating') : 'ready');
    },
    sample(dt) {
      if (!enabled) return 0;
      if (now() - lastAt > 1500) { clearReading(); report('stale'); return 0; }
      if (roll === null || neutral === null) { filtered = 0; return 0; }
      const delta = angleDifference(roll, neutral);
      const desired = Math.sign(delta) * clamp(Math.max(0, Math.abs(delta) - 2) / 28);
      filtered += (desired - filtered) * (1 - Math.exp(-Math.max(0, Math.min(.1, dt)) * 14));
      return filtered;
    },
    destroy() { stop(); },
  };
}
