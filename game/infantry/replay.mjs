// Pure sortie plans. Conditions alter existing physical spawns and Mission
// parameters; they never add hidden enemies, timers or reinforcement batches.
import { OPERATION_RULES, operationFor } from './operations.mjs';
import { selection } from './scenarios.mjs';

const words = (zh, en) => ({ zh, en });
const freezeTree = value => {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) freezeTree(child);
    Object.freeze(value);
  }
  return value;
};

const CONDITIONS = freezeTree([
  {
    id: 'pincer', name: words('雙翼滲透', 'Flanking infiltration'),
    brief: words('部分普通步兵改為包抄兵，左右兩翼交替進場，仍保留中央接力；有限增援間隔縮短，據點佔領稍快。', 'Some riflemen become flankers. Left and right approaches alternate with central follow-up. Finite reinforcements arrive sooner, and capture is slightly faster.'),
    reinforceInterval: .90, captureMultiplier: .95, score: 1.08,
  },
  {
    id: 'suppression', name: words('壓制梯隊', 'Suppression teams'),
    brief: words('每四名敵軍中的後段兵員偏向支援兵，進場稍快、兵力略增，防線承受更高壓力；開場步兵保護規則維持。', 'Later troops in each group of four favor support weapons. Deployment is faster, numbers slightly higher, and line pressure stronger. Opening rifleman safeguards remain.'),
    countMultiplier: 1.05, spawnInterval: .92, pressureMultiplier: 1.10, score: 1.08,
  },
  {
    id: 'armor-column', name: words('後續裝甲', 'Armored follow-up'),
    brief: words('第二階段起定期加入重裝兵，兵力與防線壓力略增、補給整備稍慢；首階段無重裝，低補給滲透改由支援兵接替。', 'From stage two, regular heavy infantry follow-ups slightly increase numbers and line pressure. Resupply takes longer. Stage one has no armor, and rationed infiltration substitutes support troops.'),
    countMultiplier: 1.04, supplyMultiplier: 1.08, pressureMultiplier: 1.08, score: 1.10,
  },
  {
    id: 'overwatch', name: words('遠程警戒', 'Overwatch positions'),
    brief: words('後段兵員增加狙擊警戒，兵力略減、進場稍慢，佔領所需時間增加；原本禁止狙擊的近戰變體一律改用支援兵。', 'Later troops add sniper overwatch, with slightly fewer and slower attackers but longer capture times. Every original close-quarter variant without snipers uses support troops instead.'),
    countMultiplier: .95, spawnInterval: 1.12, captureMultiplier: 1.08, score: 1.06,
  },
  {
    id: 'surge', name: words('集中突擊', 'Concentrated assault'),
    brief: words('總兵力增加、進場與有限增援加快，防線壓力略升；補給整備稍快以支撐持續交火，同時在場敵軍仍最多十四名。', 'More troops deploy, with faster entry and finite reinforcements and slightly stronger line pressure. Resupply is somewhat faster to sustain the fighting. At most fourteen enemies can be alive.'),
    countMultiplier: 1.12, spawnInterval: .83, reinforceInterval: .90,
    supplyMultiplier: .92, pressureMultiplier: 1.06, score: 1.10,
  },
  {
    id: 'supply-delay', name: words('補給延誤', 'Delayed supplies'),
    brief: words('補給站整備與據點佔領需要更久，出發時只有兩枚手榴彈；敵軍總數略減，但每次補給都需要提前規劃。', 'Supply stations take longer to reset and positions take longer to capture. Begin with two grenades. Enemy numbers are slightly lower, but each resupply needs advance planning.'),
    countMultiplier: .96, supplyMultiplier: 1.20, captureMultiplier: 1.10, score: 1.12,
  },
  {
    id: 'counterpush', name: words('持續反壓', 'Sustained counterattack'),
    brief: words('敵軍的既有有限增援更快接力，總兵力、佔領時間與防線壓力略增；增援批數不增加，清至最後兩人後不再補兵。', 'The existing finite reinforcement batches follow up sooner. Numbers, capture time and line pressure rise slightly. No batches are added, and reinforcements stop once the last two defenders remain.'),
    countMultiplier: 1.06, spawnInterval: .95, reinforceInterval: .80,
    captureMultiplier: 1.12, pressureMultiplier: 1.08, score: 1.12,
  },
  {
    id: 'lane-shift', name: words('交替佯攻', 'Shifting approaches'),
    brief: words('敵軍以三人小組在偏重側翼與中央接力之間切換，每個階段交換主攻方向；部分步兵改為包抄，進場稍慢但防線壓力略增。', 'Groups of three switch between a favored flank and central follow-up. The main approach changes each stage. Some riflemen become flankers; deployment is slightly slower but line pressure increases.'),
    countMultiplier: 1.02, spawnInterval: 1.05, pressureMultiplier: 1.05, score: 1.06,
  },
]);

