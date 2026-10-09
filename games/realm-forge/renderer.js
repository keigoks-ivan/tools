import { clamp, tileType, BUILDINGS, buildingBounds, heroPlacementKey, buildingPlacementKey } from './core.mjs?v=20261009l';
import { TEAM_COLORS, TEAM_LIGHT, imageFor, unitArt, animationArt, worldArt, drawSprite, recoloredArt } from './art.mjs?v=20261009l';
import { animationPose, facingDirection } from './motion.mjs?v=20261009l';
import { gaitBob, drawWalkingSprite } from './gait.mjs?v=20261009l';
import { commandWaypoints } from './command-feedback.mjs?v=20261009l';
export function wheelZoomFactor(deltaY, deltaMode = 0, height = 600) {
  const pixels = deltaY * (deltaMode === 1 ? 16 : deltaMode === 2 ? height : 1);
  return Math.exp(-clamp(pixels, -80, 80) * .001);
}
export const COLORS = { grass: '#597c4b', water: '#396b70', forest: '#42633e', gold: '#67754c', stone: '#667458', food: '#68834f', sand: '#a19a6e', road: '#9d8f63' };
export const SYMBOLS = { worker: '♟', soldier: '⚔', archer: '➶', knight: '♞', mage: '✦', beast: '♜', siege: '⚙', cart:'⚖', town: '♜', house: '⌂', barracks: '⚑', tower: '♖', mill: '✣', lumber: '♣', mining: '◆', farm: '▤', archery: '➶', stable: '♞', blacksmith: '⚒', market: '⚖', monastery: '✚', castle: '♜', university: '▥', wall: '▥', gate: 'Π', outpost: '⚑' };
const UNIT_HEIGHT = { worker: 36, soldier: 40, archer: 38, knight: 52, mage: 39, beast: 41, siege: 42, cart:38 };
const ATTACK_SCALE = { worker: 1.21, soldier: 1.18, archer: 1.02, knight: .86 };
const SIEGE_HEIGHT = { ram: 31, mangonel: 35, trebuchet: 54, 'trebuchet-packed': 29 };
const SIEGE_WIDTH = { ram: 42, mangonel: 41, trebuchet: 42, 'trebuchet-packed': 44 };
const BUILDING_WIDTH = { town: 200, house: 92, barracks: 150, tower: 65, mill: 90, farm: 128, wall: 42, castle: 190, gate: 92, market: 182, university: 188, monastery: 145, lumber: 90, mining: 90, outpost: 45, archery: 144, stable: 150, blacksmith: 138, siege: 150 };
const BUILDING_HEIGHT = { town: 135, house: 68, barracks: 100, tower: 116, mill: 96, farm: 65, wall: 42, castle: 158, gate: 82, market: 116, university: 136, monastery: 140, lumber: 72, mining: 70, outpost: 84, archery: 92, stable: 98, blacksmith: 100, siege: 100 };
const spriteHitMasks = new WeakMap();
const groundShadows = new WeakMap(), buildingYards = new Map();
const unitOutlines = new Map();
let forestShadow = null;
function buildingSize(b) {
  const [w, h] = BUILDINGS[b.type].footprint, art = worldArt(b.type, b.team), width = BUILDING_WIDTH[b.type] ?? (w + h) * 24;
  return { art, width, height: Math.min(width * (art?.naturalHeight ?? 1) / (art?.naturalWidth ?? 1), BUILDING_HEIGHT[b.type] ?? 110), bottom: (w + h) * 4.5 };
}
function footprintPolygon(type) {
  const [w, h] = BUILDINGS[type].footprint;
  return [[-w / 2, -h / 2], [w / 2, -h / 2], [w / 2, h / 2], [-w / 2, h / 2]].map(([x, y]) => [(x - y) * 21, (x + y) * 10.5]);
}
function alphaHit(art, dx, dy, width, height, bottom, pad = 0) {
  if (!art?.naturalWidth) return false;
  if (Math.abs(dx) > width / 2 || dy < bottom - height || dy > bottom) return false;
  if (!spriteHitMasks.has(art)) {
    const canvas = document.createElement('canvas'); canvas.width = art.naturalWidth; canvas.height = art.naturalHeight; const c = canvas.getContext('2d'); c.drawImage(art, 0, 0);
    spriteHitMasks.set(art, c.getImageData(0, 0, canvas.width, canvas.height).data);
  }
  const mask = spriteHitMasks.get(art), sx = (dx / width + .5) * art.naturalWidth, sy = (dy - bottom + height) / height * art.naturalHeight;
  for (const [ox, oy] of [[0, 0], [-pad, 0], [pad, 0], [0, -pad], [0, pad]]) {
    const ix = Math.floor(sx + ox), iy = Math.floor(sy + oy); if (ix >= 0 && iy >= 0 && ix < art.naturalWidth && iy < art.naturalHeight && mask[(iy * art.naturalWidth + ix) * 4 + 3] > 24) return true;
  }
  return false;
}
function buildingGround(c, b, p, scale) {
  const { width, height, bottom, art } = buildingSize(b);
  c.save(); c.translate(p.x, p.y); c.scale(scale, scale);
  if (!['wall', 'farm', 'outpost', 'tower'].includes(b.type)) {
    if (!buildingYards.has(b.type)) {
      const canvas = document.createElement('canvas'); canvas.width = 280; canvas.height = 140; const g = canvas.getContext('2d');
      g.translate(140, 70); g.scale(1, .42); const soil = g.createRadialGradient(0, 0, width * .18, 0, 0, width * .62);
      soil.addColorStop(0, '#a68e60a0'); soil.addColorStop(.6, '#99865d58'); soil.addColorStop(1, '#96846000');
      ellipse(g, 0, 0, width * .64, width * .64, soil); buildingYards.set(b.type, canvas);
    }
    c.drawImage(buildingYards.get(b.type), -140, -60);
  }
  if (b.progress >= 1 && art?.complete && art.naturalWidth && b.type !== 'farm') {
    if (!groundShadows.has(art)) { const canvas = document.createElement('canvas'); canvas.width = art.naturalWidth; canvas.height = art.naturalHeight; const s = canvas.getContext('2d'); s.drawImage(art, 0, 0); s.globalCompositeOperation = 'source-in'; s.fillStyle = '#162513'; s.fillRect(0, 0, canvas.width, canvas.height); groundShadows.set(art, canvas); }
    c.globalAlpha = .16; c.translate(0, bottom * .55); c.transform(1, 0, -.4, -.24, 0, 0); drawSprite(c, groundShadows.get(art), 0, 0, width, height);
  }
  c.restore();
}
function buildingHit(b, px, py, scale, x, y) {
  const { width, height, bottom, art } = buildingSize(b), dx = (x - px) / scale, dy = (y - py) / scale;
  if (b.progress < 1) { const [w, h] = BUILDINGS[b.type].footprint; return [0, 17.5, 35].some(rise => Math.abs((dx / 21 + (dy + rise) / 10.5) / 2) <= w / 2 && Math.abs(((dy + rise) / 10.5 - dx / 21) / 2) <= h / 2); }
  if (Math.abs(dx) > width / 2 + 4 / scale || dy < bottom - height - 4 / scale || dy > bottom + 4 / scale) return false;
  if (!art?.naturalWidth || b.progress < 1) return true;
  const pad = Math.min(14, 5 / scale * art.naturalWidth / width);
  return alphaHit(art, dx, dy, width, height, bottom, pad);
}
function facing(u) {
  return facingDirection(u);
}
export function unitHeight(u) {
  const bp = u.blueprint, engine = ['ram', 'mangonel', 'trebuchet'].includes(bp.engine || bp.id) ? bp.engine || bp.id : 'mangonel';
  return bp.look === 'siege' ? SIEGE_HEIGHT[engine === 'trebuchet' && u.packed ? 'trebuchet-packed' : engine] : UNIT_HEIGHT[bp.look] ?? 25;
}
function unitHitHalfWidth(u) {
  return u.blueprint.image ? unitHeight(u) * .41 : ['knight','siege','cart'].includes(u.blueprint.look) ? 21 : 14;
}
function health(c, hp, maxHp, x, y, width, team) { c.fillStyle = '#17221b'; c.fillRect(x - width / 2, y, width, 3); c.fillStyle = TEAM_LIGHT[team % 4]; c.fillRect(x - width / 2, y, width * clamp(hp / maxHp, 0, 1), 3); }
const texture = (x, y) => { const a = Math.sin(x * 47.31 + y * 79.77) * 48345.3; return a - Math.floor(a); };
function polygon(c, points, fill, stroke = null) { c.beginPath(); points.forEach(([x, y], i) => i ? c.lineTo(x, y) : c.moveTo(x, y)); c.closePath(); if (fill) { c.fillStyle = fill; c.fill(); } if (stroke) { c.strokeStyle = stroke; c.stroke(); } }
function ellipse(c, x, y, rx, ry, fill) { c.beginPath(); c.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2); c.fillStyle = fill; c.fill(); }
function line(c, points, color, width = 1) { c.beginPath(); points.forEach(([x, y], i) => i ? c.lineTo(x, y) : c.moveTo(x, y)); c.strokeStyle = color; c.lineWidth = width; c.stroke(); }
export function drawUnit(c, u, x, y, size = 1, time = 0, selected = false) {
  const bp = u.blueprint, pose=animationPose(u),team = TEAM_COLORS[u.team % 4], moving = pose.moving, bob = moving ? gaitBob(bp.look,pose.phase) : 0;
  c.save(); c.translate(x, y); c.scale(size, size);
  const mounted = bp.look === 'knight', heavy = mounted || ['siege','cart'].includes(bp.look);
  ellipse(c, 3, 1, heavy ? 11 : 5, heavy ? 3.5 : 2.2, '#18251845');
  ellipse(c, 0, .5, heavy ? 7 : 3, heavy ? 2 : 1.2, '#18251858');
  if (selected || bp.hero) { c.strokeStyle = bp.hero ? '#edd48ddd' : TEAM_LIGHT[u.team % 4]; c.lineWidth = bp.hero ? 1.5 : 1.3; c.beginPath(); c.ellipse(0, 0, heavy ? 16 : 10, heavy ? 6 : 4, 0, 0, Math.PI * 2); c.stroke(); }
  const direction = facing(u), custom = bp.image ? imageFor(bp.image) : null;
  const attackPhase = pose.state==='attack'?Math.sin(pose.phase*Math.PI):0;
  if (attackPhase) c.translate((direction === 0 || direction === 3 ? 1 : -1) * attackPhase * 1.5, -attackPhase * .4);
  if (u.hitAnimation > 0) c.filter = 'brightness(1.7)';
  const engine = ['ram', 'mangonel', 'trebuchet'].includes(bp.engine || bp.id) ? bp.engine || bp.id : 'mangonel', machine = engine === 'trebuchet' && u.packed ? 'trebuchet-packed' : engine;
  const height = unitHeight(u);
  let drawn = false;
  if (custom) {
    c.save(); c.translate(0,bob);
    drawn=moving&&!['siege','cart'].includes(bp.look)?drawWalkingSprite(c,custom,height*.82,height,pose.phase,bp.look,direction):drawSprite(c,custom,0,1,height*.82,height);
    c.restore();
  }
  if (!drawn && !custom) {
    const state = pose.state;
    const customColor = bp.customColor === true, rasterTeam = customColor ? 0 : u.team;
    const frame = pose.frame;
    const rearGait=state==='walk'&&direction>=2;
    const animated = state&&!rearGait ? animationArt(bp.look, state, frame, rasterTeam) : null;
    const sprite = animated?.complete && animated.naturalWidth ? animated : unitArt(bp.look, direction, rasterTeam, engine, Boolean(u.packed));
    c.save(); if (bp.look === 'siege' || bp.look === 'mage' ? direction === 1 || direction === 3 : sprite === animated && (direction === 1 || direction === 2)) c.scale(-1, 1);
    const frameHeight = height * (sprite === animated && state === 'attack' ? ATTACK_SCALE[bp.look] ?? 1 : 1);
    if (sprite?.naturalWidth) {
      const width=Math.min(frameHeight*sprite.naturalWidth/sprite.naturalHeight,bp.look==='siege'?SIEGE_WIDTH[machine]:Infinity),art=customColor?recoloredArt(sprite,bp.color):sprite;
      c.translate(0,bob);
      drawn=moving&&sprite!==animated&&!['siege','cart'].includes(bp.look)?drawWalkingSprite(c,art,width,height,pose.phase,bp.look,direction):drawSprite(c,art,0,1,width,width*sprite.naturalHeight/sprite.naturalWidth);
      if(moving&&bp.look==='siege') {
        const wheel=(u.moveDistance||0)*5;
        for(const [wx,wy] of [[-width*.25,-2],[width*.27,-4]]) {
          ellipse(c,wx,wy,3.8,3.8,'#45392b');
          line(c,[[wx-Math.cos(wheel)*3,wy-Math.sin(wheel)*3],[wx+Math.cos(wheel)*3,wy+Math.sin(wheel)*3]],'#c8af7c',1.2);
        }
      }
    }
    c.restore();
  }
  if (!drawn) {
    c.save(); c.translate(0, bob); c.scale(height / (mounted ? 39 : bp.look === 'siege' ? 42 : 35), height / (mounted ? 39 : bp.look === 'siege' ? 42 : 35));
    const leg = moving ? Math.sin(pose.phase * Math.PI * 2) * 2.5 : 0;
    if (bp.look === 'knight') {
      ellipse(c, -1, -9, 11, 5, '#79634d'); polygon(c, [[7, -10], [8, -22], [13, -20], [16, -13], [11, -6]], '#887055');
      line(c, [[-7, -7], [-8 + leg, 0]], '#382e24', 3); line(c, [[5, -7], [7 - leg, 0]], '#382e24', 3);
      polygon(c, [[-5, -19], [4, -19], [5, -9], [-5, -9]], team); ellipse(c, 0, -24, 4, 5, '#ccd0c4'); line(c, [[4, -18], [14, -33]], '#b1aa88', 2);
    } else if (bp.look === 'beast') {
      ellipse(c, 0, -11, 10, 7, bp.color); ellipse(c, 8 + attackPhase * 3, -16 + attackPhase * 2, 5, 5, bp.color); line(c, [[-6, -7], [-8 + leg, 0]], '#39423a', 3); line(c, [[5, -6], [7 - leg, 0]], '#39423a', 3); polygon(c, [[10, -20], [14, -26], [13, -17]], '#ded9be');
    } else if (bp.look === 'cart') {
      c.save(); if(direction===1||direction===2)c.scale(-1,1);
      ellipse(c, -10, -9, 7, 4, '#8d7151'); polygon(c,[[-15,-11],[-15,-18],[-20,-19],[-22,-13],[-16,-7]],'#9e805c');
      line(c,[[-13,-6],[-15+leg,0]],'#4e3d29',2);line(c,[[-6,-6],[-7-leg,0]],'#4e3d29',2);
      line(c,[[-5,-9],[8,-6]],'#b09162',2);polygon(c,[[0,-12],[12,-17],[21,-10],[9,-4]],'#bd965e','#5d452c');
      polygon(c,[[0,-12],[0,-18],[11,-23],[12,-17]],team);polygon(c,[[12,-17],[11,-23],[21,-16],[21,-10]],'#927148');
      ellipse(c,4,-3,4,4,'#3f3427');ellipse(c,18,-5,4,4,'#3f3427');
      const wheel=(u.moveDistance||0)*5;
      for(const [wx,wy] of [[4,-3],[18,-5]])line(c,[[wx-Math.cos(wheel)*3,wy-Math.sin(wheel)*3],[wx+Math.cos(wheel)*3,wy+Math.sin(wheel)*3]],'#d4b279');
      if(u.order?.cargo>0){c.fillStyle='#e9c45d';c.fillRect(5,-22,7,4);}
      c.restore();
    } else if (bp.look === 'siege') {
      polygon(c, [[-17, -10], [-4, -18], [18, -9], [4, 0]], '#926c3f', '#423729');
      line(c, [[-10, -9], [2, u.packed ? -16 : -32], [12, -9]], '#b69a67', 4);
      c.save(); c.translate(2, u.packed ? -15 : -29); c.rotate(attackPhase * 1.2); line(c, [[0, 0], [-11, -9]], '#b49a6d', 3); ellipse(c, -11, -9, 3, 2, '#433c29'); c.restore();
      ellipse(c, -11, -1, 5, 5, '#342d22'); ellipse(c, 10, 3, 5, 5, '#342d22'); ellipse(c, -11, -1, 2, 2, '#9d865c'); ellipse(c, 10, 3, 2, 2, '#9d865c');
      const wheel = (u.moveDistance||0)*5;
      for (const [wx, wy] of [[-11, -1], [10, 3]]) line(c, [[wx - Math.cos(wheel) * 4, wy - Math.sin(wheel) * 4], [wx + Math.cos(wheel) * 4, wy + Math.sin(wheel) * 4]], '#ad9365', 1);
      if (attackPhase > .6) ellipse(c, 15, -25, 3 + attackPhase * 2, 2, '#f2dca799');
      polygon(c, [[-9, -12], [-2, -16], [5, -11], [-2, -7]], team);
    } else {
      line(c, [[-3, -7], [-4 + leg, 0]], '#313b30', 3); line(c, [[3, -7], [4 - leg, 0]], '#313b30', 3);
      polygon(c, [[-5, -19], [4, -19], [6, -7], [-6, -7]], bp.color); polygon(c, [[-5, -18], [-7, -9], [-4, -8], [-2, -15]], bp.color);
      ellipse(c, 0, -24, 3.8, 4.3, '#dbb389');
      if (bp.look === 'worker') { polygon(c, [[-6, -25], [-3, -29], [3, -29], [6, -25]], '#bc9a62'); line(c, [[4, -15], [13, -22]], '#8b7651', 2); line(c, [[10, -25], [16, -21]], '#b9bec0', 2); }
      if (bp.look === 'soldier') { polygon(c, [[-4, -24], [-4, -29], [3, -30], [5, -24]], '#c1c8c4'); line(c, [[6, -12], [13, -27]], '#c9d8d5', 2); polygon(c, [[-7, -17], [-12, -15], [-11, -7], [-6, -6]], team, '#9dac9e'); }
      if (bp.look === 'archer') { polygon(c, [[-5, -24], [-3, -29], [3, -29], [5, -24]], '#536e42'); c.strokeStyle = '#d6bb86'; c.lineWidth = 1.5; c.beginPath(); c.arc(6, -15, 10, -1.1, 1.1); c.stroke(); line(c, [[10, -24], [10, -6]], '#d5d5af'); }
      if (bp.look === 'mage') { polygon(c, [[-5, -24], [0, -35], [5, -24]], bp.color); polygon(c, [[-5, -17], [6, -17], [10, -3], [-10, -3]], bp.color); line(c, [[8, -5], [12 + attackPhase * 3, -30]], '#b59562', 2); ellipse(c, 12 + attackPhase * 3, -31, 3 + attackPhase * 2, 3 + attackPhase * 2, '#aeefcd'); }
      c.fillStyle = team; c.fillRect(-3, -19, 6, 3);
    }
    c.restore();
  }
  if (u.carried > 0) {
    c.fillStyle = u.carrying==='gold'?'#e3c063':u.carrying==='stone'?'#adb4ab':'#bd9b62';c.fillRect(-8,-16+bob,5,6);
    if(u.carrying==='wood')line(c,[[-9,-14+bob],[-2,-14+bob]],'#704c29',2);
  }
  if (bp.hero) { polygon(c, [[0, -height - 8], [1.4, -height - 5], [4, -height - 5], [2, -height - 3], [2.8, -height - 1], [0, -height - 2.5], [-2.8, -height - 1], [-2, -height - 3], [-4, -height - 5], [-1.4, -height - 5]], '#e9cb82', '#6e5027'); }
  if (u.hp > 0 && (selected || u.hp < u.maxHp)) health(c, u.hp, u.maxHp, 0, -height - (bp.hero ? 12 : 5), heavy ? 23 : 19, u.team);
  c.restore();
}
function treeSize(variation, small = false) {
  const type = ['oak', 'oak-alt', 'pine', 'pine-alt'][Math.min(3, Math.floor(variation * 4))], art = worldArt(small ? 'young' : type);
  const height = small ? 28 + variation * 10 : (type.startsWith('pine') ? 83 : 76) + variation * 12;
  const width = clamp(height * (art?.naturalWidth ?? 1) / (art?.naturalHeight ?? 1), small ? 14 : 45, small ? 25 : 62);
  return { art, height, width, bottom: 1 };
}
function tree(c, x, y, variation, small = false) {
  const { art, width, height, bottom } = treeSize(variation, small);
  if (drawSprite(c, art, x, y + bottom, width, height)) return;
  c.save(); c.translate(x, y); const s = height / 46; c.scale(s, s);
  ellipse(c, 4, 1, 14, 5, '#172a1740'); c.fillStyle = '#725b3c'; c.fillRect(-2, -12, 4, 13);
  polygon(c, [[0, -46], [-16, -17], [-7, -19], [-19, -9], [0, -4], [17, -10], [9, -21], [15, -21]], '#234b32');
  polygon(c, [[0, -46], [-16, -17], [-7, -19], [-19, -9], [0, -4]], '#315e3a');
  polygon(c, [[0, -43], [3, -27], [-11, -21]], '#50783d'); line(c, [[-14, -12], [-3, -9]], '#68804650'); c.restore();
}
function building(c, b, x, y, scale, selected) {
  const { art, width, height, bottom } = buildingSize(b);
  if (b.progress >= 1 && art?.complete && art.naturalWidth) {
    c.save(); c.translate(x, y); c.scale(scale, scale);
    if (selected) polygon(c, footprintPolygon(b.type), '#a4d2ff14', TEAM_LIGHT[b.team % 4]);
    drawSprite(c, art, 0, bottom, width, height);
    if (b.type === 'farm') { line(c, [[25, 5], [25, -18]], '#91724d', 1.5); polygon(c, [[25, -18], [36, -14], [25, -10]], TEAM_COLORS[b.team % 4]); }
    if (selected || b.hp < b.maxHp) health(c, b.hp, b.maxHp, 0, bottom - height - 6, Math.min(width * .7, 55), b.team);
    c.restore(); return;
  }
  vectorBuilding(c, b, x, y, scale, selected);
}
function vectorBuilding(c, b, x, y, scale, selected) {
  const team = TEAM_COLORS[b.team % 4]; c.save(); c.translate(x, y); c.scale(scale, scale);
  if (selected) polygon(c, footprintPolygon(b.type), '#85cab71b', '#9bd3b8');
  ellipse(c, 8, 4, 35, 12, '#16220e60');
  if (b.progress < 1) { const base = footprintPolygon(b.type); polygon(c, base, '#9b9671', '#c0b78e'); for (const [px, py] of base) line(c, [[px, py], [px, py - 35]], '#b8a078', 2); line(c, base.map(([px, py]) => [px, py - 35]), '#826741', 2); c.fillStyle = '#293828'; c.fillRect(-22, -48, 44, 4); c.fillStyle = '#d7b77b'; c.fillRect(-22, -48, 44 * b.progress, 4); c.restore(); return; }
  const fortified = ['tower', 'castle', 'gate', 'wall'].includes(b.type);
  const height = b.type === 'tower' ? 60 : ['town', 'castle', 'monastery'].includes(b.type) ? 41 : b.type === 'wall' ? 22 : 27, width = ['town', 'castle', 'market', 'university'].includes(b.type) ? 30 : b.type === 'tower' ? 15 : 23;
  polygon(c, [[-width, -height], [0, -height + width / 2], [0, width / 2], [-width, 0]], '#c5bd9e', '#7c8067');
  polygon(c, [[0, -height + width / 2], [width, -height], [width, 0], [0, width / 2]], '#929b83', '#6d7b64');
  if (fortified) {
    polygon(c, [[-19, -height - 6], [0, -height - 15], [19, -height - 6], [0, -height + 3]], '#d3c6a5', '#7c8067');
    for (let i = 0; i < 4; i++) { c.fillStyle = '#c2bb9d'; c.fillRect(-18 + i * 10, -height - 11, 6, 10); }
    line(c, [[0, -height - 10], [0, -height - 31]], '#bea470', 2); polygon(c, [[0, -height - 31], [16, -height - 28], [0, -height - 21]], team);
  } else {
    polygon(c, [[-width - 4, -height], [-7, -height - 17], [width + 5, -height - 4], [0, -height + width / 2 + 3]], team, '#213b2b');
    polygon(c, [[-width - 4, -height], [-7, -height - 17], [0, -height + width / 2 + 3]], TEAM_LIGHT[b.team % 4]);
    for (let i = 0; i < 4; i++) line(c, [[-width + i * 6, -height - i * 3], [-width + i * 6 + 21, -height + 9 - i * 2]], '#19332330');
    if (b.type === 'town') { polygon(c, [[-8, -height - 18], [1, -height - 23], [10, -height - 18], [1, -height - 13]], '#ceb98e'); polygon(c, [[-8, -height - 18], [-8, -height - 35], [1, -height - 30], [1, -height - 13]], '#c7c09f'); polygon(c, [[1, -height - 30], [10, -height - 35], [10, -height - 18], [1, -height - 13]], '#9aa18a'); polygon(c, [[-12, -height - 35], [1, -height - 44], [14, -height - 35], [1, -height - 28]], team); }
    if (b.type === 'barracks') { line(c, [[23, 0], [23, -48]], '#bfa172', 2); polygon(c, [[23, -48], [41, -45], [23, -34]], team); }
  }
  polygon(c, [[5, -18], [12, -21], [12, 0], [5, 3]], '#3b4c37'); polygon(c, [[-18, -height + 12], [-12, -height + 15], [-12, -height + 22], [-18, -height + 19]], '#455f50');

  if (b.type === 'outpost') { line(c, [[-16, 4], [-16, -34]], '#9c8258', 3); line(c, [[16, 4], [16, -34]], '#9c8258', 3); line(c, [[-16, -9], [16, -24]], '#705b3d', 2); }
  if (b.type === 'monastery') { line(c, [[-6, -58], [-6, -81]], '#e7d9b4', 3); line(c, [[-13, -73], [1, -73]], '#e7d9b4', 3); polygon(c, [[-9, -32], [-2, -36], [-2, -22], [-9, -18]], '#4c7594'); }
  if (b.type === 'castle') for (const tx of [-28, 25]) { polygon(c, [[tx - 8, -54], [tx + 8, -48], [tx + 8, 0], [tx - 8, -6]], tx < 0 ? '#bfb89d' : '#8f988c', '#596257'); for (let j = 0; j < 3; j++) { c.fillStyle = '#c4bda1'; c.fillRect(tx - 9 + j * 6, -59, 4, 9); } line(c, [[tx, -22], [tx, -33]], '#394b45', 3); }
  if (b.type === 'gate') { c.fillStyle = '#243c33'; c.fillRect(-7, -22, 14, 27); line(c, [[-5, -22], [-5, 2]], '#ad9266', 2); line(c, [[5, -22], [5, 2]], '#ad9266', 2); }
  if (b.type === 'archery') for (let i = 0; i < 3; i++) { const tx = -20 + i * 14; ellipse(c, tx, 8 - i * 4, 6, 6, '#cabe98'); ellipse(c, tx, 8 - i * 4, 3.8, 3.8, '#a95443'); ellipse(c, tx, 8 - i * 4, 1.6, 1.6, '#eee0b4'); }
  if (b.type === 'stable') { ellipse(c, 18, -4, 8, 4, '#7e6449'); ellipse(c, 25, -9, 3, 4, '#9a7853'); line(c, [[12, -2], [11, 5]], '#3e3429', 2); line(c, [[23, -2], [24, 5]], '#3e3429', 2); }
  if (b.type === 'lumber') for (let i = 0; i < 4; i++) { line(c, [[-27, 2 + i * 3], [-9, 10 + i * 3]], '#866743', 4); ellipse(c, -9, 10 + i * 3, 2, 2, '#c6a573'); }
  if (b.type === 'mining') { polygon(c, [[12, 5], [15, -4], [24, -6], [32, 4], [23, 10]], '#9a9c87', '#575e55'); line(c, [[-24, 4], [0, 16]], '#7d5c38', 2); line(c, [[-16, 0], [8, 12]], '#7d5c38', 2); }
  if (b.type === 'blacksmith') { polygon(c, [[-13, -33], [-13, -59], [-5, -55], [-5, -29]], '#b3a792', '#645e52'); ellipse(c, -10, -64, 5, 5, '#939b8855'); polygon(c, [[7, -8], [14, -11], [14, -1], [7, 3]], '#e99049'); polygon(c, [[17, 5], [27, 1], [31, 4], [21, 8]], '#77847f'); }
  if (b.type === 'market') { polygon(c, [[-30, -9], [-12, -18], [5, -9], [-14, 1]], '#d5ad77', '#6e5837'); for (let i = 0; i < 3; i++) ellipse(c, -26 + i * 8, 7 + i * 2, 4, 5, '#b99c62'); line(c, [[-28, -7], [-28, 9]], '#9c7c4d', 2); line(c, [[2, -8], [2, 14]], '#9c7c4d', 2); }
  if (b.type === 'siege') { ellipse(c, 24, 5, 8, 8, '#82693e'); ellipse(c, 24, 5, 5, 5, '#2e392e'); line(c, [[-24, 2], [-13, -15], [1, 7]], '#9d8053', 3); }
  if (b.type === 'university') { polygon(c, [[-3, -46], [1, -53], [6, -46], [1, -42]], '#c9bc94'); line(c, [[1, -51], [1, -63]], '#ddc99e', 1.5); c.fillStyle = '#d5bd7c'; c.fillRect(-17, -18, 8, 7); c.fillRect(8, -22, 6, 7); }
  if (b.type === 'farm') { for (let i = 0; i < 6; i++) line(c, [[-28 + i * 5, 3 - i * 2], [-2 + i * 5, 15 - i * 2]], '#c1a45d', 3); }
  if (selected || b.hp < b.maxHp) { c.fillStyle = '#19281c'; c.fillRect(-25, -height - 51, 50, 4); c.fillStyle = TEAM_LIGHT[b.team % 4]; c.fillRect(-25, -height - 51, 50 * clamp(b.hp / b.maxHp, 0, 1), 4); }
  c.restore();
}
const grassImage = imageFor('assets/grass-v2.webp');
const groundTextures = [];
function prepareGround() {
  if (groundTextures.length || !grassImage?.complete || !grassImage.naturalWidth) return groundTextures;
  const canvas = document.createElement('canvas'); canvas.width = 768; canvas.height = 768;
  canvas.getContext('2d').drawImage(grassImage, 0, 0, 768, 768); groundTextures.push(canvas);
  return groundTextures;
}
const tileCorners = [[0, -10.5], [21, 0], [0, 10.5], [-21, 0]];
function drawGround(c, x, y, type, variation, scale, coasts, textures) {
  c.save(); c.translate(x, y); c.scale(scale, scale);
  if (!textures.length) polygon(c, tileCorners, COLORS[type] ?? COLORS.grass);
  if (type === 'sand' || type === 'road') {
    polygon(c, tileCorners, type === 'sand' ? '#bfaf7bc9' : '#ab9471d9');
    for (let k = 0; k < 5; k++) { const v = texture(k + variation * 17, k * 3); ellipse(c, -11 + v * 22, -4 + texture(k, variation * 41) * 8, 1.1, .45, type === 'road' ? '#706b5150' : '#e1d8a044'); }
    if (type === 'road') { line(c, [[-15, -2], [8, 7]], '#74674b2b', 1); line(c, [[-8, -6], [15, 2]], '#e7d2a030', 1); }
  }
  if (type === 'water') {
    polygon(c, tileCorners, '#3b7074');
    line(c, [[-13, 0], [-7, 1], [3, -1], [12, -1]], '#96c0b633', .8);
    if (variation > .6) line(c, [[-2, 5], [7, 3], [13, 3]], '#b1d0bc33', .7);
  }
  if (coasts) for (let edge = 0; edge < 4; edge++) if (coasts & (1 << edge)) {
    const a = tileCorners[edge], b = tileCorners[(edge + 1) % 4];
    polygon(c, [a, b, [b[0] * .7, b[1] * .7], [(a[0] + b[0]) * .37, (a[1] + b[1]) * .37], [a[0] * .7, a[1] * .7]], type === 'water' ? '#a9a27365' : '#b1a56b60');
    line(c, [[a[0] * .89, a[1] * .89], [(a[0] + b[0]) * .48, (a[1] + b[1]) * .48], [b[0] * .9, b[1] * .9]], type === 'water' ? '#c4c8a659' : '#89865750', 1);
  }
  if (type === 'grass' && variation > .58) {
    for (let k = 0; k < 4; k++) { const dx = -12 + texture(k + 3, variation * 17) * 24, dy = -4 + texture(k + 7, variation * 31) * 8;
      line(c, [[dx - 1, dy], [dx, dy - 2.6], [dx + .7, dy]], '#67783575', .7);
      if (variation > .85 && k % 2 === 0) ellipse(c, dx, dy - 2, .7, .5, '#dbcb86a0');
    }
  }
  c.restore();
}
function resourceSize(e) {
  if (e.t === 'forest') return treeSize(e.v);
  const art = worldArt(e.t), width = (e.t === 'food' ? 30 : 35) + e.v * 7;
  return { art, width, height: width * (art?.naturalHeight ?? 1) / (art?.naturalWidth ?? 2), bottom: 2 };
}
function resourceDecoration(x, y, t, v, visible) {
  const dx = (v - .5) * (t === 'forest' ? 11 : 7), dy = (texture(x + 19, y + 7) - .5) * 6;
  return { x: x + dx / 42 + dy / 21, y: y + dy / 21 - dx / 42, sourceX: x, sourceY: y, t, v, visible };
}
function resourceGround(c, e, p, scale) {
  if (e.t !== 'forest') return;
  if (!forestShadow) {
    forestShadow = document.createElement('canvas'); forestShadow.width = 128; forestShadow.height = 48; const g = forestShadow.getContext('2d');
    g.translate(64, 24); g.scale(1, .35); const shade = g.createRadialGradient(0, 0, 5, 0, 0, 60);
    shade.addColorStop(0, '#18271965'); shade.addColorStop(.5, '#1d30172e'); shade.addColorStop(1, '#192d1400'); ellipse(g, 0, 0, 60, 60, shade);
  }
  const width = treeSize(e.v).width * 1.25; c.save(); c.globalAlpha = e.visible ? 1 : .35; c.drawImage(forestShadow, p.x - width * scale / 2, p.y - width * scale * .16, width * scale, width * scale * .38); c.restore();
}
function selectedForestOutline(c, u, p, scale) {
  const height = unitHeight(u), art = u.blueprint.image ? imageFor(u.blueprint.image) : unitArt(u.blueprint.look, facing(u), u.team);
  if (!art?.naturalWidth) return;
  const width = u.blueprint.image ? height * .82 : height * art.naturalWidth / art.naturalHeight, key = `${art.assetSource ?? art.src}:${width}:${height}`;
  if (!unitOutlines.has(key)) {
    const mask = document.createElement('canvas'); mask.width = Math.ceil(width) + 6; mask.height = Math.ceil(height) + 6; const g = mask.getContext('2d');
    g.drawImage(art, 3, 3, width, height); g.globalCompositeOperation = 'source-in'; g.fillStyle = '#dedebf'; g.fillRect(0, 0, mask.width, mask.height);
    const outline = document.createElement('canvas'); outline.width = mask.width; outline.height = mask.height; const o = outline.getContext('2d');
    for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [1, 1], [-1, 1], [1, -1]]) o.drawImage(mask, dx, dy);
    o.globalCompositeOperation = 'destination-out'; o.drawImage(mask, 0, 0); unitOutlines.set(key, outline);
  }
  const outline = unitOutlines.get(key); c.save(); c.globalAlpha = .72; c.drawImage(outline, p.x - (width / 2 + 3) * scale, p.y - (height + 2) * scale, outline.width * scale, outline.height * scale); c.restore();
}
function resource(c, e, p, scale) {
  c.save(); c.translate(p.x, p.y); c.scale(scale, scale); if (!e.visible) c.globalAlpha = .32;
  if (e.t === 'forest') {
    tree(c, 0, 0, e.v);
  } else if (e.t === 'wild') {
    if (e.v > .965) tree(c, (e.v - .97) * 160, 2, texture(e.x, e.y + 37), true);
    else if (e.v > .948) drawSprite(c, worldArt('food'), (e.v - .95) * 160, 2, 9 + texture(e.x + 9, e.y) * 6);
    else {
      for (let k = 0; k < 5; k++) { const dx = -6 + texture(e.x + k, e.y) * 12, dy = texture(e.x, e.y + k) * 3; line(c, [[dx - 1, dy], [dx, dy - 2.2 - texture(k, e.v) * 2], [dx + .7, dy]], k % 2 ? '#5d713d99' : '#8791538c', .7); }
      if (e.v > .93) { polygon(c, [[-7, 2], [-5, -.5], [-2, 1], [-3, 3]], '#969982'); line(c, [[-7, 2], [-5, -.5], [-2, 1]], '#c3c1a1', .7); }
    }
  } else if (!drawSprite(c, resourceSize(e).art, 0, 2, resourceSize(e).width, resourceSize(e).height)) {
    if (e.t === 'food') { ellipse(c, 0, -3, 11, 6, '#3c5e31'); for (let k = 0; k < 7; k++) ellipse(c, Math.sin(k * 5) * 8, -4 + Math.cos(k * 3) * 3, 1.6, 1.6, '#c89264'); }
    else { const gold = e.t === 'gold'; polygon(c, [[-13, 0], [-10, -9], [-2, -15], [5, -8], [13, -5], [15, 1], [0, 6]], gold ? '#8e8a63' : '#889a89'); polygon(c, [[-2, -15], [5, -8], [0, 6], [-7, -2]], gold ? '#bba564' : '#a7afa0'); }
  }
  c.restore();
}
function editorHeroes(project, world) {
  const deployed = new Map(world.units.filter(u=>u.team===0 && u.heroPlacementKey).map(u=>[u.heroPlacementKey,u]));
  return (project.map.heroPlacements ?? []).flatMap(p => {
    const blueprint = project.units.find(u => u.id === p.unitId && u.hero); if (!blueprint) return [];
    const key = heroPlacementKey(p), actual = deployed.get(key);
    return [{ ...actual, id: actual?.id ?? `editor-hero:${key}`, heroPlacementKey:key, unitId: p.unitId, kind: 'unit', team: 0, blueprint, x: p.x, y: p.y, hp: actual?.hp > 0 ? actual.hp : blueprint.hp, maxHp: actual?.maxHp ?? blueprint.hp, path: [], attackAnimation: 0, hitAnimation: 0, garrison: null, editorHero: true, editorValid:Boolean(actual) }];
  });
}
function editorBuildings(project, world) {
  const deployed = new Map(world.buildings.filter(b=>b.buildingPlacementKey).map(b=>[b.buildingPlacementKey,b]));
  return (project.map.buildingPlacements ?? []).flatMap(p => {
    if (!BUILDINGS[p.type]) return [];
    const key = buildingPlacementKey(p), actual = deployed.get(key), bounds = buildingBounds(p.type,p.x,p.y);
    const maxHp = actual?.maxHp ?? BUILDINGS[p.type].hp;
    return [{ ...actual, id:actual?.id ?? `editor-building:${key}`, buildingPlacementKey:key, kind:'building', type:p.type, team:p.team, x:bounds.x, y:bounds.y, hp:actual?.hp > 0 ? actual.hp : maxHp, maxHp, progress:1, editorBuilding:true, editorValid:Boolean(actual) }];
  });
}
function editorHeroSelected(hero, ui) {
  return ui.heroPlacementSelected ? ui.heroPlacementSelected === hero.heroPlacementKey : ui.heroSelected === hero.unitId;
}
function heroMarker(c, x, y, selected, valid = true, radius = 6) {
  const color = valid ? '#e5c47b' : '#ef8b7d';
  if (selected) { c.strokeStyle = color; c.lineWidth = 1.4; c.beginPath(); c.arc(x, y, radius + 3, 0, Math.PI * 2); c.stroke(); }
  polygon(c, Array.from({ length: 10 }, (_, i) => { const a = i * Math.PI / 5 - Math.PI / 2, r = i % 2 ? radius * .44 : radius; return [x + Math.cos(a) * r, y + Math.sin(a) * r]; }), color, '#302918');
}
function heroLabel(c, hero, p, selected, overview) {
  if (!selected && !overview && hero.editorValid) return;
  const text = hero.blueprint.name + (hero.editorValid ? '' : ' · 位置需調整');
  c.save(); c.font = '11px sans-serif'; c.textAlign = 'center'; const width = c.measureText(text).width + 12, y = p.y + (overview ? 12 : 15);
  c.fillStyle = '#101c16dd'; c.fillRect(p.x - width / 2, y - 10, width, 16); c.fillStyle = hero.editorValid ? '#ead6a5' : '#ffb5a6'; c.fillText(text, p.x, y + 2); c.restore();
}
export class Renderer {
  constructor(canvas, minimap) { this.canvas = canvas; this.c = canvas.getContext('2d'); this.minimap = minimap; this.mc = minimap.getContext('2d'); this.width = 1000; this.height = 600; this.zoom = 1; this.pan = { x: 0, y: 0 }; this.tileW = 42; this.tileH = 21; this.project = null; this.hover = null; this.drag = null; this.marker = null; this.miniTime = -Infinity; this.terrainCanvas = null; this.terrainTime = -Infinity; this.terrainKey = ''; this.terrainMap = null; this.terrainDecorations = []; this.resize(); }
  resize() { const r = this.canvas.getBoundingClientRect(), dpr = Math.min(window.devicePixelRatio || 1, 2); this.width = r.width; this.height = r.height; this.canvas.width = r.width * dpr; this.canvas.height = r.height * dpr; this.dpr = dpr; this.terrainCanvas = null; }
  fit(map) {
    this.overviewView ??= {zoom:this.zoom, center:this.world(this.width / 2, this.height / 2)};
    this.zoom = clamp(Math.min((this.width - 90) / (map.size * this.tileW), (this.height - 80) / (map.size * this.tileH)), .005, 2.5);
    this.pan = {x:0, y:14};
  }
  restoreView() {
    if (!this.overviewView) return false;
    const view = this.overviewView; this.overviewView = null; this.zoom = view.zoom; this.center(view.center); return true;
  }
  zoomBy(factor, minimum = .55, maximum = 1.8) {
    this.restoreView();
    const next = clamp(this.zoom * factor, minimum, maximum), ratio = next / this.zoom;
    this.pan = {x:this.pan.x * ratio, y:this.pan.y * ratio}; this.zoom = next; this.constrainView();
  }
  constrainView() {
    if (this.overviewView) return;
    const p = this.world(this.width / 2, this.height / 2), n = this.project.map.size - 1;
    if (p.x < 0 || p.y < 0 || p.x > n || p.y > n) this.center({x:clamp(p.x,0,n), y:clamp(p.y,0,n)});
  }
  center(p) {
    if (this.overviewView) {this.zoom = this.overviewView.zoom; this.overviewView = null;}
    this.pan.x = -(p.x - p.y) * this.tileW / 2 * this.zoom; this.pan.y = -(p.x + p.y - this.project.map.size + 1) * this.tileH / 2 * this.zoom;
  }
  screen(x, y) { const n = this.project.map.size; return { x: this.width / 2 + this.pan.x + (x - y) * this.tileW / 2 * this.zoom, y: this.height / 2 + this.pan.y + (x + y - n + 1) * this.tileH / 2 * this.zoom }; }
  world(x, y) { const a = (x - this.width / 2 - this.pan.x) / (this.tileW / 2 * this.zoom), b = (y - this.height / 2 - this.pan.y) / (this.tileH / 2 * this.zoom) + this.project.map.size - 1; return { x: (a + b) / 2, y: (b - a) / 2 }; }
  tileAt(x, y) { const p = this.world(x, y); return { x: Math.round(p.x), y: Math.round(p.y) }; }
  heroHit(x, y, world) {
    for (const hero of editorHeroes(this.project, world).sort((a, b) => b.x + b.y - a.x - a.y)) {
      const p = this.screen(hero.x, hero.y);
      if (this.zoom < .18 ? Math.hypot(x - p.x, y - p.y) <= 10 : Math.abs(x - p.x) < unitHitHalfWidth(hero) * this.zoom + 4 && y <= p.y + 6 && y >= p.y - (unitHeight(hero) + 10) * this.zoom - 4) return hero;
    }
    return null;
  }
  buildingHit(x,y,world) {
    for (const b of editorBuildings(this.project,world).sort((a,b)=>b.x+b.y-a.x-a.y)) {
      const p = this.screen(b.x,b.y);
      if (this.zoom < .18 ? Math.hypot(x-p.x,y-p.y) <= 9 : buildingHit(b,p.x,p.y,this.zoom,x,y)) return b;
    }
    return null;
  }
  resourceHit(screenX, screenY, world, fog) {
    if (this.zoom < .18 || this.drawnResourceMap !== world.map) return null;
    for (let k = (this.drawnResources?.length ?? 0) - 1; k >= 0; k--) {
      const e = this.drawnResources[k], x = e.sourceX, y = e.sourceY, i = y * world.map.size + x;
      if (fog && !world.visible[i] || tileType(world.map, x, y) !== e.t || world.amountAt?.(x, y) === 0) continue;
      const p = this.screen(e.x, e.y), s = resourceSize(e);
      if (alphaHit(s.art, (screenX - p.x) / this.zoom, (screenY - p.y) / this.zoom, s.width, s.height, s.bottom)) return { x, y, type: e.t };
    }
    return null;
  }
  minimapPoint(normalizedX, normalizedY) {
    const width = this.minimap.width, height = this.minimap.height, rx = width / 2 - 4, ry = height / 2 - 4;
    const a = (normalizedX * width - width / 2) / rx, b = (normalizedY * height - 4) / ry, n = this.project.map.size - 1;
    return { x: clamp((a + b) / 2, 0, 1) * n, y: clamp((b - a) / 2, 0, 1) * n };
  }
  hit(x, y, world, fog, unitsOnly = false, enemiesOnly = false) {
    let best=null,depth=-Infinity;
    for (const e of [...world.units,...world.buildings]) { if(unitsOnly&&e.kind!=='unit'||enemiesOnly&&e.team===0||e.hp<=0||e.garrison||fog&&!world.isVisible(e)||e.x+e.y<=depth)continue;
      const p=this.screen(e.x,e.y);
      const hit=this.zoom<.18?Math.hypot(x-p.x,y-p.y)<6:e.kind==='building'?buildingHit(e,p.x,p.y,this.zoom,x,y):Math.abs(x-p.x)<unitHitHalfWidth(e)*this.zoom+6&&y<p.y+7&&y>p.y-unitHeight(e)*this.zoom-6;
      if(hit){best=e;depth=e.x+e.y;}
    }
    return best;
  }
  commandHit(x,y,world,fog,selected) {
    const target=this.hit(x,y,world,fog);
    return target?.kind==='unit'&&target.team===0&&selected.has(target.id)?this.hit(x,y,world,fog,true,true)||target:target;
  }
  commandFeedback(world,ui) {
    const c=this.c,targets=new Map();let paths=0,destinations=0;
    for(const id of ui.selected){const u=world.entity(id);if(!u||u.kind!=='unit'||u.team!==0||u.garrison)continue;
      if(destinations<3) {
        const points=commandWaypoints(world,u);
        if(points.length) {
          destinations++;
          c.save();c.setLineDash([3,6]);line(c,[u,...points].map(p=>{const s=this.screen(p.x,p.y);return[s.x,s.y];}),'#a4d2ff55',1);c.setLineDash([]);
          for(const point of points) {
            const p=this.screen(point.x,point.y);c.strokeStyle=point.type==='attackMove'||point.type==='attackGround'?'#e8a184':'#a4d2ff';c.lineWidth=1.2;c.beginPath();c.ellipse(p.x,p.y,6,3,0,0,Math.PI*2);c.stroke();
            if(point.queued){c.fillStyle='#dce8ed';c.font='10px sans-serif';c.textAlign='center';c.fillText(String(point.index),p.x,p.y-7);}
          }
          c.restore();
        }
      }
      const target=world.entity(u.autoTarget&&world.canAutoCombat(u)?u.autoTarget:u.order?.type==='attack'?u.order.target:null);
      if(!target||target.hp<=0||!world.isEnemy(u.team,target.team)||!world.isVisible(target))continue;
      if(targets.size<16)targets.set(target.id,target);
      if(paths++>=8)continue;
      const points=[u,...(u.path||[]).filter((p,i,a)=>i%5===0||i===a.length-1),target].map(p=>{const s=this.screen(p.x,p.y);return[s.x,s.y];});
      c.save();c.setLineDash([5,7]);line(c,points,'#ee97885c',1);c.restore();
    }
    const hovered=world.entity(this.hoverTarget);if(hovered&&hovered.hp>0&&!hovered.garrison&&world.isVisible(hovered))targets.set(hovered.id,hovered);
    for(const target of targets.values()) {
      const p=this.screen(target.x,target.y);c.save();c.strokeStyle='#f28b78';c.lineWidth=1.8;
      if(target.kind==='building')polygon(c,footprintPolygon(target.type).map(([x,y])=>[p.x+x*this.zoom,p.y+y*this.zoom]),'#d34c3410','#f28b78');
      else{c.beginPath();c.ellipse(p.x,p.y,16*this.zoom,6*this.zoom,0,0,Math.PI*2);c.stroke();}
      const height=target.kind==='building'?buildingSize(target).height-buildingSize(target).bottom:unitHeight(target);
      health(c,target.hp,target.maxHp,p.x,p.y-(height+7)*this.zoom,Math.max(26,30*this.zoom),target.team);
      if(this.hoverAttack&&hovered?.id===target.id) {
        c.translate(p.x,p.y-(height+7)*this.zoom-22);
        polygon(c,[[-6,7],[-3,10],[10,-3],[11,-12],[3,-10]],'#eef0d5','#34413a');
        line(c,[[-8,4],[0,12]],'#d5a860',3);line(c,[[-4,8],[-10,14]],'#825538',4);line(c,[[-2,4],[8,-7]],'#bbc8b5');
      }
      c.restore();
    }
  }
  render(project, world, ui, time) {
    this.project = project; const c = this.c, n = project.map.size, map = ui.mode === 'map' ? project.map : world.map, fog = ui.mode === 'play' && ui.started && project.rules.fog;
    c.setTransform(this.dpr, 0, 0, this.dpr, 0, 0); c.clearRect(0, 0, this.width, this.height);
    const bg = c.createRadialGradient(this.width / 2, this.height / 2, 0, this.width / 2, this.height / 2, this.width * 0.6); bg.addColorStop(0, '#243b2a'); bg.addColorStop(1, '#10221d'); c.fillStyle = bg; c.fillRect(0, 0, this.width, this.height);
    const tw = this.tileW / 2 * this.zoom, th = this.tileH / 2 * this.zoom, textures = prepareGround(), overview = this.zoom < .18;
    const marginX = Math.max(100, 110 * this.zoom), marginY = Math.max(150, 165 * this.zoom);
    let decorations = this.terrainDecorations;
    const terrainKey = [this.width, this.height, this.pan.x, this.pan.y, this.zoom, ui.mode, fog, map.seed, map.revision ?? 0, textures.length].join(':');
    if (!this.terrainCanvas || this.terrainMap !== map || this.terrainKey !== terrainKey || (fog || ui.mode === 'map') && time - this.terrainTime >= .2) {
      if (!this.terrainCanvas) { this.terrainCanvas = document.createElement('canvas'); this.terrainCanvas.width = this.canvas.width; this.terrainCanvas.height = this.canvas.height; }
      const c = this.terrainCanvas.getContext('2d'); c.setTransform(this.dpr, 0, 0, this.dpr, 0, 0); c.clearRect(0, 0, this.width, this.height); decorations = [];
      let unknownMask = null, seenMask = null;
      if (fog && !overview) {
        const maskWidth = Math.ceil(this.width / 2), maskHeight = Math.ceil(this.height / 2);
        if (!this.unknownCanvas || this.unknownCanvas.width !== maskWidth || this.unknownCanvas.height !== maskHeight) {
          this.unknownCanvas = document.createElement('canvas'); this.seenCanvas = document.createElement('canvas'); this.fogCanvas = document.createElement('canvas');
          for (const mask of [this.unknownCanvas, this.seenCanvas, this.fogCanvas]) { mask.width = maskWidth; mask.height = maskHeight; }
        }
        unknownMask = this.unknownCanvas.getContext('2d'); seenMask = this.seenCanvas.getContext('2d');
        for (const mask of [unknownMask, seenMask]) { mask.setTransform(.5, 0, 0, .5, 0, 0); mask.clearRect(0, 0, this.width, this.height); }
      }

    if (!overview && textures.length) {
      const origin = this.screen(0, 0); c.save(); c.translate(origin.x, origin.y);
      c.transform(tw / 48, th / 48, -tw / 48, th / 48, 0, 0);
      c.fillStyle = c.createPattern(textures[0], 'repeat'); c.fillRect(-24, -24, n * 48, n * 48); c.restore();
    }

    const corner = this.screen(n - 1, n - 1), left = this.screen(0, n - 1), right = this.screen(n - 1, 0);
    polygon(c, [[left.x - tw, left.y], [corner.x, corner.y + th], [right.x + tw, right.y], [right.x + tw, right.y + 13 * this.zoom], [corner.x, corner.y + th + 13 * this.zoom], [left.x - tw, left.y + 13 * this.zoom]], '#3e4b32', '#6d79582a');
    const stride = overview ? Math.ceil(.45 / this.zoom) : 1;
    const view = [[-marginX, -90], [this.width + marginX, -90], [this.width + marginX, this.height + marginY], [-marginX, this.height + marginY]].map(([x, y]) => this.world(x, y));
    const minX = Math.max(0, Math.floor(Math.min(...view.map(p => p.x)) / stride) * stride), maxX = Math.min(n - 1, Math.ceil(Math.max(...view.map(p => p.x))));
    const minY = Math.max(0, Math.floor(Math.min(...view.map(p => p.y)) / stride) * stride), maxY = Math.min(n - 1, Math.ceil(Math.max(...view.map(p => p.y))));
    const coastDirections = [[0, -1], [1, 0], [0, 1], [-1, 0]];
    for (let y = minY; y <= maxY; y += stride) for (let x = minX; x <= maxX; x += stride) {
      const sx = Math.min(n - 1, x + (stride - 1) / 2), sy = Math.min(n - 1, y + (stride - 1) / 2), i = Math.round(sy) * n + Math.round(sx), p = this.screen(sx, sy);
      if (p.x < -marginX || p.x > this.width + marginX || p.y < -90 || p.y > this.height + marginY) continue;
      let t = tileType(map, Math.round(sx), Math.round(sy));
      if (overview && map.template === 'river') for (let sample = 0; sample < 5; sample++) { const cross = tileType(map, Math.min(n - 1, Math.round(x + sample * stride / 4)), Math.round(sy)); if (cross === 'water' || cross === 'road') { t = cross; break; } }
      const v = texture(x + (map.seed ?? 0), y), explored = !fog || world.explored[i], visible = !fog || world.visible[i];
      if (overview) {
        polygon(c, [[p.x, p.y - th * stride], [p.x + tw * stride, p.y], [p.x, p.y + th * stride], [p.x - tw * stride, p.y]], explored ? COLORS[t] : '#050906');
        if (explored && !visible) polygon(c, [[p.x, p.y - th * stride], [p.x + tw * stride, p.y], [p.x, p.y + th * stride], [p.x - tw * stride, p.y]], '#0c1c1c88');
        continue;
      }
      if (!explored) { const points = [[p.x, p.y - th], [p.x + tw, p.y], [p.x, p.y + th], [p.x - tw, p.y]]; polygon(c, points, '#050906'); if (unknownMask) polygon(unknownMask, points, '#050906'); continue; }
      let coasts = 0;
      for (let edge = 0; edge < 4; edge++) { const dx = x + coastDirections[edge][0], dy = y + coastDirections[edge][1]; if (dx < 0 || dy < 0 || dx >= n || dy >= n) continue; const neighbor = tileType(map, dx, dy); if ((t === 'water') !== (neighbor === 'water')) coasts |= 1 << edge; }
      drawGround(c, p.x, p.y, t, v, this.zoom, coasts, textures);
      if (ui.mode === 'map' && this.zoom > .35) { polygon(c, [[p.x, p.y - th], [p.x + tw, p.y], [p.x, p.y + th], [p.x - tw, p.y]], null, '#dcdfb30d'); }
      if (['forest', 'gold', 'stone', 'food'].includes(t)) decorations.push(resourceDecoration(x, y, t, v, visible));
      if (t === 'grass' && v > .89 && !map.spawns.some(s => Math.hypot(s.x - x, s.y - y) < 3.5)) decorations.push({ x, y, t: 'wild', v, visible });
      if (!visible && seenMask) polygon(seenMask, [[p.x, p.y - th], [p.x + tw, p.y], [p.x, p.y + th], [p.x - tw, p.y]], '#0c151c99');
    }
      if (unknownMask) {
        const shade = this.fogCanvas.getContext('2d'); shade.setTransform(.5, 0, 0, .5, 0, 0); shade.clearRect(0, 0, this.width, this.height);
        shade.filter = `blur(${clamp(5 * this.zoom, 3, 7) / 2}px)`; shade.drawImage(this.seenCanvas, 0, 0, this.width, this.height);
        shade.filter = `blur(${clamp(7 * this.zoom, 4, 10) / 2}px)`;
        for (let pass = 0; pass < 4; pass++) shade.drawImage(this.unknownCanvas, 0, 0, this.width, this.height);
        shade.filter = 'none'; shade.drawImage(this.unknownCanvas, 0, 0, this.width, this.height);
      }
      this.terrainDecorations = decorations; this.terrainMap = map; this.terrainKey = terrainKey; this.terrainTime = time;
    }
    c.drawImage(this.terrainCanvas, 0, 0, this.width, this.height);
    if (ui.mode === 'map' && (ui.heroBrush || ui.mapBuildingBrush)) for (const b of world.buildings.filter(b=>!b.buildingPlacementKey)) {
      const bounds = buildingBounds(b.type, b.x, b.y), p = this.screen(bounds.x, bounds.y); if (p.x < -marginX || p.x > this.width + marginX || p.y < -90 || p.y > this.height + marginY) continue;
      polygon(c, footprintPolygon(b.type).map(([x, y]) => [p.x + x * this.zoom, p.y + y * this.zoom]), null, '#d7bc8666');
      c.save(); c.font = '10px sans-serif'; c.textAlign = 'center'; c.fillStyle = '#e4cf9cad'; c.fillText(BUILDINGS[b.type].name + '預定地', p.x, p.y + 12); c.restore();
    }
    const placedHeroes = ui.mode === 'map' ? editorHeroes(project, world) : null;
    const mapEntities = placedHeroes ? [...editorBuildings(project,world),...placedHeroes] : null;
    const entities = (mapEntities ?? [...world.buildings, ...world.units]).filter(e => { if (e.hp <= 0 || e.garrison || fog && !world.isVisible(e)) return false; const p = this.screen(e.x, e.y); return p.x >= -marginX && p.x <= this.width + marginX && p.y >= -90 && p.y <= this.height + marginY; });
    if (!overview) for (const e of decorations) resourceGround(c, e, this.screen(e.x, e.y), this.zoom);
    if (!overview) for (const e of entities) if (e.kind === 'building') buildingGround(c, e, this.screen(e.x, e.y), this.zoom);
    const corpses = ui.mode === 'map' ? [] : (world.corpses ?? []).filter(e => !fog || world.isVisible(e)).map(e => ({ ...e, corpse: true }));
    const items = [...decorations.map(d => ({ ...d, kind: 'decoration' })), ...corpses, ...entities].sort((a, b) => a.x + a.y - b.x - b.y);
    this.drawnResources = []; this.drawnResourceMap = map; const canopyBuckets = new Map();
    for (const e of items) { const p = this.screen(e.x, e.y); if (p.x < -marginX || p.x > this.width + marginX || p.y < -90 || p.y > this.height + marginY) continue;
      if (e.kind === 'decoration') { resource(c, e, p, this.zoom); if (e.t !== 'wild') this.drawnResources.push(e); if (e.t === 'forest') {
        const s = resourceSize(e), left = Math.floor((p.x - s.width * this.zoom / 2) / 64), right = Math.floor((p.x + s.width * this.zoom / 2) / 64), top = Math.floor((p.y - s.height * this.zoom) / 64), bottom = Math.floor(p.y / 64);
        for (let y = top; y <= bottom; y++) for (let x = left; x <= right; x++) { const key = `${x}:${y}`; if (!canopyBuckets.has(key)) canopyBuckets.set(key, []); canopyBuckets.get(key).push(e); }
      } }
      else if (e.corpse) { c.save(); c.globalAlpha = Math.max(0, 1 - (e.age ?? 0) / 2); c.translate(p.x, p.y); c.scale(this.zoom, this.zoom); c.rotate(-.65); drawUnit(c, e, 0, 0, 1, 0, false); c.restore(); }
      else if (overview) { if (e.editorHero) heroMarker(c, p.x, p.y, editorHeroSelected(e,ui), e.editorValid); else ellipse(c, p.x, p.y, e.kind === 'building' ? 3 : 1.8, e.kind === 'building' ? 2 : 1.2, e.editorBuilding && !e.editorValid ? '#ef8b7d' : TEAM_COLORS[e.team % 4]); }
      else if (e.kind === 'building') { building(c, e, p.x, p.y, this.zoom, e.editorBuilding ? ui.mapBuildingSelected === e.buildingPlacementKey : ui.selected.has(e.id)); if (e.editorBuilding && !e.editorValid) polygon(c,footprintPolygon(e.type).map(([x,y])=>[p.x+x*this.zoom,p.y+y*this.zoom]),'#e5786720','#ef8b7d'); if (e.rally && ui.selected.has(e.id)) { const r = this.screen(e.rally.x ?? world.entity(e.rally.target)?.x ?? e.x, e.rally.y ?? world.entity(e.rally.target)?.y ?? e.y); line(c, [[p.x, p.y], [r.x, r.y]], '#d7b77b66', 1); line(c, [[r.x, r.y], [r.x, r.y - 20]], '#ddc494', 1.5); polygon(c, [[r.x, r.y - 20], [r.x + 12, r.y - 17], [r.x, r.y - 12]], '#d7b77b'); } }
      else { drawUnit(c, e, p.x, p.y, this.zoom, time, e.editorHero ? editorHeroSelected(e,ui) : ui.selected.has(e.id)); if (e.editorHero && !e.editorValid) { c.strokeStyle = '#e78576'; c.lineWidth = 1.5; c.beginPath(); c.ellipse(p.x, p.y, Math.max(9, 15 * this.zoom), Math.max(4, 6 * this.zoom), 0, 0, Math.PI * 2); c.stroke(); } }
    }
    const buildingFrames=!overview?entities.filter(e=>e.kind==='building').map(e=>({e,p:this.screen(e.x,e.y)})):[];
    if (!overview) for (const u of entities) if (u.kind === 'unit' && (u.editorHero ? editorHeroSelected(u,ui) : ui.selected.has(u.id))) {
      const p = this.screen(u.x, u.y), head = unitHeight(u) * .55;
      const candidates = canopyBuckets.get(`${Math.floor(p.x / 64)}:${Math.floor((p.y - head * this.zoom) / 64)}`) ?? [];
      if (candidates.some(e => { if (e.x + e.y <= u.x + u.y) return false; const q = this.screen(e.x, e.y), s = resourceSize(e); return alphaHit(s.art, (p.x - q.x) / this.zoom, (p.y - q.y) / this.zoom - head, s.width, s.height, s.bottom); })||buildingFrames.some(({e,p:q})=>e.x+e.y>u.x+u.y&&buildingHit(e,q.x,q.y,this.zoom,p.x,p.y-head*this.zoom))) selectedForestOutline(c, u, p, this.zoom);
    }
    if (placedHeroes) for (const hero of entities.filter(e=>e.editorHero)) heroLabel(c, hero, this.screen(hero.x, hero.y), editorHeroSelected(hero,ui), overview);
    if (mapEntities) for (const b of entities.filter(e=>e.editorBuilding && (ui.mapBuildingSelected===e.buildingPlacementKey || !e.editorValid))) {
      const p=this.screen(b.x,b.y); c.save(); c.font='11px sans-serif'; c.textAlign='center'; c.fillStyle=b.editorValid?'#ead6a5':'#ffb5a6'; c.fillText(`${b.team===0?'我方':'AI '+b.team} ${BUILDINGS[b.type].name}${b.editorValid?'':' · 位置需調整'}`,p.x,p.y+17);c.restore();
    }
    if(!overview&&ui.mode==='play')this.commandFeedback(world,ui);
    if (ui.mode === 'map') for (let team = 0; team < map.spawns.length; team++) { const s = map.spawns[team], p = this.screen(s.x, s.y); ellipse(c, p.x, p.y, tw * 1.2, th * 1.2, TEAM_COLORS[team % 4] + '55'); line(c, [[p.x, p.y], [p.x, p.y - 42]], '#e0d8b5', 2); polygon(c, [[p.x, p.y - 42], [p.x + 24, p.y - 36], [p.x, p.y - 26]], TEAM_COLORS[team % 4]); c.fillStyle = '#eee4c8'; c.font = '11px sans-serif'; c.fillText(team ? 'AI ' + team + (project.rules.aiAlliance ? ' · 敵方聯盟' : ' 出生點') : '我方出生點', p.x + 6, p.y - 50); }
    for (const e of world.effects) { if (fog && !world.isVisible(e) && !world.isVisible({ x: e.tx ?? e.x, y: e.ty ?? e.y })) continue; const p = this.screen(e.x, e.y), q = this.screen(e.tx ?? e.x, e.ty ?? e.y), alpha = 1 - e.age / .5; c.save(); c.globalAlpha = alpha;
      if (e.type === 'arrow') { const f = Math.min(1, e.age / .25); const x = p.x + (q.x - p.x) * f, y = p.y + (q.y - p.y) * f - 20 * this.zoom - Math.sin(f * Math.PI) * 20 * this.zoom; line(c, [[x - 7, y + 2], [x, y]], '#f3d19a', 1.5); }
      else if (e.type === 'heal') { c.fillStyle = '#a5e7ba'; c.font = '16px sans-serif'; c.fillText('+', p.x, p.y - 25 - e.age * 20); }
      else { c.strokeStyle = '#ffdf9c'; c.lineWidth = 1.5; c.beginPath(); c.arc(q.x, q.y - 15 * this.zoom, 4 + e.age * 12, 0, Math.PI * 2); c.stroke(); } c.restore();
    }
    if (fog && !overview && this.fogCanvas) c.drawImage(this.fogCanvas, 0, 0, this.width, this.height);
    if (this.hover && ui.mode === 'map' && ui.heroBrush) {
      const blueprint = project.units.find(u => u.id === ui.heroBrush && u.hero), h = this.hover;
      if (blueprint) {
        const count=ui.heroMoveKey?1:ui.heroBatchSize||1, positions=world.planHeroPlacement?.(ui.heroBrush,h,count,ui.heroMoveKey) ?? [], p = this.screen(h.x, h.y), valid=positions.length===count, color = valid ? '#9bc7a7' : '#e58d81', gx = Math.max(8, tw), gy = Math.max(4, th);
        for (const point of positions.length?positions:[h]) {
          const q=this.screen(point.x,point.y); polygon(c, [[q.x, q.y - gy], [q.x + gx, q.y], [q.x, q.y + gy], [q.x - gx, q.y]], valid ? '#84c99d45' : '#df786d45', color);
          c.save(); c.globalAlpha = .6; drawUnit(c, { id: 0, blueprint, team: 0, hp: blueprint.hp, maxHp: blueprint.hp, path: [] }, q.x, q.y, Math.max(.45, this.zoom), time, false); c.restore();
        }
        c.save(); c.font = '11px sans-serif'; c.textAlign = 'center'; c.fillStyle = color; c.fillText(valid ? `${blueprint.name} × ${count} · 點擊${ui.heroMoveKey?'移動':'放置'}` : `可放 ${positions.length}／${count} 名 · 請調整位置或數量`, p.x, p.y + Math.max(17, gy + 12)); c.restore();
      }
    } else if (this.hover && ui.mode==='map' && ui.mapBuildingBrush) {
      const h=this.hover,type=ui.mapBuildingBrush,bounds=buildingBounds(type,h.x,h.y),p=this.screen(bounds.x,bounds.y),valid=world.canPlaceMapBuilding?.(type,h.x,h.y,ui.mapBuildingMoveKey) ?? false;
      polygon(c,footprintPolygon(type).map(([x,y])=>[p.x+x*this.zoom,p.y+y*this.zoom]),valid?'#84c99d45':'#df786d45',valid?'#9bc7a7':'#e58d81');
      c.save();c.globalAlpha=.6;building(c,{type,team:ui.mapBuildingTeam||0,progress:1,hp:1,maxHp:1},p.x,p.y,this.zoom,false);c.restore();
      c.save();c.font='11px sans-serif';c.textAlign='center';c.fillStyle=valid?'#9bc7a7':'#e58d81';c.fillText(valid?`${BUILDINGS[type].name} · ${type==='wall'&&!ui.mapBuildingMoveKey?'拖曳連續放':'點擊'+(ui.mapBuildingMoveKey?'移動':'放置')}`:'位置需調整 · 避開資源與占地',p.x,p.y+20);c.restore();
    } else if (this.hover && (ui.mode === 'map' || ui.placement)) { const h = this.hover; if (h.x >= 0 && h.x < n && h.y >= 0 && h.y < n) {
      const bounds = ui.placement ? buildingBounds(ui.placement, h.x, h.y) : h, p = this.screen(bounds.x, bounds.y), valid = !ui.placement || world.canPlaceBuilding(ui.placement, h.x, h.y) && world.buildRequirements(0,ui.placement) && world.canPay(0,BUILDINGS[ui.placement].cost) && (BUILDINGS[ui.placement].age||0)<=world.age(0);
      const base = ui.placement ? footprintPolygon(ui.placement).map(([x, y]) => [p.x + x * this.zoom, p.y + y * this.zoom]) : [[p.x, p.y - th], [p.x + tw, p.y], [p.x, p.y + th], [p.x - tw, p.y]];
      polygon(c, base, valid ? '#e0c79345' : '#e06a6545', valid ? '#e5c484' : '#e89985');
      if (ui.placement) { c.save(); c.globalAlpha = .6; building(c, { type: ui.placement, team: 0, progress: 1, hp: 1, maxHp: 1 }, p.x, p.y, this.zoom, false); c.restore(); }
    } }
    if (this.drag) { const { start, end } = this.drag; c.fillStyle = '#93c5b221'; c.fillRect(start.x, start.y, end.x - start.x, end.y - start.y); c.strokeStyle = '#b5d8ba'; c.lineWidth = 1; c.strokeRect(start.x, start.y, end.x - start.x, end.y - start.y); }
    if (this.marker && time - this.marker.time < 0.7) { const p = this.screen(this.marker.x, this.marker.y); c.strokeStyle = this.marker.attack ? '#e8a184' : '#d9c087'; c.lineWidth = 1.4; c.beginPath(); c.ellipse(p.x, p.y, (8 + (time - this.marker.time) * 15) * this.zoom, (4 + (time - this.marker.time) * 8) * this.zoom, 0, 0, Math.PI * 2); c.stroke(); }
    if (time - this.miniTime >= .12) { this.renderMini(map, world, fog, mapEntities, ui); this.miniTime = time; }
  }
  renderMini(map, world, fog, mapEntities = null, ui = {}) {
    const c = this.mc, width = this.minimap.width, height = this.minimap.height, rx = width / 2 - 4, ry = height / 2 - 4, n = map.size;
    const point = p => [width / 2 + (p.x - p.y) / (n - 1) * rx, 4 + (p.x + p.y) / (n - 1) * ry];
    c.clearRect(0, 0, width, height); const samples = Math.min(n, 164), step = n / samples;
    if (!this.miniTerrain || this.miniTerrain.width !== samples) { this.miniTerrain = document.createElement('canvas'); this.miniTerrain.width = this.miniTerrain.height = samples; }
    const g = this.miniTerrain.getContext('2d'); g.clearRect(0, 0, samples, samples);
    for (let y = 0; y < samples; y++) for (let x = 0; x < samples; x++) { const tx = Math.min(n - 1, Math.floor((x + .5) * step)), ty = Math.min(n - 1, Math.floor((y + .5) * step)), i = ty * n + tx; g.fillStyle = fog && !world.explored[i] ? '#18261e' : COLORS[tileType(map, tx, ty)]; g.globalAlpha = fog && !world.visible[i] ? .6 : 1; g.fillRect(x, y, 1, 1); }
    c.save(); c.translate(width / 2, 4); c.transform(rx / samples, ry / samples, -rx / samples, ry / samples, 0, 0); c.drawImage(this.miniTerrain, 0, 0); c.restore();
    c.save(); c.beginPath(); c.moveTo(width / 2, 4); c.lineTo(width - 4, height / 2); c.lineTo(width / 2, height - 4); c.lineTo(4, height / 2); c.closePath(); c.clip();
    for (const e of mapEntities ?? [...world.units, ...world.buildings]) if (e.hp > 0 && !e.garrison && (!fog || world.isVisible(e))) { const [x, y] = point(e); if (e.editorHero) heroMarker(c, x, y, editorHeroSelected(e,ui), e.editorValid, 3.5); else { c.fillStyle = e.editorBuilding && !e.editorValid ? '#ef8b7d' : TEAM_COLORS[e.team % 4]; c.fillRect(x - 1, y - 1, e.kind === 'building' ? 3 : 2, e.kind === 'building' ? 3 : 2); } }
    const corners = [[0, 0], [this.width, 0], [this.width, this.height], [0, this.height]].map(([x, y]) => this.world(x, y)); line(c, [...corners, corners[0]].map(point), '#f1dfb8a6'); c.restore();
    polygon(c, [[width / 2, 4], [width - 4, height / 2], [width / 2, height - 4], [4, height / 2]], null, '#b6a67b59');
  }
}
