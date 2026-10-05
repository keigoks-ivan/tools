const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
const finite = (n, fallback = 0) => Number.isFinite(n) ? n : fallback;
function freeze(value) {
  Object.values(value).forEach(item => { if (item && typeof item === 'object') freeze(item); });
  return Object.freeze(value);
}

// These are qualitative game-design parameters, not measured stroke frequencies.
export const PLAYER_PROFILES = freeze({
  lin: {
    id: 'lin', name: 'Lin Yun-Ju', nameZh: '林昀儒', hand: 'left',
    longDepth: 1.58, bodyDepth: 2.04, lead: 0.20, backhandBias: 0.20,
    forehandOffset: 0.22, backhandOffset: 0.15, readyBias: 'fluid',
    description: 'Vary placement and spin; compact backhand flicks against reachable short serves, with a flowing recovery.',
    evidence: { basis: 'Qualitative adaptation; parameters are selected for the game.',
      sources: ['https://www.youtube.com/watch?v=m8DybsKawQs', 'https://www.butterfly.co.jp/takurepo/tech/detail/023472.html'],
      limitations: ['A broadcast view does not measure spin or force.', 'Design thresholds and shot cycles are not athlete usage statistics.', 'The game uses simplified stroke and movement envelopes.'] },
  },
  harimoto: {
    id: 'harimoto', name: 'Tomokazu Harimoto', nameZh: '張本智和', hand: 'right',
    longDepth: 1.46, bodyDepth: 1.92, lead: 0.15, backhandBias: 0.34,
    forehandOffset: 0.19, backhandOffset: 0.13, readyBias: 'compact',
    description: 'Stay close, intercept the rising ball with compact backhand counters, and pressure the body or open lane.',
    evidence: { basis: 'Qualitative adaptation; parameters are selected for the game.',
      sources: ['https://www.youtube.com/watch?v=m8DybsKawQs', 'https://www.butterfly.co.jp/product/harimoto_super_alc/'],
      limitations: ['A broadcast view does not measure spin or force.', 'Design thresholds and shot cycles are not athlete usage statistics.', 'The game uses simplified stroke and movement envelopes.'] },
  },
});

const generic = Object.freeze({ id: 'club', hand: 'right', longDepth: 1.54, bodyDepth: 1.94, lead: 0.16,
  backhandBias: 0.18, forehandOffset: 0.20, backhandOffset: 0.16, readyBias: 'neutral' });
export function getPlayerProfile(id) { return Object.hasOwn(PLAYER_PROFILES, id) ? PLAYER_PROFILES[id] : null; }

