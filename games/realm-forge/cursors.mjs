import { BUILDINGS, RESOURCE } from './core.mjs?v=20261013a';

// Hand-drawn context cursors: a small arrow (hotspot 2,2) plus a glyph in the lower-right corner.
const ARROW = '<path d="M2 2V20L6.6 15.8L9.8 22.6L13 21.1L9.9 14.4H16Z" fill="#f4f1e4" stroke="#1b2a22" stroke-width="1.4" stroke-linejoin="round"/>';
const GLYPHS = {
  attack: '<path d="M30 14L20 24" stroke="#1b2a22" stroke-width="5" stroke-linecap="round"/><path d="M30 14L20 24" stroke="#e8eef2" stroke-width="2.6" stroke-linecap="round"/><path d="M17 21L23 27" stroke="#1b2a22" stroke-width="5.2" stroke-linecap="round"/><path d="M17 21L23 27" stroke="#e1b94f" stroke-width="2.8" stroke-linecap="round"/><path d="M19.5 25.5L15.5 29.5" stroke="#1b2a22" stroke-width="4.6" stroke-linecap="round"/><path d="M19.5 25.5L15.5 29.5" stroke="#8a5a34" stroke-width="2.4" stroke-linecap="round"/>',
  gather: '<path d="M16 30L26 19" stroke="#1b2a22" stroke-width="5" stroke-linecap="round"/><path d="M16 30L26 19" stroke="#a8764a" stroke-width="2.6" stroke-linecap="round"/><path d="M21 16L27 14.5L30.5 19L25.5 22.5Z" fill="#cdd6d9" stroke="#1b2a22" stroke-width="1.5" stroke-linejoin="round"/>',
  repair: '<path d="M16 30L24 22" stroke="#1b2a22" stroke-width="5" stroke-linecap="round"/><path d="M16 30L24 22" stroke="#a8764a" stroke-width="2.6" stroke-linecap="round"/><path d="M20 17.5L27 14L31 18L24.5 24Z" fill="#b9c2c6" stroke="#1b2a22" stroke-width="1.5" stroke-linejoin="round"/>',
  garrison: '<path d="M16 30V19L18.5 19V16.5H21V19H23V16.5H25.5V19H28V16.5H30.5V19V30Z" fill="#d8cfae" stroke="#1b2a22" stroke-width="1.5" stroke-linejoin="round"/><path d="M21 30V25.5A2.5 2.5 0 0 1 26 25.5V30Z" fill="#4d3a28"/>',
  build: '<path d="M15.5 30V21L23.5 15L31.5 21V30Z" fill="#d9c58d" stroke="#1b2a22" stroke-width="1.5" stroke-linejoin="round"/><path d="M13.5 22L23.5 14L31.5 22" fill="none" stroke="#b5483a" stroke-width="2.4" stroke-linejoin="round"/><path d="M21 30V25H26V30Z" fill="#4d3a28"/>',
  convert: '<circle cx="23" cy="22" r="8" fill="#e6dfff" stroke="#1b2a22" stroke-width="1.5"/><path d="M23 16V28M18 21H28" stroke="#6f4aa8" stroke-width="2.6" stroke-linecap="round"/>',
  trade: '<circle cx="23" cy="22" r="8" fill="#e6c660" stroke="#1b2a22" stroke-width="1.5"/><path d="M18 20H27L24.5 17.5M28 24H19L21.5 26.5" fill="none" stroke="#5c4310" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>',
  heal: '<circle cx="23" cy="22" r="8" fill="#e9f5ea" stroke="#1b2a22" stroke-width="1.5"/><path d="M23 16.5V27.5M17.5 22H28.5" stroke="#2f9a54" stroke-width="3.2" stroke-linecap="round"/>',
};
export const CURSOR_KINDS = Object.keys(GLYPHS);
export const CURSOR_HOTSPOT = [2, 2];
export function cursorSvg(kind) {
  if (!GLYPHS[kind]) return '';
  return `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">${ARROW}${GLYPHS[kind]}</svg>`;
}
export function cursorCss() {
  return CURSOR_KINDS.map(kind => `#map[data-command-cursor="${kind}"]{cursor:url("data:image/svg+xml,${encodeURIComponent(cursorSvg(kind))}") ${CURSOR_HOTSPOT.join(' ')},auto}`).join('\n');
}

const attacker = (world, enemy) => u => !['trader', 'healer'].includes(u.blueprint.role) && u.blueprint.attack > 0 && !world.commandReason(u, { type: 'attack', target: enemy.id });

// Mirrors what a right-click would do (applyContextCommand) so the cursor never promises an action that will not happen.
// units: the selected, living, own, ungarrisoned units; target: entity under the pointer; resource: tile type under the pointer.
export function contextCursor(world, { units = [], target = null, resource = null, alt = false, placement = null, orderMode = null, attackMove = false } = {}) {
  if (placement) return 'build';
  if (attackMove) return 'attack';
  if (orderMode) return { repair: 'repair', garrison: 'garrison', convert: 'convert', heal: 'heal', 'attack-ground': 'attack' }[orderMode] || '';
  if (!units.length) return '';
  const workers = units.some(u => u.blueprint.role === 'worker');
  if (target && target.hp > 0 && !target.garrison) {
    if (world.isEnemy(0, target.team)) {
      if (units.some(attacker(world, target))) return 'attack';
      if (target.kind === 'unit' && units.some(u => u.blueprint.canConvert && !world.commandReason(u, { type: 'convert', target: target.id }))) return 'convert';
      if (target.kind === 'building' && target.type === 'market' && target.progress === 1 && units.some(u => u.blueprint.role === 'trader')) return 'trade';
      return '';
    }
    if (target.team === 0 && target.kind === 'building') {
      const spec = BUILDINGS[target.type];
      if (alt && target.progress === 1 && spec?.garrison > (target.garrisoned?.length || 0) && units.some(u => u.blueprint.role !== 'trader')) return 'garrison';
      if (workers) {
        if (target.progress < 1) return 'build';
        if (target.type === 'farm') return 'gather';
        if (target.hp < target.maxHp) return 'repair';
      }
      return '';
    }
    if (target.team === 0 && target.kind === 'unit' && target.hp < target.maxHp && target.id !== undefined && units.some(u => u.blueprint.role === 'healer' && u.id !== target.id)) return 'heal';
    return '';
  }
  return workers && resource && RESOURCE[resource] ? 'gather' : '';
}
