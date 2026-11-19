export const LANDING = {
  departure: -441, berth: -346, offset: -33, deck: 4.8, ramp: 27, travel: 7.8,
  seawall: -43, northGap: -61, southGap: 63, yard: 255,
};

export const LANDING_ROUTE = {
  cp: [1, 2], arena: 175, fin: 65, par: 375, over: 2,
  pts: [[LANDING.departure + LANDING.offset, 0], [-187, 0], [54, 0], [LANDING.yard, 0]],
  secs: [
    { at: 1, amb: 'heavy@out grunt@side tank@out' },
    { at: 2, amb: 'brawler@side grunt@side tank@out' },
    { at: 3, amb: 'heavy@out grunt@side tank@out' },
  ],
};

export function landingShore(z) {
  return -320 + 5 * Math.sin(z * .012) + 3.3 * Math.sin(z * .031);
}

export function landingGround(x, z) {
  const shore = x - landingShore(z);
  if (shore < 0) return Math.max(-28, shore * .15);
  return (1 - Math.exp(-shore / 83)) * 7.1;
}

// 和地形材質、海水共用同一條岸線。
export const SHORE_GLSL = '(-320.0 + 5.0*sin(Z*.012) + 3.3*sin(Z*.031))';