export function chooseShot(profileId, context = {}) {
  const profile = getPlayerProfile(profileId) ?? generic;
  const incoming = context.incoming ?? {};
  const side = context.side === -1 ? -1 : 1;
  const hand = context.handedness === 'left' || context.handedness === 'right' ? context.handedness : profile.hand;
  const forehandDirection = side * (hand === 'left' ? -1 : 1);
  const x = clamp(finite(incoming.x), -1.1, 1.1);
  const height = finite(incoming.height, 1.06), spinIn = finite(incoming.spin), speed = finite(incoming.speed, 4);
  const position = finite(context.position), opponent = clamp(finite(context.opponentPosition), -1.1, 1.1);
  const short = incoming.length === 'short' || incoming.length === 'half-long';
  const history = Array.isArray(context.previousShots) ? context.previousShots : [];
  const own = history.filter(shot => shot.side === side), last = own.at(-1);
  const turn = Number.isFinite(context.shotIndex) ? Math.floor(context.shotIndex / 2) : own.length;
  const phase = context.rallyPhase ?? (incoming.isServe ? 'receive' : 'rally');
  const stretched = Math.abs(x - position) > 0.48;
  let handedness = x * forehandDirection > profile.backhandBias ? 'forehand' : 'backhand';
  if (stretched) handedness = (x - position) * forehandDirection >= 0 ? 'forehand' : 'backhand';
  let type = 'drive', power = 0.52, spin = 0.65, reason = 'balanced-return';
  const wideForehand = x * forehandDirection > 0.40;
  const flickLaneCovered = profile.id === 'lin' && last?.type === 'flick' && Math.abs(opponent - last.aim * 0.59) < 0.18;
  if (short) {
    if (height < 0.86 || (spinIn < -0.9 && height < 0.98) || (profile.id === 'lin' && (wideForehand || flickLaneCovered))) {
      type = 'push'; power = 0.32; spin = -0.72; reason = 'keep-low-short-ball';
      if (profile.id === 'lin') {
        power = flickLaneCovered ? 0.46 : 0.36; spin = spinIn < -0.35 ? -0.28 : -0.55;
        reason = wideForehand ? 'wide-forehand-short-receive' : flickLaneCovered ? 'change-the-expected-flick' : 'keep-low-short-ball';
      }
    } else if (profile.id === 'lin' || height > 0.96) {
      type = 'flick'; power = profile.id === 'lin' ? 0.50 : 0.56; spin = 0.92;
      handedness = Math.abs(x) < 0.43 ? 'backhand' : handedness; reason = 'attack-reachable-short-ball';
    } else {
      type = 'push'; power = 0.35; spin = -0.58; reason = 'controlled-short-receive';
    }
  } else if (height >= 1.28 && !stretched) {
    type = 'drive'; power = profile.id === 'harimoto' ? 0.73 : 0.68; spin = 0.45; reason = 'attack-high-ball';
  } else if (spinIn < -0.35) {
    type = 'loop'; power = profile.id === 'lin' ? 0.56 : 0.62; spin = 1; reason = 'lift-underspin';
  } else if (profile.id === 'harimoto') {
    if (speed > 7.5 && height < 1.04) {
      type = 'block'; power = 0.38; spin = 0.2; reason = 'absorb-fast-low-topspin';
    } else {
      type = 'counter'; power = 0.62; spin = 0.72; reason = 'early-compact-pressure';
    }
  } else if (stretched || (speed > 7 && height < 1.04)) {
    type = 'block'; power = 0.36; spin = 0.25; reason = 'recover-from-wide-pressure';
  } else {
    type = 'loop'; power = 0.54; spin = 0.94; reason = 'flowing-placement-change';
  }
  const openLane = opponent >= 0 ? -1 : 1;
  let aim;
  if (Math.abs(opponent) > 0.22) aim = openLane * (profile.id === 'lin' ? 0.76 : 0.82);
  else if (profile.id === 'lin') {
    const pattern = [-0.64, 0.28, 0.64, -0.22];
    aim = pattern[turn % pattern.length];
    if (last && Math.sign(last.aim) === Math.sign(aim) && Math.abs(last.aim) > 0.4) aim = -aim;
    if (phase === 'receive') aim *= 0.85;
  } else {
    aim = turn % 3 === 2 || phase === 'third-ball' ? openLane * 0.78 : clamp(opponent / 0.59 + 0.16 * forehandDirection, -0.52, 0.52);
  }
  const controls = context.controls ?? {};
  if (Number.isFinite(controls.spin)) {
    spin = clamp(controls.spin, -1, 1);
    if (spin < -0.15) type = 'push';
    else if (Math.abs(spin) <= 0.15) type = type === 'block' ? 'block' : 'drive';
    else if (type === 'push') type = short ? 'flick' : 'loop';
  }
  if (Number.isFinite(controls.aim)) aim = clamp(controls.aim, -1, 1);
  if (Number.isFinite(controls.power)) power = clamp(controls.power, 0, 1);
  else if (context.practice) power = Math.min(power, 0.58);
  const contactDepth = short ? clamp(finite(incoming.bounceDepth, 0.72) + 0.19, 1.00, 1.20) : profile.longDepth;
  const offsetX = -forehandDirection * (handedness === 'forehand' ? profile.forehandOffset : -profile.backhandOffset);
  const recoveryX = forehandDirection * (profile.id === 'harimoto' ? 0.10 : 0.035);
  const landingDepth = type === 'push' ? (flickLaneCovered ? 1.02 : 0.50) : profile.id === 'lin' ? (turn % 2 ? 1.01 : 0.82) : 1.02;
  return {
    profileId: profile.id, type, aim: clamp(aim, -0.9, 0.9), spin, power,
    contactDelay: short ? profile.id === 'lin' ? 0.22 : 0.17 : profile.lead,
    contactDepth, contactPolicy: short ? 'short' : 'long', handedness, landingDepth, reason,
    stance: { bodyX: clamp(x + offsetX, -1.1, 1.1), offsetX,
      rootZ: short ? clamp(contactDepth + 0.50, 1.55, 1.75) : profile.bodyDepth,
      recoveryX, readyBias: profile.readyBias },
  };
}
