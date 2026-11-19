// True milestones survive pauses and checkpoint reloads. A final battle cue
// starts at contact, after the approach to the marked location.
const footChapters = ['zFall', 'zCord', 'zNorth', 'zRoad', 'zHangar'];

export function footCue(sequel, chapter, done, scenic, relay) {
  if (sequel) {
    if (chapter === 1 && done.has('C6')) return 'lManifest';
    if (chapter === 2 && done.has('KEY')) return 'lAuth';
    if (scenic) return 'lHill';
    if (chapter === 1) return relay === 'damaged' && !done.has('B0') ? 'lDark' : 'lCustoms';
    return chapter === 2 ? 'lOrders' : 'lDocks';
  }
  if (chapter === 3 && done.has('KEY')) return 'zKey';
  if (chapter === 5 && done.has('G3')) return 'zIgnite';
  if (scenic) return 'zHill';
  return footChapters[chapter - 1];
}

export function mechCue(sequel, config, wave, engaged, choice) {
  if (!sequel) {
    if (engaged && config.waves[wave]?.boss) return config.waves[wave].boss.flee ? 'zHound' : 'zDuel';
    return wave >= 4 ? 'zPursuit' : 'zSortie';
  }
  if (config.breakout) return 'lBreak';
  switch (config.chapter) {
    case 4: return choice === 'rescue' ? 'lRescue' : choice === 'artillery' ? 'lBatteryRun' : 'lConvoy';
    case 5: return engaged && wave === config.waves.length - 1 ? 'lAir' : 'lRadio';
    case 6: return 'lBattery';
    case 7: return engaged && config.waves[wave]?.boss ? 'lCaptain' : 'lGate';
  }
}