// Public descriptions contain no executable rules and cannot mutate the catalog.
export const REPLAY_CONDITIONS = freezeTree(CONDITIONS.map(({ id, name, brief }) => ({ id, name, brief })));

const SCENES = Object.freeze(Object.keys(OPERATION_RULES));
const ROLES = new Set(['line', 'flank', 'support', 'sniper', 'heavy']);
const CLOSE_QUARTERS = new Set(['alley-sweep', 'trench-storm', 'hangar-breach']);
const PARAMETER_BOUNDS = Object.freeze({
  countMultiplier: [.75, 1.30],
  spawnInterval: [.75, 2.10],
  reinforceInterval: [20, 55],
  captureMultiplier: [.80, 1.30],
  supplyMultiplier: [.65, 1.45],
  pressureMultiplier: [.75, 1.30],
});

function hashText(value) {
  let hash = 2166136261;
  for (const char of String(value)) { hash ^= char.codePointAt(0); hash = Math.imul(hash, 16777619); }
  return hash >>> 0;
}
function mix(value) {
  value = Math.imul(value ^ value >>> 16, 0x7feb352d);
  value = Math.imul(value ^ value >>> 15, 0x846ca68b);
  return (value ^ value >>> 16) >>> 0;
}
const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
const whole = (value, fallback, low) => Number.isFinite(value) ? Math.max(low, Math.floor(value)) : fallback;
const round = value => Math.round(value * 10000) / 10000;

function localDateKey(date) {
  const instant = date instanceof Date ? date.getTime() : new Date(date).getTime();
  const shifted = new Date((Number.isFinite(instant) ? instant : 0) + 8 * 60 * 60 * 1000);
  // Invalid persisted dates have a deterministic fallback, never a new draw.
  return Number.isFinite(shifted.getTime()) ? shifted.toISOString().slice(0, 10) : '1970-01-01';
}

function conditionPair(seed) {
  const first = mix(seed ^ 0x6a09e667) % CONDITIONS.length;
  const next = mix(seed ^ 0xbb67ae85) % (CONDITIONS.length - 1);
  const second = next >= first ? next + 1 : next;
  // Canonical order makes composition transforms independent of draw order.
  return [first, second].sort((a, b) => a - b).map(index => CONDITIONS[index]);
}

