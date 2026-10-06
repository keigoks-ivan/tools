// Lazy 3D renderer. The original SVG map remains a complete no-WebGL fallback.
import { tr } from './ui-util.js?v=22';
export function createNetwork(box, options) {
  let live = null, dead = false, current = {}, time = { elapsed: 0, speed: 0 };
  const loading = document.createElement('div'); loading.className = 'globe-loading';
  loading.textContent = tr('正在準備航網…', 'Preparing your network…'); box.append(loading);
  const ready = import('./ui-globe.js?v=22').then(async mod => {
    if (dead) return;
    live = await mod.createGlobe(box, options);
    if (dead) { live.destroy(); return; }
    live.update(current); live.setTime(time); loading.remove();
  }).catch(async () => {
    if (live) live.destroy();
    if (dead) return;
    const { createMap } = await import('./ui-map.js?v=22.2');
    if (dead) return;
    live = createMap(box, options); live.update(current); live.setTime(time); loading.remove();
    const note = document.createElement('div'); note.className = 'map-fallback';
    note.textContent = tr('已切換輕量地圖，所有玩法仍可使用。', 'Lightweight map active. All gameplay is available.'); box.append(note);
  });
  return {
    ready,
    update(next) { current = { ...current, ...next }; live?.update(current); },
    setTime(next) { time = next; live?.setTime?.(next); },
    zoomBy(f) { live?.zoomBy(f); }, recenter() { live?.recenter(); }, focus(id) { live?.focus(id); },
    destroy() { dead = true; live?.destroy(); loading.remove(); },
    stats() { return live?.stats?.() || { fallback: true }; },
  };
}
