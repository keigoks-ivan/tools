/** Disable browser double-click zoom within the game surface without affecting its controls. */
export function installGameGestures(root) {
  if (!root?.addEventListener || !root?.removeEventListener) return () => {};

  const options = { passive: false };
  const preventDoubleClickZoom = event => {
    if (event.cancelable) event.preventDefault();
  };

  root.addEventListener('dblclick', preventDoubleClickZoom, options);
  return () => root.removeEventListener('dblclick', preventDoubleClickZoom, options);
}
