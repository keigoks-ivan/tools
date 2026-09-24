/** Disable browser double-click zoom within the game surface without affecting its controls. */
export function installGameGestures(root) {
  if (!root?.addEventListener || !root?.removeEventListener) return () => {};

  const options = { passive: false };
  let lastTap = null;
  const preventDoubleClickZoom = event => {
    if (event.cancelable) event.preventDefault();
  };
  const preventDoubleTapZoom = event => {
    if (event.touches?.length || event.changedTouches?.length !== 1) {
      lastTap = null;
      return;
    }
    const touch = event.changedTouches[0];
    const now = Number.isFinite(event.timeStamp) ? event.timeStamp : 0;
    if (lastTap && now - lastTap.time > 0 && now - lastTap.time < 350 &&
        Math.hypot(touch.clientX - lastTap.x, touch.clientY - lastTap.y) < 36) {
      if (event.cancelable) event.preventDefault();
      lastTap = null;
    } else lastTap = { x: touch.clientX, y: touch.clientY, time: now };
  };

  root.addEventListener('dblclick', preventDoubleClickZoom, options);
  root.addEventListener('touchend', preventDoubleTapZoom, options);
  return () => {
    root.removeEventListener('dblclick', preventDoubleClickZoom, options);
    root.removeEventListener('touchend', preventDoubleTapZoom, options);
  };
}
