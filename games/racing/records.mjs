const recordKey = (trackId, vehicleId) => `apex.lap.v2.${trackId}.${vehicleId}`;
const validGhost = ghost => Array.isArray(ghost) && ghost.length < 9000
  && ghost.every(p => Array.isArray(p) && p.length === 6 && p.every(Number.isFinite));

export function readLapRecord(storage, trackId, vehicleId) {
  try {
    const current = storage.getItem(recordKey(trackId, vehicleId));
    const legacy = trackId === 'costa' && vehicleId === 'ferrari458' ? storage.getItem('apex.costa.v1') : null;
    const saved = JSON.parse(current ?? legacy ?? 'null');
    if (saved && Number.isFinite(saved.best) && saved.best > 10 && saved.best < 1800) {
      return { best: saved.best, ghost: validGhost(saved.ghost) ? saved.ghost : [] };
    }
  } catch {}
  return { best: null, ghost: [] };
}

export function writeLapRecord(storage, trackId, vehicleId, best, ghost) {
  try { storage.setItem(recordKey(trackId, vehicleId), JSON.stringify({ best, ghost })); } catch {}
}
