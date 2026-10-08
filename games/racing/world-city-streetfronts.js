// Original street-scale artwork; reference photographs are not runtime textures.
// Each painter has its own masonry, openings and floor rhythm, rather than a
// common window grid recoloured for every city. Only the selected city is drawn.
function seeded(seed) { return () => { seed = (Math.imul(1664525, seed) + 1013904223) >>> 0; return seed / 4294967296; }; }
function grain(c, rand, count = 1900) {
  for (let i = 0; i < count; i++) { c.fillStyle = `rgba(42,36,28,${.015 + rand() * .043})`; c.fillRect(rand() * 512, rand() * 1024, .7 + rand() * 2, 1 + rand() * 7); }
}
function masonry(c, rand, colors, blockWidth, blockHeight, mortar) {
  c.fillStyle = mortar; c.fillRect(0, 0, 512, 1024);
  for (let row = 0; row < Math.ceil(1024 / blockHeight); row++) for (let col = -1; col <= Math.ceil(512 / blockWidth); col++) {
    c.fillStyle = colors[Math.floor(rand() * colors.length)]; c.fillRect(col * blockWidth + row % 2 * blockWidth / 2, row * blockHeight + 1, blockWidth - 1.6, blockHeight - 1.6);
  }
}
function window(c, rand, x, y, w, h, { trim = '#d1c8ac', sash = '#ded8c3', panes = 2, arch = false, shutters = null, rail = false } = {}) {
  c.fillStyle = 'rgba(31,28,23,.28)'; c.fillRect(x - 5, y - 3, w + 10, h + 12);
  c.fillStyle = trim; c.fillRect(x - 3, y - 5, w + 6, h + 9);
  c.fillStyle = '#263735'; c.fillRect(x, y, w, h);
  const glass = c.createLinearGradient(x, y, x + w * .45, y + h);
  glass.addColorStop(0, '#829a9b'); glass.addColorStop(.36, '#5e7475'); glass.addColorStop(.40, '#738481'); glass.addColorStop(1, '#253b3a');
  c.fillStyle = glass; c.fillRect(x + 2, y + 2, w - 4, h - 4);
  if (rand() < .42) { c.fillStyle = ['#c4c3ad', '#a9a78f', '#d1c9b5'][Math.floor(rand() * 3)]; c.fillRect(x + 3, y + 3, w - 6, h * (.14 + rand() * .46)); }
  c.fillStyle = sash; c.fillRect(x + w / 2 - 1.1, y, 2.2, h);
  for (let pane = 1; pane < panes; pane++) c.fillRect(x, y + pane * h / panes, w, 2.2);
  c.fillStyle = trim; c.fillRect(x - 6, y + h + 3, w + 12, 4);
  if (arch) {
    c.strokeStyle = trim; c.lineWidth = 6; c.beginPath(); c.arc(x + w / 2, y + 4, w / 2 + 3, Math.PI, 0); c.stroke();
    c.fillRect(x + w / 2 - 3, y - w / 2 - 3, 6, 10);
  }
  if (shutters) {
    c.fillStyle = shutters; c.fillRect(x - 17, y, 12, h); c.fillRect(x + w + 5, y, 12, h);
    c.fillStyle = 'rgba(18,35,25,.25)';
    for (let slat = 4; slat < h; slat += 6) { c.fillRect(x - 17, y + slat, 12, 1.8); c.fillRect(x + w + 5, y + slat, 12, 1.8); }
  }
  if (rail) {
    c.fillStyle = '#343d38'; c.fillRect(x - 10, y + h - 9, w + 20, 3); c.fillRect(x - 10, y + h + 9, w + 20, 2);
    for (let bar = -8; bar < w + 10; bar += 7) c.fillRect(x + bar, y + h - 8, 1.6, 17);
  }
}
function office(c, rand, index, palette) {
  c.fillStyle = palette[index % palette.length]; c.fillRect(0, 0, 512, 1024);
  const bays = [7, 10, 5][index % 3], cw = 512 / bays, floors = 8, ch = 1024 / floors;
  for (let row = 0; row < floors; row++) for (let col = 0; col < bays; col++) {
    const x = col * cw + 3, y = row * ch + 6;
    const gradient = c.createLinearGradient(x, y, x + cw, y + ch);
    gradient.addColorStop(0, ['#687f88', '#597986', '#789a9a'][index % 3]); gradient.addColorStop(.35, '#acbcbc'); gradient.addColorStop(.39, '#68838a'); gradient.addColorStop(1, '#354d58');
    c.fillStyle = gradient; c.fillRect(x, y, cw - 6, ch - (index % 2 ? 22 : 11));
    c.fillStyle = 'rgba(35,51,54,.4)'; c.fillRect(x + cw - 7, y, 2, ch - 11);
    if (rand() < .24) { c.fillStyle = '#a5a99e'; c.fillRect(x + 1, y + 2, cw - 8, ch * (.2 + rand() * .5)); }
  }
  c.fillStyle = 'rgba(220,228,220,.58)'; for (let col = 0; col < bays; col++) c.fillRect(col * cw, 0, 2.5, 1024);
}
function london(c, rand, index) {
  const palette = index % 3 === 1 ? ['#bdb49f', '#c5bba5', '#b9b09c', '#c8bfa9'] : index % 3 === 2 ? ['#a96f51', '#b57958', '#97664e', '#ad765c'] : ['#8e765f', '#9d816a', '#ab8b70', '#987b61'];
  masonry(c, rand, palette, index % 3 === 1 ? 66 : 26, index % 3 === 1 ? 31 : 10, '#b4a78c'); grain(c, rand);
  const cw = 512 / 5, ch = 1024 / 7;
  for (let floor = 0; floor < 7; floor++) {
    if (floor === 1 || floor === 5) { c.fillStyle = '#d4ccb4'; c.fillRect(0, floor * ch - 6, 512, 5); c.fillStyle = '#958d7d'; c.fillRect(0, floor * ch - 1, 512, 2); }
    for (let bay = 0; bay < 5; bay++) {
      const x = bay * cw + 31, y = floor * ch + 30;
      window(c, rand, x, y, 40, 82, { trim: index % 3 === 1 ? '#d6cfb9' : '#c0b39b', sash: index % 2 ? '#e8e3d2' : '#d5d2bf', panes: 3 });
      c.fillStyle = '#c2ad90'; c.fillRect(x - 5, y - 10, 50, 6);
    }
  }
}
function sydney(c, rand, index) {
  if (index >= 3) { office(c, rand, index, ['#899c9e', '#859aa0', '#a2ada9']); return; }
  masonry(c, rand, [['#c6ae84', '#d0b790', '#bfaa86', '#dac49e'], ['#b5a181', '#c5b08a', '#cab696', '#bca684'], ['#b58c71', '#c29c7c', '#a7836b', '#c4a487']][index], 80, 39, '#ac997a'); grain(c, rand);
  for (let floor = 0; floor < 7; floor++) for (let bay = 0; bay < 4; bay++) {
    const x = bay * 128 + 40, y = floor * 146.3 + 34;
    window(c, rand, x, y, 47, 80, { trim: '#d9c7a4', sash: index === 1 ? '#52685d' : '#5e5143', panes: 3, arch: index !== 2 });
    c.fillStyle = 'rgba(243,222,181,.35)'; c.fillRect(bay * 128, floor * 146.3 + 132, 128, 5);
  }
}
function residential(c, rand, index, city) {
  c.fillStyle = city === 'goldcoast' ? ['#e2dfce', '#d9ddd4', '#d1d8d5'][index % 3] : ['#b8cdca', '#a6c1bd', '#c0d2ca'][index % 3]; c.fillRect(0, 0, 512, 1024);
  for (let floor = 0; floor < 8; floor++) {
    const y = floor * 128;
    c.fillStyle = '#324e58'; c.fillRect(12, y + 12, 488, 89);
    for (let bay = 0; bay < 4; bay++) {
      const x = 18 + bay * 121, gradient = c.createLinearGradient(x, y, x + 96, y + 111);
      gradient.addColorStop(0, city === 'goldcoast' ? '#8daab1' : '#729b95'); gradient.addColorStop(.41, '#bdc6c0'); gradient.addColorStop(.44, '#5f858e'); gradient.addColorStop(1, '#34525d');
      c.fillStyle = gradient; c.fillRect(x, y + 15, 108, 76);
      c.fillStyle = 'rgba(229,231,208,.47)'; if (rand() > .57) c.fillRect(x + 2, y + 17, 48, 51);
      c.fillStyle = '#b9c9c5'; c.fillRect(x + 53, y + 15, 2, 77);
    }
    c.fillStyle = 'rgba(117,155,161,.76)'; c.fillRect(10, y + 81, 492, 26);
    c.fillStyle = '#d5e0d5'; c.fillRect(8, y + 79, 496, 3);
    for (let bar = 16; bar < 505; bar += 40) c.fillRect(bar, y + 82, 1.5, 25);
    c.fillStyle = '#f0f0dc'; c.fillRect(0, y + 108, 512, 9); c.fillStyle = 'rgba(48,65,65,.24)'; c.fillRect(0, y + 117, 512, 6);
  }
}
function kualalumpur(c, rand, index) {
  if (index === 1 || index === 4) {
    c.fillStyle = index === 1 ? '#bfc5ba' : '#c8c6b1'; c.fillRect(0, 0, 512, 1024); grain(c, rand);
    for (let floor = 0; floor < 7; floor++) {
      const y = floor * 146.3; c.fillStyle = '#778f87'; c.fillRect(0, y + 19, 512, 104);
      for (let bay = 0; bay < 6; bay++) { c.fillStyle = bay % 2 ? '#90a79d' : '#526e6d'; c.fillRect(bay * 85.3 + 8, y + 24, 68, 90); c.fillStyle = '#c9cbb6'; c.fillRect(bay * 85.3, y + 15, 6, 114); }
      c.fillStyle = '#d8d5be'; c.fillRect(0, y + 123, 512, 11);
    }
  } else office(c, rand, index, ['#92a5a4', '#b3b8af', '#8b9f9e']);
}
function melbourne(c, rand, index) {
  if (index >= 3) { office(c, rand, index, ['#869c9f', '#839297', '#a7ada7']); return; }
  masonry(c, rand, [['#a87959', '#b38666', '#9e6c50', '#b2825e'], ['#bbaa8b', '#cabb9c', '#baad91', '#d0c2a4'], ['#a9654c', '#b87354', '#a56952', '#ba7d61']][index], index === 1 ? 68 : 28, index === 1 ? 30 : 11, '#bca58b'); grain(c, rand);
  for (let floor = 0; floor < 7; floor++) {
    const y = floor * 146.3; c.fillStyle = '#ccb99a'; c.fillRect(0, y + 129, 512, 7);
    for (let bay = 0; bay < 4; bay++) {
      const x = bay * 128 + 38;
      window(c, rand, x, y + 34, 48, 83, { trim: '#d7c5a4', sash: '#5b6055', arch: index !== 1, panes: 3 });
      c.fillStyle = '#d7c5a4'; c.fillRect(bay * 128 + 8, y + 12, 7, 125);
    }
  }
}
function sanfrancisco(c, rand, index) {
  const base = ['#b9c8bd', '#b3c9c6', '#d3b5a8', '#d9c58f', '#bebbc8', '#9eb9b4'][index];
  c.fillStyle = base; c.fillRect(0, 0, 512, 1024);
  for (let y = 0; y < 1024; y += 10) { c.fillStyle = 'rgba(40,52,43,.15)'; c.fillRect(0, y + 8, 512, 1.6); c.fillStyle = 'rgba(244,244,221,.30)'; c.fillRect(0, y + 1, 512, 1.4); }
  grain(c, rand, 1000);
  for (let floor = 0; floor < 7; floor++) for (let bay = 0; bay < 3; bay++) {
    const x = bay * 170.7 + 51, y = floor * 146.3 + 31;
    window(c, rand, x, y, 63, 85, { trim: '#e7e2cd', sash: '#e4e5d4', panes: 2 });
    c.fillStyle = '#e4dfc9'; c.fillRect(x - 9, y - 10, 81, 5); c.fillRect(x - 6, y + 91, 75, 5);
    if (index % 2) { c.fillStyle = 'rgba(74,91,80,.31)'; c.fillRect(x - 7, y - 7, 77, 2); }
  }
}
function newyork(c, rand, index) {
  if (index >= 3) { office(c, rand, index, ['#a2aaa6', '#889b9e', '#adb0a4']); return; }
  masonry(c, rand, [['#a57c61', '#9c735b', '#ac8065', '#946c55'], ['#b5aa94', '#c0b5a0', '#b4ab98', '#cac0ab'], ['#98644f', '#a56a54', '#995f49', '#a77560']][index], index === 1 ? 67 : 27, index === 1 ? 31 : 9, '#ac9d86'); grain(c, rand);
  for (let floor = 0; floor < 8; floor++) for (let bay = 0; bay < 5; bay++) {
    const x = bay * 102.4 + 31, y = floor * 128 + 25;
    window(c, rand, x, y, 41, 78, { trim: index === 1 ? '#d3c6ab' : '#b4a08a', sash: '#c8cabd', panes: 2 });
    c.fillStyle = '#aa9a83'; c.fillRect(x - 5, y - 9, 51, 4);
    if ((floor + bay + index) % 7 === 0) { c.fillStyle = '#a7aca3'; c.fillRect(x + 22, y + 62, 23, 19); c.fillStyle = '#555f5c'; for (let rib = 0; rib < 4; rib++) c.fillRect(x + 25, y + 64 + rib * 4, 18, 2); }
  }
}
function paris(c, rand, index) {
  const palette = [['#d5cab1', '#dcd2bc', '#d0c4ad', '#ded5be'], ['#cfc5b0', '#d6cdbc', '#d2c7b2', '#e0d6c1'], ['#dcd4bf', '#d0c5ae', '#e3dac5', '#d7cdb6']][index % 3];
  masonry(c, rand, palette, 86, 38, '#b6ad98'); grain(c, rand);
  for (let floor = 0; floor < 7; floor++) {
    const y = floor * 146.3; c.fillStyle = '#e5dcc4'; c.fillRect(0, y + 126, 512, floor === 1 || floor === 5 ? 8 : 3); c.fillStyle = '#a89f8c'; c.fillRect(0, y + 134, 512, 2);
    for (let bay = 0; bay < 5; bay++) {
      const x = bay * 102.4 + 32;
      window(c, rand, x, y + 28, 40, 89, { trim: '#e5dcc2', sash: '#c6c5b1', panes: 3, rail: floor === 1 || floor === 5 || (index + bay) % 3 === 0 });
      c.fillStyle = '#e4d8bd'; c.fillRect(x - 7, y + 18, 54, 6);
    }
  }
}
function prague(c, rand, index) {
  c.fillStyle = ['#dbc58e', '#d6b49f', '#e4c6a1', '#b3c6b5', '#c7a191', '#d6cbb0'][index]; c.fillRect(0, 0, 512, 1024); grain(c, rand, 2800);
  for (let floor = 0; floor < 7; floor++) {
    const y = floor * 146.3; c.fillStyle = '#e6d8b7'; c.fillRect(0, y + 128, 512, 6); c.fillStyle = 'rgba(128,107,78,.17)'; c.fillRect(0, y + 134, 512, 3);
    for (let bay = 0; bay < 4; bay++) {
      const x = bay * 128 + 45;
      window(c, rand, x, y + 36, 38, 75, { trim: '#ede1c6', sash: '#cdc9b4', panes: 3, shutters: index % 3 === 0 ? '#7d8e7c' : null });
      if (index % 2 === 0) { c.fillStyle = '#ede1c6'; c.fillRect(x - 7, y + 23, 52, 5); c.beginPath(); c.moveTo(x - 9, y + 22); c.lineTo(x + 19, y + 11); c.lineTo(x + 47, y + 22); c.closePath(); c.fill(); }
    }
  }
}
function newcastle(c, rand, index) {
  const sandstone = index % 3 === 1;
  masonry(c, rand, sandstone ? ['#bdac89', '#c5b795', '#bba981', '#d0bd98'] : [['#8f6e59', '#9c755b', '#a27a60', '#8d6753'], ['#b28f70', '#a87e60', '#b08a6b', '#aa8062']][index % 2], sandstone ? 76 : 29, sandstone ? 35 : 11, '#ac9c80'); grain(c, rand);
  for (let floor = 0; floor < 7; floor++) for (let bay = 0; bay < 4; bay++) {
    const x = bay * 128 + 43, y = floor * 146.3 + 29;
    window(c, rand, x, y, 40, 88, { trim: '#cbbda0', sash: '#e0dfce', panes: 3, arch: !sandstone && index % 2 === 0 });
    c.fillStyle = '#d5c3a2'; c.fillRect(x - 7, y - 10, 54, 5);
    for (let quoin = 0; quoin < 5; quoin++) { c.fillRect(1, floor * 146.3 + quoin * 29, 10, 23); c.fillRect(501, floor * 146.3 + quoin * 29, 10, 23); }
  }
}
function lisbon(c, rand, index) {
  c.fillStyle = ['#dec57f', '#d5b2a1', '#bad0cf', '#e0e3d6', '#d2a387', '#bacfd4'][index]; c.fillRect(0, 0, 512, 1024);
  if (index === 2 || index === 5) {
    c.fillStyle = '#e6e6d5'; c.fillRect(0, 0, 512, 1024); c.strokeStyle = '#6389a1'; c.lineWidth = 1;
    for (let y = 0; y < 1024; y += 21.4) for (let x = 0; x < 512; x += 21.4) {
      c.strokeRect(x, y, 21.4, 21.4); c.beginPath(); c.moveTo(x + 10.7, y + 3); c.lineTo(x + 18.4, y + 10.7); c.lineTo(x + 10.7, y + 18.4); c.lineTo(x + 3, y + 10.7); c.closePath(); c.stroke();
      c.fillStyle = '#789aab'; c.fillRect(x + 8.8, y + 8.8, 3.8, 3.8);
    }
  }
  grain(c, rand, 2200);
  for (let floor = 0; floor < 7; floor++) for (let bay = 0; bay < 3; bay++) {
    const x = bay * 170.7 + 61, y = floor * 146.3 + 30;
    window(c, rand, x, y, 45, 89, { trim: '#e5ddc6', sash: '#a6b1a2', panes: 2, shutters: index % 2 ? '#69846f' : null, rail: floor > 0 });
  }
}
function marseille(c, rand, index) {
  c.fillStyle = ['#d3c3a4', '#c9b89b', '#dfcfb0', '#c1bdaa', '#d2b69a', '#e0d4b9'][index]; c.fillRect(0, 0, 512, 1024); grain(c, rand, 3800);
  for (let floor = 0; floor < 7; floor++) for (let bay = 0; bay < 4; bay++) {
    const x = bay * 128 + 44, y = floor * 146.3 + 31;
    window(c, rand, x, y, 39, 85, { trim: '#dcd2b8', sash: '#a9b0a0', panes: 3, shutters: ['#798c78', '#6e8078', '#8d917a'][index % 3], rail: index % 2 === 0 && floor % 2 === 1 });
    c.fillStyle = 'rgba(143,125,95,.11)'; c.fillRect(x - 22, y + 92, 84, 7 + rand() * 8);
  }
}
function nice(c, rand, index) {
  c.fillStyle = ['#e3c8a4', '#d7ad9a', '#e8d2ad', '#c9cfb8', '#deb9a1', '#d7ba91'][index]; c.fillRect(0, 0, 512, 1024); grain(c, rand, 1700);
  for (let floor = 0; floor < 7; floor++) {
    const y = floor * 146.3; c.fillStyle = '#ebdec0'; c.fillRect(0, y + 132, 512, 4);
    for (let bay = 0; bay < 4; bay++) {
      const x = bay * 128 + 42;
      window(c, rand, x, y + 29, 43, 89, { trim: '#f0e2c7', sash: '#e0dfc9', panes: 3, shutters: index % 3 === 0 ? null : '#788a78', rail: true, arch: index % 3 === 0 });
    }
  }
}
function warwick(c, rand, index) {
  const timber = index % 3 !== 1;
  if (timber) { c.fillStyle = ['#dbd3b9', '#cdbfa8', '#d8d2bc'][index % 3]; c.fillRect(0, 0, 512, 1024); }
  else masonry(c, rand, index === 1 ? ['#a98161', '#b28b6a', '#a97a58', '#bc9674'] : ['#bcab8a', '#cabda0', '#c2b18e', '#d1c4a6'], index === 1 ? 28 : 78, index === 1 ? 11 : 34, '#b7aa90');
  grain(c, rand);
  for (let floor = 0; floor < 3; floor++) {
    const y = floor * 341.3;
    if (timber) { c.fillStyle = '#4d4336'; c.fillRect(0, y + 10, 512, 10); c.fillRect(0, y + 315, 512, 12); }
    for (let bay = 0; bay < 4; bay++) {
      const x = bay * 128 + 38;
      window(c, rand, x, y + 76, 53, 173, { trim: timber ? '#766851' : '#d8c7a6', sash: '#4e5145', panes: 3 });
      if (timber) {
        c.fillStyle = '#4d4336'; c.fillRect(bay * 128 + 4, y, 8, 341.3);
        c.strokeStyle = '#3d463b'; c.lineWidth = 1.3;
        c.save(); c.beginPath(); c.rect(x + 2, y + 78, 49, 169); c.clip();
        for (let line = -90; line < 130; line += 14) { c.beginPath(); c.moveTo(x + line, y + 78); c.lineTo(x + line + 84, y + 247); c.moveTo(x + line, y + 78); c.lineTo(x + line - 84, y + 247); c.stroke(); }
        c.restore();
      }
    }
  }
}
const painters = { kualalumpur, london, sydney, melbourne, sanfrancisco, newyork, paris, prague, newcastle, lisbon, marseille, nice, warwick, goldcoast: (c, r, i) => residential(c, r, i, 'goldcoast'), vancouver: (c, r, i) => residential(c, r, i, 'vancouver') };
export const CITY_STREETFRONT_CITIES = Object.freeze(Object.keys(painters));
export function paintCityStreetfront(c, width, height, city, index) {
  const painter = painters[city]; if (!painter) return false;
  c.scale(width / 512, height / 1024); painter(c, seeded(94117 + index * 1063), index); return true;
}
export function paintLondonShopfront(c, width, height) {
  c.scale(width / 1024, height / 512);
  for (let shop = 0; shop < 4; shop++) {
    const x = shop * 256, color = ['#35544b', '#79513d', '#cec2a1', '#435e69'][shop];
    c.fillStyle = color; c.fillRect(x, 0, 256, 512);
    c.fillStyle = '#253632'; c.fillRect(x + 11, 36, 168, 378); c.fillRect(x + 190, 37, 54, 402);
    const glow = c.createLinearGradient(x, 0, x, 430); glow.addColorStop(0, '#718684'); glow.addColorStop(.36, '#56695f'); glow.addColorStop(.55, '#756443'); glow.addColorStop(1, '#343c30');
    c.fillStyle = glow; c.fillRect(x + 18, 43, 154, 352); c.fillRect(x + 196, 45, 42, 321);
    c.fillStyle = '#ab9570'; for (let shelf = 0; shelf < 3; shelf++) c.fillRect(x + 25, 196 + shelf * 62, 137, 4);
    for (let item = 0; item < 17; item++) { c.fillStyle = ['#c8b477', '#afa493', '#8e624e', '#9f9f79'][item % 4]; c.fillRect(x + 27 + item % 8 * 16, 159 + Math.floor(item / 8) * 65, 10, 35 + item % 4 * 4); }
    c.fillStyle = color; for (const bar of [13, 88, 167, 188, 240]) c.fillRect(x + bar, 33, 5, 377);
    c.fillRect(x + 10, 116, 235, 5); c.fillRect(x + 10, 397, 169, 12);
    c.fillStyle = '#e5dcc1'; c.fillRect(x + 235, 227, 3, 37); c.fillRect(x + 9, 22, 237, 6);
    if (shop === 0) { c.strokeStyle = 'rgba(220,222,191,.35)'; c.lineWidth = 2; for (let lead = 0; lead < 7; lead++) { c.beginPath(); c.moveTo(x + 18 + lead * 23, 48); c.lineTo(x + 70 + lead * 15, 113); c.stroke(); } }
    c.fillStyle = 'rgba(24,35,30,.24)'; c.fillRect(x + 3, 462, 250, 28);
  }
}
export const HERITAGE_SHOP_CITIES = Object.freeze(['london', 'newcastle', 'warwick', 'melbourne', 'paris', 'prague', 'lisbon', 'marseille', 'nice']);
export function paintHeritageShopfront(c, width, height, city) {
  if (city === 'london') { paintLondonShopfront(c, width, height); return; }
  c.scale(width / 1024, height / 512);
  const palette = { newcastle: ['#386052', '#614b3b', '#717477', '#675d4b'], warwick: ['#514837', '#e1d2b0', '#577164', '#71634d'], melbourne: ['#305448', '#624c40', '#cbc0a3', '#435e67'], paris: ['#354c43', '#796448', '#344853', '#78614b'], prague: ['#6b6552', '#a09170', '#7e5749', '#586a5c'], lisbon: ['#456c61', '#8b684e', '#527384', '#a69a79'], marseille: ['#628373', '#a0a58a', '#6c8175', '#506b70'], nice: ['#a89b81', '#718675', '#b7957e', '#58766c'] }[city];
  for (let shop = 0; shop < 4; shop++) {
    const x = shop * 256, wood = palette[shop], arched = ['prague', 'nice'].includes(city) || city === 'paris' && shop % 2 === 0;
    c.fillStyle = ['nice', 'paris', 'prague'].includes(city) ? '#dcd0b3' : '#c4b79a'; c.fillRect(x, 0, 256, 512);
    if (city === 'lisbon') {
      c.fillStyle = '#e0e3d4'; c.fillRect(x, 392, 256, 120); c.strokeStyle = '#688b9b'; c.lineWidth = 1.2;
      for (let y = 398; y < 510; y += 20) for (let tile = 0; tile < 13; tile++) { c.strokeRect(x + tile * 20, y, 19, 19); c.fillStyle = '#7397a4'; c.fillRect(x + tile * 20 + 7, y + 7, 5, 5); }
    } else if (['newcastle', 'melbourne'].includes(city)) {
      c.strokeStyle = city === 'melbourne' ? '#9c8266' : '#a99f87'; c.lineWidth = 1.7;
      for (let row = 0; row < 24; row++) { c.beginPath(); c.moveTo(x, row * 22); c.lineTo(x + 256, row * 22); c.stroke(); for (let joint = 0; joint < 7; joint++) { c.beginPath(); c.moveTo(x + joint * 42 + row % 2 * 21, row * 22); c.lineTo(x + joint * 42 + row % 2 * 21, row * 22 + 22); c.stroke(); } }
    }
    c.fillStyle = wood; c.fillRect(x + 15, 39, 226, 409);
    c.fillStyle = '#293a35'; c.fillRect(x + 23, 62, 145, 314); c.fillRect(x + 182, 62, 50, 367);
    const glow = c.createLinearGradient(x, 35, x, 395); glow.addColorStop(0, '#718580'); glow.addColorStop(.36, '#849182'); glow.addColorStop(.4, '#6d674c'); glow.addColorStop(1, '#3a4031');
    c.fillStyle = glow; c.fillRect(x + 29, 68, 133, 302); c.fillRect(x + 188, 68, 38, 292);
    c.fillStyle = '#b7a17b'; c.fillRect(x + 33, 251, 123, 5); c.fillRect(x + 33, 313, 123, 5);
    for (let item = 0; item < 14; item++) { c.fillStyle = ['#c6b588', '#a69264', '#9a7958', '#829180'][item % 4]; c.fillRect(x + 38 + item % 7 * 16, 220 + Math.floor(item / 7) * 64, shop % 2 ? 11 : 13, 25 + item % 3 * 4); }
    c.fillStyle = wood; for (const bar of [19, 89, 166, 179, 229]) c.fillRect(x + bar, 59, 5, 350);
    c.fillRect(x + 18, 146, 220, 6); c.fillRect(x + 18, 371, 158, 8);
    if (arched) { c.strokeStyle = '#e7dbc0'; c.lineWidth = 10; c.beginPath(); c.arc(x + 128, 120, 108, Math.PI, 0); c.stroke(); c.fillStyle = '#e7dbc0'; c.fillRect(x + 120, 11, 16, 19); }
    if (city === 'warwick') { c.fillStyle = '#4c4436'; c.fillRect(x + 5, 0, 9, 512); c.fillRect(x + 243, 0, 9, 512); c.fillRect(x, 20, 256, 10); }
    if (['marseille', 'nice'].includes(city) && shop % 2) { c.fillStyle = '#81917c'; c.fillRect(x + 2, 85, 14, 284); c.fillStyle = '#5c7160'; for (let slat = 90; slat < 366; slat += 12) c.fillRect(x + 2, slat, 14, 3); }
    c.fillStyle = '#d3b77b'; c.fillRect(x + 222, 244, 3, 29); c.fillStyle = 'rgba(33,38,30,.20)'; c.fillRect(x + 15, 449, 226, 18);
  }
}
export function paintCityPaving(c, width, height, city) {
  const rand = seeded(91267 + CITY_STREETFRONT_CITIES.indexOf(city) * 721);
  c.scale(width / 256, height / 256);
  const sett = ['prague', 'warwick'].includes(city), mosaic = city === 'lisbon', brick = city === 'melbourne';
  const colors = mosaic ? ['#e0dfcf', '#e4e3d5', '#d7d6c5'] : brick ? ['#a18d7d', '#ae9582', '#ad9a89'] : sett ? ['#a4a298', '#aca99a', '#bab5a3', '#a5a596'] : ['#babdb3', '#c5c5b9', '#c0c2b8', '#b2b7af'];
  const cw = mosaic ? 8 : sett ? 16 : brick ? 32 : 64, ch = mosaic ? 8 : sett ? 23 : brick ? 15 : 48;
  c.fillStyle = '#999d93'; c.fillRect(0, 0, 256, 256);
  for (let row = -1; row <= Math.ceil(256 / ch); row++) for (let col = -1; col <= Math.ceil(256 / cw); col++) {
    const x = col * cw + (sett || brick ? row % 2 * cw / 2 : 0), y = row * ch;
    const darkWave = mosaic && Math.sin(x / 256 * Math.PI * 2) * 35 + 128 > y && Math.sin(x / 256 * Math.PI * 2) * 35 + 95 < y;
    c.fillStyle = darkWave ? ['#4e5751', '#58605b', '#50584f'][Math.floor(rand() * 3)] : colors[Math.floor(rand() * colors.length)]; c.fillRect(x + .7, y + .7, cw - 1.5, ch - 1.5);
    c.fillStyle = 'rgba(247,246,220,.15)'; c.fillRect(x + 1, y + 1, cw - 2, .7);
  }
  c.strokeStyle = 'rgba(61,68,61,.18)'; c.lineWidth = .6;
  for (let crack = 0; crack < 7; crack++) { const x = rand() * 256, y = rand() * 256; c.beginPath(); c.moveTo(x, y); c.lineTo(x + 2 + rand() * 7, y + 5); c.lineTo(x + 4, y + 12); c.stroke(); }
}
