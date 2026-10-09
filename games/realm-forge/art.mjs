export const TEAM_COLORS = ['#559de3', '#d55645', '#e4bd50'];
export const TEAM_LIGHT = ['#a4d2ff', '#ffb4a4', '#ffe09a'];
const cache = new Map();
const colorCache = new Map(), sourcePixels = new WeakMap();
const worldTeams = new Set(['town', 'barracks', 'house', 'tower', 'mill', 'archery', 'stable', 'castle', 'blacksmith', 'siege', 'monastery', 'market', 'university', 'lumber', 'mining', 'gate', 'outpost']);
const worldLooks = new Set([...worldTeams, 'oak', 'oak-alt', 'pine', 'pine-alt', 'young', 'gold', 'stone', 'food', 'farm', 'wall']);
const environmentSprites = { oak: 'tree-oak-0', 'oak-alt': 'tree-oak-1', pine: 'tree-pine-0', 'pine-alt': 'tree-pine-1', young: 'tree-young', gold: 'gold-v2', stone: 'stone-v2', food: 'food-v2' };
const unitLooks = new Set(['worker', 'soldier', 'archer', 'knight']);
export function imageFor(src) {
  if (!cache.has(src) && typeof Image !== 'undefined') {
    const img = new Image(); img.assetSource = src; img.src = src; cache.set(src, img);
  }
  return cache.get(src);
}
export function unitArt(look, direction, team, engine = 'mangonel', packed = false) {
  if (look === 'mage' || look === 'siege') {
    const machine = ['ram', 'mangonel', 'trebuchet'].includes(engine) ? engine : 'mangonel';
    const name = look === 'mage' ? 'monk' : machine === 'trebuchet' && packed ? 'trebuchet-packed' : machine;
    return imageFor(`assets/sprites/${name}-${direction >= 2 ? 1 : 0}-${team % 3}.webp`);
  }
  if (!unitLooks.has(look)) return null;
  return imageFor(`assets/sprites/idle-v2-${look}-${direction}-${team % 3}.webp`);
}
export function animationArt(look, state, frame, team) {
  if (!unitLooks.has(look)) return null;
  return imageFor(`assets/sprites/${state}-v2-${look}-${frame}-${team % 3}.webp`);
}
export function worldArt(type, team = 0) {
  if (!worldLooks.has(type)) return null;
  return imageFor(`assets/sprites/${environmentSprites[type] ?? type}${worldTeams.has(type) ? `-${team % 3}` : ''}.webp`);
}
export function drawSprite(c, img, x, y, width, height = null) {
  const iw = img?.naturalWidth ?? img?.width, ih = img?.naturalHeight ?? img?.height;
  if (!img || img.complete === false || !iw) return false;
  const h = height ?? width * ih / iw;
  c.drawImage(img, x - width / 2, y - h, width, h); return true;
}
export function recoloredArt(img, color) {
  if (!img?.complete || !img.naturalWidth || !/^#[a-f\d]{6}$/i.test(color)) return img;
  const key = `${img.assetSource ?? img.src}|${color.toLowerCase()}`;
  if (colorCache.has(key)) return colorCache.get(key);
  const canvas = document.createElement('canvas'); canvas.width = img.naturalWidth; canvas.height = img.naturalHeight; const c = canvas.getContext('2d');
  if (!sourcePixels.has(img)) { c.drawImage(img, 0, 0); sourcePixels.set(img, c.getImageData(0, 0, canvas.width, canvas.height)); }
  const pixels = c.createImageData(canvas.width, canvas.height); pixels.data.set(sourcePixels.get(img).data);
  const data = pixels.data, target = [1, 3, 5].map(i => parseInt(color.slice(i, i + 2), 16));
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i], g = data[i + 1], b = data[i + 2];
    if (data[i + 3] && b > r * 1.18 && b > g * 1.05 && b - r > 18 && (b - Math.min(r, g)) / b > .3) {
      const shade = b / 187;
      for (let k = 0; k < 3; k++) data[i + k] = Math.min(255, Math.round(target[k] * shade + Math.max(0, shade - 1) * 12));
    }
  }
  c.putImageData(pixels, 0, 0); colorCache.set(key, canvas);
  if (colorCache.size > 256) colorCache.delete(colorCache.keys().next().value);
  return canvas;
}
const loaded = [];
if (typeof Image !== 'undefined') {
  for (const name of worldLooks) for (let team = 0; team < (worldTeams.has(name) ? 3 : 1); team++) loaded.push(worldArt(name, team));
  for (const look of unitLooks) for (let direction = 0; direction < 4; direction++) for (let team = 0; team < 3; team++) loaded.push(unitArt(look, direction, team));
  for (const look of ['mage', 'siege']) for (const engine of look === 'mage' ? ['monk'] : ['ram', 'mangonel', 'trebuchet', 'trebuchet-packed']) for (let direction = 0; direction < 2; direction++) for (let team = 0; team < 3; team++) loaded.push(unitArt(look, direction * 2, team, engine === 'trebuchet-packed' ? 'trebuchet' : engine, engine === 'trebuchet-packed'));
  for (const state of ['walk', 'attack']) for (const look of unitLooks) for (let frame = 0; frame < 4; frame++) for (let team = 0; team < 3; team++) loaded.push(animationArt(look, state, frame, team));
  loaded.push(imageFor('assets/grass-v2.png'));
}
export const artReady = Promise.all(loaded.map(img => img.complete ? Promise.resolve() : new Promise(resolve => { img.onload = resolve; img.onerror = resolve; })));
