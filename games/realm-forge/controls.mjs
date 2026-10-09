import { CLASSIC_BUILD_KEYS } from './civilization.mjs?v=20261009h';

export const GRID_BUILD_KEYS = {
  economy: { q: 'house', w: 'mill', e: 'mining', r: 'lumber', t: 'dock', a: 'farm', s: 'blacksmith', d: 'market', f: 'monastery', g: 'university', z: 'town', x: 'wonder' },
  military: { q: 'barracks', w: 'archery', e: 'stable', r: 'siege', a: 'outpost', d: 'wall', f: 'tower', z: 'gate', c: 'castle' },
};
const GRID_UNITS = { town: ['villager'], barracks: ['swordsman', 'spearman'], archery: ['archer', 'skirmisher'], stable: ['scout', 'knight'], siege: ['ram', 'mangonel'], monastery: ['monk'], castle: ['longbow', 'trebuchet'] };
export const GO_TO_BUILDINGS = { h:'town', b:'barracks', a:'archery', l:'stable', k:'siege', v:'castle', y:'monastery', u:'university', m:'market', s:'blacksmith', i:'mill', z:'lumber', c:'mining' };
export const GRID_COMMANDS = { g:'stop', q:'patrol', w:'guard', e:'follow', r:'attack-move', t:'garrison', a:'stance:aggressive', s:'stance:defensive', d:'stance:stand', f:'stance:passive', z:'formation:line', x:'formation:box', c:'formation:spread', v:'formation:flank' };
const GRID_TECH = { feudal:'z', 'castle-age':'z', imperial:'z', loom:'a', wheelbarrow:'s', handcart:'s', 'double-axe':'q', bowsaw:'q', 'two-saw':'q', 'gold-mining':'q', 'gold-shaft':'q', 'stone-mining':'w', 'horse-collar':'q', 'heavy-plow':'q', 'crop-rotation':'q', 'man-at-arms':'a', longsword:'a', twohand:'a', champion:'a', pikeman:'s', halberdier:'s', crossbow:'a', arbalest:'a', 'elite-skirm':'s', 'light-cavalry':'a', hussar:'a', cavalier:'s', paladin:'s', 'capped-ram':'a', 'siege-ram':'a', onager:'s', 'siege-onager':'s', 'elite-longbow':'a', bloodlines:'z', husbandry:'x', masonry:'q', ballistics:'r', chemistry:'t', conscription:'c', faith:'s', sanctity:'a', fervor:'r' };
export function technologyKey(profile, id) { if (profile!=='definitive') return ''; return GRID_TECH[id] || (id.startsWith('melee-')?'q':id.startsWith('arrows-')?'a':id.startsWith('armor-')?'w':id.startsWith('archer-armor-')?'s':id.startsWith('cavalry-armor-')?'e':''); }
export function commandKey(profile, id) { if (profile!=='definitive') return ({stop:'s',patrol:'z',guard:'x',follow:'c','formation:line':'q','formation:box':'w','formation:spread':'e','formation:flank':'r','stance:aggressive':'a','stance:defensive':'d','stance:stand':'g','stance:passive':'n'})[id]||''; return Object.keys(GRID_COMMANDS).find(k=>GRID_COMMANDS[k]===id)||({repair:'e',dropoff:'a',shelter:'f','auto-scout':'g','attack-ground':'t','town-bell':'b',ungarrison:'g',rally:'t'})[id]||''; }
const GRID_UNIT_KEYS = ['q', 'w', 'e', 'r', 't'];
export function buildKeys(profile, page) { return profile === 'definitive' ? GRID_BUILD_KEYS[page] : CLASSIC_BUILD_KEYS; }
export function productionKey(profile, unit) {
  if (profile !== 'definitive') return unit.hotkey || '';
  const index = GRID_UNITS[unit.building]?.indexOf(unit.id) ?? -1;
  return index < 0 ? '' : GRID_UNIT_KEYS[index];
}
export function menuKey(profile, military = false) { return profile === 'definitive' ? military ? 'w' : 'q' : military ? 'v' : 'b'; }
export function eventKey(event) {
  if (/^(Digit|Numpad)[0-9]$/.test(event.code)) return event.code.at(-1);
  return ({Period:'.',Comma:',',Slash:'/'})[event.code] || event.key.toLowerCase();
}
export function orderHint(unit) {
  if (unit.garrison) return '駐軍中';
  if (unit.waitingResources) return '木材不足，等待修理';
  if (unit.waitingDropoff) return '等待卸貨點';
  if (unit.packLeft > 0) return `${unit.packed ? '打包' : '展開'}中 · ${Math.ceil(unit.packLeft)} 秒`;
  if (unit.failed) return '無法到達目標';
  const labels = { waitDropoff: '等待卸貨點', autoScout: '自動偵察', attackGround: '攻擊地面', move: '移動', attackMove: '攻擊移動', attack: '攻擊', gather: '採集', deliver: '運送資源', build: '建造', repair: '修理', heal: '治療', patrol: '巡邏', guard: '守衛', follow: '跟隨', garrison: '進駐', convert: '招降' };
  return `${labels[unit.order?.type] || '閒置'}${unit.queued?.length ? ` · 等待 ${unit.queued.length} 道指令` : ''}`;
}
