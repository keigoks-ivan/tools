// Only required encounter enemies are revealed. Optional patrols and unbroken stealth stay hidden.
export function cleanupTargets(active, player) {
  const targets = [];
  for (const a of active) {
    if (a.E.operation?.bypass || a.E.stealth && !a.spotted) continue;
    const left = a.list.filter(e => !e.dead);
    if (!left.length || left.length > 2) continue;
    for (const e of left) {
      const dy = e.pos.y - player.pos.y;
      targets.push({ id: e.id ?? e.actor?.id ?? e.data?.id, p: e.pos.clone(), h: e.type === 'drone' ? .35 : 1.9, altitude: dy,
        label: dy > 1.5 ? `殘敵・高處 +${Math.round(dy)} m` : dy < -1.5 ? `殘敵・下方 ${Math.round(dy)} m` : '最後殘敵', exact: true });
    }
  }
  return targets;
}