function wrapOperation(base, conditions) {
  const values = {};
  for (const [key, bounds] of Object.entries(PARAMETER_BOUNDS)) {
    const factor = conditions.reduce((product, condition) => product * (condition[key] ?? 1), 1);
    values[key] = round(clamp(base[key] * factor, ...bounds));
  }
  const active = new Set(conditions.map(condition => condition.id));
  const noSnipers = base.sceneId === 'underground' || CLOSE_QUARTERS.has(base.variantId);
  const noArmor = base.variantId === 'rationed-infiltration';
  const favoredSide = mix(base.seed ^ hashText(base.sceneId) ^ 0x3c6ef372) & 1 ? 2 : 0;
  return Object.freeze({
    ...base, ...values,
    // Mission still applies its existing difficulty and stage pace multipliers.
    // These bounded values are the final operation modifiers, including variant.
    maxActors: 14,
    enemyType(stage, index, mode = 'defend') {
      stage = whole(stage, 1, 1); index = whole(index, 0, 0);
      let role = base.enemyType(stage, index, mode);
      if (active.has('pincer') && index % 3 === 1 && role === 'line') role = 'flank';
      if (active.has('lane-shift') && index % 5 === 2 && role === 'line') role = 'flank';
      if (active.has('suppression') && index >= 3 && index % 4 === 3) role = 'support';
      if (active.has('armor-column') && stage >= 2 && index >= 3 && index % 6 === 4) role = noArmor ? 'support' : 'heavy';
      if (active.has('overwatch') && index >= 3 && index % 6 === 5) role = noSnipers ? 'support' : 'sniper';
      // Run safety constraints last, after every composition transform.
      if (index === 0) return 'line';
      if (noSnipers && role === 'sniper') role = 'support';
      if ((noArmor || stage === 1) && role === 'heavy') role = 'support';
      if (index < 3 && (role === 'sniper' || role === 'heavy')) role = mode === 'assault' ? 'flank' : 'support';
      return ROLES.has(role) ? role : 'line';
    },
    spawnSide(stage, index, mode = 'defend') {
      stage = whole(stage, 1, 1); index = whole(index, 0, 0);
      let side = base.spawnSide(stage, index, mode);
      if (active.has('pincer')) {
        const pattern = [favoredSide, 2 - favoredSide, 1];
        side = pattern[(index + stage - 1) % pattern.length];
      }
      if (active.has('lane-shift')) {
        const main = stage % 2 ? favoredSide : 2 - favoredSide;
        const group = Math.floor(index / 3);
        // A favored flank, center follow-up, then the opposite flank; no teleport.
        side = [main, 1, 2 - main][group % 3];
        // Combined pincer conditions keep within-group left/right pressure.
        if (active.has('pincer') && index % 3 === 2) side = 2 - main;
      }
      return side === 0 || side === 1 || side === 2 ? side : 1;
    },
  });
}

export function replayPlan(options = {}) {
  const { scene, mode, difficulty, variant, seed, kind = 'remix', date = new Date() } = options && typeof options === 'object' ? options : {};
  const selectedKind = ['normal', 'remix', 'daily'].includes(kind) ? kind : 'normal';
  let choice = selection({ scene, mode, difficulty }), selectedSeed = seed, selectedVariant = variant, dailyKey = null;
  if (selectedKind === 'daily') {
    dailyKey = localDateKey(date);
    selectedSeed = hashText(`greyline.daily.v1:${dailyKey}`);
    choice = {
      scene: SCENES[mix(selectedSeed ^ 0xa54ff53a) % SCENES.length],
      mode: mix(selectedSeed ^ 0x510e527f) & 1 ? 'assault' : 'defend',
      difficulty: 'regular',
    };
    selectedVariant = mix(selectedSeed ^ 0x9b05688c) % OPERATION_RULES[choice.scene].variants.length;
  }
  const base = operationFor(choice.scene, selectedSeed, selectedVariant);
  const conditions = selectedKind === 'normal' ? [] : conditionPair(base.seed);
  const operation = conditions.length ? wrapOperation(base, conditions) : base;
  const scoreMultiplier = conditions.length
    ? Math.round(clamp(conditions.reduce((product, condition) => product * condition.score, 1), 1, 1.35) * 100) / 100
    : 1;
  const sideKinds = ['intel', 'cache', 'relay'];
  return freezeTree({
    kind: selectedKind, seed: base.seed, choice, variant: base.variantIndex,
    conditions: conditions.map(({ id, name, brief }) => ({ id, name, brief })),
    operation, scoreMultiplier,
    sideKind: sideKinds[mix(base.seed ^ hashText(choice.scene) ^ (choice.mode === 'assault' ? 0x1f83d9ab : 0x5be0cd19)) % sideKinds.length],
    supportCharges: 2,
    startGrenades: conditions.some(condition => condition.id === 'supply-delay') ? 2 : 3,
    dailyKey,
    dailyTitle: dailyKey ? words(`每日挑戰 · ${dailyKey}`, `Daily challenge · ${dailyKey}`) : words('每日挑戰', 'Daily challenge'),
  });
}
