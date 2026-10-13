// CC0 recorded samples (see assets/audio/LICENSE.txt). Anything missing or failing to
// load falls back to the synthesised recipe of the same name in audio.mjs.
const n = (prefix, count) => Array.from({ length: count }, (_, i) => `${prefix}-${i + 1}`);

export const SAMPLE_SETS = {
  chop: n('chop', 3), mine: n('mine', 4), hammer: n('hammer', 3), sword: n('sword', 3),
  'arrow-shoot': n('arrow-shoot', 3), 'arrow-hit': n('arrow-hit', 3),
  'rock-shoot': n('rock-shoot', 2), 'rock-land': n('rock-land', 3),
  'building-collapse': n('collapse', 2), 'building-complete': ['building-complete-1'],
  'age-up': ['age-up-1'], alert: ['alert-1'],
};
export const VOICE_SETS = {
  villager: { select: n('voice-villager-select', 3), command: n('voice-villager-command', 3) },
  infantry: { select: n('voice-infantry-select', 3), command: n('voice-infantry-command', 3) },
  archer: { select: n('voice-archer-select', 2), command: n('voice-archer-command', 3) },
  cavalry: { select: n('voice-cavalry-select', 2), command: n('voice-cavalry-command', 3) },
  hero: { select: n('voice-hero-select', 2), command: n('voice-hero-command', 3) },
  siege: { select: n('voice-siege-select', 2), command: n('voice-siege-command', 2) },
}; // monks keep the synthesised chant: no suitable CC0 recording was found
export const DEATH_SETS = { villager: n('death-villager', 2), infantry: n('death-infantry', 2), archer: n('death-archer', 2), cavalry: n('death-cavalry', 2) };

// Candidate sample ids for one play request, or null when this sound is synthesised only.
export function sampleIds(name, o = {}) {
  if (name === 'voice') return VOICE_SETS[o.unitClass]?.[o.kind === 'command' ? 'command' : 'select'] || null;
  if (name === 'death') return DEATH_SETS[o.unit] || DEATH_SETS.infantry;
  return SAMPLE_SETS[name] || null;
}
export const allSampleIds = () => [...new Set([
  ...Object.values(SAMPLE_SETS).flat(), ...Object.values(DEATH_SETS).flat(),
  ...Object.values(VOICE_SETS).flatMap(v => [...v.select, ...v.command]),
])];
export const SAMPLE_EXTENSION = 'mp3';
