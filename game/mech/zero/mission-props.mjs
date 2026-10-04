// 固定設備完成後留在現場；可攜物件拿取後隱藏，重玩時可恢復。
export function collectMissionItem(item) {
  if (item.persistent) item.h?.install?.();
  else item.h?.hide?.();
}

export function syncMissionProps(map, encounters, done, picked) {
  const collected = new Set(picked);
  for (const E of encounters) if (done.has(E.id)) for (const P of E.pickups || []) collected.add(P.id);
  for (const [id, item] of Object.entries(map.items)) {
    if (item.h?.reset) item.h.reset();
    else item.h?.show?.();
    if (collected.has(id)) collectMissionItem(item);
  }
  for (const [id, handles] of Object.entries(map.operationProps || {})) for (const h of handles) {
    h.reset();
    if (done.has(id)) h.install();
  }
}
