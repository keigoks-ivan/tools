// Awards use actual sortie telemetry. Cosmetic records never change combat stats.
export function evaluateSortie(mission, telemetry = {}, operation = {}) {
  const won = mission.status === 'won';
  const shots = Math.max(0, telemetry.shots || 0), hits = Math.max(0, telemetry.hits || 0);
  const accuracy = shots ? Math.min(1, hits / shots) : 0;
  const bonusId = operation.bonusIdByMode?.[mission.mode] || operation.bonusId;
  const timeLimit = operation.bonusTime?.[mission.mode] || (mission.mode === 'defend' ? 360 : 240);
  const checks = {
    squad: telemetry.alliesAlive === 3,
    frontline: mission.mode === 'defend' && mission.integrity >= 80,
    speed: mission.time <= timeLimit,
    precision: shots >= 10 && accuracy >= .45,
    resource: telemetry.supplyUses === 0,
    grenadier: telemetry.grenadeKills >= 5,
  };
  const bonus = won && !!checks[bonusId];
  const strongFinish = mission.mode === 'defend' ? mission.integrity >= 75 : telemetry.alliesAlive >= 2;
  const medal = won ? (bonus && telemetry.alliesAlive === 3 ? 'gold' : bonus || strongFinish ? 'silver' : 'bronze') : null;
  const score = Math.max(0, mission.kills * 100 + (won ? 1000 : 0) + Math.floor(mission.integrity * 5)
    + (won ? Math.max(0, 600 - Math.floor(mission.time)) : 0) + (bonus ? 750 : 0) + (won ? (telemetry.alliesAlive || 0) * 150 : 0));
  return { won, score, accuracy, bonus, bonusId, medal, timeLimit };
}

export function recordSortie(records, key, mission, result) {
  if (!result.won) return records;
  const old = records[key], ranks = { bronze: 1, silver: 2, gold: 3 };
  return { ...records, [key]: {
    score: Math.max(old?.score || 0, result.score),
    time: Math.min(old?.time ?? Infinity, mission.time), wins: (old?.wins || 0) + 1,
    medal: ranks[old?.medal] > ranks[result.medal] ? old.medal : result.medal,
    bonus: !!old?.bonus || result.bonus,
  } };
}
